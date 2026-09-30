"""SEC document table extraction, rendering, and records building.

This module takes over all table-related logic from ``sec_processor.py``, including:
- Internal table data structures (``_TableDataFrameProvider``, ``_TableBlock``)
- The table build pipeline (``_build_tables`` and its dependency chain)
- Table-section matching and disambiguation
- Table rendering (records / markdown / HTML, three paths)
- DataFrame / HTML / Markdown -> records conversion
- Financial-table detection and table-type classification

Maintenance note (do not split this module):
    This module is about 2200 lines; internally it has four recognizable areas —
    section matching / header extraction / classification / render — but the core
    entry _build_tables calls 11 functions across the three areas at once, so
    splitting into submodules would introduce heavy cross-module imports without
    reducing coupling. External consumers number only 4 files; the API surface is small.
"""

from __future__ import annotations

import re
import warnings
from dataclasses import dataclass, field
from typing import Any, Optional, Sequence

import pandas as pd
from bs4 import BeautifulSoup
from pandas.errors import PerformanceWarning

from scripts.vendor.filings.engine.processors.text_utils import (
    PREVIEW_MAX_CHARS as _PREVIEW_MAX_CHARS,
)
from scripts.vendor.filings.engine.processors.text_utils import (
    clean_page_header_noise as _clean_page_header_noise,
)
from scripts.vendor.filings.engine.processors.text_utils import (
    format_table_placeholder as _format_table_placeholder,
)
from scripts.vendor.filings.engine.processors.text_utils import (
    format_table_ref as _format_table_ref,
)
from scripts.vendor.filings.engine.processors.text_utils import (
    infer_caption_from_context as _infer_caption_from_context,
)
from scripts.vendor.filings.engine.processors.text_utils import (
    normalize_optional_string as _normalize_optional_string_base,
)
from scripts.vendor.filings.engine.processors.text_utils import (
    normalize_whitespace as _normalize_whitespace,
)
from scripts.vendor.filings.fins.processors.html_financial_statement_common import (
    normalize_numeric_separators,
)
from scripts.vendor.filings.fins.processors.sec_html_rules import (
    is_sec_cover_page_table,
    is_sec_section_heading_table,
)
from scripts.vendor.filings.fins.processors.sec_section_build import (
    _normalize_searchable_text,
    _safe_table_text,
    _SectionBlock,
    _table_fingerprint,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_LOW_INFO_TOKENS = {"-", "--", "—", "n/a", "na", "none", "nil", "☐", "☒", "nan"}
_NUMERIC_LIKE_PATTERN = re.compile(r"^[\d\s,\.\-\+\(\)%$¥€]+$")
_STRICT_NUMERIC_TEXT_PATTERN = re.compile(r"^[+-]?\d+(?:\.\d+)?$")
_MARKDOWN_SEPARATOR_PATTERN = re.compile(r"^\|?[\s:\-|]+\|?$")
_GENERATED_COLUMN_PATTERN = re.compile(r"^col_\d+$")
_CORE_FINANCIAL_TABLE_KEYWORDS = (
    "consolidated statements of operations",
    "consolidated statement of operations",
    "consolidated statements of income",
    "consolidated statement of income",
    "consolidated balance sheets",
    "consolidated balance sheet",
    "consolidated statements of cash flows",
    "consolidated statement of cash flows",
    "consolidated statements of shareholders",
    "consolidated statements of stockholders",
    "statement of changes in equity",
    "statement of comprehensive income",
    "comprehensive income",
)
_FINANCIAL_NEGATIVE_KEYWORDS = (
    "securities registered pursuant to section 12(b)",
    "title of each class",
    "trading symbol(s)",
    "name of each exchange on which registered",
    "large accelerated filer",
    "accelerated filer",
    "smaller reporting company",
    "emerging growth company",
    "check whether the registrant",
    "incorporated by reference",
    "exhibit number",
    "exhibit description",
)
_CONTEXT_TAIL_MARKER_WORD_COUNTS = (24, 20, 16, 12, 8)
_CONTEXT_TAIL_MARKER_MIN_CHARS = 48
_TABLE_FINGERPRINT_MAX_CHARS = 240
_TABLE_DISAMBIGUATION_MARKER_CHARS = (720, 480, 360, 300)
_CURRENCY_SYMBOL_TOKENS = frozenset({"$", "¥", "€", "£", "%", "%%"})


# ---------------------------------------------------------------------------
# Helper: pandas NaN-aware normalize_optional_string
# ---------------------------------------------------------------------------


def _normalize_optional_string(value: Any) -> Optional[str]:
    """Convert any value to an optional string, additionally handling pandas NaN/NaT.

    For meaningless values such as ``None``, empty string, ``float('nan')``, and
    ``pd.NaT``, uniformly return ``None``.

    Args:
        value: any input value.

    Returns:
        normalized string; ``None`` for empty values.
    """
    if value is None:
        return None
    if isinstance(value, float) and pd.isna(value):
        return None
    return _normalize_optional_string_base(value)


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class _TableDataFrameProvider:
    """Read and cache a single table's DataFrame on demand."""

    table_obj: Any
    _dataframe: Optional[pd.DataFrame] = field(default=None, init=False, repr=False)
    _resolved: bool = field(default=False, init=False, repr=False)

    def get_dataframe(self) -> Optional[pd.DataFrame]:
        """Return the table DataFrame, guaranteeing each table is parsed at most once.

        Args:
            None.

        Returns:
            DataFrame; `None` when parsing fails or is unavailable.

        Raises:
            RuntimeError: DataFrame read failures are handled by the underlying helper.
        """

        if not self._resolved:
            self._dataframe = _safe_table_dataframe(self.table_obj)
            self._resolved = True
        return self._dataframe


@dataclass
class _TableBlock:
    """Internal table structure."""

    ref: str
    table_obj: Any
    text: str
    fingerprint: str
    caption: Optional[str]
    row_count: int
    col_count: int
    headers: Optional[list[str]]
    section_ref: Optional[str]
    context_before: str
    is_financial: bool
    table_type: str
    dataframe: Optional[pd.DataFrame] = None
    dataframe_provider: Optional[_TableDataFrameProvider] = field(default=None, repr=False)

    def resolve_dataframe(self) -> Optional[pd.DataFrame]:
        """Parse and cache the current table's DataFrame on demand.

        Args:
            None.

        Returns:
            DataFrame; `None` when it cannot be parsed.

        Raises:
            RuntimeError: DataFrame read failures are handled by the underlying helper.
        """

        if self.dataframe is not None:
            return self.dataframe
        if self.dataframe_provider is None:
            return None
        self.dataframe = self.dataframe_provider.get_dataframe()
        return self.dataframe


# ---------------------------------------------------------------------------
# Safe DataFrame helpers
# ---------------------------------------------------------------------------


def _safe_table_dataframe(table_obj: Any) -> Optional[pd.DataFrame]:
    """Safely read a table DataFrame.

    Args:
        table_obj: table object.

    Returns:
        DataFrame or `None`.

    Raises:
        RuntimeError: raised when the conversion fails.
    """

    if not hasattr(table_obj, "to_dataframe"):
        return None
    try:
        # edgartools triggers a pandas PerformanceWarning on some complex tables,
        # this warning only reflects a performance risk, not parse correctness; suppress it in the smallest possible scope.
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", category=PerformanceWarning)
            df = table_obj.to_dataframe()
    except Exception:
        return None
    if isinstance(df, pd.DataFrame):
        return df
    return None


def _safe_statement_dataframe(statement_obj: Any) -> Optional[pd.DataFrame]:
    """Safely read a financial-statement DataFrame.

    Args:
        statement_obj: statement object.

    Returns:
        DataFrame or `None`.

    Raises:
        RuntimeError: raised when the conversion fails.
    """

    if not hasattr(statement_obj, "to_dataframe"):
        return None
    try:
        # financial-statement DataFrame conversion can also trigger a pandas PerformanceWarning,
        # unrelated to business correctness; suppressed locally to keep logs clean.
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", category=PerformanceWarning)
            df = statement_obj.to_dataframe()
    except Exception:
        return None
    if isinstance(df, pd.DataFrame):
        return df
    return None


# ---------------------------------------------------------------------------
# Document iteration
# ---------------------------------------------------------------------------


def _iter_document_tables(document: Any) -> list[Any]:
    """Safely iterate document tables.

    Args:
        document: edgartools document object.

    Returns:
        table object list.

    Raises:
        RuntimeError: raised when the access fails.
    """

    tables_obj = getattr(document, "tables", None)
    if tables_obj is None:
        return []
    if isinstance(tables_obj, list):
        return list(tables_obj)
    try:
        return list(tables_obj)
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Main build function
# ---------------------------------------------------------------------------


def _build_tables(
    document: Any,
    sections: list[_SectionBlock],
    dom_table_contexts: Optional[list[str]] = None,
) -> list[_TableBlock]:
    """Build the table list from a document object and attach section relations.

    Args:
        document: edgartools document object.
        sections: section block list.

    Returns:
        table block list.

    Raises:
        RuntimeError: raised when the build fails.
    """

    section_by_ref = {section.ref: section for section in sections}
    fingerprint_to_sections = _build_fingerprint_section_mapping(sections)
    default_section_ref = _get_default_section_ref(sections)
    tables: list[_TableBlock] = []

    for index, table_obj in enumerate(_iter_document_tables(document), start=1):
        table_text = _normalize_whitespace(_safe_table_text(table_obj))
        caption = _normalize_optional_string(getattr(table_obj, "caption", None))
        fingerprint = _table_fingerprint(table_text)
        dataframe_provider = _TableDataFrameProvider(table_obj)
        row_count, col_count = _resolve_table_dimensions(table_obj, dataframe_provider)
        headers = _extract_table_headers(table_obj, dataframe_provider)
        dom_context_before = _resolve_dom_context_by_index(dom_table_contexts, index)
        section_ref = _match_section_ref(
            fingerprint=fingerprint,
            fingerprint_to_sections=fingerprint_to_sections,
            default_section_ref=default_section_ref,
            section_by_ref=section_by_ref,
            table_text=table_text,
            dom_context_before=dom_context_before,
        )
        context_before = _extract_context_before(
            section_ref=section_ref,
            section_by_ref=section_by_ref,
            table_text=table_text,
            dom_context_before=dom_context_before,
        )
        # Step 10/12: adaptively strip header/footer noise from context_before
        context_before = _clean_page_header_noise(context_before)
        # Step 7: infer from preceding text when edgartools provides no caption
        if caption is None and context_before:
            caption = _infer_caption_from_context(context_before)
        is_financial = _is_financial_table(
            table_obj,
            table_text=table_text,
            caption=caption,
            context_before=context_before,
        )
        table_type = _classify_table_type(
            is_financial=is_financial,
            row_count=row_count,
            col_count=col_count,
            headers=headers,
            table_text=table_text,
        )
        table_block = _TableBlock(
            ref=_format_table_ref(index),
            table_obj=table_obj,
            text=table_text,
            fingerprint=fingerprint,
            caption=caption,
            row_count=row_count,
            col_count=col_count,
            headers=headers,
            section_ref=section_ref,
            context_before=context_before,
            is_financial=is_financial,
            table_type=table_type,
            dataframe_provider=dataframe_provider,
        )
        tables.append(table_block)
        if section_ref and section_ref in section_by_ref:
            section_by_ref[section_ref].table_refs.append(table_block.ref)
    return tables


# ---------------------------------------------------------------------------
# Section matching
# ---------------------------------------------------------------------------


def _build_fingerprint_section_mapping(sections: list[_SectionBlock]) -> dict[str, list[str]]:
    """Build the mapping from table fingerprints to section refs.

    Args:
        sections: section block list.

    Returns:
        fingerprint mapping.

    Raises:
        RuntimeError: raised when the build fails.
    """

    mapping: dict[str, list[str]] = {}
    for section in sections:
        for fingerprint in section.table_fingerprints:
            if not fingerprint:
                continue
            mapping.setdefault(fingerprint, []).append(section.ref)
    return mapping


def _match_section_ref(
    fingerprint: str,
    fingerprint_to_sections: dict[str, list[str]],
    default_section_ref: Optional[str],
    section_by_ref: Optional[dict[str, _SectionBlock]] = None,
    table_text: str = "",
    dom_context_before: str = "",
) -> Optional[str]:
    """Match the section ref based on the table fingerprint.

    Args:
        fingerprint: table text fingerprint.
        fingerprint_to_sections: fingerprint mapping.
        default_section_ref: default section ref.
        section_by_ref: section mapping.
        table_text: table full text.
        dom_context_before: preceding context extracted at the DOM level.

    Returns:
        section ref or `None`.

    Raises:
        RuntimeError: raised when the matching fails.
    """

    if fingerprint:
        refs = fingerprint_to_sections.get(fingerprint, [])
        if len(refs) == 1:
            return refs[0]
        if refs:
            resolved_ref = _resolve_ambiguous_section_ref(
                candidate_refs=refs,
                section_by_ref=section_by_ref,
                table_text=table_text,
                dom_context_before=dom_context_before,
            )
            if resolved_ref is not None:
                return resolved_ref
    return default_section_ref


def _resolve_ambiguous_section_ref(
    candidate_refs: Sequence[str],
    section_by_ref: Optional[dict[str, _SectionBlock]],
    table_text: str,
    dom_context_before: str,
) -> Optional[str]:
    """Try stronger signals to disambiguate section attribution on fingerprint conflicts.

    Args:
        candidate_refs: fingerprint candidate section list.
        section_by_ref: section mapping.
        table_text: table full text.
        dom_context_before: DOM-derived preceding context.

    Returns:
        uniquely matched section ref; `None` when uncertain.

    Raises:
        RuntimeError: raised when the disambiguation fails.
    """

    if not candidate_refs or not section_by_ref:
        return None

    resolved_ref = _match_unique_candidate_section_ref(
        candidate_refs=candidate_refs,
        section_by_ref=section_by_ref,
        markers=_build_table_text_disambiguation_markers(table_text),
    )
    if resolved_ref is not None:
        return resolved_ref

    return _match_unique_candidate_section_ref(
        candidate_refs=candidate_refs,
        section_by_ref=section_by_ref,
        markers=_build_context_tail_markers(dom_context_before),
    )


def _match_unique_candidate_section_ref(
    candidate_refs: Sequence[str],
    section_by_ref: dict[str, _SectionBlock],
    markers: Sequence[str],
) -> Optional[str]:
    """Find the uniquely matching section candidate using a set of text markers.

    Args:
        candidate_refs: candidate section refs.
        section_by_ref: section mapping.
        markers: candidate marker list.

    Returns:
        uniquely matched section ref; otherwise `None`.

    Raises:
        RuntimeError: raised when the matching fails.
    """

    if not candidate_refs or not markers:
        return None

    normalized_section_texts: dict[str, str] = {}
    for ref in candidate_refs:
        section = section_by_ref.get(ref)
        if section is None:
            continue
        normalized_section_texts[ref] = _normalize_searchable_text(section.text)

    if not normalized_section_texts:
        return None

    for marker in markers:
        matched_refs = [
            ref
            for ref in candidate_refs
            if marker and marker in normalized_section_texts.get(ref, "")
        ]
        if len(matched_refs) == 1:
            return matched_refs[0]
    return None


def _build_table_text_disambiguation_markers(table_text: str) -> list[str]:
    """Generate a body marker stronger than the fingerprint for conflicting tables.

    Args:
        table_text: table full text.

    Returns:
        marker list sorted longest-first.

    Raises:
        RuntimeError: raised when the marker build fails.
    """

    normalized = _normalize_searchable_text(table_text)
    if len(normalized) <= _TABLE_FINGERPRINT_MAX_CHARS:
        return []

    marker_lengths = {len(normalized)}
    marker_lengths.update(
        max_chars
        for max_chars in _TABLE_DISAMBIGUATION_MARKER_CHARS
        if len(normalized) >= max_chars > _TABLE_FINGERPRINT_MAX_CHARS
    )

    markers: list[str] = []
    seen: set[str] = set()
    for marker_len in sorted(marker_lengths, reverse=True):
        marker = normalized[:marker_len].strip()
        if len(marker) <= _TABLE_FINGERPRINT_MAX_CHARS or marker in seen:
            continue
        seen.add(marker)
        markers.append(marker)
    return markers


def _build_context_tail_markers(context_text: str) -> list[str]:
    """Build a trailing marker for DOM preceding context, for table-section disambiguation.

    Args:
        context_text: text preceding the table.

    Returns:
        marker list; empty list when there is no valid content.

    Raises:
        RuntimeError: raised when the marker build fails.
    """

    normalized = _normalize_searchable_text(context_text)
    if not normalized:
        return []

    words = normalized.split()
    if not words:
        return []

    markers: list[str] = []
    seen: set[str] = set()
    for word_count in _CONTEXT_TAIL_MARKER_WORD_COUNTS:
        if len(words) < word_count:
            continue
        marker = " ".join(words[-word_count:]).strip()
        if len(marker) < _CONTEXT_TAIL_MARKER_MIN_CHARS or marker in seen:
            continue
        seen.add(marker)
        markers.append(marker)

    if markers:
        return markers

    fallback_marker = " ".join(words[-min(8, len(words)) :]).strip()
    if len(fallback_marker) >= 36:
        return [fallback_marker]
    return []


def _get_default_section_ref(sections: list[_SectionBlock]) -> Optional[str]:
    """Compute the default section ref.

    Args:
        sections: section block list.

    Returns:
        default section ref or `None`.

    Raises:
        RuntimeError: raised when the computation fails.
    """

    if len(sections) != 1:
        return None
    section = sections[0]
    if section.contains_full_text:
        return section.ref
    return None


def _resolve_dom_context_by_index(
    dom_table_contexts: Optional[list[str]],
    table_index: int,
) -> str:
    """Get the DOM context by table ordinal.

    Args:
        dom_table_contexts: DOM context list.
        table_index: 1-based table ordinal.

    Returns:
        context string.

    Raises:
        RuntimeError: raised when the read fails.
    """

    if not dom_table_contexts:
        return ""
    idx = table_index - 1
    if idx < 0 or idx >= len(dom_table_contexts):
        return ""
    return _normalize_whitespace(dom_table_contexts[idx])


def _extract_context_before(
    section_ref: Optional[str],
    section_by_ref: dict[str, _SectionBlock],
    table_text: str,
    dom_context_before: str = "",
) -> str:
    """Extract the text preceding the table.

    Args:
        section_ref: owning section reference.
        section_by_ref: section mapping.
        table_text: table text.
        dom_context_before: preceding context extracted at the DOM level.

    Returns:
        preceding context (up to 200 chars).

    Raises:
        RuntimeError: raised when the extraction fails.
    """

    if dom_context_before:
        return dom_context_before[:_PREVIEW_MAX_CHARS]
    if section_ref is None or not table_text:
        return ""
    section = section_by_ref.get(section_ref)
    if section is None:
        return ""

    marker = _build_marker_text(table_text, max_chars=120)
    if not marker:
        return ""
    index = section.text.lower().find(marker.lower())
    if index <= 0:
        return ""
    return section.text[max(0, index - _PREVIEW_MAX_CHARS) : index].strip()


def _build_marker_text(text: str, max_chars: int) -> str:
    """Build a text marker for locating.

    Args:
        text: raw text.
        max_chars: maximum character count.

    Returns:
        text marker.

    Raises:
        ValueError: raised when an argument is invalid.
    """

    normalized = _normalize_whitespace(text)
    if not normalized:
        return ""
    return normalized[:max_chars]


# ---------------------------------------------------------------------------
# Table dimensions and headers
# ---------------------------------------------------------------------------


def _resolve_table_dimensions(
    table_obj: Any,
    table_df: Optional[pd.DataFrame | _TableDataFrameProvider],
) -> tuple[int, int]:
    """Resolve the table row/column counts.

    Args:
        table_obj: table object.
        table_df: optional DataFrame.

    Returns:
        `(row_count, col_count)`.

    Raises:
        RuntimeError: raised when the parsing fails.
    """

    raw_rows = int(getattr(table_obj, "row_count", 0) or 0)
    raw_cols = int(getattr(table_obj, "col_count", 0) or 0)
    if raw_rows > 0 and raw_cols > 0:
        return raw_rows, raw_cols
    resolved_table_df = _resolve_table_dataframe(table_df)
    if resolved_table_df is None:
        return max(raw_rows, 0), max(raw_cols, 0)
    return int(resolved_table_df.shape[0]), int(resolved_table_df.shape[1])


def _extract_table_headers(
    table_obj: Any,
    table_df: Optional[pd.DataFrame | _TableDataFrameProvider],
) -> Optional[list[str]]:
    """Extract table row headers (reusing the `headers` field).

    Args:
        table_obj: table object.
        table_df: optional DataFrame.

    Returns:
        table header list or `None`.

    Raises:
        RuntimeError: raised when the extraction fails.
    """

    row_headers_from_obj = _extract_row_headers_from_table_object(table_obj)
    if row_headers_from_obj:
        return row_headers_from_obj

    row_headers_from_dict = _extract_row_headers_from_table_dict(table_obj)
    if row_headers_from_dict:
        return row_headers_from_dict

    resolved_table_df = _resolve_table_dataframe(table_df)
    row_headers_from_df = _extract_row_headers_from_dataframe(resolved_table_df)
    if row_headers_from_df:
        return row_headers_from_df

    headers_from_obj = _extract_headers_from_table_object(table_obj)
    if headers_from_obj:
        return headers_from_obj

    headers_from_dict = _extract_headers_from_table_dict(table_obj)
    if headers_from_dict:
        return headers_from_dict

    if resolved_table_df is not None:
        headers_from_df = _extract_headers_from_dataframe(resolved_table_df)
        if headers_from_df:
            return headers_from_df

    return None


def _resolve_table_dataframe(
    table_df: Optional[pd.DataFrame | _TableDataFrameProvider],
) -> Optional[pd.DataFrame]:
    """Converge a direct DataFrame or a lazy DataFrame provider.

    Args:
        table_df: DataFrame or lazy provider.

    Returns:
        DataFrame; `None` when unavailable.

    Raises:
        RuntimeError: DataFrame parsing failures are handled by the underlying helper.
    """

    if isinstance(table_df, _TableDataFrameProvider):
        return table_df.get_dataframe()
    return table_df


def _extract_row_headers_from_dataframe(table_df: Optional[pd.DataFrame]) -> Optional[list[str]]:
    """Extract row headers from a DataFrame.

    Args:
        table_df: DataFrame.

    Returns:
        row header list or `None`.

    Raises:
        RuntimeError: raised when the extraction fails.
    """

    if table_df is None or table_df.empty:
        return None

    row_headers: list[str] = []
    for row in table_df.itertuples(index=False, name=None):
        header = _pick_row_header_from_values(list(row))
        if header:
            row_headers.append(header)
    normalized = _normalize_header_list(row_headers)
    if not normalized or _looks_like_default_headers(normalized):
        return None
    return normalized


def _extract_row_headers_from_table_dict(table_obj: Any) -> Optional[list[str]]:
    """Extract row headers from `table.to_dict()`.

    Args:
        table_obj: table object.

    Returns:
        row header list or `None`.

    Raises:
        RuntimeError: raised when the extraction fails.
    """

    if not hasattr(table_obj, "to_dict"):
        return None
    try:
        table_dict = table_obj.to_dict()
    except Exception:
        return None
    if not isinstance(table_dict, dict):
        return None
    data_rows = table_dict.get("data")
    if not isinstance(data_rows, list):
        return None

    row_headers: list[str] = []
    for row in data_rows:
        if isinstance(row, dict):
            values = list(row.values())
        elif isinstance(row, list):
            values = row
        else:
            values = [row]
        header = _pick_row_header_from_values(values)
        if header:
            row_headers.append(header)
    normalized = _normalize_header_list(row_headers)
    if not normalized or _looks_like_default_headers(normalized):
        return None
    return normalized


def _extract_row_headers_from_table_object(table_obj: Any) -> Optional[list[str]]:
    """Extract possible row headers from the `table.headers` structure.

    Args:
        table_obj: table object.

    Returns:
        row header list or `None`.

    Raises:
        RuntimeError: raised when the extraction fails.
    """

    headers = getattr(table_obj, "headers", None)
    if not isinstance(headers, list) or len(headers) <= 1:
        return None

    row_headers: list[str] = []
    for row in headers:
        if isinstance(row, list):
            values = [_extract_cell_content(cell) for cell in row]
        else:
            values = [_extract_cell_content(row)]
        header = _pick_row_header_from_values(values)
        if header:
            row_headers.append(header)
    normalized = _normalize_header_list(row_headers)
    if not normalized or _looks_like_default_headers(normalized):
        return None
    return normalized


def _extract_headers_from_table_object(table_obj: Any) -> Optional[list[str]]:
    """Extract table headers from table.headers.

    Args:
        table_obj: table object.

    Returns:
        table header list or `None`.

    Raises:
        RuntimeError: raised when the extraction fails.
    """

    headers = getattr(table_obj, "headers", None)
    if not isinstance(headers, list) or not headers:
        return None

    flat_headers: list[str] = []
    for row in headers:
        if isinstance(row, list):
            for cell in row:
                content = _extract_cell_content(cell)
                if content:
                    flat_headers.append(content)
        else:
            content = _extract_cell_content(row)
            if content:
                flat_headers.append(content)
    normalized = _normalize_header_list(flat_headers)
    if not normalized:
        return None
    return normalized


def _extract_headers_from_dataframe(table_df: pd.DataFrame) -> Optional[list[str]]:
    """Extract table headers from DataFrame column names.

    Args:
        table_df: DataFrame.

    Returns:
        table header list or `None`.

    Raises:
        RuntimeError: raised when the extraction fails.
    """

    columns = [_normalize_optional_string(column) for column in table_df.columns]
    normalized = _normalize_header_list(columns)
    if not normalized:
        return None
    # If deduplication changes the column count, the records path cannot be safely
    # aligned, so fall back to None.
    if len(normalized) != len(columns):
        return None
    if _looks_like_default_headers(normalized):
        return None
    return normalized


def _extract_headers_from_table_dict(table_obj: Any) -> Optional[list[str]]:
    """Extract table headers from `table.to_dict()`.

    Args:
        table_obj: table object.

    Returns:
        table header list or `None`.

    Raises:
        RuntimeError: raised when the extraction fails.
    """

    if not hasattr(table_obj, "to_dict"):
        return None
    try:
        table_dict = table_obj.to_dict()
    except Exception:
        return None
    if not isinstance(table_dict, dict):
        return None
    headers = table_dict.get("headers")
    if not isinstance(headers, list):
        return None
    flat_headers: list[str] = []
    for row in headers:
        if isinstance(row, list):
            for cell in row:
                content = _extract_cell_content(cell)
                if content:
                    flat_headers.append(content)
        else:
            content = _extract_cell_content(row)
            if content:
                flat_headers.append(content)
    normalized = _normalize_header_list(flat_headers)
    if not normalized:
        return None
    return normalized


def _extract_cell_content(cell: Any) -> str:
    """Extract the readable content of a cell.

    Args:
        cell: cell object or string.

    Returns:
        cell text.

    Raises:
        RuntimeError: raised when the extraction fails.
    """

    if cell is None:
        return ""
    if isinstance(cell, str):
        return _normalize_whitespace(cell)
    if hasattr(cell, "content"):
        return _normalize_whitespace(str(getattr(cell, "content", "")))
    return _normalize_whitespace(str(cell))


def _pick_row_header_from_values(values: list[Any]) -> str:
    """Pick the most informative row header from a row of values.

    Args:
        values: in-row candidate value list.

    Returns:
        row header text; empty string when not found.

    Raises:
        RuntimeError: raised when the extraction fails.
    """

    for value in values:
        candidate = _normalize_optional_string(value)
        if not candidate:
            continue
        if _is_low_information_header(candidate):
            continue
        return candidate
    return ""


def _is_low_information_header(value: str) -> bool:
    """Judge whether text is a low-information header.

    Args:
        value: text to judge.

    Returns:
        whether it is low-information.

    Raises:
        RuntimeError: raised when the judgment fails.
    """

    normalized = value.strip().lower()
    if not normalized:
        return True
    if normalized in _LOW_INFO_TOKENS:
        return True
    if normalized.startswith("unnamed"):
        return True
    if _NUMERIC_LIKE_PATTERN.fullmatch(normalized):
        return True
    return False


def _normalize_header_list(headers: Sequence[Optional[str]]) -> list[str]:
    """Normalize the header list.

    Args:
        headers: raw table header list.

    Returns:
        normalized table header list.

    Raises:
        RuntimeError: raised when the processing fails.
    """

    normalized: list[str] = []
    for header in headers:
        value = _normalize_optional_string(header)
        if not value:
            continue
        normalized.append(value)
    deduped = _deduplicate_headers(normalized)
    if not deduped:
        return []
    return deduped[:10]


def _deduplicate_headers(headers: list[str]) -> list[str]:
    """Deduplicate table headers (first occurrence order preserved).

    Args:
        headers: raw table header list.

    Returns:
        deduplicated table header list (duplicates removed outright).

    Raises:
        RuntimeError: raised when the deduplication fails.
    """

    result: list[str] = []
    seen: set[str] = set()
    for item in headers:
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result


def _looks_like_default_headers(headers: list[str]) -> bool:
    """Judge whether this is a default numeric header.

    Args:
        headers: table header list.

    Returns:
        whether it is a default numeric header.

    Raises:
        RuntimeError: raised when the judgment fails.
    """

    if not headers:
        return True
    cleaned = [str(item).strip() for item in headers if str(item).strip()]
    if not cleaned:
        return True
    if all(_is_low_information_header(item) for item in cleaned):
        return True
    # Must use isdecimal() rather than isdigit(): Python's isdigit() also returns
    # True for superscript characters ('¹', '²', etc.), but int() cannot parse
    # such Unicode numeric symbols and would raise ValueError. isdecimal() only
    # accepts characters that can participate in decimal arithmetic (ASCII 0-9),
    # consistent with int().
    if all(item.isdecimal() for item in cleaned):
        numbers = [int(item) for item in cleaned]
        start = numbers[0]
        return numbers == list(range(start, start + len(numbers)))
    return False


# ---------------------------------------------------------------------------
# Financial table detection and classification
# ---------------------------------------------------------------------------


def _is_financial_table(
    table_obj: Any,
    *,
    table_text: str = "",
    caption: Optional[str] = None,
    context_before: str = "",
) -> bool:
    """Judge whether a table is a financial table.

    Args:
        table_obj: table object.
        table_text: table body text.
        caption: table caption.
        context_before: text preceding the table.

    Returns:
        whether it is a financial table.

    Raises:
        RuntimeError: raised when the judgment fails.
    """

    combined_text = _normalize_searchable_text(
        " ".join([caption or "", context_before or "", table_text or ""])
    )
    explicit_financial = bool(getattr(table_obj, "is_financial_table", False))
    semantic_type = str(getattr(table_obj, "semantic_type", "") or "").upper()
    semantic_financial = "FINANCIAL" in semantic_type
    negative_signal = _has_financial_negative_signal(combined_text)
    core_signal = _has_financial_core_signal(combined_text)

    if negative_signal and not core_signal:
        return False
    if explicit_financial and not negative_signal:
        return True
    if semantic_financial and not negative_signal:
        return True
    if core_signal:
        return True
    return False


def _has_financial_negative_signal(text: str) -> bool:
    """Judge whether text hits financial negative characteristics.

    Args:
        text: normalized text.

    Returns:
        `True` when a negative keyword hits.

    Raises:
        RuntimeError: raised when the judgment fails.
    """

    if not text:
        return False
    return any(keyword in text for keyword in _FINANCIAL_NEGATIVE_KEYWORDS)


def _has_financial_core_signal(text: str) -> bool:
    """Judge whether text hits core financial-table signals.

    Args:
        text: normalized text.

    Returns:
        `True` when a core financial keyword hits.

    Raises:
        RuntimeError: raised when the judgment fails.
    """

    if not text:
        return False
    return any(keyword in text for keyword in _CORE_FINANCIAL_TABLE_KEYWORDS)


def _classify_table_type(
    *,
    is_financial: bool,
    row_count: int,
    col_count: int,
    headers: Optional[list[str]],
    table_text: str,
) -> str:
    """Lightweight type classification for tables.

    Classification rule priority:
    1. Explicit financial flag -> ``financial``
    2. Tiny table / default column headers / no headers with few rows -> ``layout``
    3. Python dict repr residue (edgartools parse failure) -> ``layout``
    4. Section-heading rule-line table (``Item N. Title ────``) -> ``layout``
    5. SEC cover-page metadata table (legal disclaimers / checkboxes) -> ``layout``
    6. Everything else -> ``data``

    Args:
        is_financial: whether it is a financial table.
        row_count: row count.
        col_count: column count.
        headers: row header list.
        table_text: table text.

    Returns:
        ``financial``, ``data``, or ``layout``.

    Raises:
        RuntimeError: raised when the classification fails.
    """

    if is_financial:
        return "financial"
    normalized_text = _normalize_whitespace(table_text)
    # Original rule: tiny table
    if row_count <= 2 and col_count <= 3 and (not normalized_text or len(normalized_text) < 16):
        return "layout"
    if headers and _looks_like_default_headers(headers):
        return "layout"
    if not headers and row_count <= 3:
        return "layout"
    # New rule: Python dict repr residue (edgartools outputs str(dict) for empty tables)
    if normalized_text and normalized_text.lstrip().startswith("{'type':"):
        return "layout"
    # New rule: section-heading rule-line table (e.g. "Item 7. MD&A ──────")
    if is_sec_section_heading_table(normalized_text or ""):
        return "layout"
    # New rule: SEC cover-page legal-disclaimer / checkbox table (under the few-rows condition)
    if row_count <= 5 and is_sec_cover_page_table(normalized_text or ""):
        return "layout"
    return "data"


def _replace_table_with_placeholder(
    content: str, table_text: str, table_ref: str
) -> dict[str, Any]:
    """Try to replace table text with a placeholder.

    Args:
        content: section text.
        table_text: table text.
        table_ref: table reference.

    Returns:
        `{"content": str, "replaced": bool}`.

    Raises:
        RuntimeError: raised when the replacement fails.
    """

    normalized_table_text = _normalize_whitespace(table_text)
    if len(normalized_table_text) < 24:
        return {"content": content, "replaced": False}
    placeholder = _format_table_placeholder(table_ref)
    if normalized_table_text in content:
        replaced_content = content.replace(normalized_table_text, placeholder, 1)
        return {"content": replaced_content, "replaced": True}
    return {"content": content, "replaced": False}


def _should_prioritize_records_output(table: _TableBlock) -> bool:
    """Judge whether records should be preferred.

    Args:
        table: table block.

    Returns:
        `True` when it is a core financial table or already classified as financial/data.

    Raises:
        RuntimeError: raised when the judgment fails.
    """

    if table.table_type in {"financial", "data"}:
        return True
    if table.is_financial:
        return True
    joined_text = " ".join(
        [
            _normalize_whitespace(table.caption or ""),
            _normalize_whitespace(table.context_before or ""),
            _normalize_whitespace(table.text or "")[:240],
        ]
    ).lower()
    return any(keyword in joined_text for keyword in _CORE_FINANCIAL_TABLE_KEYWORDS)


# ---------------------------------------------------------------------------
# Records rendering
# ---------------------------------------------------------------------------


def _render_records_table(
    table_obj: Any,
    *,
    fallback_text: str = "",
    allow_generated_columns: bool = False,
    aggressive_fallback: bool = False,
    precomputed_dataframe: Optional[pd.DataFrame] = None,
) -> Optional[dict[str, Any]]:
    """Try to render a table as records.

    Args:
        table_obj: table object.
        fallback_text: fallback text (usually table.text()).
        allow_generated_columns: whether generating `col_1...` placeholder column names is allowed.
        aggressive_fallback: whether to enable the more aggressive fallback (for core financial tables).
        precomputed_dataframe: reusable precomputed DataFrame.

    Returns:
        `{"columns": list[str], "data": list[dict[str, Any]]}` or `None`.

    Raises:
        RuntimeError: raised when the rendering fails.
    """

    expected_col_count = _resolve_expected_table_col_count(table_obj)
    dataframe_payload = _render_records_from_dataframe(
        table_obj=table_obj,
        allow_generated_columns=allow_generated_columns,
        precomputed_dataframe=precomputed_dataframe,
    )
    if dataframe_payload is not None and _is_records_payload_quality_ok(
        dataframe_payload,
        aggressive=aggressive_fallback,
        expected_col_count=expected_col_count,
    ):
        return dataframe_payload

    if aggressive_fallback:
        html_payload = _render_records_from_html_table(
            table_obj=table_obj,
            allow_generated_columns=allow_generated_columns,
        )
        if html_payload is not None and _is_records_payload_quality_ok(
            html_payload,
            aggressive=True,
            expected_col_count=expected_col_count,
        ):
            return html_payload

    markdown_text = _render_markdown_table(table_obj, fallback_text)
    markdown_payload = _render_records_from_markdown_table(
        markdown_text=markdown_text,
        allow_generated_columns=allow_generated_columns,
    )
    if markdown_payload is not None and _is_records_payload_quality_ok(
        markdown_payload,
        aggressive=aggressive_fallback,
        expected_col_count=expected_col_count,
    ):
        return markdown_payload
    return None


def _resolve_expected_table_col_count(table_obj: Any) -> Optional[int]:
    """Read the table's declared column count.

    Args:
        table_obj: table object.

    Returns:
        declared column count; `None` when unavailable.

    Raises:
        RuntimeError: raised when the read fails.
    """

    raw_col_count = getattr(table_obj, "col_count", None)
    if not isinstance(raw_col_count, int) or raw_col_count <= 0:
        return None
    return raw_col_count


def _recover_index_as_column(df: pd.DataFrame) -> pd.DataFrame:
    """Restore a meaningful DataFrame index into a data column.

    After edgartools parses an SEC financial table, row labels (such as month
    names or account names) may be stored in the DataFrame index rather than in
    data columns. When the index meets the following conditions, restore it as
    the first column:

    - the index is not the default ``RangeIndex``
    - the index contains at least one non-empty text value (not pure numbers)

    The column name takes ``index.name``; for a multi-level index the non-empty
    level names are joined; if empty, ``"Item"`` is used. The implementation
    avoids calling ``reset_index()`` directly, to bypass the costly reordering
    on large ``MultiIndex`` frames.

    Args:
        df: DataFrame to process.

    Returns:
        DataFrame with row labels restored to the first column (or the original object).
    """

    if isinstance(df.index, pd.RangeIndex):
        return df
    if not _index_contains_meaningful_text(df.index):
        return df
    recovered_values = [_render_index_value(value) for value in df.index]
    result = df.copy()
    result.index = pd.RangeIndex(len(result))
    result.insert(
        0,
        _resolve_recovered_index_column_name(df.index),
        pd.Index(recovered_values, dtype="object"),
        allow_duplicates=True,
    )
    return result


def _index_contains_meaningful_text(index: pd.Index) -> bool:
    """Judge whether the index contains text labels worth recovering.

    Args:
        index: pandas index to inspect.

    Returns:
        `True` when at least one non-purely-numeric text label exists, otherwise `False`.

    Raises:
        RuntimeError: raised when the judgment fails.
    """

    for value in index:
        if _index_value_has_meaningful_text(value):
            return True
    return False


def _index_value_has_meaningful_text(value: Any) -> bool:
    """Judge whether a single index value carries meaningful text.

    Args:
        value: index value, scalar or multi-level tuple.

    Returns:
        `True` when it contains non-empty, non-purely-numeric text, otherwise `False`.

    Raises:
        RuntimeError: raised when the judgment fails.
    """

    if isinstance(value, tuple):
        return any(_index_value_has_meaningful_text(part) for part in value)
    if value is None:
        return False
    text = str(value).strip()
    if not text:
        return False
    return not text.replace(".", "").replace("-", "").isdigit()


def _render_index_value(value: Any) -> str:
    """Render an index value as serializable text.

    Args:
        value: index value, scalar or multi-level tuple.

    Returns:
        text representation suitable for the first column.

    Raises:
        RuntimeError: raised when the rendering fails.
    """

    if isinstance(value, tuple):
        parts = [
            str(part).strip()
            for part in value
            if part is not None and str(part).strip() and str(part).strip().lower() != "nan"
        ]
        return " | ".join(parts)
    if value is None:
        return ""
    text = str(value).strip()
    return "" if text.lower() == "nan" else text


def _resolve_recovered_index_column_name(index: pd.Index) -> str:
    """Generate stable column names for a recovered index column.

    Args:
        index: raw pandas index.

    Returns:
        a single-level index returns its name; a multi-level index returns the joined name; when unavailable, returns
        ``"Item"``.

    Raises:
        RuntimeError: raised when the name resolution fails.
    """

    if isinstance(index, pd.MultiIndex):
        names = [
            str(name).strip()
            for name in index.names
            if name is not None and str(name).strip() and str(name).strip().lower() != "none"
        ]
        return " | ".join(names) if names else "Item"
    raw_name = index.name
    if raw_name is None:
        return "Item"
    text = str(raw_name).strip()
    if not text or text.lower() in {"index", "none"}:
        return "Item"
    return text


def _flatten_multiindex_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Flatten MultiIndex column names into readable strings.

    When a DataFrame's columns are ``pd.MultiIndex`` (common in SEC financial
    tables' multi-level headers), join each level's non-empty labels into a
    single-level string with ``" | "``.
    E.g. ``("Revenue", "2024")`` -> ``"Revenue | 2024"``.

    When columns are not MultiIndex, return as-is without copying.

    Args:
        df: DataFrame to process.

    Returns:
        DataFrame with flattened column names (new copy or the original object).
    """

    if not isinstance(df.columns, pd.MultiIndex):
        return df
    flat_names: list[str] = []
    for col_tuple in df.columns:
        # filter empty levels (empty string / None / NaN / pure whitespace)
        parts: list[str] = []
        for level_val in col_tuple:
            text = str(level_val).strip() if level_val is not None else ""
            if text and text.lower() != "nan":
                parts.append(text)
        flat_names.append(" | ".join(parts) if parts else "")
    result = df.copy()
    result.columns = pd.Index(flat_names)
    return result


def _collapse_ghost_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Merge same-named ghost columns produced by HTML colspan.

    After edgartools parses an SEC financial table, one semantic column may be
    split into multiple same-named columns because of colspan (after
    _uniquify_columns they become ``col``, ``col_2``, ``col_3``). This function
    detects adjacent same-base-name column groups, merges each row's scattered
    non-null values into the first column, and then drops the remaining ghost
    columns.

    It also handles cases where symbols like ``$`` / ``%`` become standalone
    columns: if every non-null value of a merged column is a pure symbol, the
    symbol is appended as a prefix/suffix to the adjacent numeric column's
    values, and the symbol column is dropped.

    Args:
        df: DataFrame to process (column names may carry ``_2``/``_3`` suffixes).

    Returns:
        DataFrame with ghost columns removed.
    """

    if df.empty or len(df.columns) <= 1:
        return df

    # --- Step 1: identify adjacent same-base-name column groups ---
    col_names = [str(c) for c in df.columns]
    groups: list[list[int]] = []  # each group is the index list of adjacent columns with the same base name
    current_group: list[int] = [0]
    base_name_0 = _ghost_column_base_name(col_names[0])

    for i in range(1, len(col_names)):
        base_i = _ghost_column_base_name(col_names[i])
        if base_i == base_name_0:
            current_group.append(i)
        else:
            groups.append(current_group)
            current_group = [i]
            base_name_0 = base_i
    groups.append(current_group)

    # If there are no multi-column groups, nothing to do
    if all(len(g) == 1 for g in groups):
        return df

    # --- Step 2: merge columns in the same group ---
    result_cols: list[str] = []
    result_data: dict[str, list[Any]] = {}

    for group in groups:
        primary_idx = group[0]
        primary_name = col_names[primary_idx]
        if len(group) == 1:
            result_cols.append(primary_name)
            result_data[primary_name] = list(df.iloc[:, primary_idx])
            continue

        # merge rows in the same group: take the first non-null value
        merged_values: list[Any] = []
        for row_idx in range(len(df)):
            merged = None
            for col_idx in group:
                val = df.iloc[row_idx, col_idx]
                if val is not None and not (isinstance(val, float) and pd.isna(val)):
                    cell_text = str(val).strip() if not isinstance(val, (int, float)) else val
                    if cell_text == "" or cell_text == "nan":
                        continue
                    if merged is None:
                        merged = val
                    # if a value already exists, try merging the symbols
                    elif isinstance(val, str) and val.strip() in _CURRENCY_SYMBOL_TOKENS:
                        merged = f"{val.strip()}{merged}" if isinstance(merged, str) else merged
                    elif isinstance(merged, str) and merged.strip() in _CURRENCY_SYMBOL_TOKENS:
                        merged = f"{merged.strip()}{val}" if isinstance(val, str) else val
            merged_values.append(merged)

        # use the base name (without the _2/_3 suffix) as the column name
        clean_name = _ghost_column_base_name(primary_name)
        # avoid conflicting with existing column names
        if clean_name in result_data:
            clean_name = primary_name
        result_cols.append(clean_name)
        result_data[clean_name] = merged_values

    return pd.DataFrame(result_data, columns=pd.Index(result_cols, dtype="object"))


def _ghost_column_base_name(col_name: Any) -> str:
    """Extract the base name of a column (stripping dedup suffixes like ``_2``/``_3``).

    Args:
        col_name: original column name (may be a non-string such as int).

    Returns:
        base name with any trailing ``_\\d+`` suffix removed.
    """

    name_str = str(col_name)
    return re.sub(r"_\d+$", "", name_str)


def _render_records_from_dataframe(
    *,
    table_obj: Any,
    allow_generated_columns: bool,
    precomputed_dataframe: Optional[pd.DataFrame] = None,
) -> Optional[dict[str, Any]]:
    """Render records from a DataFrame.

    Args:
        table_obj: table object.
        allow_generated_columns: whether generating placeholder column names is allowed.
        precomputed_dataframe: reusable precomputed DataFrame.

    Returns:
        records payload; `None` on failure.

    Raises:
        RuntimeError: raised when the rendering fails.
    """

    table_df = precomputed_dataframe
    if table_df is None:
        table_df = _safe_table_dataframe(table_obj)
    if table_df is None or table_df.empty:
        return None

    # Row-label recovery: turn a meaningful index into a data column
    table_df = _recover_index_as_column(table_df)

    # Flatten MultiIndex column names (removes the tuple repr problem)
    table_df = _flatten_multiindex_columns(table_df)

    if table_df.columns.has_duplicates:
        table_df = table_df.copy()
        table_df.columns = _uniquify_columns([str(column) for column in table_df.columns])

    # Merge ghost columns produced by colspan (eliminates empty _2/_3 columns and symbol splits)
    table_df = _collapse_ghost_columns(table_df)

    columns = _extract_headers_from_dataframe(table_df)
    normalized_df = table_df.copy()
    if not columns:
        candidate_columns = [_normalize_optional_string(column) for column in normalized_df.columns]
        columns = _build_table_columns(
            candidate_columns=candidate_columns,
            col_count=normalized_df.shape[1],
            allow_generated=allow_generated_columns,
        )
        if columns is None:
            return None
    normalized_df.columns = columns
    records = _dataframe_to_records(normalized_df)
    if not records:
        return None
    return {"columns": columns, "data": records}


def _render_records_from_html_table(
    *,
    table_obj: Any,
    allow_generated_columns: bool,
) -> Optional[dict[str, Any]]:
    """Render records from an HTML table structure.

    Args:
        table_obj: table object.
        allow_generated_columns: whether generating placeholder column names is allowed.

    Returns:
        records payload; `None` on failure.

    Raises:
        RuntimeError: raised when the rendering fails.
    """

    html_text = _extract_table_html(table_obj)
    if not html_text:
        return None
    soup = BeautifulSoup(html_text, "html.parser")
    table_tag = soup.find("table")
    if table_tag is None:
        return None

    header_rows: list[list[str]] = []
    data_rows: list[list[str]] = []
    for row_tag in table_tag.find_all("tr"):
        row_cells: list[str] = []
        header_cells: list[str] = []
        for th in row_tag.find_all("th"):
            header_cells.append(_normalize_whitespace(th.get_text(" ", strip=True)))
        for td in row_tag.find_all("td"):
            row_cells.append(_normalize_whitespace(td.get_text(" ", strip=True)))
        if header_cells:
            header_rows.append(header_cells)
        if row_cells:
            data_rows.append(row_cells)

    if not data_rows:
        return None
    col_count = max(len(row) for row in data_rows)
    collapsed_headers = _collapse_header_rows(header_rows, col_count)
    columns = _build_table_columns(
        candidate_columns=collapsed_headers,
        col_count=col_count,
        allow_generated=allow_generated_columns,
    )
    if columns is None:
        return None
    records = _matrix_rows_to_records(
        rows=data_rows,
        columns=columns,
    )
    if not records:
        return None
    return {"columns": columns, "data": records}


def _render_records_from_markdown_table(
    *,
    markdown_text: str,
    allow_generated_columns: bool,
) -> Optional[dict[str, Any]]:
    """Parse records back from markdown text.

    Args:
        markdown_text: markdown table text.
        allow_generated_columns: whether generating placeholder column names is allowed.

    Returns:
        records payload; `None` on parse failure.

    Raises:
        RuntimeError: raised when the parsing fails.
    """

    if not markdown_text:
        return None
    lines = [line.strip() for line in markdown_text.splitlines() if line.strip()]
    if len(lines) < 2:
        return None
    if not all("|" in line for line in lines[:2]):
        return None

    header_cells = _split_markdown_row(lines[0])
    separator = lines[1]
    if not _MARKDOWN_SEPARATOR_PATTERN.fullmatch(separator):
        return None
    data_lines = lines[2:]
    if not data_lines:
        return None

    col_count = max(len(header_cells), max(len(_split_markdown_row(line)) for line in data_lines))
    columns = _build_table_columns(
        candidate_columns=header_cells,
        col_count=col_count,
        allow_generated=allow_generated_columns,
    )
    if columns is None:
        return None
    matrix_rows = [_split_markdown_row(line) for line in data_lines]
    records = _matrix_rows_to_records(rows=matrix_rows, columns=columns)
    if not records:
        return None
    return {"columns": columns, "data": records}


def _split_markdown_row(row: str) -> list[str]:
    """Split a markdown row.

    Args:
        row: row text.

    Returns:
        cell list.

    Raises:
        RuntimeError: raised when the split fails.
    """

    trimmed = row.strip()
    if trimmed.startswith("|"):
        trimmed = trimmed[1:]
    if trimmed.endswith("|"):
        trimmed = trimmed[:-1]
    return [_normalize_whitespace(cell) for cell in trimmed.split("|")]


def _extract_table_html(table_obj: Any) -> str:
    """Extract HTML text from a table object.

    Args:
        table_obj: table object.

    Returns:
        HTML string; empty string when extraction fails.

    Raises:
        RuntimeError: raised when the extraction fails.
    """

    for attr_name in ("html", "table_html", "raw_html"):
        raw_attr = getattr(table_obj, attr_name, None)
        if isinstance(raw_attr, str) and raw_attr.strip():
            return raw_attr
    to_html = getattr(table_obj, "to_html", None)
    if callable(to_html):
        try:
            html_value = to_html()
        except Exception:
            return ""
        if isinstance(html_value, str):
            return html_value
    return ""


def _collapse_header_rows(header_rows: list[list[str]], col_count: int) -> list[Optional[str]]:
    """Merge multi-line table headers.

    Args:
        header_rows: header row list.
        col_count: target column count.

    Returns:
        merged column-name candidate list.

    Raises:
        RuntimeError: raised when the merge fails.
    """

    if col_count <= 0:
        return []
    merged: list[list[str]] = [[] for _ in range(col_count)]
    for row in header_rows:
        for index in range(col_count):
            token = _normalize_optional_string(row[index] if index < len(row) else None)
            if not token:
                continue
            if token in merged[index]:
                continue
            merged[index].append(token)
    return [" / ".join(parts) if parts else None for parts in merged]


def _build_table_columns(
    *,
    candidate_columns: Sequence[Optional[str]],
    col_count: int,
    allow_generated: bool,
) -> Optional[list[str]]:
    """Build usable column names.

    Args:
        candidate_columns: candidate column names.
        col_count: target column count.
        allow_generated: whether generating column names automatically is allowed.

    Returns:
        column name list; `None` when unavailable.

    Raises:
        RuntimeError: raised when the build fails.
    """

    if col_count <= 0:
        return None
    normalized_columns: list[str] = []
    for index in range(col_count):
        candidate = _normalize_optional_string(
            candidate_columns[index] if index < len(candidate_columns) else None
        )
        if candidate and not _is_low_information_header(candidate):
            normalized_columns.append(candidate)
            continue
        if allow_generated:
            normalized_columns.append(f"col_{index + 1}")
            continue
        return None
    return _uniquify_columns(normalized_columns)


def _uniquify_columns(columns: list[str]) -> list[str]:
    """Deduplicate column names preserving order.

    Args:
        columns: original column names.

    Returns:
        deduplicated column name list.

    Raises:
        RuntimeError: raised when the deduplication fails.
    """

    seen: dict[str, int] = {}
    result: list[str] = []
    for column in columns:
        key = column.lower()
        seen[key] = seen.get(key, 0) + 1
        if seen[key] == 1:
            result.append(column)
            continue
        result.append(f"{column}_{seen[key]}")
    return result


def _matrix_rows_to_records(
    *,
    rows: list[list[str]],
    columns: list[str],
) -> list[dict[str, Any]]:
    """Convert a 2-D text matrix to records.

    Args:
        rows: row matrix.
        columns: column name list.

    Returns:
        records list.

    Raises:
        RuntimeError: raised when the conversion fails.
    """

    records: list[dict[str, Any]] = []
    for row in rows:
        normalized_row: dict[str, Any] = {}
        for index, column in enumerate(columns):
            cell = row[index] if index < len(row) else ""
            normalized_row[column] = _normalize_table_cell_value(cell)
        records.append(normalized_row)
    return records


def _is_records_payload_quality_ok(
    payload: dict[str, Any],
    *,
    aggressive: bool,
    expected_col_count: Optional[int] = None,
) -> bool:
    """Evaluate records payload quality.

    Args:
        payload: records payload.
        aggressive: whether to use lenient thresholds (for core financial tables).
        expected_col_count: declared column count of the original table.

    Returns:
        whether quality meets the bar.

    Raises:
        RuntimeError: raised when the evaluation fails.
    """

    columns = payload.get("columns")
    data = payload.get("data")
    if not isinstance(columns, list) or not columns:
        return False
    if not isinstance(data, list) or not data:
        return False
    total_cells = len(columns) * len(data)
    if total_cells <= 0:
        return False
    if expected_col_count is not None and expected_col_count > 0:
        ratio = len(columns) / expected_col_count
        min_ratio = 0.5 if aggressive else 0.65
        if ratio < min_ratio:
            return False
    generated_count = sum(
        1 for column in columns if _GENERATED_COLUMN_PATTERN.fullmatch(str(column))
    )
    generated_ratio = generated_count / len(columns)
    generated_threshold = 0.8 if aggressive else 0.6
    if generated_ratio > generated_threshold:
        return False
    non_empty_cells = 0
    for row in data:
        if not isinstance(row, dict):
            continue
        for column in columns:
            if row.get(column) is not None:
                non_empty_cells += 1
    density = non_empty_cells / total_cells
    threshold = 0.15 if aggressive else 0.3
    return density >= threshold


def _dataframe_to_records(dataframe: pd.DataFrame) -> list[dict[str, Any]]:
    """Convert a DataFrame to records, handling empties and numeric text stably.

    Args:
        dataframe: DataFrame to convert.

    Returns:
        normalized records list.

    Raises:
        RuntimeError: raised when the conversion fails.
    """

    records: list[dict[str, Any]] = []
    for _, row in dataframe.iterrows():
        normalized_row: dict[str, Any] = {}
        for column in dataframe.columns:
            normalized_row[str(column)] = _normalize_table_cell_value(row[column])
        records.append(normalized_row)
    return records


def _normalize_table_cell_value(value: Any) -> Any:
    """Normalize a table cell value.

    Args:
        value: raw cell value.

    Returns:
        normalized value: `None` for empty, parseable string for numeric text, cleaned text otherwise.

    Raises:
        RuntimeError: raised when the normalization fails.
    """

    if value is None:
        return None
    if isinstance(value, (int, float)) and not pd.isna(value):
        return value
    if pd.isna(value):
        return None
    text = _normalize_whitespace(str(value))
    if not text:
        return None
    lowered = text.lower()
    if lowered in _LOW_INFO_TOKENS:
        return None
    normalized_numeric = _normalize_numeric_cell_text(text)
    if normalized_numeric is not None:
        return normalized_numeric
    return text


def _normalize_numeric_cell_text(text: str) -> Optional[str]:
    """Normalize number-styled text.

    Rules: handle currency symbols, thousand separators, parenthesized negatives,
    and common footnote markers; return `None` when the text cannot be confirmed as a number.

    Args:
        text: raw text.

    Returns:
        normalized number string; `None` for non-numbers.

    Raises:
        RuntimeError: raised when the normalization fails.
    """

    cleaned = _strip_trailing_footnote(text)
    if "%" in cleaned:
        return None
    negative = cleaned.startswith("(") and cleaned.endswith(")")
    if negative:
        cleaned = cleaned[1:-1].strip()
    # Strip currency symbols and whitespace first, then let the shared normalization
    # helper handle thousand/decimal separators, so European formats like "1,23"
    # don't lose their decimal meaning by comma removal.
    cleaned = cleaned.replace("$", "").replace("¥", "").replace("€", "").replace(" ", "")
    cleaned = normalize_numeric_separators(cleaned)
    if cleaned.startswith("+"):
        cleaned = cleaned[1:]
    if not cleaned:
        return None
    if not _STRICT_NUMERIC_TEXT_PATTERN.fullmatch(cleaned):
        return None
    if negative:
        cleaned = f"-{cleaned}"
    return cleaned


def _strip_trailing_footnote(text: str) -> str:
    """Remove trailing footnote markers.

    Args:
        text: raw text.

    Returns:
        text with common footnote markers removed.

    Raises:
        RuntimeError: raised when the cleaning fails.
    """

    cleaned = re.sub(r"(?<=\d)\[(?:\d+|[a-zA-Z])\]\s*$", "", text).strip()
    cleaned = re.sub(r"(?<=\d)\((?:\d+|[a-zA-Z])\)\s*$", "", cleaned).strip()
    # Strip only bare trailing lowercase single-letter footnotes (SEC financial-report
    # footnotes are conventionally a/b/c...); keep uppercase single-letter suffixes
    # (M/K/B/T magnitudes, Q/K form identifiers, etc.), which _STRICT_NUMERIC_TEXT_PATTERN
    # actively rejects as None inside _normalize_numeric_text, so magnitudes are not silently lost.
    cleaned = re.sub(r"(?<=\d)[a-z]\s*$", "", cleaned).strip()
    return cleaned


def _render_markdown_table(table_obj: Any, fallback_text: str) -> str:
    """Render a table as markdown text.

    Args:
        table_obj: table object.
        fallback_text: fallback text.

    Returns:
        markdown string.

    Raises:
        RuntimeError: raised when the rendering fails.
    """

    table_df = _safe_table_dataframe(table_obj)
    if table_df is not None and not table_df.empty:
        try:
            from tabulate import tabulate as _tabulate

            del _tabulate
            # NaN is common in MultiIndex merged cells; fill with empty strings before markdown conversion
            cleaned_df = table_df.fillna("")
            markdown = cleaned_df.to_markdown(index=False)
            if isinstance(markdown, str) and markdown.strip():
                return markdown
            raise RuntimeError("SEC table markdown render produced empty output")
        except ModuleNotFoundError as exc:
            raise RuntimeError("the tabulate dependency is missing; cannot render SEC table markdown") from exc
        except Exception as exc:
            raise RuntimeError(f"SEC table markdown render failed: {exc}") from exc
    if fallback_text:
        return fallback_text
    return _normalize_whitespace(str(getattr(table_obj, "to_dict", lambda: {})()))
