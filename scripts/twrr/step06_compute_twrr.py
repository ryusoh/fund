#!/usr/bin/env python3.11
"""Step 06: Compute Time-Weighted Rate of Return (TWRR)."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import List

import numpy as np
import pandas as pd

sys.path.append(str(Path(__file__).parent))
from utils import append_changelog_entry

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = PROJECT_ROOT / 'data'
MARKET_VALUE_PATH = DATA_DIR / 'daily_market_value.parquet'
CASHFLOW_PATH = DATA_DIR / 'daily_cash_flow.parquet'
TWRR_PATH = DATA_DIR / 'twrr_series.parquet'
FIGURE_HTML = DATA_DIR / 'output/figures/twrr.html'
FIGURE_PNG = DATA_DIR / 'output/figures/twrr.png'

AI_DIR = PROJECT_ROOT / 'ai'
STATUS_PATH = AI_DIR / 'status' / 'AI_STATUS.json'
CHANGELOG_PATH = AI_DIR / 'handoff' / 'CHANGELOG-AI.md'

STEP_NAME = 'step-06_twrr'
TOOL_NAME = 'codex'


def ensure_directories() -> None:
    for path in [TWRR_PATH.parent, STATUS_PATH.parent, CHANGELOG_PATH.parent, FIGURE_HTML.parent]:
        path.mkdir(parents=True, exist_ok=True)


def load_series() -> tuple[pd.Series, pd.Series]:
    if not MARKET_VALUE_PATH.exists():
        raise FileNotFoundError(
            f'Missing daily market value: {MARKET_VALUE_PATH}. Run step-04 first.'
        )
    if not CASHFLOW_PATH.exists():
        raise FileNotFoundError(
            f'Missing daily cashflow series: {CASHFLOW_PATH}. Run step-05 first.'
        )

    mv_df = pd.read_parquet(MARKET_VALUE_PATH)
    cf_df = pd.read_parquet(CASHFLOW_PATH)

    if 'market_value' not in mv_df.columns:
        raise ValueError('daily_market_value.parquet must contain a "market_value" column.')

    market_value = mv_df['market_value']
    market_value.index = pd.to_datetime(market_value.index).tz_localize(None)

    if 'cashflow' not in cf_df.columns:
        raise ValueError('daily_cash_flow.parquet must contain a "cashflow" column.')

    cashflow = cf_df['cashflow']
    cashflow.index = pd.to_datetime(cashflow.index).tz_localize(None)

    combined_index = market_value.index.union(cashflow.index).sort_values()
    market_value = market_value.reindex(combined_index).ffill().bfill()
    cashflow = cashflow.reindex(combined_index).fillna(0.0)

    return market_value, cashflow


def compute_twrr(market_value: pd.Series, cashflow: pd.Series) -> pd.Series:
    previous_mv = market_value.shift(1).fillna(0.0)
    net_flow = -cashflow  # contributions positive, withdrawals negative
    denominator = previous_mv + net_flow

    daily_factor = pd.Series(1.0, index=market_value.index, dtype='float64')

    valid = np.abs(denominator) > 1e-9
    daily_factor.loc[valid] = market_value.loc[valid] / denominator.loc[valid]

    daily_factor.loc[~np.isfinite(daily_factor)] = 1.0
    daily_factor = daily_factor.fillna(1.0)
    daily_factor.iloc[0] = 1.0

    twrr_index = daily_factor.cumprod()
    twrr_index.name = 'twrr'
    return twrr_index


def write_twrr(twrr_index: pd.Series) -> None:
    try:
        twrr_index.to_frame().to_parquet(TWRR_PATH)
    except ImportError as exc:
        raise RuntimeError(
            'Writing parquet requires pyarrow or fastparquet. Install one of them and rerun step-06.'
        ) from exc
    print(f'TWRR series written to {TWRR_PATH}')


def update_status(artifacts: List[str], notes: str) -> None:
    status_data = {
        'step': STEP_NAME,
        'tool': TOOL_NAME,
        'artifacts': artifacts,
        'ts': datetime.now(timezone.utc).isoformat(),
        'notes': notes,
    }
    STATUS_PATH.write_text(json.dumps(status_data, indent=2))


def summarize(twrr_index: pd.Series) -> None:
    print('\nTWRR tail (last 10 rows):')
    print(twrr_index.tail(10))

    total_return = twrr_index.iloc[-1] - 1.0
    total_return_pct = total_return * 100
    print(f'\nTotal period TWRR: {total_return_pct:.2f}%')


def main() -> None:
    ensure_directories()
    market_value, cashflow = load_series()
    twrr_index = compute_twrr(market_value, cashflow)
    write_twrr(twrr_index)

    artifacts = [f"./{TWRR_PATH.relative_to(PROJECT_ROOT)}"]
    update_status(artifacts, 'Computed TWRR index from market value and cashflows.')
    append_changelog_entry(STEP_NAME, artifacts)
    summarize(twrr_index)


if __name__ == '__main__':
    main()
