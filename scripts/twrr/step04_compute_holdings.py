#!/usr/bin/env python3.11
"""Step 04: Compute daily holdings and market value series."""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import List

import pandas as pd

sys.path.append(str(Path(__file__).parent))
from utils import append_changelog_entry

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = PROJECT_ROOT / 'data'
CHECKPOINT_DIR = DATA_DIR / 'checkpoints'
TRANSACTIONS_PATH = CHECKPOINT_DIR / 'transactions_with_splits.parquet'
PRICES_PATH = DATA_DIR / 'historical_prices.parquet'
HOLDINGS_PATH = CHECKPOINT_DIR / 'holdings_daily.parquet'
MARKET_VALUE_PATH = DATA_DIR / 'daily_market_value.parquet'

STEP_NAME = 'step-04_holdings'
TOOL_NAME = 'codex'


def ensure_directories() -> None:
    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)


def load_transactions() -> pd.DataFrame:
    if not TRANSACTIONS_PATH.exists():
        raise FileNotFoundError(
            f'Missing transactions checkpoint: {TRANSACTIONS_PATH}. Run step-02 first.'
        )
    try:
        df = pd.read_parquet(TRANSACTIONS_PATH)
    except ImportError as exc:
        raise RuntimeError(
            'Reading parquet requires pyarrow or fastparquet. Install one of them and rerun step-04.'
        ) from exc
    return df


def load_prices() -> pd.DataFrame:
    if not PRICES_PATH.exists():
        raise FileNotFoundError(
            f'Missing historical prices parquet: {PRICES_PATH}. Run step-03 first.'
        )
    try:
        df = pd.read_parquet(PRICES_PATH)
    except ImportError as exc:
        raise RuntimeError(
            'Reading parquet requires pyarrow or fastparquet. Install one of them and rerun step-04.'
        ) from exc

    if not isinstance(df.index, pd.DatetimeIndex):
        raise ValueError('historical_prices.parquet must have a DatetimeIndex.')
    df.index = df.index.tz_localize(None)
    return df


def build_holdings(transactions: pd.DataFrame, date_index: pd.DatetimeIndex) -> pd.DataFrame:
    order_type = transactions['order_type'].str.upper()
    signed_quantity = transactions['adjusted_quantity'].where(
        order_type == 'BUY', -transactions['adjusted_quantity']
    )

    delta = transactions.assign(delta_quantity=signed_quantity)

    pivot = delta.groupby(['trade_date', 'security'])['delta_quantity'].sum().unstack(fill_value=0)

    pivot.index = pd.DatetimeIndex(pivot.index).tz_localize(None)
    pivot = pivot.reindex(date_index, fill_value=0.0)

    holdings = pivot.cumsum().ffill().fillna(0.0)
    return holdings


def write_holdings(holdings: pd.DataFrame) -> None:
    try:
        holdings.to_parquet(HOLDINGS_PATH)
    except ImportError as exc:
        raise RuntimeError(
            'Writing parquet requires pyarrow or fastparquet. Install one of them and rerun step-04.'
        ) from exc
    print(f'Holdings checkpoint written to {HOLDINGS_PATH}')


def write_market_value(portfolio_mv: pd.Series) -> None:
    df = portfolio_mv.to_frame(name='market_value')
    try:
        df.to_parquet(MARKET_VALUE_PATH)
    except ImportError as exc:
        raise RuntimeError(
            'Writing parquet requires pyarrow or fastparquet. Install one of them and rerun step-04.'
        ) from exc
    print(f'Daily market value written to {MARKET_VALUE_PATH}')


def update_status(artifacts: List[str], notes: str) -> None:
    timestamp = datetime.now(timezone.utc).isoformat()
    print(f'[STATUS] {STEP_NAME} ({TOOL_NAME}) @ {timestamp}: {notes} -> {artifacts}')


def summarize(holdings: pd.DataFrame, portfolio_mv: pd.Series) -> None:
    print('\nHoldings head:')
    print(holdings.head())

    print('\nPortfolio market value head:')
    print(portfolio_mv.head())

    print('\nSummary:')
    print(f'  Holdings shape: {holdings.shape}')
    print(f'  Market value series length: {len(portfolio_mv)}')
    print(f'  Total columns (tickers): {holdings.shape[1]}')


def main() -> None:
    ensure_directories()

    transactions = load_transactions()
    prices = load_prices()

    transactions['trade_date'] = pd.to_datetime(transactions['trade_date']).dt.tz_localize(None)

    start_date = transactions['trade_date'].min().normalize()
    end_date = prices.index.max().normalize()
    date_index = pd.date_range(start=start_date, end=end_date, freq='D')

    holdings = build_holdings(transactions, date_index)
    write_holdings(holdings)

    aligned_prices = prices.reindex(date_index).ffill().bfill()
    aligned_prices = aligned_prices.reindex(columns=holdings.columns).fillna(0.0)

    portfolio_mv = (holdings * aligned_prices).sum(axis=1)
    write_market_value(portfolio_mv)

    artifacts = [
        f"./{HOLDINGS_PATH.relative_to(PROJECT_ROOT)}",
        f"./{MARKET_VALUE_PATH.relative_to(PROJECT_ROOT)}",
    ]
    update_status(artifacts, 'Computed daily holdings and market value series.')
    append_changelog_entry(STEP_NAME, artifacts)
    summarize(holdings, portfolio_mv)


if __name__ == '__main__':
    main()
