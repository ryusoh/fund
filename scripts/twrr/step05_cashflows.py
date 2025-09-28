#!/usr/bin/env python3.11
"""Step 05: Compute day-level external cashflows."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import List

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = PROJECT_ROOT / 'data'
CHECKPOINT_DIR = DATA_DIR / 'checkpoints'
TRANSACTIONS_PATH = CHECKPOINT_DIR / 'transactions_clean.parquet'
CASHFLOW_PATH = DATA_DIR / 'daily_cash_flow.parquet'

AI_DIR = PROJECT_ROOT / 'ai'
STATUS_PATH = AI_DIR / 'status' / 'AI_STATUS.json'
CHANGELOG_PATH = AI_DIR / 'handoff' / 'CHANGELOG-AI.md'

STEP_NAME = 'step-05_cashflow'
TOOL_NAME = 'codex'


def ensure_directories() -> None:
    for path in [CHECKPOINT_DIR, STATUS_PATH.parent, CHANGELOG_PATH.parent]:
        path.mkdir(parents=True, exist_ok=True)


def load_transactions() -> pd.DataFrame:
    if not TRANSACTIONS_PATH.exists():
        raise FileNotFoundError(
            f'Missing transactions checkpoint: {TRANSACTIONS_PATH}. Run step-01 first.'
        )
    try:
        df = pd.read_parquet(TRANSACTIONS_PATH)
    except ImportError as exc:
        raise RuntimeError(
            'Reading parquet requires pyarrow or fastparquet. Install one of them and rerun step-05.'
        ) from exc
    return df


def compute_cashflows(transactions: pd.DataFrame) -> pd.Series:
    df = transactions.copy()
    df['trade_date'] = pd.to_datetime(df['trade_date']).dt.tz_localize(None)

    order_type_lower = df['order_type'].str.lower()
    cashflow = pd.Series(0.0, index=df.index)

    buy_mask = order_type_lower == 'buy'
    sell_mask = order_type_lower == 'sell'
    zero_price_mask = df['executed_price'].fillna(0) == 0

    cashflow.loc[buy_mask & ~zero_price_mask] = -df.loc[buy_mask & ~zero_price_mask, 'trade_value']
    cashflow.loc[sell_mask & ~zero_price_mask] = df.loc[sell_mask & ~zero_price_mask, 'trade_value']
    cashflow.loc[zero_price_mask] = 0.0

    df['cashflow'] = cashflow

    daily_cashflow = df.groupby(df['trade_date'].dt.normalize())['cashflow'].sum().sort_index()
    return daily_cashflow


def write_cashflow(daily_cashflow: pd.Series) -> None:
    df = daily_cashflow.to_frame(name='cashflow')
    try:
        df.to_parquet(CASHFLOW_PATH)
    except ImportError as exc:
        raise RuntimeError(
            'Writing parquet requires pyarrow or fastparquet. Install one of them and rerun step-05.'
        ) from exc
    print(f'Daily cashflow written to {CASHFLOW_PATH}')


def update_status(artifacts: List[str], notes: str) -> None:
    status_data = {
        'step': STEP_NAME,
        'tool': TOOL_NAME,
        'artifacts': artifacts,
        'ts': datetime.now(timezone.utc).isoformat(),
        'notes': notes,
    }
    STATUS_PATH.write_text(json.dumps(status_data, indent=2))


def append_changelog_entry(artifacts: List[str]) -> None:
    bullet_list = '\n'.join(f'- Computed daily cashflows ({artifact})' for artifact in artifacts)
    entry = f"\n\n### {STEP_NAME}\n{bullet_list}\n"
    if CHANGELOG_PATH.exists():
        with CHANGELOG_PATH.open('a', encoding='utf-8') as f:
            f.write(entry)
    else:
        CHANGELOG_PATH.write_text(entry, encoding='utf-8')


def summarize(daily_cashflow: pd.Series) -> None:
    print('\nDaily cashflow head:')
    print(daily_cashflow.head())

    print('\nSummary:')
    print(f'  Number of cashflow days: {daily_cashflow.shape[0]}')
    print(f'  Total net cashflow: {daily_cashflow.sum():.2f}')
    print(f'  Min daily cashflow: {daily_cashflow.min():.2f}')
    print(f'  Max daily cashflow: {daily_cashflow.max():.2f}')


def main() -> None:
    ensure_directories()
    transactions = load_transactions()
    daily_cashflow = compute_cashflows(transactions)
    write_cashflow(daily_cashflow)

    artifacts = [f"./{CASHFLOW_PATH.relative_to(PROJECT_ROOT)}"]
    update_status(artifacts, 'Computed daily external cashflows.')
    append_changelog_entry(artifacts)
    summarize(daily_cashflow)


if __name__ == '__main__':
    main()
