import sys
import time
from pathlib import Path
from typing import Any, cast
import pandas as pd
import numpy as np

# Add project root to path so we can import scripts
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(PROJECT_ROOT))

SUPPORTED_CURRENCIES = ['USD', 'CNY', 'JPY', 'KRW']

def build_fx_json_original(fx_df: pd.DataFrame) -> dict[str, Any]:
    rates: dict[str, dict[str, float]] = {}
    for row in fx_df.itertuples(index=True):
        rates[cast(pd.Timestamp, row.Index).strftime('%Y-%m-%d')] = {
            currency: float(getattr(row, currency)) for currency in SUPPORTED_CURRENCIES
        }
    return {
        'base': 'USD',
        'currencies': SUPPORTED_CURRENCIES,
        'rates': rates,
    }

def build_fx_json_optimized(fx_df: pd.DataFrame) -> dict[str, Any]:
    # Suggested optimization:
    # rates = fx_df[SUPPORTED_CURRENCIES].to_dict(orient='index')
    # and adjust the date format using index strings

    # We need to convert the index to string format %Y-%m-%d
    df_copy = fx_df[SUPPORTED_CURRENCIES].copy()
    df_copy.index = df_copy.index.strftime('%Y-%m-%d')
    rates = df_copy.to_dict(orient='index')

    return {
        'base': 'USD',
        'currencies': SUPPORTED_CURRENCIES,
        'rates': rates,
    }

# Generate dummy data
n = 5000 # 5000 days of FX data
dates = pd.date_range(start='2010-01-01', periods=n)
data = np.random.uniform(0.5, 150, size=(n, len(SUPPORTED_CURRENCIES)))
fx_df = pd.DataFrame(data, index=dates, columns=SUPPORTED_CURRENCIES)

print(f"Benchmarking with {n} rows...")

# Warmup
build_fx_json_original(fx_df.head(100))
build_fx_json_optimized(fx_df.head(100))

t0 = time.time()
res1 = build_fx_json_original(fx_df)
t1 = time.time()
original_time = t1 - t0
print(f"Original build_fx_json time: {original_time:.4f}s")

t0 = time.time()
res2 = build_fx_json_optimized(fx_df)
t1 = time.time()
optimized_time = t1 - t0
print(f"Optimized build_fx_json time: {optimized_time:.4f}s")

print(f"Speedup: {original_time / optimized_time:.2f}x")

# Verify correctness
# Check if the keys and values are the same
if res1['rates'].keys() != res2['rates'].keys():
    print("Error: Keys mismatch")
else:
    mismatch = False
    for date in res1['rates']:
        for curr in SUPPORTED_CURRENCIES:
            if abs(res1['rates'][date][curr] - res2['rates'][date][curr]) > 1e-9:
                print(f"Error: Value mismatch at {date}, {curr}")
                mismatch = True
                break
        if mismatch:
            break
    if not mismatch:
        print("Verification successful: Results match!")
