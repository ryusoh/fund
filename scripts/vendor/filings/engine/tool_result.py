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

import base64
import json
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


def is_tool_success(result: Any) -> bool:
    """Judge whether a tool result is truly successful under unified semantics.

    Rule: ``result.get("ok") is True`` means success.

    Args:
        result: tool result object.

    Returns:
        success boolean under unified semantics.
    """
    if not isinstance(result, dict):
        return False
    if result.get("ok") is not True:
        return False
    return "value" in result


def get_error_code(result: Any) -> Optional[str]:
    """Extract the error code.

    Args:
        result: tool result object.

    Returns:
        ``result["error"]`` string; ``None`` for a successful result.
    """
    if not isinstance(result, dict):
        return None
    if result.get("ok") is not False:
        return None
    code = result.get("error")
    if isinstance(code, str) and code.strip():
        return code.strip()
    return None


def get_error_message(result: Any) -> Optional[str]:
    """Extract the error message.

    Args:
        result: tool result object.

    Returns:
        ``result["message"]`` string; ``None`` for a successful result.
    """
    if not isinstance(result, dict):
        return None
    if result.get("ok") is not False:
        return None
    message = result.get("message")
    if isinstance(message, str) and message.strip():
        return message.strip()
    return None


def get_value(result: object) -> object | None:
    """Extract the business data of a successful result.

    Args:
        result: tool result object.

    Returns:
        ``result["value"]``; ``None`` for a failed or invalid result.
    """
    if not isinstance(result, dict):
        return None
    if result.get("ok") is not True or "value" not in result:
        return None
    return result.get("value")


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

_LLM_TRUNCATION_KEYS = ("next_action", "fetch_more_args")


def _encode_binary_value(value: bytes | bytearray) -> dict[str, Any]:
    """Encode a binary value into an LLM-consumable base64 structure."""
    return {
        "content_base64": base64.b64encode(bytes(value)).decode("ascii"),
        "content_encoding": "base64",
    }


def _sort_set_items(value: set[Any]) -> list[Any]:
    """Stably sort a set so projection output is deterministic."""
    normalized = [_make_json_safe(item) for item in value]
    return sorted(
        normalized,
        key=lambda item: json.dumps(item, ensure_ascii=False, sort_keys=True, default=str),
    )


def _make_json_safe(value: object) -> JsonSafeValue:
    """Recursively convert an arbitrary value into a JSON-safe structure.

    Args:
        value: raw value.

    Returns:
        safe structure composed only of JSON scalars, lists, and objects.

    Raises:
        None.
    """

    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (bytes, bytearray)):
        return _encode_binary_value(value)
    if isinstance(value, tuple):
        return [_make_json_safe(item) for item in value]
    if isinstance(value, list):
        return [_make_json_safe(item) for item in value]
    if isinstance(value, set):
        return _sort_set_items(value)
    if isinstance(value, dict):
        normalized: dict[str, JsonSafeValue] = {}
        for key, item in value.items():
            normalized[str(key)] = _make_json_safe(item)
        return normalized
    return str(value)


def project_for_llm(
    result: dict[str, Any],
    *,
    budget: Optional[int] = None,
) -> dict[str, Any]:
    """Project the internal envelope into a flat JSON optimal for the LLM.

    Projection rules:

    1. ``ok=False`` -> ``{"error": code, "message": msg, "hint": hint}``
    2. ``ok=True, value is dict`` -> ``{**value}``
    3. ``ok=True, value is non-dict`` -> ``{"content": value}``
    4. With truncation -> append ``{"truncation": {"next_action": ..., "fetch_more_args": ...}}``
    5. budget not None -> append ``{"tool_calls_remaining": budget}``

    Args:
        result: internal envelope dict.
        budget: remaining tool-call rounds (optional).

    Returns:
        flattened LLM-facing dict.
    """
    if contract_error := validate_tool_result_contract(result):
        proj: dict[str, Any] = {
            "error": "invalid_result",
            "message": contract_error,
        }
        if budget is not None:
            proj["tool_calls_remaining"] = budget
        return proj

    if result.get("ok") is not True:
        # error projection
        proj: dict[str, Any] = {"error": result.get("error", "UNKNOWN")}
        if msg := result.get("message"):
            proj["message"] = msg
        if hint := result.get("hint"):
            proj["hint"] = hint
        if budget is not None:
            proj["tool_calls_remaining"] = budget
        return proj

    # success projection
    value = result.get("value")
    if isinstance(value, dict):
        safe_value = _make_json_safe(value)
        if isinstance(safe_value, dict):
            proj = safe_value
        else:
            proj = {"content": safe_value}
    elif isinstance(value, (bytes, bytearray)):
        proj = _encode_binary_value(value)
    else:
        proj = {"content": _make_json_safe(value)}

    # truncation projection: keep only fields actionable by the LLM
    truncation = result.get("truncation")
    if isinstance(truncation, dict):
        llm_trunc = {k: truncation[k] for k in _LLM_TRUNCATION_KEYS if k in truncation}
        if llm_trunc:
            proj["truncation"] = llm_trunc

    if budget is not None:
        proj["tool_calls_remaining"] = budget
    return proj
