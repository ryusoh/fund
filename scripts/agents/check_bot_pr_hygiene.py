"""Bot PR hygiene gate: deterministic enforcement of AGENTS.md non-negotiable #10.

Unattended Jules routines (author ``google-labs-jules[bot]``) are bound by the
wording in AGENTS.md and their persona, but wording alone did not stop the six
zero-file Typist PRs hand-closed here in 2026-08, nor sibling-repo anki#494
(existing tests deleted in a coverage PR, then five empty/no-op commits —
including an add-then-remove ``dummy_file.txt`` — pushed in response to review
questions). This check fails the gate on any bot-authored commit in
``<base>..HEAD`` that:

1. changes no files (empty commit),
2. adds or changes a file with zero content lines (placeholder/dummy pattern),
3. deletes lines from a test file — bot lanes are append-only in tests
   (Testpilot owns ``tests/``; no other bot lane may touch tests at all).

Human-authored commits are out of scope and skipped: interactive agents may
legitimately delete or rewrite tests when the user asks.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

BOT_AUTHOR_MARKER = "google-labs-jules"


def _git(repo: Path, *args: str) -> str:
    """Run a git command in ``repo`` and return stdout as text."""
    result = subprocess.run(
        ["git", *args],
        cwd=repo,
        capture_output=True,
        check=True,
        text=True,
    )
    return result.stdout


def _is_test_path(path: str) -> bool:
    """True for fund test conventions: tests/**, test_*.py, *.test.js."""
    parts = path.split("/")
    name = parts[-1]
    return "tests" in parts or name.startswith("test_") or ".test." in name


def _numstat(repo: Path, sha: str) -> list[tuple[str, str, str]]:
    """Return (added, deleted, path) rows for one commit ('-' for binary)."""
    out = _git(repo, "show", "--numstat", "--format=", sha)
    rows = []
    for line in out.splitlines():
        fields = line.split("\t")
        if len(fields) >= 3:
            rows.append((fields[0], fields[1], fields[-1]))
    return rows


def find_violations(repo: Path, base: str) -> list[str]:
    """Inspect bot-authored commits in ``base..HEAD``; return violation strings."""
    revs = _git(repo, "rev-list", "--no-merges", f"{base}..HEAD").split()
    violations = []
    for sha in reversed(revs):
        author = _git(repo, "show", "-s", "--format=%ae %an", sha)
        if BOT_AUTHOR_MARKER not in author:
            continue
        rows = _numstat(repo, sha)
        if not rows:
            violations.append(f"{sha[:8]} empty commit: changes no files")
            continue
        for added, deleted, path in rows:
            if added == "0" and deleted == "0":
                violations.append(f"{sha[:8]} placeholder change: {path} has zero content lines")
            if deleted not in ("0", "-") and _is_test_path(path):
                violations.append(
                    f"{sha[:8]} test deletion: {path} loses {deleted} line(s)"
                    " — bot lanes are append-only in tests"
                )
    return violations


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Fail on empty commits, placeholder files, or test deletions in bot-authored commits.",
    )
    parser.add_argument(
        "--base",
        default="origin/main",
        help="Base ref for the commit range (default: origin/main, falls back to main).",
    )
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    args = parser.parse_args(argv)

    base = args.base
    try:
        _git(args.repo, "rev-parse", "--verify", base)
    except subprocess.CalledProcessError:
        if base != "origin/main":
            print(f"error: base ref {base!r} not found", file=sys.stderr)
            return 2
        base = "main"
        try:
            _git(args.repo, "rev-parse", "--verify", base)
        except subprocess.CalledProcessError:
            print("error: neither origin/main nor main found", file=sys.stderr)
            return 2

    if not _git(args.repo, "rev-list", "--no-merges", f"{base}..HEAD").split():
        print("no commits in range; nothing to check")
        return 0

    violations = find_violations(args.repo, base)
    if violations:
        print("Bot PR hygiene violations (AGENTS.md non-negotiable #10):")
        for violation in violations:
            print(f"  {violation}")
        print(
            "Push commits whose diff matches their message and addresses review feedback — "
            "or push nothing."
        )
        return 1
    print("no bot-commit hygiene violations in range")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
