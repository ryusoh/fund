import json
import os
from datetime import datetime, timezone

import yfinance as yf

FX_DATA_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "data", "fx_data.json")
# Default currencies to fetch if fx_data.json is not found or is empty
DEFAULT_CURRENCIES = ["CNY", "JPY", "KRW"]


def fetch_forex_data():
    print("Fetching forex data...")
    rates = {"USD": 1.0}
    has_errors = False
    currencies_to_fetch = DEFAULT_CURRENCIES

    try:
        if os.path.exists(FX_DATA_FILE):
            with open(FX_DATA_FILE, "r") as f:
                data = json.load(f)
                if "rates" in data and isinstance(data["rates"], dict):
                    # Get currencies from the file, excluding USD
                    file_currencies = [key for key in data["rates"].keys() if key != "USD"]
                    if file_currencies:  # If there are currencies other than USD in the file
                        currencies_to_fetch = file_currencies
    except Exception as e:
        print(
            f"Could not read or parse {FX_DATA_FILE} to determine currencies: {e}. Using default list."
        )

    for currency in currencies_to_fetch:
        try:
            ticker_symbol = f"USD{currency}=X"
            data = yf.Ticker(ticker_symbol)
            hist = data.history(period="1d")
            if not hist.empty:
                latest_price = hist["Close"].iloc[-1]
                rates[currency] = round(latest_price, 4)
                print(f"Fetched USD/{currency}: {rates[currency]}")
            else:
                print(f"Warning: No data for USD/{currency}")
                has_errors = True
        except Exception as e:
            print(f"Error fetching USD/{currency}: {e}")
            has_errors = True

    if not has_errors or len(rates) > 1:  # Proceed if at least USD is there, or some rates fetched
        output = {
            "base": "USD",
            "rates": rates,
            "last_updated": datetime.now(timezone.utc).isoformat(),
        }
        with open(FX_DATA_FILE, "w") as f:
            json.dump(output, f, indent=4)
            f.write("\n")
        print(f"Forex data updated in {FX_DATA_FILE}")
    else:
        print("Failed to fetch significant new forex data. File not updated.")


if __name__ == "__main__":
    fetch_forex_data()
