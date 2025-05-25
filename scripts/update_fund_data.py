import yfinance as yf
import json
from pathlib import Path
import logging
import argparse
from typing import List, Dict, Any, Optional

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def get_tickers_from_holdings(holdings_file_path: Path) -> List[str]:
    """Reads tickers from the holdings_details.json file."""
    try:
        with holdings_file_path.open('r', encoding='utf-8') as f:
            holdings_data: Dict[str, Any] = json.load(f)
        # Extract tickers (which are the keys of the dictionary)
        return list(holdings_data.keys())
    except FileNotFoundError:
        logging.error(f"Holdings file not found at {holdings_file_path}. No tickers to fetch.")
        return []
    except json.JSONDecodeError:
        logging.error(f"Could not decode JSON from {holdings_file_path}. Ensure it's a valid JSON dictionary.")
        return []
    except Exception as e:
        logging.error(f"Error reading tickers from {holdings_file_path}: {e}")
        return []

def get_prices(ticker_list: List[str]) -> Dict[str, Optional[float]]:
    """
    Fetches the current or regular market price for a list of tickers.
    Returns a dictionary with ticker symbols as keys and their prices (float) or None as values.
    """
    data: Dict[str, Optional[float]] = {}
    for ticker_symbol in ticker_list:
        try:
            ticker = yf.Ticker(ticker_symbol)
            # Try to get 'regularMarketPrice', fallback to 'currentPrice' or 'previousClose'
            info = ticker.info
            price = info.get('regularMarketPrice')
            if price is None:
                price = info.get('currentPrice')
            if price is None:
                price = info.get('previousClose')

            if price is not None:
                data[ticker_symbol] = float(price) # Ensure it's a float
                logging.info(f"Fetched price for {ticker_symbol}: {price}")
            else:
                logging.warning(f"Could not fetch price for {ticker_symbol}. Check ticker or data availability. Storing as None.")
                data[ticker_symbol] = None
        except Exception as e:
            logging.error(f"Error fetching data for {ticker_symbol}: {e}")
            data[ticker_symbol] = None # Store None on error
    return data

def main(holdings_path: Path, output_path: Path) -> None:
    """Main function to fetch tickers and their prices, then save to a file."""
    tickers_to_fetch = get_tickers_from_holdings(holdings_path)
    if tickers_to_fetch:
        logging.info(f"Found {len(tickers_to_fetch)} tickers: {', '.join(tickers_to_fetch)}")
        prices_data = get_prices(tickers_to_fetch)
        
        try:
            output_path.parent.mkdir(parents=True, exist_ok=True) # Ensure output directory exists
            with output_path.open('w', encoding='utf-8') as f:
                json.dump(prices_data, f, indent=4, ensure_ascii=False)
            logging.info(f"Data successfully written to {output_path}")
        except IOError as e:
            logging.error(f"Could not write data to {output_path}: {e}")
        except Exception as e:
            logging.error(f"An unexpected error occurred while writing to {output_path}: {e}")
    else:
        logging.warning("No tickers to fetch. Output file will not be updated/created.")

if __name__ == "__main__":
    # Define base directory assuming script is in project_root/scripts/
    BASE_DIR = Path(__file__).resolve().parent.parent
    
    parser = argparse.ArgumentParser(description="Fetch market prices for tickers listed in a holdings file.")
    parser.add_argument("--holdings", type=Path, default=BASE_DIR / "data" / "holdings_details.json",
                        help="Path to the holdings JSON file.")
    parser.add_argument("--output", type=Path, default=BASE_DIR / "data" / "fund_data.json",
                        help="Path to the output JSON file for fund data.")
    args = parser.parse_args()

    main(args.holdings, args.output)