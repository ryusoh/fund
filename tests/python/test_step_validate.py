"""Tests for scripts/twrr/step_validate.py — the pre-commit data gate.

Each invariant is exercised with tiny hand-built frames; the regression case
mirrors the 2026-09-02 ANET incident (a held ticker's price column going
all-NaN in one run).
"""

import importlib.util
import sys
from pathlib import Path

import pandas as pd
import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

spec = importlib.util.spec_from_file_location(
    'step_validate_under_test', PROJECT_ROOT / 'scripts' / 'twrr' / 'step_validate.py'
)
assert spec is not None and spec.loader is not None
step_validate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(step_validate)


def _prices(columns_by_ticker, days=10):
    """Build a daily price frame. values=None means an all-NaN column."""
    index = pd.date_range('2026-08-24', periods=days, freq='D')
    frame = pd.DataFrame(index=index)
    for ticker, values in columns_by_ticker.items():
        frame[ticker] = values if values is not None else float('nan')
    return frame


def _holdings_daily(shares_by_ticker, days=3):
    index = pd.date_range('2026-08-31', periods=days, freq='D')
    return pd.DataFrame(shares_by_ticker, index=index, dtype='float64')


class TestHeldTickerCoverage:
    def test_held_ticker_with_recent_prices_passes(self):
        prices = _prices({'ANET': [100.0] * 10})
        held = step_validate.held_tickers(_holdings_daily({'ANET': [10.0] * 3}))
        assert step_validate.check_held_ticker_coverage(prices, held) == []

    def test_held_ticker_with_stale_prices_fails(self):
        stale = [100.0] * 3 + [float('nan')] * 7
        prices = _prices({'ANET': stale})
        held = step_validate.held_tickers(_holdings_daily({'ANET': [10.0] * 3}))
        violations = step_validate.check_held_ticker_coverage(prices, held, coverage_days=7)
        assert len(violations) == 1
        assert 'ANET' in violations[0]

    def test_held_ticker_with_no_column_fails(self):
        prices = _prices({'VT': [100.0] * 10})
        held = step_validate.held_tickers(_holdings_daily({'ANET': [10.0] * 3}))
        violations = step_validate.check_held_ticker_coverage(prices, held)
        assert len(violations) == 1
        assert 'no price column' in violations[0]

    def test_sold_ticker_is_not_required_to_have_prices(self):
        prices = _prices({'VT': [100.0] * 10})
        holdings = _holdings_daily({'VT': [10.0, 10.0, 10.0], 'ANET': [5.0, 5.0, 0.0]})
        held = step_validate.held_tickers(holdings)
        assert held == {'VT'}
        assert step_validate.check_held_ticker_coverage(prices, held) == []

    def test_fractional_dust_residue_is_not_treated_as_held(self):
        # Real checkpoints carry tiny negative residues from fractional-share
        # rounding on sells (e.g. -0.00074 shares); they must not count.
        holdings = _holdings_daily({'VT': [10.0] * 3, 'COST': [-0.00074] * 3})
        assert step_validate.held_tickers(holdings) == {'VT'}


class TestNoCoverageRegression:
    def test_all_nan_wipe_is_caught(self):
        previous = _prices({'ANET': [100.0] * 10})
        wiped = _prices({'ANET': None})
        violations = step_validate.check_no_coverage_regression(wiped, previous)
        assert len(violations) == 1
        assert '10 -> 0' in violations[0]

    def test_unchanged_coverage_passes(self):
        previous = _prices({'ANET': [100.0] * 10})
        current = _prices({'ANET': [100.0] * 10})
        assert step_validate.check_no_coverage_regression(current, previous) == []

    def test_missing_previous_data_skips_check(self):
        current = _prices({'ANET': None})
        assert step_validate.check_no_coverage_regression(current, None) == []


class TestDelistedNotHeld:
    def test_held_delisted_ticker_fails(self):
        violations = step_validate.check_delisted_not_held({'ANET', 'VT'}, {'ANET'})
        assert violations == ['ANET: held but listed in delisted_tickers.csv']

    def test_disjoint_sets_pass(self):
        assert step_validate.check_delisted_not_held({'VT'}, {'ANET'}) == []


class TestSeamContinuity:
    def _inputs(self, pipeline_value, realtime_price):
        market_value = pd.Series([100.0, pipeline_value])
        holdings_details = {'ANET': {'shares': '10'}}
        latest_prices = {'ANET': realtime_price}
        return market_value, holdings_details, latest_prices

    def test_small_gap_passes(self):
        market_value, holdings_details, latest_prices = self._inputs(1000.0, 100.5)
        assert (
            step_validate.check_seam_continuity(market_value, holdings_details, latest_prices, 0.10)
            == []
        )

    def test_large_gap_fails(self):
        # 45% gap — the ANET incident's symptom
        market_value, holdings_details, latest_prices = self._inputs(1000.0, 145.0)
        violations = step_validate.check_seam_continuity(
            market_value, holdings_details, latest_prices, 0.10
        )
        assert len(violations) == 1
        assert 'seam gap' in violations[0]

    def test_missing_realtime_price_fails(self):
        market_value = pd.Series([1000.0])
        holdings_details = {'ANET': {'shares': '10'}}
        violations = step_validate.check_seam_continuity(market_value, holdings_details, {}, 0.10)
        assert len(violations) == 1
        assert 'missing' in violations[0]


def test_main_passes_on_current_repo_data():
    """Smoke test against the real committed artifacts: the repaired data
    must satisfy every invariant."""
    assert step_validate.main([]) == 0


if __name__ == '__main__':
    sys.exit(pytest.main([__file__, '-q']))
