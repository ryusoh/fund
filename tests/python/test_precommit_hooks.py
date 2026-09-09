#!/usr/bin/env python3
"""Guard local pre-commit hooks against two silent no-op failure modes.

Found in the 2026-09-09 retro: three "staged files" hooks (prettier, eslint,
stylelint) passed for months while checking nothing.

1. Single-quoted YAML does not process backslash escapes, so
   `files: '\\\\.(js|...)$'` is a regex matching a literal backslash — it never
   matches a real path and pre-commit reports "(no files to check) Skipped".
2. `bash -lc '<script>'` binds the first filename pre-commit appends to $0;
   a script that never references `"$@"` drops every filename, so the tool
   runs on zero files (eslint exits 0 having linted nothing).

Text-parsed like test_twrr_refresh_workflow.py — no YAML dependency, and the
bugs being guarded against are textual.
"""

from pathlib import Path

import pytest

CONFIG = Path(".pre-commit-config.yaml")


def _lines() -> list[str]:
    if not CONFIG.exists():
        pytest.skip(f"pre-commit config not found: {CONFIG}")
    return CONFIG.read_text().splitlines()


def _hook_blocks() -> list[list[str]]:
    blocks: list[list[str]] = []
    for line in _lines():
        stripped = line.strip()
        if stripped.startswith("- id:"):
            blocks.append([stripped])
        elif blocks:
            blocks[-1].append(stripped)
    return blocks


def test_file_regexes_have_no_literal_backslashes() -> None:
    """Single-quoted YAML keeps backslashes literal; `'\\\\.'` is not `'.'`."""
    for line in _lines():
        stripped = line.strip()
        if stripped.startswith(("files:", "exclude:")) and "|" not in stripped:
            assert "\\\\" not in stripped, (
                f"line {stripped!r} contains a literal double backslash — "
                "single-quoted YAML does not unescape it, so the regex can "
                "never match a real path"
            )


def test_bash_lc_hooks_receive_filenames() -> None:
    """File-consuming bash -lc hooks must reference "$@" and reserve $0.

    A trailing ` --` placeholder after the script keeps the first appended
    filename out of "$@" (bash -lc binds it to $0 instead).
    """
    for block in _hook_blocks():
        entry = next((ln for ln in block if ln.startswith("entry: bash -lc '")), None)
        if entry is None or "pass_filenames: false" in block:
            continue
        assert '"$@"' in entry, (
            f"hook {block[0]}: entry never references \"$@\" — pre-commit "
            "appends filenames after the script, so the tool runs on zero "
            "files and the hook is a silent no-op"
        )
        assert entry.endswith("' --"), (
            f"hook {block[0]}: entry must end with ' -- so the first "
            "appended filename lands in $0 instead of being dropped from "
            "\"$@\""
        )
