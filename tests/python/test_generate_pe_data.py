import sys
import unittest
import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime
from typing import Dict, Any
from unittest.mock import patch, MagicMock

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from scripts.generate_pe_data import (
    interpolate_eps_series,
    calculate_harmonic_pe,
    get_closest_fx,
    fetch_stock_eps_data,
    cumulative_forward_split_factor,
    yf_symbol,
    is_etf,
    EXEMPT_TICKERS,
    ETF_TICKERS,
)


class TestGeneratePEData(unittest.TestCase):
    def test_interpolate_eps_series(self) -> None:
        """Test daily interpolation logic between annual EPS points."""
        dates = pd.date_range(start="2023-01-01", end="2023-01-05")

        stock_data: Dict[str, Any] = {
            "points": [
                {"date": pd.Timestamp("2023-01-01"), "eps": 1.0},
                {"date": pd.Timestamp("2023-01-05"), "eps": 5.0},
            ],
            "current_ttm": None,
            "currency": "USD",
        }

        series = interpolate_eps_series(stock_data, dates)

        self.assertAlmostEqual(series["2023-01-01"], 1.0)
        self.assertAlmostEqual(series["2023-01-05"], 5.0)
        self.assertAlmostEqual(series["2023-01-02"], 2.0)

    def test_calculate_harmonic_pe_basic(self) -> None:
        """Test basic weighted harmonic mean calculation."""
        mv_map = {"A": 100.0, "B": 100.0}
        pe_map = {"A": 10.0, "B": 20.0}
        pe = calculate_harmonic_pe(mv_map, pe_map)
        self.assertIsNotNone(pe)
        assert pe is not None
        # Weighted Yield = 0.5/10 + 0.5/20 = 0.05 + 0.025 = 0.075. PE = 1/0.075 = 13.33
        self.assertAlmostEqual(pe, 13.3333, places=4)

    def test_calculate_harmonic_pe_outlier(self) -> None:
        """Test robustness against near-zero earnings (high PE)."""
        mv_map = {"A": 100.0, "B": 100.0}
        pe_map = {"A": 20.0, "B": 8000.0}
        pe = calculate_harmonic_pe(mv_map, pe_map)
        self.assertIsNotNone(pe)
        assert pe is not None
        self.assertLess(pe, 50.0)

    def test_exempt_tickers_presence(self) -> None:
        """Verify that known non-equity assets are in the exempt list."""
        self.assertIn("SH", EXEMPT_TICKERS)
        self.assertIn("PSQ", EXEMPT_TICKERS)
        self.assertIn("GLD", EXEMPT_TICKERS)
        self.assertIn("SJB", EXEMPT_TICKERS)
        # FNSFX, BNDW, BOXX are ETFs with manual PE curves, NOT exempt
        self.assertNotIn("FNSFX", EXEMPT_TICKERS)

    def test_yf_symbol_aliases(self) -> None:
        """Test that yf_symbol correctly maps ticker aliases."""
        self.assertEqual(yf_symbol("BRKB"), "BRK-B")
        self.assertEqual(yf_symbol("BRK.B"), "BRK-B")
        self.assertEqual(yf_symbol("BRK/B"), "BRK-B")
        self.assertEqual(yf_symbol("BFB"), "BF-B")
        # Non-aliased tickers should pass through unchanged
        self.assertEqual(yf_symbol("AAPL"), "AAPL")
        self.assertEqual(yf_symbol("MSFT"), "MSFT")
        self.assertEqual(yf_symbol("ANET"), "ANET")

    def test_is_etf(self) -> None:
        """Test ETF classification logic."""
        # Known ETFs
        self.assertTrue(is_etf("SOXX"))
        self.assertTrue(is_etf("QQQ"))
        self.assertTrue(is_etf("SPY"))
        self.assertTrue(is_etf("SCHD"))
        self.assertTrue(is_etf("SOXL"))
        # Mutual funds ending in X with >4 chars
        self.assertTrue(is_etf("FSKAX"))
        self.assertTrue(is_etf("VTSAX"))
        # Stocks should NOT be classified as ETFs
        self.assertFalse(is_etf("AAPL"))
        self.assertFalse(is_etf("ANET"))
        self.assertFalse(is_etf("NVDA"))
        self.assertFalse(is_etf("GOOG"))
        self.assertFalse(is_etf("BRKB"))

    def test_cumulative_forward_split_factor_no_splits(self) -> None:
        """No splits → factor should be 1.0."""
        empty_splits = pd.Series(dtype=float)
        factor = cumulative_forward_split_factor(pd.Timestamp("2023-01-01"), empty_splits)
        self.assertEqual(factor, 1.0)

    def test_cumulative_forward_split_factor_single_split(self) -> None:
        """Single 4:1 split after the given date."""
        splits = pd.Series(
            [4.0],
            index=pd.to_datetime(["2024-12-04"]),
        )
        # Date before split → factor = 4.0
        factor = cumulative_forward_split_factor(pd.Timestamp("2024-01-01"), splits)
        self.assertEqual(factor, 4.0)
        # Date after split → factor = 1.0
        factor = cumulative_forward_split_factor(pd.Timestamp("2025-01-01"), splits)
        self.assertEqual(factor, 1.0)

    def test_cumulative_forward_split_factor_multiple_splits(self) -> None:
        """Two splits: 4:1 then 4:1 → 16x total for dates before both."""
        splits = pd.Series(
            [4.0, 4.0],
            index=pd.to_datetime(["2021-11-18", "2024-12-04"]),
        )
        # Before both splits
        factor = cumulative_forward_split_factor(pd.Timestamp("2021-01-01"), splits)
        self.assertEqual(factor, 16.0)
        # Between splits
        factor = cumulative_forward_split_factor(pd.Timestamp("2023-01-01"), splits)
        self.assertEqual(factor, 4.0)
        # After both splits
        factor = cumulative_forward_split_factor(pd.Timestamp("2025-06-01"), splits)
        self.assertEqual(factor, 1.0)

    def test_etf_tickers_contains_soxx(self) -> None:
        """Verify SOXX is in the ETF list."""
        self.assertIn("SOXX", ETF_TICKERS)

    @patch("scripts.generate_pe_data.yf.Ticker")
    @patch("scripts.generate_pe_data.get_fx_history")
    @patch("scripts.generate_pe_data.load_eps_cache")
    @patch("scripts.generate_pe_data.load_manual_patch")
    @patch("scripts.generate_pe_data.save_eps_cache")
    def test_fetch_eps_currency_conversion(
        self, mock_save, mock_patch, mock_cache, mock_fx, mock_ticker
    ) -> None:
        """Test that EPS is converted when Financial Currency != Price Currency."""
        # Setup Mocks
        mock_cache.return_value = {}
        mock_patch.return_value = {}  # No manual patch

        # Mock Stock: BABA (Price in USD, Financials in CNY)
        mock_stock = MagicMock()
        mock_stock.info = {"currency": "USD", "financialCurrency": "CNY", "trailingEps": 5.0}
        mock_stock.splits = pd.Series(dtype=float)

        # Mock Financials (income_stmt)
        # 2023 EPS = 10.0 CNY
        dates = pd.to_datetime(["2023-12-31"])
        mock_financials = pd.DataFrame({"2023-12-31": [10.0]}, index=["Basic EPS"])
        mock_stock.income_stmt = mock_financials
        mock_stock.quarterly_income_stmt = pd.DataFrame()
        mock_stock.get_earnings_dates.return_value = pd.DataFrame()

        mock_ticker.return_value = mock_stock

        # Mock FX: CNYUSD=X -> Rate 0.15
        mock_fx_series = pd.Series([0.15], index=dates)
        mock_fx.return_value = mock_fx_series

        # Execute
        results = fetch_stock_eps_data(["BABA"])

        # Verify
        baba = results["BABA"]
        self.assertEqual(baba["currency"], "USD")
        self.assertEqual(len(baba["points"]), 1)

        point = baba["points"][0]
        # Expected: 10.0 CNY * 0.15 = 1.5 USD
        self.assertAlmostEqual(point["eps"], 1.5)

    @patch("scripts.generate_pe_data.yf.Ticker")
    @patch("scripts.generate_pe_data.load_eps_cache")
    @patch("scripts.generate_pe_data.load_manual_patch")
    @patch("scripts.generate_pe_data.save_eps_cache")
    def test_fetch_eps_manual_patch(self, mock_save, mock_patch, mock_cache, mock_ticker) -> None:
        """Test that manual patch overrides/augments fetched data."""
        # Setup Mocks
        mock_cache.return_value = {}

        # Patch contains a fix for 2020
        mock_patch.return_value = {"TEST": {"2020-12-31": 9.99}}

        # Mock Stock returns NO data (empty financials)
        mock_stock = MagicMock()
        mock_stock.info = {"currency": "USD"}
        mock_stock.income_stmt = pd.DataFrame()
        mock_stock.quarterly_income_stmt = pd.DataFrame()
        mock_stock.splits = pd.Series(dtype=float)
        mock_stock.get_earnings_dates.return_value = pd.DataFrame()
        mock_ticker.return_value = mock_stock

        # Execute
        results = fetch_stock_eps_data(["TEST"])

        # Verify
        data = results["TEST"]
        self.assertEqual(len(data["points"]), 1)
        self.assertEqual(data["points"][0]["eps"], 9.99)
        self.assertEqual(data["points"][0]["date"], pd.Timestamp("2020-12-31"))


if __name__ == "__main__":
    unittest.main()
