#!/usr/bin/env python3
"""Fetch historical FX rates and store them in data/fx_daily_rates.csv"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import yfinance as yf

BASE = 'USD'
TARGETS = ['CNY', 'JPY', 'KRW']
DATA_DIR = Path('data')
FX_PATH = DATA_DIR / 'fx_daily_rates.csv'

ETFS = {'CNY': 'CNY=X', 'JPY': 'JPY=X', 'KRW': 'KRW=X'}


def determine_date_range(start: str | None) -> tuple[str, str]:
    end = datetime.now(timezone.utc).date().strftime('%Y-%m-%d')
    if start:
        return start, end
    # default to last 5 years if not specified
    default_start = (
        datetime.now(timezone.utc).date().replace(day=1) - pd.DateOffset(years=5)
    ).strftime('%Y-%m-%d')
    return default_start, end


def fetch_rates(start: str, end: str) -> pd.DataFrame:
    frames = []
    for currency, symbol in ETFS.items():
        data = yf.Ticker(symbol).history(
            start=start, end=end, interval='1d', actions=False
        )  # consider leave interval default? fallback
        if 'Close' not in data.columns and 'Adj Close' not in data.columns:
            raise ValueError(f'Missing Close data for {symbol or currency}')
        series = data.get('Adj Close', data['Close'])
        series = pd.Series(series)
        series.name = currency
        series.index = pd.to_datetime(series.index).tz_localize(None)
        frames.append(series)

    df = pd.concat(frames, axis=1)
    df['USD'] = 1.0
    df = df[['USD'] + TARGETS]
    df.index.name = 'date'
    return df  # type: ignore


def main() -> None:
    parser = argparse.ArgumentParser(description='Fetch FX history via yfinance')
    parser.add_argument('--start', type=str, help='Start date (YYYY-MM-DD)')
    parser.add_argument('--end', type=str, help='End date (YYYY-MM-DD) - defaults to today')
    args = parser.parse_args()

    start, end = determine_date_range(args.start)
    if args.end:
        end = args.end

    df = fetch_rates(start, end)
    DATA_DIR.mkdir(exist_ok=True)
    df.to_csv(FX_PATH, float_format='%.6f')
    print(f'Wrote FX history to {FX_PATH}')


if __name__ == '__main__':
    main()
