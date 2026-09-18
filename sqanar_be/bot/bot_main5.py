# bot/bot_main5.py
# -*- coding: utf-8 -*-
import traceback
import os
import sys
import re
import warnings
import logging
import joblib
import json
import numpy as np
from typing import List, Dict, Any, Optional
from sklearn.metrics.pairwise import cosine_similarity

import boto3

# GPU 차단 및 경고 무시
os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
warnings.filterwarnings("ignore", category=FutureWarning, module="huggingface_hub.file_download")

from langchain.tools import tool
from dotenv import load_dotenv
from langchain.chains import ConversationalRetrievalChain
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import PromptTemplate
from langchain_core.runnables import RunnableWithMessageHistory
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_core.messages import HumanMessage, AIMessage

# 다운로드할 4개 모델 파일의 S3 객체 키
MODEL_FILES = {
    # '코드에서 사용할 이름': 'S3에 저장된 정확한 파일명 (객체 키)'
    "model_1": "modelx_URLBERT_84.pth",
    "centroid": "security_centroid.npy",
    "urlbert_pt": "urlBERT (1).pt",
    "router_model": "rag_chat_router.pkl",
}

# EC2 인스턴스 내에서 파일을 저장할 로컬 디렉터리
LOCAL_MODEL_DIR = "/home/ubuntu/app_data/sqanar_models"

# *************************************************************************
# S3 버킷 이름은 'sqanar-2025'인지 확인하세요. (이미지에서 확인함)
S3_BUCKET_NAME = "sqanar-2025" 
# *************************************************************************

# .env 로드
load_dotenv('api.env')

def download_models_if_not_exists():
    """
    EC2에 연결된 IAM 역할(EC2-S3-Model-Reader-Role)을 사용하여 
    S3에서 모델 파일들을 다운로드합니다.
    """
    if not os.path.exists(LOCAL_MODEL_DIR):
        os.makedirs(LOCAL_MODEL_DIR, exist_ok=True)
        print(f"로컬 모델 디렉터리 생성: {LOCAL_MODEL_DIR}")

    # IAM 역할 권한을 자동으로 사용하여 S3 클라이언트 생성 (비밀 키 불필요)
    s3 = boto3.client('s3')
    success = True
    
    for key_name, object_key in MODEL_FILES.items():
        local_path = os.path.join(LOCAL_MODEL_DIR, object_key)
        
        if os.path.exists(local_path):
            print(f"✅ 모델 {key_name} ({object_key})은 이미 존재합니다.")
            continue
            
        print(f"⬇️ {key_name} ({object_key}) 다운로드 시작...")
        
        try:
            s3.download_file(
                Bucket=S3_BUCKET_NAME, 
                Key=object_key, 
                Filename=local_path
            )
            print(f"✅ {key_name} 다운로드 성공: {local_path}")
        except Exception as e:
            print(f"❌ {key_name} 다운로드 실패: {e}")
            success = False
            
    if not success:
        sys.exit(1)

# *************************************************************************
# 메인 로직 시작 직전에 다운로드 함수 호출 및 로컬 파일 경로 설정
download_models_if_not_exists()


# 이제 앱의 메인 로직에서 모델을 로드할 때 이 경로를 사용해야 합니다.
# 예시: router_model = joblib.load(os.path.join(LOCAL_MODEL_DIR, MODEL_FILES["router_model"]))
# *************************************************************************

# 프로젝트 루트
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

# logging 설정
logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
log = logging.getLogger("bot_main5")

# Redis memory
try:
    from bot.memory_redis import append_message, get_history, new_session_id, clear_session, touch_session
    REDIS_AVAILABLE = True
except Exception:
    REDIS_AVAILABLE = False

# 1) LLM 초기화
if "GOOGLE_API_KEY" not in os.environ:
    raise ValueError("환경 변수에 'GOOGLE_API_KEY'가 설정되어 있지 않습니다.")
llm = ChatGoogleGenerativeAI(model="gemini-2.0-flash", temperature=0.01)

# 2) URL-BERT
from bot.tools.urlbert_tool import load_urlbert_tool
from urlbert.urlbert2.core.model_loader import GLOBAL_MODEL, GLOBAL_TOKENIZER
from bot.feature_extractor import build_raw_features, summarize_features_for_explanation

try:
    url_tool = load_urlbert_tool(GLOBAL_MODEL, GLOBAL_TOKENIZER)
    log.info("✅ URL-BERT 툴 로드 완료")
except Exception as e:
    log.error(f"❌ URL-BERT 툴 로드 실패: {e}")
    url_tool = tool(
        name="URLBERT_ThreatAnalyzer",
        func=lambda x, _e=str(e): f"URL 분석 툴 로드 중 오류 발생: {_e}",
        description="URL 안전/위험 판단"
    )

# 3) RAG 인덱스 생성
RAG_INDEX_DIR = os.path.join(project_root, 'security_faiss_index')
RAG_DATA_PATH = os.path.join(project_root, 'data', 'rag_dataset.jsonl')
if not os.path.exists(RAG_INDEX_DIR) and os.path.exists(RAG_DATA_PATH):
    log.info(f"🔧 RAG 인덱스 생성: {RAG_DATA_PATH} -> {RAG_INDEX_DIR}")
    from bot.tools.rag_tools import build_rag_index_from_jsonl
    build_rag_index_from_jsonl(RAG_DATA_PATH, RAG_INDEX_DIR)

# 4) RAG 체인 구성
embeddings, vector_db, retriever, conversational_rag_chain = None, None, None, None
try:
    embeddings = HuggingFaceEmbeddings(model_name='jhgan/ko-sroberta-multitask')
    if os.path.exists(RAG_INDEX_DIR):
        vector_db = FAISS.load_local(RAG_INDEX_DIR, embeddings, allow_dangerous_deserialization=True)
        retriever = vector_db.as_retriever(search_type="mmr", search_kwargs={'k':5,'fetch_k':10})
        conversational_rag_chain = ConversationalRetrievalChain.from_llm(
            llm=llm, retriever=retriever, memory=None, return_source_documents=True, output_key='answer'
        )
        log.info("✅ RAG 체인 로드 완료")
except Exception as e:
    log.error(f"❌ RAG 체인 로드 실패: {e}")
    conversational_rag_chain = None

# 5) RAG/CHAT 라우터
router_filename = MODEL_FILES["router_model"]
RAG_ROUTER_PATH = os.path.join(LOCAL_MODEL_DIR, router_filename)

try:
    # download_models_if_not_exists() 함수가 이미 실행되었기 때문에
    # 파일이 LOCAL_MODEL_DIR에 존재할 것입니다. (다운로드 실패 시 sys.exit(1)로 종료됨)
    RAG_CHAT_ROUTER_MODEL = joblib.load(RAG_ROUTER_PATH) if os.path.exists(RAG_ROUTER_PATH) else None
    
    if RAG_CHAT_ROUTER_MODEL:
        log.info("✅ RAG-CHAT 라우터 로드 완료")
    else:
        # 파일은 있지만 joblib 로드 실패 또는 파일이 없는 경우 (매우 드묾)
        log.warning("⚠️ RAG-CHAT 라우터 없음, 기본 CHAT 사용")
except Exception as e:
    log.error(f"❌ RAG-CHAT 라우터 로드 실패: {e}")
    RAG_CHAT_ROUTER_MODEL = None

# 6) Security centroid
centroid_filename = MODEL_FILES["centroid"]
SECURITY_CENTROID_PATH = os.path.join(LOCAL_MODEL_DIR, centroid_filename)
try:
    SECURITY_CENTROID = np.load(SECURITY_CENTROID_PATH) if os.path.exists(SECURITY_CENTROID_PATH) else None
    if SECURITY_CENTROID is not None and SECURITY_CENTROID.ndim == 2 and SECURITY_CENTROID.shape[0] == 1:
        SECURITY_CENTROID = SECURITY_CENTROID.reshape(-1)
    log.info("✅ Security centroid 로드 완료")
except Exception as e:
    log.error(f"❌ Security centroid 로드 실패: {e}")
    SECURITY_CENTROID = None

# 7) Prompts / Keywords
from bot.prompts import SIMPLE_URL_PROMPT, URL_PROMPT, WHY_KEYWORDS, MEMORY_KEYWORDS
simple_url_prompt = SIMPLE_URL_PROMPT
url_prompt = URL_PROMPT

# 8) 정규식
URL_PATTERN = re.compile(r'(https?://\S+|(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}\S*)')

# 9) verdict 추출
def _infer_verdict_from_text(bert_text: str) -> str:
    t = (bert_text or "").lower()
    bad_tokens = ["malicious", "phishing", "suspicious", "악성", "위험", "유해"]
    good_tokens = ["benign", "legitimate", "safe", "정상", "안전"]
    if any(tok in t for tok in bad_tokens) and not any(tok in t for tok in good_tokens):
        return "악성"
    if any(tok in t for tok in good_tokens) and not any(tok in t for tok in bad_tokens):
        return "정상"
    return "정상"

# 10) security embedding 판단
def is_security_related_by_embedding(query: str, embedding_model, centroid, threshold=0.6) -> bool:
    q = (query or "").strip()
    if not q: return False
    try:
        if centroid is not None and embedding_model is not None:
            emb = embedding_model.embed_query(q)
            sim = cosine_similarity(np.array(emb).reshape(1,-1), np.array(centroid).reshape(1,-1))[0][0]
            return sim >= threshold
    except Exception:
        pass
    fallback = ["보안","해킹","취약점","피싱","랜섬웨어","악성","CVE"]
    return any(k in q for k in fallback)

# 11) history → text
def history_to_text(chat_history: Optional[Any]) -> str:
    if not chat_history: return ""
    out = []
    if isinstance(chat_history, list):
        for m in chat_history:
            role = m.get("role","user") if isinstance(m, dict) else getattr(m,"role","user")
            content = m.get("text","") if isinstance(m, dict) else getattr(m,"content",None) or getattr(m,"text","")
            out.append(f"{role.upper()}: {content}")
    return "\n".join(out)


def format_history_for_langchain(chat_history: Optional[Any]) -> list:
    """
    [{'role': 'user', 'text': '...'}, ...] 형식의 기록을
    [HumanMessage(...), AIMessage(...)] 형식으로 변환합니다.
    """
    if not chat_history:
        return []
    
    formatted_history = []
    for message in chat_history:
        role = message.get("role", "user")
        text = message.get("text", "")
        if role == "user":
            formatted_history.append(HumanMessage(content=text))
        else: # 'assistant', 'bot', 'ai' 등 user가 아닌 모든 경우
            formatted_history.append(AIMessage(content=text))
            
    return formatted_history
# 12) 핵심 함수
# bot_main5.py의 get_chatbot_response 함수를 아래 코드로 전체 교체해주세요.

def get_chatbot_response(query: str, session_id: Optional[str] = None) -> Dict[str, Any]:
    print("➡️ [2/3] bot/bot_main5.py: get_chatbot_response 함수가 시작되었습니다.")
    """
    사용자 쿼리를 처리하고, Redis를 이용해 대화 기록을 관리하여 응답을 반환합니다.
    """
    text = (query or "").strip()
    if not text:
        return {"answer": "", "mode": "empty"}

    # --- 1. (LOAD) 대화 시작 시 Redis에서 이전 기록 불러오기 ---
    if session_id and REDIS_AVAILABLE:
        try:
            touch_session(session_id)
            chat_history = get_history(session_id)
        except Exception as e:
            log.error(f"Redis에서 기록을 불러오는 중 오류 발생: {e}")
            chat_history = []
    else:
        chat_history = []

    history_text = history_to_text(chat_history)
    match = URL_PATTERN.search(text)
    if match:
        print(f"✅ [bot/bot_main5.py] URL을 찾았습니다: {match.group(1)}")
    else:
        print("❌ [bot/bot_main5.py] URL을 찾지 못했습니다. URL 분석 로직을 건너뜁니다.")

    is_why_question = any(k in text for k in WHY_KEYWORDS)
    is_memory_question = any(k in text for k in MEMORY_KEYWORDS)

    response = {}

    # --- 2. (PROCESS) 기존 로직을 사용하여 응답 생성 ---
    # 1) 메모리 질문 처리
    if is_memory_question and chat_history:
        memory_prompt = f"당신은 사용자와의 대화를 기억하는 친절한 챗봇입니다.\n\n[대화 기록]\n{history_text}\n\n[질문]\n{text}\n\n[최종 답변]:"
        try:
            ans = llm.invoke(memory_prompt).content
            response = {"answer": ans, "mode": "memory"}
        except Exception as e:
            log.error(f"메모리 질문 처리 중 LLM 호출 오류: {e}")
            response = {"answer": "기억을 떠올리는 중 오류가 발생했어요.", "mode": "memory_error"}

    # 2) URL 분석 처리
    elif match:
        url = match.group(1)
        print("➡️ [3/3] bot/bot_main5.py: url_tool.run()을 호출하여 urlbert_tool.py를 실행합니다.")
        try:
            bert_result = url_tool.func(url)
        except Exception as e:
            bert_result = f"URL-BERT 오류: {e}"

        if is_why_question:
            # ... 상세 분석 로직 ...
            try:
                df = build_raw_features(url)
                verdict = _infer_verdict_from_text(bert_result)
                reasons = summarize_features_for_explanation(df, verdict, top_k=3) if not df.empty else ["세부 특징 추출 실패"]
                feature_details = "\n".join(f"- {r}" for r in reasons)
                prompt = url_prompt.format(user_query=text, bert_result=bert_result, feature_details=feature_details)
                ans = llm.invoke(prompt).content
                response = {"answer": ans, "mode": "url_analysis_detailed", "url": url}
            except Exception as e:
                response = {"answer": "URL 상세 분석 중 오류가 발생했어요.", "mode": "url_error"}
        else:
            # ... 간단 분석 로직 ...
            prompt = simple_url_prompt.format(bert_result=bert_result, url=url)
            try:
                ans = llm.invoke(prompt).content
                response = {"answer": ans, "mode": "url_analysis_simple", "url": url}
            except Exception as e:
                response = {"answer": "URL을 분석하는 중 오류가 발생했어요.", "mode": "url_error"}

    # ---  3) RAG / CHAT / 가드레일 처리 ---
    else:
        print("\n--- RAG 진단 시작 ---")
        
        # 1. RAG 체인이 정상적으로 로드되었는지 확인
        print(f"1. RAG 체인 로드 여부: {'✅ 로드됨' if conversational_rag_chain else '❌ 로드 실패'}")

        # 라우터가 RAG를 추천하는지 먼저 확인
        action = "CHAT"
        if RAG_CHAT_ROUTER_MODEL:
            try:
                action = RAG_CHAT_ROUTER_MODEL.predict([text])[0]
            except Exception:
                action = "CHAT"
        print(f"2. 라우터 판단 결과 (action): '{action}'")

        # 라우터와 별개로, 임베딩 기반으로 보안 관련 질문인지 확인
        sec_flag = False
        try:
            # 1차: 임베딩으로 체크
            if is_security_related_by_embedding(text, embeddings, SECURITY_CENTROID):
                sec_flag = True
        except Exception as e:
            print(f"임베딩 체크 중 오류: {e}")

        # 2차: 임베딩이 놓쳤을 경우, 키워드로 한 번 더 체크 (강화된 안전망)
        if not sec_flag:
            keyword_list = ["큐싱", "피싱", "스미싱", "보안", "해킹", "취약점", "랜섬웨어", "CVE"]
            if any(k in text for k in keyword_list):
                sec_flag = True
        print(f"3. 임베딩/키워드 판단 결과 (sec_flag): {sec_flag}")


        # <조건> 라우터가 'RAG'이거나, 내용 자체가 '보안 관련'일 경우 -> RAG로 답변 시도
        if (action == "RAG" or sec_flag) and conversational_rag_chain:
            print("4. 최종 판단: ✅ RAG 실행")
            try:
                langchain_chat_history = format_history_for_langchain(chat_history)
                res = conversational_rag_chain.invoke({
                    "question": text,
                    "chat_history": langchain_chat_history
                })
                sources = [doc.metadata.get("source") for doc in res.get("source_documents", []) if doc.metadata.get("source")]
                response = {"answer": res.get("answer", ""), "mode": "rag", "sources": list(set(sources))}
            except Exception as e:
                log.error(f"RAG 체인 호출 실패: {e}")
                response = {"answer": "문서 검색 중 오류가 발생했어요.", "mode": "rag_error"}
        # <조건> 위 경우가 아닐 경우 (보안과 관련 없는 질문) -> 가드레일 메시지 출력
        else: 
            print("4. 최종 판단: ❌ RAG 건너뛰고 가드레일 응답")
            GREETING_KEYWORDS = ["안녕", "하이", "ㅎㅇ", "hi", "hello"]
            if text.lower() in GREETING_KEYWORDS:
                friendly_greeting = (
                    "안녕하세요! 무엇을 도와드릴까요? "
                    "큐싱, 피싱, URL 보안 등 궁금한 점이 있으시면 언제든지 물어보세요."
                )
                response = {"answer": friendly_greeting, "mode": "chat_greeting"}
            else:
                response = {"answer": "죄송합니다. 저는 보안 전문 챗봇으로, 보안 관련 질문에만 답변할 수 있습니다. ", "mode": "chat_guardrail"}


    # --- 4. (SAVE) 이번 대화를 Redis에 저장하기 ---
    if session_id and REDIS_AVAILABLE and response.get("answer"):
        try:
            append_message(session_id, "user", query)
            append_message(session_id, "assistant", response["answer"])
        except Exception as e:
            log.error(f"Redis에 대화 기록 저장 중 오류 발생: {e}")

    return response

if __name__=="__main__":
    print("--- 챗봇 시작 (종료: '종료') ---")
    while True:
        try: text=input("You ▶ ").strip()
        except (EOFError,KeyboardInterrupt): break
        if text.lower() in ["종료","exit"]: break
        if not text: continue
        res=get_chatbot_response(text)
        print(f"Bot ▶ {res.get('answer')}\n")
