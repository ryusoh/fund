#!/usr/bin/env python3
"""Generate dividend yield and income time-series for the portfolio.

Reads daily holdings, historical prices, and dividend data from yfinance.
Calculates:
1. Aggregate Portfolio Forward Dividend Yield (%)
2. Trailing 12-Month (TTM) Cash Dividends Collected (Absolute $)
"""

import json
import logging
from datetime import timedelta
from pathlib import Path
from typing import Any, Dict, List

import pandas as pd
import yfinance as yf

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
OUTPUT_DIR = DATA_DIR / "output" / "figures"
CHECKPOINT_DIR = DATA_DIR / "checkpoints"

HOLDINGS_PATH = CHECKPOINT_DIR / "holdings_daily.parquet"
PRICES_PATH = DATA_DIR / "historical_prices.parquet"
DIVIDEND_CACHE_PATH = CHECKPOINT_DIR / "dividend_cache.json"
OUTPUT_FILE = DATA_DIR / "yield_data.json"

TICKER_MAP = {
    'BRKB': 'BRK-B',
    'BRK.B': 'BRK-B',
    'BFB': 'BF-B',
}


def load_dividend_cache() -> Dict[str, Any]:
    """Load cached dividend data."""
    if DIVIDEND_CACHE_PATH.exists():
        try:
            with DIVIDEND_CACHE_PATH.open("r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logging.warning(f"Error loading dividend cache: {e}")
    return {}


def save_dividend_cache(cache: Dict[str, Any]):
    """Save dividend data to cache."""
    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)
    try:
        with DIVIDEND_CACHE_PATH.open("w", encoding="utf-8") as f:
            json.dump(cache, f, indent=4)
    except Exception as e:
        logging.error(f"Error saving dividend cache: {e}")


def fetch_dividends(tickers: List[str], cache: Dict[str, Any]) -> Dict[str, Any]:
    """Fetch historical dividends for all tickers."""
    updated = False
    for ticker_symbol in tickers:
        yf_sym = TICKER_MAP.get(ticker_symbol, ticker_symbol)

        # Check if we need to fetch (if not in cache or if cache is old)
        # For simplicity in this script, we'll fetch if not present.
        # In a real scenario, we might want to refresh recently active tickers.
        if ticker_symbol in cache:
            continue

        logging.info(f"Fetching dividends for {ticker_symbol}...")
        try:
            t = yf.Ticker(yf_sym)
            divs = t.dividends
            if divs.empty:
                cache[ticker_symbol] = []
            else:
                # Store as list of [date_str, amount]
                cache[ticker_symbol] = [[d.strftime("%Y-%m-%d"), float(v)] for d, v in divs.items()]
            updated = True
        except Exception as e:
            logging.error(f"Error fetching {ticker_symbol}: {e}")
            cache[ticker_symbol] = []

    if updated:
        save_dividend_cache(cache)
    return cache


def calculate_yield_data():
    """Main calculation logic."""
    if not HOLDINGS_PATH.exists() or not PRICES_PATH.exists():
        logging.error("Required data files (holdings/prices) not found.")
        return

    holdings_df = pd.read_parquet(HOLDINGS_PATH)
    prices_df = pd.read_parquet(PRICES_PATH)

    # Ensure indices are datetime
    holdings_df.index = pd.to_datetime(holdings_df.index)
    prices_df.index = pd.to_datetime(prices_df.index)

    # Common date range
    start_date = max(holdings_df.index.min(), prices_df.index.min())
    end_date = min(holdings_df.index.max(), prices_df.index.max())

    dates = pd.date_range(start=start_date, end=end_date, freq='D')

    # Reindex to full date range and forward fill
    holdings_df = holdings_df.reindex(dates).ffill().fillna(0)
    prices_df = prices_df.reindex(dates).ffill()

    tickers = [c for c in holdings_df.columns if c != 'date']
    dividend_cache = load_dividend_cache()
    dividend_cache = fetch_dividends(tickers, dividend_cache)

    # Pre-process dividends into Series for faster access and pre-calculate TTM
    ticker_divs = {}
    ticker_ttm_divs = {}  # Pre-calculated TTM sum for forward yield proxy

    for t in tickers:
        div_data = dividend_cache.get(t, [])
        if div_data:
            df = pd.DataFrame(div_data, columns=['date', 'amount'])
            df['date'] = pd.to_datetime(df['date']).dt.tz_localize(None)
            df = df.set_index('date')['amount']
            s = df.sort_index()
            ticker_divs[t] = s

            # Pre-calculate TTM sum for each possible date in our range
            # We want the sum of dividends in [d - 365 days, d]
            full_range_s = s.reindex(dates.union(s.index)).fillna(0)
            # Rolling 365D sum
            ticker_ttm_divs[t] = (
                full_range_s.rolling(window=pd.Timedelta(days=365)).sum().reindex(dates)
            )
        else:
            ticker_divs[t] = pd.Series(dtype=float, index=pd.DatetimeIndex([]))
            ticker_ttm_divs[t] = pd.Series(0.0, index=dates)

    results = []

    logging.info(f"Processing {len(dates)} days...")

    for current_date in dates:
        portfolio_market_value = 0.0
        portfolio_forward_dividend_income = 0.0
        portfolio_ttm_dividend_collected = 0.0

        date_str = current_date.strftime("%Y-%m-%d")
        ttm_start = current_date - timedelta(days=365)

        for t in tickers:
            shares = holdings_df.at[current_date, t]
            if shares <= 0:
                continue

            price = prices_df.at[current_date, t]
            if pd.isna(price) or price <= 0:
                continue

            portfolio_market_value += shares * price

            # 1. Forward Dividend Income (Proxy using TTM sum at this date)
            annual_div_per_share = ticker_ttm_divs[t].at[current_date]
            portfolio_forward_dividend_income += shares * annual_div_per_share

            # 2. TTM Dividends Collected (Actual cash based on historical shares)
            div_series = ticker_divs[t]
            ttm_div_events = div_series[
                (div_series.index > ttm_start) & (div_series.index <= current_date)
            ]
            for ex_date, amt in ttm_div_events.items():
                if ex_date in holdings_df.index:
                    portfolio_ttm_dividend_collected += holdings_df.at[ex_date, t] * amt

        forward_yield = 0.0
        if portfolio_market_value > 0:
            forward_yield = (portfolio_forward_dividend_income / portfolio_market_value) * 100.0

        results.append(
            {
                "date": date_str,
                "forward_yield": round(forward_yield, 4),
                "ttm_income": round(portfolio_ttm_dividend_collected, 2),
                "market_value": round(portfolio_market_value, 2),
            }
        )

    # Save to JSON
    with OUTPUT_FILE.open("w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    logging.info(f"Yield data saved to {OUTPUT_FILE}")


if __name__ == "__main__":
    calculate_yield_data()
