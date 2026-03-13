import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

# Add project root to path so we can import scripts
project_root = Path(__file__).parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))


class TestCalculateRatios(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mock_np = MagicMock()

        def mock_isfinite(x):
            if x is None or isinstance(x, str):
                raise TypeError("ufunc 'isfinite' not supported for the input types")
            return isinstance(x, (int, float)) and not (
                x != x or x == float("inf") or x == float("-inf")
            )

        cls.mock_np.isfinite.side_effect = mock_isfinite
        cls.mock_np.nan = float("nan")
        cls.mock_np.inf = float("inf")
        cls.mock_pd = MagicMock()

        with patch.dict(sys.modules, {"numpy": cls.mock_np, "pandas": cls.mock_pd}):
            import scripts.ratios.calculate_ratios as cr

            cls.cr = cr

    def test_format_currency(self):
        format_currency = self.cr.format_currency
        # Happy paths
        self.assertEqual(format_currency(1234.56), "$1,234.56")
        self.assertEqual(format_currency(1234.567), "$1,234.57")
        self.assertEqual(format_currency(1234.564), "$1,234.56")
        self.assertEqual(format_currency(0), "$0.00")
        self.assertEqual(format_currency(-1234.56), "$-1,234.56")
        self.assertEqual(format_currency(1000000), "$1,000,000.00")

        # Large and boundary values
        self.assertEqual(format_currency(999999999.99), "$999,999,999.99")
        self.assertEqual(format_currency(-0.005), "$-0.01")
        self.assertEqual(format_currency(0.005), "$0.01")

        # Small values
        self.assertEqual(format_currency(0.001), "$0.00")
        self.assertEqual(format_currency(-0.001), "$-0.00")

        # Edge cases (non-finite)
        self.assertEqual(format_currency(float("nan")), "N/A")
        self.assertEqual(format_currency(float("inf")), "N/A")
        self.assertEqual(format_currency(float("-inf")), "N/A")

        # Explicit nan/inf checks to improve coverage
        import math
        self.assertEqual(format_currency(math.nan), "N/A")
        self.assertEqual(format_currency(math.inf), "N/A")
        self.assertEqual(format_currency(-math.inf), "N/A")

        # Invalid types
        with self.assertRaises(TypeError):
            format_currency(None)
        with self.assertRaises(TypeError):
            format_currency("123")

    def test_format_percent(self):
        format_percent = self.cr.format_percent
        # Happy paths
        self.assertEqual(format_percent(0.1234), "12.34%")
        self.assertEqual(format_percent(0.12345), "12.35%")
        self.assertEqual(format_percent(0), "0.00%")
        self.assertEqual(format_percent(-0.1234), "-12.34%")
        self.assertEqual(format_percent(1.5), "150.00%")

        # Edge cases (non-finite)
        self.assertEqual(format_percent(float("nan")), "N/A")
        self.assertEqual(format_percent(float("inf")), "N/A")
        self.assertEqual(format_percent(float("-inf")), "N/A")

        # Invalid types
        with self.assertRaises(TypeError):
            format_percent(None)
        with self.assertRaises(TypeError):
            format_percent("123")

    def test_get_latest_rates(self):
        get_latest_rates = self.cr.get_latest_rates
        SUPPORTED_CURRENCIES = self.cr.SUPPORTED_CURRENCIES

        # Empty DataFrame mock
        mock_empty_df = MagicMock()
        mock_empty_df.empty = True

        expected_empty = {currency: 1.0 for currency in SUPPORTED_CURRENCIES}
        self.assertEqual(get_latest_rates(mock_empty_df), expected_empty)

        # Populated DataFrame mock
        mock_populated_df = MagicMock()
        mock_populated_df.empty = False

        mock_latest_row = MagicMock()
        def mock_get(currency, default=1.0):
            rates = {"USD": 1.0, "CNY": 7.1, "JPY": 105.0}
            return rates.get(currency, default)

        mock_latest_row.get.side_effect = mock_get

        # iloc is an object that supports slicing/indexing
        mock_iloc = MagicMock()
        # when iloc[-1] is accessed, return mock_latest_row
        mock_iloc.__getitem__.return_value = mock_latest_row
        mock_populated_df.iloc = mock_iloc

        expected_populated = {"USD": 1.0, "CNY": 7.1, "JPY": 105.0, "KRW": 1.0}
        self.assertEqual(get_latest_rates(mock_populated_df), expected_populated)

    def test_order_series_names(self):
        order_series_names = self.cr.order_series_names
        PORTFOLIO_SERIES_KEY = self.cr.PORTFOLIO_SERIES_KEY

        # PORTFOLIO_SERIES_KEY should always be first, rest sorted
        names = ['Z', 'A', PORTFOLIO_SERIES_KEY, 'C']
        expected = [PORTFOLIO_SERIES_KEY, 'A', 'C', 'Z']
        self.assertEqual(order_series_names(names), expected)

        # Without PORTFOLIO_SERIES_KEY
        names = ['Z', 'A', 'C']
        expected = ['A', 'C', 'Z']
        self.assertEqual(order_series_names(names), expected)

        # Empty list
        self.assertEqual(order_series_names([]), [])

    def test_compute_cagr(self):
        compute_cagr = self.cr.compute_cagr

        # Happy paths
        # 1 year doubling = 100%
        self.assertAlmostEqual(compute_cagr([{"value": 100}, {"value": 200}], 1), 1.0)
        # 2 year quadrupling = 100%
        self.assertAlmostEqual(compute_cagr([{"value": 100}, {"value": 400}], 2), 1.0)
        # fractional years
        self.assertAlmostEqual(compute_cagr([{"value": 100}, {"value": 150}], 0.5), 1.25)

        # Additional Happy path
        series = [{'value': 100}, {'value': 150}, {'value': 200}]
        # (200/100)^(1/2) - 1 = 2^0.5 - 1 = 1.41421356 - 1 = 0.41421356
        self.assertAlmostEqual(compute_cagr(series, 2), 0.41421356237309515)

        # Edge cases and error conditions
        # empty series
        self.assertIsNone(compute_cagr([], 1))
        # series length < 2
        self.assertIsNone(compute_cagr([{"value": 100}], 1))
        # years <= 0
        self.assertIsNone(compute_cagr([{"value": 100}, {"value": 200}], 0))
        self.assertIsNone(compute_cagr([{"value": 100}, {"value": 200}], -1))
        # start_val <= 0
        self.assertIsNone(compute_cagr([{"value": 0}, {"value": 200}], 1))
        self.assertIsNone(compute_cagr([{"value": -100}, {"value": 200}], 1))
        # end_val <= 0
        self.assertIsNone(compute_cagr([{"value": 100}, {"value": 0}], 1))
        self.assertIsNone(compute_cagr([{"value": 100}, {"value": -200}], 1))

    def test_render_box_table(self):
        render_box_table = self.cr.render_box_table

        table, width = render_box_table(
            title='TEST',
            headers=['Col1', 'Col2'],
            rows=[['Val1', 'Val2'], ['A', 'B']],
            alignments=['left', 'right'],
        )

        expected_table = (
            "+------+------+\n"
            "|     TEST    |\n"
            "+------+------+\n"
            "| Col1 | Col2 |\n"
            "+======+======+\n"
            "| Val1 | Val2 |\n"
            "| A    |    B |\n"
            "+------+------+"
        )
        self.assertEqual(table, expected_table)
        self.assertEqual(width, 15)

        # Edge cases
        # Empty rows and headers
        empty_table, empty_width = render_box_table()
        self.assertEqual(empty_table, "")
        self.assertEqual(empty_width, 0)

        # Empty table with title
        empty_table_title, empty_width_title = render_box_table(title="TITLE")
        self.assertEqual(empty_table_title, "")
        self.assertEqual(empty_width_title, 5)

        # Width hint
        table_hint, width_hint = render_box_table(headers=['A'], rows=[['1']], width_hint=10)
        expected_hint = "+--------+\n" "| A      |\n" "+========+\n" "| 1      |\n" "+--------+"
        self.assertEqual(table_hint, expected_hint)
        self.assertEqual(width_hint, 10)

        # Incorrect number of columns in row
        with self.assertRaises(ValueError):
            render_box_table(headers=['Col1', 'Col2'], rows=[['Val1']])

    def test_calculate_cagr(self):
        calculate_cagr = self.cr.calculate_cagr
        PORTFOLIO_SERIES_KEY = self.cr.PORTFOLIO_SERIES_KEY

        # Need to mock pd.to_datetime behavior
        from datetime import datetime
        def mock_to_datetime(date_str):
            if isinstance(date_str, datetime):
                return date_str
            return datetime.strptime(date_str, '%Y-%m-%d')
        self.mock_pd.to_datetime.side_effect = mock_to_datetime

        # Test case: missing portfolio series
        res = calculate_cagr({})
        self.assertEqual(res, "CAGR unavailable: insufficient portfolio observations.")

        # Test case: insufficient observations
        res = calculate_cagr({PORTFOLIO_SERIES_KEY: [{'date': '2020-01-01', 'value': 100}]})
        self.assertEqual(res, "CAGR unavailable: insufficient portfolio observations.")

        # Test case: invalid measurement period (same day)
        res = calculate_cagr({
            PORTFOLIO_SERIES_KEY: [
                {'date': '2020-01-01', 'value': 100},
                {'date': '2020-01-01', 'value': 200}
            ]
        })
        self.assertEqual(res, "CAGR unavailable: invalid measurement period.")

        # Test case: valid measurement period, multiple series
        # One year exactly (roughly 365.25 days)
        series_map = {
            PORTFOLIO_SERIES_KEY: [
                {'date': '2020-01-01', 'value': 100},
                {'date': '2020-12-31', 'value': 200}
            ],
            '^SPX': [
                {'date': '2020-01-01', 'value': 100},
                {'date': '2020-12-31', 'value': 150}
            ]
        }
        res = calculate_cagr(series_map)

        # Check that expected strings appear in the result
        self.assertIn("PERFORMANCE CAGR", res)
        self.assertIn(PORTFOLIO_SERIES_KEY, res)
        self.assertIn("^SPX", res)
        # Portfolio return: 100 -> 200 = 100%
        self.assertIn("100.00%", res)
        # SPX return: 100 -> 150 = 50%
        self.assertIn("50.00%", res)


class TestCalculateRatiosWithPandas(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            import numpy as np
            import pandas as pd

            cls.pd = pd
            cls.np = np

            # To import the real module, we must ensure it isn't the mocked version.
            # Pop it if it's there.
            if "scripts.ratios.calculate_ratios" in sys.modules:
                del sys.modules["scripts.ratios.calculate_ratios"]

            import scripts.ratios.calculate_ratios as cr

            cls.cr = cr
            cls.has_pandas = True
        except ImportError:
            cls.has_pandas = False

    def test_normalize_symbol_index(self):
        if not getattr(self, "has_pandas", False):
            self.skipTest("pandas not available")

        normalize_symbol_index = self.cr.normalize_symbol_index

        # Test empty dataframe
        df_empty = self.pd.DataFrame()
        res_empty = normalize_symbol_index(df_empty)
        self.assertTrue(res_empty.empty)

        # Test valid dataframe without shares
        df = self.pd.DataFrame({"price": [10, 20]}, index=["AAPL", "BRK-B"])
        res = normalize_symbol_index(df)
        self.assertEqual(list(res.index), ["AAPL", "BRKB"])
        self.assertEqual(list(res["display_symbol"]), ["AAPL", "BRK-B"])
        self.assertTrue("shares" not in res.columns)
        self.assertTrue("broker_shares" not in res.columns)

        # Test valid dataframe with shares
        df2 = self.pd.DataFrame({"shares": [100, 200]}, index=["AAPL", "BRK-B"])
        res2 = normalize_symbol_index(df2)
        self.assertEqual(list(res2.index), ["AAPL", "BRKB"])
        self.assertEqual(list(res2["display_symbol"]), ["AAPL", "BRK-B"])
        self.assertTrue("shares" not in res2.columns)
        self.assertEqual(list(res2["broker_shares"]), [100, 200])

    def test_get_latest_rates(self):
        if not getattr(self, "has_pandas", False):
            self.skipTest("pandas not available")

        get_latest_rates = self.cr.get_latest_rates

        # Test empty dataframe returns 1.0 for all supported currencies
        df_empty = self.pd.DataFrame()
        res_empty = get_latest_rates(df_empty)
        for cur in self.cr.SUPPORTED_CURRENCIES:
            self.assertEqual(res_empty[cur], 1.0)

        # Test with data
        data = {
            "USD": [1.0, 1.0],
            "CNY": [7.0, 7.1],
            "JPY": [140.0, 142.0],
            "KRW": [1300.0, 1310.0],
        }
        df = self.pd.DataFrame(data, index=self.pd.to_datetime(["2023-01-01", "2023-01-02"]))
        res = get_latest_rates(df)
        self.assertEqual(res["USD"], 1.0)
        self.assertEqual(res["CNY"], 7.1)
        self.assertEqual(res["JPY"], 142.0)
        self.assertEqual(res["KRW"], 1310.0)

    def test_build_fx_json(self):
        if not getattr(self, "has_pandas", False):
            self.skipTest("pandas not available")

        build_fx_json = self.cr.build_fx_json

        # Test normal case
        data = {
            "USD": [1.0, 1.0],
            "CNY": [7.0, 7.1],
            "JPY": [140.0, 142.0],
            "KRW": [1300.0, 1310.0],
        }
        df = self.pd.DataFrame(data, index=self.pd.to_datetime(["2023-01-01", "2023-01-02"]))
        res = build_fx_json(df)

        self.assertEqual(res["base"], "USD")
        self.assertEqual(res["currencies"], self.cr.SUPPORTED_CURRENCIES)
        self.assertIn("2023-01-01", res["rates"])
        self.assertIn("2023-01-02", res["rates"])
        self.assertEqual(res["rates"]["2023-01-01"]["CNY"], 7.0)
        self.assertEqual(res["rates"]["2023-01-02"]["CNY"], 7.1)
        self.assertEqual(res["rates"]["2023-01-02"]["KRW"], 1310.0)

    def test_compute_returns(self):
        if not getattr(self, "has_pandas", False):
            self.skipTest("pandas not available")

        compute_returns = self.cr.compute_returns

        # Test empty points
        res = compute_returns([], "daily")
        self.assertTrue(res.empty if hasattr(res, "empty") else False)
        self.assertEqual(compute_returns([], "annual"), {})

        # Test single point
        res_single = compute_returns([{"date": "2023-01-01", "value": 100}], "daily")
        self.assertTrue(res_single.empty if hasattr(res_single, "empty") else False)

        # Test normal points
        points = [
            {"date": "2023-01-01", "value": 100.0},
            {"date": "2023-01-02", "value": 101.0},
            {"date": "2023-01-03", "value": 105.04},
        ]

        # Daily
        res_daily = compute_returns(points, "daily")
        self.assertEqual(len(res_daily), 2)
        self.assertAlmostEqual(res_daily.iloc[0], 0.01)  # 101/100 - 1
        self.assertAlmostEqual(res_daily.iloc[1], 0.04)  # 105.04/101 - 1

        # Monthly
        points_monthly = [
            {"date": "2023-01-15", "value": 100.0},
            {"date": "2023-01-31", "value": 102.0},
            {"date": "2023-02-15", "value": 105.0},
            {"date": "2023-02-28", "value": 112.2},
        ]
        res_monthly = compute_returns(points_monthly, "monthly")
        self.assertEqual(len(res_monthly), 1)
        self.assertAlmostEqual(res_monthly["2023-02"], 0.1)  # 112.2 / 102 - 1 = 0.1

        # Annual
        points_annual = [
            {"date": "2021-12-31", "value": 100.0},
            {"date": "2022-12-31", "value": 110.0},
            {"date": "2023-12-31", "value": 121.0},
        ]
        res_annual = compute_returns(points_annual, "annual")
        self.assertEqual(len(res_annual), 2)
        self.assertAlmostEqual(res_annual["2022"], 0.1)  # 110 / 100 - 1
        self.assertAlmostEqual(res_annual["2023"], 0.1)  # 121 / 110 - 1


if __name__ == "__main__":
    unittest.main()
