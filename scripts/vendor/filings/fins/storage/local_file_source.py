"""Local-file Source implementation."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO, Optional


@dataclass(frozen=True)
class LocalFileSource:
    """Local file source."""

    path: Path
    uri: str
    media_type: Optional[str] = None
    content_length: Optional[int] = None
    etag: Optional[str] = None

    def open(self) -> BinaryIO:
        """Open a read-only stream.

        Args:
            None.

        Returns:
            binary read-only stream.

        Raises:
            OSError: raised when the open fails.
        """

        return self.path.open("rb")

    def materialize(self, suffix: Optional[str] = None) -> Path:
        """Materialize to a local path.

        Args:
            suffix: optional suffix (ignored by the local implementation).

        Returns:
            readable local path.

        Raises:
            OSError: raised when the path is unavailable.
        """

        return self.path
