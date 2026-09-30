"""Filesystem storage — source-document operations mixin."""

from __future__ import annotations

import shutil
from typing import Optional

from scripts.vendor.filings.engine.processors.source import Source
from scripts.vendor.filings.fins.domain.document_models import (
    DocumentHandle,
    DocumentMeta,
    DocumentQuery,
    DocumentSummary,
    FileObjectMeta,
    FilingCreateRequest,
    FilingDeleteRequest,
    FilingManifestItem,
    FilingRestoreRequest,
    FilingUpdateRequest,
    MaterialCreateRequest,
    MaterialDeleteRequest,
    MaterialManifestItem,
    MaterialRestoreRequest,
    MaterialUpdateRequest,
    SourceDocumentUpsertRequest,
    SourceHandle,
    now_iso8601,
)
from scripts.vendor.filings.fins.domain.enums import SourceKind
from scripts.vendor.filings.fins.xbrl_file_discovery import has_xbrl_instance

from ._fs_storage_infra import _FsStorageInfra
from ._fs_storage_utils import (
    _SOURCE_META_FILENAME,
    _build_file_payloads,
    _extract_file_names,
    _extract_file_payloads,
    _file_object_meta_from_dict,
    _guess_media_type,
    _infer_filename_from_uri,
    _list_directory_names,
    _local_path_from_uri,
    _normalize_file_entries,
    _normalize_source_kind,
    _normalize_ticker,
    _read_json_object,
    _resolve_primary_uri,
    _write_json,
)
from .local_file_source import LocalFileSource


class _FsSourceDocumentMixin(_FsStorageInfra):
    """Source-document (filing / material) operations mixin."""

    # ========== material CRUD ==========

    def create_material(self, req: MaterialCreateRequest) -> DocumentHandle:
        """Create a material document.

        Args:
            req: material create request.

        Returns:
            document handle.

        Raises:
            FileExistsError: raised when the document already exists.
            FileNotFoundError: raised when the input file does not exist.
            OSError: raised when the write fails.
        """

        return self._execute_with_auto_batch(
            req.ticker,
            self._upsert_source_document,
            req,
            SourceKind.MATERIAL,
            True,
        )

    def update_material(self, req: MaterialUpdateRequest) -> DocumentHandle:
        """Update a material document.

        Args:
            req: material update request.

        Returns:
            document handle.

        Raises:
            FileNotFoundError: raised when the document or input file does not exist.
            OSError: raised when the update fails.
        """

        return self._execute_with_auto_batch(
            req.ticker,
            self._upsert_source_document,
            req,
            SourceKind.MATERIAL,
            False,
        )

    def delete_material(self, req: MaterialDeleteRequest) -> None:
        """Logically delete a material document.

        Args:
            req: material delete request.

        Returns:
            None.

        Raises:
            FileNotFoundError: raised when the document does not exist.
            OSError: raised when the write fails.
        """

        self._execute_with_auto_batch(
            req.ticker,
            self._toggle_source_deleted,
            req.ticker,
            req.document_id,
            SourceKind.MATERIAL,
            True,
        )

    def restore_material(self, req: MaterialRestoreRequest) -> DocumentHandle:
        """Restore a material document.

        Args:
            req: material restore request.

        Returns:
            document handle.

        Raises:
            FileNotFoundError: raised when the document does not exist.
            OSError: raised when the write fails.
        """

        return self._execute_with_auto_batch(
            req.ticker,
            self._toggle_source_deleted,
            req.ticker,
            req.document_id,
            SourceKind.MATERIAL,
            False,
        )

    # ========== filing CRUD ==========

    def create_filing(self, req: FilingCreateRequest) -> DocumentHandle:
        """Create a filing document.

        Args:
            req: filing create request.

        Returns:
            document handle.

        Raises:
            FileExistsError: raised when the document already exists.
            FileNotFoundError: raised when the input file does not exist.
            OSError: raised when the write fails.
        """

        return self._execute_with_auto_batch(
            req.ticker,
            self._upsert_source_document,
            req,
            SourceKind.FILING,
            True,
        )

    def update_filing(self, req: FilingUpdateRequest) -> DocumentHandle:
        """Update a filing document.

        Args:
            req: filing update request.

        Returns:
            document handle.

        Raises:
            FileNotFoundError: raised when the document or input file does not exist.
            OSError: raised when the update fails.
        """

        return self._execute_with_auto_batch(
            req.ticker,
            self._upsert_source_document,
            req,
            SourceKind.FILING,
            False,
        )

    def delete_filing(self, req: FilingDeleteRequest) -> None:
        """Logically delete a filing document.

        Args:
            req: filing delete request.

        Returns:
            None.

        Raises:
            FileNotFoundError: raised when the document does not exist.
            OSError: raised when the write fails.
        """

        self._execute_with_auto_batch(
            req.ticker,
            self._toggle_source_deleted,
            req.ticker,
            req.document_id,
            SourceKind.FILING,
            True,
        )

    def restore_filing(self, req: FilingRestoreRequest) -> DocumentHandle:
        """Restore a filing document.

        Args:
            req: filing restore request.

        Returns:
            document handle.

        Raises:
            FileNotFoundError: raised when the document does not exist.
            OSError: raised when the write fails.
        """

        return self._execute_with_auto_batch(
            req.ticker,
            self._toggle_source_deleted,
            req.ticker,
            req.document_id,
            SourceKind.FILING,
            False,
        )

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
            OSError: raised when deleting the directory or manifest fails.
        """

        self._execute_with_auto_batch(
            ticker,
            self._reset_source_document_impl,
            ticker,
            document_id,
            source_kind,
        )

    # ========== Queries ==========

    def get_document_meta(self, ticker: str, document_id: str) -> DocumentMeta:
        """Read document metadata.

        Args:
            ticker: ticker.
            document_id: document ID.

        Returns:
            document metadata dict.

        Raises:
            FileNotFoundError: raised when the metadata does not exist.
            ValueError: raised when the metadata file content is invalid.
        """

        normalized_ticker = _normalize_ticker(ticker)
        meta_candidates = [
            self._source_meta_path_for_read(normalized_ticker, document_id, SourceKind.FILING),
            self._source_meta_path_for_read(normalized_ticker, document_id, SourceKind.MATERIAL),
            self._processed_meta_path_for_read(normalized_ticker, document_id),
        ]
        for meta_path in meta_candidates:
            if meta_path.exists():
                return _read_json_object(meta_path)
        raise FileNotFoundError(f"meta.json for document_id={document_id} does not exist")

    def get_source_meta(
        self, ticker: str, document_id: str, source_kind: SourceKind
    ) -> DocumentMeta:
        """Read source-document metadata under the given source directory.

        Args:
            ticker: ticker.
            document_id: document ID.
            source_kind: source kind.

        Returns:
            source-document metadata dict.

        Raises:
            FileNotFoundError: raised when meta.json under the corresponding source directory does not exist.
            ValueError: raised when the metadata file content is invalid.
        """

        normalized_ticker = _normalize_ticker(ticker)
        normalized_source_kind = _normalize_source_kind(source_kind)
        meta_path = self._source_meta_path_for_read(
            normalized_ticker, document_id, normalized_source_kind
        )
        if not meta_path.exists():
            raise FileNotFoundError(
                f"meta.json for document_id={document_id} ({normalized_source_kind.value}) does not exist"
            )
        return _read_json_object(meta_path)

    def replace_source_meta(
        self,
        ticker: str,
        document_id: str,
        source_kind: SourceKind,
        meta: DocumentMeta,
    ) -> None:
        """Write back source-document metadata with exact overwrite.

        Args:
            ticker: ticker.
            document_id: document ID.
            source_kind: source kind.
            meta: full metadata dict.

        Returns:
            None.

        Raises:
            FileNotFoundError: raised when the target source document does not exist.
            OSError: raised when the write fails.
        """

        normalized_ticker = _normalize_ticker(ticker)
        normalized_source_kind = _normalize_source_kind(source_kind)
        meta_path = self._source_meta_path(normalized_ticker, document_id, normalized_source_kind)
        if not meta_path.exists():
            raise FileNotFoundError(
                f"meta.json for document_id={document_id} ({normalized_source_kind.value}) does not exist"
            )
        normalized_meta = dict(meta)
        _write_json(meta_path, normalized_meta)

        if normalized_source_kind == SourceKind.FILING:
            self.upsert_filing_manifest(
                normalized_ticker,
                [
                    FilingManifestItem(
                        document_id=document_id,
                        internal_document_id=str(normalized_meta.get("internal_document_id", "")),
                        form_type=normalized_meta.get("form_type"),
                        fiscal_year=normalized_meta.get("fiscal_year"),
                        fiscal_period=normalized_meta.get("fiscal_period"),
                        report_date=normalized_meta.get("report_date"),
                        filing_date=normalized_meta.get("filing_date"),
                        amended=bool(normalized_meta.get("amended", False)),
                        ingest_method=str(normalized_meta.get("ingest_method", "upload")),
                        ingest_complete=bool(normalized_meta.get("ingest_complete", True)),
                        is_deleted=bool(normalized_meta.get("is_deleted", False)),
                        deleted_at=normalized_meta.get("deleted_at"),
                        document_version=str(normalized_meta.get("document_version", "v1")),
                        source_fingerprint=str(normalized_meta.get("source_fingerprint", "")),
                        has_xbrl=normalized_meta.get("has_xbrl"),
                    )
                ],
            )
        else:
            self.upsert_material_manifest(
                normalized_ticker,
                [
                    MaterialManifestItem(
                        document_id=document_id,
                        internal_document_id=str(normalized_meta.get("internal_document_id", "")),
                        form_type=normalized_meta.get("form_type"),
                        material_name=normalized_meta.get("material_name"),
                        filing_date=normalized_meta.get("filing_date"),
                        report_date=normalized_meta.get("report_date"),
                        ingest_complete=bool(normalized_meta.get("ingest_complete", True)),
                        is_deleted=bool(normalized_meta.get("is_deleted", False)),
                        deleted_at=normalized_meta.get("deleted_at"),
                        document_version=str(normalized_meta.get("document_version", "v1")),
                        source_fingerprint=str(normalized_meta.get("source_fingerprint", "")),
                    )
                ],
            )

    def list_documents(self, ticker: str, query: DocumentQuery) -> list[DocumentSummary]:
        """Query a document summary from the processed manifest.

        Args:
            ticker: ticker.
            query: query condition.

        Returns:
            document summary list.

        Raises:
            OSError: raised when the manifest read fails.
            ValueError: raised when the manifest content is invalid.
        """

        normalized_ticker = _normalize_ticker(ticker)
        manifest = self._read_manifest(
            self._processed_manifest_path_for_read(normalized_ticker), normalized_ticker
        )
        result: list[DocumentSummary] = []
        for item in manifest["documents"]:
            summary = DocumentSummary.from_dict(item)
            if not query.include_deleted and summary.is_deleted:
                continue
            if query.source_kind and summary.source_kind != query.source_kind:
                continue
            if query.form_type and summary.form_type != query.form_type:
                continue
            if query.fiscal_years and summary.fiscal_year not in query.fiscal_years:
                continue
            if query.fiscal_periods and summary.fiscal_period not in query.fiscal_periods:
                continue
            result.append(summary)
        return result

    def list_document_ids(self, ticker: str, source_kind: Optional[SourceKind] = None) -> list[str]:
        """List document IDs.

        Args:
            ticker: ticker.
            source_kind: optional source-kind filter.

        Returns:
            sorted document ID list.

        Raises:
            OSError: raised when the directory read fails.
        """

        normalized_ticker = _normalize_ticker(ticker)
        if source_kind == SourceKind.FILING:
            return _list_directory_names(
                self._source_root_for_read(normalized_ticker, SourceKind.FILING)
            )
        if source_kind == SourceKind.MATERIAL:
            return _list_directory_names(
                self._source_root_for_read(normalized_ticker, SourceKind.MATERIAL)
            )

        filings = _list_directory_names(
            self._source_root_for_read(normalized_ticker, SourceKind.FILING)
        )
        materials = _list_directory_names(
            self._source_root_for_read(normalized_ticker, SourceKind.MATERIAL)
        )
        return sorted(set(filings + materials))

    def has_source_storage_root(self, ticker: str, source_kind: SourceKind) -> bool:
        """Determine whether a source-document root directory exists and is a directory.

        Args:
            ticker: ticker.
            source_kind: source kind.

        Returns:
            `True` when the directory exists and is a directory; `False` when it does not exist.

        Raises:
            NotADirectoryError: raised when the root path exists but is not a directory.
            OSError: raised when filesystem access fails.
        """

        normalized_ticker = _normalize_ticker(ticker)
        normalized_source_kind = _normalize_source_kind(source_kind)
        root = self._source_root_for_read(normalized_ticker, normalized_source_kind)
        if not root.exists():
            return False
        if not root.is_dir():
            raise NotADirectoryError(f"source root is not a directory: {root}")
        return True

    def has_filing_xbrl_instance(self, ticker: str, document_id: str) -> bool:
        """Determine whether an XBRL instance file already exists in the filing directory.

        Args:
            ticker: ticker.
            document_id: filing document ID.

        Returns:
            `True` when an XBRL instance file exists, otherwise `False`.

        Raises:
            FileNotFoundError: raised when the filing directory does not exist.
            NotADirectoryError: raised when the filing path exists but is not a directory.
            OSError: raised when filesystem access fails.
        """

        normalized_ticker = _normalize_ticker(ticker)
        filing_dir = self._source_root_for_read(normalized_ticker, SourceKind.FILING) / document_id
        if not filing_dir.exists():
            raise FileNotFoundError(f"filing directory does not exist: {filing_dir}")
        if not filing_dir.is_dir():
            raise NotADirectoryError(f"filing path is not a directory: {filing_dir}")
        return has_xbrl_instance(filing_dir)

    def _reset_source_document_impl(
        self,
        ticker: str,
        document_id: str,
        source_kind: SourceKind,
    ) -> None:
        """Perform a single-document reset (internal implementation).

        behavior and error propagation:

        - target directory exists and is a directory: physically remove the whole document directory with ``shutil.rmtree``.
          if the directory contains permission-denied children or read-only files, ``rmtree`` raises ``OSError``.
        - target is a file (rare abnormal paths): delete with ``unlink(missing_ok=True)``.
        - then remove the document_id entry from the corresponding manifest.

        design decision (exceptions propagate; no fallback):
            this method is the first step of the ``overwrite`` rebuild path; once deletion fails (e.g. permission
            denied, filesystem busy), the exception **must** propagate; better to let the whole upload
            flow to fail, and the repository must not be left with "stale data + new manifest entries"
            inconsistent state. The upper layer (``reset_upload_target_for_overwrite`` ->
            ``execute_upload``) and therefore does not swallow the ``OSError`` raised here.

        Args:
            ticker: ticker.
            document_id: document ID.
            source_kind: source kind.

        Returns:
            None.

        Raises:
            OSError: raised when deleting the directory, file, or manifest fails; the caller is responsible for
                aborting further writes to keep the repository consistent.
        """

        normalized_ticker = _normalize_ticker(ticker)
        normalized_source_kind = _normalize_source_kind(source_kind)
        document_dir = self._source_root(normalized_ticker, normalized_source_kind) / document_id
        if document_dir.exists():
            if document_dir.is_dir():
                shutil.rmtree(document_dir)
            else:
                document_dir.unlink(missing_ok=True)
        if normalized_source_kind == SourceKind.FILING:
            manifest_path = self._filing_manifest_path(normalized_ticker)
        else:
            manifest_path = self._material_manifest_path(normalized_ticker)
        if manifest_path.exists():
            self._remove_manifest_item(manifest_path, normalized_ticker, document_id)

    # ========== handles & file access ==========

    def get_source_handle(
        self, ticker: str, document_id: str, source_kind: SourceKind
    ) -> SourceHandle:
        """Get the source-document handle.

        Args:
            ticker: ticker.
            document_id: document ID.
            source_kind: source kind.

        Returns:
            source-document handle.

        Raises:
            FileNotFoundError: raised when the document does not exist.
        """

        normalized_ticker = _normalize_ticker(ticker)
        normalized_source_kind = _normalize_source_kind(source_kind)
        meta_path = self._source_meta_path_for_read(
            normalized_ticker, document_id, normalized_source_kind
        )
        if not meta_path.exists():
            raise FileNotFoundError(f"document_id={document_id} does not exist in {normalized_source_kind}")
        return SourceHandle(
            ticker=normalized_ticker,
            document_id=document_id,
            source_kind=normalized_source_kind.value,
        )

    def get_primary_file(self, handle: SourceHandle) -> FileObjectMeta:
        """Get the source-document primary-file metadata.

        Args:
            handle: source-document handle.

        Returns:
            primary file metadata.

        Raises:
            FileNotFoundError: raised when the primary file cannot be located.
            ValueError: raised when the metadata format is invalid.
        """

        meta = self._get_handle_meta(handle)
        files = meta.get("files", [])
        if not isinstance(files, list):
            raise ValueError("meta.files must be a list")
        if not files:
            raise FileNotFoundError("source document has no bound file; cannot locate the primary file")
        primary_name = str(meta.get("primary_document", "")).strip()
        if primary_name:
            for item in files:
                if not isinstance(item, dict):
                    continue
                name = str(
                    item.get("name") or _infer_filename_from_uri(item.get("uri", ""))
                ).strip()
                if name == primary_name:
                    return _file_object_meta_from_dict(item)
        for item in files:
            if isinstance(item, dict):
                return _file_object_meta_from_dict(item)
        raise FileNotFoundError("source document has no usable file entry")

    def get_source(self, handle: SourceHandle, file_meta: FileObjectMeta) -> Source:
        """Get the Source from file metadata.

        Args:
            handle: source-document handle.
            file_meta: file metadata.

        Returns:
            Source abstraction.

        Raises:
            ValueError: raised when the file metadata is invalid.
            OSError: raised when building the Source fails.
        """

        uri = str(file_meta.uri or "").strip()
        if not uri:
            raise ValueError("file_meta.uri must not be empty")
        path = _local_path_from_uri(self.portfolio_root, uri)
        media_type = file_meta.content_type or _guess_media_type(path)
        return LocalFileSource(
            path=path,
            uri=uri,
            media_type=media_type,
            content_length=file_meta.size,
            etag=file_meta.etag,
        )

    def get_primary_source(self, ticker: str, document_id: str, source_kind: SourceKind) -> Source:
        """Get the Source of the source-document primary file.

        Args:
            ticker: ticker.
            document_id: document ID.
            source_kind: source kind.

        Returns:
            Source abstraction.

        Raises:
            FileNotFoundError: raised when the document or primary file does not exist.
            ValueError: raised when the file metadata is invalid.
            OSError: raised when building the Source fails.
        """

        handle = self.get_source_handle(
            ticker=ticker, document_id=document_id, source_kind=source_kind
        )
        primary_file = self.get_primary_file(handle)
        return self.get_source(handle, primary_file)

    # ========== Internal implementation ==========

    def _upsert_source_document(
        self,
        req: SourceDocumentUpsertRequest,
        source_kind: SourceKind,
        is_create: bool,
    ) -> DocumentHandle:
        """Create or update a source document.

        Args:
            req: source-document write request.
            source_kind: document source kind.
            is_create: whether this is a create flow.

        Returns:
            document handle.

        Raises:
            FileExistsError: the document already exists at creation time.
            FileNotFoundError: the document or copied file does not exist at update time.
            OSError: write failed.
        """

        ticker = _normalize_ticker(req.ticker)
        source_root = self._source_root(ticker, source_kind)
        source_root.mkdir(parents=True, exist_ok=True)
        document_dir = source_root / req.document_id
        meta_path = document_dir / _SOURCE_META_FILENAME

        meta_exists = meta_path.exists()
        if is_create and meta_exists:
            raise FileExistsError(f"document already exists: {meta_path}")
        if not is_create and not meta_exists:
            raise FileNotFoundError(f"document does not exist: {meta_path}")

        document_dir.mkdir(parents=True, exist_ok=True)
        previous_meta = _read_json_object(meta_path) if meta_path.exists() else {}

        previous_files = _extract_file_payloads(previous_meta)
        if req.file_entries is not None:
            file_payloads = _normalize_file_entries(req.file_entries)
        elif req.files:
            file_payloads = _build_file_payloads(req.files)
        else:
            file_payloads = previous_files
        now = now_iso8601()

        merged_meta = dict(previous_meta)
        merged_meta.update(req.meta)
        merged_meta["ticker"] = ticker
        merged_meta["document_id"] = req.document_id
        merged_meta["internal_document_id"] = req.internal_document_id
        merged_meta["form_type"] = req.form_type or merged_meta.get("form_type")
        merged_meta["updated_at"] = now
        merged_meta.setdefault("created_at", now)
        merged_meta.setdefault("first_ingested_at", now)
        merged_meta.setdefault("ingest_complete", True)
        merged_meta.setdefault("is_deleted", False)
        merged_meta.setdefault("deleted_at", None)
        merged_meta.setdefault("document_version", "v1")
        merged_meta.setdefault("source_fingerprint", "")

        selected_primary_document = self._select_primary_document(
            explicit_primary=req.primary_document,
            previous_primary=previous_meta.get("primary_document"),
            current_file_names=_extract_file_names(file_payloads),
            previous_file_names=_extract_file_names(previous_files),
        )
        if selected_primary_document is not None:
            merged_meta["primary_document"] = selected_primary_document
        merged_meta["files"] = file_payloads

        _write_json(meta_path, merged_meta)

        if source_kind == SourceKind.FILING:
            self.upsert_filing_manifest(
                ticker,
                [
                    FilingManifestItem(
                        document_id=req.document_id,
                        internal_document_id=req.internal_document_id,
                        form_type=merged_meta.get("form_type"),
                        fiscal_year=merged_meta.get("fiscal_year"),
                        fiscal_period=merged_meta.get("fiscal_period"),
                        report_date=merged_meta.get("report_date"),
                        filing_date=merged_meta.get("filing_date"),
                        amended=bool(merged_meta.get("amended", False)),
                        ingest_method=str(merged_meta.get("ingest_method", "upload")),
                        ingest_complete=bool(merged_meta.get("ingest_complete", True)),
                        is_deleted=bool(merged_meta.get("is_deleted", False)),
                        deleted_at=merged_meta.get("deleted_at"),
                        document_version=str(merged_meta.get("document_version", "v1")),
                        source_fingerprint=str(merged_meta.get("source_fingerprint", "")),
                        has_xbrl=merged_meta.get("has_xbrl"),
                    )
                ],
            )
        else:
            self.upsert_material_manifest(
                ticker,
                [
                    MaterialManifestItem(
                        document_id=req.document_id,
                        internal_document_id=req.internal_document_id,
                        form_type=merged_meta.get("form_type"),
                        material_name=merged_meta.get("material_name"),
                        filing_date=merged_meta.get("filing_date"),
                        report_date=merged_meta.get("report_date"),
                        ingest_complete=bool(merged_meta.get("ingest_complete", True)),
                        is_deleted=bool(merged_meta.get("is_deleted", False)),
                        deleted_at=merged_meta.get("deleted_at"),
                        document_version=str(merged_meta.get("document_version", "v1")),
                        source_fingerprint=str(merged_meta.get("source_fingerprint", "")),
                    )
                ],
            )

        primary_file_uri = _resolve_primary_uri(file_payloads, selected_primary_document)
        return DocumentHandle(
            ticker=ticker,
            document_id=req.document_id,
            form_type=merged_meta.get("form_type"),
            primary_file_uri=primary_file_uri,
            file_uris=[str(item.get("uri")) for item in file_payloads if isinstance(item, dict)],
        )

    def _toggle_source_deleted(
        self,
        ticker: str,
        document_id: str,
        source_kind: SourceKind,
        deleted: bool,
    ) -> DocumentHandle:
        """Toggle the source-document logical-deletion state.

        Args:
            ticker: ticker.
            document_id: document ID.
            source_kind: source kind.
            deleted: target deletion state.

        Returns:
            updated document handle.

        Raises:
            FileNotFoundError: the document does not exist.
            OSError: write failed.
        """

        normalized_ticker = _normalize_ticker(ticker)
        meta_path = self._source_meta_path(normalized_ticker, document_id, source_kind)
        if not meta_path.exists():
            raise FileNotFoundError(f"document does not exist: {meta_path}")

        meta = _read_json_object(meta_path)
        meta["is_deleted"] = deleted
        meta["deleted_at"] = now_iso8601() if deleted else None
        meta["updated_at"] = now_iso8601()
        _write_json(meta_path, meta)

        if source_kind == SourceKind.FILING:
            self.upsert_filing_manifest(
                normalized_ticker,
                [
                    FilingManifestItem(
                        document_id=document_id,
                        internal_document_id=str(meta.get("internal_document_id", "")),
                        form_type=meta.get("form_type"),
                        fiscal_year=meta.get("fiscal_year"),
                        fiscal_period=meta.get("fiscal_period"),
                        report_date=meta.get("report_date"),
                        filing_date=meta.get("filing_date"),
                        amended=bool(meta.get("amended", False)),
                        ingest_method=str(meta.get("ingest_method", "upload")),
                        ingest_complete=bool(meta.get("ingest_complete", True)),
                        is_deleted=bool(meta.get("is_deleted", False)),
                        deleted_at=meta.get("deleted_at"),
                        document_version=str(meta.get("document_version", "v1")),
                        source_fingerprint=str(meta.get("source_fingerprint", "")),
                        has_xbrl=meta.get("has_xbrl"),
                    )
                ],
            )
        else:
            self.upsert_material_manifest(
                normalized_ticker,
                [
                    MaterialManifestItem(
                        document_id=document_id,
                        internal_document_id=str(meta.get("internal_document_id", "")),
                        form_type=meta.get("form_type"),
                        material_name=meta.get("material_name"),
                        filing_date=meta.get("filing_date"),
                        report_date=meta.get("report_date"),
                        ingest_complete=bool(meta.get("ingest_complete", True)),
                        is_deleted=bool(meta.get("is_deleted", False)),
                        deleted_at=meta.get("deleted_at"),
                        document_version=str(meta.get("document_version", "v1")),
                        source_fingerprint=str(meta.get("source_fingerprint", "")),
                    )
                ],
            )

        file_payloads = _extract_file_payloads(meta)
        return DocumentHandle(
            ticker=normalized_ticker,
            document_id=document_id,
            form_type=meta.get("form_type"),
            primary_file_uri=_resolve_primary_uri(
                file_payloads,
                str(meta.get("primary_document", "")).strip() or None,
            ),
            file_uris=[str(item.get("uri")) for item in file_payloads if isinstance(item, dict)],
        )
