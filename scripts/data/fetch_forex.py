import json
import os
from datetime import datetime, timezone

import pandas as pd
import yfinance as yf

BASE_DIR = os.path.dirname(__file__)
DATA_DIR = os.path.join(BASE_DIR, "..", "..", "data")
FX_DATA_FILE = os.path.join(DATA_DIR, "fx_data.json")
FX_DAILY_RATES_FILE = os.path.join(DATA_DIR, "fx_daily_rates.csv")
# Default currencies to fetch if fx_data.json is not found or is empty
DEFAULT_CURRENCIES = ["CNY", "JPY", "KRW"]


def update_fx_daily_csv(rates: dict[str, float]) -> None:
    today = datetime.now(timezone.utc).date().strftime("%Y-%m-%d")

    if os.path.exists(FX_DAILY_RATES_FILE):
        df = pd.read_csv(FX_DAILY_RATES_FILE)
        normalized_columns = []
        for column in df.columns:
            if column.lower() == "date":
                normalized_columns.append("date")
            else:
                normalized_columns.append(column.strip().upper())
        df.columns = normalized_columns
    else:
        df = pd.DataFrame(columns=["date"])

    for currency in rates.keys():
        if currency not in df.columns:
            df[currency] = pd.NA

    existing_currency_columns = [col for col in df.columns if col != "date"]
    currency_order = existing_currency_columns.copy()
    for currency in rates.keys():
        if currency != "date" and currency not in currency_order:
            currency_order.append(currency)

    ordered_columns = ["date"] + [col for col in currency_order if col != "date"]
    df = df[ordered_columns]

    df = df[df["date"].astype(str) != today]

    new_row = {column: pd.NA for column in ordered_columns}
    new_row["date"] = today
    for currency, value in rates.items():
        new_row[currency] = value

    df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)

    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["date"]).sort_values("date")
    df["date"] = df["date"].dt.strftime("%Y-%m-%d")

    for column in ordered_columns:
        if column != "date":
            df[column] = pd.to_numeric(df[column], errors="coerce")

    df.to_csv(FX_DAILY_RATES_FILE, index=False, float_format="%.6f")
    print(f"Forex daily rates updated in {FX_DAILY_RATES_FILE}")


def fetch_forex_data():
    print("Fetching forex data...")
    json_rates = {"USD": 1.0}
    csv_rates = {"USD": 1.0}
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
                latest_price = float(hist["Close"].iloc[-1])
                json_rates[currency] = round(latest_price, 4)
                csv_rates[currency] = round(latest_price, 6)
                print(f"Fetched USD/{currency}: {json_rates[currency]}")
            else:
                print(f"Warning: No data for USD/{currency}")
                has_errors = True
        except Exception as e:
            print(f"Error fetching USD/{currency}: {e}")
            has_errors = True

    if not has_errors or len(json_rates) > 1:  # Proceed if at least USD is there, or some rates fetched
        output = {
            "base": "USD",
            "rates": json_rates,
            "last_updated": datetime.now(timezone.utc).isoformat(),
        }
        with open(FX_DATA_FILE, "w") as f:
            json.dump(output, f, indent=4)
            f.write("\n")
        print(f"Forex data updated in {FX_DATA_FILE}")

        update_fx_daily_csv(csv_rates)
    else:
        print("Failed to fetch significant new forex data. File not updated.")


if __name__ == "__main__":
    fetch_forex_data()
