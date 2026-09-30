"""Service-layer general helper functions.

This module contains the non-search helper logic used by FinsToolService:
- text normalization (required / optional / form_type)
- recommended-document construction
- section normalization (children / page_range)
- financial date inference (fiscal_year / fiscal_period)
- table data payload normalization (records / markdown / raw_text)
- XBRL query and fact normalization (concept normalization / dedup / scale inference)
"""

from __future__ import annotations

import json
import re
from collections.abc import Mapping
from html import unescape
from typing import Any, Optional, cast

from scripts.vendor.filings.engine.exceptions import ToolArgumentError
from scripts.vendor.filings.engine.processors.base import (
    SectionContent,
    SectionSummary,
    TableContent,
)
from scripts.vendor.filings.fins._converters import normalize_optional_text
from scripts.vendor.filings.fins.domain.enums import SourceKind
from scripts.vendor.filings.fins.processors.form_type_utils import normalize_form_type

from .result_types import NotSupportedResult

# ---------------------------------------------------------------------------
# Precompiled regexs
# ---------------------------------------------------------------------------
_HTML_TAG_PATTERN = re.compile(r"<[^>]+>")

# ---------------------------------------------------------------------------
# XBRL default concept constants
# ---------------------------------------------------------------------------
_GLOBAL_DEFAULT_XBRL_CONCEPTS: tuple[str, ...] = ("Revenues", "NetIncomeLoss", "Assets")

_DEFAULT_XBRL_CONCEPTS_BY_FORM_TAXONOMY: dict[tuple[str, str], tuple[str, ...]] = {
    ("10-K", "us-gaap"): (
        "Revenues",
        "NetIncomeLoss",
        "Assets",
        "Liabilities",
        "StockholdersEquity",
        "NetCashProvidedByUsedInOperatingActivities",
    ),
    ("10-Q", "us-gaap"): (
        "Revenues",
        "NetIncomeLoss",
        "Assets",
        "Liabilities",
        "StockholdersEquity",
        "NetCashProvidedByUsedInOperatingActivities",
    ),
    ("20-F", "ifrs-full"): (
        "Revenue",
        "ProfitLoss",
        "Assets",
        "Liabilities",
        "Equity",
        "CashAndCashEquivalents",
    ),
}

_DEFAULT_XBRL_CONCEPTS_BY_TAXONOMY: dict[str, tuple[str, ...]] = {
    "us-gaap": (
        "Revenues",
        "NetIncomeLoss",
        "Assets",
        "Liabilities",
        "StockholdersEquity",
    ),
    "ifrs-full": (
        "Revenue",
        "ProfitLoss",
        "Assets",
        "Liabilities",
        "Equity",
    ),
}

# ---------------------------------------------------------------------------
# Recommended-document slot constants
# ---------------------------------------------------------------------------
_RECOMMENDED_DOCUMENT_KEYS: tuple[str, ...] = (
    "latest_document_id",
    "recommended_for_company_overview_document_id",
    "latest_annual_report_document_id",
    "latest_quarterly_report_document_id",
    "latest_current_report_document_id",
    "latest_proxy_document_id",
    "latest_ownership_document_id",
    "latest_earnings_call_document_id",
    "latest_earnings_presentation_document_id",
    "latest_material_document_id",
)

# ---------------------------------------------------------------------------
# form_type → document_type mapping
#
# document_type is an LLM-facing semantic field that hides the underlying SEC
# form details.
# Reserved values (no form_type maps to them yet; triggered via source_kind or
# future extensions):
#   semi_annual_report — A-share semi-annual report (H1)
#   earnings_call      — earnings conference call (stored in materials/)
# ---------------------------------------------------------------------------
_FORM_TYPE_TO_DOCUMENT_TYPE: dict[str, str] = {
    "10-K": "annual_report",
    "10-K/A": "annual_report",
    "20-F": "annual_report",
    "20-F/A": "annual_report",
    "10-Q": "quarterly_report",
    "10-Q/A": "quarterly_report",
    "6-K": "quarterly_report",
    "8-K": "current_report",
    "8-K/A": "current_report",
    "DEF 14A": "proxy",
    "SC 13G": "ownership",
    "SC 13G/A": "ownership",
    "SC 13D": "ownership",
    "SC 13D/A": "ownership",
}

# The HK/A-share upload pipeline currently writes the fiscal period directly
# into source meta.form_type.
# Here the fiscal_period semantics are recovered into an LLM-facing
# document_type, so that `list_documents` does not misclassify annual /
# semi-annual / quarterly reports all as other.
_CN_FORM_TYPE_TO_DOCUMENT_TYPE: dict[str, str] = {
    "FY": "annual_report",
    "H1": "semi_annual_report",
    "Q1": "quarterly_report",
    "Q2": "quarterly_report",
    "Q3": "quarterly_report",
    "Q4": "quarterly_report",
}

# When report_date / filing_date are missing, fall back to chronological order
# by fiscal_period. Larger numbers mean "newer" within the same year.
_FISCAL_PERIOD_SORT_ORDER: dict[str, int] = {
    "Q1": 1,
    "Q2": 2,
    "H1": 3,
    "Q3": 4,
    "Q4": 5,
    "FY": 6,
}

# Set of legal document_type values an LLM may pass (including reserved values)
_VALID_DOCUMENT_TYPES: frozenset[str] = frozenset(
    {
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
        "other",
    }
)

# material form_type → document_type fine-grained mapping table
# form_types not listed fall back to the generic "material"
_MATERIAL_FORM_TYPE_TO_DOCUMENT_TYPE: dict[str, str] = {
    "EARNINGS_CALL": "earnings_call",
    "EARNINGS_PRESENTATION": "earnings_presentation",
    "CORPORATE_GOVERNANCE": "corporate_governance",
}

# material form_type variants that may appear in historical or
# manually-maintained data.
# The tool pipeline normalizes them uniformly when consuming document metadata,
# so dirty data does not propagate into document_type.
_MATERIAL_FORM_TYPE_ALIASES: dict[str, str] = {
    "EARNING_CALLS": "EARNINGS_CALL",
    "EARNINGS_CALLS": "EARNINGS_CALL",
    "EARNING_PRESENTATIONS": "EARNINGS_PRESENTATION",
    "EARNINGS_PRESENTATIONS": "EARNINGS_PRESENTATION",
}


def _resolve_document_type(form_type: Optional[str], source_kind: str) -> str:
    """Derive the document type (document_type) from form_type and source_kind.

    The return value is an LLM-facing semantic enum; see _VALID_DOCUMENT_TYPES.

    Args:
        form_type: normalized form type.
        source_kind: document source kind (filing / material).

    Returns:
        document_type string.

    Raises:
        None.
    """

    if source_kind == SourceKind.MATERIAL.value:
        # specific material types map to semantically clearer document_types
        if form_type in _MATERIAL_FORM_TYPE_TO_DOCUMENT_TYPE:
            return _MATERIAL_FORM_TYPE_TO_DOCUMENT_TYPE[form_type]
        return "material"
    if form_type is None:
        return "other"
    if form_type in _CN_FORM_TYPE_TO_DOCUMENT_TYPE:
        return _CN_FORM_TYPE_TO_DOCUMENT_TYPE[form_type]
    return _FORM_TYPE_TO_DOCUMENT_TYPE.get(form_type, "other")


def build_document_recency_sort_key(item: Mapping[str, Any]) -> tuple[Any, ...]:
    """Build the unified sort key for document summaries.

    Sort goals:
    1. Sort by explicit dates first (`report_date` > `filing_date`).
    2. When dates are missing, fall back to `fiscal_year + fiscal_period`.
    3. When both are missing, fall back to `document_id`, only for stable sorting.

    Args:
        item: document summary dict.

    Returns:
        sort key usable directly in ``list.sort(..., reverse=True)``.

    Raises:
        None.
    """

    report_date = normalize_optional_text(item.get("report_date")) or ""
    filing_date = normalize_optional_text(item.get("filing_date")) or ""
    has_explicit_date = bool(report_date or filing_date)

    fiscal_year = item.get("fiscal_year")
    normalized_fiscal_year = fiscal_year if isinstance(fiscal_year, int) else -1
    normalized_fiscal_period = normalize_optional_text(item.get("fiscal_period"))
    fiscal_period_rank = _FISCAL_PERIOD_SORT_ORDER.get(normalized_fiscal_period or "", 0)
    has_fiscal_recency = normalized_fiscal_year > 0 or fiscal_period_rank > 0
    temporal_rank = 2 if has_explicit_date else 1 if has_fiscal_recency else 0

    primary_date = report_date or filing_date
    secondary_date = filing_date or report_date
    document_id = normalize_optional_text(item.get("document_id")) or ""
    return (
        temporal_rank,
        primary_date,
        secondary_date,
        normalized_fiscal_year,
        fiscal_period_rank,
        document_id,
    )


def resolve_document_type_for_source(*, form_type: Any, source_kind: Any) -> str:
    """Derive a stable document_type from raw source-document metadata.

    This function uniformly encapsulates the tool pipeline's document_type
    derivation logic: it first normalizes the raw ``form_type``, then maps it
    together with ``source_kind`` to the LLM-facing semantic ``document_type``.

    Args:
        form_type: raw form-type value.
        source_kind: raw source-kind value.

    Returns:
        stable ``document_type`` string.

    Raises:
        RuntimeError: raised when normalization fails.
    """

    normalized_form_type = _normalize_form_type_for_matching(form_type)
    normalized_source_kind = normalize_optional_text(source_kind) or ""
    return _resolve_document_type(normalized_form_type, normalized_source_kind)


def _collect_available_document_types(documents: list[dict[str, Any]]) -> list[str]:
    """Extract all document_types present in a document list (deduplicated, sorted).

    Also works for raw documents (base_documents) that do not yet carry a
    document_type field, deriving it on the fly from form_type / source_kind.

    Args:
        documents: document summary list (raw entries from the repository).

    Returns:
        deduplicated document_type list (alphabetical).

    Raises:
        None.
    """

    doc_types: set[str] = set()
    for doc in documents:
        # if document_type is already attached, use it directly; otherwise derive it on the fly
        dt = doc.get("document_type")
        if dt is None:
            dt = resolve_document_type_for_source(
                form_type=doc.get("form_type"),
                source_kind=doc.get("source_kind"),
            )
        doc_types.add(dt)
    return sorted(doc_types)


def _collect_parent_titles(
    section: SectionSummary,
    ref_to_section: dict[str, SectionSummary],
) -> list[str]:
    """Walk the parent_ref chain upward collecting parent section titles.

    Returns the list from the direct parent up to the root, for use by
    build_section_path (which reverses it internally to get forward order).

    Args:
        section: current section.
        ref_to_section: ref -> section index.

    Returns:
        parent title list (direct parent first, up to the root).
    """
    titles: list[str] = []
    visited: set[str] = set()
    current_ref = section.get("parent_ref")
    while current_ref and current_ref not in visited:
        visited.add(current_ref)
        parent = ref_to_section.get(current_ref)
        if parent is None:
            break
        parent_title = parent.get("title")
        if parent_title:
            titles.append(parent_title)
        current_ref = parent.get("parent_ref")
    return titles


def _normalize_form_type_for_matching(value: Any) -> Optional[str]:
    """Normalize the document form type.

    This function gives the tool layer a unified matching basis, handling alias
    differences such as `SC 13* / SCHEDULE 13* / 10K / 10-Q` so that filtering
    and recommendation logic stays stable.

    Args:
        value: raw form-type value.

    Returns:
        normalized form type; `None` when it cannot be normalized.

    Raises:
        RuntimeError: raised when normalization fails.
    """

    normalized = normalize_optional_text(value)
    if normalized is None:
        return None
    normalized_form = normalize_form_type(normalized)
    normalized_text = normalize_optional_text(normalized_form)
    if normalized_text is None:
        return None
    return _MATERIAL_FORM_TYPE_ALIASES.get(normalized_text, normalized_text)


def _normalize_document_types(document_types: Optional[list[str]]) -> Optional[list[str]]:
    """Normalize the document_types array parameter.

    Only enum values defined in _VALID_DOCUMENT_TYPES are allowed; invalid
    values are dropped directly (a lenient strategy, so that an LLM spelling
    variant does not disable the whole filter).

    Args:
        document_types: raw document-type array (passed by the LLM).

    Returns:
        deduplicated, cleaned list; `None` when the input is empty.

    Raises:
        ToolArgumentError: raised when the argument type is invalid.
    """

    if document_types is None:
        return None
    if not isinstance(document_types, list):
        raise ToolArgumentError(
            "list_documents", "document_types", document_types, "Must be a string array"
        )
    result: list[str] = []
    seen: set[str] = set()
    for dt in document_types:
        normalized = normalize_optional_text(dt)
        if normalized is None or normalized not in _VALID_DOCUMENT_TYPES:
            continue
        if normalized not in seen:
            seen.add(normalized)
            result.append(normalized)
    return result or None


def _build_recommended_documents(documents: list[dict[str, Any]]) -> dict[str, Optional[str]]:
    """Build the fixed slots of `list_documents.recommended_documents`.

    Args:
        documents: full document list sorted by recency (with `document_type` attached).

    Returns:
        recommended-document slot dict.

    Raises:
        RuntimeError: raised when construction fails.
    """

    recommendations: dict[str, Optional[str]] = {key: None for key in _RECOMMENDED_DOCUMENT_KEYS}
    if not documents:
        return recommendations

    for item in documents:
        document_id = normalize_optional_text(item.get("document_id"))
        if document_id is None:
            continue
        # document_type was already attached by the caller in the filter loop
        doc_type = item.get("document_type") or ""

        if recommendations["latest_document_id"] is None:
            recommendations["latest_document_id"] = document_id
        if (
            recommendations["latest_annual_report_document_id"] is None
            and doc_type == "annual_report"
        ):
            recommendations["latest_annual_report_document_id"] = document_id
        if recommendations["latest_quarterly_report_document_id"] is None and doc_type in {
            "quarterly_report",
            "semi_annual_report",
        }:
            recommendations["latest_quarterly_report_document_id"] = document_id
        if (
            recommendations["latest_current_report_document_id"] is None
            and doc_type == "current_report"
        ):
            recommendations["latest_current_report_document_id"] = document_id
        if recommendations["latest_proxy_document_id"] is None and doc_type == "proxy":
            recommendations["latest_proxy_document_id"] = document_id
        if recommendations["latest_ownership_document_id"] is None and doc_type == "ownership":
            recommendations["latest_ownership_document_id"] = document_id
        if (
            recommendations["latest_earnings_call_document_id"] is None
            and doc_type == "earnings_call"
        ):
            recommendations["latest_earnings_call_document_id"] = document_id
        if (
            recommendations["latest_earnings_presentation_document_id"] is None
            and doc_type == "earnings_presentation"
        ):
            recommendations["latest_earnings_presentation_document_id"] = document_id
        if recommendations["latest_material_document_id"] is None and doc_type == "material":
            recommendations["latest_material_document_id"] = document_id

    recommendations["recommended_for_company_overview_document_id"] = (
        recommendations["latest_annual_report_document_id"]
        or recommendations["latest_quarterly_report_document_id"]
        or recommendations["latest_proxy_document_id"]
        or recommendations["latest_current_report_document_id"]
        or recommendations["latest_ownership_document_id"]
        or recommendations["latest_document_id"]
    )
    return recommendations


def resolve_has_financial_data(
    *,
    has_financial_data: Any = None,
    availability: Any = None,
    has_financial_statement: Any = None,
    has_xbrl: Any = None,
    has_structured_financial_statements: Any = None,
    has_financial_statement_sections: Any = None,
) -> Optional[bool]:
    """Conservatively derive has_financial_data.

    Design principle: return `None` rather than mislead the LLM when the
    capability semantics are unclear.

    Decision priority:
    1. The explicit `has_financial_data` field
    2. The internal `financial_statement_availability` enum
    3. Internal booleans: `has_structured_financial_statements` / `has_financial_statement_sections`
    4. Legacy fields: `has_xbrl` / `has_financial_statement`

    Args:
        has_financial_data: direct has_financial_data field.
        availability: internal availability enum.
        has_financial_statement: legacy capability boolean.
        has_xbrl: legacy XBRL capability boolean.
        has_structured_financial_statements: internal structured-data capability boolean.
        has_financial_statement_sections: internal section-level capability boolean.

    Returns:
        `True` (get_financial_statement callable) / `False` (no data) / `None` (cannot decide).

    Raises:
        None.
    """

    # Priority 1: direct field
    if has_financial_data is not None:
        return bool(has_financial_data)

    # Priority 2: internal availability enum
    norm_avail = normalize_optional_text(availability) if availability is not None else None
    if norm_avail in ("structured_data_available", "statement_sections_available"):
        return True
    if norm_avail == "not_available":
        return False

    # Priority 3: internal booleans
    if has_structured_financial_statements is True:
        return True
    if has_financial_statement_sections is True:
        return True

    # Priority 4: legacy fields
    if has_financial_statement is False:
        return False
    if has_xbrl is True:
        return True

    # Cannot be conservatively decided
    return None


def build_search_next_section_fields(
    *,
    matches: list[dict[str, Any]],
    queries: Optional[list[str]] = None,
) -> tuple[Optional[dict[str, Any]], Optional[dict[str, Optional[dict[str, Any]]]]]:
    """Build next-section-to-read fields from search hits.

    Args:
        matches: `search_document` matches list.
        queries: raw query list in multi-query mode; pass `None` for single query.

    Returns:
        `(next_section_to_read, next_section_by_query)`.

        - single query: `next_section_to_read` is an object or `None`; `next_section_by_query` is `None`
        - multi-query: `next_section_to_read` is `None`; `next_section_by_query` is a `query -> object|None` mapping

    Raises:
        RuntimeError: raised when construction fails.
    """

    section_stats: dict[str, dict[str, Any]] = {}
    query_section_stats: dict[str, dict[str, dict[str, Any]]] = {}

    for index, match in enumerate(matches):
        if not isinstance(match, Mapping):
            continue
        section = match.get("section")
        if not isinstance(section, Mapping):
            continue
        section_ref = normalize_optional_text(section.get("ref"))
        if section_ref is None:
            continue
        matched_query = normalize_optional_text(match.get("matched_query"))
        is_exact_phrase = bool(match.get("is_exact_phrase"))
        stat = section_stats.setdefault(
            section_ref,
            {
                "section": {
                    "ref": section_ref,
                    "title": normalize_optional_text(section.get("title")),
                    "item": normalize_optional_text(section.get("item")),
                    "topic": normalize_optional_text(section.get("topic")),
                },
                "evidence_hit_count": 0,
                "_exact_match_count": 0,
                "_first_index": index,
            },
        )
        stat["evidence_hit_count"] += 1
        if is_exact_phrase:
            stat["_exact_match_count"] += 1

        if matched_query is not None:
            per_query = query_section_stats.setdefault(matched_query, {})
            per_query_stat = per_query.setdefault(
                section_ref,
                {
                    "section": stat["section"],
                    "evidence_hit_count": 0,
                    "_exact_match_count": 0,
                    "_first_index": index,
                },
            )
            per_query_stat["evidence_hit_count"] += 1
            if is_exact_phrase:
                per_query_stat["_exact_match_count"] += 1

    ranked_sections = sorted(
        section_stats.values(),
        key=lambda item: (
            -int(item["evidence_hit_count"]),
            -int(item["_exact_match_count"]),
            int(item["_first_index"]),
        ),
    )

    if queries is None:
        next_section_to_read = (
            _strip_search_section_internal_fields(ranked_sections[0]) if ranked_sections else None
        )
        return next_section_to_read, None

    next_section_by_query: dict[str, Optional[dict[str, Any]]] = {}
    for query in queries:
        normalized_query = normalize_optional_text(query)
        if normalized_query is None:
            continue
        candidate_stats = query_section_stats.get(normalized_query, {})
        if not candidate_stats:
            next_section_by_query[normalized_query] = None
            continue
        next_section_by_query[normalized_query] = _strip_search_section_internal_fields(
            sorted(
                candidate_stats.values(),
                key=lambda item: (
                    -int(item["evidence_hit_count"]),
                    -int(item["_exact_match_count"]),
                    int(item["_first_index"]),
                ),
            )[0]
        )
    return None, next_section_by_query


def _strip_search_section_internal_fields(section_stat: dict[str, Any]) -> dict[str, Any]:
    """Remove internal fields from the search-section aggregate.

    Args:
        section_stat: section aggregate dict with internal statistics fields.

    Returns:
        dict containing only fields with decision value for the LLM.

    Raises:
        RuntimeError: raised when cleanup fails.
    """

    return {
        "section": dict(section_stat.get("section") or {}),
        "evidence_hit_count": int(section_stat.get("evidence_hit_count") or 0),
    }


# =====================================================================
# Section normalization
# =====================================================================


def _normalize_section_children(raw_children: Any) -> list[dict[str, Any]]:
    """Normalize the `read_section.children` field.

    Keeps only the minimal navigation fields ref + title:
    - ref: the read_section argument; the LLM must hold it.
    - title: helps the LLM judge the topical relevance of child sections.
    - level / preview / parent_ref are dropped:
      level is always parent+1 (zero information gain); preview is highly redundant with title
      (aligned with the T1 decision to drop preview in get_document_sections),
      parent_ref is just the current section (zero information gain).

    Args:
        raw_children: raw children value.

    Returns:
        normalized children list; empty list for invalid input.
    """

    if not isinstance(raw_children, list):
        return []
    normalized: list[dict[str, Any]] = []
    for child in raw_children:
        if not isinstance(child, Mapping):
            continue
        ref = normalize_optional_text(child.get("ref"))
        if ref is None:
            continue
        title = normalize_optional_text(child.get("title"))
        normalized.append({"ref": ref, "title": title})
    return normalized


def _normalize_periods(periods: Optional[list[str]]) -> Optional[list[str]]:
    """Normalize the fiscal-period array.

    Args:
        periods: raw fiscal-period array.

    Returns:
        normalized fiscal-period array; `None` when the input is empty.

    Raises:
        ToolArgumentError: raised when the argument type is invalid.
    """

    if periods is None:
        return None
    if not isinstance(periods, list):
        raise ToolArgumentError(
            "list_documents", "fiscal_periods", periods, "Must be a string array"
        )
    result: list[str] = []
    for period in periods:
        normalized = normalize_optional_text(period)
        if normalized is None:
            continue
        result.append(normalized)
    return result or None


def _build_not_supported_result(
    *,
    ticker: str,
    document_id: str,
    feature: str,
    payload: Optional[dict[str, Any]] = None,
) -> NotSupportedResult:
    """Build the not-supported-capability result.

    Args:
        ticker: ticker.
        document_id: document ID.
        feature: capability name.
        payload: extra echo fields.

    Returns:
        the structured ``not_supported`` result.

    Raises:
        RuntimeError: raised when construction fails.
    """

    message = f"Current document processor does not support feature: {feature}"
    result: dict[str, Any] = {
        "ticker": ticker,
        "document_id": document_id,
        "supported": False,
        "error": {
            "code": "not_supported",
            "message": message,
        },
    }
    if payload:
        result.update(payload)
    # Known echo fields (page_no / statement_type / concepts) are declared in
    # NotSupportedResult; the payload comes from each caller's deterministic
    # dict, so the runtime structure is guaranteed.
    return cast(NotSupportedResult, result)


def _extract_page_range(
    section: SectionSummary | SectionContent | Mapping[str, Any],
) -> Optional[list[int]]:
    """Extract the page range from a section structure.

    Args:
        section: section structure object.

    Returns:
        page range; `None` when absent.

    Raises:
        RuntimeError: raised when extraction fails.
    """

    raw = section.get("page_range")
    if not isinstance(raw, list) or len(raw) != 2:
        return None
    start, end = raw
    if isinstance(start, int) and isinstance(end, int) and start > 0 and end > 0:
        return [start, end]
    return None


# =====================================================================
# Financial date inference
# =====================================================================


def _infer_fiscal_period(meta: dict[str, Any]) -> Optional[str]:
    """Infer the fiscal period.

    Args:
        meta: document metadata.

    Returns:
        fiscal-period string or `None`.

    Raises:
        RuntimeError: raised when inference fails.
    """

    raw_period = normalize_optional_text(meta.get("fiscal_period"))
    if raw_period is not None:
        return raw_period

    form_type = normalize_optional_text(meta.get("form_type"))
    if form_type in {"10-K", "20-F"}:
        return "FY"
    return None


def _resolve_fiscal_year_with_fallback(
    raw_value: Any, inferred_year: Optional[int]
) -> Optional[int]:
    """Parse fiscal_year, falling back to the inferred value when empty.

    Args:
        raw_value: raw fiscal_year value in the source meta.
        inferred_year: fiscal_year inferred from `report_date` and similar.

    Returns:
        usable fiscal_year; `inferred_year` when the raw value is empty or invalid.

    Raises:
        RuntimeError: raised when parsing fails.
    """

    if isinstance(raw_value, bool):
        return inferred_year
    if isinstance(raw_value, int):
        return raw_value if raw_value > 0 else inferred_year
    text = normalize_optional_text(raw_value)
    if text is None:
        return inferred_year
    try:
        parsed = int(text)
    except ValueError:
        return inferred_year
    if parsed <= 0:
        return inferred_year
    return parsed


def _resolve_fiscal_period_with_fallback(
    raw_value: Any, inferred_period: Optional[str]
) -> Optional[str]:
    """Parse fiscal_period, falling back to the inferred value when empty.

    Args:
        raw_value: raw fiscal_period value in the source meta.
        inferred_period: inferred fiscal_period.

    Returns:
        usable fiscal_period; `inferred_period` when the raw value is empty.

    Raises:
        RuntimeError: raised when parsing fails.
    """

    normalized = normalize_optional_text(raw_value)
    if normalized is not None:
        return normalized
    return inferred_period


def _infer_fiscal_year(meta: dict[str, Any], fiscal_period: Optional[str]) -> Optional[int]:
    """Infer the fiscal year.

    Args:
        meta: document metadata.
        fiscal_period: inferred fiscal period.

    Returns:
        fiscal year or `None`.

    Raises:
        RuntimeError: raised when inference fails.
    """

    raw_year = meta.get("fiscal_year")
    if isinstance(raw_year, int):
        return raw_year

    del fiscal_period
    return None


def _extract_year(iso_date: str) -> Optional[int]:
    """Extract the year from an ISO date.

    Args:
        iso_date: ISO date string.

    Returns:
        year integer; `None` when it cannot be extracted.

    Raises:
        RuntimeError: raised when extraction fails.
    """

    parts = iso_date.split("-")
    if len(parts) < 2:
        return None
    try:
        year = int(parts[0])
    except ValueError:
        return None
    if year <= 0:
        return None
    return year


def _to_optional_float(value: Any) -> Optional[float]:
    """Convert any value to an optional float.

    Args:
        value: raw value.

    Returns:
        float value when parseable, otherwise `None`.

    Raises:
        RuntimeError: raised when conversion fails.
    """

    if value is None:
        return None
    if isinstance(value, str) and not value.strip():
        return None
    try:
        numeric = float(value)
    except Exception:
        return None
    if numeric != numeric:  # NaN
        return None
    return numeric


# =====================================================================
# Table normalization
# =====================================================================


def _build_table_data_payload(table_raw: TableContent | Mapping[str, Any]) -> dict[str, Any]:
    """Build the self-explanatory structure of `get_table.data`.

    Args:
        table_raw: raw table content returned by the processor.

    Returns:
        unified `data` structure, always one of these three forms:
        - `records`: contains `columns` and `rows`
        - `markdown`: contains `markdown`
        - `raw_text`: contains `text`

    Raises:
        RuntimeError: raised when construction fails.
    """

    raw_format = normalize_optional_text(table_raw.get("data_format"))
    normalized_format = (raw_format or "unknown").lower()
    raw_data = table_raw.get("data")
    raw_columns = table_raw.get("columns")

    # Complex-logic note: branch on the processor-declared format first, then
    # fall back to content-based recognition, so that data_format never
    # disagrees with the actual shape of data.
    if normalized_format == "records":
        return _build_records_data_payload(
            raw_data=raw_data,
            raw_columns=raw_columns,
        )
    if normalized_format == "markdown":
        text = _coerce_table_text(raw_data)
        if _looks_like_markdown_table(text):
            return {
                "kind": "markdown",
                "description": "Markdown table text, ready to render.",
                "markdown": text,
            }
        return {
            "kind": "raw_text",
            "description": "Raw text content; does not meet standard Markdown table structure.",
            "text": text,
        }

    if isinstance(raw_data, list):
        return _build_records_data_payload(
            raw_data=raw_data,
            raw_columns=raw_columns,
        )
    text = _coerce_table_text(raw_data)
    if _looks_like_markdown_table(text):
        return {
            "kind": "markdown",
            "description": "Markdown table text, ready to render.",
            "markdown": text,
        }
    return {
        "kind": "raw_text",
        "description": "Raw text content; does not meet standard Markdown table structure.",
        "text": text,
    }


def _build_records_data_payload(
    *,
    raw_data: Any,
    raw_columns: Any,
) -> dict[str, Any]:
    """Build `records`-type table data.

    Args:
        raw_data: raw data body, expected to be an array of records.
        raw_columns: raw column-name info.

    Returns:
        the data body in `records` form.

    Raises:
        RuntimeError: raised when construction fails.
    """

    rows = _normalize_table_rows(raw_data)
    columns = _normalize_table_columns(raw_columns, rows)
    return {
        "kind": "records",
        "description": "Structured table data; rows are row-level objects, columns define column order.",
        "columns": columns,
        "rows": rows,
    }


def _normalize_table_rows(raw_data: Any) -> list[dict[str, Any]]:
    """Normalize records row data.

    Args:
        raw_data: raw row data.

    Returns:
        normalized row object list.

    Raises:
        RuntimeError: raised when normalization fails.
    """

    if not isinstance(raw_data, list):
        return []

    normalized_rows: list[dict[str, Any]] = []
    for row in raw_data:
        if isinstance(row, Mapping):
            normalized_row: dict[str, Any] = {}
            for key, value in row.items():
                normalized_key = normalize_optional_text(key) if key is not None else None
                normalized_row[normalized_key or str(key)] = value
            normalized_rows.append(normalized_row)
            continue
        if isinstance(row, list):
            indexed_row = {str(index): value for index, value in enumerate(row)}
            normalized_rows.append(indexed_row)
            continue
        normalized_rows.append({"value": row})
    return normalized_rows


def _normalize_table_columns(
    raw_columns: Any,
    rows: list[dict[str, Any]],
) -> list[str]:
    """Normalize the records column-name list.

    Args:
        raw_columns: raw column-name candidates.
        rows: normalized row data.

    Returns:
        column name list.

    Raises:
        RuntimeError: raised when normalization fails.
    """

    normalized_columns: list[str] = []
    if isinstance(raw_columns, list):
        seen: set[str] = set()
        for column in raw_columns:
            if column is None:
                continue
            normalized = normalize_optional_text(column)
            if normalized is None or normalized in seen:
                continue
            seen.add(normalized)
            normalized_columns.append(normalized)
    if normalized_columns:
        return normalized_columns
    if not rows:
        return []
    return list(rows[0].keys())


def _coerce_table_text(raw_data: Any) -> str:
    """Convert any table content to text as a last resort.

    Args:
        raw_data: raw data body.

    Returns:
        text-form content.

    Raises:
        RuntimeError: raised when conversion fails.
    """

    if raw_data is None:
        return ""
    if isinstance(raw_data, str):
        return raw_data
    return str(raw_data)


def _looks_like_markdown_table(text: str) -> bool:
    """Judge whether text approximates Markdown table structure.

    Args:
        text: candidate text.

    Returns:
        `True` when it can be regarded as a Markdown table, `False` when it
        looks more like ordinary plain text.

    Raises:
        RuntimeError: raised when the check fails.
    """

    stripped = text.strip()
    if not stripped:
        return False
    lines = [line.strip() for line in stripped.splitlines() if line.strip()]
    if len(lines) < 2:
        return False
    header_line = lines[0]
    separator_line = lines[1]
    if "|" not in header_line or "|" not in separator_line:
        return False
    return bool(re.match(r"^\|?[\s:\-|]+\|?$", separator_line))


def _normalize_table_type(raw_table_type: Any) -> Optional[str]:
    """Normalize the table type field.

    Args:
        raw_table_type: raw table type emitted by the processor.

    Returns:
        valid type string (`layout/data/financial`) or `None`.

    Raises:
        RuntimeError: raised when normalization fails.
    """

    normalized = normalize_optional_text(raw_table_type)
    if normalized is None:
        return None
    lowered = normalized.lower()
    if lowered not in {"layout", "data", "financial"}:
        return None
    return lowered


# =====================================================================
# XBRL helpers
# =====================================================================


def _resolve_processor_taxonomy(processor: Any) -> Optional[str]:
    """Read the XBRL taxonomy from a processor.

    Args:
        processor: processor instance.

    Returns:
        normalized taxonomy (`us-gaap` / `ifrs-full`) or `None`.

    Raises:
        RuntimeError: raised when parsing fails.
    """

    taxonomy_method = getattr(processor, "get_xbrl_taxonomy", None)
    if callable(taxonomy_method):
        try:
            return _normalize_taxonomy_name(taxonomy_method())
        except Exception:
            return None
    raw_taxonomy = getattr(processor, "xbrl_taxonomy", None)
    return _normalize_taxonomy_name(raw_taxonomy)


def _normalize_taxonomy_name(taxonomy: Any) -> Optional[str]:
    """Normalize the taxonomy name.

    Args:
        taxonomy: raw taxonomy value.

    Returns:
        normalized taxonomy; `None` when unknown.

    Raises:
        RuntimeError: raised when normalization fails.
    """

    normalized = normalize_optional_text(taxonomy)
    if normalized is None:
        return None
    lowered = normalized.lower()
    if lowered.startswith("us-gaap"):
        return "us-gaap"
    if lowered.startswith("ifrs"):
        return "ifrs-full"
    return None


def _resolve_default_xbrl_concepts(
    *, form_type: Optional[str], taxonomy: Optional[str]
) -> list[str]:
    """Resolve the default concept pack by `(form_type, taxonomy)`.

    Args:
        form_type: optional SEC form.
        taxonomy: optional taxonomy.

    Returns:
        default concept list (non-empty).

    Raises:
        RuntimeError: raised when parsing fails.
    """

    normalized_form = normalize_optional_text(form_type)
    normalized_taxonomy = _normalize_taxonomy_name(taxonomy)
    if normalized_form and normalized_taxonomy:
        matched = _DEFAULT_XBRL_CONCEPTS_BY_FORM_TAXONOMY.get(
            (normalized_form, normalized_taxonomy)
        )
        if matched:
            return list(matched)
    if normalized_taxonomy:
        taxonomy_defaults = _DEFAULT_XBRL_CONCEPTS_BY_TAXONOMY.get(normalized_taxonomy)
        if taxonomy_defaults:
            return list(taxonomy_defaults)
    return list(_GLOBAL_DEFAULT_XBRL_CONCEPTS)


def _normalize_xbrl_query_payload(
    *,
    payload: Mapping[str, Any] | dict[str, Any],
    default_concepts: list[str],
) -> dict[str, Any]:
    """Normalize the output payload of `query_xbrl_facts`.

    Args:
        payload: processor return payload.
        default_concepts: the concept list actually used by this query.

    Returns:
        structurally stable, deduplicated payload with cleaned text.

    Raises:
        RuntimeError: raised when normalization fails.
    """

    query_params_raw = payload.get("query_params")
    query_params = dict(query_params_raw) if isinstance(query_params_raw, Mapping) else {}
    query_params["concepts"] = _normalize_concepts_for_query(
        query_params.get("concepts"), default_concepts
    )

    facts_raw = payload.get("facts")
    if not isinstance(facts_raw, list):
        facts_raw = []

    normalized_pairs: list[tuple[dict[str, Any], dict[str, Any], int]] = []
    for index, raw_fact in enumerate(facts_raw):
        if not isinstance(raw_fact, Mapping):
            continue
        normalized_fact = _normalize_single_fact(raw_fact)
        if normalized_fact is None:
            continue
        normalized_pairs.append((normalized_fact, dict(raw_fact), index))

    deduped_facts = _deduplicate_xbrl_facts(normalized_pairs)
    normalized_payload = dict(payload)
    normalized_payload["query_params"] = query_params
    normalized_payload["facts"] = deduped_facts
    normalized_payload["total"] = len(deduped_facts)
    return normalized_payload


def _normalize_concepts_for_query(raw_concepts: Any, default_concepts: list[str]) -> list[str]:
    """Normalize the query concept list.

    Args:
        raw_concepts: raw concept field.
        default_concepts: default concept list.

    Returns:
        normalized concept list (guaranteed non-empty).

    Raises:
        RuntimeError: raised when normalization fails.
    """

    if not isinstance(raw_concepts, list):
        return list(default_concepts)
    normalized: list[str] = []
    for item in raw_concepts:
        concept = normalize_optional_text(item)
        if concept is None:
            continue
        normalized.append(concept)
    return normalized or list(default_concepts)


def _normalize_single_fact(raw_fact: Mapping[str, Any]) -> Optional[dict[str, Any]]:
    """Normalize a single fact.

    Args:
        raw_fact: raw fact object.

    Returns:
        normalized fact; `None` when it carries no usable number/text.

    Raises:
        RuntimeError: raised when normalization fails.
    """

    concept = str(raw_fact.get("concept") or "")
    label = str(raw_fact.get("label") or raw_fact.get("original_label") or concept)
    numeric_value = _to_optional_float(raw_fact.get("numeric_value"))
    if numeric_value is None:
        numeric_value = _to_optional_float(raw_fact.get("value"))

    raw_text_value: Optional[str] = None
    candidate_text = raw_fact.get("text_value")
    if isinstance(candidate_text, str):
        raw_text_value = candidate_text
    elif isinstance(raw_fact.get("value"), str):
        raw_text_value = str(raw_fact.get("value"))

    text_value: Optional[str] = None
    content_type: Optional[str] = None
    if numeric_value is None and raw_text_value is not None:
        cleaned = _clean_fact_text_value(raw_text_value)
        text_value = cleaned or None
        if text_value is not None:
            content_type = "xhtml" if _looks_like_html_text(raw_text_value) else "plain"

    if numeric_value is None and text_value is None:
        return None

    # Parse decimals and infer scale
    raw_decimals = raw_fact.get("decimals")
    decimals = _parse_xbrl_decimals_value(raw_decimals)
    scale = _infer_scale_from_decimals(decimals) if numeric_value is not None else None

    return {
        "concept": concept,
        "label": label,
        "numeric_value": numeric_value,
        "text_value": text_value,
        "content_type": content_type,
        "unit": raw_fact.get("unit") or raw_fact.get("unit_ref"),
        "decimals": decimals,
        "scale": scale,
        "period_type": raw_fact.get("period_type"),
        "period_start": raw_fact.get("period_start"),
        "period_end": raw_fact.get("period_end"),
        "fiscal_year": raw_fact.get("fiscal_year"),
        "fiscal_period": raw_fact.get("fiscal_period"),
        "statement_type": raw_fact.get("statement_type"),
    }


def _clean_fact_text_value(text: str) -> str:
    """Clean a fact text value (strip tags, unescape, collapse whitespace).

    Args:
        text: raw text.

    Returns:
        cleaned readable text.

    Raises:
        RuntimeError: raised when cleanup fails.
    """

    if not text:
        return ""
    stripped = _HTML_TAG_PATTERN.sub(" ", text)
    unescaped = unescape(stripped)
    return re.sub(r"\s+", " ", unescaped).strip()


def _looks_like_html_text(text: str) -> bool:
    """Judge whether text contains HTML/XHTML tags.

    Args:
        text: candidate text.

    Returns:
        `True` when it contains a tag, otherwise `False`.

    Raises:
        RuntimeError: raised when the check fails.
    """

    if not text:
        return False
    return bool(_HTML_TAG_PATTERN.search(text))


def _deduplicate_xbrl_facts(
    normalized_pairs: list[tuple[dict[str, Any], dict[str, Any], int]],
) -> list[dict[str, Any]]:
    """Deduplicate XBRL facts by a deterministic policy.

    Dedup key: `(canonical_concept, period_start, period_end, fiscal_year, dedup_fiscal_period, unit, segment_signature)`.
    When `period_end` exists, `dedup_fiscal_period` is fixed to empty, so the same
    period-end is not duplicated just because fiscal_period is missing.
    Retention priority: numeric > fiscal_period non-empty > statement_type
    non-empty > has segment > better decimals > earlier occurrence.

    Args:
        normalized_pairs: list of `(normalized_fact, raw_fact, source_index)` triples.

    Returns:
        deduplicated normalized fact list.

    Raises:
        RuntimeError: raised when dedup fails.
    """

    selected: dict[
        tuple[str, str, str, str, str, str, str],
        tuple[dict[str, Any], int, tuple[int, int, int, int, int]],
    ] = {}
    first_seen_index: dict[tuple[str, str, str, str, str, str, str], int] = {}

    for normalized_fact, raw_fact, source_index in normalized_pairs:
        dedup_key = _build_fact_dedup_key(normalized_fact, raw_fact)
        score = _build_fact_selection_score(normalized_fact, raw_fact)
        current = selected.get(dedup_key)
        if current is None or score > current[2]:
            selected[dedup_key] = (normalized_fact, source_index, score)
            if dedup_key not in first_seen_index:
                first_seen_index[dedup_key] = source_index
            continue
        if score == current[2] and source_index < current[1]:
            selected[dedup_key] = (normalized_fact, source_index, score)
            if dedup_key not in first_seen_index:
                first_seen_index[dedup_key] = source_index

    ordered_items = sorted(
        selected.items(), key=lambda item: first_seen_index.get(item[0], item[1][1])
    )
    return [item[1][0] for item in ordered_items]


def _build_fact_dedup_key(
    normalized_fact: Mapping[str, Any],
    raw_fact: Mapping[str, Any],
) -> tuple[str, str, str, str, str, str, str]:
    """Build the fact dedup key.

    Args:
        normalized_fact: normalized fact.
        raw_fact: raw fact.

    Returns:
        dedupe-key tuple (`fiscal_period` is not used to distinguish when `period_end` exists).

    Raises:
        RuntimeError: raised when construction fails.
    """

    canonical_concept = _canonicalize_concept(normalized_fact.get("concept"))
    period_start = str(raw_fact.get("period_start") or "")
    period_end = str(normalized_fact.get("period_end") or "")
    fiscal_year = str(normalized_fact.get("fiscal_year") or "")
    fiscal_period = str(normalized_fact.get("fiscal_period") or "")
    dedup_fiscal_period = fiscal_period if not period_end else ""
    unit = str(normalized_fact.get("unit") or "")
    segment_signature = _build_segment_signature(
        raw_fact.get("segment") or raw_fact.get("dimensions")
    )
    return (
        canonical_concept,
        period_start,
        period_end,
        fiscal_year,
        dedup_fiscal_period,
        unit,
        segment_signature,
    )


def _canonicalize_concept(concept: Any) -> str:
    """Normalize a concept to a canonical key.

    Args:
        concept: raw concept.

    Returns:
        normalized local name (lowercase).

    Raises:
        RuntimeError: raised when normalization fails.
    """

    normalized = normalize_optional_text(concept) or ""
    if ":" in normalized:
        normalized = normalized.split(":")[-1]
    return normalized.strip().lower()


def _build_segment_signature(segment: Any) -> str:
    """Build the stable signature of a segment.

    Args:
        segment: raw segment/dimensions object.

    Returns:
        stable signature string; empty string for empty objects.

    Raises:
        RuntimeError: raised when construction fails.
    """

    if segment is None:
        return ""
    try:
        return json.dumps(segment, ensure_ascii=False, sort_keys=True)
    except TypeError:
        return str(segment)


def _build_fact_selection_score(
    normalized_fact: Mapping[str, Any],
    raw_fact: Mapping[str, Any],
) -> tuple[int, int, int, int, int]:
    """Build the fact retention-priority score.

    Args:
        normalized_fact: normalized fact.
        raw_fact: raw fact.

    Returns:
        comparable score tuple; larger means higher priority.

    Raises:
        RuntimeError: raised when scoring fails.
    """

    numeric_score = 1 if normalized_fact.get("numeric_value") is not None else 0
    fiscal_period_score = 1 if normalize_optional_text(normalized_fact.get("fiscal_period")) else 0
    statement_type_score = (
        1 if normalize_optional_text(normalized_fact.get("statement_type")) else 0
    )
    segment_score = (
        1 if _build_segment_signature(raw_fact.get("segment") or raw_fact.get("dimensions")) else 0
    )
    precision_score = _parse_xbrl_decimals(raw_fact.get("decimals"))
    return (
        numeric_score,
        fiscal_period_score,
        statement_type_score,
        segment_score,
        precision_score,
    )


def _parse_xbrl_decimals(raw_decimals: Any) -> int:
    """Parse the XBRL decimals precision score.

    Args:
        raw_decimals: raw decimals value.

    Returns:
        precision score; larger means more precise.

    Raises:
        RuntimeError: raised when parsing fails.
    """

    if raw_decimals is None:
        return -100000
    if isinstance(raw_decimals, str) and raw_decimals.strip().upper() == "INF":
        return 100000
    try:
        return int(str(raw_decimals).strip())
    except ValueError:
        return -100000


def _parse_xbrl_decimals_value(raw_decimals: Any) -> Optional[int]:
    """Parse XBRL decimals into the actual integer value.

    Unlike ``_parse_xbrl_decimals``, this function returns the raw semantic
    value rather than a score. ``INF`` returns ``None`` (meaning infinite precision).

    Args:
        raw_decimals: raw decimals value (int / str / None).

    Returns:
        integer decimals or ``None``.

    Raises:
        RuntimeError: raised when parsing fails.
    """

    if raw_decimals is None:
        return None
    if isinstance(raw_decimals, str) and raw_decimals.strip().upper() == "INF":
        return None
    try:
        return int(str(raw_decimals).strip())
    except ValueError:
        return None


# decimals → scale mapping table
_DECIMALS_SCALE_MAP: dict[int, str] = {
    -9: "billions",
    -6: "millions",
    -3: "thousands",
    0: "units",
}


# ---------------------------------------------------------------------------
# match_quality match-quality label constants
# ---------------------------------------------------------------------------
_MATCH_QUALITY_EXACT = "exact"
_MATCH_QUALITY_MIXED = "mixed"
_MATCH_QUALITY_EXPANSION_ONLY = "expansion_only"
_MATCH_QUALITY_NONE = "none"


def _build_match_quality(
    matches: list[dict[str, Any]],
) -> dict[str, Any]:
    """Build the LLM-facing match-quality summary from the post-cap match list.

    Counts are based on the actual match list after exact-first capping, ensuring
    ``exact_phrase_matches + expansion_matches == total_matches`` and removing
    cross-semantic-level cognitive ambiguity.

    Args:
        matches: match list after sorting, dedup, and exact-first limiting
            (each carrying an ``is_exact_phrase`` field).

    Returns:
        contains ``exact_phrase_matches``, ``expansion_matches``, ``primary_source``
        dict of the three fields.
    """
    exact_count = sum(1 for m in matches if m.get("is_exact_phrase"))
    expansion_count = len(matches) - exact_count

    if not matches:
        primary_source = _MATCH_QUALITY_NONE
    elif exact_count > 0 and expansion_count == 0:
        primary_source = _MATCH_QUALITY_EXACT
    elif exact_count == 0 and expansion_count > 0:
        primary_source = _MATCH_QUALITY_EXPANSION_ONLY
    else:
        primary_source = _MATCH_QUALITY_MIXED

    return {
        "exact_phrase_matches": exact_count,
        "expansion_matches": expansion_count,
        "primary_source": primary_source,
    }


def _extract_top_section_ref(matches: list[dict[str, Any]]) -> Optional[str]:
    """Take the first valid section ref from a matches list.

    Args:
        matches: search_document matches list.

    Returns:
        first non-empty section ref; ``None`` when nothing is available.
    """
    for match in matches:
        if not isinstance(match, Mapping):
            continue
        section = match.get("section")
        if not isinstance(section, Mapping):
            continue
        ref = normalize_optional_text(section.get("ref"))
        if ref:
            return ref
    return None


def _build_search_hint(
    matches: list[dict[str, Any]],
    primary_source: str,
) -> Optional[str]:
    """Generate the LLM-facing action-guidance hint based on match quality.

    Guidance principle: let the LLM take the right next action with the lowest
    cognitive load. A hint is generated only when the results carry noise risk
    or fetch_more has low value.

    Args:
        matches: post-cap match list.
        primary_source: match-quality source label (exact / mixed / expansion_only / none).

    Returns:
        hint string; ``None`` when no hint is needed.
    """
    if len(matches) > 40:
        top_ref = _extract_top_section_ref(matches)
        if top_ref:
            return (
                f"current hits: {len(matches)} -- scope too broad."
                f"if you keep searching, the next call must narrow with `within_section_ref`;"
                f"or call read_section(ref='{top_ref}') directly to read the most relevant section first, then decide whether to keep searching."
            )
        return (
            f"current hits: {len(matches)} -- scope too broad."
            "if you keep searching, the next call must narrow with `within_section_ref`;"
            "or read the most relevant section pointed to by `next_section_to_read` / `next_section_by_query` first."
        )
    if primary_source in (_MATCH_QUALITY_NONE, _MATCH_QUALITY_EXACT):
        return None
    if primary_source == _MATCH_QUALITY_EXPANSION_ONLY:
        # take the top match's section ref and give an actionable read_section instruction directly
        top_ref = _extract_top_section_ref(matches)
        if top_ref:
            return (
                f"goal: read the most relevant section first. Allowed action: call read_section(ref='{top_ref}') directly."
                f"disallowed: reading these {len(matches)} expansion hits one by one, or calling fetch_more first."
                "next step: read the most relevant section directly."
            )
        return (
            f"goal: read the most relevant section first. Allowed action: call read_section with a ref from next_section_to_read or next_section_by_query."
            f"disallowed: reading these {len(matches)} expansion hits one by one, or calling fetch_more first."
            "next step: read the most relevant section directly."
        )
    # mixed
    top_ref = _extract_top_section_ref(matches)
    next_step = (
        f"next step: call read_section(ref='{top_ref}') first."
        if top_ref
        else "next step: read the most relevant hit's section first."
    )
    return (
        f"goal: read the most relevant exact hits first. Allowed action: read the earlier exact hits first."
        f"disallowed: calling fetch_more first to enumerate later, less relevant expansion hits."
        f"{next_step} Only call fetch_more when you must enumerate every occurrence."
    )


def _infer_scale_from_decimals(decimals: Optional[int]) -> Optional[str]:
    """Infer the numeric scale from XBRL decimals.

    Mapping rules:
    - ``-9`` → ``"billions"``
    - ``-6`` → ``"millions"``
    - ``-3`` → ``"thousands"``
    - ``0`` or positive → ``"units"``
    - ``None`` or other negatives → ``None``

    Args:
        decimals: the parsed decimals value.

    Returns:
        scale description string or ``None``.

    Raises:
        RuntimeError: raised when inference fails.
    """

    if decimals is None:
        return None
    exact = _DECIMALS_SCALE_MAP.get(decimals)
    if exact is not None:
        return exact
    # A positive value means decimal places, i.e. raw units
    if decimals > 0:
        return "units"
    return None
