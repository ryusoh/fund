"""Financial-report tool registration module (vendored subset: read tools only)."""

from __future__ import annotations

from typing import Any, Optional

from scripts.vendor.filings.contracts.tool_configs import FinsToolLimits
from scripts.vendor.filings.engine.tool_contracts import ToolTruncateSpec
from scripts.vendor.filings.engine.tool_registry import ToolRegistry
from scripts.vendor.filings.engine.tools.base import tool
from scripts.vendor.filings.log import Log

from .result_types import (
    DocumentSectionsResult,
    FinancialStatementResult,
    ListDocumentsResult,
    NotSupportedResult,
    PageContentResult,
    SearchDocumentResult,
    SectionContentResult,
    TableDetailResult,
    TablesListResult,
    XbrlQueryResult,
)
from .service import FinsToolService

MODULE = "FINS.FINS_TOOLS"
FINS_TOOL_TAGS = frozenset({"fins"})


def _resolve_service(
    *,
    service: Optional[FinsToolService],
) -> FinsToolService:
    """Resolve or construct a FinsToolService instance.

    Only reusing a prebuilt `FinsToolService` is allowed, so that the tool
    registration stage does not need to know repository-assembly details.

    Args:
        service: prebuilt FinsToolService instance.
    Returns:
        usable FinsToolService instance.

    Raises:
        ValueError: raised when no usable service can be resolved.
    """

    if service is not None:
        return service
    raise ValueError("a prebuilt FinsToolService instance is required")


def register_fins_read_tools(
    registry: ToolRegistry,
    *,
    service: FinsToolService,
    limits: Optional[FinsToolLimits] = None,
    timeout_budget: float | None = None,
) -> None:
    """Register the financial-report read-tool set.

    Args:
        registry: ToolRegistry instance.
        service: prebuilt FinsToolService instance.
        limits: optional tool limits config.
        timeout_budget: per-tool-call budget in seconds provided by the Runner; the fins read tools reserve this parameter
            not consumed yet.

    Returns:
        None.

    Raises:
        ValueError: raised when the config is invalid.
    """

    resolved_limits = limits or FinsToolLimits()
    resolved_service = _resolve_service(
        service=service,
    )

    # Read-tool factory function list (in registration order)
    read_tool_factories = [
        _create_list_documents_tool,
        _create_get_document_sections_tool,
        _create_read_section_tool,
        _create_search_document_tool,
        _create_list_tables_tool,
        _create_get_table_tool,
        _create_get_page_content_tool,
        _create_get_financial_statement_tool,
        _create_query_xbrl_facts_tool,
    ]

    del timeout_budget

    # Register the read tools in batch. The read tools are unified under a single fins tag.
    for factory in read_tool_factories:
        name, func, schema = factory(registry, resolved_service, resolved_limits)
        registry.register(name, func, schema)

    Log.verbose(f"registered {len(read_tool_factories)} financial-report read tools", module=MODULE)


def _create_list_documents_tool(
    registry: ToolRegistry,
    service: FinsToolService,
    limits: FinsToolLimits,
) -> tuple[str, Any, Any]:
    """Create the `list_documents` tool.

    Args:
        registry: tool registry instance.
        service: filings tool service instance.
        limits: filings-tool limits config.

    Returns:
        `(tool_name, tool_callable, tool_schema)` triple.

    Raises:
        ValueError: raised when the tool schema is invalid.
    """

    parameters = {
        "type": "object",
        "properties": {
            "ticker": {
                "type": "string",
                "description": "Pass the most natural form directly; do not hand-enumerate variants.",
            },
            "document_types": {
                "type": "array",
                "items": {
                    "type": "string",
                    "enum": [
                        "annual_report",
                        "semi_annual_report",
                        "quarterly_report",
                        "current_report",
                        "proxy",
                        "ownership",
                        "earnings_call",
                        "earnings_presentation",
                        "corporate_governance",
                        "material",
                    ],
                },
                "description": "Optional document-type filter. Fill only when you already know which document type you need; otherwise leave empty to see recommended documents first.",
            },
            "fiscal_years": {
                "type": "array",
                "items": {"type": "integer"},
                "description": "Optional fiscal-year filter. Fill only when you know the years, e.g. [2024, 2025].",
            },
            "fiscal_periods": {
                "type": "array",
                "items": {"type": "string", "enum": ["FY", "H1", "Q1", "Q2", "Q3", "Q4"]},
                "description": "Optional fiscal-period filter. Fill only when you know the period, e.g. FY, Q1, Q2.",
            },
        },
        "required": ["ticker"],
    }

    @tool(
        registry,
        name="list_documents",
        description=(
            "List a company's available documents. Use this tool to get document_id, then read sections, tables, or financial data."
        ),
        parameters=parameters,
        tags=FINS_TOOL_TAGS,
        display_name="List documents",
        summary_params=["ticker"],
        truncate=ToolTruncateSpec(
            enabled=True,
            strategy="list_items",
            limits={"max_items": limits.list_documents_max_items},
            target_field="documents",
        ),
    )
    def list_documents(
        ticker: str,
        document_types: Optional[list[str]] = None,
        fiscal_years: Optional[list[int]] = None,
        fiscal_periods: Optional[list[str]] = None,
    ) -> ListDocumentsResult:
        """List available documents.

        Args:
            ticker: ticker.
            document_types: optional document-type filter (enum array).
            fiscal_years: optional fiscal-year filter.
            fiscal_periods: optional fiscal-period filter.

        Returns:
            document list result.

        Raises:
            ToolArgumentError: raised when an argument is invalid.
        """

        return service.list_documents(
            ticker=ticker,
            document_types=document_types,
            fiscal_years=fiscal_years,
            fiscal_periods=fiscal_periods,
        )

    return list_documents.__tool_name__, list_documents, list_documents.__tool_schema__


def _create_get_document_sections_tool(
    registry: ToolRegistry,
    service: FinsToolService,
    limits: FinsToolLimits,
) -> tuple[str, Any, Any]:
    """Create the `get_document_sections` tool.

    Args:
        registry: tool registry instance.
        service: filings tool service instance.
        limits: filings-tool limits config.

    Returns:
        `(tool_name, tool_callable, tool_schema)` triple.

    Raises:
        ValueError: raised when the tool schema is invalid.
    """

    parameters = {
        "type": "object",
        "properties": {
            "ticker": {
                "type": "string",
            },
            "document_id": {
                "type": "string",
            },
        },
        "required": ["ticker", "document_id"],
    }

    @tool(
        registry,
        name="get_document_sections",
        description="Read the document section structure and return a list of locatable section refs.",
        parameters=parameters,
        tags=FINS_TOOL_TAGS,
        display_name="Browse filing structure",
        summary_params=["ticker"],
        truncate=ToolTruncateSpec(
            enabled=True,
            strategy="list_items",
            limits={"max_items": limits.get_document_sections_max_items},
            target_field="sections",
        ),
    )
    def get_document_sections(ticker: str, document_id: str) -> DocumentSectionsResult:
        """Get the document section structure.

        Args:
            ticker: ticker.
            document_id: document ID.

        Returns:
            section structure result.

        Raises:
            ToolArgumentError: raised when an argument is invalid.
        """

        return service.get_document_sections(ticker=ticker, document_id=document_id)

    return (
        get_document_sections.__tool_name__,
        get_document_sections,
        get_document_sections.__tool_schema__,
    )


def _create_read_section_tool(
    registry: ToolRegistry,
    service: FinsToolService,
    limits: FinsToolLimits,
) -> tuple[str, Any, Any]:
    """Create the `read_section` tool.

    Args:
        registry: tool registry instance.
        service: filings tool service instance.
        limits: filings-tool limits config.

    Returns:
        `(tool_name, tool_callable, tool_schema)` triple.

    Raises:
        ValueError: raised when the tool schema is invalid.
    """

    parameters = {
        "type": "object",
        "properties": {
            "ticker": {
                "type": "string",
            },
            "document_id": {
                "type": "string",
            },
            "ref": {
                "type": "string",
                "description": "Section ref. Must come from `get_document_sections` `sections[].ref`, `search_document` `next_section_to_read.section.ref`, or `search_document` `next_section_by_query[*].section.ref`. Valid only within the current `document_id`; after switching `document_id`, re-ground against the new document -- never reuse a `ref` from another `document_id`.",
            },
        },
        "required": ["ticker", "document_id", "ref"],
    }

    @tool(
        registry,
        name="read_section",
        description="Read the full text of a section. If [[t_XXXX]] appears in the body, use get_table(t_XXXX) to read the corresponding table.",
        parameters=parameters,
        tags=FINS_TOOL_TAGS,
        display_name="Read filing section",
        truncate=ToolTruncateSpec(
            enabled=True,
            strategy="text_chars",
            limits={"max_chars": limits.read_section_max_chars},
            target_field="content",
        ),
    )
    def read_section(
        ticker: str,
        document_id: str,
        ref: str,
        **_kwargs,
    ) -> SectionContentResult:
        """Read section body text.

        Args:
            ticker: ticker.
            document_id: document ID.
            ref: section reference.
            **_kwargs: legacy compatibility parameters (e.g. within_section_ref); all ignored.

        Returns:
            section content result.

        Raises:
            ToolArgumentError: raised when an argument is invalid.
        """
        _ = _kwargs

        return service.read_section(ticker=ticker, document_id=document_id, ref=ref)

    return read_section.__tool_name__, read_section, read_section.__tool_schema__


def _create_search_document_tool(
    registry: ToolRegistry,
    service: FinsToolService,
    limits: FinsToolLimits,
) -> tuple[str, Any, Any]:
    """Create the `search_document` tool.

    Args:
        registry: tool registry instance.
        service: filings tool service instance.
        limits: filings-tool limits config.

    Returns:
        `(tool_name, tool_callable, tool_schema)` triple.

    Raises:
        ValueError: raised when the tool schema is invalid.
    """

    parameters = {
        "type": "object",
        "properties": {
            "ticker": {
                "type": "string",
            },
            "document_id": {
                "type": "string",
            },
            "query": {
                "type": "string",
                "description": "Single search term. Use when searching for one concept; avoid bare numbers, bare percentages, or overly broad words.",
            },
            "queries": {
                "type": "array",
                "items": {"type": "string"},
                "maxItems": 20,
                "description": "Use for multi-keyword search, up to 20 at a time; mutually exclusive with query. Only combine terms that serve the same topic.",
            },
            "within_section_ref": {
                "type": "string",
                "description": "Section ref. Use it to narrow the scope when there are too many results.",
            },
            "mode": {
                "type": "string",
                "enum": ["auto", "exact", "keyword", "semantic"],
                "description": "Search mode. Usually auto; specify manually only when you explicitly want exact-phrase or keyword matching.",
            },
        },
        "required": ["ticker", "document_id"],
    }

    @tool(
        registry,
        name="search_document",
        description=(
            "Search within a document to locate relevant sections. Find the top hit first, then prefer read_section(top_match.ref) for careful reading; do not keep guessing by paging."
        ),
        parameters=parameters,
        tags=FINS_TOOL_TAGS,
        display_name="Search document",
        summary_params=["query"],
        truncate=ToolTruncateSpec(
            enabled=True,
            strategy="list_items",
            limits={"max_items": limits.search_document_max_items},
            target_field="matches",
            continuation_hint={
                "continuation_required": False,
                "continuation_priority": None,
                "next_action": "read_section on matched section.ref to get full context, or narrow with within_section_ref",
            },
        ),
    )
    def search_document(
        ticker: str,
        document_id: str,
        query: Optional[str] = None,
        queries: Optional[list[str]] = None,
        within_section_ref: Optional[str] = None,
        mode: Optional[str] = None,
    ) -> SearchDocumentResult:
        """Search a document.

        Args:
            ticker: ticker.
            document_id: document ID.
            query: single search term (mutually exclusive with queries).
            queries: batch search terms (mutually exclusive with query, max 20).
            within_section_ref: optional section scope.
            mode: search mode (auto/exact/keyword/semantic).

        Returns:
            search result.

        Raises:
            ToolArgumentError: raised when an argument is invalid.
        """

        result = service.search_document(
            ticker=ticker,
            document_id=document_id,
            query=query,
            queries=queries,
            within_section_ref=within_section_ref,
            mode=mode,
            display_budget=limits.search_document_max_items,
        )
        # strip internal diagnostics; do not expose to the LLM
        result.pop("diagnostics", None)
        return result

    return search_document.__tool_name__, search_document, search_document.__tool_schema__


def _create_list_tables_tool(
    registry: ToolRegistry,
    service: FinsToolService,
    limits: FinsToolLimits,
) -> tuple[str, Any, Any]:
    """Create the `list_tables` tool.

    Args:
        registry: tool registry instance.
        service: filings tool service instance.
        limits: filings-tool limits config.

    Returns:
        `(tool_name, tool_callable, tool_schema)` triple.

    Raises:
        ValueError: raised when the tool schema is invalid.
    """

    parameters = {
        "type": "object",
        "properties": {
            "ticker": {
                "type": "string",
            },
            "document_id": {
                "type": "string",
            },
            "financial_only": {
                "type": "boolean",
                "description": "Set to true only when you explicitly want financial-statement tables; otherwise keep the default false.",
                "default": False,
            },
            "within_section_ref": {
                "type": "string",
                "description": "Section ref. Fill when you only want tables from a specific section.",
            },
        },
        "required": ["ticker", "document_id"],
    }

    @tool(
        registry,
        name="list_tables",
        description="List the tables in the document and return a list of locatable table_refs.",
        parameters=parameters,
        tags=FINS_TOOL_TAGS,
        display_name="List tables",
        summary_params=["ticker"],
        truncate=ToolTruncateSpec(
            enabled=True,
            strategy="list_items",
            limits={"max_items": limits.list_tables_max_items},
            target_field="tables",
            continuation_hint={
                "continuation_required": False,
                "continuation_priority": None,
                "next_action": "use within_section_ref to narrow scope, or get_table for a specific table",
            },
        ),
    )
    def list_tables(
        ticker: str,
        document_id: str,
        financial_only: bool = False,
        within_section_ref: Optional[str] = None,
    ) -> TablesListResult:
        """List tables.

        Args:
            ticker: ticker.
            document_id: document ID.
            financial_only: whether to return only financial tables.
            within_section_ref: optional section scope.

        Returns:
            table list result.

        Raises:
            ToolArgumentError: raised when an argument is invalid.
        """

        return service.list_tables(
            ticker=ticker,
            document_id=document_id,
            financial_only=financial_only,
            within_section_ref=within_section_ref,
        )

    return list_tables.__tool_name__, list_tables, list_tables.__tool_schema__


def _create_get_table_tool(
    registry: ToolRegistry,
    service: FinsToolService,
    limits: FinsToolLimits,
) -> tuple[str, Any, Any]:
    """Create the `get_table` tool.

    Args:
        registry: tool registry instance.
        service: filings tool service instance.
        limits: filings-tool limits config.

    Returns:
        `(tool_name, tool_callable, tool_schema)` triple.

    Raises:
        ValueError: raised when the tool schema is invalid.
    """

    parameters = {
        "type": "object",
        "properties": {
            "ticker": {
                "type": "string",
            },
            "document_id": {
                "type": "string",
            },
            "table_ref": {
                "type": "string",
                "description": "Table ref. Must come from `list_tables` `tables[].table_ref` or a `[[t_XXXX]]` placeholder in `read_section` content. Valid only within the current `document_id`; after switching `document_id`, re-ground against the new document -- never reuse a `table_ref` from another `document_id`.",
            },
        },
        "required": ["ticker", "document_id", "table_ref"],
    }

    @tool(
        registry,
        name="get_table",
        description="Read a single table by table_ref.",
        parameters=parameters,
        tags=FINS_TOOL_TAGS,
        display_name="View table",
        truncate=ToolTruncateSpec(
            enabled=True,
            strategy="list_items",
            limits={"max_items": limits.get_table_max_items},
        ),
    )
    def get_table(ticker: str, document_id: str, table_ref: str) -> TableDetailResult:
        """Read a table.

        Args:
            ticker: ticker.
            document_id: document ID.
            table_ref: table reference.

        Returns:
            table result.

        Raises:
            ToolArgumentError: raised when an argument is invalid.
        """

        return service.get_table(ticker=ticker, document_id=document_id, table_ref=table_ref)

    return get_table.__tool_name__, get_table, get_table.__tool_schema__


def _create_get_page_content_tool(
    registry: ToolRegistry,
    service: FinsToolService,
    limits: FinsToolLimits,
) -> tuple[str, Any, Any]:
    """Create the `get_page_content` tool.

    Args:
        registry: tool registry instance.
        service: filings tool service instance.
        limits: filings-tool limits config.

    Returns:
        `(tool_name, tool_callable, tool_schema)` triple.

    Raises:
        ValueError: raised when the tool schema is invalid.
    """

    parameters = {
        "type": "object",
        "properties": {
            "ticker": {
                "type": "string",
            },
            "document_id": {
                "type": "string",
            },
            "page_no": {"type": "integer", "description": "Page number, 1-based.", "minimum": 1},
        },
        "required": ["ticker", "document_id", "page_no"],
    }

    @tool(
        registry,
        name="get_page_content",
        description="Read the content of the page by page number. Use only when a page_range already exists and same-page context needs to be filled in.",
        parameters=parameters,
        tags=FINS_TOOL_TAGS,
        display_name="Read page",
        summary_params=["ticker"],
        truncate=ToolTruncateSpec(
            enabled=True,
            strategy="text_chars",
            limits={"max_chars": limits.get_page_content_max_chars},
            target_field="text_preview",
        ),
    )
    def get_page_content(
        ticker: str, document_id: str, page_no: int
    ) -> PageContentResult | NotSupportedResult:
        """Read page content.

        Args:
            ticker: ticker.
            document_id: document ID.
            page_no: page number.

        Returns:
            page content result.

        Raises:
            ToolArgumentError: raised when an argument is invalid.
        """

        return service.get_page_content(ticker=ticker, document_id=document_id, page_no=page_no)

    return get_page_content.__tool_name__, get_page_content, get_page_content.__tool_schema__


def _create_get_financial_statement_tool(
    registry: ToolRegistry,
    service: FinsToolService,
    limits: FinsToolLimits,
) -> tuple[str, Any, Any]:
    """Create the `get_financial_statement` tool.

    Args:
        registry: tool registry instance.
        service: filings tool service instance.
        limits: filings-tool limits config.

    Returns:
        `(tool_name, tool_callable, tool_schema)` triple.

    Raises:
        ValueError: raised when the tool schema is invalid.
    """

    parameters = {
        "type": "object",
        "properties": {
            "ticker": {
                "type": "string",
            },
            "document_id": {
                "type": "string",
            },
            "statement_type": {
                "type": "string",
                "description": "Statement type. Usually start with income, balance_sheet, cash_flow; use equity or comprehensive_income only when explicitly needed.",
                "enum": ["income", "balance_sheet", "cash_flow", "equity", "comprehensive_income"],
            },
        },
        "required": ["ticker", "document_id", "statement_type"],
    }

    @tool(
        registry,
        name="get_financial_statement",
        description=("Read the standard financial statement."),
        parameters=parameters,
        tags=FINS_TOOL_TAGS,
        display_name="View financial statement",
        summary_params=["statement_type"],
        truncate=ToolTruncateSpec(
            enabled=True,
            strategy="list_items",
            limits={"max_items": limits.get_financial_statement_max_items},
            target_field="rows",
        ),
    )
    def get_financial_statement(
        ticker: str, document_id: str, statement_type: str
    ) -> FinancialStatementResult | NotSupportedResult:
        """Read financial statements.

        Args:
            ticker: ticker.
            document_id: document ID.
            statement_type: statement type.

        Returns:
            financial-statement result.

        Raises:
            ToolArgumentError: raised when an argument is invalid.
        """

        return service.get_financial_statement(
            ticker=ticker,
            document_id=document_id,
            statement_type=statement_type,
        )

    return (
        get_financial_statement.__tool_name__,
        get_financial_statement,
        get_financial_statement.__tool_schema__,
    )


def _create_query_xbrl_facts_tool(
    registry: ToolRegistry,
    service: FinsToolService,
    limits: FinsToolLimits,
) -> tuple[str, Any, Any]:
    """Create the `query_xbrl_facts` tool.

    Args:
        registry: tool registry instance.
        service: filings tool service instance.
        limits: filings-tool limits config.

    Returns:
        `(tool_name, tool_callable, tool_schema)` triple.

    Raises:
        ValueError: raised when the tool schema is invalid.
    """

    parameters = {
        "type": "object",
        "properties": {
            "ticker": {
                "type": "string",
            },
            "document_id": {
                "type": "string",
            },
            "concepts": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Optional XBRL concept list. Fill when you know the exact concept; otherwise leave empty to get the default concept set.",
                "minItems": 1,
            },
            "statement_type": {
                "type": "string",
                "description": "Optional statement-type filter. Fill only when you want to narrow results to a specific statement type.",
            },
            "period_end": {"type": "string", "description": "Optional period-end date filter, format YYYY-MM-DD."},
            "fiscal_year": {
                "type": "integer",
                "description": "Optional fiscal-year filter. Fill only when you know the year.",
            },
            "fiscal_period": {"type": "string", "description": "Optional fiscal-period filter, e.g. FY, Q1, Q2."},
            "min_value": {
                "type": "number",
                "description": "Optional minimum-value filter. Fill only when you want to exclude overly small values.",
            },
            "max_value": {
                "type": "number",
                "description": "Optional maximum-value filter. Fill only when you want to exclude overly large values.",
            },
        },
        "required": ["ticker", "document_id"],
    }

    @tool(
        registry,
        name="query_xbrl_facts",
        description="Query structured XBRL numeric facts.",
        parameters=parameters,
        tags=FINS_TOOL_TAGS,
        display_name="Query financial data",
        summary_params=["concepts"],  # list[str]; _build_param_preview expands it comma-separated
        truncate=ToolTruncateSpec(
            enabled=True,
            strategy="list_items",
            limits={"max_items": limits.query_xbrl_facts_max_items},
            target_field="facts",
        ),
    )
    def query_xbrl_facts(
        ticker: str,
        document_id: str,
        concepts: Optional[list[str]] = None,
        statement_type: Optional[str] = None,
        period_end: Optional[str] = None,
        fiscal_year: Optional[int] = None,
        fiscal_period: Optional[str] = None,
        min_value: Optional[float] = None,
        max_value: Optional[float] = None,
    ) -> XbrlQueryResult | NotSupportedResult:
        """Query XBRL facts.

        Args:
            ticker: ticker.
            document_id: document ID.
            concepts: optional concept list.
            statement_type: optional statement type.
            period_end: optional period-end date.
            fiscal_year: optional fiscal year.
            fiscal_period: optional fiscal period.
            min_value: optional minimum value.
            max_value: optional maximum value.

        Returns:
            query result.

        Raises:
            ToolArgumentError: raised when an argument is invalid.
        """

        return service.query_xbrl_facts(
            ticker=ticker,
            document_id=document_id,
            concepts=concepts,
            statement_type=statement_type,
            period_end=period_end,
            fiscal_year=fiscal_year,
            fiscal_period=fiscal_period,
            min_value=min_value,
            max_value=max_value,
        )

    return query_xbrl_facts.__tool_name__, query_xbrl_facts, query_xbrl_facts.__tool_schema__
