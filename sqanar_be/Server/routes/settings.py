# routes/settings.py
from flask import Blueprint, render_template, request, jsonify, current_app
from Server.models.history_dao import HistoryDAO
import jwt

settings_bp = Blueprint("settings", __name__, url_prefix="/settings")

DEFAULT_SETTINGS = {
    "privacy": {"camera": True, "storage": True, "data_consent": True},
    "display": {"theme": "light", "font_scale": 100},
    "language": "ko",
    "history": {"default_filter": "all"},
    "chatbot": {"mode": "normal"}
}

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
        return None, None
    user_id = payload.get("user_id")
    nickname = payload.get("nickname")
    return user_id, nickname

def get_settings(user_settings=None):
    s = user_settings or {}
    merged = {**DEFAULT_SETTINGS, **s}
    merged["privacy"] = {**DEFAULT_SETTINGS["privacy"], **merged.get("privacy", {})}
    merged["display"] = {**DEFAULT_SETTINGS["display"], **merged.get("display", {})}
    merged["history"] = {**DEFAULT_SETTINGS["history"], **merged.get("history", {})}
    merged["chatbot"] = {**DEFAULT_SETTINGS["chatbot"], **merged.get("chatbot", {})}
    return merged

@settings_bp.route("/", methods=["GET"])
def settings_page():
    # JWT 기반으로 사용자별 설정 조회 (세션 대신)
    user_id, _ = _get_user_from_jwt()
    user_settings = {}  # 실제 DB 연동하면 user_id 기반 조회 가능
    settings = get_settings(user_settings)
    return render_template("settings.html", settings=settings)

@settings_bp.route("/", methods=["POST"])
def update_settings():
    data = request.get_json(silent=True) or {}
    # JWT 기반 사용자 ID 확인
    user_id, _ = _get_user_from_jwt()
    # guest 처리
    user_id = user_id or request.headers.get("Guest-ID")
    if not user_id:
        return jsonify({"ok": False, "message": "로그인 또는 게스트 토큰 필요"}), 401

    cur = get_settings()  # 기존 기본값 기반

    # 값 병합 + 최소 검증
    if "privacy" in data:
        for k in ["camera", "storage", "data_consent"]:
            if k in data["privacy"]:
                cur["privacy"][k] = bool(data["privacy"][k])

    if "display" in data:
        theme = data["display"].get("theme")
        if theme in ["light", "dark"]:
            cur["display"]["theme"] = theme
        try:
            fs = int(data["display"].get("font_scale", cur["display"]["font_scale"]))
            cur["display"]["font_scale"] = min(140, max(80, fs))
        except (TypeError, ValueError):
            pass

    if "language" in data and data["language"] in ["ko", "en"]:
        cur["language"] = data["language"]

    if "history" in data:
        df = data["history"].get("default_filter")
        if df in ["all", "legit", "malicious"]:
            cur["history"]["default_filter"] = df

    if "chatbot" in data:
        mode = data["chatbot"].get("mode")
        if mode in ["normal", "pro"]:
            cur["chatbot"]["mode"] = mode

    # ✅ (선택) 챗봇 모드를 전역에서 쉽게 쓰고 싶다면 별도 키로도 저장
    cur["user_id"] = user_id  # JWT 기반 ID
    cur["chatbot_mode"] = cur["chatbot"]["mode"]

    return jsonify({"ok": True, "settings": cur}), 200

@settings_bp.route("/json", methods=["GET"])
def settings_json():
    user_id, _ = _get_user_from_jwt()
    user_id = user_id or request.headers.get("Guest-ID")
    if not user_id:
        return jsonify({"ok": False, "message": "로그인 또는 게스트 토큰 필요"}), 401

    user_settings = {}  # 실제 DB 연동 시 user_id 기반 조회 가능
    settings = get_settings(user_settings)
    settings["user_id"] = user_id
    return jsonify({"ok": True, "settings": settings}), 200

@settings_bp.route("/history/summary", methods=["GET"])
def get_history_summary_api():
    user_id, _ = _get_user_from_jwt()
    user_id = user_id or request.headers.get("Guest-ID")
    if not user_id:
        return jsonify({"total": 0, "legit": 0, "malicious": 0}), 200

    summary = HistoryDAO.get_history_summary(user_id)
    return jsonify(summary), 200
