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

    def test_compute_cagr(self):
        compute_cagr = self.cr.compute_cagr

        # Happy paths
        # 1 year doubling = 100%
        self.assertAlmostEqual(compute_cagr([{"value": 100}, {"value": 200}], 1), 1.0)
        # 2 year quadrupling = 100%
        self.assertAlmostEqual(compute_cagr([{"value": 100}, {"value": 400}], 2), 1.0)
        # fractional years
        self.assertAlmostEqual(compute_cagr([{"value": 100}, {"value": 150}], 0.5), 1.25)

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


if __name__ == "__main__":
    unittest.main()
