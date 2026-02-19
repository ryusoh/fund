import sys
import unittest
import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime
from typing import Dict, Any

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from scripts.generate_pe_data import (
    interpolate_eps_series,
    calculate_harmonic_pe,
    get_closest_fx,
)


class TestGeneratePEData(unittest.TestCase):
    def test_interpolate_eps_series(self):
        """Test daily interpolation logic between annual EPS points."""
        dates = pd.date_range(start="2023-01-01", end="2023-01-05")

        # Mock stock data:
        # Annual EPS 2023-01-01 = 1.0
        # Annual EPS 2023-01-05 = 5.0
        # No current TTM
        stock_data: Dict[str, Any] = {
            "points": [
                {"date": pd.Timestamp("2023-01-01"), "eps": 1.0},
                {"date": pd.Timestamp("2023-01-05"), "eps": 5.0},
            ],
            "current_ttm": None,
            "currency": "USD",
        }

        series = interpolate_eps_series(stock_data, dates)

        # Check values
        self.assertAlmostEqual(series["2023-01-01"], 1.0)
        self.assertAlmostEqual(series["2023-01-05"], 5.0)

        # Midpoint check (linear interpolation)
        # Day 1 -> Day 5 is 4 days span. Delta = 4.0. Step = 1.0 per day.
        # 2023-01-02 -> 2.0
        self.assertAlmostEqual(series["2023-01-02"], 2.0)
        self.assertAlmostEqual(series["2023-01-03"], 3.0)

    def test_calculate_harmonic_pe_basic(self):
        """Test basic weighted harmonic mean calculation."""
        # 2 stocks, equal weight ($100 each), PE 10 and 20.
        mv_map = {"A": 100.0, "B": 100.0}
        pe_map = {"A": 10.0, "B": 20.0}

        # Weight A = 0.5, Yield A = 1/10 = 0.1
        # Weight B = 0.5, Yield B = 1/20 = 0.05
        # Weighted Yield = 0.05 + 0.025 = 0.075
        # Portfolio PE = 1 / 0.075 = 13.333...

        pe = calculate_harmonic_pe(mv_map, pe_map)
        self.assertIsNotNone(pe)
        self.assertAlmostEqual(pe, 1 / 0.075, places=4)

    def test_calculate_harmonic_pe_outlier(self):
        """Test robustness against near-zero earnings (high PE)."""
        # Stock A: Normal (mv=100, PE=20)
        # Stock B: Outlier (mv=100, PE=8000) -> Yield = 0.000125
        mv_map = {"A": 100.0, "B": 100.0}
        pe_map = {"A": 20.0, "B": 8000.0}

        # Weight A = 0.5, Yield A = 0.05
        # Weight B = 0.5, Yield B = 0.000125
        # Weighted Yield = 0.025 + 0.0000625 = 0.0250625
        # Portfolio PE = 1 / 0.0250625 = 39.89...

        pe = calculate_harmonic_pe(mv_map, pe_map)

        # Arithmetic mean would be (20 + 8000)/2 = 4010.
        # Harmonic mean stays reasonable (~40).
        self.assertLess(pe, 50.0)
        self.assertAlmostEqual(pe, 1 / 0.0250625, places=4)

    def test_calculate_harmonic_pe_missing_data(self):
        """Test handling of missing PE data."""
        # Stock A: mv=100, PE=20
        # Stock B: mv=100, PE=Missing (None)
        mv_map = {"A": 100.0, "B": 100.0}
        pe_map = {"A": 20.0}

        # Weight B is ignored. Weight A becomes 1.0 of valid portion?
        # Function normalizes weights based on valid items.
        # Valid MV = 100 (A). Total valid MV = 100.
        # Weight A = 100/200 = 0.5 originally.
        # Weighted Yield = 0.5 * (1/20) = 0.025.
        # Weight Sum = 0.5.
        # Adjusted Yield = 0.025 / 0.5 = 0.05.
        # PE = 1 / 0.05 = 20.0.

        pe = calculate_harmonic_pe(mv_map, pe_map)
        self.assertAlmostEqual(pe, 20.0)

    def test_get_closest_fx(self):
        """Test matching FX rates by date."""
        dates = pd.to_datetime(["2023-01-01", "2023-01-03"])
        rates = [7.0, 7.2]
        fx_series = pd.Series(rates, index=dates)

        # Exact match
        rate = get_closest_fx(fx_series, pd.Timestamp("2023-01-01"))
        self.assertEqual(rate, 7.0)

        # Nearest match (forward)
        # 2023-01-02 is closer to which?
        # logic: get_indexer(method="nearest")
        # 01-02 is midpoint. Pandas nearest?

        # Let's test standard nearest behavior
        rate_mid = get_closest_fx(fx_series, pd.Timestamp("2023-01-02"))
        # Should be 7.0 or 7.2 depending on implementation/time
        self.assertTrue(rate_mid in [7.0, 7.2])


if __name__ == "__main__":
    unittest.main()
