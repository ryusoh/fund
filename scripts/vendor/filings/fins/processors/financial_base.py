"""Financial-data processor protocols and placeholder types.

This module defines the protocols and data types specific to the financial
business domain:
- ``FinancialDataProcessor``: financial-data processing capability protocol
- ``FinancialStatementResult``: financial statement query result
- ``XbrlFactsResult``: XBRL query result
- ``FinancialMeta``: financial metadata

These types are used only in the fins layer; the engine layer stays
business-neutral.
"""

from __future__ import annotations

from typing import Any, NotRequired, Optional, Protocol, TypedDict


class FinancialStatementResult(TypedDict):
    """Financial statement result."""

    statement_type: str
    periods: list[dict[str, Any]]
    rows: list[dict[str, Any]]
    currency: str | None
    units: str | None
    scale: str | None
    data_quality: str
    reason: NotRequired[str]
    statement_locator: NotRequired[dict[str, Any]]


class XbrlFactsResult(TypedDict):
    """XBRL query result."""

    query_params: dict[str, Any]
    facts: list[dict[str, Any]]
    total: int
    data_quality: NotRequired[str]
    reason: NotRequired[str]


class FinancialMeta(TypedDict, total=False):
    """Financial metadata."""

    source_kind: str
    document_id: str
    statement_locator: dict[str, Any]


class FinancialDataProcessor(Protocol):
    """Financial-data capability protocol."""

    def get_financial_statement(
        self,
        statement_type: str,
        financials: Optional[dict[str, Any]] = None,
        *,
        meta: Optional[FinancialMeta] = None,
    ) -> FinancialStatementResult:
        """Read financial statements.

        Args:
            statement_type: statement type.
            financials: optional financials cache.
            meta: optional metadata.

        Returns:
            statement result.

        Raises:
            RuntimeError: raised when the read fails.
        """

        ...

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
            query result.

        Raises:
            RuntimeError: raised when the query fails.
        """

        ...


__all__ = [
    "FinancialDataProcessor",
    "FinancialMeta",
    "FinancialStatementResult",
    "XbrlFactsResult",
]
