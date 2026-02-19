import pandas as pd
import yfinance as yf
import json
from pathlib import Path


def main():
    # 1. Load Holdings Data
    print("Loading holdings data...")
    # Adjust path if running from root
    df = pd.read_parquet("data/checkpoints/holdings_daily.parquet")
    print(f"Columns: {df.columns}")
    print(df.head())

    if 'ticker' not in df.columns:
        # Check if it's wide format (Ticker columns)
        # If wide, columns are tickers.
        if 'date' not in df.columns and isinstance(df.index, pd.DatetimeIndex):
            # It's likely wide format. Reshape or iterate columns.
            print("Detected Wide Format (Index=Date).")
            unique_tickers = df.columns.tolist()
        else:
            # Maybe 'symbol'?
            raise ValueError(f"Unknown format. Columns: {df.columns}")
    else:
        unique_tickers = df['ticker'].unique()

    print(f"Found {len(unique_tickers)} unique tickers in history.")

    # 3. Fetch current available EPS data for ALL tickers
    print("Fetching EPS availability...")
    eps_coverage = {}

    # Batch or loop? Loop for safety/progress.
    for t in unique_tickers:
        if t in ["USD", "CNY", "JPY", "HKD"]:
            continue  # currency

        try:
            stock = yf.Ticker(t)
            # Check financials
            fin = stock.income_stmt
            if "Basic EPS" in fin.index:
                # Get the earliest date available
                dates = fin.columns
                earliest = min(dates)
                eps_coverage[t] = earliest
            else:
                eps_coverage[t] = None  # No data
        except Exception:
            eps_coverage[t] = None

    # 4. Check Gaps
    print("\n--- GAPS REPORT ---")
    tickers_with_gaps = []

    # For each ticker, find the first date it was held
    for t in unique_tickers:
        if t in ["USD", "CNY"]:
            continue

        # Get holding periods
        if 'ticker' not in df.columns:  # Wide format
            if t not in df.columns:
                continue
            holding_dates = df.index[df[t] > 0]
        else:
            holding_dates = df[df['ticker'] == t]['date']

        if holding_dates.empty:
            continue

        first_held = holding_dates.min()
        last_held = holding_dates.max()

        covered_start = eps_coverage.get(t)

        # Check if held BEFORE covered start
        has_gap = False
        if covered_start is None:
            print(
                f"[MISSING ALL] {t}: Held {first_held.date()} to {last_held.date()} | No EPS data found."
            )
            has_gap = True
        elif pd.Timestamp(first_held).tz_localize(None) < pd.Timestamp(covered_start).tz_localize(
            None
        ):
            # Held before data starts
            print(
                f"[PARTIAL GAP] {t}: Held from {first_held.date()} | Data starts {covered_start.date()}"
            )
            has_gap = True

        if has_gap:
            tickers_with_gaps.append(t)

    print(f"\nTotal tickers with gaps: {len(tickers_with_gaps)}")
    print("Suggest patching these or persisting historical data.")


if __name__ == "__main__":
    main()
