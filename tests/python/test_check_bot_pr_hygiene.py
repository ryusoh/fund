"""Tests for scripts.agents.check_bot_pr_hygiene — the Jules bot PR hygiene gate."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from scripts.agents.check_bot_pr_hygiene import find_violations, main

BOT_NAME = "google-labs-jules[bot]"
BOT_EMAIL = "161369871+google-labs-jules[bot]@users.noreply.github.com"


def _git(repo: Path, *args: str) -> None:
    subprocess.run(["git", *args], cwd=repo, capture_output=True, check=True)


def _commit(repo: Path, message: str, bot: bool = True, allow_empty: bool = False) -> None:
    name = BOT_NAME if bot else "Dev"
    email = BOT_EMAIL if bot else "dev@example.com"
    args = ["-c", f"user.email={email}", "-c", f"user.name={name}", "commit", "-m", message]
    if allow_empty:
        args.append("--allow-empty")
    _git(repo, *args)


def _write_and_commit(repo: Path, path: str, content: str, message: str, bot: bool = True) -> None:
    target = repo / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)
    _git(repo, "add", path)
    _commit(repo, message, bot=bot)


@pytest.fixture()
def repo(tmp_path: Path) -> Path:
    """A git repo with one human commit on main and a bot branch checked out."""
    _git(tmp_path, "init", "-b", "main")
    (tmp_path / "README.md").write_text("x\n")
    _git(tmp_path, "add", "README.md")
    _commit(tmp_path, "init", bot=False)
    _git(tmp_path, "checkout", "-b", "bot-branch")
    return tmp_path


def test_clean_bot_test_addition_passes(repo: Path) -> None:
    _write_and_commit(
        repo, "tests/python/test_new.py", "def test_x():\n    assert True\n", "add tests"
    )
    assert find_violations(repo, "main") == []


def test_bot_python_test_deletion_flagged(repo: Path) -> None:
    _write_and_commit(
        repo, "tests/python/test_new.py", "def test_x():\n    assert True\n", "add tests"
    )
    _write_and_commit(
        repo, "tests/python/test_new.py", "def test_x():\n    pass\n", "rewrite tests"
    )
    violations = find_violations(repo, "main")
    assert any("test deletion" in v and "tests/python/test_new.py" in v for v in violations)


def test_bot_js_test_deletion_flagged(repo: Path) -> None:
    _write_and_commit(repo, "tests/js/widget.test.js", "a\nb\n", "add js test")
    _write_and_commit(repo, "tests/js/widget.test.js", "a\n", "trim js test")
    violations = find_violations(repo, "main")
    assert any("test deletion" in v and "tests/js/widget.test.js" in v for v in violations)


def test_bot_scripts_test_file_deletion_flagged(repo: Path) -> None:
    _write_and_commit(repo, "scripts/test_widget.py", "a = 1\nb = 2\n", "add scraper test")
    _write_and_commit(repo, "scripts/test_widget.py", "a = 1\n", "trim scraper test")
    violations = find_violations(repo, "main")
    assert any("test deletion" in v for v in violations)


def test_bot_production_deletion_not_flagged(repo: Path) -> None:
    _write_and_commit(repo, "scripts/portfolio/core.py", "a = 1\nb = 2\n", "add prod code")
    _write_and_commit(repo, "scripts/portfolio/core.py", "a = 1\n", "trim prod code")
    assert find_violations(repo, "main") == []


def test_bot_empty_commit_flagged(repo: Path) -> None:
    _commit(repo, "responding to feedback", allow_empty=True)
    violations = find_violations(repo, "main")
    assert any("empty commit" in v for v in violations)


def test_bot_zero_content_file_flagged(repo: Path) -> None:
    _write_and_commit(repo, "dummy_file.txt", "", "add placeholder")
    violations = find_violations(repo, "main")
    assert any("placeholder" in v and "dummy_file.txt" in v for v in violations)


def test_human_test_deletion_and_empty_commit_ignored(repo: Path) -> None:
    _write_and_commit(repo, "tests/python/test_new.py", "a = 1\nb = 2\n", "add tests", bot=False)
    _write_and_commit(repo, "tests/python/test_new.py", "a = 1\n", "rewrite tests", bot=False)
    _commit(repo, "human empty commit", bot=False, allow_empty=True)
    assert find_violations(repo, "main") == []


def test_main_returns_1_with_violations(repo: Path, capsys: pytest.CaptureFixture[str]) -> None:
    _commit(repo, "empty", allow_empty=True)
    assert main(["--repo", str(repo), "--base", "main"]) == 1
    assert "empty commit" in capsys.readouterr().out


def test_main_returns_0_when_clean(repo: Path) -> None:
    _write_and_commit(repo, "tests/python/test_new.py", "x = 1\n", "add tests")
    assert main(["--repo", str(repo), "--base", "main"]) == 0


def test_main_returns_0_on_empty_range(repo: Path) -> None:
    _git(repo, "checkout", "main")
    assert main(["--repo", str(repo), "--base", "main"]) == 0


def test_main_returns_2_on_missing_base(repo: Path) -> None:
    assert main(["--repo", str(repo), "--base", "no-such-ref"]) == 2


def test_main_falls_back_to_local_main(repo: Path) -> None:
    """Default base origin/main is absent outside a clone; fall back to main."""
    _commit(repo, "empty", allow_empty=True)
    assert main(["--repo", str(repo)]) == 1


def test_main_returns_2_when_no_main_ref(tmp_path: Path) -> None:
    """With neither origin/main nor main resolvable, exit 2."""
    _git(tmp_path, "init", "-b", "trunk")
    (tmp_path / "README.md").write_text("x\n")
    _git(tmp_path, "add", "README.md")
    _commit(tmp_path, "init", bot=False)
    assert main(["--repo", str(tmp_path)]) == 2
