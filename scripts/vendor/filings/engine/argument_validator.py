"""
Argument validator - validates and coerces tool arguments against JSON Schema

Split out from ToolRegistry; encapsulates all argument-validation logic:
- depth-limit checks
- generic limits on string length / array size
- type coercion per schema type
- required-field and default-value filling
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from scripts.vendor.filings.engine.tool_result import build_error


class ArgumentValidator:
    """Tool argument validation and coercion.

    Validates LLM-supplied arguments against the tool schema for type safety
    and safe truncation. Holds no instance state; all limits are class-level constants.

    Attributes:
        SCHEMA_MAX_STRING_LENGTH: maximum length of a single string argument.
        SCHEMA_MAX_ARRAY_ITEMS: maximum number of elements in a single array argument.
        ARGUMENTS_MAX_DEPTH: maximum argument nesting depth.
    """

    SCHEMA_MAX_STRING_LENGTH: int = 4096
    SCHEMA_MAX_ARRAY_ITEMS: int = 1000
    ARGUMENTS_MAX_DEPTH: int = 8

    def validate_and_coerce(
        self,
        arguments: Any,
        parameters: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Validate/normalize/default-fill arguments based on the schema.

        Args:
            arguments: arguments passed by the LLM (must be a dict, otherwise an error is raised).
            parameters: the function.parameters section of the tool schema.
                        only generic limit checks are performed when it is ``None``.

        Returns:
            validation succeeded: ``{"ok": True, "arguments": coerced_dict}``
            validation failed: ``{"ok": False, "error": "<code>", "message": "...", "hint": ...}``
        """
        if not isinstance(arguments, dict):
            return self._build_argument_error(
                "arguments must be an object",
                [{"path": "$", "reason": "type_mismatch", "expected": "object"}],
            )

        depth = self._calculate_depth(arguments)
        if depth > self.ARGUMENTS_MAX_DEPTH:
            return self._build_argument_error(
                "arguments structure is too deep",
                [
                    {
                        "path": "$",
                        "reason": "depth_exceeded",
                        "max_depth": self.ARGUMENTS_MAX_DEPTH,
                        "actual_depth": depth,
                    }
                ],
            )

        if not isinstance(parameters, dict):
            # no schema definition; apply generic limits only
            issues = self._check_generic_limits(arguments)
            if issues:
                return self._build_argument_error("arguments exceed limits", issues)
            return {"ok": True, "arguments": arguments}

        ok, coerced, issues = self._coerce_value(arguments, parameters, path="$")
        if not ok:
            return self._build_argument_error("arguments validation failed", issues)
        return {"ok": True, "arguments": coerced}

    # ------------------------------------------------------------------
    # Internal helper methods
    # ------------------------------------------------------------------

    def _build_argument_error(self, message: str, issues: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Construct the standard argument-error structure.

        Args:
            message: error summary message.
            issues: list of argument-validation issues.

        Returns:
            normalized error response; carries a `repair_hint` when a repair action can be inferred.

        Raises:
            None.
        """
        detail: Dict[str, Any] = {"issues": issues}
        repair_hint = self._build_repair_hint(issues)
        if repair_hint is not None:
            detail["repair_hint"] = repair_hint
        return build_error(
            "invalid_argument",
            message,
            hint=self._build_argument_hint_text(issues=issues),
            meta=detail,
        )

    def _build_argument_hint_text(self, *, issues: List[Dict[str, Any]]) -> str:
        """Compress a structured argument error into an LLM-actionable string hint.

        Args:
            issues: list of argument-validation issues.

        Returns:
            flat string hint for the LLM.

        Raises:
            None.
        """
        if not issues:
            return "Fix arguments to match the tool schema and retry."

        unsupported_fields: List[str] = []
        allowed_fields: List[str] = []
        missing_required_fields: List[str] = []
        generic_messages: List[str] = []

        for issue in issues:
            reason = issue.get("reason")
            if reason == "additional_properties":
                fields = issue.get("fields")
                if isinstance(fields, list):
                    unsupported_fields.extend(str(field) for field in fields)
                allowed = issue.get("allowed_fields")
                if isinstance(allowed, list):
                    allowed_fields.extend(str(field) for field in allowed)
                continue

            if reason == "missing_required":
                path = issue.get("path")
                if isinstance(path, str) and path:
                    missing_required_fields.append(path.rsplit(".", 1)[-1])
                continue

            generic_messages.append(self._format_issue_for_hint(issue))

        hint_parts: List[str] = []
        if unsupported_fields:
            normalized_unsupported = ", ".join(sorted(set(unsupported_fields)))
            hint_parts.append(f"Remove unsupported fields and retry: {normalized_unsupported}.")
        if missing_required_fields:
            normalized_missing = ", ".join(sorted(set(missing_required_fields)))
            hint_parts.append(f"Add required fields and retry: {normalized_missing}.")
        if allowed_fields:
            normalized_allowed = ", ".join(sorted(set(allowed_fields)))
            hint_parts.append(f"Allowed fields: {normalized_allowed}.")
        hint_parts.extend(message for message in generic_messages if message)

        if hint_parts:
            return " ".join(hint_parts)
        return "Fix arguments to match the tool schema and retry."

    def _format_issue_for_hint(self, issue: Dict[str, Any]) -> str:
        """Format a single issue into a short string hint.

        Args:
            issue: a single argument-validation issue.

        Returns:
            a single string hint; a generic hint when unrecognized.

        Raises:
            None.
        """
        path = str(issue.get("path", "$"))
        reason = str(issue.get("reason", "invalid"))

        if reason == "type_mismatch":
            expected = str(issue.get("expected", "expected type"))
            return f"Set {path} to {expected} and retry."
        if reason == "enum_mismatch":
            allowed = issue.get("allowed")
            if isinstance(allowed, list) and allowed:
                rendered_allowed = ", ".join(str(item) for item in allowed)
                return f"Set {path} to one of: {rendered_allowed}."
            return f"Set {path} to an allowed value and retry."
        if reason == "string_too_long":
            max_length = issue.get("max_length")
            if max_length is not None:
                return f"Shorten {path} to at most {max_length} characters and retry."
            return f"Shorten {path} and retry."
        if reason == "string_too_short":
            min_length = issue.get("min_length")
            if min_length is not None:
                return f"Extend {path} to at least {min_length} characters and retry."
            return f"Extend {path} and retry."
        if reason == "array_too_large":
            max_items = issue.get("max_items")
            if max_items is not None:
                return f"Reduce {path} to at most {max_items} items and retry."
            return f"Reduce {path} item count and retry."
        if reason == "array_too_small":
            min_items = issue.get("min_items")
            if min_items is not None:
                return f"Expand {path} to at least {min_items} items and retry."
            return f"Expand {path} item count and retry."
        if reason == "depth_exceeded":
            max_depth = issue.get("max_depth")
            if max_depth is not None:
                return f"Reduce argument nesting to at most {max_depth} levels and retry."
            return "Reduce argument nesting depth and retry."
        if reason == "unsupported_type":
            expected = str(issue.get("expected", "supported schema type"))
            return f"Adjust {path} to a supported schema type; current schema expects {expected}."
        return f"Fix {path} ({reason}) and retry."

    def _build_repair_hint(self, issues: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """Generate an actionable repair hint from argument-validation issues.

        Args:
            issues: list of argument-validation issues.

        Returns:
            repair-hint dict; `None` when no valid repair action can be inferred.

        Raises:
            None.
        """
        if not issues:
            return None

        additional_fields: List[str] = []
        allowed_fields: List[str] = []
        missing_required_paths: List[str] = []

        for issue in issues:
            reason = issue.get("reason")
            if reason == "additional_properties":
                fields = issue.get("fields")
                if isinstance(fields, list):
                    additional_fields.extend(str(field) for field in fields)
                issue_allowed_fields = issue.get("allowed_fields")
                if isinstance(issue_allowed_fields, list):
                    allowed_fields.extend(str(field) for field in issue_allowed_fields)
            elif reason == "missing_required":
                path = issue.get("path")
                if isinstance(path, str):
                    missing_required_paths.append(path)

        if additional_fields:
            normalized_extra = sorted(set(additional_fields))
            normalized_allowed = sorted(set(allowed_fields))
            hint: Dict[str, Any] = {
                "action": "drop_unsupported_fields",
                "unsupported_fields": normalized_extra,
                "message": "Remove unsupported fields from arguments and retry.",
            }
            if normalized_allowed:
                hint["allowed_fields"] = normalized_allowed
            return hint

        if missing_required_paths:
            missing_fields = []
            for path in missing_required_paths:
                field_name = path.rsplit(".", 1)[-1]
                missing_fields.append(field_name)
            return {
                "action": "add_required_fields",
                "required_fields": sorted(set(missing_fields)),
                "message": "Add all required fields and retry.",
            }

        return None

    def _calculate_depth(self, value: Any, current: int = 1) -> int:
        """Recursively compute the nesting depth."""
        if isinstance(value, dict) and value:
            return max(self._calculate_depth(v, current + 1) for v in value.values())
        if isinstance(value, list) and value:
            return max(self._calculate_depth(v, current + 1) for v in value)
        return current

    def _check_generic_limits(self, value: Any, path: str = "$") -> List[Dict[str, Any]]:
        """Generic safety checks (string length, array size) for schema-less values."""
        issues: List[Dict[str, Any]] = []
        if isinstance(value, str):
            max_len = self.SCHEMA_MAX_STRING_LENGTH
            if len(value) > max_len:
                issues.append(
                    {
                        "path": path,
                        "reason": "string_too_long",
                        "max_length": max_len,
                        "actual_length": len(value),
                    }
                )
        elif isinstance(value, list):
            max_items = self.SCHEMA_MAX_ARRAY_ITEMS
            if len(value) > max_items:
                issues.append(
                    {
                        "path": path,
                        "reason": "array_too_large",
                        "max_items": max_items,
                        "actual_items": len(value),
                    }
                )
            for idx, item in enumerate(value):
                issues.extend(self._check_generic_limits(item, f"{path}[{idx}]"))
        elif isinstance(value, dict):
            for key, item in value.items():
                issues.extend(self._check_generic_limits(item, f"{path}.{key}"))
        return issues

    def _coerce_value(
        self,
        value: Any,
        schema: Dict[str, Any],
        *,
        path: str,
    ) -> tuple[bool, Any, List[Dict[str, Any]]]:
        """Type-check and coerce a single value per the schema."""
        schema_type = schema.get("type")
        if isinstance(schema_type, list):
            # union type: try each in turn
            collected: List[Dict[str, Any]] = []
            for candidate in schema_type:
                ok, coerced, issues = self._coerce_value(
                    value,
                    {**schema, "type": candidate},
                    path=path,
                )
                if ok:
                    return True, coerced, []
                collected.extend(issues)
            return False, None, collected

        if schema_type is None:
            # no type specified; apply generic limits only
            issues = self._check_generic_limits(value, path)
            if issues:
                return False, None, issues
            if "enum" in schema and value not in schema["enum"]:
                return (
                    False,
                    None,
                    [
                        {
                            "path": path,
                            "reason": "enum_mismatch",
                            "allowed": schema["enum"],
                            "actual": value,
                        }
                    ],
                )
            return True, value, []

        ok, coerced, issues = self._coerce_value_for_type(value, schema, path)
        if not ok:
            return False, None, issues
        if "enum" in schema and coerced not in schema["enum"]:
            return (
                False,
                None,
                [
                    {
                        "path": path,
                        "reason": "enum_mismatch",
                        "allowed": schema["enum"],
                        "actual": coerced,
                    }
                ],
            )
        return True, coerced, []

    def _coerce_value_for_type(
        self,
        value: Any,
        schema: Dict[str, Any],
        path: str,
    ) -> tuple[bool, Any, List[Dict[str, Any]]]:
        """Deep type coercion for a concrete schema type."""
        schema_type = schema.get("type")

        if schema_type == "string":
            if not isinstance(value, str):
                value = str(value)
            max_len = schema.get("maxLength", self.SCHEMA_MAX_STRING_LENGTH)
            min_len = schema.get("minLength")
            if min_len is not None and len(value) < min_len:
                return (
                    False,
                    None,
                    [
                        {
                            "path": path,
                            "reason": "string_too_short",
                            "min_length": min_len,
                            "actual_length": len(value),
                        }
                    ],
                )
            if len(value) > max_len:
                return (
                    False,
                    None,
                    [
                        {
                            "path": path,
                            "reason": "string_too_long",
                            "max_length": max_len,
                            "actual_length": len(value),
                        }
                    ],
                )
            return True, value, []

        if schema_type == "integer":
            if isinstance(value, bool):
                return (
                    False,
                    None,
                    [{"path": path, "reason": "type_mismatch", "expected": "integer"}],
                )
            if isinstance(value, int):
                return True, value, []
            if isinstance(value, float) and value.is_integer():
                return True, int(value), []
            if isinstance(value, str):
                try:
                    return True, int(value), []
                except ValueError:
                    return (
                        False,
                        None,
                        [{"path": path, "reason": "type_mismatch", "expected": "integer"}],
                    )
            return False, None, [{"path": path, "reason": "type_mismatch", "expected": "integer"}]

        if schema_type == "number":
            if isinstance(value, bool):
                return (
                    False,
                    None,
                    [{"path": path, "reason": "type_mismatch", "expected": "number"}],
                )
            if isinstance(value, (int, float)):
                return True, value, []
            if isinstance(value, str):
                try:
                    return True, float(value), []
                except ValueError:
                    return (
                        False,
                        None,
                        [{"path": path, "reason": "type_mismatch", "expected": "number"}],
                    )
            return False, None, [{"path": path, "reason": "type_mismatch", "expected": "number"}]

        if schema_type == "boolean":
            if isinstance(value, bool):
                return True, value, []
            if isinstance(value, str):
                lowered = value.strip().lower()
                if lowered in ("true", "false"):
                    return True, lowered == "true", []
            if isinstance(value, int) and value in (0, 1):
                return True, bool(value), []
            return False, None, [{"path": path, "reason": "type_mismatch", "expected": "boolean"}]

        if schema_type == "array":
            return self._coerce_array(value, schema, path)

        if schema_type == "object":
            return self._coerce_object(value, schema, path)

        return False, None, [{"path": path, "reason": "unsupported_type", "expected": schema_type}]

    def _coerce_array(
        self,
        value: Any,
        schema: Dict[str, Any],
        path: str,
    ) -> tuple[bool, Any, List[Dict[str, Any]]]:
        """Validate and coerce an array-typed argument."""
        if isinstance(value, tuple):
            value = list(value)
        if not isinstance(value, list):
            return False, None, [{"path": path, "reason": "type_mismatch", "expected": "array"}]

        max_items = schema.get("maxItems", self.SCHEMA_MAX_ARRAY_ITEMS)
        min_items = schema.get("minItems")
        if min_items is not None and len(value) < min_items:
            return (
                False,
                None,
                [
                    {
                        "path": path,
                        "reason": "array_too_small",
                        "min_items": min_items,
                        "actual_items": len(value),
                    }
                ],
            )
        if len(value) > max_items:
            return (
                False,
                None,
                [
                    {
                        "path": path,
                        "reason": "array_too_large",
                        "max_items": max_items,
                        "actual_items": len(value),
                    }
                ],
            )

        items_schema = schema.get("items")
        if not isinstance(items_schema, dict):
            return True, value, []

        coerced_items: List[Any] = []
        issues: List[Dict[str, Any]] = []
        for idx, item in enumerate(value):
            ok, coerced, item_issues = self._coerce_value(
                item,
                items_schema,
                path=f"{path}[{idx}]",
            )
            if not ok:
                issues.extend(item_issues)
            else:
                coerced_items.append(coerced)
        if issues:
            return False, None, issues
        return True, coerced_items, []

    def _coerce_object(
        self,
        value: Any,
        schema: Dict[str, Any],
        path: str,
    ) -> tuple[bool, Any, List[Dict[str, Any]]]:
        """Validate and coerce an object-typed argument."""
        if not isinstance(value, dict):
            return False, None, [{"path": path, "reason": "type_mismatch", "expected": "object"}]

        properties = schema.get("properties", {})
        required = schema.get("required", [])
        allow_additional = schema.get("additionalProperties", False)
        if not isinstance(properties, dict):
            properties = {}

        issues: List[Dict[str, Any]] = []
        coerced_obj: Dict[str, Any] = {}

        # check required fields
        for key in required:
            if key not in value:
                default = properties.get(key, {}).get("default")
                if default is not None:
                    coerced_obj[key] = default
                else:
                    issues.append(
                        {
                            "path": f"{path}.{key}",
                            "reason": "missing_required",
                        }
                    )

        # validate field by field per the schema
        for key, prop_schema in properties.items():
            if key in value:
                ok, coerced, prop_issues = self._coerce_value(
                    value[key],
                    prop_schema,
                    path=f"{path}.{key}",
                )
                if not ok:
                    issues.extend(prop_issues)
                else:
                    coerced_obj[key] = coerced
            else:
                default = prop_schema.get("default")
                if default is not None:
                    coerced_obj[key] = default

        # extra field handling
        extra_keys = [k for k in value.keys() if k not in properties]
        if extra_keys and not allow_additional:
            issues.append(
                {
                    "path": path,
                    "reason": "additional_properties",
                    "fields": extra_keys,
                    "allowed_fields": sorted(properties.keys()),
                }
            )
        elif extra_keys and allow_additional:
            for key in extra_keys:
                extra_issues = self._check_generic_limits(value[key], f"{path}.{key}")
                if extra_issues:
                    issues.extend(extra_issues)
                else:
                    coerced_obj[key] = value[key]

        if issues:
            return False, None, issues
        return True, coerced_obj, []
