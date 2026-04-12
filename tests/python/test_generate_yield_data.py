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
        assert res == cache
        mock_ticker.assert_not_called()

        # Test not in cache
        mock_t = MagicMock()
        mock_t.dividends = pd.Series(
            [0.5, 0.6], index=pd.DatetimeIndex(['2020-01-01', '2020-04-01'])
        )
        mock_ticker.return_value = mock_t

        cache = {}
        res = generate_yield_data.fetch_dividends(['AAPL'], cache)
        assert 'AAPL' in res
        assert res['AAPL'] == [['2020-01-01', 0.5], ['2020-04-01', 0.6]]
        mock_save.assert_called_once()

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
