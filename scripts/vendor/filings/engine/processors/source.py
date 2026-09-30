"""Source protocol definition for processor inputs.

This module sits in the engine core layer and defines the input abstraction
that all document processors uniformly depend on.
Design goals:
- Let processors depend only on the protocol, not on any concrete storage
  implementation (local files, object storage, databases, etc.).
- Provide a uniform and stable processing entry point for different business
  domains (fins and future domains).
"""

from __future__ import annotations

from pathlib import Path
from typing import BinaryIO, Optional, Protocol


class Source(Protocol):
    """Uniform document-source abstraction protocol."""

    @property
    def uri(self) -> str:
        """Return the resource URI."""

        ...

    @property
    def media_type(self) -> Optional[str]:
        """Return the media type."""

        ...

    @property
    def content_length(self) -> Optional[int]:
        """Return the content length."""

        ...

    @property
    def etag(self) -> Optional[str]:
        """Return the object etag."""

        ...

    def open(self) -> BinaryIO:
        """Open a read-only stream.

        Args:
            None.

        Returns:
            binary read-only stream.

        Raises:
            OSError: raised when the open fails.
        """

        ...

    def materialize(self, suffix: Optional[str] = None) -> Path:
        """Materialize to a locally readable path.

        Args:
            suffix: optional suffix (usually for temporary files).

        Returns:
            locally readable path.

        Raises:
            OSError: raised when materialization fails.
        """

        ...
