import yfinance as yf
from datetime import date, timedelta
from decimal import Decimal
import pandas as pd

start = date(2023, 1, 3)
end = date(2023, 1, 6)
end_plus_one = end + timedelta(days=1)
tickers = ["AAPL"]

print("download single:")
res2 = yf.download(
    tickers,
    start=start.isoformat(),
    end=end_plus_one.isoformat(),
    auto_adjust=False,
    interval="1d"
)
close_series2 = res2.get("Close")
print("type of close_series2:", type(close_series2))
print("columns of close_series2 (if df):", getattr(close_series2, "columns", None))
