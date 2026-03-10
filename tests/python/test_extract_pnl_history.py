import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

# Add project root to path so we can import scripts
project_root = Path(__file__).parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))


class TestExtractPnlHistory(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Mock pandas before it is imported
        cls.mock_pd = MagicMock()

        # Use a temporary patch of sys.modules to import the script with mocked dependencies
        with patch.dict(sys.modules, {"pandas": cls.mock_pd}):
            import scripts.pnl.extract_pnl_history as extract_pnl

            cls.extract_pnl = extract_pnl

    def test_calculate_daily_values_happy_path_list_data(self):
        calculate_daily_values = self.extract_pnl.calculate_daily_values

        holdings = {"AAPL": {"shares": 10}, "VWCE.DE": {"shares": 20}}
        fund_data = {
            "data": [
                {"ticker": "AAPL", "price": 150.0, "currency": "USD"},
                {"ticker": "VWCE.DE", "price": 100.0, "currency": "EUR"},
            ]
        }
        forex = {"rates": {"EUR": 0.9}}  # 1 USD = 0.9 EUR

        # Calculation:
        # AAPL: 10 * 150.0 / 1.0 = 1500.0 USD
        # VWCE.DE: 20 * 100.0 / 0.9 = 2222.222... USD
        # Total USD = 3722.222... USD

        result = calculate_daily_values(holdings, fund_data, forex)

        self.assertIn("value_usd", result)
        self.assertAlmostEqual(result["value_usd"], 3722.22, places=2)

        self.assertIn("value_eur", result)
        self.assertAlmostEqual(result["value_eur"], 3722.222 * 0.9, places=2)

    def test_calculate_daily_values_happy_path_dict_data(self):
        calculate_daily_values = self.extract_pnl.calculate_daily_values

        holdings = {
            "AAPL": {"shares": 10},
        }
        fund_data = {"AAPL": 150.0}
        forex = {"rates": {}}

        result = calculate_daily_values(holdings, fund_data, forex)

        self.assertIn("value_usd", result)
        self.assertEqual(result["value_usd"], 1500.0)

    def test_calculate_daily_values_empty_inputs(self):
        calculate_daily_values = self.extract_pnl.calculate_daily_values

        self.assertEqual(calculate_daily_values({}, {}, {}), {"value_usd": 0.0})

        # Empty holdings
        self.assertEqual(
            calculate_daily_values(
                {}, {"data": [{"ticker": "AAPL", "price": 100}]}, {"rates": {"EUR": 0.9}}
            ),
            {"value_usd": 0.0, "value_eur": 0.0},
        )

    def test_calculate_daily_values_missing_ticker_in_fund_data(self):
        calculate_daily_values = self.extract_pnl.calculate_daily_values

        holdings = {"AAPL": {"shares": 10}, "MSFT": {"shares": 5}}
        fund_data = {
            "data": [
                {"ticker": "AAPL", "price": 150.0, "currency": "USD"}
                # MSFT is missing
            ]
        }
        forex = {"rates": {}}

        result = calculate_daily_values(holdings, fund_data, forex)

        # Only AAPL should be calculated
        self.assertEqual(result["value_usd"], 1500.0)

    def test_calculate_daily_values_missing_shares_or_invalid_shares(self):
        calculate_daily_values = self.extract_pnl.calculate_daily_values

        holdings = {
            "AAPL": {},  # missing shares
            "MSFT": {"shares": "invalid"},  # invalid shares
            "GOOG": {"shares": 10},
        }
        fund_data = {
            "data": [
                {"ticker": "AAPL", "price": 150.0, "currency": "USD"},
                {"ticker": "MSFT", "price": 200.0, "currency": "USD"},
                {"ticker": "GOOG", "price": 100.0, "currency": "USD"},
            ]
        }
        forex = {"rates": {}}

        result = calculate_daily_values(holdings, fund_data, forex)

        # Only GOOG should be calculated
        self.assertEqual(result["value_usd"], 1000.0)

    def test_calculate_daily_values_invalid_price(self):
        calculate_daily_values = self.extract_pnl.calculate_daily_values

        holdings = {
            "AAPL": {"shares": 10},
        }
        fund_data = {
            "data": [
                {"ticker": "AAPL", "price": "invalid", "currency": "USD"},
            ]
        }
        forex = {"rates": {}}

        result = calculate_daily_values(holdings, fund_data, forex)

        # Should handle exception and continue, resulting in 0
        self.assertEqual(result["value_usd"], 0.0)

    def test_calculate_daily_values_missing_fx_rate(self):
        calculate_daily_values = self.extract_pnl.calculate_daily_values

        holdings = {"VWCE.DE": {"shares": 20}}
        fund_data = {"data": [{"ticker": "VWCE.DE", "price": 100.0, "currency": "EUR"}]}
        forex = {"rates": {}}  # missing EUR rate

        result = calculate_daily_values(holdings, fund_data, forex)

        # Fallback FX to 1.0, Total = 20 * 100.0 / 1.0 = 2000.0
        self.assertEqual(result["value_usd"], 2000.0)


if __name__ == "__main__":
    unittest.main()
