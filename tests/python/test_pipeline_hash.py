import sys
from pathlib import Path
import unittest
from unittest.mock import patch, MagicMock

project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from scripts.pipeline_hash import compute_hash, save_hash, main

class TestPipelineHash(unittest.TestCase):
    @patch('scripts.pipeline_hash.date')
    @patch('scripts.pipeline_hash.Path.exists')
    @patch('scripts.pipeline_hash.Path.open')
    def test_compute_hash(self, mock_open, mock_exists, mock_date):
        mock_date.today.return_value.isoformat.return_value = '2023-01-01'
        mock_exists.return_value = True
        mock_file = MagicMock()
        mock_file.read.side_effect = [b'chunk1', b'chunk2', b'']
        mock_open.return_value.__enter__.return_value = mock_file

        path_mock = MagicMock()
        path_mock.exists.return_value = True
        path_mock.open.return_value.__enter__.return_value = mock_file
        hash_val = compute_hash([path_mock])
        self.assertIsInstance(hash_val, str)
        self.assertEqual(len(hash_val), 64)

    def test_compute_hash_missing_file(self):
        path_mock = MagicMock()
        path_mock.exists.return_value = False
        with self.assertRaises(FileNotFoundError):
            compute_hash([path_mock])

    @patch('scripts.pipeline_hash.HASH_PATH')
    def test_save_hash(self, mock_hash_path):
        save_hash("test_hash")
        mock_hash_path.parent.mkdir.assert_called_once()
        mock_hash_path.write_text.assert_called_once_with("test_hash\n", encoding="utf-8")

    @patch('scripts.pipeline_hash.argparse.ArgumentParser.parse_args')
    @patch('scripts.pipeline_hash.compute_hash')
    @patch('scripts.pipeline_hash.save_hash')
    def test_main(self, mock_save, mock_compute, mock_parse):
        args = MagicMock()
        args.write = True
        mock_parse.return_value = args
        mock_compute.return_value = "hash_val"

        main()
        mock_compute.assert_called_once()
        mock_save.assert_called_once_with("hash_val")

    @patch('scripts.pipeline_hash.argparse.ArgumentParser.parse_args')
    @patch('scripts.pipeline_hash.compute_hash')
    @patch('scripts.pipeline_hash.save_hash')
    def test_main_no_write(self, mock_save, mock_compute, mock_parse):
        args = MagicMock()
        args.write = False
        mock_parse.return_value = args
        mock_compute.return_value = "hash_val"

        main()
        mock_compute.assert_called_once()
        mock_save.assert_not_called()

if __name__ == '__main__':
    unittest.main()
