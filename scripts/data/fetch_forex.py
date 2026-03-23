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

    # Initialize new row with proper types
    new_row: dict = {}
    for col in ordered_columns:
        if col == "date":
            new_row[col] = today
        else:
            new_row[col] = None  # Use None instead of pd.NA

    for currency, value in rates.items():
        if currency in new_row:
            new_row[currency] = value

    new_df = pd.DataFrame([new_row], columns=ordered_columns)
    df = pd.concat([df, new_df], ignore_index=True)

    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["date"]).sort_values("date")
    df["date"] = df["date"].dt.strftime("%Y-%m-%d")

    for column in ordered_columns:
        if column != "date":
            df[column] = pd.to_numeric(df[column], errors="coerce")

    df.to_csv(FX_DAILY_RATES_FILE, index=False, float_format="%.6f")
    print(f"Forex daily rates updated in {FX_DAILY_RATES_FILE}")


def _load_previous_rates() -> dict[str, float]:
    """Return the last row of fx_daily_rates.csv as {CURRENCY: value}, skipping NaN."""
    if not os.path.exists(FX_DAILY_RATES_FILE):
        return {}
    try:
        df = pd.read_csv(FX_DAILY_RATES_FILE)
        df.columns = ["date" if c.lower() == "date" else c.strip().upper() for c in df.columns]
        df["date"] = pd.to_datetime(df["date"], errors="coerce")
        df = df.dropna(subset=["date"]).sort_values("date")
        if df.empty:
            return {}
        last = df.iloc[-1]
        return {
            col: float(last[col]) for col in df.columns if col != "date" and pd.notna(last[col])
        }
    except Exception as e:
        print(f"Warning: could not read previous rates from CSV: {e}")
        return {}


def _fetch_single(currency: str) -> float | None:
    """Fetch a single currency rate via yfinance; return the rate or None on failure."""
    ticker = f"USD{currency}=X"
    try:
        data = yf.download(ticker, period="2d", progress=False)
        if data.empty:
            return None
        close = data["Close"] if "Close" in data.columns else data
        if isinstance(close, pd.DataFrame):
            close = close.iloc[:, 0]
        s = close.dropna()
        return float(s.iloc[-1]) if not s.empty else None
    except Exception as e:
        print(f"Error fetching USD/{currency} individually: {e}")
        return None


def fetch_forex_data():
    print("Fetching forex data...")
    json_rates = {"USD": 1.0}
    csv_rates = {"USD": 1.0}
    failed_currencies: list[str] = []
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

    tickers = [f"USD{currency}=X" for currency in currencies_to_fetch]

    try:
        # Fetch all tickers in a single batch
        data = yf.download(tickers, period="1d")

        if "Close" in data.columns:
            close_data = data["Close"]
            for currency in currencies_to_fetch:
                ticker = f"USD{currency}=X"
                try:
                    s = None
                    if isinstance(close_data, pd.DataFrame):
                        if ticker in close_data.columns:
                            s = close_data[ticker].dropna()
                    elif isinstance(close_data, pd.Series):
                        # With yfinance.download, sometimes a single valid ticker might return a Series
                        if len(tickers) == 1 or close_data.name == ticker:
                            s = close_data.dropna()

                    if s is not None and not s.empty:
                        latest_price = float(s.iloc[-1])
                        json_rates[currency] = round(latest_price, 4)
                        csv_rates[currency] = round(latest_price, 6)
                        print(f"Fetched USD/{currency}: {json_rates[currency]}")
                    else:
                        print(f"Warning: No data for USD/{currency}")
                        failed_currencies.append(currency)
                except Exception as e:
                    print(f"Error processing USD/{currency}: {e}")
                    failed_currencies.append(currency)
        else:
            print("Warning: 'Close' prices not found in fetched data.")
            failed_currencies.extend(currencies_to_fetch)
    except Exception as e:
        print(f"Error during batch fetching forex data: {e}")
        failed_currencies.extend(currencies_to_fetch)

    # Retry failed currencies individually, then fall back to yesterday's value
    if failed_currencies:
        previous_rates = _load_previous_rates()
        for currency in failed_currencies:
            rate = _fetch_single(currency)
            if rate is not None:
                json_rates[currency] = round(rate, 4)
                csv_rates[currency] = round(rate, 6)
                print(f"Fetched USD/{currency} (retry): {json_rates[currency]}")
            elif currency in previous_rates:
                json_rates[currency] = round(previous_rates[currency], 4)
                csv_rates[currency] = round(previous_rates[currency], 6)
                print(f"USD/{currency}: retry failed, using previous value {json_rates[currency]}")
            else:
                print(f"USD/{currency}: no data and no previous value available")

    if len(json_rates) > 1:  # Proceed if at least one non-USD rate was obtained
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
