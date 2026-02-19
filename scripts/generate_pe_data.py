#!/usr/bin/env python3
"""Generate weighted average P/E ratio time-series for the portfolio.

Reads daily holdings, historical prices, and earnings data from yfinance.

Methodology (V3):
1. For ETFs: Use `info.trailingPE` as a constant (best available proxy).
2. For Stocks:
   - Fetch Historical Annual Basic EPS from `income_stmt` (financial currency).
   - Fetch Current TTM EPS from `info.trailingEps` (trade currency, USD for ADRs).
   - Fetch Historical Prices (trade currency).
   - Handle Currency: If financial currency != price currency (e.g. BABA: CNY vs USD),
     fetch FX history (e.g. CNYUSD=X) and convert Annual EPS to price currency
     at the reporting date.
   - Construct EPS Curve: Combine [Annual EPS Points] + [Current TTM EPS Point].
   - Interpolate EPS linearly between points to get daily TTM EPS.
   - Compute Daily PE = Price(t) / EPS(t).

This solves:
- History: Uses annual data back to 2021/2022.
- Accuracy: Correctly scales historical PE using historical earnings (vs current).
- Currency: Handles ADRs (BABA/PDD) correctly.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

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
PRICES_JSON_PATH = DATA_DIR / "historical_prices.json"
EPS_CACHE_PATH = DATA_DIR / "checkpoints" / "fetched_eps_cache.json"
MANUAL_PATCH_PATH = DATA_DIR / "manual_eps_patch.json"

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
        "IGV",
        "VGT",
        "IHF",
        "XLK",
        "XLF",
        "PSQ",
        "QQQ",
        "SPY",
        "DIA",
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
        "VTLE",
        "VOX",
        "VHT",
    }
)

YFINANCE_ALIASES = {
    "BRKB": "BRK-B",
    "BF.B": "BF-B",
    "BF_B": "BF-B",
}

# Tickers that are Bonds, Money Market, Inverse, or Commodities (No P/E Intent)
EXEMPT_TICKERS = frozenset(
    {
        "FNSFX",  # Bond Mutual Fund
        "BOXX",  # Cash/Options Strategy
        "BNDW",  # Total World Bond
        "SH",  # Short S&P
        "PSQ",  # Short QQQ
        "SLV",  # Silver
        "GLD",  # Gold
        "SJB",  # Short High Yield
        "BUG",  # Cyber Security (ETF but specialized) - actually is Equity ETF, keep checking?
        # Wait, BUG is Equity ETF. Keeping it out.
        "DICE",  # Pharm?
        "PTLC",  # ?
        "AG",  # First Majestic (Silver Miner) - Has PE
        "AGG",  # Bond
        "LQD",  # Corporate Bond
        "TLT",  # Treasury Bond
        "BIL",  # T-Bills
        "SGOV",  # T-Bills
    }
)

# Cache for FX rates
FX_CACHE: Dict[str, pd.Series] = {}


def is_etf(ticker: str) -> bool:
    normalized = ticker.strip().upper()
    if normalized in ETF_TICKERS:
        return True
    if len(normalized) > 4 and normalized.endswith("X"):
        return True
    return False


def yf_symbol(ticker: str) -> str:
    normalized = ticker.strip().upper()
    return YFINANCE_ALIASES.get(normalized, ticker)


def get_fx_history(pair: str) -> Optional[pd.Series]:
    """Fetch close history for a currency pair (e.g. CNYUSD=X)."""
    if pair in FX_CACHE:
        return FX_CACHE[pair]

    try:
        # Fetch 5y history
        hist = yf.Ticker(pair).history(period="5y")
        if not hist.empty and "Close" in hist.columns:
            series = hist["Close"]
            # Ensure timezone-naive dates
            series.index = series.index.normalize().tz_localize(None)
            FX_CACHE[pair] = series
            return series
    except Exception as exc:
        print(f"    Warning: Failed to fetch FX {pair}: {exc}")

    return None


def get_closest_fx(fx_series: pd.Series, date: pd.Timestamp) -> float:
    """Get FX rate at date, using asof (backward search) or ffill."""
    try:
        idx = fx_series.index.get_indexer([date], method="pad")[0]
        if idx != -1:
            return float(fx_series.iloc[idx])
        # Try forward search if before start
        idx = fx_series.index.get_indexer([date], method="bfill")[0]
        if idx != -1:
            return float(fx_series.iloc[idx])
    except Exception:
        pass
    return 1.0  # Fallback


def load_eps_cache() -> Dict[str, Any]:
    if EPS_CACHE_PATH.exists():
        try:
            with open(EPS_CACHE_PATH, "r") as f:
                return json.load(f)
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
                return json.load(f)
        except Exception as e:
            print(f"Error loading manual patch: {e}")
    return {}


def fetch_stock_eps_data(tickers: List[str]) -> Dict[str, Any]:
    """Fetch EPS data for stocks with caching and manual patches."""
    # 1. Load Cache & Patch
    cache = load_eps_cache()
    manual_patch = load_manual_patch()

    # 2. Update Cache with new data
    # (Only if we want to refresh. Assume yes.)
    for t in tickers:
        try:
            stock = yf.Ticker(t)
            # Try to get info safely
            info = {}
            try:
                info = stock.info
            except:
                pass

            current_ttm = info.get("trailingEps")
            currency = info.get("currency", "USD")

            # Historical Annual
            financials = stock.income_stmt
            if not financials.empty and "Basic EPS" in financials.index:
                eps_row = financials.loc["Basic EPS"]

                # Check if FX conversion needed
                fin_curr = info.get("financialCurrency", currency)
                fx_series = None
                if currency != fin_curr:
                    # e.g. CNY -> USD. Pair = CNYUSD=X
                    pair = f"{fin_curr}{currency}=X"
                    fx_series = get_fx_history(pair)

                # Init ticker entry if needed
                if t not in cache:
                    cache[t] = {"points": {}, "currency": currency}

                # Update metadata
                cache[t]["current_ttm"] = current_ttm
                cache[t]["currency"] = currency
                if "points" not in cache[t]:
                    cache[t]["points"] = {}

                # Merge points
                for date_val, eps_val in eps_row.items():
                    if pd.notna(eps_val):
                        d_ts = pd.Timestamp(date_val)
                        d_str = d_ts.strftime("%Y-%m-%d")
                        val_float = float(eps_val)

                        # Convert if needed
                        if fx_series is not None:
                            rate = get_closest_fx(fx_series, d_ts)
                            val_float *= rate
                        elif currency == "GBP" and fin_curr == "GBp":  # Pence -> Pounds
                            val_float /= 100.0

                        cache[t]["points"][d_str] = val_float

        except Exception as e:
            print(f"Warning: Error fetching {t}: {e}")

    # 3. Save Cache
    save_eps_cache(cache)

    # 4. Construct Final Data (Merge Cache + Patch)
    results = {}
    for t in tickers:
        # Default empty structure if not in cache (and fetch failed)
        base = cache.get(t, {"points": {}, "current_ttm": None, "currency": "USD"})
        points_map = base.get("points", {}).copy()

        # Apply Patch
        if t in manual_patch:
            points_map.update(manual_patch[t])

        # Convert to list
        points_list = []
        for d, v in points_map.items():
            points_list.append({"date": pd.Timestamp(d), "eps": v})

        points_list.sort(key=lambda x: x["date"])

        results[t] = {
            "points": points_list,
            "current_ttm": base.get("current_ttm"),
            "currency": base.get("currency", "USD"),
        }

    return results


def fetch_etf_pe(ticker: str) -> Optional[float]:
    symbol = yf_symbol(ticker)
    try:
        info = yf.Ticker(symbol).info or {}
        pe = info.get("trailingPE")
        if pe is not None and math.isfinite(pe) and pe > 0:
            return float(pe)
    except Exception:
        pass
    return None


def interpolate_eps_series(stock_data: Dict, date_index: pd.DatetimeIndex) -> pd.Series:
    """Create a daily EPS series by interpolating annual points + current TTM."""
    points = stock_data["points"]
    current_ttm = stock_data["current_ttm"]

    # Create Series with known points
    known_data = {}
    for p in points:
        known_data[p["date"]] = p["eps"]

    # Add current TTM at "today"
    today = pd.Timestamp.now().normalize()
    if current_ttm is not None:
        known_data[today] = current_ttm
    elif points:
        # If no current TTM (rare), assume flat from last point
        known_data[today] = points[-1]["eps"]

    if not known_data:
        return pd.Series(dtype=float).reindex(date_index)

    # Convert to Series
    s_points = pd.Series(known_data).sort_index()

    # Remove duplicates (keep last)
    s_points = s_points[~s_points.index.duplicated(keep='last')]

    # Reindex to full range and interpolate
    # We allow extrapolation (ffill/bfill) for dates outside the known points
    full_series = s_points.reindex(s_points.index.union(date_index))
    interpolated = full_series.interpolate(method='time')
    interpolated = interpolated.reindex(date_index).ffill().bfill()

    return interpolated


def load_data():
    if not HOLDINGS_PATH.exists():
        raise FileNotFoundError(f"Holdings not found: {HOLDINGS_PATH}")
    holdings_df = pd.read_parquet(HOLDINGS_PATH)

    if not PRICES_JSON_PATH.exists():
        raise FileNotFoundError(f"Prices not found: {PRICES_JSON_PATH}")
    with open(PRICES_JSON_PATH, "r") as f:
        prices_data = json.load(f)

    return holdings_df, prices_data


def get_price(prices_data: dict, ticker: str, date_str: str) -> float | None:
    t_clean = ticker.strip().upper().replace("-", "")
    if t_clean not in prices_data:
        return None
    price = prices_data[t_clean].get(date_str)
    if price:
        return float(price)

    # Fallback to last available
    # prices_data[t_clean] keys are unsorted dates, so we rely on exact match
    # or costly search. Optimization: assume external prices file is dense enough
    # or handle nulls.
    return None


def calculate_harmonic_pe(mv_map: Dict[str, float], pe_map: Dict[str, float]) -> Optional[float]:
    """
    Calculate the weighted harmonic mean P/E of the portfolio.
    Formula: 1 / Sum(Weight * (1/PE)) = 1 / Weighted_Earnings_Yield
    Weights are normalized to the subset of holdings with valid P/E.
    """
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
        # Adjusted Yield = Weighted_Yield / Total_Valid_Weight
        adj_yield = weighted_yield / weight_sum
        return 1.0 / adj_yield

    return None


def main():
    print("Loading holdings and prices...")
    holdings_df, prices_data = load_data()
    dates = holdings_df.index

    # Filter tickers
    all_tickers = [t for t in holdings_df.columns if t not in ("date", "total_value", "Others")]

    # Remove exempt tickers
    filtered_tickers = []
    for t in all_tickers:
        if t in EXEMPT_TICKERS:
            # print(f"Skipping Exempt (Bond/Non-Equity): {t}")
            continue
        filtered_tickers.append(t)

    stock_tickers = [t for t in filtered_tickers if not is_etf(t)]
    etf_tickers = [t for t in filtered_tickers if is_etf(t)]

    print(f"Processing {len(stock_tickers)} stocks and {len(etf_tickers)} ETFs...")

    # 1. Fetch ETF Constant PEs
    print("Fetching ETF PEs...")
    etf_pes = {}
    for t in etf_tickers:
        pe = fetch_etf_pe(t)
        if pe:
            etf_pes[t] = pe

    # 2. Fetch and Interpolate Stock EPS
    print("Fetching Stock EPS and history...")
    stock_eps_daily = pd.DataFrame(index=dates)

    print("Fetching Stock EPS and history (Batch)...")
    stock_eps_daily = pd.DataFrame(index=dates)

    # Batch fetch
    all_stock_data = fetch_stock_eps_data(stock_tickers)

    for t, data in all_stock_data.items():
        if not data["points"] and data["current_ttm"] is None:
            # print(f"  {t}: No EPS data found") # Reduce noise
            continue

        eps_series = interpolate_eps_series(data, dates)
        stock_eps_daily[t] = eps_series

        # Debug log for verification
        p0 = data["points"][0]["eps"] if data["points"] else "N/A"
        curr = data["current_ttm"] if data["current_ttm"] else "N/A"
        print(f"  {t}: HistPts={len(data['points'])}, First={p0:.2f}, Curr={curr}")

    # 3. Compute Daily PE
    print("\nComputing Portfolio PE...")
    result_dates = []
    result_portfolio_pe = []
    result_ticker_pe = {t: [] for t in all_tickers}
    result_ticker_weights = {t: [] for t in all_tickers}

    valid_ticker_mask = {}

    for date in dates:
        date_str = date.strftime("%Y-%m-%d")

        # Holdings weights
        mv_map = {}
        total_mv = 0.0

        # PE map for this day
        pe_map = {}

        for t in all_tickers:
            shares = holdings_df.loc[date, t]
            if shares <= 1e-6:
                continue

            price = get_price(prices_data, t, date_str)
            if not price:
                continue

            mv = shares * price
            # Filter dust: ignore if value < $1.0
            if mv < 1.0:
                continue

            mv_map[t] = mv
            total_mv += mv

            # Get PE
            if t in etf_pes:
                pe_map[t] = etf_pes[t]
            elif t in stock_eps_daily.columns:
                eps = stock_eps_daily.loc[date, t]
                if eps > 0:
                    pe_map[t] = price / eps

        # Calculate Portfolio PE
        portfolio_pe = calculate_harmonic_pe(mv_map, pe_map)

        # Calculate weights
        day_weights = {}
        if total_mv > 0:
            for t, mv in mv_map.items():
                day_weights[t] = mv / total_mv

        result_dates.append(date_str)
        result_portfolio_pe.append(round(portfolio_pe, 2) if portfolio_pe else None)

        for t in all_tickers:
            val = pe_map.get(t)
            if val is not None:
                val = round(val, 2)
                valid_ticker_mask[t] = True
            result_ticker_pe[t].append(val)

            # Save weight (rounded to 4 decimals = 0.01% precision)
            w = day_weights.get(t)
            if w is not None:
                result_ticker_weights[t].append(round(w, 5))
            else:
                result_ticker_weights[t].append(None)

    # Filter output (remove tickers with no data ever)
    final_ticker_pe = {t: vals for t, vals in result_ticker_pe.items() if t in valid_ticker_mask}
    final_ticker_weights = {
        t: vals for t, vals in result_ticker_weights.items() if t in valid_ticker_mask
    }

    output = {
        "dates": result_dates,
        "portfolio_pe": result_portfolio_pe,
        "ticker_pe": final_ticker_pe,
        "ticker_weights": final_ticker_weights,
    }

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_file = OUTPUT_DIR / "pe_ratio.json"
    with open(out_file, "w") as f:
        json.dump(output, f, separators=(",", ":"))

    print(f"\nSaved to {out_file}")

    # Stats
    valid_days = sum(1 for x in result_portfolio_pe if x is not None)
    print(f"Valid Days: {valid_days}/{len(dates)}")
    if result_portfolio_pe:
        valid_vals = [x for x in result_portfolio_pe if x]
        if valid_vals:
            print(f"Range: {min(valid_vals):.2f} - {max(valid_vals):.2f}")
            print(f"Latest: {valid_vals[-1]:.2f}")


if __name__ == "__main__":
    main()
