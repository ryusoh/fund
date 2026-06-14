import runpy
import unittest
from unittest.mock import ANY, MagicMock, patch

from scripts.dev_server import NoCacheHandler


class TestDevServer(unittest.TestCase):
    @patch('http.server.SimpleHTTPRequestHandler.end_headers')
    def test_nocachehandler_end_headers(self, mock_super_end_headers):
        with patch('http.server.SimpleHTTPRequestHandler.__init__', return_value=None):
            handler = NoCacheHandler(None, None, None)
            handler.send_header = MagicMock()
            handler.end_headers()

            handler.send_header.assert_called_with(
                "Cache-Control", "no-store, no-cache, must-revalidate, max-age=0"
            )
            mock_super_end_headers.assert_called_once()

    @patch('scripts.dev_server.http.server.ThreadingHTTPServer')
    @patch('sys.argv', ['dev_server.py'])
    def test_main_default_port(self, mock_server):
        mock_server_instance = MagicMock()
        mock_server.return_value.__enter__.return_value = mock_server_instance

        with patch('builtins.print') as mock_print:
            runpy.run_path("scripts/dev_server.py", run_name="__main__")

        mock_server.assert_called_with(("127.0.0.1", 8000), ANY)
        self.assertEqual(mock_server.call_args[0][1].__name__, "NoCacheHandler")
        mock_server_instance.serve_forever.assert_called_once()
        mock_print.assert_called_with("Dev server at http://127.0.0.1:8000  (no-cache)")

    @patch('scripts.dev_server.http.server.ThreadingHTTPServer')
    @patch('sys.argv', ['dev_server.py', '9000'])
    def test_main_custom_port(self, mock_server):
        mock_server_instance = MagicMock()
        mock_server.return_value.__enter__.return_value = mock_server_instance

        with patch('builtins.print') as mock_print:
            runpy.run_path("scripts/dev_server.py", run_name="__main__")

        mock_server.assert_called_with(("127.0.0.1", 9000), ANY)
        self.assertEqual(mock_server.call_args[0][1].__name__, "NoCacheHandler")
        mock_server_instance.serve_forever.assert_called_once()
        mock_print.assert_called_with("Dev server at http://127.0.0.1:9000  (no-cache)")


if __name__ == '__main__':
    unittest.main()
