"""Validate a commit subject against this repository's commit conventions.

Enforces Conventional Commits (``type(scope): summary``) and bans emoji and
routine-name prefixes, matching the "Commit and PR-title conventions" section
of AGENTS.md. The squash-merge uses the PR title as the commit subject, so the
commit-lint workflow runs this over the PR title.

Hard failures: emoji, routine-name prefix, non-conventional format, trailing
period. Subject length is reported as a warning only (it does not fail).

Usage::

    python3 -m scripts.agents.check_commit_message "fix(worker): tighten cors"
    printf '%s\\n' "$PR_TITLE" | python3 -m scripts.agents.check_commit_message --stdin
"""

from __future__ import annotations

import argparse
import re
import sys

TYPES = (
    "feat",
    "fix",
    "refactor",
    "perf",
    "test",
    "docs",
    "chore",
    "build",
    "ci",
    "revert",
    "style",
)
MAX_SUBJECT = 72

CONVENTIONAL = re.compile(r"^(?P<type>" + "|".join(TYPES) + r")(\([a-z0-9._/-]+\))?!?: \S.*$")
ROUTINE_PREFIX = re.compile(
    r"^(sentinel|typist|architect|bolt|janitor|palette|testpilot)\b",
    re.IGNORECASE,
)
EMOJI = re.compile(
    "["
    "\U0001f300-\U0001faff"
    "\U00002600-\U000027bf"
    "\U00002190-\U000021ff"
    "\U00002b00-\U00002bff"
    "\U0001f000-\U0001f0ff"
    "️"
    "]"
)


def validate(subject: str) -> list[str]:
    """Return hard-failure messages for ``subject`` (empty list means valid)."""
    subject = subject.strip()
    errors: list[str] = []
    if EMOJI.search(subject):
        errors.append("contains emoji; commit subjects must be plain text")
    if ROUTINE_PREFIX.match(subject):
        errors.append("starts with a routine name; use a Conventional Commit type instead")
    if not CONVENTIONAL.match(subject):
        errors.append(
            "not a Conventional Commit; expected 'type(scope): summary' with type in "
            + ", ".join(TYPES)
        )
    if subject.endswith("."):
        errors.append("subject must not end with a period")
    return errors


def warnings(subject: str) -> list[str]:
    """Return soft warnings that do not fail the check."""
    subject = subject.strip()
    if len(subject) > MAX_SUBJECT:
        return [f"subject is {len(subject)} chars; aim for {MAX_SUBJECT} or fewer"]
    return []


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate commit subjects.")
    parser.add_argument("subjects", nargs="*", help="Commit subjects to validate.")
    parser.add_argument("--stdin", action="store_true", help="Read subjects from stdin.")
    args = parser.parse_args(argv)

    subjects: list[str] = list(args.subjects)
    if args.stdin:
        subjects.extend(line for line in sys.stdin.read().splitlines() if line.strip())

    failed = False
    for subject in subjects:
        if subject.startswith(("Merge ", "Revert ")):
            continue
        errors = validate(subject)
        for warning in warnings(subject):
            print(f"warning: {subject}\n  - {warning}")
        if errors:
            failed = True
            print(f"INVALID: {subject}")
            for err in errors:
                print(f"  - {err}")
        else:
            print(f"ok: {subject}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
