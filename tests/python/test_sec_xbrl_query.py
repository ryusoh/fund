"""Tests for period-column parsing in scripts/filings/fins/processors/sec_xbrl_query.py.

Regression: edgartools statement dataframes label period columns like
"2026-05-29 (FY)", which previously matched nothing, so every statement row
came back with empty values.
"""

from scripts.filings.fins.processors.sec_xbrl_query import (
    _build_period_summary,
    _extract_period_columns,
)


def test_extract_period_columns_accepts_bare_dates() -> None:
    assert _extract_period_columns(["concept", "2026-05-29", "label"]) == ["2026-05-29"]


def test_extract_period_columns_accepts_fiscal_suffix() -> None:
    columns = ["concept", "label", "2026-05-29 (FY)", "2026-02-27 (Q3)"]
    assert _extract_period_columns(columns) == ["2026-05-29 (FY)", "2026-02-27 (Q3)"]


def test_extract_period_columns_rejects_non_dates() -> None:
    assert _extract_period_columns(["concept", "2026-5-9", "FY2026", "2026-05-29 (FY2026)"]) == []


def test_build_period_summary_bare_date_keeps_fy_default() -> None:
    assert _build_period_summary("2026-05-29") == {
        "period_end": "2026-05-29",
        "fiscal_year": 2026,
        "fiscal_period": "FY",
    }


def test_build_period_summary_parses_suffix() -> None:
    assert _build_period_summary("2026-02-27 (Q3)") == {
        "period_end": "2026-02-27",
        "fiscal_year": 2026,
        "fiscal_period": "Q3",
    }


def test_build_period_summary_invalid_date() -> None:
    assert _build_period_summary("not-a-date") == {
        "period_end": "not-a-date",
        "fiscal_year": None,
        "fiscal_period": None,
    }
