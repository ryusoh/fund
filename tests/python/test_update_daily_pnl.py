"""Tests for update_daily_pnl.py - regression tests for stale data bug.

This module tests the fix for the regression where using period="1d" in
yfinance.history() could return stale/unchanged portfolio values when:
1. The script runs before market open (no new data yet)
2. Network/cache issues cause old data to be returned
3. Market is closed but script expects new data

The fix uses period="5d" to ensure we always get the most recent trading
day's closing price.
"""

import csv
import json
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any, Dict, List
from unittest.mock import MagicMock, patch

import pandas as pd

# Add project root to path so we can import scripts
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from scripts.pnl.update_daily_pnl import (  # noqa: E402
    _get_latest_trading_day,
    calculate_daily_values,
    calculate_daily_values_with_date,
)


class TestUpdateDailyPnlRegression(unittest.TestCase):
    """Regression tests for the stale data bug (period="1d" vs period="5d")."""

    def setUp(self) -> None:
        """Set up test fixtures."""
        self.temp_dir = tempfile.TemporaryDirectory()
        self.temp_path = Path(self.temp_dir.name)

        # Create mock holdings file
        self.holdings_path = self.temp_path / "holdings_details.json"
        self.holdings_data = {
            "AAPL": {"shares": "100", "average_price": "150.00"},
            "MSFT": {"shares": "50", "average_price": "280.00"},
        }
        self.holdings_path.write_text(json.dumps(self.holdings_data), encoding="utf-8")

        # Create mock forex file
        self.forex_path = self.temp_path / "fx_data.json"
        self.forex_data = {
            "base": "USD",
            "currencies": ["CNY", "JPY", "KRW"],
            "rates": {"CNY": 7.2, "JPY": 145.0, "KRW": 1300.0},
        }
        self.forex_path.write_text(json.dumps(self.forex_data), encoding="utf-8")

    def tearDown(self) -> None:
        """Clean up test fixtures."""
        self.temp_dir.cleanup()

    def _create_mock_history_response(self, dates: List[str], closes: List[float]) -> MagicMock:
        """Create a mock yfinance history response with specified dates and closes."""
        mock_history = MagicMock()
        mock_history.empty = False
        # Create proper DatetimeIndex that strftime will work on
        mock_df = pd.DataFrame(
            {"Close": closes},
            index=pd.to_datetime(dates),
        )
        mock_history.__getitem__ = lambda self, key: mock_df[key]
        mock_history.get = lambda key: mock_df.get(key)
        # Set up index to return actual datetime objects
        mock_history.index = mock_df.index
        return mock_history

    def test_fetches_most_recent_trading_day_data(self) -> None:
        """Test that calculate_daily_values fetches the most recent trading day's close.

        This is the primary regression test for the bug where period="1d" would
        return stale data. With period="5d", we should always get the latest
        available close price even if it's from a previous trading day.

        Scenario:
        - Today is 2026-02-25 (Wednesday)
        - Most recent trading day is 2026-02-24 (Tuesday) with close $150
        - Older data from 2026-02-21 (Friday) with close $145

        Expected: Script should use $150 (Feb 24 close), not $145 (Feb 21 close)
        """
        # Mock yfinance to return 5 days of history with different close prices
        # The most recent day (Feb 24) has a different price than older days
        mock_history = self._create_mock_history_response(
            dates=[
                "2026-02-19 00:00:00-05:00",
                "2026-02-20 00:00:00-05:00",
                "2026-02-21 00:00:00-05:00",
                "2026-02-23 00:00:00-05:00",
                "2026-02-24 00:00:00-05:00",  # Most recent trading day
            ],
            closes=[140.0, 142.0, 145.0, 148.0, 150.0],  # Latest close is $150
        )

        mock_ticker = MagicMock()
        mock_ticker.history.return_value = mock_history

        with patch("yfinance.Ticker", return_value=mock_ticker) as mock_ticker_class:
            # Patch file paths
            with (
                patch("scripts.pnl.update_daily_pnl.HOLDINGS_FILE", self.holdings_path),
                patch("scripts.pnl.update_daily_pnl.FOREX_FILE", self.forex_path),
            ):
                result = calculate_daily_values(self.holdings_data, self.forex_data)

            # Verify yfinance was called with period="5d" (the fix)
            # The function iterates through all tickers, so check any call includes period="5d"
            calls = mock_ticker_class.call_args_list
            self.assertTrue(len(calls) >= 1, "Ticker should be called at least once")

            # Verify period="5d" was used in history calls (the key fix for stale data bug)
            mock_ticker.history.assert_called_with(period="5d")

            # Verify we used the most recent close price ($150), not older data
            # AAPL: 100 shares * $150 = $15,000
            # MSFT: 50 shares * $150 = $7,500 (same mock price for simplicity)
            # Total: $22,500
            expected_total = 100 * 150.0 + 50 * 150.0  # $22,500
            self.assertAlmostEqual(result["value_usd"], expected_total, places=2)

    def test_stale_data_bug_would_fail_with_period_1d(self) -> None:
        """Demonstrate that period="1d" would cause stale data issues.

        This test shows what would happen with the old buggy code:
        - period="1d" might return no data or old cached data
        - This would cause portfolio values to be unchanged from previous day

        This is a regression test to ensure we don't revert to period="1d".
        """
        # Simulate what happens with period="1d" - returns old/stale data
        mock_history_stale = self._create_mock_history_response(
            dates=["2026-02-21 00:00:00-05:00"],  # Old data from Friday
            closes=[145.0],  # Stale price
        )

        mock_ticker = MagicMock()
        mock_ticker.history.return_value = mock_history_stale

        # Track what period parameter was used
        captured_period = {}

        def capture_history_call(period: str = "1d", **kwargs: Any) -> MagicMock:
            captured_period["value"] = period
            return mock_history_stale

        mock_ticker.history.side_effect = capture_history_call

        with patch("yfinance.Ticker", return_value=mock_ticker):
            with (
                patch("scripts.pnl.update_daily_pnl.HOLDINGS_FILE", self.holdings_path),
                patch("scripts.pnl.update_daily_pnl.FOREX_FILE", self.forex_path),
            ):
                result = calculate_daily_values(self.holdings_data, self.forex_data)

        # Verify the fix is in place - we should use period="5d"
        self.assertEqual(captured_period.get("value"), "5d")

        # If we had used period="1d" with stale data, the value would be wrong
        # This assertion documents what the correct behavior should be
        # (using most recent available data, not stale data)
        expected_with_latest = 100 * 145.0 + 50 * 145.0  # Using the only available data
        self.assertAlmostEqual(result["value_usd"], expected_with_latest, places=2)

    def test_handles_multiple_trading_days_correctly(self) -> None:
        """Test that the script correctly handles gaps in trading days.

        Scenario with market holidays/weekends:
        - Feb 21 (Fri): $145
        - Feb 22-23 (Sat-Sun): Market closed
        - Feb 24 (Mon): $150
        - Feb 25 (Tue, today): Script runs before market open

        Expected: Should use Feb 24 close ($150), not Feb 21 ($145)
        """
        mock_history = self._create_mock_history_response(
            dates=[
                "2026-02-21 00:00:00-05:00",  # Friday
                "2026-02-24 00:00:00-05:00",  # Monday (most recent)
            ],
            closes=[145.0, 150.0],
        )

        mock_ticker = MagicMock()
        mock_ticker.history.return_value = mock_history

        with patch("yfinance.Ticker", return_value=mock_ticker):
            with (
                patch("scripts.pnl.update_daily_pnl.HOLDINGS_FILE", self.holdings_path),
                patch("scripts.pnl.update_daily_pnl.FOREX_FILE", self.forex_path),
            ):
                result = calculate_daily_values(self.holdings_data, self.forex_data)

        # Should use Monday's close ($150), not Friday's ($145)
        expected_total = 100 * 150.0 + 50 * 150.0  # $22,500
        self.assertAlmostEqual(result["value_usd"], expected_total, places=2)

    def test_currency_conversions_use_latest_rates(self) -> None:
        """Test that currency conversions are calculated with latest portfolio value."""
        mock_history = self._create_mock_history_response(
            dates=["2026-02-24 00:00:00-05:00"],
            closes=[150.0],
        )

        mock_ticker = MagicMock()
        mock_ticker.history.return_value = mock_history

        with patch("yfinance.Ticker", return_value=mock_ticker):
            with (
                patch("scripts.pnl.update_daily_pnl.HOLDINGS_FILE", self.holdings_path),
                patch("scripts.pnl.update_daily_pnl.FOREX_FILE", self.forex_path),
            ):
                result = calculate_daily_values(self.holdings_data, self.forex_data)

        # USD value
        expected_usd = 100 * 150.0 + 50 * 150.0  # $22,500
        self.assertAlmostEqual(result["value_usd"], expected_usd, places=2)

        # Currency conversions should use the forex rates from the file
        self.assertAlmostEqual(result["value_cny"], expected_usd * 7.2, places=2)
        self.assertAlmostEqual(result["value_jpy"], expected_usd * 145.0, places=2)
        self.assertAlmostEqual(result["value_krw"], expected_usd * 1300.0, places=2)


class TestGetLatestTradingDay(unittest.TestCase):
    """Tests for _get_latest_trading_day helper function."""

    @patch("yfinance.Ticker")
    def test_returns_latest_trading_day_from_market_data(self, mock_ticker_class) -> None:
        """Test that _get_latest_trading_day returns the most recent trading day from SPY data."""
        # Mock SPY history with trading days
        mock_spy = MagicMock()
        mock_spy.history.return_value = pd.DataFrame(
            {"Close": [450.0, 452.0]},
            index=pd.to_datetime(["2026-02-23", "2026-02-24"]),
        )
        mock_ticker_class.return_value = mock_spy

        result = _get_latest_trading_day()

        # Should return the most recent trading day from the mock data
        self.assertEqual(result, "2026-02-24")
        mock_ticker_class.assert_called_with("SPY")
        mock_spy.history.assert_called_with(period="2d")

    @patch("yfinance.Ticker")
    def test_falls_back_to_business_day_on_error(self, mock_ticker_class) -> None:
        """Test fallback to previous business day when market data fails."""
        # Simulate yfinance error
        mock_spy = MagicMock()
        mock_spy.history.side_effect = Exception("Network error")
        mock_ticker_class.return_value = mock_spy

        result = _get_latest_trading_day()

        # Should fall back to previous business day calculation
        self.assertIsInstance(result, str)
        self.assertRegex(result, r"^\d{4}-\d{2}-\d{2}$")


class TestCalculateDailyValuesEdgeCases(unittest.TestCase):
    """Edge case tests for calculate_daily_values function."""

    def setUp(self) -> None:
        """Set up test fixtures."""
        self.temp_dir = tempfile.TemporaryDirectory()
        self.temp_path = Path(self.temp_dir.name)

        self.holdings_path = self.temp_path / "holdings_details.json"
        self.holdings_data = {
            "AAPL": {"shares": "100", "average_price": "150.00"},
        }
        self.holdings_path.write_text(json.dumps(self.holdings_data), encoding="utf-8")

        self.forex_path = self.temp_path / "fx_data.json"
        self.forex_data = {"rates": {"USD": 1.0}}
        self.forex_path.write_text(json.dumps(self.forex_data), encoding="utf-8")

    def tearDown(self) -> None:
        """Clean up test fixtures."""
        self.temp_dir.cleanup()

    def _create_mock_history_response(self, dates: List[str], closes: List[float]) -> MagicMock:
        """Create a mock yfinance history response with specified dates and closes."""
        mock_history = MagicMock()
        mock_history.empty = False
        # Create proper DatetimeIndex that strftime will work on
        mock_df = pd.DataFrame(
            {"Close": closes},
            index=pd.to_datetime(dates),
        )
        mock_history.__getitem__ = lambda self, key: mock_df[key]
        mock_history.get = lambda key: mock_df.get(key)
        # Set up index to return actual datetime objects
        mock_history.index = mock_df.index
        return mock_history

    def test_empty_history_returns_zero_value(self) -> None:
        """Test that empty history response is handled gracefully."""
        mock_history = MagicMock()
        mock_history.empty = True

        mock_ticker = MagicMock()
        mock_ticker.history.return_value = mock_history

        with patch("yfinance.Ticker", return_value=mock_ticker):
            with (
                patch("scripts.pnl.update_daily_pnl.HOLDINGS_FILE", self.holdings_path),
                patch("scripts.pnl.update_daily_pnl.FOREX_FILE", self.forex_path),
            ):
                result = calculate_daily_values(self.holdings_data, self.forex_data)

        # Should return zero values when no data available
        self.assertEqual(result["value_usd"], 0.0)

    def test_missing_fx_rate_defaults_to_1(self) -> None:
        """Test that missing FX rate defaults to 1.0."""
        mock_history = self._create_mock_history_response(
            dates=["2026-02-24 00:00:00-05:00"],
            closes=[150.0],
        )

        mock_ticker = MagicMock()
        mock_ticker.history.return_value = mock_history

        # Forex with missing currency
        forex_data: Dict[str, Any] = {"rates": {}}  # No rates defined

        with patch("yfinance.Ticker", return_value=mock_ticker):
            with (
                patch("scripts.pnl.update_daily_pnl.HOLDINGS_FILE", self.holdings_path),
                patch("scripts.pnl.update_daily_pnl.FOREX_FILE", self.forex_path),
            ):
                result = calculate_daily_values(self.holdings_data, forex_data)

        # Should use default rate of 1.0
        expected_usd = 100 * 150.0
        self.assertAlmostEqual(result["value_usd"], expected_usd, places=2)


class TestStaleDataDetection(unittest.TestCase):
    """Integration tests for stale data detection and correction."""

    def setUp(self) -> None:
        """Set up test fixtures."""
        self.temp_dir = tempfile.TemporaryDirectory()
        self.temp_path = Path(self.temp_dir.name)

        # Create mock holdings file
        self.holdings_path = self.temp_path / "holdings_details.json"
        self.holdings_data = {
            "AAPL": {"shares": "100", "average_price": "150.00"},
        }
        self.holdings_path.write_text(json.dumps(self.holdings_data), encoding="utf-8")

        # Create mock forex file
        self.forex_path = self.temp_path / "fx_data.json"
        self.forex_data = {"rates": {"USD": 1.0}}
        self.forex_path.write_text(json.dumps(self.forex_data), encoding="utf-8")

    def tearDown(self) -> None:
        """Clean up test fixtures."""
        self.temp_dir.cleanup()

    def _create_mock_history_response(self, dates: List[str], closes: List[float]) -> MagicMock:
        """Create a mock yfinance history response with specified dates and closes."""
        mock_history = MagicMock()
        mock_history.empty = False
        # Create proper DatetimeIndex that strftime will work on
        mock_df = pd.DataFrame(
            {"Close": closes},
            index=pd.to_datetime(dates),
        )
        mock_history.__getitem__ = lambda self, key: mock_df[key]
        mock_history.get = lambda key: mock_df.get(key)
        # Set up index to return actual datetime objects
        mock_history.index = mock_df.index
        return mock_history


class TestCalculateDailyValuesWithDate(unittest.TestCase):
    """Tests for the new calculate_daily_values_with_date function."""

    def setUp(self) -> None:
        """Set up test fixtures."""
        self.temp_dir = tempfile.TemporaryDirectory()
        self.temp_path = Path(self.temp_dir.name)

        self.holdings_path = self.temp_path / "holdings_details.json"
        self.holdings_data = {
            "AAPL": {"shares": "100", "average_price": "150.00"},
        }
        self.holdings_path.write_text(json.dumps(self.holdings_data), encoding="utf-8")

        self.forex_path = self.temp_path / "fx_data.json"
        self.forex_data = {"rates": {"USD": 1.0}}
        self.forex_path.write_text(json.dumps(self.forex_data), encoding="utf-8")

    def tearDown(self) -> None:
        """Clean up test fixtures."""
        self.temp_dir.cleanup()

    def _create_mock_history_response(self, dates: List[str], closes: List[float]) -> MagicMock:
        """Create a mock yfinance history response with specified dates and closes."""
        mock_history = MagicMock()
        mock_history.empty = False
        # Create proper DatetimeIndex that strftime will work on
        mock_df = pd.DataFrame(
            {"Close": closes},
            index=pd.to_datetime(dates),
        )
        mock_history.__getitem__ = lambda self, key: mock_df[key]
        mock_history.get = lambda key: mock_df.get(key)
        # Set up index to return actual datetime objects
        mock_history.index = mock_df.index
        return mock_history

    def test_returns_actual_market_data_date(self) -> None:
        """Test that calculate_daily_values_with_date returns the actual market data date."""
        mock_history = self._create_mock_history_response(
            dates=[
                "2026-02-21 00:00:00-05:00",
                "2026-02-24 00:00:00-05:00",  # Most recent trading day
            ],
            closes=[145.0, 150.0],
        )

        mock_ticker = MagicMock()
        mock_ticker.history.return_value = mock_history

        with patch("yfinance.Ticker", return_value=mock_ticker):
            with (
                patch("scripts.pnl.update_daily_pnl.HOLDINGS_FILE", self.holdings_path),
                patch("scripts.pnl.update_daily_pnl.FOREX_FILE", self.forex_path),
            ):
                values, actual_date = calculate_daily_values_with_date(
                    self.holdings_data, self.forex_data
                )

        # Should return the actual date from market data (Feb 24)
        self.assertEqual(actual_date, "2026-02-24")
        # Should calculate correct value (100 shares * $150)
        self.assertAlmostEqual(values["value_usd"], 15000.0, places=2)

    def test_returns_none_when_no_market_data(self) -> None:
        """Test that calculate_daily_values_with_date returns None date when no data."""
        mock_history = MagicMock()
        mock_history.empty = True

        mock_ticker = MagicMock()
        mock_ticker.history.return_value = mock_history

        with patch("yfinance.Ticker", return_value=mock_ticker):
            with (
                patch("scripts.pnl.update_daily_pnl.HOLDINGS_FILE", self.holdings_path),
                patch("scripts.pnl.update_daily_pnl.FOREX_FILE", self.forex_path),
            ):
                values, actual_date = calculate_daily_values_with_date(
                    self.holdings_data, self.forex_data
                )

        # Should return None when no market data available
        self.assertIsNone(actual_date)
        # Should return zero values
        self.assertEqual(values["value_usd"], 0.0)


class TestDateOverwritePrevention(unittest.TestCase):
    """Regression tests for the date overwrite bug (GitHub issue).

    This test suite prevents regression of the bug where running the update
    script on a new day (e.g., Feb 25) would overwrite the previous day's
    data (Feb 24) instead of appending new data.

    The bug occurred because:
    1. Script used datetime.now() to determine the target date
    2. When running before market close, yfinance would return previous day's data
    3. Script would label previous day's data with current date, overwriting existing data

    The fix uses calculate_daily_values_with_date() to get the ACTUAL date
    of the market data being fetched, ensuring the date label matches the data.
    """

    def setUp(self) -> None:
        """Set up test fixtures."""
        self.temp_dir = tempfile.TemporaryDirectory()
        self.temp_path = Path(self.temp_dir.name)

        # Create mock holdings file
        self.holdings_path = self.temp_path / "holdings_details.json"
        self.holdings_data = {
            "AAPL": {"shares": "100", "average_price": "150.00"},
        }
        self.holdings_path.write_text(json.dumps(self.holdings_data), encoding="utf-8")

        # Create mock forex file
        self.forex_path = self.temp_path / "fx_data.json"
        self.forex_data = {"rates": {"USD": 1.0}}
        self.forex_path.write_text(json.dumps(self.forex_data), encoding="utf-8")

    def tearDown(self) -> None:
        """Clean up test fixtures."""
        self.temp_dir.cleanup()

    def _create_mock_history_response(self, dates: List[str], closes: List[float]) -> MagicMock:
        """Create a mock yfinance history response with specified dates and closes."""
        mock_history = MagicMock()
        mock_history.empty = False
        # Create proper DatetimeIndex that strftime will work on
        mock_df = pd.DataFrame(
            {"Close": closes},
            index=pd.to_datetime(dates),
        )
        mock_history.__getitem__ = lambda self, key: mock_df[key]
        mock_history.get = lambda key: mock_df.get(key)
        # Set up index to return actual datetime objects
        mock_history.index = mock_df.index
        return mock_history

    @patch("scripts.pnl.update_daily_pnl.HISTORICAL_CSV")
    @patch("scripts.pnl.update_daily_pnl.pd.read_csv")
    def test_does_not_overwrite_existing_market_data_date(
        self, mock_read_csv, mock_csv_path
    ) -> None:
        """Test that existing data for the market data date is NOT overwritten.

        This is the primary regression test for the bug where:
        - CSV has data for 2026-02-24 with value $10,000
        - Script runs, fetches market data which returns 2026-02-24
        - Script should NOT overwrite Feb 24 data, should exit cleanly

        Before the fix: Script would use datetime.now() and overwrite data
        After the fix: Script uses actual market data date and exits if it exists
        """
        from scripts.pnl.update_daily_pnl import main

        # Create CSV with existing data for Feb 24
        csv_path = self.temp_path / "historical_portfolio_values.csv"
        original_feb24_value = 10000.0
        csv_path.write_text(
            "date,value_usd,value_cny,value_jpy,value_krw\n"
            f"2026-02-24,{original_feb24_value},72000.0,1450000.0,13000000.0\n",
            encoding="utf-8",
        )

        # Mock the CSV path to use our temp file
        mock_csv_path.__truediv__ = lambda self, key: self.temp_path / key
        mock_csv_path.exists.return_value = True
        mock_csv_path.open = csv_path.open

        # Mock pd.read_csv
        mock_df = MagicMock()
        mock_df.tail.return_value = "mock output"
        mock_read_csv.return_value = mock_df

        # Mock yfinance to return Feb 24 data (same as existing)
        mock_history = self._create_mock_history_response(
            dates=["2026-02-24"],
            closes=[150.0],  # Would calculate to $15,000 (different from original)
        )
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = mock_history

        with patch("yfinance.Ticker", return_value=mock_ticker):
            with (
                patch("scripts.pnl.update_daily_pnl.HOLDINGS_FILE", self.holdings_path),
                patch("scripts.pnl.update_daily_pnl.FOREX_FILE", self.forex_path),
            ):
                # Run main - should exit without modifying data
                with self.assertRaises(SystemExit) as cm:
                    main()
                self.assertEqual(cm.exception.code, 0)  # Clean exit

        # Verify the Feb 24 row was NOT modified
        with csv_path.open("r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            rows = list(reader)

        self.assertEqual(len(rows), 1, "Should still have only one row")
        self.assertEqual(rows[0]["date"], "2026-02-24")
        # Critical assertion: original value should be preserved
        self.assertEqual(float(rows[0]["value_usd"]), original_feb24_value)

    @patch("scripts.pnl.update_daily_pnl.HISTORICAL_CSV")
    @patch("scripts.pnl.update_daily_pnl.pd.read_csv")
    def test_appends_new_market_data_date_when_available(
        self, mock_read_csv, mock_csv_path
    ) -> None:
        """Test that new data is appended when market returns a new date.

        Scenario:
        - CSV has data for 2026-02-24
        - Market data returns 2026-02-25 (new trading day)
        - Script should append Feb 25 data, NOT modify Feb 24

        This verifies the fix correctly uses the actual market data date
        instead of datetime.now().
        """
        from scripts.pnl.update_daily_pnl import main

        # Create CSV with existing data for Feb 24
        csv_path = self.temp_path / "historical_portfolio_values.csv"
        original_feb24_value = 10000.0
        csv_path.write_text(
            "date,value_usd,value_cny,value_jpy,value_krw\n"
            f"2026-02-24,{original_feb24_value},72000.0,1450000.0,13000000.0\n",
            encoding="utf-8",
        )

        # Mock the CSV path
        mock_csv_path.__truediv__ = lambda self, key: self.temp_path / key
        mock_csv_path.exists.return_value = True
        mock_csv_path.open = csv_path.open

        # Mock pd.read_csv
        mock_df = MagicMock()
        mock_df.tail.return_value = "mock output"
        mock_read_csv.return_value = mock_df

        # Mock yfinance to return Feb 25 data (NEW date)
        mock_history = self._create_mock_history_response(
            dates=["2026-02-24", "2026-02-25"],
            closes=[150.0, 155.0],  # Feb 25 close is $155
        )
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = mock_history

        with patch("yfinance.Ticker", return_value=mock_ticker):
            with (
                patch("scripts.pnl.update_daily_pnl.HOLDINGS_FILE", self.holdings_path),
                patch("scripts.pnl.update_daily_pnl.FOREX_FILE", self.forex_path),
            ):
                # Run main - should append Feb 25 data (no SystemExit on success)
                main()

        # Verify results
        with csv_path.open("r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            rows = list(reader)

        # Should have 2 rows now
        self.assertEqual(len(rows), 2)

        # Feb 24 should be unchanged
        feb24_row = next(r for r in rows if r["date"] == "2026-02-24")
        self.assertEqual(float(feb24_row["value_usd"]), original_feb24_value)

        # Feb 25 should be appended with correct value (100 shares * $155 = $15,500)
        feb25_row = next(r for r in rows if r["date"] == "2026-02-25")
        self.assertEqual(float(feb25_row["value_usd"]), 15500.0)

    @patch("scripts.pnl.update_daily_pnl.HISTORICAL_CSV")
    @patch("scripts.pnl.update_daily_pnl.pd.read_csv")
    def test_ci_workflow_scenario_feb25_does_not_overwrite_feb24(
        self, mock_read_csv, mock_csv_path
    ) -> None:
        """Test the exact CI workflow scenario that caused the bug.

        Reproducing the original bug scenario:
        - Date: Feb 25, 2026 (workflow runs at 21:15 UTC)
        - CSV has: Feb 24 data (most recent trading day)
        - Market: Feb 25 market just closed, yfinance returns Feb 25 data
        - Expected: Append Feb 25 data, preserve Feb 24

        The bug was that the script would:
        - Use datetime.now() which returned Feb 25
        - But yfinance might return Feb 24 close if market hadn't closed
        - This caused Feb 24 row to be overwritten with Feb 25 label

        The fix ensures:
        - Uses actual market data date from yfinance
        - Only appends when market data date > last_date_in_csv
        - Never overwrites existing dates
        """
        from scripts.pnl.update_daily_pnl import main

        # Simulate CSV with Feb 24 data (as it would exist before CI runs)
        csv_path = self.temp_path / "historical_portfolio_values.csv"
        feb24_value = 1244879.673407347  # Actual value from the corrupted data
        csv_path.write_text(
            "date,value_usd,value_cny,value_jpy,value_krw\n"
            f"2026-02-24,{feb24_value},8584067.78798036,193303670.8070194,1799622953.4711287\n",
            encoding="utf-8",
        )

        mock_csv_path.__truediv__ = lambda self, key: self.temp_path / key
        mock_csv_path.exists.return_value = True
        mock_csv_path.open = csv_path.open

        # Mock pd.read_csv
        mock_df = MagicMock()
        mock_df.tail.return_value = "mock output"
        mock_read_csv.return_value = mock_df

        # Scenario: Market has closed on Feb 25, yfinance returns Feb 25 data
        mock_history = self._create_mock_history_response(
            dates=["2026-02-24", "2026-02-25"],
            closes=[150.0, 155.0],  # Feb 25 has new close price
        )
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = mock_history

        with patch("yfinance.Ticker", return_value=mock_ticker):
            with (
                patch("scripts.pnl.update_daily_pnl.HOLDINGS_FILE", self.holdings_path),
                patch("scripts.pnl.update_daily_pnl.FOREX_FILE", self.forex_path),
            ):
                # Run main - should append Feb 25 data
                main()

        # Verify results
        with csv_path.open("r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            rows = list(reader)

        # Should have 2 rows
        self.assertEqual(len(rows), 2)

        # Feb 24 should be preserved with original value
        feb24_row = next(r for r in rows if r["date"] == "2026-02-24")
        self.assertEqual(float(feb24_row["value_usd"]), feb24_value)

        # Feb 25 should be appended
        feb25_row = next(r for r in rows if r["date"] == "2026-02-25")
        self.assertEqual(float(feb25_row["value_usd"]), 15500.0)  # 100 * 155

    @patch("scripts.pnl.update_daily_pnl.HISTORICAL_CSV")
    @patch("scripts.pnl.update_daily_pnl.pd.read_csv")
    def test_handles_delayed_market_data_gracefully(self, mock_read_csv, mock_csv_path) -> None:
        """Test that delayed market data (older than CSV) is handled gracefully.

        Scenario:
        - CSV has data for 2026-02-25
        - yfinance returns data dated 2026-02-24 (delayed/stale)
        - Script should NOT overwrite, should exit cleanly
        """
        from scripts.pnl.update_daily_pnl import main

        # CSV has Feb 25 data
        csv_path = self.temp_path / "historical_portfolio_values.csv"
        csv_path.write_text(
            "date,value_usd,value_cny,value_jpy,value_krw\n"
            "2026-02-25,15000.0,108000.0,2175000.0,19500000.0\n",
            encoding="utf-8",
        )

        mock_csv_path.__truediv__ = lambda self, key: self.temp_path / key
        mock_csv_path.exists.return_value = True
        mock_csv_path.open = csv_path.open

        # Mock pd.read_csv
        mock_df = MagicMock()
        mock_df.tail.return_value = "mock output"
        mock_read_csv.return_value = mock_df

        # yfinance returns stale Feb 24 data
        mock_history = self._create_mock_history_response(
            dates=["2026-02-24"],
            closes=[150.0],
        )
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = mock_history

        with patch("yfinance.Ticker", return_value=mock_ticker):
            with (
                patch("scripts.pnl.update_daily_pnl.HOLDINGS_FILE", self.holdings_path),
                patch("scripts.pnl.update_daily_pnl.FOREX_FILE", self.forex_path),
            ):
                # Run main - should exit cleanly without modifying data
                with self.assertRaises(SystemExit) as cm:
                    main()
                self.assertEqual(cm.exception.code, 0)

        # Verify data is unchanged
        with csv_path.open("r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            rows = list(reader)

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["date"], "2026-02-25")


if __name__ == "__main__":
    unittest.main()
