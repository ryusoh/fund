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
        cls.mock_np.isnan.side_effect = lambda x: x != x  # Standard NaN check

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

    def test_apply_split_adjustments_vectorized(self):
        """
        Verify the vectorized logic of apply_split_adjustments using mocks.
        """
        # We must patch sys.modules BEFORE importing the script because it has top-level imports
        # Using a new name to avoid conflict with class-level mocks if any
        local_mock_pd = MagicMock()
        local_mock_np = MagicMock()
        with patch.dict(sys.modules, {"numpy": local_mock_np, "pandas": local_mock_pd}):
            # Ensure the module is reloaded with our mocks
            if "scripts.twrr.step02_apply_splits" in sys.modules:
                del sys.modules["scripts.twrr.step02_apply_splits"]
            from scripts.twrr.step02_apply_splits import apply_split_adjustments

            # Setup mock transactions and splits
            transactions = MagicMock()
            transactions.copy.return_value = transactions
            transactions.__getitem__.side_effect = lambda key: MagicMock()
            transactions.index = MagicMock()

            splits = MagicMock()
            splits.empty = False

            # Mock groupby
            sec_splits = MagicMock()
            splits.groupby.return_value = [("AAPL", sec_splits)]

            # Mock transaction indexing
            transactions.index.__getitem__.return_value = [0, 1, 2]

            # Mock trade_dates
            trade_dates = MagicMock()
            transactions.loc.__getitem__.return_value.to_numpy.return_value = trade_dates

            # Mock np.ones
            factors = MagicMock()
            local_mock_np.ones.return_value = factors

            # Mock sec_splits sort and to_numpy
            sec_splits.sort_values.return_value = sec_splits
            split_dates = MagicMock()
            split_factors = MagicMock()
            sec_splits.__getitem__.side_effect = lambda key: {
                'split_date': MagicMock(to_numpy=lambda: split_dates),
                'split_factor': MagicMock(to_numpy=lambda: split_factors),
            }[key]

            # Mock np.cumprod and np.searchsorted
            rev_cum_factors = MagicMock()
            local_mock_np.cumprod.return_value = rev_cum_factors
            rev_cum_factors.__getitem__.return_value = rev_cum_factors

            split_indices = MagicMock()
            local_mock_np.searchsorted.return_value = split_indices

            # Mock valid_mask
            valid_mask = MagicMock()
            split_indices.__lt__.return_value = valid_mask

            # Run the function
            apply_split_adjustments(transactions, splits)

            # Assertions to ensure vectorized calls were made
            local_mock_np.cumprod.assert_called()
            local_mock_np.searchsorted.assert_called_with(split_dates, trade_dates, side='right')
            transactions.loc.__setitem__.assert_called()


if __name__ == "__main__":
    unittest.main()
