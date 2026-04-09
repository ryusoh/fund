import sys
import time
from pathlib import Path

# Add project root to path so we can import scripts
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(PROJECT_ROOT))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from scripts.ratios.calculate_ratios import calculate_stats  # noqa: E402

# Mocking pd.read_parquet and other dependencies
original_read_parquet = pd.read_parquet


def mock_read_parquet(path):
    # type: ignore
    # Generate 10000 rows of dummy data for transactions
    n = 10000
    np.random.seed(42)
    return pd.DataFrame(
        {
            'trade_date': pd.date_range('2020-01-01', periods=n, freq='h'),
            'security': np.random.choice(
                ['AAPL', 'GOOG', 'MSFT', 'AMZN', 'TSLA', 'META', 'NFLX'], n
            ),
            'adjusted_quantity': np.random.uniform(1, 100, n),
            'trade_value': np.random.uniform(100, 10000, n),
            'order_type': np.random.choice(['buy', 'sell'], n),
        }
    )


pd.read_parquet = mock_read_parquet  # type: ignore[assignment]

# Mock fx rates
mock_rates = {'USD': 1.0, 'CNY': 7.0, 'JPY': 150.0, 'KRW': 1300.0}


def run_benchmark():
    # Warm up
    calculate_stats(mock_rates)

    # Run
    t0 = time.time()
    for _ in range(5):
        calculate_stats(mock_rates)
    t1 = time.time()

    avg_time = (t1 - t0) / 5
    print(f"Average time per calculate_stats call: {avg_time:.4f}s")
    return avg_time


if __name__ == '__main__':
    run_benchmark()
