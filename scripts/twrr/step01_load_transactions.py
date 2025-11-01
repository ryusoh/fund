#!/usr/bin/env python3.11
"""Step 01: Load and clean raw transactions into a checkpoint parquet."""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import List

import pandas as pd

sys.path.append(str(Path(__file__).parent))
from utils import append_changelog_entry

# Paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = PROJECT_ROOT / 'data'
RAW_TRANSACTIONS_PATH = DATA_DIR / 'transactions.csv'
CHECKPOINT_DIR = DATA_DIR / 'checkpoints'
CHECKPOINT_PATH = CHECKPOINT_DIR / 'transactions_clean.parquet'

STEP_NAME = 'step-01_loader'
TOOL_NAME = 'codex'


def ensure_directories() -> None:
    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)


def load_transactions() -> pd.DataFrame:
    dtype_spec = {
        'Trade Date': 'string',
        'Order Type': 'string',
        'Security': 'string',
        'Quantity': 'float64',
        'Executed Price': 'float64',
    }  # type: ignore

    if not RAW_TRANSACTIONS_PATH.exists():
        raise FileNotFoundError(f"Missing transactions file: {RAW_TRANSACTIONS_PATH}")

    df = pd.read_csv(RAW_TRANSACTIONS_PATH, dtype=dtype_spec)  # type: ignore
    return df


def clean_transactions(df: pd.DataFrame) -> pd.DataFrame:
    rename_map = {
        'Trade Date': 'trade_date',
        'Order Type': 'order_type',
        'Security': 'security',
        'Quantity': 'quantity',
        'Executed Price': 'executed_price',
    }
    df = df.rename(columns=rename_map)

    # Parse dates
    df['trade_date'] = pd.to_datetime(df['trade_date'], format='%m/%d/%Y', errors='coerce')
    bad_dates = df['trade_date'].isna()
    if bad_dates.any():
        bad_rows = df.loc[bad_dates]
        print('ERROR: The following rows have invalid trade_date values:')
        print(bad_rows)
        raise ValueError('trade_date parsing failed for one or more rows')

    # Normalize tickers
    df['security'] = df['security'].fillna('').str.strip().str.upper()
    df['security'] = df['security'].str.replace(r'[\s\-]+', '', regex=True)

    # Validate order types
    valid_order_types = {'BUY', 'SELL'}
    df['order_type'] = df['order_type'].str.strip()
    invalid_mask = ~df['order_type'].str.upper().isin(valid_order_types)
    if invalid_mask.any():
        invalid_rows = df.loc[invalid_mask]
        print('ERROR: Invalid order_type values detected:')
        print(invalid_rows)
        raise ValueError('order_type must be either "Buy" or "Sell"')

    # Preserve original casing Buy/Sell while ensuring canonical capitalization
    df['order_type'] = df['order_type'].str.title()

    df['trade_value'] = df['quantity'] * df['executed_price']

    zero_price_mask = df['executed_price'].fillna(0) == 0
    if zero_price_mask.any():
        zero_rows = df.loc[zero_price_mask]
        print(
            'WARNING: Executed price is zero for the following rows; keeping quantity with zero cash flow:'
        )
        print(zero_rows[['trade_date', 'security', 'quantity', 'executed_price']])

    df = df.sort_values('trade_date').reset_index(drop=True)
    before_rows = len(df)
    df = df.drop_duplicates(keep='first')
    duplicates_removed = before_rows - len(df)
    if duplicates_removed:
        print(f'Removed {duplicates_removed} exact duplicate rows.')

    return df


def write_checkpoint(df: pd.DataFrame) -> None:
    try:
        df.to_parquet(CHECKPOINT_PATH, index=False)
    except ImportError as exc:
        raise RuntimeError(
            'Writing parquet requires pyarrow or fastparquet. '
            'Install one of them (e.g., pip install pyarrow) '
            'and rerun this step.'
        ) from exc
    print(f'Checkpoint written to {CHECKPOINT_PATH}')


def update_status(artifacts: List[str], notes: str) -> None:
    timestamp = datetime.now(tz=timezone.utc).isoformat()
    print(f'[STATUS] {STEP_NAME} ({TOOL_NAME}) @ {timestamp}: {notes} -> {artifacts}')


def print_summary(df: pd.DataFrame) -> None:
    print('\nDataFrame head:')
    print(df.head())

    print('\nDataFrame info:')
    df.info()

    total_rows = len(df)
    unique_tickers = df['security'].nunique()
    min_date = df['trade_date'].min()
    max_date = df['trade_date'].max()
    print('\nSummary:')
    print(f'  Total rows: {total_rows}')
    print(f'  Unique tickers: {unique_tickers}')
    print(f'  Date span: {min_date.date()} to {max_date.date()}')


def main() -> None:
    ensure_directories()
    df_raw = load_transactions()
    df_clean = clean_transactions(df_raw)
    write_checkpoint(df_clean)

    artifacts = [f"./{CHECKPOINT_PATH.relative_to(PROJECT_ROOT)}"]
    update_status(artifacts, 'Loaded and cleaned transactions CSV.')
    append_changelog_entry(STEP_NAME, artifacts)
    print_summary(df_clean)


if __name__ == '__main__':
    main()
