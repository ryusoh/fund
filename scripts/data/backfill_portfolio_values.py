#!/usr/bin/env python3
"""Backfill historical portfolio values in multiple currencies."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Sequence

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / 'data'
MARKET_VALUE_PATH = DATA_DIR / 'daily_market_value.parquet'
FX_HISTORY_PATH = DATA_DIR / 'fx_daily_rates.csv'
OUTPUT_PATH = DATA_DIR / 'historical_portfolio_values.csv'
REQUIRED_COLUMNS: Sequence[str] = ('USD', 'CNY', 'JPY', 'KRW')


def load_market_value() -> pd.Series:
    if not MARKET_VALUE_PATH.exists():
        raise FileNotFoundError(
            f'Missing {MARKET_VALUE_PATH}. Run step-04 to generate daily market values first.'
        )
    df = pd.read_parquet(MARKET_VALUE_PATH)
    if 'market_value' not in df.columns:
        raise ValueError('daily_market_value.parquet must contain a "market_value" column.')
    series = df['market_value']
    series.index = pd.to_datetime(series.index).tz_localize(None)
    return series.sort_index()


def load_fx_history() -> pd.DataFrame:
    if not FX_HISTORY_PATH.exists():
        raise FileNotFoundError(
            (
                f"Missing FX history file: {FX_HISTORY_PATH}.\n"
                "Populate it with columns: date, USD, CNY, JPY, KRW."
            )
        )
    fx = pd.read_csv(FX_HISTORY_PATH)
    columns = []
    date_column = None
    for col in fx.columns:
        if col.lower() == 'date':
            date_column = col
            columns.append('date')
        else:
            columns.append(col.strip().upper())
    fx.columns = columns

    if date_column is None:
        raise ValueError('FX history must contain a "date" column.')

    fx['date'] = pd.to_datetime(fx['date']).dt.tz_localize(None)
    fx = fx.sort_values('date').set_index('date')

    missing = [col for col in REQUIRED_COLUMNS if col not in fx.columns]
    if missing:
        raise ValueError(
            f'FX history missing required columns: {missing}. Expected {list(REQUIRED_COLUMNS)}.'
        )
    fx = fx[list(REQUIRED_COLUMNS)].astype(float)
    return fx


def compute_portfolio_values(portfolio_mv: pd.Series, fx_history: pd.DataFrame) -> pd.DataFrame:
    date_index = portfolio_mv.index
    fx_history = fx_history.reindex(date_index).ffill().bfill()

    df = pd.DataFrame(index=date_index)
    df['value_usd'] = portfolio_mv
    df['value_cny'] = portfolio_mv * fx_history['CNY']
    df['value_jpy'] = portfolio_mv * fx_history['JPY']
    df['value_krw'] = portfolio_mv * fx_history['KRW']
    df.index.name = 'date'
    return df


def main() -> None:
    parser = argparse.ArgumentParser(
        description='Backfill historical multi-currency portfolio values.'
    )
    parser.add_argument(
        '--dry-run', action='store_true', help='Compute but do not write output file.'
    )
    args = parser.parse_args()

    portfolio_mv = load_market_value()
    fx_history = load_fx_history()
    df = compute_portfolio_values(portfolio_mv, fx_history)

    if args.dry_run:
        preview_path = OUTPUT_PATH.with_suffix('.preview.csv')
        df.to_csv(preview_path, float_format='%.10f')
        print(f'Dry run wrote full preview to {preview_path}')
    else:
        df.to_csv(OUTPUT_PATH, float_format='%.10f')
        print(f'Wrote backfilled portfolio values to {OUTPUT_PATH}')


if __name__ == '__main__':
    main()
