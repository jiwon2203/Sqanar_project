# bot/thresholds.py
# -*- coding: utf-8 -*-
from __future__ import annotations
import json, math, argparse, os, time
from typing import Dict, Any, Optional, Tuple, List

import numpy as np
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed

# 피처 만들 때 사용할 함수 (모델 불필요)
from bot.feature_extractor import build_raw_features

# ─────────────────────────────────────────────────────────────────────
# 기본 위험 방향(라벨이 없거나 약할 때 사용) — True: ↑위험, False: ↓위험
RISK_DIR_DEFAULTS: Dict[str, bool] = {
    # WHOIS/도메인
    "domain_age_days": False,   # 작을수록 위험(신생)
    "days_to_expiry":  False,   # 작을수록 위험(임박/지남)

    # URL 구조/문자열
    "url_length": True, "subdomain_count": True,
    "char_ratio": True, "digit_ratio": True,
    "dot_count": True, "hyphen_count": True,
    "slash_count": True, "question_count": True,
    "has_hash": True, "has_at_symbol": True,
    "contains_ip": True, "encoding": True,
    "contains_port": True, "file_extension": True,
    "phishing_keywords": True, "free_domain": True,
    "shortened_url": True, "typosquatting": True,
    "is_punycode": True,

    # 콘텐츠/크롤링
    "extUrlRatio": True, "externalAnchorRatio": True, "invalidAnchorRatio": True,

    # SSL
    "is_https": False,          # 0일수록 위험
    "cert_total_days": False,   # 짧을수록 위험
}
# ─────────────────────────────────────────────────────────────────────

# pandas dtype 안전 변환 유틸
def _to_numeric_series(s: pd.Series) -> pd.Series:
    """bool → int8, object/string → numeric(coerce), 나머지 그대로 numeric 변환"""
    if pd.api.types.is_bool_dtype(s):
        return s.astype("int8")
    if pd.api.types.is_numeric_dtype(s):
        return s
    return pd.to_numeric(s, errors="coerce")

def _to_label_series(y: pd.Series) -> pd.Series:
    """
    라벨이 문자열인 경우도 0/1로 매핑.
    인정: {'1','true','malicious','악성'} → 1, {'0','false','benign','정상'} → 0
    그 외는 숫자로 강제 변환(coerce)
    """
    if pd.api.types.is_numeric_dtype(y):
        return pd.to_numeric(y, errors="coerce")
    y_lower = y.astype(str).str.strip().str.lower()
    pos = {"1","true","malicious","악성","bad","phish","spam"}
    neg = {"0","false","benign","정상","good","ham"}
    mapped = np.where(y_lower.isin(pos), 1,
             np.where(y_lower.isin(neg), 0, np.nan))
    return pd.Series(mapped, index=y.index, dtype="float64")

def _quantiles(x: pd.Series) -> Dict[str, float]:
    xs = _to_numeric_series(x).dropna()
    if xs.empty:
        return {}
    qs = xs.quantile([0.1, 0.25, 0.5, 0.75, 0.9]).to_dict()
    return {"p10": qs.get(0.1), "p25": qs.get(0.25), "p50": qs.get(0.5), "p75": qs.get(0.75), "p90": qs.get(0.9)}

def _point_biserial_direction(x: pd.Series, y: pd.Series) -> Optional[bool]:
    """상관으로 위험 방향 추정 (True=↑위험, False=↓위험), 약하면 None."""
    s = _to_numeric_series(x)
    t = _to_label_series(y)
    m = pd.concat([s, t], axis=1).dropna()
    if m.shape[0] < 100:
        return None
    if m.iloc[:,0].nunique() < 2 or m.iloc[:,1].nunique() < 2:
        return None
    corr = m.iloc[:,0].corr(m.iloc[:,1])
    if pd.isna(corr) or abs(corr) < 0.05:
        return None
    return True if corr > 0 else False

def _supervised_thresholds(x: pd.Series, y: pd.Series, higher_is_risk: bool) -> Tuple[float, float]:
    """
    후보 임계값(분위수) 중 Youden's J = TPR - FPR 최대가 되도록 t_med, t_high 선택.
    """
    xs = _to_numeric_series(x)
    yt = _to_label_series(y)
    m = pd.concat([xs, yt], axis=1).dropna()
    if m.empty:
        return (np.nan, np.nan)

    qs = m.iloc[:,0].quantile([0.25, 0.5, 0.75, 0.9]).values
    if len(qs) == 0:
        return (np.nan, np.nan)

    best_thr, best_J = None, -1.0
    for thr in qs:
        pred = (m.iloc[:,0] >= thr).astype(int) if higher_is_risk else (m.iloc[:,0] <= thr).astype(int)
        y_true = m.iloc[:,1].astype(int)
        tp = ((pred==1)&(y_true==1)).sum(); fn = ((pred==0)&(y_true==1)).sum()
        tn = ((pred==0)&(y_true==0)).sum(); fp = ((pred==1)&(y_true==0)).sum()
        tpr = tp/(tp+fn) if (tp+fn)>0 else 0.0
        fpr = fp/(fp+tn) if (fp+tn)>0 else 0.0
        J = tpr - fpr
        if J > best_J:
            best_thr, best_J = thr, J

    if best_thr is None:
        return (np.nan, np.nan)
    idx = np.where(qs == best_thr)[0]
    t_med = qs[0] if (len(idx)==0 or idx[0]==0) else qs[idx[0]-1]
    t_high = best_thr
    return (float(t_med), float(t_high))

def tune_thresholds(df: pd.DataFrame, label_col: Optional[str]=None, use_supervised: bool=True,
                    ignore_cols: Optional[List[str]]=None,
                    dir_overrides: Optional[Dict[str,bool]]=None) -> Dict[str, Any]:
    """
    df: 피처 테이블 (각 행=URL, 열=피처)
    label_col: 1=악성, 0=정상 (없으면 비지도)
    ignore_cols: 임계값 학습에서 제외할 컬럼들
    dir_overrides: 위험 방향 강제 지정 (ex. {"extUrlRatio": true})
    """
    thresholds: Dict[str, Any] = {}
    ignore_cols = set(ignore_cols or [])
    y = None
    if label_col and label_col in df.columns:
        y = _to_label_series(df[label_col])

    # 사용할 열 후보
    cols = [c for c in df.columns if c not in ignore_cols and c != label_col]

    for col in cols:
        # 문자열 컬럼 스킵
        if pd.api.types.is_object_dtype(df[col]):
            continue

        qs = _quantiles(df[col])
        if not qs:
            continue

        # 방향 결정
        higher_is_risk = RISK_DIR_DEFAULTS.get(col, True)
        if dir_overrides and col in dir_overrides:
            higher_is_risk = bool(dir_overrides[col])
        elif use_supervised and y is not None:
            est = _point_biserial_direction(df[col], y)
            if est is not None:
                higher_is_risk = est

        # 임계값
        if use_supervised and y is not None:
            t_med, t_high = _supervised_thresholds(df[col], y, higher_is_risk)
            if math.isnan(t_high):  # 백업: 분위수
                if higher_is_risk: t_med, t_high = qs["p75"], qs["p90"]
                else:               t_med, t_high = qs["p25"], qs["p10"]
        else:
            if higher_is_risk: t_med, t_high = qs["p75"], qs["p90"]
            else:              t_med, t_high = qs["p25"], qs["p10"]

        thresholds[col] = {
            "direction": "higher_is_risk" if higher_is_risk else "lower_is_risk",
            "t_med": float(t_med) if t_med is not None else None,
            "t_high": float(t_high) if t_high is not None else None,
            "q": qs,
        }
    return thresholds

def save_thresholds(thr: Dict[str, Any], out_path: str):
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(thr, f, ensure_ascii=False, indent=2)

def _extract_row(url: str) -> Optional[Dict[str, Any]]:
    try:
        df = build_raw_features(url)
        return df.iloc[0].to_dict()
    except Exception:
        return None

def build_feature_table(csv_path: str, url_col: str="url", label_col: Optional[str]="label",
                        workers: int=8, cache_features_csv: Optional[str]=None) -> pd.DataFrame:
    src = pd.read_csv(csv_path)
    if url_col not in src.columns:
        raise ValueError(f"CSV에 '{url_col}' 컬럼이 없습니다. (열: {list(src.columns)})")

    urls = src[url_col].astype(str).tolist()
    rows: List[Dict[str, Any]] = []

    # ── 진행률 기록 설정 ─────────────────────────────────────────────
    start_ts = time.time()
    progress_path = os.getenv("THRESH_PROGRESS_PATH", "data/progress.json")
    os.makedirs(os.path.dirname(progress_path), exist_ok=True)
    total = len(urls)
    report_every = int(os.getenv("THRESH_REPORT_EVERY", "20"))  # N개마다 기록/로그

    def write_progress(done: int):
        now = time.time()
        elapsed = now - start_ts
        rate = (done / elapsed) if elapsed > 0 else 0.0
        eta = int((total - done) / rate) if rate > 0 else None
        rec = {
            "done": done,
            "total": total,
            "pct": round((done / total * 100.0), 1) if total else 0.0,
            "elapsed_sec": int(elapsed),
            "rate_per_sec": round(rate, 3),
            "eta_sec": eta,
            "ts": now,
        }
        with open(progress_path, "w", encoding="utf-8") as f:
            json.dump(rec, f, ensure_ascii=False)

    # tqdm 사용 여부 결정 (환경변수)
    use_tqdm = os.getenv("THRESH_TQDM", "0") == "1"
    try:
        from tqdm import tqdm  # type: ignore
    except Exception:
        use_tqdm = False

    # 시작 시 0 기록
    write_progress(0)
    if not use_tqdm:
        print(f"[progress] 0/{total} (0.0%) → {progress_path}", flush=True)

    # ── 병렬 처리 ───────────────────────────────────────────────────
    with ThreadPoolExecutor(max_workers=max(1, workers)) as ex:
        futs = {ex.submit(_extract_row, u): u for u in urls}
        processed = 0

        pbar = None
        if use_tqdm:
            pbar = tqdm(total=total, dynamic_ncols=True)

        for fut in as_completed(futs):
            res = fut.result()
            if res is not None:
                rows.append(res)
            processed += 1

            if use_tqdm:
                pbar.update(1)  # 한 건 완료
                # tqdm 모드에서도 progress.json은 계속 갱신
                if (processed % report_every == 0) or (processed == total):
                    write_progress(processed)
            else:
                if processed % report_every == 0 or processed == total:
                    write_progress(processed)
                    pct = (processed / total * 100.0) if total else 0.0
                    print(f"[progress] {processed}/{total} ({pct:.1f}%)", flush=True)

        if pbar:
            pbar.close()

    # 최종 100%
    write_progress(total)

    feat = pd.DataFrame(rows)

    # label 붙이기 (URL 키로 merge)
    if label_col and label_col in src.columns:
        feat = feat.merge(
            src[[url_col, label_col]],
            left_on="url", right_on=url_col, how="left"
        ).drop(columns=[url_col])

    if cache_features_csv:
        feat.to_csv(cache_features_csv, index=False)
    return feat

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--csv", required=True, help="입력 CSV (url + [label])")
    p.add_argument("--out", default="bot/feature_thresholds.json", help="출력 JSON 경로")
    p.add_argument("--url_col", default="url", help="URL 컬럼명")
    p.add_argument("--label_col", default="label", help="라벨 컬럼명(1=악성,0=정상), 없으면 ''")
    p.add_argument("--unsupervised", action="store_true", help="라벨 있어도 비지도 모드로")
    p.add_argument("--ignore_cols", default="url,domain,Domain,created_date,expiry_date,Registrar,cert_issuer",
                   help="튜닝에서 제외할 컬럼들(콤마 구분)")
    p.add_argument("--workers", type=int, default=8, help="동시 처리 워커 수")
    p.add_argument("--cache_features_csv", default="", help="추출 피처 캐시 CSV 저장 경로(옵션)")
    p.add_argument("--dir_overrides", default="", help="위험 방향 오버라이드 JSON 경로(옵션)")
    args = p.parse_args()

    label_col = args.label_col if args.label_col else None
    ignore_cols = [c.strip() for c in args.ignore_cols.split(",") if c.strip()]
    dir_overrides = None
    if args.dir_overrides and os.path.exists(args.dir_overrides):
        with open(args.dir_overrides, "r", encoding="utf-8") as f:
            raw = json.load(f)
            dir_overrides = {k: bool(v) for k, v in raw.items()}

    print("🛠  URL에서 피처 생성 중...", flush=True)
    feat = build_feature_table(
        args.csv,
        url_col=args.url_col,
        label_col=label_col,
        workers=args.workers,
        cache_features_csv=(args.cache_features_csv or None)
    )
    print(f"✅ 피처 테이블 shape={feat.shape}", flush=True)

    print("🧪 임계값 튜닝 중...", flush=True)
    thr = tune_thresholds(
        feat,
        label_col=label_col,
        use_supervised=not args.unsupervised and (label_col is not None),
        ignore_cols=ignore_cols,
        dir_overrides=dir_overrides
    )
    save_thresholds(thr, args.out)
    print(f"🎯 완료: thresholds → {args.out} (features={len(thr)})", flush=True)

if __name__ == "__main__":
    main()
