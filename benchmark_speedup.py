import time
import pandas as pd
import numpy as np
import sys
from pathlib import Path

# Add project root to path so we can import scripts
PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.append(str(PROJECT_ROOT))

# Generate dummy data
n = 10000
np.random.seed(42)
df = pd.DataFrame(
    {
        'security': np.random.choice(['AAPL', 'GOOG', 'MSFT', 'AMZN'], n),
        'adjusted_quantity': np.random.uniform(1, 10, n),
        'trade_value': np.random.uniform(100, 1000, n),
        'order_type': np.random.choice(['buy', 'sell'], n),
    }
)


def method_iterrows(df):
    realized_gain_total = 0.0
    lots_by_security = {}
    for _, row in df.iterrows():
        security = row['security']
        qty = float(row['adjusted_quantity'])
        trade_value = float(row['trade_value'])
        price = trade_value / qty if qty else 0.0
        order_type = str(row['order_type']).strip().lower()
        if qty <= 0 or price <= 0:
            continue
        lots = lots_by_security.setdefault(security, [])
        if order_type == 'buy':
            lots.append({'qty': qty, 'price': price})
        elif order_type == 'sell':
            remaining = qty
            while remaining > 1e-9 and lots:
                lot = lots[0]
                available = lot['qty']
                used = min(remaining, available)
                realized_gain_total += (price - lot['price']) * used
                lot['qty'] -= used
                remaining -= used
                if lot['qty'] <= 1e-9:
                    lots.pop(0)
            if remaining > 1e-9:
                realized_gain_total += price * remaining
    return realized_gain_total


def method_optimized(df):
    from collections import deque

    realized_gain_total = 0.0
    lots_by_security = {}

    for row in df.itertuples(index=False):
        security = row.security
        qty = float(row.adjusted_quantity)
        trade_value = float(row.trade_value)
        price = trade_value / qty if qty else 0.0
        order_type = str(row.order_type).strip().lower()

        if qty <= 0 or price <= 0:
            continue

        lots = lots_by_security.setdefault(security, deque())

        if order_type == 'buy':
            lots.append([qty, price])
        elif order_type == 'sell':
            remaining = qty
            while remaining > 1e-9 and lots:
                lot = lots[0]
                available = lot[0]
                used = min(remaining, available)
                realized_gain_total += (price - lot[1]) * used
                lot[0] -= used
                remaining -= used
                if lot[0] <= 1e-9:
                    lots.popleft()
            if remaining > 1e-9:
                realized_gain_total += price * remaining
    return realized_gain_total


print("Running baseline (iterrows)...")
t0 = time.time()
r1 = method_iterrows(df)
t1 = time.time()
time_base = t1 - t0

print("Running optimized (itertuples + deque)...")
t0 = time.time()
r2 = method_optimized(df)
t1 = time.time()
time_opt = t1 - t0

print(f"\nResults:")
print(f"Baseline time: {time_base:.4f}s")
print(f"Optimized time: {time_opt:.4f}s")
print(f"Speedup: {time_base / time_opt:.2f}x")
print(f"Result match: {r1 == r2} (Difference: {abs(r1 - r2)})")
