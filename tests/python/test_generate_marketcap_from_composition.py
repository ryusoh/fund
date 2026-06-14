import unittest
from unittest.mock import mock_open, patch

from scripts.generate_marketcap_from_composition import main


class TestGenerateMarketcapFromComposition(unittest.TestCase):
    def test_missing_composition_file(self):
        with patch('scripts.generate_marketcap_from_composition.Path.exists', return_value=False):
            with patch('builtins.print') as mock_print:
                result = main()
                self.assertTrue(result)
                mock_print.assert_any_call("⚠ data/output/figures/composition.json not found, skipping market cap generation")

    def test_missing_fund_mc_file(self):
        with patch('scripts.generate_marketcap_from_composition.Path.exists') as mock_exists:
            # First call for composition.json returns True, second for fund_marketcap_breakdown.json returns False
            mock_exists.side_effect = [True, False, False]
            with patch('builtins.open', mock_open(read_data='{"dates": [], "series": {}, "total_values": []}')):
                with patch('builtins.print') as mock_print:
                    result = main()
                    self.assertTrue(result)
                    mock_print.assert_any_call("⚠ data/fund_marketcap_breakdown.json not found, skipping market cap generation")

    @patch('scripts.generate_marketcap_from_composition.Path.exists')
    @patch('scripts.generate_marketcap_from_composition.Path.mkdir')
    def test_main_processing(self, mock_mkdir, mock_exists):
        mock_exists.return_value = True

        composition_data = {
            'dates': ['2023-01-01', '2023-01-02'],
            'total_values': [100, 200],
            'series': {
                'CASH': [10, 20],
                'VT': [50, 50],
                'AAPL': [40, 40],
                'GOOGL': [0, 90],
                'MSFT': [0, 0],
                'UNKNOWN': [10, 10]
            }
        }
        fund_mc_data = {
            'VT': {
                'Mega Cap': 50,
                'Large Cap': 30,
                'Mid Cap': 20,
                '_private': 100
            }
        }
        market_caps_data = {
            'AAPL': 2500 * 1e9,  # Mega Cap
            'GOOGL': 15 * 1e9,   # Large Cap
            'MID': 5 * 1e9,      # Mid Cap
            'SML': 1 * 1e9,      # Small Cap
            'TINY': 0.1 * 1e9    # Cash/Other
        }

        def mock_json_load(f):
            if "composition.json" in f.name:
                return composition_data
            elif "fund_marketcap_breakdown.json" in f.name:
                return fund_mc_data
            elif "market_caps.json" in f.name:
                return market_caps_data
            return {}

        def mock_open_side_effect(file, mode='r', **kwargs):
            m = mock_open()()
            m.name = str(file)
            return m

        with patch('builtins.open', side_effect=mock_open_side_effect):
            with patch('json.load', side_effect=mock_json_load):
                with patch('json.dump') as mock_json_dump:
                    with patch('builtins.print'):
                        result = main()
                        self.assertTrue(result)

                        mock_json_dump.assert_called_once()
                        output_data = mock_json_dump.call_args[0][0]
                        self.assertEqual(output_data['dates'], ['2023-01-01', '2023-01-02'])
                        self.assertEqual(output_data['total_values'], [100, 200])

                        self.assertEqual(output_data['series']['Mega Cap'], [65.0, 65.0])
                        self.assertEqual(output_data['series']['Large Cap'], [25.0, 115.0])
                        self.assertEqual(output_data['series']['Mid Cap'], [10.0, 10.0])
                        self.assertEqual(output_data['series']['Cash/Other'], [10.0, 20.0])

    @patch('scripts.generate_marketcap_from_composition.Path.exists')
    @patch('scripts.generate_marketcap_from_composition.Path.mkdir')
    def test_market_cap_tiers(self, mock_mkdir, mock_exists):
        mock_exists.return_value = True

        composition_data = {
            'dates': ['2023-01-01'],
            'total_values': [100],
            'series': {
                'MID': [10],
                'SML': [10],
                'TINY': [10]
            }
        }
        fund_mc_data = {}
        market_caps_data = {
            'MID': 5 * 1e9,      # Mid Cap
            'SML': 1 * 1e9,      # Small Cap
            'TINY': 0.1 * 1e9    # Cash/Other
        }

        def mock_json_load(f):
            if "composition.json" in f.name:
                return composition_data
            elif "fund_marketcap_breakdown.json" in f.name:
                return fund_mc_data
            elif "market_caps.json" in f.name:
                return market_caps_data
            return {}

        def mock_open_side_effect(file, mode='r', **kwargs):
            m = mock_open()()
            m.name = str(file)
            return m

        with patch('builtins.open', side_effect=mock_open_side_effect):
            with patch('json.load', side_effect=mock_json_load):
                with patch('json.dump') as mock_json_dump:
                    with patch('builtins.print'):
                        main()
                        output_data = mock_json_dump.call_args[0][0]
                        self.assertEqual(output_data['series']['Mid Cap'], [10.0])
                        self.assertEqual(output_data['series']['Small Cap'], [10.0])
                        self.assertEqual(output_data['series']['Cash/Other'], [10.0])

    def test_exec_main(self):
        with open('scripts/generate_marketcap_from_composition.py', 'r') as f:
            code = f.read()

        namespace = {'__name__': '__main__'}

        with patch('sys.exit') as mock_exit:
            with patch('scripts.generate_marketcap_from_composition.Path.exists', return_value=False):
                with patch('builtins.print'):
                    exec(code, namespace)
            mock_exit.assert_called_with(0)

        with patch('sys.exit') as mock_exit:
            with patch('builtins.print'):
                # Force failure return
                code_replace_main = code.replace("success = main()", "success = False")
                exec(code_replace_main, namespace)
            mock_exit.assert_called_with(1)

        with patch('sys.exit') as mock_exit:
            with patch('scripts.generate_marketcap_from_composition.Path.exists', side_effect=Exception("Test Exception")):
                with patch('builtins.print') as mock_print:
                    try:
                        exec(code, namespace)
                    except Exception:
                        pass
                    mock_exit.assert_called_with(0)
                    mock_print.assert_any_call("⚠ Market cap generation failed: Test Exception")

if __name__ == '__main__':
    unittest.main()
