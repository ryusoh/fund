"""Acceptance-layer behaviour tests for the TWRR pipeline (scripts/twrr/).

See docs/agentic-quality-gates.md section 5: these are the cheapest honest
acceptance stream — a handful of end-to-end cases phrased as portfolio
behaviours, each with tiny hand-computable fixtures, independent of the
unit tests' mock-heavy structure (tests/python/test_step02_apply_splits.py
mocks pandas/numpy and asserts calls, not values).

Every expected number below is computed by hand in the test comments, not
derived from the production code.
"""

import importlib.util
import sys
from pathlib import Path

import pandas as pd
import pytest

# Add project root to path so we can import scripts
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

TWRR_DIR = PROJECT_ROOT / 'scripts' / 'twrr'


def _load_twrr_module(module_name):
    """Load a scripts/twrr module by file path, isolated from sys.modules.

    The step modules do `from utils import append_changelog_entry`, but other
    test files put `scripts/` on sys.path, so a bare `import utils` can
    resolve to `scripts/utils/` instead of `scripts/twrr/utils.py`. Loading
    by file path sidesteps sys.modules name collisions (including the mocked
    pandas/numpy module that test_step02_apply_splits.py leaves behind); the
    real twrr utils is bound under the name 'utils' only for the duration of
    each module's execution, then the previous binding is restored.
    """
    utils_spec = importlib.util.spec_from_file_location(
        'twrr_acceptance_utils', TWRR_DIR / 'utils.py'
    )
    twrr_utils = importlib.util.module_from_spec(utils_spec)
    utils_spec.loader.exec_module(twrr_utils)

    spec = importlib.util.spec_from_file_location(
        f'twrr_acceptance_{module_name}', TWRR_DIR / f'{module_name}.py'
    )
    module = importlib.util.module_from_spec(spec)
    previous_utils = sys.modules.get('utils')
    sys.modules['utils'] = twrr_utils
    try:
        spec.loader.exec_module(module)
    finally:
        if previous_utils is None:
            del sys.modules['utils']
        else:
            sys.modules['utils'] = previous_utils
    return module


step02 = _load_twrr_module('step02_apply_splits')
step04 = _load_twrr_module('step04_compute_holdings')
step05 = _load_twrr_module('step05_cashflows')
step06 = _load_twrr_module('step06_compute_twrr')


def _transactions(rows):
    """Build a transactions frame: (day, order_type, security, qty, price)."""
    return pd.DataFrame(
        {
            'trade_date': pd.to_datetime([r[0] for r in rows]),
            'order_type': [r[1] for r in rows],
            'security': [r[2] for r in rows],
            'quantity': [float(r[3]) for r in rows],
            'executed_price': [float(r[4]) for r in rows],
            'trade_value': [float(r[3]) * float(r[4]) for r in rows],
        }
    )


def _splits(rows):
    """Build a split-history frame: (security, split_day, factor)."""
    if not rows:
        return pd.DataFrame(
            {
                'security': pd.Series(dtype='object'),
                'split_date': pd.Series(dtype='datetime64[ns]'),
                'split_factor': pd.Series(dtype='float64'),
            }
        )
    return pd.DataFrame(
        {
            'security': [r[0] for r in rows],
            'split_date': pd.to_datetime([r[1] for r in rows]),
            'split_factor': [float(r[2]) for r in rows],
        }
    )


def _run_pipeline(transactions, prices_by_day, splits=None):
    """Chain steps 02 -> 04 -> 05 -> 06 the way each step's main() does.

    prices_by_day: {day_string: {security: price}}. Returns
    (adjusted_transactions, holdings, market_value, twrr_index).
    """
    # Step 02: splits adjust share counts, prices are untouched.
    adjusted = step02.apply_split_adjustments(transactions, _splits(splits or []))

    # Step 04: trades accumulate into daily holdings, valued at daily prices.
    prices = pd.DataFrame(prices_by_day, dtype='float64').T
    prices.index = pd.DatetimeIndex(prices.index)
    start = pd.to_datetime(transactions['trade_date']).min().normalize()
    date_index = pd.date_range(start=start, end=prices.index.max().normalize(), freq='D')
    holdings = step04.build_holdings(adjusted, date_index)
    aligned_prices = prices.reindex(date_index).ffill().bfill()
    aligned_prices = aligned_prices.reindex(columns=holdings.columns).fillna(0.0)
    market_value = (holdings * aligned_prices).sum(axis=1)

    # Step 05: external cashflows, then step 06's loader aligns the two
    # series (union of dates, days without a flow count as zero flow).
    daily_cashflow = step05.compute_cashflows(transactions)
    cashflow = daily_cashflow.reindex(market_value.index).fillna(0.0)

    # Step 06: chain cash-flow-adjusted daily returns into the TWRR index.
    twrr_index = step06.compute_twrr(market_value, cashflow)
    return adjusted, holdings, market_value, twrr_index


def test_buy_and_hold_earns_exactly_the_price_return():
    # Given an investor who buys 10 shares of ACME at $10 on day 1 and holds,
    # while the price rises $10 -> $11 -> $12 over three days.
    transactions = _transactions([('2024-01-01', 'BUY', 'ACME', 10, 10.0)])
    prices = {
        '2024-01-01': {'ACME': 10.0},
        '2024-01-02': {'ACME': 11.0},
        '2024-01-03': {'ACME': 12.0},
    }

    # When the pipeline computes the time-weighted return.
    _, holdings, market_value, twrr_index = _run_pipeline(transactions, prices)

    # Then the position is 10 shares throughout, the portfolio is worth
    # 100 -> 110 -> 120, and the total TWRR is exactly the price return:
    # 120/100 - 1 = +20%.
    assert holdings['ACME'].tolist() == [10.0, 10.0, 10.0]
    assert market_value.tolist() == [100.0, 110.0, 120.0]
    assert twrr_index.iloc[-1] == pytest.approx(1.20)


def test_an_external_deposit_is_not_counted_as_investment_return():
    # Given an investor with 10 shares worth $100 who deposits another $100
    # on day 2 to buy 10 more shares at the same $10 price, before the price
    # rises to $11 on day 3.
    transactions = _transactions(
        [
            ('2024-01-01', 'BUY', 'ACME', 10, 10.0),
            ('2024-01-02', 'BUY', 'ACME', 10, 10.0),
        ]
    )
    prices = {
        '2024-01-01': {'ACME': 10.0},
        '2024-01-02': {'ACME': 10.0},
        '2024-01-03': {'ACME': 11.0},
    }

    # When the pipeline computes the time-weighted return.
    _, holdings, market_value, twrr_index = _run_pipeline(transactions, prices)

    # Then day 2's value doubles only because money was added (daily factor
    # 200/(100+100) = 1.0, i.e. no return), and the total TWRR is exactly the
    # price return $10 -> $11 = +10% — the deposit itself earned nothing.
    assert holdings['ACME'].tolist() == [10.0, 20.0, 20.0]
    assert market_value.tolist() == [100.0, 200.0, 220.0]
    assert twrr_index.iloc[-1] == pytest.approx(1.10)


def test_a_split_mid_holding_multiplies_shares_without_changing_the_return():
    # Given an investor holding 10 shares of ACME when a 2-for-1 split happens
    # on day 2 (prices below are split-adjusted: $5 flat, then $5.50 on day 3).
    transactions = _transactions([('2024-01-01', 'BUY', 'ACME', 10, 5.0)])
    splits = [('ACME', '2024-01-02', 2.0)]
    prices = {
        '2024-01-01': {'ACME': 5.0},
        '2024-01-02': {'ACME': 5.0},
        '2024-01-03': {'ACME': 5.5},
    }

    # When the pipeline applies the split and computes the return.
    adjusted, holdings, market_value, twrr_index = _run_pipeline(transactions, prices, splits)

    # Then the split doubles the share count (10 -> 20) rather than altering
    # any price, the split day itself produces zero return (value stays $100),
    # and the total TWRR is exactly the real price move 5.50/5 - 1 = +10%.
    assert adjusted['adjusted_quantity'].tolist() == [20.0]
    assert holdings['ACME'].tolist() == [20.0, 20.0, 20.0]
    assert market_value.tolist() == [100.0, 100.0, 110.0]
    assert twrr_index.iloc[-1] == pytest.approx(1.10)


def test_a_withdrawal_takes_money_out_without_distorting_the_return():
    # Given an investor with 10 shares worth $100 who sells 5 of them at the
    # same $10 price on day 2 (withdrawing $50), before the price rises to
    # $11 on day 3.
    transactions = _transactions(
        [
            ('2024-01-01', 'BUY', 'ACME', 10, 10.0),
            ('2024-01-02', 'SELL', 'ACME', 5, 10.0),
        ]
    )
    prices = {
        '2024-01-01': {'ACME': 10.0},
        '2024-01-02': {'ACME': 10.0},
        '2024-01-03': {'ACME': 11.0},
    }

    # When the pipeline computes the time-weighted return.
    _, holdings, market_value, twrr_index = _run_pipeline(transactions, prices)

    # Then day 2's value halves only because money left (daily factor
    # 50/(100-50) = 1.0, i.e. no return), and the total TWRR is exactly the
    # price return $10 -> $11 = +10% — the withdrawal distorted nothing.
    assert holdings['ACME'].tolist() == [10.0, 5.0, 5.0]
    assert market_value.tolist() == [100.0, 50.0, 55.0]
    assert twrr_index.iloc[-1] == pytest.approx(1.10)


def test_a_zero_price_transaction_creates_no_external_cashflow():
    # Given an investor who buys 10 shares of ACME for $100 on day 1 and also
    # receives 3 free shares of SPINOFF recorded at a zero price (a spin-off
    # or gift is not money moving in or out of the portfolio).
    transactions = _transactions(
        [
            ('2024-01-01', 'BUY', 'ACME', 10, 10.0),
            ('2024-01-01', 'BUY', 'SPINOFF', 3, 0.0),
        ]
    )

    # When the pipeline computes daily external cashflows.
    daily_cashflow = step05.compute_cashflows(transactions)

    # Then day 1's cashflow is exactly the $100 paid for ACME (contributions
    # are negative); the zero-price shares contribute nothing.
    assert daily_cashflow.tolist() == [-100.0]
