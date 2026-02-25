#!/usr/bin/env python3

"""
Updates the historical portfolio value CSV with the latest daily data.
"""

import csv
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional, cast
from zoneinfo import ZoneInfo

import pandas as pd
import yfinance as yf

# --- Configuration ---
REPO_PATH = Path(__file__).resolve().parents[2]
HOLDINGS_FILE = REPO_PATH / "data" / "holdings_details.json"
FOREX_FILE = REPO_PATH / "data" / "fx_data.json"
HISTORICAL_CSV = REPO_PATH / "data" / "historical_portfolio_values.csv"
# --- End Configuration ---


def load_json_data(file_path: Path) -> Optional[Dict[str, Any]]:
    if not file_path.exists():
        print(f"Error: Data file not found at {file_path}", file=sys.stderr)
        return None
    try:
        with file_path.open("r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, dict):
                return cast(Dict[str, Any], data)
            print(
                f"Error: Expected a JSON object in {file_path}, got {type(data).__name__}",
                file=sys.stderr,
            )
            return None
    except (json.JSONDecodeError, IOError) as e:
        print(f"Error reading or parsing {file_path}: {e}", file=sys.stderr)
        return None


def calculate_daily_values(holdings: Dict, forex: Dict) -> Dict[str, Any]:
    total_value_usd = 0.0
    fx_rates = forex.get("rates", {}).copy()
    fx_rates["USD"] = 1.0

    for ticker, holding_details in holdings.items():
        try:
            shares = float(holding_details["shares"])
            ticker_obj = yf.Ticker(ticker)
            hist = ticker_obj.history(period="5d")
            if hist.empty:
                print(
                    f"Warning: Could not get historical data for {ticker}. Skipping.",
                    file=sys.stderr,
                )
                continue

            market_price = hist["Close"].iloc[-1]
            currency = "USD"

            fx_to_usd = fx_rates.get(currency)
            if fx_to_usd is None:
                print(
                    f"Warning: Missing FX rate for {currency}. Assuming 1.0.",
                    file=sys.stderr,
                )
                fx_to_usd = 1.0

            value_in_usd = (shares * market_price) / fx_to_usd
            total_value_usd += value_in_usd
        except (ValueError, TypeError) as e:
            print(
                f"Warning: Could not process ticker {ticker}. Details: {e}",
                file=sys.stderr,
            )
        except Exception as e:
            print(
                f"Warning: An error occurred while fetching data for {ticker}: {e}",
                file=sys.stderr,
            )

    daily_values = {}
    for ccy, rate in fx_rates.items():
        daily_values[f"value_{ccy.lower()}"] = total_value_usd * rate

    return daily_values


def _get_latest_trading_day() -> str:
    """Get the most recent trading day's date (YYYY-MM-DD format).

    Uses yfinance to fetch SPY history and find the latest date with data.
    Falls back to previous business day if market data is not available.
    """
    try:
        spy = yf.Ticker("SPY")
        hist = spy.history(period="2d")
        if not hist.empty:
            latest_date = hist.index[-1].date()
            return str(latest_date.strftime("%Y-%m-%d"))
    except Exception:
        pass

    # Fallback: use previous business day
    today = datetime.now(ZoneInfo("America/New_York"))
    prev_day = today - pd.Timedelta(days=1)
    while prev_day.weekday() >= 5:  # Skip weekends
        prev_day -= pd.Timedelta(days=1)
    return str(prev_day.strftime("%Y-%m-%d"))


def main():
    print("Starting daily portfolio value update...")

    all_data = {
        "holdings": load_json_data(HOLDINGS_FILE),
        "forex": load_json_data(FOREX_FILE),
    }

    if not all(all_data.values()):
        print("One or more essential data files are missing. Aborting.", file=sys.stderr)
        sys.exit(1)

    print("Calculating current portfolio value...")
    current_values = calculate_daily_values(**all_data)

    today_str = datetime.now(ZoneInfo("America/New_York")).strftime("%Y-%m-%d")

    header = []
    last_date = None
    file_content = ""
    if HISTORICAL_CSV.exists():
        with HISTORICAL_CSV.open("r", encoding="utf-8") as f:
            file_content = f.read()
            f.seek(0)
            reader = csv.reader(file_content.splitlines())
            try:
                header = next(reader)
                all_rows = list(reader)
                if all_rows:
                    last_date = all_rows[-1][0]
            except StopIteration:
                pass

    if not header:
        header = ["date"] + list(current_values.keys())
        with HISTORICAL_CSV.open("w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(header)
        with HISTORICAL_CSV.open("r", encoding="utf-8") as f:
            file_content = f.read()

    # Check if the last row might have stale data
    # This happens when a previous run fetched data before market close
    if last_date:
        latest_trading_day = _get_latest_trading_day()
        if last_date < latest_trading_day:
            print(
                f"Warning: Last entry ({last_date}) is older than latest trading day ({latest_trading_day})."
            )
            print("This may indicate stale data from a previous run. Recomputing...")

            # Recalculate and update the last row
            recalculated_values = calculate_daily_values(**all_data)
            recalculated_row = [last_date] + [
                recalculated_values.get(col, "") for col in header[1:]
            ]

            # Update the last row in file_content
            lines = file_content.splitlines()
            if lines:
                lines[-1] = ",".join(str(v) for v in recalculated_row)
                file_content = "\n".join(lines) + "\n"
                print(f"Updated stale data for {last_date} with fresh values.")

                # Re-read to get updated last_date for comparison
                last_date = recalculated_row[0]

    if last_date == today_str:
        print(f"An entry for {today_str} already exists. Aborting to prevent a duplicate entry.")
        df_display = pd.read_csv(HISTORICAL_CSV)
        print("\nLatest data:")
        print(df_display.tail())
        sys.exit(0)

    new_row = [today_str] + [current_values.get(col, "") for col in header[1:]]

    if not file_content.endswith("\n"):
        file_content += "\n"

    from io import StringIO

    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(new_row)
    file_content += output.getvalue()

    with HISTORICAL_CSV.open("w", encoding="utf-8") as f:
        f.write(file_content)

    print(f"Successfully appended data for {today_str} to {HISTORICAL_CSV}")
    df_display = pd.read_csv(HISTORICAL_CSV)
    print("\nLatest data:")
    print(df_display.tail())


if __name__ == "__main__":
    main()
