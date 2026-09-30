"""
Custom exceptions module - adapted for the async streaming architecture

Design principles:
1. In an async + streaming architecture, most errors are delivered via error_event (the stream is not interrupted)
2. Only exceptions that must immediately abort execution are kept (config errors, API errors, tool safety errors)
3. Follows the Python exception hierarchy

Usage scenarios:
- Config loading failure -> ConfigError (raise)
    - API/CLI call failure -> error_event or generic EngineError
- Tool safety check failure -> Tool-family exceptions (raise)
- Excessive iteration counts, timeouts, etc. -> error_event (no raise; keep streaming)
"""

from typing import Any, Optional


class EngineError(Exception):
    """
    Base exception for the Engine package

    All exceptions in the Engine package inherit from this class for unified catching.
    """

    pass


class ConfigError(EngineError):
    """
    Config error (must abort immediately)

    Raised when a config file is malformed, a required field is missing, or an
    environment variable is not set. These errors are unrecoverable and must
    abort execution immediately.

    Attributes:
        config_name: config name
        config_file: config file path
        details: detailed error information

    Example:
        >>> raise ConfigError("deepseek_chat", "llm_models.json", "API key not set")
    """

    def __init__(
        self,
        config_name: Optional[str] = None,
        config_file: Optional[str] = None,
        details: str = "",
    ) -> None:
        """Initialize the config exception.

        Args:
            config_name: config name.
            config_file: config file path.
            details: detailed error information.

        Returns:
            None.

        Raises:
            None.
        """

        self.config_name = config_name
        self.config_file = config_file
        self.details = details

        # assemble the exception message as "config name -> file -> details" so the source is easy to locate in a terminal.
        message_parts = []
        if config_name:
            message_parts.append(f"config '{config_name}'")
        if config_file:
            message_parts.append(f"file '{config_file}'")
        if details:
            message_parts.append(f": {details}")

        message = " ".join(message_parts) if message_parts else "configuration error"
        super().__init__(message)


class ToolError(EngineError):
    """
    Tool error base class (safety-related, must abort)

    All tool-related errors inherit from this class.
    Tool errors usually involve safety issues (path traversal, permissions, etc.) and must abort immediately.
    """

    pass


class ToolNotFoundError(ToolError):
    """
    Tool-not-found error

    Raised when attempting to call an unregistered tool.

    Attributes:
        tool_name: tool name
        available_tools: list of available tools

    Example:
        >>> raise ToolNotFoundError("unknown_tool", ["read_file", "search_files"])
    """

    def __init__(self, tool_name: str, available_tools: Optional[list[str]] = None) -> None:
        """Initialize the tool-not-found exception.

        Args:
            tool_name: tool name requested by the caller.
            available_tools: list of available tools.

        Returns:
            None.

        Raises:
            None.
        """

        self.tool_name = tool_name
        self.available_tools = available_tools

        message = f"tool '{tool_name}' does not exist"
        if available_tools:
            message += f". Available tools: {', '.join(available_tools)}"

        super().__init__(message)


class ToolExecutionError(ToolError):
    """
    Tool execution error

    Raised when an error occurs during tool execution (usually caught and converted into an error_event).

    Attributes:
        tool_name: tool name
        tool_args: tool arguments
        original_error: original exception object

    Example:
        >>> try:
        ...     result = tool_func(**tool_args)
        ... except Exception as e:
        ...     raise ToolExecutionError("read_file", tool_args, e) from e
    """

    def __init__(
        self,
        tool_name: str,
        tool_args: Optional[dict[str, Any]] = None,
        original_error: Optional[Exception] = None,
    ) -> None:
        """Initialize the tool-execution exception.

        Args:
            tool_name: tool name.
            tool_args: tool argument dict.
            original_error: the original exception object.

        Returns:
            None.

        Raises:
            None.
        """

        self.tool_name = tool_name
        self.tool_args = tool_args
        self.original_error = original_error

        message = f"Tool '{tool_name}' execution failed"
        if original_error:
            message += f": {str(original_error)}"

        super().__init__(message)


class ToolArgumentError(ToolError):
    """
    Tool argument error (argument validation failure)

    Raised when a tool argument is malformed, a required argument is missing, or an argument value is invalid.

    Attributes:
        tool_name: tool name
        arg_name: argument name
        arg_value: argument value
        details: detailed error information

    Example:
        >>> raise ToolArgumentError("read_file", "start_line", -1, "must be >= 1")
    """

    def __init__(
        self,
        tool_name: str,
        arg_name: Optional[str] = None,
        arg_value: Optional[Any] = None,
        details: str = "",
    ) -> None:
        """Initialize the tool-argument exception.

        Args:
            tool_name: tool name.
            arg_name: argument name.
            arg_value: argument value.
            details: detailed error information.

        Returns:
            None.

        Raises:
            None.
        """

        self.tool_name = tool_name
        self.arg_name = arg_name
        self.arg_value = arg_value
        self.details = details

        # prefer assembling "tool + argument + argument value + details" for troubleshooting readability.
        message = f"Tool '{tool_name}' argument error"
        if arg_name:
            message += f", argument '{arg_name}'"
            if arg_value is not None:
                message += f" = {arg_value}"
        if details:
            message += f": {details}"

        super().__init__(message)


class FileAccessError(ToolError):
    """
    File access error (safety-related, must abort)

    Raised when file access is denied, the file does not exist, or the path is unsafe.
    This is a safety-check failure and must abort immediately.

    Attributes:
        directory: directory name
        filename: filename
        reason: rejection reason

    Example:
        >>> raise FileAccessError("data", "secret.txt", "file not in the whitelist")
    """

    def __init__(
        self,
        directory: Optional[str] = None,
        filename: Optional[str] = None,
        reason: str = "",
    ) -> None:
        """Initialize the file-access exception.

        Args:
            directory: directory name.
            filename: filename.
            reason: rejection reason.

        Returns:
            None.

        Raises:
            None.
        """

        self.directory = directory
        self.filename = filename
        self.reason = reason

        # the message keeps a fixed prefix, then appends directory, file, and rejection reason as available.
        message_parts = ["File access denied"]
        if directory and filename:
            message_parts.append(f": {directory}/{filename}")
        elif directory:
            message_parts.append(f": directory '{directory}'")
        elif filename:
            message_parts.append(f": file '{filename}'")

        if reason:
            message_parts.append(f" ({reason})")

        super().__init__(" ".join(message_parts))
