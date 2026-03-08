import time
from datetime import date, timedelta
from scripts.data.backfill_portfolio_history import _ensure_fx_coverage
from decimal import Decimal

# Large set of dates and currencies to test _ensure_fx_coverage performance
dates = [date(2023, 1, 1) + timedelta(days=i) for i in range(1000)]
currencies = [f"CUR{i}" for i in range(100)]

fx_rates = {}
for day in dates:
    fx_rates[day] = {cur: Decimal("1.0") for cur in currencies}

print("Benchmarking _ensure_fx_coverage (N+1 nested loops)")
start = time.time()
for _ in range(100):
    _ensure_fx_coverage(currencies, dates, fx_rates)
coverage_duration = time.time() - start
print(f"_ensure_fx_coverage Took: {coverage_duration:.4f} seconds")
