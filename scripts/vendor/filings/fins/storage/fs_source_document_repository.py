"""Filesystem-based source-document repository implementation."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from scripts.vendor.filings.engine.processors.source import Source
from scripts.vendor.filings.fins.domain.document_models import (
    DocumentHandle,
    DocumentMeta,
    FileObjectMeta,
    FilingCreateRequest,
    FilingDeleteRequest,
    FilingRestoreRequest,
    FilingUpdateRequest,
    MaterialCreateRequest,
    MaterialDeleteRequest,
    MaterialRestoreRequest,
    MaterialUpdateRequest,
    SourceDocumentStateChangeRequest,
    SourceDocumentUpsertRequest,
    SourceHandle,
)
from scripts.vendor.filings.fins.domain.enums import SourceKind

from ._fs_repository_factory import _FsRepositorySet, build_fs_repository_set
from .file_store import FileStore
from .repository_protocols import SourceDocumentRepositoryProtocol


def _build_source_handle(ticker: str, document_id: str, source_kind: SourceKind) -> SourceHandle:
    """Construct a source-document handle.

    Args:
        ticker: ticker.
        document_id: document ID.
        source_kind: source document kind.

    Returns:
        source-document handle.

    Raises:
        None.
    """

    return SourceHandle(
        ticker=ticker,
        document_id=document_id,
        source_kind=source_kind.value,
    )


def _build_filing_create_request(req: SourceDocumentUpsertRequest) -> FilingCreateRequest:
    """Converge a generic write request into a filing create request.

    Args:
        req: generic source-document write request.

    Returns:
        filing create request.

    Raises:
        None.
    """

    return FilingCreateRequest(
        ticker=req.ticker,
        document_id=req.document_id,
        internal_document_id=req.internal_document_id,
        form_type=req.form_type,
        primary_document=req.primary_document,
        meta=req.meta,
        files=req.files,
        file_entries=req.file_entries,
    )


def _build_material_create_request(req: SourceDocumentUpsertRequest) -> MaterialCreateRequest:
    """Converge a generic write request into a material create request.

    Args:
        req: generic source-document write request.

    Returns:
        material create request.

    Raises:
        None.
    """

    return MaterialCreateRequest(
        ticker=req.ticker,
        document_id=req.document_id,
        internal_document_id=req.internal_document_id,
        form_type=req.form_type,
        primary_document=req.primary_document,
        meta=req.meta,
        files=req.files,
        file_entries=req.file_entries,
    )


def _build_filing_update_request(req: SourceDocumentUpsertRequest) -> FilingUpdateRequest:
    """Converge a generic write request into a filing update request.

    Args:
        req: generic source-document write request.

    Returns:
        filing update request.

    Raises:
        None.
    """

    return FilingUpdateRequest(
        ticker=req.ticker,
        document_id=req.document_id,
        internal_document_id=req.internal_document_id,
        form_type=req.form_type,
        primary_document=req.primary_document,
        meta=req.meta,
        files=req.files,
        file_entries=req.file_entries,
    )


def _build_material_update_request(req: SourceDocumentUpsertRequest) -> MaterialUpdateRequest:
    """Converge a generic write request into a material update request.

    Args:
        req: generic source-document write request.

    Returns:
        material update request.

    Raises:
        None.
    """

    return MaterialUpdateRequest(
        ticker=req.ticker,
        document_id=req.document_id,
        internal_document_id=req.internal_document_id,
        form_type=req.form_type,
        primary_document=req.primary_document,
        meta=req.meta,
        files=req.files,
        file_entries=req.file_entries,
    )


def _build_filing_delete_request(req: SourceDocumentStateChangeRequest) -> FilingDeleteRequest:
    """Converge a generic state-change request into a filing delete request.

    Args:
        req: generic source-document state-change request.

    Returns:
        filing delete request.

    Raises:
        None.
    """

    return FilingDeleteRequest(ticker=req.ticker, document_id=req.document_id)


def _build_material_delete_request(req: SourceDocumentStateChangeRequest) -> MaterialDeleteRequest:
    """Converge a generic state-change request into a material delete request.

    Args:
        req: generic source-document state-change request.

    Returns:
        material delete request.

    Raises:
        None.
    """

    return MaterialDeleteRequest(ticker=req.ticker, document_id=req.document_id)


def _build_filing_restore_request(req: SourceDocumentStateChangeRequest) -> FilingRestoreRequest:
    """Converge a generic state-change request into a filing restore request.

    Args:
        req: generic source-document state-change request.

    Returns:
        filing restore request.

    Raises:
        None.
    """

    return FilingRestoreRequest(ticker=req.ticker, document_id=req.document_id)


def _build_material_restore_request(
    req: SourceDocumentStateChangeRequest,
) -> MaterialRestoreRequest:
    """Converge a generic state-change request into a material restore request.

    Args:
        req: generic source-document state-change request.

    Returns:
        material restore request.

    Raises:
        None.
    """

    return MaterialRestoreRequest(ticker=req.ticker, document_id=req.document_id)


def _infer_filename_from_uri(uri: str) -> str:
    """Infer a filename from a file URI.

    Args:
        uri: file URI.

    Returns:
        filename; empty string on parse failure.

    Raises:
        None.
    """

    raw_uri = str(uri).strip()
    if not raw_uri:
        return ""
    if "://" in raw_uri:
        raw_uri = raw_uri.split("://", 1)[1]
    raw_uri = raw_uri.rstrip("/")
    if not raw_uri:
        return ""
    return Path(raw_uri).name or raw_uri.split("/")[-1]


def _find_file_meta_by_filename(file_metas: list[FileObjectMeta], filename: str) -> FileObjectMeta:
    """Locate file metadata by filename.

    Args:
        file_metas: optional file metadata list.
        filename: target filename.

    Returns:
        matched file metadata.

    Raises:
        FileNotFoundError: raised when the target file is not found.
    """

    normalized_filename = filename.strip()
    if not normalized_filename:
        raise FileNotFoundError("filename must not be empty")
    for file_meta in file_metas:
        if _infer_filename_from_uri(file_meta.uri) == normalized_filename:
            return file_meta
    raise FileNotFoundError(f"file not found: {normalized_filename}")


class FsSourceDocumentRepository(SourceDocumentRepositoryProtocol):
    """Filesystem-based source-document repository implementation."""

    def __init__(
        self,
        workspace_root: Path,
        *,
        file_store: Optional[FileStore] = None,
        repository_set: Optional[_FsRepositorySet] = None,
        create_directories: bool = True,
    ) -> None:
        """Initialize the source-document repository.

        Args:
            workspace_root: workspace root directory.
            file_store: optional file-store implementation.
            repository_set: optional shared repository core set.
            create_directories: whether to create repository root directories at initialization.

        Returns:
            None.

        Raises:
            OSError: raised when the underlying repository initialization fails.
        """

        self._repository_set = build_fs_repository_set(
            workspace_root=workspace_root,
            file_store=file_store,
            repository_set=repository_set,
            create_directories=create_directories,
        )

    def has_source_storage_root(self, ticker: str, source_kind: SourceKind) -> bool:
        """Determine whether a source-document root directory exists and is a directory."""

        return self._repository_set.core.has_source_storage_root(ticker, source_kind)

    def has_filing_xbrl_instance(self, ticker: str, document_id: str) -> bool:
        """Determine whether an XBRL instance file already exists in a filing directory."""

        return self._repository_set.core.has_filing_xbrl_instance(ticker, document_id)

    def create_source_document(
        self,
        req: SourceDocumentUpsertRequest,
        source_kind: SourceKind,
    ) -> DocumentHandle:
        """Create a source document."""

        if source_kind == SourceKind.FILING:
            return self._repository_set.core.create_filing(_build_filing_create_request(req))
        return self._repository_set.core.create_material(_build_material_create_request(req))

    def update_source_document(
        self,
        req: SourceDocumentUpsertRequest,
        source_kind: SourceKind,
    ) -> DocumentHandle:
        """Update a source document."""

        if source_kind == SourceKind.FILING:
            return self._repository_set.core.update_filing(_build_filing_update_request(req))
        return self._repository_set.core.update_material(_build_material_update_request(req))

    def delete_source_document(self, req: SourceDocumentStateChangeRequest) -> None:
        """Logically delete a source document."""

        source_kind = SourceKind(str(req.source_kind))
        if source_kind == SourceKind.FILING:
            self._repository_set.core.delete_filing(_build_filing_delete_request(req))
            return
        self._repository_set.core.delete_material(_build_material_delete_request(req))

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

        self._repository_set.core.reset_source_document(ticker, document_id, source_kind)

    def restore_source_document(self, req: SourceDocumentStateChangeRequest) -> DocumentHandle:
        """Restore a logically deleted source document."""

        source_kind = SourceKind(str(req.source_kind))
        if source_kind == SourceKind.FILING:
            return self._repository_set.core.restore_filing(_build_filing_restore_request(req))
        return self._repository_set.core.restore_material(_build_material_restore_request(req))

    def get_source_meta(
        self,
        ticker: str,
        document_id: str,
        source_kind: SourceKind,
    ) -> DocumentMeta:
        """Read source-document meta."""

        return self._repository_set.core.get_source_meta(ticker, document_id, source_kind)

    def replace_source_meta(
        self,
        ticker: str,
        document_id: str,
        source_kind: SourceKind,
        meta: DocumentMeta,
    ) -> None:
        """Replace source-document meta wholesale."""

        self._repository_set.core.replace_source_meta(ticker, document_id, source_kind, meta)

    def list_source_document_ids(self, ticker: str, source_kind: SourceKind) -> list[str]:
        """List source document IDs by source."""

        return self._repository_set.core.list_document_ids(ticker, source_kind)

    def get_source_handle(
        self, ticker: str, document_id: str, source_kind: SourceKind
    ) -> SourceHandle:
        """Construct a source-document handle."""

        return self._repository_set.core.get_source_handle(ticker, document_id, source_kind)

    def get_primary_file(
        self, ticker: str, document_id: str, source_kind: SourceKind
    ) -> FileObjectMeta:
        """Read source-document primary-file object metadata."""

        handle = _build_source_handle(ticker, document_id, source_kind)
        return self._repository_set.core.get_primary_file(handle)

    def get_source(
        self, ticker: str, document_id: str, source_kind: SourceKind, filename: str
    ) -> Source:
        """Read source-document specific-file source."""

        handle = _build_source_handle(ticker, document_id, source_kind)
        file_metas = self._repository_set.core.list_files(handle)
        file_meta = _find_file_meta_by_filename(file_metas, filename)
        return self._repository_set.core.get_source(handle, file_meta)

    def get_primary_source(self, ticker: str, document_id: str, source_kind: SourceKind) -> Source:
        """Read source-document primary-file source."""

        return self._repository_set.core.get_primary_source(ticker, document_id, source_kind)
