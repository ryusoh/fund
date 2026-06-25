import sys
import unittest
from pathlib import Path
from typing import Any, Dict
from unittest.mock import MagicMock, patch

import pandas as pd

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from scripts.generate_pe_data import (  # noqa: E402
    ETF_TICKERS,
    EXEMPT_TICKERS,
    calculate_harmonic_pe,
    cumulative_forward_split_factor,
    fetch_stock_eps_data,
    interpolate_eps_series,
    is_etf,
    yf_symbol,
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

    @patch("scripts.generate_pe_data.requests.get")
    @patch.dict("os.environ", {"SCRAPER_API_KEY": "test_key"})
    def test_scrape_wsj_forward_pe_https(self, mock_get) -> None:
        """Test that scrape_wsj_forward_pe uses HTTPS when API key is present."""
        from scripts.generate_pe_data import scrape_wsj_forward_pe

        # Setup mock to return dummy content to avoid parsing errors if possible
        mock_response = MagicMock()
        mock_response.text = "dummy content"
        mock_get.return_value = mock_response

        # Call the function
        scrape_wsj_forward_pe()

        # Check the URL passed to requests.get
        mock_get.assert_called_once()
        args, kwargs = mock_get.call_args
        url = args[0]

        # Verify the URL uses HTTPS
        self.assertTrue(url.startswith("https://api.scraperapi.com/"))
        self.assertIn("api_key=test_key", url)
        self.assertNotIn("http://api.scraperapi.com", url)

    @patch("scripts.generate_pe_data.yf.Ticker")
    def test_get_fx_history_success(self, mock_ticker):
        from scripts.generate_pe_data import FX_CACHE, get_fx_history

        FX_CACHE.clear()

        mock_stock = MagicMock()
        mock_hist = pd.DataFrame(
            {"Close": [1.2, 1.3]}, index=pd.to_datetime(["2023-01-01", "2023-01-02"], utc=True)
        )
        mock_stock.history.return_value = mock_hist
        mock_ticker.return_value = mock_stock

        result = get_fx_history("EURUSD=X")

        self.assertIsNotNone(result)
        self.assertEqual(len(result), 2)
        self.assertEqual(list(result), [1.2, 1.3])
        # Check that index is normalized and tz-naive
        self.assertIsNone(result.index.tz)

        # Check cache hit
        mock_ticker.reset_mock()
        get_fx_history("EURUSD=X")
        mock_ticker.assert_not_called()

    @patch("scripts.generate_pe_data.yf.Ticker")
    def test_get_fx_history_exception(self, mock_ticker):
        from scripts.generate_pe_data import FX_CACHE, get_fx_history

        FX_CACHE.clear()

        mock_ticker.side_effect = Exception("Failed")

        result = get_fx_history("EURUSD=X")

        self.assertIsNone(result)

    def test_get_closest_fx(self):
        from scripts.generate_pe_data import get_closest_fx

        fx_series = pd.Series([1.2, 1.3], index=pd.to_datetime(["2023-01-01", "2023-01-05"]))

        # Exact match
        self.assertEqual(get_closest_fx(fx_series, pd.Timestamp("2023-01-01")), 1.2)

        # Pad (forward fill)
        self.assertEqual(get_closest_fx(fx_series, pd.Timestamp("2023-01-03")), 1.2)

        # Backfill
        self.assertEqual(get_closest_fx(fx_series, pd.Timestamp("2022-12-31")), 1.2)

        # Exception handling
        self.assertEqual(get_closest_fx(pd.Series(dtype=float), pd.Timestamp("2023-01-01")), 1.0)

    @patch("scripts.generate_pe_data.EPS_CACHE_PATH")
    def test_load_eps_cache_exists(self, mock_path):

        from scripts.generate_pe_data import load_eps_cache

        mock_path.exists.return_value = True

        # We need to mock open
        with patch("builtins.open", unittest.mock.mock_open(read_data='{"A": 1}')) as mock_file:
            result = load_eps_cache()
            self.assertEqual(result, {"A": 1})
            mock_file.assert_called_once_with(mock_path, "r")

    @patch("scripts.generate_pe_data.EPS_CACHE_PATH")
    def test_load_eps_cache_not_exists(self, mock_path):
        from scripts.generate_pe_data import load_eps_cache

        mock_path.exists.return_value = False

        result = load_eps_cache()
        self.assertEqual(result, {})

    @patch("scripts.generate_pe_data.EPS_CACHE_PATH")
    def test_load_eps_cache_error(self, mock_path):
        from scripts.generate_pe_data import load_eps_cache

        mock_path.exists.return_value = True

        with patch("builtins.open", side_effect=Exception("Failed")):
            result = load_eps_cache()
            self.assertEqual(result, {})

    @patch("scripts.generate_pe_data.EPS_CACHE_PATH")
    def test_save_eps_cache_success(self, mock_path):
        from scripts.generate_pe_data import save_eps_cache

        mock_parent = MagicMock()
        mock_path.parent = mock_parent

        with patch("builtins.open", unittest.mock.mock_open()) as mock_file:
            save_eps_cache({"A": 1})
            mock_parent.mkdir.assert_called_once_with(parents=True, exist_ok=True)
            mock_file.assert_called_once_with(mock_path, "w")

            # Check json was written
            handle = mock_file()
            handle.write.assert_called()

    @patch("scripts.generate_pe_data.EPS_CACHE_PATH")
    def test_save_eps_cache_error(self, mock_path):
        from scripts.generate_pe_data import save_eps_cache

        mock_parent = MagicMock()
        mock_parent.mkdir.side_effect = Exception("Failed")
        mock_path.parent = mock_parent

        # Should catch exception and not raise
        save_eps_cache({"A": 1})

    @patch("scripts.generate_pe_data.MANUAL_PATCH_PATH")
    def test_load_manual_patch_exists(self, mock_path):
        from scripts.generate_pe_data import load_manual_patch

        mock_path.exists.return_value = True

        with patch(
            "builtins.open", unittest.mock.mock_open(read_data='{"A": {"2020-01-01": 1.0}}')
        ):
            result = load_manual_patch()
            self.assertEqual(result, {"A": {"2020-01-01": 1.0}})

    @patch("scripts.generate_pe_data.MANUAL_PATCH_PATH")
    def test_load_manual_patch_not_exists(self, mock_path):
        from scripts.generate_pe_data import load_manual_patch

        mock_path.exists.return_value = False

        result = load_manual_patch()
        self.assertEqual(result, {})

    @patch("scripts.generate_pe_data.MANUAL_PATCH_PATH")
    def test_load_manual_patch_error(self, mock_path):
        from scripts.generate_pe_data import load_manual_patch

        mock_path.exists.return_value = True

        with patch("builtins.open", side_effect=Exception("Failed")):
            result = load_manual_patch()
            self.assertEqual(result, {})

    @patch("scripts.generate_pe_data.SPLIT_HISTORY_PATH")
    def test_load_split_history_exists(self, mock_path):
        from scripts.generate_pe_data import load_split_history

        mock_path.exists.return_value = True

        with patch("pandas.read_csv") as mock_read_csv:
            mock_read_csv.return_value = pd.DataFrame({"Split Date": ["2020-01-01"]})
            result = load_split_history()

            self.assertEqual(len(result), 1)
            self.assertTrue(pd.api.types.is_datetime64_any_dtype(result["Split Date"]))
            mock_read_csv.assert_called_once_with(mock_path)

    @patch("scripts.generate_pe_data.SPLIT_HISTORY_PATH")
    def test_load_split_history_not_exists(self, mock_path):
        from scripts.generate_pe_data import load_split_history

        mock_path.exists.return_value = False

        result = load_split_history()
        self.assertTrue(result.empty)

    @patch("scripts.generate_pe_data.SPLIT_HISTORY_PATH")
    def test_load_split_history_error(self, mock_path):
        from scripts.generate_pe_data import load_split_history

        mock_path.exists.return_value = True

        with patch("pandas.read_csv", side_effect=Exception("Failed")):
            result = load_split_history()
            self.assertTrue(result.empty)

    def test_get_split_adjustment(self):
        from scripts.generate_pe_data import get_split_adjustment

        split_df = pd.DataFrame(
            {
                "Symbol": ["A", "A", "B"],
                "Split Date": pd.to_datetime(["2020-01-01", "2021-01-01", "2020-01-01"]),
                "Split Multiplier": [2.0, 3.0, 4.0],
            }
        )

        # Empty df
        self.assertEqual(get_split_adjustment("A", pd.Timestamp("2019-01-01"), pd.DataFrame()), 1.0)

        # Before any splits -> compound both -> 2 * 3 = 6
        self.assertEqual(get_split_adjustment("A", pd.Timestamp("2019-01-01"), split_df), 1.0 / 6.0)

        # Between splits -> only the later one -> 3
        self.assertEqual(get_split_adjustment("A", pd.Timestamp("2020-06-01"), split_df), 1.0 / 3.0)

        # After all splits -> 1
        self.assertEqual(get_split_adjustment("A", pd.Timestamp("2022-01-01"), split_df), 1.0)

        # No symbol found -> 1
        self.assertEqual(get_split_adjustment("C", pd.Timestamp("2019-01-01"), split_df), 1.0)

    def test_calculate_harmonic_pe_missing_pe(self):
        from scripts.generate_pe_data import calculate_harmonic_pe

        self.assertIsNone(calculate_harmonic_pe({"A": 100}, {}))

    def test_calculate_harmonic_pe_zero_total_mv(self):
        from scripts.generate_pe_data import calculate_harmonic_pe

        self.assertIsNone(calculate_harmonic_pe({"A": 0}, {"A": 10}))

    def test_calculate_harmonic_pe_zero_pe(self):
        from scripts.generate_pe_data import calculate_harmonic_pe

        self.assertIsNone(calculate_harmonic_pe({"A": 100}, {"A": 0}))

    def test_get_closest_fx_exception(self):
        from scripts.generate_pe_data import get_closest_fx

        fx_series = pd.Series([1.2], index=pd.to_datetime(["2023-01-01"]))
        with patch.object(pd.Index, 'get_indexer', side_effect=Exception("Failed")):
            self.assertEqual(get_closest_fx(fx_series, pd.Timestamp("2023-01-01")), 1.0)

    @patch("scripts.generate_pe_data.HOLDINGS_DETAILS_PATH")
    def test_fetch_forward_pe_no_holdings_file(self, mock_path):
        from scripts.generate_pe_data import fetch_forward_pe

        mock_path.exists.return_value = False
        self.assertIsNone(fetch_forward_pe())

    @patch("scripts.generate_pe_data.HOLDINGS_DETAILS_PATH")
    def test_fetch_forward_pe_empty_holdings(self, mock_path):
        from scripts.generate_pe_data import fetch_forward_pe

        mock_path.exists.return_value = True
        with patch("builtins.open", unittest.mock.mock_open(read_data="{}")):
            self.assertIsNone(fetch_forward_pe())

    @patch("scripts.generate_pe_data.HOLDINGS_DETAILS_PATH")
    def test_fetch_forward_pe_with_holdings(self, mock_path):
        from scripts.generate_pe_data import fetch_forward_pe

        mock_path.exists.return_value = True
        with patch(
            "builtins.open",
            unittest.mock.mock_open(
                read_data='{"AAPL": {"shares": 10}, "INVALID": {"shares": -1}}'
            ),
        ):
            with patch("scripts.generate_pe_data.yf.Ticker") as mock_ticker:
                mock_stock = unittest.mock.MagicMock()
                mock_stock.info = {"currentPrice": 150.0, "forwardPE": 20.0}
                mock_ticker.return_value = mock_stock
                res = fetch_forward_pe()
                self.assertIsNotNone(res)
                self.assertIn("AAPL", res["ticker_forward_pe"])
                self.assertEqual(res["ticker_forward_pe"]["AAPL"], 20.0)

    @patch("scripts.generate_pe_data.HOLDINGS_DETAILS_PATH")
    def test_fetch_forward_pe_vt_fallback(self, mock_path):
        from scripts.generate_pe_data import fetch_forward_pe

        mock_path.exists.return_value = True
        with patch("builtins.open", unittest.mock.mock_open(read_data='{"VT": {"shares": 10}}')):
            with patch("scripts.generate_pe_data.yf.Ticker") as mock_ticker:
                mock_stock = unittest.mock.MagicMock()
                mock_stock.info = {"currentPrice": 150.0, "forwardPE": None}
                mock_ticker.return_value = mock_stock
                with patch(
                    "scripts.generate_pe_data.scrape_msci_pe_data",
                    return_value={"forward_pe": 15.0, "trailing_pe": 20.0, "ratio": 1.33},
                ):
                    res = fetch_forward_pe()
                    self.assertIsNotNone(res)
                    self.assertEqual(res["ticker_forward_pe"]["VT"], 15.0)

    def test_carry_forward_msci_pe_ratio_reuses_last_good(self):
        # Regression: VT's forward P/E is derived on the frontend from
        # msci_pe_ratio.ratio. When the flaky MSCI scrape fails, the fresh
        # forward_pe block omits msci_pe_ratio; without fail-open the table's
        # VT forward P/E silently vanishes. Carry the last good ratio forward.
        from scripts.generate_pe_data import carry_forward_msci_pe_ratio

        fresh = {"portfolio_forward_pe": 21.0, "ticker_forward_pe": {"ANET": 30.0}}
        existing = {
            "forward_pe": {
                "msci_pe_ratio": {"trailing_pe": 24.74, "forward_pe": 19.6, "ratio": 1.2622},
            }
        }
        result = carry_forward_msci_pe_ratio(fresh, existing)
        self.assertEqual(result["msci_pe_ratio"]["ratio"], 1.2622)

    def test_carry_forward_msci_pe_ratio_keeps_fresh(self):
        from scripts.generate_pe_data import carry_forward_msci_pe_ratio

        fresh = {"msci_pe_ratio": {"ratio": 1.30}}
        existing = {"forward_pe": {"msci_pe_ratio": {"ratio": 1.2622}}}
        result = carry_forward_msci_pe_ratio(fresh, existing)
        self.assertEqual(result["msci_pe_ratio"]["ratio"], 1.30)

    def test_carry_forward_msci_pe_ratio_noop_when_none(self):
        from scripts.generate_pe_data import carry_forward_msci_pe_ratio

        self.assertIsNone(carry_forward_msci_pe_ratio(None, {}))
        fresh = {"portfolio_forward_pe": 21.0}
        # Nothing to carry forward; leave the block untouched.
        result = carry_forward_msci_pe_ratio(fresh, {})
        self.assertNotIn("msci_pe_ratio", result)

    def test_apply_fail_open_backstop_restores_omitted_key(self):
        # General fail-open: if a run fails to produce a top-level block that the
        # previous file had (e.g. benchmark_pe when every benchmark fetch fails),
        # restore the old value instead of writing the dashboard blank.
        from scripts.generate_pe_data import apply_fail_open_backstop

        fresh = {"dates": ["2026-06-25"], "portfolio_pe": [21.0]}
        existing = {"benchmark_pe": {"^GSPC": [25.0]}, "portfolio_pe": [99.0]}
        result = apply_fail_open_backstop(fresh, existing)
        self.assertEqual(result["benchmark_pe"], {"^GSPC": [25.0]})

    def test_apply_fail_open_backstop_keeps_fresh_data(self):
        from scripts.generate_pe_data import apply_fail_open_backstop

        fresh = {"portfolio_pe": [21.0], "benchmark_pe": {"^GSPC": [26.0]}}
        existing = {"portfolio_pe": [99.0], "benchmark_pe": {"^GSPC": [25.0]}}
        result = apply_fail_open_backstop(fresh, existing)
        # Real fresh data must never be overwritten by stale fallback.
        self.assertEqual(result["portfolio_pe"], [21.0])
        self.assertEqual(result["benchmark_pe"], {"^GSPC": [26.0]})

    def test_apply_fail_open_backstop_restores_empty_container(self):
        from scripts.generate_pe_data import apply_fail_open_backstop

        # An empty {} produced this run is treated as "nothing fetched".
        fresh = {"benchmark_pe": {}}
        existing = {"benchmark_pe": {"^GSPC": [25.0]}}
        result = apply_fail_open_backstop(fresh, existing)
        self.assertEqual(result["benchmark_pe"], {"^GSPC": [25.0]})

    def test_apply_fail_open_backstop_ignores_empty_existing(self):
        from scripts.generate_pe_data import apply_fail_open_backstop

        fresh = {"portfolio_pe": [21.0]}
        # Nothing useful to fall back to; no spurious keys added.
        self.assertEqual(
            apply_fail_open_backstop(fresh, {"benchmark_pe": {}}), {"portfolio_pe": [21.0]}
        )
        self.assertEqual(apply_fail_open_backstop(fresh, None), {"portfolio_pe": [21.0]})

    @patch("scripts.generate_pe_data.HOLDINGS_DETAILS_PATH")
    def test_fetch_forward_pe_exception(self, mock_path):
        from scripts.generate_pe_data import fetch_forward_pe

        mock_path.exists.return_value = True
        with patch("builtins.open", unittest.mock.mock_open(read_data='{"AAPL": {"shares": 10}}')):
            with patch("scripts.generate_pe_data.yf.Ticker", side_effect=Exception("Failed")):
                res = fetch_forward_pe()
                self.assertIsNone(res)

    def test_scrape_msci_forward_pe_success(self):
        from scripts.generate_pe_data import scrape_msci_forward_pe

        with patch("scripts.generate_pe_data.requests.get") as mock_get:
            mock_response = unittest.mock.MagicMock()
            mock_response.text = "<html><body>P/E Fwd 15.5</body></html>"
            mock_get.return_value = mock_response
            res = scrape_msci_forward_pe()
            self.assertEqual(res, 15.5)

    def test_scrape_msci_forward_pe_no_match(self):
        from scripts.generate_pe_data import scrape_msci_forward_pe

        with patch("scripts.generate_pe_data.requests.get") as mock_get:
            mock_response = unittest.mock.MagicMock()
            mock_response.text = "<html><body>No data</body></html>"
            mock_get.return_value = mock_response
            res = scrape_msci_forward_pe()
            self.assertIsNone(res)

    def test_scrape_msci_forward_pe_exception(self):
        from scripts.generate_pe_data import scrape_msci_forward_pe

        with patch("scripts.generate_pe_data.requests.get") as mock_get:
            mock_get.side_effect = Exception("Failed")
            res = scrape_msci_forward_pe()
            self.assertIsNone(res)

    def test_scrape_wsj_forward_pe_success(self):
        from scripts.generate_pe_data import scrape_wsj_forward_pe

        with patch("scripts.generate_pe_data.requests.get") as mock_get:
            mock_response = unittest.mock.MagicMock()
            mock_response.text = 'P 500 Index "priceEarningsRatioEstimate": 20.5'
            mock_get.return_value = mock_response
            res = scrape_wsj_forward_pe()
            self.assertEqual(res, 20.5)

    def test_scrape_wsj_forward_pe_no_match(self):
        from scripts.generate_pe_data import scrape_wsj_forward_pe

        with patch("scripts.generate_pe_data.requests.get") as mock_get:
            mock_response = unittest.mock.MagicMock()
            mock_response.text = 'P 500 Index xyz'
            mock_get.return_value = mock_response
            res = scrape_wsj_forward_pe()
            self.assertIsNone(res)

    def test_scrape_wsj_forward_pe_exception(self):
        from scripts.generate_pe_data import scrape_wsj_forward_pe

        with patch("scripts.generate_pe_data.requests.get") as mock_get:
            mock_get.side_effect = Exception("Failed")
            res = scrape_wsj_forward_pe()
            self.assertIsNone(res)

    def test_fetch_etf_pe_yf(self):
        from scripts.generate_pe_data import fetch_etf_pe

        with patch('scripts.generate_pe_data.yf.Ticker') as mock_ticker:
            mock_stock = MagicMock()
            mock_stock.info = {"trailingPE": 20.0}
            mock_ticker.return_value = mock_stock
            dates = pd.DatetimeIndex([pd.Timestamp("2020-01-01")])
            result = fetch_etf_pe("AAPL", dates)
            self.assertEqual(result.iloc[0], 20.0)

    def test_fetch_etf_pe_yf_none(self):
        from scripts.generate_pe_data import fetch_etf_pe

        with patch('scripts.generate_pe_data.yf.Ticker') as mock_ticker:
            mock_stock = MagicMock()
            mock_stock.info = None
            mock_ticker.return_value = mock_stock
            dates = pd.DatetimeIndex([pd.Timestamp("2020-01-01")])
            result = fetch_etf_pe("AAPL", dates)
            self.assertIsNone(result)

    def test_fetch_etf_pe_yf_exception(self):
        from scripts.generate_pe_data import fetch_etf_pe

        with patch('scripts.generate_pe_data.yf.Ticker') as mock_ticker:
            mock_ticker.side_effect = Exception("Failed")
            dates = pd.DatetimeIndex([pd.Timestamp("2020-01-01")])
            result = fetch_etf_pe("AAPL", dates)
            self.assertIsNone(result)

    def test_fetch_stock_eps_data_exception(self):
        from scripts.generate_pe_data import fetch_stock_eps_data

        with patch('scripts.generate_pe_data.yf.Ticker') as mock_ticker:
            mock_ticker.side_effect = Exception("Failed")
            with patch('scripts.generate_pe_data.load_eps_cache', return_value={}):
                with patch('scripts.generate_pe_data.load_manual_patch', return_value={}):
                    with patch('scripts.generate_pe_data.save_eps_cache'):
                        result = fetch_stock_eps_data(["AAPL"])
                        self.assertNotIn("AAPL", result)

    def test_fetch_etf_pe_manual(self):
        from scripts.generate_pe_data import fetch_etf_pe

        with patch.dict(
            'scripts.generate_pe_data.MANUAL_TICKER_PE_CURVES',
            {"TEST": {pd.Timestamp("2020-01-01"): 15.0}},
        ):
            dates = pd.DatetimeIndex([pd.Timestamp("2020-01-01")])
            result = fetch_etf_pe("TEST", dates)
            self.assertEqual(result.iloc[0], 15.0)

    def test_interpolate_eps_series_exception(self):
        from scripts.generate_pe_data import interpolate_eps_series

        stock_data = {
            "points": [{"date": pd.Timestamp("2023-01-01"), "eps": 1.0}],
            "current_ttm": None,
        }
        dates = pd.DatetimeIndex([pd.Timestamp("2023-01-01"), pd.Timestamp("2023-01-02")])
        res = interpolate_eps_series(stock_data, dates)
        self.assertEqual(res.iloc[0], 1.0)
        self.assertEqual(res.iloc[1], 1.0)


class TestFetchBenchmarkPEDaily(unittest.TestCase):
    """Tests for fetch_benchmark_pe_daily — the orchestrator that fetches
    proxy price/EPS and calls compute_benchmark_pe_from_proxy."""

    @patch("scripts.generate_pe_data.yf.Ticker")
    def test_produces_daily_granularity(self, mock_ticker) -> None:
        """End-to-end: fetched proxy data produces daily PE variation."""
        from scripts.generate_pe_data import fetch_benchmark_pe_daily

        dates = pd.date_range("2024-06-01", "2024-06-10")

        # Mock SPY price history
        mock_stock = MagicMock()
        price_data = pd.DataFrame(
            {"Close": [530, 532, 528, 535, 531, 540, 538, 542, 537, 545]},
            index=dates,
        )
        mock_stock.history.return_value = price_data
        mock_stock.info = {"trailingPE": 27.0, "trailingEps": 20.0}
        mock_stock.income_stmt = pd.DataFrame()
        mock_stock.quarterly_income_stmt = pd.DataFrame()
        mock_stock.splits = pd.Series(dtype=float)
        mock_stock.get_earnings_dates.return_value = pd.DataFrame()
        mock_ticker.return_value = mock_stock

        result = fetch_benchmark_pe_daily("SPY", dates)

        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(len(result), 10)
        # Should have daily variation (not flat stretches)
        self.assertGreater(result.nunique(), 5)

    @patch("scripts.generate_pe_data.yf.Ticker")
    def test_fallback_to_manual_when_no_history(self, mock_ticker) -> None:
        """When yfinance history fails, falls back to manual anchors."""
        from scripts.generate_pe_data import fetch_benchmark_pe_daily

        dates = pd.date_range("2024-01-01", "2024-01-05")

        mock_stock = MagicMock()
        mock_stock.history.return_value = pd.DataFrame()  # No history
        mock_stock.info = {"trailingPE": 25.0, "trailingEps": None}
        mock_stock.income_stmt = pd.DataFrame()
        mock_stock.quarterly_income_stmt = pd.DataFrame()
        mock_stock.splits = pd.Series(dtype=float)
        mock_stock.get_earnings_dates.return_value = pd.DataFrame()
        mock_ticker.return_value = mock_stock

        manual = {"2024-01-01": 24.0, "2024-01-05": 25.0}
        result = fetch_benchmark_pe_daily("SPY", dates, manual_anchors=manual)

        self.assertIsNotNone(result)
        assert result is not None
        self.assertAlmostEqual(result.iloc[0], 24.0, places=1)
        self.assertAlmostEqual(result.iloc[4], 25.0, places=1)

    @patch("scripts.generate_pe_data.yf.Ticker")
    def test_returns_none_on_total_failure(self, mock_ticker) -> None:
        """Returns None when both proxy fetch and manual anchors fail."""
        from scripts.generate_pe_data import fetch_benchmark_pe_daily

        dates = pd.date_range("2024-01-01", "2024-01-05")
        mock_ticker.side_effect = Exception("Network error")

        result = fetch_benchmark_pe_daily("SPY", dates)
        self.assertIsNone(result)


class TestComputeBenchmarkPEFromProxy(unittest.TestCase):
    """Tests for compute_benchmark_pe_from_proxy — derives daily benchmark PE
    from a proxy ETF's price history and EPS, replacing the old approach of
    interpolating sparse monthly manual anchors."""

    def test_basic_daily_pe_from_price_and_eps(self) -> None:
        """Given daily prices and EPS anchors, PE = price / interpolated TTM EPS."""
        from scripts.generate_pe_data import compute_benchmark_pe_from_proxy

        dates = pd.date_range("2024-01-01", "2024-01-05")
        prices = pd.Series([500.0, 510.0, 505.0, 515.0, 520.0], index=dates)
        # Single EPS anchor covering the whole range
        eps_points = [{"date": pd.Timestamp("2024-01-01"), "eps": 20.0}]

        result = compute_benchmark_pe_from_proxy(prices, eps_points, dates)

        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(len(result), 5)
        # PE = price / EPS: 500/20=25, 510/20=25.5, etc.
        self.assertAlmostEqual(result.iloc[0], 25.0, places=1)
        self.assertAlmostEqual(result.iloc[1], 25.5, places=1)
        self.assertAlmostEqual(result.iloc[4], 26.0, places=1)

    def test_eps_interpolation_between_anchors(self) -> None:
        """EPS should be linearly interpolated between anchor points."""
        from scripts.generate_pe_data import compute_benchmark_pe_from_proxy

        dates = pd.date_range("2024-01-01", "2024-01-05")
        prices = pd.Series([500.0] * 5, index=dates)
        eps_points = [
            {"date": pd.Timestamp("2024-01-01"), "eps": 20.0},
            {"date": pd.Timestamp("2024-01-05"), "eps": 25.0},
        ]

        result = compute_benchmark_pe_from_proxy(prices, eps_points, dates)

        self.assertIsNotNone(result)
        assert result is not None
        # At day 1: PE = 500/20 = 25.0
        self.assertAlmostEqual(result.iloc[0], 25.0, places=1)
        # At day 5: PE = 500/25 = 20.0
        self.assertAlmostEqual(result.iloc[4], 20.0, places=1)
        # Mid-range PE should be between 20 and 25
        self.assertGreater(result.iloc[2], 20.0)
        self.assertLess(result.iloc[2], 25.0)

    def test_daily_granularity_not_flat(self) -> None:
        """Result should show daily price-driven variation, not flat stretches."""
        from scripts.generate_pe_data import compute_benchmark_pe_from_proxy

        dates = pd.date_range("2024-01-01", "2024-01-10")
        # Simulate realistic daily price movement
        prices = pd.Series(
            [500, 505, 498, 512, 507, 515, 503, 520, 510, 525],
            index=dates,
            dtype=float,
        )
        eps_points = [{"date": pd.Timestamp("2024-01-01"), "eps": 20.0}]

        result = compute_benchmark_pe_from_proxy(prices, eps_points, dates)

        self.assertIsNotNone(result)
        assert result is not None
        # Count unique PE values — should be 10 (one per day) since prices differ
        unique_values = result.nunique()
        self.assertEqual(unique_values, 10)

    def test_manual_anchors_used_as_fallback(self) -> None:
        """When no price data exists for early dates, manual anchors fill in."""
        from scripts.generate_pe_data import compute_benchmark_pe_from_proxy

        dates = pd.date_range("2024-01-01", "2024-01-05")
        # Prices only available for last 3 days
        prices = pd.Series([None, None, 505.0, 515.0, 520.0], index=dates)
        eps_points = [{"date": pd.Timestamp("2024-01-01"), "eps": 20.0}]
        manual_anchors = {
            "2024-01-01": 24.0,
            "2024-01-02": 24.5,
        }

        result = compute_benchmark_pe_from_proxy(
            prices, eps_points, dates, manual_anchors=manual_anchors
        )

        self.assertIsNotNone(result)
        assert result is not None
        # Early dates should use manual anchors
        self.assertAlmostEqual(result.iloc[0], 24.0, places=1)
        self.assertAlmostEqual(result.iloc[1], 24.5, places=1)
        # Later dates should use price / EPS
        self.assertAlmostEqual(result.iloc[2], 505.0 / 20.0, places=1)

    def test_returns_none_for_no_data(self) -> None:
        """Should return None when no prices and no anchors are available."""
        from scripts.generate_pe_data import compute_benchmark_pe_from_proxy

        dates = pd.date_range("2024-01-01", "2024-01-05")
        prices = pd.Series([None] * 5, index=dates)
        eps_points: list[dict] = []

        result = compute_benchmark_pe_from_proxy(prices, eps_points, dates)

        self.assertIsNone(result)

    def test_zero_or_negative_eps_excluded(self) -> None:
        """PE should be NaN/skipped for dates where EPS <= 0."""
        from scripts.generate_pe_data import compute_benchmark_pe_from_proxy

        dates = pd.date_range("2024-01-01", "2024-01-03")
        prices = pd.Series([500.0, 500.0, 500.0], index=dates)
        eps_points = [
            {"date": pd.Timestamp("2024-01-01"), "eps": -5.0},
            {"date": pd.Timestamp("2024-01-03"), "eps": 20.0},
        ]

        result = compute_benchmark_pe_from_proxy(prices, eps_points, dates)

        self.assertIsNotNone(result)
        assert result is not None
        # Day 3 with positive EPS should have valid PE
        self.assertTrue(pd.notna(result.iloc[2]))
        self.assertAlmostEqual(result.iloc[2], 25.0, places=1)

    def test_derive_eps_from_anchors_and_prices(self) -> None:
        """When no EPS points given, derive EPS from manual_anchors + prices."""
        from scripts.generate_pe_data import compute_benchmark_pe_from_proxy

        dates = pd.date_range("2024-01-01", "2024-01-10")
        # Prices vary daily
        prices = pd.Series(
            [500, 505, 498, 512, 507, 515, 503, 520, 510, 525],
            index=dates,
            dtype=float,
        )
        # Manual anchor says PE=25 on day 1 → implied EPS = 500/25 = 20
        manual_anchors = {"2024-01-01": 25.0}
        # No EPS points — should derive from anchor
        result = compute_benchmark_pe_from_proxy(prices, [], dates, manual_anchors=manual_anchors)

        self.assertIsNotNone(result)
        assert result is not None
        # Day 1: PE should be ~25.0 (anchor)
        self.assertAlmostEqual(result.iloc[0], 25.0, places=1)
        # Day 2: price=505, EPS=20 → PE=25.25 (different from day 1)
        self.assertAlmostEqual(result.iloc[1], 505.0 / 20.0, places=1)
        # All 10 days should have unique PE values
        self.assertEqual(result.nunique(), 10)

    def test_derive_eps_from_multiple_anchors(self) -> None:
        """EPS derived from anchors should interpolate between anchor dates."""
        from scripts.generate_pe_data import compute_benchmark_pe_from_proxy

        dates = pd.date_range("2024-01-01", "2024-01-05")
        prices = pd.Series([500.0] * 5, index=dates)
        # Two anchors: PE=25 on day 1 (EPS=20), PE=20 on day 5 (EPS=25)
        manual_anchors = {
            "2024-01-01": 25.0,  # implies EPS = 500/25 = 20
            "2024-01-05": 20.0,  # implies EPS = 500/20 = 25
        }

        result = compute_benchmark_pe_from_proxy(prices, [], dates, manual_anchors=manual_anchors)

        self.assertIsNotNone(result)
        assert result is not None
        self.assertAlmostEqual(result.iloc[0], 25.0, places=1)
        self.assertAlmostEqual(result.iloc[4], 20.0, places=1)
        # Mid-point EPS interpolated → PE between 20 and 25
        self.assertGreater(result.iloc[2], 20.0)
        self.assertLess(result.iloc[2], 25.0)

    def test_result_length_matches_dates(self) -> None:
        """Output series length must match input dates index."""
        from scripts.generate_pe_data import compute_benchmark_pe_from_proxy

        dates = pd.date_range("2023-06-01", "2024-06-01")
        prices = pd.Series(500.0, index=dates)
        eps_points = [{"date": pd.Timestamp("2023-06-01"), "eps": 20.0}]

        result = compute_benchmark_pe_from_proxy(prices, eps_points, dates)

        self.assertIsNotNone(result)
        assert result is not None

        self.assertEqual(len(result), len(dates))


if __name__ == "__main__":
    unittest.main()
