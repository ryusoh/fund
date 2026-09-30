"""Filesystem-based processed-document repository implementation."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from scripts.vendor.filings.fins.domain.document_models import (
    DocumentHandle,
    DocumentMeta,
    DocumentQuery,
    DocumentSummary,
    ProcessedCreateRequest,
    ProcessedDeleteRequest,
    ProcessedHandle,
    ProcessedUpdateRequest,
)

from ._fs_repository_factory import _FsRepositorySet, build_fs_repository_set
from .file_store import FileStore
from .repository_protocols import ProcessedDocumentRepositoryProtocol


class FsProcessedDocumentRepository(ProcessedDocumentRepositoryProtocol):
    """Filesystem-based processed-document repository implementation."""

    def __init__(
        self,
        workspace_root: Path,
        *,
        file_store: Optional[FileStore] = None,
        repository_set: Optional[_FsRepositorySet] = None,
    ) -> None:
        """Initialize the processed-document repository.

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

    def create_processed(self, req: ProcessedCreateRequest) -> DocumentHandle:
        """Create a processed document."""

        return self._repository_set.core.create_processed(req)

    def update_processed(self, req: ProcessedUpdateRequest) -> DocumentHandle:
        """Update a processed document."""

        return self._repository_set.core.update_processed(req)

    def delete_processed(self, req: ProcessedDeleteRequest) -> None:
        """Delete a processed document."""

        self._repository_set.core.delete_processed(req)

    def get_processed_handle(self, ticker: str, document_id: str) -> ProcessedHandle:
        """Construct a processed handle."""

        return self._repository_set.core.get_processed_handle(ticker, document_id)

    def get_processed_meta(self, ticker: str, document_id: str) -> DocumentMeta:
        """Read processed meta."""

        return self._repository_set.core.get_processed_meta(ticker, document_id)

    def list_processed_documents(self, ticker: str, query: DocumentQuery) -> list[DocumentSummary]:
        """List processed document summaries by query."""

        return self._repository_set.core.list_documents(ticker, query)

    def clear_processed_documents(self, ticker: str) -> None:
        """Clear all processed artifacts under a ticker."""

        self._repository_set.core.clear_processed_documents(ticker)

    def mark_processed_reprocess_required(
        self, ticker: str, document_id: str, required: bool
    ) -> None:
        """Mark whether a processed document needs reprocessing."""

        if not required:
            return
        self._repository_set.core.mark_processed_reprocess_required(ticker, document_id)
