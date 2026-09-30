"""Shared text-processing utilities for the processor layer.

This module provides the low-level text-processing functions shared by all
processors, so the same text-normalization logic is not redefined in each
processor.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Optional


def normalize_whitespace(text: str) -> str:
    """Normalize whitespace: collapse runs of whitespace into a single space
    and strip leading/trailing whitespace.

    Implemented with ``str.split()`` + ``" ".join()``, equivalent to
    ``re.sub(r"\\s+", " ", text).strip()`` but faster.

    ``None`` and other non-string values are first converted with ``str``.

    Args:
        text: raw text.

    Returns:
        normalized text.
    """
    return " ".join(str(text or "").split())


def infer_suffix_from_uri(uri: str) -> str:
    """Infer a file suffix from a URI.

    Strip the scheme (e.g. ``https://``) and take the path suffix.

    Args:
        uri: resource URI or file path.

    Returns:
        lowercased suffix (e.g. ``".html"``); empty string when unrecognized.
    """
    raw = str(uri or "").strip()
    if not raw:
        return ""
    # Strip the scheme part (split returns the original string when there is no scheme)
    path_part = raw.split("://", 1)[-1]
    return Path(path_part).suffix.lower()


__all__ = [
    "PAGE_HEADER_NOISE_PATTERN",
    "PREVIEW_MAX_CHARS",
    "SECTION_REF_PATTERN",
    "TABLE_PLACEHOLDER_PATTERN",
    "TABLE_REF_PATTERN",
    "append_missing_table_placeholders",
    "clean_page_header_noise",
    "extract_table_refs_from_text",
    "extract_tail_sentence",
    "format_section_ref",
    "format_table_placeholder",
    "format_table_ref",
    "infer_caption_from_context",
    "infer_suffix_from_uri",
    "normalize_optional_string",
    "normalize_whitespace",
]

# ---------------------------------------------------------------------------
# General truncation constants
# ---------------------------------------------------------------------------
# Default maximum character count for section preview/context truncation
PREVIEW_MAX_CHARS: int = 200


def normalize_optional_string(value: Any) -> Optional[str]:
    """Normalize any value to an optional string.

    ``None``, empty strings, and other meaningless values uniformly return
    ``None``; other values are returned after whitespace normalization.

    Note: special float values such as ``float('nan')`` or ``pandas.NaT``
    are not handled; detect them separately before calling if needed.

    Args:
        value: any input value.

    Returns:
        normalized string; ``None`` for empty values.
    """
    if value is None:
        return None
    normalized = normalize_whitespace(str(value))
    return normalized or None


# ---------------------------------------------------------------------------
# Page-header noise removal and caption inference
# ---------------------------------------------------------------------------

# Adaptive footer-noise pattern: page number + "Table of Contents" + optional all-caps company name
PAGE_HEADER_NOISE_PATTERN = re.compile(
    r"\d+\s+Table\s+of\s+Contents"
    r"(?:\s+[A-Z][A-Z\s,.\-&]+?(?:INC|CORP|LLC|LTD|CO|LP)\.?(?=\s|$))?",
    re.IGNORECASE,
)

# Sentence boundary: period/semicolon followed by a space, or a newline
_TAIL_SENTENCE_BOUNDARY = re.compile(r"[.;]\s+|\n")


def extract_tail_sentence(text: str) -> Optional[str]:
    """Extract the last complete sentence or phrase at the end of the text.

    Uses period/semicolon/newline as delimiters and takes the trailing
    fragment. If the text ends with a colon, the full pre-colon phrase is
    kept.

    Args:
        text: cleaned preceding text.

    Returns:
        trailing sentence/phrase; the whole text when the start is already the beginning.
    """
    if not text:
        return None

    # Do not split on colons, because a whole sentence like "xxx as follows:" is a meaningful caption
    parts = _TAIL_SENTENCE_BOUNDARY.split(text)

    # Take the last non-empty part
    for candidate in reversed(parts):
        candidate = candidate.strip()
        if candidate:
            return candidate

    return None


def clean_page_header_noise(text: str) -> str:
    """Adaptively remove page-header/footer noise from text.

    Removes common header patterns from multi-page HTML documents:

    - ``"36 Table of Contents"``
    - ``"36 Table of Contents AMAZON.COM, INC."``

    All patterns are detected adaptively (regex matching) and do not depend
    on any specific company name.

    Args:
        text: text to clean (usually ``context_before``).

    Returns:
        cleaned text; returned unchanged when empty or noise-free.
    """
    if not text:
        return text
    cleaned = PAGE_HEADER_NOISE_PATTERN.sub("", text)
    # Repeated substitutions may leave extra whitespace
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip()
    return cleaned


# Caption inference length upper bound: beyond this the text is body prose, not a title
_CAPTION_MAX_LEN = 200
# Caption inference length lower bound: shorter than this is meaningless
_CAPTION_MIN_LEN = 5


def infer_caption_from_context(context_before: str) -> Optional[str]:
    """Infer a short caption from the table's preceding text.

    When the HTML ``<caption>`` tag is absent, try to extract a short,
    meaningful descriptive phrase from the end of ``context_before`` as an
    automatic caption.

    Adaptive strategy (no business-domain hard-coded rules):

    1. Remove footer noise (page number + "Table of Contents" and other
       adaptive patterns).
    2. Extract the last sentence/phrase (delimited by period/semicolon/newline).
    3. Reject the phrase if it is too long (>200 characters counts as body
       prose rather than a title).

    Args:
        context_before: text preceding the table (usually at most 200 characters).

    Returns:
        inferred caption; ``None`` when it cannot be inferred.
    """
    if not context_before or not context_before.strip():
        return None

    text = context_before.strip()

    # ── Adaptively remove footer/header noise ──
    text = PAGE_HEADER_NOISE_PATTERN.sub("", text).strip()

    if not text:
        return None

    # ── Extract the trailing sentence/phrase ──
    tail = extract_tail_sentence(text)
    if not tail:
        return None

    # Too long means it is body prose rather than a title
    if len(tail) > _CAPTION_MAX_LEN:
        return None

    # Too short to be meaningful (a single word or symbol)
    if len(tail) < _CAPTION_MIN_LEN:
        return None

    return tail


# ---------------------------------------------------------------------------
# ref formatting
# ---------------------------------------------------------------------------

SECTION_REF_PATTERN = re.compile(r"^s_\d{4}$")
"""Section reference matching pattern."""

TABLE_REF_PATTERN = re.compile(r"^t_\d{4}$")
"""Table reference matching pattern."""

TABLE_PLACEHOLDER_PATTERN = re.compile(r"\[\[(t_\d{4})\]\]")
"""Table placeholder matching pattern."""


def format_section_ref(index: int) -> str:
    """Generate a section reference in ``s_NNNN`` format.

    Args:
        index: section ordinal (>= 1).

    Returns:
        formatted citation string.

    Raises:
        ValueError: raised when ``index`` < 1.
    """
    if index < 1:
        raise ValueError(f"section index must be positive; current value: {index}")
    return f"s_{index:04d}"


def format_table_ref(index: int) -> str:
    """Generate a table reference in ``t_NNNN`` format.

    Args:
        index: table ordinal (>= 1).

    Returns:
        formatted citation string.

    Raises:
        ValueError: raised when ``index`` < 1.
    """
    if index < 1:
        raise ValueError(f"table index must be positive; current value: {index}")
    return f"t_{index:04d}"


def format_table_placeholder(table_ref: str) -> str:
    """Generate the table placeholder text.

    Args:
        table_ref: table reference.

    Returns:
        A placeholder in ``[[t_NNNN]]`` form.

    Raises:
        ValueError: raised when `table_ref` is empty.
    """

    normalized_ref = normalize_optional_string(table_ref)
    if normalized_ref is None:
        raise ValueError("table_ref must not be empty")
    return f"[[{normalized_ref}]]"


def extract_table_refs_from_text(content: str) -> list[str]:
    """Extract table references from text.

    Args:
        content: text to scan.

    Returns:
        table reference list deduplicated in occurrence order.

    Raises:
        None.
    """

    refs: list[str] = []
    for match in TABLE_PLACEHOLDER_PATTERN.finditer(str(content or "")):
        ref = match.group(1)
        if ref not in refs:
            refs.append(ref)
    return refs


def append_missing_table_placeholders(content: str, missing_refs: list[str]) -> str:
    """Backfill missing table placeholders at the text tail.

    Args:
        content: original text.
        missing_refs: list of missing table references.

    Returns:
        text after placeholder appending.

    Raises:
        None.
    """

    normalized_content = str(content or "")
    placeholders = [
        format_table_placeholder(ref)
        for ref in missing_refs
        if format_table_placeholder(ref) not in normalized_content
    ]
    if not placeholders:
        return normalized_content
    suffix = "\n".join(placeholders)
    if normalized_content:
        return f"{normalized_content}\n{suffix}".strip()
    return suffix
