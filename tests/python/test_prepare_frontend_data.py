import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pandas as pd

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from scripts import prepare_frontend_data, prepare_historical_price_shards  # noqa: E402


class TestPrepareFrontendData(unittest.TestCase):

    @patch('scripts.prepare_frontend_data.os.path.exists')
    def test_prepare_historical_prices_missing_parquet(self, mock_exists):
        # mock_exists returns False so it should exit early
        mock_exists.return_value = False
        with patch('builtins.print') as mock_print:
            prepare_frontend_data.prepare_historical_prices()
            mock_print.assert_called_once()
            self.assertIn("not found", mock_print.call_args[0][0])

    @patch('scripts.prepare_frontend_data.os.path.exists')
    @patch('scripts.prepare_frontend_data.os.environ.get')
    def test_prepare_historical_prices_skip_rebuild(self, mock_env_get, mock_exists):
        # exists logic:
        # 1. prices_path exists
        # 2. output_path exists
        mock_exists.side_effect = [True, True]
        mock_env_get.return_value = '0'  # Not 1

        with patch('builtins.print') as mock_print:
            prepare_frontend_data.prepare_historical_prices()
            mock_print.assert_called_once()
            self.assertIn("already exists; skipping rebuild", mock_print.call_args[0][0])

    @patch('scripts.prepare_frontend_data.os.path.exists')
    @patch('scripts.prepare_frontend_data.os.environ.get')
    @patch('scripts.prepare_frontend_data.pd.read_parquet')
    @patch('builtins.open', new_callable=unittest.mock.mock_open)
    def test_prepare_historical_prices_success(
        self, mock_file, mock_read_parquet, mock_env_get, mock_exists
    ):
        # path logic:
        # 1. prices_path -> True
        # 2. output_path -> False
        # 3. overrides_path -> False
        mock_exists.side_effect = [True, False, False]
        mock_env_get.return_value = '0'

        df_prices = pd.DataFrame(
            {
                'index': pd.to_datetime(['2023-01-01', '2023-01-02']),
                'AAPL': [150.0, 151.0],
                'BRKB': [300.0, 301.0],  # Alias check
                'MISSING': [np.nan, np.nan],  # Null handling
            }
        ).set_index('index')

        mock_read_parquet.return_value = df_prices

        prepare_frontend_data.prepare_historical_prices()

        # Extract JSON written
        mock_file().write.assert_called()
        written_data = ""
        for call in mock_file().write.call_args_list:
            written_data += call[0][0]

        parsed = json.loads(written_data)

        # AAPL
        self.assertIn('AAPL', parsed)
        self.assertEqual(parsed['AAPL']['2023-01-01'], 150.0)

        # BRK-B
        self.assertIn('BRK-B', parsed)
        self.assertNotIn('BRKB', parsed)
        self.assertEqual(parsed['BRK-B']['2023-01-01'], 300.0)

        # MISSING
        self.assertNotIn('MISSING', parsed)

    @patch('scripts.prepare_frontend_data.os.path.exists')
    @patch('scripts.prepare_frontend_data.os.environ.get')
    @patch('scripts.prepare_frontend_data.pd.read_parquet')
    @patch('builtins.open', new_callable=unittest.mock.mock_open)
    def test_overrides_path_exists(self, mock_file, mock_read_parquet, mock_env_get, mock_exists):
        mock_exists.side_effect = lambda x: 'historical_prices.json' not in str(x)
        mock_env_get.return_value = '1'

        df_prices = pd.DataFrame(
            {
                'index': pd.to_datetime(['2023-01-01']),
                'AAPL': [150.0],
            }
        ).set_index('index')

        df_overrides = pd.DataFrame(
            {'date': pd.to_datetime(['2023-01-01']), 'ticker': ['AAPL'], 'adj_close': [155.0]}
        )

        mock_read_parquet.side_effect = [df_prices, df_overrides]

        prepare_frontend_data.prepare_historical_prices()


class TestPrepareHistoricalPriceShards(unittest.TestCase):

    def _write_monolith(self, tmp, payload):
        source = Path(tmp) / 'historical_prices.json'
        source.write_text(json.dumps(payload), encoding='utf-8')
        return source

    def test_exact_symbol_date_value_parity(self):
        payload = {
            'AAPL': {'2023-01-02': 151.0, '2023-01-01': 150.0},
            'VTI': {'2023-01-01': 200.5},
        }
        with tempfile.TemporaryDirectory() as tmp:
            source = self._write_monolith(tmp, payload)
            out_dir = Path(tmp) / 'shards'
            manifest = prepare_historical_price_shards.write_price_shards(source, out_dir)

            self.assertEqual(manifest['schema_version'], 1)
            for symbol, date_map in payload.items():
                entry = manifest['symbols'][symbol]
                shard = json.loads((out_dir / entry['file']).read_text(encoding='utf-8'))
                self.assertEqual(shard, date_map)

    def test_deterministic_hashes_across_insertion_orders(self):
        base = {
            'AAPL': {'2023-01-01': 150.0, '2023-01-02': 151.0},
            'VTI': {'2023-01-01': 200.5, '2023-01-02': 201.5},
        }
        with tempfile.TemporaryDirectory() as tmp:
            source_a = self._write_monolith(tmp, base)
            out_a = Path(tmp) / 'a'
            manifest_a = prepare_historical_price_shards.write_price_shards(source_a, out_a)

            reversed_payload = {s: dict(reversed(list(dates.items()))) for s, dates in base.items()}
            source_b = Path(tmp) / 'reversed.json'
            source_b.write_text(json.dumps(reversed_payload), encoding='utf-8')
            out_b = Path(tmp) / 'b'
            manifest_b = prepare_historical_price_shards.write_price_shards(source_b, out_b)

            for symbol in base:
                self.assertEqual(manifest_a['symbols'][symbol], manifest_b['symbols'][symbol])
                shard_a = out_a / manifest_a['symbols'][symbol]['file']
                shard_b = out_b / manifest_b['symbols'][symbol]['file']
                self.assertEqual(shard_a.read_bytes(), shard_b.read_bytes())
            index_a = json.loads((out_a / 'index.json').read_text(encoding='utf-8'))
            index_b = json.loads((out_b / 'index.json').read_text(encoding='utf-8'))
            index_a.pop('source_sha256')
            index_b.pop('source_sha256')
            self.assertEqual(index_a, index_b)

    def test_normalized_alias_shares_one_file(self):
        payload = {'BRK-B': {'2023-01-01': 300.0}}
        with tempfile.TemporaryDirectory() as tmp:
            source = self._write_monolith(tmp, payload)
            out_dir = Path(tmp) / 'shards'
            manifest = prepare_historical_price_shards.write_price_shards(source, out_dir)

            self.assertEqual(manifest['symbols']['BRK-B'], manifest['symbols']['BRKB'])
            self.assertEqual(
                manifest['symbols']['BRK-B'], manifest['symbols']['BRK-B'.replace('-', '').upper()]
            )
            shard_files = {p.name for p in out_dir.glob('*.json')}
            self.assertEqual(len(shard_files), 2)  # one shard + index.json

    def test_malformed_and_non_finite_rejection(self):
        cases = [
            '{not json',
            json.dumps(['not', 'an', 'object']),
            json.dumps({'AAPL': 'not a date map'}),
            json.dumps({'AAPL': {'2023-01-01': 'oops'}}),
            json.dumps({'AAPL': {'2023-01-01': float('nan')}}),
            json.dumps({'AAPL': {'2023-01-01': float('inf')}}),
            json.dumps({'AAPL': {'2023-01-01': True}}),
        ]
        for raw in cases:
            with tempfile.TemporaryDirectory() as tmp:
                source = Path(tmp) / 'bad.json'
                source.write_text(raw, encoding='utf-8')
                with self.assertRaises(ValueError):
                    prepare_historical_price_shards.write_price_shards(source, Path(tmp) / 'shards')

    def test_rerun_removes_stale_shard(self):
        payload = {'AAPL': {'2023-01-01': 150.0}}
        with tempfile.TemporaryDirectory() as tmp:
            source = self._write_monolith(tmp, payload)
            out_dir = Path(tmp) / 'shards'
            prepare_historical_price_shards.write_price_shards(source, out_dir)
            stale = out_dir / ('0' * 64 + '.json')
            stale.write_text('{}', encoding='utf-8')

            manifest = prepare_historical_price_shards.write_price_shards(source, out_dir)
            self.assertFalse(stale.exists())
            self.assertEqual(manifest['schema_version'], 1)

    def test_source_hash_and_bytes_unchanged(self):
        payload = {'AAPL': {'2023-01-01': 150.0}}
        with tempfile.TemporaryDirectory() as tmp:
            source = self._write_monolith(tmp, payload)
            before = source.read_bytes()
            manifest = prepare_historical_price_shards.write_price_shards(
                source, Path(tmp) / 'shards'
            )

            self.assertEqual(manifest['source_sha256'], hashlib.sha256(before).hexdigest())
            self.assertEqual(source.read_bytes(), before)

    def test_cli_defaults_and_positional_args(self):
        payload = {'AAPL': {'2023-01-01': 150.0}}
        with tempfile.TemporaryDirectory() as tmp:
            source = self._write_monolith(tmp, payload)
            out_dir = Path(tmp) / 'shards'
            argv = ['prog', str(source), str(out_dir)]
            with patch.object(sys, 'argv', argv), patch('builtins.print') as mock_print:
                prepare_historical_price_shards.main()
            mock_print.assert_called_once()
            self.assertTrue((out_dir / 'index.json').exists())


if __name__ == '__main__':
    unittest.main()
