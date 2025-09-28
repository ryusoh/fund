#!/usr/bin/env python3
"""Watch transaction inputs and trigger the TWRR refresh target."""

from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path

WATCH_PATHS = [Path('data/transactions.csv'), Path('data/split_history.csv')]
MAKE_TARGET = 'twrr-refresh'


def run_make(target: str) -> int:
    return subprocess.call(['make', target])


def poll(interval: float) -> None:
    last_mtimes = {path: path.stat().st_mtime if path.exists() else 0 for path in WATCH_PATHS}
    while True:
        try:
            for path in WATCH_PATHS:
                try:
                    mtime = path.stat().st_mtime
                except FileNotFoundError:
                    mtime = 0
                if mtime != last_mtimes.get(path):
                    print(f'Change detected in {path}; running {MAKE_TARGET}...')
                    last_mtimes[path] = mtime
                    run_make(MAKE_TARGET)
            time.sleep(interval)
        except KeyboardInterrupt:
            print('Watcher stopped.')
            break


def main() -> None:
    parser = argparse.ArgumentParser(description='Watch input files and refresh TWRR pipeline.')
    parser.add_argument(
        '--interval', type=float, default=5.0, help='Polling interval in seconds (default: 5).'
    )
    args = parser.parse_args()

    poll(interval=args.interval)


if __name__ == '__main__':
    main()
