"""Global logging module - unified logging interface built on logging.

Provides simple levelled logging with support for:
- LogLevel-based filtering (mapped to logging levels)
- Timestamps and a unified output format
- All features of the standard logging module
- Optional exception stack-trace printing

Default output policy:
- Logs below `ERROR` go to stdout, preserving the runtime timeline in hosted/background scenarios
- Logs at `ERROR` and above go only to stderr, avoiding duplicate display of the same failure in the terminal

This module is global infrastructure, belongs to no architecture layer, and is imported directly by all packages.
"""

import logging
import sys
from enum import Enum
from typing import TextIO


class LogLevel(Enum):
    """Log level (mapped to logging levels)."""

    DEBUG = logging.DEBUG  # 10
    VERBOSE = 15  # Custom level, between DEBUG and INFO
    INFO = logging.INFO  # 20
    WARN = logging.WARNING  # 30
    ERROR = logging.ERROR  # 40


# Register the custom VERBOSE level
logging.addLevelName(LogLevel.VERBOSE.value, "VERBOSE")

_DEFAULT_LOG_FORMAT = "[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s"
_DEFAULT_LOG_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"
_STDERR_MIN_LEVEL = logging.ERROR
_STDOUT_MAX_LEVEL = _STDERR_MIN_LEVEL - 1

# ------------------------------------------------------------------
# Third-party library log-suppression rules
# ------------------------------------------------------------------
_ALWAYS_WARNING_LOGGERS = (
    "RapidOCR",
    "httpx",
    "asyncio",
    "charset_normalizer",
    "PIL",
    "chardet.charsetprober",
    "matplotlib",
)
_DEBUG_MODE_INFO_LOGGERS = (
    "httpcore",
    "urllib3",
    "urllib3.connectionpool",
    "edgar",
    "docling",
    "readability.readability",
)


class _LevelRangeFilter(logging.Filter):
    """Filter records by log-level range.

    Args:
        min_level: minimum level allowed through; no lower bound when empty.
        max_level: maximum level allowed through; no upper bound when empty.

    Returns:
        None.

    Raises:
        None.
    """

    def __init__(self, *, min_level: int | None = None, max_level: int | None = None) -> None:
        """Initialize the level-range filter.

        Args:
            min_level: minimum level allowed through; no lower bound when empty.
            max_level: maximum level allowed through; no upper bound when empty.

        Returns:
            None.

        Raises:
            None.
        """

        super().__init__()
        self._min_level = min_level
        self._max_level = max_level

    def filter(self, record: logging.LogRecord) -> bool:
        """Determine whether the current log record is allowed through.

        Args:
            record: log record to filter.

        Returns:
            `True` when the log level is within the allowed range, otherwise `False`.

        Raises:
            None.
        """

        if self._min_level is not None and record.levelno < self._min_level:
            return False
        if self._max_level is not None and record.levelno > self._max_level:
            return False
        return True


def _build_stream_handler(
    *,
    stream: TextIO,
    min_level: int | None = None,
    max_level: int | None = None,
) -> logging.Handler:
    """Build the default log-output handler.

    Args:
        stream: target output stream.
        min_level: minimum level allowed through; no lower bound when empty.
        max_level: maximum level allowed through; no upper bound when empty.

    Returns:
        `logging.Handler` with the unified format and level filter attached.

    Raises:
        None.
    """

    handler = logging.StreamHandler(stream=stream)
    handler.setLevel(logging.NOTSET)
    handler.setFormatter(
        logging.Formatter(fmt=_DEFAULT_LOG_FORMAT, datefmt=_DEFAULT_LOG_DATE_FORMAT)
    )
    handler.addFilter(_LevelRangeFilter(min_level=min_level, max_level=max_level))
    return handler


class Log:
    """Global log output class (based on the logging module)."""

    _loggers: dict[str, logging.Logger] = {}
    _configured: bool = False

    @classmethod
    def _ensure_configured(cls) -> None:
        """Ensure logging is configured (configured only once).

        Args:
            None.

        Returns:
            None.

        Raises:
            None.
        """

        if not cls._configured:
            root_logger = logging.getLogger()
            if not root_logger.handlers:
                root_logger.setLevel(logging.INFO)
                root_logger.addHandler(
                    _build_stream_handler(stream=sys.stdout, max_level=_STDOUT_MAX_LEVEL)
                )
                root_logger.addHandler(
                    _build_stream_handler(stream=sys.stderr, min_level=_STDERR_MIN_LEVEL)
                )
            cls._configured = True

    @classmethod
    def _get_logger(cls, module: str) -> logging.Logger:
        """Get or create the logger for a module."""

        cls._ensure_configured()
        if module not in cls._loggers:
            cls._loggers[module] = logging.getLogger(module)
        return cls._loggers[module]

    @classmethod
    def set_level(cls, min_level: LogLevel) -> None:
        """Set the global minimum log level.

        Args:
            min_level: minimum log level; logs below this level are not emitted.
        """

        cls._ensure_configured()
        logging.getLogger().setLevel(min_level.value)

        for name in _ALWAYS_WARNING_LOGGERS:
            logging.getLogger(name).setLevel(logging.WARNING)

        verbose_level = logging.INFO if min_level.value <= LogLevel.DEBUG.value else logging.WARNING
        for name in _DEBUG_MODE_INFO_LOGGERS:
            logging.getLogger(name).setLevel(verbose_level)

    @classmethod
    def debug(cls, message: str, *, module: str = "APP") -> None:
        """Emit a debug message."""

        cls._get_logger(module).debug(message)

    @classmethod
    def verbose(cls, message: str, *, module: str = "APP") -> None:
        """Emit a verbose message (custom level)."""

        cls._get_logger(module).log(LogLevel.VERBOSE.value, message)

    @classmethod
    def info(cls, message: str, *, module: str = "APP") -> None:
        """Emit a regular message."""

        cls._get_logger(module).info(message)

    @classmethod
    def warn(cls, message: str, *, module: str = "APP") -> None:
        """Emit a warning message."""

        cls._get_logger(module).warning(message)

    @classmethod
    def warning(cls, message: str, *, module: str = "APP") -> None:
        """Emit a warning message (alias of warn)."""

        cls.warn(message, module=module)

    @classmethod
    def error(cls, message: str, exc_info: bool = False, *, module: str = "APP") -> None:
        """Emit an error message.

        Args:
            message: error message.
            exc_info: whether to emit the exception stack trace.
            module: module name.
        """

        cls._get_logger(module).error(message, exc_info=exc_info)


def set_level_from_flags(
    *,
    log_level: str | None,
    debug: bool,
    verbose: bool,
    info: bool,
    quiet: bool,
) -> LogLevel:
    """Set the global log level from CLI-style arguments.

    Args:
        log_level: explicit log-level string.
        debug: whether DEBUG is enabled.
        verbose: whether VERBOSE is enabled.
        info: whether INFO is enabled.
        quiet: whether to emit ERROR only.

    Returns:
        effective log level.

    Raises:
        KeyError: raised when ``log_level`` is not a valid level name.
    """

    if log_level:
        selected_level = LogLevel[log_level.upper()]
    elif debug:
        selected_level = LogLevel.DEBUG
    elif verbose:
        selected_level = LogLevel.VERBOSE
    elif info:
        selected_level = LogLevel.INFO
    elif quiet:
        selected_level = LogLevel.ERROR
    else:
        selected_level = LogLevel.INFO
    Log.set_level(selected_level)
    return selected_level


__all__ = ["Log", "LogLevel", "set_level_from_flags"]
