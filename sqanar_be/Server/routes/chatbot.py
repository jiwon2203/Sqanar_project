from flask import Blueprint, render_template, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.exceptions import BadRequest
import json
from datetime import datetime, timedelta, timezone
import os
import traceback
from Server.DB_conn import get_connection_dict as get_db_conn
from bot.bot_main5 import get_chatbot_response, llm
from bot.memory_redis import append_message, get_history, new_session_id, clear_session, touch_session
import uuid

chatbot_bp = Blueprint("chatbot", __name__, url_prefix="/chatbot")
SESSION_TIMEOUT_MINUTES = 30

# ------ 카메라 화면에서 AI 요약 분석 제공 -------
def _analyze_malicious_url_with_gemini(url: str, analysis_result: dict) -> str:
    reason_text = "제공된 분석 결과에는 위험 사유에 대한 상세 정보가 부족합니다."
    if analysis_result and analysis_result.get('reason'):
        reason_text = analysis_result['reason']
    elif analysis_result and analysis_result.get('threat_type'):
        reason_text = f"주요 위협 유형: {analysis_result['threat_type']}"
    prompt = f"""
    당신은 사용자에게 URL 분석 결과를 설명하는 보안 챗봇입니다.
    사용자가 스캔한 URL은 '{url}'이며, 분석 결과 '위험(MALICIOUS)'합니다.
    분석 서버에서 제공된 정보는 다음과 같습니다: {reason_text}
    
    이 정보를 바탕으로, 해당 사이트가 **위험한 주된 이유 한 가지**만 찾아서 
    **쉽고 간결한 한국어 한 문장**으로 설명해 주세요.
    """
    try:
        response = llm.invoke(prompt)
        return response.content.strip()
    except Exception as e:
        print(f"Error during Gemini malicious URL analysis: {e}")
        return "죄송합니다. 위험 사유 분석 중 LLM 통신 오류가 발생했습니다."

def _summarize_with_gemini(messages: list) -> str:
    if not messages:
        return "새 대화"
    conversation_text = "\n".join([f"{msg.get('role', 'unknown')}: {msg.get('text', '')}" for msg in messages])
    prompt = f"""다음 대화 내용을 한국어로 짧은 제목으로 요약해줘:\n\n{conversation_text}\n\n제목: """
    try:
        response = llm.invoke(prompt)
        summary = response.content.strip().replace('"', '')
        first_user_message = next((msg['text'] for msg in messages if msg.get('role') == 'user'), "새 대화")
        return summary if summary else first_user_message[:40]
    except Exception as e:
        print(f"Error during Gemini summary: {e}")
        first_user_message = next((msg['text'] for msg in messages if msg.get('role') == 'user'), "새 대화")
        return first_user_message[:40]

@chatbot_bp.route("/", methods=["GET"])
@jwt_required(optional=True)
def chatbot():
    # JWT 인증 후 사용자 정보 가져오기
    user_id = get_jwt_identity()
    # app_settings는 클라이언트에서 관리하도록 변경, 세션 제거
    mode = request.args.get("mode") or "normal"
    return render_template("chatbot.html", mode=mode, is_logged_in=bool(user_id))

@chatbot_bp.route("/api", methods=["POST"])
@jwt_required(optional=True)
def chatbot_api():
    user_id = get_jwt_identity()
    payload = request.get_json(silent=True) or {}
    q = (payload.get("query") or payload.get("message") or "").strip()
    meta = payload.get("meta") or {}
    if not q:
        raise BadRequest("query가 비어 있습니다.")

    session_id = payload.get("session_id")
    if meta.get("summary_request"):
        url = meta.get("url_analysis_result", {}).get("url", q)
        analysis_result = meta.get("url_analysis_result")
        summary = _analyze_malicious_url_with_gemini(url, analysis_result)
        response_payload = {
            "reply": summary,
            "answer": summary,
            "mode": "summary_analysis",
            "session_id": session_id
        }
        return jsonify(response_payload), 200

    if not session_id:
        try:
            session_id = new_session_id()
        except Exception:
            session_id = None
    try:
        data = get_chatbot_response(query=q, session_id=session_id) or {}
    except Exception as e:
        traceback.print_exc()
        return jsonify({"reply": "오류가 발생했어요.", "error": str(e)}), 500

    reply = data.get("reply") or data.get("answer") or ""
    response_payload = {
        "reply": reply,
        "answer": data.get("answer") or reply,
        "mode": data.get("mode") or payload.get("mode") or "basic",
        "sources": data.get("sources") or [],
        "session_id": session_id
    }
    return jsonify(response_payload), 200

@chatbot_bp.route("/history/save", methods=["POST"])
@jwt_required()
def save_history():
    user_id = get_jwt_identity()
    payload  = request.get_json(silent=True) or {}
    messages = payload.get("messages") or []
    history_id = payload.get("history_id")

    if not user_id or not messages or not history_id:
        return jsonify({"ok": True, "skipped": "INSUFFICIENT_DATA"})

    title = _summarize_with_gemini(messages)
    preview = (messages[-1].get("text") or "").strip()[:80]
    messages_json = json.dumps(messages, ensure_ascii=False)

    now = datetime.now(timezone.utc)
    ttl_days   = int(os.getenv("CHAT_HISTORY_TTL_DAYS", "30"))
    expires_at = now + timedelta(days=ttl_days)

    conn = get_db_conn()
    try:
        with conn.cursor() as cur:
            sql = """
                INSERT INTO chat_history (id, user_id, title, preview, messages, created_at, expires_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                title = VALUES(title),
                preview = VALUES(preview),
                messages = VALUES(messages),
                created_at = VALUES(created_at),
                expires_at = VALUES(expires_at)
            """
            cur.execute(sql, (history_id, str(user_id), title, preview, messages_json, now, expires_at))
            conn.commit()
            status_code = 201 if cur.rowcount == 1 else 200
    except Exception as e:
        conn.rollback()
        return jsonify({"ok": False, "error": str(e)}), 500
    finally:
        conn.close()
    return jsonify({"ok": True}), status_code

@chatbot_bp.route("/history/list", methods=["GET"])
@jwt_required()
def list_history():
    user_id = get_jwt_identity()
    conn = get_db_conn()
    rows = []
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, title, preview, created_at, expires_at FROM chat_history WHERE user_id=%s ORDER BY created_at DESC",
                (str(user_id),)
            )
            rows = cur.fetchall() or []
    finally:
        conn.close()

    now_utc = datetime.now(timezone.utc)
    for r in rows:
        exp = r.get("expires_at")
        if exp:
            if exp.tzinfo is None: exp = exp.replace(tzinfo=timezone.utc)
            r["ttl_seconds"] = max(0, int((exp - now_utc).total_seconds()))
            r["expires_at"] = exp.isoformat()
        ca = r.get("created_at")
        if ca:
            if ca.tzinfo is None: ca = ca.replace(tzinfo=timezone.utc)
            r["created_at"] = ca.isoformat()
    return jsonify({"sessions": rows})

@chatbot_bp.route("/history/session/<string:session_id>", methods=["GET"])
@jwt_required()
def get_session(session_id):
    user_id = get_jwt_identity()
    conn = get_db_conn()
    session_data = None
    try:
        with conn.cursor() as cur:
            try:
                numeric_id = int(session_id)
                cur.execute(
                    "SELECT messages FROM chat_history WHERE id=%s AND user_id=%s",
                    (numeric_id, str(user_id))
                )
            except ValueError:
                cur.execute(
                    "SELECT messages FROM chat_history WHERE id=%s AND user_id=%s",
                    (session_id, str(user_id))
                )
            result = cur.fetchone()
            if result and result.get('messages'):
                session_data = {"messages": json.loads(result['messages'])}
    finally:
        conn.close()

    if not session_data:
        return jsonify({"error": "Session not found"}), 404
    return jsonify(session_data)
