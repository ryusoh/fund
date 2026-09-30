"""Toolset generic config snapshot contract.

This module defines the single source of truth for toolset config flowing
across layers:
- Service / Contract preparation only converges the tool config into a generic snapshot.
- Host only hands the per-toolset snapshot to the registrar during scene preparation.
- Each toolset adapter deserializes the snapshot into the dedicated config object of its package.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field, is_dataclass
from pathlib import Path
from typing import TypeAlias

ToolsetConfigScalar: TypeAlias = str | int | float | bool | None
ToolsetConfigValue: TypeAlias = (
    ToolsetConfigScalar | list["ToolsetConfigValue"] | dict[str, "ToolsetConfigValue"]
)
ToolsetConfigPayload: TypeAlias = dict[str, ToolsetConfigValue]


@dataclass(frozen=True)
class ToolsetConfigSnapshot:
    """Generic config snapshot of a single toolset.

    Args:
        toolset_name: stable toolset name.
        version: snapshot version.
        payload: JSON-compatible config payload of the current toolset.

    Returns:
        None.

    Raises:
        None.
    """

    toolset_name: str
    version: str = "1"
    payload: ToolsetConfigPayload = field(default_factory=dict)


def normalize_toolset_name(toolset_name: str) -> str:
    """Normalize a toolset name.

    Args:
        toolset_name: raw toolset name.

    Returns:
        toolset name with surrounding whitespace stripped.

    Raises:
        ValueError: raised when the name is empty.
    """

    normalized_name = str(toolset_name or "").strip()
    if not normalized_name:
        raise ValueError("toolset_name must not be empty")
    return normalized_name


def find_toolset_config(
    snapshots: tuple[ToolsetConfigSnapshot, ...],
    toolset_name: str,
) -> ToolsetConfigSnapshot | None:
    """Find a config snapshot by toolset name.

    Args:
        snapshots: toolset config snapshot sequence.
        toolset_name: toolset name to look up.

    Returns:
        matched toolset config snapshot; ``None`` when absent.

    Raises:
        None.
    """

    normalized_name = str(toolset_name or "").strip()
    if not normalized_name:
        return None
    for snapshot in snapshots:
        if snapshot.toolset_name == normalized_name:
            return snapshot
    return None


def replace_toolset_config(
    snapshots: tuple[ToolsetConfigSnapshot, ...],
    snapshot: ToolsetConfigSnapshot,
) -> tuple[ToolsetConfigSnapshot, ...]:
    """Replace a same-named snapshot in the sequence or append it.

    Args:
        snapshots: raw toolset config snapshot sequence.
        snapshot: new snapshot to write.

    Returns:
        new sequence after replacement.

    Raises:
        None.
    """

    normalized: list[ToolsetConfigSnapshot] = []
    replaced = False
    for existing in snapshots:
        if existing.toolset_name == snapshot.toolset_name:
            if not replaced:
                normalized.append(snapshot)
                replaced = True
            continue
        normalized.append(existing)
    if not replaced:
        normalized.append(snapshot)
    return tuple(normalized)


def normalize_toolset_configs(
    snapshots: tuple[ToolsetConfigSnapshot, ...],
) -> tuple[ToolsetConfigSnapshot, ...]:
    """Normalize and deduplicate a toolset config snapshot sequence.

    Args:
        snapshots: raw toolset config snapshot sequence.

    Returns:
        normalized snapshot sequence; later entries override earlier ones with the same name.

    Raises:
        ValueError: raised when any toolset name is empty.
    """

    normalized: tuple[ToolsetConfigSnapshot, ...] = ()
    for snapshot in snapshots:
        normalized = replace_toolset_config(
            normalized,
            ToolsetConfigSnapshot(
                toolset_name=normalize_toolset_name(snapshot.toolset_name),
                version=str(snapshot.version or "1").strip() or "1",
                payload={
                    key: serialize_toolset_config_payload_value(value)
                    for key, value in snapshot.payload.items()
                },
            ),
        )
    return normalized


def serialize_toolset_config_payload_value(value: ToolsetConfigValue) -> ToolsetConfigValue:
    """Recursively normalize a toolset config value to a JSON-compatible value.

    Args:
        value: raw config value.

    Returns:
        normalized config value.

    Raises:
        TypeError: raised when the value type is not supported.
    """

    if value is None or isinstance(value, str | int | float | bool):
        return value
    if isinstance(value, Path):
        return value.as_posix()
    if isinstance(value, list):
        return [serialize_toolset_config_payload_value(item) for item in value]
    if isinstance(value, tuple):
        return [serialize_toolset_config_payload_value(item) for item in value]
    if isinstance(value, dict):
        return {
            str(key): serialize_toolset_config_payload_value(item) for key, item in value.items()
        }
    if is_dataclass(value) and not isinstance(value, type):
        return {
            str(key): serialize_toolset_config_payload_value(item)
            for key, item in asdict(value).items()
        }
    raise TypeError(f"unsupported toolset config value type: {type(value).__name__}")


def coerce_toolset_config_int(
    value: ToolsetConfigValue,
    *,
    field_name: str,
    default: int,
) -> int:
    """Converge a toolset config value to an integer.

    Args:
        value: raw toolset config value.
        field_name: field name, used in error messages.
        default: default used when the value is missing or an empty string.

    Returns:
        normalized integer value.

    Raises:
        TypeError: raised when the value cannot be converged to an integer.
    """

    if value is None:
        return default
    if isinstance(value, bool):
        raise TypeError(f"{field_name} must be an integer, not a boolean")
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if value.is_integer():
            return int(value)
        raise TypeError(f"{field_name} must be an integer; current value is a decimal")
    if isinstance(value, str):
        normalized = value.strip()
        if not normalized:
            return default
        try:
            return int(normalized)
        except ValueError as exc:
            raise TypeError(f"{field_name} must be an integer") from exc
    raise TypeError(f"{field_name} must be an integer")


def coerce_toolset_config_float(
    value: ToolsetConfigValue,
    *,
    field_name: str,
    default: float,
) -> float:
    """Converge a toolset config value to a float.

    Args:
        value: raw toolset config value.
        field_name: field name, used in error messages.
        default: default used when the value is missing or an empty string.

    Returns:
        normalized float value.

    Raises:
        TypeError: raised when the value cannot be converged to a float.
    """

    if value is None:
        return default
    if isinstance(value, bool):
        raise TypeError(f"{field_name} must be a number, not a boolean")
    if isinstance(value, int | float):
        return float(value)
    if isinstance(value, str):
        normalized = value.strip()
        if not normalized:
            return default
        try:
            return float(normalized)
        except ValueError as exc:
            raise TypeError(f"{field_name} must be a number") from exc
    raise TypeError(f"{field_name} must be a number")


def build_toolset_config_snapshot(
    toolset_name: str,
    payload: object | None,
    *,
    version: str = "1",
) -> ToolsetConfigSnapshot | None:
    """Build a generic toolset config snapshot from a dedicated config object.

    Args:
        toolset_name: stable toolset name.
        payload: dedicated config object or JSON-compatible object; returns ``None`` when empty.
        version: snapshot version.

    Returns:
        constructed toolset config snapshot; ``None`` when the payload is empty.

    Raises:
        TypeError: raised when the payload type is not supported.
        ValueError: raised when toolset_name is empty.
    """

    if payload is None:
        return None
    normalized_name = normalize_toolset_name(toolset_name)
    if is_dataclass(payload) and not isinstance(payload, type):
        normalized_payload = {
            str(key): serialize_toolset_config_payload_value(value)
            for key, value in asdict(payload).items()
        }
    elif isinstance(payload, dict):
        normalized_payload = {
            str(key): serialize_toolset_config_payload_value(value)
            for key, value in payload.items()
        }
    else:
        raise TypeError(f"cannot build a toolset config snapshot from type {type(payload).__name__}")
    return ToolsetConfigSnapshot(
        toolset_name=normalized_name,
        version=str(version or "1").strip() or "1",
        payload=normalized_payload,
    )


__all__ = [
    "build_toolset_config_snapshot",
    "coerce_toolset_config_float",
    "coerce_toolset_config_int",
    "ToolsetConfigPayload",
    "ToolsetConfigScalar",
    "ToolsetConfigSnapshot",
    "ToolsetConfigValue",
    "find_toolset_config",
    "normalize_toolset_configs",
    "normalize_toolset_name",
    "replace_toolset_config",
    "serialize_toolset_config_payload_value",
]
