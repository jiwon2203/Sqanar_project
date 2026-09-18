# server/db_manager.py
import json
import hashlib
from typing import Optional, Dict, Any

from Server.DB_conn import get_connection
from pymysql.cursors import DictCursor
# ---------------------------------------------------------------------
# 캐시 조회: URL 해시를 파이썬에서 미리 계산해서 인덱스(url_hash)에 바로 매칭
#  - [CHANGED] SQL의 MD5(%s) 제거 → WHERE url_hash = %s 로 변경(인덱스 사용)
#  - [ADDED] DictCursor 사용 보장(없다면 커서옵션으로 지정)
#  - [ADDED] 연결/커서 정리(try/finally)

# ---------------------------------------------------------------------
# [최종 수정] 디버깅 및 안정성 코드가 추가된 캐시 조회 함수
# ---------------------------------------------------------------------
def get_urlbert_info_from_db(url: str) -> Optional[Dict[str, Any]]:
    """
    urlbert_analysis 테이블에서 해당 URL이 있으면 row dict 반환, 없으면 None.
    """
    url_hash = hashlib.md5(url.encode("utf-8")).hexdigest()

    sql = """
    SELECT
      url,
      header_info,
      is_malicious,
      confidence,
      true_label,
      analysis_date
    FROM urlbert_analysis
    WHERE url_hash = %s
    """

    conn = None
    cur = None
    try:
        conn = get_connection()
        cur = conn.cursor()  # DictCursor 없이 기본 커서를 사용합니다.

        cur.execute(sql, (url_hash,))
        row = cur.fetchone()

        # [핵심] DB에서 가져온 row가 튜플 형태일 때만 딕셔너리로 변환합니다.
        if row and not isinstance(row, dict):
            
            # --- 디버깅 코드 시작 ---
            # 터미널 로그를 통해 실제 DB가 어떤 값을 주는지 확인합니다.
            print("--- DEBUG START ---")
            print(f"DB에서 가져온 원본 row (튜플): {row}")
            print(f"DB가 제공하는 컬럼 정보: {cur.description}")
            # --- 디버깅 코드 끝 ---
            
            if not cur.description:
                print("CRITICAL ERROR: DB 커서에서 컬럼 정보를 얻을 수 없습니다!")
                return None

            # 컬럼 이름만 추출합니다.
            colnames = [desc[0] for desc in cur.description]
            
            # 튜플과 컬럼 이름을 합쳐 딕셔너리를 만듭니다.
            row = dict(zip(colnames, row))
            
            # --- 디버깅 코드 시작 ---
            print(f"추출된 컬럼 이름: {colnames}")
            print(f"변환된 최종 딕셔너리: {row}")
            print("--- DEBUG END ---")
            # --- 디버깅 코드 끝 ---

        # [안정성 코드] 최종 반환 전 'url' 키가 있는지 한 번 더 확인합니다.
        if row and 'url' not in row:
            print(f"CRITICAL ERROR: 최종 딕셔너리에 'url' 키가 없습니다! SELECT 문이나 DB 스키마를 확인하세요.")
            # 오류를 발생시키는 대신 None을 반환하여 프로그램 중단을 막습니다.
            return None
            
        return row
        
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


# def get_urlbert_info_from_db(url: str) -> Optional[Dict[str, Any]]:
#     """
#     urlbert_analysis 테이블에서 해당 URL이 있으면 row dict 반환, 없으면 None.
#     반환 dict 키:
#       - url (str)
#       - header_info (str|None)
#       - is_malicious (int)
#       - confidence (float|None)
#       - true_label (int|None)
#       - analysis_date (datetime)
#     """
#     # [ADDED] 파이썬에서 해시 선계산(인덱스 hit)
#     url_hash = hashlib.md5(url.encode("utf-8")).hexdigest()

#     sql = """
#     SELECT
#       url,
#       header_info,
#       is_malicious,
#       confidence,
#       true_label,
#       analysis_date
#     FROM urlbert_analysis
#     WHERE url_hash = %s
#     """

#     conn = None
#     cur = None
#     try:
#         conn = get_connection()
#         # [ADDED] DictCursor가 기본이 아닐 수 있으므로 옵션 지정 시도
#         try:
#             cur = conn.cursor()  # DictCursor가 기본이면 이대로 사용
#             # 만약 tuple로 나온다면 DB_conn에서 DictCursor 설정하도록 권장
#             # (예: pymysql.cursors.DictCursor)
#         except TypeError:
#             # 일부 커넥터에서 cursor(cursorclass=...) 형태 지원
#             from pymysql.cursors import DictCursor  # 사용 중 라이브러리에 맞춰 조정
#             cur = conn.cursor(DictCursor)

#         cur.execute(sql, (url_hash,))
#         row = cur.fetchone()

#         # [ADDED] DictCursor가 아닌 경우 대비: 튜플이면 dict로 수동 변환
#         if row and not isinstance(row, dict):
#             colnames = [desc[0] for desc in cur.description]
#             row = dict(zip(colnames, row))

#         return row
#     finally:
#         # [ADDED] 리소스 정리
#         try:
#             if cur:
#                 cur.close()
#         finally:
#             if conn:
#                 conn.close()


# ---------------------------------------------------------------------
# 캐시 저장/업데이트: ON DUPLICATE KEY UPDATE
#  - [ADDED] 입력 값 방어적 캐스팅
#  - [CHANGED] conn.autocommit 보장 또는 명시적 commit
#  - [ADDED] 연결/커서 정리(try/finally)
# ---------------------------------------------------------------------
def save_urlbert_to_db(record: Dict[str, Any]) -> None:
    """
    urlbert_analysis 테이블에 INSERT 또는 UPDATE.
    record dict 키:
      - url (str)
      - header_info (str|None)
      - is_malicious (int)
      - confidence (float|None)
      - true_label (int|None)
    """
    url = str(record["url"])
    url_hash = hashlib.md5(url.encode("utf-8")).hexdigest()

    # [ADDED] 방어적 캐스팅
    header_info = record.get("header_info")
    if isinstance(header_info, (dict, list)):
        # dict/list가 오면 JSON 문자열로 저장
        header_info = json.dumps(header_info, ensure_ascii=False)
    elif header_info is not None:
        header_info = str(header_info)

    is_mal = int(record.get("is_malicious", 0))
    conf = record.get("confidence")
    conf = float(conf) if conf is not None else None
    true_lbl = record.get("true_label")
    true_lbl = int(true_lbl) if true_lbl is not None else None

    sql = """
    INSERT INTO urlbert_analysis
      (url, url_hash, header_info, is_malicious, confidence, true_label)
    VALUES
      (%s,  %s,       %s,         %s,           %s,         %s)
    ON DUPLICATE KEY UPDATE
      header_info   = VALUES(header_info),
      is_malicious  = VALUES(is_malicious),
      confidence    = VALUES(confidence),
      true_label    = VALUES(true_label),
      analysis_date = CURRENT_TIMESTAMP
    """

    params = (url, url_hash, header_info, is_mal, conf, true_lbl)

    conn = None
    cur = None
    try:
        conn = get_connection()
        # [ADDED] autocommit이 False면 commit 필수
        if getattr(conn, "autocommit", None) is not True:
            try:
                conn.autocommit = False  # 일부 드라이버는 속성 미지원일 수 있음
            except Exception:
                pass

        cur = conn.cursor()
        cur.execute(sql, params)
        conn.commit()  # [CHANGED] 명시적 커밋

        print(f"✅ urlbert_analysis 저장/업데이트 완료: {url}")
    except Exception as e:
        # [ADDED] 실패 시 롤백
        try:
            if conn:
                conn.rollback()
        finally:
            pass
        raise e
    finally:
        # [ADDED] 리소스 정리
        try:
            if cur:
                cur.close()
        finally:
            if conn:
                conn.close()
