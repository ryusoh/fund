import unittest
from unittest.mock import patch, mock_open, MagicMock
import json
import sys
from pathlib import Path

# Add scripts directory to path to import update_vt_marketcap
sys.path.append(str(Path(__file__).resolve().parent.parent.parent))
import scripts.update_vt_marketcap as update_vt_marketcap

class TestUpdateVTMarketcap(unittest.TestCase):

    @patch('scripts.update_vt_marketcap.Path.exists')
    @patch('builtins.open', new_callable=mock_open, read_data='{"existing": "data"}')
    def test_load_fund_breakdowns_exists(self, mock_file, mock_exists):
        mock_exists.return_value = True
        result = update_vt_marketcap.load_fund_breakdowns()
        self.assertEqual(result, {"existing": "data"})
        mock_file.assert_called_once_with(Path('data/fund_marketcap_breakdown.json'), 'r')

    @patch('scripts.update_vt_marketcap.Path.exists')
    def test_load_fund_breakdowns_not_exists(self, mock_exists):
        mock_exists.return_value = False
        result = update_vt_marketcap.load_fund_breakdowns()
        self.assertEqual(result, {})

    @patch('builtins.open', new_callable=mock_open)
    @patch('json.dump')
    def test_save_fund_breakdowns(self, mock_json_dump, mock_file):
        test_data = {"test": "data"}
        update_vt_marketcap.save_fund_breakdowns(test_data)
        mock_file.assert_called_once_with(Path('data/fund_marketcap_breakdown.json'), 'w')
        mock_json_dump.assert_called_once_with(test_data, mock_file(), indent=2)

    @patch('scripts.update_vt_marketcap.load_fund_breakdowns')
    @patch('scripts.update_vt_marketcap.save_fund_breakdowns')
    def test_update_vt_marketcap(self, mock_save, mock_load):
        mock_load.return_value = {"other": "data"}
        result = update_vt_marketcap.update_vt_marketcap()
        self.assertTrue(result)
        mock_load.assert_called_once()
        mock_save.assert_called_once()
        saved_data = mock_save.call_args[0][0]
        self.assertEqual(saved_data['other'], "data")
        self.assertIn('VT', saved_data)
        self.assertEqual(saved_data['VT'], update_vt_marketcap.VT_MARKETCAP_BREAKDOWN)

    @patch('scripts.update_vt_marketcap.update_vt_marketcap')
    @patch('sys.exit')
    def test_main_success(self, mock_exit, mock_update):
        mock_update.return_value = True
        update_vt_marketcap.main()
        mock_exit.assert_called_once_with(0)

    @patch('scripts.update_vt_marketcap.update_vt_marketcap')
    @patch('sys.exit')
    def test_main_failure(self, mock_exit, mock_update):
        mock_update.return_value = False
        update_vt_marketcap.main()
        mock_exit.assert_called_once_with(1)

    @patch('scripts.update_vt_marketcap.update_vt_marketcap')
    @patch('sys.exit')
    def test_main_exception(self, mock_exit, mock_update):
        mock_update.side_effect = Exception("Test Exception")
        update_vt_marketcap.main()
        mock_exit.assert_called_once_with(0)

if __name__ == '__main__':
    unittest.main()
