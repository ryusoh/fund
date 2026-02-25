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
        mock_df = pd.DataFrame(
            {"Close": closes},
            index=pd.to_datetime(dates),
        )
        mock_history.__getitem__ = lambda self, key: mock_df[key]
        mock_history.get = lambda key: mock_df.get(key)
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
        mock_df = pd.DataFrame(
            {"Close": closes},
            index=pd.to_datetime(dates),
        )
        mock_history.__getitem__ = lambda self, key: mock_df[key]
        mock_history.get = lambda key: mock_df.get(key)
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
        mock_df = pd.DataFrame(
            {"Close": closes},
            index=pd.to_datetime(dates),
        )
        mock_history.__getitem__ = lambda self, key: mock_df[key]
        mock_history.get = lambda key: mock_df.get(key)
        return mock_history

    @patch("scripts.pnl.update_daily_pnl.HISTORICAL_CSV")
    @patch("scripts.pnl.update_daily_pnl._get_latest_trading_day")
    @patch("scripts.pnl.update_daily_pnl.pd.read_csv")
    def test_detects_and_fixes_stale_last_row(
        self, mock_read_csv, mock_get_trading_day, mock_csv_path
    ) -> None:
        """Test that stale data in the last row is detected and corrected.

        Scenario:
        - CSV has data up to 2026-02-23 (stale)
        - Latest trading day is 2026-02-24
        - Script should detect and fix the stale 2026-02-23 data
        """
        from scripts.pnl.update_daily_pnl import main

        # Create CSV with stale data
        csv_path = self.temp_path / "historical_portfolio_values.csv"
        csv_path.write_text(
            "date,value_usd,value_cny,value_jpy,value_krw\n"
            "2026-02-21,10000.0,72000.0,1450000.0,13000000.0\n"
            "2026-02-23,10000.0,72000.0,1450000.0,13000000.0\n",  # Stale data
            encoding="utf-8",
        )

        # Mock the CSV path to use our temp file
        mock_csv_path.__truediv__ = lambda self, key: self.temp_path / key
        mock_csv_path.exists.return_value = True
        mock_csv_path.open = csv_path.open

        # Mock latest trading day as 2026-02-24 (newer than last CSV entry)
        mock_get_trading_day.return_value = "2026-02-24"

        # Mock pd.read_csv to avoid issues with mock file paths
        mock_df = MagicMock()
        mock_df.tail.return_value = "mock output"
        mock_read_csv.return_value = mock_df

        # Mock yfinance to return current price of $150 (stale data used $100)
        mock_history = self._create_mock_history_response(
            dates=["2026-02-23", "2026-02-24"],
            closes=[100.0, 150.0],
        )
        mock_ticker = MagicMock()
        mock_ticker.history.return_value = mock_history

        with patch("yfinance.Ticker", return_value=mock_ticker):
            with (
                patch("scripts.pnl.update_daily_pnl.HOLDINGS_FILE", self.holdings_path),
                patch("scripts.pnl.update_daily_pnl.FOREX_FILE", self.forex_path),
                patch("scripts.pnl.update_daily_pnl.datetime") as mock_datetime,
            ):
                # Mock today as 2026-02-24 (same as latest trading day)
                mock_today = MagicMock()
                mock_today.strftime.return_value = "2026-02-24"
                mock_datetime.now.return_value = mock_today

                # Run main - it should detect stale data and fix it
                try:
                    main()
                except SystemExit:
                    pass  # Expected when entry already exists

        # Verify the stale row was updated
        with csv_path.open("r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            rows = list(reader)

        # The 2026-02-23 row should now have updated values (100 shares * $150 = $15000)
        feb23_row = next(r for r in rows if r["date"] == "2026-02-23")
        self.assertEqual(float(feb23_row["value_usd"]), 15000.0)


if __name__ == "__main__":
    unittest.main()
