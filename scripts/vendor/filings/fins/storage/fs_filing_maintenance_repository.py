"""Filesystem filing-maintenance governance repository implementation."""

from __future__ import annotations

from pathlib import Path
from typing import BinaryIO, Optional

from scripts.vendor.filings.fins.domain.document_models import (
    FileObjectMeta,
    RejectedFilingArtifact,
    RejectedFilingArtifactUpsertRequest,
)

from ._fs_repository_factory import _FsRepositorySet, build_fs_repository_set
from .file_store import FileStore
from .repository_protocols import FilingMaintenanceRepositoryProtocol


class FsFilingMaintenanceRepository(FilingMaintenanceRepositoryProtocol):
    """Filesystem-based filing-maintenance governance repository implementation."""

    def __init__(
        self,
        workspace_root: Path,
        *,
        file_store: Optional[FileStore] = None,
        repository_set: Optional[_FsRepositorySet] = None,
    ) -> None:
        """Initialize the filing-maintenance governance repository.

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

    def clear_filing_documents(self, ticker: str) -> None:
        """Clear all filing documents under a ticker."""

        self._repository_set.core.clear_filing_documents(ticker)

    def load_download_rejection_registry(self, ticker: str) -> dict[str, dict[str, str]]:
        """Read the download-rejection registry."""

        return self._repository_set.core.load_download_rejection_registry(ticker)

    def save_download_rejection_registry(
        self,
        ticker: str,
        registry: dict[str, dict[str, str]],
    ) -> None:
        """Save the download-rejection registry."""

        self._repository_set.core.save_download_rejection_registry(ticker, registry)

    def store_rejected_filing_file(
        self,
        ticker: str,
        document_id: str,
        filename: str,
        data: BinaryIO,
        *,
        content_type: Optional[str] = None,
        metadata: Optional[dict[str, str]] = None,
    ) -> FileObjectMeta:
        """Write a rejected filing file object."""

        return self._repository_set.core.store_rejected_filing_file(
            ticker=ticker,
            document_id=document_id,
            filename=filename,
            data=data,
            content_type=content_type,
            metadata=metadata,
        )

    def upsert_rejected_filing_artifact(
        self,
        req: RejectedFilingArtifactUpsertRequest,
    ) -> RejectedFilingArtifact:
        """Write or update a rejected filing artifact."""

        return self._repository_set.core.upsert_rejected_filing_artifact(req)

    def get_rejected_filing_artifact(
        self,
        ticker: str,
        document_id: str,
    ) -> RejectedFilingArtifact:
        """Read a rejected filing artifact."""

        return self._repository_set.core.get_rejected_filing_artifact(
            ticker=ticker,
            document_id=document_id,
        )

    def list_rejected_filing_artifacts(
        self,
        ticker: str,
    ) -> list[RejectedFilingArtifact]:
        """List rejected filing artifacts under a ticker."""

        return self._repository_set.core.list_rejected_filing_artifacts(ticker)

    def read_rejected_filing_file_bytes(
        self,
        ticker: str,
        document_id: str,
        filename: str,
    ) -> bytes:
        """Read rejected filing file content."""

        return self._repository_set.core.read_rejected_filing_file_bytes(
            ticker=ticker,
            document_id=document_id,
            filename=filename,
        )

    def cleanup_stale_filing_documents(
        self,
        ticker: str,
        *,
        active_form_types: set[str],
        valid_document_ids: set[str],
    ) -> int:
        """Clean up filing documents not in the valid set."""

        return self._repository_set.core.cleanup_stale_filing_documents(
            ticker,
            active_form_types=active_form_types,
            valid_document_ids=valid_document_ids,
        )
