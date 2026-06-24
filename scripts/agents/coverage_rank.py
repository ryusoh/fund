"""Rank source files by test coverage, lowest first.

Reads a Jest ``coverage-summary.json`` (produced by
``jest --coverage --coverageReporters=json-summary``) and prints the
least-covered files. This exists to kill a real routine bug: reading a
truncated coverage table from the terminal, seeing only the bottom rows, and
re-testing files already at 100 percent while the worst files at the top are
ignored every run.

Usage::

    npx jest --coverage --coverageReporters=json-summary --coverageReporters=text
    python3 -m scripts.agents.coverage_rank --limit 5
"""

from __future__ import annotations

import argparse
import json
import os
from typing import Any

METRICS = ("lines", "statements", "branches", "functions")
DEFAULT_SUMMARY = os.path.join("coverage", "coverage-summary.json")


def load_summary(path: str) -> dict[str, Any]:
    """Load a Jest json-summary coverage report."""
    with open(path, encoding="utf-8") as handle:
        data: dict[str, Any] = json.load(handle)
    return data


def coverage_pct(entry: Any, metric: str) -> float:
    """Return the coverage percent for ``metric``, or 0.0 if unavailable."""
    if not isinstance(entry, dict):
        return 0.0
    section = entry.get(metric)
    if not isinstance(section, dict):
        return 0.0
    value = section.get("pct")
    if isinstance(value, (int, float)):
        return float(value)
    return 0.0


def rank(summary: dict[str, Any], metric: str = "lines") -> list[tuple[str, float]]:
    """Return ``(file, pct)`` pairs sorted ascending, excluding the total row."""
    rows: list[tuple[str, float]] = []
    for path, entry in summary.items():
        if path == "total":
            continue
        rows.append((path, coverage_pct(entry, metric)))
    rows.sort(key=lambda row: row[1])
    return rows


def _relativize(path: str) -> str:
    try:
        return os.path.relpath(path, os.getcwd())
    except ValueError:
        return path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Rank files by coverage, lowest first.")
    parser.add_argument("--summary", default=DEFAULT_SUMMARY, help="Path to coverage-summary.json.")
    parser.add_argument("--metric", choices=METRICS, default="lines", help="Coverage metric.")
    parser.add_argument("--limit", type=int, default=5, help="Max files to print (0 = all).")
    parser.add_argument(
        "--max-pct",
        type=float,
        default=100.0,
        help="Skip files whose coverage is at or above this percent.",
    )
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of text.")
    args = parser.parse_args(argv)

    try:
        summary = load_summary(args.summary)
    except FileNotFoundError:
        parser.error(
            f"{args.summary} not found. Generate it first with: "
            "npx jest --coverage --coverageReporters=json-summary"
        )

    rows = [row for row in rank(summary, args.metric) if row[1] < args.max_pct]
    selected = rows[: args.limit] if args.limit > 0 else rows

    if args.json:
        payload = [{"file": _relativize(path), "pct": pct} for path, pct in selected]
        print(json.dumps(payload, indent=2))
    else:
        for path, pct in selected:
            print(f"{pct:6.2f}  {_relativize(path)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
