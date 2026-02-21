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

import json
import math
import os
import re
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, cast

import pandas as pd
import numpy as np

try:
    import yfinance as yf
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
        "VWO",
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
    except Exception:
        pass
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
    return 1.0 / float(total_multiplier)


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
        sd = pd.Timestamp(split_date).tz_localize(None)
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

    for t in tickers:
        symbol = yf_symbol(t)
        try:
            stock = yf.Ticker(symbol)
            # Try to get info safely
            info = {}
            try:
                info = stock.info
                if info is None:
                    info = {}
            except:
                pass

            current_ttm = info.get("trailingEps")
            currency = info.get("currency", "USD")
            fin_curr = info.get("financialCurrency", currency) or currency

            if t not in cache:
                cache[t] = {"points": {}, "currency": currency}
            else:
                cache[t]["points"] = {}  # Wipe old points to avoid split adjustment pollution

            cache[t]["current_ttm"] = current_ttm
            cache[t]["currency"] = currency

            fx_series = None
            if currency != fin_curr:
                pair = f"{fin_curr}{currency}=X"
                fx_series = get_fx_history(pair)

            # Fetch the yfinance splits series for this ticker
            try:
                yf_splits = stock.splits
                if yf_splits is None or yf_splits.empty:
                    yf_splits = pd.Series(dtype=float)
            except:
                yf_splits = pd.Series(dtype=float)

            def add_point(d_str: str, val: float):
                """Add a single EPS data point to cache, applying FX if needed."""
                if fx_series is not None:
                    rate = get_closest_fx(fx_series, pd.Timestamp(d_str))
                    val *= rate
                elif currency == "GBP" and fin_curr == "GBp":
                    val /= 100.0
                cache[t]["points"][d_str] = val

            # 1. Annual income_stmt → fully split-adjusted, use directly
            try:
                annual = stock.income_stmt
            except:
                annual = pd.DataFrame()

            if annual is not None and not annual.empty and "Basic EPS" in annual.index:
                for d_val, v in annual.loc["Basic EPS"].items():
                    if pd.notna(v):
                        add_point(pd.Timestamp(d_val).strftime("%Y-%m-%d"), float(v))

            # 2. Quarterly income_stmt → fully split-adjusted, build TTM
            try:
                quarterly = stock.quarterly_income_stmt
            except:
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
                        add_point(pd.Timestamp(d_val).strftime("%Y-%m-%d"), float(ttm_v))

            # 3. get_earnings_dates() → REQUIRES split normalization
            #
            # Yahoo retroactively adjusts earnings_dates for all PREVIOUS splits
            # but NOT the most recent split. However, this is inconsistent near
            # split boundaries. We empirically detect the correct factor by
            # comparing against income_stmt annual EPS (which IS fully adjusted).
            try:
                ed = stock.get_earnings_dates(limit=40)
                if ed is not None and not ed.empty and "Reported EPS" in ed.columns:
                    q_eps_raw = ed["Reported EPS"].dropna().sort_index()
                    q_eps_raw.index = q_eps_raw.index.normalize().tz_localize(None)
                    q_eps_raw = q_eps_raw.groupby(q_eps_raw.index).last()

                    # Empirically detect Yahoo's adjustment factor by comparing
                    # the sum of 4 reported quarters against the official annual EPS.
                    calibration_factor = 1.0
                    if (
                        annual is not None
                        and not annual.empty
                        and "Basic EPS" in annual.index
                        and len(q_eps_raw) >= 4
                    ):
                        # Try each annual period to find a calibration match
                        annual_eps = annual.loc["Basic EPS"].dropna().sort_index()
                        for ann_date, ann_val in annual_eps.items():
                            if pd.isna(ann_val) or ann_val == 0:
                                continue
                            ann_ts = pd.to_datetime(ann_date).normalize().tz_localize(None)
                            # Find 4 quarters ending near this annual date
                            # (within 90 days before the annual date)
                            mask = (q_eps_raw.index <= ann_ts) & (
                                q_eps_raw.index > ann_ts - pd.Timedelta(days=400)
                            )
                            matching_qs = q_eps_raw[mask]
                            if len(matching_qs) >= 4:
                                q_sum = matching_qs.iloc[-4:].sum()
                                if q_sum != 0:
                                    ratio = q_sum / float(ann_val)
                                    # Expected ratios: 1.0 (no adj needed), 4.0, 10.0, etc.
                                    if ratio > 1.5:
                                        calibration_factor = round(ratio)
                                        break

                    # Normalize each reported EPS
                    q_eps_normalized = []
                    for d, v in q_eps_raw.items():
                        # If this date has a quarterly_income_stmt anchor, use that
                        if d in quarterly_anchors:
                            q_eps_normalized.append(quarterly_anchors[d])
                            continue

                        # Check if this specific date is AFTER the most recent split
                        # (Yahoo may have already fully adjusted it)
                        if not yf_splits.empty:
                            last_split_date = pd.Timestamp(yf_splits.index[-1]).tz_localize(None)
                            if d >= last_split_date:
                                # Post-split: Yahoo already fully adjusted
                                q_eps_normalized.append(v)
                                continue

                        # Apply empirical calibration factor
                        normalized = v / calibration_factor
                        q_eps_normalized.append(normalized)

                    q_eps_series = pd.Series(q_eps_normalized, index=q_eps_raw.index)
                    if len(q_eps_series) >= 4:
                        q_ttm = q_eps_series.rolling(4).sum().dropna()
                        for d_val, ttm_v in q_ttm.items():
                            add_point(pd.Timestamp(d_val).strftime("%Y-%m-%d"), float(ttm_v))
            except Exception as e:
                # Silence internal yfinance TypeError: argument of type 'NoneType' is not iterable
                if "NoneType" not in str(e):
                    print(f"Warning: Quarterly fetch failed for {symbol}: {e}")
        except Exception as e:
            if "NoneType" not in str(e):
                print(f"Warning: Error fetching {symbol}: {e}")

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
        sorted_ts = sorted(ts_points.keys())

        for dt, val in ts_points.items():
            if dt in dates:
                s.loc[dt] = val
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
    except:
        pass
    return None


def interpolate_eps_series(stock_data: Dict, date_index: pd.DatetimeIndex) -> pd.Series:
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
    return interpolated.reindex(date_index).ffill().bfill()


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

    for ticker, details in holdings.items():
        shares = float(details.get("shares", 0))
        if shares <= 0:
            continue

        symbol = yf_symbol(ticker)
        try:
            stock = yf.Ticker(symbol)
            info = stock.info
            if info is None:
                continue

            price = info.get("currentPrice") or info.get("regularMarketPrice")
            fwd_pe = info.get("forwardPE")

            if ticker == "VT" and (not fwd_pe or not math.isfinite(fwd_pe) or fwd_pe <= 0):
                msci_pe = scrape_msci_forward_pe()
                if msci_pe:
                    fwd_pe = msci_pe
                    print(f"    VT: Fetched Forward PE {fwd_pe} from MSCI proxy")

            if price and price > 0:
                mv_map[ticker] = shares * price

            if fwd_pe and math.isfinite(fwd_pe) and fwd_pe > 0:
                fwd_pe_map[ticker] = fwd_pe
                ticker_fwd_pe[ticker] = round(fwd_pe, 2)
        except Exception:
            continue

    if not fwd_pe_map:
        return None

    portfolio_fwd_pe = calculate_harmonic_pe(mv_map, fwd_pe_map)
    if portfolio_fwd_pe is None:
        return None

    # Target date: 12 months from today (NTM convention)
    target_date = (datetime.now() + timedelta(days=365)).strftime("%Y-%m-%d")

    return {
        "target_date": target_date,
        "portfolio_forward_pe": round(portfolio_fwd_pe, 2),
        "ticker_forward_pe": ticker_fwd_pe,
    }


def scrape_msci_forward_pe() -> Optional[float]:
    """Scrape Forward P/E for VT from MSCI ACWI Index factsheet."""
    try:
        url = "https://www.msci.com/indexes/index/990100"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 AppleWebKit/537.36",
                "Accept": "text/html",
            },
        )
        content = urllib.request.urlopen(req, timeout=10).read().decode("utf-8")
        match = re.search(r"P/E Fwd.{0,200}?([0-9]+\.[0-9]+)", content, re.IGNORECASE | re.DOTALL)
        if match:
            return float(match.group(1))
    except Exception as e:
        print(f"MSCI scrape failed: {e}")
    return None


def scrape_wsj_forward_pe() -> Optional[float]:
    """Scrape S&P 500 Forward P/E Estimate from WSJ Market Data."""
    try:
        target_url = "https://www.wsj.com/market-data/stocks/peyields"
        scraper_api_key = os.environ.get("SCRAPER_API_KEY")

        if scraper_api_key:
            payload = {
                'api_key': scraper_api_key,
                'url': target_url,
                'premium': 'true',
                'country_code': 'us',
            }
            url = 'http://api.scraperapi.com/?' + urllib.parse.urlencode(payload)
        else:
            url = target_url

        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
            },
        )
        content = urllib.request.urlopen(req, timeout=20).read().decode("utf-8")

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

        print(f"WSJ scrape failed: 'priceEarningsRatioEstimate' not found near 'P 500 Index'.")
    except Exception as e:
        print(f"WSJ scrape failed: {e}")
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
    etf_pe_daily = pd.DataFrame(index=dates)
    for t in etf_tickers:
        pe_series = fetch_etf_pe(t, dates)
        if pe_series is not None:
            etf_pe_daily[t] = pe_series
    print("Fetching Stock EPS...")
    stock_eps_daily = pd.DataFrame(index=dates)
    all_stock_data = fetch_stock_eps_data(stock_tickers)
    for t, data in all_stock_data.items():
        if not data["points"] and data["current_ttm"] is None:
            continue
        stock_eps_daily[t] = interpolate_eps_series(data, dates)
        p0 = data["points"][0]["eps"] if data["points"] else 0
        curr = data["current_ttm"] if data["current_ttm"] else 0
        print(f"  {t}: HistPts={len(data['points'])}, First={p0:.2f}, Curr={curr:.2f}")
    print("\nComputing Portfolio PE...")
    result_dates, result_portfolio_pe = [], []
    result_ticker_pe = {t: [] for t in all_tickers}
    result_ticker_weights = {t: [] for t in all_tickers}
    valid_ticker_mask = {}
    for date in dates:
        mv_map, pe_map = {}, {}
        total_mv = 0.0
        for t in all_tickers:
            shares = holdings_df.loc[date, t]
            if shares <= 1e-6:
                continue
            price = None
            t_clean = t.strip().upper().replace("-", "")
            if t_clean in prices_df.columns:
                price_val = prices_df.loc[date, t_clean]
                if pd.notna(price_val) and price_val > 0:
                    price = float(price_val)
            if not price:
                continue
            mv = shares * price
            if mv < 1.0:
                continue
            mv_map[t], total_mv = mv, total_mv + mv
            if t in etf_pe_daily.columns:
                pe_map[t] = etf_pe_daily.loc[date, t]
            elif t in stock_eps_daily.columns:
                eps = stock_eps_daily.loc[date, t]
                if eps > 0:
                    pe_map[t] = price / eps
        portfolio_pe = calculate_harmonic_pe(mv_map, pe_map)
        result_dates.append(date.strftime("%Y-%m-%d"))
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
        # Historical PE via MANUAL_TICKER_PE_CURVES interpolation
        pe_series = fetch_etf_pe(bmk_ticker, dates)
        if pe_series is None:
            print(f"  {bmk_ticker}: No PE data from manual curves")
            continue

        # Update the last data point with live trailing PE from the ETF proxy
        try:
            proxy_info = yf.Ticker(proxy_etf).info
            if proxy_info:
                live_pe = proxy_info.get("trailingPE")
                if live_pe and math.isfinite(live_pe) and live_pe > 0:
                    pe_series.iloc[-1] = float(live_pe)

                if bmk_ticker != "^GSPC":
                    fwd_pe = proxy_info.get("forwardPE")
                    if fwd_pe and math.isfinite(fwd_pe) and fwd_pe > 0:
                        benchmark_fwd_pe[bmk_ticker] = round(float(fwd_pe), 2)
        except Exception as e:
            print(f"  {bmk_ticker} proxy info error: {e}")

        # Fetch WSJ forward PE outside the proxy try-catch
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

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_DIR / "pe_ratio.json", "w") as f:
        json.dump(final_output, f, separators=(",", ":"))
    print(f"\nSaved to {OUTPUT_DIR / 'pe_ratio.json'}")


if __name__ == "__main__":
    main()
