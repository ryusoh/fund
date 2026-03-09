import time

import numpy as np
import pandas as pd

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


def method_itertuples(df):
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


def method_zip(df):
    realized_gain_total = 0.0
    lots_by_security = {}

    securities = df['security'].to_numpy()
    qtys = df['adjusted_quantity'].to_numpy(dtype=float)
    trade_values = df['trade_value'].to_numpy(dtype=float)
    order_types = df['order_type'].to_numpy()

    for security, qty, trade_value, order_type in zip(
        securities, qtys, trade_values, order_types, strict=False
    ):
        price = trade_value / qty if qty else 0.0
        order_type_str = str(order_type).strip().lower()
        if qty <= 0 or price <= 0:
            continue
        lots = lots_by_security.setdefault(security, [])
        if order_type_str == 'buy':
            lots.append({'qty': qty, 'price': price})
        elif order_type_str == 'sell':
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


def method_zip_deque(df):
    from collections import deque

    realized_gain_total = 0.0
    lots_by_security = {}

    securities = df['security'].to_numpy()
    qtys = df['adjusted_quantity'].to_numpy(dtype=float)
    trade_values = df['trade_value'].to_numpy(dtype=float)
    order_types = df['order_type'].to_numpy()

    for security, qty, trade_value, order_type in zip(
        securities, qtys, trade_values, order_types, strict=False
    ):
        price = trade_value / qty if qty else 0.0
        order_type_str = str(order_type).strip().lower()
        if qty <= 0 or price <= 0:
            continue
        lots = lots_by_security.setdefault(security, deque())
        if order_type_str == 'buy':
            lots.append([qty, price])  # Using list instead of dict for slightly faster access
        elif order_type_str == 'sell':
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


t0 = time.time()
r1 = method_iterrows(df)
t1 = time.time()
print(f"iterrows: {t1-t0:.4f}s, result: {r1}")

t0 = time.time()
r2 = method_itertuples(df)
t1 = time.time()
print(f"itertuples: {t1-t0:.4f}s, result: {r2}")

t0 = time.time()
r3 = method_zip(df)
t1 = time.time()
print(f"zip: {t1-t0:.4f}s, result: {r3}")

t0 = time.time()
r4 = method_zip_deque(df)
t1 = time.time()
print(f"zip+deque: {t1-t0:.4f}s, result: {r4}")
