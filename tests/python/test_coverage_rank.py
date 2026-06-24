"""Tests for scripts.agents.coverage_rank."""

from __future__ import annotations

from scripts.agents.coverage_rank import coverage_pct, rank


def _summary() -> dict[str, object]:
    return {
        "total": {"lines": {"pct": 50}},
        "/repo/js/full.js": {"lines": {"pct": 100}},
        "/repo/js/mid.js": {"lines": {"pct": 12.5}},
        "/repo/js/empty.js": {"lines": {"pct": 0}},
    }


def test_rank_orders_ascending_and_skips_total() -> None:
    files = [path for path, _ in rank(_summary(), "lines")]
    assert files == ["/repo/js/empty.js", "/repo/js/mid.js", "/repo/js/full.js"]
    assert "total" not in files


def test_coverage_pct_handles_missing_metric_or_entry() -> None:
    assert coverage_pct({"lines": {"pct": 30}}, "branches") == 0.0
    assert coverage_pct({}, "lines") == 0.0
    assert coverage_pct("not-a-dict", "lines") == 0.0


def test_coverage_pct_reads_value() -> None:
    assert coverage_pct({"lines": {"pct": 42.0}}, "lines") == 42.0
