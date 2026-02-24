"""Utilities for TWRR pipeline."""

from __future__ import annotations

import csv
from pathlib import Path
from typing import FrozenSet

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
DELISTED_TICKERS_FILE = DATA_DIR / "delisted_tickers.csv"


def load_delisted_tickers() -> FrozenSet[str]:
    """Load delisted tickers from CSV file."""
    if not DELISTED_TICKERS_FILE.exists():
        return frozenset()

    tickers = set()
    with DELISTED_TICKERS_FILE.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            ticker = row.get("ticker", "").strip().upper()
            if ticker:
                tickers.add(ticker)
    return frozenset(tickers)
