import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

# Import the functions to test
from scripts.fetch_etf_country_allocations import fetch_etf_country_allocation  # noqa: E402
from scripts.generate_pe_data import scrape_wsj_forward_pe  # noqa: E402
from scripts.update_vt_hhi import fetch_vt_hhi_from_etfrc  # noqa: E402
from scripts.update_vt_sectors import fetch_vt_sectors  # noqa: E402


class TestScraperAPIHTTPS(unittest.TestCase):
    @patch('os.environ.get')
    @patch('requests.get')
    def test_fetch_etf_country_allocation_https(self, mock_get, mock_env_get):
        mock_env_get.return_value = 'fake_api_key'
        mock_response = MagicMock()
        mock_response.text = '{}'
        mock_get.return_value = mock_response

        fetch_etf_country_allocation('VT')

        url_called = mock_get.call_args[0][0]
        self.assertTrue(
            url_called.startswith('https://api.scraperapi.com'),
            f"URL should start with https, got {url_called}",
        )

    @patch('os.environ.get')
    @patch('requests.get')
    def test_fetch_vt_hhi_from_etfrc_https(self, mock_get, mock_env_get):
        mock_env_get.return_value = 'fake_api_key'
        mock_response = MagicMock()
        mock_response.text = '<td>HHI</td><td>62</td>'
        mock_get.return_value = mock_response

        fetch_vt_hhi_from_etfrc()

        url_called = mock_get.call_args[0][0]
        self.assertTrue(
            url_called.startswith('https://api.scraperapi.com'),
            f"URL should start with https, got {url_called}",
        )

    @patch('os.environ.get')
    @patch('requests.get')
    def test_fetch_vt_sectors_https(self, mock_get, mock_env_get):
        mock_env_get.return_value = 'fake_api_key'
        mock_response = MagicMock()
        mock_response.text = 'allocationChartData:{sectors:[]'
        mock_get.return_value = mock_response

        fetch_vt_sectors()

        url_called = mock_get.call_args[0][0]
        self.assertTrue(
            url_called.startswith('https://api.scraperapi.com'),
            f"URL should start with https, got {url_called}",
        )

    @patch('os.environ.get')
    @patch('requests.get')
    def test_scrape_wsj_forward_pe_https(self, mock_get, mock_env_get):
        mock_env_get.return_value = 'fake_api_key'
        mock_response = MagicMock()
        mock_response.text = 'P 500 Index priceEarningsRatioEstimate: 10'
        mock_get.return_value = mock_response

        scrape_wsj_forward_pe()

        url_called = mock_get.call_args[0][0]
        self.assertTrue(
            url_called.startswith('https://api.scraperapi.com'),
            f"URL should start with https, got {url_called}",
        )


if __name__ == '__main__':
    unittest.main()
