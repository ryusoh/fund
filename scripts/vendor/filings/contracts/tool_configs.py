"""Cross-layer shared tool-config contracts.

This module hosts stable tool-config objects that flow between
``Service / Contracts / Host / Engine / Fins``, and provides helper functions
for restoring dedicated configs from the generic ``ToolsetConfigSnapshot``.
"""

from __future__ import annotations

from dataclasses import dataclass

from scripts.vendor.filings.contracts.toolset_config import (
    ToolsetConfigSnapshot,
    build_toolset_config_snapshot,
    coerce_toolset_config_float,
    coerce_toolset_config_int,
    find_toolset_config,
    replace_toolset_config,
)


@dataclass(frozen=True)
class DocToolLimits:
    """Document-tool limits config.

    Args:
        list_files_max: maximum files returned by ``list_files``.
        get_sections_max: maximum sections returned by ``get_file_sections``.
        search_files_max_results: maximum hits returned by ``search_files``.
        read_file_max_chars: maximum characters returned by ``read_file``.
        read_file_section_max_chars: maximum characters returned by ``read_file_section``.

    Returns:
        None.

    Raises:
        None.
    """

    list_files_max: int = 200
    get_sections_max: int = 200
    search_files_max_results: int = 50
    read_file_max_chars: int = 80_000
    read_file_section_max_chars: int = 50_000


@dataclass(frozen=True)
class FinsToolLimits:
    """Filings-tool limits config.

    Args:
        processor_cache_max_entries: maximum Processor cache entries.
        list_documents_max_items: maximum document entries returned by ``list_documents``.
        get_document_sections_max_items: maximum section entries returned by ``get_document_sections``.
        search_document_max_items: maximum hit entries returned by ``search_document``.
        list_tables_max_items: maximum table entries returned by ``list_tables``.
        read_section_max_chars: maximum text characters for ``read_section``.
        get_page_content_max_chars: maximum text characters for ``get_page_content``.
        get_table_max_items: maximum list entries returned by ``get_table``.
        get_financial_statement_max_items: maximum list entries returned by ``get_financial_statement``.
        query_xbrl_facts_max_items: maximum list entries returned by ``query_xbrl_facts``.

    Returns:
        None.

    Raises:
        None.
    """

    processor_cache_max_entries: int = 128
    list_documents_max_items: int = 300
    get_document_sections_max_items: int = 1200
    search_document_max_items: int = 20
    list_tables_max_items: int = 50
    read_section_max_chars: int = 80000
    get_page_content_max_chars: int = 80000
    get_table_max_items: int = 800
    get_financial_statement_max_items: int = 1200
    query_xbrl_facts_max_items: int = 1200


@dataclass(frozen=True)
class WebToolsConfig:
    """Web-tools config.

    Args:
        provider: provider policy.
        request_timeout_seconds: HTTP request timeout in seconds.
        max_search_results: result-count limit for ``search_web``.
        fetch_truncate_chars: body truncation character limit for ``fetch_web_page``.
        allow_private_network_url: whether access to private/local network URLs is allowed.
        playwright_channel: Chromium channel used by the browser fallback.
        playwright_storage_state_dir: Playwright storage state directory.

    Returns:
        None.

    Raises:
        None.
    """

    provider: str = "auto"
    request_timeout_seconds: float = 12.0
    max_search_results: int = 20
    fetch_truncate_chars: int = 80000
    allow_private_network_url: bool = False
    playwright_channel: str = "chrome"
    playwright_storage_state_dir: str = "output/web_diagnostics/storage_states"


def build_doc_tool_limits(snapshot: ToolsetConfigSnapshot | None) -> DocToolLimits:
    """Restore document-tool limits from a generic toolset snapshot.

    Args:
        snapshot: generic config snapshot of the document tool.

    Returns:
        restored document-tool limits config.

    Raises:
        TypeError: raised when a snapshot field has an invalid type.
    """

    payload = snapshot.payload if snapshot is not None else {}
    defaults = DocToolLimits()
    return DocToolLimits(
        list_files_max=coerce_toolset_config_int(
            payload.get("list_files_max"),
            field_name="doc.list_files_max",
            default=defaults.list_files_max,
        ),
        get_sections_max=coerce_toolset_config_int(
            payload.get("get_sections_max"),
            field_name="doc.get_sections_max",
            default=defaults.get_sections_max,
        ),
        search_files_max_results=coerce_toolset_config_int(
            payload.get("search_files_max_results"),
            field_name="doc.search_files_max_results",
            default=defaults.search_files_max_results,
        ),
        read_file_max_chars=coerce_toolset_config_int(
            payload.get("read_file_max_chars"),
            field_name="doc.read_file_max_chars",
            default=defaults.read_file_max_chars,
        ),
        read_file_section_max_chars=coerce_toolset_config_int(
            payload.get("read_file_section_max_chars"),
            field_name="doc.read_file_section_max_chars",
            default=defaults.read_file_section_max_chars,
        ),
    )


def build_fins_tool_limits(snapshot: ToolsetConfigSnapshot | None) -> FinsToolLimits:
    """Restore filings-tool limits from a generic toolset snapshot.

    Args:
        snapshot: generic config snapshot of the filings tool.

    Returns:
        restored filings-tool limits config.

    Raises:
        TypeError: raised when a snapshot field has an invalid type.
    """

    payload = snapshot.payload if snapshot is not None else {}
    defaults = FinsToolLimits()
    return FinsToolLimits(
        processor_cache_max_entries=coerce_toolset_config_int(
            payload.get("processor_cache_max_entries"),
            field_name="fins.processor_cache_max_entries",
            default=defaults.processor_cache_max_entries,
        ),
        list_documents_max_items=coerce_toolset_config_int(
            payload.get("list_documents_max_items"),
            field_name="fins.list_documents_max_items",
            default=defaults.list_documents_max_items,
        ),
        get_document_sections_max_items=coerce_toolset_config_int(
            payload.get("get_document_sections_max_items"),
            field_name="fins.get_document_sections_max_items",
            default=defaults.get_document_sections_max_items,
        ),
        search_document_max_items=coerce_toolset_config_int(
            payload.get("search_document_max_items"),
            field_name="fins.search_document_max_items",
            default=defaults.search_document_max_items,
        ),
        list_tables_max_items=coerce_toolset_config_int(
            payload.get("list_tables_max_items"),
            field_name="fins.list_tables_max_items",
            default=defaults.list_tables_max_items,
        ),
        read_section_max_chars=coerce_toolset_config_int(
            payload.get("read_section_max_chars"),
            field_name="fins.read_section_max_chars",
            default=defaults.read_section_max_chars,
        ),
        get_page_content_max_chars=coerce_toolset_config_int(
            payload.get("get_page_content_max_chars"),
            field_name="fins.get_page_content_max_chars",
            default=defaults.get_page_content_max_chars,
        ),
        get_table_max_items=coerce_toolset_config_int(
            payload.get("get_table_max_items"),
            field_name="fins.get_table_max_items",
            default=defaults.get_table_max_items,
        ),
        get_financial_statement_max_items=coerce_toolset_config_int(
            payload.get("get_financial_statement_max_items"),
            field_name="fins.get_financial_statement_max_items",
            default=defaults.get_financial_statement_max_items,
        ),
        query_xbrl_facts_max_items=coerce_toolset_config_int(
            payload.get("query_xbrl_facts_max_items"),
            field_name="fins.query_xbrl_facts_max_items",
            default=defaults.query_xbrl_facts_max_items,
        ),
    )


def build_web_tools_config(snapshot: ToolsetConfigSnapshot | None) -> WebToolsConfig:
    """Restore web-tool config from a generic toolset snapshot.

    Args:
        snapshot: generic config snapshot of the web tool.

    Returns:
        restored web-tool config.

    Raises:
        TypeError: raised when a snapshot field has an invalid type.
    """

    payload = snapshot.payload if snapshot is not None else {}
    defaults = WebToolsConfig()
    return WebToolsConfig(
        provider=str(payload.get("provider", defaults.provider)),
        request_timeout_seconds=coerce_toolset_config_float(
            payload.get("request_timeout_seconds"),
            field_name="web.request_timeout_seconds",
            default=defaults.request_timeout_seconds,
        ),
        max_search_results=coerce_toolset_config_int(
            payload.get("max_search_results"),
            field_name="web.max_search_results",
            default=defaults.max_search_results,
        ),
        fetch_truncate_chars=coerce_toolset_config_int(
            payload.get("fetch_truncate_chars"),
            field_name="web.fetch_truncate_chars",
            default=defaults.fetch_truncate_chars,
        ),
        allow_private_network_url=bool(
            payload.get("allow_private_network_url", defaults.allow_private_network_url)
        ),
        playwright_channel=str(payload.get("playwright_channel", defaults.playwright_channel)),
        playwright_storage_state_dir=str(
            payload.get("playwright_storage_state_dir", defaults.playwright_storage_state_dir)
        ),
    )


def resolve_doc_tool_limits_from_toolset_configs(
    toolset_configs: tuple[ToolsetConfigSnapshot, ...],
) -> DocToolLimits | None:
    """Resolve document-tool limits from a toolset config sequence.

    Args:
        toolset_configs: generic toolset config snapshot sequence.

    Returns:
        matched document-tool limits; ``None`` when absent.

    Raises:
        TypeError: raised when a snapshot field has an invalid type.
    """

    snapshot = find_toolset_config(toolset_configs, "doc")
    if snapshot is None:
        return None
    return build_doc_tool_limits(snapshot)


def resolve_fins_tool_limits_from_toolset_configs(
    toolset_configs: tuple[ToolsetConfigSnapshot, ...],
) -> FinsToolLimits | None:
    """Resolve filings-tool limits from a toolset config sequence.

    Args:
        toolset_configs: generic toolset config snapshot sequence.

    Returns:
        matched filings-tool limits; ``None`` when absent.

    Raises:
        TypeError: raised when a snapshot field has an invalid type.
    """

    snapshot = find_toolset_config(toolset_configs, "fins")
    if snapshot is None:
        return None
    return build_fins_tool_limits(snapshot)


def resolve_web_tools_config_from_toolset_configs(
    toolset_configs: tuple[ToolsetConfigSnapshot, ...],
) -> WebToolsConfig | None:
    """Resolve web-tool config from a toolset config sequence.

    Args:
        toolset_configs: generic toolset config snapshot sequence.

    Returns:
        matched web-tool config; ``None`` when absent.

    Raises:
        TypeError: raised when a snapshot field has an invalid type.
    """

    snapshot = find_toolset_config(toolset_configs, "web")
    if snapshot is None:
        return None
    return build_web_tools_config(snapshot)


def build_legacy_toolset_configs(
    *,
    doc_tool_limits: DocToolLimits | None,
    fins_tool_limits: FinsToolLimits | None,
    web_tools_config: WebToolsConfig | None,
) -> tuple[ToolsetConfigSnapshot, ...]:
    """Fold a dedicated tool config into a generic toolset config snapshot.

    Args:
        doc_tool_limits: document-tool limits config.
        fins_tool_limits: filings-tool limits config.
        web_tools_config: web-tools config.

    Returns:
        normalized generic toolset config sequence.

    Raises:
        TypeError: raised when the config object cannot be serialized.
        ValueError: raised when the toolset name is invalid.
    """

    snapshots: tuple[ToolsetConfigSnapshot, ...] = ()
    for snapshot in (
        build_toolset_config_snapshot("doc", doc_tool_limits),
        build_toolset_config_snapshot("fins", fins_tool_limits),
        build_toolset_config_snapshot("web", web_tools_config),
    ):
        if snapshot is None:
            continue
        snapshots = replace_toolset_config(snapshots, snapshot)
    return snapshots


__all__ = [
    "DocToolLimits",
    "FinsToolLimits",
    "WebToolsConfig",
    "build_doc_tool_limits",
    "build_fins_tool_limits",
    "build_legacy_toolset_configs",
    "build_web_tools_config",
    "resolve_doc_tool_limits_from_toolset_configs",
    "resolve_fins_tool_limits_from_toolset_configs",
    "resolve_web_tools_config_from_toolset_configs",
]
