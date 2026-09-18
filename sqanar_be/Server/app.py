from flask import Flask, request, jsonify, current_app
from flask_cors import CORS
from flask_jwt_extended import (
    JWTManager, create_access_token, create_refresh_token,
    jwt_required, get_jwt_identity, set_access_cookies, set_refresh_cookies
)
import uuid
from datetime import timedelta

from Server.routes.home import home_bp
from Server.routes.scan import scan_bp
from Server.routes.analyze import analyze_bp
from Server.routes.history import history_bp
from Server.routes.chatbot import chatbot_bp
from Server.routes.board import board_bp
from Server.routes.settings import settings_bp
from Server.routes.auth import auth_bp  # 여기서 로그인/로그아웃 JWT 발급 처리

app = Flask(__name__)
app.config["JWT_SECRET_KEY"] = "your-very-secret-key"
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(days=1)
app.config["JWT_REFRESH_TOKEN_EXPIRES"] = timedelta(days=30)
app.config["JWT_TOKEN_LOCATION"] = ["headers"]  # 헤더에서만 토큰 확인
app.config["JWT_COOKIE_CSRF_PROTECT"] = False   # RN에서는 쿠키 사용 안 함
jwt = JWTManager(app)

# CORS 설정: React Native 앱에서 동작
CORS(app, origins="*", supports_credentials=True)

# 모든 요청 로깅
@app.before_request
def log_request():
    try:
        token_identity = None
        auth_header = request.headers.get("Authorization", None)
        if auth_header and auth_header.startswith("Bearer "):
            token_identity = auth_header.split(" ")[1]
        print(f"[REQ] {request.method} {request.path} json={request.get_json(silent=True)} identity={token_identity}")
    except Exception:
        print(f"[REQ] {request.method} {request.path} (no json)")

# 블루프린트 등록
app.register_blueprint(home_bp)
app.register_blueprint(scan_bp, url_prefix="/scan")
app.register_blueprint(analyze_bp)
app.register_blueprint(history_bp)
app.register_blueprint(chatbot_bp)
app.register_blueprint(settings_bp)
app.register_blueprint(board_bp)
app.register_blueprint(auth_bp)

# JWT 사용 예시: 보호된 라우트
@app.route("/protected", methods=["GET"])
@jwt_required()
def protected():
    current_user = get_jwt_identity()
    return jsonify({"msg": f"Hello {current_user}!"})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True, use_reloader=False, threaded=True)
