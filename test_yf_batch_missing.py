import yfinance as yf
from datetime import date, timedelta
from decimal import Decimal
import pandas as pd
import logging

# suppress yfinance logging for a clean run if possible
logging.getLogger('yfinance').setLevel(logging.ERROR)

start = date(2023, 1, 3)
end = date(2023, 1, 6)
end_plus_one = end + timedelta(days=1)
tickers = ["AAPL", "MISSINGTICKERXX"]

print("download with missing:")
res2 = yf.download(
    tickers,
    start=start.isoformat(),
    end=end_plus_one.isoformat(),
    auto_adjust=False,
    interval="1d",
    ignore_tz=True,
    progress=False
)
print("res2 empty?", res2.empty)
print("res2 columns:", res2.columns)
close_series2 = res2.get("Close")
print("type of close_series2:", type(close_series2))
print("columns of close_series2 (if df):", getattr(close_series2, "columns", None))

for timestamp, row in close_series2.dropna(how="all").iterrows():
    day = timestamp.date()
    for ticker, value in row.dropna().items():
        print(day, ticker, Decimal(str(value)))
