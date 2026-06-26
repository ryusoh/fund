#!/usr/bin/env python3
"""Generate weighted average P/E ratio time-series for the portfolio.

Reads daily holdings, historical prices, and earnings data from yfinance.

Methodology (V5):
1. For ETFs: Use `info.trailingPE` or yield proxy.
2. For Stocks:
   - Use `income_stmt` (Annual) and `quarterly_income_stmt` (Quarterly) as "Anchors" (reliable adjusted data).
   - Use `get_earnings_dates()` for deep history.
   - Intelligent Split Detection: Compare reported values against Anchor values to detect and fix Yahoo's inconsistent adjustment history.
   - Interpolate EPS linearly between points.
"""

from __future__ import annotations

import atexit
import concurrent.futures
import json
import math
import os
import re
import shutil
import sys
import tempfile
import urllib.parse
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent))
from typing import Any, Dict, List, Optional, cast

import pandas as pd
import requests
from utils.security_utils import scrub_secrets

try:
    import yfinance as yf

    # Configure yfinance to use a secure, user-specific temporary directory for timezone cache to avoid [Errno 17] in CI and prevent symlink attacks
    cache_dir = tempfile.mkdtemp(prefix="yf-cache-")
    yf.set_tz_cache_location(cache_dir)
    atexit.register(shutil.rmtree, cache_dir, ignore_errors=True)
except ImportError as exc:
    raise SystemExit("yfinance is required. Install with: pip install yfinance") from exc

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
OUTPUT_DIR = DATA_DIR / "output" / "figures"

HOLDINGS_PATH = DATA_DIR / "checkpoints" / "holdings_daily.parquet"
HOLDINGS_DETAILS_PATH = DATA_DIR / "holdings_details.json"
PRICES_JSON_PATH = DATA_DIR / "historical_prices.json"
EPS_CACHE_PATH = DATA_DIR / "checkpoints" / "fetched_eps_cache.json"
MANUAL_PATCH_PATH = DATA_DIR / "manual_eps_patch.json"
SPLIT_HISTORY_PATH = DATA_DIR / "split_history.csv"
BENCHMARK_HISTORY_PATH = DATA_DIR / "benchmark_history.json"

# Tickers classified as ETFs
ETF_TICKERS = frozenset(
    {
        "VT",
        "VTI",
        "VOO",
        "VTSAX",
        "VYM",
        "VEA",
        "VWO",
        "VDC",
        "ICLN",
        "REK",
        "ARKG",
        "IGV",
        "VGT",
        "IHF",
        "XLK",
        "XLF",
        "PSQ",
        "QQQ",
        "SPY",
        "DIA",
        "IVV",
        "SCHD",
        "SCHX",
        "SCHF",
        "JEPI",
        "GLD",
        "RWM",
        "SOXL",
        "SH",
        "SJB",
        "BUG",
        "PTLC",
        "ARKK",
        "ARKW",
        "BNDW",
        "AGG",
        "LQD",
        "TLT",
        "BOXX",
        "IEMG",
        "EFA",
        "EEM",
        "IXUS",
        "ASHR",
        "FXAIX",
        "FZROX",
        "FZILX",
        "FNILX",
        "FNSFX",
        "FBCGX",
        "IAU",
        "SLV",
        "USO",
        "UNG",
        "BITO",
        "ETHE",
        "GBTC",
        "FSGGX",
        "FSKAX",
        "VFIAX",
        "VBTLX",
        "VTIAX",
        "VFFSX",
        "VEMRX",
        "VIEIX",
        "VTMGX",
        "VGSNX",
        "VMVAX",
        "VSIAX",
        "VTPSX",
        "VOX",
        "VHT",
        "VXUS",
        "VIG",
        "VUG",
        "VTV",
        "VB",
        "VO",
        "VNQ",
        "VGK",
        "VPL",
        "VRE",
        "XLE",
        "XLV",
        "XLI",
        "XLB",
        "XLY",
        "XLP",
        "XLU",
        "XLC",
        "TLH",
        "IEF",
        "SHY",
        "BIL",
        "SGOV",
        "SOXX",
    }
)

YFINANCE_ALIASES = {
    "BRKB": "BRK-B",
    "BRK.B": "BRK-B",
    "BRK/B": "BRK-B",
    "BFB": "BF-B",
    "BF.B": "BF-B",
}

# Tickers that are Bonds, Money Market, Inverse, or Commodities (No P/E Intent)
EXEMPT_TICKERS = frozenset(
    {
        "SH",
        "PSQ",
        "SLV",
        "GLD",
        "SJB",
    }
)

# Delisted or acquired stocks that cause yfinance lookups to fail and waste time
DELISTED_TICKERS = frozenset(
    {
        "BKI",
        "CHX",
        "DICE",
        "GD",
        "LLAP",
        "NATI",
        "NYCB",
        "PACW",
        "SBSW",
        "VTLE",
    }
)

# Manual overrides for P/E ratios
MANUAL_TICKER_PE_CURVES = {
    "FSKAX": {
        "2020-12-31": 35.96,
        "2021-12-31": 23.11,
        "2022-12-31": 22.82,
        "2023-12-31": 25.01,
        "2024-12-31": 28.16,
        "2026-01-31": 33.54,
    },
    "FSGGX": {
        "2020-12-31": 18.22,
        "2021-12-31": 18.28,
        "2022-12-31": 12.80,
        "2023-12-31": 14.50,
        "2024-12-31": 16.50,
        "2026-01-31": 18.65,
    },
    "FNSFX": {
        "2020-12-31": 26.5,
        "2021-12-31": 21.8,
        "2022-12-31": 18.5,
        "2023-12-31": 20.3,
        "2024-12-31": 17.80,
        "2026-01-31": 21.97,
    },
    "BNDW": {
        "2020-12-31": 117.6,
        "2021-12-31": 64.5,
        "2022-12-31": 23.7,
        "2023-12-31": 24.2,
        "2024-12-31": 24.5,
        "2026-02-19": 24.2,
    },
    "AGG": {
        "2020-12-31": 163.9,
        "2021-12-31": 76.3,
        "2022-12-31": 22.1,
        "2023-12-31": 24.0,
        "2024-12-31": 24.1,
        "2026-02-19": 24.1,
    },
    "LQD": {
        "2020-12-31": 57.5,
        "2021-12-31": 42.9,
        "2022-12-31": 18.7,
        "2023-12-31": 19.5,
        "2024-12-31": 19.0,
        "2026-02-19": 19.1,
    },
    "TLT": {
        "2020-12-31": 122.0,
        "2021-12-31": 54.6,
        "2022-12-31": 25.1,
        "2023-12-31": 24.7,
        "2024-12-31": 23.0,
        "2026-02-19": 21.3,
    },
    "SGOV": {
        "2020-12-31": 1250.0,
        "2021-12-31": 1250.0,
        "2022-12-31": 24.1,
        "2023-12-31": 18.9,
        "2024-12-31": 22.2,
        "2026-02-19": 27.9,
    },
    "BIL": {
        "2020-12-31": 1250.0,
        "2021-12-31": 1250.0,
        "2022-12-31": 24.1,
        "2023-12-31": 18.9,
        "2024-12-31": 22.2,
        "2026-02-19": 27.9,
    },
    "BOXX": {
        "2020-12-31": 1000.0,
        "2021-12-31": 1000.0,
        "2022-12-31": 23.8,
        "2023-12-31": 18.5,
        "2024-12-31": 20.4,
        "2026-02-19": 19.6,
    },
    "SCHD": {
        "2020-12-31": 15.0,
        "2022-12-31": 12.5,
        "2023-12-31": 14.5,
        "2024-12-31": 15.2,
        "2026-02-19": 16.5,
    },
    "SOXX": {
        "2020-12-31": 35.0,
        "2022-12-31": 22.0,
        "2023-12-31": 28.0,
        "2024-12-31": 32.0,
        "2026-02-19": 35.0,
    },
    # --- Benchmark indices (for PE chart benchmarks) ---
    # S&P 500 trailing PE — source: multpl.com (monthly)
    "^GSPC": {
        "2019-01-01": 19.60,
        "2019-02-01": 20.60,
        "2019-03-01": 20.86,
        "2019-04-01": 21.56,
        "2019-05-01": 21.15,
        "2019-06-01": 21.37,
        "2019-07-01": 22.28,
        "2019-08-01": 21.67,
        "2019-09-01": 22.44,
        "2019-10-01": 22.04,
        "2019-11-01": 22.62,
        "2019-12-01": 22.78,
        "2020-01-01": 24.88,
        "2020-02-01": 26.42,
        "2020-03-01": 22.80,
        "2020-04-01": 24.97,
        "2020-05-01": 27.82,
        "2020-06-01": 31.29,
        "2020-07-01": 32.44,
        "2020-08-01": 34.41,
        "2020-09-01": 34.27,
        "2020-10-01": 35.30,
        "2020-11-01": 37.16,
        "2020-12-01": 39.26,
        "2021-01-01": 35.96,
        "2021-02-01": 33.24,
        "2021-03-01": 30.50,
        "2021-04-01": 29.92,
        "2021-05-01": 28.05,
        "2021-06-01": 26.70,
        "2021-07-01": 26.56,
        "2021-08-01": 26.23,
        "2021-09-01": 25.35,
        "2021-10-01": 24.39,
        "2021-11-01": 24.52,
        "2021-12-01": 23.63,
        "2022-01-01": 23.11,
        "2022-02-01": 22.42,
        "2022-03-01": 22.19,
        "2022-04-01": 22.40,
        "2022-05-01": 20.81,
        "2022-06-01": 20.28,
        "2022-07-01": 20.53,
        "2022-08-01": 22.03,
        "2022-09-01": 20.58,
        "2022-10-01": 20.44,
        "2022-11-01": 22.07,
        "2022-12-01": 22.65,
        "2023-01-01": 22.82,
        "2023-02-01": 23.40,
        "2023-03-01": 22.66,
        "2023-04-01": 23.27,
        "2023-05-01": 23.15,
        "2023-06-01": 24.01,
        "2023-07-01": 24.76,
        "2023-08-01": 24.16,
        "2023-09-01": 23.93,
        "2023-10-01": 22.78,
        "2023-11-01": 23.51,
        "2023-12-01": 24.35,
        "2024-01-01": 25.01,
        "2024-02-01": 26.14,
        "2024-03-01": 27.02,
        "2024-04-01": 26.41,
        "2024-05-01": 26.93,
        "2024-06-01": 27.64,
        "2024-07-01": 28.08,
        "2024-08-01": 27.67,
        "2024-09-01": 28.09,
        "2024-10-01": 28.45,
        "2024-11-01": 28.66,
        "2024-12-01": 28.60,
        "2025-01-01": 28.16,
        "2025-02-01": 28.15,
        "2025-03-01": 26.23,
        "2025-04-01": 24.56,
        "2025-05-01": 26.34,
        "2025-06-01": 27.10,
        "2025-07-01": 27.81,
        "2025-08-01": 27.84,
        "2025-09-01": 28.13,
        "2025-10-01": 28.78,
        "2025-11-01": 28.80,
        "2025-12-01": 29.28,
        "2026-01-01": 29.60,
        "2026-02-01": 29.55,
    },
}

# Benchmark tickers to include as separate PE series.
# Each maps to an ETF proxy for fetching current trailing PE (since Yahoo
# returns None for raw index PE).
BENCHMARK_PE_TICKERS: Dict[str, str] = {
    "^GSPC": "SPY",
}

FX_CACHE: Dict[str, pd.Series] = {}


def is_etf(ticker: str) -> bool:
    normalized = ticker.strip().upper()
    if normalized in ETF_TICKERS:
        return True
    if len(normalized) > 4 and normalized.endswith("X"):
        return True
    return False


def yf_symbol(ticker: str) -> str:
    normalized = ticker.strip().upper().replace(".", "").replace("/", "")
    return YFINANCE_ALIASES.get(normalized, ticker)


def get_fx_history(pair: str) -> Optional[pd.Series]:
    if pair in FX_CACHE:
        return FX_CACHE[pair]
    try:
        hist = yf.Ticker(pair).history(period="5y")
        if not hist.empty and "Close" in hist.columns:
            series = hist["Close"]
            series.index = series.index.normalize().tz_localize(None)
            FX_CACHE[pair] = series
            return cast(pd.Series, series)
    except Exception as exc:
        print(f"    Warning: Failed to fetch FX {pair}: {exc}")
    return None


def get_closest_fx(fx_series: pd.Series, date: pd.Timestamp) -> float:
    try:
        idx = fx_series.index.get_indexer([date], method="pad")[0]
        if idx != -1:
            return float(fx_series.iloc[idx])
        idx = fx_series.index.get_indexer([date], method="bfill")[0]
        if idx != -1:
            return float(fx_series.iloc[idx])
    except Exception as e:
        print(f"Warning: Exception fetching closest FX rate: {e}", file=sys.stderr)
    return 1.0


def load_eps_cache() -> Dict[str, Any]:
    if EPS_CACHE_PATH.exists():
        try:
            with open(EPS_CACHE_PATH, "r") as f:
                return cast(Dict[str, Any], json.load(f))
        except Exception as e:
            print(f"Error loading EPS cache: {e}")
    return {}


def save_eps_cache(cache: Dict[str, Any]):
    try:
        EPS_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(EPS_CACHE_PATH, "w") as f:
            json.dump(cache, f, indent=4)
    except Exception as e:
        print(f"Error saving EPS cache: {e}")


def load_manual_patch() -> Dict[str, Dict[str, float]]:
    if MANUAL_PATCH_PATH.exists():
        try:
            with open(MANUAL_PATCH_PATH, "r") as f:
                return cast(Dict[str, Dict[str, float]], json.load(f))
        except Exception as e:
            print(f"Error loading manual patch: {e}")
    return {}


def load_split_history() -> pd.DataFrame:
    if SPLIT_HISTORY_PATH.exists():
        try:
            df = pd.read_csv(SPLIT_HISTORY_PATH)
            df["Split Date"] = pd.to_datetime(df["Split Date"])
            return df
        except Exception as e:
            print(f"Error loading split history: {e}")
    return pd.DataFrame()


def get_split_adjustment(symbol: str, date: pd.Timestamp, split_df: pd.DataFrame) -> float:
    if split_df.empty:
        return 1.0
    relevant = split_df[(split_df["Symbol"] == symbol) & (split_df["Split Date"] > date)]
    if relevant.empty:
        return 1.0
    total_multiplier = relevant["Split Multiplier"].prod()
    return 1.0 / float(total_multiplier)  # type: ignore[arg-type]


def cumulative_forward_split_factor(date: pd.Timestamp, splits_series: pd.Series) -> float:
    """Compute how many shares today correspond to 1 share on the given date.

    This accounts for all stock splits AFTER the given date.
    To normalize EPS reported on `date` to today's fully-split-adjusted basis,
    divide by this factor.
    """
    factor = 1.0
    if splits_series is None or splits_series.empty:
        return factor
    for split_date, ratio in splits_series.items():
        sd = pd.Timestamp(str(split_date)).tz_localize(None)
        if sd > date:
            factor *= ratio
    return factor


def fetch_stock_eps_data(tickers: List[str]) -> Dict[str, Any]:
    """Fetch EPS data for stocks with caching and manual patches.

    Strategy:
    1. income_stmt (annual) → Already fully split-adjusted by Yahoo. Use directly.
    2. quarterly_income_stmt → Already fully split-adjusted. Use for recent quarters.
    3. get_earnings_dates() → NOT consistently split-adjusted! Yahoo reports EPS
       in the split basis at the time of reporting. We must divide each value
       by cumulative_forward_split_factor() to normalize to today's basis.
    """
    cache = load_eps_cache()
    manual_patch = load_manual_patch()

    from typing import Tuple

    def fetch_single_stock_eps(t: str) -> Tuple[str, Optional[Dict[str, Any]]]:
        symbol = yf_symbol(t)
        try:
            stock = yf.Ticker(symbol)
            # Try to get info safely
            info = {}
            try:
                info = stock.info
                if info is None:
                    info = {}
            except Exception as e:
                print(f"Warning: Exception fetching info for stock {symbol}: {e}", file=sys.stderr)

            current_ttm = info.get("trailingEps")
            currency = info.get("currency", "USD")
            fin_curr = info.get("financialCurrency", currency) or currency

            result_entry = {
                "points": {},
                "current_ttm": current_ttm,
                "currency": currency,
            }

            fx_series = None
            if currency != fin_curr:
                pair = f"{fin_curr}{currency}=X"
                fx_series = get_fx_history(pair)

            # Fetch the yfinance splits series for this ticker
            try:
                yf_splits = stock.splits
                if yf_splits is None or yf_splits.empty:
                    yf_splits = pd.Series(dtype=float)
            except Exception as e:
                print(f"Warning: Exception fetching splits for {symbol}: {e}", file=sys.stderr)
                yf_splits = pd.Series(dtype=float)

            def add_point(
                d_str: str,
                val: float,
                current_fx_series: Optional[pd.Series],
                current_currency: str,
                current_fin_curr: str,
            ):
                """Add a single EPS data point to result, applying FX if needed."""
                if current_fx_series is not None:
                    rate = get_closest_fx(current_fx_series, pd.Timestamp(d_str))
                    val *= rate
                elif current_currency == "GBP" and current_fin_curr == "GBp":
                    val /= 100.0
                result_entry["points"][d_str] = val

            # 1. Annual income_stmt → fully split-adjusted, use directly
            try:
                annual = stock.income_stmt
            except Exception as e:
                print(
                    f"Warning: Exception fetching annual income statement for {symbol}: {e}",
                    file=sys.stderr,
                )
                annual = pd.DataFrame()

            if annual is not None and not annual.empty and "Basic EPS" in annual.index:
                for d_val, v in annual.loc["Basic EPS"].items():
                    if pd.notna(v):
                        add_point(
                            pd.Timestamp(d_val).strftime("%Y-%m-%d"),
                            float(v),
                            fx_series,
                            currency,
                            fin_curr,
                        )

            # 2. Quarterly income_stmt → fully split-adjusted, build TTM
            try:
                quarterly = stock.quarterly_income_stmt
            except Exception as e:
                print(
                    f"Warning: Exception fetching quarterly income statement for {symbol}: {e}",
                    file=sys.stderr,
                )
                quarterly = pd.DataFrame()

            quarterly_anchors = {}
            if quarterly is not None and not quarterly.empty and "Basic EPS" in quarterly.index:
                q_series = quarterly.loc["Basic EPS"].dropna().sort_index()
                for d_val, v in q_series.items():
                    d_ts = pd.to_datetime(d_val).normalize().tz_localize(None)
                    quarterly_anchors[d_ts] = float(v)
                if len(q_series) >= 4:
                    q_ttm = q_series.rolling(4).sum().dropna()
                    for d_val, ttm_v in q_ttm.items():
                        add_point(
                            pd.Timestamp(d_val).strftime("%Y-%m-%d"),
                            float(ttm_v),
                            fx_series,
                            currency,
                            fin_curr,
                        )

            # 3. get_earnings_dates() → REQUIRES split normalization
            try:
                ed = stock.get_earnings_dates(limit=40)
                if ed is not None and not ed.empty and "Reported EPS" in ed.columns:
                    q_eps_raw = ed["Reported EPS"].dropna().sort_index()
                    q_eps_raw.index = q_eps_raw.index.normalize().tz_localize(None)
                    q_eps_raw = q_eps_raw.groupby(q_eps_raw.index).last()

                    calibration_factor = 1.0
                    if (
                        annual is not None
                        and not annual.empty
                        and "Basic EPS" in annual.index
                        and len(q_eps_raw) >= 4
                    ):
                        annual_eps = annual.loc["Basic EPS"].dropna().sort_index()
                        for ann_date, ann_val in annual_eps.items():
                            if pd.isna(ann_val) or ann_val == 0:
                                continue
                            ann_ts = pd.to_datetime(ann_date).normalize().tz_localize(None)
                            mask = (q_eps_raw.index <= ann_ts) & (
                                q_eps_raw.index > ann_ts - pd.Timedelta(days=400)
                            )
                            matching_qs = q_eps_raw[mask]
                            if len(matching_qs) >= 4:
                                q_sum = matching_qs.iloc[-4:].sum()
                                if q_sum != 0:
                                    ratio = q_sum / float(ann_val)
                                    if ratio > 1.5:
                                        calibration_factor = round(ratio)
                                        break

                    q_eps_normalized = []
                    for d, v in q_eps_raw.items():
                        if d in quarterly_anchors:
                            q_eps_normalized.append(quarterly_anchors[d])
                            continue

                        if not yf_splits.empty:
                            last_split_date = pd.Timestamp(yf_splits.index[-1]).tz_localize(None)
                            if d >= last_split_date:
                                q_eps_normalized.append(v)
                                continue

                        normalized = v / calibration_factor
                        q_eps_normalized.append(normalized)

                    q_eps_series = pd.Series(q_eps_normalized, index=q_eps_raw.index)
                    if len(q_eps_series) >= 4:
                        q_ttm = q_eps_series.rolling(4).sum().dropna()
                        for d_val, ttm_v in q_ttm.items():
                            add_point(
                                pd.Timestamp(str(d_val)).strftime("%Y-%m-%d"),
                                float(ttm_v),
                                fx_series,
                                currency,
                                fin_curr,
                            )
            except Exception as e:
                if "NoneType" not in str(e):
                    print(f"Warning: Quarterly fetch failed for {symbol}: {e}")
            return (t, result_entry)
        except Exception as e:
            if "NoneType" not in str(e):
                print(f"Warning: Error fetching {symbol}: {e}")
            return (t, None)

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        future_to_ticker = {executor.submit(fetch_single_stock_eps, t): t for t in tickers}
        for future in concurrent.futures.as_completed(future_to_ticker):
            result = future.result()
            if result:
                t, entry = result
                if entry is not None:
                    # Update cache with the new entry
                    if t not in cache:
                        cache[t] = {}
                    cache[t]["points"] = entry["points"]
                    cache[t]["current_ttm"] = entry["current_ttm"]
                    cache[t]["currency"] = entry["currency"]

    save_eps_cache(cache)
    results = {}
    for t in tickers:
        base = cache.get(t, {"points": {}, "current_ttm": None, "currency": "USD"})
        points_map = base.get("points", {}).copy()
        if t in manual_patch:
            points_map.update(manual_patch[t])
        if not points_map:
            continue
        points_list = [{"date": pd.Timestamp(d), "eps": v} for d, v in points_map.items()]
        points_list.sort(key=lambda x: x["date"])
        results[t] = {
            "points": points_list,
            "current_ttm": base.get("current_ttm"),
            "currency": base.get("currency", "USD"),
        }
    return results


def compute_benchmark_pe_from_proxy(
    prices: pd.Series,
    eps_points: List[Dict],
    dates: pd.DatetimeIndex,
    manual_anchors: Optional[Dict[str, float]] = None,
) -> Optional[pd.Series]:
    """Compute daily benchmark PE from proxy ETF prices and EPS data.

    Instead of interpolating sparse monthly PE anchors (which loses daily
    granularity), this derives PE = price / interpolated_TTM_EPS for each day.

    Args:
        prices: Daily price series for the proxy ETF (e.g. SPY), indexed by date.
        eps_points: List of {"date": Timestamp, "eps": float} EPS anchor points.
        dates: DatetimeIndex of all dates to produce PE for.
        manual_anchors: Optional dict of date_str → PE for dates without price data.

    Returns:
        pd.Series of daily PE values, or None if no data available.
    """
    result = pd.Series(index=dates, dtype=float)
    prices_aligned = prices.reindex(dates).ffill()

    # 1. Build EPS series — from explicit eps_points, or derived from anchors + prices
    known_eps = {}
    if eps_points:
        for p in eps_points:
            if p["eps"] is not None and p["eps"] > 0:
                known_eps[p["date"]] = p["eps"]

    # Derive EPS from manual PE anchors: implied_EPS = price / anchor_PE
    if manual_anchors and not known_eps:
        for date_str, pe_val in manual_anchors.items():
            if pe_val is None or pe_val <= 0:
                continue
            ts = pd.Timestamp(date_str).tz_localize(None)
            # Find price at anchor date
            price_at_anchor = None
            if ts in prices_aligned.index and pd.notna(prices_aligned.loc[ts]):
                price_at_anchor = float(prices_aligned.loc[ts])
            elif len(prices_aligned.dropna()) > 0:
                idx = prices_aligned.index.get_indexer([ts], method="nearest")[0]
                if idx != -1 and pd.notna(prices_aligned.iloc[idx]):
                    price_at_anchor = float(prices_aligned.iloc[idx])
            if price_at_anchor and price_at_anchor > 0:
                known_eps[ts] = price_at_anchor / pe_val

    has_eps = bool(known_eps)

    if has_eps:
        eps_series = pd.Series(known_eps).sort_index()
        eps_series = eps_series[~eps_series.index.duplicated(keep="last")]
        full_eps = eps_series.reindex(eps_series.index.union(dates))
        full_eps = full_eps.interpolate(method="time").ffill().bfill()
        eps_daily = full_eps.reindex(dates)
    else:
        eps_daily = pd.Series(dtype=float, index=dates)

    # 2. Compute PE = price / EPS for dates with valid price and EPS
    if has_eps:
        valid_mask = (
            prices_aligned.notna() & (prices_aligned > 0) & eps_daily.notna() & (eps_daily > 0)
        )
        result[valid_mask] = prices_aligned[valid_mask] / eps_daily[valid_mask]

    # 3. Fill gaps from manual anchors (for dates without price data)
    if manual_anchors:
        for date_str, pe_val in manual_anchors.items():
            ts = pd.Timestamp(date_str).tz_localize(None)
            if ts in dates:
                if pd.isna(result.loc[ts]):
                    result.loc[ts] = pe_val  # type: ignore[call-overload]
            else:
                idx = dates.get_indexer([ts], method="nearest")[0]
                if idx != -1 and pd.isna(result.iloc[idx]):
                    result.iloc[idx] = pe_val

    # 4. Interpolate remaining gaps and forward/back fill edges
    if result.notna().sum() == 0:
        return None

    result = result.interpolate(method="time").ffill().bfill()
    return result


def fetch_benchmark_pe_daily(
    proxy_ticker: str,
    dates: pd.DatetimeIndex,
    manual_anchors: Optional[Dict[str, float]] = None,
) -> Optional[pd.Series]:
    """Fetch daily PE for a benchmark index via its ETF proxy.

    Uses the proxy's price history and trailing EPS to compute daily PE,
    giving true daily granularity instead of interpolated monthly anchors.

    Args:
        proxy_ticker: ETF ticker to use as proxy (e.g. "SPY" for ^GSPC).
        dates: DatetimeIndex of all dates to produce PE for.
        manual_anchors: Optional dict of date_str → PE for fallback.

    Returns:
        pd.Series of daily PE values, or None on failure.
    """
    try:
        stock = yf.Ticker(proxy_ticker)
        info = stock.info or {}

        # Get trailing EPS from info
        trailing_eps = info.get("trailingEps")

        # Build EPS points from financial statements
        eps_points: List[Dict] = []

        try:
            annual = stock.income_stmt
            if annual is not None and not annual.empty and "Basic EPS" in annual.index:
                for d_val, v in annual.loc["Basic EPS"].items():
                    if pd.notna(v) and v > 0:
                        eps_points.append(
                            {
                                "date": pd.Timestamp(d_val).tz_localize(None),
                                "eps": float(v),
                            }
                        )
        except Exception as e:
            print(f"Warning: Failed to fetch annual EPS for {proxy_ticker}: {e}")

        try:
            quarterly = stock.quarterly_income_stmt
            if quarterly is not None and not quarterly.empty and "Basic EPS" in quarterly.index:
                q_series = quarterly.loc["Basic EPS"].dropna().sort_index()
                if len(q_series) >= 4:
                    q_ttm = q_series.rolling(4).sum().dropna()
                    for d_val, ttm_v in q_ttm.items():
                        if ttm_v > 0:
                            eps_points.append(
                                {
                                    "date": pd.Timestamp(d_val).tz_localize(None),
                                    "eps": float(ttm_v),
                                }
                            )
        except Exception as e:
            print(f"Warning: Failed to fetch quarterly EPS for {proxy_ticker}: {e}")

        # Add current trailing EPS as today's anchor
        if trailing_eps and trailing_eps > 0:
            eps_points.append(
                {
                    "date": pd.Timestamp.now().normalize(),
                    "eps": float(trailing_eps),
                }
            )

        # Fetch price history
        start_date = dates[0] - pd.Timedelta(days=7)
        end_date = dates[-1] + pd.Timedelta(days=1)
        try:
            hist = stock.history(start=start_date, end=end_date)
            if hist is not None and not hist.empty and "Close" in hist.columns:
                prices = hist["Close"]
                prices.index = prices.index.normalize().tz_localize(None)
            else:
                prices = pd.Series(dtype=float)
        except Exception:
            prices = pd.Series(dtype=float)

        # For ETF proxies: if no EPS data but trailingPE is available,
        # add today's PE as a manual anchor so EPS can be derived from price/PE
        if not eps_points:
            trailing_pe = info.get("trailingPE")
            if trailing_pe and math.isfinite(trailing_pe) and trailing_pe > 0:
                today_str = pd.Timestamp.now().normalize().strftime("%Y-%m-%d")
                if manual_anchors is None:
                    manual_anchors = {}
                else:
                    manual_anchors = dict(manual_anchors)
                manual_anchors[today_str] = float(trailing_pe)

        return compute_benchmark_pe_from_proxy(
            prices, eps_points, dates, manual_anchors=manual_anchors
        )

    except Exception as e:
        print(f"Warning: fetch_benchmark_pe_daily({proxy_ticker}) failed: {e}")
        if manual_anchors:
            return compute_benchmark_pe_from_proxy(
                pd.Series(dtype=float), [], dates, manual_anchors=manual_anchors
            )
        return None


def fetch_etf_pe(ticker: str, dates: pd.DatetimeIndex) -> Optional[pd.Series]:
    symbol = yf_symbol(ticker)
    if ticker in MANUAL_TICKER_PE_CURVES:
        points = MANUAL_TICKER_PE_CURVES[ticker].copy()  # Copy to avoid mutating global constant

        # Auto-append current PE for benchmarks to history file
        if ticker in BENCHMARK_PE_TICKERS:
            proxy = BENCHMARK_PE_TICKERS[ticker]
            try:
                # Load existing history
                history = {}
                if BENCHMARK_HISTORY_PATH.exists():
                    with open(BENCHMARK_HISTORY_PATH, "r") as f:
                        try:
                            history = json.load(f)
                        except json.JSONDecodeError:
                            history = {}

                # Fetch current proxy PE
                info = yf.Ticker(proxy).info
                current_pe = info.get("trailingPE") if info else None

                if current_pe and current_pe > 0:
                    today_str = datetime.now().strftime("%Y-%m-%d")
                    if ticker not in history:
                        history[ticker] = {}

                    # Update history
                    history[ticker][today_str] = float(current_pe)

                    # Save updated history
                    with open(BENCHMARK_HISTORY_PATH, "w") as f:
                        json.dump(history, f, indent=4, sort_keys=True)

                    print(f"  Updated history for {ticker}: {today_str}={current_pe}")

                # Merge history into points (live data overrides manual if duplicate date)
                if ticker in history:
                    points.update(history[ticker])

            except Exception as e:
                print(f"Warning: Failed to update benchmark history for {ticker}: {e}")

        s = pd.Series(index=dates, dtype=float)
        # Convert keys to timestamps and sort
        ts_points = {pd.Timestamp(k).tz_localize(None): v for k, v in points.items()}

        for dt, val in ts_points.items():
            if dt in dates:
                s.loc[dt] = float(val)  # type: ignore[call-overload]
            else:
                # Map to nearest date in index
                idx = dates.get_indexer([dt], method="nearest")[0]
                if idx != -1:
                    s.iloc[idx] = val

        return s.interpolate(method="time").ffill().bfill()

    try:
        t_obj = yf.Ticker(symbol)
        # Some yf versions return None for .info on failure
        info = t_obj.info
        if info is None:
            return None
        pe = info.get("trailingPE")
        if pe is not None and math.isfinite(pe) and pe > 0:
            return pd.Series(float(pe), index=dates)
    except Exception as e:
        print(
            f"Warning: Exception fetching fallback trailing PE for ETF {ticker}: {e}",
            file=sys.stderr,
        )
    return None


def interpolate_eps_series(stock_data: Dict, date_index: pd.DatetimeIndex) -> pd.Series[Any]:
    points = stock_data["points"]
    current_ttm = stock_data["current_ttm"]
    known_data = {p["date"]: p["eps"] for p in points}
    today = pd.Timestamp.now().normalize()
    if current_ttm is not None:
        known_data[today] = current_ttm
    elif points:
        known_data[today] = points[-1]["eps"]
    if not known_data:
        return pd.Series(dtype=float).reindex(date_index)
    s_points = pd.Series(known_data).sort_index()
    s_points = s_points[~s_points.index.duplicated(keep='last')]
    full_series = s_points.reindex(s_points.index.union(date_index))
    interpolated = full_series.interpolate(method='time')
    return interpolated.reindex(date_index).ffill().bfill()  # type: ignore[no-any-return]


def load_data():
    if not HOLDINGS_PATH.exists():
        raise FileNotFoundError(f"Holdings not found: {HOLDINGS_PATH}")
    holdings_df = pd.read_parquet(HOLDINGS_PATH)
    if not PRICES_JSON_PATH.exists():
        raise FileNotFoundError(f"Prices not found: {PRICES_JSON_PATH}")
    with open(PRICES_JSON_PATH, "r") as f:
        prices_data = json.load(f)
    return holdings_df, prices_data


def calculate_harmonic_pe(mv_map: Dict[str, float], pe_map: Dict[str, float]) -> Optional[float]:
    total_mv = sum(mv_map.values())
    if total_mv <= 0:
        return None
    weighted_yield = 0.0
    weight_sum = 0.0
    for t, mv in mv_map.items():
        pe_val = pe_map.get(t)
        if pe_val is not None and pe_val > 0:
            w = mv / total_mv
            weighted_yield += w * (1.0 / pe_val)
            weight_sum += w
    if weight_sum > 0 and weighted_yield > 0:
        return 1.0 / (weighted_yield / weight_sum)
    return None


def fetch_forward_pe() -> Optional[Dict[str, Any]]:
    """Fetch forward PE for current holdings and compute portfolio forward PE.

    Reads current holdings from holdings_details.json, fetches forwardPE from
    Yahoo for each stock/ETF, and computes a weighted harmonic mean.
    Returns a dict with target_date, portfolio_forward_pe, and per-ticker values.
    """
    if not HOLDINGS_DETAILS_PATH.exists():
        print("Warning: holdings_details.json not found, skipping forward PE")
        return None

    with open(HOLDINGS_DETAILS_PATH) as f:
        holdings = json.load(f)

    if not holdings:
        return None

    # Fetch current prices and forward PE for each holding
    mv_map: Dict[str, float] = {}
    fwd_pe_map: Dict[str, float] = {}
    ticker_fwd_pe: Dict[str, float] = {}

    # Scrape MSCI data once, share across threads
    msci_data = scrape_msci_pe_data()

    def fetch_single_forward_pe(ticker: str, details: dict) -> Optional[dict]:
        shares = float(details.get("shares", 0))
        if shares <= 0:
            return None

        symbol = yf_symbol(ticker)
        try:
            stock = yf.Ticker(symbol)
            info = stock.info
            if info is None:
                return None

            price = info.get("currentPrice") or info.get("regularMarketPrice")
            fwd_pe = info.get("forwardPE")

            if ticker == "VT":
                # For VT, prefer MSCI-derived forward PE over yfinance
                if msci_data and "forward_pe" in msci_data:
                    fwd_pe = msci_data["forward_pe"]
                    print(f"    VT: Using Forward PE {fwd_pe} from MSCI")
                elif not fwd_pe or not math.isfinite(fwd_pe) or fwd_pe <= 0:
                    msci_pe = scrape_msci_forward_pe()
                    if msci_pe:
                        fwd_pe = msci_pe
                        print(f"    VT: Fetched Forward PE {fwd_pe} from MSCI proxy (fallback)")

            return {"ticker": ticker, "shares": shares, "price": price, "fwd_pe": fwd_pe}
        except Exception as e:
            print(f"Warning: Exception computing forward PE for {ticker}: {e}", file=sys.stderr)
            return None

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        future_to_ticker = {
            executor.submit(fetch_single_forward_pe, t, det): t for t, det in holdings.items()
        }
        for future in concurrent.futures.as_completed(future_to_ticker):
            fetch_result = future.result()
            if fetch_result:
                ticker = fetch_result["ticker"]
                shares = fetch_result["shares"]
                price = fetch_result["price"]
                fwd_pe = fetch_result["fwd_pe"]

                if price and price > 0:
                    mv_map[ticker] = shares * price

                if fwd_pe and math.isfinite(fwd_pe) and fwd_pe > 0:
                    fwd_pe_map[ticker] = fwd_pe
                    ticker_fwd_pe[ticker] = round(fwd_pe, 2)

    if not fwd_pe_map:
        return None

    portfolio_fwd_pe = calculate_harmonic_pe(mv_map, fwd_pe_map)
    if portfolio_fwd_pe is None:
        return None

    # Target date: 12 months from today (NTM convention)
    target_date = (datetime.now() + timedelta(days=365)).strftime("%Y-%m-%d")

    result: Dict[str, Any] = {
        "target_date": target_date,
        "portfolio_forward_pe": round(portfolio_fwd_pe, 2),
        "ticker_forward_pe": ticker_fwd_pe,
    }

    # Store MSCI PE ratio for frontend daily derivation. Stamp last_updated so a
    # carried-forward (stale) ratio from a broken scrape can be detected later.
    if msci_data and "ratio" in msci_data:
        result["msci_pe_ratio"] = {
            "trailing_pe": float(msci_data["trailing_pe"]),
            "forward_pe": float(msci_data["forward_pe"]),
            "ratio": float(msci_data["ratio"]),
            "last_updated": datetime.now().strftime("%Y-%m-%d"),
        }
        print(
            f"  MSCI PE Ratio: trailing={msci_data['trailing_pe']}, "
            f"fwd={msci_data['forward_pe']}, ratio={msci_data['ratio']:.4f}"
        )

    return result


# How many days a carried-forward MSCI ratio may age before it's flagged as stale.
MSCI_RATIO_STALE_DAYS = 7


def msci_ratio_age_days(msci_ratio: Any, today: Optional[date] = None) -> Optional[int]:
    """Days since ``msci_pe_ratio`` was last freshly scraped.

    Returns ``None`` when the age is unknown (no/invalid ``last_updated`` stamp,
    or a non-dict input) so callers never crash on legacy data.
    """
    if not isinstance(msci_ratio, dict):
        return None
    stamp = msci_ratio.get("last_updated")
    try:
        last = datetime.strptime(str(stamp), "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None
    return ((today or datetime.now().date()) - last).days


def warn_if_msci_ratio_stale(
    forward_pe: Optional[Dict[str, Any]], today: Optional[date] = None
) -> None:
    """Surface a prolonged MSCI outage instead of silently aging the ratio.

    The fail-open carry-forward keeps VT's forward P/E on screen, but if the
    scrape stays broken the value drifts further from reality with no signal.
    Log a warning once it crosses ``MSCI_RATIO_STALE_DAYS``.
    """
    if not isinstance(forward_pe, dict):
        return
    msci_ratio = forward_pe.get("msci_pe_ratio")
    age = msci_ratio_age_days(msci_ratio, today=today)
    if isinstance(msci_ratio, dict) and age is not None and age >= MSCI_RATIO_STALE_DAYS:
        print(
            f"  WARNING: msci_pe_ratio is stale — {age} days since last fresh scrape "
            f"(last_updated {msci_ratio.get('last_updated')}). The MSCI scrape may be "
            "broken; VT's forward P/E is increasingly out of date."
        )


def carry_forward_msci_pe_ratio(
    forward_pe: Optional[Dict[str, Any]], existing_pe_data: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    """Fail-open for the MSCI P/E ratio (flaky HTML scrape).

    VT (and other index ETFs without a yfinance forward estimate) get their
    forward P/E derived on the frontend as ``trailing_PE / msci_pe_ratio.ratio``.
    When ``scrape_msci_pe_data`` fails, a fresh ``forward_pe`` block is still
    produced for the other tickers but simply omits ``msci_pe_ratio`` — which
    would overwrite the last good value with nothing and make VT's forward P/E
    vanish from the table. Reuse the previous ratio in that case.
    """
    if not isinstance(forward_pe, dict) or forward_pe.get("msci_pe_ratio"):
        return forward_pe
    prev_ratio = (existing_pe_data or {}).get("forward_pe", {}).get("msci_pe_ratio")
    if prev_ratio:
        forward_pe["msci_pe_ratio"] = prev_ratio
        print("  MSCI scrape missing; carried forward last known msci_pe_ratio.")
    return forward_pe


def apply_fail_open_backstop(
    final_output: Dict[str, Any], existing_pe_data: Optional[Dict[str, Any]]
) -> Dict[str, Any]:
    """Final fail-open net before writing pe_ratio.json.

    Per-field fallbacks above handle the known-fragile fetches, but any top-level
    block a run fails to produce (missing key, or an empty ``{}``/``[]``) would
    otherwise overwrite good history with nothing and blank that part of the
    dashboard. For every key the previous file had, restore the old value when
    this run produced nothing for it. Keys with fresh data are never touched.
    """
    if not isinstance(existing_pe_data, dict):
        return final_output

    def is_empty(value: Any) -> bool:
        return value is None or value == {} or value == []

    for key, prev in existing_pe_data.items():
        if is_empty(prev):
            continue
        if is_empty(final_output.get(key)):
            final_output[key] = prev
            print(f"  Fail-open: restored '{key}' from previous pe_ratio.json (no fresh data).")
    return final_output


def scrape_msci_pe_data() -> Optional[Dict[str, float]]:
    """Scrape both trailing P/E and forward P/E from MSCI World Index page.

    Returns a dict with trailing_pe, forward_pe, and ratio (trailing/forward).
    The ratio enables daily forward PE derivation on the frontend:
        fwd_PE_daily = trailing_PE_daily / ratio
    """
    try:
        url = "https://www.msci.com/indexes/index/990100"
        headers = {
            "User-Agent": "Mozilla/5.0 AppleWebKit/537.36",
            "Accept": "text/html",
        }
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        content = response.text

        result: Dict[str, float] = {}

        # Extract forward PE (labeled "P/E Fwd")
        fwd_match = re.search(
            r"P/E Fwd.{0,200}?([0-9]+\.[0-9]+)", content, re.IGNORECASE | re.DOTALL
        )
        if fwd_match:
            result["forward_pe"] = float(fwd_match.group(1))

        # Extract trailing PE (labeled "P/E" but NOT "P/E Fwd")
        # Use negative lookahead to avoid matching "P/E Fwd"
        trailing_match = re.search(
            r"P/E(?!\s*Fwd).{0,200}?([0-9]+\.[0-9]+)", content, re.IGNORECASE | re.DOTALL
        )
        if trailing_match:
            result["trailing_pe"] = float(trailing_match.group(1))

        if "trailing_pe" in result and "forward_pe" in result and result["forward_pe"] > 0:
            result["ratio"] = round(result["trailing_pe"] / result["forward_pe"], 4)

        if result:
            return result
    except Exception as e:
        print(f"MSCI scrape failed: {e}")
    return None


def scrape_msci_forward_pe() -> Optional[float]:
    """Scrape Forward P/E for VT from MSCI ACWI Index factsheet.

    Thin wrapper around scrape_msci_pe_data() for backward compatibility.
    """
    data = scrape_msci_pe_data()
    if data and "forward_pe" in data:
        return data["forward_pe"]
    return None


def scrape_wsj_forward_pe() -> Optional[float]:
    """Scrape S&P 500 Forward P/E Estimate from WSJ Market Data."""
    target_url = "https://www.wsj.com/market-data/stocks/peyields"
    scraper_api_key = os.environ.get("SCRAPER_API_KEY")

    try:
        if scraper_api_key:
            payload = {
                'api_key': scraper_api_key,
                'url': target_url,
                'premium': 'true',
                'country_code': 'us',
            }
            # Security fix: use HTTPS to prevent insecure transmission of API keys
            url = 'https://api.scraperapi.com/?' + urllib.parse.urlencode(payload)
        else:
            url = target_url

        headers = {
            "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        response = requests.get(url, headers=headers, timeout=20)
        response.raise_for_status()
        content = response.text

        block_starts = [m.start() for m in re.finditer(r"P 500 Index", content)]
        if not block_starts:
            print(f"WSJ scrape failed: 'P 500 Index' not found. Snippet: {content[:200]}")
            return None

        for start in block_starts:
            chunk = content[start : start + 500]
            pe_match = re.search(
                r"priceEarningsRatioEstimate\"?\s*:\s*\"?([0-9.]+)\"?", chunk, re.IGNORECASE
            )
            if pe_match:
                return float(pe_match.group(1))

        print("WSJ scrape failed: 'priceEarningsRatioEstimate' not found near 'P 500 Index'.")
    except Exception as e:
        error_msg = str(e)
        if scraper_api_key:
            error_msg = scrub_secrets(error_msg, [scraper_api_key])
        print(f"WSJ scrape failed: {error_msg}")
    return None


def main():
    print("Loading existing PE data for fail-open fallback...")
    existing_pe_data = {}
    pe_file_path = OUTPUT_DIR / "pe_ratio.json"
    if pe_file_path.exists():
        try:
            with open(pe_file_path, "r") as f:
                existing_pe_data = json.load(f)
        except Exception as e:
            print(f"Failed to load existing pe_ratio.json: {e}")

    print("Loading holdings and prices...")
    holdings_df, prices_data_raw = load_data()
    dates = holdings_df.index
    print("Preprocessing prices (forward-fill)...")
    prices_df = pd.DataFrame(prices_data_raw)
    prices_df.index = pd.to_datetime(prices_df.index)
    prices_df = prices_df.reindex(dates).ffill()
    all_tickers = [t for t in holdings_df.columns if t not in ("date", "total_value", "Others")]
    filtered_tickers = [
        t for t in all_tickers if t not in EXEMPT_TICKERS and t not in DELISTED_TICKERS
    ]
    stock_tickers = [t for t in filtered_tickers if not is_etf(t)]
    etf_tickers = [t for t in filtered_tickers if is_etf(t)]
    print(f"Processing {len(stock_tickers)} stocks and {len(etf_tickers)} ETFs...")
    print("Fetching ETF PEs...")
    etf_pe_series = {}

    # Use ThreadPoolExecutor to fetch ETF PEs concurrently
    # max_workers=10 is a reasonable default to speed up requests without getting aggressively rate-limited
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        # Submit all tasks and keep track of futures
        future_to_ticker = {executor.submit(fetch_etf_pe, t, dates): t for t in etf_tickers}
        for future in concurrent.futures.as_completed(future_to_ticker):
            t = future_to_ticker[future]
            try:
                pe_series = future.result()
                if pe_series is not None:
                    etf_pe_series[t] = pe_series
            except Exception as exc:
                print(f"  Warning: fetching ETF PE for {t} generated an exception: {exc}")

    etf_pe_daily = pd.concat(etf_pe_series, axis=1) if etf_pe_series else pd.DataFrame(index=dates)
    print("Fetching Stock EPS...")
    all_stock_data = fetch_stock_eps_data(stock_tickers)
    stock_eps_series = {}
    for t, data in all_stock_data.items():
        if not data["points"] and data["current_ttm"] is None:
            continue
        stock_eps_series[t] = interpolate_eps_series(data, dates)
        p0 = data["points"][0]["eps"] if data["points"] else 0
        curr = data["current_ttm"] if data["current_ttm"] else 0
        print(f"  {t}: HistPts={len(data['points'])}, First={p0:.2f}, Curr={curr:.2f}")
    stock_eps_daily = (
        pd.concat(stock_eps_series, axis=1) if stock_eps_series else pd.DataFrame(index=dates)
    )
    print("\nComputing Portfolio PE...")
    result_dates, result_portfolio_pe = [], []
    result_ticker_pe = {t: [] for t in all_tickers}
    result_ticker_weights = {t: [] for t in all_tickers}
    valid_ticker_mask = {}
    for dt in dates:
        mv_map, pe_map = {}, {}
        total_mv = 0.0
        for t in all_tickers:
            shares = holdings_df.loc[dt, t]
            if shares <= 1e-6:
                continue
            price = None
            t_clean = t.strip().upper().replace("-", "")
            if t_clean in prices_df.columns:
                price_val = prices_df.loc[dt, t_clean]
                if pd.notna(price_val) and price_val > 0:
                    price = float(price_val)
            if not price:
                continue
            mv = shares * price
            if mv < 1.0:
                continue
            mv_map[t], total_mv = mv, total_mv + mv
            if t in etf_pe_daily.columns:
                pe_map[t] = etf_pe_daily.loc[dt, t]
            elif t in stock_eps_daily.columns:
                eps = stock_eps_daily.loc[dt, t]
                if eps > 0:
                    pe_map[t] = price / eps
        portfolio_pe = calculate_harmonic_pe(mv_map, pe_map)
        result_dates.append(dt.strftime("%Y-%m-%d"))
        result_portfolio_pe.append(round(portfolio_pe, 2) if portfolio_pe else None)
        for t in all_tickers:
            val = pe_map.get(t)
            if val is not None:
                val = round(val, 2)
                valid_ticker_mask[t] = True
            result_ticker_pe[t].append(val)
            w = mv_map.get(t, 0) / total_mv if total_mv > 0 else 0
            result_ticker_weights[t].append(round(w, 5) if w > 0 else None)
    final_output = {
        "dates": result_dates,
        "portfolio_pe": result_portfolio_pe,
        "ticker_pe": {t: v for t, v in result_ticker_pe.items() if t in valid_ticker_mask},
        "ticker_weights": {
            t: v for t, v in result_ticker_weights.items() if t in valid_ticker_mask
        },
    }

    # Compute forward PE from current holdings
    print("Fetching Forward PE...")
    forward_pe = fetch_forward_pe()
    if forward_pe:
        # Fail-open: keep the last good msci_pe_ratio if this run's MSCI scrape
        # failed, so VT's frontend-derived forward P/E doesn't disappear.
        forward_pe = carry_forward_msci_pe_ratio(forward_pe, existing_pe_data)
        warn_if_msci_ratio_stale(forward_pe)
        final_output["forward_pe"] = forward_pe
        print(
            f"  Portfolio Forward PE: {forward_pe['portfolio_forward_pe']}x "
            f"(target: {forward_pe['target_date']})"
        )
        for t, pe in sorted(forward_pe["ticker_forward_pe"].items()):
            print(f"    {t}: {pe}x")
    else:
        print("  No forward PE data available. Attempting fallback...")
        if "forward_pe" in existing_pe_data:
            final_output["forward_pe"] = existing_pe_data["forward_pe"]
            print(
                f"  Fallback successful. Loaded old Portfolio Forward PE: {final_output['forward_pe'].get('portfolio_forward_pe')}x"
            )
        else:
            print("  Fallback failed. No existing portfolio forward PE data found.")

    # Compute benchmark PE series (^GSPC, ^IXIC)
    print("Fetching Benchmark PE...")
    benchmark_pe: Dict[str, Any] = {}
    benchmark_fwd_pe: Dict[str, float] = {}
    for bmk_ticker, proxy_etf in BENCHMARK_PE_TICKERS.items():
        # Use daily price/EPS approach for true daily granularity
        manual_anchors = MANUAL_TICKER_PE_CURVES.get(bmk_ticker)

        # Merge benchmark_history.json entries into manual anchors
        if BENCHMARK_HISTORY_PATH.exists():
            try:
                with open(BENCHMARK_HISTORY_PATH, "r") as f:
                    history = json.load(f)
                if bmk_ticker in history:
                    if manual_anchors is None:
                        manual_anchors = {}
                    else:
                        manual_anchors = manual_anchors.copy()
                    manual_anchors.update(history[bmk_ticker])
            except Exception as e:
                print(f"Warning: Failed to merge manual anchors from BENCHMARK_HISTORY_PATH for {bmk_ticker}: {e}")

        pe_series = fetch_benchmark_pe_daily(proxy_etf, dates, manual_anchors=manual_anchors)
        if pe_series is None:
            # Fallback to old interpolation method
            pe_series = fetch_etf_pe(bmk_ticker, dates)
            if pe_series is None:
                print(f"  {bmk_ticker}: No PE data available")
                continue
            # Update last point with live PE
            try:
                proxy_info = yf.Ticker(proxy_etf).info
                if proxy_info:
                    live_pe = proxy_info.get("trailingPE")
                    if live_pe and math.isfinite(live_pe) and live_pe > 0:
                        pe_series.iloc[-1] = float(live_pe)
            except Exception as e:
                print(f"  {bmk_ticker} proxy info error: {e}")

        # Fetch forward PE
        if bmk_ticker == "^GSPC":
            wsj_pe = scrape_wsj_forward_pe()
            if wsj_pe is not None:
                benchmark_fwd_pe[bmk_ticker] = round(wsj_pe, 2)
                print(f"  {bmk_ticker}: Fetched Forward PE {wsj_pe} from WSJ")
            else:
                fwd_pe_dict = existing_pe_data.get("forward_pe", {})
                bmk_fwd_pe_dict = fwd_pe_dict.get("benchmark_forward_pe", {})
                if bmk_ticker in bmk_fwd_pe_dict:
                    benchmark_fwd_pe[bmk_ticker] = bmk_fwd_pe_dict[bmk_ticker]
                    print(
                        f"  {bmk_ticker}: Fetched Forward PE {benchmark_fwd_pe[bmk_ticker]} from existing pe_ratio.json (fallback)"
                    )
        else:
            try:
                proxy_info = yf.Ticker(proxy_etf).info
                if proxy_info:
                    fwd_pe = proxy_info.get("forwardPE")
                    if fwd_pe and math.isfinite(fwd_pe) and fwd_pe > 0:
                        benchmark_fwd_pe[bmk_ticker] = round(float(fwd_pe), 2)
            except Exception as e:
                print(f"  {bmk_ticker} forward PE error: {e}")

        pe_values = [
            round(float(v), 2) if pd.notna(v) and math.isfinite(v) else None for v in pe_series
        ]
        benchmark_pe[bmk_ticker] = pe_values
        latest = next((v for v in reversed(pe_values) if v is not None), None)
        fwd_label = (
            f", Fwd={benchmark_fwd_pe[bmk_ticker]}x" if bmk_ticker in benchmark_fwd_pe else ""
        )
        print(f"  {bmk_ticker} ({proxy_etf}): Latest={latest}x{fwd_label}")

    if benchmark_pe:
        final_output["benchmark_pe"] = benchmark_pe
    if benchmark_fwd_pe:
        if "forward_pe" not in final_output:
            target_date = (datetime.now() + timedelta(days=365)).strftime("%Y-%m-%d")
            final_output["forward_pe"] = {"target_date": target_date}
        final_output["forward_pe"]["benchmark_forward_pe"] = benchmark_fwd_pe

    # Final safety net: never blank a block the previous file had just because
    # this run's fetch for it failed (e.g. benchmark_pe on a total scrape outage).
    final_output = apply_fail_open_backstop(final_output, existing_pe_data)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_DIR / "pe_ratio.json", "w") as f:
        json.dump(final_output, f, separators=(",", ":"))
    print(f"\nSaved to {OUTPUT_DIR / 'pe_ratio.json'}")


if __name__ == "__main__":
    main()
