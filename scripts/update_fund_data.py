import argparse
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import yfinance as yf
from polygon import RESTClient

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


def get_prices(ticker_list: List[str]) -> Dict[str, Optional[float]]:
    """
    Fetches the latest prices for a list of tickers.
    Tries yfinance first, falls back to Polygon.io for overnight data.
    """
    data: Dict[str, Optional[float]] = {}

    # Try yfinance first
    for ticker_symbol in ticker_list:
        try:
            ticker = yf.Ticker(ticker_symbol)
            hist = ticker.history(period="1d", interval="1m", prepost=True)
            if not hist.empty:
                price = hist["Close"].iloc[-1]
                data[ticker_symbol] = float(price)
                logging.info(f"Fetched price for {ticker_symbol} from yfinance: {price}")
            else:
                data[ticker_symbol] = None
        except Exception as e:
            logging.warning(f"yfinance failed for {ticker_symbol}: {e}. Will try Polygon.io.")
            data[ticker_symbol] = None

    tickers_for_polygon = [ticker for ticker, price in data.items() if price is None]

    if tickers_for_polygon:
        logging.info(
            f"Trying to fetch overnight prices from Polygon.io for: {', '.join(tickers_for_polygon)}"
        )
        try:
            api_key = os.environ["POLYGON_KEY"]
            with RESTClient(api_key) as client:
                for ticker_symbol in tickers_for_polygon:
                    try:
                        last_trade = client.get_last_trade(ticker_symbol)
                        if hasattr(last_trade, "price"):
                            price = last_trade.price
                            data[ticker_symbol] = float(price)
                            logging.info(
                                f"Fetched price for {ticker_symbol} from Polygon.io: {price}"
                            )
                        else:
                            logging.warning(
                                f"Could not fetch price for {ticker_symbol} from Polygon.io."
                            )
                    except Exception as e:
                        logging.error(f"Error fetching {ticker_symbol} from Polygon.io: {e}")

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
        logging.info(f"Data successfully written to {output_path}")
    except IOError as e:
        logging.error(f"Could not write data to {output_path}: {e}")
    except Exception as e:
        logging.error(f"An unexpected error occurred while writing to {output_path}: {e}")


if __name__ == "__main__":
    BASE_DIR = Path(__file__).resolve().parent.parent

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
