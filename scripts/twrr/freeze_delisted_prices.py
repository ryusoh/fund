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

If the ticker's column is already gone from HEAD (purged before the
validation gate existed), --search-history walks the parquet's git history
newest-first and freezes from the most recent revision that still has data.

Usage:
  venv/bin/python scripts/twrr/freeze_delisted_prices.py GTLS [TICKER...]
  venv/bin/python scripts/twrr/freeze_delisted_prices.py --search-history CFLT ...
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


def find_last_good_series(tickers: list[str]) -> dict[str, pd.Series]:
    """Walk the parquet's git history newest-first; for each ticker return its
    non-null series from the most recent revision that still has data."""
    revs = subprocess.run(
        ['git', 'log', '--format=%H', '--', HISTORICAL_PRICES_GIT_PATH],
        cwd=PROJECT_ROOT,
        capture_output=True,
        check=True,
        text=True,
    ).stdout.split()
    pending = set(tickers)
    found: dict[str, pd.Series] = {}
    for rev in revs:
        blob = subprocess.run(
            ['git', 'show', f'{rev}:{HISTORICAL_PRICES_GIT_PATH}'],
            cwd=PROJECT_ROOT,
            capture_output=True,
            check=True,
        ).stdout
        frame = pd.read_parquet(io.BytesIO(blob))
        for ticker in sorted(pending):
            if ticker in frame.columns and frame[ticker].notna().any():
                found[ticker] = frame[ticker].dropna()
                pending.discard(ticker)
                print(f'{ticker}: found {len(found[ticker])} prices in {rev[:10]}')
        if not pending:
            break
    return found


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('tickers', nargs='+', help='Tickers to freeze (e.g. GTLS)')
    parser.add_argument(
        '--search-history',
        action='store_true',
        help='Walk git history for the last revision with data (default: read HEAD only)',
    )
    args = parser.parse_args(argv)
    tickers = [t.upper() for t in args.tickers]

    try:
        overrides = pd.read_parquet(OVERRIDE_PATH)
    except FileNotFoundError:
        overrides = pd.DataFrame(columns=['date', 'ticker', 'adj_close'])

    if args.search_history:
        series_by_ticker = find_last_good_series(tickers)
    else:
        committed = load_committed_prices()
        series_by_ticker = {t: committed[t].dropna() for t in tickers if t in committed.columns}

    rows = []
    for ticker in tickers:
        series = series_by_ticker.get(ticker)
        if series is None or series.empty:
            print(f'ERROR: {ticker}: no price data found; nothing to freeze')
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
