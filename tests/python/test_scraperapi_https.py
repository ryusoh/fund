import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

# Import the functions to test
from scripts.fetch_etf_country_allocations import fetch_etf_country_allocation
from scripts.generate_pe_data import scrape_wsj_forward_pe
from scripts.update_vt_hhi import fetch_vt_hhi_from_etfrc
from scripts.update_vt_sectors import fetch_vt_sectors


class TestScraperAPIHTTPS(unittest.TestCase):
    @patch('os.environ.get')
    @patch('urllib.request.urlopen')
    def test_fetch_etf_country_allocation_https(self, mock_urlopen, mock_env_get):
        mock_env_get.return_value = 'fake_api_key'
        mock_response = MagicMock()
        mock_response.read.return_value = b'{}'
        mock_urlopen.return_value.__enter__.return_value = mock_response

        # Patch the Request object directly since urllib is used inline
        with patch('urllib.request.Request') as mock_request:
            mock_request.return_value = MagicMock()
            fetch_etf_country_allocation('VT')

            # Get the URL passed to the Request
            url_called = mock_request.call_args[0][0]
            self.assertTrue(
                url_called.startswith('https://api.scraperapi.com'),
                f"URL should start with https, got {url_called}",
            )

    @patch('os.environ.get')
    @patch('urllib.request.urlopen')
    def test_fetch_vt_hhi_from_etfrc_https(self, mock_urlopen, mock_env_get):
        mock_env_get.return_value = 'fake_api_key'
        mock_response = MagicMock()
        mock_response.read.return_value = b'<td>HHI</td><td>62</td>'
        mock_urlopen.return_value.__enter__.return_value = mock_response

        with patch('urllib.request.Request') as mock_request:
            mock_request.return_value = MagicMock()
            fetch_vt_hhi_from_etfrc()

            url_called = mock_request.call_args[0][0]
            self.assertTrue(
                url_called.startswith('https://api.scraperapi.com'),
                f"URL should start with https, got {url_called}",
            )

    @patch('os.environ.get')
    @patch('urllib.request.urlopen')
    def test_fetch_vt_sectors_https(self, mock_urlopen, mock_env_get):
        mock_env_get.return_value = 'fake_api_key'
        mock_response = MagicMock()
        mock_response.read.return_value = b'allocationChartData:{sectors:[]'
        mock_urlopen.return_value.__enter__.return_value = mock_response

        with patch('urllib.request.Request') as mock_request:
            mock_request.return_value = MagicMock()
            fetch_vt_sectors()

            url_called = mock_request.call_args[0][0]
            self.assertTrue(
                url_called.startswith('https://api.scraperapi.com'),
                f"URL should start with https, got {url_called}",
            )

    @patch('os.environ.get')
    @patch('urllib.request.urlopen')
    def test_scrape_wsj_forward_pe_https(self, mock_urlopen, mock_env_get):
        mock_env_get.return_value = 'fake_api_key'
        mock_response = MagicMock()
        mock_response.read.return_value = b'P 500 Index priceEarningsRatioEstimate: 10'
        # scrape_wsj_forward_pe does not use context manager
        mock_urlopen.return_value = mock_response

        with patch('urllib.request.Request') as mock_request:
            mock_request.return_value = MagicMock()
            scrape_wsj_forward_pe()

            url_called = mock_request.call_args[0][0]
            self.assertTrue(
                url_called.startswith('https://api.scraperapi.com'),
                f"URL should start with https, got {url_called}",
            )


if __name__ == '__main__':
    unittest.main()
