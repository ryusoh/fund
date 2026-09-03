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
