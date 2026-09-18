# test_whois.py

import pandas as pd
import whois
import time
import concurrent.futures
from urllib.parse import urlparse
from datetime import datetime
import socket

# 날짜 형식을 YYYY-MM-DD로 변환하는 함수
def format_date(date):
    if date in ('Unknown', 'Error', None):
        return 'Unknown'
    if isinstance(date, list):
        date = date[0]
    if isinstance(date, datetime):
        return date.strftime('%Y-%m-%d')
    for fmt in ('%Y-%m-%d', '%Y/%m/%d'):
        try:
            return datetime.strptime(str(date).split()[0], fmt).strftime('%Y-%m-%d')
        except ValueError:
            pass
    return 'Unknown'

# WHOIS 데이터 조회 함수
def get_whois_info(domain):
    """WHOIS 정보를 조회하고 실패 시 재시도 (최대 3회)"""
    # 1. _ 를 i 로 변경
    for i in range(3): 
        try:
            # 2. timeout=5 파라미터 추가
            w = whois.whois(domain, timeout=5) 
            return (
                w.creation_date,
                w.expiration_date,
                w.registrar,
                True
            )
        except socket.timeout:
            # 'i'를 사용할 수 있게 됨
            print(f"WARN: whois.whois({domain}) timed out. (Attempt {i+1}/3)")
            time.sleep(1) # 재시도 전 잠시 대기
            
        # 4. 그 외 모든 오류
        except Exception as e:
            # 타임아웃 외의 오류(예: 'whois server not found')는 재시도할 필요가 없으므로 break
            print(f"ERROR: whois.whois({domain}) failed: {e}")
            break
            
    return None, None, None, False

# 단일 URL에서 WHOIS 피처 추출 함수
def extract_whois_features(url: str) -> dict:
    """
    URL 하나를 받아서 WHOIS 관련 피처를 dict 로 반환합니다.
    """
    parsed = urlparse(url)
    domain = parsed.netloc.split(':')[0].lstrip("www.")
    created, expiry, registrar, available = get_whois_info(domain)
    return {
        "Domain": domain,
        "Created Date": format_date(created),
        "Expiry Date": format_date(expiry),
        "Registrar": registrar,
        "WHOIS Available": available
    }

# ---- 아래부터는 "대량 처리" 스크립트로만 사용할 코드 ----
if __name__ == "__main__":
    input_file  = "/home/injeolmi/myproject/sQanAR/whois_data/output/chunk_10.csv"
    output_file = "/home/injeolmi/myproject/sQanAR/whois_data/dataset/whois_10.csv"

    df = pd.read_csv(input_file)
    if "url" not in df.columns:
        raise ValueError("CSV에 'url' 컬럼이 없습니다.")
    urls = df["url"].tolist()

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        feature_data = list(executor.map(extract_whois_features, urls))

    feature_df = pd.DataFrame(feature_data)
    merged_df  = pd.concat([df, feature_df], axis=1)
    merged_df.to_csv(output_file, index=False)
    print(f"✅ WHOIS 분석 완료 → {output_file}")
