import argparse
import atexit
import json
import logging
import os
import shutil
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
import pytz
import requests
import yfinance as yf
from polygon import RESTClient

# Configure yfinance to use a temporary directory for timezone cache to avoid [Errno 17] in CI
# Use a secure temporary directory to avoid security vulnerabilities
cache_dir = Path(tempfile.mkdtemp(prefix="yf-cache-"))
yf.set_tz_cache_location(str(cache_dir))
atexit.register(shutil.rmtree, cache_dir, ignore_errors=True)

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")


def get_tickers_from_holdings(holdings_file_path: Path) -> List[str]:
    """Reads tickers from the holdings_details.json file."""
    try:
        with holdings_file_path.open("r", encoding="utf-8") as f:
            holdings_data: Dict[str, Any] = json.load(f)
        return list(holdings_data.keys())
    except FileNotFoundError:
        logging.error(f"Holdings file not found at {holdings_file_path}. No tickers to fetch.")
        return []
    except json.JSONDecodeError:
        logging.error(
            f"Could not decode JSON from {holdings_file_path}. Ensure it's a valid JSON dictionary."
        )
        return []
    except Exception as e:
        logging.error(f"Error reading tickers from {holdings_file_path}: {e}")
        return []


def get_alpaca_prices(ticker_list: List[str]) -> Dict[str, Optional[float]]:
    """
    Fetches latest prices using Alpaca Market Data API.
    """
    data: Dict[str, Optional[float]] = {t: None for t in ticker_list}
    if not ticker_list:
        return data

    api_key = os.environ.get("ALPACA_API_KEY")
    api_secret = os.environ.get("ALPACA_API_SECRET")

    if not api_key or not api_secret:
        logging.error("Missing Alpaca API credentials. Cannot fetch from Alpaca.")
        return data

    try:
        symbols = ",".join(ticker_list)
        headers = {
            "APCA-API-KEY-ID": api_key,
            "APCA-API-SECRET-KEY": api_secret,
            "Accept": "application/json",
        }

        # Determine if we should use the overnight feed (8 PM - 4 AM ET)
        et_tz = pytz.timezone("US/Eastern")
        et_now = datetime.now(et_tz)
        is_overnight = et_now.hour >= 20 or et_now.hour < 4

        params = {"symbols": symbols}
        if is_overnight:
            params["feed"] = "overnight"
            logging.info(
                f"Using 'overnight' feed for Alpaca 24/5 data (ET time: {et_now.strftime('%H:%M')})"
            )

        # Using Alpaca Snapshots endpoint for multiple tickers
        url = "https://data.alpaca.markets/v2/stocks/snapshots"
        resp = requests.get(url, params=params, headers=headers)
        logging.info(f"Alpaca API Response Status: {resp.status_code}")
        resp.raise_for_status()
        snapshots = resp.json()
        logging.info(f"Alpaca Snapshots data for: {list(snapshots.keys())}")

        for ticker in ticker_list:
            snapshot = snapshots.get(ticker)
            if snapshot and "latestTrade" in snapshot:
                price = snapshot["latestTrade"].get("p")
                if price:
                    data[ticker] = float(price)
                    logging.info(f"Fetched price for {ticker} from Alpaca: {price}")

    except Exception as e:
        logging.error(f"Error fetching from Alpaca: {e}")

    return data


def get_prices(ticker_list: List[str]) -> Dict[str, Optional[float]]:
    """
    Fetches the latest prices for a list of tickers.
    Prioritizes Alpaca during overnight hours (8 PM - 4 AM ET).
    Prioritizes yfinance during standard/extended hours (4 AM - 8 PM ET).
    Polygon.io is the final failsafe.
    """
    data: Dict[str, Optional[float]] = {t: None for t in ticker_list}

    if not ticker_list:
        return data

    def fetch_from_alpaca(tickers: List[str]):
        logging.info(f"Trying to fetch prices from Alpaca for: {', '.join(tickers)}")
        alpaca_prices = get_alpaca_prices(tickers)
        for t, p in alpaca_prices.items():
            if p is not None:
                data[t] = p

    def fetch_from_yfinance(tickers: List[str]):
        logging.info(f"Trying to fetch prices from yfinance for: {', '.join(tickers)}")
        try:
            hist = yf.download(tickers, period="1d", interval="1m", prepost=True, progress=False)
            if "Close" in hist:
                close_data = hist["Close"]
                if isinstance(close_data, pd.DataFrame):
                    for t in tickers:
                        if t in close_data.columns:
                            col = close_data[t].dropna()
                            if not col.empty:
                                data[t] = float(col.iloc[-1])
                                logging.info(f"Fetched price for {t} from yfinance: {data[t]}")
                else:
                    col = close_data.dropna()
                    if not col.empty:
                        t = tickers[0]
                        data[t] = float(col.iloc[-1])
                        logging.info(f"Fetched price for {t} from yfinance: {data[t]}")
        except Exception as e:
            logging.warning(f"yfinance download failed: {e}")

    # Determine priority based on US/Eastern time
    et_tz = pytz.timezone("US/Eastern")
    et_now = datetime.now(et_tz)
    is_overnight = et_now.hour >= 20 or et_now.hour < 4

    if is_overnight:
        logging.info(
            f"Overnight session detected ({et_now.strftime('%H:%M')} ET). Prioritizing Alpaca."
        )
        # Try Alpaca first
        fetch_from_alpaca(ticker_list)
        # Fallback to yfinance
        missing = [t for t in ticker_list if data[t] is None]
        if missing:
            fetch_from_yfinance(missing)
    else:
        logging.info(
            f"Standard/Extended session detected ({et_now.strftime('%H:%M')} ET). Prioritizing yfinance."
        )
        # Try yfinance first
        fetch_from_yfinance(ticker_list)
        # Fallback to Alpaca
        missing = [t for t in ticker_list if data[t] is None]
        if missing:
            fetch_from_alpaca(missing)

    # Final fallback: Polygon.io
    tickers_for_polygon = [t for t in ticker_list if data[t] is None]
    if tickers_for_polygon:
        logging.info(f"Final fallback to Polygon.io for: {', '.join(tickers_for_polygon)}")
        try:
            api_key = os.environ["POLYGON_KEY"]
            with RESTClient(api_key) as client:
                try:
                    snapshots = client.get_snapshot_all(
                        market_type="stocks", tickers=tickers_for_polygon
                    )
                    if snapshots:
                        for snapshot in snapshots:
                            t = snapshot.ticker
                            if (
                                t in tickers_for_polygon
                                and hasattr(snapshot, "last_trade")
                                and snapshot.last_trade
                            ):
                                p = snapshot.last_trade.price
                                if p:
                                    data[t] = float(p)
                                    logging.info(f"Fetched price for {t} from Polygon.io: {p}")
                except Exception as e:
                    logging.error(f"Error fetching snapshots from Polygon.io: {e}")
        except KeyError:
            logging.error(
                "Missing environment variable: POLYGON_KEY. Cannot fetch from Polygon.io."
            )
        except Exception as e:
            logging.error(f"An error occurred with Polygon.io: {e}")

    return data


def main(holdings_path: Path, output_path: Path) -> None:
    """Main function to fetch tickers and their prices, then save to a file."""
    tickers_to_fetch = get_tickers_from_holdings(holdings_path)
    if not tickers_to_fetch:
        logging.warning("No tickers to fetch. Output file will not be updated/created.")
        return

    logging.info(f"Found {len(tickers_to_fetch)} tickers: {', '.join(tickers_to_fetch)}")

    existing_prices_data: Dict[str, Optional[float]] = {}
    if output_path.exists():
        try:
            with output_path.open("r", encoding="utf-8") as f:
                existing_prices_data = json.load(f)
            if not isinstance(existing_prices_data, dict):
                logging.warning(
                    f"Existing data in {output_path} is not a dictionary. Will overwrite with new fetch."
                )
                existing_prices_data = {}
        except json.JSONDecodeError:
            logging.warning(
                f"Could not decode JSON from {output_path}. Will overwrite with new fetch."
            )
            existing_prices_data = {}
        except Exception as e:
            logging.error(
                f"Error reading existing data from {output_path}: {e}. Will attempt to overwrite with new fetch."
            )
            existing_prices_data = {}

    newly_fetched_prices = get_prices(tickers_to_fetch)

    final_prices_data: Dict[str, Optional[float]] = {}
    for ticker in tickers_to_fetch:
        new_price = newly_fetched_prices.get(ticker)

        if new_price is not None:
            final_prices_data[ticker] = new_price
        else:
            existing_price = existing_prices_data.get(ticker)
            if existing_price is not None:
                final_prices_data[ticker] = existing_price
                logging.info(
                    f"Fetched price for {ticker} is None. Retaining existing price: {existing_price}"
                )
            else:
                final_prices_data[ticker] = None

    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with output_path.open("w", encoding="utf-8") as f:
            json.dump(final_prices_data, f, indent=4, ensure_ascii=False)
            f.write("\n")
        logging.info(f"Data successfully written to {output_path}")
    except IOError as e:
        logging.error(f"Could not write data to {output_path}: {e}")
    except Exception as e:
        logging.error(f"An unexpected error occurred while writing to {output_path}: {e}")


if __name__ == "__main__":
    BASE_DIR = Path(__file__).resolve().parents[2]

    parser = argparse.ArgumentParser(
        description="Fetch market prices using yfinance with a Polygon.io fallback."
    )
    parser.add_argument(
        "--holdings",
        type=Path,
        default=BASE_DIR / "data" / "holdings_details.json",
        help="Path to the holdings JSON file.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=BASE_DIR / "data" / "fund_data.json",
        help="Path to the output JSON file for fund data.",
    )
    args = parser.parse_args()

    main(args.holdings, args.output)
