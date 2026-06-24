"""Tests for scripts.agents.prior_prs."""

from __future__ import annotations

from scripts.agents.prior_prs import format_prs


def test_format_includes_number_state_labels_and_title() -> None:
    prs = [
        {"number": 5, "state": "OPEN", "title": "fix(worker): x", "labels": [{"name": "dup"}]},
        {"number": 4, "state": "CLOSED", "title": "perf(ui): y", "labels": []},
    ]
    out = format_prs(prs)
    assert "#5" in out
    assert "open" in out
    assert "[dup]" in out
    assert "#4" in out
    assert "closed" in out
    assert "[" not in out.splitlines()[1]  # no label brackets on the unlabelled PR


def test_format_handles_empty_list() -> None:
    assert format_prs([]) == ""
