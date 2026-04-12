import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from scripts.test_wsj_scrape import scrape_wsj_forward_pe  # noqa: E402


class TestWSJScrape(unittest.TestCase):
    @patch('scripts.test_wsj_scrape.requests.get')
    def test_scrape_wsj_forward_pe_direct_regex(self, mock_get):
        mock_response = MagicMock()
        mock_response.text = 'P 500 Index "priceEarningsRatioEstimate": "20.5"'
        mock_get.return_value = mock_response

        result = scrape_wsj_forward_pe()
        self.assertEqual(result, 20.5)

    @patch('scripts.test_wsj_scrape.requests.get')
    def test_scrape_wsj_forward_pe_block_search(self, mock_get):
        mock_response = MagicMock()
        # Padding content so direct regex match fails on distance
        # Need to put the match close to P 500 Index in the second occurrence
        padding = "X" * 1500
        mock_response.text = (
            f'P 500 Index {padding} P 500 Index "priceEarningsRatioEstimate": "21.5"'
        )
        mock_get.return_value = mock_response

        result = scrape_wsj_forward_pe()
        self.assertEqual(result, 21.5)

    @patch('scripts.test_wsj_scrape.requests.get')
    def test_scrape_wsj_forward_pe_no_match(self, mock_get):
        mock_response = MagicMock()
        mock_response.text = 'No data here'
        mock_get.return_value = mock_response

        result = scrape_wsj_forward_pe()
        self.assertIsNone(result)

    @patch('scripts.test_wsj_scrape.requests.get')
    def test_scrape_wsj_forward_pe_exception(self, mock_get):
        mock_get.side_effect = Exception("Test exception")

        result = scrape_wsj_forward_pe()
        self.assertIsNone(result)


if __name__ == '__main__':
    unittest.main()
