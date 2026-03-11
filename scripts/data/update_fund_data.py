import argparse
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
import requests
import yfinance as yf
from polygon import RESTClient

# Configure yfinance to use a temporary directory for timezone cache to avoid [Errno 17] in CI
yf.set_tz_cache_location("/tmp/yf-cache")

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


def get_pyth_prices(ticker_list: List[str]) -> Dict[str, Optional[float]]:
    """
    Fetches prices using Pyth Network Hermes API.
    Specifically looks for overnight (.ON) feeds.
    """
    data: Dict[str, Optional[float]] = {}
    if not ticker_list:
        return data

    # 1. Get Feed IDs for tickers
    ticker_to_id = {}
    for ticker in ticker_list:
        try:
            target_symbol = f"Equity.US.{ticker}/USD.ON"
            resp = requests.get(
                "https://hermes.pyth.network/v2/price_feeds",
                params={"query": ticker, "asset_type": "equity"},
            )
            resp.raise_for_status()
            feeds = resp.json()
            for feed in feeds:
                attributes = feed.get("attributes", {})
                if attributes.get("symbol") == target_symbol:
                    ticker_to_id[ticker] = feed["id"]
                    break
        except Exception as e:
            logging.warning(f"Failed to find Pyth feed ID for {ticker}: {e}")

    if not ticker_to_id:
        return {t: None for t in ticker_list}

    # 2. Fetch Latest Prices using IDs
    ids_to_fetch = list(ticker_to_id.values())
    try:
        params = [("ids[]", feed_id) for feed_id in ids_to_fetch]
        resp = requests.get("https://hermes.pyth.network/v2/updates/price/latest", params=params)
        resp.raise_for_status()
        updates = resp.json().get("parsed", [])

        id_to_price = {}
        for update in updates:
            feed_id = update["id"]
            price_info = update.get("price", {})
            price_str = price_info.get("price")
            expo = price_info.get("expo")
            if price_str is not None and expo is not None:
                actual_price = float(price_str) * (10 ** int(expo))
                id_to_price[feed_id] = actual_price

        for ticker in list(ticker_to_id.keys()):
            feed_id = ticker_to_id.get(ticker)
            if feed_id and feed_id in id_to_price:
                price = id_to_price[feed_id]
                data[ticker] = price
                logging.info(f"Fetched overnight price for {ticker} from Pyth Network: {price}")
            else:
                data[ticker] = None

    except Exception as e:
        logging.warning(f"Failed to fetch Pyth prices: {e}")
        for ticker in list(ticker_to_id.keys()):
            data[ticker] = None

    return data


def get_prices(ticker_list: List[str]) -> Dict[str, Optional[float]]:
    """
    Fetches the latest prices for a list of tickers.
    Tries yfinance first, falls back to Polygon.io for overnight data.
    """
    data: Dict[str, Optional[float]] = {}

    if not ticker_list:
        return data

    # Try yfinance first (batched)
    try:
        hist = yf.download(ticker_list, period="1d", interval="1m", prepost=True, progress=False)

        if "Close" in hist:
            close_data = hist["Close"]

            # If it's a single ticker, close_data is a Series. If multiple, it's a DataFrame.
            if isinstance(close_data, pd.DataFrame):
                for ticker_symbol in ticker_list:
                    if ticker_symbol in close_data.columns:
                        col = close_data[ticker_symbol].dropna()
                        if not col.empty:
                            price = float(col.iloc[-1])
                            data[ticker_symbol] = price
                            logging.info(
                                f"Fetched price for {ticker_symbol} from yfinance: {price}"
                            )
                        else:
                            data[ticker_symbol] = None
                    else:
                        data[ticker_symbol] = None
            else:
                col = close_data.dropna()
                ticker_symbol = ticker_list[0]
                if not col.empty:
                    price = float(col.iloc[-1])
                    data[ticker_symbol] = price
                    logging.info(f"Fetched price for {ticker_symbol} from yfinance: {price}")
                else:
                    data[ticker_symbol] = None
        else:
            for ticker_symbol in ticker_list:
                data[ticker_symbol] = None

    except Exception as e:
        logging.warning(f"yfinance batch download failed: {e}. Will try fallbacks.")
        for ticker_symbol in ticker_list:
            data[ticker_symbol] = None

    tickers_for_pyth = [ticker for ticker, price in data.items() if price is None]

    if not tickers_for_pyth:
        return data

    logging.info(
        f"Trying to fetch overnight prices from Pyth Network for: {', '.join(tickers_for_pyth)}"
    )
    pyth_prices = get_pyth_prices(tickers_for_pyth)
    for ticker, pyth_price in pyth_prices.items():
        if pyth_price is not None:
            data[ticker] = pyth_price

    tickers_for_polygon = [ticker for ticker, price in data.items() if price is None]

    if not tickers_for_polygon:
        return data

    logging.info(
        f"Trying to fetch overnight prices from Polygon.io for: {', '.join(tickers_for_polygon)}"
    )
    try:
        api_key = os.environ["POLYGON_KEY"]
        with RESTClient(api_key) as client:
            try:
                snapshots = client.get_snapshot_all(
                    market_type="stocks", tickers=tickers_for_polygon
                )

                if not snapshots:
                    logging.warning("No snapshots returned from Polygon.io.")
                else:
                    for snapshot in snapshots:
                        ticker_symbol = snapshot.ticker
                        if not ticker_symbol or ticker_symbol not in tickers_for_polygon:
                            continue

                        if hasattr(snapshot, "last_trade") and snapshot.last_trade is not None:
                            last_trade = snapshot.last_trade
                            if hasattr(last_trade, "price") and last_trade.price is not None:
                                price = last_trade.price
                                data[ticker_symbol] = float(price)
                                logging.info(
                                    f"Fetched price for {ticker_symbol} from Polygon.io: {price}"
                                )
                            else:
                                logging.warning(
                                    f"Could not fetch price for {ticker_symbol} from Polygon.io snapshot (price missing)."
                                )
                        else:
                            logging.warning(
                                f"Could not fetch price for {ticker_symbol} from Polygon.io snapshot (last_trade missing)."
                            )
            except Exception as e:
                logging.error(f"Error fetching snapshots from Polygon.io: {e}")

    except KeyError:
        logging.error("Missing environment variable: POLYGON_KEY. Cannot fetch from Polygon.io.")
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
