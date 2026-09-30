"""Financial-report tool limit configuration."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class FinsToolLimits:
    """Financial-report tool limit configuration.

    Attributes:
        processor_cache_max_entries: maximum Processor cache entries (LRU only, no TTL).
        list_documents_max_items: maximum document entries returned by `list_documents`.
        get_document_sections_max_items: maximum section entries returned by `get_document_sections`.
        search_document_max_items: maximum hit entries returned by `search_document`.
        list_tables_max_items: maximum table entries returned by `list_tables`.
        read_section_max_chars: maximum text characters for `read_section` (beyond this ToolRegistry truncates).
        get_page_content_max_chars: maximum text characters for `get_page_content` (beyond this ToolRegistry truncates).
        get_table_max_items: maximum list entries in `get_table`.
        get_financial_statement_max_items: maximum list entries returned by `get_financial_statement`.
        query_xbrl_facts_max_items: maximum list entries returned by `query_xbrl_facts`.
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
