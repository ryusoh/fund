import yfinance as yf
import json
from pathlib import Path

# Define the tickers you want to track
# These should match the data-ticker attributes in your HTML
TICKERS = ["VT", "ANET", "GOOG", "PDD", "BRK-B", "OXY", "GEO"] # Add more tickers as needed

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
    prices_data = get_prices(TICKERS)
    output_file = Path(__file__).parent / "fund_data.json"
    with open(output_file, 'w') as f:
        json.dump(prices_data, f, indent=4)
    print(f"Data written to {output_file}")