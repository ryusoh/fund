"""Generic scalar conversion helpers for fins.

Provides optional integer parsing and optional text normalization functions
shared across fins submodules, avoiding duplicated definitions.
"""

from __future__ import annotations

from typing import SupportsInt, cast


def optional_int(value: object) -> int | None:
    """Safely converge an optional scalar to an integer.

    Args:
        value: raw scalar value; may be ``None``, an empty string, or anything convertible to an integer.

    Returns:
        the corresponding integer on successful parse; ``None`` when unparseable or empty.

    Raises:
        None.
    """

    if value in (None, ""):
        return None
    try:
        if isinstance(value, (int, float, str, bytes, bytearray)):
            return int(value)
        if hasattr(value, "__int__"):
            return int(cast(SupportsInt, value))
        return None
    except (TypeError, ValueError):
        return None


def int_or_zero(value: object) -> int:
    """Converge any optional scalar to an integer, falling back to 0 on failure.

    Args:
        value: raw scalar value.

    Returns:
        the corresponding integer on successful parse; otherwise ``0``.

    Raises:
        None.
    """

    normalized = optional_int(value)
    return normalized if normalized is not None else 0


def normalize_optional_text(value: object) -> str | None:
    """Normalize optional text: strip surrounding whitespace, collapse empty values to None.

    Args:
        value: raw value; may be ``None``, an empty string, or any ``str()``-able object.

    Returns:
        whitespace-stripped non-empty string; ``None`` when the value is ``None`` or empty after stripping.

    Raises:
        None.
    """

    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def require_non_empty_text(value: object, *, empty_error: Exception) -> str:
    """Normalize required text: only rejects `None` and whitespace-only strings.

    This function reuses the semantics of `normalize_optional_text()`:
    - `None` and strings that are empty after stripping are treated as missing;
    - any other value is kept after `str(...).strip()`, so `0` / `False`
      without being misjudged as empty.

    Args:
        value: raw value.
        empty_error: exception instance to raise when the value is missing.

    Returns:
        whitespace-stripped non-empty string.

    Raises:
        Exception: raises the caller-provided exception when the value is missing.
    """

    normalized = normalize_optional_text(value)
    if normalized is None:
        raise empty_error
    return normalized


__all__ = [
    "optional_int",
    "int_or_zero",
    "normalize_optional_text",
    "require_non_empty_text",
]
