#!/usr/bin/env python3
"""Refresh market caps for current holdings in data/market_caps.json.

market_caps.json is read by scripts/generate_marketcap_from_composition.py to
classify each stock into Mega/Large/Mid/Small Cap; without a fetcher the
snapshot drifts as companies' market caps move. Refreshes at most once every
REFRESH_INTERVAL_DAYS days (tracked in the "_meta" key) so the daily TWRR
pipeline only pays the yfinance cost weekly. Values stay plain numbers —
generate_marketcap_from_composition looks entries up by ticker.
"""

import atexit
import concurrent.futures
import json
import logging
import shutil
import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List

import pandas as pd
import yfinance as yf

# Configure yfinance to use a temporary directory for timezone cache
_yf_cache_dir = tempfile.mkdtemp(prefix="yf-cache-")
yf.set_tz_cache_location(_yf_cache_dir)
atexit.register(shutil.rmtree, _yf_cache_dir, ignore_errors=True)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
HOLDINGS_DETAILS_FILE = PROJECT_ROOT / "data" / "holdings_details.json"
MARKET_CAPS_FILE = PROJECT_ROOT / "data" / "market_caps.json"
DELISTED_TICKERS_FILE = PROJECT_ROOT / "data" / "delisted_tickers.csv"

REFRESH_INTERVAL_DAYS = 7

# Internal naming → yfinance symbol
TICKER_MAP = {
    'BRKB': 'BRK-B',
    'BRK.B': 'BRK-B',
    'BFB': 'BF-B',
}


def load_delisted_tickers() -> frozenset:
    """Load delisted tickers from CSV file."""
    if not DELISTED_TICKERS_FILE.exists():
        return frozenset()

    tickers = set()
    reader = pd.read_csv(DELISTED_TICKERS_FILE)
    for ticker in reader["ticker"].dropna():
        tickers.add(str(ticker).strip().upper())
    return frozenset(tickers)


def load_current_tickers() -> List[str]:
    """Current holdings tickers from holdings_details.json."""
    if not HOLDINGS_DETAILS_FILE.exists():
        logging.error(f"Holdings details not found at {HOLDINGS_DETAILS_FILE}.")
        return []
    with HOLDINGS_DETAILS_FILE.open("r", encoding="utf-8") as f:
        holdings = json.load(f)
    return sorted(holdings.keys())


def load_market_caps() -> Dict[str, Any]:
    if MARKET_CAPS_FILE.exists():
        try:
            with MARKET_CAPS_FILE.open("r", encoding="utf-8") as f:
                data: Dict[str, Any] = json.load(f)
                return data
        except Exception as e:
            logging.warning(f"Error loading existing market caps: {e}")
    return {}


def is_fresh(market_caps: Dict[str, Any], today: datetime | None = None) -> bool:
    """True when the last successful refresh is newer than REFRESH_INTERVAL_DAYS."""
    stamp = market_caps.get("_meta", {}).get("updated")
    if not stamp:
        return False
    try:
        updated = datetime.strptime(str(stamp), "%Y-%m-%d")
    except (ValueError, TypeError):
        return False
    return (today or datetime.now()) - updated < timedelta(days=REFRESH_INTERVAL_DAYS)


def fetch_market_caps(tickers: List[str]) -> Dict[str, int]:
    """Fetch current marketCap from yfinance for each ticker."""

    def fetch_one(ticker: str):
        yf_symbol = TICKER_MAP.get(ticker, ticker)
        try:
            cap = yf.Ticker(yf_symbol).info.get("marketCap")
            if cap and cap > 0:
                return ticker, int(cap)
            logging.warning(f"No market cap for {ticker}")
        except Exception as e:
            logging.error(f"Error fetching market cap for {ticker}: {e}")
        return ticker, None

    results: Dict[str, int] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        for ticker, cap in executor.map(fetch_one, tickers):
            if cap is not None:
                results[ticker] = cap
    return results


def main() -> int:
    tickers = [t for t in load_current_tickers() if t not in load_delisted_tickers()]
    if not tickers:
        logging.warning("No current holdings found.")
        return 0

    market_caps = load_market_caps()
    if is_fresh(market_caps):
        logging.info(
            f"market_caps.json refreshed within the last {REFRESH_INTERVAL_DAYS} days; skipping."
        )
        return 0

    logging.info(f"Fetching market caps for {len(tickers)} tickers...")
    fresh = fetch_market_caps(tickers)
    if not fresh:
        # Fail-open like the other TWRR steps: stale caps keep working, and the
        # _meta stamp stays old so the next run retries.
        logging.error("No market caps fetched; keeping existing data.")
        return 0

    market_caps.update(fresh)
    market_caps["_meta"] = {"updated": datetime.now().strftime("%Y-%m-%d")}

    with MARKET_CAPS_FILE.open("w", encoding="utf-8") as f:
        json.dump(market_caps, f, indent=2, sort_keys=True)
        f.write("\n")
    logging.info(f"Updated {len(fresh)} market caps in {MARKET_CAPS_FILE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
