import time
from datetime import date

from scripts.data.backfill_portfolio_history import _default_fx_fetcher, _default_price_fetcher

dates = [date(2023, 1, 3), date(2023, 1, 4), date(2023, 1, 5), date(2023, 1, 6), date(2023, 1, 9)]

tickers = ["AAPL", "MSFT", "GOOG", "AMZN", "META", "TSLA", "NVDA", "JPM", "V", "JNJ"]
currencies = ["EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "CNY", "SEK", "NZD", "MXN"]

print("Benchmarking Price Fetcher")
start = time.time()
p = _default_price_fetcher(tickers, dates)
price_duration = time.time() - start
print(f"Price Fetcher Took: {price_duration:.2f} seconds")

print("Benchmarking FX Fetcher")
start = time.time()
f = _default_fx_fetcher(currencies, dates)
fx_duration = time.time() - start
print(f"FX Fetcher Took: {fx_duration:.2f} seconds")
