import unittest
import sys
from pathlib import Path
from unittest.mock import MagicMock

# Mock numpy and pandas before they are imported by calculate_ratios
mock_np = MagicMock()
# Simple implementation of isfinite for the purpose of these tests
mock_np.isfinite.side_effect = lambda x: isinstance(x, (int, float)) and not (
    x != x or x == float("inf") or x == float("-inf")
)
mock_np.nan = float("nan")
mock_np.inf = float("inf")
sys.modules["numpy"] = mock_np

mock_pd = MagicMock()
sys.modules["pandas"] = mock_pd

# Add project root to path so we can import scripts
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from scripts.ratios.calculate_ratios import format_currency, format_percent


class TestCalculateRatios(unittest.TestCase):
    def test_format_currency(self):
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


if __name__ == "__main__":
    unittest.main()
