"""FinsToolService return-value type definitions.

This module defines structured return types (TypedDict) for every public method
of FinsToolService, removing ``dict[str, Any]`` from method signatures so that
consumers get compile-time key checking.

Design principles:
- ``total=True`` by default (all fields Required); only conditionally present
  keys are annotated ``NotRequired``.
- Deeply nested structures (a single match / row / fact etc.) stay
  ``dict[str, Any]`` and can be narrowed further as needed.
- ``get_financial_statement`` and ``query_xbrl_facts`` keep ``total=False``
  because the processor output is spread dynamically via ``**spread``; they are
  bridged with ``cast``.
- ``NotSupportedResult`` is the shared return type of three degradation paths;
  because ``payload.update()`` attaches fields dynamically, it keeps
  ``total=False`` and is bridged with ``cast``.
"""

from __future__ import annotations

from typing import Any, NotRequired, TypedDict

# ---------------------------------------------------------------------------
# Shared sub-structures
# ---------------------------------------------------------------------------


class ErrorDetail(TypedDict):
    """Tool error details."""

    code: str
    message: str


class CompanyInfo(TypedDict):
    """Company basic information."""

    ticker: str
    name: str
    market: str


class ListDocumentsFilters(TypedDict):
    """list_documents filter-condition echo."""

    document_types: list[str] | None
    fiscal_years: list[int] | None
    fiscal_periods: list[str] | None


# ---------------------------------------------------------------------------
# NotSupportedResult — shared by the three degradation paths
# ---------------------------------------------------------------------------


class _NotSupportedBase(TypedDict):
    """Base fields of the degraded return; always filled by ``_build_not_supported_result``."""

    ticker: str
    document_id: str
    supported: bool
    error: ErrorDetail


class NotSupportedResult(_NotSupportedBase, total=False):
    """Degraded return structure when the capability is not supported.

    The base fields (ticker, document_id, supported, error) are always present
    (inherited as Required); each method's degradation path attaches its echo
    fields dynamically via ``payload.update()``, so this stays ``total=False``
    and is used together with ``cast()``.
    """

    # Echo fields that each method's degradation path may attach
    page_no: int
    statement_type: str
    concepts: list[str]


# ---------------------------------------------------------------------------
# list_documents
# ---------------------------------------------------------------------------


class ListDocumentsResult(TypedDict):
    """``list_documents`` return structure."""

    company: CompanyInfo
    filters: ListDocumentsFilters
    recommended_documents: dict[str, str | None]
    documents: list[dict[str, Any]]
    total: int
    matched: int
    match_status: str
    suggestion: NotRequired[dict[str, Any]]


# ---------------------------------------------------------------------------
# get_document_sections
# ---------------------------------------------------------------------------


class DocumentSectionsResult(TypedDict):
    """``get_document_sections`` return structure."""

    ticker: str
    document_id: str
    sections: list[dict[str, Any]]
    citation: dict[str, Any]


# ---------------------------------------------------------------------------
# read_section
# ---------------------------------------------------------------------------


class SectionContentResult(TypedDict):
    """``read_section`` return structure.

    All fields are assigned unconditionally; the values of ``title`` / ``item`` /
    ``topic`` / ``page_range`` may be ``None``.
    """

    ticker: str
    document_id: str
    ref: str
    title: str | None
    item: str | None
    topic: str | None
    content: str
    children: list[dict[str, str]]
    page_range: list[int] | None
    content_word_count: int
    citation: dict[str, Any]


# ---------------------------------------------------------------------------
# search_document (single query + batch query)
# ---------------------------------------------------------------------------


class SearchDocumentResult(TypedDict):
    """``search_document`` return structure.

    Shared by the single-query and batch-query paths. Common always-present
    fields default to Required; path-differing fields use ``NotRequired``:

    - single query: always has ``next_section_to_read``, no ``queries`` / ``next_section_by_query``
    - batch query: always has ``queries`` / ``next_section_by_query``, no ``next_section_to_read``
    - ``hint`` appears only when there is a search hint
    - ``diagnostics`` is internal-only; it is ``pop``ped by the ``fins_tools.py`` wrapper layer
    """

    ticker: str
    document_id: str
    query: str | None
    mode: str
    searched_in: str
    match_quality: dict[str, Any]
    matches: list[dict[str, Any]]
    total_matches: int
    citation: dict[str, Any]
    # Path-differing fields
    queries: NotRequired[list[str]]
    next_section_to_read: NotRequired[dict[str, Any] | None]
    next_section_by_query: NotRequired[dict[str, dict[str, Any] | None]]
    hint: NotRequired[str]
    diagnostics: NotRequired[dict[str, Any]]


# ---------------------------------------------------------------------------
# list_tables
# ---------------------------------------------------------------------------


class TablesListResult(TypedDict):
    """``list_tables`` return structure."""

    ticker: str
    document_id: str
    tables: list[dict[str, Any]]
    total: int
    financial_count: int
    citation: dict[str, Any]


# ---------------------------------------------------------------------------
# get_table
# ---------------------------------------------------------------------------


class TableDetailResult(TypedDict):
    """``get_table`` return structure.

    Always-present fields default to Required; ``within_section`` / ``caption`` /
    ``page_no`` are attached only when the data exists.
    """

    ticker: str
    document_id: str
    table_ref: str
    data: dict[str, Any]
    row_count: int
    col_count: int
    is_financial: bool
    table_type: str | None
    citation: dict[str, Any]
    within_section: NotRequired[dict[str, str]]
    caption: NotRequired[str]
    page_no: NotRequired[int]


# ---------------------------------------------------------------------------
# get_page_content
# ---------------------------------------------------------------------------


class PageContentResult(TypedDict):
    """``get_page_content`` return structure."""

    ticker: str
    document_id: str
    page_no: int
    sections: list[dict[str, Any]]
    tables: list[dict[str, Any]]
    text_preview: str
    has_content: bool
    total_items: int
    supported: bool
    citation: dict[str, Any]


# ---------------------------------------------------------------------------
# get_financial_statement
# ---------------------------------------------------------------------------


class StatementLocator(TypedDict, total=False):
    """Financial statement locator information."""

    statement_type: str
    period_labels: list[str]
    row_labels: list[str]


class _FinancialStatementBase(TypedDict):
    """Service-layer and processor core fields."""

    ticker: str
    document_id: str
    citation: dict[str, Any]
    statement_type: str
    currency: str | None
    units: str | None
    rows: list[dict[str, Any]]
    statement_locator: StatementLocator


class FinancialStatementResult(_FinancialStatementBase, total=False):
    """``get_financial_statement`` return structure.

    Core fields are inherited from ``_FinancialStatementBase`` (Required);
    extra fields the processor may attach stay ``NotRequired``.
    Because the processor output is ``dict[str, Any]``, the whole structure is
    bridged with ``cast``.
    """

    # Extra fields the processor may attach
    period_labels: list[str]
    column_headers: list[str]
    header: dict[str, Any]
    supported: bool


# ---------------------------------------------------------------------------
# query_xbrl_facts
# ---------------------------------------------------------------------------


class _XbrlQueryParamsBase(TypedDict):
    """Core fields of the query parameters."""

    concepts: list[str]


class XbrlQueryParams(_XbrlQueryParamsBase, total=False):
    """XBRL query parameter echo."""

    statement_type: str | None
    period_end: str | None
    fiscal_year: int | None
    fiscal_period: str | None
    min_value: float | None
    max_value: float | None


class _XbrlQueryBase(TypedDict):
    """Fields guaranteed by the Service + normalizer layer."""

    ticker: str
    document_id: str
    citation: dict[str, Any]
    query_params: XbrlQueryParams
    facts: list[dict[str, Any]]
    total: int


class XbrlQueryResult(_XbrlQueryBase, total=False):
    """``query_xbrl_facts`` return structure.

    Core fields are inherited from ``_XbrlQueryBase`` (Required);
    because the lower layer merges fields via ``**normalized_payload`` spread,
    the whole structure is bridged with ``cast``.
    """

    # Extra fields the processor may attach
    supported: bool
