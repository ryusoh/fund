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

        # Use a temporary patch of sys.modules to import the script with mocked dependencies
        with patch.dict(sys.modules, {"numpy": cls.mock_np, "pandas": cls.mock_pd}):
            import scripts.ratios.calculate_ratios as cr

            cls.cr = cr

    def test_get_latest_rates(self):
        get_latest_rates = self.cr.get_latest_rates
        SUPPORTED_CURRENCIES = self.cr.SUPPORTED_CURRENCIES

        # Empty dataframe
        mock_empty_df = MagicMock()
        mock_empty_df.empty = True
        self.assertEqual(get_latest_rates(mock_empty_df), {currency: 1.0 for currency in SUPPORTED_CURRENCIES})

        # Populated dataframe
        mock_df = MagicMock()
        mock_df.empty = False
        latest_row_mock = MagicMock()

        # Test default value 1.0 when currency not present, and extracting actual float when present
        def mock_get(key, default):
            if key == 'USD': return 1.5
            if key == 'CNY': return "6.8"
            return default

        latest_row_mock.get.side_effect = mock_get
        # To mock iloc[-1], we mock the iloc attribute which is commonly used with []
        # so we mock __getitem__ on whatever mock_df.iloc returns
        iloc_mock = MagicMock()
        iloc_mock.__getitem__.return_value = latest_row_mock
        mock_df.iloc = iloc_mock

        expected = {currency: 1.0 for currency in SUPPORTED_CURRENCIES}
        expected['USD'] = 1.5
        expected['CNY'] = 6.8

        self.assertEqual(get_latest_rates(mock_df), expected)

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


if __name__ == "__main__":
    unittest.main()
