"""Cross-layer stable protocol definitions.

This module hosts the stable protocols shared across layers, plus a small
number of strongly typed execution-context contracts consumed by multiple
layers together.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Collection, Optional, Protocol, Sequence

from scripts.vendor.filings.contracts.agent_types import AgentMessage
from scripts.vendor.filings.contracts.cancellation import CancellationToken


@dataclass(frozen=True)
class ToolExecutionContext:
    """Strongly typed execution context of a single tool call.

    Args:
        run_id: current Host run ID.
        iteration_id: current Engine iteration ID.
        tool_call_id: current tool call ID.
        index_in_iteration: this tool's ordinal index within the current iteration.
        timeout_seconds: budget in seconds for the current tool call.
        cancellation_token: cancellation token observable by the current tool call.

    Returns:
        None.

    Raises:
        None.
    """

    run_id: str | None = None
    iteration_id: str | None = None
    tool_call_id: str | None = None
    index_in_iteration: int = 0
    timeout_seconds: float | None = None
    cancellation_token: CancellationToken | None = None


class DupCallSpecProtocol(Protocol):
    """Minimal structural protocol for the duplicate-call policy."""

    mode: str
    status_path: str | None
    terminal_values: list[str] | None


class PromptToolCatalogProtocol(Protocol):
    """Minimal protocol for Prompt assembly to read tool snapshots."""

    def get_tool_names(self) -> Collection[str]:
        """Return the currently visible tool name set."""

        ...

    def get_tool_tags(self) -> Collection[str]:
        """Return the currently visible tool tag set."""

        ...

    def get_allowed_paths(self) -> Sequence[str]:
        """Return the current tool's allowed path list."""

        ...


class ToolTraceRecorder(Protocol):
    """Tool trace recorder protocol for a single run."""

    def start_iteration(
        self,
        *,
        iteration_id: str,
        model_input_messages: list[AgentMessage],
        tool_schemas: list[dict[str, Any]],
    ) -> None:
        """Start recording the model-bound context of one agent iteration."""

        ...

    def on_tool_dispatched(self, *, iteration_id: str, payload: Any) -> None:
        """Observe a tool-request-initiated event."""

        ...

    def on_tool_result(self, *, iteration_id: str, payload: Any) -> None:
        """Observe a tool-result event."""

        ...

    def record_iteration_usage(
        self,
        *,
        iteration_id: str,
        usage: dict[str, Any],
        budget_snapshot: Optional[dict[str, Any]] = None,
    ) -> None:
        """Record token usage of a single iteration."""

        ...

    def record_final_response(
        self,
        *,
        iteration_id: str,
        content: str,
        degraded: bool,
        filtered: bool = False,
        finish_reason: str | None = None,
    ) -> None:
        """Record the final answer."""

        ...

    def record_sse_protocol_error(
        self,
        *,
        iteration_id: str,
        error_type: str,
        partial_tool_name: str | None,
        partial_tool_calls: list[dict[str, Any]],
        request_id: str,
        attempt: int | None = None,
    ) -> None:
        """Record an SSE protocol error context.

        Args:
            iteration_id: current iteration ID.
            error_type: SSE protocol error type, e.g. ``tool_call_incomplete``.
            partial_tool_name: first recognizable partial tool name; ``None`` when unknown.
            partial_tool_calls: partial tool-call fragments accumulated up to the failure point.
            request_id: current model request ID.
            attempt: current request attempt count; ``None`` when unknown.

        Returns:
            None.

        Raises:
            None.
        """

        ...

    def finish_iteration(
        self,
        *,
        iteration_id: str,
        iteration_index: int,
        termination_reason: str | None = None,
    ) -> None:
        """End an iteration and emit the context snapshot."""

        ...

    def close(self) -> None:
        """Close the recorder and compensate for unpaired records."""

        ...


class ToolTraceRecorderFactory(Protocol):
    """Tool trace recorder factory protocol."""

    def create_recorder(
        self,
        *,
        run_id: str,
        session_id: str,
        agent_metadata: Optional[dict[str, Any]] = None,
    ) -> ToolTraceRecorder:
        """Create the recorder used for a single run."""

        ...


class ToolExecutor(Protocol):
    """Tool executor interface protocol."""

    def execute(
        self,
        name: str,
        arguments: dict[str, Any],
        context: ToolExecutionContext | None = None,
    ) -> dict[str, Any]:
        """Execute a tool and return a structured result."""

        ...

    def get_schemas(self) -> list[dict[str, Any]]:
        """Get all tool schema definitions."""

        ...

    def clear_cursors(self) -> None:
        """Clear a truncation cursor, releasing associated data references."""

        ...

    def get_dup_call_spec(self, name: str) -> Optional[DupCallSpecProtocol]:
        """Read the duplicate-call policy declaration for a tool."""

        ...

    def get_execution_context_param_name(self, name: str) -> str | None:
        """Read the execution-context injection parameter name for a tool."""

        ...

    def get_tool_display_info(self, name: str) -> tuple[str, list[str] | None]:
        """Read user-facing display metadata for a tool.

        Args:
            name: tool name.

        Returns:
            ``(display_name, summary_params)`` pair; display_name falls back to name,
            summary_params of None means no parameter summary is displayed.
        """

        ...

    def register_response_middleware(
        self,
        callback: Callable[[str, dict[str, Any], ToolExecutionContext | None], dict[str, Any]],
    ) -> None:
        """Register a response middleware, chained after successful tool execution."""

        ...


class PromptToolExecutorProtocol(ToolExecutor, PromptToolCatalogProtocol, Protocol):
    """Minimal protocol combining tool execution with Prompt tool snapshots."""

    ...
