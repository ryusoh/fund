import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

# Add project root to path so we can import scripts
project_root = Path(__file__).parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

class TestStep02ApplySplits(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Mock numpy and pandas
        cls.mock_np = MagicMock()
        cls.mock_np.isnan.side_effect = lambda x: x != x # Standard NaN check

        cls.mock_pd = MagicMock()

        # Patch sys.modules to import the script with mocked dependencies
        with patch.dict(sys.modules, {"numpy": cls.mock_np, "pandas": cls.mock_pd}):
            from scripts.twrr.step02_apply_splits import parse_split_ratio
            cls.parse_split_ratio = staticmethod(parse_split_ratio)

    def test_parse_split_ratio_success(self):
        parse_split_ratio = self.parse_split_ratio
        self.assertEqual(parse_split_ratio("2:1"), 2.0)
        self.assertEqual(parse_split_ratio("1:2"), 0.5)
        self.assertEqual(parse_split_ratio(" 3:1 "), 3.0)
        self.assertEqual(parse_split_ratio("10:1"), 10.0)
        self.assertEqual(parse_split_ratio("1:1"), 1.0)

    def test_parse_split_ratio_missing_value(self):
        parse_split_ratio = self.parse_split_ratio
        with self.assertRaisesRegex(ValueError, "Split ratio value is missing"):
            parse_split_ratio(None)

        nan_val = float('nan')
        with self.assertRaisesRegex(ValueError, "Split ratio value is missing"):
            parse_split_ratio(nan_val)

    def test_parse_split_ratio_invalid_format(self):
        parse_split_ratio = self.parse_split_ratio
        with self.assertRaisesRegex(ValueError, "Invalid split ratio format"):
            parse_split_ratio("2-1")
        with self.assertRaisesRegex(ValueError, "Invalid split ratio format"):
            parse_split_ratio("2")

    def test_parse_split_ratio_non_numeric(self):
        parse_split_ratio = self.parse_split_ratio
        with self.assertRaisesRegex(ValueError, "Non-numeric split ratio"):
            parse_split_ratio("a:1")
        with self.assertRaisesRegex(ValueError, "Non-numeric split ratio"):
            parse_split_ratio("2:b")

    def test_parse_split_ratio_zero_denominator(self):
        parse_split_ratio = self.parse_split_ratio
        with self.assertRaisesRegex(ValueError, "Split ratio denominator is zero"):
            parse_split_ratio("2:0")

    def test_parse_split_ratio_non_positive(self):
        parse_split_ratio = self.parse_split_ratio
        with self.assertRaisesRegex(ValueError, "Split ratio must be positive"):
            parse_split_ratio("0:1")
        with self.assertRaisesRegex(ValueError, "Split ratio must be positive"):
            parse_split_ratio("-1:1")
        with self.assertRaisesRegex(ValueError, "Split ratio must be positive"):
            parse_split_ratio("1:-1")

if __name__ == "__main__":
    unittest.main()
