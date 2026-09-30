"""Common helper for discovering XBRL companion files.

This module hosts the filename-discovery rules for XBRL companion files in a
filing directory, used by:
- processors to locate instance/schema/linkbase files when reading documents
- storage to answer "has an XBRL instance for a filing been persisted on disk"
  without exposing the underlying directory layout

The rules must stay a single source of truth, so processors and storage do not
each copy their own filename-matching logic.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional


def discover_xbrl_files(directory: Path) -> dict[str, Optional[Path]]:
    """Discover XBRL companion files.

    Args:
        directory: filing document directory.

    Returns:
        mapping of XBRL files, with keys `instance/schema/presentation/calculation/definition/label`.

    Raises:
        OSError: raised when the directory cannot be accessed.
    """

    instance = _first_existing(
        [
            sorted(directory.glob("*_htm.xml")),
            sorted(directory.glob("*_ins.xml")),
            _fallback_instance_files(directory),
        ]
    )
    schema = _first_existing([sorted(directory.glob("*.xsd"))])
    presentation = _first_existing([sorted(directory.glob("*_pre.xml"))])
    calculation = _first_existing([sorted(directory.glob("*_cal.xml"))])
    definition = _first_existing([sorted(directory.glob("*_def.xml"))])
    label = _first_existing([sorted(directory.glob("*_lab.xml"))])
    return {
        "instance": instance,
        "schema": schema,
        "presentation": presentation,
        "calculation": calculation,
        "definition": definition,
        "label": label,
    }


def has_xbrl_instance(directory: Path) -> bool:
    """Judge whether an XBRL instance file exists in the directory.

    Args:
        directory: filing document directory.

    Returns:
        `True` when a recognizable instance file exists, otherwise `False`.

    Raises:
        OSError: raised when the directory cannot be accessed.
    """

    return discover_xbrl_files(directory).get("instance") is not None


def _fallback_instance_files(directory: Path) -> list[Path]:
    """Fall back to locating the XBRL instance file.

    Args:
        directory: filing document directory.

    Returns:
        candidate instance file list.

    Raises:
        OSError: raised when the directory cannot be accessed.
    """

    candidates: list[Path] = []
    for file_path in sorted(directory.glob("*.xml")):
        lowered = file_path.name.lower()
        if any(token in lowered for token in ("_pre.xml", "_cal.xml", "_def.xml", "_lab.xml")):
            continue
        candidates.append(file_path)
    return candidates


def _first_existing(path_groups: list[list[Path]]) -> Optional[Path]:
    """Take the first existing path from a candidate list.

    Args:
        path_groups: candidate path groups.

    Returns:
        first usable path; `None` when none exists.

    Raises:
        RuntimeError: handled by the underlying caller when matching fails.
    """

    for group in path_groups:
        for file_path in group:
            if file_path.exists() and file_path.is_file():
                return file_path
    return None
