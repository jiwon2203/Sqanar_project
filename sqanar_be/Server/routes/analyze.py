from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from Server.models.history_dao import HistoryDAO
from Server.models.urlbert_dao import UrlBertDAO
from Server.models.user_dao import UserDAO
from urllib.parse import urlparse
from datetime import datetime
import uuid
import traceback

from bot.qr_analysis import get_analysis_for_qr_scan

analyze_bp = Blueprint("analyze", __name__, url_prefix="/analyze")

@analyze_bp.route("", methods=["POST"])
@analyze_bp.route("/", methods=["POST"])
@jwt_required(optional=True)
def analyze():
    try:
        data = request.get_json(silent=True) or {}
        if not data:  # form/query fallback
            if request.form.get("url"):
                data = {"url": request.form.get("url")}
            elif request.args.get("url"):
                data = {"url": request.args.get("url")}

        current_app.logger.info(f"/analyze payload={data}")

        raw_url = (data.get("url") or "").strip()
        if not raw_url:
            return jsonify({"error": "URL 데이터가 없습니다"}), 400

        # URL 정규화
        url = raw_url
        parsed = urlparse(url)
        if not parsed.scheme:
            url = "http://" + url
            parsed = urlparse(url)

        # 로그인 여부 및 사용자 ID
        user_id = get_jwt_identity()
        is_logged_in = bool(user_id)
        if is_logged_in:
            effective_id = user_id
            user_info = UserDAO.find_user_profile_data(user_id)
            nickname = user_info.get("nickname") if user_info else "사용자"
        else:
            # 게스트 UUID
            effective_id = str(uuid.uuid4())
            nickname = "게스트"

        is_non_member_mode = not is_logged_in

        # 1) DB HIT
        if UrlBertDAO.exists(url):
            result = UrlBertDAO.find_by_url(url)

            if not result:
                return jsonify({
                    "message": "DB 조회 실패",
                    "url": url,
                    "result": "FAILED",
                    "confidence": None,
                    "domain": parsed.hostname or "-",
                    "created": "-",
                    "expiry": "-",
                    "date": datetime.now().strftime("%Y-%m-%d %H:%M"),
                    "source": "db"
                }), 200

            label = (result.get("label") or "").upper()
            if label not in ("MALICIOUS", "LEGITIMATE"):
                return jsonify({
                    "message": "DB 라벨 비정상",
                    "url": url,
                    "result": "FAILED",
                    "confidence": None,
                    "domain": (result.get("domain") or parsed.hostname or "-"),
                    "created": str(result.get("created_date") or "-"),
                    "expiry": str(result.get("expiry_date") or "-"),
                    "date": datetime.now().strftime("%Y-%m-%d %H:%M"),
                    "source": "db"
                }), 200

            # 게스트 5개 제한
            if is_non_member_mode and effective_id:
                if not HistoryDAO.can_guest_save_more(effective_id):
                    return jsonify({
                        "popup": True,
                        "message": "비회원은 최근 5개의 기록만 저장됩니다. 더 많은 정보를 원하시면 로그인하세요.",
                        "result": label,
                        "confidence": result.get("confidence"),
                        "source": "db"
                    }), 200

            # 히스토리 저장
            if effective_id:
                try:
                    HistoryDAO.save_history(effective_id, url, label)
                except Exception:
                    current_app.logger.exception("history save failed")

            return jsonify({
                "message": "분석 완료된 URL입니다.",
                "url": url,
                "result": label,
                "confidence": result.get("confidence"),
                "domain": (result.get("domain") or parsed.hostname or "-"),
                "created": str(result.get("created_date") or "-"),
                "expiry": str(result.get("expiry_date") or "-"),
                "date": datetime.now().strftime("%Y-%m-%d %H:%M"),
                "source": "db"
            }), 200

        # 2) DB MISS → 모델 실행
        try:
            model_out = get_analysis_for_qr_scan(url)
            label_from_model = (model_out.get("label") or "").upper()
            conf_from_model = model_out.get("confidence")
        except Exception as e:
            current_app.logger.exception(f"모델 호출 실패: {e}")
            label_from_model = "FAILED"
            conf_from_model = None

        if label_from_model not in ("MALICIOUS", "LEGITIMATE"):
            return jsonify({
                "message": "모델 분석 실패",
                "url": url,
                "result": "FAILED",
                "confidence": None,
                "date": datetime.now().strftime("%Y-%m-%d %H:%M"),
                "source": "model"
            }), 200

        result_label = label_from_model

        # 게스트 5개 제한
        if is_non_member_mode and effective_id:
            if not HistoryDAO.can_guest_save_more(effective_id):
                return jsonify({
                    "popup": True,
                    "message": "비회원은 최근 5개의 기록만 저장됩니다. 더 많은 정보를 원하시면 로그인하세요.",
                    "result": result_label,
                    "confidence": conf_from_model,
                    "source": "model"
                }), 200

        # 히스토리 저장 (FAILED 제외)
        if effective_id:
            try:
                HistoryDAO.save_history(effective_id, url, result_label)
            except Exception:
                current_app.logger.exception("history save failed")

        return jsonify({
            "message": "DB 미등록 - 모델 예측 결과 반영",
            "url": url,
            "result": result_label,
            "confidence": conf_from_model,
            "domain": parsed.hostname or "-",
            "created": "-",
            "expiry": "-",
            "date": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "source": "model"
        }), 200

    except Exception:
        current_app.logger.exception("analyze error")
        return jsonify({"message": "server error", "result": "FAILED"}), 200
