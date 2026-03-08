import time
from datetime import date, timedelta
from scripts.data.backfill_portfolio_history import _default_price_fetcher, _default_fx_fetcher

dates = [date(2023, 1, 3), date(2023, 1, 4), date(2023, 1, 5)]

tickers = ["AAPL", "MSFT", "GOOG", "AMZN"]
currencies = ["EUR", "GBP", "JPY", "CAD"]

print("Benchmarking Price Fetcher (N+1)")
start = time.time()
_default_price_fetcher(tickers, dates)
price_duration = time.time() - start
print(f"Price Fetcher Took: {price_duration:.2f} seconds")


print("Benchmarking FX Fetcher (N+1)")
start = time.time()
_default_fx_fetcher(currencies, dates)
fx_duration = time.time() - start
print(f"FX Fetcher Took: {fx_duration:.2f} seconds")
