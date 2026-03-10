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
        cls.mock_np.isfinite.side_effect = lambda x: isinstance(x, (int, float)) and not (
            x != x or x == float("inf") or x == float("-inf")
        )
        cls.mock_np.nan = float("nan")
        cls.mock_np.inf = float("inf")

        cls.mock_pd = MagicMock()

        # Use a temporary patch of sys.modules to import the script with mocked dependencies
        with patch.dict(sys.modules, {"numpy": cls.mock_np, "pandas": cls.mock_pd}):
            import scripts.ratios.calculate_ratios as cr

            cls.cr = cr

    def test_format_currency(self):
        format_currency = self.cr.format_currency
        # Happy paths
        self.assertEqual(format_currency(1234.56), "$1,234.56")
        self.assertEqual(format_currency(1234.567), "$1,234.57")
        self.assertEqual(format_currency(0), "$0.00")
        self.assertEqual(format_currency(-1234.56), "$-1,234.56")
        self.assertEqual(format_currency(1000000), "$1,000,000.00")

        # Edge cases (non-finite)
        self.assertEqual(format_currency(float("nan")), "N/A")
        self.assertEqual(format_currency(float("inf")), "N/A")
        self.assertEqual(format_currency(float("-inf")), "N/A")

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

        # Happy path
        series = [{'value': 100}, {'value': 150}, {'value': 200}]
        # (200/100)^(1/2) - 1 = 2^0.5 - 1 = 1.41421356 - 1 = 0.41421356
        self.assertAlmostEqual(compute_cagr(series, 2), 0.41421356237309515)

        # Edge cases
        self.assertIsNone(compute_cagr([], 2))
        self.assertIsNone(compute_cagr([{'value': 100}], 2)) # Less than 2 elements
        self.assertIsNone(compute_cagr(series, 0)) # Years <= 0
        self.assertIsNone(compute_cagr(series, -1)) # Years <= 0

        # Start or end value <= 0
        self.assertIsNone(compute_cagr([{'value': 0}, {'value': 200}], 2))
        self.assertIsNone(compute_cagr([{'value': 100}, {'value': 0}], 2))
        self.assertIsNone(compute_cagr([{'value': -100}, {'value': 200}], 2))

    def test_render_box_table(self):
        render_box_table = self.cr.render_box_table

        table, width = render_box_table(
            title='TEST',
            headers=['Col1', 'Col2'],
            rows=[['Val1', 'Val2'], ['A', 'B']],
            alignments=['left', 'right']
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
        table_hint, width_hint = render_box_table(
            headers=['A'],
            rows=[['1']],
            width_hint=10
        )
        expected_hint = (
            "+--------+\n"
            "| A      |\n"
            "+========+\n"
            "| 1      |\n"
            "+--------+"
        )
        self.assertEqual(table_hint, expected_hint)
        self.assertEqual(width_hint, 10)

        # Incorrect number of columns in row
        with self.assertRaises(ValueError):
            render_box_table(
                headers=['Col1', 'Col2'],
                rows=[['Val1']]
            )

if __name__ == "__main__":
    unittest.main()
