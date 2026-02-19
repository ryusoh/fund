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
from typing import Dict, List, Optional

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

# Cache for FX history to avoid redundant fetches
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


def fetch_stock_eps_data(ticker: str) -> Dict:
    """Fetch Annual EPS points and Current TTM EPS for a stock."""
    symbol = yf_symbol(ticker)
    data = {"points": [], "current_ttm": None, "currency": "USD"}

    try:
        t = yf.Ticker(symbol)
        info = t.info or {}

        curr = info.get("currency", "USD")
        fin_curr = info.get("financialCurrency", curr)

        # 1. Current TTM EPS (in Price Currency)
        # This is our anchor for "today"
        ttm_eps = info.get("trailingEps")
        if ttm_eps is not None and math.isfinite(ttm_eps):
            data["current_ttm"] = float(ttm_eps)

        # 2. Historical Annual EPS (in Financial Currency)
        income = t.income_stmt
        if income is not None and not income.empty:
            # Look for Basic EPS
            eps_row = None
            for label in ["Basic EPS", "Diluted EPS", "Basic Eps"]:
                if label in income.index:
                    eps_row = income.loc[label]
                    break

            if eps_row is not None:
                # Need FX data?
                fx_series = None
                if curr != fin_curr:
                    pair = f"{fin_curr}{curr}=X"
                    fx_series = get_fx_history(pair)

                for date, val in eps_row.items():
                    if val is None or not math.isfinite(val):
                        continue

                    date_ts = pd.Timestamp(date).normalize().tz_localize(None)
                    val_float = float(val)

                    # Convert if needed
                    if fx_series is not None:
                        rate = get_closest_fx(fx_series, date_ts)
                        val_float *= rate
                    elif curr == "GBp" and fin_curr == "GBP":
                        # Pence vs Pounds special case
                        val_float *= 100

                    data["points"].append({"date": date_ts, "eps": val_float})

        # Sort points by date
        data["points"].sort(key=lambda x: x["date"])

    except Exception as exc:
        print(f"  Warning: Error fetching data for {ticker}: {exc}")

    return data


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


def main():
    print("Loading holdings and prices...")
    holdings_df, prices_data = load_data()
    dates = holdings_df.index

    # Filter tickers
    all_tickers = [t for t in holdings_df.columns if t not in ("date", "total_value", "Others")]
    stock_tickers = [t for t in all_tickers if not is_etf(t)]
    etf_tickers = [t for t in all_tickers if is_etf(t)]

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

    for t in stock_tickers:
        data = fetch_stock_eps_data(t)
        if not data["points"] and data["current_ttm"] is None:
            print(f"  {t}: No EPS data found")
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

        # Weighted Harmonic Average P/E (Industry Standard)
        # Arithmetic Mean is sensitive to outliers (e.g. PE=8000 due to near-zero earnings).
        # Harmonic Mean = 1 / Sum(Weight * (1/PE)) = 1 / Weighted_Earnings_Yield
        weighted_yield = 0.0
        weight_sum = 0.0

        # Store weights for this day (normalized to total_mv)
        day_weights = {}
        if total_mv > 0:
            for t, mv in mv_map.items():
                day_weights[t] = mv / total_mv

        for t, mv in mv_map.items():
            if t in pe_map:
                pe_val = pe_map[t]
                if pe_val > 0:
                    w = mv / total_mv
                    weighted_yield += w * (1.0 / pe_val)
                    weight_sum += w

        # Normalize weights to 100% of valid PE holdings
        if weight_sum > 0 and weighted_yield > 0:
            # Adjusted Yield = Weighted_Yield / Total_Valid_Weight
            adj_yield = weighted_yield / weight_sum
            portfolio_pe = 1.0 / adj_yield
        else:
            portfolio_pe = None

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
