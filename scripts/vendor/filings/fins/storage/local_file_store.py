"""Local-filesystem object-store implementation."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from pathlib import Path
from typing import BinaryIO, Optional

from scripts.vendor.filings.fins.domain.document_models import FileObjectMeta

from .file_store import FileStore


class LocalFileStore(FileStore):
    """Local-filesystem-based object-store implementation."""

    def __init__(self, root: Path, scheme: str = "local") -> None:
        """Initialize the local object store.

        Args:
            root: storage root directory.
            scheme: URI scheme (default local).

        Returns:
            None.

        Raises:
            ValueError: raised when root is empty or the scheme is invalid.
            OSError: raised when directory creation fails.
        """

        if not scheme or not scheme.strip():
            raise ValueError("scheme must not be empty")
        self._scheme = scheme.strip()
        self._root = root.resolve()
        self._root.mkdir(parents=True, exist_ok=True)

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
            key: object key.
            data: binary stream.
            content_type: optional content type.
            metadata: optional extended metadata.

        Returns:
            file object metadata.

        Raises:
            ValueError: raised when the key is invalid.
            OSError: raised when the write fails.
        """

        path = self._resolve_key(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = path.with_suffix(path.suffix + ".part")
        if temp_path.exists():
            temp_path.unlink()
        sha256 = hashlib.sha256()
        size = 0
        with temp_path.open("wb") as stream:
            while True:
                chunk = data.read(1024 * 64)
                if not chunk:
                    break
                stream.write(chunk)
                sha256.update(chunk)
                size += len(chunk)
        temp_path.replace(path)
        return FileObjectMeta(
            uri=self._build_uri(key),
            etag=sha256.hexdigest(),
            last_modified=_iso_now(),
            size=size,
            content_type=content_type,
            sha256=sha256.hexdigest(),
        )

    def get_object(self, key: str) -> BinaryIO:
        """Read object content.

        Args:
            key: object key.

        Returns:
            binary stream.

        Raises:
            FileNotFoundError: raised when the object does not exist.
        """

        path = self._resolve_key(key)
        if not path.exists():
            raise FileNotFoundError(f"object does not exist: {path}")
        return path.open("rb")

    def stat_object(self, key: str) -> FileObjectMeta:
        """Query object metadata.

        Args:
            key: object key.

        Returns:
            file object metadata.

        Raises:
            FileNotFoundError: raised when the object does not exist.
        """

        path = self._resolve_key(key)
        if not path.exists():
            raise FileNotFoundError(f"object does not exist: {path}")
        sha256 = _hash_file_sha256(path)
        stat = path.stat()
        return FileObjectMeta(
            uri=self._build_uri(key),
            etag=sha256,
            last_modified=_iso_from_timestamp(stat.st_mtime),
            size=stat.st_size,
            sha256=sha256,
        )

    def delete_object(self, key: str) -> None:
        """Delete an object.

        Args:
            key: object key.

        Returns:
            None.

        Raises:
            FileNotFoundError: raised when the object does not exist.
        """

        path = self._resolve_key(key)
        if not path.exists():
            raise FileNotFoundError(f"object does not exist: {path}")
        path.unlink()

    def get_presigned_url(self, key: str, expires_in: int) -> str:
        """Get a presigned URL (the local implementation returns the URI directly).

        Args:
            key: object key.
            expires_in: expiry in seconds.

        Returns:
            presigned URL.

        Raises:
            NotImplementedError: raised when the local implementation does not support presigning.
        """

        raise NotImplementedError("local file store does not support presigned URLs")

    def list_objects(self, prefix: str) -> list[FileObjectMeta]:
        """List objects by prefix.

        Args:
            prefix: object prefix.

        Returns:
            file object metadata list.

        Raises:
            OSError: raised when the read fails.
        """

        root = self._resolve_key(prefix)
        if not root.exists():
            return []
        items: list[FileObjectMeta] = []
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            key = path.relative_to(self._root).as_posix()
            items.append(self.stat_object(key))
        return items

    def _resolve_key(self, key: str) -> Path:
        """Resolve an object key to a local path.

        Args:
            key: object key.

        Returns:
            local path.

        Raises:
            ValueError: raised when the key is invalid or escapes the root.
        """

        normalized = key.strip().lstrip("/")
        if not normalized:
            raise ValueError("key must not be empty")
        path = (self._root / Path(*normalized.split("/"))).resolve()
        if self._root not in path.parents and path != self._root:
            raise ValueError("key escapes the root; accessing paths outside the root directory is forbidden")
        return path

    def _build_uri(self, key: str) -> str:
        """Construct an object URI.

        Args:
            key: object key.

        Returns:
            object URI.

        Raises:
            ValueError: raised when the key is empty.
        """

        normalized = key.strip().lstrip("/")
        if not normalized:
            raise ValueError("key must not be empty")
        return f"{self._scheme}://{normalized}"


def _hash_file_sha256(path: Path) -> str:
    """Compute the sha256 of a file.

    Args:
        path: file path.

    Returns:
        sha256 string.

    Raises:
        OSError: raised when the file cannot be read.
    """

    sha256 = hashlib.sha256()
    with path.open("rb") as stream:
        while True:
            chunk = stream.read(1024 * 64)
            if not chunk:
                break
            sha256.update(chunk)
    return sha256.hexdigest()


def _iso_from_timestamp(timestamp: float) -> str:
    """Convert a timestamp to ISO8601.

    Args:
        timestamp: timestamp.

    Returns:
        ISO8601 string.

    Raises:
        None.
    """

    return datetime.fromtimestamp(timestamp, UTC).isoformat()


def _iso_now() -> str:
    """Get the current UTC time in ISO8601 format.

    Args:
        None.

    Returns:
        ISO8601 string.

    Raises:
        None.
    """

    return datetime.now(UTC).isoformat()
