"""Common capabilities for SEC form-specific section processors.

This module aggregates shared capabilities across multiple SEC form-specific processors, including:
- Full-text marker based virtual section splitting mixin `_VirtualSectionProcessorMixin`;
- General utility functions for text normalization, section ref generation, marker deduplication, etc.;
- Unified implementation of section listing, reading, and searching behavior.

Notes:
- This module only contains cross-form reusable implementations;
- Form-specific regexes and marker strategies should reside in standalone processor modules.

Maintenance note (do not split this module):
    Although this module is ~3000 lines, its core mixin and helper functions jointly serve
    the single concern of virtual section splitting, consumed by 14 downstream processor modules.
    Dense call chains exist among helper functions (heading extraction -> line splitting -> title
    normalization -> boundary detection); splitting would only increase import complexity
    without reducing coupling.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Optional, Protocol, cast

from scripts.vendor.filings.engine.processors.base import (
    SearchHit,
    SectionContent,
    SectionSummary,
    TableSummary,
)
from scripts.vendor.filings.engine.processors.search_utils import (
    enrich_hits_by_section,
    enrich_hits_by_section_token_or,
)
from scripts.vendor.filings.engine.processors.source import Source
from scripts.vendor.filings.engine.processors.text_utils import (
    PREVIEW_MAX_CHARS as _PREVIEW_MAX_CHARS,
)
from scripts.vendor.filings.engine.processors.text_utils import (
    TABLE_PLACEHOLDER_PATTERN as _TABLE_REF_PATTERN,
)
from scripts.vendor.filings.engine.processors.text_utils import (
    extract_table_refs_from_text as _extract_table_refs,
)
from scripts.vendor.filings.engine.processors.text_utils import (
    format_section_ref as _format_section_ref,
)
from scripts.vendor.filings.engine.processors.text_utils import (
    infer_suffix_from_uri as _infer_suffix_from_uri,
)
from scripts.vendor.filings.engine.processors.text_utils import (
    normalize_optional_string as _normalize_optional_string,
)
from scripts.vendor.filings.engine.processors.text_utils import (
    normalize_whitespace as _normalize_whitespace,
)
from scripts.vendor.filings.fins.processors.form_type_utils import (
    normalize_form_type as _normalize_form_type,
)
from scripts.vendor.filings.fins.processors.sec_processor import SecProcessor
from scripts.vendor.filings.log import Log

# --- Cross-Form Shared Regex Constants ---

# Signature section title pattern, matches "SIGNATURE" or "SIGNATURES" (plural)
SIGNATURE_PATTERN = re.compile(r"(?i)\bsignatures?\b")

# SEC statutory Part heading pattern (used to trim Part heading residue at section tail)
# Ref: SEC Regulation S-K: Part I-IV + optional statutory subtitle
# Matches Part heading at text tail (allows surrounding whitespace, optional subtitle text)
_TRAILING_PART_HEADING_RE = re.compile(
    r"\s*"  # leading whitespace
    r"PART\s+(?:I{1,3}|IV)\b"  # "PART I" / "PART II" / "PART III" / "PART IV"
    r"(?:"  # optional statutory subtitle group
    r"[\s\.\-—–:]*"  # delimiter
    r"(?:FINANCIAL\s+(?:INFORMATION|STATEMENTS)"
    r"|OTHER\s+INFORMATION"
    r"|FINANCIAL\s+DATA\s+AND\s+SUPPLEMENTARY\s+DATA"
    r"|EXHIBITS(?:\s+AND)?"
    r"|EXHIBITS,?\s+FINANCIAL\s+STATEMENT\s+SCHEDULES"
    r")?"
    r")"
    r"[\s\.]*$",  # trailing whitespace/period until end of text
    re.IGNORECASE,
)
# Only search within trailing N characters of section to prevent trimming "Part" references in body
_TRAILING_PART_TRIM_WINDOW = 200
_SHORT_ITEM_SECTION_MAX_CHARS = 400
_SHORT_ITEM_SECTION_MAX_WORDS = 48
_PAGE_LOCATOR_TOKEN_PATTERN = r"(?:[A-Z]-\d{1,3}|\d{1,3})(?:\s*[—–-]\s*(?:[A-Z]-\d{1,3}|\d{1,3}))?"
_PAGE_LOCATOR_TAIL_RE = re.compile(
    rf"(?:\s*(?:,|/|;)?\s*{_PAGE_LOCATOR_TOKEN_PATTERN}){{1,6}}\s*$",
    re.IGNORECASE,
)
_PAGE_LOCATOR_CONTEXT_KEYWORDS = (
    "financial statements",
    "operating and financial review",
    "exhibits",
    "not applicable",
    "table of contents",
    "consolidated financial",
    "see ",
)
_CHILD_REF_WIDTH = 2
_MIN_CHILD_SECTION_CHARS = 80
_CHILD_HEADING_MIN_DISTANCE = 240
_MAX_VIRTUAL_SECTION_LEVEL = 4
_FALLBACK_HEADING_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"^\s*([A-Z]\.\s+[^\n]{6,120})\s*$", re.MULTILINE),
    re.compile(
        r"^\s*((?:Note|NOTES?)\s+\d{1,2}[A-Z]?(?:\s*[:\.-]\s*[^\n]{3,120})?)\s*$", re.MULTILINE
    ),
    re.compile(r"^\s*(\d+\.\s+[^\n]{6,120})\s*$", re.MULTILINE),
)
_FALLBACK_INLINE_HEADING_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"(?<![A-Za-z0-9\.])([A-Z]\.\s+[A-Z][^\.\n]{6,140})"),
    re.compile(
        r"(?<![A-Za-z0-9])((?:Note|NOTES?)\s+\d{1,2}[A-Z]?(?:\s*[:\.-]\s*[A-Z][^\.\n]{3,160})?)",
        re.IGNORECASE,
    ),
    re.compile(r"(?<![A-Za-z0-9])((?:[1-9]|1[0-9])\.\s+[A-Z][^\.\n]{6,140})"),
)
_INLINE_HEADING_CONTEXT_WINDOW = 96
_INLINE_HEADING_TITLE_MAX_WORDS = 14
_INLINE_HEADING_MAX_DASH_COUNT = 2
_INLINE_HEADING_MIN_WORDS = 2
_INLINE_HEADING_MAX_WORDS = 24
_TITLE_CASE_HEADING_MIN_PARENT_CHARS = 12000
_TITLE_CASE_HEADING_MIN_WORDS = 2
_TITLE_CASE_HEADING_MAX_WORDS = 10
_TITLE_CASE_HEADING_MAX_CHARS = 96
_TITLE_CASE_HEADING_MIN_ALPHA_CHARS = 10
_TITLE_CASE_HEADING_MIN_CAPITALIZED_RATIO = 0.75
_TITLE_CASE_HEADING_LOOKAHEAD_LINES = 6
_TITLE_CASE_HEADING_PROSE_WINDOW = 3
_TITLE_CASE_HEADING_MIN_PROSE_WORDS = 12
_TITLE_CASE_HEADING_ARTIFACT_TITLES = frozenset(
    {
        "table of contents",
    }
)
_FALLBACK_HEADING_TRAILING_STOPWORDS = frozenset(
    {
        "a",
        "an",
        "and",
        "as",
        "at",
        "by",
        "for",
        "from",
        "in",
        "into",
        "of",
        "on",
        "or",
        "per",
        "the",
        "to",
        "under",
        "upon",
        "with",
    }
)
_FALLBACK_HEADING_CAPITALIZATION_STOPWORDS = frozenset(
    {
        "a",
        "an",
        "and",
        "as",
        "at",
        "by",
        "for",
        "from",
        "in",
        "into",
        "of",
        "on",
        "or",
        "per",
        "the",
        "to",
        "under",
        "upon",
        "with",
    }
)
_FALLBACK_HEADING_MIN_CAPITALIZED_RATIO = 0.5
_NOTE_HEADING_ALLOWED_PARENT_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"(?i)\bfinancial statements?\b"),
    re.compile(r"(?i)\bnotes?\s+to\b"),
    re.compile(r"(?i)\bconsolidated\s+(?:financial\s+)?statements?\b"),
    re.compile(r"(?i)\bselected\s+financial\s+data\b"),
)
_NOTE_HEADING_ALLOWED_CONTENT_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"(?i)\bnotes?\s+to\s+(?:the\s+)?consolidated\s+financial\s+statements?\b"),
    re.compile(r"(?i)\bconsolidated\s+financial\s+statements?\b"),
)
_NOTE_HEADING_PARENT_CONTENT_WINDOW = 1600
_REFERENCE_GUIDE_PREFIX_WINDOW = 2600
_REFERENCE_GUIDE_SOURCE_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"(?i)\bannual\s+report\b"),
    re.compile(r"(?i)\bannual\s+financial\s+report\b"),
    re.compile(r"(?i)\bintegrated\s+annual\s+report\b"),
    re.compile(r"(?i)\bfurther\s+information\b"),
    re.compile(r"(?i)\bsupplement\b"),
    re.compile(r"(?i)\bgovernance\s+and\s+remuneration\s+report\b"),
    re.compile(r"(?i)\bpresentation\s+of\s+financial\s+and\s+other\s+information\b"),
)
_REFERENCE_GUIDE_NOTE_PATTERN = re.compile(
    r"(?i)\bnote\s+\d{1,2}[a-z]?(?:\.\d+)?\s+"
    r"(?:to\s+each\s+set\s+of\s+)?"
    r"(?:the\s+)?(?:consolidated\s+)?financial\s+statements?\b"
)
_REFERENCE_GUIDE_CODE_PATTERN = re.compile(
    r"(?i)\b(?:AFR|IAR|GRR)\s+\d{1,3}(?:\s*[—–-]\s*\d{1,3})?\b"
)
_REFERENCE_GUIDE_PAGE_RANGE_PATTERN = re.compile(
    rf"(?i)\((?:{_PAGE_LOCATOR_TOKEN_PATTERN})"
    rf"(?:\s*(?:and|,)\s*(?:{_PAGE_LOCATOR_TOKEN_PATTERN}))*\)"
)
_REFERENCE_GUIDE_ACTION_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"(?i)\bnot\s+applicable\b"),
    re.compile(r"(?i)\bnothing\s+to\s+disclose\b"),
    re.compile(r"(?i)\bsee\s+also\s+supplement\b"),
    re.compile(r"(?i)\bresponse\s+or\s+location\s+in\s+this\s+(?:filing|document)\b"),
)
_PARENT_DIRECTORY_CONTENT_LIMIT = 280000
_ANCHOR_TITLE_BACKTRACK_CHARS = 120
_ANCHOR_TITLE_LOOKAHEAD_CHARS = 240
_INLINE_REF_CONTEXT_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(
        r"(?:see|refer to|as discussed in|as described in|please see)\s+[\"“”'(\s-]*item\s+\d+[a-z]?\s*$",
        re.IGNORECASE,
    ),
    re.compile(r"item\s+\d+[a-z]?\.[^\.\n]{0,80}[—–-]\s*$", re.IGNORECASE),
    re.compile(r"item\s+$", re.IGNORECASE),
    # Detect "Note X" embedded in body cross-references (e.g. "See discussion in Note 11 ..."):
    # context ends with "word in " (non-newline space), rather than standalone heading line after newline.
    re.compile(r"\b\w+\s+in[^\S\n]+$", re.IGNORECASE),
)


@dataclass
class _VirtualSection:
    """Virtual section structure."""

    ref: str
    title: Optional[str]
    content: str
    preview: str
    table_refs: list[str]
    level: int = 1
    parent_ref: Optional[str] = None
    child_refs: list[str] = field(default_factory=list)
    start: int = 0
    end: int = 0


@dataclass(frozen=True)
class _StructuredSplitCandidate:
    """Structure candidate item for child section splitting."""

    title: str
    level: int
    anchor_text: str
    preview: str


class _VirtualSectionBaseProcessorProtocol(Protocol):
    """Minimum protocol required for the next-hop processor of the virtual section mixin."""

    def list_sections(self) -> list[SectionSummary]:
        """Return the underlying section summary list."""

        ...

    def read_section(self, ref: str) -> SectionContent:
        """Read underlying section content by ref."""

        ...

    def list_tables(self) -> list[TableSummary]:
        """Return the underlying table summary list."""

        ...

    def get_section_title(self, ref: str) -> Optional[str]:
        """Return the underlying section title."""

        ...

    def search(self, query: str, within_ref: Optional[str] = None) -> list[SearchHit]:
        """Execute the underlying section search."""

        ...


class _VirtualSectionTextProviderProtocol(Protocol):
    """Full-text provider protocol required for the virtual section mixin."""

    def get_full_text(self) -> str:
        """Return the document full text."""

        ...

    def get_full_text_with_table_markers(self) -> str:
        """Return the document full text with table placeholders."""

        ...


class _VirtualSectionProcessorMixin:
    """Reusable mixin that generates virtual sections from full-text splitting."""

    MODULE = "FINS.SEC_FORM_SECTION"

    _virtual_sections: list[_VirtualSection]
    _virtual_section_by_ref: dict[str, _VirtualSection]
    _table_ref_to_virtual_ref: dict[str, str]

    # When subclass sets this to True, search() automatically enables token OR fallback when exact match fails.
    # Suitable for short documents / non-standard terminology special forms (8-K/6-K/DEF 14A/SC 13D etc.).
    _ENABLE_TOKEN_FALLBACK_SEARCH: bool = False

    def _get_base_processor(self) -> _VirtualSectionBaseProcessorProtocol:
        """Return the mixin's next-hop processor protocol view in the MRO.

        the mixin's stable assembly precondition: concrete processors must inherit in
        ``VirtualSectionMixin -> BaseProcessor`` order,
        so the ``super()`` next hop has the standard section/table/search interfaces.

        Args:
            None.

        Returns:
            next-hop object satisfying the underlying processor protocol.

        Raises:
            RuntimeError: raised only when a later caller's underlying method call fails.
        """

        return cast(_VirtualSectionBaseProcessorProtocol, super())

    def _get_text_provider(self) -> _VirtualSectionTextProviderProtocol:
        """Return the current processor's full-text read protocol view.

        Args:
            None.

        Returns:
            current processor object satisfying the full-text read protocol.

        Raises:
            RuntimeError: raised only when a later caller's full-text call fails.
        """

        return cast(_VirtualSectionTextProviderProtocol, self)

    def _initialize_virtual_sections(self, *, min_sections: int) -> None:
        """Initialize virtual sections.

        prefer ``document.text()`` full text as the split base -- it preserves the document's original
        section order, avoiding marker-detection order
        disorder (a known bug where Item 1C is moved to the document end and the cursor skips past Items 2-15).

        when ``document.text()`` is unavailable, fall back to concatenating base-class section content.

        Args:
            min_sections: minimum section count; falls back to parent-class sections below this threshold.

        Returns:
            None.

        Raises:
            RuntimeError: raised when the build fails.
        """

        self._virtual_sections = []
        self._virtual_section_by_ref = {}
        self._table_ref_to_virtual_ref = {}
        # prefer document.text() (preserves the document's original order),
        # fall back to concatenating base-class sections (compatible with document.text() being unavailable).
        full_text = self._collect_document_text()
        if not full_text:
            full_text = self._collect_full_text_from_base()
        if not full_text:
            return
        # subclass generates markers first, then the split runs uniformly, keeping per-form behavior consistent.
        markers = self._build_markers(full_text)
        built_sections = _build_virtual_sections(full_text, markers)
        # when markers are insufficient, fall back to parent-class sections as first-level nodes, then try structured sub-splitting.
        # typical case: some 20-F documents lack canonical Item markers but still have clear subheadings in the body.
        if len(built_sections) < min_sections:
            built_sections = self._build_virtual_sections_from_base()
        if not built_sections:
            return
        self._virtual_sections = self._expand_virtual_sections_by_structure(built_sections)
        self._virtual_section_by_ref = {section.ref: section for section in self._virtual_sections}
        # assign underlying tables to virtual sections (must run after virtual sections are built)
        self._assign_tables_to_virtual_sections()
        self._postprocess_virtual_sections(full_text)

    def _postprocess_virtual_sections(self, full_text: str) -> None:
        """Optional post-processing on virtual sections built by the subclass.

        default implementation is a no-op. Specialized form processors may override this hook without changing
        marker skeleton intact, e.g.:
        - replace ToC-page title stubs with the real body;
        - expand ``incorporated by reference`` wrapper sentences into the referenced body within the same document.

        Args:
            full_text: full text used to build virtual sections.

        Returns:
            None.

        Raises:
            RuntimeError: raised when post-processing fails.
        """

        del full_text

    def _expand_virtual_sections_by_structure(
        self,
        sections: list[_VirtualSection],
    ) -> list[_VirtualSection]:
        """Expand virtual sections into a hierarchy tree from underlying structure info.

        Args:
            sections: first-level virtual section list.

        Returns:
            expanded virtual section list (parent/child nodes in document order).

        Raises:
            RuntimeError: raised when expansion fails.
        """

        candidates = self._collect_structured_split_candidates()
        candidates_by_level = _group_structured_candidates_by_level(candidates)

        expanded: list[_VirtualSection] = []
        for section in sections:
            expanded.extend(
                self._expand_section_tree(
                    section,
                    candidates=candidates,
                    candidates_by_level=candidates_by_level,
                )
            )
        return expanded

    def _collect_structured_split_candidates(self) -> list[_StructuredSplitCandidate]:
        """Collect structured-split candidates.

        candidates come from the underlying processor's section tree (`super().list_sections()`),
        does not depend on character thresholds, only on structural signals. This implementation avoids running
        full `read_section` calls, reducing initialization cost on large documents.

        Args:
            None.

        Returns:
            candidate list (in underlying section order).
        """

        try:
            base_sections = self._get_base_processor().list_sections()
        except Exception as exc:
            Log.warn(
                f"_collect_structured_split_candidates: row-base list_sections failed; returning empty list: {exc}",
                module=self.MODULE,
            )
            return []

        candidates: list[_StructuredSplitCandidate] = []
        for section in base_sections:
            title = _normalize_optional_string(section.get("title"))
            if title is None:
                continue
            try:
                level = max(1, int(section.get("level", 1)))
            except Exception:
                level = 1
            if level <= 1:
                continue
            preview = _normalize_optional_string(section.get("preview")) or ""
            anchor_text = self._build_structured_split_anchor(
                section_ref=section.get("ref"),
                title=title,
                preview=preview,
            )
            if anchor_text is None:
                continue
            candidates.append(
                _StructuredSplitCandidate(
                    title=title,
                    level=level,
                    anchor_text=anchor_text,
                    preview=preview,
                )
            )
        return candidates

    def _build_virtual_sections_from_base(self) -> list[_VirtualSection]:
        """Build first-level virtual sections from parent-class sections.

        this path is a degraded initialization for when marker splitting is insufficient, ensuring later
        fallback subheading split logic.

        Args:
            None.

        Returns:
            first-level virtual section list.

        Raises:
            RuntimeError: raised when the build fails.
        """

        try:
            base_sections = self._get_base_processor().list_sections()
        except Exception as exc:
            Log.warn(
                f"_build_virtual_sections_from_base: row-base list_sections failed; returning empty list: {exc}",
                module=self.MODULE,
            )
            return []

        virtual_sections: list[_VirtualSection] = []
        for index, base_section in enumerate(base_sections, start=1):
            ref = _normalize_optional_string(base_section.get("ref")) or _format_section_ref(index)
            title = _normalize_optional_string(base_section.get("title"))
            preview = _normalize_optional_string(base_section.get("preview")) or ""
            level_raw = base_section.get("level", 1)
            parent_ref = _normalize_optional_string(base_section.get("parent_ref"))
            try:
                level = max(1, int(level_raw))
            except Exception:
                level = 1
            try:
                payload = self._get_base_processor().read_section(ref)
            except Exception:
                payload = {}
            if not isinstance(payload, dict):
                payload = {}
            content = str(payload.get("content", "") or "").strip()
            table_refs_raw = payload.get("tables")
            table_refs = (
                [
                    str(item)
                    for item in table_refs_raw
                    if _normalize_optional_string(item) is not None
                ]
                if isinstance(table_refs_raw, list)
                else []
            )
            if not content:
                continue
            content = _trim_trailing_part_heading(content)
            content = _trim_trailing_page_locator(content, title)
            if not preview:
                preview = _normalize_whitespace(content)[:_PREVIEW_MAX_CHARS]
            virtual_sections.append(
                _VirtualSection(
                    ref=ref,
                    title=title,
                    content=content,
                    preview=preview,
                    table_refs=table_refs,
                    level=level,
                    parent_ref=parent_ref,
                    child_refs=[],
                    start=0,
                    end=len(content),
                )
            )
        return virtual_sections

    def _build_structured_split_anchor(
        self,
        *,
        section_ref: object,
        title: str,
        preview: str,
    ) -> Optional[str]:
        """Build the anchor text used to locate a child section.

        Args:
            section_ref: underlying section ref.
            title: underlying section title.
            preview: underlying section preview.

        Returns:
            anchor text; `None` when it cannot be built.
        """

        normalized_preview = _normalize_whitespace(preview)
        normalized_ref = _normalize_optional_string(section_ref)
        if normalized_ref is None:
            return None
        # prefer preview as the anchor to avoid the cost of the underlying read_section render.
        for candidate in (normalized_preview, title):
            if len(candidate) >= 16:
                return candidate[:160]
        return None

    def _expand_section_tree(
        self,
        section: _VirtualSection,
        *,
        candidates: list[_StructuredSplitCandidate],
        candidates_by_level: dict[int, list[tuple[int, _StructuredSplitCandidate]]],
    ) -> list[_VirtualSection]:
        """Recursively expand a single section into a tree.

        Args:
            section: section to expand.
            candidates: global structure candidates.
            candidates_by_level: candidates bucketed by heading level.

        Returns:
            expanded node list (parent first, then all descendants).

        Raises:
            RuntimeError: raised when expansion fails.
        """

        if section.level >= _MAX_VIRTUAL_SECTION_LEVEL:
            return [section]

        direct_children = _build_child_sections_from_candidates(
            parent_section=section,
            candidates=candidates,
            candidates_by_level=candidates_by_level,
        )
        if len(direct_children) < 2:
            return [section]

        section.child_refs = [child.ref for child in direct_children]
        section.table_refs.clear()
        if len(section.content) > _PARENT_DIRECTORY_CONTENT_LIMIT:
            section.content = _build_parent_directory_content(
                section=section, children=direct_children
            )
        section.preview = _normalize_whitespace(section.content)[:_PREVIEW_MAX_CHARS]

        expanded: list[_VirtualSection] = [section]
        for child in direct_children:
            expanded.extend(
                self._expand_section_tree(
                    child,
                    candidates=candidates,
                    candidates_by_level=candidates_by_level,
                )
            )
        return expanded

    def _collect_document_text(self) -> str:
        """Get the document's full text via the ``get_full_text()`` protocol method.

        ``get_full_text()`` is standard capability of ``DocumentProcessor`` protocol,
        with implementations provided by SecProcessor and BSProcessor:
        - SecProcessor: delegates to edgartools ``document.text()``;
        - BSProcessor: uses BeautifulSoup ``root.get_text()``.

        both keep table text, keeping virtual-section marker detection accurate.

        Args:
            None.

        Returns:
            full document text string; empty string when unavailable.

        Raises:
            RuntimeError: raised when the read fails.
        """

        try:
            return self._get_text_provider().get_full_text()
        except Exception:
            return ""

    def _collect_full_text_from_base(self) -> str:
        """Read the concatenated full text from parent-class sections.

        Args:
            None.

        Returns:
            concatenated full-text string.

        Raises:
            RuntimeError: raised when the read fails.
        """

        base_sections = self._get_base_processor().list_sections()
        parts: list[str] = []
        for section in base_sections:
            ref = _normalize_optional_string(section.get("ref"))
            if ref is None:
                continue
            payload = self._get_base_processor().read_section(ref)
            content = str(payload.get("content", "") or "").strip()
            if content:
                parts.append(content)
        return "\n".join(parts).strip()

    def _collect_marked_text(self) -> str:
        """Get the full text with ``[[t_XXXX]]`` placeholders.

        calling the ``DocumentProcessor`` protocol-declared
        ``get_full_text_with_table_markers()`` method.
        processors without this capability return an empty string (protocol convention); the upper layer degrades safely.

        Args:
            None.

        Returns:
            full text with table placeholders; empty string when the processor does not support it.
        """

        try:
            return self._get_text_provider().get_full_text_with_table_markers()
        except Exception:
            return ""

    def _collect_available_table_refs_from_base(self) -> Optional[set[str]]:
        """Read the set of table references available to the underlying processor.

        this set filters out tables that "exist only in the marker text but not in the underlying
        ``list_tables()``, avoiding dangling ``table_ref`` in ``read_section.tables``
        dangling ``table_ref`` occurrences.

        Returns:
            set of usable table references; ``None`` when it cannot be obtained safely (meaning: no filtering).

        Raises:
            None. Internal exceptions are swallowed and degrade to ``None``.
        """

        try:
            base_tables = self._get_base_processor().list_tables()
        except Exception:
            return None
        refs: set[str] = set()
        for table in base_tables:
            ref = _normalize_optional_string(table.get("table_ref"))
            if ref is not None:
                refs.add(ref)
        return refs

    def _assign_tables_to_virtual_sections(self) -> None:
        """Assign underlying tables to virtual sections.

        by re-detecting marker boundaries in the full text with ``[[t_XXXX]]`` placeholders,
        determine which virtual-section range each placeholder falls into, building a bidirectional mapping:

        1. update each virtual section's ``table_refs`` (fixing the ``read_section.tables``
           empty problem -- direction A);
        2. build the ``_table_ref_to_virtual_ref`` reverse mapping for ``list_tables()``
           rewrites ``section_ref`` (fixing the dangling-reference problem -- direction B).

        the assignment strategy has two phases:

        - **Phase 1 (title matching)**: rerun ``_build_markers`` on the marker text
          detects marker boundaries, matches virtual sections by exact title, and assigns the
          assigns ``[[t_XXXX]]`` to the matching virtual section.
        - **Phase 2 (position fallback)**: ``[[t_XXXX]]`` placeholders not assigned in Phase 1
          (usually because the marker text produced a different marker title than the original -- e.g. a Proposal
          numbers match differently with and without table content), falling back to the nearest
          matched virtual-section boundaries.

        the position fallback ensures that even when ``_build_markers`` produces different titles on the marker text
        (TOC detection thresholds and rescans are affected by the displacement
        effect), all tables can still map to virtual sections, fully eliminating dangling references.

        degradation policy: when the underlying processor provides no marked full text, or the markers detected in the marked text
        marker title cannot match a virtual-section title, skip the assignment (preserving existing behavior).

        Args:
            None.

        Returns:
            None.
        """

        if not self._virtual_sections:
            return

        marked_text = self._collect_marked_text()
        if not marked_text:
            return

        for section in self._virtual_sections:
            section.table_refs.clear()
        self._table_ref_to_virtual_ref.clear()
        available_table_refs = self._collect_available_table_refs_from_base()

        top_sections = [section for section in self._virtual_sections if section.parent_ref is None]
        top_section_by_ref = {section.ref: section for section in top_sections}
        if not top_sections:
            return

        # re-detect markers in the marker text and match virtual sections by title
        marked_markers = self._build_markers(marked_text)
        title_ranges = _build_marker_title_ranges(marked_text, marked_markers)
        if not title_ranges:
            return

        # Cover Page range: all text before the first marker
        deduped_marked = _dedupe_markers(marked_markers)
        cover_end = deduped_marked[0][0] if deduped_marked else len(marked_text)

        # ----- Phase 1: exact title matching -----
        for vs in top_sections:
            if vs.title == "Cover Page":
                segment = marked_text[:cover_end]
            elif vs.title in title_ranges:
                start, end = title_ranges[vs.title]
                segment = marked_text[start:end]
            else:
                # title not matched (Proposal numbering differences, SIGNATURE not detected, etc.); skip
                continue
            tbl_refs = _filter_table_refs_by_availability(
                _extract_table_refs(segment),
                available_table_refs,
            )
            # frozen dataclass, but list is a mutable object and can be updated in place
            vs.table_refs.clear()
            vs.table_refs.extend(tbl_refs)
            for tbl_ref in tbl_refs:
                self._table_ref_to_virtual_ref[tbl_ref] = vs.ref

        # ----- Phase 2: position fallback -- assign tables Phase 1 did not cover -----
        # build the ordered boundary list of matched virtual sections in the marker text
        _assign_unmapped_tables_by_position(
            marked_text=marked_text,
            title_ranges=title_ranges,
            cover_end=cover_end,
            virtual_sections=top_sections,
            virtual_section_by_ref=top_section_by_ref,
            table_ref_to_virtual_ref=self._table_ref_to_virtual_ref,
            available_table_refs=available_table_refs,
        )

        # if child sections exist, reassign by the "deepest hit" rule
        if any(section.child_refs for section in top_sections):
            _remap_tables_to_deepest_virtual_sections(
                marked_text=marked_text,
                title_ranges=title_ranges,
                cover_end=cover_end,
                virtual_sections=top_sections,
                virtual_section_by_ref=self._virtual_section_by_ref,
                table_ref_to_virtual_ref=self._table_ref_to_virtual_ref,
            )

    def list_tables(self) -> list[TableSummary]:
        """Read the table list, remapping ``section_ref`` to virtual sections.

        when virtual sections are disabled, the underlying table list is passed through. When enabled:

        1. when ``table_ref`` already hits ``_table_ref_to_virtual_ref``, use that mapping directly;
        2. otherwise, when the underlying ``section_ref`` is already a virtual-section ref, keep it;
        3. otherwise fall back to the "last confirmed virtual-section ref" (initially the first virtual section),
           ensures ``section_ref`` never dangles outside the virtual-section set.

        Args:
            None.

        Returns:
            table summary list.

        Raises:
            RuntimeError: raised when the read fails.
        """

        if not self._virtual_sections:
            return self._get_base_processor().list_tables()
        tables = self._get_base_processor().list_tables()
        if not tables:
            return tables

        valid_virtual_refs = {section.ref for section in self._virtual_sections}
        fallback_ref = self._virtual_sections[0].ref if self._virtual_sections else None
        last_known_ref = fallback_ref

        for table in tables:
            tbl_ref = _normalize_optional_string(table.get("table_ref"))
            if tbl_ref and tbl_ref in self._table_ref_to_virtual_ref:
                mapped_ref = self._table_ref_to_virtual_ref[tbl_ref]
                table["section_ref"] = mapped_ref
                last_known_ref = mapped_ref
                continue

            current_ref = _normalize_optional_string(table.get("section_ref"))
            if current_ref is not None and current_ref in valid_virtual_refs:
                last_known_ref = current_ref
                continue

            if last_known_ref is not None:
                table["section_ref"] = last_known_ref
        return tables

    def list_sections(self) -> list[SectionSummary]:
        """Read the section list.

        Args:
            None.

        Returns:
            section summary list.

        Raises:
            RuntimeError: raised when the read fails.
        """

        if not self._virtual_sections:
            return self._get_base_processor().list_sections()
        return [
            {
                "ref": section.ref,
                "title": section.title,
                "level": section.level,
                "parent_ref": section.parent_ref,
                "preview": section.preview,
            }
            for section in self._virtual_sections
        ]

    def get_section_title(self, ref: str) -> Optional[str]:
        """Get a section title by section ref.

        virtual sections consult ``_virtual_section_by_ref`` first, falling back to the parent class when absent.

        Args:
            ref: section reference.

        Returns:
            section title string; None when the ref does not exist.
        """
        if not self._virtual_sections:
            return self._get_base_processor().get_section_title(ref)
        section = self._virtual_section_by_ref.get(ref)
        return section.title if section else None

    def read_section(self, ref: str) -> SectionContent:
        """Read section content by ref.

        Args:
            ref: section reference.

        Returns:
            section content.

        Raises:
            KeyError: raised when the section does not exist.
            RuntimeError: raised when the read fails.
        """

        if not self._virtual_sections:
            return self._get_base_processor().read_section(ref)
        section = self._virtual_section_by_ref.get(ref)
        if section is None:
            raise KeyError(f"section does not exist: {ref}")
        children_payload: list[SectionSummary] = [
            {
                "ref": child.ref,
                "title": child.title,
                "level": child.level,
                "parent_ref": section.ref,
                "preview": child.preview,
            }
            for child_ref in section.child_refs
            for child in [self._virtual_section_by_ref.get(child_ref)]
            if child is not None
        ]
        return {
            "ref": section.ref,
            "title": section.title,
            "content": section.content,
            "tables": list(section.table_refs),
            "word_count": len(section.content.split()),
            "children": children_payload,
            "contains_full_text": len(self._virtual_sections) == 1 and not section.child_refs,
        }

    def search(self, query: str, within_ref: Optional[str] = None) -> list[SearchHit]:
        """Search within a document.

        two-level search strategy:
        1. exact phrase regex matching (standard behavior);
        2. when ``_ENABLE_TOKEN_FALLBACK_SEARCH`` is True and exact matching yields nothing,
           automatically enables the token OR fallback to improve search recall on short documents.

        Args:
            query: search term.
            within_ref: optional section scope.

        Returns:
            hit list.

        Raises:
            RuntimeError: raised when the search fails.
        """

        if not self._virtual_sections:
            return self._get_base_processor().search(query=query, within_ref=within_ref)
        normalized_query = str(query or "").strip()
        if not normalized_query:
            return []
        if within_ref is not None and within_ref not in self._virtual_section_by_ref:
            return []

        target_sections = (
            [self._virtual_section_by_ref[within_ref]]
            if within_ref is not None
            else self._virtual_sections
        )
        hits_raw: list[SearchHit] = []
        section_content_map: dict[str, str] = {}
        # precompile the regex outside the loop to avoid repeated re.search(re.escape(...)) compilation/dict-lookup cost
        query_pattern = re.compile(re.escape(normalized_query), flags=re.IGNORECASE)
        for section in target_sections:
            title_text = section.title or ""
            title_hit = bool(title_text) and query_pattern.search(title_text) is not None
            content_hit = query_pattern.search(section.content) is not None
            if not title_hit and not content_hit:
                continue
            # if the title hits but content does not, prepend the title to the search text so the snippet can locate the matched term.
            searchable_text = (
                (title_text + "\n" + section.content).strip()
                if title_hit and not content_hit
                else section.content
            )
            # enrich_hits_by_section needs full section text to generate context snippets.
            section_content_map[section.ref] = searchable_text
            hits_raw.append(
                {
                    "section_ref": section.ref,
                    "section_title": section.title,
                    "snippet": normalized_query,
                }
            )
        exact_hits = enrich_hits_by_section(
            hits_raw=hits_raw,
            section_content_map=section_content_map,
            query=normalized_query,
        )
        if exact_hits or not self._ENABLE_TOKEN_FALLBACK_SEARCH:
            return exact_hits
        # token OR fallback: split the query into words, each matched independently
        return _token_fallback_search(
            query=normalized_query,
            virtual_sections=self._virtual_sections,
            virtual_section_by_ref=self._virtual_section_by_ref,
            within_ref=within_ref,
        )

    def _build_markers(self, full_text: str) -> list[tuple[int, Optional[str]]]:
        """Build section boundary markers.

        Args:
            full_text: full document text.

        Returns:
            `(start_index, title)` list.

        Raises:
            RuntimeError: raised when the build fails.
        """

        raise NotImplementedError("subclasses must implement _build_markers")


def _find_marker_after(
    pattern: re.Pattern[str],
    full_text: str,
    start_at: int,
    title: str,
) -> Optional[tuple[int, Optional[str]]]:
    """Find the first boundary marker after the given position.

    Args:
        pattern: regex pattern.
        full_text: full document text.
        start_at: start position.
        title: marker title.

    Returns:
        `(start_index, title)` or `None`.

    Raises:
        RuntimeError: Raised when search fails.
    """

    match = pattern.search(full_text, pos=max(0, start_at))
    if match is None:
        return None
    return int(match.start()), title


def _find_lettered_marker_after(
    pattern: re.Pattern[str],
    full_text: str,
    start_at: int,
    title_prefix: str,
) -> Optional[tuple[int, Optional[str]]]:
    """Find boundary markers with a letter suffix after the given position.

    e.g. `Annex A`, `Appendix B`.

    Args:
        pattern: regex pattern (first capture group should be the letter suffix).
        full_text: full document text.
        start_at: start position.
        title_prefix: title prefix.

    Returns:
        `(start_index, title)` or `None`.

    Raises:
        RuntimeError: Raised when search fails.
    """

    match = pattern.search(full_text, pos=max(0, start_at))
    if match is None:
        return None
    suffix = _normalize_optional_string(match.group(1))
    if suffix is None:
        return int(match.start()), title_prefix
    return int(match.start()), f"{title_prefix} {suffix.upper()}"


def _safe_virtual_document_text(processor: SecProcessor) -> str:
    """Safely read document full text usable for specialized splitting.

    Args:
        processor: specialized processor instance.

    Returns:
        normalized full text; empty string when the read fails.

    Raises:
        RuntimeError: Raised when read fails.
    """

    document_obj = getattr(processor, "_document", None)
    if document_obj is None:
        return ""
    try:
        text = document_obj.text()
    except Exception:
        return ""
    return _normalize_whitespace(str(text or ""))


def _is_table_placeholder_dominant_text(
    content: str,
    *,
    min_placeholders: int = 3,
    max_non_placeholder_chars: int = 400,
) -> bool:
    """Judge whether text is dominated by table placeholders.

    Args:
        content: text to evaluate.
        min_placeholders: minimum placeholder count to be considered placeholder-dominated.
        max_non_placeholder_chars: maximum body character threshold after placeholder removal.

    Returns:
        `True` when the text is almost only placeholders, otherwise `False`.

    Raises:
        RuntimeError: Raised when determination fails.
    """

    normalized = _normalize_whitespace(content)
    if not normalized:
        return False
    placeholders = _TABLE_REF_PATTERN.findall(normalized)
    if len(placeholders) < min_placeholders:
        return False
    non_placeholder = _normalize_whitespace(_TABLE_REF_PATTERN.sub(" ", normalized))
    return len(non_placeholder) <= max_non_placeholder_chars


# Adaptive Cover Page truncation pattern: matches "Table of Contents" and variants
_TOC_BOUNDARY_PATTERN = re.compile(
    r"\btable\s+of\s+contents\b",
    re.IGNORECASE,
)

# Cover Page maximum retained characters cap (adaptive, used when no TOC marker)
_COVER_PAGE_MAX_CHARS = 5000


def _trim_cover_page_content(prefix_content: str) -> str:
    """Adaptively tighten Cover Page content boundary.

    Two-layer strategy:

    1. If "Table of Contents" marker exists in prefix text, truncate at that marker
       (content after the TOC belongs to body sections, not the cover).
    2. If no TOC marker, limit maximum length to ``_COVER_PAGE_MAX_CHARS``
       to keep the Cover Page from including too much body text.

    Args:
        prefix_content: raw prefix text (content before the first marker).

    Returns:
        tightened Cover Page content.

    Raises:
        RuntimeError: Raised when processing fails.
    """
    if not prefix_content:
        return prefix_content

    # Strategy 1: Truncate at TOC marker
    toc_match = _TOC_BOUNDARY_PATTERN.search(prefix_content)
    if toc_match is not None:
        # contains the full "Table of Contents" text; truncate at its end
        return prefix_content[: toc_match.end()].strip()

    # Strategy 2: Limit max length when no TOC marker
    if len(prefix_content) > _COVER_PAGE_MAX_CHARS:
        return prefix_content[:_COVER_PAGE_MAX_CHARS].strip()

    return prefix_content


def _strip_leading_title(content: str, title: Optional[str]) -> str:
    """Adaptively strip leading title text in content that duplicates title.

    Virtual section content is sliced at marker start positions, so body starts usually contain
    heading text (e.g. ``Item 7. Management's Discussion``).
    Since ``title`` field already carries this, repeating it in content is unnecessary.

    Adaptive matching strategy:

    1. Try whole-prefix matching (e.g. title="SIGNATURE" -> content starts with "SIGNATURE").
    2. For compound titles (e.g. ``"Part II - Item 7"``), try matching the second segment
       (e.g. content starting with ``"Item 7."``).

    Args:
        content: raw section content.
        title: section title.

    Returns:
        content text with the leading title removed; returned unchanged when no match.

    Raises:
        RuntimeError: Raised when processing fails.
    """
    if not content or not title:
        return content

    content_lower = content.lower()
    title_lower = title.strip().lower()

    # Strategy 1: Direct prefix match
    if content_lower.startswith(title_lower):
        remainder = content[len(title) :].lstrip(" .:;-\n\r\t")
        return remainder if remainder else content

    # Strategy 2: Compound title (e.g. "Part II - Item 7"), try matching second half
    if " - " in title:
        item_part = title.split(" - ", 1)[1].strip()
        item_part_lower = item_part.lower()
        if content_lower.startswith(item_part_lower):
            remainder = content[len(item_part) :].lstrip(" .:;-\n\r\t")
            return remainder if remainder else content

    return content


def _trim_trailing_part_heading(content: str) -> str:
    """Trim trailing Part heading text at section tail.

    When SEC documents are split by Item headings, Part headings (such as "PART II",
    "PART III -- OTHER INFORMATION") may be trapped between Item N and Item N+1,
    which do not belong to Item N substantive content.

    Only regex search within trailing ``_TRAILING_PART_TRIM_WINDOW`` characters,
    avoiding trimming "Part" references in body.

    Per SEC Regulation S-K §229.10(c): Part headings are statutory formatting structure,
    trimming does not compromise information integrity.

    Args:
        content: section content text.

    Returns:
        trimmed content; returned unchanged when nothing matches.

    Raises:
        RuntimeError: Raised when processing fails.
    """
    if not content:
        return content

    # Only search within tail window (search whole text if shorter than window)
    window = min(_TRAILING_PART_TRIM_WINDOW, len(content))
    tail = content[-window:]
    match = _TRAILING_PART_HEADING_RE.search(tail)
    if match is None:
        return content

    # Compute trim position in raw content
    trim_start_in_tail = match.start()
    trim_start = len(content) - window + trim_start_in_tail
    trimmed = content[:trim_start].rstrip()
    return trimmed if trimmed else content


def _trim_trailing_page_locator(content: str, title: Optional[str]) -> str:
    """Trim trailing page locator noise at end of short Item sections.

    Some iXBRL/HTML extractions flatten ToC lines into body text, forming:
    ``Financial Statements F-1``, ``See ... 163`` trailing page locators.
    These trigger false ToC contamination without providing substantive semantic info.

    To avoid trimming real numbers, this rule only activates under "short Item section +
    semantic keyword hit", stripping only the trailing page locator token sequence.

    Args:
        content: section content text.
        title: section title.

    Returns:
        trimmed section text; returned unchanged when conditions are unmet.

    Raises:
        RuntimeError: Raised when processing fails.
    """

    if not content or not title:
        return content
    normalized_title = _normalize_optional_string(title) or ""
    if "item" not in normalized_title.lower():
        return content

    normalized_content = _normalize_whitespace(content)
    if not normalized_content:
        return content
    if len(normalized_content) > _SHORT_ITEM_SECTION_MAX_CHARS:
        return content
    if len(normalized_content.split()) > _SHORT_ITEM_SECTION_MAX_WORDS:
        return content

    lowered_content = normalized_content.lower()
    if not any(keyword in lowered_content for keyword in _PAGE_LOCATOR_CONTEXT_KEYWORDS):
        return content

    match = _PAGE_LOCATOR_TAIL_RE.search(normalized_content)
    if match is None:
        return content
    trimmed = normalized_content[: match.start()].rstrip(" .:;,-")
    if len(trimmed) < 8:
        return content
    return trimmed


def _build_virtual_sections(
    full_text: str,
    markers: list[tuple[int, Optional[str]]],
) -> list[_VirtualSection]:
    """Split virtual sections by markers.

    Args:
        full_text: full document text.
        markers: boundary markers.

    Returns:
        virtual-section list.

    Raises:
        RuntimeError: Raised when splitting fails.
    """

    if not full_text:
        return []
    normalized_markers = _dedupe_markers(markers)
    if not normalized_markers:
        return []

    sections: list[_VirtualSection] = []
    first_start = normalized_markers[0][0]
    if first_start > 0:
        prefix_content = full_text[:first_start].strip()
        # Step 9: adaptively tighten the Cover Page boundary
        # if the prefix text contains Table of Contents, truncate at that position
        # (text after the TOC actually belongs to the body, not the cover)
        prefix_content = _trim_cover_page_content(prefix_content)
        if _has_meaningful_text(prefix_content):
            # if there is valid body text before the first marker, keep it as a cover segment to avoid losing information.
            sections.append(
                _VirtualSection(
                    ref=_format_section_ref(1),
                    title="Cover Page",
                    content=prefix_content,
                    preview=_normalize_whitespace(prefix_content)[:_PREVIEW_MAX_CHARS],
                    table_refs=_extract_table_refs(prefix_content),
                    start=0,
                    end=first_start,
                )
            )

    next_index = len(sections) + 1
    for marker_index, (start, title) in enumerate(normalized_markers):
        end = (
            normalized_markers[marker_index + 1][0]
            if marker_index + 1 < len(normalized_markers)
            else len(full_text)
        )
        content = full_text[start:end].strip()
        allow_short = _allow_short_section(title)
        # trailing sections (e.g. SIGNATURE) allow shorter text; other sections keep a higher information-density threshold.
        min_len = 8 if allow_short else 24
        # first check whether the raw content is meaningful (including title text), then strip the title
        if not _has_meaningful_text(content, min_len=min_len):
            continue
        # Step 11: strip leading title text from content to avoid title/content redundancy
        content = _strip_leading_title(content, title)
        # Step 12: trim residual Part headings from the content tail (e.g. "PART II", "PART III")
        # these legal-structure markers are not substantive content of this section
        content = _trim_trailing_part_heading(content)
        # Step 13: trim page-number locators at the tail of short Item sections (flattened-ToC noise).
        content = _trim_trailing_page_locator(content, title)
        sections.append(
            _VirtualSection(
                ref=_format_section_ref(next_index),
                title=title,
                content=content,
                preview=_normalize_whitespace(content)[:_PREVIEW_MAX_CHARS],
                table_refs=_extract_table_refs(content),
                start=start,
                end=end,
            )
        )
        next_index += 1
    return sections


def _build_child_sections_from_candidates(
    *,
    parent_section: _VirtualSection,
    candidates: list[_StructuredSplitCandidate],
    candidates_by_level: Optional[dict[int, list[tuple[int, _StructuredSplitCandidate]]]] = None,
) -> list[_VirtualSection]:
    """Build direct child sections from structure candidates.

    Args:
        parent_section: parent section.
        candidates: global structure candidates.
        candidates_by_level: optional candidate bucketing to reduce full scans.

    Returns:
        direct child-section list; empty list when splitting is unreliable.

    Raises:
        RuntimeError: Raised when construction fails.
    """

    if parent_section.title == "Cover Page":
        return []
    parent_text = str(parent_section.content or "")
    if not _has_meaningful_text(parent_text, min_len=_MIN_CHILD_SECTION_CHARS * 2):
        return []
    if _looks_like_reference_guide_content(
        title=parent_section.title,
        content=parent_text,
    ):
        return []

    required_level = parent_section.level + 1
    normalized_parent = parent_text.lower()
    allow_note_headings = _parent_context_allows_note_headings(
        parent_title=parent_section.title,
        content=parent_text,
    )
    matches: list[tuple[int, _StructuredSplitCandidate]] = []
    cursor = 0
    for candidate in _iter_structured_candidates(
        required_level=required_level,
        candidates=candidates,
        candidates_by_level=candidates_by_level,
    ):
        if (
            not allow_note_headings
            and re.match(r"^(?:Note|NOTES?)\s+", candidate.title) is not None
        ):
            continue
        anchor_position = _find_anchor_position_in_text(
            text=parent_text,
            normalized_text=normalized_parent,
            anchor_text=candidate.anchor_text,
            title=candidate.title,
            start=cursor,
        )
        if anchor_position is None:
            continue
        matches.append((anchor_position, candidate))
        cursor = anchor_position + max(1, len(candidate.title))

    marker_pairs = [(start, candidate.title) for start, candidate in matches]
    sec_subitem_marker_pairs = _extract_fallback_heading_markers(
        parent_text,
        parent_title=parent_section.title,
        sec_subitems_only=True,
    )
    fallback_marker_pairs = sec_subitem_marker_pairs

    structured_children = (
        _build_child_sections_from_markers(
            parent_section=parent_section,
            markers=marker_pairs,
        )
        if len(marker_pairs) >= 2
        else []
    )
    fallback_children = (
        _build_child_sections_from_markers(
            parent_section=parent_section,
            markers=fallback_marker_pairs,
        )
        if len(fallback_marker_pairs) >= 2
        else []
    )
    if len(fallback_children) < 2:
        fallback_marker_pairs = _extract_fallback_heading_markers(
            parent_text,
            parent_title=parent_section.title,
            sec_subitems_only=False,
        )
        fallback_children = (
            _build_child_sections_from_markers(
                parent_section=parent_section,
                markers=fallback_marker_pairs,
            )
            if len(fallback_marker_pairs) >= 2
            else []
        )
    return _select_preferred_child_sections(
        structured_children=structured_children,
        fallback_children=fallback_children,
    )


def _build_child_sections_from_markers(
    *,
    parent_section: _VirtualSection,
    markers: list[tuple[int, str]],
) -> list[_VirtualSection]:
    """Build child sections from subheading markers."""

    sorted_markers = sorted(markers, key=lambda item: item[0])
    children: list[_VirtualSection] = []
    for index, (start, title) in enumerate(sorted_markers, start=1):
        end = (
            sorted_markers[index][0] if index < len(sorted_markers) else len(parent_section.content)
        )
        if end <= start:
            continue
        content = parent_section.content[start:end].strip()
        content = _strip_leading_title(content, title)
        content = _trim_trailing_part_heading(content)
        allow_short = _allow_short_section(title)
        min_len = 8 if allow_short else _MIN_CHILD_SECTION_CHARS
        if not _has_meaningful_text(content, min_len=min_len):
            continue
        child_ref = _format_child_section_ref(parent_ref=parent_section.ref, index=index)
        child_preview = _normalize_whitespace(content)[:_PREVIEW_MAX_CHARS]
        children.append(
            _VirtualSection(
                ref=child_ref,
                title=title,
                content=content,
                preview=child_preview,
                table_refs=[],
                level=parent_section.level + 1,
                parent_ref=parent_section.ref,
                child_refs=[],
                start=parent_section.start + start,
                end=parent_section.start + end,
            )
        )
    return children if len(children) >= 2 else []


def _select_preferred_child_sections(
    *,
    structured_children: list[_VirtualSection],
    fallback_children: list[_VirtualSection],
) -> list[_VirtualSection]:
    """Choose the better result between structure-candidate splitting and fallback splitting.

    Args:
        structured_children: child sections generated from underlying structure candidates.
        fallback_children: child sections generated from body fallback headings.

    Returns:
        better child-section list; empty list when neither is available.

    Raises:
        RuntimeError: Raised when selection fails.
    """

    if not structured_children:
        return fallback_children
    if not fallback_children:
        return structured_children

    def _rank(children: list[_VirtualSection]) -> tuple[int, int, int]:
        max_child_len = max(len(str(child.content or "")) for child in children)
        total_len = sum(len(str(child.content or "")) for child in children)
        return (-max_child_len, len(children), total_len)

    structured_rank = _rank(structured_children)
    fallback_rank = _rank(fallback_children)
    if fallback_rank > structured_rank:
        return fallback_children
    return structured_children


def _find_anchor_position_in_text(
    *,
    text: str,
    normalized_text: str,
    anchor_text: str,
    title: str,
    start: int,
) -> Optional[int]:
    """Locate a section anchor position in text.

    Args:
        text: raw text.
        normalized_text: lowercased text cache.
        anchor_text: preferred anchor text.
        title: section title (used for fallback matching).
        start: search start.

    Returns:
        hit start position; `None` on a miss.

    Raises:
        RuntimeError: Raised when localization fails.
    """

    lowered_anchor = anchor_text.lower()
    index = normalized_text.find(lowered_anchor, max(0, start))
    if index >= 0:
        if _is_anchor_fast_match_reliable(
            text=text,
            start=index,
            anchor_text=anchor_text,
        ):
            return index
        title_start = _find_title_position_with_boundaries(
            text=text,
            title=title,
            start=max(0, index - _ANCHOR_TITLE_BACKTRACK_CHARS),
            end=index + _ANCHOR_TITLE_LOOKAHEAD_CHARS,
        )
        if title_start is not None:
            return title_start
        return index
    return _find_title_position_with_boundaries(text=text, title=title, start=start)


def _group_structured_candidates_by_level(
    candidates: list[_StructuredSplitCandidate],
) -> dict[int, list[tuple[int, _StructuredSplitCandidate]]]:
    """Bucket structure candidates by section level.

    Args:
        candidates: global structure candidates (original order preserved).

    Returns:
        `level -> candidates` mapping, order within each bucket preserved.

    Raises:
        RuntimeError: Raised when bucketing fails.
    """

    buckets: dict[int, list[tuple[int, _StructuredSplitCandidate]]] = {}
    for index, candidate in enumerate(candidates):
        buckets.setdefault(candidate.level, []).append((index, candidate))
    return buckets


def _iter_structured_candidates(
    *,
    required_level: int,
    candidates: list[_StructuredSplitCandidate],
    candidates_by_level: Optional[dict[int, list[tuple[int, _StructuredSplitCandidate]]]],
) -> list[_StructuredSplitCandidate]:
    """Return candidates eligible for matching per the parent section's requirements.

    Prefers ``candidates_by_level``, only traversing `required_level` and deeper,
    avoiding full-scan of global candidates on every child section split.

    Args:
        required_level: minimum level of the target child section.
        candidates: full candidate list (fallback path).
        candidates_by_level: candidate bucket mapping.

    Returns:
        candidate list participating in matching (original order preserved).

    Raises:
        RuntimeError: Raised when candidate list construction fails.
    """

    if not candidates_by_level:
        return [candidate for candidate in candidates if candidate.level >= required_level]
    merged: list[tuple[int, _StructuredSplitCandidate]] = []
    for level in sorted(candidates_by_level):
        if level < required_level:
            continue
        merged.extend(candidates_by_level[level])
    merged.sort(key=lambda item: item[0])
    return [candidate for _, candidate in merged]


def _is_anchor_fast_match_reliable(
    *,
    text: str,
    start: int,
    anchor_text: str,
) -> bool:
    """Judge whether an anchor-text quick hit can be adopted directly.

    Args:
        text: raw text.
        start: start position of `anchor_text` in the text.
        anchor_text: anchor text used for positioning.

    Returns:
        `True` when the anchor text is on a word boundary, otherwise `False`.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    if start < 0:
        return False
    anchor_len = len(anchor_text)
    if anchor_len <= 0:
        return False
    end = start + anchor_len
    if end > len(text):
        return False
    if start > 0 and not _is_token_boundary_char(text[start - 1]):
        return False
    if end < len(text) and not _is_token_boundary_char(text[end]):
        return False
    return True


def _is_token_boundary_char(value: str) -> bool:
    """Judge whether a character can be considered a word boundary.

    Args:
        value: single-character string.

    Returns:
        `True` on a word boundary, otherwise `False`.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    if not value:
        return True
    return not (value.isalnum() or value == "_")


def _find_title_position_with_boundaries(
    *,
    text: str,
    title: str,
    start: int,
    end: Optional[int] = None,
) -> Optional[int]:
    """Find a heading position with word-boundary constraints.

    Args:
        text: raw text.
        title: title text.
        start: start position.
        end: optional end position (exclusive).

    Returns:
        hit start position; `None` on a miss.
    """

    normalized_title = _normalize_optional_string(title)
    if normalized_title is None:
        return None
    pattern = _compile_title_boundary_pattern(normalized_title)
    search_end = len(text) if end is None else min(len(text), max(0, end))
    match = pattern.search(text, pos=max(0, start), endpos=search_end)
    if match is None:
        return None
    return int(match.start())


@lru_cache(maxsize=2048)
def _compile_title_boundary_pattern(normalized_title: str) -> re.Pattern[str]:
    """Compile and cache heading boundary matching regex.

    Args:
        normalized_title: normalized title text.

    Returns:
        heading boundary matching regex object.

    Raises:
        re.error: raised when regex compilation fails.
    """

    return re.compile(rf"(?<!\w){re.escape(normalized_title)}(?!\w)", flags=re.IGNORECASE)


def _extract_fallback_heading_markers(
    content: str,
    *,
    parent_title: Optional[str] = None,
    sec_subitems_only: bool = False,
) -> list[tuple[int, str]]:
    """Extract heading markers from the parent section body as a fallback.

    Fallback strategy operates in two paths:
    1. Line-level heading matching (fits text preserving newlines);
    2. Single-line body matching (fits SecProcessor large sections flattened to single line).

    Args:
        content: parent section body.
        sec_subitems_only: whether to return only SEC statutory subitem titles.

    Returns:
        `(start, title)` list (ascending by position, deduplicated with min distance).

    Raises:
        RuntimeError: Raised when extraction fails.
    """

    if not content:
        return []
    if _looks_like_reference_guide_content(title=parent_title, content=content):
        return []
    markers: list[tuple[int, str]] = []
    sec_subitem_markers = _extract_sec_subitem_heading_markers(content)
    markers.extend(sec_subitem_markers)
    if not sec_subitems_only and len(sec_subitem_markers) < 2:
        markers.extend(_extract_line_based_heading_markers(content))
        markers.extend(
            _extract_title_case_line_heading_markers(
                content,
                parent_title=parent_title,
            )
        )
        markers.extend(_extract_inline_heading_markers(content))
    if not markers:
        return []
    if parent_title is not None:
        markers = [
            (pos, title)
            for pos, title in markers
            if not _is_redundant_title_case_heading(
                title=title,
                parent_title=parent_title,
                start=pos,
            )
        ]
    if not _parent_context_allows_note_headings(
        parent_title=parent_title,
        content=content,
    ):
        markers = [
            (pos, title)
            for pos, title in markers
            if re.match(r"^(?:Note|NOTES?)\s+", title) is None
        ]
    if not markers:
        return []

    markers.sort(key=lambda item: item[0])
    deduped: list[tuple[int, str]] = []
    last_pos = -_CHILD_HEADING_MIN_DISTANCE
    for pos, title in markers:
        if pos - last_pos < _CHILD_HEADING_MIN_DISTANCE:
            continue
        deduped.append((pos, title))
        last_pos = pos
    return deduped


def _extract_sec_subitem_heading_markers(content: str) -> list[tuple[int, str]]:
    """Extract SEC statutory subitem titles (e.g. ``ITEM 4.A.`` + next-line heading).

    Args:
        content: parent section body.

    Returns:
        `(start, title)` list.

    Raises:
        RuntimeError: Raised when extraction fails.
    """

    if not content:
        return []

    markers: list[tuple[int, str]] = []
    sec_subitem_pattern = re.compile(r"(?im)^(\s*ITEM\s+\d+\.\s*([A-Z])\.\s*)$")
    for match in sec_subitem_pattern.finditer(content):
        letter = _normalize_optional_string(match.group(2))
        if letter is None:
            continue
        next_start = int(match.end())
        next_line_match = re.search(r"(?m)^\s*([^\n]{3,160})\s*$", content[next_start:])
        if next_line_match is None:
            continue
        raw_title = _normalize_optional_string(next_line_match.group(1))
        if raw_title is None:
            continue
        title = f"{letter}. {raw_title}"
        if _looks_like_truncated_heading_fragment(title):
            continue
        markers.append((int(match.start()), title))
    return markers


def _parent_context_allows_note_headings(
    *,
    parent_title: Optional[str],
    content: str,
) -> bool:
    """Judge whether the parent-section context allows ``Note X`` as a valid subheading.

    ``Note`` subheadings should generally only appear in financial statements / notes contexts.
    If parent section is narrative (e.g. 20-F Item 4/5), misidentifying in-body note references
    as subheadings causes large prose segments to be falsely grouped under ``Note`` pseudo-sections.

    Args:
        parent_title: parent section title.
        content: parent section body.

    Returns:
        ``True`` when the parent is indeed a financial-statement/notes context.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    normalized_parent_title = _normalize_optional_string(parent_title)
    if normalized_parent_title is not None:
        for pattern in _NOTE_HEADING_ALLOWED_PARENT_PATTERNS:
            if pattern.search(normalized_parent_title) is not None:
                return True

    content_prefix = str(content or "")[:_NOTE_HEADING_PARENT_CONTENT_WINDOW]
    for pattern in _NOTE_HEADING_ALLOWED_CONTENT_PATTERNS:
        if pattern.search(content_prefix) is not None:
            return True
    return False


def _count_reference_guide_signals(content: str) -> tuple[int, int, int, int, int]:
    """Count characteristic signals of cross-reference guide / page locators.

    Args:
        content: text to analyze.

    Returns:
        ``(source_hits, note_hits, code_hits, page_hits, action_hits)``。

    Raises:
        RuntimeError: Raised when counting fails.
    """

    normalized_prefix = _normalize_whitespace(str(content or ""))[:_REFERENCE_GUIDE_PREFIX_WINDOW]
    source_hits = sum(
        1
        for pattern in _REFERENCE_GUIDE_SOURCE_PATTERNS
        for _ in pattern.finditer(normalized_prefix)
    )
    note_hits = len(list(_REFERENCE_GUIDE_NOTE_PATTERN.finditer(normalized_prefix)))
    code_hits = len(list(_REFERENCE_GUIDE_CODE_PATTERN.finditer(normalized_prefix)))
    page_hits = len(list(_REFERENCE_GUIDE_PAGE_RANGE_PATTERN.finditer(normalized_prefix)))
    action_hits = sum(
        1
        for pattern in _REFERENCE_GUIDE_ACTION_PATTERNS
        for _ in pattern.finditer(normalized_prefix)
    )
    return source_hits, note_hits, code_hits, page_hits, action_hits


def _looks_like_reference_guide_content(
    *,
    title: Optional[str],
    content: str,
) -> bool:
    """Judge whether text looks more like a cross-reference guide than a body paragraph.

    Such content is usually assembled from report source tags, page locators, ``Note X`` references,
    and directives like ``not applicable`` / ``see also supplement``.
    Splitting it as body text easily misidentifies ``Note`` or report titles as pseudo-sections.

    Args:
        title: optional title, used only to conservatively filter clearly off-target blocks like ``Cover Page``.
        content: body text to analyze.

    Returns:
        ``True`` when cross-reference guide characteristics are hit.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    normalized_title = _normalize_optional_string(title)
    if normalized_title is not None and normalized_title.lower() == "cover page":
        return False

    source_hits, note_hits, code_hits, page_hits, action_hits = _count_reference_guide_signals(
        content
    )
    locator_hits = code_hits + page_hits
    if source_hits >= 3 and locator_hits >= 2:
        return True
    if source_hits >= 2 and note_hits >= 1 and locator_hits >= 1:
        return True
    if note_hits >= 2 and locator_hits >= 2:
        return True
    # Action words like `not applicable` / `see also supplement` also occur naturally in 20-F text.
    # Common combinations like "Annual Report" + "Not applicable" alone do not prove
    # a paragraph is a cross-reference guide; more direct locator / note evidence is required
    # to safely short-circuit fallback subheading splitting.
    if action_hits >= 2 and (locator_hits >= 1 or note_hits >= 1):
        return True
    return False


def _extract_line_based_heading_markers(content: str) -> list[tuple[int, str]]:
    """Extract fallback headings based on newline boundaries.

    Args:
        content: parent section body.

    Returns:
        `(start, title)` list.

    Raises:
        RuntimeError: Raised when extraction fails.
    """

    markers: list[tuple[int, str]] = []
    lowered_content = content.lower()
    for pattern in _FALLBACK_HEADING_PATTERNS:
        for match in pattern.finditer(content):
            title = _normalize_optional_string(match.group(1))
            if title is None:
                continue
            if not _is_valid_inline_heading(
                lowered_content=lowered_content,
                start=int(match.start()),
                title=title,
            ):
                continue
            markers.append((int(match.start()), title))
    return markers


def _extract_title_case_line_heading_markers(
    content: str,
    *,
    parent_title: Optional[str] = None,
) -> list[tuple[int, str]]:
    """Extract subheading markers in the form of standalone Title Case lines.

    Rule applies only to very long parent sections targeting level 2/3 paragraph headings
    in narrative sections such as 20-F (e.g. ``Deposit-Taking Activities``,
    ``Retail Banking Services``). To avoid misidentifying table company names, ToC fragments,
    or page numbers, candidate lines must be followed by observed prose.

    Args:
        content: parent section body.

    Returns:
        `(start, title)` list.

    Raises:
        RuntimeError: Raised when extraction fails.
    """

    if len(content) < _TITLE_CASE_HEADING_MIN_PARENT_CHARS:
        return []

    markers: list[tuple[int, str]] = []
    lines = _split_content_lines_with_offsets(content)
    for index, (start, raw_line) in enumerate(lines):
        title = _normalize_optional_string(raw_line)
        if title is None:
            continue
        if not _looks_like_title_case_heading(title):
            continue
        if _is_redundant_title_case_heading(
            title=title,
            parent_title=parent_title,
            start=start,
        ):
            continue
        if not _has_title_case_heading_prose_context(lines=lines, index=index):
            continue
        markers.append((start, title))
    return markers


def _extract_inline_heading_markers(content: str) -> list[tuple[int, str]]:
    """Extract fallback headings from single-line body text.

    Args:
        content: parent section body.

    Returns:
        `(start, title)` list.

    Raises:
        RuntimeError: Raised when extraction fails.
    """

    if not content:
        return []
    markers: list[tuple[int, str]] = []
    lowered_content = content.lower()
    for pattern in _FALLBACK_INLINE_HEADING_PATTERNS:
        for match in pattern.finditer(content):
            start = int(match.start())
            normalized_title = _normalize_inline_heading_title(match.group(1))
            if normalized_title is None:
                continue
            if not _is_valid_inline_heading(
                lowered_content=lowered_content,
                start=start,
                title=normalized_title,
            ):
                continue
            markers.append((start, normalized_title))
    return markers


def _split_content_lines_with_offsets(content: str) -> list[tuple[int, str]]:
    """Split body text into lines, keeping each line's offset in the original text.

    Args:
        content: raw body text.

    Returns:
        `(offset, raw_line)` list, in body order.

    Raises:
        RuntimeError: Raised when splitting fails.
    """

    lines: list[tuple[int, str]] = []
    offset = 0
    for raw_line in content.splitlines(keepends=True):
        line = raw_line.rstrip("\r\n")
        lines.append((offset, line))
        offset += len(raw_line)
    if content and not content.endswith(("\n", "\r")) and not lines:
        lines.append((0, content))
    return lines


def _normalize_inline_heading_title(raw_title: str) -> Optional[str]:
    """Normalize single-line heading text.

    Args:
        raw_title: raw matched text.

    Returns:
        normalized title; `None` when invalid.

    Raises:
        RuntimeError: Raised when processing fails.
    """

    normalized = _normalize_optional_string(raw_title)
    if normalized is None:
        return None
    # Strip trailing paired punctuation to prevent body quotes adhering to heading.
    normalized = normalized.rstrip("\"'”’`.,;:)]} ")
    words = normalized.split()
    if len(words) > _INLINE_HEADING_TITLE_MAX_WORDS:
        normalized = " ".join(words[:_INLINE_HEADING_TITLE_MAX_WORDS])
    return _normalize_optional_string(normalized)


def _looks_like_title_case_heading(title: str) -> bool:
    """Judge whether a line of text has standalone Title Case heading characteristics.

    Args:
        title: candidate title text.

    Returns:
        `True` when it matches heading characteristics.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    normalized_title = _normalize_optional_string(title)
    if normalized_title is None:
        return False
    lowered_title = normalized_title.lower()
    if lowered_title in _TITLE_CASE_HEADING_ARTIFACT_TITLES:
        return False
    if lowered_title.startswith("see "):
        return False
    if len(normalized_title) < 12 or len(normalized_title) > _TITLE_CASE_HEADING_MAX_CHARS:
        return False
    if any(char.isdigit() for char in normalized_title):
        return False
    if normalized_title.endswith((".", ":", ";", ",", "?", "!")):
        return False
    if normalized_title[:1] in {"•", "-", "—", "–", "*"}:
        return False
    if normalized_title.count("|") > 0:
        return False
    if _looks_like_truncated_heading_fragment(normalized_title):
        return False

    words = re.findall(r"[A-Za-z][A-Za-z'&/\-]*", normalized_title)
    if len(words) < _TITLE_CASE_HEADING_MIN_WORDS or len(words) > _TITLE_CASE_HEADING_MAX_WORDS:
        return False
    alpha_chars = sum(len(word) for word in words)
    if alpha_chars < _TITLE_CASE_HEADING_MIN_ALPHA_CHARS:
        return False
    if words[-1].lower() in _FALLBACK_HEADING_TRAILING_STOPWORDS:
        return False

    significant_words = [
        word for word in words if word.lower() not in _FALLBACK_HEADING_CAPITALIZATION_STOPWORDS
    ]
    if len(significant_words) < 2:
        return False
    capitalized_ratio = sum(
        1 for word in significant_words if word.isupper() or word[:1].isupper()
    ) / len(significant_words)
    if capitalized_ratio < _TITLE_CASE_HEADING_MIN_CAPITALIZED_RATIO:
        return False
    return True


def _is_redundant_title_case_heading(
    *,
    title: str,
    parent_title: Optional[str],
    start: int,
) -> bool:
    """Judge whether a candidate Title Case line is only a repeated display of the parent section title.

    Args:
        title: candidate title text.
        parent_title: parent section title.
        start: candidate's start offset within the parent section body.

    Returns:
        `True` when it is only a repeated display of the parent title at the body start.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    normalized_title = _normalize_optional_string(title)
    normalized_parent_title = _normalize_optional_string(parent_title)
    if normalized_title is None or normalized_parent_title is None:
        return False
    if start > _CHILD_HEADING_MIN_DISTANCE:
        return False

    candidate_key = _normalize_heading_similarity_key(normalized_title)
    parent_key = _normalize_heading_similarity_key(normalized_parent_title)
    if not candidate_key or not parent_key:
        return False
    return candidate_key in parent_key


def _normalize_heading_similarity_key(title: str) -> str:
    """Normalize a title into a key for similarity comparison.

    Args:
        title: raw title text.

    Returns:
        comparison key retaining only the semantic body.

    Raises:
        RuntimeError: Raised when processing fails.
    """

    normalized_title = _normalize_optional_string(title)
    if normalized_title is None:
        return ""
    normalized_title = re.sub(r"^[A-Z]\.\s+", "", normalized_title)
    normalized_title = re.sub(
        r"^(?:part\s+[ivx]+\s*-\s*)?item\s+\d+[a-z]?(?:\.\d+)?\s*[-:]\s*",
        "",
        normalized_title,
        flags=re.IGNORECASE,
    )
    normalized_title = re.sub(r"^item\s+\d+\.[A-Z]\.\s*", "", normalized_title, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", normalized_title).strip().lower()


def _has_title_case_heading_prose_context(
    *,
    lines: list[tuple[int, str]],
    index: int,
) -> bool:
    """Judge whether narrative body text follows a Title Case heading candidate.

    Args:
        lines: `(offset, raw_line)` list.
        index: current heading-candidate row index.

    Returns:
        `True` when prose exists after the candidate.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    following_lines: list[str] = []
    for _, raw_line in lines[index + 1 : index + 1 + _TITLE_CASE_HEADING_LOOKAHEAD_LINES]:
        normalized_line = _normalize_optional_string(raw_line)
        if normalized_line is None:
            continue
        lowered_line = normalized_line.lower()
        if lowered_line in _TITLE_CASE_HEADING_ARTIFACT_TITLES:
            continue
        if _is_page_locator_only_line(normalized_line):
            continue
        following_lines.append(normalized_line)
        if len(following_lines) >= _TITLE_CASE_HEADING_LOOKAHEAD_LINES:
            break
    if not following_lines:
        return False

    prose_lines = [
        line
        for line in following_lines[:_TITLE_CASE_HEADING_PROSE_WINDOW]
        if _looks_like_prose_followup_line(line)
    ]
    if not prose_lines:
        return False
    prose_word_count = sum(len(re.findall(r"[A-Za-z][A-Za-z'&/\-]*", line)) for line in prose_lines)
    return prose_word_count >= _TITLE_CASE_HEADING_MIN_PROSE_WORDS


def _is_page_locator_only_line(line: str) -> bool:
    """Judge whether a line of text is only a page-number/footer locator.

    Args:
        line: normalized single-line text.

    Returns:
        `True` when only a page-number locator remains.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    normalized_line = _normalize_optional_string(line)
    if normalized_line is None:
        return False
    if normalized_line.isdigit():
        return True
    if re.fullmatch(_PAGE_LOCATOR_TOKEN_PATTERN, normalized_line) is not None:
        return True
    return False


def _looks_like_prose_followup_line(line: str) -> bool:
    """Judge whether the line after a heading candidate looks more like a body paragraph than a table row.

    Args:
        line: normalized single-line text.

    Returns:
        `True` when it looks like body text.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    normalized_line = _normalize_optional_string(line)
    if normalized_line is None:
        return False
    if normalized_line == "•":
        return False
    if len(normalized_line) < 48:
        return False

    words = re.findall(r"[A-Za-z][A-Za-z'&/\-]*", normalized_line)
    if len(words) < 10:
        return False
    lowercase_words = sum(1 for word in words if word[:1].islower())
    if lowercase_words < max(3, len(words) // 4):
        return False

    alpha_chars = sum(char.isalpha() for char in normalized_line)
    digit_chars = sum(char.isdigit() for char in normalized_line)
    if alpha_chars <= digit_chars * 2:
        return False
    return True


def _is_valid_inline_heading(
    *,
    lowered_content: str,
    start: int,
    title: str,
) -> bool:
    """Validate whether single-line heading candidate can be used for splitting.

    Args:
        lowered_content: lowercased body cache.
        start: heading start position.
        title: normalized title.

    Returns:
        `True` when the candidate is usable.

    Raises:
        RuntimeError: Raised when validation fails.
    """

    words = title.split()
    if len(words) < _INLINE_HEADING_MIN_WORDS or len(words) > _INLINE_HEADING_MAX_WORDS:
        return False
    dash_count = title.count("—") + title.count("–") + title.count("-")
    if dash_count > _INLINE_HEADING_MAX_DASH_COUNT:
        return False
    if _looks_like_truncated_heading_fragment(title):
        return False
    context = lowered_content[max(0, start - _INLINE_HEADING_CONTEXT_WINDOW) : start]
    for pattern in _INLINE_REF_CONTEXT_PATTERNS:
        if pattern.search(context):
            return False
    return True


def _looks_like_truncated_heading_fragment(title: str) -> bool:
    """Judge whether a fallback heading looks more like a truncated body-sentence fragment.

    High false-positive scenarios:
    - Table rows extracted as sentence fragments like ``9. Corporate loans include ...``;
    - Body sentences split by newlines/cells into standalone-looking lines.

    These fragments typically exhibit two signals:
    1. Trailing word is hanging preposition like ``of`` / ``in`` / ``to``;
    2. Low capitalization ratio among significant words, resembling ordinary prose.

    Args:
        title: candidate title text.

    Returns:
        ``True`` when it looks like a truncated sentence.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    normalized_title = _normalize_optional_string(title)
    if normalized_title is None:
        return False
    if re.match(r"^[A-Z]\.", normalized_title) is not None:
        return False
    if (
        re.match(r"^(?:Note|NOTES?)\s+", normalized_title) is None
        and re.match(
            r"^\d+\.",
            normalized_title,
        )
        is None
    ):
        return False

    words = re.findall(r"[A-Za-z][A-Za-z'&/\-]*", normalized_title)
    if not words:
        return False

    last_word = words[-1].lower()
    if last_word in _FALLBACK_HEADING_TRAILING_STOPWORDS:
        return True

    significant_words = [
        word
        for word in words
        if len(word) > 2 and word.lower() not in _FALLBACK_HEADING_CAPITALIZATION_STOPWORDS
    ]
    if len(significant_words) < 4:
        return False

    capitalized_count = sum(1 for word in significant_words if word.isupper() or word[0].isupper())
    capitalized_ratio = capitalized_count / len(significant_words)
    return capitalized_ratio < _FALLBACK_HEADING_MIN_CAPITALIZED_RATIO


def _build_parent_directory_content(
    *,
    section: _VirtualSection,
    children: list[_VirtualSection],
) -> str:
    """Build parent section directory content.

    Args:
        section: parent section.
        children: direct child section list.

    Returns:
        directory text.
    """

    title = _normalize_optional_string(section.title) or section.ref
    lines = [
        f"{title} is split into {len(children)} child sections.",
        "Read child sections for full content:",
    ]
    for child in children:
        child_title = _normalize_optional_string(child.title) or child.ref
        preview = _normalize_whitespace(child.preview)[:80]
        lines.append(f"- {child.ref} | {child_title} | {preview}")
    return "\n".join(lines)


def _format_child_section_ref(*, parent_ref: str, index: int) -> str:
    """Generate child section ref."""

    if index <= 0:
        raise ValueError("child section index must be greater than 0")
    return f"{parent_ref}_c{index:0{_CHILD_REF_WIDTH}d}"


def _dedupe_markers(markers: list[tuple[int, Optional[str]]]) -> list[tuple[int, Optional[str]]]:
    """Deduplicate boundary markers and sort by position.

    Args:
        markers: raw marker list.

    Returns:
        deduplicated marker list.

    Raises:
        RuntimeError: Raised when processing fails.
    """

    valid_items = [(int(position), title) for position, title in markers if int(position) >= 0]
    valid_items.sort(key=lambda item: item[0])
    deduped: list[tuple[int, Optional[str]]] = []
    seen_positions: set[int] = set()
    for position, title in valid_items:
        if position in seen_positions:
            continue
        seen_positions.add(position)
        deduped.append((position, title))
    return deduped


def _build_marker_title_ranges(
    text: str,
    markers: list[tuple[int, Optional[str]]],
) -> dict[str, tuple[int, int]]:
    """Build a title->text-range mapping from markers.

    Convert deduplicated markers to ``{title: (start, end)}`` mapping,
    used to find text spans by title in placeholder-marked text for table reference extraction.

    Args:
        text: full text.
        markers: boundary marker list.

    Returns:
        title -> text range ``(start, end)`` mapping;
        markers without titles are skipped.
    """

    deduped = _dedupe_markers(markers)
    if not deduped:
        return {}
    ranges: dict[str, tuple[int, int]] = {}
    for i, (start, title) in enumerate(deduped):
        end = deduped[i + 1][0] if i + 1 < len(deduped) else len(text)
        if title:
            ranges[title] = (start, end)
    return ranges


def _filter_table_refs_by_availability(
    refs: list[str],
    available_table_refs: Optional[set[str]],
) -> list[str]:
    """Filter a section's ``table_ref`` by the underlying available-table set.

    Args:
        refs: raw table reference list (original order preserved).
        available_table_refs: set of table references visible to underlying ``list_tables()``;
            ``None`` means unavailable; ``refs`` is passed through unchanged.

    Returns:
        filtered table reference list.

    Raises:
        None.
    """

    if available_table_refs is None:
        return refs
    return [ref for ref in refs if ref in available_table_refs]


def _assign_unmapped_tables_by_position(
    *,
    marked_text: str,
    title_ranges: dict[str, tuple[int, int]],
    cover_end: int,
    virtual_sections: list[_VirtualSection],
    virtual_section_by_ref: dict[str, _VirtualSection],
    table_ref_to_virtual_ref: dict[str, str],
    available_table_refs: Optional[set[str]] = None,
) -> None:
    """Assign ``[[t_XXXX]]`` placeholders not allocated in Phase 1 to the nearest preceding virtual section.

    Phase 1 (exact title match) may miss some tables -- when rerunning ``_build_markers``
    on marked text (with ``[[t_XXXX]]`` placeholders) produces different marker titles
    from original virtual sections, title_range cannot match any virtual section and
    ``[[t_XXXX]]`` within span remains unassigned. Typical case: DEF 14A Proposal numbers
    matching differently with/without table text.

    This function acts as Phase 2 fallback:

    1. Collect set of ``tbl_ref`` already assigned in Phase 1.
    2. Build ordered boundaries of "matched virtual sections" in marked text (0 for Cover Page,
       the rest use the corresponding title's start position from ``title_ranges``).
    3. Scan all ``[[t_XXXX]]`` in marked text; for unassigned refs, search by position for
       nearest preceding boundary, assigning it to the corresponding virtual section.

    Args:
        marked_text: document full text with ``[[t_XXXX]]`` placeholders.
        title_ranges: title->range mapping returned by ``_build_marker_title_ranges``.
        cover_end: end position of Cover Page in marked text.
        virtual_sections: virtual-section list.
        virtual_section_by_ref: ref->virtual-section mapping.
        table_ref_to_virtual_ref: existing tbl_ref->vs_ref mapping (updated in place).
        available_table_refs: underlying available table references set; None disables filtering.

    Returns:
        None (updates ``table_ref_to_virtual_ref`` and the virtual sections' ``table_refs`` in place).
    """

    assigned_refs = set(table_ref_to_virtual_ref.keys())

    # Build ordered boundaries of matched virtual sections: (position_in_marked_text, vs_ref)
    matched_boundaries: list[tuple[int, str]] = []
    for vs in virtual_sections:
        if vs.title == "Cover Page":
            matched_boundaries.append((0, vs.ref))
        elif vs.title in title_ranges:
            start, _ = title_ranges[vs.title]
            matched_boundaries.append((start, vs.ref))
    matched_boundaries.sort(key=lambda x: x[0])

    if not matched_boundaries:
        return

    # Scan all [[t_XXXX]], fallback-assign unallocated refs by position
    for match in _TABLE_REF_PATTERN.finditer(marked_text):
        tbl_ref = match.group(1)
        if available_table_refs is not None and tbl_ref not in available_table_refs:
            continue
        if tbl_ref in assigned_refs:
            continue

        pos = match.start()
        # find the nearest preceding matched virtual-section boundary
        target_vs_ref: Optional[str] = None
        for boundary_pos, vs_ref in reversed(matched_boundaries):
            if boundary_pos <= pos:
                target_vs_ref = vs_ref
                break
        # tables located before all boundaries (extremely rare) are assigned to the first virtual section
        if target_vs_ref is None:
            target_vs_ref = matched_boundaries[0][1]

        table_ref_to_virtual_ref[tbl_ref] = target_vs_ref
        target_vs = virtual_section_by_ref.get(target_vs_ref)
        if target_vs is not None:
            target_vs.table_refs.append(tbl_ref)


def _remap_tables_to_deepest_virtual_sections(
    *,
    marked_text: str,
    title_ranges: dict[str, tuple[int, int]],
    cover_end: int,
    virtual_sections: list[_VirtualSection],
    virtual_section_by_ref: dict[str, _VirtualSection],
    table_ref_to_virtual_ref: dict[str, str],
) -> None:
    """Drill the table mapping from the parent section down to the deepest hit child section.

    Args:
        marked_text: full text with table placeholders.
        title_ranges: first-level marker title-range mapping.
        cover_end: end position of Cover Page.
        virtual_sections: top-level virtual-section list.
        virtual_section_by_ref: full ref->section mapping.
        table_ref_to_virtual_ref: current tbl_ref->section mapping (updated in place).

    Returns:
        None.
    """

    section_ranges = _build_virtual_section_ranges_in_marked_text(
        marked_text=marked_text,
        title_ranges=title_ranges,
        cover_end=cover_end,
        top_sections=virtual_sections,
        virtual_section_by_ref=virtual_section_by_ref,
    )
    if not section_ranges:
        return

    table_positions = {
        match.group(1): int(match.start()) for match in _TABLE_REF_PATTERN.finditer(marked_text)
    }

    for tbl_ref, current_ref in list(table_ref_to_virtual_ref.items()):
        position = table_positions.get(tbl_ref)
        if position is None:
            continue
        deepest_ref = _find_deepest_virtual_section_ref(
            start_ref=current_ref,
            position=position,
            section_ranges=section_ranges,
            virtual_section_by_ref=virtual_section_by_ref,
        )
        if deepest_ref == current_ref:
            continue
        current_section = virtual_section_by_ref.get(current_ref)
        if current_section is not None and tbl_ref in current_section.table_refs:
            current_section.table_refs.remove(tbl_ref)
        target_section = virtual_section_by_ref.get(deepest_ref)
        if target_section is not None and tbl_ref not in target_section.table_refs:
            target_section.table_refs.append(tbl_ref)
        table_ref_to_virtual_ref[tbl_ref] = deepest_ref


def _build_virtual_section_ranges_in_marked_text(
    *,
    marked_text: str,
    title_ranges: dict[str, tuple[int, int]],
    cover_end: int,
    top_sections: list[_VirtualSection],
    virtual_section_by_ref: dict[str, _VirtualSection],
) -> dict[str, tuple[int, int]]:
    """Build virtual section range mapping in marked text.

    Args:
        marked_text: full text with table placeholders.
        title_ranges: first-level marker title-range mapping.
        cover_end: end position of Cover Page.
        top_sections: top-level section list.
        virtual_section_by_ref: ref->section mapping.

    Returns:
        `section_ref -> (start, end)` mapping.
    """

    ranges: dict[str, tuple[int, int]] = {}
    for section in top_sections:
        if section.title == "Cover Page":
            ranges[section.ref] = (0, max(0, cover_end))
        elif section.title in title_ranges:
            ranges[section.ref] = title_ranges[section.title]

    for section in top_sections:
        if section.ref not in ranges or not section.child_refs:
            continue
        _build_child_ranges_within_parent(
            marked_text=marked_text,
            parent_section=section,
            parent_range=ranges[section.ref],
            ranges=ranges,
            virtual_section_by_ref=virtual_section_by_ref,
        )
    return ranges


def _build_child_ranges_within_parent(
    *,
    marked_text: str,
    parent_section: _VirtualSection,
    parent_range: tuple[int, int],
    ranges: dict[str, tuple[int, int]],
    virtual_section_by_ref: dict[str, _VirtualSection],
) -> None:
    """Locate the child-section range within the parent section."""

    parent_start, parent_end = parent_range
    if parent_end <= parent_start:
        return

    located_children: list[tuple[str, int]] = []
    cursor = parent_start
    for child_ref in parent_section.child_refs:
        child_section = virtual_section_by_ref.get(child_ref)
        if child_section is None:
            continue
        child_title = _normalize_optional_string(child_section.title)
        if child_title is None:
            continue
        position = _find_title_position_with_boundaries(
            text=marked_text,
            title=child_title,
            start=cursor,
        )
        if position is None or position < parent_start or position >= parent_end:
            continue
        located_children.append((child_ref, position))
        cursor = position + len(child_title)

    for index, (child_ref, start) in enumerate(located_children):
        end = located_children[index + 1][1] if index + 1 < len(located_children) else parent_end
        if end <= start:
            continue
        ranges[child_ref] = (start, end)
        child_section = virtual_section_by_ref.get(child_ref)
        if child_section is None or not child_section.child_refs:
            continue
        _build_child_ranges_within_parent(
            marked_text=marked_text,
            parent_section=child_section,
            parent_range=(start, end),
            ranges=ranges,
            virtual_section_by_ref=virtual_section_by_ref,
        )


def _find_deepest_virtual_section_ref(
    *,
    start_ref: str,
    position: int,
    section_ranges: dict[str, tuple[int, int]],
    virtual_section_by_ref: dict[str, _VirtualSection],
) -> str:
    """Find deepest section ref corresponding to hit position."""

    current_ref = start_ref
    while True:
        current_section = virtual_section_by_ref.get(current_ref)
        if current_section is None:
            return current_ref
        matched_child_ref: Optional[str] = None
        matched_start = -1
        for child_ref in current_section.child_refs:
            child_range = section_ranges.get(child_ref)
            if child_range is None:
                continue
            start, end = child_range
            if start <= position < end and start >= matched_start:
                matched_child_ref = child_ref
                matched_start = start
        if matched_child_ref is None:
            return current_ref
        current_ref = matched_child_ref


def _has_meaningful_text(content: str, min_len: int = 24) -> bool:
    """Judge whether text carries valid information content.

    Args:
        content: candidate text.
        min_len: minimum length threshold.

    Returns:
        `True` when the text is valid.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    return len(_normalize_whitespace(content)) >= min_len


def _allow_short_section(title: Optional[str]) -> bool:
    """Judge whether a heading's section allows short text to pass.

    Args:
        title: section title.

    Returns:
        `True` when short text is allowed.

    Raises:
        RuntimeError: Raised when judgment fails.
    """

    normalized_title = _normalize_optional_string(title)
    if normalized_title is None:
        return False
    return normalized_title in {
        "SIGNATURE",
        "Schedule A",
        "Exhibit",
        "Conference Call",
        "Safe Harbor",
        "About Non-GAAP",
        "Key Highlights",
    } or normalized_title.startswith(("Annex", "Appendix", "Proposal"))


# ---------------------------------------------------------------------------
# Token-level search fallback (cross-form shared)
# ---------------------------------------------------------------------------

# Minimum effective token length -- overly short tokens (e.g. "of", "in") lack analytical value
_MIN_SEARCH_TOKEN_LEN = 3


def _tokenize_query(query: str) -> list[str]:
    """Split a query string into valid search tokens.

    Filter out overly short tokens (length < ``_MIN_SEARCH_TOKEN_LEN``),
    preventing stopwords like "of", "in" from generating numerous meaningless hits.

    Args:
        query: raw query string.

    Returns:
        valid token list (all lowercase).
    """

    return [
        token
        for token in re.split(r"\W+", query.strip().lower())
        if len(token) >= _MIN_SEARCH_TOKEN_LEN
    ]


def _token_fallback_search(
    *,
    query: str,
    virtual_sections: list,
    virtual_section_by_ref: dict,
    within_ref: Optional[str],
) -> list[SearchHit]:
    """Token OR fallback search.

    Split multi-word query into tokens, searching virtual sections where any token appears.
    Only called when exact phrase match yields no hits and query contains multiple valid tokens.

    Args:
        query: raw query string.
        virtual_sections: virtual-section list.
        virtual_section_by_ref: ref -> virtual-section mapping.
        within_ref: optional search-scope restriction.

    Returns:
        hit list.
    """

    tokens = _tokenize_query(query)
    # Only enable fallback when query can be split into multiple valid tokens
    if len(tokens) < 2:
        return []

    normalized_query = str(query or "").strip()
    # Build token OR regex: matches when any token appears
    token_pattern = re.compile(
        "|".join(re.escape(t) for t in tokens),
        re.IGNORECASE,
    )

    target_sections = (
        [virtual_section_by_ref[within_ref]]
        if within_ref is not None and within_ref in virtual_section_by_ref
        else virtual_sections
    )

    hits_raw: list[SearchHit] = []
    section_content_map: dict[str, str] = {}
    for section in target_sections:
        if token_pattern.search(section.content) is None:
            continue
        section_content_map[section.ref] = section.content
        hits_raw.append(
            {
                "section_ref": section.ref,
                "section_title": section.title,
                "snippet": normalized_query,
            }
        )

    if not hits_raw:
        return []

    # Generate snippet using token co-occurrence window, favoring multi-token co-occurrence.
    # Returned hits carry _token_fallback=True flag for search engine to distinguish exact vs fallback hits.
    return enrich_hits_by_section_token_or(
        hits_raw=hits_raw,
        section_content_map=section_content_map,
        tokens=tokens,
        original_query=normalized_query,
    )


# ---------------------------------------------------------------------------
# BS Special Form Generic supports Check
# ---------------------------------------------------------------------------


def _check_special_form_support(
    source: "Source",
    *,
    form_type: Optional[str],
    media_type: Optional[str],
    supported_forms: frozenset[str],
    base_supports_fn: Callable[..., bool],
    extra_media_keywords: frozenset[str] = frozenset(),
    extra_suffixes: frozenset[str] = frozenset(),
) -> bool:
    """Generic supports() logic for BS special-form processors.

    Unified determination flow:
    1. Normalize form_type -> check if in supported list
    2. Delegate to base_supports_fn (typically FinsBSProcessor.supports) for native judgment
    3. XML media type fallback
    4. Additional media type keyword fallback (e.g. ``text/plain``)
    5. URI suffix fallback (``.xml`` + additional suffixes)

    Args:
        source: document source.
        form_type: raw form type.
        media_type: media type.
        supported_forms: set of normalized form types this processor supports.
        base_supports_fn: base processor supports method (accepts source, form_type, media_type).
        extra_media_keywords: additional media-type keywords to match (e.g. ``"text/plain"``).
        extra_suffixes: extra file suffixes beyond ``.xml`` (e.g. ``".txt"``).

    Returns:
        whether this processor supports this document.
    """
    normalized_form = _normalize_form_type(form_type)
    if normalized_form not in supported_forms:
        return False
    if base_supports_fn(source, form_type=form_type, media_type=media_type):
        return True
    resolved_media_type = str(media_type or source.media_type or "").lower()
    if "xml" in resolved_media_type:
        return True
    # Additional media type keywords (e.g. SC 13 requires text/plain)
    for keyword in extra_media_keywords:
        if keyword in resolved_media_type:
            return True
    allowed_suffixes = {".xml"} | set(extra_suffixes)
    return _infer_suffix_from_uri(source.uri) in allowed_suffixes


__all__ = [
    "_VirtualSectionProcessorMixin",
    "_build_marker_title_ranges",
    "_check_special_form_support",
    "_dedupe_markers",
    "_find_marker_after",
    "_find_lettered_marker_after",
    "_safe_virtual_document_text",
    "_is_table_placeholder_dominant_text",
    "_normalize_form_type",
    "_infer_suffix_from_uri",
    "_normalize_optional_string",
    "_normalize_whitespace",
]
