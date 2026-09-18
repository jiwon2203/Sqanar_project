# routes/home.py
from flask import Blueprint, render_template, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from Server.models.history_dao import HistoryDAO
from Server.models.user_dao import UserDAO
import uuid

home_bp = Blueprint("home", __name__)

@home_bp.route("/")
@home_bp.route("/home")
@jwt_required(optional=True)
def home():
    if request.args.get("format") == "json":
        user_id = get_jwt_identity()
        is_logged_in = bool(user_id)

        # 로그인 안 한 경우 게스트 처리
        if not is_logged_in:
            effective_user_id = str(uuid.uuid4())
            nickname = "게스트"
            today_cnt, yday_cnt = 0, 0
        else:
            effective_user_id = user_id
            user_info = UserDAO.find_user_profile_data(user_id)
            nickname = user_info.get("nickname") if user_info else "사용자"
            today_cnt, yday_cnt = HistoryDAO.get_today_yesterday_counts(user_id)

        return jsonify({
            "is_logged_in": is_logged_in,
            "is_guest": not is_logged_in,
            "nickname": nickname,
            "today_count": today_cnt,
            "yesterday_count": yday_cnt,
            "user_id": effective_user_id
        })

    # HTML 요청 처리
    return render_template("home.html")
