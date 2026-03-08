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
print("close:")
print(close_series2)

if isinstance(close_series2, pd.DataFrame):
    for timestamp, row in close_series2.dropna(how="all").iterrows():
        day = timestamp.date()
        for ticker, value in row.dropna().items():
            print(day, ticker, Decimal(str(value)))
else:
    for timestamp, value in close_series2.dropna().items():
        day = timestamp.date()
        # when downloading single ticker, the series usually has name='AAPL' or similar, but with multiindex it could differ
        print(day, "AAPL", Decimal(str(value)))
