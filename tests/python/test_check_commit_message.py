"""Tests for scripts.agents.check_commit_message."""

from __future__ import annotations

from scripts.agents.check_commit_message import validate, warnings


def test_accepts_conventional_commit() -> None:
    assert validate("fix(worker): enforce https and exact-hostname cors") == []
    assert validate("refactor: extract helpers to cut complexity") == []
    assert validate("feat(calendar)!: switch to dom renderer") == []


def test_rejects_emoji() -> None:
    assert any("emoji" in err for err in validate("⚡ perf(ui): speed up"))


def test_rejects_routine_prefix() -> None:
    assert any("routine name" in err for err in validate("Sentinel: fix cors"))


def test_rejects_non_conventional() -> None:
    assert any("Conventional" in err for err in validate("update some stuff"))


def test_rejects_trailing_period() -> None:
    assert any("period" in err for err in validate("fix(ui): tweak the thing."))


def test_length_is_warning_not_error() -> None:
    long_subject = "fix(scope): " + ("x " * 40).strip()
    assert validate(long_subject) == []
    assert warnings(long_subject)


def test_dependabot_arrow_title_is_valid() -> None:
    # The auto-merge workflow normalizes dependabot titles to this form; the
    # "→" must not be treated as emoji or it would block auto-merge.
    assert validate("build(deps): polygon を 1.0 → 2.0 に更新") == []
    assert validate("build(deps): bump actions/checkout from 6 to 7") == []
