from flask import Blueprint, render_template, request, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from Server.models.history_dao import HistoryDAO
from Server.models.user_dao import UserDAO
import uuid

history_bp = Blueprint("history", __name__, url_prefix="/history")

@history_bp.route("/", methods=["GET"])
@jwt_required(optional=True)
def history():
    # 로그인 여부 확인
    user_id = get_jwt_identity()
    is_logged_in = bool(user_id)
    is_guest = not is_logged_in

    # 게스트 UUID 생성/사용
    # if not is_logged_in:
    #     guest_id = request.args.get("guest_id") or str(uuid.uuid4())
    #     effective_id = guest_id
    # else:
    #     effective_id = user_id
    if not is_logged_in:
        # 1. X-Guest-Id 헤더 확인 (모바일 앱 표준)
        guest_id = request.headers.get("X-Guest-Id")
        
        # 2. 쿼리 파라미터 확인 (기존 웹/호환성)
        if not guest_id:
            guest_id = request.args.get("guest_id")
        
        # 3. 없으면 새 ID 생성 (실제로는 클라이언트가 ID를 저장하고 보내야 함)
        if not guest_id:
            guest_id = str(uuid.uuid4())
        
        effective_id = guest_id
    else:
        effective_id = user_id

    # 필터
    # 세션 기반 app_settings 없으므로 기본값 all
    filt = request.args.get("filter") or "all"

    scans, total, pages = [], None, None
    page, per_page = 1, 10
    q = None

    if is_logged_in:
        # 회원: 페이징/검색
        try:
            page = int(request.args.get("page", "1"))
        except ValueError:
            page = 1
        try:
            per_page = int(request.args.get("per_page", "10"))
        except ValueError:
            per_page = 10
        q = (request.args.get("q") or "").strip() or None

        scans, total = HistoryDAO.get_user_history_paginated(user_id, page=page, per_page=per_page, q=q)

        if filt == "legit":
            scans = [x for x in scans if (x.get("label") or "").upper() in ("LEGITIMATE", "SAFE", "정상")]
        elif filt == "malicious":
            scans = [x for x in scans if (x.get("label") or "").upper() in ("MALICIOUS", "DANGER", "악성")]

        pages = (total + per_page - 1) // per_page if total is not None else None

    else:
        # 게스트: 최근 5개 고정
        base = HistoryDAO.get_guest_history(effective_id, limit=HistoryDAO.GUEST_LIMIT)
        if filt == "legit":
            scans = [x for x in base if (x.get("label") or "").upper() in ("LEGITIMATE", "SAFE", "정상")]
        elif filt == "malicious":
            scans = [x for x in base if (x.get("label") or "").upper() in ("MALICIOUS", "DANGER", "악성")]
        else:
            scans = base

    if request.args.get("format") == "json":
        return {
            "is_logged_in": is_logged_in,
            "current_filter": filt,
            "scans": [
                {
                    "id": i,
                    "url": it.get("url"),
                    "label": it.get("label"),
                    "analysis_date": it.get("analyzed_at").strftime("%Y-%m-%d %H:%M:%S") if it.get("analyzed_at") else "-"
                }
                for i, it in enumerate(scans)
            ]
        }, 200

    return render_template(
        "history.html",
        scans=scans,
        is_logged_in=is_logged_in,
        current_filter=filt,
        page=page,
        per_page=per_page,
        q=(q or ""),
        total=total,
        pages=pages
    )
