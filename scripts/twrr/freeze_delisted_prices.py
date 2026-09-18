#!/usr/bin/env python3.11
"""Freeze a delisted ticker's committed price history into the overrides parquet.

When a ticker is delisted, price vendors eventually purge the symbol entirely
(yfinance starts returning "possibly delisted; no timezone found"), so step03
can no longer fetch it and its column vanishes from the regenerated
historical_prices.parquet — a full-history wipe that step_validate's
no-coverage-regression gate then (correctly) refuses to commit.

The recovery path is: list the ticker in data/delisted_tickers.csv (step03
stops fetching it) and pin its last-known-good history here, in
data/historical_prices_overrides.parquet, which step03 merges via
combine_first. This script copies the ticker's non-null prices from the
committed HEAD parquet into that overrides file.

Usage: venv/bin/python scripts/twrr/freeze_delisted_prices.py GTLS [TICKER...]
"""

from __future__ import annotations

import argparse
import io
import subprocess
import sys
from pathlib import Path

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
OVERRIDE_PATH = PROJECT_ROOT / 'data' / 'historical_prices_overrides.parquet'
HISTORICAL_PRICES_GIT_PATH = 'data/historical_prices.parquet'


def load_committed_prices() -> pd.DataFrame:
    blob = subprocess.run(
        ['git', 'show', f'HEAD:{HISTORICAL_PRICES_GIT_PATH}'],
        cwd=PROJECT_ROOT,
        capture_output=True,
        check=True,
    ).stdout
    return pd.read_parquet(io.BytesIO(blob))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('tickers', nargs='+', help='Tickers to freeze (e.g. GTLS)')
    args = parser.parse_args(argv)

    committed = load_committed_prices()
    try:
        overrides = pd.read_parquet(OVERRIDE_PATH)
    except FileNotFoundError:
        overrides = pd.DataFrame(columns=['date', 'ticker', 'adj_close'])

    rows = []
    for ticker in [t.upper() for t in args.tickers]:
        if ticker not in committed.columns:
            print(f'ERROR: {ticker} has no column in committed {HISTORICAL_PRICES_GIT_PATH}')
            return 1
        series = committed[ticker].dropna()
        if series.empty:
            print(f'ERROR: {ticker} has no non-null prices in committed data; nothing to freeze')
            return 1
        rows.append(
            pd.DataFrame({'date': series.index, 'ticker': ticker, 'adj_close': series.to_numpy()})
        )
        print(
            f'{ticker}: freezing {len(series)} prices ({series.index.min().date()} -> {series.index.max().date()})'
        )

    combined = pd.concat([overrides, *rows], ignore_index=True)
    combined = combined.drop_duplicates(subset=['date', 'ticker'], keep='last')
    combined.to_parquet(OVERRIDE_PATH)
    print(f'Overrides now cover: {sorted(combined["ticker"].unique())}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
