"""Utilities for TWRR pipeline."""

from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import FrozenSet, List

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
DELISTED_TICKERS_FILE = DATA_DIR / "delisted_tickers.csv"
CHANGELOG_FILE = DATA_DIR / "changelog.json"


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


def append_changelog_entry(step_name: str, artifacts: List[str], notes: str = "") -> None:
    """Append a status entry to the changelog JSON file."""
    changelog = []
    if CHANGELOG_FILE.exists():
        try:
            with CHANGELOG_FILE.open("r", encoding="utf-8") as f:
                changelog = json.load(f)
        except (json.JSONDecodeError, IOError):
            changelog = []

    entry = {
        "step": step_name,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "artifacts": artifacts,
        "notes": notes,
    }
    changelog.append(entry)

    with CHANGELOG_FILE.open("w", encoding="utf-8") as f:
        json.dump(changelog, f, indent=2)
