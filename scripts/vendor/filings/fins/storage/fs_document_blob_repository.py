"""Filesystem-based document file-object repository implementation."""

from __future__ import annotations

from pathlib import Path
from typing import BinaryIO, Optional

from scripts.vendor.filings.fins.domain.document_models import (
    DocumentEntry,
    FileObjectMeta,
    ProcessedHandle,
    SourceHandle,
)

from ._fs_repository_factory import _FsRepositorySet, build_fs_repository_set
from .file_store import FileStore
from .repository_protocols import DocumentBlobRepositoryProtocol


class FsDocumentBlobRepository(DocumentBlobRepositoryProtocol):
    """Filesystem-based document file-object repository implementation."""

    def __init__(
        self,
        workspace_root: Path,
        *,
        file_store: Optional[FileStore] = None,
        repository_set: Optional[_FsRepositorySet] = None,
    ) -> None:
        """Initialize the document file-object repository.

        Args:
            workspace_root: workspace root directory.
            file_store: optional file-store implementation.
            repository_set: optional shared repository core set.

        Returns:
            None.

        Raises:
            OSError: raised when the underlying repository initialization fails.
        """

        self._repository_set = build_fs_repository_set(
            workspace_root=workspace_root,
            file_store=file_store,
            repository_set=repository_set,
        )

    def list_entries(self, handle: SourceHandle | ProcessedHandle) -> list[DocumentEntry]:
        """List direct child entries of a document directory."""

        return self._repository_set.core.list_entries(handle)

    def read_file_bytes(self, handle: SourceHandle | ProcessedHandle, name: str) -> bytes:
        """Read file byte content."""

        return self._repository_set.core.read_file_bytes(handle, name)

    def delete_entry(self, handle: SourceHandle | ProcessedHandle, name: str) -> None:
        """Delete a direct child entry."""

        self._repository_set.core.delete_entry(handle, name)

    def store_file(
        self,
        handle: SourceHandle | ProcessedHandle,
        filename: str,
        data: BinaryIO,
        *,
        content_type: Optional[str] = None,
        metadata: Optional[dict[str, str]] = None,
    ) -> FileObjectMeta:
        """Write a file object."""

        return self._repository_set.core.store_file(
            handle=handle,
            filename=filename,
            data=data,
            content_type=content_type,
            metadata=metadata,
        )

    def list_files(self, handle: SourceHandle | ProcessedHandle) -> list[FileObjectMeta]:
        """List file object metadata in a directory."""

        return self._repository_set.core.list_files(handle)
