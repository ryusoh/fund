#!/usr/bin/env python3.11
"""Step 02: Apply split adjustments to cleaned transactions."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List

import numpy as np
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = PROJECT_ROOT / 'data'
CHECKPOINT_DIR = DATA_DIR / 'checkpoints'
RAW_TRANSACTIONS_PATH = CHECKPOINT_DIR / 'transactions_clean.parquet'
SPLIT_HISTORY_PATH = DATA_DIR / 'split_history.csv'
OUTPUT_PATH = CHECKPOINT_DIR / 'transactions_with_splits.parquet'

AI_DIR = PROJECT_ROOT / 'ai'
STATUS_PATH = AI_DIR / 'status' / 'AI_STATUS.json'
CHANGELOG_PATH = AI_DIR / 'handoff' / 'CHANGELOG-AI.md'

STEP_NAME = 'step-02_splits'
TOOL_NAME = 'codex'


def ensure_directories() -> None:
    for path in [CHECKPOINT_DIR, STATUS_PATH.parent, CHANGELOG_PATH.parent]:
        path.mkdir(parents=True, exist_ok=True)


def load_transactions() -> pd.DataFrame:
    if not RAW_TRANSACTIONS_PATH.exists():
        raise FileNotFoundError(
            f"Missing transactions checkpoint: {RAW_TRANSACTIONS_PATH}. "
            "Run step-01_loader first."
        )
    return pd.read_parquet(RAW_TRANSACTIONS_PATH)


def parse_split_ratio(value: str) -> float:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        raise ValueError('Split ratio value is missing.')
    text = str(value).strip()
    if ':' not in text:
        raise ValueError(f'Invalid split ratio format: {value!r}')
    numerator, denominator = text.split(':', 1)
    try:
        num = float(numerator)
        den = float(denominator)
    except ValueError as exc:
        raise ValueError(f'Non-numeric split ratio: {value!r}') from exc
    if den == 0:
        raise ValueError(f'Split ratio denominator is zero: {value!r}')
    factor = num / den
    if factor <= 0:
        raise ValueError(f'Split ratio must be positive: {value!r}')
    return factor


def load_split_history() -> pd.DataFrame:
    if not SPLIT_HISTORY_PATH.exists():
        raise FileNotFoundError(f'Missing split history CSV: {SPLIT_HISTORY_PATH}')

    df = pd.read_csv(SPLIT_HISTORY_PATH, dtype={'Symbol': 'string', 'Split Ratio': 'string'})
    rename_map = {
        'Symbol': 'security',
        'Split Date': 'split_date',
        'Split Ratio': 'split_ratio',
    }
    df = df.rename(columns=rename_map)

    df['split_date'] = pd.to_datetime(df['split_date'], errors='coerce')
    bad_dates = df['split_date'].isna()
    if bad_dates.any():
        bad_rows = df.loc[bad_dates]
        print('ERROR: Invalid split_date values detected:')
        print(bad_rows)
        raise ValueError('Split history contains invalid split_date entries.')

    df['security'] = df['security'].fillna('').str.strip().str.upper()
    df['security'] = df['security'].str.replace(r'[\s\-]+', '', regex=True)

    df['split_factor'] = df['split_ratio'].apply(parse_split_ratio)
    df = df[['security', 'split_date', 'split_ratio', 'split_factor']]
    df = df.sort_values(['security', 'split_date']).reset_index(drop=True)

    return df


def apply_split_adjustments(transactions: pd.DataFrame, splits: pd.DataFrame) -> pd.DataFrame:
    transactions = transactions.copy()
    transactions['split_adjustment_factor'] = 1.0

    if splits.empty:
        transactions['adjusted_quantity'] = transactions['quantity']
        return transactions

    # Iterate by security to minimize repeated filtering
    for security, sec_splits in splits.groupby('security'):
        trade_idx = transactions.index[transactions['security'] == security]
        if len(trade_idx) == 0:
            continue

        trade_dates = transactions.loc[trade_idx, 'trade_date'].to_numpy()
        factors = np.ones(len(trade_idx), dtype='float64')

        sec_splits = sec_splits.sort_values('split_date')
        for _, split_row in sec_splits.iterrows():
            split_date = split_row['split_date']
            split_factor = split_row['split_factor']
            mask = trade_dates < np.datetime64(split_date)
            factors[mask] *= split_factor

        transactions.loc[trade_idx, 'split_adjustment_factor'] = factors

    transactions['adjusted_quantity'] = (
        transactions['quantity'] * transactions['split_adjustment_factor']
    )
    return transactions


def write_checkpoint(df: pd.DataFrame) -> None:
    try:
        df.to_parquet(OUTPUT_PATH, index=False)
    except ImportError as exc:
        raise RuntimeError(
            'Writing parquet requires pyarrow or fastparquet. Install one of them and rerun this step.'
        ) from exc
    print(f'Checkpoint written to {OUTPUT_PATH}')


def update_status(artifacts: List[str], notes: str) -> None:
    status_data = {
        'step': STEP_NAME,
        'tool': TOOL_NAME,
        'artifacts': artifacts,
        'ts': datetime.now(tz=timezone.utc).isoformat(),
        'notes': notes,
    }
    STATUS_PATH.write_text(json.dumps(status_data, indent=2))


def append_changelog_entry(artifacts: List[str]) -> None:
    bullet_list = '\n'.join(f'- Applied split adjustments ({artifact})' for artifact in artifacts)
    entry = f"\n\n### {STEP_NAME}\n{bullet_list}\n"
    if CHANGELOG_PATH.exists():
        with CHANGELOG_PATH.open('a', encoding='utf-8') as f:
            f.write(entry)
    else:
        CHANGELOG_PATH.write_text(entry, encoding='utf-8')


def print_split_report(transactions: pd.DataFrame, splits: pd.DataFrame) -> None:
    if splits.empty:
        print('No splits found in history. All quantities remain unchanged.')
        return

    split_securities = splits['security'].unique()
    report_df = transactions.loc[
        transactions['security'].isin(split_securities),
        ['security', 'trade_date', 'quantity', 'adjusted_quantity'],
    ].sort_values(['security', 'trade_date'])
    if report_df.empty:
        print('Split history provided, but no matching securities found in transactions.')
        return

    sample = report_df.groupby('security', group_keys=False).head(5)
    print('\nSample adjusted quantities for securities with splits:')
    print(sample.to_string(index=False))


def print_summary(df: pd.DataFrame) -> None:
    print('\nAdjusted transactions head:')
    print(df.head())

    total_rows = len(df)
    unique_tickers = df['security'].nunique()
    print('\nSummary:')
    print(f'  Total rows: {total_rows}')
    print(f'  Unique tickers: {unique_tickers}')


def main() -> None:
    ensure_directories()
    transactions = load_transactions()
    splits = load_split_history()
    adjusted = apply_split_adjustments(transactions, splits)
    write_checkpoint(adjusted)

    artifacts = [f"./{OUTPUT_PATH.relative_to(PROJECT_ROOT)}"]
    update_status(artifacts, 'Applied stock split adjustments to transactions.')
    append_changelog_entry(artifacts)
    print_split_report(adjusted, splits)
    print_summary(adjusted)


if __name__ == '__main__':
    main()
