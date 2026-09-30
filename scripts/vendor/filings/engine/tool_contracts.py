"""Source of truth for tool contracts and truncation strategies.

This module hosts Engine-level neutral tool contracts, avoiding a core-runtime
dependency on implementation directories under the
``scripts.vendor.filings.engine.tools`` namespace. Responsibilities include:

- ``ToolSchema`` / ``ToolFunctionSchema``: structured contracts for the OpenAI tools schema.
- ``ToolTruncateSpec``: tool-result truncation declarations.
- ``DupCallSpec``: duplicate-call policy declarations.
- ``TRUNCATION_STRATEGIES`` / ``get_strategy_spec``: source of truth for truncation-strategy metadata.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

from .exceptions import ConfigError

# Strategy -> required limit key, truncation unit, and reason label.
TRUNCATION_STRATEGIES: Dict[str, Dict[str, str]] = {
    "text_chars": {
        "limit_key": "max_chars",
        "unit": "chars",
        "reason": "max_chars",
    },
    "text_lines": {
        "limit_key": "max_lines",
        "unit": "lines",
        # Keep reason aligned with existing protocol vocabulary.
        "reason": "max_items",
    },
    "list_items": {
        "limit_key": "max_items",
        "unit": "items",
        "reason": "max_items",
    },
    "binary_bytes": {
        "limit_key": "max_bytes",
        "unit": "bytes",
        "reason": "max_bytes",
    },
}


def get_strategy_spec(strategy: str) -> Dict[str, str]:
    """Return the metadata for the given truncation strategy.

    Args:
        strategy: truncation strategy name.

    Returns:
        dict containing ``limit_key`` / ``unit`` / ``reason``; empty dict for unknown strategies.

    Raises:
        None.
    """

    return TRUNCATION_STRATEGIES.get(strategy, {})


@dataclass
class ToolTruncateSpec:
    """Tool truncation policy declaration.

    Rules:
    - enabled=False means truncation is disabled.
    - enabled=True requires strategy + limits to be fully specified.
    - Each strategy allows exactly one limit key.
    """

    enabled: bool = False
    strategy: Optional[str] = None
    limits: Optional[Dict[str, int]] = None
    target_field: Optional[str] = None
    continuation_hint: Optional[Dict[str, Any]] = None

    def __post_init__(self) -> None:
        """Validate the truncation config.

        Args:
            None.

        Returns:
            None.

        Raises:
            ConfigError: raised when the config violates policy constraints.
        """

        if not self.enabled:
            return
        if not self.strategy:
            raise ConfigError("tool_schema", None, "truncate.strategy is required when enabled")
        if self.strategy not in TRUNCATION_STRATEGIES:
            raise ConfigError(
                "tool_schema", None, f"unsupported truncate.strategy: {self.strategy}"
            )
        if not isinstance(self.limits, dict) or not self.limits:
            raise ConfigError(
                "tool_schema", None, "truncate.limits must be a non-empty dict when enabled"
            )

        limit_key = TRUNCATION_STRATEGIES[self.strategy]["limit_key"]
        if set(self.limits.keys()) != {limit_key}:
            raise ConfigError(
                "tool_schema",
                None,
                f"truncate.limits must contain only '{limit_key}' for strategy '{self.strategy}'",
            )
        limit_value = self.limits.get(limit_key)
        if not isinstance(limit_value, int) or limit_value <= 0:
            raise ConfigError(
                "tool_schema",
                None,
                f"truncate.limits.{limit_key} must be a positive integer",
            )


@dataclass
class DupCallSpec:
    """Duplicate-call policy declaration.

    Describes the specialized behavior of a tool in the Agent-side duplicate-call
    protection. This declaration does not enter the OpenAI schema; it is consumed
    only by the runtime framework across reasoning rounds.

    Args:
        mode: duplicate-call policy mode. Only ``poll_until_terminal`` is currently supported.
        status_path: status field path in dot-path syntax, e.g. ``"job.status"``.
        terminal_values: terminal enum values, e.g. ``["succeeded", "failed"]``.

    Returns:
        None.

    Raises:
        ConfigError: raised when the config is invalid.
    """

    mode: str
    status_path: Optional[str] = None
    terminal_values: Optional[list[str]] = None

    def __post_init__(self) -> None:
        """Validate the duplicate-call policy config.

        Args:
            None.

        Returns:
            None.

        Raises:
            ConfigError: raised when the config does not satisfy the protocol requirements.
        """

        normalized_mode = str(self.mode or "").strip()
        if normalized_mode != "poll_until_terminal":
            raise ConfigError(
                "tool_schema",
                None,
                f"unsupported dup_call.mode: {self.mode}",
            )
        self.mode = normalized_mode

        normalized_status_path = str(self.status_path or "").strip()
        if not normalized_status_path:
            raise ConfigError(
                "tool_schema",
                None,
                "dup_call.status_path is required when mode=poll_until_terminal",
            )
        self.status_path = normalized_status_path

        if not isinstance(self.terminal_values, list) or not self.terminal_values:
            raise ConfigError(
                "tool_schema",
                None,
                "dup_call.terminal_values must be a non-empty list when mode=poll_until_terminal",
            )

        normalized_terminal_values: list[str] = []
        for value in self.terminal_values:
            normalized_value = str(value or "").strip()
            if not normalized_value:
                raise ConfigError(
                    "tool_schema",
                    None,
                    "dup_call.terminal_values cannot contain blank values",
                )
            normalized_terminal_values.append(normalized_value)
        self.terminal_values = normalized_terminal_values


@dataclass
class ToolFunctionSchema:
    """OpenAI tool function schema."""

    name: str
    description: str
    parameters: Dict[str, Any]


@dataclass
class ToolSchema:
    """Complete tool schema.

    Attributes:
        function: OpenAI function schema fields.
        type: Tool type, defaults to ``function``.
    """

    function: ToolFunctionSchema
    type: str = "function"

    def to_openai(self) -> Dict[str, Any]:
        """Convert to an OpenAI tools schema dict.

        Args:
            None.

        Returns:
            OpenAI tools schema dict.

        Raises:
            None.
        """

        return {
            "type": self.type,
            "function": {
                "name": self.function.name,
                "description": self.function.description,
                "parameters": self.function.parameters,
            },
        }
