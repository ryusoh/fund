import yfinance as yf
from datetime import date, timedelta
import pandas as pd

start = date(2023, 1, 1)
end = date(2023, 1, 5)

res = yf.download(["AAPL", "MSFT"], start=start, end=end)
print(res)
print(res.columns)
print(res["Close"])

res_single = yf.download(["AAPL"], start=start, end=end)
print(res_single)
print(res_single.columns)
print(res_single["Close"])
