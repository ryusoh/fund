"""Narrow filing-storage protocol definitions.

This module splits the filing-storage protocols by real responsibility
cluster, avoiding a single repository that simultaneously handles:
- batch transactions
- company-level metadata
- source-document CRUD
- processed-output CRUD
- file-blob read/write
- filing maintenance & governance
"""

from __future__ import annotations

from typing import BinaryIO, Optional, Protocol

from scripts.vendor.filings.engine.processors.source import Source
from scripts.vendor.filings.fins.domain.document_models import (
    BatchToken,
    CompanyMeta,
    CompanyMetaInventoryEntry,
    DocumentEntry,
    DocumentHandle,
    DocumentMeta,
    DocumentQuery,
    DocumentSummary,
    FileObjectMeta,
    ProcessedCreateRequest,
    ProcessedDeleteRequest,
    ProcessedHandle,
    ProcessedUpdateRequest,
    RejectedFilingArtifact,
    RejectedFilingArtifactUpsertRequest,
    SourceDocumentStateChangeRequest,
    SourceDocumentUpsertRequest,
    SourceHandle,
)
from scripts.vendor.filings.fins.domain.enums import SourceKind


class BatchingRepositoryProtocol(Protocol):
    """Batch transaction repository protocol."""

    def begin_batch(self, ticker: str) -> BatchToken:
        """Open a batch transaction."""
        ...

    def commit_batch(self, token: BatchToken) -> None:
        """Commit a batch transaction."""
        ...

    def rollback_batch(self, token: BatchToken) -> None:
        """Roll back a batch transaction."""
        ...

    def recover_orphan_batches(self, *, dry_run: bool = False) -> tuple[str, ...]:
        """Recover orphan batches/backups left behind by an abnormal exit."""
        ...


class CompanyMetaRepositoryProtocol(Protocol):
    """Company-level metadata repository protocol."""

    def scan_company_meta_inventory(self) -> list[CompanyMetaInventoryEntry]:
        """Scan company directories and return a metadata inventory."""
        ...

    def get_company_meta(self, ticker: str) -> CompanyMeta:
        """Read company-level metadata.

        Args:
            ticker: ticker.

        Returns:
            metadata object for the corresponding company.

        Raises:
            FileNotFoundError: raised when the metadata does not exist.
            ValueError: raised when metadata content is missing or malformed.
            OSError: raised when the underlying filesystem read fails.
        """
        ...

    def upsert_company_meta(self, meta: CompanyMeta) -> None:
        """Write company-level metadata."""
        ...

    def resolve_existing_ticker(self, ticker_candidates: list[str]) -> Optional[str]:
        """Resolve the canonical ticker that exists in the workspace among the candidates."""
        ...


class SourceDocumentRepositoryProtocol(Protocol):
    """Source-document repository protocol."""

    def has_source_storage_root(self, ticker: str, source_kind: SourceKind) -> bool:
        """Determine whether a source-document root directory exists and is a directory."""
        ...

    def has_filing_xbrl_instance(self, ticker: str, document_id: str) -> bool:
        """Determine whether an XBRL instance file already exists in a filing directory."""
        ...

    def create_source_document(
        self,
        req: SourceDocumentUpsertRequest,
        source_kind: SourceKind,
    ) -> DocumentHandle:
        """Create a source document."""
        ...

    def update_source_document(
        self,
        req: SourceDocumentUpsertRequest,
        source_kind: SourceKind,
    ) -> DocumentHandle:
        """Update a source document."""
        ...

    def delete_source_document(self, req: SourceDocumentStateChangeRequest) -> None:
        """Logically delete a source document."""
        ...

    def reset_source_document(
        self,
        ticker: str,
        document_id: str,
        source_kind: SourceKind,
    ) -> None:
        """Reset the complete storage of a single source document.

        Args:
            ticker: ticker.
            document_id: document ID.
            source_kind: source kind.

        Returns:
            None.

        Raises:
            OSError: raised when resetting the underlying storage fails.
        """
        ...

    def restore_source_document(self, req: SourceDocumentStateChangeRequest) -> DocumentHandle:
        """Restore a logically deleted source document."""
        ...

    def get_source_meta(
        self,
        ticker: str,
        document_id: str,
        source_kind: SourceKind,
    ) -> DocumentMeta:
        """Read source-document meta."""
        ...

    def replace_source_meta(
        self,
        ticker: str,
        document_id: str,
        source_kind: SourceKind,
        meta: DocumentMeta,
    ) -> None:
        """Replace source-document meta wholesale."""
        ...

    def list_source_document_ids(self, ticker: str, source_kind: SourceKind) -> list[str]:
        """List source document IDs by source."""
        ...

    def get_source_handle(
        self, ticker: str, document_id: str, source_kind: SourceKind
    ) -> SourceHandle:
        """Construct a source-document handle."""
        ...

    def get_primary_file(
        self, ticker: str, document_id: str, source_kind: SourceKind
    ) -> FileObjectMeta:
        """Read source-document primary-file object metadata."""
        ...

    def get_source(
        self, ticker: str, document_id: str, source_kind: SourceKind, filename: str
    ) -> Source:
        """Read source-document specific-file source."""
        ...

    def get_primary_source(self, ticker: str, document_id: str, source_kind: SourceKind) -> Source:
        """Read source-document primary-file source."""
        ...


class ProcessedDocumentRepositoryProtocol(Protocol):
    """processed-artifact repository protocol."""

    def create_processed(self, req: ProcessedCreateRequest) -> DocumentHandle:
        """Create a processed document."""
        ...

    def update_processed(self, req: ProcessedUpdateRequest) -> DocumentHandle:
        """Update a processed document."""
        ...

    def delete_processed(self, req: ProcessedDeleteRequest) -> None:
        """Delete a processed document."""
        ...

    def get_processed_handle(self, ticker: str, document_id: str) -> ProcessedHandle:
        """Construct a processed handle."""
        ...

    def get_processed_meta(self, ticker: str, document_id: str) -> DocumentMeta:
        """Read processed meta."""
        ...

    def list_processed_documents(self, ticker: str, query: DocumentQuery) -> list[DocumentSummary]:
        """List processed document summaries by query."""
        ...

    def clear_processed_documents(self, ticker: str) -> None:
        """Clear all processed artifacts under a ticker."""
        ...

    def mark_processed_reprocess_required(
        self, ticker: str, document_id: str, required: bool
    ) -> None:
        """Mark whether a processed document needs reprocessing."""
        ...


class DocumentBlobRepositoryProtocol(Protocol):
    """Document-blob repository protocol."""

    def list_entries(self, handle: SourceHandle | ProcessedHandle) -> list[DocumentEntry]:
        """List direct child entries of a document directory."""
        ...

    def read_file_bytes(self, handle: SourceHandle | ProcessedHandle, name: str) -> bytes:
        """Read file byte content."""
        ...

    def delete_entry(self, handle: SourceHandle | ProcessedHandle, name: str) -> None:
        """Delete a direct child entry."""
        ...

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
        ...

    def list_files(self, handle: SourceHandle | ProcessedHandle) -> list[FileObjectMeta]:
        """List file object metadata in a directory."""
        ...


class FilingMaintenanceRepositoryProtocol(Protocol):
    """Filing-maintenance governance repository protocol."""

    def clear_filing_documents(self, ticker: str) -> None:
        """Clear all filing documents under a ticker."""
        ...

    def load_download_rejection_registry(self, ticker: str) -> dict[str, dict[str, str]]:
        """Read the download-rejection registry."""
        ...

    def save_download_rejection_registry(
        self,
        ticker: str,
        registry: dict[str, dict[str, str]],
    ) -> None:
        """Save the download-rejection registry."""
        ...

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
        ...

    def upsert_rejected_filing_artifact(
        self,
        req: RejectedFilingArtifactUpsertRequest,
    ) -> RejectedFilingArtifact:
        """Write or update a rejected filing artifact."""
        ...

    def get_rejected_filing_artifact(
        self,
        ticker: str,
        document_id: str,
    ) -> RejectedFilingArtifact:
        """Read a rejected filing artifact."""
        ...

    def list_rejected_filing_artifacts(
        self,
        ticker: str,
    ) -> list[RejectedFilingArtifact]:
        """List rejected filing artifacts under a ticker."""
        ...

    def read_rejected_filing_file_bytes(
        self,
        ticker: str,
        document_id: str,
        filename: str,
    ) -> bytes:
        """Read rejected filing file content."""
        ...

    def cleanup_stale_filing_documents(
        self,
        ticker: str,
        *,
        active_form_types: set[str],
        valid_document_ids: set[str],
    ) -> int:
        """Clean up filing documents not in the valid set."""
        ...


__all__ = [
    "BatchingRepositoryProtocol",
    "CompanyMetaRepositoryProtocol",
    "SourceDocumentRepositoryProtocol",
    "ProcessedDocumentRepositoryProtocol",
    "DocumentBlobRepositoryProtocol",
    "FilingMaintenanceRepositoryProtocol",
]
