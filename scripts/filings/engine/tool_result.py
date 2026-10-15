"""Helpers for the tool-result contract.

This module is the **single source of truth** inside the Engine for tool-result
envelopes, with three responsibilities:

1. **Envelope construction** - build single-level ``ok / value / error`` results.
2. **Envelope interpretation** - uniformly interpret "truly succeeded / failed" semantics.
3. **LLM projection** - project the internal envelope into flat JSON optimal for the LLM.

Internal envelope format (circulates inside the Engine)::

    Success: {"ok": True, "value": <any>, "truncation": {...}|None, "meta": {...}|None}
    Failure: {"ok": False, "error": "<code>", "message": "...", "hint": "...", "meta": {...}|None}

LLM-facing format (output of ``project_for_llm``)::

    Success dict:  {**value, "truncation"?: ..., "tool_calls_remaining"?: N}
    Success text:  {"content": "...", "truncation"?: ..., "tool_calls_remaining"?: N}
    Failure:       {"error": "<code>", "message": "...", "hint": "..."}

Design goals:
- ToolRegistry / Runner / Agent / ToolTrace interpret tool results identically;
- the LLM distinguishes success / failure / truncation with zero nesting and zero redundant fields;
- all envelope logic lives in this module to prevent future drift.
"""

from __future__ import annotations

from typing import Any, Optional, TypeAlias

JsonSafeScalar: TypeAlias = str | int | float | bool | None
JsonSafeValue: TypeAlias = JsonSafeScalar | list["JsonSafeValue"] | dict[str, "JsonSafeValue"]


# ---------------------------------------------------------------------------
# Envelope construction
# ---------------------------------------------------------------------------


def build_success(
    value: Any,
    *,
    truncation: Optional[dict[str, Any]] = None,
    meta: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Build the unified tool-success result envelope.

    Args:
        value: business data returned by the tool (dict / str / list / ...).
        truncation: optional truncation info dict.
        meta: optional metadata dict.

    Returns:
        ``{"ok": True, "value": value, ...}``。
    """
    result: dict[str, Any] = {
        "ok": True,
        "value": value,
    }
    if truncation:
        result["truncation"] = truncation
    if meta:
        result["meta"] = meta
    return result


def build_error(
    code: str,
    message: str,
    *,
    hint: str = "",
    meta: Optional[dict[str, Any]] = None,
    **extra: Any,
) -> dict[str, Any]:
    """Build the unified tool-failure result envelope.

    Args:
        code: error code (an ``ErrorCode`` enum value or an uppercase infrastructure code).
        message: human-readable error description.
        hint: LLM-actionable recovery suggestion (optional).
        meta: optional metadata dict.
        **extra: additional context (e.g. ``retryable``, ``detail``), merged into the top level.

    Returns:
        ``{"ok": False, "error": code, "message": message, ...}``。
    """
    result: dict[str, Any] = {
        "ok": False,
        "error": code,
        "message": message,
    }
    if hint:
        result["hint"] = hint
    if extra:
        result.update(extra)
    if meta:
        result["meta"] = meta
    return result


# ---------------------------------------------------------------------------
# Envelope interpretation
# ---------------------------------------------------------------------------


def validate_tool_result_contract(result: Any) -> Optional[str]:
    """Validate that a tool result matches the Engine's sole legal envelope format.

    Args:
        result: tool result object to validate.

    Returns:
        ``None`` when valid; otherwise an error-description string.
    """
    if not isinstance(result, dict):
        return "tool result must be dict"
    ok = result.get("ok")
    if not isinstance(ok, bool):
        return 'tool result must contain boolean field "ok"'

    meta = result.get("meta")
    if meta is not None and not isinstance(meta, dict):
        return 'tool result field "meta" must be dict'

    truncation = result.get("truncation")
    if truncation is not None and not isinstance(truncation, dict):
        return 'tool result field "truncation" must be dict'

    if ok:
        if "value" not in result:
            return 'successful tool result must contain field "value"'
        return None

    error = result.get("error")
    if not isinstance(error, str) or not error.strip():
        return 'failed tool result must contain non-empty string field "error"'
    message = result.get("message")
    if not isinstance(message, str) or not message.strip():
        return 'failed tool result must contain non-empty string field "message"'
    hint = result.get("hint")
    if hint is not None and not isinstance(hint, str):
        return 'tool result field "hint" must be string'
    return None


# ---------------------------------------------------------------------------
# LLM projection
# ---------------------------------------------------------------------------
