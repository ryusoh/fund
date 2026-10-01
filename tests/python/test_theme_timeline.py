"""Tests for theme_timeline (scripts.analysis.theme_timeline)."""

from __future__ import annotations

import datetime
from typing import Any

import pytest

from scripts.analysis.theme_timeline import build_theme_timeline


def test_build_theme_timeline_open_and_superseded_classification() -> None:
    today = datetime.date(2026, 10, 1)

    configs = {
        "ANET": {
            "symbol": "ANET",
            "industry_thesis": "docs/thesis/industry/ai-networking.md",
        }
    }
    evidence: dict[str, list[dict[str, Any]]] = {
        "ANET": [
            {
                "date": "2026-02-15",
                "claim": "Claim 1 holds",
                "valid_to": None,
            },
            {
                "date": "2026-05-10",
                "claim": "Claim 2 superseded in past",
                "valid_to": "2026-08-01",
            },
            {
                "date": "2026-07-20",
                "claim": "Claim 3 valid until future",
                "valid_to": "2026-12-31",
            },
        ]
    }

    result = build_theme_timeline(configs, evidence, as_of=today)

    assert result["as_of"] == "2026-10-01"
    records = result["tickers"]["ANET"]
    assert len(records) == 3
    assert records[0]["status"] == "open"
    assert records[1]["status"] == "superseded"
    assert records[2]["status"] == "open"


def test_build_theme_timeline_missing_valid_to() -> None:
    today = datetime.date(2026, 10, 1)

    configs = {"VT": {"symbol": "VT"}}
    evidence = {
        "VT": [
            {
                "date": "2026-01-15",
                "claim": "Global equity risk premium remains positive",
            }
        ]
    }

    result = build_theme_timeline(configs, evidence, as_of=today)
    assert result["tickers"]["VT"][0]["status"] == "open"


def test_build_theme_timeline_malformed_dates_skipped_with_warning(
    capsys: pytest.CaptureFixture[str],
) -> None:
    today = datetime.date(2026, 10, 1)

    configs = {"PDD": {"symbol": "PDD"}}
    evidence = {
        "PDD": [
            {
                "date": "2026-03-01",
                "claim": "Valid claim",
                "valid_to": "not-a-date",
            },
            {
                "date": "invalid-date",
                "claim": "Bad record date",
            },
            {
                "date": "2026-04-01",
                "claim": "Good record",
            },
        ]
    }

    result = build_theme_timeline(configs, evidence, as_of=today)
    records = result["tickers"]["PDD"]
    # 2 malformed records skipped
    assert len(records) == 1
    assert records[0]["claim"] == "Good record"

    captured = capsys.readouterr()
    assert "Warning: malformed valid_to in PDD evidence: not-a-date" in captured.err
    assert "Warning: malformed date in PDD evidence: invalid-date" in captured.err


def test_build_theme_timeline_industry_grouping() -> None:
    today = datetime.date(2026, 10, 1)

    configs = {
        "ANET": {
            "symbol": "ANET",
            "industry_thesis": "docs/thesis/industry/ai-networking.md",
        },
        "MRVL": {
            "symbol": "MRVL",
            "industry_thesis": "docs/thesis/industry/ai-networking.md",
        },
        "GOOG": {
            "symbol": "GOOG",
            "industry_thesis": "docs/thesis/industry/cloud-ai-ecosystem.md",
        },
    }
    evidence = {
        "ANET": [{"date": "2026-05-01", "claim": "ANET claim", "valid_to": None}],
        "MRVL": [{"date": "2026-04-01", "claim": "MRVL claim", "valid_to": "2026-06-01"}],
        "GOOG": [{"date": "2026-03-01", "claim": "GOOG claim", "valid_to": None}],
    }

    result = build_theme_timeline(configs, evidence, as_of=today)
    industries = result["industries"]

    assert "docs/thesis/industry/ai-networking.md" in industries
    ai_net = industries["docs/thesis/industry/ai-networking.md"]
    assert set(ai_net["tickers"]) == {"ANET", "MRVL"}
    # Combined evidence sorted by date
    assert len(ai_net["evidence"]) == 2
    assert ai_net["evidence"][0]["claim"] == "MRVL claim"
    assert ai_net["evidence"][0]["status"] == "superseded"
    assert ai_net["evidence"][1]["claim"] == "ANET claim"
    assert ai_net["evidence"][1]["status"] == "open"

    assert "docs/thesis/industry/cloud-ai-ecosystem.md" in industries
    cloud = industries["docs/thesis/industry/cloud-ai-ecosystem.md"]
    assert cloud["tickers"] == ["GOOG"]
    assert len(cloud["evidence"]) == 1
