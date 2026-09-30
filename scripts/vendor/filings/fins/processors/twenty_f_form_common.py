"""Form 20-F common constants and marker construction logic.

Extracts shared constants and marker functions for Form 20-F, used by both
``TwentyFFormProcessor`` (edgartools path) and
``BsTwentyFFormProcessor`` (BeautifulSoup path).

Both processors import from this module independently, preserving architectural separation.

Maintenance note (do not split this module):
    Although this module exceeds 3000 lines, all 56 private functions center around the
    single domain problem of 20-F marker construction with highly coupled call graphs:
    core repair functions call 15 sibling functions spanning cross-reference / contamination /
    context validation / order preservation. Splitting by sub-concerns would create ~20 cross-module
    imports without reducing coupling, only increasing maintenance burden.
"""

from __future__ import annotations

import html
import re
from collections.abc import Collection
from typing import Optional

from .sec_form_section_common import (
    SIGNATURE_PATTERN as _SIGNATURE_PATTERN,
)
from .sec_form_section_common import (
    _dedupe_markers,
    _find_marker_after,
    _looks_like_reference_guide_content,
)
from .sec_report_form_common import (
    _looks_like_inline_toc_snippet,
    _looks_like_toc_page_line_generic,
    _select_ordered_item_markers,
    _select_ordered_item_markers_after_toc,
)

# -- SEC Form 20-F statutory Item order --------------------------
# Ref: SEC Form 20-F General Instructions, Part I-IV
_TWENTY_F_ITEM_ORDER: tuple[str, ...] = (
    "1",
    "2",
    "3",
    "4",
    "4A",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
    "12",
    "13",
    "14",
    "15",
    "16A",
    "16B",
    "16C",
    "16D",
    "16E",
    "16F",
    "16G",
    "16H",
    "16I",
    "16J",
    "17",
    "18",
    "19",
)

# Item matching regex: matches formats like "Item 3." / "Item 16A:" / "ITEM 18 -"
# Uses exact enumeration to prevent Item 1 from matching Item 10/11/12 prefixes.
# Also supports unpunctuated format like "Item 5 Operating..." (next char must be letter,
# avoiding hitting checkbox "Item 18 [ ]" on cover).
_TWENTY_F_ITEM_PATTERN = re.compile(
    r"(?im)(?:\bitem\s+(16[A-J]|4A|1[0-9]|[1-9])(?:\s*[\.\:\-\u2013\u2014]\s*|\s+(?=[A-Za-z])))"
    r"|(?:^|\n)\s*(16[A-J]|4A|1[0-9]|[1-9])\s*(?:[\.\:\-\u2013\u2014]\s*|\s+)"
    r"(?=(?:key\s+information|information\s+on\s+the\s+company|operating\s+and\s+financial\s+review|"
    r"financial\s+statements|controls\s+and\s+procedures|additional\s+information|exhibits)\b)"
)
# Split into two tiers: "exact Item prefix" and "bare phrase", preventing bare phrase
# from generating hundreds of hits in large files and invoking filters repeatedly (O(matches * filters)).
# Exact tier matches rarely and resolves fast; bare phrase triggers only when exact tier misses.
_TWENTY_F_KEY_ITEM_FALLBACK_PATTERNS: dict[str, tuple[re.Pattern[str], ...]] = {
    "3": (
        re.compile(r"(?i)\bitem\s+3\s*[\.\:\-\u2013\u2014]\s*key\s+information\b"),
        re.compile(r"(?i)\bkey\s+information\b"),
        re.compile(r"(?i)\bsummary\s+of\s+risk\s+factors\b"),
        re.compile(r"(?i)\bgroup\s+principal\s+risks\b"),
        re.compile(r"(?i)\bprincipal\s+risks?\s+and\s+uncertainties\b"),
        re.compile(r"(?i)\brisk\s+factors\b"),
    ),
    "4": (
        re.compile(r"(?i)\bitem\s+4\s*[\.\:\-\u2013\u2014]\s*information\s+on\s+the\s+company\b"),
        re.compile(r"(?i)\binformation\s+on\s+the\s+company\b"),
    ),
    "5": (
        re.compile(
            r"(?i)\bitem\s+5\s*[\.\:\-\u2013\u2014]\s*operating\s+and\s+financial\s+review\s+and\s+prospects\b"
        ),
        re.compile(r"(?i)\boperating\s+and\s+financial\s+review\s+and\s+prospects\b"),
        re.compile(r"(?i)\bchief\s+financial\s+officer(?:'|’)?s\s+review\b"),
        re.compile(r"(?i)\bfinancial\s+review\b"),
        re.compile(r"(?i)\bfinancial\s+performance\b"),
        re.compile(r"(?i)\bfinancial\s+performance\s+summary\b"),
        re.compile(r"(?i)\boperating\s+results\b"),
        re.compile(r"(?i)\bliquidity\s+and\s+capital\s+resources\b"),
        re.compile(r"(?i)\bkey\s+performance\s+indicators\b"),
    ),
    "18": (
        re.compile(r"(?i)\bitem\s+18\s*[\.\:\-\u2013\u2014]\s*financial\s+statements\b"),
        re.compile(r"(?i)\breport\s+of\s+independent\s+registered\s+public\s+accounting\s+firm\b"),
        re.compile(r"(?i)\bconsolidated\s+financial\s+statements\b"),
        re.compile(r"(?i)\bgroup\s+financial\s+statements\b"),
        re.compile(r"(?i)\bgroup\s+companies\s+and\s+undertakings\b"),
        re.compile(r"(?i)\bfinancial\s+statements\b"),
    ),
}
_TWENTY_F_ITEM_5_SUBHEADING_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(
        r"(?i)\b(?:item\s+5\s*[\.\:\-\u2013\u2014]\s*)?operating\s+and\s+financial\s+review\s+and\s+prospects\b"
    ),
    re.compile(r"(?i)\bfinancial\s+review\b"),
    re.compile(r"(?i)\bfinancial\s+performance\b"),
    re.compile(r"(?i)\boperating\s+results\b"),
    re.compile(r"(?i)\bliquidity\s+and\s+capital\s+resources\b"),
    re.compile(r"(?i)\btrend\s+information\b"),
    re.compile(r"(?i)\bkey\s+performance\s+indicators\b"),
)
_TWENTY_F_KEY_ITEMS = ("3", "5", "18")
_TWENTY_F_REPAIR_ITEMS = ("3", "4", "5", "18")
_TOC_PAGE_LINE_PATTERN = re.compile(r"(?im)^\s*[A-Za-z][^\n]{0,220}\b\d{1,3}\s*$")
_TOC_PAGE_SNIPPET_PATTERN = re.compile(
    r"(?is)^\s*(?:item\s+(?:16[A-J]|4A|1[0-9]|[1-9])\s*[\.\:\-\u2013\u2014]?\s*)?"
    r"[A-Za-z][^\n]{0,220}\b\d{1,3}\b(?:\s+item\s+(?:16[A-J]|4A|1[0-9]|[1-9])\b|\s*$)"
)
_TOC_PAGE_LEADING_NUMBER_LINE_PATTERN = re.compile(
    r"(?im)^\s*\d{1,3}\s+(?:[^\w\n]{0,3}\s*)?[A-Za-z][^\n]{0,220}$"
)

# -- SEC 20-F statutory Item->Part mapping ----------------------
# Ref: SEC Form 20-F statutory structure:
#   Part I:   Items 1, 2, 3, 4, 4A
#   Part II:  Items 5, 6, 7, 8, 9, 10, 11, 12
#   Part III: Items 13, 14, 15, 16, 16A–16J
#   Part IV:  Items 17, 18, 19
_TWENTY_F_ITEM_PART_MAP: dict[str, str] = {
    "1": "I",
    "2": "I",
    "3": "I",
    "4": "I",
    "4A": "I",
    "5": "II",
    "6": "II",
    "7": "II",
    "8": "II",
    "9": "II",
    "10": "II",
    "11": "II",
    "12": "II",
    "13": "III",
    "14": "III",
    "15": "III",
    "16": "III",
    "16A": "III",
    "16B": "III",
    "16C": "III",
    "16D": "III",
    "16E": "III",
    "16F": "III",
    "16G": "III",
    "16H": "III",
    "16I": "III",
    "16J": "III",
    "17": "IV",
    "18": "IV",
    "19": "IV",
}

# -- SEC 20-F statutory Item standard descriptions --------------
# Ref: SEC Form 20-F Table of Contents statutory item names.
# Descriptions provided only for high-frequency analysis Items (governance 16A-16J omitted),
# helping LLMs locate target sections quickly by heading.
_TWENTY_F_ITEM_DESCRIPTIONS: dict[str, str] = {
    "1": "Identity of Directors, Senior Management and Advisers",
    "2": "Offer Statistics and Expected Timetable",
    "3": "Key Information",
    "4": "Information on the Company",
    "4A": "Unresolved Staff Comments",
    "5": "Operating and Financial Review and Prospects",
    "6": "Directors, Senior Management and Employees",
    "7": "Major Shareholders and Related Party Transactions",
    "8": "Financial Information",
    "9": "The Offer and Listing",
    "10": "Additional Information",
    "11": "Quantitative and Qualitative Disclosures About Market Risk",
    "12": "Description of Securities Other Than Equity Securities",
    "13": "Defaults, Dividend Arrearages and Delinquencies",
    "14": "Material Modifications to the Rights of Security Holders",
    "15": "Controls and Procedures",
    "17": "Financial Statements",
    "18": "Financial Statements",
    "19": "Exhibits",
}
_TWENTY_F_REPORT_START_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(
        r"(?i)annual\s+report\s+pursuant\s+to\s+section\s+13\s+or\s+15\(d\)\s+of\s+the\s+securities\s+exchange\s+act\s+of\s+1934"
    ),
    re.compile(
        r"(?i)transition\s+report\s+pursuant\s+to\s+section\s+13\s+or\s+15\(d\)\s+of\s+the\s+securities\s+exchange\s+act\s+of\s+1934"
    ),
    re.compile(
        r"(?i)securities\s+registered\s+or\s+to\s+be\s+registered\s+pursuant\s+to\s+section\s+12\(b\)\s+of\s+the\s+act"
    ),
)
_TWENTY_F_XBRL_QNAME_RE = re.compile(r"\b[a-z][a-z0-9_-]*:[A-Za-z][A-Za-z0-9_-]+\b")
_TWENTY_F_XBRL_PREAMBLE_MIN_QNAME_COUNT = 40
_TWENTY_F_MIN_PREAMBLE_TRIM_OFFSET = 50_000
_TWENTY_F_REPORT_START_BACKTRACK_CHARS = 4_000
_TWENTY_F_REPORT_START_MAX_GAP_TO_ITEM = 20_000
_TWENTY_F_COMMISSION_FILE_RE = re.compile(r"(?i)commission\s+file\s+number")
_TWENTY_F_FRONT_MATTER_CONTEXT_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"(?i)cross\s+reference\s+guide"),
    re.compile(r"(?i)response\s+or\s+location\s+in\s+this\s+filing"),
    re.compile(r"(?i)location\s+in\s+this\s+document"),
    re.compile(r"(?i)indicate\s+by\s+check\s+mark"),
    re.compile(r"(?i)if\s+this\s+is\s+an\s+annual\s+report"),
    re.compile(r"(?i)form\s+20-f\s+caption"),
)
_TWENTY_F_FRONT_MATTER_LOOKBACK_CHARS = 320
_TWENTY_F_FRONT_MATTER_LOOKAHEAD_CHARS = 1600
_TWENTY_F_REFERENCE_GUIDE_LOOKBACK_CHARS = 1600
_TWENTY_F_REFERENCE_GUIDE_LOOKAHEAD_CHARS = 800
_TWENTY_F_MIN_RETRY_MARKERS_AFTER_FRONT_MATTER = 3
_TWENTY_F_FRONT_MATTER_MAX_SKIP_RETRIES = 3
_TWENTY_F_FRONT_MATTER_SINGLE_SKIP_MIN_GAP = 20_000
_TWENTY_F_HEADING_PREFIX_WORD_RE = re.compile(r"[A-Za-z]{2,}")
_TWENTY_F_HEADING_PREFIX_ENUM_RE = re.compile(
    r"(?i)(?:^|[\s(])(?:item\s+(?:16[A-J]|4A|1[0-9]|[1-9])|[A-D]|\d{1,2}(?:-\d{1,2})?)\s*[\.\-–—:)]?\s*$"
)
_TWENTY_F_ANNUAL_REPORT_PAGE_NUMBER_RE = re.compile(r"\b\d{1,3}\s*$")
_TWENTY_F_ANNUAL_REPORT_PAGE_RANGE_RE = re.compile(r"\b\d{1,3}\s*[–—-]\s*\d{1,3}\b")
_TWENTY_F_ANNUAL_REPORT_HEADING_PREFIX_WORD_RE = re.compile(r"[A-Za-z]{2,}")
_TWENTY_F_ANNUAL_REPORT_FOOTER_CONTEXT_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"(?i)annual\s+report\s+and\s+form\s+20-f"),
    re.compile(r"(?i)\bstrategic\s+report\b"),
    re.compile(r"(?i)\bgovernance\s+report\b"),
    re.compile(r"(?i)\bfinancial\s+statements\b"),
    re.compile(r"(?i)\bother\s+information\b"),
)
_TWENTY_F_ANNUAL_REPORT_FOOTER_CONTEXT_LOOKBACK_CHARS = 240
_TWENTY_F_ANNUAL_REPORT_FOOTER_CONTEXT_MIN_HITS = 2
_TWENTY_F_ANNUAL_REPORT_REPEAT_LOOKAHEAD_CHARS = 80
_TWENTY_F_ANNUAL_REPORT_PAGE_HEADING_MAX_PREFIX_WORDS = 6
_TWENTY_F_ANNUAL_REPORT_PAGE_HEADING_NEIGHBOR_LINES = 3
_TWENTY_F_DIRECT_ITEM_BODY_LOOKAHEAD_LINES = 10
_TWENTY_F_ANNUAL_REPORT_PAGE_HEADING_MIN_PROSE_WORDS = 12
_TWENTY_F_INLINE_REFERENCE_PREFIX_RE = re.compile(
    r"(?i)\b(?:"
    r"see|under|described\s+under|described\s+in|discussed\s+under|discussed\s+in|"
    r"included\s+in|contained\s+in|set\s+forth\s+in|presented\s+in|provided\s+in|"
    r"within|refer(?:ring)?\s+to|addressed\s+in|found\s+in"
    r")\b[^\n]{0,120}$"
)
_TWENTY_F_ITEM_18_TOKEN_RE = re.compile(r"(?i)\bitem\s+18\b")
_TWENTY_F_FINANCIAL_STATEMENTS_RE = re.compile(r"(?i)\bfinancial\s+statements\b")
_TWENTY_F_INLINE_REFERENCE_PREFIX_HINTS: tuple[str, ...] = (
    "see",
    "under",
    "described",
    "discussed",
    "included",
    "contained",
    "set forth",
    "presented",
    "provided",
    "within",
    "refer",
    "addressed",
    "found",
)
_TWENTY_F_REFERENCE_GUIDE_LOCAL_PROBE_RE = re.compile(
    r"(?i)\b(?:"
    r"annual\s+report|form\s+20-f|cross[\s-]*reference|location\s+in\s+(?:this\s+)?(?:document|filing)|"
    r"response\s+or\s+location|caption|guide|note\s+\d+|pages?\s+[A-Z]?-?\d+|afr"
    r")\b"
)
_TWENTY_F_GUIDE_ANCHOR_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"(?i)form\s+20-f\s+caption"),
    re.compile(r"(?i)form\s+20-f\s+references?"),
    re.compile(r"(?i)cross[\s-]*reference(?:\s+guide|\s+to\s+form\s+20-f)?"),
    re.compile(r"(?i)cross[\s-]*reference\s+table(?:\s+below)?"),
    re.compile(r"(?i)location\s+in\s+this\s+document"),
    re.compile(r"(?i)location\s+in\s+the\s+document"),
)
_TWENTY_F_GUIDE_ITEM_TOKENS: tuple[str, ...] = (
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
    "12",
    "13",
    "14",
    "15",
    "18",
    "19",
)
_TWENTY_F_GUIDE_WINDOW_LOOKAHEAD_CHARS = 60_000
_TWENTY_F_GUIDE_TAIL_LOOKBACK_CHARS = 25_000
_TWENTY_F_ITEM18_BODY_LOOKAHEAD_LINES = 6
_TWENTY_F_ITEM18_BODY_PROBE_LOOKBACK_CHARS = 32
_TWENTY_F_ITEM18_BODY_PROBE_LOOKAHEAD_CHARS = 220
_TWENTY_F_GUIDE_PAGE_TOKEN_RE = re.compile(
    r"(?i)\b(?:page(?:s)?\s*)?\d{1,3}(?:\s*(?:-|–|—|to)\s*\d{1,3})?\b"
)
_TWENTY_F_GUIDE_QUOTED_PHRASE_RE = re.compile(r"[\"“”']([^\"“”']{3,160})[\"“”']")
_TWENTY_F_GUIDE_SPLIT_RE = re.compile(r"\s*[|;,]\s*")
_TWENTY_F_GUIDE_SEGMENT_SPLIT_RE = re.compile(r"\s*(?:—|–|:|\s+-\s+)\s*")
_TWENTY_F_GUIDE_NOISE_PHRASES = frozenset(
    {
        "annual report",
        "annual report and form 20-f",
        "annual report on form 20-f",
        "cross reference to form 20-f",
        "cross-reference to form 20-f",
        "cross reference guide",
        "form 20-f caption",
        "location in this document",
        "location in the document",
        "not applicable",
        "n/a",
        "page",
        "pages",
        "cover",
        "contents",
        "other information",
        "strategic report",
        "governance report",
    }
)
_TWENTY_F_REPORT_SUITE_TITLE_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"(?i)\bintegrated\s+annual\s+report\b"),
    re.compile(r"(?i)\bannual\s+financial\s+report\b"),
    re.compile(r"(?i)\bgovernance\s+report\b"),
    re.compile(r"(?i)\bnotice\s+of\s+annual\s+general\s+meeting\b"),
    re.compile(r"(?i)\breport\s+to\s+stakeholders\b"),
    re.compile(r"(?i)\bclimate\s+change\s+report\b"),
    re.compile(r"(?i)\bgri\s+content\s+index\b"),
    re.compile(r"(?i)\bmineral\s+resources\b.{0,40}\bsupplement\b"),
)
_TWENTY_F_REPORT_SUITE_COVER_CUE_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"(?i)\babout\s+our\s+cover\b"),
    re.compile(r"(?i)\bsend\s+us\s+your\s+feedback\b"),
    re.compile(r"(?i)\breporting\s+suite\b"),
    re.compile(r"(?i)\bcontents\b"),
    re.compile(r"(?i)\bfurther\s+reading\s+available\s+within\s+this\s+report\b"),
)
_TWENTY_F_SEC_FILING_START_RE = re.compile(
    r"(?i)as\s+filed\s+with\s+the\s+securities\s+and\s+exchange\s+commission"
)
_TWENTY_F_REPORT_SUITE_LOOKAHEAD_CHARS = 8_000


def _build_twenty_f_guide_item_patterns() -> tuple[dict[str, re.Pattern[str]], re.Pattern[str]]:
    """Match precompiled regexes for 20-F guide item descriptions.

    Args:
        None.

    Returns:
        ``(token -> compiled pattern, combined pattern)`` 2-tuple.

    Raises:
        RuntimeError: Raised when construction fails.
    """

    patterns: dict[str, re.Pattern[str]] = {}
    alternations: list[str] = []
    for token in _TWENTY_F_GUIDE_ITEM_TOKENS:
        description = _TWENTY_F_ITEM_DESCRIPTIONS.get(token)
        if not description:
            continue
        description_pattern = r"\s+".join(re.escape(part) for part in description.split())
        # the separator uses a single-level character class to avoid catastrophic backtracking from \s* + (?:\s+)+ nested quantifiers
        item_pattern = rf"(?:item\s+)?{re.escape(token)}[\s.\-–—:]+{description_pattern}"
        patterns[token] = re.compile(rf"(?is){item_pattern}")
        group_name = f"token_{token.lower().replace('-', '_')}"
        alternations.append(rf"(?P<{group_name}>{item_pattern})")
    combined_pattern = re.compile(rf"(?is){'|'.join(alternations)}")
    return patterns, combined_pattern


_TWENTY_F_GUIDE_ITEM_PATTERNS, _TWENTY_F_GUIDE_ITEM_COMBINED_PATTERN = (
    _build_twenty_f_guide_item_patterns()
)
_TWENTY_F_GUIDE_BODY_START_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"(?i)\bstrategic\s+report\b"),
    re.compile(r"(?i)\bat\s+a\s+glance\b"),
    re.compile(r"(?i)\bour\s+purpose\b"),
    re.compile(r"(?i)\bbusiness\s+model\b"),
    re.compile(r"(?i)\bchair(?:'|’)?s\s+statement\b"),
)
_TWENTY_F_ITEM_LABEL_TEMPLATE = (
    r"(?is)(?:^|[\n|])\s*(?:item\s+)?{token}(?!\s*(?:[A-Z]\b|\.|[-–—]\s*\d))\b"
)
_TWENTY_F_ANNUAL_REPORT_ITEM_CANDIDATES: dict[str, tuple[str, ...]] = {
    "3": (
        "group principal risks",
        "principal risks and uncertainties",
        "risk factors",
    ),
    "4": (
        "our purpose and strategy",
        "our business model",
        "business model",
        "at a glance",
        "strategic report",
    ),
    "5": (
        "financial review",
        "financial performance",
        "financial performance summary",
        "chief financial officer",
        "operating results",
        "liquidity and capital resources",
        "operating and financial review",
    ),
    "6": (
        "governance report",
        "board of directors",
        "management board",
        "directors and senior management",
    ),
    "7": (
        "shareholder information",
        "major shareholders",
        "related party transactions",
    ),
    "8": (
        "financial information",
        "financial statements",
    ),
    "10": (
        "additional information",
        "shareholder information",
        "document on display",
        "registered offices",
    ),
    "11": (
        "market risk",
        "quantitative and qualitative disclosures about market risk",
    ),
    "15": (
        "controls and procedures",
        "disclosure controls and procedures",
        "internal control over financial reporting",
    ),
    "18": (
        "financial statements",
        "group income statement",
        "consolidated financial statements",
        "group financial statements",
        "group companies and undertakings",
    ),
    "19": ("exhibits",),
}
_TWENTY_F_GUIDE_MIN_MARKER_GAP_CHARS = 1_000


def _build_twenty_f_markers(full_text: str) -> list[tuple[int, Optional[str]]]:
    """Build Part + Item boundaries with descriptions for 20-F.

    Strategy:
    1. Use ``_select_ordered_item_markers_after_toc`` to adaptively skip ToC
       and select Item markers in statutory order;
    2. Complete each Item's Part label via SEC statutory mapping;
    3. Append standard SEC description to high-frequency Items for heading clarity;
    4. Append SIGNATURE section after the last Item.

    Args:
        full_text: full document text.

    Returns:
        marker list; an empty list triggers the parent-class fallback when markers are insufficient.

    Raises:
        RuntimeError: Raised when construction fails.
    """

    item_markers = _select_ordered_item_markers_after_toc(
        full_text,
        item_pattern=_TWENTY_F_ITEM_PATTERN,
        ordered_tokens=_TWENTY_F_ITEM_ORDER,
        min_items_after_toc=4,
    )
    item_markers = _repair_twenty_f_key_items_with_heading_fallback(full_text, item_markers)
    item_markers = _repair_twenty_f_items_with_cross_reference_guide(full_text, item_markers)
    item_markers = _skip_twenty_f_front_matter_markers(full_text, item_markers)
    if len(item_markers) < 3:
        return []

    markers: list[tuple[int, Optional[str]]] = []
    for item_token, position in item_markers:
        title = _build_item_title(item_token)
        markers.append((position, title))

    # Find SIGNATURE after the last Item
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


def _select_preferred_twenty_f_text(*, source_text: str, parsed_text: str) -> str:
    """Choose the text better suited for splitting between two 20-F full-text candidates.

    20-F headings are prone to two types of discrepancies across parsing pipelines:
    1. Heading newlines flattened, causing insufficient ``Item`` markers;
    2. Raw HTML preserves more line boundaries but may introduce noise.

    This function uses ``_build_twenty_f_markers`` usability as quality signal, only
    preferring ``source_text`` when its marker quality is demonstrably better.

    Args:
        source_text: candidate text A, usually from line-boundary-preserving source HTML extraction.
        parsed_text: candidate text B, usually from the processor's default full-text extraction.

    Returns:
        full text better suited to 20-F marker construction.

    Raises:
        RuntimeError: Raised when selection fails.
    """

    normalized_source_text = str(source_text or "")
    normalized_parsed_text = str(parsed_text or "")
    if not normalized_source_text:
        return normalized_parsed_text
    if not normalized_parsed_text:
        return normalized_source_text

    # Skip duplicate marker builds when candidates are identical (saves seconds on large 20-F)
    if normalized_source_text == normalized_parsed_text:
        return normalized_parsed_text

    source_marker_count = len(_build_twenty_f_markers(normalized_source_text))
    parsed_marker_count = len(_build_twenty_f_markers(normalized_parsed_text))
    if source_marker_count >= 3 and source_marker_count > parsed_marker_count:
        return normalized_source_text
    if parsed_marker_count >= 3:
        return normalized_parsed_text
    if source_marker_count >= 3:
        return normalized_source_text
    return normalized_parsed_text


# ---------- guide cluster detection ----------

# Minimum ratio threshold of rebuilt marker span to document total length
_GUIDE_CLUSTER_MIN_SPAN_RATIO = 0.10

# If all marker positions exceed this fraction of document, treated as clustered at tail
_GUIDE_CLUSTER_TAIL_START_RATIO = 0.80


def _has_guide_clustered_markers(
    markers: list[tuple[str, int]],
    text_length: int,
) -> bool:
    """Detect whether rebuilt markers cluster in guide table rather than dispersing in body.

    European 20-F cross-reference guides map Items to annual report page numbers.
    When body headings are absent, ``_find_twenty_f_locator_heading_position``
    may match the guide table text itself, causing markers to cluster at document end.

    Detection rules:
      1. marker position span (max - min) covers < 10% of the document length.
      2. or all markers are beyond 80% of the document.

    Args:
        markers: rebuilt ``(token, position)`` list.
        text_length: full document text length.

    Returns:
        ``True`` when clustered.
    """

    if not markers or text_length <= 0:
        return False

    positions = [pos for _, pos in markers]
    min_pos = min(positions)
    max_pos = max(positions)
    span = max_pos - min_pos

    # Rule 1: span too small, markers clustered in a narrow band
    if span < text_length * _GUIDE_CLUSTER_MIN_SPAN_RATIO:
        return True

    # Rule 2: all markers are in document tail region
    if min_pos > text_length * _GUIDE_CLUSTER_TAIL_START_RATIO:
        return True

    return False


def _has_monotonic_twenty_f_key_positions(fallback_map: dict[str, int]) -> bool:
    """Judge whether the key-item fallback fully covers and satisfies ``Item 3 < 5 < 18``.

    Args:
        fallback_map: token -> position mapping.

    Returns:
        ``True`` when all three key Items exist with increasing positions.
    """

    item_3 = fallback_map.get("3")
    item_5 = fallback_map.get("5")
    item_18 = fallback_map.get("18")
    if item_3 is None or item_5 is None or item_18 is None:
        return False
    return int(item_3) < int(item_5) < int(item_18)


def _seed_monotonic_twenty_f_key_fallback(
    *,
    full_text: str,
    marker_map: dict[str, int],
    fallback_map: dict[str, int],
) -> dict[str, int]:
    """Prefer backfilling key markers when the key-item fallback has formed a body main chain.

    Some 20-F filings exhibit two hit categories simultaneously:
    1. Real heading fallback in earlier body text;
    2. Pseudo-markers from late cross-references or guide/locators.

    When ``fallback_map`` provides a monotonic ``Item 3 < 5 < 18`` body chain,
    the core skeleton is established. Retaining later markers would cause subsequent
    order constraints to drop correct earlier fallbacks as out-of-order, leaving ``Item 5/18``
    missing.

    However, if current key-item marker is already clean and order-safe, we must not
    blindly backfill just because fallback is earlier, avoiding rewriting real body
    back to ToC / guide pseudo-hits.

    Args:
        full_text: full document text.
        marker_map: current token -> position mapping.
        fallback_map: this round's fallback token -> position mapping.

    Returns:
        marker mapping backfilled with the monotonic key-item fallback as preferred anchors.

    Raises:
        RuntimeError: Raised when backfill fails.
    """

    if not _has_monotonic_twenty_f_key_positions(fallback_map):
        return marker_map

    seeded_marker_map = dict(marker_map)
    for token in _TWENTY_F_REPAIR_ITEMS:
        fallback_pos = fallback_map.get(token)
        if fallback_pos is None:
            continue
        current_pos = seeded_marker_map.get(token)
        if current_pos is None:
            seeded_marker_map[token] = int(fallback_pos)
            continue

        current_pos_is_contaminated = _is_twenty_f_marker_contaminated(full_text, int(current_pos))
        if _should_preserve_current_twenty_f_key_marker(
            full_text=full_text,
            marker_map=seeded_marker_map,
            token=token,
            position=int(current_pos),
        ) and int(fallback_pos) < int(current_pos):
            # if the current key-item is already a trustworthy body anchor,
            # must not be retroactively overwritten by earlier ToC / guide fallbacks.
            continue

        if current_pos_is_contaminated or int(current_pos) > int(fallback_pos):
            seeded_marker_map[token] = int(fallback_pos)
    return seeded_marker_map


def _repair_twenty_f_items_with_cross_reference_guide(
    full_text: str,
    item_markers: list[tuple[str, int]],
) -> list[tuple[str, int]]:
    """Infer body Item anchors using 20-F cross-reference guide.

    Some 20-F filings do not write ``Item 3/4/5/18`` headings directly in body, but map
    statutory Items to annual report titles in a ``Form 20-F caption / Location`` table.
    Pure ``Item`` regexes yield 0 markers or match only the guide itself.

    This function reads locator phrases in the guide, searches body text for headings,
    and rebuilds ``Item 4 / 5 / 6 / ... / 18`` boundaries. If ``Item 3`` only maps
    to late ``Risk factors``, synthesizes an earlier start to ensure correct ordering.

    Args:
        full_text: full document text.
        item_markers: existing ``(item_token, position)`` list.

    Returns:
        prefer the rebuilt markers; fall back to the original list when the guide cannot do better.

    Raises:
        RuntimeError: Raised when repair fails.
    """

    needs_repair = len(item_markers) < 4 or any(
        token not in {item_token for item_token, _ in item_markers} for token in _TWENTY_F_KEY_ITEMS
    )
    if not needs_repair:
        needs_repair = any(
            _looks_like_toc_page_line(full_text, position)
            or _looks_like_inline_toc_snippet(full_text, position)
            or _looks_like_twenty_f_front_matter_marker(full_text, position)
            or _looks_like_twenty_f_reference_guide_marker(full_text, position)
            for _, position in item_markers
        )
    if not needs_repair:
        return item_markers

    locator_map = _extract_twenty_f_cross_reference_locator_map(full_text)
    if not locator_map:
        return item_markers

    reconstructed = _find_twenty_f_cross_reference_body_markers(
        full_text=full_text,
        locator_map=locator_map,
    )
    if len(reconstructed) < 4:
        return item_markers

    # Guide cluster check: rebuilt markers should disperse in body;
    # clustering in a narrow range indicates matching the guide table rather than body.
    if _has_guide_clustered_markers(reconstructed, len(full_text)):
        return item_markers

    # Allow guide to recover some key Items before merging with existing chain.
    # In 20-F, ``Item 3`` is often rebuilt from guide while ``Item 5/18`` are recovered
    # via key-heading fallback; requiring reconstructed markers alone to cover all key Items
    # would prematurely short-circuit the merge branch.
    if not _twenty_f_reconstructed_markers_cover_key_items(
        reconstructed,
        required_tokens=_TWENTY_F_KEY_ITEMS,
    ):
        merged_reconstructed = _merge_twenty_f_reconstructed_markers_with_existing(
            full_text=full_text,
            item_markers=item_markers,
            reconstructed=reconstructed,
        )
        if _twenty_f_reconstructed_markers_cover_key_items(
            merged_reconstructed,
            required_tokens=_TWENTY_F_KEY_ITEMS,
        ):
            return merged_reconstructed
        return item_markers

    return reconstructed


def _twenty_f_reconstructed_markers_cover_key_items(
    markers: list[tuple[str, int]],
    *,
    required_tokens: Collection[str],
) -> bool:
    """Judge whether a group of 20-F markers already covers all key Items.

    Args:
        markers: ``(item_token, position)`` list.
        required_tokens: key Item token set that must be covered.

    Returns:
        ``True`` when markers already cover all key Items, otherwise ``False``.

    Raises:
        None.
    """

    marker_tokens = {token for token, _ in markers}
    return set(required_tokens).issubset(marker_tokens)


def _merge_twenty_f_reconstructed_markers_with_existing(
    *,
    full_text: str,
    item_markers: list[tuple[str, int]],
    reconstructed: list[tuple[str, int]],
) -> list[tuple[str, int]]:
    """Merge the guide reconstruction result with the current 20-F marker main chain.

    When guide only recovers ``Item 3/4`` but main chain already recovered ``Item 5/18``
    via fallback, demanding that guide alone cover all key Items would discard early ``Item 3`` anchors.

    Strategy:
    1. Use current ``item_markers`` as main chain base;
    2. Only overwrite same token when guide rebuilt position is earlier or replaces polluted marker;
    3. Reuse monotonicity repair after merging to avoid order regressions.

    Args:
        full_text: full document text.
        item_markers: current 20-F marker main chain.
        reconstructed: marker list rebuilt from the guide.

    Returns:
        merged marker list.

    Raises:
        RuntimeError: Raised when monotonicity repair fails.
    """

    merged_marker_map = {token: int(position) for token, position in item_markers}
    original_positions = dict(merged_marker_map)

    for token, position in reconstructed:
        candidate_position = int(position)
        current_position = merged_marker_map.get(token)
        if current_position is None:
            merged_marker_map[token] = candidate_position
            continue

        current_is_contaminated = _is_twenty_f_marker_contaminated(
            full_text,
            int(current_position),
        )
        candidate_is_contaminated = _is_twenty_f_marker_contaminated(
            full_text,
            candidate_position,
        )
        if current_is_contaminated and not candidate_is_contaminated:
            merged_marker_map[token] = candidate_position
            continue
        if current_is_contaminated == candidate_is_contaminated and candidate_position < int(
            current_position
        ):
            merged_marker_map[token] = candidate_position

    merged_markers = [
        (token, merged_marker_map[token])
        for token in _TWENTY_F_ITEM_ORDER
        if token in merged_marker_map
    ]
    monotonic_markers = _enforce_marker_position_monotonicity(
        full_text=full_text,
        repaired=merged_markers,
        original_positions=original_positions,
    )
    if _twenty_f_reconstructed_markers_cover_key_items(
        monotonic_markers,
        required_tokens=_TWENTY_F_KEY_ITEMS,
    ):
        return monotonic_markers
    return _enforce_twenty_f_key_item_priority_monotonicity(
        repaired=merged_markers,
        protected_tokens=_TWENTY_F_KEY_ITEMS,
    )


def _enforce_twenty_f_key_item_priority_monotonicity(
    *,
    repaired: list[tuple[str, int]],
    protected_tokens: Collection[str],
) -> list[tuple[str, int]]:
    """Prefer key Items in 20-F monotonicity conflicts.

    Default strategy of ``_enforce_marker_position_monotonicity()`` preserves more markers,
    but in guide merge scenarios, late non-key Items (9/10/11/15) may crowd out earlier real ``Item 18``,
    causing hard gate failures.

    Remedy logic triggers only when key Items remain incomplete after default monotonicity:
    1. Traverse ``repaired`` in statutory order;
    2. Skip conflicting non-key Items;
    3. On key Item conflict, backtrack-pop trailing non-key Items until key Item fits;
    4. Retained key Items do not overwrite one another.

    Args:
        repaired: ``(item_token, position)`` list in statutory token order.
        protected_tokens: key Item token set that must be preserved first.

    Returns:
        monotonic marker list preferring key Items under conflicts.

    Raises:
        None.
    """

    if len(repaired) < 2:
        return repaired

    protected_token_set = set(protected_tokens)
    prioritized: list[tuple[str, int]] = []
    for token, position in repaired:
        if not prioritized or position > prioritized[-1][1]:
            prioritized.append((token, position))
            continue
        if token not in protected_token_set:
            continue
        while (
            prioritized
            and prioritized[-1][1] >= position
            and prioritized[-1][0] not in protected_token_set
        ):
            prioritized.pop()
        if not prioritized or position > prioritized[-1][1]:
            prioritized.append((token, position))
    return prioritized


def _trim_twenty_f_source_text(source_text: str) -> str:
    """Trim XBRL preamble machine noise from front of 20-F source text.

    Some 20-F HTML contains large blocks of iXBRL / taxonomy tokens before visible cover.
    These artificially inflate ``Cover Page`` and disrupt Item markers and sub-splitting.
    This function trims only when leading region explicitly exhibits XBRL qname noise.

    Args:
        source_text: full text extracted from the source HTML.

    Returns:
        trimmed text; returned unchanged when no leading noise is hit.

    Raises:
        RuntimeError: Raised when trimming fails.
    """

    normalized_text = str(source_text or "")
    if not normalized_text:
        return normalized_text

    candidate_starts: list[int] = []
    for pattern in _TWENTY_F_REPORT_START_PATTERNS:
        match = pattern.search(normalized_text)
        if match is not None:
            candidate_starts.append(int(match.start()))
    if not candidate_starts:
        return normalized_text

    item_match = re.search(r"(?i)\bitem\s+(?:1|2|3)\b", normalized_text)
    item_start = int(item_match.start()) if item_match is not None else len(normalized_text)
    near_item_candidates = [
        position
        for position in candidate_starts
        if position < item_start and item_start - position <= _TWENTY_F_REPORT_START_MAX_GAP_TO_ITEM
    ]
    report_start = min(near_item_candidates) if near_item_candidates else min(candidate_starts)
    if report_start < _TWENTY_F_MIN_PREAMBLE_TRIM_OFFSET:
        return normalized_text

    prefix = normalized_text[:report_start]
    qname_count = len(_TWENTY_F_XBRL_QNAME_RE.findall(prefix))
    if qname_count < _TWENTY_F_XBRL_PREAMBLE_MIN_QNAME_COUNT:
        return normalized_text

    trim_start = max(0, report_start - _TWENTY_F_REPORT_START_BACKTRACK_CHARS)
    commission_candidates = [
        int(match.start())
        for match in _TWENTY_F_COMMISSION_FILE_RE.finditer(normalized_text)
        if max(0, report_start - _TWENTY_F_REPORT_START_BACKTRACK_CHARS)
        <= int(match.start())
        < item_start
    ]
    if commission_candidates:
        trim_start = commission_candidates[0]
    return normalized_text[trim_start:].lstrip()


def _extract_twenty_f_cross_reference_locator_map(full_text: str) -> dict[str, str]:
    """Extract locator text blocks for each Item in 20-F cross-reference guide.

    Args:
        full_text: full document text.

    Returns:
        ``token -> locator block`` mapping; empty dict when guide unrecognized.

    Raises:
        RuntimeError: Raised when extraction fails.
    """

    guide_snippets = _extract_twenty_f_cross_reference_guide_snippets(full_text)
    if not guide_snippets:
        return {}

    locator_map: dict[str, str] = {}
    for snippet in guide_snippets:
        item_spans = _find_twenty_f_guide_item_spans(snippet)
        if len(item_spans) < 2:
            continue
        for index, (token, start, _end) in enumerate(item_spans):
            if token in locator_map:
                continue
            block_end = item_spans[index + 1][1] if index + 1 < len(item_spans) else len(snippet)
            locator_map[token] = snippet[start:block_end]
    return locator_map


def _extract_twenty_f_cross_reference_guide_snippets(full_text: str) -> list[str]:
    """Extract the text window that may contain a 20-F locator table.

    Args:
        full_text: full document text.

    Returns:
        guide text fragment list.

    Raises:
        RuntimeError: Raised when extraction fails.
    """

    snippets: list[str] = []
    seen_ranges: set[tuple[int, int]] = set()
    for pattern in _TWENTY_F_GUIDE_ANCHOR_PATTERNS:
        for match in pattern.finditer(full_text):
            anchor_start = int(match.start())
            ranges = [
                (
                    anchor_start,
                    min(len(full_text), int(match.end()) + _TWENTY_F_GUIDE_WINDOW_LOOKAHEAD_CHARS),
                )
            ]
            # trailing continued guides often place early Items on the first pages; add a bounded look-back window here,
            # catches the previous page's locator while avoiding misclassifying large bodies/annexes as guides.
            if anchor_start >= int(len(full_text) * 0.7):
                ranges.append(
                    (
                        max(0, anchor_start - _TWENTY_F_GUIDE_TAIL_LOOKBACK_CHARS),
                        min(
                            len(full_text),
                            int(match.end()) + _TWENTY_F_GUIDE_WINDOW_LOOKAHEAD_CHARS,
                        ),
                    )
                )
            for start, end in ranges:
                key = (start, end)
                if key in seen_ranges:
                    continue
                snippet = full_text[start:end]
                if (
                    re.search(r"(?i)form\s+20-f\s+caption", snippet) is None
                    and re.search(r"(?i)form\s+20-f\s+references?", snippet) is None
                    and re.search(r"(?i)location\s+in\s+this\s+document", snippet) is None
                    and re.search(
                        r"(?i)cross[\s-]*reference(?:\s+guide|\s+to\s+form\s+20-f)?", snippet
                    )
                    is None
                    and re.search(r"(?i)cross[\s-]*reference\s+table(?:\s+below)?", snippet) is None
                ):
                    continue
                seen_ranges.add(key)
                snippets.append(snippet)
    return snippets


def _find_twenty_f_guide_item_spans(snippet: str) -> list[tuple[str, int, int]]:
    """Locate top-level Item blocks within guide fragments.

    Args:
        snippet: guide fragment text.

    Returns:
        ``(token, start, end)`` list, in fragment occurrence order.

    Raises:
        RuntimeError: Raised when localization fails.
    """

    spans: list[tuple[str, int, int]] = []
    token_by_group = {
        f"token_{token.lower().replace('-', '_')}": token for token in _TWENTY_F_GUIDE_ITEM_PATTERNS
    }
    for match in _TWENTY_F_GUIDE_ITEM_COMBINED_PATTERN.finditer(snippet):
        group_name = match.lastgroup
        if not group_name:
            continue
        token = token_by_group.get(group_name)
        if token is None:
            continue
        spans.append((token, int(match.start()), int(match.end())))
    spans.sort(key=lambda item: item[1])
    return spans


def _find_twenty_f_cross_reference_body_markers(
    *,
    full_text: str,
    locator_map: dict[str, str],
) -> list[tuple[str, int]]:
    """Reverse-lookup body heading positions from guide locator phrases.

    Args:
        full_text: full document text.
        locator_map: ``token -> locator block`` mapping.

    Returns:
        ``(token, position)`` list with increasing positions.

    Raises:
        RuntimeError: Raised when search fails.
    """

    candidate_lists: dict[str, list[str]] = {}
    for token, locator_text in locator_map.items():
        candidates = _extract_twenty_f_locator_heading_candidates(locator_text)
        fallback_candidates = list(_TWENTY_F_ANNUAL_REPORT_ITEM_CANDIDATES.get(token, ()))
        candidate_lists[token] = _dedupe_twenty_f_locator_candidates(
            candidates + fallback_candidates
        )

    candidate_map: dict[str, int] = {}
    item_4_position = _find_twenty_f_locator_heading_position(
        full_text=full_text,
        candidates=candidate_lists.get("4", []),
        start_at=0,
    )
    item_3_position = _find_twenty_f_locator_heading_position(
        full_text=full_text,
        candidates=candidate_lists.get("3", []),
        start_at=0,
    )
    if item_4_position is not None and (
        item_3_position is None or item_3_position >= item_4_position
    ):
        synthetic_item_3 = _find_twenty_f_cross_reference_item_3_start(
            full_text=full_text,
            fallback_end=item_4_position,
        )
        if synthetic_item_3 is not None and synthetic_item_3 < item_4_position:
            item_3_position = synthetic_item_3

    if item_3_position is not None:
        candidate_map["3"] = item_3_position

    ordered: list[tuple[str, int]] = []
    cursor = -1
    for token in _TWENTY_F_ITEM_ORDER:
        min_start_at = cursor + 1
        if cursor >= 0:
            min_start_at = max(min_start_at, cursor + _TWENTY_F_GUIDE_MIN_MARKER_GAP_CHARS)
        if token == "3":
            position = candidate_map.get(token)
        elif token == "4":
            position = item_4_position
            if position is not None and position <= cursor:
                position = _find_twenty_f_locator_heading_position(
                    full_text=full_text,
                    candidates=candidate_lists.get(token, []),
                    start_at=min_start_at,
                )
            elif position is not None and position < min_start_at:
                position = _find_twenty_f_locator_heading_position(
                    full_text=full_text,
                    candidates=candidate_lists.get(token, []),
                    start_at=min_start_at,
                )
        else:
            position = _find_twenty_f_locator_heading_position(
                full_text=full_text,
                candidates=candidate_lists.get(token, []),
                start_at=min_start_at,
            )
        if position is None or position <= cursor:
            continue
        ordered.append((token, position))
        cursor = position
    return ordered


def _extract_twenty_f_locator_heading_candidates(locator_text: str) -> list[str]:
    """Distill heading candidates usable for body re-inspection from a guide block.

    Args:
        locator_text: guide block of a single Item.

    Returns:
        deduplicated candidate heading list.

    Raises:
        RuntimeError: Raised when distillation fails.
    """

    normalized = html.unescape(str(locator_text or ""))
    if not normalized:
        return []

    candidates: list[str] = []
    for match in _TWENTY_F_GUIDE_QUOTED_PHRASE_RE.finditer(normalized):
        candidates.extend(_expand_twenty_f_locator_candidate_segments(match.group(1)))

    # Split by newline to handle line-delimited heading phrases in guide tables;
    # some 20-F guides separate same-column headings with newlines after HTML-to-text,
    # which space-normalization would combine into single candidate that fails to match in body.
    for line in normalized.split("\n"):
        stripped = line.strip()
        if _is_valid_twenty_f_locator_candidate(stripped):
            candidates.append(stripped)

    cleaned_text = _TWENTY_F_GUIDE_PAGE_TOKEN_RE.sub(" | ", normalized)
    for chunk in _TWENTY_F_GUIDE_SPLIT_RE.split(cleaned_text):
        candidates.extend(_expand_twenty_f_locator_candidate_segments(chunk))
    return _dedupe_twenty_f_locator_candidates(candidates)


def _expand_twenty_f_locator_candidate_segments(raw_text: str) -> list[str]:
    """Expand hierarchical heading candidates within a single locator phrase.

    Args:
        raw_text: raw phrase from the locator.

    Returns:
        filtered candidate heading list.

    Raises:
        RuntimeError: Raised when expansion fails.
    """

    normalized = " ".join(str(raw_text or "").split())
    normalized = normalized.strip(" .,:;|/\"'“”()[]")
    if not normalized:
        return []

    parts = _TWENTY_F_GUIDE_SEGMENT_SPLIT_RE.split(normalized)
    candidates: list[str] = []
    for part in parts:
        candidate = part.strip(" .,:;|/\"'“”()[]")
        if _is_valid_twenty_f_locator_candidate(candidate):
            candidates.append(candidate)
    if _is_valid_twenty_f_locator_candidate(normalized):
        candidates.append(normalized)
    return candidates


def _is_valid_twenty_f_locator_candidate(candidate: str) -> bool:
    """Judge whether a locator phrase is suitable for body-heading re-inspection.

    Args:
        candidate: candidate heading to evaluate.

    Returns:
        ``True`` when usable for body re-inspection.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    normalized = " ".join(str(candidate or "").split()).strip().lower()
    if not normalized:
        return False
    if normalized in _TWENTY_F_GUIDE_NOISE_PHRASES:
        return False
    if len(normalized) < 4 or len(normalized) > 120:
        return False
    if re.fullmatch(r"(?:[ivxlcdm]+|\d+(?:\s*-\s*\d+)?)", normalized) is not None:
        return False
    if _TWENTY_F_GUIDE_PAGE_TOKEN_RE.fullmatch(normalized) is not None:
        return False
    alpha_chars = sum(1 for char in normalized if char.isalpha())
    return alpha_chars >= 4


def _dedupe_twenty_f_locator_candidates(candidates: list[str]) -> list[str]:
    """Deduplicate locator candidate headings by normalized text.

    Args:
        candidates: raw candidate heading list.

    Returns:
        deduplicated candidate heading list.

    Raises:
        RuntimeError: Raised when deduplication fails.
    """

    deduped: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        normalized = " ".join(str(candidate or "").split()).strip()
        lowered = normalized.lower()
        if not normalized or lowered in seen:
            continue
        seen.add(lowered)
        deduped.append(normalized)
    return deduped


def _find_twenty_f_locator_heading_position(
    *,
    full_text: str,
    candidates: list[str],
    start_at: int = 0,
) -> Optional[int]:
    """Find the real body-heading position corresponding to a locator phrase.

    Args:
        full_text: full document text.
        candidates: candidate heading list for lookup.

    Returns:
        earliest valid body heading position; ``None`` when not found.

    Raises:
        RuntimeError: Raised when search fails.
    """

    best_position: Optional[int] = None
    normalized_start = max(0, int(start_at))
    for candidate in candidates:
        normalized_candidate = str(candidate or "")
        if not normalized_candidate.strip():
            continue

        parts = [re.escape(part) for part in normalized_candidate.split() if part]
        patterns = [re.compile(re.escape(normalized_candidate), re.IGNORECASE)]
        if len(parts) >= 2:
            flexible_pattern = re.compile(r"\\s+".join(parts), re.IGNORECASE)
            if flexible_pattern.pattern != patterns[0].pattern:
                patterns.append(flexible_pattern)

        for pattern in patterns:
            for match in pattern.finditer(full_text, normalized_start):
                position = int(match.start())
                if _looks_like_twenty_f_report_suite_cover_marker(
                    full_text=full_text,
                    position=position,
                ):
                    continue
                if _looks_like_toc_page_line(full_text, position):
                    if _looks_like_twenty_f_annual_report_page_heading(
                        full_text=full_text,
                        position=position,
                        matched_text=candidate,
                    ):
                        if best_position is None or position < best_position:
                            best_position = position
                        break
                    continue
                if _looks_like_inline_toc_snippet(full_text, position):
                    continue
                if _looks_like_twenty_f_front_matter_marker(full_text, position):
                    continue
                if not _looks_like_twenty_f_standalone_heading_context(
                    full_text=full_text,
                    position=position,
                    matched_text=candidate,
                ):
                    continue
                if _looks_like_twenty_f_reference_guide_marker(full_text, position):
                    continue
                if best_position is None or position < best_position:
                    best_position = position
                break
            if best_position is not None:
                break
    return best_position


def _looks_like_twenty_f_report_suite_cover_marker(*, full_text: str, position: int) -> bool:
    """Judge whether a hit falls in a report-suite cover/ToC region preceding the real Form 20-F.

    Some annual-report-style 20-F filings prepend full report suites (Integrated Annual Report,
    Annual Financial Report, Governance Report) before the SEC Form 20-F body.
    Matching locator phrases on booklet covers or ToC pages would incorrectly advance Item anchors,
    creating gigantic sections.

    Judgment combines three stable signals independent of company names:
    1. Report suite titles appear in local window;
    2. Cover/ToC cues appear in same window;
    3. Real SEC filing start is observed shortly after hit.

    Args:
        full_text: full document text.
        position: hit position to judge.

    Returns:
        ``True`` when it looks more like a report-suite cover/ToC hit.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    start = max(0, int(position) - 200)
    end = min(len(full_text), int(position) + 2500)
    context = full_text[start:end]
    title_hits = sum(
        1
        for pattern in _TWENTY_F_REPORT_SUITE_TITLE_PATTERNS
        if pattern.search(context) is not None
    )
    if title_hits <= 0:
        return False
    cue_hits = sum(
        1
        for pattern in _TWENTY_F_REPORT_SUITE_COVER_CUE_PATTERNS
        if pattern.search(context) is not None
    )
    if cue_hits <= 0:
        return False

    filing_start_end = min(len(full_text), int(position) + _TWENTY_F_REPORT_SUITE_LOOKAHEAD_CHARS)
    filing_start_context = full_text[int(position) : filing_start_end]
    if _TWENTY_F_SEC_FILING_START_RE.search(filing_start_context) is not None:
        return True
    return title_hits >= 2 and cue_hits >= 2


def _find_twenty_f_cross_reference_item_3_start(
    *,
    full_text: str,
    fallback_end: int,
) -> Optional[int]:
    """Synthesize an ``Item 3`` start for guide-style 20-F filings.

    Such filings often place ``Item 3.D Risk factors`` in late sections; adopting that position
    causes ``Item 4`` to precede ``Item 3``, violating statutory order.
    When ``Item 4`` is found but ``Item 3`` is missing or inverted, fall back to earlier
    report body start, or document start if not found.

    Args:
        full_text: full document text.
        fallback_end: located ``Item 4`` start.

    Returns:
        earlier start usable for ``Item 3``; ``0`` when it cannot be located.

    Raises:
        RuntimeError: Raised when localization fails.
    """

    search_end = max(0, int(fallback_end))
    for pattern in _TWENTY_F_GUIDE_BODY_START_PATTERNS:
        for match in pattern.finditer(full_text, 0, search_end):
            position = int(match.start())
            if _looks_like_toc_page_line(full_text, position):
                continue
            if _looks_like_inline_toc_snippet(full_text, position):
                continue
            if _looks_like_twenty_f_front_matter_marker(full_text, position):
                continue
            if _looks_like_twenty_f_reference_guide_marker(full_text, position):
                continue
            return position
    return 0


def _skip_twenty_f_front_matter_markers(
    full_text: str,
    item_markers: list[tuple[str, int]],
) -> list[tuple[str, int]]:
    """Skip pseudo Item markers in 20-F front matter / cross-reference guide.

    Common abnormal scenarios:
    1. Checkbox items on cover page (``Item 17 / Item 18``);
    2. Row entries in ``Form 20-F Cross Reference Guide`` table.

    These are not body boundaries but hit generic ``Item`` regexes, causing marker
    order inversion or sucking entire bodies into wrong parent sections.

    Args:
        full_text: full document text.
        item_markers: initial ``(item_token, position)`` list.

    Returns:
        filtered marker list.

    Raises:
        RuntimeError: Raised when processing fails.
    """

    if len(item_markers) < _TWENTY_F_MIN_RETRY_MARKERS_AFTER_FRONT_MATTER:
        return item_markers

    current_markers = list(item_markers)
    for _ in range(_TWENTY_F_FRONT_MATTER_MAX_SKIP_RETRIES):
        front_matter_prefix_count = 0
        for _, position in current_markers:
            if not _looks_like_twenty_f_front_matter_marker(full_text, position):
                break
            front_matter_prefix_count += 1

        if front_matter_prefix_count <= 0:
            return current_markers
        if not _should_skip_twenty_f_front_matter_prefix(
            current_markers,
            prefix_count=front_matter_prefix_count,
        ):
            return current_markers

        retry_start = current_markers[front_matter_prefix_count - 1][1] + 1
        retried_markers = _select_ordered_item_markers(
            full_text,
            item_pattern=_TWENTY_F_ITEM_PATTERN,
            ordered_tokens=_TWENTY_F_ITEM_ORDER,
            start_at=retry_start,
        )
        retried_markers = _repair_twenty_f_key_items_with_heading_fallback(
            full_text,
            retried_markers,
        )
        if len(retried_markers) < _TWENTY_F_MIN_RETRY_MARKERS_AFTER_FRONT_MATTER:
            return current_markers
        current_markers = retried_markers
    return current_markers


def _should_skip_twenty_f_front_matter_prefix(
    item_markers: list[tuple[str, int]],
    *,
    prefix_count: int,
) -> bool:
    """Judge whether a front-matter marker prefix suffices to trigger a skip-and-retry.

    Args:
        item_markers: ``(item_token, position)`` list.
        prefix_count: count of consecutive front-matter markers.

    Returns:
        ``True`` when the skip-and-retry should run.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    if prefix_count >= 2:
        return True
    if prefix_count != 1 or len(item_markers) < 2:
        return False

    first_token, first_pos = item_markers[0]
    next_pos = item_markers[1][1]
    if first_token not in {"17", "18", "19"}:
        return False
    return next_pos - first_pos >= _TWENTY_F_FRONT_MATTER_SINGLE_SKIP_MIN_GAP


def _looks_like_twenty_f_front_matter_marker(full_text: str, position: int) -> bool:
    """Judge whether an Item hit falls in 20-F front matter / a cross-reference guide.

    Args:
        full_text: full document text.
        position: Item hit start.

    Returns:
        ``True`` when front-matter characteristics are hit.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    start = max(0, int(position) - _TWENTY_F_FRONT_MATTER_LOOKBACK_CHARS)
    end = min(len(full_text), int(position) + _TWENTY_F_FRONT_MATTER_LOOKAHEAD_CHARS)
    context = full_text[start:end]
    return any(
        pattern.search(context) is not None for pattern in _TWENTY_F_FRONT_MATTER_CONTEXT_PATTERNS
    )


def _is_twenty_f_marker_contaminated(full_text: str, position: int) -> bool:
    """Judge whether a marker falls in a ToC / front-matter / guide polluted region.

    Args:
        full_text: full document text.
        position: marker position.

    Returns:
        `True` when the position looks like a ToC, preface, or cross-reference guide.
    """

    return (
        _looks_like_toc_page_line(full_text, position)
        or _looks_like_inline_toc_snippet(full_text, position)
        or _looks_like_twenty_f_front_matter_marker(full_text, position)
        or _looks_like_twenty_f_reference_guide_marker(full_text, position)
    )


def _result_markers_are_all_contaminated(
    full_text: str,
    markers: list[tuple[str, int]],
) -> bool:
    """Judge whether all currently retained markers are still in the polluted region.

    Used in final order-reconciliation phase for annual-report-style 20-F:
    if previously buffered markers are all front matter/guide polluted, and subsequent
    ``Item 5`` is a clean body anchor, it should not be deleted simply because earlier.

    Args:
        full_text: full document text.
        markers: currently retained ``(token, position)`` list.

    Returns:
        ``True`` when the list is non-empty and all markers are in the polluted region.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    if not markers:
        return False
    return all(_is_twenty_f_marker_contaminated(full_text, pos) for _, pos in markers)


def _discard_trailing_contaminated_markers_before_position(
    full_text: str,
    markers: list[tuple[str, int]],
    position: int,
) -> list[tuple[str, int]]:
    """Remove trailing polluted markers that block current clean marker.

    Some 20-F filings leave early markers like ``Item 1/2`` in guide/ToC areas, then hit real
    ``Item 3`` in body. Although token order is correct, their later physical position
    blocks clean markers during monotonicity checks. Pop trailing polluted markers first.

    Args:
        full_text: full document text.
        markers: currently retained ``(token, position)`` list.
        position: position of the marker about to be placed.

    Returns:
        list with polluted trailing markers removed.

    Raises:
        RuntimeError: Raised when pollution check fails.
    """

    while (
        markers
        and position <= markers[-1][1]
        and _is_twenty_f_marker_contaminated(full_text, markers[-1][1])
    ):
        # the current marker is confirmed unpolluted; if the tail is still a polluted marker, clean the tail first,
        # avoid polluted guide/ToC anchors blocking the more genuine body items.
        markers.pop()
    return markers


def _enforce_marker_position_monotonicity(
    full_text: str,
    repaired: list[tuple[str, int]],
    original_positions: dict[str, int],
) -> list[tuple[str, int]]:
    """Ensure marker list positions increase monotonically.

    Repair operations may shift Items backward, causing successor Items
    to fall before new positions and creating order inversions.

    Strategy:
    1. If conflicting marker is in ToC/guide polluted area, discard old marker;
    2. If conflict arises from normal body marker, prioritize rolling back previously moved marker to original position;
    3. Only discard unplaceable markers if monotonicity cannot be maintained after rollback.

    Args:
        full_text: full document text.
        repaired: ``(token, position)`` list in statutory token order.
        original_positions: pre-repair token -> position mapping.

    Returns:
        ``(token, position)`` list with guaranteed monotonically increasing positions.
    """

    if len(repaired) < 2:
        return repaired

    # Identify tokens moved by repair (position differs from original)
    moved_tokens = {
        token
        for token, pos in repaired
        if original_positions.get(token) is not None and original_positions[token] != pos
    }

    # Detect whether position inversion exists
    positions = [pos for _, pos in repaired]
    if all(positions[i] < positions[i + 1] for i in range(len(positions) - 1)):
        return repaired

    result: list[tuple[str, int]] = []
    for token, pos in repaired:
        if pos is None:
            continue

        if not result or pos > result[-1][1]:
            result.append((token, pos))
            continue

        if _is_twenty_f_marker_contaminated(full_text, pos):
            continue

        result = _discard_trailing_contaminated_markers_before_position(
            full_text,
            result,
            pos,
        )
        if not result or pos > result[-1][1]:
            result.append((token, pos))
            continue

        prev_token, _ = result[-1]
        if prev_token in moved_tokens:
            prev_prev_pos = result[-2][1] if len(result) >= 2 else -1
            reverted_prev_pos = original_positions.get(prev_token)
            if (
                reverted_prev_pos is not None
                and reverted_prev_pos > prev_prev_pos
                and reverted_prev_pos < pos
                and not _is_twenty_f_marker_contaminated(full_text, reverted_prev_pos)
            ):
                result[-1] = (prev_token, reverted_prev_pos)
                if pos > reverted_prev_pos:
                    result.append((token, pos))
                    continue

        if token in moved_tokens:
            reverted_pos = original_positions.get(token)
            prev_pos = result[-1][1] if result else -1
            if (
                reverted_pos is not None
                and reverted_pos > prev_pos
                and not _is_twenty_f_marker_contaminated(full_text, reverted_pos)
            ):
                result.append((token, reverted_pos))
                continue

        original_token_pos = original_positions.get(token)
        original_token_is_contaminated = (
            original_token_pos is not None
            and _is_twenty_f_marker_contaminated(full_text, original_token_pos)
        )
        if (
            token == "18"
            and (original_token_pos is None or original_token_is_contaminated)
            and not _is_twenty_f_marker_contaminated(full_text, pos)
        ):
            # in annual-report-style 20-F filings, the financial-statement body heading may physically precede later SEC Item markers.
            # for a back-filled unpolluted Item 18, if the original position is missing or itself polluted,
            # do not drop it for being out of order here; leave it to the position-sorted virtual-section split below,
            # to preserve the real financial-statement boundary.
            result.append((token, pos))
            continue
        if (
            token == "5"
            and (original_token_pos is None or original_token_is_contaminated)
            and not _is_twenty_f_marker_contaminated(full_text, pos)
            and _result_markers_are_all_contaminated(full_text, result)
        ):
            # annual-report-style 20-F filings often show an early body heading ``Financial Review`` first,
            # then append a 20-F cross-reference guide at the end of the document. If the provisionally stored Item 1-4A
            # all are guide-polluted positions; keep the earlier clean Item 5 here so it is not
            # deleted again by the monotonicity fix.
            result.append((token, pos))
    return result


def _repair_twenty_f_key_items_with_heading_fallback(
    full_text: str,
    item_markers: list[tuple[str, int]],
) -> list[tuple[str, int]]:
    """Repair missing and ToC-polluted key 20-F Items (3/5/18).

    Args:
        full_text: full document text.
        item_markers: raw ``(item_token, position)`` list.

    Returns:
        repaired marker list (in statutory order).

    Raises:
        RuntimeError: Raised when repair fails.
    """

    original_positions = {token: position for token, position in item_markers}
    marker_map = dict(original_positions)
    fallback_map = _find_twenty_f_key_heading_positions(full_text)
    marker_map = _seed_monotonic_twenty_f_key_fallback(
        full_text=full_text,
        marker_map=marker_map,
        fallback_map=fallback_map,
    )

    original_markers_clustered = _has_guide_clustered_markers(item_markers, len(full_text))

    fallback_item_3 = fallback_map.get("3")
    item_3_upper_bound = _find_twenty_f_item_3_order_upper_bound(
        marker_map=marker_map,
        fallback_map=fallback_map,
        prefer_fallback_positions_only=original_markers_clustered,
    )
    if item_3_upper_bound is not None and (
        fallback_item_3 is None or int(fallback_item_3) >= int(item_3_upper_bound)
    ):
        synthetic_item_3 = _find_twenty_f_cross_reference_item_3_start(
            full_text=full_text,
            fallback_end=int(item_3_upper_bound),
        )
        if original_markers_clustered:
            # when the original ``Item 1/2/3`` all cluster in the trailing ToC cluster, these polluted trailing markers can no longer
            # acts as the lower bound of the synthetic Item 3; otherwise the earlier body start would be pushed back entirely
            # at the end of the document and invalidate immediately.
            previous_item_3_lower_bound = _find_previous_item_position_before_token(
                marker_map=fallback_map,
                token="3",
                require_clean_marker=False,
            )
        else:
            previous_item_3_lower_bound = _find_previous_item_position_before_token(
                marker_map=marker_map,
                token="3",
                require_clean_marker=False,
            )
        if synthetic_item_3 is None:
            synthetic_item_3 = 0
        if previous_item_3_lower_bound is not None:
            synthetic_item_3 = max(
                int(synthetic_item_3),
                int(previous_item_3_lower_bound) + 1,
            )
        if synthetic_item_3 < int(item_3_upper_bound):
            fallback_map["3"] = int(synthetic_item_3)
        else:
            fallback_map.pop("3", None)

    if original_markers_clustered:
        # clustered markers mean the original key-item positions are untrustworthy; only fallback results participate in ordering constraints.
        ordering_marker_map = {
            token: position
            for token, position in marker_map.items()
            if token not in _TWENTY_F_REPAIR_ITEMS
        }
    else:
        ordering_marker_map = dict(marker_map)
    for token in _TWENTY_F_REPAIR_ITEMS:
        fallback_pos = fallback_map.get(token)
        if fallback_pos is None:
            continue
        if original_markers_clustered:
            # when the original Item main chain clusters entirely in the trailing ToC/guide cluster, these
            # polluted trailing markers veto an earlier key-heading fallback; the key Item's
            # the ordering boundary should only be decided by the earlier key fallback itself.
            lower_bound = _find_previous_item_position_before_token(
                marker_map=fallback_map,
                token=token,
                require_clean_marker=False,
            )
        else:
            lower_bound = _find_previous_item_position_before_token(
                marker_map=ordering_marker_map,
                token=token,
                full_text=full_text,
                require_clean_marker=True,
            )
        if lower_bound is not None and int(fallback_pos) <= int(lower_bound):
            later_fallback = _find_twenty_f_key_heading_position_after(
                full_text=full_text,
                token=token,
                start_at=int(lower_bound) + 1,
            )
            if later_fallback is not None and later_fallback > int(lower_bound):
                if _violates_existing_twenty_f_item_order(
                    marker_map=marker_map,
                    token=token,
                    candidate_position=int(later_fallback),
                ):
                    later_fallback = None
            if later_fallback is not None and later_fallback > int(lower_bound):
                fallback_map[token] = later_fallback
                ordering_marker_map[token] = later_fallback
                continue
            current_pos = marker_map.get(token)
            current_pos_is_contaminated = (
                current_pos is not None
                and _is_twenty_f_marker_contaminated(full_text, int(current_pos))
            )
            if token == "18" and current_pos_is_contaminated:
                ordering_marker_map[token] = int(fallback_pos)
                continue
            fallback_map.pop(token, None)
            continue
        ordering_marker_map[token] = int(fallback_pos)

    fallback_item_5 = fallback_map.get("5")

    if original_markers_clustered and fallback_item_5 is not None:
        item_18_lower_bound: Optional[int] = int(fallback_item_5)
    else:
        item_18_lower_bound = _find_previous_item_position_before_token(
            full_text=full_text,
            marker_map=marker_map,
            token="18",
        )
    fallback_item_18 = fallback_map.get("18")
    if item_18_lower_bound is not None and (
        fallback_item_18 is None or int(fallback_item_18) <= int(item_18_lower_bound)
    ):
        later_item_18 = _find_twenty_f_key_heading_position_after(
            full_text=full_text,
            token="18",
            start_at=int(item_18_lower_bound) + 1,
        )
        if later_item_18 is not None and later_item_18 > int(item_18_lower_bound):
            fallback_map["18"] = later_item_18
        elif fallback_item_18 is not None:
            current_item_18 = marker_map.get("18")
            current_item_18_is_contaminated = (
                current_item_18 is not None
                and _is_twenty_f_marker_contaminated(full_text, int(current_item_18))
            )
            if not current_item_18_is_contaminated:
                fallback_map.pop("18", None)

    clustered_markers = _has_guide_clustered_markers(
        item_markers, len(full_text)
    ) and _has_monotonic_twenty_f_key_positions(fallback_map)
    clustered_tokens = {token for token, _ in item_markers} if clustered_markers else set()
    has_monotonic_key_fallback = _has_monotonic_twenty_f_key_positions(fallback_map)

    for token in _TWENTY_F_REPAIR_ITEMS:
        fallback_pos = fallback_map.get(token)
        if fallback_pos is None:
            continue
        current_pos = marker_map.get(token)
        if current_pos is None:
            marker_map[token] = fallback_pos
            continue
        current_pos_is_contaminated = _is_twenty_f_marker_contaminated(
            full_text,
            int(current_pos),
        )
        if not clustered_markers and _should_preserve_current_twenty_f_key_marker(
            full_text=full_text,
            marker_map=marker_map,
            token=token,
            position=int(current_pos),
        ):
            if int(fallback_pos) < int(current_pos):
                # when the original marker is already a clean, order-safe body anchor,
                # must not let a fallback that happens to hit earlier ToC/front-matter text
                # write the real body position back.
                continue
        if (
            has_monotonic_key_fallback or clustered_markers or current_pos_is_contaminated
        ) and fallback_pos != current_pos:
            marker_map[token] = fallback_pos

    if clustered_markers:
        for token in list(marker_map.keys()):
            if token in fallback_map:
                continue
            if token in clustered_tokens:
                marker_map.pop(token, None)

    if has_monotonic_key_fallback:
        first_key_position = min(int(position) for position in fallback_map.values())
        for token, original_pos in list(original_positions.items()):
            if token in fallback_map:
                continue
            if token not in marker_map:
                continue
            if int(original_pos) <= first_key_position:
                continue
            if _is_twenty_f_marker_contaminated(full_text, int(original_pos)):
                marker_map.pop(token, None)

    marker_map = _repair_twenty_f_item_5_with_subheading_fallback(
        full_text=full_text,
        marker_map=marker_map,
    )

    repaired: list[tuple[str, int]] = []
    for token in _TWENTY_F_ITEM_ORDER:
        position = marker_map.get(token)
        if position is None:
            continue
        repaired.append((token, position))
    monotonic_repaired = _enforce_marker_position_monotonicity(
        full_text,
        repaired,
        original_positions,
    )
    if _twenty_f_reconstructed_markers_cover_key_items(
        monotonic_repaired,
        required_tokens=_TWENTY_F_KEY_ITEMS,
    ):
        return monotonic_repaired
    if _twenty_f_reconstructed_markers_cover_key_items(
        repaired,
        required_tokens=_TWENTY_F_KEY_ITEMS,
    ):
        return _enforce_twenty_f_key_item_priority_monotonicity(
            repaired=repaired,
            protected_tokens=_TWENTY_F_KEY_ITEMS,
        )
    return monotonic_repaired


def _repair_twenty_f_item_5_with_subheading_fallback(
    *,
    full_text: str,
    marker_map: dict[str, int],
) -> dict[str, int]:
    """Repair a missing 20-F Item 5 using common Item 5 subheadings.

    Some 20-F filings lack explicit ``Item 5`` main heading, but contain standard OFR subheadings
    like ``Liquidity and Capital Resources`` / ``Trend Information``.
    Fallback enables only when ``Item 5`` is missing.

    Args:
        full_text: full document text.
        marker_map: current token -> position mapping.

    Returns:
        repaired token -> position mapping.

    Raises:
        RuntimeError: Raised when repair fails.
    """

    current_item_5 = marker_map.get("5")
    current_item_18 = marker_map.get("18")
    needs_item_5_repair = current_item_5 is None or (
        current_item_18 is not None and int(current_item_5) >= int(current_item_18)
    )
    if not needs_item_5_repair:
        return marker_map

    lower_candidates = [marker_map.get("3"), marker_map.get("4"), marker_map.get("4A")]
    normalized_lower_candidates = [
        position for position in lower_candidates if position is not None
    ]
    if normalized_lower_candidates:
        lower_bound = max(normalized_lower_candidates)
    else:
        lower_bound = 0
    upper_bound = _find_next_item_position_after_token(
        marker_map=marker_map,
        token="5",
        full_text_len=len(full_text),
    )
    if upper_bound <= lower_bound:
        upper_bound = len(full_text)

    best_position: Optional[int] = None
    for pattern in _TWENTY_F_ITEM_5_SUBHEADING_PATTERNS:
        for match in pattern.finditer(full_text, pos=lower_bound, endpos=upper_bound):
            position = int(match.start())
            if _looks_like_toc_page_line(full_text, position):
                continue
            if _looks_like_inline_toc_snippet(full_text, position):
                continue
            if _looks_like_twenty_f_reference_guide_marker(full_text, position):
                continue
            best_position = position
            break
        if best_position is not None:
            break

    if best_position is not None:
        marker_map["5"] = best_position
    return marker_map


def _find_next_item_position_after_token(
    marker_map: dict[str, int],
    token: str,
    full_text_len: int,
) -> int:
    """Find position of nearest existing Item after given Item as scan upper bound.

    Args:
        marker_map: token -> position mapping.
        token: target token (e.g. ``"5"``).
        full_text_len: full document text length.

    Returns:
        scan upper bound; a very large value when no later Item is found.

    Raises:
        RuntimeError: Raised when computation fails.
    """

    try:
        index = _TWENTY_F_ITEM_ORDER.index(token)
    except ValueError:
        return max(0, int(full_text_len))

    candidates = [
        marker_map[next_token]
        for next_token in _TWENTY_F_ITEM_ORDER[index + 1 :]
        if next_token in marker_map
    ]
    if not candidates:
        return max(0, int(full_text_len))
    return min(candidates)


def _find_previous_item_position_before_token(
    *,
    marker_map: dict[str, int],
    token: str,
    full_text: Optional[str] = None,
    require_clean_marker: bool = True,
) -> Optional[int]:
    """Find position of nearest known body Item before given Item.

    Args:
        marker_map: token -> position mapping.
        token: target token.
        full_text: full document text; used for pollution filtering when ``require_clean_marker=True``.
        require_clean_marker: whether to skip ToC/guide-polluted markers.

    Returns:
        nearest preceding body Item position; ``None`` when none exists.
    """

    try:
        index = _TWENTY_F_ITEM_ORDER.index(token)
    except ValueError:
        return None

    previous_positions: list[int] = []
    for previous_token in _TWENTY_F_ITEM_ORDER[:index]:
        position = marker_map.get(previous_token)
        if position is None:
            continue
        if (
            require_clean_marker
            and full_text is not None
            and _is_twenty_f_marker_contaminated(full_text, int(position))
        ):
            continue
        previous_positions.append(int(position))
    if not previous_positions:
        return None
    return max(previous_positions)


def _should_preserve_current_twenty_f_key_marker(
    *,
    full_text: str,
    marker_map: dict[str, int],
    token: str,
    position: int,
) -> bool:
    """Judge whether the current key-item marker is already a trustworthy body anchor.

    Only prevent earlier fallback from overwriting if marker satisfies:
    1. Current marker is not in ToC / guide / front matter polluted region;
    2. Current position satisfies statutory order constraints under ``marker_map``;
    3. Position looks like real body-expanding Item heading, not in-body citation.

    Args:
        full_text: full document text.
        marker_map: current token -> position mapping.
        token: target token.
        position: current marker position.

    Returns:
        ``True`` when the current marker can be considered a trustworthy body anchor.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    normalized_position = int(position)
    if _is_twenty_f_marker_contaminated(full_text, normalized_position):
        return False

    lower_bound = _find_previous_item_position_before_token(
        full_text=full_text,
        marker_map=marker_map,
        token=token,
    )
    upper_bound = _find_next_item_position_after_token(
        marker_map=marker_map,
        token=token,
        full_text_len=len(full_text),
    )
    is_order_safe = (
        lower_bound is None or normalized_position > int(lower_bound)
    ) and normalized_position < int(upper_bound)
    if not is_order_safe:
        return False

    matched_text = f"Item {token}"
    if token == "18" and _may_have_twenty_f_item18_heading_context(
        full_text=full_text,
        position=normalized_position,
    ):
        if _looks_like_twenty_f_item18_heading_with_body(full_text, normalized_position):
            return True
    return _looks_like_twenty_f_direct_item_heading_with_body(
        full_text=full_text,
        position=normalized_position,
        matched_text=matched_text,
    )


def _violates_existing_twenty_f_item_order(
    *,
    marker_map: dict[str, int],
    token: str,
    candidate_position: int,
) -> bool:
    """Judge whether a candidate fallback would jump back before the current known preceding Item.

    Some annual-report-style 20-F filings exhibit late selected Item markers and earlier
    fallbacks found via re-search. If earlier fallback lands before known predecessor,
    it resembles multi-page ToC residue or false hit and cannot replace sequential marker.

    Args:
        marker_map: current token -> position mapping.
        token: target token.
        candidate_position: candidate fallback position.

    Returns:
        `True` when the candidate position precedes the current preceding Item.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    previous_position = _find_previous_item_position_before_token(
        marker_map=marker_map,
        token=token,
        require_clean_marker=False,
    )
    if previous_position is None:
        return False
    return int(candidate_position) <= int(previous_position)


def _find_twenty_f_item_3_order_upper_bound(
    *,
    marker_map: dict[str, int],
    fallback_map: dict[str, int],
    prefer_fallback_positions_only: bool = False,
) -> Optional[int]:
    """Return earliest successor anchor that ``Item 3`` cannot cross sequentially.

    ``Item 3`` heading fallback sometimes hits late ``Risk Factors`` when ``Item 4/4A/5``
    are already identified in body. Adopting late ``Item 3`` would cause order correction
    to delete previously identified ``Item 4/5`` as out-of-order.

    Args:
        marker_map: current token -> position mapping.
        fallback_map: this round's fallback token -> position mapping.
        prefer_fallback_positions_only: whether to use only post-anchor positions hit by fallback.

    Returns:
        Earliest known position among ``Item 4`` / ``Item 4A`` / ``Item 5``; ``None`` if all missing.

    Raises:
        RuntimeError: Raised when computation fails.
    """

    candidates: list[int] = []
    for token in ("4", "4A", "5"):
        current_position = marker_map.get(token)
        fallback_position = fallback_map.get(token)
        if not prefer_fallback_positions_only and current_position is not None:
            candidates.append(int(current_position))
        if fallback_position is not None:
            candidates.append(int(fallback_position))
    if not candidates:
        return None
    return min(candidates)


def _find_twenty_f_key_heading_positions(full_text: str) -> dict[str, int]:
    """Find first available position of 20-F key Item headings in body text.

    Args:
        full_text: full document text.

    Returns:
        matched token->position mapping.

    Raises:
        RuntimeError: Raised when search fails.
    """

    positions: dict[str, int] = {}
    for token, patterns in _TWENTY_F_KEY_ITEM_FALLBACK_PATTERNS.items():
        if token == "5":
            best_position = _find_twenty_f_item_5_heading_position(
                full_text=full_text,
                start_at=0,
            )
            if best_position is not None:
                positions[token] = best_position
            continue
        best_position: Optional[int] = None
        for pattern in patterns:
            position = _find_first_valid_twenty_f_heading_position(
                full_text=full_text,
                pattern=pattern,
                start_at=0,
                token=token,
            )
            if position is None:
                continue
            if best_position is None or position < best_position:
                best_position = position
        if best_position is not None:
            positions[token] = best_position
    return positions


def _find_twenty_f_key_heading_position_after(
    *,
    full_text: str,
    token: str,
    start_at: int,
) -> Optional[int]:
    """Re-search a single 20-F key-item body anchor after the given lower bound.

    Args:
        full_text: full document text.
        token: target key item token.
        start_at: search start.

    Returns:
        earliest valid hit position; ``None`` when not found.
    """

    patterns = _TWENTY_F_KEY_ITEM_FALLBACK_PATTERNS.get(token, ())
    best_position: Optional[int] = None
    normalized_start = max(0, int(start_at))
    if token == "5":
        return _find_twenty_f_item_5_heading_position(
            full_text=full_text,
            start_at=normalized_start,
        )
    for pattern in patterns:
        position = _find_first_valid_twenty_f_heading_position(
            full_text=full_text,
            pattern=pattern,
            start_at=normalized_start,
            token=token,
        )
        if position is None:
            continue
        if best_position is None or position < best_position:
            best_position = position
    return best_position


def _find_first_valid_twenty_f_heading_position(
    *,
    full_text: str,
    pattern: re.Pattern[str],
    start_at: int,
    token: str,
) -> Optional[int]:
    """Find first valid body position for single 20-F fallback pattern.

    Args:
        full_text: full document text.
        pattern: current fallback regex.
        start_at: search start.
        token: key-item token currently being re-searched.

    Returns:
        first valid body hit position; ``None`` on a miss.

    Raises:
        RuntimeError: Raised when search fails.
    """

    normalized_start = max(0, int(start_at))
    provisional_toc_position: Optional[int] = None
    for match in pattern.finditer(full_text, normalized_start):
        position = int(match.start())
        matched_text = str(match.group(0) or "")
        # a real Item 18 heading is often followed by a body locator like "starting on page F-1",
        # generic ToC detection would misclassify it as a ToC line; whitelist it here using body-text characteristics.
        is_real_item18_heading_with_body = False
        if token == "18" and _may_have_twenty_f_item18_heading_context(
            full_text=full_text,
            position=position,
        ):
            is_real_item18_heading_with_body = _looks_like_twenty_f_item18_heading_with_body(
                full_text,
                position,
            )
        if _looks_like_toc_page_line(full_text, position) and not is_real_item18_heading_with_body:
            if _looks_like_twenty_f_annual_report_page_heading(
                full_text=full_text,
                position=position,
                matched_text=matched_text,
            ):
                # annual-report-style 20-F table-of-contents pages often first show legitimate header-style
                # ``Item 3 / 4 / 5`` lines, while the real body heading appears later.
                # returning here would let the earlier ToC hit shadow a later real heading,
                # the typical failure is NVS-style documents splitting from Item 4/5 and losing Item 3.
                #
                # so such hits are demoted to provisional fallbacks: record the position first,
                # keep searching for a cleaner standalone heading; only when nothing later
                # fall back to this ToC annual-report header position only when no body heading is found.
                if provisional_toc_position is None:
                    provisional_toc_position = position
            continue
        if (
            _looks_like_inline_toc_snippet(full_text, position)
            and not is_real_item18_heading_with_body
        ):
            continue
        if _looks_like_twenty_f_front_matter_marker(full_text, position):
            continue
        if _looks_like_twenty_f_direct_item_heading_with_body(
            full_text=full_text,
            position=position,
            matched_text=matched_text,
        ):
            return position
        if not _looks_like_twenty_f_standalone_heading_context(
            full_text=full_text,
            position=position,
            matched_text=matched_text,
        ):
            continue
        if _looks_like_twenty_f_reference_guide_marker(full_text, position):
            continue
        if _looks_like_twenty_f_inline_cross_reference(full_text=full_text, position=position):
            continue
        return position
    return provisional_toc_position


def _looks_like_twenty_f_direct_item_heading_with_body(
    *,
    full_text: str,
    position: int,
    matched_text: str,
) -> bool:
    """Judge whether a hit is an ``Item`` main heading that expands directly into body text.

    Some annual-report-style 20-F filings use standard SEC headings in body:
    ``Item 3. Key Information``, ``Item 4. Information on the Company``.
    Followed by subitems or prose, identical text also appears in front ToC.

    To avoid treating early ToC hits as body, requires:
    1. Current line starts with matched Item heading;
    2. Subsequent adjacent lines contain real prose, not pure page numbers/ToC entries.

    Args:
        full_text: full document text.
        position: hit start.
        matched_text: matched heading text.

    Returns:
        ``True`` when it looks more like an Item main heading that expands directly into body text.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    line_start, line_end = _extract_twenty_f_line_bounds(full_text, position)
    line_text = " ".join(full_text[line_start:line_end].split())
    normalized_match = " ".join(str(matched_text or "").split())
    if not line_text or not normalized_match:
        return False
    if not line_text.lower().startswith(normalized_match.lower()):
        return False

    next_lines = _collect_twenty_f_neighbor_lines(
        full_text,
        line_start=line_start,
        line_end=line_end,
        forward=True,
        max_lines=_TWENTY_F_DIRECT_ITEM_BODY_LOOKAHEAD_LINES,
    )
    if _count_twenty_f_contiguous_page_locator_lines(next_lines, from_end=False) >= 1:
        return False
    for line_text in next_lines:
        normalized_line = " ".join(str(line_text or "").split())
        if not normalized_line:
            continue
        if _looks_like_twenty_f_page_locator_line(normalized_line):
            continue
        lowered_line = normalized_line.lower()
        if lowered_line == "not applicable.":
            return True
        word_count = len(_TWENTY_F_ANNUAL_REPORT_HEADING_PREFIX_WORD_RE.findall(normalized_line))
        if word_count >= 4:
            return True
    return False


def _find_twenty_f_item_5_heading_position(
    *,
    full_text: str,
    start_at: int,
) -> Optional[int]:
    """Find a 20-F Item 5 body anchor by two priority tiers.

    Priority:
    1. Genuine main heading ``Operating and Financial Review and Prospects``;
    2. If main heading absent, choose earliest legal hit among OFR common subheadings.

    Args:
        full_text: full document text.
        start_at: search start.

    Returns:
        best body hit position; ``None`` on a miss.

    Raises:
        RuntimeError: Raised when search fails.
    """

    patterns = _TWENTY_F_KEY_ITEM_FALLBACK_PATTERNS.get("5", ())
    primary_patterns = patterns[:2]
    secondary_patterns = patterns[2:]

    for pattern in primary_patterns:
        position = _find_first_valid_twenty_f_heading_position(
            full_text=full_text,
            pattern=pattern,
            start_at=start_at,
            token="5",
        )
        if position is not None:
            return position

    best_secondary_position: Optional[int] = None
    for pattern in secondary_patterns:
        position = _find_first_valid_twenty_f_heading_position(
            full_text=full_text,
            pattern=pattern,
            start_at=start_at,
            token="5",
        )
        if position is None:
            continue
        if best_secondary_position is None or position < best_secondary_position:
            best_secondary_position = position
    return best_secondary_position


def _looks_like_twenty_f_inline_cross_reference(*, full_text: str, position: int) -> bool:
    """Judge whether a hit looks more like a section reference inside body text than a real heading.

    Typical false-hits:
    - ``see Item 3. Key Information ...``
    - ``as described under Item 5. Operating and Financial Review ...``
    - ``Risk Factors in Section D under Item 3 ...``

    Args:
        full_text: full document text.
        position: hit position.

    Returns:
        ``True`` when it looks more like a body reference.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    start = max(0, int(position) - 160)
    prefix = full_text[start : max(0, int(position))]
    if not prefix:
        return False
    previous_non_space = prefix.rstrip()
    if not previous_non_space:
        return False
    if previous_non_space[-1] in {"\n", "\r"}:
        return False
    raw_prefix_lower = prefix.lower()
    has_coarse_reference_hint = any(
        hint in raw_prefix_lower for hint in _TWENTY_F_INLINE_REFERENCE_PREFIX_HINTS
    )
    has_coarse_quote_hint = any(token in prefix for token in ('"', '“', '”'))
    if not has_coarse_reference_hint and not has_coarse_quote_hint:
        return False
    normalized_prefix = " ".join(prefix.split())
    if _TWENTY_F_INLINE_REFERENCE_PREFIX_RE.search(normalized_prefix) is not None:
        return True

    line_start = full_text.rfind("\n", 0, int(position)) + 1
    line_end = full_text.find("\n", int(position))
    if line_end < 0:
        line_end = len(full_text)
    raw_line_prefix = full_text[line_start : int(position)]
    line_prefix = " ".join(raw_line_prefix.split()).lower()
    if not line_prefix:
        return False
    has_quote_prefix = has_coarse_quote_hint and any(
        token in raw_line_prefix for token in ('"', '“', '”')
    )
    has_reference_prefix = _TWENTY_F_INLINE_REFERENCE_PREFIX_RE.search(line_prefix) is not None
    if not has_quote_prefix and not has_reference_prefix:
        return False
    line_suffix = " ".join(full_text[int(position) : line_end].split()).lower()
    if has_quote_prefix and any(token in line_suffix for token in ('"', '“', '”')):
        return True
    has_subitem_tail = any(
        token in line_suffix
        for token in ("5.a", "5.b", "5.c", "5.d", "5a", "5b", "5c", "5d", " - ")
    )
    return has_reference_prefix and has_subitem_tail


def _looks_like_twenty_f_reference_guide_marker(full_text: str, position: int) -> bool:
    """Judge whether a 20-F marker hit falls in a cross-reference guide / locator context.

    Unlike cover checkboxes, such content enters preface or guide tables, containing
    locators like ``Annual Report`` / ``AFR`` / ``Note X to ... financial statements`` / page ranges.
    They provide citations rather than splittable Item body text.

    Args:
        full_text: full document text.
        position: marker hit start.

    Returns:
        ``True`` when a locator-guide context is hit.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    probe_start = max(0, int(position) - 120)
    probe_end = min(len(full_text), int(position) + 240)
    if _TWENTY_F_REFERENCE_GUIDE_LOCAL_PROBE_RE.search(full_text[probe_start:probe_end]) is None:
        return False

    line_start, line_end = _extract_twenty_f_line_bounds(full_text, position)
    current_line = " ".join(full_text[line_start:line_end].split()).lower()
    if (
        ("item 18" in current_line or "financial statements" in current_line)
        and _may_have_twenty_f_item18_heading_context(
            full_text=full_text,
            position=position,
        )
        and _looks_like_twenty_f_item18_heading_with_body(full_text, position)
    ):
        return False

    start = max(0, int(position) - _TWENTY_F_REFERENCE_GUIDE_LOOKBACK_CHARS)
    end = min(len(full_text), int(position) + _TWENTY_F_REFERENCE_GUIDE_LOOKAHEAD_CHARS)
    context = full_text[start:end]
    if any(
        pattern.search(context) is not None for pattern in _TWENTY_F_FRONT_MATTER_CONTEXT_PATTERNS
    ):
        return True
    return _looks_like_reference_guide_content(title=None, content=context)


def _may_be_twenty_f_item18_heading_with_body(full_text: str, position: int) -> bool:
    """Use low-cost local probe to decide whether executing deep `Item 18` body check is warranted.

    Annual-report-style 20-F like `UBS` hit many non-`Item 18` candidates in locator re-check.
    Full neighborhood scans on every candidate waste CPU on whitelist checks rather than filtering.
    A small local window checks for simultaneous `item 18` and `financial statements`;
    only when both signals exist do we proceed with expensive line-by-line analysis.

    Args:
        full_text: full document text.
        position: hit position to judge.

    Returns:
        ``True`` when it looks like an `Item 18` heading with body text; otherwise ``False``.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    normalized_position = max(0, int(position))
    probe_start = max(0, normalized_position - _TWENTY_F_ITEM18_BODY_PROBE_LOOKBACK_CHARS)
    probe_end = min(
        len(full_text),
        normalized_position + _TWENTY_F_ITEM18_BODY_PROBE_LOOKAHEAD_CHARS,
    )
    probe_text = full_text[probe_start:probe_end].lower()
    if "item" not in probe_text or "18" not in probe_text:
        return False
    return "financial statements" in probe_text


def _looks_like_twenty_f_item18_heading_with_body(full_text: str, position: int) -> bool:
    """Judge whether a hit position is a real Item 18 heading rather than a locator guide.

    Some 20-F Item 18 body sections adopt standard SEC forms:
    1. Standalone heading line: ``Item 18.``
    2. Next line title continuation: ``FINANCIAL STATEMENTS``
    3. Followed by prose stating financials are "attached hereto / included herein / starting on page F-1"

    Such body naturally includes locator signals like ``Annual Report``, ``page F-1``;
    relying purely on guide keywords misclassifies real Item 18 as cross-reference guide.

    Args:
        full_text: full document text.
        position: marker hit position to judge.

    Returns:
        ``True`` when it looks more like a real Item 18 heading with body text following.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    if not _may_be_twenty_f_item18_heading_with_body(full_text, position):
        return False

    line_start, line_end = _extract_twenty_f_line_bounds(full_text, position)
    current_line = " ".join(full_text[line_start:line_end].split())
    if "item 18" not in current_line.lower():
        return False
    # ToC stubs compress multiple Items and pages into one line; real heading line holds Item 18 alone.
    if (
        re.search(
            r"(?i)\bfinancial\s+statements\b\s+(?:page(?:s)?\s+)?\d{1,3}(?:\s*(?:-|–|—|to)\s*\d{1,3})?\b",
            current_line,
        )
        is not None
    ):
        return False
    if len(re.findall(r"(?i)\bitem\s+(?:16[A-J]|4A|1[0-9]|[1-9])\b", current_line)) > 1:
        return False

    next_lines = _collect_twenty_f_neighbor_lines(
        full_text,
        line_start=line_start,
        line_end=line_end,
        forward=True,
        max_lines=_TWENTY_F_ITEM18_BODY_LOOKAHEAD_LINES,
    )
    if not next_lines:
        return False

    heading_window = [current_line] + next_lines[:2]
    if not any("financial statements" in line.lower() for line in heading_window):
        return False

    if _count_twenty_f_contiguous_page_locator_lines(next_lines, from_end=False) >= 2:
        return False
    return _contains_twenty_f_page_heading_prose(next_lines)


def _may_have_twenty_f_item18_heading_context(*, full_text: str, position: int) -> bool:
    """Use low-cost local window to determine whether to continue Item 18 body whitelist check.

    Real Item 18 heading-with-body must exhibit both ``Item 18`` and ``Financial Statements`` in local window.
    Most false-positive in-text references fail this condition, avoiding expensive neighborhood analysis.

    Args:
        full_text: full document text.
        position: current hit position.

    Returns:
        ``True`` when the local window carries both ``Item 18`` and ``Financial Statements`` characteristics.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    start = max(0, int(position) - 120)
    end = min(len(full_text), int(position) + 180)
    snippet = full_text[start:end]
    return (
        _TWENTY_F_ITEM_18_TOKEN_RE.search(snippet) is not None
        and _TWENTY_F_FINANCIAL_STATEMENTS_RE.search(snippet) is not None
    )


def _extract_twenty_f_line_bounds(full_text: str, position: int) -> tuple[int, int]:
    """Return start and end bounds of text line containing the given position.

    Args:
        full_text: full document text.
        position: hit position in the text.

    Returns:
        ``(line_start, line_end)``, where ``line_end`` is newline position or EOF.

    Raises:
        RuntimeError: Raised when boundary calculation fails.
    """

    normalized_position = max(0, min(len(full_text), int(position)))
    line_start = full_text.rfind("\n", 0, normalized_position)
    if line_start < 0:
        line_start = 0
    else:
        line_start += 1
    line_end = full_text.find("\n", normalized_position)
    if line_end < 0:
        line_end = len(full_text)
    return line_start, line_end


def _collect_twenty_f_neighbor_lines(
    full_text: str,
    *,
    line_start: int,
    line_end: int,
    forward: bool,
    max_lines: int,
) -> list[str]:
    """Collect adjacent non-empty text lines before or after current line.

    Args:
        full_text: full document text.
        line_start: current line start.
        line_end: current line end.
        forward: ``True`` collects forward, ``False`` collects backward.
        max_lines: maximum non-empty lines to collect.

    Returns:
        adjacent non-empty line list; in natural reading order when collecting forward.

    Raises:
        RuntimeError: Raised when collection fails.
    """

    lines: list[str] = []
    if max_lines <= 0:
        return lines

    if forward:
        cursor = line_end
        while len(lines) < max_lines and cursor < len(full_text):
            if full_text[cursor] == "\n":
                cursor += 1
            next_end = full_text.find("\n", cursor)
            if next_end < 0:
                next_end = len(full_text)
            line_text = full_text[cursor:next_end].strip()
            if line_text:
                lines.append(line_text)
            cursor = next_end
        return lines

    cursor = line_start
    while len(lines) < max_lines and cursor > 0:
        previous_end = cursor - 1
        previous_start = full_text.rfind("\n", 0, previous_end)
        if previous_start < 0:
            previous_start = 0
        else:
            previous_start += 1
        line_text = full_text[previous_start:cursor].strip()
        if line_text:
            lines.append(line_text)
        cursor = max(0, previous_start - 1)
    lines.reverse()
    return lines


def _looks_like_twenty_f_page_locator_line(line_text: str) -> bool:
    """Judge whether a single line looks like a "title + page number" ToC/header line.

    Args:
        line_text: single-line text to judge.

    Returns:
        ``True`` when it looks more like a page-number locator line.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    normalized_line = " ".join(str(line_text or "").split())
    if not normalized_line:
        return False
    return (
        _TOC_PAGE_LINE_PATTERN.match(normalized_line) is not None
        or _TOC_PAGE_LEADING_NUMBER_LINE_PATTERN.match(normalized_line) is not None
    )


def _contains_twenty_f_page_heading_prose(lines: list[str]) -> bool:
    """Judge whether adjacent lines contain a sufficiently long body sentence.

    Args:
        lines: list of adjacent text lines to inspect.

    Returns:
        ``True`` when clear body lines exist.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    for line_text in lines:
        normalized_line = " ".join(str(line_text or "").split())
        if not normalized_line:
            continue
        if _looks_like_twenty_f_page_locator_line(normalized_line):
            continue
        word_count = len(_TWENTY_F_ANNUAL_REPORT_HEADING_PREFIX_WORD_RE.findall(normalized_line))
        if word_count >= _TWENTY_F_ANNUAL_REPORT_PAGE_HEADING_MIN_PROSE_WORDS:
            return True
    return False


def _count_twenty_f_contiguous_page_locator_lines(
    lines: list[str],
    *,
    from_end: bool,
) -> int:
    """Count contiguous page-number locator lines on one side of adjacent lines list.

    Args:
        lines: adjacent text line list.
        from_end: when ``True``, count from the list tail backward; otherwise from the head forward.

    Returns:
        count of consecutive page-number locator lines.

    Raises:
        RuntimeError: Raised when counting fails.
    """

    ordered_lines = list(reversed(lines)) if from_end else list(lines)
    locator_count = 0
    for line_text in ordered_lines:
        if not _looks_like_twenty_f_page_locator_line(line_text):
            break
        locator_count += 1
    return locator_count


def _looks_like_twenty_f_annual_report_page_heading(
    *,
    full_text: str,
    position: int,
    matched_text: str,
) -> bool:
    """Judge whether a hit is an annual-report page title rather than a ToC page-number line.

    Annual-report-style 20-F like BTI renders chapter titles as header lines
    with ``section grouping + title + page number`` resembling ToC lines,
    but followed immediately by body paragraphs rather than more ToC entries.

    Args:
        full_text: full document text.
        position: hit start.
        matched_text: matched heading phrase.

    Returns:
        ``True`` when it looks more like a real annual-report page title.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    line_start, line_end = _extract_twenty_f_line_bounds(full_text, position)
    line_text = " ".join(full_text[line_start:line_end].split())
    if not line_text:
        return False
    lowered_line_text = line_text.lower()
    if "|" in line_text or '"' in line_text or "“" in line_text or "”" in line_text:
        return False
    if lowered_line_text.startswith("item "):
        return False
    if _TWENTY_F_ANNUAL_REPORT_PAGE_RANGE_RE.search(line_text) is not None:
        return False
    if _TWENTY_F_ANNUAL_REPORT_PAGE_NUMBER_RE.search(line_text) is None:
        return False

    normalized_matched_text = " ".join(str(matched_text or "").split())
    lowered_match = normalized_matched_text.lower()
    matched_index = lowered_line_text.find(lowered_match)
    if matched_index < 0:
        return False

    footer_context_start = max(
        0, int(position) - _TWENTY_F_ANNUAL_REPORT_FOOTER_CONTEXT_LOOKBACK_CHARS
    )
    footer_context = full_text[footer_context_start : int(position)]
    footer_context_hits = sum(
        1
        for pattern in _TWENTY_F_ANNUAL_REPORT_FOOTER_CONTEXT_PATTERNS
        if pattern.search(footer_context) is not None
    )
    repeat_window_end = min(
        len(full_text),
        int(position)
        + len(normalized_matched_text)
        + _TWENTY_F_ANNUAL_REPORT_REPEAT_LOOKAHEAD_CHARS,
    )
    repeated_heading = re.search(
        re.escape(normalized_matched_text),
        full_text[int(position) + len(normalized_matched_text) : repeat_window_end],
        re.IGNORECASE,
    )
    has_footer_context = footer_context_hits >= _TWENTY_F_ANNUAL_REPORT_FOOTER_CONTEXT_MIN_HITS

    prefix_text = line_text[:matched_index].strip(" .,:;|/-")
    prefix_word_count = len(_TWENTY_F_ANNUAL_REPORT_HEADING_PREFIX_WORD_RE.findall(prefix_text))
    if (
        prefix_word_count > _TWENTY_F_ANNUAL_REPORT_PAGE_HEADING_MAX_PREFIX_WORDS
        and not has_footer_context
        and repeated_heading is None
    ):
        return False

    previous_lines = _collect_twenty_f_neighbor_lines(
        full_text,
        line_start=line_start,
        line_end=line_end,
        forward=False,
        max_lines=_TWENTY_F_ANNUAL_REPORT_PAGE_HEADING_NEIGHBOR_LINES,
    )
    next_lines = _collect_twenty_f_neighbor_lines(
        full_text,
        line_start=line_start,
        line_end=line_end,
        forward=True,
        max_lines=_TWENTY_F_ANNUAL_REPORT_PAGE_HEADING_NEIGHBOR_LINES,
    )

    if any("inside this report" in line.lower() for line in previous_lines[-2:]):
        return False

    previous_locator_run = _count_twenty_f_contiguous_page_locator_lines(
        previous_lines,
        from_end=True,
    )
    next_locator_run = _count_twenty_f_contiguous_page_locator_lines(
        next_lines,
        from_end=False,
    )
    if previous_locator_run >= 2 or next_locator_run >= 1:
        return False

    return _contains_twenty_f_page_heading_prose(next_lines)


def _looks_like_twenty_f_standalone_heading_context(
    *,
    full_text: str,
    position: int,
    matched_text: str,
) -> bool:
    """Judge whether a bare fallback phrase is in a "standalone heading" context, not inside a body sentence.

    20-F key-item fallback matches phrases like ``Financial Statements`` / ``Key Information``,
    which inside long sentences would mistake text citations for headings.
    This tightens only bare phrases without explicit Item tokens;
    statutory forms like ``Item 18. Financial Statements`` have no extra restrictions.

    Args:
        full_text: full document text.
        position: hit start.
        matched_text: raw text matched by the current regex.

    Returns:
        ``True`` when it looks more like a standalone heading.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    normalized_match = str(matched_text or "")
    if re.search(r"(?i)\bitem\s+(?:16[A-J]|4A|1[0-9]|[1-9])\b", normalized_match) is not None:
        return True

    # Bound line lookback: reasonable heading line does not exceed 500 chars.
    # Unbounded lookback on huge text without newlines (e.g. SAN 3.6M) generates MBs of prefix,
    # severely degrading search performance.
    _MAX_LINE_LOOKBACK = 500
    lookback_start = max(0, int(position) - _MAX_LINE_LOOKBACK)
    newline_pos = full_text.rfind("\n", lookback_start, max(0, int(position)))
    if newline_pos >= 0:
        line_start = newline_pos + 1
    elif lookback_start > 0:
        # no newline within 500 chars means we are inside a very long line, unlikely a standalone heading
        return False
    else:
        line_start = 0
    line_end = full_text.find("\n", int(position))
    if line_end < 0:
        line_end = len(full_text)

    prefix = full_text[line_start : max(0, int(position))]
    if not prefix.strip():
        previous_lines = _collect_twenty_f_neighbor_lines(
            full_text,
            line_start=line_start,
            line_end=line_end,
            forward=False,
            max_lines=_TWENTY_F_ANNUAL_REPORT_PAGE_HEADING_NEIGHBOR_LINES,
        )
        next_lines = _collect_twenty_f_neighbor_lines(
            full_text,
            line_start=line_start,
            line_end=line_end,
            forward=True,
            max_lines=_TWENTY_F_ANNUAL_REPORT_PAGE_HEADING_NEIGHBOR_LINES,
        )
        previous_locator_run = _count_twenty_f_contiguous_page_locator_lines(
            previous_lines,
            from_end=True,
        )
        next_locator_run = _count_twenty_f_contiguous_page_locator_lines(
            next_lines,
            from_end=False,
        )
        if previous_locator_run >= 2 and next_locator_run >= 1:
            return False
        return True

    if _TWENTY_F_HEADING_PREFIX_ENUM_RE.search(prefix) is not None:
        return True

    prefix_word_count = len(_TWENTY_F_HEADING_PREFIX_WORD_RE.findall(prefix))
    return prefix_word_count == 0


def _looks_like_toc_page_line(full_text: str, position: int) -> bool:
    """20-F flavor of the ToC page-number line check, delegating to the shared implementation."""
    return _looks_like_toc_page_line_generic(
        full_text, position, _TOC_PAGE_LINE_PATTERN, _TOC_PAGE_SNIPPET_PATTERN
    )


def _build_item_title(item_token: str) -> str:
    """Build full 20-F Item title.

    Format: ``Part {roman} - Item {token} - {description}``

    Part label from SEC statutory mapping, description from standard title.
    20-F Item numbers are globally unique; Part prefix is informational (aiding LLM hierarchy understanding).

    Args:
        item_token: Item number (e.g. ``"3"``, ``"16A"``, ``"18"``).

    Returns:
        full title string.

    Raises:
        RuntimeError: Raised when construction fails.
    """

    normalized_token = item_token.strip().upper()

    # SEC statutory Part label
    roman = _TWENTY_F_ITEM_PART_MAP.get(normalized_token)
    part_prefix = f"Part {roman} - " if roman else ""

    # SEC standard description
    description = _TWENTY_F_ITEM_DESCRIPTIONS.get(normalized_token)
    desc_suffix = f" - {description}" if description else ""

    return f"{part_prefix}Item {normalized_token}{desc_suffix}"
