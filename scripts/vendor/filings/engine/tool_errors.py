"""Tool business-error module.

Defines ``ToolBusinessError``, raised by tool implementations when business
logic fails; ToolRegistry catches it uniformly and converts it into the
standard error envelope.

Usage::

    from scripts.vendor.filings.engine.tool_errors import ToolBusinessError

    # in a tool implementation
    raise ToolBusinessError(
        code="not_found",
        message="Document 'xyz' not found for ticker 'AAPL'",
        hint="Verify the document_id via list_documents",
    )
"""

from __future__ import annotations

from typing import Any


class ToolBusinessError(Exception):
    """Tool business-layer error.

    Raised when tool execution succeeds technically but the business logic is
    not satisfied (e.g. resource not found, invalid argument); caught by
    ToolRegistry and converted into the standard ``build_error()`` envelope.

    Attributes:
        code: error code (corresponds to an ``ErrorCode`` enum value, e.g. ``"not_found"``).
        message: human-readable error description.
        hint: LLM-actionable recovery suggestion.
        extra: additional context fields.
    """

    def __init__(
        self,
        code: str,
        message: str,
        *,
        hint: str = "",
        **extra: Any,
    ) -> None:
        """Initialize the business error.

        Args:
            code: error-code string.
            message: error description.
            hint: recovery suggestion (optional).
            **extra: additional context.
        """
        super().__init__(message)
        self.code = code
        self.message = message
        self.hint = hint
        self.extra = extra
