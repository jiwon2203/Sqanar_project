# routes/auth.py
from flask import Blueprint, render_template, request, redirect, url_for, jsonify
from Server.models.user_dao import UserDAO
from Server.models.history_dao import HistoryDAO
from werkzeug.security import generate_password_hash, check_password_hash
from urllib.parse import urlparse, urljoin
from datetime import datetime, date
import re
from uuid import uuid4

# flask_jwt_extended 를 사용한 JWT 헤더 방식 구현
from flask_jwt_extended import (
    create_access_token, create_refresh_token,
    jwt_required, get_jwt_identity, get_jwt,
    JWTManager, unset_jwt_cookies, set_access_cookies
)

try:
    from pymysql.err import IntegrityError
except ImportError:
    # 사용하는 DB 라이브러리가 다를 경우를 대비한 안전 장치입니다.
    class IntegrityError(Exception):
        pass

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")

# 간단한 토큰 폐기(blacklist) 저장소: 애플리케이션 재시작 시 초기화되는 in-memory 방식입니다.
# 프로덕션에서는 Redis나 DB로 대체하세요.
revoked_jti_set = set()

def _is_safe_url(target: str) -> bool:
    if not target:
        return False
    base = urlparse(request.host_url)
    test = urlparse(urljoin(request.host_url, target))
    return test.scheme in ("http", "https") and base.netloc == test.netloc

# --- 페이지 라우트 (웹 템플릿 유지) ---
@auth_bp.route("/login", methods=["GET"])
def login_page():
    return render_template("auth/login.html")

@auth_bp.route("/register", methods=["GET"])
def register_page():
    return render_template("auth/register.html")

# --- 로그인 처리 (폼 전송 유지) ---
@auth_bp.route("/loginProc", methods=["POST"])
def login_proc():
    """
    클라이언트는 로그인 시 이메일/비밀번호와 (선택적으로) guest_id를 전송할 수 있습니다.
    성공 시 JSON으로 access_token(헤더에 넣을 토큰)과 사용자 정보 반환.
    """
    # 1️⃣ 클라이언트가 JSON으로 보냈는지 확인
    if request.is_json:
        data = request.get_json()
    else:
        data = request.form
    email = data.get("email", "")
    password = data.get("password", "")
    redirect_to = data.get("redirectTo", "")
    # 클라이언트가 게스트 식별자를 전달하면 게스트->회원 이관에 사용
    # (기존 세션 기반 동작을 유지하기 위한 처리)
    guest_id = request.form.get("guest_id", None)

    user = UserDAO.find_by_email(email)
    if user and check_password_hash(user["password"], password):
        # JWT 생성: identity로 user id 사용
        access_token = create_access_token(identity=user["id"])
        refresh_token = create_refresh_token(identity=user["id"])

        # 게스트 히스토리 → 회원 이관 (guest_id가 전달된 경우에만 수행)
        if guest_id:
            try:
                HistoryDAO.migrate_guest_to_user(guest_id, user["id"])
            except Exception as e:
                # 이관 실패는 로그만 남기고 오류로 응답하지 않음 (기존 코드와 유사한 태도)
                print(f"[WARN] migrate guest->user fail: guest={guest_id}, user={user['id']}, err={e}")

        # 로그인 성공 응답 (프론트 엔드가 Authorization: Bearer <access_token> 형태로 저장/전달해야 함)
        return jsonify({
            "success": True,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "user_id": user["id"],
            "nickname": user.get("nickname")
        }), 200

    return jsonify({"success": False, "error": "로그인 정보가 일치하지 않습니다."}), 401

# --- 로그아웃 처리 ---
@auth_bp.route("/logout", methods=["POST", "GET"])
@jwt_required(optional=True)
def logout():
    """
    클라이언트는 Authorization: Bearer <token> 헤더를 전달해서 로그아웃 요청 가능.
    토큰이 있으면 해당 토큰의 jti를 blacklist 에 추가해 폐기 처리합니다.
    (클라이언트는 또한 로컬/저장된 토큰을 반드시 삭제해야 합니다.)
    """
    jwt_data = get_jwt()
    if jwt_data:
        jti = jwt_data.get("jti")
        if jti:
            revoked_jti_set.add(jti)

    # 웹 템플릿 사용 시 리다이렉트 -> react native 앱은 JSON 응답 확인 후 토큰 삭제
    # 기존 동작(redirect)과 앱 API 사용 목적을 모두 고려하여 JSON 반환
    return jsonify({"success": True}), 200

# --- 회원가입 처리 (기존 로직 유지) ---
@auth_bp.route("/registerProc", methods=["POST"])
def register_proc():
    data = request.form
    password = data.get("password")

    pw_pattern = r"^(?=.*[A-Z])(?=.*\d)(?=.*[!#%\^*])[A-Za-z\d!#%\^*]{8,}$"
    if not re.match(pw_pattern, password):
        return redirect(url_for("auth.register_page") + "?error=weak_password")

    required_fields = ["email", "password", "nickname", "birthDate", "gender"]
    for field in required_fields:
        if not data.get(field):
            return redirect(url_for("auth.register_page") + "?error=missing")

    hashed_pw = generate_password_hash(password)
    birth_date = datetime.strptime(data["birthDate"], "%Y-%m-%d")

    try:
        UserDAO.create_user(
            email=data["email"],
            password=hashed_pw,
            nickname=data["nickname"],
            birth_date=birth_date,
            gender=data["gender"]
        )
        return redirect("/auth/login")
    except IntegrityError as e:
        if "Duplicate entry" in str(e) and "email" in str(e):
            return jsonify({
                "success": False,
                "error": "이미 사용 중인 이메일입니다."
            }), 409
        return jsonify({
            "success": False,
            "error": "데이터베이스 오류가 발생했습니다."
        }), 500
    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"서버 오류가 발생했습니다: {e}"
        }), 500

@auth_bp.route("/check-email")
def check_email():
    email = request.args.get("email")
    user = UserDAO.find_by_email(email)
    return jsonify({"exists": user is not None})

@auth_bp.route("/guest-login")
def guest_login():
    """
    기존 방식에서 '비회원으로 로그인' 엔드포인트는 더이상 필요하지 않음.
    클라이언트는 자체적으로 guest_id를 생성/저장하고 필요 시 서버로 전달하세요.
    (편의상, guest_id를 요청하면 서버에서 새 guest_id를 발급해줄 수 있습니다.)
    """
    # 새 게스트 ID 요청 시 query param ?new=true 로 호출하면 새 guest_id 반환
    if request.args.get("new") == "true":
        new_guest_id = str(uuid4())
        return jsonify({"guest_id": new_guest_id}), 200
    return redirect("/home")

@auth_bp.route("/reset-password", methods=["POST"])
def reset_password():
    data = request.json
    email = data.get("email")
    nickname = data.get("nickname")
    new_password = data.get("password")

    if not all([email, nickname, new_password]):
        return jsonify({"success": False, "error": "이메일, 닉네임, 새 비밀번호를 모두 입력해주세요."}), 400

    user = UserDAO.find_by_email_and_nickname(email.strip(), nickname.strip())

    if not user:
        return jsonify({"success": False, "error": "사용자 정보가 일치하지 않습니다. 이메일과 닉네임을 확인해주세요."}), 404

    hashed_pw_record = UserDAO.find_hashed_password_by_id(user["id"])
    current_hashed_pw = hashed_pw_record.get("password")
    if current_hashed_pw and check_password_hash(current_hashed_pw, new_password):
        return jsonify({"success": False, "error": "기존 비밀번호와 동일합니다. 다른 비밀번호를 사용해주세요."}), 400

    pw_pattern = r"^(?=.*[A-Z])(?=.*\d)(?=.*[!#%\^*])[A-Za-z\d!#%\^*]{8,}$"
    if not re.match(pw_pattern, new_password):
        return jsonify({
            "success": False,
            "error": "새 비밀번호는 8자 이상이며, 대문자, 숫자, 특수문자(!#%^*)를 포함해야 합니다."
        }), 400

    try:
        hashed_pw = generate_password_hash(new_password)
        UserDAO.update_password(user["id"], hashed_pw)
        print(f"[SUCCESS] Password reset for user: {email} (ID: {user['id']})")
        return jsonify({"success": True}), 200
    except Exception as e:
        print(f"[ERROR] Password reset failed for user_id={user['id']}: {e}")
        return jsonify({"success": False, "error": "서버 오류로 인해 비밀번호 재설정에 실패했습니다."}), 500

# --- 프로필 상세 조회: 로그인(토큰)이 필요합니다. (이전과 동일한 권한 요구) ---
@auth_bp.route("/profile-details", methods=["GET"])
@jwt_required()
def profile_details():
    """
    JWT로 인증된 사용자만 접근 가능. (기존 session 기반의 접근과 동일하게 동장)
    """
    user_id = get_jwt_identity()
    if not user_id:
        return jsonify({"success": False, "error": "로그인이 필요합니다."}), 401

    try:
        user_info = UserDAO.find_user_profile_data(user_id)
        if not user_info:
            return jsonify({"success": False, "error": "사용자 정보를 찾을 수 없습니다."}), 404

        birth_date_str = None
        birth_date_obj = user_info.get("birth_date")
        if isinstance(birth_date_obj, (datetime, date)):
            birth_date_str = birth_date_obj.strftime("%Y-%m-%d")

        return jsonify({
            "success": True,
            "email": user_info.get("email"),
            "nickname": user_info.get("nickname"),
            "role": user_info.get("role", "USER"),
            "birth_date": birth_date_str,
            "gender": user_info.get("gender"),
        }), 200
    except Exception as e:
        print(f"[ERROR] Failed to fetch profile details for user {user_id}: {e}")
        return jsonify({"success": False, "error": "서버 오류로 인해 프로필 정보를 불러오지 못했습니다."}), 500

# --- /me 엔드포인트: 로그인 여부 + 게스트 정보 반환 (프론트에서 guest_id 헤더를 전달하면 동일 동작) ---
@auth_bp.route("/me")
@jwt_required(optional=True)
def me():
    """
    - Authorization 헤더에 토큰이 있으면 토큰 기반 사용자 정보 반환
    - 없으면 클라이언트가 보낸 X-Guest-Id 헤더를 확인하여 게스트로 응답
    - 클라이언트가 guest_id를 보내지 않으면 서버가 새 guest_id를 발급하여 반환함
    """
    identity = get_jwt_identity()
    if identity:
        # 로그인된 회원
        user_id = identity
        nickname = None
        role = None
        try:
            # DB에서 닉네임 및 role 조회
            user_info = UserDAO.find_user_profile_data(user_id)
            if user_info:
                nickname = user_info.get("nickname")
                role = user_info.get("role", "USER")
            else:
                nickname = None
                role = "USER"
        except Exception as e:
            print(f"[WARN] /me: failed to fetch user info for {user_id}: {e}")
            nickname = None
            role = "USER"

        return jsonify({
            "is_logged_in": True,
            "is_guest": False,
            "user_id": user_id,
            "nickname": nickname,
            "role": role
        })

    # 비로그인(게스트) 처리: 클라이언트가 X-Guest-Id 헤더로 보내는 걸 우선 사용
    guest_id = request.headers.get("X-Guest-Id", None)
    if not guest_id:
        # 없는 경우 서버에서 새 guest_id 발급 (클라이언트는 이후 이 ID를 저장해서 모든 요청에 X-Guest-Id로 보낼 것)
        guest_id = str(uuid4())

    return jsonify({
        "is_logged_in": False,
        "is_guest": True,
        "user_id": guest_id,
        "nickname": "게스트",
        "role": None
    })

# --- 닉네임 업데이트: JWT 필요 ---
@auth_bp.route("/update-nickname", methods=["POST"])
@jwt_required()
def update_nickname():
    user_id = get_jwt_identity()
    if not user_id:
        return jsonify({"success": False, "error": "로그인이 필요합니다."}), 401

    data = request.get_json(silent=True)
    new_nickname = data.get("nickname")

    if not new_nickname or not new_nickname.strip():
        return jsonify({"success": False, "error": "닉네임을 입력해주세요."}), 400

    try:
        is_updated = UserDAO.update_nickname(user_id, new_nickname.strip())
        if is_updated:
            # DB 업데이트 성공 응답 (클라이언트는 필요 시 로컬에서 닉네임 갱신)
            print(f"[SUCCESS] Nickname updated for user {user_id} to: {new_nickname.strip()}")
            return jsonify({"success": True}), 200
        else:
            return jsonify({"success": False, "error": "닉네임 업데이트에 실패했거나 변경 사항이 없습니다."}), 400
    except Exception as e:
        print(f"[ERROR] Failed to update nickname for user {user_id}: {e}")
        return jsonify({"success": False, "error": "닉네임 업데이트 중 서버 오류 발생"}), 500

# --- 비밀번호 동일성 검사 (회원 확인 후 검사) ---
@auth_bp.route("/check-password-same", methods=["POST"])
def check_password_same():
    data = request.get_json(silent=True)
    email = data.get("email")
    nickname = data.get("nickname")
    new_password = data.get("password")

    user = UserDAO.find_by_email_and_nickname(email.strip(), nickname.strip())
    if not user:
        return jsonify({"success": False, "is_same": False}), 200

    hashed_pw_record = UserDAO.find_hashed_password_by_id(user["id"])
    current_hashed_pw = hashed_pw_record.get("password")

    is_same = False
    if current_hashed_pw:
        is_same = check_password_hash(current_hashed_pw, new_password)

    return jsonify({"success": True, "is_same": is_same}), 200

# --- JWT 토큰 유효성(blacklist) 확인 헬퍼: 앱 초기화 시 JWTManager에 등록 필요 ---
def check_if_token_revoked(jwt_header, jwt_payload):
    """
    flask_jwt_extended 의 token_in_blocklist_loader 로 등록하세요.
    예:
        jwt = JWTManager(app)
        jwt.token_in_blocklist_loader(check_if_token_revoked)
    """
    jti = jwt_payload.get("jti")
    return jti in revoked_jti_set
