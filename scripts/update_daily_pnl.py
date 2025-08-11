#!/usr/bin/env python3

"""
Updates the historical portfolio value CSV with the latest daily data.

This script performs an incremental update, which is much more efficient
for daily runs than recalculating the entire history. It does the following:
1. Loads the latest holdings, market data, and forex rates from their
   respective JSON files.
2. Calculates the current total portfolio value based on this data.
3. Reads the existing 'historical_portfolio_values.csv'.
4. Appends or updates the entry for the current day.
5. Saves the updated CSV file.
"""

import json
import sys
import csv
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from pathlib import Path
from typing import Dict, Any, Optional

import pandas as pd

# --- Configuration ---
REPO_PATH = Path(__file__).resolve().parent.parent
HOLDINGS_FILE = REPO_PATH / "data" / "holdings_details.json"
FUND_DATA_FILE = REPO_PATH / "data" / "fund_data.json"
FOREX_FILE = REPO_PATH / "data" / "fx_data.json"
HISTORICAL_CSV = REPO_PATH / "data" / "historical_portfolio_values.csv"
# --- End Configuration ---

def load_json_data(file_path: Path) -> Optional[Dict]:
    """Loads and returns data from a JSON file."""
    if not file_path.exists():
        print(f"Error: Data file not found at {file_path}", file=sys.stderr)
        return None
    try:
        with file_path.open('r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        print(f"Error reading or parsing {file_path}: {e}", file=sys.stderr)
        return None

def calculate_daily_values(holdings: Dict, fund_data: Dict, forex: Dict) -> Dict[str, Any]:
    """
    Calculates the total portfolio value in various currencies.
    This function is adapted from extract_pnl_history.py.
    """
    total_value_usd = 0.0
    fx_rates = forex.get('rates', {})
    fx_rates['USD'] = 1.0  # Base currency

    fund_info = {}
    # Handle both old and new fund_data.json formats
    if isinstance(fund_data.get('data'), list):
        fund_info = {item['ticker']: item for item in fund_data['data'] if 'ticker' in item}
    elif isinstance(fund_data, dict):
        fund_info = {
            ticker: {"price": price, "currency": "USD"}
            for ticker, price in fund_data.items()
        }

    for ticker, holding_details in holdings.items():
        if ticker in fund_info:
            if fund_info[ticker].get('price') is None:
                continue

            try:
                shares = float(holding_details['shares'])
                market_price = float(fund_info[ticker]['price'])
                currency = fund_info[ticker].get('currency', 'USD').upper()

                fx_to_usd = fx_rates.get(currency)
                if fx_to_usd is None:
                    print(f"Warning: Missing FX rate for {currency}. Assuming 1.0.", file=sys.stderr)
                    fx_to_usd = 1.0

                value_in_usd = (shares * market_price) / fx_to_usd
                total_value_usd += value_in_usd
            except (ValueError, TypeError) as e:
                print(f"Warning: Could not process ticker {ticker}. Details: {e}", file=sys.stderr)

    daily_values = {}
    for ccy, rate in fx_rates.items():
        daily_values[f'value_{ccy.lower()}'] = total_value_usd * rate

    return daily_values

def main():
    """Main function to perform the incremental update."""
    print("Starting daily portfolio value update...")

    all_data = {
        "holdings": load_json_data(HOLDINGS_FILE),
        "fund_data": load_json_data(FUND_DATA_FILE),
        "forex": load_json_data(FOREX_FILE),
    }

    if not all(all_data.values()):
        print("One or more essential data files are missing. Aborting.", file=sys.stderr)
        sys.exit(1)

    print("Calculating current portfolio value...")
    current_values = calculate_daily_values(**all_data)

    today_str = datetime.now(ZoneInfo("America/New_York")).strftime('%Y-%m-%d')

    # --- New Append-Only Logic ---
    # We will read the header and check the last date to avoid duplicates.
    header = []
    last_date = None
    if HISTORICAL_CSV.exists():
        with HISTORICAL_CSV.open('r', encoding='utf-8') as f:
            reader = csv.reader(f)
            try:
                header = next(reader)
                # Read all rows to find the last date
                all_rows = list(reader)
                if all_rows:
                    last_date = all_rows[-1][0]
            except StopIteration: # File is empty
                pass
    
    # If file doesn't exist or is empty, create it with a header from the first calculated value
    if not header:
        header = ['date'] + list(current_values.keys())
        with HISTORICAL_CSV.open('w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(header)

    if last_date == today_str:
        print(f"An entry for {today_str} already exists. Aborting to prevent a duplicate entry.")
        # For display, we can still use pandas
        df_display = pd.read_csv(HISTORICAL_CSV)
        print("\nLatest data:")
        print(df_display.tail())
        sys.exit(0)

    # Append the new data
    # The order of values is determined by the header we just read/created.
    new_row = [today_str] + [current_values.get(col, '') for col in header[1:]]
    
    with HISTORICAL_CSV.open('a', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(new_row)

    print(f"Successfully appended data for {today_str} to {HISTORICAL_CSV}")
    
    # For display, we can still use pandas
    df_display = pd.read_csv(HISTORICAL_CSV)
    print("\nLatest data:")
    print(df_display.tail())

if __name__ == "__main__":
    main()
