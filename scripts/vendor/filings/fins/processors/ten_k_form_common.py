"""Shared 10-K form constants and marker-building logic.

This module extracts 10-K-related shared constants and marker functions for use
by both ``TenKFormProcessor`` (the edgartools route) and
``BsTenKFormProcessor`` (the BeautifulSoup route).

Both processors import from this module without depending on each other,
keeping the architectures independent.
"""

from __future__ import annotations

import re
from typing import Optional

from scripts.vendor.filings.engine.processors.text_utils import (
    PREVIEW_MAX_CHARS as _PREVIEW_MAX_CHARS,
)
from scripts.vendor.filings.engine.processors.text_utils import (
    normalize_whitespace as _normalize_whitespace,
)

from .sec_form_section_common import (
    SIGNATURE_PATTERN as _SIGNATURE_PATTERN,
)
from .sec_form_section_common import (
    _dedupe_markers,
    _find_marker_after,
    _VirtualSection,
)
from .sec_report_form_common import (
    _find_table_of_contents_cutoff,
    _looks_like_inline_toc_snippet,
    _looks_like_toc_page_line_generic,
    _select_ordered_item_markers_after_toc,
)

_TEN_K_ITEM_ORDER = (
    "1",
    "1A",
    "1B",
    "1C",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "7A",
    "8",
    "9",
    "9A",
    "9B",
    "9C",
    "10",
    "11",
    "12",
    "13",
    "14",
    "15",
)
# Keywords of common statutory 10-K Item titles (used to recognize "number-only + title" heading forms).
# This rule is based on the SEC Form 10-K Item system and does not depend on company-specific spellings.
_TEN_K_NUMBERED_HEADING_KEYWORDS = (
    "business",
    "risk factors",
    "cybersecurity",
    "properties",
    "legal proceedings",
    "mine safety",
    "market for",
    "management",
    "quantitative",
    "financial statements",
    "changes in and disagreements",
    "controls and procedures",
    "selected financial",
    "directors",
    "executive compensation",
    "security ownership",
    "certain relationships",
    "principal accountant",
    "exhibits",
)
# Real 10-K MD&A headings often have curly/omitted-quote variants:
# ``Management's`` / ``Management’s`` / ``Managements``.
_APOSTROPHE_CHARS_PATTERN = "'’‘`´"
_MANAGEMENT_POSSESSIVE_PATTERN = rf"management(?:\s*[{_APOSTROPHE_CHARS_PATTERN}]\s*)?s?"
# Compatible with the three heading formats "Item 1. ..." / "Item 1 — ..." / "Item 1 Business ...";
# the unpunctuated format requires the next character to be a letter, to avoid hitting noise tokens
# like cover-page checkboxes.
_TEN_K_ITEM_PATTERN = re.compile(
    r"(?im)"
    r"(?:\bitem\s+(1A|1B|1C|7A|9A|9B|9C|1[0-5]|[1-9])"
    r"(?:\s*[\.\:\-\u2013\u2014]\s*|\s+(?=[A-Za-z])))"
    r"|(?:^|\n)\s*(1A|1B|1C|7A|9A|9B|9C|1[0-5]|[1-9])\s*"
    r"(?:[\.\:\-\u2013\u2014]\s*|\s+)"
    r"(?=(?:"
    + "|".join(re.escape(keyword) for keyword in _TEN_K_NUMBERED_HEADING_KEYWORDS)
    + r")\b)"
)
_TEN_K_PART_PATTERN = re.compile(r"(?i)part\s+(I{1,3}|IV)\b")
_TEN_K_HEADING_FALLBACK_PATTERNS: dict[str, tuple[re.Pattern[str], ...]] = {
    "1": (re.compile(r"(?im)^\s*Business\s*$"),),
    "1A": (re.compile(r"(?im)^\s*Risk Factors\s*$"),),
    "1C": (re.compile(r"(?im)^\s*Cybersecurity\s*$"),),
    "7": (
        re.compile(
            rf"(?im)^\s*{_MANAGEMENT_POSSESSIVE_PATTERN}\s+Discussion and Analysis"
            r"(?: of Financial Condition and Results of Operations)?\s*$"
        ),
    ),
    "7A": (
        re.compile(r"(?im)^\s*Quantitative and Qualitative Disclosures About Market Risk\s*$"),
        re.compile(r"(?im)^\s*Quantitative and Qualitative Disclosures About Market Risks\s*$"),
        re.compile(r"(?im)^\s*Quantitative and Qualitative Disclosures About Risk\s*$"),
    ),
    "8": (
        re.compile(r"(?im)^\s*Financial Statements(?: and Supplementary Data)?\s*$"),
        re.compile(r"(?im)^\s*Consolidated Financial Statements(?: and Supplementary Data)?\s*$"),
    ),
}
_TEN_K_HEADING_FALLBACK_SEARCH_PATTERNS: dict[str, tuple[re.Pattern[str], ...]] = {
    "1": (re.compile(r"(?i)\bbusiness\b"),),
    "1A": (re.compile(r"(?i)\brisk factors\b"),),
    "1C": (re.compile(r"(?i)\bcybersecurity\b"),),
    "7": (
        re.compile(
            rf"(?i)\b{_MANAGEMENT_POSSESSIVE_PATTERN}\s+discussion and analysis"
            r"(?: of financial condition and results of operations)?\b"
        ),
    ),
    "7A": (
        re.compile(r"(?i)\bquantitative and qualitative disclosures about market risk\b"),
        re.compile(r"(?i)\bquantitative and qualitative disclosures about market risks\b"),
        re.compile(r"(?i)\bquantitative and qualitative disclosures about risk\b"),
    ),
    "8": (
        re.compile(r"(?im)^\s*consolidated financial statements(?: and supplementary data)?\s*$"),
        re.compile(r"(?i)\bfinancial statements(?: and supplementary data)?\b"),
        re.compile(r"(?i)\bconsolidated financial statements(?: and supplementary data)?\b"),
    ),
}
_TEN_K_HEADING_FALLBACK_REQUIRED_ITEMS = ("1A", "7", "8")
# Trailing ToC/index detection threshold: when the total span of all markers as a
# proportion of the document length is below this value, judge as a trailing Item
# index (rather than body section boundaries) and trigger the heading fallback.
# Normal 10-K body marker spans are usually > 80%; MCD-style embedded annual
# reports have trailing indexes < 2%.
_TRAILING_TOC_SPAN_RATIO = 0.05

# Minimum section span (chars) for heading-fallback markers: when the gap between
# two consecutive markers is below this value, judge the former as a ToC entry
# rather than a body section boundary, triggering a skip and a search for the next match.
_MIN_HEADING_SECTION_SPAN = 500

_TOC_PAGE_LINE_PATTERN = re.compile(r"(?im)^\s*[A-Za-z][^\n]{0,220}\b\d{1,3}\s*$")
_TOC_PAGE_SNIPPET_PATTERN = re.compile(
    r"(?is)^\s*(?:item\s+(?:1A|1B|1C|7A|9A|9B|9C|1[0-5]|[1-9])\s*[\.\:\-\u2013\u2014]?\s*)?"
    r"[A-Za-z][^\n]{0,220}\b\d{1,3}\b(?:\s+item\s+(?:1A|1B|1C|7A|9A|9B|9C|1[0-5]|[1-9])\b|\s*$)"
)
_ITEM_7_CROSS_REFERENCE_PATTERN = re.compile(
    r"(?is)\b(?:in|to|see)\s+(?:part\s+ii\s*,\s*)?item\s+7\b"
)
_TEN_K_HEADING_PREFIX_WORD_RE = re.compile(r"[A-Za-z]{2,}")
_TEN_K_HEADING_PREFIX_ENUM_RE = re.compile(
    r"(?i)(?:^|[\s(])(?:item\s+(?:1A|1B|1C|7A|9A|9B|9C|1[0-5]|[1-9])|part\s+(?:i{1,3}|iv)|[A-D])\s*[\.\-–—:)]?\s*$"
)
_TEN_K_VIRTUAL_SECTION_ITEM_RE = re.compile(r"(?i)\bitem\s+(1A|1B|1C|7A|9A|9B|9C|1[0-5]|[1-9])\b")
_TEN_K_BY_REFERENCE_STUB_RE = re.compile(
    r"(?is)\b(?:information\s+in\s+response\s+to\s+this\s+item\b.*?|that\s+information\b.*?)?"
    r"\bincorporat(?:ed|es)\b.*?\bby\s+reference\b"
)
_TEN_K_REFERENCE_HEADING_RE = re.compile(
    r"(?is)\bunder\s+(?:the\s+)?headings?\s+([\"“][^\"”]{3,160}[\"”](?:\s*(?:,|and)\s*[\"“][^\"”]{3,160}[\"”])*)"
)
_TEN_K_QUOTED_TEXT_RE = re.compile(r"[\"“]([^\"”]{3,160})[\"”]")
_TEN_K_HEADING_STUB_LINE_RE = re.compile(
    r"(?im)^\s*[A-Za-z][A-Za-z0-9 '&’,/\-]{3,120}\s*(?:\d{1,3}(?:\s*[—–-]\s*\d{1,3})?)?\s*$"
)
_TEN_K_PAGE_LOCATOR_STUB_LINE_RE = re.compile(
    r"(?im)^\s*(?:\d{1,3}(?:\s*[—–,\-]\s*\d{1,3})*|[—–,\-])\s*$"
)
_TEN_K_STUB_MAX_WORDS = 64
_TEN_K_STUB_MAX_BODY_WORDS = 24
_TEN_K_MIN_EXPANDED_WORDS = 80
_TEN_K_MIN_EXPANDED_GROWTH = 2.5
_TEN_K_FALLBACK_DIRECTIONAL_SEARCH_MAX = 12
_TEN_K_BY_REFERENCE_WINDOW_MAX_CHARS = 1600
_TEN_K_TOC_CONTEXT_LOOKAROUND_CHARS = 240
_TEN_K_TOC_CONTEXT_PROBE_LOOKAROUND_CHARS = 120
_TEN_K_TOC_CONTEXT_MIN_PAGE_REFS = 3
_TEN_K_TOC_PAGE_REFERENCE_RE = re.compile(r"(?<![\d,])\d{1,3}(?:\s*[–—-]\s*\d{1,3})?(?![\d,])")
_TEN_K_HEADING_BODY_LOOKAHEAD_CHARS = 520
_TEN_K_HEADING_BODY_WORD_WINDOW_CHARS = 360
_TEN_K_HEADING_BODY_MIN_WORDS = 24
_TEN_K_HEADING_BODY_SKIP_RE = re.compile(
    r"(?is)^\s*(?:table\s+of\s+contents|index\s+to\s+financial\s+statements|page|see\s+page)\b[\s:.-]*"
)
_TEN_K_HEADING_TRANSLATION_TABLE = str.maketrans(
    {
        "’": "'",
        "‘": "'",
        "`": "'",
        "´": "'",
        "“": '"',
        "”": '"',
        "—": "-",
        "–": "-",
        "\xa0": " ",
    }
)

# SEC regulatory rule: statutory Item -> Part mapping for Form 10-K
# Reference: SEC Regulation S-K (17 CFR Part 229)
# Part I: Items 1, 1A, 1B, 1C, 2 (Properties), 3 (Legal Proceedings), 4 (Mine Safety)
# Part II: Items 5–9C
# Part III: Items 10–14
# Part IV: Items 15–16
_TEN_K_ITEM_PART_MAP: dict[str, str] = {
    "1": "I",
    "1A": "I",
    "1B": "I",
    "1C": "I",
    "2": "I",
    "3": "I",
    "4": "I",
    "5": "II",
    "6": "II",
    "7": "II",
    "7A": "II",
    "8": "II",
    "9": "II",
    "9A": "II",
    "9B": "II",
    "9C": "II",
    "10": "III",
    "11": "III",
    "12": "III",
    "13": "III",
    "14": "III",
    "15": "IV",
    "16": "IV",
}

_TEN_K_BY_REFERENCE_DEFAULT_HEADINGS: dict[str, tuple[str, ...]] = {
    "1A": ("Risk Factors",),
    "7": (
        "Management's Discussion and Analysis",
        "Management’s Discussion and Analysis",
        "Financial Review",
        "Operating and Financial Review",
    ),
    "7A": (
        "Quantitative and Qualitative Disclosures About Market Risk",
        "Quantitative and Qualitative Disclosures About Market Risks",
        "Corporate Risk Profile",
        "Asset/Liability Management",
        "Risk Management",
    ),
    "8": (
        "Financial Statements and Supplementary Data",
        "Financial Statements",
        "Consolidated Financial Statements",
        "Notes to Financial Statements",
        "Notes to Consolidated Financial Statements",
        "Report of Management",
    ),
}
_TEN_K_ITEM_7_ALIAS_TITLE_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"(?im)^\s*overview\s*(?:and|&)\s*outlook\s*$"),
)


def _build_ten_k_markers(full_text: str) -> list[tuple[int, Optional[str]]]:
    """Build the 10-K Part + Item boundaries.

    Args:
        full_text: full document text.

    Returns:
        marker list; an empty list triggers the parent-class fallback when markers are insufficient.

    Raises:
        RuntimeError: raised when the build fails.
    """

    item_markers = _select_ordered_item_markers_after_toc(
        full_text,
        item_pattern=_TEN_K_ITEM_PATTERN,
        ordered_tokens=_TEN_K_ITEM_ORDER,
        min_items_after_toc=4,
    )
    # Trailing ToC/index detection: if all markers cluster in a tiny document region
    # (< 5%), we hit a trailing Item index rather than body section boundaries.
    # Strategy: try the heading fallback first (searching before the index region);
    # if the heading fallback succeeds (>= 3 key Items) adopt it directly, skipping the
    # subsequent repair and the global heading fallback (the latter has no end_at and
    # would pollute the body markers);
    # if it fails, keep the original trailing markers and continue the normal flow (C / GE / MS scenarios).
    _trailing_heading_used = False
    if len(item_markers) >= 2:
        marker_span = item_markers[-1][1] - item_markers[0][1]
        if marker_span < len(full_text) * _TRAILING_TOC_SPAN_RATIO:
            trailing_toc_start = item_markers[0][1]
            heading_markers = _select_ten_k_heading_fallback_markers(
                full_text,
                end_at=trailing_toc_start,
            )
            if len(heading_markers) >= 3:
                # title fallback succeeded; use the body heading marker directly
                item_markers = heading_markers
                _trailing_heading_used = True
            # otherwise keep the original trailing markers and continue with the repair flow below
    if not _trailing_heading_used:
        # only run repair + global fallback on the non-trailing-heading path
        item_markers = _repair_ten_k_key_items_with_heading_fallback(full_text, item_markers)
        if len(item_markers) < 4:
            item_markers = _select_ten_k_heading_fallback_markers(full_text)
    if len(item_markers) < 3:
        return []

    part_markers = _build_part_markers(full_text)
    markers: list[tuple[int, Optional[str]]] = []
    for item_token, position in item_markers:
        part_title = _resolve_part_title(part_markers, position)
        # Step 8: fix/complete Part labels using SEC regulatory rules
        part_title = _correct_part_from_sec_rules(item_token, part_title)
        if part_title is None:
            title = f"Item {item_token}"
        else:
            title = f"{part_title} - Item {item_token}"
        markers.append((position, title))

    furthest_item_position = max(position for _, position in item_markers)
    signature_marker = _find_marker_after(
        _SIGNATURE_PATTERN,
        full_text,
        furthest_item_position,
        "SIGNATURE",
    )
    if signature_marker is not None:
        markers.append(signature_marker)
    return _dedupe_markers(markers)


def expand_ten_k_virtual_sections_content(
    *,
    full_text: str,
    virtual_sections: list[_VirtualSection],
) -> None:
    """Fix ToC stubs and by-reference stubs in 10-K virtual sections.

    The goal is not to change the statutory Item skeleton, but to replace the
    hollow content of ``Item 1A/7/7A/8`` with more trustworthy body fragments
    from the same filing, while preserving section order.

    Two real scenarios are handled:
    1. ToC mis-split: the section body contains only a title and a page range;
    2. incorporated-by-reference wrapper sentences: the statutory Item only says
       "see heading X in the Annual Report", and
       the real body lives elsewhere in the same document.

    Args:
        full_text: full text to split.
        virtual_sections: built virtual-section list.

    Returns:
        None.

    Raises:
        RuntimeError: raised when the fix fails.
    """

    if not full_text or not virtual_sections:
        return

    fallback_positions = _find_ten_k_heading_fallback_positions(full_text)
    section_by_token = _collect_ten_k_virtual_item_sections(virtual_sections)
    if not section_by_token:
        return

    replacement_starts: dict[str, int] = {}
    for token in ("1A", "7", "7A", "8"):
        section = section_by_token.get(token)
        if section is None:
            continue
        is_heading_stub = _looks_like_ten_k_heading_stub(section.content)
        replacement = _resolve_ten_k_virtual_section_replacement_start(
            full_text=full_text,
            token=token,
            section=section,
            fallback_positions=fallback_positions,
        )
        if replacement is None:
            if is_heading_stub:
                replacement_starts[token] = section.start
            continue
        replacement_starts[token] = replacement

    if not replacement_starts:
        _recover_missing_ten_k_item_7_from_alias_heading(
            full_text=full_text,
            virtual_sections=virtual_sections,
        )
        return

    ordered_sections = [
        (token, section_by_token[token])
        for token in ("1A", "7", "7A", "8")
        if token in section_by_token
    ]
    boundary_starts = _collect_ten_k_replacement_boundary_starts(
        ordered_sections=ordered_sections,
        replacement_starts=replacement_starts,
    )
    for index, (token, section) in enumerate(ordered_sections):
        replacement_start = replacement_starts.get(token)
        if replacement_start is None:
            continue
        replacement_end = _resolve_ten_k_virtual_section_replacement_end(
            token=token,
            replacement_start=replacement_start,
            ordered_sections=ordered_sections,
            ordered_index=index,
            replacement_starts=replacement_starts,
            boundary_starts=boundary_starts,
        )
        if replacement_end is None or replacement_end <= replacement_start:
            continue
        replacement_content = full_text[replacement_start:replacement_end].strip()
        if not _should_apply_ten_k_virtual_section_replacement(
            current_content=section.content,
            replacement_content=replacement_content,
        ):
            continue
        section.content = replacement_content
        section.preview = _normalize_whitespace(replacement_content)[:_PREVIEW_MAX_CHARS]
        section.start = replacement_start
        section.end = replacement_end

    _recover_missing_ten_k_item_7_from_alias_heading(
        full_text=full_text,
        virtual_sections=virtual_sections,
    )


def _collect_ten_k_virtual_item_sections(
    virtual_sections: list[_VirtualSection],
) -> dict[str, _VirtualSection]:
    """Extract the top-level virtual sections for key 10-K Items.

    Args:
        virtual_sections: virtual-section list.

    Returns:
        ``item_token -> _VirtualSection`` mapping.

    Raises:
        RuntimeError: raised when the extraction fails.
    """

    mapping: dict[str, _VirtualSection] = {}
    for section in virtual_sections:
        if section.level != 1:
            continue
        title = str(section.title or "")
        match = _TEN_K_VIRTUAL_SECTION_ITEM_RE.search(title)
        if match is None:
            continue
        token = str(match.group(1) or "").upper()
        if token:
            mapping[token] = section
    return mapping


def _collect_ten_k_top_level_sections(
    virtual_sections: list[_VirtualSection],
) -> list[_VirtualSection]:
    """Return the top-level virtual sections sorted by start position."""

    return sorted(
        (section for section in virtual_sections if section.level == 1),
        key=lambda section: (section.start, section.ref),
    )


def _recover_missing_ten_k_item_7_from_alias_heading(
    *,
    full_text: str,
    virtual_sections: list[_VirtualSection],
) -> None:
    """Recover a missing Item 7 from structured alias subheadings.

    A few 10-Ks go straight into the MD&A body after Item 6, keeping only
    subheadings like ``Overview and Outlook`` and never repeating the statutory
    ``Item 7`` heading, so a large body segment gets swallowed by the previous section.

    This fix triggers only when all of the following hold:
    - the top level is missing Item 7;
    - later Part II key boundaries such as Item 7A / 8 already exist;
    - the previous top-level section contains MD&A structured-subheading aliases;
    - the alias has enough body length between it and the next boundary.

    Args:
        full_text: full document text.
        virtual_sections: virtual-section list.

    Returns:
        None.

    Raises:
        RuntimeError: raised when the recovery fails.
    """

    if not full_text or not virtual_sections:
        return

    section_by_token = _collect_ten_k_virtual_item_sections(virtual_sections)
    if "7" in section_by_token:
        return

    top_level_sections = _collect_ten_k_top_level_sections(virtual_sections)
    if not top_level_sections:
        return

    boundary_section = _find_ten_k_item_7_boundary_section(top_level_sections)
    if boundary_section is None:
        return

    previous_section = _find_ten_k_previous_top_level_section(
        top_level_sections=top_level_sections,
        boundary_start=boundary_section.start,
    )
    if previous_section is None:
        return

    alias_section = _find_ten_k_item_7_alias_child_section(
        virtual_sections=virtual_sections,
        parent_section=previous_section,
        boundary_start=boundary_section.start,
    )
    if alias_section is None:
        return

    recovered_content = full_text[alias_section.start : boundary_section.start].strip()
    if len(recovered_content.split()) < _TEN_K_MIN_EXPANDED_WORDS:
        return

    _trim_ten_k_section_to_boundary(
        section=previous_section,
        full_text=full_text,
        new_end=alias_section.start,
    )
    recovered_ref = _allocate_ten_k_recovered_section_ref(
        virtual_sections=virtual_sections,
        base_ref="s_recovered_item7",
    )
    recovered_section = _VirtualSection(
        ref=recovered_ref,
        title="Part II - Item 7",
        content=recovered_content,
        preview=_normalize_whitespace(recovered_content)[:_PREVIEW_MAX_CHARS],
        table_refs=[],
        level=1,
        parent_ref=None,
        child_refs=[],
        start=alias_section.start,
        end=boundary_section.start,
    )
    _reparent_ten_k_child_sections(
        virtual_sections=virtual_sections,
        previous_section=previous_section,
        recovered_section=recovered_section,
    )
    virtual_sections.append(recovered_section)
    virtual_sections.sort(key=lambda section: (section.start, section.level, section.ref))


def _find_ten_k_item_7_boundary_section(
    top_level_sections: list[_VirtualSection],
) -> Optional[_VirtualSection]:
    """Locate the next Part II boundary usable when Item 7 is missing."""

    for section in top_level_sections:
        title = str(section.title or "")
        match = _TEN_K_VIRTUAL_SECTION_ITEM_RE.search(title)
        if match is None:
            continue
        token = str(match.group(1) or "").upper()
        if token in {"7A", "8", "9", "9A", "9B", "9C", "10", "15"}:
            return section
    return None


def _find_ten_k_previous_top_level_section(
    *,
    top_level_sections: list[_VirtualSection],
    boundary_start: int,
) -> Optional[_VirtualSection]:
    """Return the nearest top-level section before the boundary."""

    previous: Optional[_VirtualSection] = None
    for section in top_level_sections:
        if section.start >= boundary_start:
            break
        previous = section
    return previous


def _find_ten_k_item_7_alias_child_section(
    *,
    virtual_sections: list[_VirtualSection],
    parent_section: _VirtualSection,
    boundary_start: int,
) -> Optional[_VirtualSection]:
    """Find Item 7 alias subheadings inside an absorbed large section."""

    candidates: list[_VirtualSection] = []
    for section in virtual_sections:
        if section.level != 2:
            continue
        if section.start <= parent_section.start or section.start >= boundary_start:
            continue
        title = str(section.title or "")
        if any(pattern.search(title) is not None for pattern in _TEN_K_ITEM_7_ALIAS_TITLE_PATTERNS):
            candidates.append(section)
    if not candidates:
        return None
    candidates.sort(key=lambda section: (section.start, section.ref))
    return candidates[0]


def _trim_ten_k_section_to_boundary(
    *,
    section: _VirtualSection,
    full_text: str,
    new_end: int,
) -> None:
    """Truncate the absorbed previous top-level section at the new boundary."""

    if new_end <= section.start:
        return
    trimmed_content = full_text[section.start : new_end].strip()
    section.content = trimmed_content
    section.preview = _normalize_whitespace(trimmed_content)[:_PREVIEW_MAX_CHARS]
    section.end = new_end


def _allocate_ten_k_recovered_section_ref(
    *,
    virtual_sections: list[_VirtualSection],
    base_ref: str,
) -> str:
    """Assign a unique ref to a recovered top-level section."""

    existing_refs = {section.ref for section in virtual_sections}
    if base_ref not in existing_refs:
        return base_ref
    index = 1
    while True:
        candidate = f"{base_ref}_{index:02d}"
        if candidate not in existing_refs:
            return candidate
        index += 1


def _reparent_ten_k_child_sections(
    *,
    virtual_sections: list[_VirtualSection],
    previous_section: _VirtualSection,
    recovered_section: _VirtualSection,
) -> None:
    """Migrate child sections within the recovery range under the newly created Item 7."""

    moved_child_refs: list[str] = []
    retained_child_refs: list[str] = []
    for child_ref in previous_section.child_refs:
        child = next((section for section in virtual_sections if section.ref == child_ref), None)
        if child is None:
            retained_child_refs.append(child_ref)
            continue
        if recovered_section.start <= child.start < recovered_section.end:
            child.parent_ref = recovered_section.ref
            moved_child_refs.append(child.ref)
            continue
        retained_child_refs.append(child_ref)
    previous_section.child_refs = retained_child_refs
    recovered_section.child_refs = moved_child_refs


def _resolve_ten_k_virtual_section_replacement_start(
    *,
    full_text: str,
    token: str,
    section: _VirtualSection,
    fallback_positions: dict[str, int],
) -> Optional[int]:
    """Select a replacement body start for a stub section.

    Args:
        full_text: full document text.
        token: Item token.
        section: current virtual section.
        fallback_positions: heading fallback hit-position mapping.

    Returns:
        replacement body start; ``None`` when no better candidate exists.

    Raises:
        RuntimeError: raised when the selection fails.
    """

    fallback_start = fallback_positions.get(token)
    if fallback_start is None or fallback_start <= section.start:
        later_fallback_start = _find_ten_k_later_default_heading_position(
            full_text=full_text,
            token=token,
            after_position=section.end,
        )
        if later_fallback_start is not None:
            fallback_start = later_fallback_start
    if _looks_like_ten_k_by_reference_stub(section.content):
        reference_start = _find_ten_k_by_reference_target_start(
            full_text=full_text,
            token=token,
            section=section,
        )
        selected_reference_start = _select_ten_k_by_reference_replacement_start(
            section_start=section.start,
            reference_start=reference_start,
            fallback_start=fallback_start,
        )
        if selected_reference_start is not None:
            return selected_reference_start

    if _looks_like_ten_k_heading_stub(section.content):
        if fallback_start is None:
            fallback_start = _find_ten_k_default_heading_position(
                full_text=full_text,
                token=token,
            )
        if fallback_start is not None and fallback_start != section.start:
            return fallback_start
    return None


def _select_ten_k_by_reference_replacement_start(
    *,
    section_start: int,
    reference_start: Optional[int],
    fallback_start: Optional[int],
) -> Optional[int]:
    """Choose a more conservative body start among by-reference candidates.

    Two candidate types are common in real 10-Ks:
    1. A same-named generic heading at an earlier position (e.g. ``Risk Management``),
       which easily borrows the wrong body;
    2. The real Annual Report/Financial Section body after the current statutory Item.

    When the fallback has already identified a "later and more body-like" position,
    it should be preferred, avoiding mis-borrowing Item 7/7A body from business/risk
    paragraphs near the front of the document.

    Args:
        section_start: current virtual-section start.
        reference_start: candidate start found by the by-reference heading search.
        fallback_start: candidate start found by heading fallback.

    Returns:
        final adopted body start; ``None`` when no suitable candidate exists.

    Raises:
        RuntimeError: raised when the selection fails.
    """

    if fallback_start is not None and fallback_start > section_start:
        if reference_start is None:
            return fallback_start
        if reference_start <= section_start:
            return fallback_start
    return reference_start


def _resolve_ten_k_virtual_section_replacement_end(
    *,
    token: str,
    replacement_start: int,
    ordered_sections: list[tuple[str, _VirtualSection]],
    ordered_index: int,
    replacement_starts: dict[str, int],
    boundary_starts: list[int],
) -> Optional[int]:
    """Choose a reasonable end position for a replacement body start.

    Prefer the replacement starts of later key Items, then fall back to the
    original start of the current statutory Item, so body text from elsewhere in
    the same document is borrowed without changing section order.

    Args:
        token: current Item token.
        replacement_start: replacement body start.
        ordered_sections: key Item section list.
        ordered_index: position of the current section in the list.
        replacement_starts: computed replacement start mapping.
        boundary_starts: list of real body starts usable as section boundaries.

    Returns:
        end position; ``None`` when undeterminable.

    Raises:
        RuntimeError: raised when the selection fails.
    """

    del token

    current_section = ordered_sections[ordered_index][1]
    if current_section.start > replacement_start:
        next_boundary = next(
            (start for start in boundary_starts if start > replacement_start),
            None,
        )
        if next_boundary is not None:
            return next_boundary
        return current_section.start

    candidates: list[int] = []
    for later_token, later_section in ordered_sections[ordered_index + 1 :]:
        later_start = replacement_starts.get(later_token, later_section.start)
        if later_start > replacement_start:
            candidates.append(later_start)
            break

    if not candidates:
        return None
    return min(candidates)


def _collect_ten_k_replacement_boundary_starts(
    *,
    ordered_sections: list[tuple[str, _VirtualSection]],
    replacement_starts: dict[str, int],
) -> list[int]:
    """Collect the real body starts usable as expanded-body boundaries.

    Args:
        ordered_sections: key Item section list.
        replacement_starts: resolved replacement body starts.

    Returns:
        ascending body-boundary list.

    Raises:
        RuntimeError: Raised when computation fails.
    """

    boundaries: set[int] = set()
    for token, section in ordered_sections:
        replacement_start = replacement_starts.get(token)
        if replacement_start is not None:
            boundaries.add(replacement_start)
            continue
        if _looks_like_ten_k_heading_stub(section.content):
            continue
        if _looks_like_ten_k_by_reference_stub(section.content):
            continue
        leading_sample = _normalize_whitespace(str(section.content or ""))[:140]
        if leading_sample[:1].islower():
            continue
        boundaries.add(section.start)
    return sorted(boundaries)


def _should_apply_ten_k_virtual_section_replacement(
    *,
    current_content: str,
    replacement_content: str,
) -> bool:
    """Judge whether the replacement body should be adopted.

    Args:
        current_content: current section body.
        replacement_content: candidate replacement body.

    Returns:
        ``True`` when the candidate body is significantly better than the current stub.

    Raises:
        RuntimeError: Raised when determination fails.
    """

    current_words = len(str(current_content or "").split())
    replacement_words = len(str(replacement_content or "").split())
    if replacement_words < _TEN_K_MIN_EXPANDED_WORDS:
        return False
    if current_words <= 0:
        return True
    return replacement_words >= max(
        int(current_words * _TEN_K_MIN_EXPANDED_GROWTH),
        current_words + _TEN_K_MIN_EXPANDED_WORDS,
    )


def _looks_like_ten_k_by_reference_stub(content: str) -> bool:
    """Judge whether a section body is a by-reference wrapper sentence.

    Args:
        content: current section body.

    Returns:
        ``True`` when the body looks like a "see some heading in the Annual Report" wrapper sentence.

    Raises:
        RuntimeError: raised when the judgment fails.
    """

    stub_window = _extract_ten_k_by_reference_stub_window(content)
    if not stub_window:
        return False
    if len(stub_window.split()) > (_TEN_K_STUB_MAX_WORDS * 4):
        return False
    if _TEN_K_BY_REFERENCE_STUB_RE.search(stub_window) is None:
        return False
    return (
        re.search(
            r"(?is)\b(?:annual\s+report|under\s+the\s+head(?:ing|ings)|can\s+be\s+found|that\s+information)\b",
            stub_window,
        )
        is not None
    )


def _looks_like_ten_k_heading_stub(content: str) -> bool:
    """Judge whether a section body is a stub containing only a title/page numbers.

    Args:
        content: current section body.

    Returns:
        ``True`` when it looks more like a ToC title or page-number residue.

    Raises:
        RuntimeError: raised when the judgment fails.
    """

    normalized = str(content or "").strip()
    if not normalized:
        return False
    lines = [line.strip() for line in normalized.splitlines() if line.strip()]
    if not lines or len(lines) > 8:
        return False
    if len(normalized.split()) > _TEN_K_STUB_MAX_WORDS:
        return False
    body_word_count = sum(len(line.split()) for line in lines)
    if body_word_count > _TEN_K_STUB_MAX_BODY_WORDS:
        return False
    return all(
        _TEN_K_HEADING_STUB_LINE_RE.match(line) is not None
        or _TEN_K_PAGE_LOCATOR_STUB_LINE_RE.match(line) is not None
        for line in lines
    )


def _extract_ten_k_by_reference_stub_window(content: str) -> str:
    """Extract the by-reference wrapper-sentence window at a section start.

    Args:
        content: current section body.

    Returns:
        text window containing only the wrapper sentence at the section start.

    Raises:
        RuntimeError: raised when the extraction fails.
    """

    normalized = str(content or "").strip()
    if not normalized:
        return ""
    stub_window = normalized[:_TEN_K_BY_REFERENCE_WINDOW_MAX_CHARS]
    next_item_heading = re.search(
        r"(?im)^\s*item\s+(?:1A|1B|1C|7A|9A|9B|9C|1[0-5]|[1-9])\b",
        stub_window[40:],
    )
    if next_item_heading is None:
        return stub_window
    boundary = 40 + next_item_heading.start()
    return stub_window[:boundary].strip()


def _find_ten_k_by_reference_target_start(
    *,
    full_text: str,
    token: str,
    section: _VirtualSection,
) -> Optional[int]:
    """Find the start of the referenced body within the document based on the wrapper-cited heading.

    Args:
        full_text: full document text.
        token: Item token.
        section: current virtual section.

    Returns:
        start of the referenced body; ``None`` when not found.

    Raises:
        RuntimeError: Raised when search fails.
    """

    heading_candidates = _extract_ten_k_by_reference_heading_candidates(
        token=token,
        content=section.content,
    )
    if not heading_candidates:
        return None

    preferred_before: list[int] = []
    preferred_after: list[int] = []
    for heading in heading_candidates:
        positions = _find_ten_k_heading_positions_by_phrase(
            full_text=full_text,
            heading=heading,
        )
        for position in positions:
            if section.start <= position < section.end:
                continue
            if position < section.start:
                preferred_before.append(position)
            else:
                preferred_after.append(position)

    if preferred_before:
        return max(preferred_before)
    if preferred_after:
        return min(preferred_after)

    for heading in heading_candidates:
        relaxed_position = _find_ten_k_relaxed_reference_position(
            full_text=full_text,
            heading=heading,
            section_start=section.start,
            section_end=section.end,
            prefer_after=(token == "8"),
        )
        if relaxed_position is not None:
            return relaxed_position
    return None


def _extract_ten_k_by_reference_heading_candidates(
    *,
    token: str,
    content: str,
) -> list[str]:
    """Extract referenced-heading candidates from a by-reference wrapper sentence.

    Args:
        token: Item token.
        content: current section body.

    Returns:
        deduplicated, order-preserving heading-candidate list.

    Raises:
        RuntimeError: raised when the extraction fails.
    """

    candidates: list[str] = []
    normalized = _extract_ten_k_by_reference_stub_window(content)

    match = _TEN_K_REFERENCE_HEADING_RE.search(normalized)
    if match is not None:
        for quoted in _TEN_K_QUOTED_TEXT_RE.findall(str(match.group(1) or "")):
            _append_ten_k_reference_heading_candidate(candidates, quoted)

    for quoted in _TEN_K_QUOTED_TEXT_RE.findall(normalized):
        _append_ten_k_reference_heading_candidate(candidates, quoted)

    for default_heading in _TEN_K_BY_REFERENCE_DEFAULT_HEADINGS.get(token, ()):
        _append_ten_k_reference_heading_candidate(candidates, default_heading)
    return candidates


def _append_ten_k_reference_heading_candidate(
    candidates: list[str],
    heading: str,
) -> None:
    """Append deduplicated reference heading candidate.

    Args:
        candidates: candidate list.
        heading: heading to append.

    Returns:
        None.

    Raises:
        RuntimeError: Raised when appending fails.
    """

    cleaned = str(heading or "").strip().strip(".,;: ")
    if len(cleaned) < 3:
        return
    if cleaned not in candidates:
        candidates.append(cleaned)


def _find_ten_k_heading_positions_by_phrase(
    *,
    full_text: str,
    heading: str,
) -> list[int]:
    """Find the standalone-heading position of a given heading phrase in the full text.

    Args:
        full_text: full document text.
        heading: heading phrase.

    Returns:
        hit position list (in document order).

    Raises:
        RuntimeError: Raised when search fails.
    """

    normalized_text = _normalize_ten_k_heading_search_text(full_text)
    normalized_heading = _normalize_ten_k_heading_search_text(heading)
    if not normalized_heading:
        return []

    positions: list[int] = []
    cursor = 0
    search_count = 0
    while search_count < _TEN_K_FALLBACK_DIRECTIONAL_SEARCH_MAX:
        position = normalized_text.find(normalized_heading, cursor)
        if position < 0:
            break
        matched_text = full_text[position : position + len(heading)]
        if _looks_like_ten_k_standalone_heading_context(
            full_text=full_text,
            position=position,
            matched_text=matched_text,
        ):
            positions.append(position)
        cursor = position + 1
        search_count += 1
    return positions


def _find_ten_k_default_heading_position(
    *,
    full_text: str,
    token: str,
) -> Optional[int]:
    """Locate body start based on token default heading candidates.

    Args:
        full_text: full document text.
        token: Item token.

    Returns:
        hit position; ``None`` on a miss.

    Raises:
        RuntimeError: Raised when search fails.
    """

    for heading in _TEN_K_BY_REFERENCE_DEFAULT_HEADINGS.get(token, ()):
        positions = _find_ten_k_heading_positions_by_phrase(
            full_text=full_text,
            heading=heading,
        )
        if positions:
            return positions[0]
    if token == "8":
        for heading in _TEN_K_BY_REFERENCE_DEFAULT_HEADINGS.get(token, ()):
            fallback_position = _find_ten_k_relaxed_reference_position(
                full_text=full_text,
                heading=heading,
                section_start=len(full_text),
                section_end=len(full_text),
            )
            if fallback_position is not None:
                return fallback_position
    return None


def _find_ten_k_later_default_heading_position(
    *,
    full_text: str,
    token: str,
    after_position: int,
) -> Optional[int]:
    """Find default heading candidates after the specified position.

    Used for by-reference repair: the statutory Item title itself often matches
    the default heading phrase, so we must explicitly skip the current stub and look for the real body heading.

    Args:
        full_text: full document text.
        token: Item token.
        after_position: only accept candidates after this position.

    Returns:
        subsequent real heading start; ``None`` when not found.

    Raises:
        RuntimeError: Raised when search fails.
    """

    for heading in _TEN_K_BY_REFERENCE_DEFAULT_HEADINGS.get(token, ()):
        positions = _find_ten_k_heading_positions_by_phrase(
            full_text=full_text,
            heading=heading,
        )
        later_positions = [position for position in positions if position > after_position]
        if later_positions:
            return min(later_positions)
    return None


def _find_ten_k_relaxed_reference_position(
    *,
    full_text: str,
    heading: str,
    section_start: int,
    section_end: int,
    prefer_after: bool = False,
) -> Optional[int]:
    """Leniently backtrack same-name reference positions, covering by-reference documents whose standalone-heading structure is lost.

    Args:
        full_text: full document text.
        heading: target heading.
        section_start: current section start.
        section_end: current section end.
        prefer_after: whether to prefer a same-named position after the section.

    Returns:
        earlier same-named position; ``None`` when none exists.

    Raises:
        RuntimeError: Raised when search fails.
    """

    normalized_text = _normalize_ten_k_heading_search_text(full_text)
    normalized_heading = _normalize_ten_k_heading_search_text(heading)
    if not normalized_heading:
        return None

    previous_positions: list[int] = []
    later_positions: list[int] = []
    cursor = 0
    while True:
        position = normalized_text.find(normalized_heading, cursor)
        if position < 0:
            break
        matched_text = full_text[position : position + len(heading)]
        if _looks_like_ten_k_toc_heading_context(
            full_text=full_text,
            position=position,
            matched_text=matched_text,
        ):
            cursor = position + 1
            continue
        if position < section_start - 1200:
            previous_positions.append(position)
        elif position >= section_end + 1200:
            later_positions.append(position)
        cursor = position + 1
        if len(previous_positions) + len(later_positions) >= _TEN_K_FALLBACK_DIRECTIONAL_SEARCH_MAX:
            break
    if prefer_after and later_positions:
        return min(later_positions)
    if previous_positions:
        return max(previous_positions)
    if later_positions:
        return min(later_positions)
    return None


def _normalize_ten_k_heading_search_text(text: str) -> str:
    """Normalize heading search text.

    Args:
        text: raw text.

    Returns:
        normalized text suitable for one-to-one position-mapping search.

    Raises:
        RuntimeError: Raised when normalization fails.
    """

    return str(text or "").translate(_TEN_K_HEADING_TRANSLATION_TABLE).lower()


def _select_ten_k_heading_fallback_markers(
    full_text: str,
    *,
    end_at: Optional[int] = None,
) -> list[tuple[str, int]]:
    """When the Item prefix is missing, recognize key sections via SEC statutory titles as a fallback.

    Scenario: Some iXBRL 10-K bodies use bare headings like ``"Risk Factors"`` or ``"Management's Discussion..."``
    without the ``"Item 1A/7/8"`` prefix, so standard Item regexes miss.
    This function adaptively matches against the SEC statutory heading set, requiring key Items
    ``1A/7/8`` to hit simultaneously to avoid false positives.

    Args:
        full_text: full document text.
        end_at: optional end position (exclusive), used to exclude the trailing Item index region.

    Returns:
        ``(item_token, start_index)`` list; empty if required key Items are not satisfied.

    Raises:
        RuntimeError: Raised when identification fails.
    """

    start_at = max(0, _find_table_of_contents_cutoff(full_text))
    search_end = end_at  # trailing Item index cutoff position; None means search to EOF
    cursor = start_at
    selected: list[tuple[str, int]] = []
    for item_token in _TEN_K_ITEM_ORDER:
        patterns = _TEN_K_HEADING_FALLBACK_PATTERNS.get(item_token)
        if not patterns:
            continue
        position = _find_first_pattern_position_after(
            full_text=full_text,
            patterns=patterns,
            start_at=cursor,
            end_at=search_end,
        )
        if position is None:
            continue
        selected.append((item_token, position))
        cursor = position + 1

    # Round 2: Backtrack search for missing required Items.
    # Scenario: In embedded annual reports (e.g. MCD), MD&A (Item 7) appears before Risk Factors (Item 1A),
    # which sequential cursor skips; backtrack search between start_at and first matched position.
    selected_tokens = {token for token, _ in selected}
    missing_required = [
        item for item in _TEN_K_HEADING_FALLBACK_REQUIRED_ITEMS if item not in selected_tokens
    ]
    if missing_required and selected:
        earliest_found_pos = min(pos for _, pos in selected)
        for item_token in missing_required:
            patterns = _TEN_K_HEADING_FALLBACK_PATTERNS.get(item_token)
            if not patterns:
                continue
            # search before the matched interval (from start_at to earliest_found_pos)
            position = _find_first_pattern_position_after(
                full_text=full_text,
                patterns=patterns,
                start_at=start_at,
                end_at=earliest_found_pos,
            )
            if position is not None:
                selected.append((item_token, position))
                selected_tokens.add(item_token)

    selected_tokens = {token for token, _ in selected}
    if any(required not in selected_tokens for required in _TEN_K_HEADING_FALLBACK_REQUIRED_ITEMS):
        return []
    # Sort by document position
    selected.sort(key=lambda x: x[1])
    # Round 3: Skip ToC entries.
    # Tight spacing between consecutive markers indicates hitting a ToC area (e.g. MCD ToC with
    # "Risk Factors\n28\nCybersecurity\n35" consecutive);
    # search forward for subsequent matches to replace clustered markers.
    selected = _skip_heading_toc_cluster(
        full_text,
        selected,
        start_at=start_at,
        end_at=search_end,
    )
    # Re-verify required items after skipping
    selected_tokens = {token for token, _ in selected}
    if any(required not in selected_tokens for required in _TEN_K_HEADING_FALLBACK_REQUIRED_ITEMS):
        return []
    return selected


def _skip_heading_toc_cluster(
    full_text: str,
    markers: list[tuple[str, int]],
    *,
    start_at: int,
    end_at: Optional[int],
) -> list[tuple[str, int]]:
    """Skip ToC cluster entries in heading fallback results.

    Scenario: Front-matter of embedded annual reports (e.g. MCD) contains a brief ToC where ``Risk Factors``,
    ``Cybersecurity`` etc. each take a single line matching body heading structure, causing fallback
    first hit to land in ToC (e.g. 1.8%) instead of body (e.g. 35%).

    Detection rule: If gap between two consecutive markers < ``_MIN_HEADING_SECTION_SPAN``,
    classify former as ToC entry and replace with next match of that pattern in document.

    Args:
        full_text: full document text.
        markers: sorted ``(item_token, position)`` list.
        start_at: heading search start position.
        end_at: heading search end position (exclusive).

    Returns:
        corrected ``(item_token, position)`` list.

    Raises:
        RuntimeError: Raised when processing fails.
    """

    if len(markers) < 2:
        return markers

    result: list[tuple[str, int]] = list(markers)
    changed = True
    max_iterations = 5  # prevent infinite loop
    iteration = 0
    while changed and iteration < max_iterations:
        changed = False
        iteration += 1
        for i in range(len(result) - 1):
            gap = result[i + 1][1] - result[i][1]
            if gap < _MIN_HEADING_SECTION_SPAN:
                # current marker looks like a table-of-contents entry; search the next match
                item_token = result[i][0]
                patterns = _TEN_K_HEADING_FALLBACK_PATTERNS.get(item_token)
                if not patterns:
                    continue
                # search for the next match after the current position
                next_pos = _find_first_pattern_position_after(
                    full_text=full_text,
                    patterns=patterns,
                    start_at=result[i][1] + 1,
                    end_at=end_at,
                )
                if next_pos is not None and next_pos != result[i][1]:
                    result[i] = (item_token, next_pos)
                    result.sort(key=lambda x: x[1])
                    changed = True
                    break  # restart the check
    return result


def _repair_ten_k_key_items_with_heading_fallback(
    full_text: str,
    item_markers: list[tuple[str, int]],
) -> list[tuple[str, int]]:
    """Repair missing/ToC-contaminated 10-K key Items using statutory heading fallback.

    Repair strategy:
    - If key Item (1A/7/8) is missing and heading fallback locates body text, backfill;
    - If key Item hit position looks like a ToC line (heading + page number), replace with body position.

    Args:
        full_text: full document text.
        item_markers: raw ``(item_token, start_index)`` list.

    Returns:
        repaired ``(item_token, start_index)`` list (in statutory order).

    Raises:
        RuntimeError: Raised when repair fails.
    """

    if not item_markers:
        return item_markers

    fallback_map = _find_ten_k_heading_fallback_positions(full_text)
    if not fallback_map:
        return item_markers
    marker_map = {token: position for token, position in item_markers}

    for token in _TEN_K_HEADING_FALLBACK_REQUIRED_ITEMS:
        fallback_pos = fallback_map.get(token)
        if fallback_pos is None:
            continue

        current_pos = marker_map.get(token)
        if current_pos is None:
            marker_map[token] = fallback_pos
            continue

        if (
            _looks_like_toc_page_line(full_text, current_pos)
            or _looks_like_inline_toc_snippet(full_text, current_pos)
            or (token == "7" and _looks_like_item_7_cross_reference(full_text, current_pos))
        ) and fallback_pos > current_pos:
            marker_map[token] = fallback_pos

    repaired: list[tuple[str, int]] = []
    for token in _TEN_K_ITEM_ORDER:
        position = marker_map.get(token)
        if position is None:
            continue
        repaired.append((token, position))
    return repaired


def _find_ten_k_heading_fallback_positions(full_text: str) -> dict[str, int]:
    """Find first position mapping of 10-K key headings in body text.

    Differences from ``_select_ten_k_heading_fallback_markers``:
    - Used for "local repair", does not require simultaneous 1A/7/8 hits;
    - Only returns token->position mapping of actual hits.

    Args:
        full_text: full document text.

    Returns:
        matched token->position mapping.

    Raises:
        RuntimeError: Raised when search fails.
    """

    start_at = max(0, _find_table_of_contents_cutoff(full_text))
    positions: dict[str, int] = {}
    for token, patterns in _TEN_K_HEADING_FALLBACK_SEARCH_PATTERNS.items():
        best_position: Optional[int] = None
        for pattern in patterns:
            for match in pattern.finditer(full_text, pos=start_at):
                position = int(match.start())
                matched_text = str(match.group(0) or "")
                if _looks_like_toc_page_line(full_text, position):
                    continue
                if _looks_like_inline_toc_snippet(full_text, position):
                    continue
                if not _looks_like_ten_k_standalone_heading_context(
                    full_text=full_text,
                    position=position,
                    matched_text=matched_text,
                ):
                    continue
                best_position = position
                break
            if best_position is not None:
                break
        if best_position is not None:
            positions[token] = best_position
    return positions


def _looks_like_ten_k_standalone_heading_context(
    *,
    full_text: str,
    position: int,
    matched_text: str,
) -> bool:
    """Judge whether a 10-K fallback phrase is in a standalone-heading context.

    Args:
        full_text: full document text.
        position: hit start.
        matched_text: currently matched raw text.

    Returns:
        ``True`` when it looks more like a standalone heading; ``False`` for in-sentence references.

    Raises:
        RuntimeError: raised when the judgment fails.
    """

    normalized_match = str(matched_text or "")
    if _looks_like_ten_k_toc_heading_context(
        full_text=full_text,
        position=position,
        matched_text=normalized_match,
    ):
        return False
    if (
        re.search(r"(?i)\bitem\s+(?:1A|1B|1C|7A|9A|9B|9C|1[0-5]|[1-9])\b", normalized_match)
        is not None
    ):
        return True

    line_start = full_text.rfind("\n", 0, max(0, int(position))) + 1
    prefix = full_text[line_start : max(0, int(position))]
    if not prefix.strip():
        return True
    if _TEN_K_HEADING_PREFIX_ENUM_RE.search(prefix) is not None:
        return True
    if prefix.rstrip().endswith((".", ":", ";")) and _looks_like_ten_k_heading_text(
        normalized_match
    ):
        return True

    prefix_word_count = len(_TEN_K_HEADING_PREFIX_WORD_RE.findall(prefix))
    return prefix_word_count <= 3


def _looks_like_ten_k_heading_text(matched_text: str) -> bool:
    """Judge whether matched text looks more like a section heading than a body phrase.

    Args:
        matched_text: matched raw text.

    Returns:
        ``True`` when it looks more like a section heading.

    Raises:
        RuntimeError: raised when the judgment fails.
    """

    words = re.findall(r"[A-Za-z]{2,}", str(matched_text or ""))
    if len(words) < 3:
        return False
    uppercase_words = sum(1 for word in words if word.isupper())
    titlecase_words = sum(1 for word in words if word[:1].isupper())
    return (uppercase_words + titlecase_words) >= max(3, len(words) - 1)


def _looks_like_ten_k_toc_heading_context(
    *,
    full_text: str,
    position: int,
    matched_text: str,
) -> bool:
    """Judge whether a hit position looks like a heading cluster in a ToC/index.

    Args:
        full_text: full document text.
        position: hit start.
        matched_text: matched raw text.

    Returns:
        ``True`` when the context looks like a ToC page-number cluster.

    Raises:
        RuntimeError: raised when the judgment fails.
    """

    if not _may_be_ten_k_toc_heading_context(
        full_text=full_text,
        position=position,
        matched_text=matched_text,
    ):
        return False

    start = max(0, int(position) - _TEN_K_TOC_CONTEXT_LOOKAROUND_CHARS)
    end = min(
        len(full_text),
        int(position) + len(str(matched_text or "")) + _TEN_K_TOC_CONTEXT_LOOKAROUND_CHARS,
    )
    snippet = full_text[start:end]
    normalized_snippet = _normalize_ten_k_heading_search_text(snippet)
    if "table of contents" in normalized_snippet and not _has_ten_k_substantive_body_after_heading(
        full_text=full_text,
        position=position,
        matched_text=matched_text,
    ):
        return True

    page_ref_count = len(_TEN_K_TOC_PAGE_REFERENCE_RE.findall(snippet))
    if page_ref_count < _TEN_K_TOC_CONTEXT_MIN_PAGE_REFS:
        return False
    if _has_ten_k_substantive_body_after_heading(
        full_text=full_text,
        position=position,
        matched_text=matched_text,
    ):
        return False

    heading_hits = 0
    for headings in _TEN_K_BY_REFERENCE_DEFAULT_HEADINGS.values():
        if any(
            _normalize_ten_k_heading_search_text(heading) in normalized_snippet
            for heading in headings
        ):
            heading_hits += 1
    if heading_hits >= 2:
        return True
    return _TEN_K_VIRTUAL_SECTION_ITEM_RE.search(snippet) is not None


def _may_be_ten_k_toc_heading_context(
    *,
    full_text: str,
    position: int,
    matched_text: str,
) -> bool:
    """Use a low-cost local probe to decide whether entering 10-K ToC context analysis is warranted.

    10-Ks like `SO` / `ETR` hit many phrases inside body sentences during fallback scan. Entering
    full ToC analysis on every hit wastes time on page stats, cluster scans, and body probing.
    Here we check a small local window for common ToC signals: `Table of Contents`,
    page references, or other `Item` numbers before running full ToC context determination.

    Args:
        full_text: full document text.
        position: hit start.
        matched_text: matched raw text.

    Returns:
        ``True`` when it may be in a ToC / index context; otherwise ``False``.

    Raises:
        RuntimeError: raised when the judgment fails.
    """

    start = max(0, int(position) - _TEN_K_TOC_CONTEXT_PROBE_LOOKAROUND_CHARS)
    end = min(
        len(full_text),
        int(position) + len(str(matched_text or "")) + _TEN_K_TOC_CONTEXT_PROBE_LOOKAROUND_CHARS,
    )
    probe = full_text[start:end]
    lowered_probe = probe.lower()
    if "table of contents" in lowered_probe:
        return True
    if _TEN_K_TOC_PAGE_REFERENCE_RE.search(probe) is not None:
        return True
    # ToC lines often insert long dot leaders / whitespace after heading before page number and subsequent title.
    # Looking only at local window would miss long dot leaders; add lightweight lookahead here.
    matched_end = max(0, int(position)) + len(str(matched_text or ""))
    suffix_end = min(len(full_text), matched_end + (_TEN_K_TOC_CONTEXT_LOOKAROUND_CHARS * 2))
    suffix = full_text[matched_end:suffix_end]
    if _TEN_K_TOC_PAGE_REFERENCE_RE.search(suffix) is not None:
        return True
    return _TEN_K_VIRTUAL_SECTION_ITEM_RE.search(probe) is not None


def _has_ten_k_substantive_body_after_heading(
    *,
    full_text: str,
    position: int,
    matched_text: str,
) -> bool:
    """Judge whether substantive body text immediately follows a heading.

    Some inline annual reports retain a short ``Table of Contents`` / page reference before the real heading.
    If continuous body follows immediately after heading,
    do not classify heading as ToC simply due to nearby ToC noise.

    Args:
        full_text: full document text.
        position: heading start.
        matched_text: matched heading text.

    Returns:
        ``True`` when enough body text follows the heading.

    Raises:
        RuntimeError: raised when the judgment fails.
    """

    body_start = max(0, int(position) + len(str(matched_text or "")))
    body_end = min(len(full_text), body_start + _TEN_K_HEADING_BODY_LOOKAHEAD_CHARS)
    if body_end <= body_start:
        return False

    body_window = _normalize_whitespace(full_text[body_start:body_end])
    if not body_window:
        return False
    body_window = _TEN_K_HEADING_BODY_SKIP_RE.sub("", body_window).strip()
    if not body_window:
        return False

    leading_window = body_window[:_TEN_K_HEADING_BODY_WORD_WINDOW_CHARS]
    if len(_TEN_K_TOC_PAGE_REFERENCE_RE.findall(leading_window)) >= 3:
        return False
    if len(_TEN_K_VIRTUAL_SECTION_ITEM_RE.findall(leading_window)) >= 2:
        return False

    body_words = re.findall(r"[A-Za-z]{2,}", leading_window)
    return len(body_words) >= _TEN_K_HEADING_BODY_MIN_WORDS


def _looks_like_item_7_cross_reference(full_text: str, position: int) -> bool:
    """Judge whether an Item 7 hit falls in a cross-reference sentence rather than a section heading.

    Args:
        full_text: full document text.
        position: position to judge.

    Returns:
        ``True`` when an ``in/to/see ... Item 7`` cross-reference sentence is hit.

    Raises:
        RuntimeError: raised when the judgment fails.
    """

    start = max(0, int(position) - 160)
    end = min(len(full_text), int(position) + 220)
    snippet = full_text[start:end]
    local_position = int(position) - start
    for match in _ITEM_7_CROSS_REFERENCE_PATTERN.finditer(snippet):
        if match.start() <= local_position <= match.end() + 8:
            return True
    return False


def _looks_like_toc_page_line(full_text: str, position: int) -> bool:
    """10-K flavor of the ToC page-number line check, delegating to the shared implementation."""
    return _looks_like_toc_page_line_generic(
        full_text, position, _TOC_PAGE_LINE_PATTERN, _TOC_PAGE_SNIPPET_PATTERN
    )


def _find_first_pattern_position_after(
    *,
    full_text: str,
    patterns: tuple[re.Pattern[str], ...],
    start_at: int,
    end_at: Optional[int] = None,
) -> Optional[int]:
    """Return earliest hit position among multiple regexes after the specified position.

    Args:
        full_text: full document text.
        patterns: candidate heading regex set.
        start_at: starting scan position.
        end_at: optional end position (exclusive); hit positions must be smaller than this.

    Returns:
        earliest hit position; `None` on a miss.

    Raises:
        RuntimeError: Raised when scan fails.
    """

    best_position: Optional[int] = None
    for pattern in patterns:
        match = pattern.search(full_text, pos=max(0, int(start_at)))
        if match is None:
            continue
        position = int(match.start())
        # if an end position is specified, skip hits beyond the range
        if end_at is not None and position >= end_at:
            continue
        if best_position is None or position < best_position:
            best_position = position
    return best_position


def _build_part_markers(full_text: str) -> list[tuple[int, str]]:
    """Extract the 10-K Part markers.

    Args:
        full_text: full document text.

    Returns:
        `(position, part_title)` list.

    Raises:
        RuntimeError: raised when the extraction fails.
    """

    part_markers: list[tuple[int, str]] = []
    for match in _TEN_K_PART_PATTERN.finditer(full_text):
        roman = str(match.group(1) or "").strip().upper()
        if not roman:
            continue
        part_markers.append((int(match.start()), f"Part {roman}"))
    return part_markers


def _resolve_part_title(part_markers: list[tuple[int, str]], position: int) -> Optional[str]:
    """Resolve nearest Part title to which the specified position belongs.

    Args:
        part_markers: Part marker list.
        position: Item position.

    Returns:
        nearest Part title; `None` when none exists.

    Raises:
        RuntimeError: Raised when resolution fails.
    """

    resolved_title: Optional[str] = None
    for part_position, part_title in part_markers:
        if part_position > position:
            break
        resolved_title = part_title
    return resolved_title


def _correct_part_from_sec_rules(
    item_token: str,
    resolved_part: Optional[str],
) -> Optional[str]:
    """Correct or complete Part label using SEC regulatory rules.

    When regex scan finds no Part marker, or edgartools gives a Part inconsistent with SEC statutory mapping,
    correct based on regulatory rules.
    This reflects the statutory structure of SEC Regulation S-K.

    Args:
        item_token: Item number (e.g. ``"1A"``, ``"7"``, ``"15"``).
        resolved_part: Part title parsed by the regex scan (e.g. ``"Part I"``); may be ``None``.

    Returns:
        corrected Part title (e.g. ``"Part II"``); the original value when not in the mapping.

    Raises:
        RuntimeError: Raised when processing fails.
    """

    canonical_roman = _TEN_K_ITEM_PART_MAP.get(item_token.upper())
    if canonical_roman is None:
        # unknown Item number; keep the original inference
        return resolved_part

    canonical_title = f"Part {canonical_roman}"

    if resolved_part is None:
        # missing Part -> complete it
        return canonical_title

    # Existing Part -> verify correctness
    if resolved_part != canonical_title:
        # fix an incorrect Part label
        return canonical_title

    return resolved_part
