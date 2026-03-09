import sys
import time
from pathlib import Path
from datetime import datetime, timedelta
import pandas as pd
import json

# Add scripts directory to path to import generate_composition_data
sys.path.append(str(Path(__file__).parent.parent / "scripts"))
from generate_composition_data import calculate_daily_composition


def generate_benchmark_data(num_dates=5000, num_tickers=50, price_sparsity=0.9):
    """
    Generate large synthetic data for testing calculate_daily_composition performance.

    Args:
        num_dates: Number of days to generate holdings for.
        num_tickers: Number of tickers in holdings.
        price_sparsity: Float between 0 and 1. If 0.9, 90% of price data is missing.
    """
    # Generate dates
    start_date = datetime(2000, 1, 1)
    dates = [start_date + timedelta(days=i) for i in range(num_dates)]
    date_strs = [d.strftime("%Y-%m-%d") for d in dates]

    # Generate tickers
    tickers = [f"TICKER{i}" for i in range(num_tickers)]

    # Generate holdings_df
    # Every day holds 100 shares of every ticker
    holdings_data = {t: [100.0] * num_dates for t in tickers}
    holdings_df = pd.DataFrame(holdings_data, index=dates)

    # Generate prices_data
    # For every ticker, only generate prices for a subset of dates based on sparsity
    import random

    random.seed(42)  # For reproducible benchmarks

    prices_data = {}
    for ticker in tickers:
        prices_data[ticker] = {}
        for d in date_strs:
            if random.random() > price_sparsity:
                # Random price between 10 and 100
                prices_data[ticker][d] = random.uniform(10, 100)

    # Generate metadata
    metadata = {t: {"sector": "Technology"} for t in tickers}

    # No fund allocations for simplicity
    fund_allocations = {}

    return holdings_df, prices_data, metadata, fund_allocations


def run_benchmark():
    print("Generating benchmark data (this might take a few seconds)...")

    # 5000 days and 50 tickers with 95% sparsity
    # Means only ~5% of dates have prices, so 95% of dates will trigger the
    # slow O(N) list comprehension
    holdings_df, prices_data, metadata, fund_allocations = generate_benchmark_data(
        num_dates=5000, num_tickers=50, price_sparsity=0.95
    )

    print(f"Data generated: {len(holdings_df)} days, {len(holdings_df.columns)} tickers.")

    print("\nRunning benchmark...")
    start_time = time.time()

    # We only care about the time taken to run this function
    composition_df, sector_df = calculate_daily_composition(
        holdings_df, prices_data, metadata, fund_allocations
    )

    end_time = time.time()
    elapsed = end_time - start_time

    print(f"Time taken: {elapsed:.4f} seconds")
    print(f"Rows output: {len(composition_df)}")

    return elapsed


if __name__ == "__main__":
    run_benchmark()
