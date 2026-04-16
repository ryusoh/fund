import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pandas as pd

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from scripts.prepare_frontend_data import prepare_historical_prices  # noqa: E402


class TestPrepareFrontendData(unittest.TestCase):

    @patch('scripts.prepare_frontend_data.os.path.exists')
    def test_prepare_historical_prices_missing_parquet(self, mock_exists):
        # mock_exists returns False so it should exit early
        mock_exists.return_value = False
        with patch('builtins.print') as mock_print:
            prepare_historical_prices()
            mock_print.assert_called_once()
            self.assertIn("not found", mock_print.call_args[0][0])

    @patch('scripts.prepare_frontend_data.os.path.exists')
    @patch('scripts.prepare_frontend_data.os.environ.get')
    def test_prepare_historical_prices_skip_rebuild(self, mock_env_get, mock_exists):
        # exists logic:
        # 1. prices_path exists
        # 2. output_path exists
        mock_exists.side_effect = [True, True]
        mock_env_get.return_value = '0'  # Not 1

        with patch('builtins.print') as mock_print:
            prepare_historical_prices()
            mock_print.assert_called_once()
            self.assertIn("already exists; skipping rebuild", mock_print.call_args[0][0])

    @patch('scripts.prepare_frontend_data.os.path.exists')
    @patch('scripts.prepare_frontend_data.os.environ.get')
    @patch('scripts.prepare_frontend_data.pd.read_parquet')
    @patch('builtins.open', new_callable=unittest.mock.mock_open)
    def test_prepare_historical_prices_success(
        self, mock_file, mock_read_parquet, mock_env_get, mock_exists
    ):
        # path logic:
        # 1. prices_path -> True
        # 2. output_path -> False
        # 3. overrides_path -> False
        mock_exists.side_effect = [True, False, False]
        mock_env_get.return_value = '0'

        df_prices = pd.DataFrame(
            {
                'index': pd.to_datetime(['2023-01-01', '2023-01-02']),
                'AAPL': [150.0, 151.0],
                'BRKB': [300.0, 301.0],  # Alias check
                'MISSING': [np.nan, np.nan],  # Null handling
            }
        ).set_index('index')

        mock_read_parquet.return_value = df_prices

        prepare_historical_prices()

        # Extract JSON written
        mock_file().write.assert_called()
        written_data = ""
        for call in mock_file().write.call_args_list:
            written_data += call[0][0]

        parsed = json.loads(written_data)

        # AAPL
        self.assertIn('AAPL', parsed)
        self.assertEqual(parsed['AAPL']['2023-01-01'], 150.0)

        # BRK-B
        self.assertIn('BRK-B', parsed)
        self.assertNotIn('BRKB', parsed)
        self.assertEqual(parsed['BRK-B']['2023-01-01'], 300.0)

        # MISSING
        self.assertNotIn('MISSING', parsed)



    @patch('scripts.prepare_frontend_data.os.path.exists')
    @patch('scripts.prepare_frontend_data.os.environ.get')
    @patch('scripts.prepare_frontend_data.pd.read_parquet')
    @patch('builtins.open', new_callable=unittest.mock.mock_open)
    def test_overrides_path_exists(
        self, mock_file, mock_read_parquet, mock_env_get, mock_exists
    ):
        mock_exists.side_effect = lambda x: 'historical_prices.json' not in str(x)
        mock_env_get.return_value = '1'

        df_prices = pd.DataFrame(
            {
                'index': pd.to_datetime(['2023-01-01']),
                'AAPL': [150.0],
            }
        ).set_index('index')

        df_overrides = pd.DataFrame(
            {
                'date': pd.to_datetime(['2023-01-01']),
                'ticker': ['AAPL'],
                'adj_close': [155.0]
            }
        )

        mock_read_parquet.side_effect = [df_prices, df_overrides]

        prepare_historical_prices()

if __name__ == '__main__':
    unittest.main()
