"""Shared types for the Agent execution path.

This module hosts lightweight types reused along the ``Service -> Host -> Agent``
main chain, avoiding continued use of ``Any`` and unconstrained dict bags in
the shared contracts.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, NotRequired, Protocol, TypeAlias, TypedDict

JsonScalar: TypeAlias = str | int | float | bool | None
"""JSON scalar value."""


JsonValue: TypeAlias = JsonScalar | list["JsonValue"] | dict[str, "JsonValue"]
"""Recursive JSON value."""


ExtraContentPayload: TypeAlias = dict[str, dict[str, JsonValue]]
"""Provider-private ``extra_content`` pass-through payload."""


class FunctionToolCallPayload(TypedDict):
    """The function payload of a tool call."""

    name: str
    arguments: str


class ToolCallPayload(TypedDict):
    """A single tool call in an assistant message."""

    id: str
    type: Literal["function"]
    function: FunctionToolCallPayload
    extra_content: NotRequired[ExtraContentPayload]


class SystemChatMessage(TypedDict):
    """system role message."""

    role: Literal["system"]
    content: str


class UserChatMessage(TypedDict):
    """user role message."""

    role: Literal["user"]
    content: str


class AssistantChatMessage(TypedDict, total=False):
    """assistant role message."""

    role: Literal["assistant"]
    content: str | None
    tool_calls: list[ToolCallPayload]
    reasoning_content: str


class ToolChatMessage(TypedDict, total=False):
    """tool role message."""

    role: Literal["tool"]
    tool_call_id: str
    content: str
    name: str


AgentMessage: TypeAlias = (
    SystemChatMessage | UserChatMessage | AssistantChatMessage | ToolChatMessage
)


def build_system_chat_message(content: str) -> SystemChatMessage:
    """Build a system-role message."""

    return {"role": "system", "content": content}


def build_user_chat_message(content: str) -> UserChatMessage:
    """Build a user-role message."""

    return {"role": "user", "content": content}


def build_assistant_chat_message(
    *,
    content: str | None,
    tool_calls: list[ToolCallPayload] | None = None,
    reasoning_content: str | None = None,
) -> AssistantChatMessage:
    """Build an assistant-role message."""

    message: AssistantChatMessage = {
        "role": "assistant",
        "content": content,
    }
    if tool_calls is not None:
        message["tool_calls"] = tool_calls
    if reasoning_content:
        message["reasoning_content"] = reasoning_content
    return message


def build_tool_chat_message(
    *,
    tool_call_id: str,
    content: str,
    name: str | None = None,
) -> ToolChatMessage:
    """Build a tool-role message."""

    message: ToolChatMessage = {
        "role": "tool",
        "tool_call_id": tool_call_id,
        "content": content,
    }
    if name:
        message["name"] = name
    return message


@dataclass(frozen=True)
class AgentRuntimeLimits:
    """Explicit runtime limits passed from Host to Agent."""

    timeout_ms: int | None = None


@dataclass(frozen=True)
class AgentTraceIdentity:
    """Fixed identity information passed from Host to Agent / trace recorder."""

    agent_name: str
    agent_kind: str
    scene_name: str
    model_name: str
    session_id: str | None = None

    def to_metadata(self) -> dict[str, str]:
        """Convert to the metadata dict used by the trace recorder."""

        metadata = {
            "agent_name": self.agent_name,
            "agent_kind": self.agent_kind,
            "scene_name": self.scene_name,
            "model_name": self.model_name,
        }
        if self.session_id:
            metadata["session_id"] = self.session_id
        return metadata


class ConversationTurnPersistenceProtocol(Protocol):
    """Minimal Host session-state capability exposed to the executor."""

    def persist_turn(
        self,
        *,
        final_content: str,
        degraded: bool,
        tool_uses: tuple[object, ...],
        warnings: tuple[str, ...],
        errors: tuple[str, ...],
    ) -> None:
        """Persist the execution result of the current conversation turn."""

    def record_reasoning_delta(self, chunk: str) -> None:
        """Accumulate this round's reasoning delta into the display buffer.

        semantics note: reasoning is persisted only as a historical display field; it does **not** enter the runtime model context,
        memory, compaction, and resume decision chain. When the executor receives a reasoning delta
        this method buffers events, and ``persist_turn`` flushes them into the display-side subview.

        Args:
            chunk: a single reasoning text delta.

        Returns:
            None.

        Raises:
            None.
        """


__all__ = [
    "AgentMessage",
    "AgentRuntimeLimits",
    "AgentTraceIdentity",
    "AssistantChatMessage",
    "build_assistant_chat_message",
    "build_system_chat_message",
    "build_tool_chat_message",
    "build_user_chat_message",
    "ConversationTurnPersistenceProtocol",
    "FunctionToolCallPayload",
    "SystemChatMessage",
    "ToolCallPayload",
    "ToolChatMessage",
    "UserChatMessage",
]
