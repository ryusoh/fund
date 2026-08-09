"""Tests for scripts.agents.gate_guard — the worktree snapshot guard."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from scripts.agents.gate_guard import main, worktree_fingerprint


def _git(repo: Path, *args: str) -> None:
    subprocess.run(["git", *args], cwd=repo, capture_output=True, check=True)


@pytest.fixture()
def repo(tmp_path: Path) -> Path:
    """A git repo with one committed tracked file."""
    _git(tmp_path, "init")
    (tmp_path / "tracked.txt").write_text("v1\n")
    _git(tmp_path, "add", "tracked.txt")
    _git(
        tmp_path,
        "-c",
        "user.email=test@example.com",
        "-c",
        "user.name=Test",
        "commit",
        "-m",
        "init",
    )
    return tmp_path


def test_fingerprint_stable_when_unchanged(repo: Path) -> None:
    assert worktree_fingerprint(repo) == worktree_fingerprint(repo)


def test_fingerprint_changes_on_tracked_edit(repo: Path) -> None:
    before = worktree_fingerprint(repo)
    (repo / "tracked.txt").write_text("v2\n")
    assert worktree_fingerprint(repo) != before


def test_fingerprint_changes_on_staged_edit(repo: Path) -> None:
    before = worktree_fingerprint(repo)
    (repo / "tracked.txt").write_text("v2\n")
    _git(repo, "add", "tracked.txt")
    assert worktree_fingerprint(repo) != before


def test_fingerprint_changes_on_new_untracked_file(repo: Path) -> None:
    before = worktree_fingerprint(repo)
    (repo / "new.py").write_text("x = 1\n")
    assert worktree_fingerprint(repo) != before


def test_fingerprint_changes_on_untracked_content_edit(repo: Path) -> None:
    (repo / "new.py").write_text("x = 1\n")
    before = worktree_fingerprint(repo)
    (repo / "new.py").write_text("x = 2\n")
    assert worktree_fingerprint(repo) != before


def test_fingerprint_ignores_excluded_files(repo: Path) -> None:
    (repo / ".gitignore").write_text("ignored/\n")
    before = worktree_fingerprint(repo)
    (repo / "ignored").mkdir()
    (repo / "ignored" / "junk.txt").write_text("junk\n")
    assert worktree_fingerprint(repo) == before


def test_main_snapshot_prints_fingerprint(repo: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["snapshot", "--repo", str(repo)]) == 0
    assert capsys.readouterr().out.strip() == worktree_fingerprint(repo)


def test_main_check_unchanged_exits_1(repo: Path, capsys: pytest.CaptureFixture[str]) -> None:
    snap = worktree_fingerprint(repo)
    assert main(["check", snap, "--repo", str(repo)]) == 1
    assert "edit something before rerunning the gate" in capsys.readouterr().err


def test_main_check_changed_exits_0(repo: Path) -> None:
    snap = worktree_fingerprint(repo)
    (repo / "tracked.txt").write_text("v2\n")
    assert main(["check", snap, "--repo", str(repo)]) == 0


def test_main_errors_outside_git_repo(tmp_path: Path) -> None:
    with pytest.raises(SystemExit):
        main(["snapshot", "--repo", str(tmp_path)])
