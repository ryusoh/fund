"""Form 10-Q common constants, marker construction, and section post-processing logic.

Extracts shared constants and marker functions for Form 10-Q, used by both
``TenQFormProcessor`` (edgartools path) and
``BsTenQFormProcessor`` (BeautifulSoup path).

Both processors import from this module independently, preserving architectural separation.
"""

from __future__ import annotations

import re
from typing import Optional

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
    _looks_like_inline_toc_snippet,
    _looks_like_toc_page_line_generic,
    _select_ordered_item_markers,
    _select_ordered_item_markers_after_toc,
)

_PREVIEW_MAX_CHARS = 200

# SEC filings exhibit two common 10-Q Item heading forms:
# 1) ``Item 2.`` / ``Item 1A --`` (standard form);
# 2) ``2. Management's Discussion ...`` (bare number form, no "Item" prefix).
#
# Actual documents contain "Management's / Management’s / Managements",
# so possessive matching is relaxed to avoid missing curly or omitted apostrophes.
_APOSTROPHE_CHARS_PATTERN = "'’‘`´"
_MANAGEMENT_POSSESSIVE_PATTERN = rf"management(?:\s*[{_APOSTROPHE_CHARS_PATTERN}]\s*)?s?"
_TEN_Q_ITEM_PATTERN = re.compile(
    r"(?im)(?:\bitem\s+(1A|[1-6])(?:\s*[\.\:\-\u2013\u2014]\s*|\s+(?=[A-Za-z])))"
    r"|(?:^|\n)\s*(1A|[1-6])\s*(?:[\.\:\-\u2013\u2014]\s*|\s+)"
    rf"(?=(?:financial statements|{_MANAGEMENT_POSSESSIVE_PATTERN}\s+discussion|"
    r"quantitative and qualitative disclosures|controls and procedures|legal proceedings|risk factors|"
    r"unregistered sales|defaults|mine safety|exhibits)\b)"
)

# SEC Form 10-Q statutory Item structure
# Ref: SEC Regulation S-K + SEC Form 10-Q General Instructions
# Part I - Financial Information: Items 1, 2, 3, 4
# Part II - Other Information: Items 1, 1A, 2, 3, 4, 5, 6
_TEN_Q_PART_I_ITEM_ORDER: tuple[str, ...] = ("1", "2", "3", "4")
_TEN_Q_PART_II_ITEM_ORDER: tuple[str, ...] = ("1", "1A", "2", "3", "4", "5", "6")

# SEC Form 10-Q statutory Part heading pattern
# Ref: SEC Regulation S-K §229.10(c) + Form 10-Q General Instructions
# Part I statutory title is fixed as "Financial Information"
# Part II statutory title is fixed as "Other Information"
#
# Note: BSProcessor get_text(separator=" ") may split words across HTML element boundaries
# into multiple segments (e.g. "FINANCIAL" -> "FINANCI AL"),
# so _html_flexible_word() is used to generate patterns tolerant of word breaks.


def _html_flexible_word(word: str) -> str:
    """Generate flexible regex pattern allowing word breaks from HTML text extraction.

    BSProcessor uses ``get_text(separator=" ")`` to extract plain text,
    and HTML element boundaries may insert spaces mid-word (e.g. ``<span>FINANCI</span><span>AL</span>``
    extracted as ``FINANCI AL``). This function inserts ``\\s*`` between each character
    to tolerate such broken words.

    Args:
        word: expected whole word (e.g. ``"FINANCIAL"``).

    Returns:
        regex pattern string allowing optional whitespace between characters.

    Raises:
        ValueError: Raised when word is empty.
    """
    if not word:
        raise ValueError("word must not be empty")
    return r"\s*".join(word)


_PART_I_HEADING_PATTERN = re.compile(
    r"(?i)\bPART\s+I\b"  # "Part I" (word boundary prevents matching "Part II")
    r"[\s\.\-—–:]*"  # optional punctuation / whitespace
    + _html_flexible_word("FINANCIAL")
    + r"\s+"
    + _html_flexible_word("INFORMATION"),
)
_PART_II_HEADING_PATTERN = re.compile(
    r"(?i)\bPART\s+II\b"
    r"[\s\.\-—–:]*" + _html_flexible_word("OTHER") + r"\s+" + _html_flexible_word("INFORMATION"),
)

# Anchor quality verification thresholds
# SEC Form 10-Q statutory required items (Item 1 Financial Statements, Item 2 MD&A)
# normally span several thousand characters; extremely short spans indicate anchor in running header / ToC.
# Note: Part I Item 3 (Quantitative Disclosures) and Item 4 (Controls & Procedures)
# legitimately span only hundreds of characters in many companies, so not all Items can require large spans.
# Strategy: require at least _ANCHOR_QUALITY_MIN_MEANINGFUL_ITEMS Items with substantive span,
# corresponding to statutory mandatory Items 1 and 2.
_ANCHOR_QUALITY_MIN_SPAN = 1000  # Item span below this length is considered "extremely short"
_ANCHOR_QUALITY_MIN_MEANINGFUL_ITEMS = 2  # at least N Items must have substantive span
# Part II anchor ToC cluster max spread distance.
# When all candidate Part I anchors are within this distance of Part II anchor,
# Part II anchor is also deemed inside ToC region, so Phase 1 fallback does not use it as range upper bound.
# Case study: HIG 10-Q with compact ToC (Part I -> Part II only 1600 chars),
# both are inside ToC and should not truncate body Item selection.
_PART_II_ANCHOR_MAX_TOC_SPREAD = 5000
_TOC_PAGE_LINE_PATTERN = re.compile(r"(?im)^\s*[A-Za-z][^\n]{0,220}\b\d{1,3}\s*$")
_TOC_PAGE_SNIPPET_PATTERN = re.compile(
    r"(?is)^\s*(?:item\s+(?:1A|[1-6])\s*[\.\:\-\u2013\u2014]?\s*)?[A-Za-z][^\n]{0,220}\b\d{1,3}\b"
    r"(?:\s+item\s+(?:1A|[1-6])\b|\s*$)"
)
_TEN_Q_PART_I_HEADING_FALLBACK_PATTERNS: dict[str, tuple[re.Pattern[str], ...]] = {
    "1": (
        re.compile(
            r"(?i)\b(?:item\s+1\s*[\.\:\-\u2013\u2014]\s*)?"
            r"financial statements(?: and supplementary data)?\b"
        ),
    ),
    "2": (
        re.compile(
            r"(?i)\b(?:item\s+2\s*[\.\:\-\u2013\u2014]\s*)?"
            rf"{_MANAGEMENT_POSSESSIVE_PATTERN}\s+discussion and analysis"
            r"(?: of financial condition and results of operations)?\b"
        ),
    ),
    "3": (
        re.compile(
            r"(?i)\b(?:item\s+3\s*[\.\:\-\u2013\u2014]\s*)?"
            r"quantitative and qualitative disclosures about market risk\b"
        ),
    ),
    "4": (
        re.compile(
            r"(?i)\b(?:item\s+4\s*[\.\:\-\u2013\u2014]\s*)?"
            r"(?:disclosure\s+)?controls and procedures\b"
        ),
    ),
}
_TEN_Q_PART_I_EXPECTED_KEYWORDS: dict[str, tuple[str, ...]] = {
    "1": ("financial statements",),
    "2": ("management", "discussion"),
    "3": ("quantitative", "market risk"),
    "4": ("controls", "procedures"),
}
_TEN_Q_PART_I_TOC_SUMMARY_PATTERN = re.compile(
    r"(?is)\bitems?\s+1\s*,\s*2\s*,\s*3\s*(?:,|and)\s*4\b"
    rf".{{0,260}}\bfinancial statements\b.{{0,260}}\b{_MANAGEMENT_POSSESSIVE_PATTERN}\s+discussion\b"
)
_PART_I_ITEM_CROSS_REFERENCE_PATTERN = re.compile(
    r"(?is)\b(?:in|to)\s+part\s+i\s*,\s*item\s+(1|2)\b"
)
_TEN_Q_ITEM_1_STRUCTURED_HEADING_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"(?i)\bcondensed\s+consolidated\s+financial\s+statements\b"),
    re.compile(r"(?i)\bconsolidated\s+financial\s+statements\b"),
    re.compile(r"(?i)\bnotes\s+to\s+(?:condensed\s+)?consolidated\s+financial\s+statements\b"),
)
_MIN_PART_I_KEY_ITEM_GAP_CHARS = 120
_TEN_Q_VIRTUAL_SECTION_ITEM_RE = re.compile(r"(?i)^part\s+(i|ii)\s*-\s*item\s+(1A|[1-6])\b")
_TEN_Q_HEADING_PREFIX_RE = re.compile(
    r"(?i)^\s*(?:part\s+(?:i|ii)\s*[\.\-—–:]\s*)?(?:item\s+(?:1A|[1-6])\s*[\.\-—–:]?\s*)?$"
)
_TEN_Q_HEADING_ONLY_MAX_CHARS = 180
_TEN_Q_STUB_SECTION_MAX_CHARS = 1800
_TEN_Q_STUB_PAGE_LINE_RATIO = 0.35
_TEN_Q_REPLACEMENT_MIN_DISTANCE = 50
_TEN_Q_BY_REFERENCE_STUB_RE = re.compile(
    r"(?is)\b(?:information\s+in\s+response\s+to\s+this\s+item\b.*?\bcan\s+be\s+found\b|"
    r"incorporat(?:ed|es)\b.*?\bby\s+reference\b|"
    r"(?:included\s+in|can\s+be\s+found\s+in|see\b.*?\bin)\b.*?\b(?:annual\s+report|form\s+10-k)\b)"
)
_TEN_Q_ITEM_2_ALIAS_RE = re.compile(
    rf"(?is){_MANAGEMENT_POSSESSIVE_PATTERN}\s+discussion\s+and\s+analysis"
    r"\s+of\s+financial\s+condition\s+and\s+results\s+of\s+operations\s*\(([^)\n]{3,80})\)"
)
_TEN_Q_TITLEISH_LINE_RE = re.compile(r"(?i)^[A-Za-z][A-Za-z0-9 '&(),/.\-]{2,180}$")
_TEN_Q_DEFAULT_HEADING_PATTERNS: dict[tuple[str, str], tuple[re.Pattern[str], ...]] = {
    ("I", "1"): (
        re.compile(
            rf"(?im)^\s*(?:item\s+1\s*[\.\:\-\u2013\u2014]?\s*)?"
            rf"{_html_flexible_word('CONSOLIDATED')}\s+{_html_flexible_word('FINANCIAL')}\s+{_html_flexible_word('STATEMENTS')}\b"
        ),
        re.compile(
            rf"(?im)^\s*(?:item\s+1\s*[\.\:\-\u2013\u2014]?\s*)?"
            rf"{_html_flexible_word('CONDENSED')}\s+{_html_flexible_word('CONSOLIDATED')}\s+{_html_flexible_word('FINANCIAL')}\s+{_html_flexible_word('STATEMENTS')}\b"
        ),
        re.compile(
            rf"(?im)^\s*(?:item\s+1\s*[\.\:\-\u2013\u2014]?\s*)?"
            rf"{_html_flexible_word('FINANCIAL')}\s+{_html_flexible_word('STATEMENTS')}(?:\s*\(unaudited\))?\b"
        ),
        re.compile(
            rf"(?im)^\s*(?:item\s+1\s*[\.\:\-\u2013\u2014]?\s*)?"
            rf"(?:{_html_flexible_word('CONDENSED')}\s+)?{_html_flexible_word('CONSOLIDATED')}\s+"
            rf"{_html_flexible_word('STATEMENT')}(?:{_html_flexible_word('S')})?\s+{_html_flexible_word('OF')}\s+{_html_flexible_word('INCOME')}\b"
        ),
    ),
    ("I", "2"): (
        re.compile(
            rf"(?im)^\s*(?:item\s+2\s*[\.\:\-\u2013\u2014]?\s*)?"
            rf"{_MANAGEMENT_POSSESSIVE_PATTERN}\s+discussion\s+and\s+analysis\s+"
            r"of\s+financial\s+condition\s+and\s+results\s+of\s+operations\b"
        ),
        re.compile(r"(?im)^\s*MD&A\b"),
    ),
    ("II", "1"): (
        re.compile(r"(?im)^\s*(?:item\s+1\s*[\.\:\-\u2013\u2014]?\s*)?legal proceedings\b"),
    ),
    ("II", "1A"): (
        re.compile(r"(?im)^\s*(?:item\s+1A\s*[\.\:\-\u2013\u2014]?\s*)?risk factors\b"),
    ),
    ("II", "2"): (
        re.compile(
            r"(?im)^\s*(?:item\s+2\s*[\.\:\-\u2013\u2014]?\s*)?"
            r"unregistered sales of equity securities and use of proceeds\b"
        ),
    ),
    ("II", "5"): (
        re.compile(r"(?im)^\s*(?:item\s+5\s*[\.\:\-\u2013\u2014]?\s*)?other information\b"),
    ),
    ("II", "6"): (
        re.compile(r"(?im)^\s*(?:item\s+6\s*[\.\:\-\u2013\u2014]?\s*)?exhibit index\b"),
        re.compile(r"(?im)^\s*(?:item\s+6\s*[\.\:\-\u2013\u2014]?\s*)?exhibits\b"),
    ),
}


def _find_all_part_heading_positions(
    full_text: str,
) -> tuple[list[int], list[int]]:
    """Find all occurrence positions of statutory Part I / Part II headings.

    Returns all match positions for caller to evaluate (supporting reverse validation).

    Args:
        full_text: full document text.

    Returns:
        ``(part_i_positions, part_ii_positions)``, each an ordered list of hit positions.

    Raises:
        RuntimeError: Raised when scan fails.
    """
    part_i_positions = [m.start() for m in _PART_I_HEADING_PATTERN.finditer(full_text)]
    part_ii_positions = [m.start() for m in _PART_II_HEADING_PATTERN.finditer(full_text)]
    return part_i_positions, part_ii_positions


def _select_best_part_i_anchor(
    full_text: str,
    part_i_positions: list[int],
    part_ii_anchor: Optional[int],
) -> Optional[int]:
    """Select the best position from Part I candidate anchors.

    Strategy: try candidates from back to front, validating anchor quality via SEC statutory rules --
    Part I Item 1 (Financial Statements) and Item 2 (MD&A)
    are statutory mandatory sections in Form 10-Q and cannot have extremely short spans.

    If a candidate anchor causes >= 2 selected Items to have span < threshold, anchor is classified
    as landing in running header region, and we fallback to previous candidate.

    Args:
        full_text: full document text.
        part_i_positions: all Part I heading match positions (in occurrence order).
        part_ii_anchor: Part II anchor position (bounds the Part I scan range).

    Returns:
        best Part I anchor position; ``None`` when all candidates fail.

    Raises:
        RuntimeError: Raised when selection fails.
    """
    if not part_i_positions:
        return None

    # Try candidates in reverse (later ones more likely skip ToC, but could hit running header)
    for candidate in reversed(part_i_positions):
        # sanity: the Part I anchor must precede the Part II anchor
        if part_ii_anchor is not None and candidate >= part_ii_anchor:
            continue

        # try selecting Part I Items: select within [candidate, part_ii_anchor)
        trial_items = _select_ordered_item_markers(
            full_text,
            item_pattern=_TEN_Q_ITEM_PATTERN,
            ordered_tokens=_TEN_Q_PART_I_ITEM_ORDER,
            start_at=candidate,
            end_at=part_ii_anchor,
        )

        # quality check: verify the selected Items' content spans are reasonable
        # SEC Form 10-Q General Instructions Section A makes Items 1/2 legally required,
        # normally a span cannot be extremely short (< 1000 chars)
        if _anchor_produces_meaningful_items(full_text, trial_items, part_ii_anchor):
            return candidate

    return None


def _anchor_produces_meaningful_items(
    full_text: str,
    trial_items: list[tuple[str, int]],
    end_boundary: Optional[int],
) -> bool:
    """Verify whether candidate anchor produces meaningful Item content.

    Part I Item 1 (Financial Statements) and Item 2 (MD&A) of Form 10-Q
    are statutory mandatory major sections and cannot have tiny spans.
    However, Item 3 (Quantitative Disclosures) and Item 4 (Controls & Procedures)
    legitimately contain only a few hundred characters in many companies.

    Strategy: require only at least ``_ANCHOR_QUALITY_MIN_MEANINGFUL_ITEMS``
    selected Items with span >= threshold (corresponding to Items 1 and 2).
    If all or nearly all Items are extremely short, anchor landed in ToC or running header.

    Args:
        full_text: full document text.
        trial_items: trial-selected ``(item_token, position)`` list.
        end_boundary: optional scan end position.

    Returns:
        ``True`` indicates anchor quality passed; ``False`` indicates need to fallback.

    Raises:
        RuntimeError: Raised when validation fails.
    """
    if len(trial_items) < 2:
        # too few Items selected to judge quality
        return False

    # Calculate each Item span (distance to next Item or end position)
    meaningful_count = 0
    for i, (_, pos) in enumerate(trial_items):
        if i + 1 < len(trial_items):
            next_pos = trial_items[i + 1][1]
        elif end_boundary is not None:
            next_pos = end_boundary
        else:
            next_pos = len(full_text)
        span = next_pos - pos
        if span >= _ANCHOR_QUALITY_MIN_SPAN:
            meaningful_count += 1

    # Require at least N Items with substantive span (corresponding to Items 1 and 2)
    return meaningful_count >= _ANCHOR_QUALITY_MIN_MEANINGFUL_ITEMS


def _build_ten_q_markers(full_text: str) -> list[tuple[int, Optional[str]]]:
    """Build Part + Item boundaries for Form 10-Q.

    Strategy: Leverage SEC Form 10-Q statutory structure (Part I Items 1-4,
    Part II Items 1-6+1A) combined with Part heading anchors for content boundaries,
    selected in two ordered phases:

    1. **Anchoring**: Detect all ``Part I -- Financial Information`` and
       ``Part II — Other Information`` heading position. Part II takes the last match;
       Part I validates anchor quality one by one from back to front (guarding against running headers).
    2. **Phase 1 -- Part I**: Select Items 1-4 within anchored region.
       when anchoring fails, fall back to ``_select_ordered_item_markers_after_toc``.
    3. **Phase 2 -- Part II**: After the last Item of Part I
       or the Part II anchor position, selecting Items 1, 1A, 2-6.
    4. Annotate each Item with its statutory Part.

    Using Part heading anchors with quality validation resolves:
    - TOC buffer being too wide causing actual content Items to be skipped;
    - Running page headers causing anchors to land at document end (e.g. MSFT).

    Args:
        full_text: full document text.

    Returns:
        marker list; an empty list triggers the parent-class fallback when markers are insufficient.

    Raises:
        RuntimeError: Raised when construction fails.
    """

    # Anchoring: find all Part statutory heading positions
    part_i_positions, part_ii_positions = _find_all_part_heading_positions(full_text)

    # Part II anchoring: take last match (Part II does not suffer running header repetition,
    # as Part II is in second half of filing where running headers repeat Part I)
    part_ii_anchor = part_ii_positions[-1] if part_ii_positions else None

    # Part I anchoring: validate quality in reverse to prevent running header offset
    part_i_anchor = _select_best_part_i_anchor(
        full_text,
        part_i_positions,
        part_ii_anchor,
    )

    # Phase 1: Part I Items
    if part_i_anchor is not None:
        # Part heading anchored -> select Items 1-4 in order within the Part I region
        # end_at is limited to the Part II anchor position (if any) to prevent selecting Part II Items
        part_i_selected = _select_ordered_item_markers(
            full_text,
            item_pattern=_TEN_Q_ITEM_PATTERN,
            ordered_tokens=_TEN_Q_PART_I_ITEM_ORDER,
            start_at=part_i_anchor,
            end_at=part_ii_anchor,
        )
    else:
        # no qualified Part heading anchor -> fall back to the TOC adaptive strategy
        # pass part_ii_anchor to bound the selection range, preventing Part I Items
        # straying into the Part II TOC region (NFLX 10-Q and other iXBRL file scenarios)
        #
        # note: when the Part I and Part II anchors are extremely close (both inside the ToC cluster),
        # must not use a Part II ToC entry as the Phase 1 range upper bound -- otherwise
        # all Part I Items in the body are excluded (e.g. HIG 10-Q).
        effective_phase1_end_at = part_ii_anchor
        if (
            part_ii_anchor is not None
            and part_i_positions
            and part_ii_anchor - min(part_i_positions) < _PART_II_ANCHOR_MAX_TOC_SPREAD
        ):
            # Part I / Part II anchors are both inside the ToC cluster; do not restrict the Phase 1 range
            effective_phase1_end_at = None
        part_i_selected = _select_ordered_item_markers_after_toc(
            full_text,
            item_pattern=_TEN_Q_ITEM_PATTERN,
            ordered_tokens=_TEN_Q_PART_I_ITEM_ORDER,
            min_items_after_toc=2,
            end_at=effective_phase1_end_at,
        )
    part_i_selected = _repair_part_i_key_items_with_heading_fallback(
        full_text=full_text,
        part_i_selected=part_i_selected,
        start_at=part_i_anchor if part_i_anchor is not None else 0,
        end_at=part_ii_anchor,
    )

    # Phase 2: Part II Items
    # Determine Phase 2 scan start
    if part_i_selected:
        # start after the last Item of Part I
        phase_2_start = part_i_selected[-1][1] + 1
    elif part_ii_anchor is not None:
        # no Part I Items but a Part II anchor -> start from Part II
        phase_2_start = part_ii_anchor
    else:
        # no anchoring information at all
        phase_2_start = 0

    if part_i_selected or part_ii_anchor is not None:
        # Part I already located or Part II anchored -> no need to repeat TOC denoising
        part_ii_selected = _select_ordered_item_markers(
            full_text,
            item_pattern=_TEN_Q_ITEM_PATTERN,
            ordered_tokens=_TEN_Q_PART_II_ITEM_ORDER,
            start_at=phase_2_start,
        )
    else:
        # no anchoring at all -> Part II also needs full TOC denoising
        part_ii_selected = _select_ordered_item_markers_after_toc(
            full_text,
            item_pattern=_TEN_Q_ITEM_PATTERN,
            ordered_tokens=_TEN_Q_PART_II_ITEM_ORDER,
            min_items_after_toc=2,
        )
    part_ii_selected = _repair_part_ii_key_items_with_heading_fallback(
        full_text=full_text,
        part_ii_selected=part_ii_selected,
        start_at=phase_2_start,
    )

    # Merge markers, annotate Part labels via SEC statutory structure
    markers: list[tuple[int, Optional[str]]] = []
    for item_token, position in part_i_selected:
        markers.append((position, f"Part I - Item {item_token}"))
    for item_token, position in part_ii_selected:
        markers.append((position, f"Part II - Item {item_token}"))

    if len(markers) < 3:
        return []

    # Trailing SIGNATURE section
    signature_marker = _find_marker_after(
        _SIGNATURE_PATTERN,
        full_text,
        int(markers[-1][0]),
        "SIGNATURE",
    )
    if signature_marker is not None:
        markers.append(signature_marker)
    return _dedupe_markers(markers)


def expand_ten_q_virtual_sections_content(
    *,
    full_text: str,
    virtual_sections: list[_VirtualSection],
) -> None:
    """Fix TOC/stub miscut bodies in 10-Q virtual sections.

    This post-processing does not alter the statutory Item skeleton; once virtual sections are formed,
    it replaces section starts landing on ToC lines, page references, or by-reference wrappers
    with more credible body headings from the same filing.

    Args:
        full_text: full text to split.
        virtual_sections: built virtual-section list.

    Returns:
        None.

    Raises:
        RuntimeError: Raised when repair fails.
    """

    if not full_text or not virtual_sections:
        return

    top_level_sections = _collect_ten_q_top_level_sections(virtual_sections)
    if not top_level_sections:
        return

    replacement_starts: dict[tuple[str, str], int] = {}
    any_replacement_applied = False
    target_keys = (("I", "1"), ("I", "2"), ("II", "1"), ("II", "1A"), ("II", "2"))
    section_map = _collect_ten_q_virtual_item_sections(top_level_sections)
    for key in target_keys:
        section = section_map.get(key)
        if section is None:
            continue
        replacement_start = _resolve_ten_q_virtual_section_replacement_start(
            full_text=full_text,
            section=section,
            key=key,
        )
        if replacement_start is None:
            continue
        replacement_starts[key] = replacement_start

    if not replacement_starts:
        return

    for index, section in enumerate(top_level_sections):
        key = _parse_ten_q_virtual_section_key(section.title)
        if key is None:
            continue
        replacement_start = replacement_starts.get(key)
        if replacement_start is None:
            continue
        replacement_end = _resolve_ten_q_virtual_section_replacement_end(
            full_text=full_text,
            top_level_sections=top_level_sections,
            current_index=index,
            replacement_starts=replacement_starts,
            replacement_start=replacement_start,
        )
        if replacement_end is None or replacement_end <= replacement_start:
            continue
        replacement_content = full_text[replacement_start:replacement_end].strip()
        allow_toc_boundary_replacement = _has_ten_q_toc_like_start(
            full_text=full_text,
            position=section.start,
        )
        if not _should_apply_ten_q_virtual_section_replacement(
            current_content=section.content,
            replacement_content=replacement_content,
            allow_toc_boundary_replacement=allow_toc_boundary_replacement,
        ):
            continue
        section.start = replacement_start
        section.end = replacement_end
        section.content = replacement_content
        section.preview = _normalize_whitespace(replacement_content)[:_PREVIEW_MAX_CHARS]
        any_replacement_applied = True

    if any_replacement_applied:
        virtual_sections.sort(key=lambda section: (section.start, section.level, section.ref))


def _collect_ten_q_top_level_sections(
    virtual_sections: list[_VirtualSection],
) -> list[_VirtualSection]:
    """Extract 10-Q top-level virtual sections.

    Args:
        virtual_sections: raw virtual-section list.

    Returns:
        ascending list of first-level sections only.

    Raises:
        RuntimeError: Raised when extraction fails.
    """

    return [section for section in virtual_sections if section.level == 1]


def _collect_ten_q_virtual_item_sections(
    virtual_sections: list[_VirtualSection],
) -> dict[tuple[str, str], _VirtualSection]:
    """Extract 10-Q top-level Item virtual section mapping.

    Args:
        virtual_sections: top-level virtual-section list.

    Returns:
        ``(part, item) -> section`` mapping.

    Raises:
        RuntimeError: Raised when extraction fails.
    """

    mapping: dict[tuple[str, str], _VirtualSection] = {}
    for section in virtual_sections:
        key = _parse_ten_q_virtual_section_key(section.title)
        if key is None:
            continue
        mapping[key] = section
    return mapping


def _parse_ten_q_virtual_section_key(title: Optional[str]) -> Optional[tuple[str, str]]:
    """Parse ``(part, item)`` key from 10-Q top-level section title.

    Args:
        title: virtual-section title.

    Returns:
        ``("I"|"II", item_token)`` on success, otherwise ``None``.

    Raises:
        RuntimeError: Raised when parsing fails.
    """

    match = _TEN_Q_VIRTUAL_SECTION_ITEM_RE.search(str(title or ""))
    if match is None:
        return None
    part = str(match.group(1) or "").upper()
    item = str(match.group(2) or "").upper()
    if not part or not item:
        return None
    return part, item


def _resolve_ten_q_virtual_section_replacement_start(
    *,
    full_text: str,
    section: _VirtualSection,
    key: tuple[str, str],
) -> Optional[int]:
    """Select a more trustworthy body start for a suspicious 10-Q section.

    Args:
        full_text: full document text.
        section: current virtual section.
        key: ``(part, item)`` key.

    Returns:
        more trustworthy body start; ``None`` when there is no candidate.

    Raises:
        RuntimeError: Raised when selection fails.
    """

    if not _looks_like_ten_q_virtual_section_stub(full_text, section):
        return None

    search_start = min(len(full_text), max(section.start + _TEN_Q_REPLACEMENT_MIN_DISTANCE, 0))
    patterns = _build_ten_q_replacement_heading_patterns(key=key, section=section)
    if not patterns:
        return None
    forward_replacement = _find_ten_q_heading_position(
        full_text=full_text,
        patterns=patterns,
        start_at=search_start,
    )
    if forward_replacement is not None and forward_replacement > section.start:
        return forward_replacement

    if _TEN_Q_BY_REFERENCE_STUB_RE.search(str(section.content or "")) is None:
        return None

    backward_replacement = _find_last_ten_q_heading_position(
        full_text=full_text,
        patterns=patterns,
        end_at=max(0, section.start - 1),
    )
    if backward_replacement is None:
        return None
    return backward_replacement


def _build_ten_q_replacement_heading_patterns(
    *,
    key: tuple[str, str],
    section: _VirtualSection,
) -> tuple[re.Pattern[str], ...]:
    """Build candidate body heading patterns for 10-Q section.

    Args:
        key: ``(part, item)`` key.
        section: current virtual section.

    Returns:
        regex pattern tuple for body recovery.

    Raises:
        RuntimeError: Raised when construction fails.
    """

    patterns = list(_TEN_Q_DEFAULT_HEADING_PATTERNS.get(key, ()))
    if key == ("I", "2"):
        patterns.extend(_derive_ten_q_item_2_alias_patterns(section.content))
    return tuple(patterns)


def _derive_ten_q_item_2_alias_patterns(content: str) -> tuple[re.Pattern[str], ...]:
    """Extract MD&A alias headings from the current Item 2 content.

    Typical scenario is a ToC entry formatted as
    ``Management's Discussion ... (Financial Review)``,
    where the actual body heading only retains the parenthetical alias.

    Args:
        content: current Item 2 section content.

    Returns:
        heading pattern tuple generated from same-document aliases.

    Raises:
        RuntimeError: Raised when extraction fails.
    """

    aliases: list[str] = []
    for alias in _TEN_Q_ITEM_2_ALIAS_RE.findall(str(content or "")):
        cleaned = _normalize_whitespace(alias).strip(".,;:() ")
        if len(cleaned) < 3:
            continue
        if cleaned not in aliases:
            aliases.append(cleaned)

    patterns: list[re.Pattern[str]] = []
    for alias in aliases:
        escaped_alias = re.escape(alias)
        patterns.append(
            re.compile(rf"(?im)^\s*(?:item\s+2\s*[\.\:\-\u2013\u2014]?\s*)?{escaped_alias}\b")
        )
    return tuple(patterns)


def _find_ten_q_heading_position(
    *,
    full_text: str,
    patterns: tuple[re.Pattern[str], ...],
    start_at: int,
) -> Optional[int]:
    """Locate the first trustworthy 10-Q body heading in the full text.

    Args:
        full_text: full document text.
        patterns: heading candidate patterns.
        start_at: search start.

    Returns:
        first trustworthy hit position; ``None`` on a miss.

    Raises:
        RuntimeError: Raised when search fails.
    """

    best_position: Optional[int] = None
    for pattern in patterns:
        for match in pattern.finditer(full_text, pos=max(0, int(start_at))):
            matched_text = str(match.group(0) or "")
            leading_whitespace = len(matched_text) - len(matched_text.lstrip())
            position = int(match.start()) + leading_whitespace
            matched_text = str(match.group(0) or "")
            if not _looks_like_ten_q_standalone_heading_context(
                full_text=full_text,
                position=position,
                matched_text=matched_text,
            ):
                continue
            if best_position is None or position < best_position:
                best_position = position
            break
    return best_position


def _looks_like_ten_q_standalone_heading_context(
    *,
    full_text: str,
    position: int,
    matched_text: str,
) -> bool:
    """Judge whether a hit is in a standalone-heading context.

    Args:
        full_text: full document text.
        position: hit start.
        matched_text: matched raw text.

    Returns:
        ``True`` when it looks more like a standalone heading line.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    if _looks_like_toc_page_line(full_text, position):
        return False
    if _looks_like_inline_toc_snippet(full_text, position):
        return False

    line_start = full_text.rfind("\n", 0, max(0, int(position))) + 1
    line_end = full_text.find("\n", int(position))
    if line_end < 0:
        line_end = len(full_text)
    line = full_text[line_start:line_end]
    normalized_line = _normalize_whitespace(line)
    if len(normalized_line) > 220:
        return False

    prefix = line[: max(0, int(position) - line_start)]
    normalized_prefix = _normalize_whitespace(prefix)
    if normalized_prefix and _TEN_Q_HEADING_PREFIX_RE.fullmatch(normalized_prefix) is None:
        return False

    del matched_text
    return True


def _find_last_ten_q_heading_position(
    *,
    full_text: str,
    patterns: tuple[re.Pattern[str], ...],
    end_at: int,
) -> Optional[int]:
    """Locate the last trustworthy heading in the first half of the full text.

    Args:
        full_text: full document text.
        patterns: heading candidate patterns.
        end_at: search end (inclusive).

    Returns:
        last trustworthy hit position; ``None`` on a miss.

    Raises:
        RuntimeError: Raised when search fails.
    """

    best_position: Optional[int] = None
    for pattern in patterns:
        for match in pattern.finditer(full_text):
            matched_text = str(match.group(0) or "")
            leading_whitespace = len(matched_text) - len(matched_text.lstrip())
            position = int(match.start()) + leading_whitespace
            if position > end_at:
                break
            if not _looks_like_ten_q_standalone_heading_context(
                full_text=full_text,
                position=position,
                matched_text=matched_text,
            ):
                continue
            best_position = position
    return best_position


def _looks_like_ten_q_virtual_section_stub(
    full_text: str,
    section: _VirtualSection,
) -> bool:
    """Judge whether a 10-Q virtual section looks more like TOC/stub than body.

    Args:
        full_text: full document text.
        section: current virtual section.

    Returns:
        ``True`` when the section start or content looks like a ToC/wrapper sentence.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    if _has_ten_q_toc_like_start(full_text=full_text, position=section.start):
        return True

    normalized = _normalize_whitespace(str(section.content or ""))
    if not normalized:
        return False
    if len(normalized) <= _TEN_Q_HEADING_ONLY_MAX_CHARS and _looks_like_ten_q_titleish_stub_content(
        section.content
    ):
        return True
    if (
        len(normalized) <= _TEN_Q_STUB_SECTION_MAX_CHARS
        and _TEN_Q_BY_REFERENCE_STUB_RE.search(normalized) is not None
    ):
        return True
    current_line = _extract_ten_q_line_at_position(full_text, section.start)
    if (
        len(normalized) <= _TEN_Q_STUB_SECTION_MAX_CHARS
        and current_line
        and not _looks_like_ten_q_standalone_heading_context(
            full_text=full_text,
            position=section.start,
            matched_text=current_line,
        )
    ):
        return True
    return False


def _has_ten_q_toc_like_start(*, full_text: str, position: int) -> bool:
    """Judge whether a start looks more like a ToC line than a body heading.

    Args:
        full_text: full document text.
        position: position to judge.

    Returns:
        ``True`` when the start looks more like a TOC fragment.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    if _looks_like_toc_page_line(full_text, position):
        return True
    if _looks_like_inline_toc_snippet(full_text, position):
        return True

    current_line = _extract_ten_q_line_at_position(full_text, position)
    normalized_line = _normalize_whitespace(current_line)
    if not normalized_line:
        return False
    return (
        _TOC_PAGE_SNIPPET_PATTERN.match(normalized_line) is not None
        or _TOC_PAGE_LINE_PATTERN.match(normalized_line) is not None
        or _looks_like_inline_toc_snippet(normalized_line, 0)
    )


def _extract_ten_q_line_at_position(full_text: str, position: int) -> str:
    """Extract line text containing the given position.

    Args:
        full_text: full document text.
        position: target position.

    Returns:
        full line text containing that position.

    Raises:
        RuntimeError: Raised when extraction fails.
    """

    line_start = full_text.rfind("\n", 0, max(0, int(position))) + 1
    line_end = full_text.find("\n", max(0, int(position)))
    if line_end < 0:
        line_end = len(full_text)
    return full_text[line_start:line_end]


def _looks_like_ten_q_titleish_stub_content(content: str) -> bool:
    """Judge whether the content consists mainly of heading lines/page-number lines.

    Args:
        content: current section content.

    Returns:
        ``True`` when the content looks more like a title stub.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    lines = [
        _normalize_whitespace(line)
        for line in str(content or "").splitlines()
        if _normalize_whitespace(line)
    ]
    if not lines:
        return False
    if len(lines) == 1:
        line = lines[0]
        return (
            _TOC_PAGE_SNIPPET_PATTERN.match(line) is not None
            or _TOC_PAGE_LINE_PATTERN.match(line) is not None
            or _looks_like_inline_toc_snippet(line, 0)
            or _TEN_Q_HEADING_PREFIX_RE.fullmatch(line) is not None
            or _TEN_Q_TITLEISH_LINE_RE.fullmatch(line) is not None
        )

    page_like_count = 0
    titleish_count = 0
    for line in lines:
        if (
            _TOC_PAGE_LINE_PATTERN.match(line) is not None
            or _TOC_PAGE_SNIPPET_PATTERN.match(line) is not None
            or _looks_like_inline_toc_snippet(line, 0)
        ):
            page_like_count += 1
            continue
        if _TEN_Q_HEADING_PREFIX_RE.fullmatch(line) is not None:
            titleish_count += 1
            continue
        if _TEN_Q_TITLEISH_LINE_RE.fullmatch(line) is not None:
            titleish_count += 1

    if page_like_count / len(lines) >= _TEN_Q_STUB_PAGE_LINE_RATIO:
        return True
    return (page_like_count + titleish_count) == len(lines)


def _resolve_ten_q_virtual_section_replacement_end(
    *,
    full_text: str,
    top_level_sections: list[_VirtualSection],
    current_index: int,
    replacement_starts: dict[tuple[str, str], int],
    replacement_start: int,
) -> Optional[int]:
    """Choose a reasonable end position for a replacement body start.

    Args:
        full_text: full document text.
        top_level_sections: top-level section list.
        current_index: current section index.
        replacement_starts: computed replacement starts.
        replacement_start: replacement start of the current section.

    Returns:
        reasonable end position; ``None`` when undeterminable.

    Raises:
        RuntimeError: Raised when computation fails.
    """

    current_section = top_level_sections[current_index]
    next_boundary: Optional[int] = None
    for index, other_section in enumerate(top_level_sections):
        if index == current_index:
            continue
        other_key = _parse_ten_q_virtual_section_key(other_section.title)
        other_start = other_section.start
        if other_key is not None:
            other_start = replacement_starts.get(other_key, other_start)
        if other_start <= replacement_start:
            continue
        if next_boundary is None or other_start < next_boundary:
            next_boundary = other_start

    if next_boundary is not None:
        return next_boundary
    if current_section.end > replacement_start:
        return current_section.end
    return len(full_text)


def _should_apply_ten_q_virtual_section_replacement(
    *,
    current_content: str,
    replacement_content: str,
    allow_toc_boundary_replacement: bool,
) -> bool:
    """Judge whether a candidate body is significantly better than the current content.

    Args:
        current_content: current section content.
        replacement_content: candidate replacement content.
        allow_toc_boundary_replacement: allow shorter-but-more-accurate replacement if section starts in ToC.

    Returns:
        `True` when the candidate content looks clearly more like body text.

    Raises:
        RuntimeError: Raised when determination fails.
    """

    replacement_words = len(str(replacement_content or "").split())
    if replacement_words < 20:
        return False

    current_words = len(str(current_content or "").split())
    if allow_toc_boundary_replacement:
        return True
    if current_words <= 0:
        return True
    return replacement_words >= max(current_words + 20, int(current_words * 1.5))


def _repair_part_i_key_items_with_heading_fallback(
    *,
    full_text: str,
    part_i_selected: list[tuple[str, int]],
    start_at: int,
    end_at: Optional[int],
) -> list[tuple[str, int]]:
    """Repair missing or ToC-polluted key 10-Q Part I Items (1-4).

    Scenario:
    - Body uses ``Financial Statements`` / ``Management's Discussion``
      pure title without the ``Item 1/2`` prefix;
    - ``Item 3/4`` in body retains only standard heading, while raw marker fell in ToC.

    Args:
        full_text: full document text.
        part_i_selected: selected Part I Item list.
        start_at: Part I scan start.
        end_at: Part I scan end (usually the Part II anchor).

    Returns:
        repaired Part I Item list (in statutory order).

    Raises:
        RuntimeError: Raised when repair fails.
    """

    marker_map = {token: position for token, position in part_i_selected}
    boundary_start = max(0, int(start_at))
    boundary_end = len(full_text) if end_at is None else max(boundary_start, int(end_at))

    marker_map = _repair_ten_q_items_with_heading_fallback(
        full_text=full_text,
        marker_map=marker_map,
        tokens=("1", "2", "3", "4"),
        start_at=boundary_start,
        end_at=boundary_end,
        heading_patterns_map=_TEN_Q_PART_I_HEADING_FALLBACK_PATTERNS,
        expected_keywords_map=_TEN_Q_PART_I_EXPECTED_KEYWORDS,
        cross_reference_tokens={"1", "2"},
        non_standalone_heading_tokens={"2"},
    )

    marker_map = _repair_item_1_with_structured_heading_fallback(
        full_text=full_text,
        marker_map=marker_map,
        start_at=boundary_start,
        end_at=boundary_end,
    )

    repaired: list[tuple[str, int]] = []
    for token in _TEN_Q_PART_I_ITEM_ORDER:
        position = marker_map.get(token)
        if position is None:
            continue
        repaired.append((token, position))
    return repaired


def _repair_part_ii_key_items_with_heading_fallback(
    *,
    full_text: str,
    part_ii_selected: list[tuple[str, int]],
    start_at: int,
) -> list[tuple[str, int]]:
    """Repair missing or ToC-polluted key 10-Q Part II Items (5/6).

    Args:
        full_text: full document text.
        part_ii_selected: selected Part II Item list.
        start_at: Part II scan start.

    Returns:
        repaired Part II Item list (in statutory order).

    Raises:
        RuntimeError: Raised when repair fails.
    """

    marker_map = {token: position for token, position in part_ii_selected}
    marker_map = _repair_ten_q_items_with_heading_fallback(
        full_text=full_text,
        marker_map=marker_map,
        tokens=("5", "6"),
        start_at=max(0, int(start_at)),
        end_at=len(full_text),
        heading_patterns_map={
            "5": _TEN_Q_DEFAULT_HEADING_PATTERNS.get(("II", "5"), ()),
            "6": _TEN_Q_DEFAULT_HEADING_PATTERNS.get(("II", "6"), ()),
        },
        expected_keywords_map={
            "5": ("other information",),
            "6": ("exhibit",),
        },
        cross_reference_tokens=set(),
        non_standalone_heading_tokens=set(),
    )

    repaired: list[tuple[str, int]] = []
    for token in _TEN_Q_PART_II_ITEM_ORDER:
        position = marker_map.get(token)
        if position is None:
            continue
        repaired.append((token, position))
    return repaired


def _repair_ten_q_items_with_heading_fallback(
    *,
    full_text: str,
    marker_map: dict[str, int],
    tokens: tuple[str, ...],
    start_at: int,
    end_at: int,
    heading_patterns_map: dict[str, tuple[re.Pattern[str], ...]],
    expected_keywords_map: dict[str, tuple[str, ...]],
    cross_reference_tokens: set[str],
    non_standalone_heading_tokens: set[str],
) -> dict[str, int]:
    """Batch-repair 10-Q item anchors via heading fallback.

    Args:
        full_text: full document text.
        marker_map: current token -> position mapping.
        tokens: item token order to repair.
        start_at: search start.
        end_at: search end.
        heading_patterns_map: item -> heading regex set mapping.
        expected_keywords_map: item -> expected-keywords mapping.
        cross_reference_tokens: item set where cross-reference sentences must be excluded.
        non_standalone_heading_tokens: item set allowed to hit "non-standalone heading lines".

    Returns:
        repaired token -> position mapping.

    Raises:
        RuntimeError: Raised when repair fails.
    """

    repaired_marker_map = dict(marker_map)
    boundary_start = max(0, int(start_at))
    boundary_end = max(boundary_start, int(end_at))

    for token in tokens:
        current_pos = repaired_marker_map.get(token)
        needs_fallback = current_pos is None
        if current_pos is not None:
            if _has_ten_q_toc_like_start(full_text=full_text, position=current_pos):
                needs_fallback = True
            elif token in cross_reference_tokens and _looks_like_part_i_item_cross_reference(
                full_text, token, current_pos
            ):
                # avoid hitting cross-reference sentences like "in/to Part I, Item N" in the body.
                needs_fallback = True
            elif not _matches_ten_q_expected_heading(
                full_text=full_text,
                expected_keywords_map=expected_keywords_map,
                token=token,
                position=current_pos,
            ):
                needs_fallback = True
        if not needs_fallback:
            continue

        patterns = heading_patterns_map.get(token, ())
        fallback_pos = _find_first_pattern_position_in_range(
            full_text=full_text,
            patterns=patterns,
            start_at=boundary_start,
            end_at=boundary_end,
            require_standalone_heading=token not in non_standalone_heading_tokens,
        )
        if fallback_pos is None:
            continue
        repaired_marker_map[token] = fallback_pos

    return repaired_marker_map


def _repair_item_1_with_structured_heading_fallback(
    *,
    full_text: str,
    marker_map: dict[str, int],
    start_at: int,
    end_at: int,
) -> dict[str, int]:
    """Repair the Part I Item 1 anchor using structured financial-statement headings.

    When ``Item 1/2`` both mistakenly land on ToC summary lines, ``Item 1`` is often swallowed
    during splitting due to short distance to ``Item 2``. This repair falls back to body anchors
    based on common SEC 10-Q body headings (such as ``Condensed Consolidated Financial Statements``).

    Args:
        full_text: full document text.
        marker_map: current token -> position mapping.
        start_at: Part I scan start.
        end_at: Part I scan end.

    Returns:
        repaired token -> position mapping.

    Raises:
        RuntimeError: Raised when repair fails.
    """

    item_1_position = marker_map.get("1")
    item_2_position = marker_map.get("2")

    needs_item_1_repair = item_1_position is None
    if item_1_position is not None and item_2_position is not None:
        if abs(item_2_position - item_1_position) < _MIN_PART_I_KEY_ITEM_GAP_CHARS:
            needs_item_1_repair = True
    if not needs_item_1_repair:
        return marker_map

    fallback_position = _find_item_1_structured_heading_position(
        full_text=full_text,
        start_at=start_at,
        end_at=end_at,
        item_2_position=item_2_position,
    )
    if fallback_position is None:
        return marker_map

    marker_map["1"] = fallback_position
    return marker_map


def _find_item_1_structured_heading_position(
    *,
    full_text: str,
    start_at: int,
    end_at: int,
    item_2_position: Optional[int],
) -> Optional[int]:
    """Find Item 1's structured body-heading position within Part I.

    Args:
        full_text: full document text.
        start_at: scan start.
        end_at: scan end.
        item_2_position: optional Item 2 position, used to prefer an Item 1 anchor before it.

    Returns:
        hit position; ``None`` on a miss.

    Raises:
        RuntimeError: Raised when scan fails.
    """

    lower = max(0, int(start_at))
    upper = max(lower, int(end_at))
    valid_positions: list[int] = []

    for pattern in _TEN_Q_ITEM_1_STRUCTURED_HEADING_PATTERNS:
        for match in pattern.finditer(full_text, pos=lower, endpos=upper):
            position = int(match.start())
            if _looks_like_toc_page_line(full_text, position):
                continue
            if _looks_like_part_i_toc_summary(full_text, position):
                continue
            if _looks_like_inline_toc_snippet(full_text, position):
                continue
            valid_positions.append(position)

    if not valid_positions:
        return None

    ordered_positions = sorted(set(valid_positions))
    if item_2_position is None:
        return ordered_positions[0]

    preferred_before_item_2 = [
        position
        for position in ordered_positions
        if position + _MIN_PART_I_KEY_ITEM_GAP_CHARS <= int(item_2_position)
    ]
    if preferred_before_item_2:
        # prefer the body anchor closest to Item 2 that still precedes it.
        return preferred_before_item_2[-1]
    return ordered_positions[0]


def _find_first_pattern_position_in_range(
    *,
    full_text: str,
    patterns: tuple[re.Pattern[str], ...],
    start_at: int,
    end_at: int,
    require_standalone_heading: bool = True,
) -> Optional[int]:
    """Find the earliest hit position of candidate heading regexes within the given range.

    Args:
        full_text: full document text.
        patterns: candidate heading regex list.
        start_at: start position (inclusive).
        end_at: end position (exclusive).
        require_standalone_heading: whether hits must be in a standalone-heading context.

    Returns:
        earliest hit position; `None` on a miss.

    Raises:
        RuntimeError: Raised when scan fails.
    """

    best_position: Optional[int] = None
    best_toc_like_position: Optional[int] = None
    lower = max(0, int(start_at))
    upper = max(lower, int(end_at))
    for pattern in patterns:
        for match in pattern.finditer(full_text, pos=lower, endpos=upper):
            matched_text = str(match.group(0) or "")
            leading_whitespace = len(matched_text) - len(matched_text.lstrip())
            position = int(match.start()) + leading_whitespace
            if _looks_like_toc_page_line(full_text, position):
                if best_toc_like_position is None or position < best_toc_like_position:
                    best_toc_like_position = position
                continue
            if _looks_like_part_i_toc_summary(full_text, position):
                if best_toc_like_position is None or position < best_toc_like_position:
                    best_toc_like_position = position
                continue
            if _looks_like_inline_toc_snippet(full_text, position):
                if best_toc_like_position is None or position < best_toc_like_position:
                    best_toc_like_position = position
                continue
            if require_standalone_heading and not _looks_like_ten_q_standalone_heading_context(
                full_text=full_text,
                position=position,
                matched_text=matched_text,
            ):
                continue
            if best_position is None or position < best_position:
                best_position = position
    if best_position is not None:
        return best_position
    return best_toc_like_position


def _looks_like_part_i_toc_summary(full_text: str, position: int) -> bool:
    """Judge whether a hit falls on a 10-Q Part I ToC summary line.

    Args:
        full_text: full document text.
        position: position to judge.

    Returns:
        ``True`` when a directory-summary pattern hits, otherwise ``False``.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    start = max(0, int(position) - 80)
    end = min(len(full_text), int(position) + 420)
    snippet = full_text[start:end]
    return _TEN_Q_PART_I_TOC_SUMMARY_PATTERN.search(snippet) is not None


def _looks_like_part_i_item_cross_reference(full_text: str, token: str, position: int) -> bool:
    """Judge whether a hit is a Part I Item cross-reference sentence rather than a section heading.

    Typical false-hit example:
    ``... incorporated by reference to Part I, Item 2: \"Management's Discussion ...\"``.
    Such text contains Item keywords without being section boundaries, requiring fallback to find real heading.

    Args:
        full_text: full document text.
        token: Item token (only ``"1"`` / ``"2"`` currently use this judgment).
        position: position to judge.

    Returns:
        ``True`` when a cross-reference sentence is hit, otherwise ``False``.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    if token not in {"1", "2"}:
        return False

    start = max(0, int(position) - 140)
    end = min(len(full_text), int(position) + 220)
    snippet = full_text[start:end]
    local_position = int(position) - start

    for match in _PART_I_ITEM_CROSS_REFERENCE_PATTERN.finditer(snippet):
        matched_token = str(match.group(1) or "").upper()
        if matched_token != token.upper():
            continue
        # only classify as a cross-reference when the hit position is near a cross-reference phrase.
        if match.start() <= local_position <= match.end() + 8:
            return True
    return False


def _matches_ten_q_expected_heading(
    *,
    full_text: str,
    expected_keywords_map: dict[str, tuple[str, ...]],
    token: str,
    position: int,
) -> bool:
    """Judge whether a 10-Q Item hits the expected title semantics.

    Args:
        full_text: full document text.
        expected_keywords_map: item -> expected-keywords mapping.
        token: Item token.
        position: marker position.

    Returns:
        ``True`` when the hit-position fragment contains the Item's expected keywords.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    expected = expected_keywords_map.get(token)
    if not expected:
        return True

    start = max(0, min(len(full_text), int(position)))
    snippet = full_text[start : min(len(full_text), start + 240)].lower()
    return all(keyword in snippet for keyword in expected)


def _matches_part_i_expected_heading(full_text: str, token: str, position: int) -> bool:
    """Legacy interface: judge whether a Part I Item hits the expected title semantics.

    Args:
        full_text: full document text.
        token: Item token。
        position: marker position.

    Returns:
        ``True`` when the hit-position fragment contains the Item's expected keywords.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    return _matches_ten_q_expected_heading(
        full_text=full_text,
        expected_keywords_map=_TEN_Q_PART_I_EXPECTED_KEYWORDS,
        token=token,
        position=position,
    )


def _looks_like_toc_page_line(full_text: str, position: int) -> bool:
    """10-Q flavor of the ToC page-number line check, delegating to the shared implementation."""
    return _looks_like_toc_page_line_generic(
        full_text, position, _TOC_PAGE_LINE_PATTERN, _TOC_PAGE_SNIPPET_PATTERN
    )
