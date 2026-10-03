"""SEC XBRL query and financial-statement structured-extraction utility functions.

This module extracts the XBRL-related query, inference, and formatting functions
from ``sec_processor``, including statement-type mapping, taxonomy inference,
facts querying, value extraction, and normalization.
"""

from __future__ import annotations

import inspect
import re
from typing import Any, Callable, Optional

import pandas as pd
from edgar.xbrl import XBRL

from scripts.vendor.filings.engine.processors.text_utils import (
    normalize_optional_string as _normalize_optional_string_base,
)
from scripts.vendor.filings.engine.processors.text_utils import (
    normalize_whitespace as _normalize_whitespace,
)

_STATEMENT_METHODS = {
    "income": "income_statement",
    "balance_sheet": "balance_sheet",
    "cash_flow": "cashflow_statement",
    "equity": "statement_of_equity",
    "comprehensive_income": "comprehensive_income",
}
_QUERY_STATEMENT_TYPES = {
    "income": "IncomeStatement",
    "income_statement": "IncomeStatement",
    "incomestatement": "IncomeStatement",
    "balance_sheet": "BalanceSheet",
    "balancesheet": "BalanceSheet",
    "cash_flow": "CashFlowStatement",
    "cashflowstatement": "CashFlowStatement",
    "statement_of_changes_in_equity": "StatementOfChangesInEquity",
    "statementofchangesinequity": "StatementOfChangesInEquity",
    "equity": "StatementOfChangesInEquity",
    "comprehensive_income": "ComprehensiveIncome",
    "comprehensiveincome": "ComprehensiveIncome",
}
_STATEMENT_TITLE_BY_TYPE = {
    "income": "Income Statement",
    "balance_sheet": "Balance Sheet",
    "cash_flow": "Cash Flow Statement",
    "equity": "Statement of Changes in Equity",
    "comprehensive_income": "Comprehensive Income",
}

# decimals → scale mapping table (kept consistent with the service-layer _DECIMALS_SCALE_MAP)
_DECIMALS_SCALE_MAP: dict[int, str] = {
    -9: "billions",
    -6: "millions",
    -3: "thousands",
    0: "units",
}

# Revenue-concept candidates used for units/scale inference (ordered by hit
# priority in US-GAAP practice).
# - ``Revenues``: mainstream US-GAAP naming since 2018.
# - ``Revenue``: used by some IFRS-aligned filers and sub-integrators.
# - ``SalesRevenueNet`` / ``SalesRevenueGoodsNet``: legacy and segment scenarios.
_REVENUE_CONCEPT_CANDIDATES: tuple[str, ...] = (
    "Revenues",
    "Revenue",
    "SalesRevenueNet",
    "SalesRevenueGoodsNet",
)

# ISO 4217 major currency codes (covering the main SEC foreign-issuer languages),
# used to recognize a currency code inside a units string. When nothing matches,
# ``None`` is returned so that non-monetary units such as ``"shares"`` are not
# passed downstream as currency codes.
_KNOWN_CURRENCY_CODES: frozenset[str] = frozenset(
    {
        "USD",
        "EUR",
        "GBP",
        "JPY",
        "CNY",
        "HKD",
        "TWD",
        "KRW",
        "INR",
        "CAD",
        "AUD",
        "CHF",
        "BRL",
        "MXN",
        "SGD",
        "ZAR",
    }
)


def _normalize_optional_string(value: Any) -> Optional[str]:
    """Convert any value to an optional string, additionally handling pandas NaN/NaT.

    For meaningless values such as ``None``, empty strings, ``float('nan')``,
    and ``pd.NaT``, this returns ``None`` uniformly.

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


def _infer_xbrl_taxonomy(xbrl: XBRL) -> Optional[str]:
    """Infer the XBRL taxonomy.

    Args:
        xbrl: XBRL object.

    Returns:
        taxonomy (`us-gaap` / `ifrs-full`) or `None`.

    Raises:
        RuntimeError: raised when inference fails.
    """

    probes = ("Assets", "Revenues", "Revenue")
    for probe in probes:
        try:
            rows = xbrl.query().by_concept(probe).execute()
        except Exception:
            continue
        for row in rows:
            if not isinstance(row, dict):
                continue
            concept = str(row.get("concept") or "")
            taxonomy = _extract_taxonomy_from_concept(concept)
            if taxonomy is not None:
                return taxonomy
    return None


def _extract_taxonomy_from_concept(concept: str) -> Optional[str]:
    """Extract the taxonomy prefix from a concept name.

    Args:
        concept: concept name.

    Returns:
        `us-gaap`, `ifrs-full`, or `None`.

    Raises:
        RuntimeError: raised when extraction fails.
    """

    normalized = _normalize_whitespace(concept)
    if ":" not in normalized:
        return None
    prefix = normalized.split(":", 1)[0].strip().lower()
    if prefix.startswith("us-gaap"):
        return "us-gaap"
    if prefix.startswith("ifrs"):
        return "ifrs-full"
    return None


def _extract_period_columns(columns: Any) -> list[str]:
    """Identify the statement period-end columns.

    Args:
        columns: DataFrame column collection.

    Returns:
        period-end column name list.

    Raises:
        RuntimeError: raised when identification fails.
    """

    period_columns: list[str] = []
    for column in columns:
        column_str = str(column)
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", column_str):
            period_columns.append(column_str)
    return period_columns


def _build_statement_rows(
    statement_df: pd.DataFrame, period_columns: list[str]
) -> list[dict[str, Any]]:
    """Build the standard financial row structure.

    Args:
        statement_df: statement DataFrame.
        period_columns: period-end column list.

    Returns:
        row list.

    Raises:
        RuntimeError: raised when construction fails.
    """

    rows: list[dict[str, Any]] = []
    columns = statement_df.columns
    concept_idx = columns.get_loc("concept") if "concept" in columns else -1
    label_idx = columns.get_loc("label") if "label" in columns else -1
    period_idxs = [columns.get_loc(p) if p in columns else -1 for p in period_columns]

    for row in statement_df.itertuples(index=False, name=None):
        raw_concept = row[concept_idx] if concept_idx != -1 else None
        concept = _normalize_optional_string(raw_concept) or ""

        raw_label = row[label_idx] if label_idx != -1 else None
        label = _normalize_optional_string(raw_label) or concept

        values = [_to_optional_float(row[p_idx]) if p_idx != -1 else None for p_idx in period_idxs]

        if not concept and not label:
            continue
        rows.append(
            {
                "concept": concept,
                "label": label,
                "values": values,
            }
        )
    return rows


def _build_period_summary(period_end: str) -> dict[str, Any]:
    """Build the period summary.

    Args:
        period_end: period-end date (YYYY-MM-DD).

    Returns:
        period summary dict.

    Raises:
        ValueError: raised when the date is invalid.
    """

    fiscal_year = int(period_end[:4]) if re.fullmatch(r"\d{4}-\d{2}-\d{2}", period_end) else None
    return {
        "period_end": period_end,
        "fiscal_year": fiscal_year,
        "fiscal_period": "FY" if fiscal_year is not None else None,
    }


def _format_statement_period_label(period_summary: dict[str, Any]) -> str:
    """Format a period summary into a stable statement-period label.

    Args:
        period_summary: period summary generated by `_build_period_summary`.

    Returns:
        period label suitable for the statement locator; prefer forms like `FY2025`,
        falls back to the raw `period_end` when normalization fails.

    Raises:
        None.
    """

    fiscal_year = period_summary.get("fiscal_year")
    fiscal_period = _normalize_optional_string(period_summary.get("fiscal_period"))
    period_end = _normalize_optional_string(period_summary.get("period_end"))
    if isinstance(fiscal_year, int) and fiscal_period:
        return f"{fiscal_period}{fiscal_year}"
    return period_end or ""


def _extract_statement_row_labels(rows: list[dict[str, Any]]) -> list[str]:
    """Extract deduplicated row labels from structured statement rows.

    Args:
        rows: normalized statement row list.

    Returns:
        deduplicated, order-preserving row-label list.

    Raises:
        None.
    """

    labels: list[str] = []
    seen: set[str] = set()
    for row in rows:
        label = (
            _normalize_optional_string(row.get("label"))
            or _normalize_optional_string(row.get("concept"))
            or ""
        )
        if not label or label in seen:
            continue
        seen.add(label)
        labels.append(label)
    return labels


def build_statement_locator(
    *,
    statement_type: str,
    periods: list[dict[str, Any]],
    rows: list[dict[str, Any]],
    statement_title: Optional[str] = None,
) -> dict[str, Any]:
    """Build the structured statement locator info.

    This locator is used to:
    - let write stably express the `get_financial_statement` provenance in
      "evidence and sources";
    - let confirm/repair review evidence at statement + period + row granularity.

    Args:
        statement_type: statement type.
        periods: statement period summary list.
        rows: statement row list.
        statement_title: optional human-readable statement title; inferred from the type mapping when empty.

    Returns:
        structured locator info dict.

    Raises:
        None.
    """

    normalized_statement_type = statement_type.strip().lower()
    resolved_title = (
        statement_title or _STATEMENT_TITLE_BY_TYPE.get(normalized_statement_type) or statement_type
    )
    period_labels = [
        label for label in (_format_statement_period_label(period) for period in periods) if label
    ]
    row_labels = _extract_statement_row_labels(rows)
    return {
        "statement_type": statement_type,
        "statement_title": resolved_title,
        "period_labels": period_labels,
        "row_labels": row_labels,
    }


def _to_optional_float(value: Any) -> Optional[float]:
    """Convert a value to an optional float.

    Args:
        value: input value.

    Returns:
        float or `None`.

    Raises:
        ValueError: raised when conversion fails.
    """

    if value is None:
        return None
    if isinstance(value, str) and not value.strip():
        return None
    try:
        numeric = float(value)
    except Exception:
        return None
    if pd.isna(numeric):
        return None
    return numeric


def _normalize_query_statement_type(statement_type: Optional[str]) -> Optional[str]:
    """Normalize the XBRL query statement type.

    Args:
        statement_type: input statement type.

    Returns:
        normalized statement type; `None` when unrecognized.

    Raises:
        ValueError: raised when the input is invalid.
    """

    if statement_type is None:
        return None
    key = re.sub(r"[\s_]+", "", statement_type.strip().lower())
    if not key:
        return None
    return _QUERY_STATEMENT_TYPES.get(key, statement_type)


def _build_xbrl_value_filter(
    min_value: Optional[float],
    max_value: Optional[float],
) -> Callable[[float], bool] | tuple[float, float] | None:
    """Build the filter arguments needed by edgartools `FactQuery.by_value`.

    Args:
        min_value: optional minimum value.
        max_value: optional maximum value.

    Returns:
        `(min, max)` tuple when both bounds exist; a predicate for a single bound; `None` when both are empty.

    Raises:
        ValueError: raised when the input is invalid.
    """

    if min_value is None and max_value is None:
        return None
    if min_value is not None and max_value is not None:
        return (min_value, max_value)

    def _predicate(value: float) -> bool:
        """Determine whether a value satisfies the single-boundary filter condition.

        Args:
            value: number to inspect.

        Returns:
            `True` when the filter condition is satisfied, otherwise `False`.

        Raises:
            ValueError: raised when the input is invalid.
        """

        if min_value is not None and value < min_value:
            return False
        if max_value is not None and value > max_value:
            return False
        return True

    return _predicate


def _apply_xbrl_value_filter(
    query_obj: Any,
    min_value: Optional[float],
    max_value: Optional[float],
) -> Any:
    """Apply numeric filters compatibly across different edgartools `by_value` signatures.

    Args:
        query_obj: facts query chain object.
        min_value: optional minimum value.
        max_value: optional maximum value.

    Returns:
        filtered query chain object; the original object when there are no filter conditions.

    Raises:
        AttributeError: raised when the query object lacks `by_value`.
    """

    value_filter = _build_xbrl_value_filter(min_value=min_value, max_value=max_value)
    if value_filter is None:
        return query_obj

    by_value = query_obj.by_value
    try:
        parameter_count = len(inspect.signature(by_value).parameters)
    except (TypeError, ValueError):
        parameter_count = 1

    if parameter_count >= 2:
        return by_value(min_value, max_value)
    return by_value(value_filter)


def _query_facts_rows(
    xbrl: XBRL,
    concepts: list[str],
    statement_type: Optional[str],
    period_end: Optional[str],
    fiscal_year: Optional[int],
    fiscal_period: Optional[str],
    min_value: Optional[float],
    max_value: Optional[float],
) -> list[dict[str, Any]]:
    """Execute an XBRL facts query.

    Args:
        xbrl: XBRL object.
        concepts: concept list.
        statement_type: optional statement type.
        period_end: optional period-end date.
        fiscal_year: optional fiscal year.
        fiscal_period: optional fiscal quarter.
        min_value: optional minimum value.
        max_value: optional maximum value.

    Returns:
        raw facts row list (numeric facts only, matched exactly by concept local name).

    Raises:
        RuntimeError: raised when the query fails.
    """

    rows: list[dict[str, Any]] = []
    seen_keys: set[str] = set()
    normalized_period_end = _normalize_optional_string(period_end)
    normalized_fiscal_period = _normalize_optional_string(fiscal_period)
    for concept in concepts:
        target_local_name = _extract_concept_local_name(concept)
        if not target_local_name:
            continue
        query_obj = xbrl.query().by_concept(concept)
        if statement_type:
            query_obj = query_obj.by_statement_type(statement_type)
        if fiscal_year is not None:
            query_obj = query_obj.by_fiscal_year(fiscal_year)
        if normalized_fiscal_period:
            query_obj = query_obj.by_fiscal_period(normalized_fiscal_period.upper())
        query_obj = _apply_xbrl_value_filter(
            query_obj,
            min_value=min_value,
            max_value=max_value,
        )
        try:
            result_rows = query_obj.execute()
        except Exception:
            continue
        for row in result_rows:
            if not isinstance(row, dict):
                continue
            row_concept = str(row.get("concept") or "")
            if not _matches_concept_exact_local_name(row_concept, target_local_name):
                continue
            if _is_text_block_concept(row_concept):
                continue
            numeric_value = _extract_numeric_fact_value(row)
            if numeric_value is None:
                continue
            row["numeric_value"] = numeric_value
            if normalized_period_end and str(row.get("period_end") or "") != normalized_period_end:
                continue
            dedup_key = _build_fact_dedup_key(row)
            if dedup_key in seen_keys:
                continue
            seen_keys.add(dedup_key)
            rows.append(row)
    return rows


def _build_fact_dedup_key(row: dict[str, Any]) -> str:
    """Build the fact dedupe key.

    Args:
        row: raw fact dict.

    Returns:
        dedupe-key string.

    Raises:
        RuntimeError: raised when construction fails.
    """

    parts = [
        str(row.get("fact_key") or ""),
        str(row.get("concept") or ""),
        str(row.get("period_end") or ""),
        str(row.get("numeric_value") or row.get("value") or ""),
    ]
    return "|".join(parts)


def _normalize_fact_row(row: dict[str, Any]) -> dict[str, Any]:
    """Normalize a single fact's output.

    Args:
        row: raw fact dict.

    Returns:
        normalized fact dict.

    Raises:
        RuntimeError: raised when normalization fails.
    """

    concept = str(row.get("concept") or "")
    label = str(row.get("label") or row.get("original_label") or concept)
    numeric_value = _extract_numeric_fact_value(row)
    raw_text_value = row.get("value")
    text_value = None
    content_type = None
    if numeric_value is None and isinstance(raw_text_value, str):
        text_value = raw_text_value
        content_type = _infer_text_content_type(raw_text_value)
    unit = row.get("unit") or row.get("unit_ref")
    return {
        "concept": concept,
        "label": label,
        "numeric_value": numeric_value,
        "text_value": text_value,
        "content_type": content_type,
        "unit": unit,
        "decimals": row.get("decimals"),
        "period_type": row.get("period_type"),
        "period_start": row.get("period_start"),
        "period_end": row.get("period_end"),
        "fiscal_year": row.get("fiscal_year"),
        "fiscal_period": row.get("fiscal_period"),
        "statement_type": row.get("statement_type"),
    }


def _extract_concept_local_name(concept: str) -> str:
    """Extract the local name of a concept.

    Args:
        concept: raw concept name; supports `namespace:local` or `namespace_local`.

    Returns:
        normalized local name; empty string when it cannot be extracted.

    Raises:
        None.
    """

    stripped = concept.strip()
    if not stripped:
        return ""
    # Convention: in XBRL fact rows, an underscored concept means a library such
    # as edgartools replaced the single namespace separator `:` with `_`, while
    # the local name itself may still contain `_` (common in custom taxonomies).
    # Therefore everything after the first separator is the local name, and a
    # limited split must be used instead of `[-1]`/global replace, otherwise a
    # name like `company_Custom_Metric` would be wrongly truncated to `Metric`.
    if ":" in stripped:
        return stripped.split(":", 1)[1].strip()
    if "_" in stripped:
        return stripped.split("_", 1)[1].strip()
    return stripped


def _normalize_concept_match_key(value: str) -> str:
    """Normalize a concept match key to a comparable format.

    Args:
        value: input concept name or local name.

    Returns:
        normalized key (lowercased, whitespace-stripped); empty string for empty input.

    Raises:
        RuntimeError: None.
    """

    local_name = _extract_concept_local_name(value)
    if not local_name:
        return ""
    return local_name.lower()


def _matches_concept_exact_local_name(row_concept: str, target_concept: str) -> bool:
    """Judge whether a fact's concept exactly matches the target concept's local name.

    Args:
        row_concept: concept in the fact row.
        target_concept: query target concept.

    Returns:
        whether the two local names match exactly.

    Raises:
        RuntimeError: None.
    """

    normalized_row = _normalize_concept_match_key(row_concept)
    normalized_target = _normalize_concept_match_key(target_concept)
    if not normalized_row or not normalized_target:
        return False
    return normalized_row == normalized_target


def _is_text_block_concept(concept: str) -> bool:
    """Judge whether a concept is a TextBlock non-numeric concept.

    Args:
        concept: concept name.

    Returns:
        `True` when the local name ends with `TextBlock`, otherwise `False`.

    Raises:
        RuntimeError: None.
    """

    local_name = _extract_concept_local_name(concept)
    if not local_name:
        return False
    return local_name.lower().endswith("textblock")


def _extract_numeric_fact_value(row: dict[str, Any]) -> Optional[float]:
    """Extract the usable numeric value of a fact.

    Args:
        row: raw XBRL fact row.

    Returns:
        float value when parseable; otherwise `None`.

    Raises:
        RuntimeError: None.
    """

    numeric_value = _to_optional_float(row.get("numeric_value"))
    if numeric_value is not None:
        return numeric_value
    return _to_optional_float(row.get("value"))


def _infer_text_content_type(value: str) -> str:
    """Infer a text value's content type.

    Args:
        value: text value.

    Returns:
        `xhtml` when it looks like an HTML/XHTML fragment, otherwise `plain`.

    Raises:
        RuntimeError: None.
    """

    if re.search(r"<\s*/?\s*[a-zA-Z][^>]*>", value):
        return "xhtml"
    return "plain"


def _infer_units_from_xbrl_query(xbrl: XBRL) -> Optional[str]:
    """Infer the unit from an XBRL query.

    Try the concepts in ``_REVENUE_CONCEPT_CANDIDATES`` in order; on the first
    hit, return that fact's ``unit`` / ``unit_ref``, extending coverage to
    IFRS-aligned filers and legacy naming.

    Args:
        xbrl: XBRL object.

    Returns:
        units string or `None`.

    Raises:
        None.
    """

    for concept in _REVENUE_CONCEPT_CANDIDATES:
        try:
            rows = xbrl.query().by_concept(concept).execute()
        except Exception:
            continue
        for row in rows:
            if not isinstance(row, dict):
                continue
            unit = row.get("unit") or row.get("unit_ref")
            if unit:
                return str(unit).upper()
    return None


def _infer_currency_from_units(units: Optional[str]) -> Optional[str]:
    """Identify an ISO 4217 currency code in a units string.

    Does substring matching within ``_KNOWN_CURRENCY_CODES``; on a hit, returns
    the standard code; otherwise returns ``None``, so that non-monetary units
    such as ``"shares"`` are not passed downstream as currency codes.

    Args:
        units: units string.

    Returns:
        ISO 4217 currency code or ``None``.

    Raises:
        None.
    """

    if not units:
        return None
    upper_units = units.upper()
    for code in _KNOWN_CURRENCY_CODES:
        if code in upper_units:
            return code
    return None


def _infer_scale_from_xbrl_query(xbrl: XBRL) -> Optional[str]:
    """Infer the numeric scale from the decimals attribute of XBRL Revenue facts.

    Try ``_REVENUE_CONCEPT_CANDIDATES`` in order, take the ``decimals`` field of
    the first matching fact, and infer the scale from the mapping table (e.g.
    ``-6`` → ``millions``). In SEC practice all statements within a single filing
    share the same scale, so probing a single concept suffices.

    Args:
        xbrl: XBRL object.

    Returns:
        scale description string or ``None``.

    Raises:
        None.
    """

    for concept in _REVENUE_CONCEPT_CANDIDATES:
        try:
            rows = xbrl.query().by_concept(concept).execute()
        except Exception:
            continue
        for row in rows:
            if not isinstance(row, dict):
                continue
            raw_decimals = row.get("decimals")
            if raw_decimals is None:
                continue
            # parse the decimals value
            if isinstance(raw_decimals, str):
                stripped = raw_decimals.strip().upper()
                if stripped == "INF":
                    return "units"
                try:
                    decimals_int = int(stripped)
                except ValueError:
                    continue
            else:
                try:
                    decimals_int = int(raw_decimals)
                except (TypeError, ValueError):
                    continue
            # consult the mapping table
            exact = _DECIMALS_SCALE_MAP.get(decimals_int)
            if exact is not None:
                return exact
            if decimals_int > 0:
                return "units"
    return None
