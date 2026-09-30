"""SEC form-type normalization utilities.

This module provides the unified normalization function for SEC form types;
it is a leaf module shared by all processors:
- no processor dependencies (imports no processor), avoiding circular imports;
- covers all supported SEC form types (10-K/10-Q/20-F/8-K/6-K/DEF 14A/SC 13D/SC 13G and amendments).

Usage::

    from .form_type_utils import normalize_form_type
"""

from __future__ import annotations

import re
from typing import Optional

# ---------------------------------------------------------------------------
# SEC form-type normalization mapping
# ---------------------------------------------------------------------------
# Uppercase string with whitespace removed → standard format.
# Covers report-class forms (10-K/10-Q/20-F) and special forms (8-K/6-K/DEF 14A/SC 13D/SC 13G).
_FORM_TYPE_MAPPING: dict[str, str] = {
    # report-class forms
    "10K": "10-K",
    "10Q": "10-Q",
    "20F": "20-F",
    # special forms
    "6K": "6-K",
    "8K": "8-K",
    "8KA": "8-K/A",
    "8K/A": "8-K/A",
    "DEF14A": "DEF 14A",
    # SC 13D family
    "SC13D": "SC 13D",
    "SC13DA": "SC 13D/A",
    "SC13D/A": "SC 13D/A",
    "SCHEDULE13D": "SC 13D",
    "SCHEDULE13DA": "SC 13D/A",
    "SCHEDULE13D/A": "SC 13D/A",
    # SC 13G family
    "SC13G": "SC 13G",
    "SC13GA": "SC 13G/A",
    "SC13G/A": "SC 13G/A",
    "SCHEDULE13G": "SC 13G",
    "SCHEDULE13GA": "SC 13G/A",
    "SCHEDULE13G/A": "SC 13G/A",
}


def normalize_form_type(form_type: Optional[str]) -> Optional[str]:
    """Normalize an SEC form type.

    Accepts a form-type string in any format and returns the unified standard
    format. Covers all supported SEC form types (report-class + special forms).

    Normalization rules:
    1. ``None`` / pure whitespace → return ``None``
    2. remove all whitespace and look it up in the mapping table
    3. no mapping match → return the original value stripped and uppercased

    Args:
        form_type: raw form-type string.

    Returns:
        normalized form type; ``None`` when the input is empty.

    Examples:
        >>> normalize_form_type("10K")
        '10-K'
        >>> normalize_form_type(" def 14a ")
        'DEF 14A'
        >>> normalize_form_type(None) is None
        True
    """
    if form_type is None:
        return None
    stripped = str(form_type).strip()
    if not stripped:
        return None
    # remove all internal whitespace and uppercase for the mapping lookup
    compact = re.sub(r"\s+", "", stripped.upper())
    return _FORM_TYPE_MAPPING.get(compact, stripped.upper())
