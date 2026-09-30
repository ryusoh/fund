"""Tool registry module.

This module is responsible for:
- tool registration and schema management
- path whitelisting and safety checks
- unified tool execution entry point and error wrapping
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set

from scripts.vendor.filings.contracts.cancellation import CancelledError
from scripts.vendor.filings.contracts.protocols import ToolExecutionContext
from scripts.vendor.filings.log import Log

from .argument_validator import ArgumentValidator
from .exceptions import ConfigError, FileAccessError
from .tool_contracts import DupCallSpec, ToolFunctionSchema, ToolSchema
from .tool_errors import ToolBusinessError
from .tool_result import build_error, build_success
from .truncation_manager import TruncationManager

MODULE = "ENGINE.TOOL_REGISTRY"


@dataclass
class ToolDescriptor:
    """Registered tool metadata."""

    name: str
    tags: set = field(default_factory=set)
    dup_call: Optional[DupCallSpec] = None
    execution_context_param_name: str | None = None
    display_name: str | None = None
    summary_params: list[str] | None = None


def _format_tool_business_error_log(name: str, error: ToolBusinessError) -> str:
    """Format the tool business-error log line.

    Args:
        name: tool name.
        error: tool business exception.

    Returns:
        single-line message suitable for logs.

    Raises:
        None.
    """

    url = str(error.extra.get("url", "") or "").strip()
    prefix = f"tool {name} business error: {error.code}"
    if url:
        prefix = f"{prefix} url={url}"
    return f"{prefix} - {error.message}"


class ToolRegistry:
    """Tool registry - manages and executes Tool Calling tools

    Internally composes ArgumentValidator (argument validation) and TruncationManager (truncation/pagination).
    """

    def __init__(self) -> None:
        """
        initialized tool registry

        Example:
            registry = ToolRegistry()
            registry.register_allowed_paths([
                Path("workspace/config"),
                Path("workspace/prompts"),
                Path("output/logs/app.log")
            ])
        """
        self.tools: Dict[str, Callable[..., object]] = {}
        self.schemas: Dict[str, Dict[str, Any]] = {}
        self.tool_schemas: Dict[str, ToolSchema] = {}
        self.tool_descriptors: Dict[str, ToolDescriptor] = {}
        self.allowed_paths: set[Path] = set()
        self._argument_validator = ArgumentValidator()
        self._truncation_manager = TruncationManager()
        self._response_middlewares: list[
            Callable[[str, Dict[str, Any], ToolExecutionContext | None], Dict[str, Any]]
        ] = []

        Log.debug(
            f"tool registry initialized, allowed path count: {len(self.allowed_paths)}",
            module=MODULE,
        )

    def clear_cursors(self) -> None:
        """Clear all truncation cursors, releasing associated data references.

        called by AsyncAgent before a new run starts, so stale cursors from the previous run do not occupy memory.
        """
        self._truncation_manager.clear_cursors()

    def register_response_middleware(
        self,
        callback: Callable[[str, Dict[str, Any], ToolExecutionContext | None], Dict[str, Any]],
    ) -> None:
        """Register a response middleware, chained after successful tool execution.

        Args:
            callback: callback with signature ``(tool_name, result, context) -> result``.
                ``context`` carries ``run_id``, ``iteration_id``, ``tool_call_id``,
                ``index_in_iteration``
                and other fields, letting middleware implement per-iteration logic.
                multiple middleware run in registration order.

        Returns:
            None.
        """

        self._response_middlewares.append(callback)

    def register(
        self,
        name: str,
        func: Callable[..., object],
        schema: Any,
    ) -> None:
        """
        register a tool.

        Args:
            name: tool name (must match function.name in the schema)
            func: tool function
            schema: ToolSchema or OpenAI tool-definition schema dict
        """
        if name != "fetch_more" and "fetch_more" not in self.tools:
            # mount the framework-level continuation tool only after the first real tool is registered, so an empty registry never exposes fetch_more.
            Log.verbose("auto-mounted the fetch_more continuation tool", module=MODULE)
            self.register_fetch_more_tool()

        tool_schema = self._coerce_tool_schema(name, schema)
        openai_schema = tool_schema.to_openai()

        # validate schema structure and name
        self._validate_tool_schema(name, openai_schema)

        if name in self.tools:
            Log.warn(f"tool '{name}' already exists and will be overwritten", module=MODULE)

        self.tools[name] = func
        self.schemas[name] = openai_schema
        self.tool_schemas[name] = tool_schema
        raw_tags = getattr(func, "__tool_tags__", set())
        raw_extra = getattr(func, "__tool_extra__", None)
        self.tool_descriptors[name] = ToolDescriptor(
            name=name,
            tags=set(raw_tags) if raw_tags else set(),
            dup_call=getattr(raw_extra, "__dup_call__", None),
            execution_context_param_name=getattr(
                raw_extra, "__execution_context_param_name__", None
            ),
            display_name=getattr(raw_extra, "__display_name__", None),
            summary_params=getattr(raw_extra, "__summary_params__", None),
        )

        Log.debug(f"registered tool: {name}", module=MODULE)

    def _coerce_tool_schema(self, name: str, schema: Any) -> ToolSchema:
        """
        Normalize schema input into ToolSchema.

        Args:
            name: Tool name for validation context.
            schema: ToolSchema or OpenAI schema dict.

        Returns:
            ToolSchema instance.
        """
        if isinstance(schema, ToolSchema):
            return schema
        if not isinstance(schema, dict):
            raise ConfigError("tool_schema", None, "schema must be a dict or ToolSchema")

        function = schema.get("function", {})
        return ToolSchema(
            function=ToolFunctionSchema(
                name=function.get("name", name),
                description=function.get("description", ""),
                parameters=function.get("parameters", {}),
            )
        )

    def _validate_tool_schema(self, name: str, schema: Dict[str, Any]) -> None:
        """
        validate the tool schema against best practices.
        """
        if not isinstance(schema, dict):
            raise ConfigError("tool_schema", None, "schema must be a dict")

        if schema.get("type") != "function":
            raise ConfigError("tool_schema", None, "schema.type must be 'function'")

        function = schema.get("function")
        if not isinstance(function, dict):
            raise ConfigError("tool_schema", None, "schema.function must be an object")

        schema_name = function.get("name")
        if not isinstance(schema_name, str) or not schema_name:
            raise ConfigError("tool_schema", None, "schema.function.name must be a non-empty string")
        if schema_name != name:
            raise ConfigError(
                "tool_registration",
                None,
                f"tool name mismatch: register(name='{name}') "
                f"but schema.function.name='{schema_name}'",
            )

        description = function.get("description")
        if description is not None and not isinstance(description, str):
            raise ConfigError("tool_schema", None, "schema.function.description must be a string")

        parameters = function.get("parameters")
        if not isinstance(parameters, dict):
            raise ConfigError("tool_schema", None, "schema.function.parameters must be an object")
        if parameters.get("type") != "object":
            raise ConfigError(
                "tool_schema", None, "schema.function.parameters.type must be 'object'"
            )

        properties = parameters.get("properties")
        if not isinstance(properties, dict):
            raise ConfigError(
                "tool_schema", None, "schema.function.parameters.properties must be an object"
            )

        required = parameters.get("required")
        if required is not None:
            if not isinstance(required, list) or any(
                not isinstance(item, str) for item in required
            ):
                raise ConfigError(
                    "tool_schema", None, "schema.function.parameters.required must be an array of strings"
                )

        additional_props = parameters.get("additionalProperties")
        if additional_props is not None and not isinstance(additional_props, bool):
            raise ConfigError(
                "tool_schema",
                None,
                "schema.function.parameters.additionalProperties must be a boolean",
            )

    def get_schemas(self) -> list[dict[str, Any]]:
        """Get all tool schemas (for passing to the LLM)"""
        return list(self.schemas.values())

    def list_tools(self) -> List[str]:
        """Get all registered tool names"""
        return list(self.tools.keys())

    def get_allowed_paths(self) -> List[str]:
        """Get the allowed path list (normalized absolute paths)"""
        return sorted(str(p.resolve()) for p in self.allowed_paths)

    def register_fetch_more_tool(self) -> None:
        """
        register the unified continuation tool fetch_more(cursor, scope_token, limit).

        this tool is handled by ToolRegistry.execute; calling it directly raises.
        """
        if "fetch_more" in self.tools:
            return
        fetch_more_schema = {
            "type": "function",
            "function": {
                "name": "fetch_more",
                "description": "Continue reading a previously truncated tool result. Call only when the latest result has truncation.next_action=\"fetch_more\"; otherwise do not call.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "cursor": {
                            "type": "string",
                            "description": "Single-use continuation cursor. Use the truncation.fetch_more_args.cursor from the latest truncated result verbatim; a successful continuation returns the next page's new cursor — never reuse a cursor from an older result.",
                        },
                        "scope_token": {
                            "type": "string",
                            "description": "Scope-validation token. Use the truncation.fetch_more_args.scope_token from the same result as the current cursor.",
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Optional. Maximum number of items this continuation may return; must not exceed the limit the tool originally allowed.",
                            "minimum": 1,
                        },
                    },
                    "required": ["cursor", "scope_token"],
                },
            },
        }

        self.register("fetch_more", self._fetch_more_placeholder, fetch_more_schema)
        self.tool_descriptors["fetch_more"].display_name = "Continue reading"

    def _fetch_more_placeholder(
        self, cursor: str, scope_token: str, limit: Optional[int] = None
    ) -> None:
        """
        fetch_more placeholder function; prevents direct calls.
        """
        raise RuntimeError("fetch_more should be handled by ToolRegistry.execute")

    def register_allowed_paths(self, paths: List[Path]) -> None:
        """
        register accessible files or directories (path-whitelist safety mechanism)

        dynamically register accessible files and directories. When a tool executes (via file_path_params-declared
        path arguments) are automatically validated against the registered whitelist.

        Args:
            paths: list of file or directory paths (Path objects or strings)

        Raises:
            ConfigError: raised when the path does not exist

        Example:
            >>> registry = ToolRegistry()
            >>> registry.register_allowed_paths([
            ...     Path("workspace/config"),          # directory
            ...     Path("workspace/prompts"),         # directory
            ...     Path("output/logs/app.log"),       # single file
            ...     Path("manual/GUIDE.md")            # single file
            ... ])
        """
        for path in paths:
            path_obj = Path(path).resolve()

            # verify the path exists
            if not path_obj.exists():
                raise ConfigError(
                    "register_allowed_paths", None, f"path does not exist: {path} (resolved to {path_obj})"
                )

            # add to the whitelist
            self.allowed_paths.add(path_obj)

            Log.debug(f"registered path: {path_obj}", module=MODULE)

        Log.debug(
            f"registered {len(paths)} paths; total allowed paths: {len(self.allowed_paths)}",
            module=MODULE,
        )

    def _validate_path(self, path: str) -> Path:
        """
        validate the path is within the allowed range (new safety mechanism)

        safety-check mechanism:
        1. Symlink-escape protection: resolve() resolves all symlinks before checking
        2. path-traversal protection: forbid escapes like ../
        3. absolute-path normalization: convert everything to absolute paths before comparing
        4. existence check: ensure the path exists
        5. whitelist validation: must be within allowed_paths

        Args:
            path: file path to validate (relative or absolute)

        Returns:
            Path: the validated, normalized absolute path

        Raises:
            PermissionError: the path is outside the allowed range
            FileNotFoundError: the path does not exist

        Example:
            >>> registry = ToolRegistry()
            >>> registry.register_allowed_paths([Path("workspace/config")])
            >>> validated = registry._validate_path("workspace/config/llm_models.json")
            >>> # allowed: under workspace/config
            >>>
            >>> validated = registry._validate_path("/etc/passwd")
            >>> # denied: PermissionError
        """
        # 1. convert to an absolute path and resolve all symlinks
        try:
            resolved_path = Path(path).resolve(strict=False)
        except (OSError, RuntimeError) as e:
            raise PermissionError(f"invalid path: {path} ({e})") from e

        # 2. check the path exists
        if not resolved_path.exists():
            raise FileNotFoundError(f"path does not exist: {path} (resolved to {resolved_path})")

        # 3. check it is within the allowed paths
        for resolved_allowed in self.allowed_paths:
            try:
                # check resolved_path is under resolved_allowed
                # if it is a file, check whether the file itself matches
                if resolved_allowed.is_file():
                    if resolved_path == resolved_allowed:
                        return resolved_path  # exact match on a single file
                else:
                    # if it is a directory, check membership under it
                    resolved_path.relative_to(resolved_allowed)
                    return resolved_path  # within an allowed directory
            except ValueError:
                continue  # not under the current allowed_path; check the next one

        # 4. no allowed path matches
        raise PermissionError(
            f"access denied: {path} (resolved to {resolved_path}) is outside the allowed paths.\n"
            f"registered paths: {[str(p) for p in self.allowed_paths]}"
        )

    def get_tool_names(self) -> Set[str]:
        """Get the name set of registered tools (excluding fetch_more)"""
        names: Set[str] = set()
        for name in self.tool_descriptors.keys():
            if name == "fetch_more":
                continue
            names.add(name)
        return names

    def get_tool_tags(self) -> Set[str]:
        """Get the tag set of registered tools (excluding fetch_more)"""
        tags: Set[str] = set()
        for name, descriptor in self.tool_descriptors.items():
            if name == "fetch_more":
                continue
            if descriptor.tags:
                tags.update(descriptor.tags)
        return tags

    def get_dup_call_spec(self, name: str) -> Optional[DupCallSpec]:
        """Read the duplicate-call policy declaration for a tool.

        Args:
            name: tool name.

        Returns:
            ``DupCallSpec``; ``None`` when undeclared or the tool does not exist.

        Raises:
            None.
        """

        descriptor = self.tool_descriptors.get(name)
        if descriptor is None:
            return None
        return descriptor.dup_call

    def get_execution_context_param_name(self, name: str) -> str | None:
        """Read the execution-context injection parameter name for a tool.

        Args:
            name: tool name.

        Returns:
            parameter name; ``None`` when undeclared or the tool does not exist.

        Raises:
            None.
        """

        descriptor = self.tool_descriptors.get(name)
        if descriptor is None:
            return None
        return descriptor.execution_context_param_name

    def get_tool_display_info(self, name: str) -> tuple[str, list[str] | None]:
        """Read user-facing display metadata for a tool.

        Args:
            name: tool name.

        Returns:
            ``(display_name, summary_params)`` pair; display_name falls back to name,
            summary_params of None means no parameter summary is displayed.

        Raises:
            None.
        """

        descriptor = self.tool_descriptors.get(name)
        if descriptor is None:
            return name, None
        return descriptor.display_name or name, descriptor.summary_params

    def execute(
        self,
        name: str,
        arguments: Dict[str, Any],
        context: ToolExecutionContext | None = None,
    ) -> Dict[str, Any]:
        """Execute a tool and return a structured result.

        note: this method does not raise; all failures are expressed via ok/error in the return value.

        Args:
            name: tool name.
            arguments: tool arguments.
            context: optional execution context.

        Returns:
            dict in the unified envelope format:
            success: ``{"ok": True, "value": <any>, "truncation": {...}|None, "meta": {...}|None}``
            failure: ``{"ok": False, "error": "<code>", "message": "..."}``
        """
        # Log.debug(f"execute tool: {name}, arguments: {arguments}", module=MODULE)

        try:
            # check whether the tool exists
            if name not in self.tools:
                return build_error(
                    "tool_not_found",
                    f"tool '{name}' does not exist",
                    available_tools=list(self.tools.keys()),
                )

            # argument validation and normalization
            schema = self.schemas.get(name, {})
            parameters = schema.get("function", {}).get("parameters")
            validation = self._argument_validator.validate_and_coerce(arguments, parameters)
            if not validation["ok"]:
                return validation

            if name == "fetch_more":
                return self._truncation_manager.execute_fetch_more(validation["arguments"], context)

            # before executing the tool: automatic path safety check
            arguments = validation["arguments"]
            func = self.tools[name]

            # check whether the tool declares file_path_params
            tool_extra = getattr(func, "__tool_extra__", None)
            file_path_params = getattr(tool_extra, "__file_path_params__", None)
            if file_path_params:
                if not self.allowed_paths:
                    Log.error(
                        (
                            f"Tool {name} declares file_path_params={file_path_params},"
                            "but no allowed_paths are registered; refusing to execute (fail-closed)"
                        ),
                        module=MODULE,
                    )
                    return build_error(
                        "permission_denied",
                        "no path whitelist configured; refusing filesystem access",
                        hint=f"Tool {name} requires allowed paths registered via register_allowed_paths() first",
                    )
                for param_name in file_path_params:
                    if param_name in arguments:
                        param_value = arguments[param_name]
                        try:
                            # automatically validate the path and replace it with the normalized absolute path
                            validated_path = self._validate_path(param_value)
                            arguments[param_name] = str(validated_path)
                        except (PermissionError, FileNotFoundError) as e:
                            # path validation failed; return an error
                            Log.warn(
                                f"Tool {name} path validation failed: {param_name}={param_value} - {e}",
                                module=MODULE,
                            )
                            return build_error(
                                (
                                    "permission_denied"
                                    if isinstance(e, PermissionError)
                                    else "file_not_found"
                                ),
                                str(e),
                                hint=f"Path validation failed for argument {param_name}",
                            )

            execution_context_param_name = self.get_execution_context_param_name(name)
            if execution_context_param_name is None:
                result = func(**arguments)
            else:
                call_arguments = dict(arguments)
                call_arguments[execution_context_param_name] = context
                result = func(**call_arguments)

            # truncation handling
            truncate_spec = getattr(tool_extra, "__truncate__", None)
            value, truncation = self._truncation_manager.apply_truncation(
                name=name,
                arguments=arguments,
                value=result,
                context=context,
                truncate_spec=truncate_spec,
            )
            result = build_success(value=value, truncation=truncation)
            # chain the response middleware; pass context through to support per-iteration awareness (index_in_iteration)
            for middleware in self._response_middlewares:
                result = middleware(name, result, context)
            return result

        except ToolBusinessError as e:
            Log.warn(_format_tool_business_error_log(name, e), module=MODULE)
            return build_error(e.code, e.message, hint=e.hint, **e.extra)

        except CancelledError:
            Log.warn(f"tool {name} execution cancelled", module=MODULE)
            return build_error("cancelled", "tool execution cancelled")

        except FileNotFoundError as e:
            Log.warn(f"tool {name} execution failed: file not found - {e}", module=MODULE)
            return build_error("file_not_found", "file does not exist", hint=str(e))
        except (PermissionError, FileAccessError) as e:
            Log.warn(f"tool {name} execution failed: permission denied - {e}", module=MODULE)
            return build_error("permission_denied", "permission denied or path outside the safe range", hint=str(e))

        except TypeError as e:
            Log.error(f"tool {name} execution failed: argument error - {e}", module=MODULE)
            return build_error("invalid_argument", "wrong argument type or count", hint=str(e))

        except Exception as e:
            Log.error(f"tool {name} execution failed: {type(e).__name__} - {e}", module=MODULE)
            return build_error("execution_error", type(e).__name__, hint=str(e))
