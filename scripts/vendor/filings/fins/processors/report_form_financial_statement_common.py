"""Shared HTML financial-statement semantics for report-class forms.

This module hosts the financial-statement semantic layer for report-class forms
such as `10-K`, `10-Q`, and `20-F`:
- Statement-type classification rules (caption / headers / context_before)
- Row-label semantic fallback rules (row-signal fallback)
- Report-class table-candidate selection order

Boundary constraints:
- This module is not responsible for HTML table structuring and does not parse DataFrames.
- This module holds no `6-K`-specific rules.
- The structuring core continues to be provided by ``html_financial_statement_common``.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from typing import Any, Optional

import pandas as pd

from scripts.vendor.filings.engine.processors.text_utils import (
    normalize_whitespace as _normalize_whitespace,
)

from .html_financial_statement_common import (
    select_html_statement_tables_by_row_signals as _select_html_statement_tables_by_row_signals,
)

REPORT_FORM_SUPPORTED_STATEMENT_TYPES = frozenset(
    {
        "income",
        "balance_sheet",
        "cash_flow",
        "equity",
        "comprehensive_income",
    }
)

REPORT_FORM_HTML_FALLBACK_REASONS = frozenset(
    {
        "xbrl_not_available",
        "statement_method_missing",
        "statement_not_found",
        "statement_empty",
    }
)

_STATEMENT_CLASSIFICATION_CONTEXT_WINDOW = 320
_STATEMENT_CLASSIFICATION_MIN_SCORE = 4
_STATEMENT_CLASSIFICATION_CONTEXT_ONLY_MIN_SCORE = 2
_STATEMENT_CLASSIFICATION_WEIGHTS: dict[str, int] = {
    "caption": 6,
    "headers": 4,
    "context": 1,
}
_STATEMENT_LINE_ITEM_WEIGHT = 2

_NON_STATEMENT_TABLE_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"(?i)\btable\s+of\s+contents\b"),
    re.compile(r"(?i)\bexhibit\s+index\b"),
    re.compile(r"(?i)\bindex\s+to\s+exhibits\b"),
    re.compile(r"(?i)\bsignatures?\b"),
    re.compile(r"(?i)\bnotes?\s+to\s+(?:the\s+)?consolidated\s+financial\s+statements?\b"),
    re.compile(r"(?i)\bnotes?\s+to\s+financial\s+statements?\b"),
    re.compile(r"(?i)\bschedule\s+[ivx0-9]+\b"),
    re.compile(r"(?i)\bselected\s+financial\s+data\b"),
    re.compile(r"(?i)\bquarterly\s+(?:financial|results)\b"),
    re.compile(r"(?i)\bsupplementary\s+data\b"),
    re.compile(r"(?i)\bsecurities\s+registered\s+pursuant\s+to\s+section\s+12\b"),
    re.compile(r"(?i)\btrading\s+symbol(?:s)?\b"),
    re.compile(r"(?i)\bname\s+of\s+each\s+exchange\b"),
)

_STATEMENT_PATTERNS: dict[str, tuple[re.Pattern[str], ...]] = {
    "balance_sheet": (
        re.compile(r"(?i)\bbalance\s+sheets?\b"),
        re.compile(r"(?i)\bstatement(?:s)?\s+of\s+financial\s+position\b"),
        re.compile(r"(?i)\bfinancial\s+position\b"),
        re.compile(
            r"(?i)\bassets?,\s+liabilities?\s+and\s+(?:stockholders'|shareholders'?)\s+equity\b"
        ),
    ),
    "income": (
        re.compile(r"(?i)\bstatement(?:s)?\s+of\s+operations\b"),
        re.compile(r"(?i)\bstatement(?:s)?\s+of\s+income\b"),
        re.compile(r"(?i)\bstatement(?:s)?\s+of\s+earnings\b"),
        re.compile(r"(?i)\bresults\s+of\s+operations\b"),
        re.compile(r"(?i)\bprofit\s+and\s+loss\b"),
    ),
    "cash_flow": (
        re.compile(r"(?i)\bcash\s+flows?\b"),
        re.compile(r"(?i)\bstatement(?:s)?\s+of\s+cash\s+flows?\b"),
    ),
    "equity": (
        re.compile(r"(?i)\bstatement(?:s)?\s+of\s+(?:stockholders'|shareholders'?)\s+equity\b"),
        re.compile(r"(?i)\bstatement(?:s)?\s+of\s+changes\s+in\s+equity\b"),
        re.compile(r"(?i)\bstatement(?:s)?\s+of\s+stockholders'?\s+investment\b"),
    ),
    "comprehensive_income": (
        re.compile(r"(?i)\bstatement(?:s)?\s+of\s+comprehensive\s+income\b"),
        re.compile(r"(?i)\bstatement(?:s)?\s+of\s+comprehensive\s+(?:loss|earnings)\b"),
        re.compile(r"(?i)\bother\s+comprehensive\s+income\b"),
        re.compile(r"(?i)\bcomprehensive\s+income\b"),
    ),
}

_STATEMENT_LINE_ITEM_PATTERNS: dict[str, tuple[re.Pattern[str], ...]] = {
    "balance_sheet": (
        re.compile(r"(?i)\btotal\s+assets?\b"),
        re.compile(r"(?i)\btotal\s+(?:current\s+)?liabilit(?:y|ies)\b"),
        re.compile(r"(?i)\b(?:non[- ]?current|current)\s+assets?\b"),
        re.compile(r"(?i)\b(?:shareholders'?|stockholders'?)\s+equity\b"),
        re.compile(r"(?i)\btotal\s+equity\b"),
    ),
    "income": (
        re.compile(r"(?i)\btotal\s+revenue\b"),
        re.compile(r"(?i)\brevenues?\b"),
        re.compile(r"(?i)\bcost\s+of\s+(?:sales|revenue)\b"),
        re.compile(r"(?i)\bgross\s+profit\b"),
        re.compile(r"(?i)\boperating\s+(?:income|loss|profit)\b"),
        re.compile(r"(?i)\bnet\s+(?:income|loss|earnings|profit)\b"),
        re.compile(r"(?i)\bearnings\s+per\s+share\b"),
    ),
    "cash_flow": (
        re.compile(r"(?i)\boperating\s+activities\b"),
        re.compile(r"(?i)\binvesting\s+activities\b"),
        re.compile(r"(?i)\bfinancing\s+activities\b"),
        re.compile(r"(?i)\bnet\s+cash\s+(?:provided|used)\b"),
        re.compile(r"(?i)\bcash\s+and\s+cash\s+equivalents\b"),
    ),
    "equity": (
        re.compile(r"(?i)\bcommon\s+stock\b"),
        re.compile(r"(?i)\badditional\s+paid[- ]in\s+capital\b"),
        re.compile(r"(?i)\bretained\s+earnings\b"),
        re.compile(r"(?i)\btreasury\s+stock\b"),
        re.compile(r"(?i)\baccumulated\s+other\s+comprehensive\s+(?:income|loss)\b"),
        re.compile(r"(?i)\bdividends?\b"),
    ),
    "comprehensive_income": (
        re.compile(r"(?i)\bnet\s+income\b"),
        re.compile(r"(?i)\bother\s+comprehensive\s+(?:income|loss)\b"),
        re.compile(r"(?i)\bcomprehensive\s+income\b"),
        re.compile(r"(?i)\bforeign\s+currency\s+translation\b"),
        re.compile(r"(?i)\bunrealized\s+(?:gain|loss)\b"),
    ),
}

_ROW_SIGNAL_MIN_HITS_BY_STATEMENT: dict[str, int] = {
    "income": 2,
    "balance_sheet": 2,
    "cash_flow": 2,
    "equity": 2,
    "comprehensive_income": 2,
}
_RELAXED_ROW_SIGNAL_MIN_HITS_BY_STATEMENT: dict[str, int] = {
    "income": 3,
    "balance_sheet": 3,
    "cash_flow": 3,
    "equity": 3,
    "comprehensive_income": 3,
}
_RELAXED_STATEMENT_LINE_ITEM_PATTERNS: dict[str, tuple[re.Pattern[str], ...]] = {
    **_STATEMENT_LINE_ITEM_PATTERNS,
    "balance_sheet": _STATEMENT_LINE_ITEM_PATTERNS["balance_sheet"]
    + (
        re.compile(r"(?i)\bcash\s+and\s+cash\s+equivalents\b"),
        re.compile(r"(?i)\brestricted\s+cash\b"),
        re.compile(r"(?i)\bborrowings?\b"),
        re.compile(r"(?i)\bnet\s+debt\b"),
    ),
}


def should_apply_report_statement_html_fallback(reason: Optional[str]) -> bool:
    """Judge whether the report-class HTML fallback should trigger.

    Args:
        reason: failure reason returned by the current XBRL path.

    Returns:
        ``True`` when a fallback-allowed reason is hit.

    Raises:
        RuntimeError: raised when the judgment fails.
    """

    normalized_reason = str(reason or "").strip().lower()
    return normalized_reason in REPORT_FORM_HTML_FALLBACK_REASONS


def classify_report_statement_type_for_table(
    *,
    caption: Optional[str],
    headers: Optional[list[str]],
    context_before: str,
) -> Optional[str]:
    """Classify which financial statement a report-class table belongs to.

    Args:
        caption: table caption.
        headers: table header list.
        context_before: text immediately before the table.

    Returns:
        normalized statement type; ``None`` when undeterminable.

    Raises:
        RuntimeError: raised when the judgment fails.
    """

    caption_text = _normalize_report_statement_text(str(caption or ""))
    headers_text = _normalize_report_statement_text(
        " ".join(str(item or "") for item in (headers or []))
    )
    context_text = _normalize_report_statement_text(
        str(context_before or "")[-_STATEMENT_CLASSIFICATION_CONTEXT_WINDOW:]
    )
    if not caption_text and not headers_text and not context_text:
        return None
    if _looks_like_non_statement_table(
        caption_text=caption_text,
        headers_text=headers_text,
    ):
        return None

    scores = {
        statement_type: _score_statement_type(
            statement_type=statement_type,
            statement_patterns=patterns,
            caption_text=caption_text,
            headers_text=headers_text,
            context_text=context_text,
        )
        for statement_type, patterns in _STATEMENT_PATTERNS.items()
    }
    if not scores:
        return None

    winner, winner_score = max(scores.items(), key=lambda item: item[1])
    if winner_score < _STATEMENT_CLASSIFICATION_MIN_SCORE:
        if winner_score < _STATEMENT_CLASSIFICATION_CONTEXT_ONLY_MIN_SCORE:
            return None
        if _has_caption_or_header_signal(
            statement_patterns=_STATEMENT_PATTERNS[winner],
            caption_text=caption_text,
            headers_text=headers_text,
        ):
            return winner
        return None

    runner_up_score = max(
        (score for statement_type, score in scores.items() if statement_type != winner),
        default=0,
    )
    if winner_score == runner_up_score:
        return None
    return winner


def select_report_statement_tables(
    *,
    statement_type: str,
    tables: list[Any],
    parse_table_dataframe: Callable[[Any], Optional[pd.DataFrame]],
) -> list[Any]:
    """Select financial-statement candidate tables by report-class rules.

    Selection order:
    1. Exclude layout tables first;
    2. Prefer caption/header/context classification among tables with `is_financial=True`;
    3. If none hit, widen to all non-layout tables for the row-signal fallback.

    Args:
        statement_type: target statement type.
        tables: raw table list.
        parse_table_dataframe: function parsing a table object into a DataFrame.

    Returns:
        candidate table list.

    Raises:
        RuntimeError: raised when the selection fails.
    """

    normalized_statement_type = str(statement_type or "").strip().lower()
    if normalized_statement_type not in REPORT_FORM_SUPPORTED_STATEMENT_TYPES:
        return []

    non_layout_tables = [
        table
        for table in tables
        if str(getattr(table, "table_type", "") or "").strip().lower() != "layout"
    ]
    if not non_layout_tables:
        return []

    financial_tables = [
        table for table in non_layout_tables if bool(getattr(table, "is_financial", False))
    ]
    classified_tables = [
        table
        for table in financial_tables
        if classify_report_statement_type_for_table(
            caption=getattr(table, "caption", None),
            headers=getattr(table, "headers", None),
            context_before=str(getattr(table, "context_before", "") or ""),
        )
        == normalized_statement_type
    ]
    if classified_tables:
        return classified_tables

    row_signal_tables = _select_html_statement_tables_by_row_signals(
        tables=non_layout_tables,
        line_item_patterns=_STATEMENT_LINE_ITEM_PATTERNS.get(normalized_statement_type, ()),
        min_hits=_ROW_SIGNAL_MIN_HITS_BY_STATEMENT.get(normalized_statement_type, 1),
        parse_table_dataframe=parse_table_dataframe,
    )
    if row_signal_tables:
        return row_signal_tables

    return _select_report_statement_tables_by_relaxed_row_signals(
        statement_type=normalized_statement_type,
        tables=non_layout_tables,
        parse_table_dataframe=parse_table_dataframe,
    )


def _select_report_statement_tables_by_relaxed_row_signals(
    *,
    statement_type: str,
    tables: list[Any],
    parse_table_dataframe: Callable[[Any], Optional[pd.DataFrame]],
) -> list[Any]:
    """Supplement candidate statement-table filtering with lenient row-label semantic signals.

    When neither the standard caption/header classification nor the strict
    row-signal hits, some 20-F/annual-report exhibits may still contain
    structurable statement tables — just with non-standard titles and row labels
    leaning toward transaction descriptions or combination statements. Here the
    same HTML structuring entry point is reused, but the row-label vocabulary is
    relaxed and the minimum-hit threshold is raised, to support the no-XBRL HTML
    fallback while avoiding sweeping ordinary notes tables in by mistake.

    Args:
        statement_type: target statement type.
        tables: non-layout table list.
        parse_table_dataframe: function parsing a table object into a DataFrame.

    Returns:
        candidate table list selected by the lenient rules.

    Raises:
        RuntimeError: raised when the selection fails.
    """

    return _select_html_statement_tables_by_row_signals(
        tables=tables,
        line_item_patterns=_RELAXED_STATEMENT_LINE_ITEM_PATTERNS.get(statement_type, ()),
        min_hits=_RELAXED_ROW_SIGNAL_MIN_HITS_BY_STATEMENT.get(statement_type, 3),
        parse_table_dataframe=parse_table_dataframe,
    )


def _normalize_report_statement_text(value: str) -> str:
    """Normalize statement-classification text.

    Args:
        value: raw text.

    Returns:
        text with unified case and whitespace.

    Raises:
        RuntimeError: raised when the normalization fails.
    """

    return _normalize_whitespace(value).lower()


def _looks_like_non_statement_table(
    *,
    caption_text: str,
    headers_text: str,
) -> bool:
    """Judge whether a table is ToC, notes, or cover noise.

    Args:
        caption_text: normalized caption text.
        headers_text: normalized headers text.

    Returns:
        ``True`` when a noise pattern hits without statement signals.

    Raises:
        RuntimeError: raised when the judgment fails.
    """

    caption_or_header = f"{caption_text} {headers_text}".strip()
    if not caption_or_header:
        return False
    caption_has_noise = any(
        pattern.search(caption_text) for pattern in _NON_STATEMENT_TABLE_PATTERNS
    )
    if caption_has_noise:
        caption_has_statement_signal = any(
            _has_caption_or_header_signal(
                statement_patterns=patterns,
                caption_text=caption_text,
                headers_text="",
            )
            for patterns in _STATEMENT_PATTERNS.values()
        )
        if not caption_has_statement_signal:
            return True

    has_noise_pattern = any(
        pattern.search(caption_or_header) for pattern in _NON_STATEMENT_TABLE_PATTERNS
    )
    if not has_noise_pattern:
        return False
    has_statement_signal = any(
        _has_caption_or_header_signal(
            statement_patterns=patterns,
            caption_text=caption_text,
            headers_text=headers_text,
        )
        for patterns in _STATEMENT_PATTERNS.values()
    )
    return not has_statement_signal


def _score_statement_type(
    *,
    statement_type: str,
    statement_patterns: tuple[re.Pattern[str], ...],
    caption_text: str,
    headers_text: str,
    context_text: str,
) -> int:
    """Compute the match score for a statement type.

    Args:
        statement_type: statement type.
        statement_patterns: keyword regexes for this statement type.
        caption_text: normalized caption text.
        headers_text: normalized headers text.
        context_text: normalized context text.

    Returns:
        match score.

    Raises:
        RuntimeError: raised when the computation fails.
    """

    caption_hits = _count_pattern_hits(statement_patterns=statement_patterns, text=caption_text)
    header_hits = _count_pattern_hits(statement_patterns=statement_patterns, text=headers_text)
    context_hits = _count_pattern_hits(statement_patterns=statement_patterns, text=context_text)
    line_item_hits = _count_pattern_hits(
        statement_patterns=_STATEMENT_LINE_ITEM_PATTERNS.get(statement_type, ()),
        text=headers_text,
    )
    return (
        caption_hits * _STATEMENT_CLASSIFICATION_WEIGHTS["caption"]
        + header_hits * _STATEMENT_CLASSIFICATION_WEIGHTS["headers"]
        + context_hits * _STATEMENT_CLASSIFICATION_WEIGHTS["context"]
        + line_item_hits * _STATEMENT_LINE_ITEM_WEIGHT
    )


def _count_pattern_hits(
    *,
    statement_patterns: tuple[re.Pattern[str], ...],
    text: str,
) -> int:
    """Count how many patterns hit in the text.

    Args:
        statement_patterns: target pattern set.
        text: text to match.

    Returns:
        number of matched patterns.

    Raises:
        RuntimeError: raised when the counting fails.
    """

    if not text:
        return 0
    return sum(1 for pattern in statement_patterns if pattern.search(text))


def _has_caption_or_header_signal(
    *,
    statement_patterns: tuple[re.Pattern[str], ...],
    caption_text: str,
    headers_text: str,
) -> bool:
    """Judge whether caption/headers contain statement-type signals.

    Args:
        statement_patterns: target pattern set.
        caption_text: normalized caption text.
        headers_text: normalized headers text.

    Returns:
        ``True`` when either pattern hits.

    Raises:
        RuntimeError: raised when the judgment fails.
    """

    return any(
        pattern.search(caption_text) or pattern.search(headers_text)
        for pattern in statement_patterns
    )


__all__ = [
    "REPORT_FORM_HTML_FALLBACK_REASONS",
    "REPORT_FORM_SUPPORTED_STATEMENT_TYPES",
    "classify_report_statement_type_for_table",
    "select_report_statement_tables",
    "should_apply_report_statement_html_fallback",
]
