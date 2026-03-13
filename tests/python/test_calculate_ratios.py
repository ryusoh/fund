import math
import os
import sys
import unittest
from unittest.mock import MagicMock

# Add project root to PYTHONPATH so we can import scripts
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

# Mock pandas and numpy before importing the module
sys.modules['pandas'] = MagicMock()
mock_numpy = MagicMock()


def mock_isfinite(value):
    if value is None:
        raise TypeError("Not a number")
    if isinstance(value, str):
        raise TypeError("Not a number")
    return not math.isnan(value) and not math.isinf(value)


mock_numpy.isfinite = mock_isfinite
sys.modules['numpy'] = mock_numpy

# ruff: noqa: E402
import scripts.ratios.calculate_ratios as cr


class TestCalculateRatios(unittest.TestCase):

    def test_order_series_names(self):
        # Happy path
        names = ['B', 'A', cr.PORTFOLIO_SERIES_KEY, 'C']
        ordered = cr.order_series_names(names)
        self.assertEqual(ordered, [cr.PORTFOLIO_SERIES_KEY, 'A', 'B', 'C'])

        # Without portfolio series key
        names = ['B', 'A', 'C']
        ordered = cr.order_series_names(names)
        self.assertEqual(ordered, ['A', 'B', 'C'])

        # Empty list
        self.assertEqual(cr.order_series_names([]), [])

    def test_format_currency(self):
        # Happy paths
        self.assertEqual(cr.format_currency(1234.56), "$1,234.56")
        self.assertEqual(cr.format_currency(0), "$0.00")
        self.assertEqual(cr.format_currency(-1234.56), "$-1,234.56")

        # Edge cases / Non-finite values
        self.assertEqual(cr.format_currency(float('inf')), "N/A")
        self.assertEqual(cr.format_currency(float('-inf')), "N/A")
        self.assertEqual(cr.format_currency(float('nan')), "N/A")

        # Error handling
        with self.assertRaises(TypeError):
            cr.format_currency(None)
        with self.assertRaises(TypeError):
            cr.format_currency("string")

    def test_format_percent(self):
        # Happy paths
        self.assertEqual(cr.format_percent(0.1234), "12.34%")
        self.assertEqual(cr.format_percent(0), "0.00%")
        self.assertEqual(cr.format_percent(-0.1234), "-12.34%")
        self.assertEqual(cr.format_percent(1.0), "100.00%")

        # Edge cases / Non-finite values
        self.assertEqual(cr.format_percent(float('inf')), "N/A")
        self.assertEqual(cr.format_percent(float('-inf')), "N/A")
        self.assertEqual(cr.format_percent(float('nan')), "N/A")

        # Error handling
        with self.assertRaises(TypeError):
            cr.format_percent(None)
        with self.assertRaises(TypeError):
            cr.format_percent("string")

    def test_compute_cagr(self):
        # Happy path
        series = [{'value': 100}, {'value': 150}, {'value': 200}]
        years = 2
        # CAGR = (200/100)^(1/2) - 1 = sqrt(2) - 1 = 0.4142...
        self.assertAlmostEqual(cr.compute_cagr(series, years), 0.41421356)

        # Edge case: series < 2 elements
        self.assertIsNone(cr.compute_cagr([{'value': 100}], 1))
        self.assertIsNone(cr.compute_cagr([], 1))

        # Edge case: years <= 0
        self.assertIsNone(cr.compute_cagr(series, 0))
        self.assertIsNone(cr.compute_cagr(series, -1))

        # Edge case: start or end value <= 0
        self.assertIsNone(cr.compute_cagr([{'value': 0}, {'value': 200}], 2))
        self.assertIsNone(cr.compute_cagr([{'value': 100}, {'value': -200}], 2))

    def test_render_box_table(self):
        # Happy path with headers and rows
        headers = ['Col1', 'Col2']
        rows = [['A', 'B'], ['C', 'D']]
        table, width = cr.render_box_table(title='TEST', headers=headers, rows=rows)

        self.assertIn('TEST', table)
        self.assertIn('Col1', table)
        self.assertIn('Col2', table)
        self.assertIn('A', table)
        self.assertIn('B', table)
        self.assertIn('C', table)
        self.assertIn('D', table)
        self.assertTrue(width > 0)

        # Edge case: Empty headers and rows
        table, width = cr.render_box_table()
        self.assertEqual(table, '')
        self.assertEqual(width, 0)

        # Error handling: Row with wrong column count
        with self.assertRaises(ValueError):
            cr.render_box_table(headers=['1', '2'], rows=[['1']])


if __name__ == '__main__':
    unittest.main()
