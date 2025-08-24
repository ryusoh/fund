import unittest
from unittest.mock import patch, mock_open, MagicMock
import json
import pandas as pd
from datetime import datetime
from decimal import Decimal
from pathlib import Path
import tempfile

# Assuming your scripts are in a package or your PYTHONPATH is set up correctly
from scripts.extract_pnl_history import main as process_pnl_history
from scripts.fetch_forex import fetch_forex_data
from scripts.manage_holdings import main
from scripts.update_daily_pnl import main as update_daily_pnl
from scripts.update_fund_data import main as update_fund_data

class TestFundScripts(unittest.TestCase):

    # Test for extract_pnl_history.py
    @patch('scripts.extract_pnl_history.pd.DataFrame.to_csv')
    @patch('scripts.extract_pnl_history.get_file_content_at_commit')
    @patch('scripts.extract_pnl_history.get_commit_history_for_file')
    def test_process_pnl_history(self, mock_get_history, mock_get_content, mock_to_csv):
        # Arrange
        mock_get_history.return_value = [(1672531200, 'hash1'), (1672617600, 'hash2')]
        mock_get_content.side_effect = [
            {'AAPL': {'shares': 100}},  # holdings at hash1
            {'data': [{'ticker': 'AAPL', 'price': 150, 'currency': 'USD'}]}, # fund_data at hash1
            {'rates': {'USD': 1.0}}, # forex at hash1
            {'AAPL': {'shares': 120}},  # holdings at hash2
            {'data': [{'ticker': 'AAPL', 'price': 155, 'currency': 'USD'}]}, # fund_data at hash2
            {'rates': {'USD': 1.0}}, # forex at hash2
        ]

        # Act
        process_pnl_history()

        # Assert
        self.assertEqual(mock_to_csv.call_count, 1)
        # The first argument of to_csv is the path
        path_arg = mock_to_csv.call_args[0][0]
        self.assertEqual(path_arg.name, 'historical_portfolio_values.csv')


    # Test for fetch_forex.py
    @patch('scripts.fetch_forex.yf.Ticker')
    @patch('builtins.open', new_callable=mock_open)
    def test_fetch_forex_data(self, mock_file, mock_yf_ticker):
        # Mocking the yfinance Ticker
        mock_cny = MagicMock()
        mock_cny.history.return_value = pd.DataFrame({'Close': [7.2]})
        mock_jpy = MagicMock()
        mock_jpy.history.return_value = pd.DataFrame({'Close': [145.0]})
        mock_krw = MagicMock()
        mock_krw.history.return_value = pd.DataFrame({'Close': [1300.0]})
        
        def ticker_side_effect(symbol):
            if symbol == 'USDCNY=X':
                return mock_cny
            if symbol == 'USDJPY=X':
                return mock_jpy
            if symbol == 'USDKRW=X':
                return mock_krw
            return MagicMock()

        mock_yf_ticker.side_effect = ticker_side_effect

        # Run the function
        fetch_forex_data()

        # Assert that the file was written to
        handle = mock_file()
        all_writes = ''.join(c[0][0] for c in handle.write.call_args_list)
        written_data = json.loads(all_writes)

        self.assertEqual(written_data['rates']['CNY'], 7.2)
        self.assertEqual(written_data['rates']['JPY'], 145.0)
        self.assertEqual(written_data['rates']['KRW'], 1300.0)


    # Test for manage_holdings.py
    @patch('scripts.manage_holdings.save_holdings')
    @patch('scripts.manage_holdings.load_holdings')
    def test_manage_holdings_add(self, mock_load_holdings, mock_save_holdings):
        # Mock the loaded holdings to be empty
        mock_load_holdings.return_value = {}

        # Mock sys.argv to simulate command line arguments for a buy command
        with patch('sys.argv', ['manage_holdings.py', 'buy', 'AAPL', '100', '150.0']):
            main()

        # Assert that save_holdings was called with the correct data
        expected_holdings = {
            'AAPL': {
                'shares': Decimal('100'),
                'average_price': Decimal('150.0')
            }
        }
        mock_save_holdings.assert_called_once()
        # The first argument to save_holdings is the filepath, the second is the data.
        called_args, _ = mock_save_holdings.call_args
        self.assertEqual(called_args[1], expected_holdings)

    # Test for update_daily_pnl.py
    @patch('scripts.update_daily_pnl.datetime')
    @patch('scripts.update_daily_pnl.calculate_daily_values')
    @patch('scripts.update_daily_pnl.load_json_data')
    @patch('pathlib.Path.open', new_callable=mock_open, read_data="date,value_usd\n2023-01-01,15000.0")
    def test_update_daily_pnl(self, mock_open_file, mock_load_json, mock_calc_values, mock_datetime):
        # Arrange
        mock_datetime.now.return_value = datetime(2023, 1, 2)
        mock_load_json.return_value = {'some_data': 'value'}
        mock_calc_values.return_value = {'value_usd': 16000.0}

        # Act
        update_daily_pnl()

        # Assert
        handle = mock_open_file()
        all_writes = ''.join(call[0][0] for call in handle.write.call_args_list)
        self.assertIn('16000.0', all_writes)

    # Test for update_fund_data.py
    @patch('scripts.update_fund_data.get_prices')
    @patch('scripts.update_fund_data.get_tickers_from_holdings')
    def test_update_fund_data(self, mock_get_tickers, mock_get_prices):
        # Arrange
        with tempfile.TemporaryDirectory() as tmpdir:
            mock_holdings_path = Path(tmpdir) / 'holdings.json'
            mock_output_path = Path(tmpdir) / 'output.json'

            with open(mock_holdings_path, 'w') as f:
                json.dump({'AAPL': {}, 'GOOG': {}}, f)

            mock_get_tickers.return_value = ['AAPL', 'GOOG']
            mock_get_prices.return_value = {'AAPL': 150.0, 'GOOG': 2800.0}

            # Act
            update_fund_data(mock_holdings_path, mock_output_path)

            # Assert
            with open(mock_output_path, 'r') as f:
                written_data = json.load(f)
            
            self.assertEqual(written_data['AAPL'], 150.0)
            self.assertEqual(written_data['GOOG'], 2800.0)

if __name__ == '__main__':
    unittest.main()