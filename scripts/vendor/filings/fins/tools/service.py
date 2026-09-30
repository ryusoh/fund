"""Financial-report tool service layer.

This module is the intermediate call layer between the financial-report tools
and the underlying storage/processors. Its responsibilities include:
- parameter validation and normalization.
- `document_id -> source_kind -> source -> processor` routing.
- unified capability degradation (`not_supported`).
- caching Processor instances only (key=`ticker + document_id`, LRU only).
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from threading import Lock, RLock
from typing import Any, Literal, Optional, cast

from scripts.vendor.filings.engine.exceptions import ToolArgumentError
from scripts.vendor.filings.engine.processors.base import (
    DocumentProcessor,
    SectionContent,
    SectionSummary,
    TableContent,
    TableSummary,
)
from scripts.vendor.filings.engine.processors.processor_registry import ProcessorRegistry
from scripts.vendor.filings.engine.tool_errors import ToolBusinessError
from scripts.vendor.filings.engine.tools.error_contract import ErrorCode
from scripts.vendor.filings.fins._converters import normalize_optional_text, require_non_empty_text
from scripts.vendor.filings.fins.domain.enums import SourceKind
from scripts.vendor.filings.fins.domain.tool_models import Citation, SourceType
from scripts.vendor.filings.fins.storage import (
    CompanyMetaRepositoryProtocol,
    ProcessedDocumentRepositoryProtocol,
    SourceDocumentRepositoryProtocol,
)
from scripts.vendor.filings.fins.ticker_normalization import try_normalize_ticker
from scripts.vendor.filings.log import Log

from .bm25f_scorer import BM25FSectionIndex, build_section_bm25f_index
from .cache import ProcessorCacheKey, ProcessorLRUCache
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
from .search_engine import (
    _build_empty_search_strategy_hit_counts,
    _build_evidence_matches,
    _build_section_semantic_profiles,
    _cap_entries_with_exact_priority,
    _deduplicate_ranked_search_entries,
    _diagnose_search_query,
    _execute_query_search,
    _resolve_search_mode,
    _resolve_search_queries,
    _sort_ranked_search_entries,
)

# Imports from the split-out modules (used directly by FinsToolService)
from .search_models import (
    _SEARCH_RANKING_VERSION,
    SectionSemanticProfile,
)
from .section_semantic import (
    build_section_path,
    resolve_section_semantic,
)
from .service_helpers import (
    _build_match_quality,
    _build_not_supported_result,
    _build_recommended_documents,
    _build_search_hint,
    _build_table_data_payload,
    _collect_available_document_types,
    _collect_parent_titles,
    _extract_page_range,
    _infer_fiscal_period,
    _infer_fiscal_year,
    _normalize_document_types,
    _normalize_form_type_for_matching,
    _normalize_periods,
    _normalize_section_children,
    _normalize_table_type,
    _normalize_xbrl_query_payload,
    _resolve_default_xbrl_concepts,
    _resolve_fiscal_period_with_fallback,
    _resolve_fiscal_year_with_fallback,
    _resolve_processor_taxonomy,
    build_document_recency_sort_key,
    build_search_next_section_fields,
    resolve_document_type_for_source,
    resolve_has_financial_data,
)

# Matches CJK unified ideographs (basic block + Extension A), used to detect
# whether a query contains Chinese characters
_CN_CHAR_RE = re.compile(r"[\u4e00-\u9fff\u3400-\u4dbf]")


def _any_query_has_chinese(queries: list[str]) -> bool:
    """Detect whether any query in the list contains Chinese characters."""
    return any(_CN_CHAR_RE.search(q) for q in queries)


# Action-guidance hints shown when a Chinese query gets no results (generic,
# does not assume the document language)
_CHINESE_QUERY_NO_RESULTS_HINT = (
    "Goal: rewrite the query into a form the document is more likely to match. "
    "Allowed action: replace the Chinese words with English keywords and search again. "
    "Not allowed: repeatedly retrying with the same Chinese words. Next step: for example, "
    "change the Chinese phrase to \"annual recurring revenue\" and search again."
)
_MISSING_TICKER_HINT = (
    "Goal: first confirm whether this company is covered by the current financial-report "
    "tools. Allowed action: switch to a company or web source to confirm the company "
    "identifier. Not allowed: exhaustively trying ticker variants. Next step: confirm the "
    "company identifier first, then come back to the financial-report tools."
)


class FinsToolService:
    """Financial-report tool service.

    Design constraints:
    - Does not depend on `processed/*.json` artifacts.
    - All reads go through live Processor capabilities.
    - The cache holds Processor instances only.
    """

    MODULE = "FINS.TOOL_SERVICE"

    def __init__(
        self,
        *,
        company_repository: CompanyMetaRepositoryProtocol,
        source_repository: SourceDocumentRepositoryProtocol,
        processed_repository: ProcessedDocumentRepositoryProtocol,
        processor_registry: ProcessorRegistry,
        processor_cache_max_entries: int = 128,
    ) -> None:
        """Initialize the service.

        Args:
            company_repository: company-metadata repository implementation.
            source_repository: source-document repository implementation.
            processed_repository: processed-document repository implementation.
            processor_registry: processor registry.
            processor_cache_max_entries: Processor LRU cache capacity.

        Returns:
            None.

        Raises:
            ValueError: raised when the cache capacity is invalid.
        """

        if processor_cache_max_entries <= 0:
            raise ValueError("processor_cache_max_entries must be greater than 0")
        self._company_repository = company_repository
        self._source_repository = source_repository
        self._processed_repository = processed_repository
        self._processor_registry = processor_registry
        self._processor_cache: ProcessorLRUCache[DocumentProcessor] = ProcessorLRUCache(
            max_entries=processor_cache_max_entries,
        )
        self._meta_cache: dict[tuple[str, str], Optional[dict[str, Any]]] = {}
        self._creation_locks: dict[ProcessorCacheKey, Lock] = {}
        self._creation_locks_guard = RLock()

    def list_documents(
        self,
        *,
        ticker: str,
        document_types: Optional[list[str]] = None,
        fiscal_years: Optional[list[int]] = None,
        fiscal_periods: Optional[list[str]] = None,
    ) -> ListDocumentsResult:
        """List available documents.

        Args:
            ticker: ticker.
            document_types: optional document-type filter (enum array, e.g. ["annual_report", "quarterly_report"]).
            fiscal_years: optional fiscal-year filter.
            fiscal_periods: optional fiscal-period filter.

        Returns:
            document list result.

        Raises:
            ToolArgumentError: raised when an argument is invalid.
            ToolBusinessError: raised when the ticker is not tracked in the current workspace.
            RuntimeError: raised when the repository read fails.
        """

        normalized_ticker = self._resolve_canonical_ticker(
            ticker=ticker,
            tool_name="list_documents",
        )
        normalized_document_types = _normalize_document_types(document_types)
        normalized_fiscal_periods = _normalize_periods(fiscal_periods)

        company_name, market = self._read_company_info(normalized_ticker)
        base_documents = self._collect_source_documents(normalized_ticker)

        # first attach document_type to all documents, shared by recommendation slots and filter logic.
        documents_with_type: list[dict[str, Any]] = []
        for item in base_documents:
            output = dict(item)
            output["document_type"] = resolve_document_type_for_source(
                form_type=item.get("form_type"),
                source_kind=item.get("source_kind"),
            )
            documents_with_type.append(output)

        # main filter logic: filter by type / fiscal year / fiscal period; recommended slots are still built from the full document set.
        filtered_documents: list[dict[str, Any]] = []
        for item in documents_with_type:
            doc_type = item["document_type"]
            if normalized_document_types is not None and doc_type not in normalized_document_types:
                continue
            fiscal_year = item.get("fiscal_year")
            if fiscal_years and fiscal_year not in fiscal_years:
                continue
            fiscal_period = item.get("fiscal_period")
            if normalized_fiscal_periods and fiscal_period not in normalized_fiscal_periods:
                continue
            output = dict(item)
            # hide the underlying SEC form names from the LLM
            output.pop("form_type", None)
            filtered_documents.append(output)
        recommended_documents = _build_recommended_documents(documents_with_type)

        # determine match status and build the suggestion
        if normalized_document_types is not None and len(filtered_documents) == 0:
            available = _collect_available_document_types(base_documents)
            match_status = "no_match"
            suggestion: Optional[dict[str, Any]] = {
                "action": "broaden_filter",
                "available_document_types": available,
                "reason": "no_documents_matched_document_types",
            }
        else:
            match_status = "ok"
            suggestion = None

        result: ListDocumentsResult = {
            "company": {
                "ticker": normalized_ticker,
                "name": company_name,
                "market": market,
            },
            "filters": {
                "document_types": normalized_document_types,
                "fiscal_years": fiscal_years,
                "fiscal_periods": normalized_fiscal_periods,
            },
            "recommended_documents": recommended_documents,
            "documents": filtered_documents,
            "total": len(base_documents),
            "matched": len(filtered_documents),
            "match_status": match_status,
        }
        if suggestion is not None:
            result["suggestion"] = suggestion

        return result

    def get_document_sections(self, *, ticker: str, document_id: str) -> DocumentSectionsResult:
        """Get the document section structure.

        Args:
            ticker: ticker.
            document_id: document ID.

        Returns:
            section structure result.

        Raises:
            ToolArgumentError: raised when an argument is invalid.
            ToolBusinessError: raised when the ticker is not tracked in the current workspace.
            FileNotFoundError: raised when the document does not exist.
        """

        normalized_ticker, normalized_document_id = self._normalize_document_identity(
            ticker=ticker,
            document_id=document_id,
            tool_name="get_document_sections",
        )
        processor = self._get_or_create_processor(
            ticker=normalized_ticker,
            document_id=normalized_document_id,
        )
        sections_raw: list[SectionSummary] = processor.list_sections()
        form_type = self._resolve_document_form_type(
            ticker=normalized_ticker,
            document_id=normalized_document_id,
        )
        enriched_sections = self._enrich_sections_with_semantic(sections_raw, form_type)
        citation = self._build_citation(
            ticker=normalized_ticker,
            document_id=normalized_document_id,
        )
        return {
            "ticker": normalized_ticker,
            "document_id": normalized_document_id,
            "sections": enriched_sections,
            "citation": citation,
        }

    def read_section(self, *, ticker: str, document_id: str, ref: str) -> SectionContentResult:
        """Read section body text.

        Args:
            ticker: ticker.
            document_id: document ID.
            ref: section reference.

        Returns:
            section body result.

        Raises:
            ToolArgumentError: raised when an argument is invalid.
            ToolBusinessError: raised when the ticker is not tracked in the current workspace.
            KeyError: raised when the section does not exist.
        """

        normalized_ticker, normalized_document_id = self._normalize_document_identity(
            ticker=ticker,
            document_id=document_id,
            tool_name="read_section",
        )
        normalized_ref = require_non_empty_text(
            ref,
            empty_error=ToolArgumentError("read_section", "ref", ref, "Argument must not be empty"),
        )
        processor = self._get_or_create_processor(
            ticker=normalized_ticker,
            document_id=normalized_document_id,
        )
        try:
            section_raw: SectionContent = processor.read_section(normalized_ref)
        except KeyError as exc:
            suspected_document_id = self._diagnose_cross_document_locator(
                ticker=normalized_ticker,
                current_document_id=normalized_document_id,
                kind="ref",
                locator=normalized_ref,
            )
            if suspected_document_id is not None:
                hint = (
                    f"section not found; a stale ref from another document may have been reused -- current document_id={normalized_document_id},"
                    f"this ref exists in document_id={suspected_document_id}."
                    "First call get_document_sections or search_document on the current document to re-ground, then call read_section with the new document's own ref."
                )
            else:
                hint = "section not found; call get_document_sections first and copy the returned ref verbatim -- do not abbreviate, renumber, or invent refs"
            raise ToolArgumentError(
                "read_section",
                "ref",
                normalized_ref,
                hint,
            ) from exc
        content = str(section_raw.get("content", ""))
        # the tables field is not exposed to the LLM -- the [[t_XXXX]] placeholders in content already carry ref + position context,
        # a bare ref list gives no selection cues (same as children: ref=the input argument; a cue is needed for a decision),
        # when content is truncated, the LLM should use list_tables(within_section_ref) for full table metadata.
        normalized_children = _normalize_section_children(section_raw.get("children"))
        content_word_count = int(
            section_raw.get("content_word_count")
            or section_raw.get("word_count")
            or len(content.split())
        )
        # semantic enrichment: resolve item/topic/path
        form_type = self._resolve_document_form_type(
            ticker=normalized_ticker,
            document_id=normalized_document_id,
        )
        title = section_raw.get("title")
        # read_section has no direct parent_ref context; get it from list_sections
        parent_ref = section_raw.get("parent_ref")
        parent_title = None
        if parent_ref:
            # use the processor's O(1) title lookup directly instead of rescanning all sections for a parent title.
            try:
                parent_title = processor.get_section_title(str(parent_ref))
            except Exception:
                parent_title = None

        item_number, canonical_title, topic = resolve_section_semantic(
            title=title,
            form_type=form_type,
            parent_title=parent_title,
        )
        # when a child section cannot resolve itself, try inheriting item/topic from the parent title
        if (item_number is None or topic is None) and parent_title:
            parent_item, _, parent_topic = resolve_section_semantic(
                title=parent_title,
                form_type=form_type,
            )
            if item_number is None:
                item_number = parent_item
            if topic is None:
                topic = parent_topic
        parent_titles: list[str] = []
        if parent_title:
            parent_titles.append(parent_title)
        # path computation is kept for internal diagnostics and future evaluation, but is not exposed to the LLM --
        # item + topic + title already express the semantic position; path is redundant assembly,
        # consistent with the T1 decision to drop path in get_document_sections.
        _path = build_section_path(
            form_type=form_type,
            item_number=item_number,
            canonical_title=canonical_title,
            section_title=title,
            parent_titles=parent_titles,
        )
        del _path  # discard explicitly, silencing the linter unused-variable warning
        item_label = f"Item {item_number}" if item_number else None
        citation = self._build_citation(
            ticker=normalized_ticker,
            document_id=normalized_document_id,
            item=item_label,
            heading=str(title) if title else None,
        )
        return {
            "ticker": normalized_ticker,
            "document_id": normalized_document_id,
            "ref": normalized_ref,
            "title": title,
            "item": item_label,
            "topic": topic,
            "content": content,
            "children": normalized_children,
            "page_range": _extract_page_range(section_raw),
            "content_word_count": content_word_count,
            "citation": citation,
        }

    def search_document(
        self,
        *,
        ticker: str,
        document_id: str,
        query: Optional[str] = None,
        queries: Optional[list[str]] = None,
        within_section_ref: Optional[str] = None,
        mode: Optional[str] = None,
        display_budget: Optional[int] = None,
    ) -> SearchDocumentResult:
        """Search keywords within a document; supports single-query and batch modes.

        ``query`` and ``queries`` are mutually exclusive; exactly one must be provided.
        in batch mode, each query is searched separately, then aggregated, deduplicated, and sorted.

        Args:
            ticker: ticker.
            document_id: document ID.
            query: single search keyword (mutually exclusive with queries).
            queries: batch search-keyword list (mutually exclusive with query, max 20).
            within_section_ref: optional section scope.
            mode: search mode; allowed values:
                - ``auto`` (default): exact match first, auto-expands when there are no hits.
                - ``exact``: exact matching only.
                - ``keyword``: keyword-split search only.
                - ``semantic``: semantic expansion (phrase variants + synonyms + keywords).
            display_budget: optional display-budget cap, passed to the exact-first limiter,
                so trimming cannot push the entry count past the downstream truncation max_items and cause signal conflicts.

        Returns:
            search result.

        Raises:
            ToolArgumentError: raised when an argument is invalid.
            ToolBusinessError: raised when the ticker is not tracked in the current workspace.
        """

        _QUERIES_MAX = 20

        normalized_ticker, normalized_document_id = self._normalize_document_identity(
            ticker=ticker,
            document_id=document_id,
            tool_name="search_document",
        )
        # validate mutual exclusion: exactly one of query and queries must be provided
        resolved_queries = _resolve_search_queries(
            query=query,
            queries=queries,
            max_queries=_QUERIES_MAX,
        )
        # keep a copy of the query terms for the Chinese no-results hint detection
        original_queries = resolved_queries
        normalized_within_ref = normalize_optional_text(within_section_ref)
        resolved_mode = _resolve_search_mode(mode)

        processor = self._get_or_create_processor(
            ticker=normalized_ticker,
            document_id=normalized_document_id,
        )
        # prebuild the form_type / ref_to_topic needed for evidence-based results
        form_type = self._resolve_document_form_type(
            ticker=normalized_ticker,
            document_id=normalized_document_id,
        )
        ref_to_topic: dict[str, Optional[str]] = {}
        semantic_profiles: dict[str, SectionSemanticProfile] = {}
        query_term_df: dict[str, int] = {}
        bm25f_index = BM25FSectionIndex(
            profiles={},
            document_frequency={},
            avg_field_lengths={},
            avg_content_length=0.0,
            document_count=0,
        )
        try:
            all_secs = processor.list_sections()
            enriched_for_search = self._enrich_sections_with_semantic(
                sections=all_secs, form_type=form_type
            )
            bm25f_index = build_section_bm25f_index(enriched_for_search)
            semantic_profiles, query_term_df = _build_section_semantic_profiles(enriched_for_search)
            for sec in enriched_for_search:
                ref = sec.get("ref")
                if ref:
                    ref_to_topic[ref] = sec.get("topic")
        except Exception:
            pass

        is_multi = len(resolved_queries) > 1

        if is_multi:
            # ---- multi-query aggregation path ----
            return self._search_document_multi(
                normalized_ticker=normalized_ticker,
                normalized_document_id=normalized_document_id,
                resolved_queries=resolved_queries,
                original_queries=original_queries,
                normalized_within_ref=normalized_within_ref,
                resolved_mode=resolved_mode,
                processor=processor,
                form_type=form_type,
                ref_to_topic=ref_to_topic,
                bm25f_index=bm25f_index,
                semantic_profiles=semantic_profiles,
                query_term_df=query_term_df,
                display_budget=display_budget,
            )

        # ---- single-query path ----
        normalized_query = resolved_queries[0]
        diagnosis = _diagnose_search_query(
            query=normalized_query,
            term_document_frequency=query_term_df,
            document_count=max(1, len(semantic_profiles)),
            mode=resolved_mode,
        )
        ranked_entries, strategy_hit_counts, exact_matches, expansion_queries = (
            _execute_query_search(
                processor=processor,
                query=normalized_query,
                within_ref=normalized_within_ref,
                mode=resolved_mode,
                diagnosis=diagnosis,
                semantic_profiles=semantic_profiles,
            )
        )

        deduplicated_entries = _deduplicate_ranked_search_entries(ranked_entries)
        sorted_entries = _sort_ranked_search_entries(
            deduplicated_entries,
            bm25f_index=bm25f_index,
            diagnosis=diagnosis,
            semantic_profiles=semantic_profiles,
        )
        # exact-first limiting: when exact hits exist, compress the share of expansion results
        capped_entries = _cap_entries_with_exact_priority(
            sorted_entries, display_budget=display_budget
        )
        matches = _build_evidence_matches(capped_entries, form_type, ref_to_topic)
        fallback_opened = any(
            bool(item.get("_token_fallback_opened", False)) for item in sorted_entries
        )
        noise_penalty_applied_count = sum(
            1 for item in sorted_entries if float(item.get("_context_noise_penalty", 0.0)) > 0.0
        )
        diagnostics = {
            "input_query": normalized_query,
            "mode": resolved_mode,
            "used_expansion": not bool(exact_matches) and bool(expansion_queries),
            "expanded_queries": expansion_queries,
            "expansion_query_count": len(expansion_queries),
            "strategy_hit_counts": strategy_hit_counts,
            "ranking_version": _SEARCH_RANKING_VERSION,
            "diagnosis_summary": {
                "intent": diagnosis.intent,
                "token_count": diagnosis.token_count,
                "ambiguity_score": diagnosis.ambiguity_score,
                "is_high_ambiguity": diagnosis.is_high_ambiguity,
            },
            "search_plan": {
                "fallback_gated": diagnosis.is_high_ambiguity
                and not diagnosis.allow_direct_token_fallback,
                "scoped_before_token": diagnosis.is_high_ambiguity,
            },
            "fallback_gated": diagnosis.is_high_ambiguity
            and not diagnosis.allow_direct_token_fallback,
            "fallback_opened": fallback_opened,
            "noise_penalty_applied_count": noise_penalty_applied_count,
        }
        Log.debug(
            "search_document completed: "
            f"ticker={normalized_ticker} document_id={normalized_document_id} "
            f"query={normalized_query!r} mode={resolved_mode} "
            f"searched_in={normalized_within_ref or 'full text'} "
            f"exact_hits={len(exact_matches)} expansion_count={len(expansion_queries)} "
            f"total_matches={len(matches)} strategy_hits={strategy_hit_counts}",
            module=self.MODULE,
        )

        match_quality = _build_match_quality(matches)
        hint = _build_search_hint(matches, match_quality["primary_source"])
        # when a Chinese query has no results, append an actionable guidance hint
        if not hint and not matches and _any_query_has_chinese(original_queries):
            hint = _CHINESE_QUERY_NO_RESULTS_HINT
        next_section_to_read, next_section_by_query = build_search_next_section_fields(
            matches=matches
        )

        result: SearchDocumentResult = {
            "ticker": normalized_ticker,
            "document_id": normalized_document_id,
            "query": normalized_query,
            "mode": resolved_mode,
            "searched_in": normalized_within_ref or "full text",
            "match_quality": match_quality,
            "matches": matches,
            "next_section_to_read": next_section_to_read,
            "total_matches": len(matches),
            "diagnostics": diagnostics,
            "citation": self._build_citation(
                ticker=normalized_ticker,
                document_id=normalized_document_id,
            ),
        }
        if hint:
            result["hint"] = hint
        return result

    def _search_document_multi(
        self,
        *,
        normalized_ticker: str,
        normalized_document_id: str,
        resolved_queries: list[str],
        original_queries: list[str],
        normalized_within_ref: Optional[str],
        resolved_mode: str,
        processor: "DocumentProcessor",
        form_type: Optional[str],
        ref_to_topic: dict[str, Optional[str]],
        bm25f_index: BM25FSectionIndex,
        semantic_profiles: dict[str, SectionSemanticProfile],
        query_term_df: dict[str, int],
        display_budget: Optional[int] = None,
    ) -> SearchDocumentResult:
        """Multi-query aggregation path.

        run each query separately, then aggregate, deduplicate, and sort into the result.

        Args:
            normalized_ticker: normalized ticker.
            normalized_document_id: normalized document_id.
            resolved_queries: translated and validated query list.
            original_queries: pre-translation query list, used for the Chinese no-results hint detection.
            normalized_within_ref: optional section scope.
            resolved_mode: search mode.
            processor: document processor.
            form_type: document form_type.
            ref_to_topic: ref -> topic mapping.
            bm25f_index: BM25F index.
            semantic_profiles: section semantic-profile mapping.
            query_term_df: query-term document frequency.
            display_budget: optional display-budget cap, passed to the exact-first limiter.

        Returns:
            aggregated search result.
        """

        all_ranked: list[dict[str, Any]] = []
        per_query_stats: list[dict[str, Any]] = []
        merged_strategy_hits = _build_empty_search_strategy_hit_counts()

        for q in resolved_queries:
            query_diagnosis = _diagnose_search_query(
                query=q,
                term_document_frequency=query_term_df,
                document_count=max(1, len(semantic_profiles)),
                mode=resolved_mode,
            )
            ranked, strategy_hits, exact_matches, expansion_queries = _execute_query_search(
                processor=processor,
                query=q,
                within_ref=normalized_within_ref,
                mode=resolved_mode,
                diagnosis=query_diagnosis,
                semantic_profiles=semantic_profiles,
            )
            all_ranked.extend(ranked)
            # merge strategy hit counts
            for strat, cnt in strategy_hits.items():
                merged_strategy_hits[strat] = merged_strategy_hits.get(strat, 0) + cnt
            per_query_stats.append(
                {
                    "query": q,
                    "hits": len(ranked),
                    "exact_hits": len(exact_matches),
                    "expansion_count": len(expansion_queries),
                    "is_high_ambiguity": query_diagnosis.is_high_ambiguity,
                    "intent": query_diagnosis.intent,
                }
            )

        deduplicated = _deduplicate_ranked_search_entries(all_ranked)
        sorted_entries = _sort_ranked_search_entries(
            deduplicated,
            bm25f_index=bm25f_index,
            diagnosis=None,
            semantic_profiles=semantic_profiles,
        )
        # exact-first limiting: when exact hits exist, compress the share of expansion results
        capped_entries = _cap_entries_with_exact_priority(
            sorted_entries, display_budget=display_budget
        )
        matches = _build_evidence_matches(capped_entries, form_type, ref_to_topic)

        diagnostics = {
            "input_queries": resolved_queries,
            "mode": resolved_mode,
            "query_count": len(resolved_queries),
            "per_query_stats": per_query_stats,
            "strategy_hit_counts": merged_strategy_hits,
            "ranking_version": _SEARCH_RANKING_VERSION,
            "fallback_gated": any(bool(item.get("is_high_ambiguity")) for item in per_query_stats),
            "noise_penalty_applied_count": sum(
                1 for item in sorted_entries if float(item.get("_context_noise_penalty", 0.0)) > 0.0
            ),
        }
        Log.debug(
            "search_document(multi) completed: "
            f"ticker={normalized_ticker} document_id={normalized_document_id} "
            f"queries={resolved_queries!r} mode={resolved_mode} "
            f"searched_in={normalized_within_ref or 'full text'} "
            f"total_matches={len(matches)} per_query_stats={per_query_stats}",
            module=self.MODULE,
        )

        match_quality = _build_match_quality(matches)
        hint = _build_search_hint(matches, match_quality["primary_source"])
        # when a Chinese query has no results, append an actionable guidance hint
        if not hint and not matches and _any_query_has_chinese(original_queries):
            hint = _CHINESE_QUERY_NO_RESULTS_HINT
        _next_section_to_read, next_section_by_query = build_search_next_section_fields(
            matches=matches,
            queries=resolved_queries,
        )
        del _next_section_to_read
        # in the batch-query path queries is non-empty, so next_section_by_query always has a value
        assert next_section_by_query is not None

        result: SearchDocumentResult = {
            "ticker": normalized_ticker,
            "document_id": normalized_document_id,
            "query": None,
            "queries": resolved_queries,
            "mode": resolved_mode,
            "searched_in": normalized_within_ref or "full text",
            "match_quality": match_quality,
            "matches": matches,
            "next_section_by_query": next_section_by_query,
            "total_matches": len(matches),
            "diagnostics": diagnostics,
            "citation": self._build_citation(
                ticker=normalized_ticker,
                document_id=normalized_document_id,
            ),
        }
        if hint:
            result["hint"] = hint
        return result

    def list_tables(
        self,
        *,
        ticker: str,
        document_id: str,
        financial_only: bool = False,
        within_section_ref: Optional[str] = None,
    ) -> TablesListResult:
        """List document table metadata.

        Args:
            ticker: ticker.
            document_id: document ID.
            financial_only: whether to return only financial tables.
            within_section_ref: optional section scope.

        Returns:
            table list result.

        Raises:
            ToolArgumentError: raised when an argument is invalid.
            ToolBusinessError: raised when the ticker is not tracked in the current workspace.
        """

        normalized_ticker, normalized_document_id = self._normalize_document_identity(
            ticker=ticker,
            document_id=document_id,
            tool_name="list_tables",
        )
        normalized_within_ref = normalize_optional_text(within_section_ref)

        processor = self._get_or_create_processor(
            ticker=normalized_ticker,
            document_id=normalized_document_id,
        )
        tables_raw: list[TableSummary] = processor.list_tables()

        filtered_tables: list[dict[str, Any]] = []
        for item in tables_raw:
            is_financial = bool(item.get("is_financial", False))
            section_ref = item.get("section_ref")
            if financial_only and not is_financial:
                continue
            if normalized_within_ref is not None and section_ref != normalized_within_ref:
                continue
            page_no = item.get("page_no")
            # build the table entry: headers truncated to 80 chars each, null optional fields omitted to cut serialization overhead
            # context_before was removed -- since 753cd7a, caption inference covers its information,
            # caption + headers + table_type are enough for the LLM to judge table relevance.
            raw_headers = item.get("headers")
            entry: dict[str, Any] = {
                "table_ref": item.get("table_ref"),
                "row_count": int(item.get("row_count", 0) or 0),
                "col_count": int(item.get("col_count", 0) or 0),
                "is_financial": is_financial,
                "table_type": _normalize_table_type(item.get("table_type")),
                "headers": (
                    [str(h)[:80] for h in raw_headers if h]
                    if isinstance(raw_headers, list)
                    else None
                ),
            }
            # within_section: semantically identical to the request parameter within_section_ref; expresses the section a table belongs to
            if section_ref:
                ws: dict[str, str] = {"ref": section_ref}
                sec_title = processor.get_section_title(section_ref)
                if sec_title:
                    ws["title"] = sec_title
                entry["within_section"] = ws
            caption = item.get("caption")
            if caption:
                entry["caption"] = caption
            if isinstance(page_no, int) and page_no > 0:
                entry["page_no"] = page_no
            filtered_tables.append(entry)

        # note: sort financial-first, then stable-sort by table_ref, so results are reproducible.
        filtered_tables.sort(
            key=lambda item: (
                0 if bool(item.get("is_financial", False)) else 1,
                str(item.get("table_ref", "")),
            )
        )
        financial_count = sum(
            1 for item in filtered_tables if bool(item.get("is_financial", False))
        )
        return {
            "ticker": normalized_ticker,
            "document_id": normalized_document_id,
            "tables": filtered_tables,
            "total": len(filtered_tables),
            "financial_count": financial_count,
            "citation": self._build_citation(
                ticker=normalized_ticker,
                document_id=normalized_document_id,
            ),
        }

    def get_table(self, *, ticker: str, document_id: str, table_ref: str) -> TableDetailResult:
        """Read the specified table.

        Args:
            ticker: ticker.
            document_id: document ID.
            table_ref: table reference.

        Returns:
            table data result.

        Raises:
            ToolArgumentError: raised when an argument is invalid.
            ToolBusinessError: raised when the ticker is not tracked in the current workspace.
            KeyError: raised when the table does not exist.
        """

        normalized_ticker, normalized_document_id = self._normalize_document_identity(
            ticker=ticker,
            document_id=document_id,
            tool_name="get_table",
        )
        normalized_table_ref = require_non_empty_text(
            table_ref,
            empty_error=ToolArgumentError(
                "get_table", "table_ref", table_ref, "Argument must not be empty"
            ),
        )
        processor = self._get_or_create_processor(
            ticker=normalized_ticker,
            document_id=normalized_document_id,
        )
        try:
            table_raw: TableContent = processor.read_table(normalized_table_ref)
        except KeyError as exc:
            suspected_document_id = self._diagnose_cross_document_locator(
                ticker=normalized_ticker,
                current_document_id=normalized_document_id,
                kind="table_ref",
                locator=normalized_table_ref,
            )
            if suspected_document_id is not None:
                hint = (
                    f"table not found; a stale table_ref from another document may have been reused -- current document_id={normalized_document_id},"
                    f"this table_ref exists in document_id={suspected_document_id}."
                    "First call list_tables / get_document_sections / search_document on the current document to re-ground, then call get_table with the new document's own table_ref."
                )
            else:
                hint = "table not found; call list_tables first and copy the returned table_ref verbatim -- do not abbreviate, renumber, or invent table_refs"
            raise ToolArgumentError(
                "get_table",
                "table_ref",
                normalized_table_ref,
                hint,
            ) from exc
        data_payload = _build_table_data_payload(table_raw)

        # within_section: get the owning-section info via the O(1) get_section_title
        section_ref = table_raw.get("section_ref")
        within_section: dict[str, str] | None = None
        if section_ref:
            within_section = {"ref": section_ref}
            sec_title = processor.get_section_title(section_ref)
            if sec_title:
                within_section["title"] = sec_title

        page_no = table_raw.get("page_no")
        caption = table_raw.get("caption")
        result: TableDetailResult = {
            "ticker": normalized_ticker,
            "document_id": normalized_document_id,
            "table_ref": normalized_table_ref,
            "data": data_payload,
            "row_count": int(table_raw.get("row_count", 0) or 0),
            "col_count": int(table_raw.get("col_count", 0) or 0),
            "is_financial": bool(table_raw.get("is_financial", False)),
            "table_type": _normalize_table_type(table_raw.get("table_type")),
            "citation": self._build_citation(
                ticker=normalized_ticker,
                document_id=normalized_document_id,
            ),
        }
        # conditional fields: omit null values to reduce serialization noise
        if within_section:
            result["within_section"] = within_section
        if caption:
            result["caption"] = caption
        if isinstance(page_no, int) and page_no > 0:
            result["page_no"] = page_no
        return result

    def get_page_content(
        self, *, ticker: str, document_id: str, page_no: int
    ) -> PageContentResult | NotSupportedResult:
        """Read page context.

        Args:
            ticker: ticker.
            document_id: document ID.
            page_no: target page number (1-based).

        Returns:
            page content result; a `not_supported` structure when unsupported.

        Raises:
            ToolArgumentError: raised when an argument is invalid.
            ToolBusinessError: raised when the ticker is not tracked in the current workspace.
        """

        normalized_ticker, normalized_document_id = self._normalize_document_identity(
            ticker=ticker,
            document_id=document_id,
            tool_name="get_page_content",
        )
        if not isinstance(page_no, int) or page_no <= 0:
            raise ToolArgumentError(
                "get_page_content",
                "page_no",
                page_no,
                "page_no must be a positive integer",
            )

        processor = self._get_or_create_processor(
            ticker=normalized_ticker,
            document_id=normalized_document_id,
        )
        page_method = getattr(processor, "get_page_content", None)
        if not callable(page_method):
            return _build_not_supported_result(
                ticker=normalized_ticker,
                document_id=normalized_document_id,
                feature="get_page_content",
                payload={"page_no": page_no, "supported": False},
            )

        page_payload = cast(dict[str, Any], page_method(page_no))
        # processor-contributed subfields are extracted via .get(); known fields are declared by PageContentResult.
        result: PageContentResult = {
            "ticker": normalized_ticker,
            "document_id": normalized_document_id,
            "page_no": page_no,
            "sections": list(page_payload.get("sections") or []),
            "tables": list(page_payload.get("tables") or []),
            "text_preview": str(page_payload.get("text_preview", "")),
            "has_content": bool(page_payload.get("has_content", False)),
            "total_items": int(page_payload.get("total_items", 0) or 0),
            "supported": bool(page_payload.get("supported", True)),
            "citation": self._build_citation(
                ticker=normalized_ticker,
                document_id=normalized_document_id,
            ),
        }
        return result

    def get_financial_statement(
        self,
        *,
        ticker: str,
        document_id: str,
        statement_type: str,
    ) -> FinancialStatementResult | NotSupportedResult:
        """Read a standard financial statement.

        Args:
            ticker: ticker.
            document_id: document ID.
            statement_type: statement type.

        Returns:
            financial-statement result; on success, besides the standard statement data, includes a `statement_locator`
            structured locator information so the writing pipeline can generate reviewable "evidence and provenance" anchors;
            a `not_supported` structure when unsupported.

        Raises:
            ToolArgumentError: raised when an argument is invalid.
            ToolBusinessError: raised when the ticker is not tracked in the current workspace.
        """

        normalized_ticker, normalized_document_id = self._normalize_document_identity(
            ticker=ticker,
            document_id=document_id,
            tool_name="get_financial_statement",
        )
        normalized_statement_type = require_non_empty_text(
            statement_type,
            empty_error=ToolArgumentError(
                "get_financial_statement",
                "statement_type",
                statement_type,
                "Argument must not be empty",
            ),
        )

        processor = self._get_or_create_processor(
            ticker=normalized_ticker,
            document_id=normalized_document_id,
        )
        statement_method = getattr(processor, "get_financial_statement", None)
        if not callable(statement_method):
            return _build_not_supported_result(
                ticker=normalized_ticker,
                document_id=normalized_document_id,
                feature="get_financial_statement",
                payload={"statement_type": normalized_statement_type},
            )

        statement_payload = cast(dict[str, Any], statement_method(normalized_statement_type))
        citation = self._build_citation(
            ticker=normalized_ticker,
            document_id=normalized_document_id,
        )
        # processor-contributed fields (statement_type, rows, currency, etc.) are merged via spread;
        # known fields are declared by the FinancialStatementResult TypedDict and guaranteed by the processor at runtime.
        result: dict[str, Any] = {
            "ticker": normalized_ticker,
            "document_id": normalized_document_id,
            **statement_payload,
            "citation": citation,
        }
        return cast(FinancialStatementResult, result)

    def query_xbrl_facts(
        self,
        *,
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
            concepts: optional XBRL concept list; when empty, a default concept pack is chosen by the document's form/taxonomy.
            statement_type: optional statement type.
            period_end: optional period-end date.
            fiscal_year: optional fiscal year.
            fiscal_period: optional fiscal period.
            min_value: optional minimum value.
            max_value: optional maximum value.

        Returns:
            XBRL numeric-facts query result; a `not_supported` structure when unsupported.

        Raises:
            ToolArgumentError: raised when an argument is invalid.
            ToolBusinessError: raised when the ticker is not tracked in the current workspace.
        """

        normalized_ticker, normalized_document_id = self._normalize_document_identity(
            ticker=ticker,
            document_id=document_id,
            tool_name="query_xbrl_facts",
        )
        if concepts is not None and not isinstance(concepts, list):
            raise ToolArgumentError(
                "query_xbrl_facts",
                "concepts",
                concepts,
                "concepts must be a string array or omitted",
            )
        normalized_concepts = [
            item
            for item in (normalize_optional_text(concept) for concept in (concepts or []))
            if item is not None
        ]

        form_type = self._resolve_document_form_type(
            ticker=normalized_ticker,
            document_id=normalized_document_id,
        )
        processor = self._get_or_create_processor(
            ticker=normalized_ticker,
            document_id=normalized_document_id,
        )
        taxonomy = _resolve_processor_taxonomy(processor)
        resolved_concepts = (
            normalized_concepts
            if normalized_concepts
            else _resolve_default_xbrl_concepts(form_type=form_type, taxonomy=taxonomy)
        )
        query_method = getattr(processor, "query_xbrl_facts", None)
        if not callable(query_method):
            return _build_not_supported_result(
                ticker=normalized_ticker,
                document_id=normalized_document_id,
                feature="query_xbrl_facts",
                payload={"concepts": resolved_concepts},
            )

        payload = cast(
            dict[str, Any],
            query_method(
                concepts=resolved_concepts,
                statement_type=normalize_optional_text(statement_type),
                period_end=normalize_optional_text(period_end),
                fiscal_year=fiscal_year,
                fiscal_period=normalize_optional_text(fiscal_period),
                min_value=min_value,
                max_value=max_value,
            ),
        )
        normalized_payload = _normalize_xbrl_query_payload(
            payload=payload,
            default_concepts=resolved_concepts,
        )
        # processor-contributed fields (query_params, facts, total, etc.) are merged via spread;
        # known fields are declared by the XbrlQueryResult TypedDict and guaranteed by the normalizer at runtime.
        result: dict[str, Any] = {
            "ticker": normalized_ticker,
            "document_id": normalized_document_id,
            **normalized_payload,
            "citation": self._build_citation(
                ticker=normalized_ticker,
                document_id=normalized_document_id,
            ),
        }
        return cast(XbrlQueryResult, result)

    def _normalize_document_identity(
        self,
        *,
        ticker: str,
        document_id: str,
        tool_name: str,
    ) -> tuple[str, str]:
        """Normalize document identity parameters.

        Args:
            ticker: raw ticker.
            document_id: raw document ID.
            tool_name: calling tool name.

        Returns:
            `(normalized_ticker, normalized_document_id)`. ``normalized_document_id``
            always the repository-canonical `document_id`.

        Raises:
            ToolArgumentError: raised when an argument is empty.
            ToolBusinessError: raised when the ticker is not tracked in the current workspace.
        """

        normalized_ticker = self._resolve_canonical_ticker(ticker=ticker, tool_name=tool_name)
        normalized_document_id = require_non_empty_text(
            document_id,
            empty_error=ToolArgumentError(
                tool_name,
                "document_id",
                document_id,
                "Argument must not be empty",
            ),
        )
        resolved_document_id = self._resolve_canonical_document_id(
            ticker=normalized_ticker,
            raw_document_id=normalized_document_id,
            tool_name=tool_name,
        )
        return normalized_ticker, resolved_document_id

    def _resolve_canonical_ticker(self, *, ticker: str, tool_name: str) -> str:
        """Normalize an external ticker into a usable ticker.

        resolution order:
        1. ``require_non_empty_text`` rejects empty input.
        2. use the ``try_normalize_ticker`` source of truth to normalize ``0700.HK`` / ``600519.SH`` and
           normalizes common variants to canonical; used as the only query candidate.
        3. when the source of truth cannot identify it (e.g. the user passed a company name like ``"Apple Inc."``), fall back to
           ``strip().upper()`` as the candidate; preserves the existing "company name can be passed as ticker" behavior.
        4. the repository ``resolve_existing_ticker`` falls back to the company-level
           ``ticker_aliases`` index reverse lookup; aliases are all normalized, so no variants need to be built.

        Args:
            ticker: raw ticker.
            tool_name: current tool name.

        Returns:
            ticker usable by the current filings tool.

        Raises:
            ToolArgumentError: raised when the ticker is empty.
            ToolBusinessError: raised when the ticker is not tracked in the current workspace.
        """

        normalized_ticker = require_non_empty_text(
            ticker,
            empty_error=ToolArgumentError(
                tool_name,
                "ticker",
                ticker,
                "Argument must not be empty",
            ),
        )
        normalized_source = try_normalize_ticker(normalized_ticker)
        if normalized_source is not None:
            probe_ticker = normalized_source.canonical
        else:
            probe_ticker = normalized_ticker.strip().upper()
        resolved_ticker = self._company_repository.resolve_existing_ticker([probe_ticker])
        if resolved_ticker is None:
            raise ToolBusinessError(
                code=ErrorCode.NOT_FOUND.value,
                message=f"Financial Document Tools do not have this company: ticker='{normalized_ticker}'.",
                hint=_MISSING_TICKER_HINT,
            )
        if resolved_ticker != normalized_ticker:
            Log.debug(
                f"ticker normalized: tool={tool_name} raw={normalized_ticker!r} "
                f"probe={probe_ticker!r} canonical={resolved_ticker!r}",
                module=self.MODULE,
            )
        return resolved_ticker

    def _resolve_canonical_document_id(
        self,
        *,
        ticker: str,
        raw_document_id: str,
        tool_name: str,
    ) -> str:
        """Normalize an externally supplied document identifier into a repository `document_id`.

        only public repository metadata is used for minimal normalization here; processor internals are not relied upon.
        supported input forms:
        - already a repository `document_id`
        - `internal_document_id` from `meta.json`
        - `accession_number` from `meta.json`
        - accession with hyphens removed

        Args:
            ticker: normalized ticker.
            raw_document_id: externally supplied document identifier.
            tool_name: current tool name, used only for logging.

        Returns:
            repository-canonical `document_id`.

        Raises:
            None.
        """

        direct_meta = self._get_document_meta_cached(ticker, raw_document_id)
        if direct_meta is not None:
            return raw_document_id

        normalized_alias = re.sub(r"\s+", "", raw_document_id).strip()
        for source_kind in (SourceKind.FILING, SourceKind.MATERIAL):
            for candidate_document_id in self._source_repository.list_source_document_ids(
                ticker, source_kind
            ):
                candidate_meta = self._get_document_meta_cached(ticker, candidate_document_id)
                if not candidate_meta:
                    continue
                alias_fields = self._build_document_identity_aliases(
                    candidate_document_id=candidate_document_id,
                    meta=candidate_meta,
                )
                if normalized_alias not in alias_fields:
                    continue
                matched_field = alias_fields[normalized_alias]
                if matched_field != "document_id":
                    Log.debug(
                        f"document identity normalized: tool={tool_name} ticker={ticker} raw={raw_document_id!r} "
                        f"matched_field={matched_field} canonical={candidate_document_id!r}",
                        module=self.MODULE,
                    )
                return candidate_document_id

        Log.debug(
            f"document identity did not hit the normalization mapping: tool={tool_name} ticker={ticker} raw={raw_document_id!r}",
            module=self.MODULE,
        )
        return raw_document_id

    def _build_document_identity_aliases(
        self,
        *,
        candidate_document_id: str,
        meta: Mapping[str, Any],
    ) -> dict[str, str]:
        """Build the set of acceptable identity aliases for a single document.

        Args:
            candidate_document_id: repository-canonical `document_id`.
            meta: content of the corresponding `meta.json`.

        Returns:
            `alias -> matched_field` mapping.

        Raises:
            None.
        """

        aliases: dict[str, str] = {
            re.sub(r"\s+", "", candidate_document_id).strip(): "document_id",
        }
        for field_name in ("internal_document_id", "accession_number"):
            raw_value = meta.get(field_name)
            normalized_value = normalize_optional_text(raw_value)
            if not normalized_value:
                continue
            aliases[re.sub(r"\s+", "", normalized_value).strip()] = field_name
            aliases[normalized_value.replace("-", "")] = field_name
        return aliases

    def _collect_source_documents(self, ticker: str) -> list[dict[str, Any]]:
        """Aggregate source-layer document summaries.

        Args:
            ticker: normalized ticker.

        Returns:
            document summary list.

        Raises:
            RuntimeError: raised when the repository read fails.
        """

        documents: list[dict[str, Any]] = []
        documents.extend(self._collect_source_documents_by_kind(ticker, SourceKind.FILING))
        documents.extend(self._collect_source_documents_by_kind(ticker, SourceKind.MATERIAL))
        documents.sort(key=build_document_recency_sort_key, reverse=True)
        return documents

    def _collect_source_documents_by_kind(
        self,
        ticker: str,
        source_kind: SourceKind,
    ) -> list[dict[str, Any]]:
        """Collect document summaries by source kind.

        Args:
            ticker: normalized ticker.
            source_kind: document source.

        Returns:
            document summary list.

        Raises:
            RuntimeError: raised when the repository read fails.
        """

        document_ids = self._source_repository.list_source_document_ids(ticker, source_kind)
        results: list[dict[str, Any]] = []
        for document_id in document_ids:
            try:
                meta = self._source_repository.get_source_meta(ticker, document_id, source_kind)
            except FileNotFoundError:
                continue
            if bool(meta.get("is_deleted", False)):
                continue
            if not bool(meta.get("ingest_complete", True)):
                continue
            inferred_period = _infer_fiscal_period(meta)
            inferred_year = _infer_fiscal_year(meta, inferred_period)
            resolved_fiscal_year = _resolve_fiscal_year_with_fallback(
                raw_value=meta.get("fiscal_year"),
                inferred_year=inferred_year,
            )
            resolved_fiscal_period = _resolve_fiscal_period_with_fallback(
                raw_value=meta.get("fiscal_period"),
                inferred_period=inferred_period,
            )
            # read capability flags from processed meta (lightweight JSON), handling the missing case
            has_financial_data = self._read_capability_flags(
                ticker,
                document_id,
            )
            results.append(
                {
                    "document_id": document_id,
                    "source_kind": source_kind.value,
                    "form_type": _normalize_form_type_for_matching(meta.get("form_type")),
                    "material_name": meta.get("material_name"),
                    "fiscal_year": resolved_fiscal_year,
                    "fiscal_period": resolved_fiscal_period,
                    "report_date": meta.get("report_date"),
                    "filing_date": meta.get("filing_date"),
                    "amended": bool(meta.get("amended", False)),
                    "has_financial_data": has_financial_data,
                }
            )
        return results

    def _build_citation(
        self,
        *,
        ticker: str,
        document_id: str,
        item: Optional[str] = None,
        heading: Optional[str] = None,
    ) -> dict[str, Any]:
        """Build the unified citation object.

        read document metadata from meta.json and build a serializable citation dict.
        meta reads for the same (ticker, document_id) are cached by _get_document_meta_cached.

        Args:
            ticker: normalized ticker.
            document_id: normalized document ID.
            item: optional Item number (e.g. "Item 1A").
            heading: optional section title.

        Returns:
            citation dict (keys with None values removed).
        """
        meta = self._get_document_meta_cached(ticker, document_id)
        source_kind = normalize_optional_text(meta.get("source_kind")) if meta else None
        # infer the source type
        if source_kind == SourceKind.MATERIAL.value:
            source_type = SourceType.SUPPLEMENTARY.value
        elif document_id.startswith("fil_"):
            # US-stock filing: document_id = fil_{accession_number}
            ingest_method = meta.get("ingest_method") if meta else None
            source_type = (
                SourceType.SEC_EDGAR.value
                if ingest_method == "download"
                else SourceType.UPLOADED.value
            )
        else:
            source_type = SourceType.UPLOADED.value

        form_type = _normalize_form_type_for_matching(meta.get("form_type")) if meta else None
        # US-stock filing accession_number is stored in meta.json
        accession_no = normalize_optional_text(meta.get("accession_number")) if meta else None

        citation = Citation(
            source_type=source_type,
            document_id=document_id,
            ticker=ticker,
            form_type=form_type,
            filing_date=normalize_optional_text(meta.get("filing_date")) if meta else None,
            accession_no=accession_no,
            fiscal_year=meta.get("fiscal_year") if meta else None,
            fiscal_period=normalize_optional_text(meta.get("fiscal_period")) if meta else None,
            item=item,
            heading=heading,
        )
        return citation.to_dict()

    def _get_document_meta_cached(self, ticker: str, document_id: str) -> Optional[dict[str, Any]]:
        """Read document metadata (with instance-level caching).

        within one FinsToolService instance, reads of the same (ticker, document_id)
        meta.json reads are cached in memory to avoid repeated IO within one tool-call chain.

        Args:
            ticker: normalized ticker.
            document_id: normalized document ID.

        Returns:
            meta dict; None when the document does not exist.
        """
        cache_key = (ticker, document_id)
        if cache_key in self._meta_cache:
            return self._meta_cache[cache_key]
        try:
            source_kind = self._resolve_source_kind(ticker=ticker, document_id=document_id)
            meta = self._source_repository.get_source_meta(ticker, document_id, source_kind)
        except FileNotFoundError:
            meta = None
        self._meta_cache[cache_key] = meta
        return meta

    def _enrich_sections_with_semantic(
        self,
        sections: list[SectionSummary],
        form_type: Optional[str],
    ) -> list[dict[str, Any]]:
        """Inject semantic-layer fields into the section list.

        iterate sections, resolving item/topic/path for each,
        and builds a ref -> section index for parent_ref path tracing.

        Args:
            sections: section summary list returned by the processor.
            form_type: the document's form_type.

        Returns:
            enriched section dict list.
        """
        # build the ref -> section index for parent_ref tracing
        ref_to_section: dict[str, SectionSummary] = {}
        for sec in sections:
            ref = sec.get("ref")
            if ref:
                ref_to_section[ref] = sec

        enriched: list[dict[str, Any]] = []
        # record resolved ref -> (item_number, topic) for child-section inheritance
        ref_to_resolved: dict[str, tuple[Optional[str], Optional[str]]] = {}
        for sec in sections:
            entry = dict(sec)
            # drop the preview field: highly redundant with title; the LLM can use read_section for details
            entry.pop("preview", None)
            title = sec.get("title")
            parent_ref = sec.get("parent_ref")

            # get the parent section title (for 10-Q Part disambiguation)
            parent_title = None
            if parent_ref and parent_ref in ref_to_section:
                parent_title = ref_to_section[parent_ref].get("title")

            item_number, canonical_title, topic = resolve_section_semantic(
                title=title,
                form_type=form_type,
                parent_title=parent_title,
            )

            # when a child section cannot resolve itself, inherit item/topic from the parent (multi-level inheritance supported)
            if (
                (item_number is None or topic is None)
                and parent_ref
                and parent_ref in ref_to_resolved
            ):
                parent_item_number, parent_topic = ref_to_resolved[parent_ref]
                if item_number is None:
                    item_number = parent_item_number
                if topic is None:
                    topic = parent_topic

            # record the current resolution for child-section lookups
            ref = sec.get("ref")
            if ref:
                ref_to_resolved[ref] = (item_number, topic)

            # build the hierarchical path: walk the parent_ref chain upward collecting parent titles
            parent_titles = _collect_parent_titles(sec, ref_to_section)
            path = build_section_path(
                form_type=form_type,
                item_number=item_number,
                canonical_title=canonical_title,
                section_title=title,
                parent_titles=parent_titles,
            )

            entry["item"] = f"Item {item_number}" if item_number else None
            entry["topic"] = topic
            # keep paths only for top-level sections (child-section hierarchy is already expressed via parent_ref)
            if sec.get("level", 0) <= 1:
                entry["path"] = path if path else None
            enriched.append(entry)
        return enriched

    def _resolve_document_form_type(self, *, ticker: str, document_id: str) -> Optional[str]:
        """Read the document form_type.

        Args:
            ticker: normalized ticker.
            document_id: normalized document ID.

        Returns:
            normalized form_type; `None` when the read fails.

        Raises:
            RuntimeError: raised when the read fails.
        """

        meta = self._get_document_meta_cached(ticker, document_id)
        if meta is None:
            return None
        return _normalize_form_type_for_matching(meta.get("form_type"))

    def _read_company_info(self, ticker: str) -> tuple[str, str]:
        """Read company information.

        Args:
            ticker: normalized ticker.

        Returns:
            `(company_name, market)`。

        Raises:
            RuntimeError: raised when the repository read fails.
        """

        try:
            company_meta = self._company_repository.get_company_meta(ticker)
        except FileNotFoundError:
            return ticker, "unknown"
        return company_meta.company_name, company_meta.market

    def _read_capability_flags(
        self,
        ticker: str,
        document_id: str,
    ) -> Optional[bool]:
        """Read the document financial-data capability flag from processed meta.

        Args:
            ticker: normalized ticker.
            document_id: document ID.

        Returns:
            `has_financial_data`: `True` (get_financial_statement is callable) /
            `False` (no data) / `None` (not processed or undeterminable).

        Raises:
            None (internal exceptions are caught).
        """

        try:
            processed_meta = self._processed_repository.get_processed_meta(ticker, document_id)
        except (FileNotFoundError, ValueError):
            return None
        return resolve_has_financial_data(
            has_financial_data=processed_meta.get("has_financial_data"),
            availability=processed_meta.get("financial_statement_availability"),
            has_financial_statement=processed_meta.get("has_financial_statement"),
            has_xbrl=processed_meta.get("has_xbrl"),
            has_structured_financial_statements=processed_meta.get(
                "has_structured_financial_statements"
            ),
            has_financial_statement_sections=processed_meta.get("has_financial_statement_sections"),
        )

    def _diagnose_cross_document_locator(
        self,
        *,
        ticker: str,
        current_document_id: str,
        kind: Literal["ref", "table_ref"],
        locator: str,
    ) -> Optional[str]:
        """Diagnose whether a locator may come from another cached document.

        when ``read_section`` / ``get_table`` cannot find the locator under the current ``document_id``,
        this method only probes processors already in the ``ProcessorLRUCache``,
        returns the suspected source ``document_id`` on a hit. This method strictly honors "never build a new processor,
        no disk scanning" cost constraint -- a zero-cost read-only snapshot diagnosis only.

        Args:
            ticker: normalized ticker.
            current_document_id: document ID used by the current call.
            kind: locator type; ``"ref"`` is a section reference, ``"table_ref"`` is a table reference.
            locator: the normalized locator string.

        Returns:
            the suspected source ``document_id``; ``None`` when no cached processor contains it.

        Raises:
            None.
        """

        for cache_key in self._processor_cache.keys_snapshot():
            if cache_key.ticker != ticker:
                continue
            if cache_key.document_id == current_document_id:
                continue
            cached_processor = self._processor_cache.peek(cache_key)
            if cached_processor is None:
                continue
            try:
                if kind == "ref":
                    cached_processor.read_section(locator)
                else:
                    cached_processor.read_table(locator)
            except KeyError:
                continue
            except Exception as exc:
                # note: diagnosis is a best-effort auxiliary path; any non-KeyError low-level exception
                # must not distort the original ToolArgumentError; log at debug level and skip the candidate.
                Log.debug(
                    f"cross-document locator diagnosis hit an unexpected error: ticker={ticker} "
                    f"candidate_document_id={cache_key.document_id} kind={kind} exc={exc}",
                    module=self.MODULE,
                )
                continue
            return cache_key.document_id
        return None

    def _get_or_create_processor(self, *, ticker: str, document_id: str) -> DocumentProcessor:
        """Read or create a Processor instance.

        Args:
            ticker: normalized ticker.
            document_id: normalized document ID.

        Returns:
            Processor instance.

        Raises:
            FileNotFoundError: raised when the document does not exist.
            ValueError: raised when no processor matches.
        """

        cache_key = ProcessorCacheKey(ticker=ticker, document_id=document_id)
        cached = self._processor_cache.get(cache_key)
        if cached is not None:
            return cached

        lock = self._get_creation_lock(cache_key)
        with lock:
            # note: concurrent threads double-check inside the lock to avoid building the Processor twice.
            cached = self._processor_cache.get(cache_key)
            if cached is not None:
                return cached
            processor = self._create_processor(ticker=ticker, document_id=document_id)
            self._processor_cache.put(cache_key, processor)
            Log.debug(
                f"processor created and cached: ticker={ticker} document_id={document_id} type={type(processor).__name__}",
                module=self.MODULE,
            )
            return processor

    def _create_processor(self, *, ticker: str, document_id: str) -> DocumentProcessor:
        """Create a Processor instance.

        Args:
            ticker: normalized ticker.
            document_id: normalized document ID.

        Returns:
            Processor instance.

        Raises:
            FileNotFoundError: raised when the document does not exist.
            ValueError: raised when no processor matches.
            RuntimeError: raised when all candidate processors fail to be created.
        """

        source_kind = self._resolve_source_kind(ticker=ticker, document_id=document_id)
        source = self._source_repository.get_primary_source(
            ticker=ticker,
            document_id=document_id,
            source_kind=source_kind,
        )
        source_meta = self._source_repository.get_source_meta(ticker, document_id, source_kind)
        form_type = normalize_optional_text(source_meta.get("form_type"))
        return self._processor_registry.create_with_fallback(
            source=source,
            form_type=form_type,
            media_type=getattr(source, "media_type", None),
        )

    def _resolve_source_kind(self, *, ticker: str, document_id: str) -> SourceKind:
        """Resolve the document source kind.

        Args:
            ticker: normalized ticker.
            document_id: normalized document ID.

        Returns:
            source kind.

        Raises:
            FileNotFoundError: raised when the document is in neither filing nor material.
        """

        try:
            self._source_repository.get_source_handle(ticker, document_id, SourceKind.FILING)
            return SourceKind.FILING
        except FileNotFoundError:
            pass
        try:
            self._source_repository.get_source_handle(ticker, document_id, SourceKind.MATERIAL)
            return SourceKind.MATERIAL
        except FileNotFoundError:
            pass
        raise FileNotFoundError(f"Document not found: ticker={ticker}, document_id={document_id}")

    def _get_creation_lock(self, cache_key: ProcessorCacheKey) -> Lock:
        """Read or create a document-level build lock.

        Args:
            cache_key: Processor cache key.

        Returns:
            document-level mutex.

        Raises:
            RuntimeError: raised when lock-table access fails.
        """

        with self._creation_locks_guard:
            lock = self._creation_locks.get(cache_key)
            if lock is not None:
                return lock
            created = Lock()
            self._creation_locks[cache_key] = created
            return created
