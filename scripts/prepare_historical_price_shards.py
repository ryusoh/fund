"""Generate per-ticker price shards from the raw historical prices monolith.

The raw ``data/historical_prices.json`` monolith is the only exact source of
the frontend's missing-date semantics (the Parquet pipeline forward/back-fills,
so it cannot reproduce them). This script splits the monolith into one compact
JSON shard per symbol, named by the SHA-256 of its exact bytes, plus an
``index.json`` manifest written last so clients can discover shards.

Standard library only; no pandas, no Parquet.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path

SCHEMA_VERSION = 1
DEFAULT_SOURCE = 'data/historical_prices.json'
DEFAULT_OUTPUT_DIR = 'data/historical_prices'


def _validate_price_map(symbol, date_map):
    """Return a validated copy of a symbol's date map with sorted date keys."""
    if not isinstance(date_map, dict):
        raise ValueError(f"symbol '{symbol}': expected a date map object")
    validated = {}
    for date_key, price in date_map.items():
        if isinstance(price, bool) or not isinstance(price, (int, float)):
            raise ValueError(f"symbol '{symbol}' date '{date_key}': price is not a number")
        if not math.isfinite(price):
            raise ValueError(f"symbol '{symbol}' date '{date_key}': price is not finite")
        validated[date_key] = price
    return dict(sorted(validated.items()))


def write_price_shards(source_path, output_dir):
    """Split the monolith into content-hashed shards plus an index manifest.

    Returns the parsed manifest dict. The source file is left unchanged.
    """
    source_path = Path(source_path)
    output_dir = Path(output_dir)

    source_bytes = source_path.read_bytes()
    try:
        monolith = json.loads(source_bytes.decode('utf-8'))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError(f"malformed source JSON: {exc}") from exc
    if not isinstance(monolith, dict):
        raise ValueError('source JSON must be a top-level object of symbol date maps')

    source_sha256 = hashlib.sha256(source_bytes).hexdigest()

    symbols = {}
    shards = []
    seen_shards = {}
    for symbol in sorted(monolith):
        date_map = _validate_price_map(symbol, monolith[symbol])
        body = json.dumps(date_map, separators=(',', ':'), allow_nan=False).encode('utf-8')
        digest = hashlib.sha256(body).hexdigest()
        filename = f"{digest}.json"
        if digest not in seen_shards:
            seen_shards[digest] = body
            shards.append((filename, body))
        entry = {'file': filename, 'sha256': digest}
        symbols[symbol] = entry
        alias = symbol.replace('-', '').upper()
        if alias != symbol:
            symbols[alias] = entry

    output_dir.mkdir(parents=True, exist_ok=True)
    for stale in output_dir.glob('*.json'):
        stale.unlink()

    for filename, body in sorted(shards):
        (output_dir / filename).write_bytes(body)

    manifest = {
        'schema_version': SCHEMA_VERSION,
        'source_sha256': source_sha256,
        'symbols': symbols,
    }
    manifest_text = json.dumps(manifest, indent=2, sort_keys=True) + '\n'
    (output_dir / 'index.json').write_text(manifest_text, encoding='utf-8')

    return json.loads(manifest_text)


def main():
    parser = argparse.ArgumentParser(
        description='Generate per-ticker historical price shards from the raw monolith.'
    )
    parser.add_argument('source', nargs='?', default=DEFAULT_SOURCE, help='raw monolith JSON path')
    parser.add_argument(
        'output', nargs='?', default=DEFAULT_OUTPUT_DIR, help='shard output directory'
    )
    args = parser.parse_args()

    manifest = write_price_shards(args.source, args.output)
    print(f"Wrote {len(manifest['symbols'])} symbol entries to {args.output}/index.json")


if __name__ == '__main__':
    main()
