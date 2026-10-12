"""Workspace-relative path helpers (vendored subset).

Declares the stable on-disk locations used by the SEC download path
(cache and throttle state) under the workspace's hidden state directory.
"""

from __future__ import annotations

from pathlib import Path

STATE_ROOT_RELATIVE_DIR = Path(".filings")
SEC_CACHE_RELATIVE_DIR = STATE_ROOT_RELATIVE_DIR / "sec_cache"
SEC_THROTTLE_RELATIVE_DIR = STATE_ROOT_RELATIVE_DIR / "sec_throttle"


def build_sec_cache_dir(workspace_root: Path) -> Path:
    """Return the SEC cache directory for the given workspace root."""
    return workspace_root / SEC_CACHE_RELATIVE_DIR


def build_sec_throttle_dir(workspace_root: Path) -> Path:
    """Return the SEC throttle-state directory for the given workspace root."""
    return workspace_root / SEC_THROTTLE_RELATIVE_DIR


__all__ = [
    "STATE_ROOT_RELATIVE_DIR",
    "SEC_CACHE_RELATIVE_DIR",
    "SEC_THROTTLE_RELATIVE_DIR",
    "build_sec_cache_dir",
    "build_sec_throttle_dir",
]
