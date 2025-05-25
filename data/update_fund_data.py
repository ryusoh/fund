import yfinance as yf
import json
from pathlib import Path

def get_tickers_from_holdings(holdings_file_path):
    """Reads tickers from the holdings_details.json file."""
    try:
        with open(holdings_file_path, 'r') as f:
            holdings_data = json.load(f) # holdings_data will be a dict like {"AAPL": {...}, "MSFT": {...}}
        # Extract tickers (which are the keys of the dictionary)
        return list(holdings_data.keys())
    except FileNotFoundError:
        print(f"Error: Holdings file not found at {holdings_file_path}. No tickers to fetch.")
        return []
    except json.JSONDecodeError:
        print(f"Error: Could not decode JSON from {holdings_file_path}. Ensure it's a valid JSON dictionary.")
        return []
    except Exception as e:
        print(f"Error reading tickers from {holdings_file_path}: {e}")
        return []

def get_prices(ticker_list):
    """
    Fetches the current or regular market price for a list of tickers.
    """
    data = {}
    for ticker_symbol in ticker_list:
        try:
            ticker = yf.Ticker(ticker_symbol)
            # Try to get 'regularMarketPrice', fallback to 'currentPrice' or 'previousClose'
            price = ticker.info.get('regularMarketPrice', 
                                    ticker.info.get('currentPrice', 
                                    ticker.info.get('previousClose')))
            if price is not None:
                data[ticker_symbol] = price
                print(f"Fetched price for {ticker_symbol}: {price}")
            else:
                print(f"Could not fetch price for {ticker_symbol}. Check ticker or data availability.")
                data[ticker_symbol] = "N/A" # Or handle as you see fit
        except Exception as e:
            print(f"Error fetching data for {ticker_symbol}: {e}")
            data[ticker_symbol] = "Error"
    return data

if __name__ == "__main__":
    # Determine paths relative to the script's location
    script_dir = Path(__file__).parent
    holdings_file = script_dir / "holdings_details.json"
    output_file = script_dir / "fund_data.json"

    tickers_to_fetch = get_tickers_from_holdings(holdings_file)
    if tickers_to_fetch:
        prices_data = get_prices(tickers_to_fetch)
        with open(output_file, 'w') as f:
            json.dump(prices_data, f, indent=4)
        print(f"Data written to {output_file}")
    else:
        print("No tickers to fetch. fund_data.json will not be updated.")