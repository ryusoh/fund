"""Common capabilities for SEC annual/quarterly-report form processors.

This module provides capabilities shared by the 10-K/10-Q/20-F specialized
processors, including:
- Report-class form standardization;
- A general virtual-section splitting base;
- ToC denoising + ordered Item-marker selection utilities.
"""

from __future__ import annotations

import re
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, ClassVar, Optional

import pandas as pd

from scripts.vendor.filings.engine.processors.source import Source
from scripts.vendor.filings.engine.processors.text_utils import (
    PREVIEW_MAX_CHARS as _PREVIEW_MAX_CHARS,
)
from scripts.vendor.filings.engine.processors.text_utils import (
    normalize_whitespace as _normalize_whitespace,
)

from .financial_base import FinancialMeta, FinancialStatementResult
from .form_type_utils import normalize_form_type as _normalize_report_form_type
from .html_financial_statement_common import (
    build_html_statement_result_from_tables as _build_html_statement_result_from_tables,
)
from .report_form_financial_statement_common import (
    REPORT_FORM_SUPPORTED_STATEMENT_TYPES,
)
from .report_form_financial_statement_common import (
    select_report_statement_tables as _select_report_statement_tables,
)
from .report_form_financial_statement_common import (
    should_apply_report_statement_html_fallback as _should_apply_report_statement_html_fallback,
)
from .sec_form_section_common import (
    _format_section_ref,
    _normalize_optional_string,
    _trim_trailing_page_locator,
    _trim_trailing_part_heading,
    _VirtualSection,
    _VirtualSectionProcessorMixin,
)
from .sec_processor import SecProcessor
from .sec_section_build import (
    _build_section_title,
    _iter_sections,
    _safe_section_text,
)
from .sec_table_extraction import _safe_table_dataframe

_TABLE_OF_CONTENTS_TOKEN = "table of contents"
_TABLE_OF_CONTENTS_CUTOFF_BUFFER_CHARS = 1500
_TOC_START_PENALTY_TOLERANCE_CHARS = 500
_LATE_NOTES_TOC_LOOKBACK_CHARS = 320
_LATE_NOTES_TOC_CONTEXT_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"(?i)\bnotes?\s+to\s+(?:the\s+)?consolidated\s+financial\s+statements?\b"),
    re.compile(r"(?i)\bnotes?\s+to\s+financial\s+statements?\b"),
)

# Adaptive ToC-entry detection parameters
# A span between adjacent markers below this threshold is treated as a ToC entry
# (title + page number, usually < 300 chars)
_TOC_ENTRY_MAX_SPAN_CHARS = 500
# When the ratio of "short spans" among inter-marker spans is >= this value, judge as a ToC region
_TOC_SHORT_SPAN_RATIO = 0.8
# When the number of consecutive short spans from the document start is >= this value, judge as a ToC list region
_TOC_MIN_CONSECUTIVE_SHORT_SPANS = 5
# Maximum retries for adaptive ToC skipping (prevents infinite loops)
_MAX_TOC_SKIP_RETRIES = 3
# Partial-ToC detection: lower bound on consecutive short spans (at least 2 consecutive short
# spans + a dramatic jump are required to judge as partial ToC)
_PARTIAL_TOC_MIN_CONSECUTIVE = 2
# Partial-ToC detection: jump-ratio threshold — the next span being N times the max of the
# consecutive short spans is treated as a dramatic jump
_PARTIAL_TOC_JUMP_RATIO = 50
# Inline cross-reference detection: SEC 20-F/10-K body text often contains "see Item 4. Title—Subsection—Detail";
# such references are not real headings and should be skipped. Relocation check triggers when the
# minimum section span is below this value
_INLINE_REF_MIN_SPAN_CHARS = 3000
_INLINE_REF_NEXT_WORD_STOPWORDS = frozenset(
    {
        "in",
        "and",
        "or",
        "of",
        "to",
        "for",
        "from",
        "under",
        "above",
        "below",
        "herein",
        "therein",
        "within",
        "with",
        "on",
        "at",
        "as",
        "by",
    }
)
_INLINE_TOC_PAGE_TOKEN_PATTERN = re.compile(r"\b\d{1,3}(?:\s*[–—-]\s*\d{1,3})?\b")
_INLINE_TOC_PAGE_RANGE_PATTERN = re.compile(r"\b\d{1,3}\s*[–—-]\s*\d{1,3}\b")
_INLINE_TOC_NEXT_HEADING_PATTERN = re.compile(
    r"\b(?:item\s+(?:16[a-j]|(?:1[0-9]|[1-9])[a-z]?)|part\s+(?:i{1,3}|iv))\b",
    re.IGNORECASE,
)
_INLINE_TOC_HEADING_WITH_PAGE_PATTERN = re.compile(
    r"(?:^|\b)(?:(?i:item\s+(?:16[a-j]|(?:1[0-9]|[1-9])[a-z]?))\s+)?"
    r"[A-Za-z][A-Za-z0-9 '&,/\-]{8,}"
    r"\s+\d{1,3}(?:\s*[–—-]\s*\d{1,3})?"
    r"\s+(?:[A-Z][A-Za-z]{2,}|(?i:item\s+(?:16[a-j]|(?:1[0-9]|[1-9])[a-z]?))|(?i:part\s+(?:i{1,3}|iv)))",
)
_LINE_PRESERVING_BLOCK_TAGS = frozenset(
    {
        "address",
        "article",
        "aside",
        "blockquote",
        "br",
        "caption",
        "dd",
        "div",
        "dl",
        "dt",
        "figcaption",
        "figure",
        "footer",
        "form",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "header",
        "hr",
        "li",
        "main",
        "nav",
        "ol",
        "p",
        "pre",
        "section",
        "table",
        "tbody",
        "td",
        "tfoot",
        "th",
        "thead",
        "tr",
        "ul",
    }
)
_LINE_PRESERVING_SKIP_TAGS = frozenset({"script", "style", "noscript"})
_LINE_PRESERVING_WHITESPACE_RE = re.compile(r"[^\S\n]+")
_LINE_PRESERVING_MULTI_NEWLINE_RE = re.compile(r"\n{3,}")


class _LinePreservingHtmlTextExtractor(HTMLParser):
    """Stream-extract HTML text while preserving heading/table line-break boundaries.

    This extractor replaces the full-DOM build path of
    ``BeautifulSoup(...).get_text(separator="\\n")``, avoiding high CPU and memory
    cost on oversized 20-F/iXBRL documents.
    """

    def __init__(self) -> None:
        """Initialize the extractor.

        Args:
            None.

        Returns:
            None.

        Raises:
            RuntimeError: raised when initialization fails.
        """

        super().__init__(convert_charrefs=True)
        self._parts: list[str] = []
        self._skip_depth = 0
        self._last_was_newline = True

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, Optional[str]]],
    ) -> None:
        """Handle a start tag.

        Args:
            tag: tag name.
            attrs: tag attributes; kept only for ``HTMLParser`` signature compatibility, currently unused.

        Returns:
            None.

        Raises:
            RuntimeError: raised when processing fails.
        """

        del attrs
        normalized_tag = str(tag or "").lower()
        if normalized_tag in _LINE_PRESERVING_SKIP_TAGS:
            self._skip_depth += 1
            return
        if normalized_tag in _LINE_PRESERVING_BLOCK_TAGS:
            self._append_newline()

    def handle_endtag(self, tag: str) -> None:
        """Handle an end tag.

        Args:
            tag: tag name.

        Returns:
            None.

        Raises:
            RuntimeError: raised when processing fails.
        """

        normalized_tag = str(tag or "").lower()
        if normalized_tag in _LINE_PRESERVING_SKIP_TAGS:
            if self._skip_depth > 0:
                self._skip_depth -= 1
            return
        if normalized_tag in _LINE_PRESERVING_BLOCK_TAGS:
            self._append_newline()

    def handle_data(self, data: str) -> None:
        """Handle a text node.

        Args:
            data: raw text.

        Returns:
            None.

        Raises:
            RuntimeError: raised when processing fails.
        """

        if self._skip_depth > 0:
            return
        normalized = _normalize_line_preserving_chunk(data)
        if not normalized:
            return
        self._parts.append(normalized)
        self._last_was_newline = normalized.endswith("\n")

    def get_text(self) -> str:
        """Return the normalized text result.

        Args:
            None.

        Returns:
            plain text preserving the main line-break boundaries.

        Raises:
            RuntimeError: raised when generation fails.
        """

        joined = "".join(self._parts).replace("\r\n", "\n").replace("\r", "\n")
        collapsed = _LINE_PRESERVING_MULTI_NEWLINE_RE.sub("\n\n", joined)
        lines = [
            _LINE_PRESERVING_WHITESPACE_RE.sub(" ", line).strip() for line in collapsed.split("\n")
        ]
        return "\n".join(line for line in lines if line)

    def _append_newline(self) -> None:
        """Append a line break only when needed, avoiding blank-line explosion.

        Args:
            None.

        Returns:
            None.

        Raises:
            RuntimeError: raised when the append fails.
        """

        if self._skip_depth > 0 or self._last_was_newline:
            return
        self._parts.append("\n")
        self._last_was_newline = True


def _normalize_line_preserving_chunk(text: str) -> str:
    """Normalize a streamed HTML text chunk.

    Args:
        text: raw text block.

    Returns:
        text block with meaningless whitespace removed; empty string when empty.

    Raises:
        RuntimeError: raised when the normalization fails.
    """

    normalized = str(text or "").replace("\xa0", " ")
    normalized = normalized.replace("\r\n", "\n").replace("\r", "\n")
    normalized = _LINE_PRESERVING_WHITESPACE_RE.sub(" ", normalized)
    return normalized


class _BaseSecReportFormProcessor(_VirtualSectionProcessorMixin, SecProcessor):
    """Base class for SEC report-class form processors."""

    _SUPPORTED_FORMS: ClassVar[frozenset[str]] = frozenset()
    _MIN_VIRTUAL_SECTIONS: ClassVar[int] = 3
    # Performance optimization: report-class processors build virtual sections entirely
    # from document.text() + markers, not from the per-section data produced by
    # _build_sections, so skip the expensive per-section .tables()/.text()/
    # get_sec_section_info() calls and return the full text as a single section.
    _ENABLE_FAST_SECTION_BUILD = True
    _FAST_SECTION_BUILD_SINGLE_FULL_TEXT = True

    def __init__(
        self,
        source: Source,
        *,
        form_type: Optional[str] = None,
        media_type: Optional[str] = None,
    ) -> None:
        """Initialize the processor.

        Args:
            source: document source abstraction.
            form_type: optional form type.
            media_type: optional media type.

        Returns:
            None.

        Raises:
            ValueError: raised when an argument is invalid.
            RuntimeError: raised when parsing fails.
        """

        super().__init__(source=source, form_type=form_type, media_type=media_type)
        # report-class processors enable virtual-section splitting by default, falling back to SecProcessor when markers are insufficient.
        self._initialize_virtual_sections(min_sections=self._MIN_VIRTUAL_SECTIONS)

    @classmethod
    def supports(
        cls,
        source: Source,
        *,
        form_type: Optional[str] = None,
        media_type: Optional[str] = None,
    ) -> bool:
        """Determine whether the given report-class form is supported.

        Args:
            source: document source abstraction.
            form_type: optional form type.
            media_type: optional media type.

        Returns:
            whether it is supported.

        Raises:
            OSError: may be raised when file access fails.
        """

        normalized_form = _normalize_report_form_type(form_type)
        if normalized_form not in cls._SUPPORTED_FORMS:
            return False
        # reuse SecProcessor's file-type and underlying parseability judgment.
        return SecProcessor.supports(
            source,
            form_type=normalized_form,
            media_type=media_type,
        )

    def _build_virtual_sections_from_base(self) -> list[_VirtualSection]:
        """Build first-level virtual sections from parent-class sections (overrides the mixin default).

        when the ``single_full_text`` optimization is enabled, the base ``_build_sections`` only produces
        1 full-text section, leaving the parent class's ``_build_virtual_sections_from_base``
        the fallback path can only produce 1 large virtual section, lower quality than edgartools' multi-section output.

        this override, upon detecting single_full_text + a base class with only 1 section,
        **lazily rebuild** edgartools sections -- only when insufficient markers trigger the fallback
        before the expensive per-section parse runs; most documents never enter this path.

        Args:
            None.

        Returns:
            first-level virtual section list.

        Raises:
            RuntimeError: raised when the build fails.
        """

        # when not single_full_text or the base class already has multiple sections, use the generic path directly
        if not self._should_use_single_full_text_section() or len(self._sections) != 1:
            return _VirtualSectionProcessorMixin._build_virtual_sections_from_base(self)

        # single_full_text fallback: lazily rebuild from edgartools sections
        return _rebuild_virtual_sections_from_edgartools(self._document)

    def get_financial_statement(
        self,
        statement_type: str,
        financials: Optional[dict[str, Any]] = None,
        *,
        meta: Optional[FinancialMeta] = None,
    ) -> FinancialStatementResult:
        """Get report-class financial statements, with HTML fallback after XBRL failure.

        Args:
            statement_type: statement type.
            financials: reserved financials cache, currently unused.
            meta: reserved metadata, currently unused.

        Returns:
            financial-statement result.

        Raises:
            RuntimeError: raised when the read fails.
        """

        result = super().get_financial_statement(
            statement_type=statement_type,
            financials=financials,
            meta=meta,
        )
        normalized_statement_type = statement_type.strip().lower()
        if normalized_statement_type not in REPORT_FORM_SUPPORTED_STATEMENT_TYPES:
            return result
        if not _should_apply_report_statement_html_fallback(result.get("reason")):
            return result

        candidate_tables = self._get_report_statement_tables(normalized_statement_type)
        if not candidate_tables:
            return result

        extracted = self._build_html_statement_from_tables(
            statement_type=normalized_statement_type,
            tables=candidate_tables,
        )
        if extracted is None:
            result["reason"] = "low_confidence_extraction"
            return result
        return extracted

    def _get_report_statement_tables(self, statement_type: str) -> list[Any]:
        """Get financial-statement candidate tables for report-class forms.

        Args:
            statement_type: target statement type.

        Returns:
            candidate table list.

        Raises:
            RuntimeError: raised when filtering fails.
        """

        return _select_report_statement_tables(
            statement_type=statement_type,
            tables=list(getattr(self, "_tables", [])),
            parse_table_dataframe=_parse_report_table_dataframe_from_sec,
        )

    def _build_html_statement_from_tables(
        self,
        *,
        statement_type: str,
        tables: list[Any],
    ) -> Optional[FinancialStatementResult]:
        """Build a structured financial statement from candidate HTML tables.

        Args:
            statement_type: target statement type.
            tables: candidate table list.

        Returns:
            structured financial-statement result; ``None`` on failure.

        Raises:
            RuntimeError: raised when the build fails.
        """

        return _build_html_statement_result_from_tables(
            statement_type=statement_type,
            tables=tables,
            parse_table_dataframe=_parse_report_table_dataframe_from_sec,
        )


def _rebuild_virtual_sections_from_edgartools(document: object) -> list[_VirtualSection]:
    """Lazily rebuild virtual sections from edgartools sections.

    Called when the ``single_full_text`` optimization is enabled but marker
    detection is insufficient. Reads edgartools ``document.sections`` directly,
    skipping the base-class ``_build_sections`` fingerprint/anchor computation,
    and extracts only text and title to build virtual sections.

    Args:
        document: edgartools document object.

    Returns:
        virtual-section list.

    Raises:
        RuntimeError: raised when edgartools parsing fails.
    """

    section_items = _iter_sections(document)
    if not section_items:
        return []

    virtual_sections: list[_VirtualSection] = []
    for index, (section_key, section_obj) in enumerate(section_items, start=1):
        content = _normalize_whitespace(_safe_section_text(section_obj))
        if not content:
            continue
        title = _normalize_optional_string(
            _build_section_title(section_key=section_key, section_obj=section_obj)
        )
        content = _trim_trailing_part_heading(content)
        content = _trim_trailing_page_locator(content, title)
        if not content:
            continue
        preview = _normalize_whitespace(content)[:_PREVIEW_MAX_CHARS]
        virtual_sections.append(
            _VirtualSection(
                ref=_format_section_ref(index),
                title=title,
                content=content,
                preview=preview,
                table_refs=[],
                level=1,
                parent_ref=None,
                child_refs=[],
                start=0,
                end=len(content),
            )
        )
    return virtual_sections


def _parse_report_table_dataframe_from_sec(table: Any) -> Optional[pd.DataFrame]:
    """Safely extract a DataFrame from a SecProcessor table object.

    Args:
        table: internal table object.

    Returns:
        DataFrame copy; ``None`` when unavailable.

    Raises:
        RuntimeError: raised when the extraction fails.
    """

    precomputed_dataframe = getattr(table, "dataframe", None)
    if isinstance(precomputed_dataframe, pd.DataFrame):
        return precomputed_dataframe.copy()

    table_obj = getattr(table, "table_obj", None)
    if table_obj is None:
        return None
    dataframe = _safe_table_dataframe(table_obj)
    if dataframe is None:
        return None
    return dataframe.copy()


def _extract_source_text_preserving_lines(source: Source) -> str:
    """Extract text with newline structure preserved directly from the source HTML.

    Args:
        source: document source abstraction.

    Returns:
        text extracted in DOM order with newline separators; empty string on failure.

    Raises:
        RuntimeError: raised when the read fails.
    """

    try:
        source_path = source.materialize(suffix=".html")
    except Exception:
        return ""
    path = Path(source_path)
    try:
        raw_html = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""
    if not raw_html.strip():
        return ""
    parser = _LinePreservingHtmlTextExtractor()
    parser.feed(raw_html)
    parser.close()
    return parser.get_text()


def _find_table_of_contents_cutoff(full_text: str) -> int:
    """Compute the suggested split start after the TOC.

    Args:
        full_text: full document text.

    Returns:
        split start position; 0 when no TOC is recognized.

    Raises:
        RuntimeError: raised when the computation fails.
    """

    lowered = str(full_text or "").lower()
    toc_index = lowered.find(_TABLE_OF_CONTENTS_TOKEN)
    if toc_index < 0:
        return 0
    context_start = max(0, toc_index - _LATE_NOTES_TOC_LOOKBACK_CHARS)
    toc_context = full_text[context_start:toc_index]
    if any(pattern.search(toc_context) is not None for pattern in _LATE_NOTES_TOC_CONTEXT_PATTERNS):
        return 0
    return max(0, toc_index + _TABLE_OF_CONTENTS_CUTOFF_BUFFER_CHARS)


def _looks_like_inline_toc_snippet(
    full_text: str,
    position: int,
    *,
    window_chars: int = 260,
    max_first_page_offset: int = 180,
) -> bool:
    """Judge whether a position falls in a "single-line ToC entry" fragment.

    In real documents, some iXBRL text is flattened to a single line, with ToC
    entries appearing as: ``Management ... 7 Item 7A ...``. Such fragments have
    no line-break boundaries, and would be missed by the "line start + page
    number" rule alone.

    Decision strategy:
    1. The fragment directly contains ``table of contents``;
    2. Two or more page-number tokens appear near the fragment start (typical consecutive ToC page numbers);
    3. A next-section anchor (``Item/Part``) quickly follows the page-number token;
    4. The compact "title + page number + next title" pattern hits.

    Args:
        full_text: full document text.
        position: start position to judge.
        window_chars: fragment window length.
        max_first_page_offset: maximum allowed offset of the first page-number token.

    Returns:
        ``True`` when the fragment presents as a single-line ToC structure.

    Raises:
        RuntimeError: raised when the judgment fails.
    """

    start = max(0, min(len(full_text), int(position)))
    end = min(len(full_text), start + max(64, int(window_chars)))
    snippet_raw = full_text[start:end]
    if not snippet_raw:
        return False

    snippet = " ".join(snippet_raw.split())
    lowered = snippet.lower()
    if _TABLE_OF_CONTENTS_TOKEN in lowered:
        return True

    page_matches = list(_INLINE_TOC_PAGE_TOKEN_PATTERN.finditer(snippet))
    if not page_matches:
        return False
    if page_matches[0].start() > max(0, int(max_first_page_offset)):
        return False
    if _INLINE_TOC_PAGE_RANGE_PATTERN.search(snippet) is not None:
        return True

    suffix = snippet[page_matches[0].end() : page_matches[0].end() + 160]
    if _INLINE_TOC_NEXT_HEADING_PATTERN.search(suffix) is not None:
        return True
    return _INLINE_TOC_HEADING_WITH_PAGE_PATTERN.search(snippet) is not None


# ── Shared cross-Form ToC page-line detection ─────────────────

_TOC_SNIPPET_MAX_CHARS = 260
"""ToC fragment window-length limit (chars), used to judge a TOC page line."""


def _looks_like_toc_page_line_generic(
    full_text: str,
    position: int,
    toc_page_line_pattern: re.Pattern[str],
    toc_page_snippet_pattern: re.Pattern[str],
) -> bool:
    """Judge whether a position falls on a ToC page-number line (parameterized version).

    This function is extracted from three identical logic blocks in 10-K / 10-Q / 20-F;
    the Forms differ only in ``toc_page_line_pattern`` / ``toc_page_snippet_pattern``,
    while the core judgment logic is exactly the same.

    Args:
        full_text: full document text.
        position: position to judge.
        toc_page_line_pattern: line-level ToC page-number regex (matches single-line "title+page").
        toc_page_snippet_pattern: fragment-level ToC page-number regex (matches multi-line ToC fragments).

    Returns:
        ``True`` when the "title+page" ToC-line pattern hits.
    """

    start = max(0, min(len(full_text), int(position)))
    line_end = full_text.find("\n", start)
    if line_end < 0:
        line_end = min(len(full_text), start + _TOC_SNIPPET_MAX_CHARS)
    line_text = full_text[start:line_end].strip()
    if line_text and toc_page_line_pattern.match(line_text) is not None:
        return True

    snippet_end = min(len(full_text), start + _TOC_SNIPPET_MAX_CHARS)
    snippet_text = full_text[start:snippet_end].strip()
    if not snippet_text:
        return False
    if toc_page_snippet_pattern.match(snippet_text) is not None:
        return True
    return _looks_like_inline_toc_snippet(full_text, start)


def _select_ordered_item_markers(
    full_text: str,
    *,
    item_pattern: re.Pattern[str],
    ordered_tokens: tuple[str, ...],
    start_at: int = 0,
    end_at: Optional[int] = None,
) -> list[tuple[str, int]]:
    """Select Item markers by a predefined token order.

    Args:
        full_text: full document text.
        item_pattern: Item matching regex (first capture group should be the Item token).
        ordered_tokens: expected-order token list.
        start_at: starting scan position.
        end_at: optional end position (exclusive).

    Returns:
        `(item_token, start_index)` list.

    Raises:
        RuntimeError: raised when the selection fails.
    """

    start_index = max(0, int(start_at))
    if end_at is None:
        end_index = len(full_text)
    else:
        end_index = max(start_index, int(end_at))

    matches: list[tuple[str, int]] = []
    for match in item_pattern.finditer(full_text):
        position = int(match.start())
        if position < start_index or position >= end_index:
            continue
        token_raw = _extract_item_token_from_match(match)
        if not token_raw:
            continue
        matches.append((token_raw, position))
    if not matches:
        return []

    selected: list[tuple[str, int]] = []
    cursor = start_index
    for token in ordered_tokens:
        found_position = _find_item_token_position_after(
            matches=matches,
            full_text=full_text,
            target_token=token,
            cursor=cursor,
            end_at=end_index,
        )
        if found_position is None:
            continue
        selected.append((token, found_position))
        cursor = found_position + 1
    return selected


def _extract_item_token_from_match(match: re.Match[str]) -> str:
    """Extract the Item token from a regex match object.

    Two pattern types are supported:
    1. Single-capture-group mode (the traditional ``group(1)``);
    2. Multi-capture-group mode (the regex alternation builds a group per spelling),
       automatically returns the first non-empty capture group.

    Args:
        match: match object produced by ``re.finditer``.

    Returns:
        normalized Item token (uppercase); empty string when extraction fails.

    Raises:
        RuntimeError: raised when the extraction fails.
    """

    group_count = int(getattr(match.re, "groups", 0))
    if group_count <= 0:
        return ""

    for group_index in range(1, group_count + 1):
        value = str(match.group(group_index) or "").strip().upper()
        if value:
            return value
    return ""


def _refine_inline_reference_markers(
    full_text: str,
    selected: list[tuple[str, int]],
    *,
    item_pattern: re.Pattern[str],
    min_span: int = _INLINE_REF_MIN_SPAN_CHARS,
) -> list[tuple[str, int]]:
    """Detect and fix abnormally short sections caused by inline cross-references.

    SEC 20-F/10-K body text often contains references like:
    ``"see Item 4. Information on the Company—C. Organizational Structure—..."``
    The greedy cursor would wrongly select these inline references instead of the real section headings.

    Detection strategy: for each selected marker, compute the span to the next
    marker; if the span is below the ``min_span`` threshold, check whether the
    text before the match position is a typical inline context (the preceding
    non-whitespace character is not a newline); if so, try the next occurrence
    of that token in the document.

    This function is an adaptive rule — inferred from the data characteristic
    that "real headings usually sit at a line start".

    Args:
        full_text: full document text.
        selected: selected ``(item_token, position)`` list.
        item_pattern: Item matching regex.
        min_span: abnormally short section threshold.

    Returns:
        corrected ``(item_token, position)`` list.
    """

    if len(selected) < 2:
        return selected

    # Pre-collect all match positions for finding alternative candidates
    all_matches: dict[str, list[int]] = {}
    for match in item_pattern.finditer(full_text):
        token_raw = str(match.group(1) or "").strip().upper()
        if token_raw:
            all_matches.setdefault(token_raw, []).append(int(match.start()))

    refined = list(selected)
    for i in range(len(refined) - 1):
        token, pos = refined[i]
        next_pos = refined[i + 1][1]
        span = next_pos - pos

        if span >= min_span:
            continue

        # span too short; check whether it is an inline cross-reference.
        # the character before an inline reference is usually a letter/punctuation (embedded in a sentence),
        # while the character before a real heading is usually a newline or document start.
        if not _is_inline_reference_context(full_text, pos):
            continue

        # find a further candidate of the same token (after the current position, before the next marker)
        candidates = all_matches.get(token, [])
        # need to search further out beyond the pos < candidate <= next_pos range
        # actually the candidate should be searched in the range max(pos+1, prev_bound) to next_next_pos
        # simplified: find the next occurrence not in an inline-reference context
        for cand_pos in candidates:
            if cand_pos <= pos:
                continue
            # candidate should not be too close to the next marker (at least min_span/2 of separation)
            # or the candidate is beyond the next_pos range (in which case the whole section would be longer)
            if cand_pos >= next_pos:
                # candidate beyond the next marker; must not disturb subsequent token ordering
                # valid only when the candidate lies further between the current token and the next
                # ensure no conflict with later markers
                if i + 2 < len(refined) and cand_pos >= refined[i + 2][1]:
                    continue
            if _is_inline_reference_context(full_text, cand_pos):
                continue
            refined[i] = (token, cand_pos)
            break

    return refined


def _is_inline_reference_context(full_text: str, pos: int) -> bool:
    """Judge whether a position is inside an inline cross-reference context.

    Judged by inspecting the text features before the match position: a real
    heading usually sits at a line start (the preceding non-whitespace character
    is a newline or absent), while a cross-reference is embedded mid-sentence.

    Args:
        full_text: full document text.
        pos: match start position.

    Returns:
        ``True`` when the position looks like an inline-reference context.
    """

    if pos <= 0:
        return False

    # Look backward for the nearest non-whitespace character
    idx = pos - 1
    while idx >= 0 and full_text[idx] in (" ", "\t", "\xa0"):
        idx -= 1

    if idx < 0:
        # reached the document start -- treat as line start
        return False

    # Line-start marker: a newline character
    return full_text[idx] != "\n"


def _markers_look_like_toc_entries(
    full_text: str,
    markers: list[tuple[str, int]],
) -> bool:
    """Judge whether the selected markers are in the ToC region.

    Convenience wrapper: delegates to ``_find_toc_cluster_end`` internally; a
    non-``None`` return means ToC characteristics were detected.

    Args:
        full_text: full document text.
        markers: selected ``(item_token, position)`` list.

    Returns:
        ``True`` when ToC characteristics are detected.

    Raises:
        RuntimeError: raised when the detection fails.
    """

    return _find_toc_cluster_end(full_text, markers) is not None


def _find_toc_cluster_end(
    full_text: str,
    markers: list[tuple[str, int]],
    *,
    check_partial_toc: bool = True,
) -> Optional[int]:
    """Detect the ToC list at the start of the markers and return the suggested skip position.

    Two-layer adaptive detection:

    1. **Consecutive short-span detection**: starting from the first marker, if more
       than ``_TOC_MIN_CONSECUTIVE_SHORT_SPANS`` inter-marker spans
       all below the threshold, meaning the document starts with a dense ToC list region.
       return the **end boundary of the consecutive ToC region** (after the last ToC entry),
       rather than after the last marker -- ensuring only the ToC part is skipped,
       keep later markers already in the body.
    2. **Global ratio detection**: if >= 80% of the inter-marker spans are below the threshold,
       the whole marker sequence most likely falls entirely in the ToC region; return the last
       position after the marker.

    Args:
        full_text: full document text.
        markers: selected ``(item_token, position)`` list.
        check_partial_toc: whether to enable partial-ToC detection (check 1b).
            should be set to ``False`` once a full ToC cluster has been skipped
            so consecutive short body sections (e.g. "Not Applicable") are not misclassified.

    Returns:
        suggested retry start position; ``None`` when no ToC characteristics are detected.

    Raises:
        RuntimeError: raised when the detection fails.
    """

    if len(markers) < 3:
        return None

    # Compute spans between adjacent markers (excluding the last marker to document end)
    spans: list[int] = []
    for i in range(len(markers) - 1):
        span = markers[i + 1][1] - markers[i][1]
        spans.append(span)

    if not spans:
        return None

    # Check 1: consecutive short spans at the start (ToC list characteristic)
    # A ToC list is a series of compact entries (title + page number), rarely seen in body text
    consecutive_short_from_start = 0
    for s in spans:
        if s < _TOC_ENTRY_MAX_SPAN_CHARS:
            consecutive_short_from_start += 1
        else:
            break
    if consecutive_short_from_start >= _TOC_MIN_CONSECUTIVE_SHORT_SPANS:
        # the last entry of a consecutive ToC region = markers[consecutive_short_from_start]
        # retry after that position so the greedy cursor starts selecting from the body
        return markers[consecutive_short_from_start][1] + 1

    # Check 1b: partial ToC + dramatic jump
    # Scenario: the first N markers (N < 5) are in the ToC region, and the (N+1)-th marker
    # falls directly into the body.
    # Typical case: TSM's 20-F has its "table of contents" in the XBRL preamble, and the
    # cutoff sits before the ToC list, so the first 3 Items (1, 2, 3) match ToC entries,
    # while Item 4A jumps straight to the body (span blows up from ~100 to ~117K).
    # Note: this check must not trigger again after one full ToC skip has completed,
    # because consecutive short body sections (like SONY 20-F's "Not Applicable" Items)
    # produce the same short-span + big-jump pattern and would be misjudged.
    if (
        check_partial_toc
        and consecutive_short_from_start >= _PARTIAL_TOC_MIN_CONSECUTIVE
        and consecutive_short_from_start < len(spans)
    ):
        max_short_span = max(spans[:consecutive_short_from_start])
        next_span = spans[consecutive_short_from_start]
        if max_short_span > 0 and next_span / max_short_span >= _PARTIAL_TOC_JUMP_RATIO:
            return markers[consecutive_short_from_start][1] + 1

    # Check 2: global short-span ratio (pure ToC-region characteristic)
    short_count = sum(1 for s in spans if s < _TOC_ENTRY_MAX_SPAN_CHARS)
    if short_count / len(spans) >= _TOC_SHORT_SPAN_RATIO:
        # the whole sequence is inside the ToC -> skip past the last marker
        return markers[-1][1] + 1

    return None


def _skip_toc_like_markers(
    full_text: str,
    *,
    item_pattern: re.Pattern[str],
    ordered_tokens: tuple[str, ...],
    initial_selected: list[tuple[str, int]],
    min_items: int,
    end_at: Optional[int] = None,
) -> list[tuple[str, int]]:
    """If the initial markers look like ToC entries, skip them and re-select body markers.

    Some filings have no explicit "Table of Contents" text marker but still have a
    ToC list region at the document start. This function detects and skips these
    implicit ToC regions via quality checks.

    For the **partial ToC** scenario (the first several markers are in the ToC and
    later markers are already in the body), only the ToC cluster is skipped, not
    all markers.

    Args:
        full_text: full document text.
        item_pattern: Item matching regex.
        ordered_tokens: expected-order token list.
        initial_selected: initially selected markers.
        min_items: minimum Item count required to adopt the retry result.
        end_at: optional end position (exclusive), bounding the selection range.

    Returns:
        when the initial markers are a ToC and body markers can be found, return the body markers,
        otherwise the initial markers are returned.

    Raises:
        RuntimeError: raised when the selection fails.
    """

    toc_end = _find_toc_cluster_end(full_text, initial_selected)
    if toc_end is None:
        return initial_selected

    # Re-select after the ToC end position
    # A ToC skip has succeeded once; disable partial-ToC detection (check 1b) in later
    # iterations, to avoid misjudging consecutive short body sections (e.g. "Not
    # Applicable") as partial ToC
    start_at = toc_end
    for _ in range(_MAX_TOC_SKIP_RETRIES):
        retry = _select_ordered_item_markers(
            full_text,
            item_pattern=item_pattern,
            ordered_tokens=ordered_tokens,
            start_at=start_at,
            end_at=end_at,
        )
        if len(retry) < min_items:
            break
        next_toc_end = _find_toc_cluster_end(
            full_text,
            retry,
            check_partial_toc=False,
        )
        if next_toc_end is None:
            return retry
        # still has ToC characteristics -> keep skipping
        start_at = next_toc_end

    return initial_selected


def _select_ordered_item_markers_after_toc(
    full_text: str,
    *,
    item_pattern: re.Pattern[str],
    ordered_tokens: tuple[str, ...],
    min_items_after_toc: int = 4,
    end_at: Optional[int] = None,
) -> list[tuple[str, int]]:
    """Prefer selecting ordered Item markers after the TOC.

    Adaptive strategy:

    1. Locate the "table of contents" marker and start selecting Item markers after it;
    2. Apply a **quality check** to each round of selected markers: if inter-marker spans
       most < ``_TOC_ENTRY_MAX_SPAN_CHARS``, meaning we are still inside the
       ToC list region (title + page number); automatically retry after the last ToC entry;
    3. Retry at most ``_MAX_TOC_SKIP_RETRIES`` times to ensure no infinite loop;
    4. Fall back to the default result selected from the document start.

    Args:
        full_text: full document text.
        item_pattern: Item matching regex.
        ordered_tokens: expected-order token list.
        min_items_after_toc: minimum Item count required to adopt the post-TOC result.
        end_at: optional end position (exclusive), bounding the selection range.
            typical use: pass the Part II anchor position to prevent Part I Item selection
            straying into the Part II region.

    Returns:
        `(item_token, start_index)` list.

    Raises:
        RuntimeError: raised when the selection fails.
    """

    # Fallback: default selection from the document start
    default_selected = _select_ordered_item_markers(
        full_text,
        item_pattern=item_pattern,
        ordered_tokens=ordered_tokens,
        start_at=0,
        end_at=end_at,
    )
    toc_start = _find_table_of_contents_cutoff(full_text)
    if toc_start <= 0:
        # without a "table of contents" marker, still check whether the default result is a ToC entry.
        # some filings have a ToC region but no explicit ToC heading text.
        skipped = _skip_toc_like_markers(
            full_text,
            item_pattern=item_pattern,
            ordered_tokens=ordered_tokens,
            initial_selected=default_selected,
            min_items=min_items_after_toc,
        )
        # adaptive guard: if the "skip ToC" result clearly lost many Items,
        # and the default result starts at the legally-first token, so prefer keeping the default result,
        # avoid misclassifying the body start as ToC (as in some 20-F documents).
        result = skipped
        if (
            len(default_selected) >= min_items_after_toc
            and len(default_selected) - len(skipped) >= 2
            and bool(default_selected)
            and default_selected[0][0] == ordered_tokens[0]
        ):
            result = default_selected
        return _refine_inline_reference_markers(
            full_text,
            result,
            item_pattern=item_pattern,
        )

    # Adaptive iteration: start from toc_start and skip ToC entries step by step
    start_at = toc_start
    best_from_cutoff: Optional[list[tuple[str, int]]] = None
    has_skipped_toc = False  # flag for whether at least one ToC skip has completed
    for _ in range(_MAX_TOC_SKIP_RETRIES):
        selected = _select_ordered_item_markers(
            full_text,
            item_pattern=item_pattern,
            ordered_tokens=ordered_tokens,
            start_at=start_at,
            end_at=end_at,
        )
        if len(selected) < min_items_after_toc:
            # too few Items; stop retrying
            break
        # after a ToC skip completes, disable part of ToC detection (check 1b),
        # avoid misclassifying consecutive short body sections
        toc_end = _find_toc_cluster_end(
            full_text,
            selected,
            check_partial_toc=not has_skipped_toc,
        )
        if toc_end is None:
            # quality acceptable: no ToC characteristics

            best_from_cutoff = selected
            break
        # markers still in the ToC region -> skip to the end of the ToC cluster and retry
        start_at = toc_end
        has_skipped_toc = True

    # Also try cluster-based TOC skipping on default_selected,
    # handling the scenario where "Table of Contents" is a header/footer and the
    # cutoff over-skips body Items
    cluster_skipped = _skip_toc_like_markers(
        full_text,
        item_pattern=item_pattern,
        ordered_tokens=ordered_tokens,
        initial_selected=default_selected,
        min_items=min_items_after_toc,
        end_at=end_at,
    )

    # Choose the best candidate among default / cutoff / cluster.
    # Scoring rules:
    # 1) Prefer more markers (more complete coverage);
    # 2) On a tie, prefer the candidate whose first marker is earlier (usually closer to the body start);
    # 3) When an explicit ToC exists, penalize candidates whose first marker falls before toc_start.
    candidates: list[list[tuple[str, int]]] = [default_selected]
    if best_from_cutoff is not None:
        candidates.append(best_from_cutoff)
    if cluster_skipped is not None:
        candidates.append(cluster_skipped)

    nonempty_candidates = [candidate for candidate in candidates if candidate]
    nonempty_candidates = _prefer_non_toc_marker_candidates(
        full_text=full_text,
        candidates=nonempty_candidates,
    )
    if not nonempty_candidates:
        best_result = default_selected
    else:
        best_result = nonempty_candidates[0]
        best_rank = _rank_marker_candidate(best_result, toc_start=toc_start)
        for candidate in nonempty_candidates[1:]:
            rank = _rank_marker_candidate(candidate, toc_start=toc_start)
            if rank > best_rank:
                best_rank = rank
                best_result = candidate

    return _refine_inline_reference_markers(
        full_text,
        best_result,
        item_pattern=item_pattern,
    )


def _prefer_non_toc_marker_candidates(
    *,
    full_text: str,
    candidates: list[list[tuple[str, int]]],
) -> list[list[tuple[str, int]]]:
    """Prefer "non-ToC cluster" candidates among multiple candidates.

    The current ranking rule (coverage count first) can mis-select ToC candidates
    in the following scenarios:
    - The default candidate covers completely but lands in the ToC region;
    - The retry candidate also covers completely or nearly completely, but sits in the body.

    This function filters candidates by ToC characteristics first, then hands them
    to the ranking function for the final pick. To avoid false kills, filtering is
    enabled only when at least one "non-ToC" candidate exists and that candidate
    contains at least 2 markers; otherwise the original candidate list is returned.

    Args:
        full_text: full document text.
        candidates: candidate marker list; each element is a ``(item_token, position)`` list.

    Returns:
        filtered candidate list; the original list when enabling conditions are unmet.

    Raises:
        RuntimeError: raised when the filtering fails.
    """

    if not candidates:
        return candidates

    clean_candidates: list[list[tuple[str, int]]] = []
    for candidate in candidates:
        if len(candidate) < 2:
            continue
        toc_end = _find_toc_cluster_end(
            full_text,
            candidate,
            check_partial_toc=False,
        )
        if toc_end is None:
            clean_candidates.append(candidate)

    if not clean_candidates:
        return candidates
    return clean_candidates


def _rank_marker_candidate(
    markers: list[tuple[str, int]],
    *,
    toc_start: int,
) -> tuple[int, int, int]:
    """Score a marker candidate, for choosing among multiple candidates.

    Args:
        markers: candidate marker list.
        toc_start: explicit ToC truncation start (0 when there is no ToC).

    Returns:
        sort-score tuple (larger is better).

    Raises:
        RuntimeError: raised when the scoring fails.
    """

    if not markers:
        return (-1, -1, -1)
    first_pos = markers[0][1]
    before_toc_penalty = 0
    effective_toc_start = max(0, toc_start - _TOC_START_PENALTY_TOLERANCE_CHARS)
    if toc_start > 0 and first_pos < effective_toc_start:
        before_toc_penalty = -1
    return (before_toc_penalty, len(markers), -first_pos)


def _find_item_token_position_after(
    *,
    matches: list[tuple[str, int]],
    full_text: str,
    target_token: str,
    cursor: int,
    end_at: int,
) -> Optional[int]:
    """Find the first position of the target Item token after the cursor.

    Args:
        matches: all pre-collected match results.
        target_token: target token.
        cursor: starting cursor position.
        end_at: end position (exclusive).

    Returns:
        hit position; `None` on a miss.

    Raises:
        RuntimeError: raised when the search fails.
    """

    candidate_positions: list[int] = []
    for token, position in matches:
        if token != target_token:
            continue
        if position < cursor:
            continue
        if position >= end_at:
            continue
        candidate_positions.append(position)

    if not candidate_positions:
        return None

    filtered_positions = [
        position
        for position in candidate_positions
        if not _looks_like_inline_item_reference(full_text, position)
    ]
    positions_for_selection = filtered_positions if filtered_positions else candidate_positions

    # Prefer "non-inline-reference" positions, reducing "see Item X ..." being
    # mistaken for a heading. If the full-text structure has been flattened
    # (almost no newlines) so that all candidates look like inline references,
    # fall back to the old behavior (first candidate) to avoid missing real headings.
    for position in positions_for_selection:
        if not _is_inline_reference_context(full_text, position):
            return position
    return positions_for_selection[0]


def _looks_like_inline_item_reference(full_text: str, position: int) -> bool:
    """Judge whether a position is an inline cross-reference like "Item X in/and/of ...".

    This rule filters unpunctuated cross-reference phrases, for example:
    - ``Item 1A in this report``
    - ``Item 1A and Item 2``

    Args:
        full_text: full document text.
        position: match start position.

    Returns:
        ``True`` when it looks like an inline cross-reference.

    Raises:
        RuntimeError: raised when the judgment fails.
    """

    snippet = full_text[position : position + 80]
    matched = re.match(
        r"(?i)\bitem\s+(?:16[a-j]|(?:1[0-9]|[1-9])[a-z]?)\b\s+([a-z]+)\b",
        snippet,
    )
    if matched is None:
        return False
    next_word = str(matched.group(1) or "").lower()
    return next_word in _INLINE_REF_NEXT_WORD_STOPWORDS


__all__ = [
    "_BaseSecReportFormProcessor",
    "_normalize_report_form_type",
    "_find_table_of_contents_cutoff",
    "_find_toc_cluster_end",
    "_looks_like_inline_toc_snippet",
    "_is_inline_reference_context",
    "_markers_look_like_toc_entries",
    "_refine_inline_reference_markers",
    "_select_ordered_item_markers",
    "_select_ordered_item_markers_after_toc",
]
