#!/usr/bin/env python3

"""
Extracts historical portfolio data from the Git repository to generate a daily
Profit and Loss (P&L) dataset.

This script inspects the Git history for three key data files:
1. holdings_details.json: Contains the number of shares for each asset.
2. fund_data.json: Contains the daily market price and currency for each asset.
3. forex_data.json: Contains daily foreign exchange rates against the USD.

It iterates through each day from the first commit to the present, finds the
state of these files at the end of each day, and calculates the total portfolio
value in various currencies. The final output is a CSV file containing the
daily portfolio values, ready for analysis or visualization.
"""

import subprocess
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Tuple, Dict, Any, Optional

import pandas as pd

# --- Configuration ---
# This script assumes it is run from the root of the 'fund' repository.
REPO_PATH = Path(".")
HOLDINGS_FILE = Path("data/holdings_details.json")
FUND_DATA_FILE = Path("data/fund_data.json")
FOREX_FILE = Path("data/fx_data.json")
OUTPUT_CSV = Path("data/historical_portfolio_values.csv")
# --- End Configuration ---


def run_git_command(command: List[str], repo_path: Path) -> Optional[str]:
    """Runs a Git command and returns its stripped stdout output."""
    try:
        result = subprocess.run(
            command,
            cwd=repo_path,
            capture_output=True,
            text=True,
            check=True,
            encoding='utf-8'
        )
        return result.stdout.strip()
    except FileNotFoundError:
        print("Error: 'git' command not found. Is Git installed and in your PATH?", file=sys.stderr)
        sys.exit(1)
    except subprocess.CalledProcessError as e:
        print(f"Error running command '{' '.join(command)}': {e.stderr}", file=sys.stderr)
        return None


def get_commit_history_for_file(repo_path: Path, file_path: Path) -> List[Tuple[int, str]]:
    """
    Gets a sorted list of (timestamp, commit_hash) for a file.
    Uses --follow to track file renames through history.
    Returns a list of tuples, sorted from oldest to newest.
    """
    log_command = ["git", "log", "--follow", "--pretty=format:%H %ct", "--", str(file_path)]
    output = run_git_command(log_command, repo_path)
    if not output:
        return []

    history = []
    for line in output.split("\n"):
        if not line:
            continue
        commit_hash, commit_timestamp = line.split()
        history.append((int(commit_timestamp), commit_hash))

    return sorted(history)  # Sort by timestamp (oldest first)


def get_file_content_at_commit(repo_path: Path, file_path: Path, commit_hash: str) -> Optional[Dict]:
    """Gets the content of a file at a specific commit and parses it as JSON."""
    show_command = ["git", "show", f"{commit_hash}:{file_path}"]
    content = run_git_command(show_command, repo_path)
    if content is None:
        return None
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        print(f"Warning: Could not parse JSON from {file_path} at commit {commit_hash}", file=sys.stderr)
        return None


def calculate_daily_values(holdings: Dict, fund_data: Dict, forex: Dict) -> Dict[str, Any]:
    """Calculates the total portfolio value in various currencies for a single day."""
    total_value_usd = 0.0
    fx_rates = forex.get('rates', {})
    fx_rates['USD'] = 1.0  # Base currency

    fund_info = {}
    # Check for new format vs old format to build a consistent fund_info dict
    if isinstance(fund_data.get('data'), list):
        # New format: {"data": [{"ticker": "AAPL", "price": 150.0, "currency": "USD"}, ...]}
        fund_info = {item['ticker']: item for item in fund_data['data'] if 'ticker' in item}
    elif isinstance(fund_data, dict):
        # Old format: {"AAPL": 150.0, ...}
        # We must assume USD for all tickers in this case, as currency is not stored.
        fund_info = {
            ticker: {"price": price, "currency": "USD"}
            for ticker, price in fund_data.items()
        }

    for ticker, holding_details in holdings.items():
        if ticker in fund_info:
            # Ensure the fund data for the ticker is complete before processing
            if fund_info[ticker].get('price') is None:
                print(f"Warning: Missing price for {ticker}. Skipping for value calculation.", file=sys.stderr)
                continue

            try:
                shares = float(holding_details['shares'])
                market_price = float(fund_info[ticker]['price'])
                currency = fund_info[ticker].get('currency', 'USD').upper()

                # The exchange rates are CUR/USD, so to get USD value, we divide.
                fx_to_usd = fx_rates.get(currency)
                if fx_to_usd is None:
                    print(f"Warning: Missing FX rate for {currency}. Assuming 1.0.", file=sys.stderr)
                    fx_to_usd = 1.0

                value_in_usd = (shares * market_price) / fx_to_usd
                total_value_usd += value_in_usd
            except (ValueError, TypeError) as e:
                print(f"Warning: Could not process ticker {ticker}. Details: {e}", file=sys.stderr)

    # Calculate total value in all available currencies
    daily_values = {}
    for ccy, rate in fx_rates.items():
        daily_values[f'value_{ccy.lower()}'] = total_value_usd * rate

    return daily_values


def main():
    """Main function to extract and process historical data."""
    print("Starting historical data extraction from Git...")
    histories = {}
    for name, path in [("holdings", HOLDINGS_FILE), ("fund_data", FUND_DATA_FILE), ("forex", FOREX_FILE)]:
        print(f"Fetching history for '{path}'...")
        history = get_commit_history_for_file(REPO_PATH, path)
        if not history:
            print(f"Error: Could not find commit history for '{path}'. Aborting.", file=sys.stderr)
            sys.exit(1)
        histories[name] = history

    all_timestamps = [ts for name in histories for ts, _ in histories[name]]
    start_date = datetime.fromtimestamp(min(all_timestamps), tz=timezone.utc).date()
    end_date = datetime.now(tz=timezone.utc).date()
    date_range = pd.date_range(start=start_date, end=end_date, freq='D')

    print(f"\nAnalyzing data from {start_date} to {end_date}...")

    # Pointers for each file's commit history
    pointers = {name: 0 for name in histories}
    last_hashes = {name: None for name in histories}
    content_cache = {name: {} for name in histories}
    
    processed_records = []

    for i, current_date in enumerate(date_range):
        # Efficiently find the last commit for each file on or before current_date
        for name, history in histories.items():
            ptr = pointers[name]
            while ptr < len(history) and datetime.fromtimestamp(history[ptr][0], tz=timezone.utc).date() <= current_date.date():
                last_hashes[name] = history[ptr][1]
                ptr += 1
            pointers[name] = ptr

        # If we have a valid state for all files, calculate the portfolio value
        if all(last_hashes.values()):
            contents = {}
            all_content_valid = True
            for name, path in [("holdings", HOLDINGS_FILE), ("fund_data", FUND_DATA_FILE), ("forex", FOREX_FILE)]:
                commit_hash = last_hashes[name]
                if commit_hash not in content_cache[name]:
                    content_cache[name][commit_hash] = get_file_content_at_commit(REPO_PATH, path, commit_hash)
                
                contents[name] = content_cache[name][commit_hash]
                if contents[name] is None:
                    all_content_valid = False
                    break
            
            if all_content_valid:
                daily_values = calculate_daily_values(contents["holdings"], contents["fund_data"], contents["forex"])
                daily_values['date'] = current_date.strftime('%Y-%m-%d')
                processed_records.append(daily_values)

        if (i + 1) % 30 == 0:
            print(f"  Processed {i + 1}/{len(date_range)} days...")

    if not processed_records:
        print("\nNo historical data could be processed.")
        return

    print(f"\nProcessed {len(date_range)} days. Found {len(processed_records)} valid daily snapshots.")

    # Create and save the final DataFrame
    df_pnl = pd.DataFrame(processed_records).set_index('date')
    df_pnl.sort_index(inplace=True)

    # Reorder columns to have USD first, then others alphabetically
    if 'value_usd' in df_pnl.columns:
        cols = sorted(df_pnl.columns.tolist())
        cols.insert(0, cols.pop(cols.index('value_usd')))
        df_pnl = df_pnl[cols]

    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    df_pnl.to_csv(OUTPUT_CSV)
    print(f"\nSuccessfully saved historical portfolio values to '{OUTPUT_CSV}'")
    print("\nSample of the generated data:")
    print(df_pnl.tail())


if __name__ == "__main__":
    main()
