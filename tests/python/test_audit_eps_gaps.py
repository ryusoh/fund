from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

import scripts.audit_eps_gaps as audit_eps_gaps


def test_main_wide_format(capsys):
    with (
        patch('scripts.audit_eps_gaps.pd.read_parquet') as mock_read_parquet,
        patch('scripts.audit_eps_gaps.yf.Ticker') as mock_ticker,
    ):

        # Mock wide format DataFrame
        dates = pd.date_range(start='2020-01-01', periods=3)
        df = pd.DataFrame({'AAPL': [10, 20, 0], 'USD': [100, 100, 100]}, index=dates)
        mock_read_parquet.return_value = df

        # Mock Ticker response
        mock_aapl = MagicMock()
        mock_aapl.income_stmt = pd.DataFrame(
            [[1.0, 2.0]],
            index=['Basic EPS'],
            columns=[pd.Timestamp('2021-01-01'), pd.Timestamp('2020-12-31')],
        )
        mock_ticker.return_value = mock_aapl

        audit_eps_gaps.main()

        captured = capsys.readouterr()
        assert "Loading holdings data..." in captured.out
        assert "Detected Wide Format" in captured.out
        assert "[PARTIAL GAP] AAPL" in captured.out


def test_main_long_format(capsys):
    with (
        patch('scripts.audit_eps_gaps.pd.read_parquet') as mock_read_parquet,
        patch('scripts.audit_eps_gaps.yf.Ticker') as mock_ticker,
    ):

        # Mock long format DataFrame
        dates = pd.date_range(start='2020-01-01', periods=2)
        df = pd.DataFrame({'date': dates, 'ticker': ['MSFT', 'MSFT'], 'value': [10, 20]})
        mock_read_parquet.return_value = df

        # Mock Ticker response with missing data
        mock_msft = MagicMock()
        mock_msft.income_stmt = pd.DataFrame()
        mock_ticker.return_value = mock_msft

        audit_eps_gaps.main()

        captured = capsys.readouterr()
        assert "Loading holdings data..." in captured.out
        assert "Found 1 unique tickers" in captured.out
        assert "[MISSING ALL] MSFT" in captured.out


def test_main_unknown_format():
    with patch('scripts.audit_eps_gaps.pd.read_parquet') as mock_read_parquet:
        # Mock unknown format
        df = pd.DataFrame({'col1': [1, 2], 'col2': [3, 4]})
        mock_read_parquet.return_value = df

        with pytest.raises(ValueError, match="Unknown format"):
            audit_eps_gaps.main()


def test_main_ticker_error(capsys):
    with (
        patch('scripts.audit_eps_gaps.pd.read_parquet') as mock_read_parquet,
        patch('scripts.audit_eps_gaps.yf.Ticker') as mock_ticker,
    ):

        dates = pd.date_range(start='2020-01-01', periods=1)
        df = pd.DataFrame({'date': dates, 'ticker': ['ERR'], 'value': [10]})
        mock_read_parquet.return_value = df

        mock_ticker.side_effect = Exception("API Error")

        audit_eps_gaps.main()


def test_main_not_held():
    with (
        patch('scripts.audit_eps_gaps.pd.read_parquet') as mock_read_parquet,
        patch('scripts.audit_eps_gaps.yf.Ticker') as mock_ticker,
    ):

        dates = pd.date_range(start='2020-01-01', periods=1)
        df = pd.DataFrame({'TSLA': [0]}, index=dates)
        mock_read_parquet.return_value = df

        mock_tsla = MagicMock()
        mock_tsla.income_stmt = pd.DataFrame(
            [[1.0]], index=['Basic EPS'], columns=[pd.Timestamp('2021-01-01')]
        )
        mock_ticker.return_value = mock_tsla

        audit_eps_gaps.main()


def test_main_held_after_coverage(capsys):
    with (
        patch('scripts.audit_eps_gaps.pd.read_parquet') as mock_read_parquet,
        patch('scripts.audit_eps_gaps.yf.Ticker') as mock_ticker,
    ):

        dates = pd.date_range(start='2022-01-01', periods=1)
        df = pd.DataFrame({'date': dates, 'ticker': ['GOOG'], 'value': [10]})
        mock_read_parquet.return_value = df

        mock_goog = MagicMock()
        mock_goog.income_stmt = pd.DataFrame(
            [[1.0]], index=['Basic EPS'], columns=[pd.Timestamp('2020-01-01')]
        )
        mock_ticker.return_value = mock_goog

        audit_eps_gaps.main()


def test_main_wide_format_missing_col():
    # Test `if t not in df.columns: continue` block
    with (
        patch('scripts.audit_eps_gaps.pd.read_parquet') as mock_read_parquet,
        patch('scripts.audit_eps_gaps.yf.Ticker') as mock_ticker,
    ):

        # We need a custom DataFrame that returns a list containing an extra ticker from .columns.tolist()
        class CustomColumns:
            def tolist(self):
                return ['AAPL', 'MISSING']

            def __contains__(self, item):
                return item == 'AAPL'

        df_mock = MagicMock(spec=pd.DataFrame)
        df_mock.columns = CustomColumns()
        df_mock.index = pd.DatetimeIndex(['2020-01-01'])
        # When `t in df.columns` is checked:
        df_mock.__contains__.side_effect = lambda x: x == 'AAPL'
        # For df['AAPL']
        df_mock.__getitem__.return_value = pd.Series([10], index=pd.DatetimeIndex(['2020-01-01']))

        mock_read_parquet.return_value = df_mock

        mock_aapl = MagicMock()
        mock_aapl.income_stmt = pd.DataFrame(
            [[1.0]], index=['Basic EPS'], columns=[pd.Timestamp('2021-01-01')]
        )
        mock_ticker.return_value = mock_aapl

        audit_eps_gaps.main()


def test_main_currency_skipped():
    """Test that currency tickers (USD, CNY, JPY, HKD) are skipped in EPS fetch."""
    with (
        patch('scripts.audit_eps_gaps.pd.read_parquet') as mock_read_parquet,
        patch('scripts.audit_eps_gaps.yf.Ticker') as mock_ticker,
    ):
        dates = pd.date_range(start='2020-01-01', periods=2)
        df = pd.DataFrame({'USD': [100, 100], 'CNY': [50, 50]}, index=dates)
        mock_read_parquet.return_value = df

        audit_eps_gaps.main()

        # yf.Ticker should not be called for USD or CNY
        mock_ticker.assert_not_called()


def test_main_wide_format_held_after_coverage():
    """Test wide format where holding dates are after EPS coverage start."""
    with (
        patch('scripts.audit_eps_gaps.pd.read_parquet') as mock_read_parquet,
        patch('scripts.audit_eps_gaps.yf.Ticker') as mock_ticker,
    ):
        dates = pd.date_range(start='2022-01-01', periods=3)
        df = pd.DataFrame({'AAPL': [10, 20, 30]}, index=dates)
        mock_read_parquet.return_value = df

        mock_aapl = MagicMock()
        mock_aapl.income_stmt = pd.DataFrame(
            [[1.0]], index=['Basic EPS'], columns=[pd.Timestamp('2020-01-01')]
        )
        mock_ticker.return_value = mock_aapl

        audit_eps_gaps.main()


def test_main_exception_during_fetch():
    """Test that exceptions during EPS fetch are handled gracefully."""
    with (
        patch('scripts.audit_eps_gaps.pd.read_parquet') as mock_read_parquet,
        patch('scripts.audit_eps_gaps.yf.Ticker') as mock_ticker,
    ):
        dates = pd.date_range(start='2020-01-01', periods=1)
        df = pd.DataFrame({'ERR': [10]}, index=dates)
        mock_read_parquet.return_value = df

        mock_ticker.side_effect = Exception("API Error")

        # Should not raise
        audit_eps_gaps.main()

def test_main_long_format_empty_holding_dates(capsys):
    with patch('scripts.audit_eps_gaps.pd.read_parquet') as mock_read_parquet, \
         patch('scripts.audit_eps_gaps.yf.Ticker') as mock_ticker:

        dates = pd.date_range(start='2020-01-01', periods=1)
        # Create a DataFrame where filter will result in empty
        df = pd.DataFrame({'date': dates, 'ticker': ['AAPL'], 'value': [10]})

        # We need a custom mock for df[df['ticker'] == t]['date'] to be empty
        df_mock = MagicMock(spec=pd.DataFrame)
        df_mock.columns = ['date', 'ticker', 'value']

        ticker_series = MagicMock()
        ticker_series.unique.return_value = ['AAPL']

        def mock_getitem(key):
            if isinstance(key, str) and key == 'ticker':
                return ticker_series
            else:
                # This is what's returned by df[df['ticker'] == t]
                # It needs to behave like a DataFrame where ['date'] returns an empty series
                filtered_df_mock = MagicMock()
                filtered_df_mock.__getitem__.return_value = pd.Series([], dtype='datetime64[ns]')
                return filtered_df_mock

        df_mock.__getitem__.side_effect = mock_getitem

        mock_read_parquet.return_value = df_mock

        mock_aapl = MagicMock()
        mock_aapl.income_stmt = pd.DataFrame(
            [[1.0]], index=['Basic EPS'], columns=[pd.Timestamp('2021-01-01')]
        )
        mock_ticker.return_value = mock_aapl

        audit_eps_gaps.main()
        captured = capsys.readouterr()
        # Make sure no gap is reported for AAPL since holding_dates is empty
        assert "Total tickers with gaps: 0" in captured.out
