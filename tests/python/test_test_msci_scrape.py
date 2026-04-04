import sys
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from scripts.test_msci_scrape import scrape_msci_pe_data

class TestMSCIScrape(unittest.TestCase):
    @patch('scripts.test_msci_scrape.requests.get')
    def test_scrape_msci_pe_data_both(self, mock_get):
        mock_response = MagicMock()
        mock_response.text = 'P/E Fwd 15.0  Some text P/E 20.0'
        mock_get.return_value = mock_response

        result = scrape_msci_pe_data()
        self.assertIsNotNone(result)
        self.assertEqual(result['forward_pe'], 15.0)
        self.assertEqual(result['trailing_pe'], 20.0)
        self.assertEqual(result['ratio'], 1.3333)

    @patch('scripts.test_msci_scrape.requests.get')
    def test_scrape_msci_pe_data_fwd_only(self, mock_get):
        mock_response = MagicMock()
        mock_response.text = 'P/E Fwd 15.0'
        mock_get.return_value = mock_response

        result = scrape_msci_pe_data()
        self.assertIsNotNone(result)
        self.assertEqual(result['forward_pe'], 15.0)
        self.assertNotIn('trailing_pe', result)
        self.assertNotIn('ratio', result)

    @patch('scripts.test_msci_scrape.requests.get')
    def test_scrape_msci_pe_data_no_match(self, mock_get):
        mock_response = MagicMock()
        mock_response.text = 'No PE data here'
        mock_get.return_value = mock_response

        result = scrape_msci_pe_data()
        self.assertIsNone(result)

    @patch('scripts.test_msci_scrape.requests.get')
    def test_scrape_msci_pe_data_exception(self, mock_get):
        mock_get.side_effect = Exception("Test Exception")

        with self.assertRaises(Exception):
            scrape_msci_pe_data()

if __name__ == '__main__':
    unittest.main()
