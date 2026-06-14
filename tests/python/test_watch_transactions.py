import unittest
from unittest.mock import MagicMock, patch, call
from pathlib import Path
import runpy
import sys

from scripts.watch_transactions import run_make, poll, WATCH_PATHS, MAKE_TARGET
import scripts.watch_transactions as wt

class TestWatchTransactions(unittest.TestCase):
    @patch('scripts.watch_transactions.subprocess.call')
    def test_run_make(self, mock_call):
        mock_call.return_value = 0
        result = run_make("test-target")
        mock_call.assert_called_once_with(['make', 'test-target'])
        self.assertEqual(result, 0)

    @patch('scripts.watch_transactions.time.sleep')
    @patch('scripts.watch_transactions.run_make')
    @patch('scripts.watch_transactions.Path.stat')
    @patch('scripts.watch_transactions.Path.exists')
    def test_poll_detects_changes(self, mock_exists, mock_stat, mock_run_make, mock_sleep):
        mock_exists.return_value = True

        mock_stat_results = [
            MagicMock(st_mtime=100), MagicMock(st_mtime=200),  # init
            MagicMock(st_mtime=101), MagicMock(st_mtime=200),  # first iteration (change in first file)
        ]
        mock_stat.side_effect = mock_stat_results

        mock_sleep.side_effect = KeyboardInterrupt()

        with patch('builtins.print') as mock_print:
            poll(5.0)

        mock_run_make.assert_called_once_with(MAKE_TARGET)
        mock_sleep.assert_called_once_with(5.0)

    @patch('scripts.watch_transactions.time.sleep')
    @patch('scripts.watch_transactions.run_make')
    @patch('scripts.watch_transactions.Path.stat')
    @patch('scripts.watch_transactions.Path.exists')
    def test_poll_file_not_found(self, mock_exists, mock_stat, mock_run_make, mock_sleep):
        mock_exists.return_value = False

        mock_stat.side_effect = FileNotFoundError()
        mock_sleep.side_effect = KeyboardInterrupt()

        with patch('builtins.print') as mock_print:
            poll(5.0)

        mock_run_make.assert_not_called()

    @patch('scripts.watch_transactions.poll')
    def test_main(self, mock_poll):
        with patch.object(sys, 'argv', ['watch_transactions.py', '--interval', '10.0']):
            wt.main()
        mock_poll.assert_called_once_with(interval=10.0)

    def test_main_block(self):
        with patch.object(sys, 'argv', ['watch_transactions.py', '--interval', '10.0']):
            with patch('time.sleep', side_effect=KeyboardInterrupt()):
                runpy.run_path("scripts/watch_transactions.py", run_name="__main__")

if __name__ == '__main__':
    unittest.main()
