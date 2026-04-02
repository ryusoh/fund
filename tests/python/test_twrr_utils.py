import unittest
from unittest.mock import patch, mock_open, MagicMock
import json
import sys
from pathlib import Path
from datetime import datetime, timezone

# Add scripts directory to path to import twrr utils
sys.path.append(str(Path(__file__).resolve().parent.parent.parent))
import scripts.twrr.utils as twrr_utils

class TestTwrrUtils(unittest.TestCase):

    @patch('pathlib.Path.exists')
    def test_load_delisted_tickers_not_exists(self, mock_exists):
        mock_exists.return_value = False
        result = twrr_utils.load_delisted_tickers()
        self.assertEqual(result, frozenset())

    @patch('pathlib.Path.exists')
    @patch('pathlib.Path.open', new_callable=mock_open)
    @patch('csv.DictReader')
    def test_load_delisted_tickers_exists(self, mock_csv_reader, mock_file, mock_exists):
        mock_exists.return_value = True
        mock_csv_reader.return_value = [
            {"ticker": "AAPL "},
            {"ticker": " TSLA"},
            {"ticker": ""},
            {"other_col": "value"}
        ]
        result = twrr_utils.load_delisted_tickers()
        self.assertEqual(result, frozenset(["AAPL", "TSLA"]))
        mock_file.assert_called_once_with("r", encoding="utf-8")

    @patch('pathlib.Path.exists')
    @patch('pathlib.Path.open', new_callable=mock_open)
    @patch('json.load')
    @patch('json.dump')
    def test_append_changelog_entry_not_exists(self, mock_json_dump, mock_json_load, mock_file, mock_exists):
        mock_exists.return_value = False

        twrr_utils.append_changelog_entry("test_step", ["artifact1"], "test notes")

        # open should be called once for writing since file doesn't exist
        mock_file.assert_called_once_with("w", encoding="utf-8")
        mock_json_load.assert_not_called()

        # Verify JSON structure
        args, kwargs = mock_json_dump.call_args
        changelog = args[0]
        self.assertEqual(len(changelog), 1)
        self.assertEqual(changelog[0]["step"], "test_step")
        self.assertEqual(changelog[0]["artifacts"], ["artifact1"])
        self.assertEqual(changelog[0]["notes"], "test notes")
        self.assertIn("timestamp", changelog[0])

    @patch('pathlib.Path.exists')
    @patch('pathlib.Path.open', new_callable=mock_open)
    @patch('json.load')
    @patch('json.dump')
    def test_append_changelog_entry_exists(self, mock_json_dump, mock_json_load, mock_file, mock_exists):
        mock_exists.return_value = True
        existing_log = [{"step": "old_step", "artifacts": [], "notes": "old notes"}]
        mock_json_load.return_value = existing_log

        twrr_utils.append_changelog_entry("new_step", ["artifact2"])

        self.assertEqual(mock_file.call_count, 2)
        mock_json_load.assert_called_once()

        args, kwargs = mock_json_dump.call_args
        changelog = args[0]
        self.assertEqual(len(changelog), 2)
        self.assertEqual(changelog[0]["step"], "old_step")
        self.assertEqual(changelog[1]["step"], "new_step")
        self.assertEqual(changelog[1]["artifacts"], ["artifact2"])
        self.assertEqual(changelog[1]["notes"], "")

    @patch('pathlib.Path.exists')
    @patch('pathlib.Path.open', new_callable=mock_open)
    @patch('json.load')
    @patch('json.dump')
    def test_append_changelog_entry_exists_invalid_json(self, mock_json_dump, mock_json_load, mock_file, mock_exists):
        mock_exists.return_value = True
        mock_json_load.side_effect = json.JSONDecodeError("Expecting value", "", 0)

        twrr_utils.append_changelog_entry("new_step", ["artifact2"])

        args, kwargs = mock_json_dump.call_args
        changelog = args[0]
        self.assertEqual(len(changelog), 1)
        self.assertEqual(changelog[0]["step"], "new_step")

if __name__ == '__main__':
    unittest.main()
