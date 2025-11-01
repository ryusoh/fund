#!/usr/bin/env python3.11
"""Utilities for the TWRR pipeline."""

from __future__ import annotations

from typing import List


def append_changelog_entry(step_name: str, artifacts: List[str], note: str = '') -> None:
    """No-op placeholder kept for backward compatibility."""
    _ = (step_name, artifacts, note)
