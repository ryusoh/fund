"""Worktree snapshot guard: don't rerun a failed gate on an unchanged tree.

A red gate (``make verify``, ``make precommit-fix``) over an untouched worktree
cannot go green — rerunning it only burns time. Take a snapshot before running
the gate, and check it before retrying::

    SNAP=$(python3 -m scripts.agents.gate_guard snapshot)
    make verify                                          # fails
    python3 -m scripts.agents.gate_guard check "$SNAP"   # unchanged -> exit 1, edit first

The fingerprint covers ``git status --porcelain``, the tracked diff against
``HEAD``, and the contents of untracked files, so any edit — staged, unstaged,
or to a brand-new file — changes it.
"""

from __future__ import annotations

import argparse
import hashlib
import subprocess
import sys
from pathlib import Path


def _git(repo: Path, *args: str) -> bytes:
    """Run a git command in ``repo`` and return raw stdout."""
    result = subprocess.run(
        ["git", *args],
        cwd=repo,
        capture_output=True,
        check=True,
    )
    return result.stdout


def worktree_fingerprint(repo: Path) -> str:
    """Return a hash of the worktree: status, tracked diff, untracked contents."""
    digest = hashlib.sha256()
    digest.update(_git(repo, "status", "--porcelain=v1", "-z"))
    digest.update(_git(repo, "diff", "HEAD", "--binary"))
    others = _git(repo, "ls-files", "--others", "--exclude-standard", "-z")
    for raw in sorted(others.split(b"\0")):
        if not raw:
            continue
        path = repo / raw.decode("utf-8", errors="surrogateescape")
        try:
            digest.update(raw)
            digest.update(path.read_bytes())
        except OSError:
            continue
    return digest.hexdigest()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Hash the worktree so a failed gate is not rerun on an unchanged tree.",
    )
    sub = parser.add_subparsers(dest="command", required=True)
    snap = sub.add_parser("snapshot", help="Print the current worktree fingerprint.")
    snap.add_argument("--repo", type=Path, default=Path.cwd())
    check = sub.add_parser(
        "check",
        help="Exit 0 if the worktree changed since SNAPSHOT, 1 if unchanged.",
    )
    check.add_argument("snapshot", help="Fingerprint from an earlier `snapshot` run.")
    check.add_argument("--repo", type=Path, default=Path.cwd())
    args = parser.parse_args(argv)

    try:
        fingerprint = worktree_fingerprint(args.repo)
    except FileNotFoundError:
        parser.error("git not found on PATH.")
    except subprocess.CalledProcessError as exc:
        parser.error(f"git failed ({' '.join(exc.cmd)}): {exc.stderr.decode().strip()}")

    if args.command == "snapshot":
        print(fingerprint)
        return 0
    if fingerprint == args.snapshot:
        print(
            "worktree unchanged since snapshot — edit something before rerunning the gate",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
