# bot/ocr_handler.py
# -*- coding: utf-8 -*-

import re
import os
import unicodedata
import difflib
import dns.resolver
from urllib.parse import urlparse
import idna  # IDN punycode
from PIL import Image
import io
import numpy as np
import easyocr  # ← EasyOCR 사용

# ===== 동작 옵션 =====
ENABLE_DNS_CHECK = False                    # OCR 단계는 빠르게 후보만 모음 (/analyze에서 검증)
TLD_MODE = "IANA"                           # IANA TLD 파일 있으면 강제 검증
TLD_FUZZY_FIX = True                        # 오타난 TLD를 가까운 IANA 후보로 보정
MAX_RETURN = 50                             # 최대 반환 개수

# ===== TLD & IANA 준비 =====
_IANA_TLDS_PATH = os.getenv(
    "IANA_TLDS_PATH",
    os.path.join(os.path.dirname(__file__), "data", "iana_tlds.txt")
)
_DEFAULT_TLDS = {
    "com","net","org","edu","gov","mil","io","me","app","dev","site","shop",
    "info","biz","tv","fm","ai","gg","co","kr","jp","cn","de","uk","fr","es",
    "it","nl","se","no","ru","in","id","sg","hk","tw","au","ca","br","mx",
}
_IANA_TLDS = None
try:
    if os.path.exists(_IANA_TLDS_PATH):
        with open(_IANA_TLDS_PATH, "r", encoding="utf-8") as f:
            _IANA_TLDS = {line.strip().lower() for line in f if line.strip() and not line.startswith("#")}
    else:
        _IANA_TLDS = set(_DEFAULT_TLDS)
except Exception:
    _IANA_TLDS = set(_DEFAULT_TLDS)

# 유효 TLD 정규식(알파벳 2~63자 or punycode)
_VALID_TLD_RE = re.compile(r"^(?:[a-z]{2,63}|xn--[a-z0-9]{2,59})$", re.I)

# 전각/특수문자 → ASCII 치환
_TRANSLATE_CHARS = {
    ord('，'): ',', ord('．'): '.', ord('。'): '.', ord('、'): ',',
    ord('／'): '/', ord('⁄'): '/', ord('⸺'): '-', ord('–'): '-', ord('—'): '-',
    ord('“'): '"', ord('”'): '"', ord('‘'): "'", ord('’'): "'",
    ord('⍰'): '?', ord('·'): '.', ord('•'): '.', ord('●'): '.',
}
TRAILING_PUNCT = '),.;:!?\"\'`’”〉》」】、。；：！（）…·]＞）〕』」》】'
_ZERO_WIDTHS = ''.join(['\u200b', '\u200c', '\u200d', '\u2060', '\ufeff'])

# 느슨한 URL 후보(도메인 내부 공백 허용) → 후처리로 복원
_RELAXED_URL_PATTERN = re.compile(
    r"""(?ix)
    \b(
        (?:https?://|www\.)?                       # 스킴/WWW 선택
        [a-z0-9][a-z0-9\-\s]{0,63}                 # 레이블 1
        (?:\.[a-z0-9\-\s]{1,63})+                  # .레이블 2+
        (?:/[^\s<>"']*)?                           # 경로
    )
    """
)

# ---------- EasyOCR 리더(싱글톤) ----------
_reader = None
def _get_reader():
    global _reader
    if _reader is None:
        # 한국어 + 영어
        _reader = easyocr.Reader(['ko', 'en'], gpu=False)
    return _reader

# ---------- 유틸 ----------
def _strip_zw_and_space(s: str) -> str:
    if not s:
        return ''
    s = s.translate({ord(ch): None for ch in _ZERO_WIDTHS})
    s = re.sub(r'\s+', '', s)
    return s

def _has_https_token(text: str) -> bool:
    # 'h ttps ://' 같은 변형도 감지
    t = unicodedata.normalize('NFKC', text or '')
    t = t.translate(_TRANSLATE_CHARS)
    t = _strip_zw_and_space(t.lower())
    return 'https://' in t

# 랭킹 패널티용 일반 단어 사전
_GENERIC_HOST_TOKENS = {
    "find","click","scan","search","apply","order","track","gift","promo",
    "offer","deal","help","support","notice","verify","update","login",
    "signin","signup","account","secure","pay","link","open","go","watch",
    "join","start","begin","now","free","save","win","shop","store"
}

def _preclean_text(t: str) -> str:
    if not t:
        return ''
    t = unicodedata.normalize('NFKC', t)
    t = t.translate({ord(ch): None for ch in _ZERO_WIDTHS})
    t = t.translate(_TRANSLATE_CHARS)
    t = re.sub(r'(?<=\.)\s+(?=\w)', '', t)   # "naver. com" → "naver.com"
    t = re.sub(r'\s+(?=/)', '', t)           # "com /login" → "com/login"
    t = re.sub(r'(?<=/)\s+', '', t)          # "/ lo gin"  → "/login"
    t = re.sub(r'[ \t\r\f\v]+', ' ', t)
    t = re.sub(r'(\.[a-zA-Z]{2,63})\s*\n\s*(/)', r'\1\2', t)
    return t

def _strip_trailing_punct(s: str) -> str:
    return s.rstrip(TRAILING_PUNCT)

def _normalize_url(url: str) -> str:
    u = _strip_trailing_punct((url or "").strip())
    if not re.match(r'^(?:https?)://', u, re.I):
        u = 'http://' + u
    return u

def _hostname_of(url: str) -> str | None:
    try:
        return urlparse(url).hostname
    except Exception:
        return None

def _to_ascii_host(host: str) -> str:
    try:
        return idna.encode(host.strip()).decode("ascii")
    except Exception:
        return host.strip()

def _tld_from_host(host: str) -> str:
    parts = host.split('.')
    if len(parts) < 2:
        return ''
    return parts[-1]

def _tld_is_allowed(tld: str) -> bool:
    if not tld:
        return False
    if not _VALID_TLD_RE.match(tld):
        return False
    if TLD_MODE == "IANA" and _IANA_TLDS is not None:
        return tld.lower() in _IANA_TLDS
    return True

def _closest_allowed_tld(tld: str) -> str | None:
    if not TLD_FUZZY_FIX or _IANA_TLDS is None:
        return None
    if not (2 <= len(tld) <= 6):
        return None
    if tld.lower().startswith("xn--"):
        return None
    candidates = list(_IANA_TLDS)
    match = difflib.get_close_matches(tld.lower(), candidates, n=1, cutoff=0.8)
    return match[0] if match else None

def _repair_host_spacing(host: str) -> str:
    h = host.replace(' ', '')
    h = h.replace('..', '.')
    return h

def _repair_url_candidate(raw: str, prefer_https: bool = False) -> str | None:
    if not raw:
        return None
    s = raw.strip().translate(_TRANSLATE_CHARS)

    s_with_scheme = s if re.match(r'^(?:https?)://', s, re.I) else "http://" + s
    try:
        p = urlparse(s_with_scheme)
    except Exception:
        return None

    host_raw = (p.hostname or "")
    path = p.path or ""
    query = (f"?{p.query}" if p.query else "")
    fragment = (f"#{p.fragment}" if p.fragment else "")

    if not host_raw:
        return None

    host_clean = _repair_host_spacing(host_raw)
    host_ascii = _to_ascii_host(host_clean)
    if not re.fullmatch(r'[a-z0-9\-\.]+', host_ascii, flags=re.I):
        return None

    tld = _tld_from_host(host_ascii.lower())
    if not (tld and _VALID_TLD_RE.match(tld)):
        return None
    if tld not in _IANA_TLDS:
        fixed = _closest_allowed_tld(tld)
        if fixed:
            parts = host_ascii.split('.')
            parts[-1] = fixed
            host_ascii = '.'.join(parts)
        else:
            return None

    scheme = p.scheme if p.scheme in ('http', 'https') else 'http'
    if prefer_https and scheme == 'http':
        scheme = 'https'

    final = f"{scheme}://{host_clean}{path}{query}{fragment}"
    return _strip_trailing_punct(final)

def is_valid_domain_or_host(url: str, timeout=1.0) -> bool:
    norm = _normalize_url(url)
    host = _hostname_of(norm)
    if not host or "." not in host:
        return False

    resolver = dns.resolver.Resolver()
    resolver.lifetime = timeout
    resolver.timeout = timeout
    try:
        resolver.search = []
    except Exception:
        pass

    host_ascii = _to_ascii_host(host)
    tld = _tld_from_host(host_ascii.lower())
    if not (tld and tld in _IANA_TLDS):
        return False

    for rrtype in ("A", "AAAA"):
        try:
            ans = resolver.resolve(host_ascii, rrtype)
            if getattr(ans, "rrset", None):
                return True
        except Exception:
            continue
    return False

def _score_url(url: str) -> float:
    parsed = urlparse(_normalize_url(url))
    host = (parsed.hostname or "")
    host_ascii = _to_ascii_host(host)
    path = parsed.path or ""
    score = 0.0

    has_path = 1 if (path and path != "/") else 0
    score += 3.0 * has_path

    if has_path:
        depth = max(0, path.count("/") - 1)
        score += min(4.0, depth * 0.8)

    if parsed.query:
        score += 0.5
    if parsed.fragment:
        score += 0.5

    length_bonus = min(80, len(url)) * 0.02
    score += length_bonus

    label = host_ascii.split(".")[0] if host_ascii else ""
    if label.lower() in _GENERIC_HOST_TOKENS and not has_path:
        score -= 3.0

    if host_ascii and host_ascii.count(".") < 1:
        score -= 1.0

    host_core = label.lower()
    if 0 < len(host_core) <= 3:
        score -= 2.5

    return score

def _dedupe_and_promote(urls: list[str]) -> list[str]:
    by_host: dict[str, list[str]] = {}
    for u in urls:
        host = _hostname_of(u) or u
        by_host.setdefault(host, []).append(u)

    cleaned: list[str] = []
    for host, group in by_host.items():
        with_path, without_path = [], []
        for u in group:
            p = urlparse(_normalize_url(u))
            if p.path and p.path != "/":
                with_path.append(u)
            else:
                without_path.append(u)
        cleaned.extend(with_path if with_path else without_path)

    scored = [(u, _score_url(u)) for u in set(cleaned)]
    scored.sort(key=lambda x: x[1], reverse=True)
    return [u for (u, _) in scored][:MAX_RETURN]

# ---------- 핵심: EasyOCR로 텍스트 얻고 나머지는 기존 파이프라인 ----------
def extract_valid_urls_from_image(image_content: bytes) -> list[str]:
    # EasyOCR 실행
    img = Image.open(io.BytesIO(image_content)).convert('RGB')
    arr = np.array(img)
    results = _get_reader().readtext(arr, detail=0, paragraph=True)  # 텍스트 블록 리스트
    text_ann = "\n".join(results).strip()

    if not text_ann:
        return []

    # 전처리 및 https 토큰 감지
    full_text = _preclean_text(text_ann)
    prefer_https = _has_https_token(text_ann)

    # 후보 수집 → 복원/검증 → 랭킹
    raw_candidates = [m.group(1) for m in _RELAXED_URL_PATTERN.finditer(full_text)]
    seen, repaired_all = set(), []

    for cand in raw_candidates:
        repaired = _repair_url_candidate(cand, prefer_https=prefer_https)
        if not repaired:
            continue
        key = repaired.lower()
        if key in seen:
            continue

        if ENABLE_DNS_CHECK:
            if not is_valid_domain_or_host(repaired):
                continue
        else:
            host = _hostname_of(repaired) or ""
            tld  = _tld_from_host(_to_ascii_host(host).lower())
            if not (tld and _tld_is_allowed(tld)):
                continue

        seen.add(key)
        repaired_all.append(repaired)

    ranked = _dedupe_and_promote(repaired_all)
    return ranked[:MAX_RETURN]
