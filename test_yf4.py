import yfinance as yf
from datetime import date, timedelta
import pandas as pd

start = date(2023, 1, 1)
end = date(2023, 1, 5)

res = yf.download(["AAPL"], start=start, end=end, auto_adjust=False, interval="1d")
print("CLOSE:")
close_series = res.get("Close")
print(close_series)

for timestamp, row in close_series.iterrows():
    day = timestamp.date()
    for ticker, value in row.dropna().items():
        print(day, ticker, value)
