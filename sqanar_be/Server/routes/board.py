# routes/board.py
from flask import Blueprint, request, jsonify, current_app
from Server.models.board_dao import BoardDAO
from Server.models.user_dao import UserDAO
from Server.models.urlbert_dao import UrlBertDAO
from bot.qr_analysis import get_analysis_for_qr_scan
from datetime import datetime
import jwt

board_bp = Blueprint("board", __name__, url_prefix="/board")

# JWT 검증 헬퍼
def get_jwt_payload():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ")[1]
    try:
        payload = jwt.decode(token, current_app.config["JWT_SECRET_KEY"], algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

def _get_user_from_jwt():
    payload = get_jwt_payload()
    if not payload:
        return None, None, None
    # user_id = payload.get("user_id")
    # nickname = payload.get("nickname")
    # role = payload.get("role")
    # return user_id, nickname, role
    user_id = payload.get("sub") 
    if not user_id:
        return None, None, None
        
    # DB에서 닉네임과 역할을 조회 (토큰에 모든 정보가 담겨있지 않다고 가정)
    user_info = UserDAO.find_user_profile_data(user_id) 
    if user_info:
        nickname = user_info.get("nickname")
        role = user_info.get("role")
    else:
        # DB에서 사용자를 찾을 수 없는 경우
        return None, None, None

    return user_id, nickname, role

def _get_analysis_for_report(url: str) -> dict:
    # 1. DB HIT (캐시 조회)
    if UrlBertDAO.exists(url):
        result = UrlBertDAO.find_by_url(url)
        if result and (result.get("label") in ("MALICIOUS", "LEGITIMATE")):
            label = (result.get("label") or "FAILED").upper()
            confidence = result.get("confidence")
            text_result = f"DB 캐시: **{label}**로 판별됨 (신뢰도: {confidence*100:.1f}%)" if confidence else f"DB 캐시: **{label}**로 판별됨"
            return {
                "is_malicious": 1 if label == "MALICIOUS" else 0,
                "confidence": confidence,
                "text_result": text_result,
                "source": "db"
            }

    # 2. DB MISS → 모델 실행
    try:
        model_out = get_analysis_for_qr_scan(url)
        label = (model_out.get("label") or "FAILED").upper()
        confidence = model_out.get("confidence")
    except Exception as e:
        current_app.logger.exception(f"모델 호출 실패: {e}")
        label = "FAILED"
        confidence = None

    if label not in ("MALICIOUS", "LEGITIMATE"):
        return {
            "is_malicious": -1,
            "confidence": None,
            "text_result": "모델 분석 결과: **확인불가** 또는 실패",
            "source": "model"
        }
    
    text_result = f"URLBERT 모델: **{label}**로 판별됨 (신뢰도: {confidence*100:.1f}%)"
    return {
        "is_malicious": 1 if label == "MALICIOUS" else 0,
        "confidence": confidence,
        "text_result": text_result,
        "source": "model"
    }

@board_bp.route("/reports", methods=["GET"])
def get_reports():
    page = request.args.get("page", 1, type=int)
    size = request.args.get("size", 20, type=int)
    query = request.args.get("q", "")

    user_id, nickname, role = _get_user_from_jwt()
    # reporter_id = user_id or request.headers.get("Guest-ID")
    reporter_id = user_id or request.headers.get("X-Guest-Id")
    if not reporter_id:
        return jsonify({"items": [], "message": "로그인 또는 게스트 토큰이 필요합니다."}), 401

    is_admin = role == 'ADMIN' if role else False

    try:
        items = BoardDAO.list_reports(
            page=page,
            size=size,
            q=query,
            reporter_id=reporter_id,
            is_admin=is_admin
        )
        return jsonify({"items": items})
    except Exception as e:
        current_app.logger.error(f"get_reports fail: {e}")
        return jsonify({"items": [], "message": "목록 조회 실패"}), 500

@board_bp.route("/malicious", methods=["GET"])
def get_malicious():
    page  = request.args.get("page", 1, type=int)
    size  = request.args.get("size", 20, type=int)
    query = request.args.get("q", "")
    items = BoardDAO.list_malicious(page=page, size=size, q=query)
    return jsonify({"items": items})

@board_bp.route("/report", methods=["POST"])
def submit_report():
    data = request.get_json(silent=True) or {}
    url = (data.get("url") or "").strip()
    reason = (data.get("reason") or "").strip()

    if not url:
        return jsonify({"ok": False, "message": "URL은 필수입니다."}), 400

    user_id, nickname, _ = _get_user_from_jwt()
    # reporter_id = user_id or request.headers.get("Guest-ID")
    reporter_id = user_id or request.headers.get("X-Guest-Id")
    reporter_nick = nickname or request.headers.get("Guest-Nick") or "익명"

    if not reporter_id:
        return jsonify({"ok": False, "message": "세션 ID를 확인할 수 없습니다."}), 401

    try:
        rid = BoardDAO.create_report(url=url, reason=reason, reporter_id=reporter_id, reporter_nick=reporter_nick)
        return jsonify({"ok": True, "message": "신고가 접수되었습니다. 감사합니다.", "report_id": rid}), 201
    except Exception as e:
        current_app.logger.error(f"submit_report DB fail: {e}")
        return jsonify({"ok": False, "message": "저장 실패: 서버 오류가 발생했습니다."}), 500

@board_bp.route("/report/<int:report_id>/judgment", methods=["POST"])
def set_judgment(report_id: int):
    user_id, _, role = _get_user_from_jwt()
    if not user_id or role != 'ADMIN':
        return jsonify({"ok": False, "message": "관리자 권한이 없습니다."}), 403

    data = request.get_json(silent=True) or {}
    judgment = data.get("judgment")
    confidence = data.get("confidence", None)
    updater_id = user_id

    try:
        BoardDAO.update_judgment(report_id, judgment, confidence, updater_id)
        return jsonify({"ok": True})
    except ValueError as ve:
        return jsonify({"ok": False, "message": str(ve)}), 400
    except Exception as e:
        current_app.logger.error(f"set_judgment fail: {e}")
        return jsonify({"ok": False, "message": f"갱신 실패: {e}"}), 500

@board_bp.route("/report/<int:report_id>/analyze", methods=["GET"])
def get_analysis_for_admin(report_id: int):
    user_id, _, role = _get_user_from_jwt()
    if not user_id or role != 'ADMIN':
        return jsonify({"ok": False, "message": "관리자 권한이 없습니다."}), 403

    report = BoardDAO.find_report_by_id(report_id)
    if not report:
        return jsonify({"ok": False, "message": "신고를 찾을 수 없습니다."}), 404

    url = report["url"]
    analysis_result = _get_analysis_for_report(url)

    def date_to_iso(dt):
        return dt.isoformat() if hasattr(dt, 'isoformat') else str(dt)

    return jsonify({
        "ok": True,
        "id": report["id"],
        "url": report["url"],
        "domain": report.get("domain") or "도메인 정보 없음",
        "reason": report.get("reason") or "사유 없음",
        "status": report["status"],
        "reporter_nick": report.get("reporter_nick") or "익명",
        "created_at": date_to_iso(report.get("created_at")),
        "status_updated_at": date_to_iso(report.get("status_updated_at")),
        "analysis": analysis_result
    })

@board_bp.route("/recent-reports", methods=["GET"])
def get_recent_reports():
    try:
        items = BoardDAO.list_recent_reports(size=3)
        recent_reports = []
        for item in items:
            recent_reports.append({
                "id": item["id"],
                "url_preview": item["url"][:30] + "...",
                "status": item["status"],
                "created_at": item["created_at"].isoformat() if hasattr(item.get("created_at"), 'isoformat') else str(item["created_at"])
            })
        return jsonify({"ok": True, "items": recent_reports}), 200
    except Exception as e:
        current_app.logger.error(f"get_recent_reports fail: {e}")
        return jsonify({"ok": False, "message": "최신 신고 내역 조회 실패"}), 500
