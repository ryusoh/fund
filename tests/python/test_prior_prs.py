"""Tests for scripts.agents.prior_prs."""

from __future__ import annotations

from scripts.agents.prior_prs import (
    attribute_lane,
    compute_stats,
    format_prs,
    format_stats,
    is_jules_pr,
)


def _jules_pr(number: int, state: str, branch: str, labels: list[str] | None = None) -> dict:
    return {
        "number": number,
        "state": state,
        "title": f"pr {number}",
        "headRefName": branch,
        "author": {"login": "app/google-labs-jules"},
        "labels": [{"name": name} for name in (labels or [])],
    }


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


def test_is_jules_pr_matches_bot_author_only() -> None:
    assert is_jules_pr(_jules_pr(1, "OPEN", "bolt-x"))
    assert not is_jules_pr({"author": {"login": "ryusoh"}})
    assert not is_jules_pr({})


def test_attribute_lane_from_branch_name() -> None:
    assert attribute_lane(_jules_pr(1, "OPEN", "jules-typist-noop-123")) == "typist"
    assert attribute_lane(_jules_pr(2, "OPEN", "janitor/dead-code-123")) == "janitor"
    assert attribute_lane(_jules_pr(3, "OPEN", "refactor-thinfilm-123")) == "unattributed"


def test_compute_stats_groups_jules_prs_and_close_reasons() -> None:
    prs = [
        _jules_pr(1, "MERGED", "bolt-faster-1"),
        _jules_pr(2, "CLOSED", "bolt-slower-2", ["close:ugly"]),
        _jules_pr(3, "OPEN", "bolt-wip-3"),
        _jules_pr(4, "MERGED", "mystery-branch-4"),
        {"number": 5, "state": "CLOSED", "author": {"login": "ryusoh"}, "labels": []},
    ]
    stats = compute_stats(prs)
    bolt = stats["lanes"]["bolt"]
    assert (bolt["open"], bolt["merged"], bolt["closed"]) == (1, 1, 1)
    assert bolt["reasons"] == {"close:ugly": 1}
    assert stats["lanes"]["unattributed"]["merged"] == 1
    # The human-authored PR is excluded from the totals.
    total = stats["total"]
    assert (total["open"], total["merged"], total["closed"]) == (1, 2, 1)
    assert total["reasons"] == {"close:ugly": 1}


def test_format_stats_renders_rates_and_reasons() -> None:
    stats = compute_stats(
        [
            _jules_pr(1, "MERGED", "bolt-x-1"),
            _jules_pr(2, "CLOSED", "bolt-y-2", ["close:dup"]),
            _jules_pr(3, "OPEN", "typist-z-3"),
        ]
    )
    out = format_stats(stats)
    assert "bolt" in out
    assert "50%" in out  # 1 merged of 2 decided
    assert "n/a" in out  # typist has no decided PRs
    assert "TOTAL" in out
    assert "close:dup=1" in out


def test_format_stats_empty() -> None:
    out = format_stats(compute_stats([]))
    assert "TOTAL" in out
    assert "close reasons" not in out
