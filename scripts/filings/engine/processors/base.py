"""Processor protocol definitions."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any, NotRequired, Optional, Protocol, TypedDict

from .source import Source


class SectionSummary(TypedDict):
    """Section summary structure."""

    ref: str
    title: str | None
    level: int
    parent_ref: str | None
    preview: str
    page_range: NotRequired[list[int] | None]
    internal_ref: NotRequired[str | None]


class TableSummary(TypedDict):
    """Table summary structure."""

    table_ref: str
    caption: str | None
    context_before: str
    row_count: int
    col_count: int
    table_type: str
    headers: list[str] | None
    section_ref: str | None
    page_no: NotRequired[int | None]
    internal_ref: NotRequired[str | None]
    is_financial: NotRequired[bool]


class SectionContent(TypedDict):
    """Section content structure."""

    ref: str
    title: str | None
    content: str
    tables: list[str]
    word_count: int
    contains_full_text: bool
    children: NotRequired[list[SectionSummary]]
    page_range: NotRequired[list[int] | None]
    internal_ref: NotRequired[str | None]


class TableContent(TypedDict):
    """Table content structure."""

    table_ref: str
    caption: str | None
    data_format: str
    data: Sequence[Mapping[str, object]] | str
    columns: list[str] | None
    row_count: int
    col_count: int
    section_ref: str | None
    table_type: str
    page_no: NotRequired[int | None]
    internal_ref: NotRequired[str | None]
    is_financial: NotRequired[bool]


class SearchEvidence(TypedDict):
    """Search hit evidence structure."""

    matched_text: str
    context: str


class SearchHit(TypedDict, total=False):
    """Search hit structure."""

    section_ref: str
    section_title: str | None
    snippet: str
    page_no: int
    evidence: SearchEvidence
    _token_fallback: bool


class PageContentResult(TypedDict):
    """Page content structure."""

    page_no: int
    sections: list[SectionSummary]
    tables: list[TableSummary]
    text_preview: str
    has_content: bool
    total_items: int
    supported: bool


def build_section_summary(
    *,
    ref: str,
    title: str | None,
    level: int,
    parent_ref: str | None,
    preview: str,
    page_range: list[int] | None = None,
    internal_ref: str | None = None,
) -> SectionSummary:
    """Build a section summary."""

    result: SectionSummary = {
        "ref": ref,
        "title": title,
        "level": level,
        "parent_ref": parent_ref,
        "preview": preview,
    }
    if page_range is not None:
        result["page_range"] = page_range
    if internal_ref is not None:
        result["internal_ref"] = internal_ref
    return result


def build_table_summary(
    *,
    table_ref: str,
    caption: str | None,
    context_before: str,
    row_count: int,
    col_count: int,
    table_type: str,
    headers: list[str] | None,
    section_ref: str | None,
    page_no: int | None = None,
    internal_ref: str | None = None,
    is_financial: bool | None = None,
) -> TableSummary:
    """Build a table summary."""

    result: TableSummary = {
        "table_ref": table_ref,
        "caption": caption,
        "context_before": context_before,
        "row_count": row_count,
        "col_count": col_count,
        "table_type": table_type,
        "headers": headers,
        "section_ref": section_ref,
    }
    if page_no is not None:
        result["page_no"] = page_no
    if internal_ref is not None:
        result["internal_ref"] = internal_ref
    if is_financial is not None:
        result["is_financial"] = is_financial
    return result


def build_section_content(
    *,
    ref: str,
    title: str | None,
    content: str,
    tables: list[str],
    word_count: int,
    contains_full_text: bool,
    page_range: list[int] | None = None,
    internal_ref: str | None = None,
) -> SectionContent:
    """Build section content."""

    result: SectionContent = {
        "ref": ref,
        "title": title,
        "content": content,
        "tables": tables,
        "word_count": word_count,
        "contains_full_text": contains_full_text,
    }
    if page_range is not None:
        result["page_range"] = page_range
    if internal_ref is not None:
        result["internal_ref"] = internal_ref
    return result


def build_table_content(
    *,
    table_ref: str,
    caption: Optional[str],
    data_format: str,
    data: Sequence[Mapping[str, object]] | str,
    columns: Optional[list[str]],
    row_count: int,
    col_count: int,
    section_ref: Optional[str],
    table_type: str,
    **extra: Any,
) -> TableContent:
    """Factory function for building a TableContent dict.

    Centralizes the 9 common fields duplicated across the three processors'
    read_table() implementations, so each processor only needs to pass the
    rendered result plus differing fields (page_no, internal_ref, is_financial,
    etc.) via ``**extra``.

    Args:
        table_ref: table reference identifier.
        caption: table caption.
        data_format: data format ("records" / "markdown").
        data: rendered table data.
        columns: list of column names.
        row_count: row count.
        col_count: column count.
        section_ref: owning section reference.
        table_type: table type.
        **extra: processor-specific extra fields (page_no, internal_ref, is_financial, etc.).

    Returns:
        TableContent dict.
    """
    result: TableContent = {
        "table_ref": table_ref,
        "caption": caption,
        "data_format": data_format,
        "data": data,
        "columns": columns,
        "row_count": row_count,
        "col_count": col_count,
        "section_ref": section_ref,
        "table_type": table_type,
    }
    page_no = extra.get("page_no")
    if isinstance(page_no, int):
        result["page_no"] = page_no
    internal_ref = extra.get("internal_ref")
    if isinstance(internal_ref, str):
        result["internal_ref"] = internal_ref
    is_financial = extra.get("is_financial")
    if isinstance(is_financial, bool):
        result["is_financial"] = is_financial
    return result


def build_search_hit(
    *,
    section_ref: str,
    section_title: str | None,
    snippet: str | None = None,
    page_no: int | None = None,
    evidence: SearchEvidence | None = None,
    token_fallback: bool = False,
) -> SearchHit:
    """Build a search hit."""

    result: SearchHit = {
        "section_ref": section_ref,
        "section_title": section_title,
    }
    if snippet is not None:
        result["snippet"] = snippet
    if page_no is not None:
        result["page_no"] = page_no
    if evidence is not None:
        result["evidence"] = evidence
    if token_fallback:
        result["_token_fallback"] = True
    return result


def build_page_content_result(
    *,
    page_no: int,
    sections: list[SectionSummary],
    tables: list[TableSummary],
    text_preview: str,
    has_content: bool,
    total_items: int,
    supported: bool,
) -> PageContentResult:
    """Build a page content result."""

    return {
        "page_no": page_no,
        "sections": sections,
        "tables": tables,
        "text_preview": text_preview,
        "has_content": has_content,
        "total_items": total_items,
        "supported": supported,
    }


class DocumentProcessor(Protocol):
    """Document processor protocol."""

    @classmethod
    def get_parser_version(cls) -> str:
        """Return the processor parser version."""

        ...

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
            form_type: document type.
            media_type: media type.

        Returns:
            None.

        Raises:
            ValueError: raised when an argument is invalid.
        """

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
            form_type: document type.
            media_type: media type.

        Returns:
            whether it is supported.

        Raises:
            OSError: may be raised when file access fails.
        """

        ...

    def list_sections(
        self,
    ) -> list[SectionSummary]:
        """Read the section list.

        Args:
            None.

        Returns:
            section summary list.

        Raises:
            RuntimeError: raised when the read fails.
        """

        ...

    def list_tables(
        self,
    ) -> list[TableSummary]:
        """Read the table list.

        Args:
            None.

        Returns:
            table summary list.

        Raises:
            RuntimeError: raised when the read fails.
        """

        ...

    def read_section(self, ref: str) -> SectionContent:
        """Read section content by ref.

        Args:
            ref: section reference.

        Returns:
            section content.

        Raises:
            KeyError: raised when the section is not found.
        """

        ...

    def read_table(self, table_ref: str) -> TableContent:
        """Read table content by ref.

        Args:
            table_ref: table reference.

        Returns:
            table content.

        Raises:
            KeyError: raised when the table is not found.
        """

        ...

    def get_section_title(self, ref: str) -> Optional[str]:
        """Get a section title by section ref.

        O(1) lookup; used by the service layer to attach section context to tables etc.
        lighter than read_section() -- no full SectionContent is built.

        Args:
            ref: section reference.

        Returns:
            section title string; None when the ref does not exist.
        """

        ...

    def search(
        self,
        query: str,
        within_ref: Optional[str] = None,
    ) -> list[SearchHit]:
        """Search within a document.

        Args:
            query: search term.
            within_ref: optional section scope.

        Returns:
            hit list.

        Raises:
            RuntimeError: raised when the search fails.
        """

        ...

    def get_full_text(self) -> str:
        """Get the document's full plain-text content (including table text).

        return the document full text as plain text, keeping all table text content,
        no placeholder replacement. Suitable for scenarios needing full-text analysis (e.g. section splitting
        marker detection).

        Args:
            None.

        Returns:
            full document plain-text string.

        Raises:
            RuntimeError: raised when extraction fails.
        """

        ...

    def get_full_text_with_table_markers(self) -> str:
        """Get the document full text, replacing non-layout tables with ``[[t_XXXX]]`` placeholders.

        unlike ``get_full_text()``, this method replaces each non-layout table
        replaced with the corresponding ``[[t_XXXX]]`` placeholders before text extraction. The placeholder
        numbering matches the ``table_ref`` returned by ``list_tables()``.

        purpose: after full-text splitting, virtual-section processors resolve placeholders to determine which table
        falls into, building the table->virtual_section mapping.

        processors without DOM-level table-marker injection should return an empty string, meaning
        lacks this capability, the upper layer degrades safely.

        Args:
            None.

        Returns:
            full document text string with ``[[t_XXXX]]`` placeholders;
            an empty string when unsupported.

        Raises:
            RuntimeError: raised when extraction fails.
        """

        ...


class PageAwareProcessor(Protocol):
    """Pagination capability protocol."""

    def get_page_content(self, page_no: int) -> PageContentResult:
        """Read page content.

        Args:
            page_no: page number, 1-based.

        Returns:
            page content result.

        Raises:
            ValueError: raised when the page number is invalid.
        """

        ...
