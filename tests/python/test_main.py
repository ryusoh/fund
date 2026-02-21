import csv
import json
import sys
import tempfile
import unittest
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Dict
from unittest.mock import MagicMock, mock_open, patch

import pandas as pd

# Add project root to path so we can import scripts
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from scripts.data.backfill_portfolio_history import (  # noqa: E402
    BackfillResult,
    backfill_portfolio_history,
)
from scripts.data.fetch_forex import fetch_forex_data  # noqa: E402
from scripts.data.update_fund_data import main as update_fund_data  # noqa: E402
from scripts.pnl.extract_pnl_history import main as process_pnl_history  # noqa: E402
from scripts.pnl.update_daily_pnl import main as update_daily_pnl  # noqa: E402
from scripts.portfolio.manage_holdings import main  # noqa: E402


class TestFundScripts(unittest.TestCase):

    # Test for extract_pnl_history.py
    @patch("scripts.pnl.extract_pnl_history.pd.DataFrame.to_csv")
    @patch("scripts.pnl.extract_pnl_history.get_file_content_at_commit")
    @patch("scripts.pnl.extract_pnl_history.get_commit_history_for_file")
    def test_process_pnl_history(self, mock_get_history, mock_get_content, mock_to_csv) -> None:
        # Arrange
        mock_get_history.return_value = [(1672531200, "hash1"), (1672617600, "hash2")]
        mock_get_content.side_effect = [
            {"AAPL": {"shares": 100}},  # holdings at hash1
            {"data": [{"ticker": "AAPL", "price": 150, "currency": "USD"}]},  # fund_data at hash1
            {"rates": {"USD": 1.0}},  # forex at hash1
            {"AAPL": {"shares": 120}},  # holdings at hash2
            {"data": [{"ticker": "AAPL", "price": 155, "currency": "USD"}]},  # fund_data at hash2
            {"rates": {"USD": 1.0}},  # forex at hash2
        ]

        # Act
        process_pnl_history()

        # Assert
        self.assertEqual(mock_to_csv.call_count, 1)
        # The first argument of to_csv is the path
        path_arg = mock_to_csv.call_args[0][0]
        self.assertEqual(path_arg.name, "historical_portfolio_values.csv")

    # Test for fetch_forex.py
    @patch("scripts.data.fetch_forex.yf.Ticker")
    def test_fetch_forex_data(self, mock_yf_ticker) -> None:
        # Mocking the yfinance Ticker
        mock_cny = MagicMock()
        mock_cny.history.return_value = pd.DataFrame({"Close": [7.2]})
        mock_jpy = MagicMock()
        mock_jpy.history.return_value = pd.DataFrame({"Close": [145.0]})
        mock_krw = MagicMock()
        mock_krw.history.return_value = pd.DataFrame({"Close": [1300.0]})

        def ticker_side_effect(symbol):
            if symbol == "USDCNY=X":
                return mock_cny
            if symbol == "USDJPY=X":
                return mock_jpy
            if symbol == "USDKRW=X":
                return mock_krw
            return MagicMock()

        mock_yf_ticker.side_effect = ticker_side_effect

        # Mock file operations to handle multiple files with different formats
        # First read is often fx_data.json, second is fx_daily_rates.csv
        initial_json = json.dumps({"base": "USD", "currencies": ["CNY", "JPY", "KRW"], "rates": {}})
        initial_csv = "date,USD,CNY,JPY,KRW\n2023-01-01,1.0,7.0,140.0,1200.0"

        json_mock = mock_open(read_data=initial_json).return_value
        csv_mock = mock_open(read_data=initial_csv).return_value

        def open_side_effect(path, *args, **kwargs):
            if str(path).endswith('.json'):
                return json_mock
            return csv_mock

        with patch("builtins.open", side_effect=open_side_effect):
            fetch_forex_data()

        # Assert that the JSON file was updated
        all_json_writes = "".join(call[0][0] for call in json_mock.write.call_args_list)
        written_data = json.loads(all_json_writes)

        self.assertEqual(written_data["rates"]["CNY"], 7.2)
        self.assertEqual(written_data["rates"]["JPY"], 145.0)
        self.assertEqual(written_data["rates"]["KRW"], 1300.0)

    # Test for manage_holdings.py
    @patch("scripts.portfolio.manage_holdings.record_transaction")
    @patch("scripts.portfolio.manage_holdings.save_holdings")
    @patch("scripts.portfolio.manage_holdings.load_holdings")
    def test_manage_holdings_add(
        self, mock_load_holdings, mock_save_holdings, mock_record_transaction
    ) -> None:
        # Mock the loaded holdings to be empty
        mock_load_holdings.return_value = {}

        # Mock sys.argv to simulate command line arguments for a buy command
        with patch("sys.argv", ["manage_holdings.py", "buy", "AAPL", "100", "150.0"]):
            main()

        # Assert that save_holdings was called with the correct data
        expected_holdings = {"AAPL": {"shares": Decimal("100"), "average_price": Decimal("150.0")}}
        mock_save_holdings.assert_called_once()
        # The first argument to save_holdings is the filepath, the second is the data.
        called_args, _ = mock_save_holdings.call_args
        self.assertEqual(called_args[1], expected_holdings)
        mock_record_transaction.assert_called_once()

    # Test for update_daily_pnl.py
    @patch("scripts.pnl.update_daily_pnl.datetime")
    @patch("scripts.pnl.update_daily_pnl.calculate_daily_values")
    @patch("scripts.pnl.update_daily_pnl.load_json_data")
    @patch(
        "pathlib.Path.open",
        new_callable=mock_open,
        read_data="date,value_usd\n2023-01-01,15000.0",
    )
    def test_update_daily_pnl(
        self, mock_open_file, mock_load_json, mock_calc_values, mock_datetime
    ) -> None:
        # Arrange
        mock_datetime.now.return_value = datetime(2023, 1, 2)
        mock_load_json.return_value = {"some_data": "value"}
        mock_calc_values.return_value = {"value_usd": 16000.0}

        # Act
        update_daily_pnl()

        # Assert
        handle = mock_open_file()
        all_writes = "".join(call[0][0] for call in handle.write.call_args_list)
        self.assertIn("16000.0", all_writes)

    # Test for update_fund_data.py
    @patch("scripts.data.update_fund_data.get_prices")
    @patch("scripts.data.update_fund_data.get_tickers_from_holdings")
    def test_update_fund_data(self, mock_get_tickers, mock_get_prices) -> None:
        # Arrange
        with tempfile.TemporaryDirectory() as tmpdir:
            mock_holdings_path = Path(tmpdir) / "holdings.json"
            mock_output_path = Path(tmpdir) / "output.json"

            with open(mock_holdings_path, "w") as f:
                json.dump({"AAPL": {}, "GOOG": {}}, f)

            mock_get_tickers.return_value = ["AAPL", "GOOG"]
            mock_get_prices.return_value = {"AAPL": 150.0, "GOOG": 2800.0}

            # Act
            update_fund_data(mock_holdings_path, mock_output_path)

            # Assert
            with open(mock_output_path, "r") as f:
                written_data = json.load(f)

            self.assertEqual(written_data["AAPL"], 150.0)
            self.assertEqual(written_data["GOOG"], 2800.0)

    def test_backfill_portfolio_history(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            csv_path = Path(tmpdir) / "historical_portfolio_values.csv"
            holdings_path = Path(tmpdir) / "holdings_details.json"

            csv_path.write_text(
                "date,value_usd,value_cny,value_jpy,value_krw\n"
                "2025-06-05,100.0,700.0,15000.0,130000.0\n",
                encoding="utf-8",
            )
            holdings_path.write_text(
                json.dumps(
                    {
                        "AAPL": {"shares": "10"},
                        "MSFT": {"shares": "5"},
                    }
                ),
                encoding="utf-8",
            )

            trading_days = [
                date(2025, 5, 30),
                date(2025, 6, 2),
                date(2025, 6, 3),
                date(2025, 6, 4),
            ]

            def fake_price_fetcher(tickers, dates) -> Dict[str, Dict[date, Decimal]]:
                self.assertEqual(list(tickers), ["AAPL", "MSFT"])
                self.assertEqual(list(dates), trading_days)
                return {
                    "AAPL": {
                        trading_days[0]: Decimal("188"),
                        trading_days[1]: Decimal("190"),
                        trading_days[2]: Decimal("191"),
                        trading_days[3]: Decimal("192"),
                    },
                    "MSFT": {
                        trading_days[0]: Decimal("295"),
                        trading_days[1]: Decimal("300"),
                        trading_days[2]: Decimal("310"),
                        trading_days[3]: Decimal("305"),
                    },
                }

            def fake_fx_fetcher(currencies, dates) -> Dict[date, Dict[str, Decimal]]:
                self.assertEqual(currencies, ["CNY", "JPY", "KRW"])
                self.assertEqual(list(dates), trading_days)
                base_rates = {
                    trading_days[0]: {
                        "CNY": Decimal("6.99"),
                        "JPY": Decimal("139"),
                        "KRW": Decimal("1348"),
                    },
                    trading_days[1]: {
                        "CNY": Decimal("7.00"),
                        "JPY": Decimal("140"),
                        "KRW": Decimal("1350"),
                    },
                    trading_days[2]: {
                        "CNY": Decimal("7.01"),
                        "JPY": Decimal("141"),
                        "KRW": Decimal("1351"),
                    },
                    trading_days[3]: {
                        "CNY": Decimal("7.02"),
                        "JPY": Decimal("142"),
                        "KRW": Decimal("1352"),
                    },
                }
                return {day: dict(base_rates[day]) for day in dates}

            result: BackfillResult = backfill_portfolio_history(
                date(2025, 6, 2),
                csv_path,
                holdings_path,
                price_fetcher=fake_price_fetcher,
                fx_fetcher=fake_fx_fetcher,
            )

            self.assertEqual(len(result.added_rows), 4)
            self.assertEqual(
                [row["date"] for row in result.added_rows], [d.isoformat() for d in trading_days]
            )

            with csv_path.open("r", encoding="utf-8") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(
                [row["date"] for row in rows][:4],
                ["2025-05-30", "2025-06-02", "2025-06-03", "2025-06-04"],
            )
            self.assertEqual(rows[0]["value_usd"], "3355.0000000000")
            self.assertEqual(rows[0]["value_cny"], "23451.4500000000")
            self.assertEqual(rows[1]["value_usd"], "3400.0000000000")
            self.assertEqual(rows[1]["value_cny"], "23800.0000000000")
            self.assertEqual(rows[2]["value_usd"], "3460.0000000000")
            self.assertEqual(rows[2]["value_cny"], "24254.6000000000")

    def test_backfill_includes_start_date_when_matching_earliest(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            csv_path = Path(tmpdir) / "historical_portfolio_values.csv"
            holdings_path = Path(tmpdir) / "holdings_details.json"

            csv_path.write_text(
                "date,value_usd,value_cny,value_jpy,value_krw\n"
                "2025-06-05,100.0,700.0,15000.0,130000.0\n",
                encoding="utf-8",
            )
            holdings_path.write_text(
                json.dumps({"AAPL": {"shares": "10"}}),
                encoding="utf-8",
            )

            called = {}

            def fake_price_fetcher(tickers, dates):
                called["tickers"] = list(tickers)
                called["dates"] = list(dates)
                return {
                    "AAPL": {
                        dates[0]: Decimal("180"),
                        dates[1]: Decimal("190"),
                    }
                }

            def fake_fx_fetcher(currencies, dates):
                called["currencies"] = list(currencies)
                return {
                    dates[0]: {
                        "CNY": Decimal("6.95"),
                        "JPY": Decimal("138"),
                        "KRW": Decimal("1340"),
                        "USD": Decimal("1.0"),
                    },
                    dates[1]: {
                        "CNY": Decimal("7.00"),
                        "JPY": Decimal("140"),
                        "KRW": Decimal("1350"),
                        "USD": Decimal("1.0"),
                    },
                }

            result = backfill_portfolio_history(
                date(2025, 6, 5),
                csv_path,
                holdings_path,
                price_fetcher=fake_price_fetcher,
                fx_fetcher=fake_fx_fetcher,
            )

            self.assertEqual(len(result.trading_dates), 2)
            self.assertEqual(result.trading_dates[0], date(2025, 6, 4))
            self.assertEqual(result.trading_dates[1], date(2025, 6, 5))
            self.assertEqual(called["tickers"], ["AAPL"])
            self.assertEqual(called["dates"], [date(2025, 6, 4), date(2025, 6, 5)])
            self.assertEqual(called["currencies"], ["CNY", "JPY", "KRW"])

            with csv_path.open("r", encoding="utf-8") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(rows[0]["date"], "2025-06-04")
            self.assertEqual(rows[0]["value_usd"], "1800.0000000000")


if __name__ == "__main__":
    unittest.main()
