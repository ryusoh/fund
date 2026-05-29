import json
from unittest.mock import MagicMock, patch

import numpy as np
import pandas as pd
import pytest

import scripts.generate_yield_data as generate_yield_data


@pytest.fixture
def mock_dirs(tmp_path):
    with (
        patch('scripts.generate_yield_data.PROJECT_ROOT', tmp_path),
        patch('scripts.generate_yield_data.DATA_DIR', tmp_path / "data"),
        patch('scripts.generate_yield_data.OUTPUT_DIR', tmp_path / "data" / "output" / "figures"),
        patch('scripts.generate_yield_data.CHECKPOINT_DIR', tmp_path / "data" / "checkpoints"),
        patch(
            'scripts.generate_yield_data.HOLDINGS_PATH',
            tmp_path / "data" / "checkpoints" / "holdings_daily.parquet",
        ),
        patch(
            'scripts.generate_yield_data.PRICES_PATH',
            tmp_path / "data" / "historical_prices.parquet",
        ),
        patch(
            'scripts.generate_yield_data.DIVIDEND_CACHE_PATH',
            tmp_path / "data" / "checkpoints" / "dividend_cache.json",
        ),
        patch('scripts.generate_yield_data.OUTPUT_FILE', tmp_path / "data" / "yield_data.json"),
    ):
        yield tmp_path


def test_load_dividend_cache(mock_dirs):
    # Test file doesn't exist
    assert generate_yield_data.load_dividend_cache() == {}

    # Test file exists and valid
    generate_yield_data.DIVIDEND_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(generate_yield_data.DIVIDEND_CACHE_PATH, 'w') as f:
        json.dump({'AAPL': [['2020-01-01', 0.5]]}, f)

    cache = generate_yield_data.load_dividend_cache()
    assert cache == {'AAPL': [['2020-01-01', 0.5]]}

    # Test file invalid json
    with open(generate_yield_data.DIVIDEND_CACHE_PATH, 'w') as f:
        f.write("{invalid}")

    assert generate_yield_data.load_dividend_cache() == {}


def test_save_dividend_cache(mock_dirs):
    cache = {'AAPL': [['2020-01-01', 0.5]]}
    generate_yield_data.save_dividend_cache(cache)

    with open(generate_yield_data.DIVIDEND_CACHE_PATH, 'r') as f:
        data = json.load(f)
    assert data == cache


def test_save_dividend_cache_error(mock_dirs):
    # Make directory read-only or patch open
    with patch('pathlib.Path.open', side_effect=Exception("Perm denied")):
        generate_yield_data.save_dividend_cache({'AAPL': []})
        assert not generate_yield_data.DIVIDEND_CACHE_PATH.exists()


def test_fetch_dividends():
    with (
        patch('scripts.generate_yield_data.yf.Ticker') as mock_ticker,
        patch('scripts.generate_yield_data.save_dividend_cache') as mock_save,
    ):

        # Test already in cache
        cache = {'AAPL': []}
        res = generate_yield_data.fetch_dividends(['AAPL'], cache)

        mock_t = MagicMock()
        mock_t.dividends = pd.Series(
            [0.5, 0.6], index=pd.DatetimeIndex(['2020-01-01', '2020-04-01'])
        )
        mock_ticker.return_value = mock_t

        cache = {}
        res = generate_yield_data.fetch_dividends(['AAPL'], cache)
        assert 'AAPL' in res
        assert res['AAPL'] == [['2020-01-01', 0.5], ['2020-04-01', 0.6]]
        assert mock_save.call_count == 2

        # Test empty dividends
        mock_t.dividends = pd.Series(dtype=float)
        cache = {}
        res = generate_yield_data.fetch_dividends(['TSLA'], cache)
        assert res['TSLA'] == []

        # Test exception
        mock_ticker.side_effect = Exception("API error")
        cache = {}
        res = generate_yield_data.fetch_dividends(['ERR'], cache)
        assert res['ERR'] == []


def test_calculate_yield_data_no_files(mock_dirs, caplog):
    generate_yield_data.calculate_yield_data()
    assert "Required data files" in caplog.text


def test_calculate_yield_data(mock_dirs):
    # Setup files
    generate_yield_data.HOLDINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    generate_yield_data.PRICES_PATH.parent.mkdir(parents=True, exist_ok=True)

    dates = pd.date_range(start='2020-01-01', periods=3)
    holdings_df = pd.DataFrame(
        {'AAPL': [10, 10, 10], 'TSLA': [5, 5, 5], 'ERR': [0, 0, 0], 'date': dates}, index=dates
    )
    holdings_df.to_parquet(generate_yield_data.HOLDINGS_PATH)

    prices_df = pd.DataFrame(
        {'AAPL': [100.0, 100.0, 100.0], 'TSLA': [np.nan, 200.0, 200.0]}, index=dates
    )
    prices_df.to_parquet(generate_yield_data.PRICES_PATH)

    with (
        patch('scripts.generate_yield_data.load_dividend_cache') as mock_load,
        patch('scripts.generate_yield_data.fetch_dividends') as mock_fetch,
    ):

        mock_load.return_value = {}
        mock_fetch.return_value = {'AAPL': [['2020-01-02', 1.0]], 'TSLA': [], 'ERR': []}

        generate_yield_data.calculate_yield_data()

        assert generate_yield_data.OUTPUT_FILE.exists()
        with open(generate_yield_data.OUTPUT_FILE, 'r') as f:
            data = json.load(f)

        assert len(data) == 3
        # First day: AAPL div TTM=0, TSLA price=nan
        assert data[0]['date'] == '2020-01-01'
        assert data[0]['market_value'] == 1000.0
        assert data[0]['ttm_income'] == 0.0

        # Second day: AAPL div event on 2020-01-02
        assert data[1]['date'] == '2020-01-02'
        assert data[1]['ttm_income'] == 10.0  # 10 shares * 1.0
        assert data[1]['market_value'] == 2000.0  # AAPL(100*10) + TSLA(200*5)
        assert data[1]['daily_dividend'] == 10.0  # 10 shares * $1.0 on ex-date
        assert data[1]['daily_dividends_by_ticker'] == {'AAPL': 10.0}


def test_calculate_yield_data_empty_shares(mock_dirs):
    generate_yield_data.HOLDINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    generate_yield_data.PRICES_PATH.parent.mkdir(parents=True, exist_ok=True)

    dates = pd.date_range(start='2020-01-01', periods=1)
    holdings_df = pd.DataFrame({'AAPL': [0], 'date': dates}, index=dates)
    holdings_df.to_parquet(generate_yield_data.HOLDINGS_PATH)

    prices_df = pd.DataFrame({'AAPL': [100.0]}, index=dates)
    prices_df.to_parquet(generate_yield_data.PRICES_PATH)

    with (
        patch('scripts.generate_yield_data.load_dividend_cache') as mock_load,
        patch('scripts.generate_yield_data.fetch_dividends') as mock_fetch,
    ):

        mock_load.return_value = {}
        mock_fetch.return_value = {'AAPL': []}

        generate_yield_data.calculate_yield_data()

        assert generate_yield_data.OUTPUT_FILE.exists()
        with open(generate_yield_data.OUTPUT_FILE, 'r') as f:
            data = json.load(f)
        assert data[0]['market_value'] == 0.0


def test_calculate_yield_data_missing_price(mock_dirs):
    generate_yield_data.HOLDINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    generate_yield_data.PRICES_PATH.parent.mkdir(parents=True, exist_ok=True)

    dates = pd.date_range(start='2020-01-01', periods=1)
    # Ticker in holdings but not in prices
    holdings_df = pd.DataFrame({'AAPL': [10], 'date': dates}, index=dates)
    holdings_df.to_parquet(generate_yield_data.HOLDINGS_PATH)

    prices_df = pd.DataFrame({'TSLA': [100.0]}, index=dates)
    prices_df.to_parquet(generate_yield_data.PRICES_PATH)

    with (
        patch('scripts.generate_yield_data.load_dividend_cache') as mock_load,
        patch('scripts.generate_yield_data.fetch_dividends') as mock_fetch,
    ):

        mock_load.return_value = {}
        mock_fetch.return_value = {'AAPL': []}

        generate_yield_data.calculate_yield_data()

        assert generate_yield_data.OUTPUT_FILE.exists()
        with open(generate_yield_data.OUTPUT_FILE, 'r') as f:
            data = json.load(f)
        assert data[0]['market_value'] == 0.0


def test_load_dividend_cache_exception(tmp_path):
    with patch('scripts.generate_yield_data.DIVIDEND_CACHE_PATH', tmp_path / "dividend_cache.json"):
        with open(tmp_path / "dividend_cache.json", "w") as f:
            f.write("{invalid json")

        with patch('scripts.generate_yield_data.logging.warning') as mock_warning:
            res = generate_yield_data.load_dividend_cache()
            assert res == {}
            mock_warning.assert_called_once()


def test_daily_dividend_on_ex_date(mock_dirs):
    """daily_dividend should equal shares * dividend on the ex-date, and 0 otherwise."""
    generate_yield_data.HOLDINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    generate_yield_data.PRICES_PATH.parent.mkdir(parents=True, exist_ok=True)

    dates = pd.date_range(start='2020-01-01', periods=2)
    holdings_df = pd.DataFrame({'AAPL': [10, 10], 'date': dates}, index=dates)
    holdings_df.to_parquet(generate_yield_data.HOLDINGS_PATH)

    prices_df = pd.DataFrame({'AAPL': [100.0, 100.0]}, index=dates)
    prices_df.to_parquet(generate_yield_data.PRICES_PATH)

    with (
        patch('scripts.generate_yield_data.load_dividend_cache') as mock_load,
        patch('scripts.generate_yield_data.fetch_dividends') as mock_fetch,
    ):
        mock_load.return_value = {}
        mock_fetch.return_value = {'AAPL': [['2020-01-02', 1.0]]}

        generate_yield_data.calculate_yield_data()

        with open(generate_yield_data.OUTPUT_FILE, 'r') as f:
            data = json.load(f)

        assert data[0]['daily_dividend'] == 0  # No dividend on 2020-01-01
        assert data[1]['daily_dividend'] == 10.0  # 10 shares * $1.0


def test_daily_dividend_multiple_tickers(mock_dirs):
    """daily_dividend should sum across all tickers on the same date."""
    generate_yield_data.HOLDINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    generate_yield_data.PRICES_PATH.parent.mkdir(parents=True, exist_ok=True)

    dates = pd.date_range(start='2020-01-01', periods=2)
    holdings_df = pd.DataFrame({'AAPL': [10, 10], 'TSLA': [5, 5], 'date': dates}, index=dates)
    holdings_df.to_parquet(generate_yield_data.HOLDINGS_PATH)

    prices_df = pd.DataFrame({'AAPL': [100.0, 100.0], 'TSLA': [200.0, 200.0]}, index=dates)
    prices_df.to_parquet(generate_yield_data.PRICES_PATH)

    with (
        patch('scripts.generate_yield_data.load_dividend_cache') as mock_load,
        patch('scripts.generate_yield_data.fetch_dividends') as mock_fetch,
    ):
        mock_load.return_value = {}
        mock_fetch.return_value = {
            'AAPL': [['2020-01-02', 1.0]],
            'TSLA': [['2020-01-02', 2.0]],
        }

        generate_yield_data.calculate_yield_data()

        with open(generate_yield_data.OUTPUT_FILE, 'r') as f:
            data = json.load(f)

        assert data[1]['daily_dividend'] == 20.0
        assert data[1]['daily_dividends_by_ticker'] == {
            'AAPL': 10.0,
            'TSLA': 10.0,
        }  # 10*1.0 + 5*2.0


def test_fetch_dividends_updates_stale():
    """If a ticker is in the cache, it should still be refreshed with the latest data."""
    cache = {'VT': [['2020-01-01', 1.0]]}

    mock_div_series = pd.Series([1.5, 2.0], index=pd.to_datetime(['2020-01-01', '2026-03-20']))

    with patch('yfinance.Ticker') as mock_ticker:
        mock_ticker.return_value.dividends = mock_div_series

        with patch('scripts.generate_yield_data.save_dividend_cache') as mock_save:
            updated_cache = generate_yield_data.fetch_dividends(['VT'], cache)

            mock_ticker.assert_called_once_with('VT')
            assert updated_cache['VT'] == [['2020-01-01', 1.5], ['2026-03-20', 2.0]]
            mock_save.assert_called_once()
