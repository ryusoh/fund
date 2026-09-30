"""
Truncation manager — tool-result truncation and cursor-paginated continuation reads

Split out from ToolRegistry, encapsulating all result-truncation and pagination logic:
- Truncate by policy (text_chars / text_lines / list_items / binary_bytes)
- Cursor storage and expiry cleanup
- fetch_more continuation execution
"""

import copy
import hashlib
import json
import time
import uuid
from threading import RLock
from typing import Any, Dict, List, Optional

from scripts.vendor.filings.contracts.protocols import ToolExecutionContext

from .tool_contracts import TRUNCATION_STRATEGIES, ToolTruncateSpec
from .tool_result import build_error, build_success

MODULE = "ENGINE.TRUNCATION_MANAGER"

# Cursor default TTL 300 seconds (5 minutes) — aligned with the OpenAI API request timeout limit,
# ensuring the cursor stays valid within the same tool-call chain round and is cleaned up after expiry to avoid memory leaks.
_CURSOR_TTL_FALLBACK_SEC = 300.0
_CONTINUATION_ACTION_FETCH_MORE = "fetch_more"
_CONTINUATION_PRIORITY_HIGH = "high"
_SCOPE_MISMATCH_ERROR = {"code": "cursor_scope_mismatch", "message": "cursor scope mismatch"}
TruncationContext = ToolExecutionContext | None


class TruncationManager:
    """Tool result truncation and cursor-paginated continuation manager.

    Manages truncation-policy execution and cursor lifecycle, supporting four
    truncation policies: text_chars / text_lines / list_items / binary_bytes.

    Cursors are stored in memory and expire automatically via TTL. The default TTL
    is 300 seconds; if the execution context provides a timeout, the timeout wins.
    Internally a reentrant lock guards cursor reads/writes, keeping cursor state
    consistent under concurrent tool calls.
    """

    def __init__(self) -> None:
        self._cursor_store: Dict[str, Dict[str, Any]] = {}
        self._lock = RLock()

    def clear_cursors(self) -> None:
        """Clear all cursors, releasing associated data references.

        call before a new run starts, so stale cursors from the previous run do not occupy memory.
        """
        with self._lock:
            self._cursor_store.clear()

    # ------------------------------------------------------------------
    # Public entry points
    # ------------------------------------------------------------------

    def apply_truncation(
        self,
        name: str,
        arguments: Dict[str, Any],
        value: Any,
        context: TruncationContext,
        truncate_spec: Optional[ToolTruncateSpec],
    ) -> tuple[Any, Optional[Dict[str, Any]]]:
        """Truncate the raw tool return value per the schema-driven truncation policy.

        Args:
            name: tool name (used for scope-hash computation).
            arguments: tool arguments (used for scope-hash computation).
            value: raw tool return value.
            context: execution context.
            truncate_spec: truncation spec (from the tool schema).

        Returns:
            ``(value_or_truncated, truncation_info_or_none)``
        """
        if not truncate_spec or not truncate_spec.enabled:
            return value, None

        strategy = truncate_spec.strategy
        limits = truncate_spec.limits or {}
        if strategy not in TRUNCATION_STRATEGIES:
            return value, None

        limit_key = TRUNCATION_STRATEGIES[strategy]["limit_key"]
        limit = limits.get(limit_key)
        if not isinstance(limit, int) or limit <= 0:
            return value, None

        scope_hash = self._build_scope_hash(name, arguments)

        target_field = truncate_spec.target_field

        if strategy in ("text_chars", "text_lines"):
            text, template, field_path = self._extract_text_target(value, target_field)
            if text is None:
                return value, None
            if strategy == "text_chars":
                output_value, truncation = self._truncate_text_chars(
                    text=text,
                    limit=limit,
                    template=template,
                    field_path=field_path,
                    context=context,
                    scope_hash=scope_hash,
                )
            else:
                output_value, truncation = self._truncate_text_lines(
                    text=text,
                    limit=limit,
                    template=template,
                    field_path=field_path,
                    context=context,
                    scope_hash=scope_hash,
                )
            if truncation:
                return output_value, truncation
            return value, None

        if strategy == "list_items":
            items, template, field_path = self._extract_list_target(value, target_field)
            if items is None:
                return value, None
            output_value, truncation = self._truncate_list_items(
                items=items,
                limit=limit,
                template=template,
                field_path=field_path,
                context=context,
                scope_hash=scope_hash,
            )
            if truncation:
                # apply tool-level continuation overrides (e.g. list_tables discourages fetch_more)
                if truncate_spec.continuation_hint:
                    truncation.update(truncate_spec.continuation_hint)
                return output_value, truncation
            return value, None

        if strategy == "binary_bytes":
            data, template, field_path = self._extract_binary_target(value)
            if data is None:
                return value, None
            output_value, truncation = self._truncate_binary_bytes(
                data=data,
                limit=limit,
                template=template,
                field_path=field_path,
                context=context,
                scope_hash=scope_hash,
            )
            if truncation:
                return output_value, truncation
            return value, None

        return value, None

    def execute_fetch_more(
        self,
        arguments: Dict[str, Any],
        context: TruncationContext,
    ) -> Dict[str, Any]:
        """Execute a fetch_more continuation.

        Args:
            arguments: arguments containing ``cursor``, ``scope_token``, and an optional ``limit``.
            context: execution context (used for scope validation).

        Returns:
            normalized tool result dict.
        """
        with self._lock:
            cursor = arguments.get("cursor")
            if not isinstance(cursor, str) or not cursor:
                return build_error("invalid_cursor", "cursor is required")
            record = self._cursor_store.get(cursor)
            if not record:
                return build_error("cursor_not_found", "cursor not found")
            now = time.monotonic()
            if record.get("expires_at", 0) <= now:
                self._cursor_store.pop(cursor, None)
                return build_error("cursor_expired", "cursor expired")
            scope_error = self._validate_cursor_context(record, context)
            if scope_error:
                return build_error(
                    str(scope_error.get("code") or "cursor_scope_mismatch"),
                    str(scope_error.get("message") or "cursor scope mismatch"),
                )
            scope_token_error = self._validate_scope_token(record, arguments)
            if scope_token_error:
                return build_error(
                    str(scope_token_error.get("code") or "cursor_scope_mismatch"),
                    str(scope_token_error.get("message") or "cursor scope mismatch"),
                )

            limit = self._resolve_fetch_limit(arguments.get("limit"), record["limit"])
            chunk, chunk_size = self._build_chunk(
                mode=record["mode"],
                data=record["data"],
                offset=record["offset"],
                limit=limit,
            )
            output_value = self._apply_chunk_to_template(
                record["template"],
                record["field_path"],
                chunk,
            )
            self._postprocess_truncated_value(
                record["tool_name"],
                record["field_path"],
                output_value,
                chunk,
                length_field=record.get("length_field"),
            )
            new_offset = record["offset"] + chunk_size
            if chunk_size <= 0:
                self._cursor_store.pop(cursor, None)
                return build_success(value=output_value)

            has_more = new_offset < record["total"]
            if has_more:
                # single-use semantics: the old cursor is invalidated and a new cursor is created as the next page's credential
                self._cursor_store.pop(cursor, None)
                new_cursor = self._store_cursor(
                    tool_name=record["tool_name"],
                    scope_hash=record["scope_hash"],
                    reason=record["reason"],
                    unit=record["unit"],
                    limit=record["limit"],
                    total=record["total"],
                    data=record["data"],
                    offset=new_offset,
                    template=record["template"],
                    field_path=record["field_path"],
                    mode=record["mode"],
                    context=ToolExecutionContext(
                        run_id=str(record.get("run_id") or "").strip() or None,
                        iteration_id=str(record.get("iteration_id") or "").strip() or None,
                        tool_call_id=str(record.get("tool_call_id") or "").strip() or None,
                        timeout_seconds=max(
                            record.get("expires_at", 0) - record.get("created_at", 0),
                            _CURSOR_TTL_FALLBACK_SEC,
                        ),
                    ),
                    length_field=record.get("length_field"),
                )
                truncation = self._build_truncation_info(
                    cursor=new_cursor,
                    reason=record["reason"],
                    limit=record["limit"],
                    unit=record["unit"],
                    total=record["total"],
                    has_more=True,
                    scope_token=self._cursor_store[new_cursor].get("scope_token"),
                )
                return build_success(value=output_value, truncation=truncation)

            self._cursor_store.pop(cursor, None)
            return build_success(value=output_value)

    # ------------------------------------------------------------------
    # Target extraction
    # ------------------------------------------------------------------

    def _extract_text_target(
        self,
        value: Any,
        target_field: Optional[str] = None,
    ) -> tuple[Optional[str], Optional[Dict[str, Any]], Optional[List[str]]]:
        """Extract the text truncation target from the raw tool return value.

        Args:
            value: raw tool return value.
            target_field: explicitly specified truncation target field; falls back to heuristic selection when None.

        Returns:
            ``(text, template, field_path)``
        """
        if isinstance(value, str):
            return value, None, None

        if isinstance(value, dict):
            field = (
                target_field
                if target_field and target_field in value
                else self._select_largest_text_field(value)
            )
            if not field:
                return None, None, None
            text = value.get(field)
            if not isinstance(text, str):
                return None, None, None
            template = copy.deepcopy(value)
            template[field] = None
            return text, template, [field]

        return None, None, None

    def _extract_list_target(
        self,
        value: Any,
        target_field: Optional[str] = None,
    ) -> tuple[Optional[List[Any]], Optional[Dict[str, Any]], Optional[List[str]]]:
        """Extract the list truncation target from the raw tool return value.

        Args:
            value: raw tool return value.
            target_field: explicitly specified truncation target field; falls back to heuristic selection when None.
        """
        if isinstance(value, list):
            return value, None, None
        if isinstance(value, dict):
            # when target_field is explicitly specified and hits, use the single-level path directly
            if target_field and target_field in value and isinstance(value[target_field], list):
                field_path: Optional[List[str]] = [target_field]
            else:
                field_path = self._select_largest_list_path(value)
            if not field_path:
                return None, None, None
            items = self._read_nested_dict_value(value, field_path)
            if not isinstance(items, list):
                return None, None, None
            template = copy.deepcopy(value)
            if not self._write_nested_dict_value(template, field_path, None):
                return None, None, None
            return items, template, field_path
        return None, None, None

    def _extract_binary_target(
        self,
        value: Any,
    ) -> tuple[Optional[bytes], Optional[Dict[str, Any]], Optional[List[str]]]:
        """Extract the binary truncation target from the raw tool return value."""
        if isinstance(value, (bytes, bytearray)):
            return bytes(value), None, None
        return None, None, None

    # ------------------------------------------------------------------
    # Field selection
    # ------------------------------------------------------------------

    def _select_largest_text_field(self, value: Dict[str, Any]) -> Optional[str]:
        """Select the longest string field in a dict."""
        candidates = [(key, val) for key, val in value.items() if isinstance(val, str)]
        if not candidates:
            return None
        return max(candidates, key=lambda item: len(item[1]))[0]

    def _select_largest_list_path(self, value: Dict[str, Any]) -> Optional[List[str]]:
        """Select the path of the largest list field in a dict (supports nesting).

        iteratively DFS the dict tree to find the path holding the list with the most elements.
        """
        best_path: Optional[List[str]] = None
        best_size = -1
        # stack element: (current node, current path)
        stack: List[tuple[Any, List[str]]] = [(value, [])]
        while stack:
            node, path = stack.pop()
            if isinstance(node, list):
                if len(node) > best_size:
                    best_size = len(node)
                    best_path = path
                continue
            if not isinstance(node, dict):
                continue
            for key, child in node.items():
                if isinstance(key, str):
                    stack.append((child, path + [key]))
        return best_path if best_path else None

    def _read_nested_dict_value(self, value: Dict[str, Any], field_path: List[str]) -> Any:
        """Read a value from a nested dict by key path."""
        target: Any = value
        for key in field_path:
            if not isinstance(target, dict):
                return None
            target = target.get(key)
        return target

    def _write_nested_dict_value(
        self, value: Dict[str, Any], field_path: List[str], data: Any
    ) -> bool:
        """Write a value into a nested dict by key path."""
        if not field_path:
            return False
        target: Any = value
        for key in field_path[:-1]:
            if not isinstance(target, dict):
                return False
            target = target.get(key)
        if not isinstance(target, dict):
            return False
        target[field_path[-1]] = data
        return True

    # ------------------------------------------------------------------
    # Truncation implementation
    # ------------------------------------------------------------------

    def _truncate_text_chars(
        self,
        *,
        text: str,
        limit: int,
        template: Optional[Dict[str, Any]],
        field_path: Optional[List[str]],
        context: TruncationContext,
        scope_hash: str,
    ) -> tuple[Any, Optional[Dict[str, Any]]]:
        """Truncate text by character count."""
        total = len(text)
        if total <= limit:
            return text, None
        chunk = text[:limit]
        output_value = self._apply_chunk_to_template(template, field_path, chunk)
        cursor = self._store_cursor(
            tool_name="text",
            scope_hash=scope_hash,
            reason=TRUNCATION_STRATEGIES["text_chars"]["reason"],
            unit=TRUNCATION_STRATEGIES["text_chars"]["unit"],
            limit=limit,
            total=total,
            data=text,
            offset=len(chunk),
            template=template,
            field_path=field_path,
            mode="text",
            context=context,
        )
        truncation = self._build_truncation_info(
            cursor=cursor,
            reason=TRUNCATION_STRATEGIES["text_chars"]["reason"],
            limit=limit,
            unit=TRUNCATION_STRATEGIES["text_chars"]["unit"],
            total=total,
            has_more=True,
            scope_token=self._cursor_store.get(cursor, {}).get("scope_token"),
        )
        return output_value, truncation

    def _truncate_text_lines(
        self,
        *,
        text: str,
        limit: int,
        template: Optional[Dict[str, Any]],
        field_path: Optional[List[str]],
        context: TruncationContext,
        scope_hash: str,
    ) -> tuple[Any, Optional[Dict[str, Any]]]:
        """Truncate text by line count."""
        lines = text.splitlines(keepends=True)
        total = len(lines)
        if total <= limit:
            return text, None
        chunk_lines = lines[:limit]
        chunk = "".join(chunk_lines)
        output_value = self._apply_chunk_to_template(template, field_path, chunk)
        cursor = self._store_cursor(
            tool_name="text_lines",
            scope_hash=scope_hash,
            reason=TRUNCATION_STRATEGIES["text_lines"]["reason"],
            unit=TRUNCATION_STRATEGIES["text_lines"]["unit"],
            limit=limit,
            total=total,
            data=lines,
            offset=len(chunk_lines),
            template=template,
            field_path=field_path,
            mode="text_lines",
            context=context,
        )
        truncation = self._build_truncation_info(
            cursor=cursor,
            reason=TRUNCATION_STRATEGIES["text_lines"]["reason"],
            limit=limit,
            unit=TRUNCATION_STRATEGIES["text_lines"]["unit"],
            total=total,
            has_more=True,
            scope_token=self._cursor_store.get(cursor, {}).get("scope_token"),
        )
        return output_value, truncation

    def _truncate_list_items(
        self,
        *,
        items: List[Any],
        limit: int,
        template: Optional[Dict[str, Any]],
        field_path: Optional[List[str]],
        context: TruncationContext,
        scope_hash: str,
    ) -> tuple[Any, Optional[Dict[str, Any]]]:
        """Truncate a list by item count."""
        total = len(items)
        if total <= limit:
            return items, None
        chunk = items[:limit]
        output_value = self._apply_chunk_to_template(template, field_path, chunk)
        cursor = self._store_cursor(
            tool_name="list",
            scope_hash=scope_hash,
            reason=TRUNCATION_STRATEGIES["list_items"]["reason"],
            unit=TRUNCATION_STRATEGIES["list_items"]["unit"],
            limit=limit,
            total=total,
            data=items,
            offset=len(chunk),
            template=template,
            field_path=field_path,
            mode="list",
            context=context,
        )
        truncation = self._build_truncation_info(
            cursor=cursor,
            reason=TRUNCATION_STRATEGIES["list_items"]["reason"],
            limit=limit,
            unit=TRUNCATION_STRATEGIES["list_items"]["unit"],
            total=total,
            has_more=True,
            scope_token=self._cursor_store.get(cursor, {}).get("scope_token"),
        )
        return output_value, truncation

    def _truncate_binary_bytes(
        self,
        *,
        data: bytes,
        limit: int,
        template: Optional[Dict[str, Any]],
        field_path: Optional[List[str]],
        context: TruncationContext,
        scope_hash: str,
    ) -> tuple[Any, Optional[Dict[str, Any]]]:
        """Truncate binary data by byte count."""
        total = len(data)
        if total <= limit:
            return data, None
        chunk = data[:limit]
        output_value = self._apply_chunk_to_template(template, field_path, chunk)
        cursor = self._store_cursor(
            tool_name="binary",
            scope_hash=scope_hash,
            reason=TRUNCATION_STRATEGIES["binary_bytes"]["reason"],
            unit=TRUNCATION_STRATEGIES["binary_bytes"]["unit"],
            limit=limit,
            total=total,
            data=data,
            offset=len(chunk),
            template=template,
            field_path=field_path,
            mode="binary",
            context=context,
        )
        truncation = self._build_truncation_info(
            cursor=cursor,
            reason=TRUNCATION_STRATEGIES["binary_bytes"]["reason"],
            limit=limit,
            unit=TRUNCATION_STRATEGIES["binary_bytes"]["unit"],
            total=total,
            has_more=True,
            scope_token=self._cursor_store.get(cursor, {}).get("scope_token"),
        )
        return output_value, truncation

    # ------------------------------------------------------------------
    # Template and post-processing
    # ------------------------------------------------------------------

    def _apply_chunk_to_template(
        self,
        template: Optional[Dict[str, Any]],
        field_path: Optional[List[str]],
        chunk: Any,
    ) -> Any:
        """Fill truncated data chunks into the template's corresponding fields."""
        if template is None or field_path is None:
            return chunk
        value = copy.deepcopy(template)
        target = value
        for key in field_path[:-1]:
            if not isinstance(target, dict):
                return value
            target = target.get(key)
        if isinstance(target, dict):
            target[field_path[-1]] = chunk
        return value

    def _postprocess_truncated_value(
        self,
        tool_name: str,
        field_path: Optional[List[str]],
        value: Any,
        chunk: Any,
        *,
        length_field: Optional[str] = None,
    ) -> None:
        """Post-truncation hook (currently a no-op)."""
        return

    # ------------------------------------------------------------------
    # Scope hash and cursor management
    # ------------------------------------------------------------------

    def _build_scope_hash(self, name: str, arguments: Dict[str, Any]) -> str:
        """Generate a deterministic SHA-256 hash for (tool name, arguments)."""
        try:
            payload = {"tool": name, "arguments": arguments}
            encoded = json.dumps(payload, sort_keys=True, ensure_ascii=True, default=str)
        except (TypeError, ValueError):
            encoded = f"{name}:{repr(arguments)}"
        return hashlib.sha256(encoded.encode("utf-8")).hexdigest()

    def _store_cursor(
        self,
        *,
        tool_name: str,
        scope_hash: str,
        reason: str,
        unit: str,
        limit: int,
        total: int,
        data: Any,
        offset: int,
        template: Optional[Dict[str, Any]],
        field_path: Optional[List[str]],
        mode: str,
        context: TruncationContext,
        length_field: Optional[str] = None,
    ) -> str:
        """Create a cursor and store it in the cursor store.

        Returns:
            unique identifier of the new cursor.
        """
        with self._lock:
            now = time.monotonic()
            ttl = _CURSOR_TTL_FALLBACK_SEC
            if context:
                timeout_seconds = context.timeout_seconds
                if isinstance(timeout_seconds, (int, float)) and timeout_seconds > 0:
                    ttl = float(timeout_seconds)
            cursor = uuid.uuid4().hex
            self._cleanup_expired_cursors(now)
            self._cursor_store[cursor] = {
                "tool_name": tool_name,
                "scope_hash": scope_hash,
                "reason": reason,
                "unit": unit,
                "limit": limit,
                "total": total,
                "data": data,
                "offset": offset,
                "template": template,
                "field_path": field_path,
                "mode": mode,
                "length_field": length_field,
                "created_at": now,
                "expires_at": now + ttl,
                "run_id": context.run_id if context else None,
                "iteration_id": context.iteration_id if context else None,
                "tool_call_id": context.tool_call_id if context else None,
            }
            self._cursor_store[cursor]["scope_token"] = self._build_scope_token(
                cursor=cursor,
                record=self._cursor_store[cursor],
            )
            return cursor

    def _cleanup_expired_cursors(self, now: Optional[float] = None) -> None:
        """Clean up expired cursors."""
        with self._lock:
            current = now if now is not None else time.monotonic()
            expired = [
                cid
                for cid, rec in self._cursor_store.items()
                if rec.get("expires_at", 0) <= current
            ]
            for cid in expired:
                self._cursor_store.pop(cid, None)

    # ------------------------------------------------------------------
    # Build helpers
    # ------------------------------------------------------------------

    def _build_truncation_info(
        self,
        *,
        cursor: str,
        reason: str,
        limit: int,
        unit: str,
        total: int,
        has_more: bool,
        scope_token: Optional[str],
    ) -> Dict[str, Any]:
        """Build the truncation info dict.

        Args:
            cursor: continuation cursor.
            reason: truncation reason.
            limit: truncation threshold.
            unit: truncation unit.
            total: raw total estimate.
            has_more: whether more content remains.
            scope_token: continuation scope-validation token.

        Returns:
            truncation info dict, including compatibility fields and continuation fields.

        Raises:
            None.
        """

        fetch_more_args = self._build_fetch_more_args(cursor, scope_token)
        return {
            "reason": reason,
            "limit": limit,
            "unit": unit,
            "cursor": cursor,
            "has_more": has_more,
            "total_estimate": total,
            "fetch_more_args": fetch_more_args,
            "continuation_required": has_more,
            "continuation_priority": _CONTINUATION_PRIORITY_HIGH if has_more else None,
            "next_action": _CONTINUATION_ACTION_FETCH_MORE if has_more else None,
        }

    def _build_fetch_more_args(self, cursor: str, scope_token: Optional[str]) -> Dict[str, str]:
        """Build the recommended `fetch_more` arguments.

        Args:
            cursor: truncation cursor.
            scope_token: scope-validation token for the cursor.

        Returns:
            argument dict ready for `fetch_more`.

        Raises:
            None.
        """

        args: Dict[str, str] = {"cursor": cursor}
        if isinstance(scope_token, str) and scope_token:
            args["scope_token"] = scope_token
        return args

    def _build_scope_token(self, *, cursor: str, record: Dict[str, Any]) -> str:
        """Build a strong scope-validation token for a cursor.

        Args:
            cursor: cursor string.
            record: cursor record.

        Returns:
            scope token (SHA-256 hex digest).

        Raises:
            RuntimeError: raised when the build fails.
        """

        payload = {
            "cursor": cursor,
            "scope_hash": record.get("scope_hash"),
            "run_id": record.get("run_id"),
            "iteration_id": record.get("iteration_id"),
            "tool_call_id": record.get("tool_call_id"),
            "created_at": record.get("created_at"),
        }
        encoded = json.dumps(payload, sort_keys=True, ensure_ascii=True, default=str)
        return hashlib.sha256(encoded.encode("utf-8")).hexdigest()

    def _build_chunk(
        self,
        *,
        mode: str,
        data: Any,
        offset: int,
        limit: int,
    ) -> tuple[Any, int]:
        """Take the next chunk from the raw data according to mode."""
        if mode == "text":
            chunk = data[offset : offset + limit]
            return chunk, len(chunk)
        if mode == "text_lines":
            lines_chunk = data[offset : offset + limit]
            return "".join(lines_chunk), len(lines_chunk)
        if mode == "binary":
            chunk = data[offset : offset + limit]
            return chunk, len(chunk)
        # list mode
        chunk = data[offset : offset + limit]
        return chunk, len(chunk)

    def _resolve_fetch_limit(self, requested: Any, record_limit: int) -> int:
        """Determine the limit actually used by fetch_more."""
        if isinstance(requested, int) and requested > 0:
            return min(requested, record_limit)
        return record_limit

    def _validate_cursor_context(
        self,
        record: Dict[str, Any],
        context: TruncationContext,
    ) -> Optional[Dict[str, Any]]:
        """Validate the cursor context against the current run.

        design notes:
        - `fetch_more` usually happens on the next agent iteration after the model sees a truncated result.
        - so only `run_id` is validated, allowing continuation across iterations within one run.
        """
        if not context:
            return None

        expected_run_id = record.get("run_id")
        actual_run_id = context.run_id
        if expected_run_id and actual_run_id and expected_run_id != actual_run_id:
            return {
                "code": "cursor_scope_mismatch",
                "message": "cursor scope mismatch",
            }
        return None

    def _validate_scope_token(
        self,
        record: Dict[str, Any],
        arguments: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """Validate that `fetch_more`'s scope_token matches the cursor record.

        Args:
            record: cursor record.
            arguments: `fetch_more` call arguments.

        Returns:
            an error object on validation failure; `None` on success.

        Raises:
            None.
        """

        expected = record.get("scope_token")
        if not isinstance(expected, str) or not expected:
            # compatible with historical cursor records (no scope_token carried).
            return None
        actual = arguments.get("scope_token")
        if not isinstance(actual, str) or not actual:
            return dict(_SCOPE_MISMATCH_ERROR)
        if actual != expected:
            return dict(_SCOPE_MISMATCH_ERROR)
        return None
