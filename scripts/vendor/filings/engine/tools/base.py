"""Tool decorator and schema-building helpers.

This module is responsible for:
- generating ``ToolSchema``.
- attaching runtime metadata (tags / truncate / dup_call / file_path_params) to function objects.
- being read uniformly by ``ToolRegistry.register()`` at registration time.
"""

import copy
from dataclasses import dataclass
from typing import (
    AbstractSet,
    Any,
    Callable,
    Dict,
    Optional,
    ParamSpec,
    Protocol,
    TypeVar,
    Union,
    cast,
)

from ..exceptions import ConfigError
from ..tool_contracts import DupCallSpec, ToolFunctionSchema, ToolSchema, ToolTruncateSpec

P = ParamSpec("P")
R = TypeVar("R", covariant=True)


def _resolve_enum_values(
    enum_spec: Any,
    registry: Any,
) -> Optional[list]:
    """Resolve the enum values of a parameter.

    Args:
        enum_spec: list of enum values, or a callable receiving registry and returning a list.
        registry: ``ToolRegistry`` instance; required when ``enum_spec`` is callable.

    Returns:
        parsed enum value list; ``None`` when ``enum_spec`` or the resolution is ``None``.

    Raises:
        ConfigError: callable ``enum_spec`` was given no ``registry``, or resolution did not return a list.
    """
    if enum_spec is None:
        return None
    if callable(enum_spec):
        if registry is None:
            raise ConfigError("tool_schema", None, "enum resolver requires registry")
        enum_values = enum_spec(registry)
    else:
        enum_values = enum_spec

    if enum_values is None:
        return None
    if not isinstance(enum_values, list):
        raise ConfigError("tool_schema", None, "enum values must be a list")
    return enum_values


def build_tool_schema(
    *,
    name: str,
    description: str,
    parameters: Dict[str, Any],
    enums: Optional[Dict[str, Any]] = None,
    registry: Any = None,
) -> ToolSchema:
    """Build a ``ToolSchema`` with optional enum injection.

    Args:
        name: tool name.
        description: tool description for the LLM.
        parameters: JSON Schema dict of the arguments.
        enums: optional mapping of field name -> enum value list or ``callable(registry) -> list``.
        registry: ``ToolRegistry`` instance used to resolve dynamic enums.

    Returns:
        built ``ToolSchema`` instance.

    Raises:
        ConfigError: argument structure is invalid, or an enum field does not exist in parameters.
    """
    if not isinstance(parameters, dict):
        raise ConfigError("tool_schema", None, "parameters must be a dict")

    params_copy = copy.deepcopy(parameters)
    properties = params_copy.get("properties")
    if not isinstance(properties, dict):
        raise ConfigError("tool_schema", None, "parameters.properties must be a dict")

    if enums:
        for field_name, enum_spec in enums.items():
            if field_name not in properties:
                raise ConfigError(
                    "tool_schema", None, f"enum field not found in parameters: {field_name}"
                )
            enum_values = _resolve_enum_values(enum_spec, registry)
            if enum_values:
                properties[field_name]["enum"] = enum_values
            else:
                properties[field_name].pop("enum", None)

    return ToolSchema(
        function=ToolFunctionSchema(
            name=name,
            description=description,
            parameters=params_copy,
        )
    )


@dataclass
class ToolExtra:
    """Additional tool metadata (not part of the OpenAI schema)."""

    __file_path_params__: list[str]
    __truncate__: ToolTruncateSpec
    __dup_call__: Optional[DupCallSpec]
    __execution_context_param_name__: str | None
    __display_name__: str | None = None
    __summary_params__: list[str] | None = None


class DecoratedToolCallable(Protocol[P, R]):
    """Callable protocol with tool metadata attached."""

    __tool_name__: str
    __tool_schema__: ToolSchema
    __tool_tags__: set[str]
    __tool_extra__: ToolExtra

    def __call__(self, *args: P.args, **kwargs: P.kwargs) -> R:
        """Execute the tool function."""

        ...


def tool(
    registry: Any,
    *,
    name: str,
    description: str,
    parameters: Union[Dict[str, Any], Callable[[Any], Dict[str, Any]]],
    enums: Optional[Dict[str, Any]] = None,
    tags: Optional[AbstractSet[str]] = None,
    truncate: Optional[Union[ToolTruncateSpec, Dict[str, Any]]] = None,
    dup_call: Optional[Union[DupCallSpec, Dict[str, Any]]] = None,
    file_path_params: Optional[list[str]] = None,
    execution_context_param_name: str | None = None,
    display_name: str | None = None,
    summary_params: list[str] | None = None,
) -> Callable[[Callable[P, R]], DecoratedToolCallable[P, R]]:
    """Tool function decorator.

    This decorator resolves arguments, injects enums, builds the ``ToolSchema``,
    and attaches metadata to the function object for ``ToolRegistry.register()``
    to read uniformly at registration time.

    Args:
        registry: ``ToolRegistry`` instance.
        name: tool name.
        description: tool description for the LLM.
        parameters: JSON Schema dict of the arguments, or a callable returning that dict.
        enums: optional field-name -> enum-values mapping.
        tags: optional tool grouping tag set.
        truncate: optional truncation spec.
        dup_call: optional duplicate-call spec.
        file_path_params: optional list of argument names to validate as file paths
            (e.g. ``["file_path", "directory"]``).
        execution_context_param_name: explicit parameter name in the tool function that receives the execution context;
            ``None`` means the tool does not accept an execution context.
        display_name: user-facing tool display name; falls back to ``name`` when ``None``.
        summary_params: argument names shown in the call summary; only the tool name when ``None``.

    Returns:
        decorator function returning a callable with tool metadata attached.

    Raises:
        ConfigError: ``truncate`` / ``dup_call`` argument types are invalid.
    """

    def wrap(func: Callable[P, R]) -> DecoratedToolCallable[P, R]:
        resolved_parameters = parameters(registry) if callable(parameters) else parameters
        schema = build_tool_schema(
            name=name,
            description=description,
            parameters=resolved_parameters,
            enums=enums,
            registry=registry,
        )
        if truncate is None:
            truncate_spec = ToolTruncateSpec()
        elif isinstance(truncate, ToolTruncateSpec):
            truncate_spec = truncate
        elif isinstance(truncate, dict):
            truncate_spec = ToolTruncateSpec(**truncate)
        else:
            raise ConfigError("tool_schema", None, "truncate must be ToolTruncateSpec or dict")

        if dup_call is None:
            dup_call_spec = None
        elif isinstance(dup_call, DupCallSpec):
            dup_call_spec = dup_call
        elif isinstance(dup_call, dict):
            dup_call_spec = DupCallSpec(**dup_call)
        else:
            raise ConfigError("tool_schema", None, "dup_call must be DupCallSpec or dict")

        decorated_func = cast(DecoratedToolCallable[P, R], func)
        decorated_func.__tool_name__ = name
        decorated_func.__tool_schema__ = schema
        decorated_func.__tool_tags__ = set(tags) if tags is not None else set()
        decorated_func.__tool_extra__ = ToolExtra(
            __file_path_params__=file_path_params or [],
            __truncate__=truncate_spec,
            __dup_call__=dup_call_spec,
            __execution_context_param_name__=(
                str(execution_context_param_name).strip()
                if execution_context_param_name is not None
                and str(execution_context_param_name).strip()
                else None
            ),
            __display_name__=display_name,
            __summary_params__=summary_params,
        )
        return decorated_func

    return wrap
