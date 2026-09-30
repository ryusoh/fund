"""File-store interface definition."""

from __future__ import annotations

from typing import BinaryIO, Optional, Protocol

from scripts.vendor.filings.fins.domain.document_models import FileObjectMeta


class FileStore(Protocol):
    """Object-store interface protocol."""

    def put_object(
        self,
        key: str,
        data: BinaryIO,
        *,
        content_type: Optional[str] = None,
        metadata: Optional[dict[str, str]] = None,
    ) -> FileObjectMeta:
        """Write object content and return its metadata.

        Args:
            key: object key (a `bucket/key`-style logical path).
            data: binary stream.
            content_type: optional content type.
            metadata: optional extended metadata.

        Returns:
            file object metadata.

        Raises:
            OSError: raised when the write fails.
        """

        ...

    def get_object(self, key: str) -> BinaryIO:
        """Read object content.

        Args:
            key: object key.

        Returns:
            binary stream.

        Raises:
            FileNotFoundError: raised when the object does not exist.
        """

        ...

    def stat_object(self, key: str) -> FileObjectMeta:
        """Query object metadata.

        Args:
            key: object key.

        Returns:
            file object metadata.

        Raises:
            FileNotFoundError: raised when the object does not exist.
        """

        ...

    def delete_object(self, key: str) -> None:
        """Delete an object.

        Args:
            key: object key.

        Returns:
            None.

        Raises:
            FileNotFoundError: raised when the object does not exist.
        """

        ...

    def get_presigned_url(self, key: str, expires_in: int) -> str:
        """Get a presigned URL (optional implementation).

        Args:
            key: object key.
            expires_in: expiry in seconds.

        Returns:
            presigned URL.

        Raises:
            NotImplementedError: raised when not implemented.
        """

        ...

    def list_objects(self, prefix: str) -> list[FileObjectMeta]:
        """List objects by prefix.

        Args:
            prefix: object prefix.

        Returns:
            object metadata list.

        Raises:
            OSError: raised when the read fails.
        """

        ...
