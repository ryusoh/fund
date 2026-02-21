#!/usr/bin/env python3
"""Fetch ticker metadata (sector, industry, name) using yfinance."""

import json
import logging
from pathlib import Path
from typing import Any, Dict, List

import pandas as pd
import yfinance as yf

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
HOLDINGS_DAILY_FILE = PROJECT_ROOT / "data" / "checkpoints" / "holdings_daily.parquet"
METADATA_FILE = PROJECT_ROOT / "data" / "ticker_metadata.json"


def get_tickers_from_holdings() -> List[str]:
    """Reads all historical tickers from the holdings_daily.parquet file."""
    try:
        if not HOLDINGS_DAILY_FILE.exists():
            logging.error(f"Holdings daily file not found at {HOLDINGS_DAILY_FILE}.")
            return []

        df = pd.read_parquet(HOLDINGS_DAILY_FILE)
        # Tickers are the columns of the holdings dataframe
        return [col for col in df.columns if col != 'date']
    except Exception as e:
        logging.error(f"Error reading tickers from parquet: {e}")
        return []


def fetch_metadata(tickers: List[str]) -> Dict[str, Any]:
    """Fetches metadata for a list of tickers."""
    metadata = {}

    # Mapper for common ticker differences between internal naming and yfinance
    TICKER_MAP = {
        'BRKB': 'BRK-B',
        'BRK.B': 'BRK-B',
        'BFB': 'BF-B',
    }

    # Load existing metadata if it exists to avoid re-fetching everything
    if METADATA_FILE.exists():
        try:
            with METADATA_FILE.open("r", encoding="utf-8") as f:
                metadata = json.load(f)
        except Exception as e:
            logging.warning(f"Error loading existing metadata: {e}")

    for ticker_symbol in tickers:
        # Skip if already fetched and has valid info
        if ticker_symbol in metadata and (
            metadata[ticker_symbol].get("sector")
            or metadata[ticker_symbol].get("quoteType") in ["ETF", "MUTUALFUND"]
        ):
            continue

        yf_symbol = TICKER_MAP.get(ticker_symbol, ticker_symbol)
        logging.info(f"Fetching metadata for {ticker_symbol} (using {yf_symbol})...")
        try:
            ticker = yf.Ticker(yf_symbol)
            info = ticker.info

            # Use sector if available, otherwise fallback to quoteType
            sector = info.get("sector")
            quote_type = info.get("quoteType")

            metadata[ticker_symbol] = {
                "sector": sector,
                "industry": info.get("industry"),
                "quoteType": quote_type,
                "longName": info.get("longName"),
                "symbol": ticker_symbol,
                "yf_symbol": yf_symbol,
            }
            logging.info(f"Success: {ticker_symbol} -> {sector or quote_type}")
        except Exception as e:
            logging.error(f"Error fetching {ticker_symbol}: {e}")
            if ticker_symbol not in metadata:
                metadata[ticker_symbol] = {"symbol": ticker_symbol, "error": str(e)}

    return metadata


def main():
    """Main function."""
    tickers = get_tickers_from_holdings()
    if not tickers:
        logging.warning("No tickers found in holdings.")
        return

    logging.info(f"Found {len(tickers)} tickers in holdings.")
    metadata = fetch_metadata(tickers)

    try:
        with METADATA_FILE.open("w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=4, ensure_ascii=False)
        logging.info(f"Metadata saved to {METADATA_FILE}")
    except Exception as e:
        logging.error(f"Error saving metadata: {e}")


if __name__ == "__main__":
    main()
