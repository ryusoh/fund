import yfinance as yf
import json
from datetime import datetime, timezone
import os

FX_DATA_FILE = os.path.join(os.path.dirname(__file__), '..', 'data', 'fx_data.json')
CURRENCIES = ["CNY", "JPY"] # Currencies to get rates against USD

def fetch_forex_data():
    print("Fetching forex data...")
    rates = {"USD": 1.0}
    has_errors = False

    for currency in CURRENCIES:
        try:
            ticker_symbol = f"USD{currency}=X"
            data = yf.Ticker(ticker_symbol)
            hist = data.history(period="1d")
            if not hist.empty:
                latest_price = hist['Close'].iloc[-1]
                rates[currency] = round(latest_price, 4)
                print(f"Fetched USD/{currency}: {rates[currency]}")
            else:
                print(f"Warning: No data for USD/{currency}")
                has_errors = True
        except Exception as e:
            print(f"Error fetching USD/{currency}: {e}")
            has_errors = True

    if not has_errors or len(rates) > 1: # Proceed if at least USD is there, or some rates fetched
        output = {
            "base": "USD",
            "rates": rates,
            "last_updated": datetime.now(timezone.utc).isoformat()
        }
        with open(FX_DATA_FILE, 'w') as f:
            json.dump(output, f, indent=2)
        print(f"Forex data updated in {FX_DATA_FILE}")
    else:
        print("Failed to fetch significant new forex data. File not updated.")

if __name__ == "__main__":
    fetch_forex_data()