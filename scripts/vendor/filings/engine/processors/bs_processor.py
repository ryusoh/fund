"""BeautifulSoup HTML processor implementation.

This module implements the DocumentProcessor protocol, providing section,
table, section-content, and search capabilities for generic HTML documents.

Maintenance note (do not split this module):
    This module is about 2000 lines, consisting of the BSProcessor class
    (545 lines) and 45 module-level private utility functions. The utility
    functions cover DOM cleaning / section building / table extraction /
    rendering, but the core build functions call multiple utility functions
    across regions, and splitting would only add import complexity. The
    module-level functions are not exposed externally; consumption happens
    only through the BSProcessor class.
"""

from __future__ import annotations

import re
from collections import OrderedDict
from collections.abc import Callable
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Optional, TypeVar, overload

import pandas as pd
from bs4 import BeautifulSoup, Tag
from bs4.element import NavigableString

from .base import (
    SearchHit,
    SectionContent,
    SectionSummary,
    TableContent,
    TableSummary,
    build_section_content,
    build_section_summary,
    build_table_content,
    build_table_summary,
)
from .perf_utils import ProcessorStageProfiler, is_processor_profile_enabled
from .search_utils import enrich_hits_by_section, run_titled_section_search
from .source import Source
from .table_utils import parse_html_table_dataframe
from .text_utils import (
    PREVIEW_MAX_CHARS as _PREVIEW_MAX_CHARS,
)
from .text_utils import (
    clean_page_header_noise as _clean_page_header_noise,
)
from .text_utils import (
    format_section_ref as _format_section_ref,
)
from .text_utils import (
    format_table_ref as _format_table_ref,
)
from .text_utils import (
    infer_caption_from_context as _infer_caption_from_context,
)
from .text_utils import (
    infer_suffix_from_uri as _infer_suffix_from_uri,
)
from .text_utils import (
    normalize_whitespace as _normalize_whitespace,
)

# HTML parser: lxml is about 2-5x faster than Python's built-in html.parser
_HTML_PARSER = "lxml"

_HEADING_TAGS = ("h1", "h2", "h3", "h4", "h5", "h6")
_IX_REMOVE_TAGS = {"ix:header", "ix:hidden", "ix:references", "ix:resources"}
_HIDDEN_STYLE_TOKENS = ("display:none", "visibility:hidden")
_LOW_INFO_TOKENS = {"-", "--", "—", "n/a", "na", "none", "nil", "☐", "☒"}
_SECTION_TEXT_CACHE_MAX_ENTRIES = 256

_CellValueT = TypeVar("_CellValueT")
_SECTION_TEXT_CACHE_MAX_CHARS = 12_000_000
_TABLE_RENDER_CACHE_MAX_ENTRIES = 2048


@dataclass
class _SectionBlock:
    """Internal section structure."""

    ref: str
    title: Optional[str]
    level: int
    parent_ref: Optional[str]
    preview: str
    heading_tag: Optional[Tag]
    next_heading_tag: Optional[Tag]
    table_refs: list[str]
    contains_full_text: bool


@dataclass
class _TableBlock:
    """Internal table structure."""

    ref: str
    tag: Tag
    caption: Optional[str]
    row_count: int
    col_count: int
    headers: Optional[list[str]]
    section_ref: Optional[str]
    context_before: str
    table_type: str
    has_spans: bool


class BSProcessor:
    """BeautifulSoup document processor."""

    PARSER_VERSION = "bs_processor_v1.1.0"

    @classmethod
    def get_parser_version(cls) -> str:
        """Return the processor parser version."""

        return str(cls.PARSER_VERSION)

    # Subclasses may override this attribute to use a different HTML parser.
    # Defaults to the module constant _HTML_PARSER (lxml); individual form
    # types (e.g. 6-K) may fall back to "html.parser" if lxml parsing
    # differences cause scoring regressions.
    _html_parser: str = _HTML_PARSER

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
            ValueError: raised when the file does not exist or is not a file.
        """

        html_path = source.materialize(suffix=".html")
        if not html_path.exists() or not html_path.is_file():
            raise ValueError(f"HTML file does not exist: {html_path}")

        self._source = source
        self._form_type = form_type
        self._media_type = media_type or source.media_type
        self._profiler = ProcessorStageProfiler(
            component=self.__class__.__name__,
            enabled=is_processor_profile_enabled(),
        )
        with self._profiler.stage("load_html"):
            html_content = self._load_html_content(html_path)
        with self._profiler.stage("parse_html"):
            self._soup = BeautifulSoup(html_content, self._html_parser)
        with self._profiler.stage("sanitize_html"):
            _sanitize_soup(self._soup)
        with self._profiler.stage("resolve_root"):
            self._root = _get_body_or_root(self._soup)

        self._sections: list[_SectionBlock]
        self._tables: list[_TableBlock]
        self._section_by_ref: dict[str, _SectionBlock]
        self._table_by_ref: dict[str, _TableBlock]
        self._table_ref_by_tag_id: dict[int, str]
        self._section_text_cache: OrderedDict[str, str] = OrderedDict()
        self._section_text_cache_chars = 0
        self._table_render_cache: OrderedDict[str, tuple[str, Any, Optional[list[str]]]] = (
            OrderedDict()
        )

        with self._profiler.stage("build_sections"):
            self._sections = _build_sections(self._root)
        with self._profiler.stage("build_tables"):
            heading_ref_map = _build_heading_ref_map(self._sections)
            default_section_ref = _get_default_section_ref(self._sections)
            self._tables = _build_tables(
                self._root,
                heading_ref_map,
                default_section_ref,
                extra_layout_check=self._extra_layout_table_check,
            )
        with self._profiler.stage("attach_tables_to_sections"):
            self._sections = _attach_tables_to_sections(self._sections, self._tables)

        self._section_by_ref = {section.ref: section for section in self._sections}
        self._table_by_ref = {table.ref: table for table in self._tables}
        self._table_ref_by_tag_id = {id(table.tag): table.ref for table in self._tables}
        self._profiler.log_summary(extra=f"uri={self._source.uri}")

    def get_section_title(self, ref: str) -> Optional[str]:
        """Get a section title by section ref.

        Args:
            ref: section reference.

        Returns:
            section title string; None when the ref does not exist.
        """
        section = self._section_by_ref.get(ref)
        return section.title if section else None

    @classmethod
    def supports(
        cls,
        source: Source,
        *,
        form_type: Optional[str] = None,
        media_type: Optional[str] = None,
    ) -> bool:
        """Determine whether this file is supported.

        Args:
            source: document source abstraction.
            form_type: optional form type.
            media_type: optional media type.

        Returns:
            whether it is supported.

        Raises:
            OSError: may be raised when the file read fails.
        """

        resolved_media_type = media_type or source.media_type
        if resolved_media_type and "html" in resolved_media_type.lower():
            return True

        uri_suffix = _infer_suffix_from_uri(source.uri)
        if uri_suffix in {".htm", ".html", ".xhtml"}:
            return True

        return False

    @staticmethod
    def _extra_layout_table_check(row_count: int, col_count: int, text: str) -> bool:
        """Domain-specific layout-table detection hook.

        the engine layer does no extra detection by default. Subclasses (e.g. FinsBSProcessor) may override this method
        inject domain-specific rules.

        Args:
            row_count: table row count.
            col_count: table column count.
            text: normalized plain text of the table.

        Returns:
            whether it is a layout table.
        """
        return False

    def _extra_table_fields(self, table: _TableBlock) -> dict[str, Any]:
        """Return the extra fields embedded in the table output dict.

        the engine layer injects no extra fields by default. Subclasses (e.g. ``FinsBSProcessor``)
        may be overridden to add domain-specific fields (e.g. ``is_financial``).

        Args:
            table: internal table object.

        Returns:
            extra field dict, empty by default.
        """
        return {}

    def _load_html_content(self, source_path: Path) -> str:
        """Read HTML file content.

        Engine only does generic file reading by default, with no domain preprocessing. Domain subclasses that need
        extra normalization before parsing should be done by overriding this hook.

        Args:
            source_path: HTML file path.

        Returns:
            HTML content string.

        Raises:
            OSError: raised when the read fails.
        """

        return source_path.read_text(encoding="utf-8", errors="ignore")

    def list_sections(self) -> list[SectionSummary]:
        """Read the section list.

        Args:
            None.

        Returns:
            section summary list.

        Raises:
            RuntimeError: raised when processing fails.
        """

        try:
            return [_section_to_summary(section) for section in self._sections]
        except Exception as exc:  # pragma: no cover - defensive fallback
            raise RuntimeError("failed to parse section") from exc

    def list_tables(self) -> list[TableSummary]:
        """Read the table list.

        Args:
            None.

        Returns:
            table summary list.

        Raises:
            RuntimeError: raised when processing fails.
        """

        # layout tables are filtered by default; only tables with substantive data are returned.
        try:
            result = []
            for table in self._tables:
                if table.table_type != "layout":
                    summary = _table_to_summary(table)
                    extra = self._extra_table_fields(table)
                    if isinstance(extra.get("page_no"), int):
                        summary["page_no"] = extra["page_no"]
                    if isinstance(extra.get("internal_ref"), str):
                        summary["internal_ref"] = extra["internal_ref"]
                    if isinstance(extra.get("is_financial"), bool):
                        summary["is_financial"] = extra["is_financial"]
                    result.append(summary)
            return result
        except Exception as exc:  # pragma: no cover - defensive fallback
            raise RuntimeError("failed to parse table") from exc

    def read_section(self, ref: str) -> SectionContent:
        """Read section content by ref.

        Args:
            ref: section reference.

        Returns:
            section content.

        Raises:
            KeyError: raised when the section does not exist.
        """

        section = self._section_by_ref.get(ref)
        if not section:
            raise KeyError(f"Section not found: {ref}")

        # TODO(phase-2): refine the HTML cleanup policy (e.g. keep some structural markers).
        with self._profiler.stage("read_section"):
            content = self._get_section_text(section)
        word_count = len(content.split())

        return build_section_content(
            ref=section.ref,
            title=section.title,
            content=content,
            tables=list(section.table_refs),
            word_count=word_count,
            contains_full_text=section.contains_full_text,
        )

    def read_table(self, table_ref: str) -> TableContent:
        """Read table content by ref.

        Args:
            table_ref: table reference.

        Returns:
            table content.

        Raises:
            KeyError: raised when the table does not exist.
        """

        table = self._table_by_ref.get(table_ref)
        if not table:
            raise KeyError(f"Table not found: {table_ref}")

        cached_rendered = self._get_cached_rendered_table(table_ref)
        if cached_rendered is None:
            with self._profiler.stage("read_table_render"):
                rendered = _render_table_data(table)
            self._set_cached_rendered_table(table_ref, rendered)
            data_format, data, columns = rendered
        else:
            data_format, data, columns = cached_rendered
        cloned_data = deepcopy(data)
        cloned_columns = deepcopy(columns)

        return build_table_content(
            table_ref=table.ref,
            caption=table.caption,
            data_format=data_format,
            data=cloned_data,
            columns=cloned_columns,
            row_count=table.row_count,
            col_count=table.col_count,
            section_ref=table.section_ref,
            table_type=table.table_type,
            **self._extra_table_fields(table),
        )

    def search(self, query: str, within_ref: Optional[str] = None) -> list[SearchHit]:
        """Search within a document.

        Args:
            query: search term.
            within_ref: optional section scope.

        Returns:
            search hit list.

        Raises:
            RuntimeError: raised when the search fails.
        """

        # TODO(phase-2): extend to smart matching (plurals/tenses/synonyms).
        normalized_query = str(query or "").strip()
        if not normalized_query:
            return []

        if within_ref and within_ref not in self._section_by_ref:
            return []

        with self._profiler.stage("search"):
            sections = self._sections if not within_ref else [self._section_by_ref[within_ref]]
            hits_raw, section_content_map = run_titled_section_search(
                sections=sections,
                normalized_query=normalized_query,
                get_text=self._get_section_text,
            )
        return enrich_hits_by_section(
            hits_raw=hits_raw,
            section_content_map=section_content_map,
            query=normalized_query,
        )

    def _get_section_text(self, section: _SectionBlock) -> str:
        """Get section text content with table placeholders.

        Args:
            section: section object.

        Returns:
            section text.

        Raises:
            RuntimeError: raised when parsing fails.
        """

        cached = self._get_cached_section_text(section.ref)
        if cached is not None:
            return cached
        try:
            rendered = _render_section_text(
                self._root,
                section,
                table_ref_by_tag_id=self._table_ref_by_tag_id,
            )
        except Exception as exc:  # pragma: no cover - defensive fallback
            raise RuntimeError("failed to read section content") from exc
        self._set_cached_section_text(section.ref, rendered)
        return rendered

    def _get_cached_section_text(self, ref: str) -> Optional[str]:
        """Read the section-text cache.

        Args:
            ref: section reference.

        Returns:
            the section text on a hit, otherwise `None`.

        Raises:
            RuntimeError: raised when cache access fails.
        """

        cached = self._section_text_cache.get(ref)
        if cached is None:
            return None
        self._section_text_cache.move_to_end(ref, last=True)
        return cached

    def _set_cached_section_text(self, ref: str, content: str) -> None:
        """Write the section-text cache with LRU eviction.

        Args:
            ref: section reference.
            content: section text.

        Returns:
            None.

        Raises:
            RuntimeError: raised when the cache write fails.
        """

        existing = self._section_text_cache.pop(ref, None)
        if existing is not None:
            self._section_text_cache_chars -= len(existing)
        self._section_text_cache[ref] = content
        self._section_text_cache_chars += len(content)
        while (
            len(self._section_text_cache) > _SECTION_TEXT_CACHE_MAX_ENTRIES
            or self._section_text_cache_chars > _SECTION_TEXT_CACHE_MAX_CHARS
        ):
            _, removed_content = self._section_text_cache.popitem(last=False)
            self._section_text_cache_chars -= len(removed_content)

    def _get_cached_rendered_table(
        self,
        table_ref: str,
    ) -> Optional[tuple[str, Any, Optional[list[str]]]]:
        """Read the table-render cache.

        Args:
            table_ref: table reference.

        Returns:
            `(data_format, data, columns)` on a hit, otherwise `None`.

        Raises:
            RuntimeError: raised when cache access fails.
        """

        cached = self._table_render_cache.get(table_ref)
        if cached is None:
            return None
        self._table_render_cache.move_to_end(table_ref, last=True)
        return cached

    def _set_cached_rendered_table(
        self,
        table_ref: str,
        rendered: tuple[str, Any, Optional[list[str]]],
    ) -> None:
        """Write the table-render cache with LRU eviction.

        Args:
            table_ref: table reference.
            rendered: table render result `(data_format, data, columns)`.

        Returns:
            None.

        Raises:
            RuntimeError: raised when the cache write fails.
        """

        if table_ref in self._table_render_cache:
            self._table_render_cache.pop(table_ref, None)
        self._table_render_cache[table_ref] = rendered
        while len(self._table_render_cache) > _TABLE_RENDER_CACHE_MAX_ENTRIES:
            self._table_render_cache.popitem(last=False)

    def get_full_text(self) -> str:
        """Get the document's full plain-text content (including table text).

        unlike ``read_section()``, this method does not replace tables with placeholders,
        instead, all table text is preserved. Suitable for scenarios needing full-text analysis (e.g. section splitting
        marker detection), because some Item headings in SEC documents may live inside table layouts
        inside (e.g. AMZN's table-based layout).

        borrowing edgartools' ``Document.text(include_tables=True)`` strategy:
        keep table text during full-text extraction so marker information is not lost.

        Args:
            None.

        Returns:
            full document plain-text string.

        Raises:
            RuntimeError: raised when extraction fails.
        """

        return _normalize_whitespace(self._root.get_text(separator=" ", strip=True))

    def get_full_text_with_table_markers(self) -> str:
        """Get the document full text, replacing non-layout tables with ``[[t_XXXX]]`` placeholders.

        unlike ``get_full_text()``, this method replaces each non-layout ``<table>``
        replaced with the corresponding ``[[t_XXXX]]`` placeholders before text extraction. Layout
        tables are dropped outright with no marker injected -- consistent with the ``list_tables()`` filter policy,
        avoiding dangling references in virtual sections that ``list_tables()`` never returns.

        placeholder numbering matches the ``table_ref`` returned by ``list_tables()``
        (numbered in DOM order).

        purpose: after full-text splitting, virtual-section processors resolve placeholders to determine which table
        falls into, building the table->virtual_section mapping.

        implementation detail: temporarily replaces ``<table>`` tags in the DOM, restores them right after text extraction,
        without affecting other methods' normal behavior.

        Args:
            None.

        Returns:
            full document text string with ``[[t_XXXX]]`` placeholders.

        Raises:
            RuntimeError: raised when extraction fails.
        """

        # build the layout-table ref set (for fast lookup)
        layout_refs = {t.ref for t in self._tables if t.table_type == "layout"}

        saved: list[tuple[NavigableString, Tag]] = []
        try:
            for idx, table_tag in enumerate(self._root.find_all("table")):
                ref = _format_table_ref(idx + 1)
                if ref in layout_refs:
                    # layout table: drop the text, inject no marker
                    marker = NavigableString(" ")
                else:
                    # data table: inject the [[t_XXXX]] placeholder
                    marker = NavigableString(f" [[{ref}]] ")
                table_tag.replace_with(marker)
                saved.append((marker, table_tag))
            return _normalize_whitespace(self._root.get_text(separator=" ", strip=True))
        finally:
            # restore in reverse order to keep the DOM tree intact
            for marker, table_tag in reversed(saved):
                marker.replace_with(table_tag)


def _sanitize_soup(soup: BeautifulSoup) -> None:
    """Clean the HTML parse tree, removing hidden and noise nodes.

    Args:
        soup: BeautifulSoup parse object.

    Returns:
        None.

    Raises:
        RuntimeError: raised when cleaning fails.
    """

    for tag in soup.find_all(["script", "style", "noscript"]):
        tag.decompose()

    # Perf optimization: merge the two find_all(True) passes into a single traversal,
    # reducing repeated scans of large DOMs (e.g. 10-30MB SEC 20-F files).
    # Materialize with list() because decompose/unwrap in the loop body mutates the tree.
    for tag in list(soup.find_all(True)):
        # skip tags detached from the document tree by a parent's decompose
        if tag.parent is None:
            continue
        if _is_hidden_tag(tag):
            tag.decompose()
            continue
        tag_name = (tag.name or "").lower()
        if not tag_name.startswith("ix:"):
            continue
        if tag_name in _IX_REMOVE_TAGS:
            tag.decompose()
        else:
            tag.unwrap()


def _is_hidden_tag(tag: Tag) -> bool:
    """Judge whether a tag is hidden.

    Args:
        tag: HTML tag.

    Returns:
        whether it is hidden.

    Raises:
        RuntimeError: raised when the check fails.
    """

    if tag.name in {"html", "body"}:
        return False
    if tag.attrs is None:
        return False
    if tag.has_attr("hidden"):
        return True
    aria_hidden = tag.get("aria-hidden")
    if aria_hidden is not None and str(aria_hidden).strip().lower() == "true":
        return True
    # Only do string processing when the style attribute is present, avoiding needless
    # overhead for the many tags without a style attribute.
    raw_style = tag.get("style")
    if raw_style:
        style = str(raw_style).replace(" ", "").lower()
        if any(token in style for token in _HIDDEN_STYLE_TOKENS):
            return True
    return False


def _get_body_or_root(soup: BeautifulSoup) -> Tag:
    """Get the body tag or return the root node.

    Args:
        soup: BeautifulSoup parse object.

    Returns:
        the body tag or the root node.

    Raises:
        RuntimeError: raised when the fetch fails.
    """

    if soup.body:
        return soup.body
    return soup


def _get_default_section_ref(sections: list[_SectionBlock]) -> Optional[str]:
    """Compute the default section ref for the no-heading case.

    Args:
        sections: section list.

    Returns:
        default section ref or None.

    Raises:
        RuntimeError: raised when the computation fails.
    """

    if len(sections) != 1:
        return None
    section = sections[0]
    if section.contains_full_text:
        return section.ref
    return None


def _build_sections(root: Tag) -> list[_SectionBlock]:
    """Build the section structure.

    Args:
        root: HTML root node (body or soup).

    Returns:
        section list.

    Raises:
        RuntimeError: raised when parsing fails.
    """

    headings = _extract_heading_tags(root)
    if not headings:
        full_text = _normalize_whitespace(root.get_text(separator=" ", strip=True))
        preview = full_text[:_PREVIEW_MAX_CHARS]
        return [
            _SectionBlock(
                ref=_format_section_ref(1),
                title=None,
                level=1,
                parent_ref=None,
                preview=preview,
                heading_tag=None,
                next_heading_tag=None,
                table_refs=[],
                contains_full_text=True,
            )
        ]

    parent_refs = _compute_parent_refs(headings)
    # Precompute the id set of all table tags to speed up the _is_within_table check
    table_tag_ids = frozenset(id(t) for t in root.find_all("table"))
    sections: list[_SectionBlock] = []

    for index, heading_tag in enumerate(headings):
        next_heading = headings[index + 1] if index + 1 < len(headings) else None
        title = _normalize_whitespace(heading_tag.get_text(separator=" ", strip=True))
        preview = _extract_preview_text(
            heading_tag, next_heading, _PREVIEW_MAX_CHARS, table_tag_ids
        )
        ref = _format_section_ref(index + 1)
        level = _heading_level(heading_tag)
        sections.append(
            _SectionBlock(
                ref=ref,
                title=title,
                level=level,
                parent_ref=parent_refs.get(id(heading_tag)),
                preview=preview,
                heading_tag=heading_tag,
                next_heading_tag=next_heading,
                table_refs=[],
                contains_full_text=False,
            )
        )

    return sections


def _build_heading_ref_map(sections: list[_SectionBlock]) -> dict[int, str]:
    """Build the mapping from heading Tags to section refs.

    Args:
        sections: section list.

    Returns:
        heading tag id -> ref mapping.

    Raises:
        RuntimeError: raised when the build fails.
    """

    mapping: dict[int, str] = {}
    for section in sections:
        if section.heading_tag is None:
            continue
        mapping[id(section.heading_tag)] = section.ref
    return mapping


def _attach_tables_to_sections(
    sections: list[_SectionBlock],
    tables: list[_TableBlock],
) -> list[_SectionBlock]:
    """Attach a table ref to a section.

    Args:
        sections: section list.
        tables: table list.

    Returns:
        updated section list.

    Raises:
        RuntimeError: raised when processing fails.
    """

    section_by_ref = {section.ref: section for section in sections}
    fallback_full_text_section_ref: Optional[str] = None
    for section in sections:
        section.table_refs = []
        if section.contains_full_text:
            fallback_full_text_section_ref = section.ref

    for table in tables:
        target_ref = table.section_ref
        if target_ref and target_ref in section_by_ref:
            section_by_ref[target_ref].table_refs.append(table.ref)
            continue
        if fallback_full_text_section_ref is not None:
            section_by_ref[fallback_full_text_section_ref].table_refs.append(table.ref)

    return sections


def _build_tables(
    root: Tag,
    heading_ref_map: dict[int, str],
    default_section_ref: Optional[str],
    *,
    extra_layout_check: Optional[Callable[[int, int, str], bool]] = None,
) -> list[_TableBlock]:
    """Build the table structure.

    Args:
        root: HTML root node (body or soup).
        heading_ref_map: heading tag id -> section ref mapping.
        default_section_ref: default section ref.
        extra_layout_check: optional domain-specific layout-detection callback,
            signature ``(row_count, col_count, normalized_text) -> bool``.

    Returns:
        table list.

    Raises:
        RuntimeError: raised when parsing fails.
    """

    tables: list[_TableBlock] = []
    tables_with_refs = _collect_tables_with_section_refs(
        root=root,
        heading_ref_map=heading_ref_map,
        default_section_ref=default_section_ref,
    )
    # Precompute the id set of all table tags to speed up the _is_within_table check
    # inside _extract_context_before
    table_tag_ids = frozenset(id(t) for t in root.find_all("table"))

    for index, (table_tag, section_ref) in enumerate(tables_with_refs):
        ref = _format_table_ref(index + 1)
        caption = _extract_caption(table_tag)
        # performance: the build phase only uses the matrix to extract dimensions and headers,
        # DataFrame parsing is deferred to _render_table_data (at read time) on demand,
        # avoid running pd.read_html(StringIO(str(tag))) on every table.
        matrix = _extract_table_matrix(table_tag)
        row_count, col_count = _count_table_dimensions(None, matrix)
        headers = _extract_headers(None, matrix, table_tag)
        has_spans = _has_complex_spans(table_tag)
        context_before = _extract_context_before(table_tag, table_tag_ids=table_tag_ids)
        # strip header noise and infer the caption from preceding text when missing
        context_before = _clean_page_header_noise(context_before)
        if caption is None and context_before:
            caption = _infer_caption_from_context(context_before)
        # extract table full text for enhanced classification
        table_text = _safe_table_text(table_tag)
        table_type = _classify_table_type(
            row_count=row_count,
            col_count=col_count,
            headers=headers,
            context_before=context_before,
            table_text=table_text,
            extra_layout_check=extra_layout_check,
        )

        tables.append(
            _TableBlock(
                ref=ref,
                tag=table_tag,
                caption=caption,
                row_count=row_count,
                col_count=col_count,
                headers=headers,
                section_ref=section_ref,
                context_before=context_before,
                table_type=table_type,
                has_spans=has_spans,
            )
        )

    return tables


def _collect_tables_with_section_refs(
    *,
    root: Tag,
    heading_ref_map: dict[int, str],
    default_section_ref: Optional[str],
) -> list[tuple[Tag, Optional[str]]]:
    """Collect tables and their owning-section mapping in a single DOM pass.

    This implementation linearly scans the document along ``root.descendants``,
    maintaining only a single ``current_section_ref`` cursor:

    1. on hitting a heading node, update the current section;
    2. on hitting a ``table`` node, record ``(table_tag, section_ref)``.

    Compared with "reverse find_previous per table to locate its heading", this
    implementation reduces the complexity from
    ``O(table_count * reverse_dom_scan)`` to ``O(dom_size)``.

    Args:
        root: HTML root node (body or soup).
        heading_ref_map: heading tag id -> section ref mapping.
        default_section_ref: fallback section ref for documents without headings.

    Returns:
        ``(table_tag, section_ref)`` list in DOM order.

    Raises:
        RuntimeError: raised when iteration fails.
    """

    table_entries: list[tuple[Tag, Optional[str]]] = []
    current_section_ref: Optional[str] = default_section_ref
    for node in root.descendants:
        if not isinstance(node, Tag):
            continue
        section_ref = heading_ref_map.get(id(node))
        if section_ref is not None:
            current_section_ref = section_ref
            continue
        if node.name != "table":
            continue
        table_entries.append((node, current_section_ref))
    return table_entries


def _extract_heading_tags(root: Tag) -> list[Tag]:
    """Extract valid heading tags.

    Args:
        root: HTML root node (body or soup).

    Returns:
        heading tag list.

    Raises:
        RuntimeError: raised when parsing fails.
    """

    headings: list[Tag] = []
    for tag in root.find_all(_HEADING_TAGS):
        title = _normalize_whitespace(tag.get_text(separator=" ", strip=True))
        if len(title) < 3:
            continue
        headings.append(tag)
    return headings


def _compute_parent_refs(headings: list[Tag]) -> dict[int, Optional[str]]:
    """Compute parent_ref from heading levels.

    Args:
        headings: heading tag list.

    Returns:
        heading tag id -> parent_ref mapping.

    Raises:
        RuntimeError: raised when the computation fails.
    """

    stack: list[tuple[int, str, Tag]] = []
    parent_refs: dict[int, Optional[str]] = {}

    for index, heading_tag in enumerate(headings):
        level = _heading_level(heading_tag)
        ref = _format_section_ref(index + 1)
        while stack and stack[-1][0] >= level:
            stack.pop()
        parent_refs[id(heading_tag)] = stack[-1][1] if stack else None
        stack.append((level, ref, heading_tag))

    return parent_refs


def _heading_level(tag: Tag) -> int:
    """Get the heading level.

    Args:
        tag: heading tag.

    Returns:
        heading level (1-based).

    Raises:
        ValueError: raised when the tag is not a heading.
    """

    if not tag.name or not tag.name.startswith("h"):
        raise ValueError("not a heading tag")
    return int(tag.name[1])


def _extract_preview_text(
    heading_tag: Tag,
    next_heading_tag: Optional[Tag],
    max_chars: int,
    table_tag_ids: Optional[frozenset[int]] = None,
) -> str:
    """Extract section preview text.

    Args:
        heading_tag: current heading tag.
        next_heading_tag: next heading tag.
        max_chars: maximum character count.
        table_tag_ids: optional precomputed set of table tag ids, speeding up _is_within_table checks.

    Returns:
        preview text.

    Raises:
        RuntimeError: raised when extraction fails.
    """

    text_parts: list[str] = []
    for node in _iter_elements_between(heading_tag, next_heading_tag):
        if isinstance(node, Tag) and node.name in _HEADING_TAGS:
            break
        if _is_within_table(node, table_tag_ids):
            continue
        if isinstance(node, Tag):
            text = _normalize_whitespace(node.get_text(separator=" ", strip=True))
            if text:
                text_parts.append(text)
        if isinstance(node, NavigableString):
            text = _normalize_whitespace(str(node))
            if text:
                text_parts.append(text)
        if sum(len(part) for part in text_parts) >= max_chars:
            break

    preview = " ".join(text_parts)
    return preview[:max_chars]


def _iter_nodes_between(start: Tag, end: Optional[Tag]) -> Iterable[Any]:
    """Iterate sibling nodes between two nodes.

    Args:
        start: start node.
        end: end node (exclusive).

    Returns:
        node iterator.

    Raises:
        RuntimeError: raised when iteration fails.
    """

    current = start.find_next_sibling()
    while current and current != end:
        yield current
        current = current.find_next_sibling()


def _iter_elements_between(start: Tag, end: Optional[Tag]) -> Iterable[Any]:
    """Iterate document-order elements between two nodes.

    Args:
        start: start node.
        end: end node (exclusive).

    Returns:
        node iterator.

    Raises:
        RuntimeError: raised when iteration fails.
    """

    for node in start.next_elements:
        if node == end:
            break
        yield node


def _extract_caption(table_tag: Tag) -> Optional[str]:
    """Extract the table caption.

    Args:
        table_tag: table tag.

    Returns:
        caption text.

    Raises:
        RuntimeError: raised when extraction fails.
    """

    if table_tag.caption:
        caption_text = table_tag.caption.get_text(separator=" ", strip=True)
        return _normalize_whitespace(caption_text) or None
    return None


def _extract_table_matrix(table_tag: Tag) -> list[list[str]]:
    """Extract a table matrix from HTML.

    Args:
        table_tag: table tag.

    Returns:
        row/column matrix.

    Raises:
        RuntimeError: raised when extraction fails.
    """

    rows: list[list[str]] = []
    for row in table_tag.find_all("tr"):
        cells = row.find_all(["th", "td"])
        if not cells:
            continue
        rows.append(
            [_normalize_whitespace(cell.get_text(separator=" ", strip=True)) for cell in cells]
        )
    return rows


def _count_table_dimensions(
    df: Optional[pd.DataFrame],
    matrix: list[list[str]],
) -> tuple[int, int]:
    """Count the table's rows and columns.

    Args:
        df: DataFrame.
        matrix: HTML matrix.

    Returns:
        row count, column count.

    Raises:
        RuntimeError: raised when the count fails.
    """

    if df is not None:
        return len(df.index), len(df.columns)
    if not matrix:
        return 0, 0
    return len(matrix), max(len(row) for row in matrix)


def _extract_headers(
    df: Optional[pd.DataFrame],
    matrix: list[list[str]],
    table_tag: Tag,
) -> Optional[list[str]]:
    """Extract row headers (reusing the `headers` field).

    Args:
        df: DataFrame.
        matrix: HTML matrix.
        table_tag: table tag.

    Returns:
        table header list or None.

    Raises:
        RuntimeError: raised when extraction fails.
    """

    row_headers_from_df = _extract_row_headers_from_dataframe(df)
    if row_headers_from_df:
        return row_headers_from_df

    row_headers_from_matrix = _extract_row_headers_from_matrix(matrix)
    if row_headers_from_matrix:
        return row_headers_from_matrix

    th_headers = _extract_headers_from_th(table_tag)
    if th_headers:
        return th_headers[:10]

    if df is not None:
        headers = [str(item) for item in df.columns.tolist()]
        if _looks_like_default_headers(headers):
            return _select_matrix_headers(matrix)
        return headers[:10] if headers else None

    return _select_matrix_headers(matrix)


def _extract_row_headers_from_dataframe(df: Optional[pd.DataFrame]) -> Optional[list[str]]:
    """Extract row headers from a DataFrame.

    Args:
        df: DataFrame.

    Returns:
        row header list or `None`.

    Raises:
        RuntimeError: raised when extraction fails.
    """

    if df is None or df.empty:
        return None
    candidates: list[str] = []
    for row in df.itertuples(index=False, name=None):
        header = _pick_row_header_from_values(list(row))
        if header:
            candidates.append(header)
    normalized = _normalize_header_candidates(candidates)
    if not normalized or _looks_like_default_headers(normalized):
        return None
    return normalized[:10]


def _extract_row_headers_from_matrix(matrix: list[list[str]]) -> Optional[list[str]]:
    """Extract row headers from the matrix's first column.

    Args:
        matrix: table matrix.

    Returns:
        row header list or `None`.

    Raises:
        RuntimeError: raised when extraction fails.
    """

    if not matrix:
        return None
    candidates: list[str] = []
    for row in matrix:
        if not row:
            continue
        header = _pick_row_header_from_values(row[:3])
        if header:
            candidates.append(header)
    normalized = _normalize_header_candidates(candidates)
    if not normalized or _looks_like_default_headers(normalized):
        return None
    return normalized[:10]


def _pick_row_header_from_values(values: list[Any]) -> str:
    """Pick the first high-information candidate from a single row of values.

    Args:
        values: in-row candidate values.

    Returns:
        row header text; empty string on a miss.

    Raises:
        RuntimeError: raised when extraction fails.
    """

    for value in values:
        text = _normalize_whitespace(str(value))
        if not text:
            continue
        if _is_low_information_header(text):
            continue
        return text
    return ""


def _normalize_header_candidates(candidates: list[str]) -> list[str]:
    """Normalize candidate header texts and deduplicate.

    Args:
        candidates: candidate list.

    Returns:
        normalized list.

    Raises:
        RuntimeError: raised when processing fails.
    """

    normalized: list[str] = []
    for item in candidates:
        value = _normalize_whitespace(item)
        if not value:
            continue
        normalized.append(value)
    return _deduplicate_headers(normalized)


def _deduplicate_headers(headers: list[str]) -> list[str]:
    """Deduplicate by occurrence order, keeping the first occurrence.

    Args:
        headers: raw header list.

    Returns:
        deduplicated list (duplicates removed outright).

    Raises:
        RuntimeError: raised when deduplication fails.
    """

    seen: set[str] = set()
    deduped: list[str] = []
    for item in headers:
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def _has_complex_spans(table_tag: Tag) -> bool:
    """Judge whether a table spans multiple rows/columns.

    Args:
        table_tag: table tag.

    Returns:
        whether it spans multiple rows/columns.

    Raises:
        RuntimeError: raised when detection fails.
    """

    # Perf optimization: use lazy descendants iteration instead of find_all's full collection;
    # return on the first row/column span, avoiding building the complete cell list.
    for node in table_tag.descendants:
        if not isinstance(node, Tag):
            continue
        if node.name not in ("th", "td"):
            continue
        if node.has_attr("rowspan") or node.has_attr("colspan"):
            try:
                if (
                    _coerce_span_value(node.get("rowspan")) > 1
                    or _coerce_span_value(node.get("colspan")) > 1
                ):
                    return True
            except ValueError:
                return True
    return False


def _coerce_span_value(value: Any) -> int:
    """Convert an HTML span attribute value to an integer.

    Args:
        value: raw span attribute value.

    Returns:
        coerced integer; empty values default to 1.

    Raises:
        ValueError: raised when the value is invalid.
    """

    if value is None:
        return 1
    normalized_value = str(value).strip()
    if not normalized_value:
        return 1
    return int(normalized_value)


def _extract_headers_from_th(table_tag: Tag) -> Optional[list[str]]:
    """Extract table headers from th tags.

    Args:
        table_tag: table tag.

    Returns:
        table header list or None.

    Raises:
        RuntimeError: raised when extraction fails.
    """

    for row in table_tag.find_all("tr"):
        header_cells = row.find_all("th")
        if not header_cells:
            continue
        headers = [
            _normalize_whitespace(cell.get_text(separator=" ", strip=True)) for cell in header_cells
        ]
        headers = [item for item in headers if item]
        if headers:
            return headers
    return None


def _looks_like_default_headers(headers: list[str]) -> bool:
    """Judge whether this is a default index header (e.g. 0,1,2 or Unnamed).

    Args:
        headers: table header list.

    Returns:
        whether it is a default header.

    Raises:
        RuntimeError: raised when the check fails.
    """

    cleaned = [header.strip() for header in headers if str(header).strip()]
    if not cleaned:
        return True
    if all(_is_low_information_header(item) for item in cleaned):
        return True
    if all(str(item).lower().startswith("unnamed") for item in cleaned):
        return True
    # Must use isdecimal() rather than isdigit(): isdigit() also treats
    # Unicode digit symbols such as `①`, `¹` as True, but int() cannot parse those characters.
    if all(str(item).isdecimal() for item in cleaned):
        numbers = [int(item) for item in cleaned]
        start = numbers[0]
        return numbers == list(range(start, start + len(numbers)))
    return False


def _is_low_information_header(value: str) -> bool:
    """Judge whether this is low-information header text.

    Args:
        value: text to judge.

    Returns:
        whether it is low-information.

    Raises:
        RuntimeError: raised when the check fails.
    """

    normalized = value.strip().lower()
    if not normalized:
        return True
    if normalized in _LOW_INFO_TOKENS:
        return True
    if normalized.startswith("unnamed"):
        return True
    if re.fullmatch(r"[\d\s,\.\-\+\(\)%$¥€]+", normalized):
        return True
    return False


def _select_matrix_headers(matrix: list[list[str]]) -> Optional[list[str]]:
    """Select a reasonable header row from the matrix.

    Args:
        matrix: HTML matrix.

    Returns:
        table header list or None.

    Raises:
        RuntimeError: raised when selection fails.
    """

    for row in matrix:
        normalized = [_normalize_whitespace(cell) for cell in row]
        normalized = [cell for cell in normalized if cell]
        if not normalized:
            continue
        if _looks_like_default_headers(normalized):
            continue
        return row[:10]
    return None


def _is_within_table(node: Any, table_tag_ids: Optional[frozenset[int]] = None) -> bool:
    """Judge whether a node is inside a table.

    When ``table_tag_ids`` (the ``id()`` set of all ``<table>`` tags) is provided,
    walk up the parent chain and do a hash lookup, avoiding the string-comparison
    cost of BS4's ``find_parent("table")``.

    Args:
        node: BeautifulSoup node.
        table_tag_ids: optional precomputed set of table tag ids.

    Returns:
        whether it is inside a table.

    Raises:
        RuntimeError: raised when the check fails.
    """

    if table_tag_ids is not None:
        # fast path: walk up parent nodes checking whether the id is in the table set
        tag = node if isinstance(node, Tag) else getattr(node, 'parent', None)
        while tag is not None:
            if id(tag) in table_tag_ids:
                return True
            tag = tag.parent
        return False
    # Fallback path: use BS4's native find_parent when no precomputed set is available
    if isinstance(node, Tag):
        return node.find_parent("table") is not None or node.name == "table"
    if isinstance(node, NavigableString):
        parent = node.parent
        if isinstance(parent, Tag):
            return parent.find_parent("table") is not None or parent.name == "table"
    return False


def _extract_context_before(
    table_tag: Tag,
    max_chars: int = 200,
    table_tag_ids: Optional[frozenset[int]] = None,
) -> str:
    """Extract the context text preceding the table.

    Args:
        table_tag: table tag.
        max_chars: maximum character count.
        table_tag_ids: optional precomputed set of table tag ids, speeding up _is_within_table checks.

    Returns:
        context text.

    Raises:
        RuntimeError: raised when extraction fails.
    """

    text_parts: list[str] = []
    total_len = 0

    for node in table_tag.previous_elements:
        if node == table_tag:
            continue
        if isinstance(node, Tag):
            if node.name in _HEADING_TAGS:
                break
            if node.name == "table":
                break
            if _is_hidden_tag(node):
                continue
        if _is_within_table(node, table_tag_ids):
            continue
        if isinstance(node, NavigableString):
            text = _normalize_whitespace(str(node))
            if not text:
                continue
            text_parts.append(text)
            total_len += len(text)
            if total_len >= max_chars:
                break

    if not text_parts:
        # fall back to sibling-node scanning to improve hit rate on complex DOMs.
        sibling = table_tag.find_previous_sibling()
        while sibling is not None:
            if isinstance(sibling, Tag):
                if sibling.name in _HEADING_TAGS:
                    break
                if sibling.name == "table":
                    break
                if not _is_hidden_tag(sibling):
                    text = _normalize_whitespace(sibling.get_text(separator=" ", strip=True))
                    if text:
                        text_parts.append(text)
                        if sum(len(part) for part in text_parts) >= max_chars:
                            break
            sibling = sibling.find_previous_sibling()
    if not text_parts:
        return ""
    text_parts.reverse()
    full_text = " ".join(text_parts)
    if len(full_text) > max_chars:
        return full_text[-max_chars:]
    return full_text


def _classify_table_type(
    *,
    row_count: int,
    col_count: int,
    headers: Optional[list[str]],
    context_before: str,
    table_text: str = "",
    extra_layout_check: Optional[Callable[[int, int, str], bool]] = None,
) -> str:
    """Lightweight type classification for tables.

    Classification rule priority:
    1. Tiny tables (≤2 rows, ≤3 columns, and text < 16 chars) → ``layout``
    2. Default column headers (numeric index / Unnamed) → ``layout``
    3. No column headers and too-short preceding text → ``layout``
    4. Domain extension rules (injected via the ``extra_layout_check`` callback) → ``layout``
    5. Everything else → ``data``

    Args:
        row_count: row count.
        col_count: column count.
        headers: row header list.
        context_before: preceding text.
        table_text: table full text (used for enhanced classification).
        extra_layout_check: optional domain-specific callback.
            signature ``(row_count, col_count, normalized_text) -> bool``,
            returns ``True`` when the table should be marked as ``layout``.
            lets upper layers (e.g. the fins layer) inject domain-specific layout-detection rules,
            instead of hard-coding business knowledge in the generic engine layer.

    Returns:
        ``data`` or ``layout``.

    Raises:
        RuntimeError: raised when classification fails.
    """

    normalized_text = _normalize_whitespace(table_text)
    # Rule 1: tiny table (few rows, few columns, very short text)
    if row_count <= 2 and col_count <= 3 and (not normalized_text or len(normalized_text) < 16):
        return "layout"
    # Rule 2: default index headers (e.g. 0,1,2 or Unnamed)
    if headers and _looks_like_default_headers(headers):
        return "layout"
    # Rule 3: no column headers and too-short preceding text
    if not headers and len(context_before.strip()) < 12:
        return "layout"
    # Rule 4: domain extension rules (injected by the caller)
    if extra_layout_check and extra_layout_check(row_count, col_count, normalized_text or ""):
        return "layout"
    return "data"


def _safe_table_text(table_tag: Tag) -> str:
    """Safely extract table plain text (for classification checks).

    Args:
        table_tag: table HTML tag.

    Returns:
        table text; empty string when extraction fails.

    Raises:
        RuntimeError: raised when processing fails.
    """
    try:
        return table_tag.get_text(separator=" ", strip=True)
    except Exception:
        return ""


def _render_section_text(
    root: Tag,
    section: _SectionBlock,
    *,
    table_ref_by_tag_id: Optional[dict[int, str]] = None,
) -> str:
    """Render section text, replacing tables with placeholders.

    Args:
        root: HTML root node (body or soup).
        section: section object.
        table_ref_by_tag_id: optional `table_tag_id -> table_ref` mapping.

    Returns:
        section text.

    Raises:
        RuntimeError: raised when rendering fails.
    """

    table_refs = list(section.table_refs)
    table_counter = 0
    text_parts: list[str] = []

    def _append_node_text(node: Any) -> None:
        nonlocal table_counter
        if isinstance(node, NavigableString):
            normalized = _normalize_whitespace(str(node))
            if normalized:
                text_parts.append(normalized)
            return
        if not isinstance(node, Tag):
            return
        if node.name == "table":
            mapped_ref = None
            if table_ref_by_tag_id is not None:
                mapped_ref = table_ref_by_tag_id.get(id(node))
            if mapped_ref is None:
                mapped_ref = (
                    table_refs[table_counter]
                    if table_counter < len(table_refs)
                    else _format_table_ref(table_counter + 1)
                )
            text_parts.append(f"[[{mapped_ref}]]")
            table_counter += 1
            return
        for child in node.children:
            _append_node_text(child)

    if section.heading_tag is None:
        for node in root.children:
            _append_node_text(node)
    else:
        for node in _iter_nodes_between(section.heading_tag, section.next_heading_tag):
            _append_node_text(node)
    return _normalize_whitespace(" ".join(text_parts))


def _section_to_summary(section: _SectionBlock) -> SectionSummary:
    """Convert a section object to a summary.

    Args:
        section: section object.

    Returns:
        section summary.

    Raises:
        RuntimeError: raised when conversion fails.
    """

    return build_section_summary(
        ref=section.ref,
        title=section.title,
        level=section.level,
        parent_ref=section.parent_ref,
        preview=section.preview,
    )


def _table_to_summary(table: _TableBlock) -> TableSummary:
    """Convert a table object to a summary.

    Args:
        table: table object.

    Returns:
        table summary.

    Raises:
        RuntimeError: raised when conversion fails.
    """

    return build_table_summary(
        table_ref=table.ref,
        caption=table.caption,
        context_before=table.context_before,
        row_count=table.row_count,
        col_count=table.col_count,
        table_type=table.table_type,
        headers=table.headers,
        section_ref=table.section_ref,
    )


def _render_table_data(
    table: _TableBlock,
) -> tuple[str, Any, Optional[list[str]]]:
    """Render table data.

    Perf optimization: first use table attributes to predict whether the
    markdown path applies; when it definitely does, skip the expensive
    pd.read_html call. The DataFrame is only parsed on the records path.

    Args:
        table: table object.

    Returns:
        data_format, data, columns.

    Raises:
        RuntimeError: raised when rendering fails.
    """

    # Fast path: use the matrix directly when the markdown path is known, skipping pd.read_html
    if _can_skip_dataframe(table):
        matrix = _extract_table_matrix(table.tag)
        markdown = _build_markdown_table(matrix)
        return "markdown", markdown, None

    # Regular path: need a DataFrame to detect duplicate columns etc.
    df = parse_html_table_dataframe(table.tag)
    matrix = _extract_table_matrix(table.tag)

    use_markdown = _should_use_markdown(df, table, matrix)
    if use_markdown:
        markdown = _build_markdown_table(matrix)
        return "markdown", markdown, None

    records, columns = _build_records(df, matrix)
    return "records", records, columns


def _can_skip_dataframe(table: _TableBlock) -> bool:
    """Judge whether DataFrame parsing can be skipped at render time.

    Returns True when the table attributes already determine that the markdown
    path applies, avoiding the expensive ``pd.read_html(StringIO(str(tag)))``.

    Args:
        table: table object.

    Returns:
        whether DataFrame parsing can be skipped.
    """

    # has_spans → _should_use_markdown always returns True
    if table.has_spans:
        return True
    # oversized table → _should_use_markdown always returns True
    if table.col_count > 25 or table.row_count > 500:
        return True
    # no rows/cols → matrix is empty → _should_use_markdown always returns True
    if table.row_count == 0:
        return True
    return False


def _should_use_markdown(
    df: Optional[pd.DataFrame],
    table: _TableBlock,
    matrix: list[list[str]],
) -> bool:
    """Judge whether markdown output is used.

    Args:
        df: DataFrame.
        table: table object.
        matrix: HTML matrix.

    Returns:
        whether to use markdown.

    Raises:
        RuntimeError: raised when the check fails.
    """

    if table.has_spans:
        return True
    if df is not None and df.columns.has_duplicates:
        return True
    if table.col_count > 25 or table.row_count > 500:
        return True
    if not matrix:
        return True
    return False


def _build_records(
    df: Optional[pd.DataFrame],
    matrix: list[list[str]],
) -> tuple[list[dict[str, Any]], Optional[list[str]]]:
    """Build the records output.

    Args:
        df: DataFrame.
        matrix: HTML matrix.

    Returns:
        records list and columns.

    Raises:
        RuntimeError: raised when the build fails.
    """

    if df is None:
        columns, records = _records_from_matrix(matrix)
        return records, columns

    records = df.to_dict(orient="records")
    normalized_records: list[dict[str, Any]] = []
    for row in records:
        normalized_row = {str(key): _normalize_cell_value(value) for key, value in row.items()}
        normalized_records.append(normalized_row)
    columns = [str(col) for col in df.columns.tolist()]
    return normalized_records, columns


def _records_from_matrix(matrix: list[list[str]]) -> tuple[list[str], list[dict[str, Any]]]:
    """Build records from the matrix.

    Args:
        matrix: HTML matrix.

    Returns:
        columns and records.

    Raises:
        RuntimeError: raised when the build fails.
    """

    if not matrix:
        return [], []
    headers = matrix[0]
    body = matrix[1:]
    columns = headers
    records: list[dict[str, Any]] = []
    for row in body:
        row_values = row + [""] * max(0, len(columns) - len(row))
        record = {columns[i]: row_values[i] for i in range(len(columns))}
        records.append(record)
    return columns, records


def _build_markdown_table(matrix: list[list[str]]) -> str:
    """Build a markdown table.

    Args:
        matrix: HTML matrix.

    Returns:
        markdown string.

    Raises:
        RuntimeError: raised when the build fails.
    """

    if not matrix:
        return ""

    col_count = max(len(row) for row in matrix)
    header = matrix[0] + [""] * max(0, col_count - len(matrix[0]))
    body = matrix[1:]

    lines = [
        _render_markdown_row(header, col_count),
        "| " + " | ".join(["---"] * col_count) + " |",
    ]
    for row in body:
        lines.append(_render_markdown_row(row, col_count))
    return "\n".join(lines)


def _render_markdown_row(row: list[str], col_count: int) -> str:
    """Render a markdown table row.

    Args:
        row: row data.
        col_count: column count.

    Returns:
        markdown row string.

    Raises:
        RuntimeError: raised when rendering fails.
    """

    row_values = row + [""] * max(0, col_count - len(row))
    return "| " + " | ".join(row_values) + " |"


@overload
def _normalize_cell_value(value: None) -> None: ...


@overload
def _normalize_cell_value(value: str) -> str: ...


@overload
def _normalize_cell_value(value: float) -> float | None: ...


@overload
def _normalize_cell_value(value: _CellValueT) -> _CellValueT: ...


def _normalize_cell_value(
    value: _CellValueT | str | float | None,
) -> _CellValueT | str | float | None:
    """Normalize a table cell value.

    Args:
        value: raw value.

    Returns:
        normalized value.

    Raises:
        RuntimeError: raised when processing fails.
    """

    if value is None:
        return None
    if isinstance(value, float) and pd.isna(value):
        return None
    if isinstance(value, str):
        return _normalize_whitespace(value)
    return value
