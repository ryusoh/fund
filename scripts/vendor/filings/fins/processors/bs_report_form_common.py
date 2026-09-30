"""Base class for BS report-class form processors.

This module provides shared capabilities for BeautifulSoup-based report-class
form (10-K/10-Q/20-F) processors:
- reuses the virtual-section splitting of `_VirtualSectionProcessorMixin`;
- loads XBRL independently to provide `get_financial_statement` /
  `query_xbrl_facts` capabilities;
- does not rely on the edgartools black box; HTML parsing is driven entirely
  by BeautifulSoup.

Design intent:
- runs parallel to `_BaseSecReportFormProcessor` (based on
  edgartools/SecProcessor), providing report-class form processors on a
  separate technical route;
- makes it easy to compare LLM feedability and code maintainability.
"""

from __future__ import annotations

from typing import Any, ClassVar, Optional

import pandas as pd
from edgar.xbrl import XBRL

from scripts.vendor.filings.engine.processors.bs_processor import BSProcessor
from scripts.vendor.filings.engine.processors.source import Source
from scripts.vendor.filings.engine.processors.table_utils import parse_html_table_dataframe
from scripts.vendor.filings.fins.xbrl_file_discovery import discover_xbrl_files

from .financial_base import (
    FinancialMeta,
    FinancialStatementResult,
    XbrlFactsResult,
)
from .fins_bs_processor import FinsBSProcessor
from .form_type_utils import normalize_form_type as _normalize_report_form_type
from .html_financial_statement_common import (
    build_html_statement_result_from_tables as _build_html_statement_result_from_tables,
)
from .report_form_financial_statement_common import (
    REPORT_FORM_SUPPORTED_STATEMENT_TYPES,
)
from .report_form_financial_statement_common import (
    select_report_statement_tables as _select_report_statement_tables,
)
from .report_form_financial_statement_common import (
    should_apply_report_statement_html_fallback as _should_apply_report_statement_html_fallback,
)
from .sec_form_section_common import _VirtualSectionProcessorMixin
from .sec_table_extraction import _safe_statement_dataframe

# XBRL helper functions are imported directly from the split-out sec_xbrl_query
# module (these functions are unrelated to edgartools document parsing; they
# only operate on XBRL objects and DataFrames, i.e. shared utility logic).
from .sec_xbrl_query import (
    _STATEMENT_METHODS,
    _build_period_summary,
    _build_statement_rows,
    _extract_period_columns,
    _infer_currency_from_units,
    _infer_units_from_xbrl_query,
    _infer_xbrl_taxonomy,
    _normalize_fact_row,
    _normalize_query_statement_type,
    _query_facts_rows,
    build_statement_locator,
)


def _parse_report_table_dataframe_from_bs(table: Any) -> Optional[pd.DataFrame]:
    """Safely extract a DataFrame from a BSProcessor table object.

    Args:
        table: BS-path internal table object.

    Returns:
        DataFrame; ``None`` when unavailable.

    Raises:
        RuntimeError: raised when extraction fails.
    """

    table_tag = getattr(table, "tag", None)
    if table_tag is None:
        return None
    return parse_html_table_dataframe(table_tag)


class _BaseBsReportFormProcessor(_VirtualSectionProcessorMixin, FinsBSProcessor):
    """BeautifulSoup-based base class for report-class form processors.

    Inheritance chain:
    ``_BaseBsReportFormProcessor → _VirtualSectionProcessorMixin → FinsBSProcessor → BSProcessor``

    Virtual-section splitting reuses ``_VirtualSectionProcessorMixin``;
    XBRL capabilities are provided via independent loading (not through the
    edgartools document object).
    """

    _SUPPORTED_FORMS: ClassVar[frozenset[str]] = frozenset()
    _MIN_VIRTUAL_SECTIONS: ClassVar[int] = 3

    def __init__(
        self,
        source: Source,
        *,
        form_type: Optional[str] = None,
        media_type: Optional[str] = None,
    ) -> None:
        """Initialize the processor.

        execution order:
        1. ``FinsBSProcessor.__init__`` (BeautifulSoup parse + table financial annotation);
        2. XBRL lazy-load state initialization;
        3. virtual-section splitting.

        Args:
            source: document source abstraction.
            form_type: optional form type.
            media_type: optional media type.

        Returns:
            None.

        Raises:
            ValueError: raised when an argument is invalid.
            RuntimeError: raised when parsing fails.
        """

        super().__init__(source=source, form_type=form_type, media_type=media_type)
        # record the source file path for XBRL file discovery
        self._source_path = source.materialize(suffix=".html")

        # XBRL lazy-load state
        self._xbrl: Optional[XBRL] = None
        self._xbrl_loaded: bool = False
        self._xbrl_taxonomy: Optional[str] = None
        self._xbrl_taxonomy_loaded: bool = False

        # virtual-section splitting (falls back to native BSProcessor sections when markers are insufficient)
        self._initialize_virtual_sections(min_sections=self._MIN_VIRTUAL_SECTIONS)

    @classmethod
    def supports(
        cls,
        source: Source,
        *,
        form_type: Optional[str] = None,
        media_type: Optional[str] = None,
    ) -> bool:
        """Determine whether the given report-class form is supported.

        Args:
            source: document source abstraction.
            form_type: optional form type.
            media_type: optional media type.

        Returns:
            whether it is supported.

        Raises:
            OSError: may be raised when file access fails.
        """

        normalized_form = _normalize_report_form_type(form_type)
        if normalized_form not in cls._SUPPORTED_FORMS:
            return False
        # reuse BSProcessor's file-type parseability judgment
        return BSProcessor.supports(source, form_type=form_type, media_type=media_type)

    def _collect_document_text(self) -> str:
        """Extract full text for report-class marker detection (preserving line-break structure where possible).

        for 10-K/10-Q/20-F, some Item headings rely on line-break boundaries to be recognized.
        ``BSProcessor.get_full_text()`` normalizes whitespace and flattens the
        text into a single line,
        easily losing the "line-leading number + title" structural signal.

        so the report-class BS path reuses the parent ``__init__``'s already parsed and cleaned
        ``_root`` DOM tree, extracting text with ``separator="\\n"`` to preserve
        the line-break structure,
        avoids re-reading the HTML file and re-creating the BeautifulSoup object.

        Args:
            None.

        Returns:
            full text preserving the basic line-break structure; falls back to the parent-class result on failure.

        Raises:
            RuntimeError: raised when the read fails.
        """

        try:
            # reuse the DOM tree already parsed by the parent __init__ to avoid a second BS parse
            extracted = self._root.get_text(separator="\n", strip=True).strip()
            if extracted:
                return extracted
        except Exception:
            pass
        return super()._collect_document_text()

    # ── XBRL financial capabilities ──────────────────────────

    def get_financial_statement(
        self,
        statement_type: str,
        financials: Optional[dict[str, Any]] = None,
        *,
        meta: Optional[FinancialMeta] = None,
    ) -> FinancialStatementResult:
        """Get a standard financial statement.

        financial data is obtained by loading XBRL files independently, without the edgartools document object.

        Args:
            statement_type: statement type.
            financials: reserved parameter, unused by the current implementation.
            meta: reserved parameter, unused by the current implementation.

        Returns:
            financial-statement result.

        Raises:
            RuntimeError: raised when the XBRL read or conversion fails.
        """

        del financials
        del meta

        normalized_statement_type = statement_type.strip().lower()
        base_result: FinancialStatementResult = {
            "statement_type": statement_type,
            "periods": [],
            "rows": [],
            "currency": None,
            "units": None,
            "scale": None,
            "data_quality": "partial",
        }
        if normalized_statement_type not in _STATEMENT_METHODS:
            base_result["reason"] = "unsupported_statement_type"
            return base_result

        xbrl_result, xbrl_reason = self._get_statement_from_xbrl(
            statement_type=statement_type,
            normalized_statement_type=normalized_statement_type,
        )
        if xbrl_result is not None:
            return xbrl_result

        base_result["reason"] = xbrl_reason or "xbrl_not_available"
        if normalized_statement_type not in REPORT_FORM_SUPPORTED_STATEMENT_TYPES:
            return base_result
        if not _should_apply_report_statement_html_fallback(base_result["reason"]):
            return base_result

        candidate_tables = self._get_report_statement_tables(normalized_statement_type)
        if not candidate_tables:
            return base_result
        extracted = self._build_html_statement_from_tables(
            statement_type=normalized_statement_type,
            tables=candidate_tables,
        )
        if extracted is None:
            base_result["reason"] = "low_confidence_extraction"
            return base_result
        return extracted

    def query_xbrl_facts(
        self,
        concepts: list[str],
        statement_type: Optional[str] = None,
        period_end: Optional[str] = None,
        fiscal_year: Optional[int] = None,
        fiscal_period: Optional[str] = None,
        min_value: Optional[float] = None,
        max_value: Optional[float] = None,
    ) -> XbrlFactsResult:
        """Query XBRL facts.

        Args:
            concepts: XBRL concept list.
            statement_type: optional statement type.
            period_end: optional period-end date (YYYY-MM-DD).
            fiscal_year: optional fiscal year.
            fiscal_period: optional fiscal quarter.
            min_value: optional minimum-value filter.
            max_value: optional maximum-value filter.

        Returns:
            XBRL query result.

        Raises:
            RuntimeError: raised when query execution fails.
        """

        normalized_concepts = [str(item).strip() for item in concepts if str(item).strip()]
        normalized_statement_type = _normalize_query_statement_type(statement_type)
        query_params = {
            "concepts": normalized_concepts,
            "statement_type": normalized_statement_type or statement_type,
            "filters_applied": {
                "period_end": period_end,
                "fiscal_year": fiscal_year,
                "fiscal_period": fiscal_period,
                "min_value": min_value,
                "max_value": max_value,
            },
        }
        if not normalized_concepts:
            return {
                "query_params": query_params,
                "facts": [],
                "total": 0,
            }

        xbrl = self._get_xbrl()
        if xbrl is None:
            return {
                "query_params": query_params,
                "facts": [],
                "total": 0,
                "data_quality": "partial",
                "reason": "xbrl_not_available",
            }

        rows = _query_facts_rows(
            xbrl=xbrl,
            concepts=normalized_concepts,
            statement_type=normalized_statement_type,
            period_end=period_end,
            fiscal_year=fiscal_year,
            fiscal_period=fiscal_period,
            min_value=min_value,
            max_value=max_value,
        )
        facts = [_normalize_fact_row(row) for row in rows]
        return {
            "query_params": query_params,
            "facts": facts,
            "total": len(facts),
        }

    def _get_statement_from_xbrl(
        self,
        *,
        statement_type: str,
        normalized_statement_type: str,
    ) -> tuple[Optional[FinancialStatementResult], Optional[str]]:
        """Extract financial statements from XBRL and return the failure reason.

        Args:
            statement_type: raw statement type.
            normalized_statement_type: normalized statement type.

        Returns:
            ``(result, failure_reason)`` pair; failure_reason is ``None`` on success.

        Raises:
            RuntimeError: raised when the XBRL read fails.
        """

        method_name = _STATEMENT_METHODS.get(normalized_statement_type)
        if method_name is None:
            return None, "unsupported_statement_type"

        xbrl = self._get_xbrl()
        if xbrl is None:
            return None, "xbrl_not_available"

        statements = getattr(xbrl, "statements", None)
        method = getattr(statements, method_name, None)
        if not callable(method):
            return None, "statement_method_missing"

        statement_obj = method()
        if statement_obj is None:
            return None, "statement_not_found"

        statement_df = _safe_statement_dataframe(statement_obj)
        if statement_df is None or statement_df.empty:
            return None, "statement_empty"

        period_columns = _extract_period_columns(statement_df.columns)
        rows = _build_statement_rows(statement_df, period_columns)
        periods = [_build_period_summary(period) for period in period_columns]
        units = _infer_units_from_xbrl_query(xbrl)
        currency = _infer_currency_from_units(units)
        return (
            {
                "statement_type": statement_type,
                "periods": periods,
                "rows": rows,
                "currency": currency,
                "units": units,
                "scale": None,
                "data_quality": "xbrl" if rows else "partial",
                "statement_locator": build_statement_locator(
                    statement_type=statement_type,
                    periods=periods,
                    rows=rows,
                ),
            },
            None,
        )

    def _get_report_statement_tables(self, statement_type: str) -> list[Any]:
        """Get financial-statement candidate tables for report-class forms.

        Args:
            statement_type: target statement type.

        Returns:
            candidate table list.

        Raises:
            RuntimeError: raised when filtering fails.
        """

        return _select_report_statement_tables(
            statement_type=statement_type,
            tables=list(getattr(self, "_tables", [])),
            parse_table_dataframe=_parse_report_table_dataframe_from_bs,
        )

    def _build_html_statement_from_tables(
        self,
        *,
        statement_type: str,
        tables: list[Any],
    ) -> Optional[FinancialStatementResult]:
        """Build a structured financial statement from candidate HTML tables.

        Args:
            statement_type: target statement type.
            tables: candidate table list.

        Returns:
            structured financial-statement result; ``None`` on failure.

        Raises:
            RuntimeError: raised when the build fails.
        """

        return _build_html_statement_result_from_tables(
            statement_type=statement_type,
            tables=tables,
            parse_table_dataframe=_parse_report_table_dataframe_from_bs,
        )

    def _get_xbrl(self) -> Optional[XBRL]:
        """Lazily load and cache the XBRL object.

        built independently by discovering XBRL companion files next to the source file,
        bypassing the edgartools HTMLParser.

        Args:
            None.

        Returns:
            ``XBRL`` instance or ``None``.

        Raises:
            RuntimeError: raised when XBRL construction fails.
        """

        if self._xbrl_loaded:
            return self._xbrl

        self._xbrl_loaded = True
        xbrl_files = discover_xbrl_files(self._source_path.parent)
        instance_file = xbrl_files.get("instance")
        schema_file = xbrl_files.get("schema")
        if instance_file is None or schema_file is None:
            self._xbrl = None
            return None
        try:
            self._xbrl = XBRL.from_files(
                instance_file=instance_file,
                schema_file=schema_file,
                presentation_file=xbrl_files.get("presentation"),
                calculation_file=xbrl_files.get("calculation"),
                definition_file=xbrl_files.get("definition"),
                label_file=xbrl_files.get("label"),
            )
        except Exception:
            self._xbrl = None
        return self._xbrl

    def get_xbrl_taxonomy(self) -> Optional[str]:
        """Read the current document's XBRL taxonomy.

        Args:
            None.

        Returns:
            taxonomy (``us-gaap`` / ``ifrs-full``) or ``None``.

        Raises:
            RuntimeError: raised when parsing fails.
        """

        if self._xbrl_taxonomy_loaded:
            return self._xbrl_taxonomy
        self._xbrl_taxonomy_loaded = True
        xbrl = self._get_xbrl()
        if xbrl is None:
            self._xbrl_taxonomy = None
            return None
        self._xbrl_taxonomy = _infer_xbrl_taxonomy(xbrl)
        return self._xbrl_taxonomy


__all__ = [
    "_BaseBsReportFormProcessor",
]
