"""fins table financial-semantics enhancement utilities.

This module is responsible for adding financial semantics, at the business-domain
layer, to tables produced by the generic processors:
- Unified keyword library;
- Unified decision rules;
- Unified table relabeling pipeline.
- Financial-semantics extra-field extraction (``extra_financial_table_fields``).
"""

from __future__ import annotations

import json
import unicodedata
from pathlib import Path
from collections.abc import Iterable, Mapping
from typing import Any, Optional, Protocol

from scripts.vendor.filings.engine.processors.text_utils import (
    normalize_optional_string as _normalize_optional_string,
)
from scripts.vendor.filings.engine.processors.text_utils import (
    normalize_whitespace as _normalize_whitespace,
)


def extra_financial_table_fields(table: Any) -> dict[str, Any]:
    """Extract financial-semantics extra fields (shared across FinsBSProcessor / FinsDoclingProcessor / FinsMarkdownProcessor).

    ``relabel_tables`` dynamically adds an ``is_financial`` attribute to each table
    object via ``setattr``; this function fills it into the output dict.

    Args:
        table: internal table object.

    Returns:
        field dict containing ``is_financial``.
    """
    return {"is_financial": getattr(table, "is_financial", False)}


# Chinese label/keyword data below is machine-consumed match-key data
# (matched against filing text; values must stay byte-identical), so it lives
# in a JSON resource to keep the Python sources English-only.
_FINANCIAL_LABEL_DATA = json.loads(
    (Path(__file__).with_name("_financial_labels.json")).read_text(encoding="utf-8")
)
_FINANCIAL_KEYWORDS = tuple(_FINANCIAL_LABEL_DATA["financial_keywords"])
_FINANCIAL_STATEMENT_EVIDENCE_GROUPS = tuple(
    (label, tuple(keywords), minimum_hits)
    for label, keywords, minimum_hits in _FINANCIAL_LABEL_DATA["financial_statement_evidence_groups"]
)

_MAX_TABLE_BODY_EVIDENCE_CHARS = 6000


class _DoclingDocumentProtocol(Protocol):
    """Docling document export context protocol.

    The fins layer passes the document object straight back to the Docling table-export
    methods without reading any Docling internal fields; this protocol therefore
    deliberately declares no members.
    """


class _DoclingTableItemProtocol(Protocol):
    """Docling table object protocol.

    Table-export capability is provided by third-party Docling objects; the fins layer
    probes methods at runtime to call them safely, and the type expresses only the
    boundary "this is a Docling table object".
    """


def is_financial_table(
    caption: Optional[str],
    headers: Optional[list[str]],
    context_before: str,
) -> bool:
    """Judge whether a table is a financial table.

    Args:
        caption: table caption.
        headers: table header list.
        context_before: text immediately before the table.

    Returns:
        `True` when a financial keyword hits, otherwise `False`.

    Raises:
        RuntimeError: raised when the judgment fails.
    """

    parts = [str(caption or ""), str(context_before or "")]
    if headers:
        parts.extend(str(item or "") for item in headers)
    normalized_text = _normalize_whitespace(" ".join(parts)).lower()
    if not normalized_text:
        return False
    return any(keyword in normalized_text for keyword in _FINANCIAL_KEYWORDS)


def relabel_tables(
    tables: Iterable[Any], *, docling_document: _DoclingDocumentProtocol | None = None
) -> None:
    """Batch-relabel tables with financial semantics.

    Args:
        tables: iterable of table objects.
        docling_document: optional Docling document object; when given, financial-semantic captions can be supplemented from table bodies.

    Returns:
        None.

    Raises:
        RuntimeError: raised when the relabeling fails.
    """

    for table in tables:
        relabel_single_table(table, docling_document=docling_document)


def relabel_single_table(
    table: Any, *, docling_document: _DoclingDocumentProtocol | None = None
) -> None:
    """Relabel a single table with financial semantics.

    Args:
        table: table object (must carry `caption/headers/context_before/is_financial/table_type` fields).
        docling_document: optional Docling document object; when given, financial-semantic captions can be supplemented from table bodies.

    Returns:
        None.

    Raises:
        RuntimeError: raised when the relabeling fails.
    """

    caption = _normalize_optional_string(getattr(table, "caption", None))
    headers_value = getattr(table, "headers", None)
    headers = headers_value if isinstance(headers_value, list) else None
    context_before = str(getattr(table, "context_before", "") or "")
    semantic_caption = _derive_financial_statement_caption(
        table=table,
        docling_document=docling_document,
    )
    detection_headers = _merge_headers(headers, [semantic_caption] if semantic_caption else [])
    detection_caption = caption or semantic_caption
    is_financial = is_financial_table(
        caption=detection_caption,
        headers=detection_headers,
        context_before=context_before,
    )

    table.is_financial = is_financial
    if is_financial:
        if caption is None and semantic_caption is not None:
            table.caption = semantic_caption
        table.table_type = "financial"
        return

    raw_type = str(getattr(table, "table_type", "") or "").strip().lower()
    if raw_type not in {"data", "layout"}:
        table.table_type = "data"


def _derive_financial_statement_caption(
    *,
    table: Any,
    docling_document: _DoclingDocumentProtocol | None,
) -> str | None:
    """Infer the semantic captions of the three major financial statements from the table body.

    Args:
        table: internal table object.
        docling_document: optional Docling document object.

    Returns:
        inferred semantic caption; None when it cannot be reliably inferred.

    Raises:
        None.
    """

    table_item = getattr(table, "table_item", None)
    if table_item is None:
        return None
    evidence_text = _extract_table_body_text(
        table_item=table_item,
        docling_document=docling_document,
    )
    labels = _match_financial_statement_labels(evidence_text)
    if not labels:
        return None
    return " / ".join(labels)


def _extract_table_body_text(
    *,
    table_item: _DoclingTableItemProtocol,
    docling_document: _DoclingDocumentProtocol | None,
) -> str:
    """Extract table-body text as evidence for fins financial-semantics enhancement.

    Args:
        table_item: Docling table object.
        docling_document: optional Docling document object.

    Returns:
        table body text, at most `_MAX_TABLE_BODY_EVIDENCE_CHARS` characters.

    Raises:
        None.
    """

    markdown = _export_table_markdown(table_item=table_item, docling_document=docling_document)
    if markdown:
        return markdown[:_MAX_TABLE_BODY_EVIDENCE_CHARS]
    dataframe_text = _export_table_dataframe_text(
        table_item=table_item, docling_document=docling_document
    )
    return dataframe_text[:_MAX_TABLE_BODY_EVIDENCE_CHARS]


def _export_table_markdown(
    *,
    table_item: _DoclingTableItemProtocol,
    docling_document: _DoclingDocumentProtocol | None,
) -> str:
    """Safely export Docling table markdown.

    Args:
        table_item: Docling table object.
        docling_document: optional Docling document object.

    Returns:
        markdown text; empty string when export fails.

    Raises:
        None.
    """

    # Docling TableItem is a third-party object; export capability can only be probed via duck typing.
    exporter = getattr(table_item, "export_to_markdown", None)
    if not callable(exporter):
        return ""
    try:
        if docling_document is not None:
            payload = exporter(doc=docling_document)
        else:
            payload = exporter()
    except TypeError:
        try:
            payload = exporter()
        except Exception:
            return ""
    except Exception:
        return ""
    return payload if isinstance(payload, str) else ""


def _export_table_dataframe_text(
    *,
    table_item: _DoclingTableItemProtocol,
    docling_document: _DoclingDocumentProtocol | None,
) -> str:
    """Safely export Docling table dataframe text.

    Args:
        table_item: Docling table object.
        docling_document: optional Docling document object.

    Returns:
        dataframe text; empty string when export fails.

    Raises:
        None.
    """

    # Docling TableItem is a third-party object; export capability can only be probed via duck typing.
    exporter = getattr(table_item, "export_to_dataframe", None)
    if not callable(exporter):
        return ""
    try:
        if docling_document is not None:
            dataframe = exporter(doc=docling_document)
        else:
            dataframe = exporter()
    except TypeError:
        try:
            dataframe = exporter()
        except Exception:
            return ""
    except Exception:
        return ""
    to_dict = getattr(dataframe, "to_dict", None)
    if not callable(to_dict):
        return ""
    try:
        records = to_dict(orient="records")
    except Exception:
        return ""
    if not isinstance(records, list):
        return ""
    parts: list[str] = []
    for row in records[:80]:
        if not isinstance(row, Mapping):
            continue
        for key, value in row.items():
            parts.append(str(key))
            parts.append(str(value))
    return " ".join(parts)


def _match_financial_statement_labels(text: str) -> list[str]:
    """Match the three major financial-statement labels based on table-body evidence.

    Args:
        text: table body text.

    Returns:
        matched financial-statement label list.

    Raises:
        None.
    """

    normalized_text = _normalize_for_financial_match(text)
    if not normalized_text:
        return []
    labels: list[str] = []
    for label, keywords, minimum_hits in _FINANCIAL_STATEMENT_EVIDENCE_GROUPS:
        hit_count = sum(
            1 for keyword in keywords if _normalize_for_financial_match(keyword) in normalized_text
        )
        if hit_count >= minimum_hits:
            labels.append(label)
    return labels


def _merge_headers(
    headers: Optional[list[str]], inferred_headers: list[str]
) -> Optional[list[str]]:
    """Merge raw table headers with inferred semantic labels.

    Args:
        headers: raw table headers.
        inferred_headers: inferred semantic labels.

    Returns:
        merged table header; None when both are empty.

    Raises:
        None.
    """

    result: list[str] = []
    for item in headers or []:
        normalized = _normalize_optional_string(str(item or ""))
        if normalized and normalized not in result:
            result.append(normalized)
    for item in inferred_headers:
        normalized = _normalize_optional_string(item)
        if normalized and normalized not in result:
            result.append(normalized)
    return result or None


def _normalize_for_financial_match(text: str) -> str:
    """Normalize text for financial-semantic matching.

    Args:
        text: raw text.

    Returns:
        case-folded text after NFKC and whitespace normalization.

    Raises:
        None.
    """

    return _normalize_whitespace(unicodedata.normalize("NFKC", str(text or ""))).casefold()


class FinsProcessorMixin:
    """Generic Mixin providing financial-semantic extensions for fins processors.

    All three fins processor subclasses (FinsBSProcessor / FinsDoclingProcessor /
    FinsMarkdownProcessor) need to override ``_extra_table_fields``, with identical
    implementations. This method is hoisted into this Mixin to avoid triplicate definitions.

    MRO convention: this Mixin must be placed before the concrete base class
    (BSProcessor / DoclingProcessor / MarkdownProcessor), i.e.:
    class FinsXxxProcessor(FinsProcessorMixin, XxxProcessor).
    """

    def _extra_table_fields(self, table: Any) -> dict[str, Any]:
        """Inject financial-semantic fields, delegating to ``extra_financial_table_fields``.

        Args:
            table: internal table object.

        Returns:
            field dict containing ``is_financial``.
        """
        return extra_financial_table_fields(table)
