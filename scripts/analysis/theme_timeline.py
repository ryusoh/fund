"""Theme Timeline Indexer (scripts/analysis/theme_timeline.py).

Annotates evidence records with temporal validity (status: open | superseded)
and builds cross-ticker groupings by shared industry_thesis.
"""

from __future__ import annotations

import datetime
import sys
from typing import Any


def _parse_iso_date(date_str: str | None, field_name: str, ticker: str) -> datetime.date | None:
    if not date_str:
        return None
    try:
        return datetime.date.fromisoformat(date_str)
    except (ValueError, TypeError):
        sys.stderr.write(f"Warning: malformed {field_name} in {ticker} evidence: {date_str}\n")
        raise


def build_theme_timeline(
    configs: dict[str, Any],
    evidence: dict[str, Any],
    as_of: datetime.date | None = None,
) -> dict[str, Any]:
    """Pure function building temporal timeline and industry index.

    Args:
        configs: Mapping of ticker symbol to config dict.
        evidence: Mapping of ticker symbol to list of evidence records.
        as_of: Optional reference date (defaults to date.today()).

    Returns:
        Dict with "as_of", "tickers", and "industries".
    """
    today = as_of or datetime.date.today()
    annotated_tickers: dict[str, list[dict[str, Any]]] = {}
    industries: dict[str, dict[str, Any]] = {}

    # Initialize industries from configs
    for ticker, config in configs.items():
        if not isinstance(config, dict):
            continue
        ind_thesis = config.get("industry_thesis")
        if ind_thesis and isinstance(ind_thesis, str):
            if ind_thesis not in industries:
                industries[ind_thesis] = {"tickers": [], "evidence": []}
            if ticker not in industries[ind_thesis]["tickers"]:
                industries[ind_thesis]["tickers"].append(ticker)

    # Process evidence per ticker
    for ticker, records in evidence.items():
        annotated_records: list[dict[str, Any]] = []
        if not isinstance(records, list):
            continue

        for r in records:
            if not isinstance(r, dict):
                continue

            # Validate date fields
            try:
                _parse_iso_date(r.get("date"), "date", ticker)
                _parse_iso_date(r.get("valid_from"), "valid_from", ticker)
                valid_to_val = _parse_iso_date(r.get("valid_to"), "valid_to", ticker)
            except (ValueError, TypeError):
                # Malformed date skipped with warning
                continue

            rec = dict(r)

            # Superseded predicate: valid_to is set and valid_to < today
            if valid_to_val is not None:
                rec["status"] = "superseded" if valid_to_val < today else "open"
            else:
                rec["status"] = "open"

            annotated_records.append(rec)

        annotated_tickers[ticker] = annotated_records

        # Also add to industry evidence if ticker is associated with an industry
        config = configs.get(ticker, {})
        ind_thesis = config.get("industry_thesis") if isinstance(config, dict) else None
        if ind_thesis and ind_thesis in industries:
            industries[ind_thesis]["evidence"].extend(annotated_records)

    # Sort industry evidence by date
    for ind_info in industries.values():
        ind_info["evidence"].sort(key=lambda x: str(x.get("date", "")))

    return {
        "as_of": today.isoformat(),
        "tickers": annotated_tickers,
        "industries": industries,
    }
