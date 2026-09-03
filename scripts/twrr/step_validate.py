#!/usr/bin/env python3.11
"""Validate generated TWRR pipeline data before it is committed.

The pipeline fully regenerates its time series every run, so a single bad
fetch (e.g. yfinance returning an all-NaN column for a held ticker — the
2026-09-02 ANET incident) silently rewrites history, and the workflow used
to commit the result blindly. This gate checks the new artifacts against
basic invariants and exits non-zero BEFORE the commit step, so a regression
becomes a red workflow run instead of published data.

Invariants:
  1. Coverage: every currently-held ticker has a recent price.
  2. No regression: no ticker's non-null price count dropped vs HEAD.
  3. Delisted ∩ held = empty.
  4. Seam: pipeline market value ≈ holdings × latest real-time prices.
"""

from __future__ import annotations

import argparse
import io
import json
import subprocess
import sys
from pathlib import Path
from typing import Dict, FrozenSet, List, Optional

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = PROJECT_ROOT / 'data'
HISTORICAL_PRICES_PATH = DATA_DIR / 'historical_prices.parquet'
HOLDINGS_DAILY_PATH = DATA_DIR / 'checkpoints' / 'holdings_daily.parquet'
MARKET_VALUE_PATH = DATA_DIR / 'daily_market_value.parquet'
HOLDINGS_DETAILS_PATH = DATA_DIR / 'holdings_details.json'
FUND_DATA_PATH = DATA_DIR / 'fund_data.json'
DELISTED_TICKERS_FILE = DATA_DIR / 'delisted_tickers.csv'

HISTORICAL_PRICES_GIT_PATH = 'data/historical_prices.parquet'


def load_delisted_tickers() -> FrozenSet[str]:
    if not DELISTED_TICKERS_FILE.exists():
        return frozenset()
    frame = pd.read_csv(DELISTED_TICKERS_FILE)
    if 'ticker' not in frame.columns:
        return frozenset()
    return frozenset(frame['ticker'].dropna().astype(str).str.strip().str.upper())


def held_tickers(holdings_daily: pd.DataFrame) -> FrozenSet[str]:
    """Tickers with a non-zero share count on the most recent holdings row."""
    if holdings_daily.empty:
        return frozenset()
    last_row = holdings_daily.iloc[-1]
    # 0.01-share floor: fractional-share rounding leaves dust residues
    # (e.g. -0.00074 shares) on sold-out tickers; those are not positions
    # and must not demand live price coverage.
    return frozenset(last_row[last_row.abs() > 0.01].index.astype(str).str.upper())


def check_held_ticker_coverage(
    prices: pd.DataFrame, held: FrozenSet[str], coverage_days: int = 7
) -> List[str]:
    """Every held ticker must have a non-NaN price within the trailing window."""
    violations = []
    if prices.empty:
        return ['historical prices are empty']
    window = prices.tail(coverage_days)
    for ticker in sorted(held):
        if ticker not in prices.columns:
            violations.append(f'{ticker}: held but has no price column at all')
        elif window[ticker].notna().sum() == 0:
            violations.append(
                f'{ticker}: held but no non-NaN price in the last {coverage_days} days'
            )
    return violations


def check_no_coverage_regression(
    prices: pd.DataFrame, previous_prices: Optional[pd.DataFrame]
) -> List[str]:
    """A ticker's non-null price count must not drop vs the committed data.

    Catches full-history wipes deterministically: the pipeline regenerates the
    whole series each run, so a vanished ticker shows up as a coverage drop.
    """
    if previous_prices is None or previous_prices.empty:
        return []
    violations = []
    current_counts = prices.notna().sum()
    previous_counts = previous_prices.notna().sum()
    for ticker in previous_counts.index:
        previous = int(previous_counts[ticker])
        current = int(current_counts.get(ticker, 0))
        if current < previous:
            violations.append(f'{ticker}: non-null price count regressed {previous} -> {current}')
    return violations


def check_delisted_not_held(held: FrozenSet[str], delisted: FrozenSet[str]) -> List[str]:
    overlap = sorted(held & delisted)
    return [f'{ticker}: held but listed in delisted_tickers.csv' for ticker in overlap]


def check_seam_continuity(
    market_value: pd.Series,
    holdings_details: Dict[str, Dict[str, str]],
    latest_prices: Dict[str, Optional[float]],
    tolerance: float,
) -> List[str]:
    """The pipeline's last market value must roughly match the real-time side.

    The historical curve and the live balance are computed by two independent
    paths; this is the check that would have flagged the ANET zeroing on day
    one. Intraday drift between the last close and live prices is expected,
    so the tolerance is generous.
    """
    if market_value.empty:
        return ['market value series is empty']
    held = {
        ticker
        for ticker, details in holdings_details.items()
        if float(details.get('shares', 0) or 0) > 0
    }
    missing = []
    resolved_prices: Dict[str, float] = {}
    for ticker in sorted(held):
        price = latest_prices.get(ticker)
        if price is None or float(price) <= 0:
            missing.append(ticker)
        else:
            resolved_prices[ticker] = float(price)
    if missing:
        return [f'real-time prices missing for held tickers: {", ".join(missing)}']

    pipeline_value = float(market_value.iloc[-1])
    realtime_value = sum(float(holdings_details[t]['shares']) * resolved_prices[t] for t in held)
    if pipeline_value <= 0 or realtime_value <= 0:
        return [f'non-positive balance: pipeline={pipeline_value}, realtime={realtime_value}']
    gap = abs(realtime_value - pipeline_value) / pipeline_value
    if gap > tolerance:
        return [
            f'historical/real-time seam gap {gap:.1%} exceeds {tolerance:.0%} '
            f'(pipeline={pipeline_value:.2f}, realtime={realtime_value:.2f})'
        ]
    return []


def load_previous_prices() -> Optional[pd.DataFrame]:
    """Read the committed historical_prices.parquet from git HEAD, if available."""
    try:
        blob = subprocess.run(
            ['git', 'show', f'HEAD:{HISTORICAL_PRICES_GIT_PATH}'],
            cwd=PROJECT_ROOT,
            capture_output=True,
            check=True,
        ).stdout
        return pd.read_parquet(io.BytesIO(blob))
    except Exception as exc:
        print(f'NOTE: no committed prices at HEAD ({exc}); skipping regression check')
        return None


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        '--tolerance',
        type=float,
        default=0.10,
        help='Max allowed relative gap between pipeline and real-time balance (default: 0.10)',
    )
    parser.add_argument(
        '--coverage-days',
        type=int,
        default=7,
        help='Trailing days in which a held ticker must have a price (default: 7)',
    )
    args = parser.parse_args(argv)

    prices = pd.read_parquet(HISTORICAL_PRICES_PATH)
    holdings_daily = pd.read_parquet(HOLDINGS_DAILY_PATH)
    market_value = pd.read_parquet(MARKET_VALUE_PATH)['market_value']
    holdings_details = json.loads(HOLDINGS_DETAILS_PATH.read_text())
    latest_prices = json.loads(FUND_DATA_PATH.read_text())

    held = held_tickers(holdings_daily)
    delisted = load_delisted_tickers()

    checks = {
        'held-ticker coverage': check_held_ticker_coverage(prices, held, args.coverage_days),
        'no coverage regression': check_no_coverage_regression(prices, load_previous_prices()),
        'delisted not held': check_delisted_not_held(held, delisted),
        'historical/real-time seam': check_seam_continuity(
            market_value, holdings_details, latest_prices, args.tolerance
        ),
    }

    failures = 0
    for name, violations in checks.items():
        if violations:
            failures += len(violations)
            print(f'FAIL {name}:')
            for violation in violations:
                print(f'  - {violation}')
        else:
            print(f'OK   {name}')

    if failures:
        print(f'\n{failures} data validation failure(s); refusing to commit.')
        return 1
    print('\nAll data validation checks passed.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
