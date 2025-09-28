#!/usr/bin/env python3
"""Compute combined hash of pipeline inputs."""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path
from typing import Iterable

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / 'data'
INPUT_FILES = [DATA_DIR / 'transactions.csv', DATA_DIR / 'split_history.csv']
HASH_PATH = DATA_DIR / 'checkpoints' / 'input_hash.txt'


def compute_hash(files: Iterable[Path]) -> str:
    sha = hashlib.sha256()
    for file_path in files:
        if not file_path.exists():
            raise FileNotFoundError(f'Missing required input file: {file_path}')
        with file_path.open('rb') as f:
            while True:
                chunk = f.read(8192)
                if not chunk:
                    break
                sha.update(chunk)
    return sha.hexdigest()


def save_hash(value: str) -> None:
    HASH_PATH.parent.mkdir(parents=True, exist_ok=True)
    HASH_PATH.write_text(value + '\n', encoding='utf-8')


def main() -> None:
    parser = argparse.ArgumentParser(description='Compute hash of pipeline inputs.')
    parser.add_argument(
        '--write',
        action='store_true',
        help='Persist the computed hash to data/checkpoints/input_hash.txt.',
    )
    args = parser.parse_args()

    value = compute_hash(INPUT_FILES)

    if args.write:
        save_hash(value)

    print(value)


if __name__ == '__main__':
    main()
