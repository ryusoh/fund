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
        try:
            import numpy as np  # noqa: F401
            import pandas as pd  # noqa: F401

            cls.has_pandas = True
        except ImportError:
            cls.has_pandas = False

        if cls.has_pandas:
            import scripts.ratios.calculate_ratios as cr

            cls.cr = cr
        else:
            # Mock numpy and pandas before they are imported by calculate_ratios
            cls.mock_np = MagicMock()

            # Simple implementation of isfinite for the purpose of these tests
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

            from datetime import datetime

            def mock_to_datetime(arg):
                if (
                    isinstance(arg, (datetime, pd.Timestamp))
                    if cls.has_pandas
                    else isinstance(arg, datetime)
                ):
                    return arg
                if isinstance(arg, str):
                    return datetime.strptime(arg, '%Y-%m-%d')
                return arg

            cls.mock_pd.to_datetime.side_effect = mock_to_datetime

            # Use a temporary patch of sys.modules to import the script with mocked dependencies
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

        if not self.has_pandas:
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
        else:
            import pandas as pd

            fx_df = pd.DataFrame(
                {
                    'date': pd.to_datetime(['2023-01-01', '2023-01-02']),
                    'USD': [1.0, 1.0],
                    'CNY': [6.9, 7.0],
                    'JPY': [130.0, 131.0],
                    'KRW': [1200.0, 1210.0],
                }
            ).set_index('date')

            res = get_latest_rates(fx_df)
            self.assertEqual(res, {'USD': 1.0, 'CNY': 7.0, 'JPY': 131.0, 'KRW': 1210.0})

            empty_df = pd.DataFrame()
            res_empty = get_latest_rates(empty_df)
            self.assertEqual(res_empty, {currency: 1.0 for currency in SUPPORTED_CURRENCIES})

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

    def test_normalize_symbol_index(self):
        if not self.has_pandas:
            self.skipTest("pandas is not available")
        import pandas as pd

        df = pd.DataFrame({'price': [150.0, 200.0]}, index=['AAPL', 'BRK-B'])
        res = self.cr.normalize_symbol_index(df)

        self.assertEqual(res.index.tolist(), ['AAPL', 'BRKB'])
        self.assertEqual(res['display_symbol'].tolist(), ['AAPL', 'BRK-B'])
        self.assertNotIn('shares', res.columns)

        df_with_shares = pd.DataFrame({'shares': [10, 20]}, index=['AAPL', 'BRK-B'])
        res2 = self.cr.normalize_symbol_index(df_with_shares)
        self.assertIn('broker_shares', res2.columns)
        self.assertNotIn('shares', res2.columns)

        # Test empty df
        empty_df = pd.DataFrame()
        self.assertTrue(self.cr.normalize_symbol_index(empty_df).empty)

    def test_build_fx_json(self):
        SUPPORTED_CURRENCIES = self.cr.SUPPORTED_CURRENCIES
        if not self.has_pandas:
            # Mock the DataFrame and its methods
            mock_df = MagicMock()
            mock_subset = MagicMock()
            mock_copy = MagicMock()
            mock_index = MagicMock()

            mock_df.__getitem__.return_value = mock_subset
            mock_subset.copy.return_value = mock_copy
            mock_copy.index = mock_index

            # Mock strftime and to_dict
            mock_index.strftime.return_value = ['2023-01-01', '2023-01-02']
            mock_copy.to_dict.return_value = {
                '2023-01-01': {'USD': 1.0, 'CNY': 6.9, 'JPY': 130.0, 'KRW': 1200.0},
                '2023-01-02': {'USD': 1.0, 'CNY': 7.0, 'JPY': 131.0, 'KRW': 1210.0},
            }

            res = self.cr.build_fx_json(mock_df)

            # Verify mock calls
            mock_df.__getitem__.assert_called_with(SUPPORTED_CURRENCIES)
            mock_index.strftime.assert_called_with('%Y-%m-%d')
            mock_copy.to_dict.assert_called_with(orient='index')

            self.assertEqual(res['base'], 'USD')
            self.assertEqual(res['currencies'], SUPPORTED_CURRENCIES)
            self.assertEqual(
                res['rates']['2023-01-01'], {'USD': 1.0, 'CNY': 6.9, 'JPY': 130.0, 'KRW': 1200.0}
            )
        else:
            import pandas as pd

            fx_df = pd.DataFrame(
                {
                    'date': pd.to_datetime(['2023-01-01', '2023-01-02']),
                    'USD': [1.0, 1.0],
                    'CNY': [6.9, 7.0],
                    'JPY': [130.0, 131.0],
                    'KRW': [1200.0, 1210.0],
                }
            ).set_index('date')

            res = self.cr.build_fx_json(fx_df)
            self.assertEqual(res['base'], 'USD')
            self.assertEqual(res['currencies'], SUPPORTED_CURRENCIES)
            self.assertEqual(
                res['rates']['2023-01-01'], {'USD': 1.0, 'CNY': 6.9, 'JPY': 130.0, 'KRW': 1200.0}
            )

    def test_compute_returns(self):
        if not self.has_pandas:
            self.skipTest("pandas is not available")
        import pandas as pd

        points = [
            {'date': '2023-01-01', 'value': 100.0},
            {'date': '2023-01-02', 'value': 105.0},
            {'date': '2023-01-03', 'value': 102.9},
        ]

        # Daily
        res_daily = self.cr.compute_returns(points, 'daily')
        self.assertTrue(isinstance(res_daily, pd.Series))
        self.assertAlmostEqual(res_daily.iloc[0], 0.05)
        self.assertAlmostEqual(res_daily.iloc[1], -0.02)

        # Monthly
        points_monthly = [
            {'date': '2023-01-31', 'value': 100.0},
            {'date': '2023-02-28', 'value': 110.0},
            {'date': '2023-03-31', 'value': 104.5},
        ]
        res_monthly = self.cr.compute_returns(points_monthly, 'monthly')
        self.assertAlmostEqual(res_monthly['2023-02'], 0.1)
        self.assertAlmostEqual(res_monthly['2023-03'], -0.05)

        # Annual
        points_annual = [
            {'date': '2022-12-31', 'value': 100.0},
            {'date': '2023-12-31', 'value': 120.0},
            {'date': '2024-12-31', 'value': 150.0},
        ]
        res_annual = self.cr.compute_returns(points_annual, 'annual')
        self.assertAlmostEqual(res_annual['2023'], 0.2)
        self.assertAlmostEqual(res_annual['2024'], 0.25)

        # Empty
        self.assertTrue(self.cr.compute_returns([], 'daily').empty)

    def test_calculate_annual_returns(self):
        if not self.has_pandas:
            self.skipTest("pandas is not available")
        points = [
            {'date': '2022-12-31', 'value': 100.0},
            {'date': '2023-12-31', 'value': 120.0},
            {'date': '2024-12-31', 'value': 150.0},
        ]
        series_map = {'^LZ': points}
        res = self.cr.calculate_annual_returns(series_map)
        self.assertIn("2023", res)
        self.assertIn("20.00%", res)
        self.assertIn("2024", res)
        self.assertIn("25.00%", res)

        self.assertEqual(
            self.cr.calculate_annual_returns({}), "Return breakdown unavailable: no annual data."
        )

    def test_calculate_ratios(self):
        if not self.has_pandas:
            self.skipTest("pandas is not available")
        points = [{'date': f'2023-01-{i:02d}', 'value': 100.0 * (1.001**i)} for i in range(1, 31)]
        series_map = {'^LZ': points}

        res = self.cr.calculate_ratios(series_map)
        self.assertIn("RISK RATIOS", res)
        self.assertIn("^LZ", res)

    def test_calculate_stats(self):
        if not self.has_pandas:
            self.skipTest("pandas is not available")
        import pandas as pd

        # Test calculate_stats directly with real pandas
        mock_transactions = pd.DataFrame(
            {
                'trade_date': ['2023-01-01', '2023-01-02'],
                'security': ['AAPL', 'AAPL'],
                'order_type': ['buy', 'sell'],
                'trade_value': [1500.0, 1600.0],
                'adjusted_quantity': [10.0, 10.0],
            }
        )

        with patch(
            'scripts.ratios.calculate_ratios.pd.read_parquet', return_value=mock_transactions
        ):
            with patch.object(self.cr, 'DATA_DIR', new_callable=MagicMock):
                res_text, res_json = self.cr.calculate_stats({'USD': 1.0})

                self.assertIn("TRANSACTION STATS", res_text)
                self.assertEqual(res_json['counts']['total_transactions'], 2)
                self.assertEqual(res_json['counts']['buy_orders'], 1)
                self.assertEqual(res_json['counts']['sell_orders'], 1)
                self.assertEqual(res_json['currency_values']['USD']['realized_gain'], 100.0)
                self.assertEqual(res_json['currency_values']['USD']['net_contributions'], -100.0)

    def test_calculate_holdings(self):
        if not self.has_pandas:
            self.skipTest("pandas is not available")

        # Mock empty case
        with patch.object(self.cr.Path, 'exists', return_value=False):
            res_text, res_json = self.cr.calculate_holdings({'USD': 1.0})
            self.assertEqual(res_text, "No current holdings.")
            self.assertEqual(res_json, {})

    def test_get_performance_series(self):
        if not self.has_pandas:
            self.skipTest("pandas is not available")
        import pandas as pd

        # Mock pd.read_parquet
        mock_prices = pd.DataFrame(
            {'^AAPL': [100.0, 105.0]}, index=pd.to_datetime(['2023-01-01', '2023-01-02'])
        )
        mock_twrr = pd.DataFrame(
            {'value': [1.0, 1.05]}, index=pd.to_datetime(['2023-01-01', '2023-01-02'])
        )

        with patch('scripts.ratios.calculate_ratios.pd.read_parquet') as mock_read_parquet:
            mock_read_parquet.side_effect = [mock_prices, mock_twrr]

            res = self.cr.get_performance_series()
            self.assertIn(self.cr.PORTFOLIO_SERIES_KEY, res)
            self.assertIn('^AAPL', res)
            self.assertEqual(res['^AAPL'][0]['value'], 1.0)
            self.assertEqual(res['^AAPL'][1]['value'], 1.05)

    def test_calculate_cagr(self):
        calculate_cagr = self.cr.calculate_cagr
        PORTFOLIO_SERIES_KEY = self.cr.PORTFOLIO_SERIES_KEY

        # Test case: missing portfolio series
        res = calculate_cagr({})
        self.assertEqual(res, "CAGR unavailable: insufficient portfolio observations.")

        # Test case: insufficient observations
        res = calculate_cagr({PORTFOLIO_SERIES_KEY: [{'date': '2020-01-01', 'value': 100}]})
        self.assertEqual(res, "CAGR unavailable: insufficient portfolio observations.")

        # Test case: invalid measurement period (same day)
        res = calculate_cagr(
            {
                PORTFOLIO_SERIES_KEY: [
                    {'date': '2020-01-01', 'value': 100},
                    {'date': '2020-01-01', 'value': 200},
                ]
            }
        )
        self.assertEqual(res, "CAGR unavailable: invalid measurement period.")

        # Happy path testing
        if self.has_pandas:
            # Test case: valid measurement period, multiple series
            # One year exactly (roughly 365.25 days)
            series_map = {
                PORTFOLIO_SERIES_KEY: [
                    {'date': '2020-01-01', 'value': 100},
                    {'date': '2020-12-31', 'value': 200},
                ],
                '^SPX': [
                    {'date': '2020-01-01', 'value': 100},
                    {'date': '2020-12-31', 'value': 150},
                ],
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
        else:
            # Mock pd.to_datetime behavior
            from datetime import datetime

            def mock_to_datetime(date_str):
                if isinstance(date_str, datetime):
                    return date_str
                return datetime.strptime(date_str, '%Y-%m-%d')

            self.mock_pd.to_datetime.side_effect = mock_to_datetime

            # Minimal happy path test with mocks
            series_map = {
                PORTFOLIO_SERIES_KEY: [
                    {'date': '2020-01-01', 'value': 100},
                    {'date': '2020-12-31', 'value': 200},
                ]
            }

            # Ensure years comparison works when pandas is mocked
            mock_years = MagicMock()
            mock_years.__le__.return_value = False
            mock_years.__gt__.return_value = True
            mock_years.days = 365

            with patch.object(self.cr.pd, 'to_datetime') as mock_dt:
                d1 = datetime(2020, 1, 1)
                d2 = datetime(2020, 12, 31)
                mock_dt.side_effect = [d1, d2]
                with patch.object(self.cr, 'compute_cagr', return_value=1.0):
                    res = calculate_cagr(series_map)

            self.assertIn("PERFORMANCE CAGR", res)
            self.assertIn(PORTFOLIO_SERIES_KEY, res)


if __name__ == "__main__":
    unittest.main()
