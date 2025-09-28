#!/usr/bin/env python3.11
"""Shared utilities for TWRR pipeline scripts."""

from __future__ import annotations

from pathlib import Path
from typing import List

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
AI_DIR = PROJECT_ROOT / 'ai'
CHANGELOG_PATH = AI_DIR / 'handoff' / 'CHANGELOG-AI.md'


def append_changelog_entry(step_name: str, artifacts: List[str], note: str = '') -> None:
    """
    Append an entry to the changelog if it doesn't already exist.

    Args:
        step_name: The step name (e.g., 'step-07_plot')
        artifacts: List of artifact paths to include in the changelog
        note: Optional note to add to the changelog entry
    """
    # Create bullet list from artifacts
    if note:
        bullet_list = '\n'.join(f'- {note} ({artifact})' for artifact in artifacts)
    else:
        bullet_list = '\n'.join(f'- Generated artifact ({artifact})' for artifact in artifacts)

    entry = f"\n\n### {step_name}\n{bullet_list}\n"

    if CHANGELOG_PATH.exists():
        # Check if this step entry already exists
        with CHANGELOG_PATH.open('r', encoding='utf-8') as f:
            existing_content = f.read()

        # If the step heading already exists, don't append
        if f"### {step_name}" in existing_content:
            print(f"Changelog entry for {step_name} already exists, skipping append.")
            return

        # Append the new entry
        with CHANGELOG_PATH.open('a', encoding='utf-8') as f:
            f.write(entry)
    else:
        CHANGELOG_PATH.write_text(entry, encoding='utf-8')
