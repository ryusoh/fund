"""Source of truth for SEC/EDGAR HTML rules.

This module centrally hosts the SEC/EDGAR domain rules used during financial-
report HTML parsing, for reuse by Fins processors. Engine should not depend
on these helpers directly.
"""

from __future__ import annotations

import re

from scripts.vendor.filings.engine.processors.text_utils import (
    normalize_whitespace as _normalize_whitespace,
)

_SECTION_HEADING_TABLE_PATTERN = re.compile(r"Item\s+\d+[A-Z]?\b.*[━──\-]{4,}", re.IGNORECASE)
_SEC_COVER_KEYWORDS = frozenset(
    {
        "annual report pursuant",
        "transition report pursuant",
        "section 13 or 15(d)",
        "securities exchange act",
        "commission file number",
    }
)
_EDGAR_HTML_START_PATTERN = re.compile(r"<html[\s>]", re.IGNORECASE)
_EDGAR_SGML_SUFFIX_PATTERN = re.compile(r"</TEXT>\s*</DOCUMENT>\s*$", re.IGNORECASE)


def strip_edgar_sgml_envelope(content: str) -> str:
    """Strip EDGAR SGML envelope tags.

    SEC EDGAR exhibit HTML may be wrapped in SGML metadata such as
    ``<DOCUMENT><TEXT>``. This function truncates to the real HTML start and
    removes the trailing SGML closing tags.

    Args:
        content: original HTML file content.

    Returns:
        HTML content with the SGML envelope removed; returned unchanged when no envelope is detected.

    Raises:
        None.
    """

    html_start = _EDGAR_HTML_START_PATTERN.search(content)
    if html_start and html_start.start() > 0:
        content = content[html_start.start() :]
        content = _EDGAR_SGML_SUFFIX_PATTERN.sub("", content)
    return content


def is_sec_section_heading_table(text: str) -> bool:
    """Judge whether text hits the SEC section horizontal-rule table pattern.

    This rule identifies TOC/heading tables shaped like
    ``Item 7. Management Discussion ----``; such tables are layout noise
    rather than data tables.

    Args:
        text: table text.

    Returns:
        whether it hits the SEC section horizontal-rule table pattern.

    Raises:
        None.
    """

    return bool(_SECTION_HEADING_TABLE_PATTERN.search(text))


def is_sec_cover_page_table(text: str) -> bool:
    """Judge whether table text is SEC cover-page metadata.

    The rule covers two kinds of low-value cover tables:
    1. cover keywords such as legal notices and registration information.
    2. checkbox-dense cover tables.

    Args:
        text: table text.

    Returns:
        whether it is an SEC cover-page metadata table.

    Raises:
        None.
    """

    normalized_text = _normalize_whitespace(text)
    lowered = normalized_text.lower()
    if any(keyword in lowered for keyword in _SEC_COVER_KEYWORDS):
        return True
    checkbox_count = normalized_text.count("☒") + normalized_text.count("☐")
    if checkbox_count >= 2 and checkbox_count / max(len(normalized_text.split()), 1) > 0.1:
        return True
    return False


def is_sec_layout_table(row_count: int, text: str) -> bool:
    """Judge whether a table should be treated as SEC layout noise.

    Args:
        row_count: table row count.
        text: table text.

    Returns:
        ``True`` when the table is a section horizontal-rule table or a small cover-metadata table.

    Raises:
        None.
    """

    normalized_text = _normalize_whitespace(text)
    if is_sec_section_heading_table(normalized_text):
        return True
    if row_count <= 5 and is_sec_cover_page_table(normalized_text):
        return True
    return False
