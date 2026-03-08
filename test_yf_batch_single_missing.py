import yfinance as yf
from datetime import date, timedelta
from decimal import Decimal
import pandas as pd
import logging

start = date(2023, 1, 3)
end = date(2023, 1, 6)
end_plus_one = end + timedelta(days=1)
tickers = ["MISSINGTICKERXX"]

print("download single missing:")
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
