"""Regression tests for scripts/twrr/step03_fetch_prices.py.

Bug fixed 2026-09: yfinance batch downloads can return a ticker column that
exists but is entirely NaN (transient upstream gap / rate limit). The old
check (`series is None or series.empty`) treated that as a success, so no
fallback was attempted and the pipeline wrote an all-NaN price column —
wiping the ticker's entire history in one run (ANET, 2026-09-02), which
step 04 then silently valued at $0 via fillna(0.0).
"""

import importlib.util
import sys
from pathlib import Path
from unittest.mock import patch

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

TWRR_DIR = PROJECT_ROOT / 'scripts' / 'twrr'


def _load_step03():
    """Load step03 by file path, like test_twrr_acceptance.py does, so the
    bare `from utils import ...` inside the module resolves to twrr/utils.py
    regardless of sys.modules pollution from other tests."""
    utils_spec = importlib.util.spec_from_file_location(
        'twrr_step03_test_utils', TWRR_DIR / 'utils.py'
    )
    twrr_utils = importlib.util.module_from_spec(utils_spec)
    utils_spec.loader.exec_module(twrr_utils)

    spec = importlib.util.spec_from_file_location(
        'twrr_step03_under_test', TWRR_DIR / 'step03_fetch_prices.py'
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


step03 = _load_step03()

DATE_INDEX = pd.date_range('2024-01-01', periods=3, freq='D')


def _batch_frame(columns_by_ticker):
    """Build the MultiIndex frame yfinance returns with group_by='column'.
    columns_by_ticker: {ticker: list-of-values-or-None-for-all-NaN}."""
    tickers = list(columns_by_ticker)
    fields = ['Adj Close', 'Close']
    cols = pd.MultiIndex.from_product([fields, tickers], names=['Price', 'Ticker'])
    frame = pd.DataFrame(index=DATE_INDEX, columns=cols, dtype='float64')
    for ticker, values in columns_by_ticker.items():
        if values is None:
            continue  # leave the column all-NaN, the flaky-fetch shape
        frame[('Adj Close', ticker)] = values
        frame[('Close', ticker)] = values
    return frame


def test_all_nan_batch_column_counts_as_failure():
    """An all-NaN column for a ticker must land in failures so
    attempt_fallbacks() gets a chance to rescue it."""
    frame = _batch_frame({'ANET': None, 'VT': [100.0, 101.0, 102.0]})

    with patch.object(step03.yf, 'download', return_value=frame):
        combined, successes, failures = step03.fetch_yfinance_prices(['ANET', 'VT'], DATE_INDEX)

    assert 'ANET' in failures
    assert 'ANET' not in successes
    assert 'VT' in successes
    # The wiped column must not reach the combined frame at all.
    assert 'ANET' not in combined.columns
    assert combined['VT'].tolist() == [100.0, 101.0, 102.0]


def test_populated_column_still_counts_as_success():
    """Normal case: real prices are kept and not sent to fallbacks."""
    frame = _batch_frame({'ANET': [50.0, 51.0, 52.0]})

    with patch.object(step03.yf, 'download', return_value=frame):
        combined, successes, failures = step03.fetch_yfinance_prices(['ANET'], DATE_INDEX)

    assert failures == []
    assert successes == ['ANET']
    assert combined['ANET'].tolist() == [50.0, 51.0, 52.0]


# --- Stale-tail refetch and completed-session date range ---
# 2026-09-22 incident: a delayed run hit Yahoo while its equity daily bars
# still stopped at Friday, though the index bars in the same response already
# had Monday. The batch counted the stale series as successes, and the
# forward-fill flat-lined real trading days with no error.

from datetime import date, datetime  # noqa: E402
from zoneinfo import ZoneInfo  # noqa: E402

STALE_INDEX = pd.date_range('2026-09-14', '2026-09-22', freq='D')


def _stale_tail_frame(held_last='2026-09-18', bench_last='2026-09-22', tickers=('VT', 'ANET')):
    """Equities stop at held_last; the benchmark index runs to bench_last."""
    frame = pd.DataFrame(index=STALE_INDEX)
    for ticker in tickers:
        frame[ticker] = [
            100.0 if d <= held_last else float('nan') for d in STALE_INDEX.strftime('%Y-%m-%d')
        ]
    frame['^GSPC'] = [
        5000.0 if d <= bench_last else float('nan') for d in STALE_INDEX.strftime('%Y-%m-%d')
    ]
    return frame


def test_stale_tail_is_refetched_and_merged():
    frame = _stale_tail_frame()
    fresh = pd.Series(101.0, index=STALE_INDEX)
    fresh.loc[:'2026-09-18'] = float('nan')
    fresh.loc['2026-09-19':'2026-09-22'] = [100.5, 100.5, 101.0, 101.0]
    with patch.object(step03, 'attempt_fallbacks', return_value={'VT': fresh}) as mock_fallbacks:
        updated, stale = step03.refresh_stale_tails(
            frame.copy(), ['VT', 'ANET'], STALE_INDEX, STALE_INDEX[0], STALE_INDEX[-1]
        )

    assert stale == ['VT', 'ANET']
    mock_fallbacks.assert_called_once()
    assert updated['VT'].loc['2026-09-22'] == 101.0
    # ANET was not in the refetch result and stays stale.
    assert pd.isna(updated['ANET'].loc['2026-09-22'])


def test_stale_tail_refetch_without_improvement_keeps_original():
    frame = _stale_tail_frame()
    still_stale = pd.Series(100.0, index=STALE_INDEX)
    still_stale.loc['2026-09-19':] = float('nan')
    with patch.object(step03, 'attempt_fallbacks', return_value={'VT': still_stale}):
        updated, stale = step03.refresh_stale_tails(
            frame.copy(), ['VT'], STALE_INDEX, STALE_INDEX[0], STALE_INDEX[-1]
        )

    assert stale == ['VT']
    assert updated['VT'].dropna().index.max() == pd.Timestamp('2026-09-18')


def test_long_stopped_ticker_is_not_refetched():
    # A series that stopped weeks ago is a halted/acquired ticker, not a lag.
    index = pd.date_range('2026-07-15', '2026-09-22', freq='D')
    frame = pd.DataFrame(index=index)
    frame['VT'] = [100.0 if d <= '2026-08-01' else float('nan') for d in index.strftime('%Y-%m-%d')]
    frame['^GSPC'] = 5000.0
    with patch.object(step03, 'attempt_fallbacks') as mock_fallbacks:
        updated, stale = step03.refresh_stale_tails(
            frame.copy(), ['VT'], index, index[0], index[-1]
        )

    assert stale == []
    mock_fallbacks.assert_not_called()
    assert updated['VT'].dropna().index.max() == pd.Timestamp('2026-08-01')


def test_benchmark_tickers_are_not_refetch_candidates():
    # ^N225 lags ^GSPC (different holiday calendar) but must not be refetched.
    frame = _stale_tail_frame(tickers=('VT',))
    frame.loc['2026-09-19':, 'VT'] = 100.0  # VT current
    frame['^N225'] = frame['^GSPC'].where(STALE_INDEX <= '2026-09-18')
    with patch.object(step03, 'attempt_fallbacks') as mock_fallbacks:
        _, stale = step03.refresh_stale_tails(
            frame.copy(), ['VT', '^N225'], STALE_INDEX, STALE_INDEX[0], STALE_INDEX[-1]
        )

    assert stale == []
    mock_fallbacks.assert_not_called()


def test_no_benchmark_column_disables_refetch():
    frame = _stale_tail_frame().drop(columns='^GSPC')
    with patch.object(step03, 'attempt_fallbacks') as mock_fallbacks:
        _, stale = step03.refresh_stale_tails(
            frame.copy(), ['VT'], STALE_INDEX, STALE_INDEX[0], STALE_INDEX[-1]
        )

    assert stale == []
    mock_fallbacks.assert_not_called()


def _transactions_df():
    return pd.DataFrame({'trade_date': [pd.Timestamp('2020-06-25')]})


def test_date_range_excludes_today_while_session_is_forming():
    fake_now = datetime(2026, 9, 22, 10, 0, tzinfo=ZoneInfo('US/Eastern'))
    with patch.object(step03, 'datetime') as mock_datetime:
        mock_datetime.now.return_value = fake_now
        date_index = step03.determine_date_range(_transactions_df())
    assert date_index[-1].date() == date(2026, 9, 21)


def test_date_range_includes_today_after_close():
    fake_now = datetime(2026, 9, 22, 17, 15, tzinfo=ZoneInfo('US/Eastern'))
    with patch.object(step03, 'datetime') as mock_datetime:
        mock_datetime.now.return_value = fake_now
        date_index = step03.determine_date_range(_transactions_df())
    assert date_index[-1].date() == date(2026, 9, 22)
