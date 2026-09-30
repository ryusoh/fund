"""Filesystem repository — processed-artifact operations mixin."""

from __future__ import annotations

import shutil

from scripts.vendor.filings.fins.domain.document_models import (
    DocumentHandle,
    DocumentMeta,
    ProcessedCreateRequest,
    ProcessedDeleteRequest,
    ProcessedHandle,
    ProcessedManifestItem,
    ProcessedUpdateRequest,
    now_iso8601,
)

from ._fs_storage_infra import _FsStorageInfra
from ._fs_storage_utils import (
    _PROCESSED_META_FILENAME,
    _normalize_ticker,
    _read_json_array,
    _read_json_object,
    _write_json,
)


class _FsProcessedMixin(_FsStorageInfra):
    """Processed-artifact operations mixin."""

    # ========== processed CRUD ==========

    def create_processed(self, req: ProcessedCreateRequest) -> DocumentHandle:
        """Create a processed artifact.

        Args:
            req: processed-artifact create request.

        Returns:
            document handle.

        Raises:
            FileExistsError: raised when the artifact already exists.
            OSError: raised when the write fails.
        """

        return self._execute_with_auto_batch(
            req.ticker,
            self._upsert_processed,
            req,
            True,
        )

    def update_processed(self, req: ProcessedUpdateRequest) -> DocumentHandle:
        """Update a processed artifact.

        Args:
            req: processed-artifact update request.

        Returns:
            document handle.

        Raises:
            FileNotFoundError: raised when the artifact does not exist.
            OSError: raised when the update fails.
        """

        return self._execute_with_auto_batch(
            req.ticker,
            self._upsert_processed,
            req,
            False,
        )

    def delete_processed(self, req: ProcessedDeleteRequest) -> None:
        """Delete a processed artifact.

        Args:
            req: processed-artifact delete request.

        Returns:
            None.

        Raises:
            FileNotFoundError: raised when the artifact does not exist.
            OSError: raised when the delete fails.
        """

        self._execute_with_auto_batch(
            req.ticker,
            self._delete_processed_impl,
            req,
        )

    def _delete_processed_impl(self, req: ProcessedDeleteRequest) -> None:
        """Perform processed-artifact deletion (internal implementation).

        Args:
            req: processed-artifact delete request.

        Returns:
            None.

        Raises:
            FileNotFoundError: raised when the artifact does not exist.
            OSError: raised when the delete fails.
        """

        ticker = _normalize_ticker(req.ticker)
        processed_dir = self._processed_dir_for_write(ticker, req.document_id)
        if not processed_dir.exists():
            raise FileNotFoundError(f"processed document does not exist: {processed_dir}")
        shutil.rmtree(processed_dir)
        self._remove_manifest_item(self._processed_manifest_path(ticker), ticker, req.document_id)

    # ========== handle & metadata ==========

    def get_processed_handle(self, ticker: str, document_id: str) -> ProcessedHandle:
        """Get the processed-artifact handle.

        Args:
            ticker: ticker.
            document_id: document ID.

        Returns:
            processed-artifact handle.

        Raises:
            FileNotFoundError: raised when the document does not exist.
        """

        normalized_ticker = _normalize_ticker(ticker)
        meta_path = self._processed_meta_path_for_read(normalized_ticker, document_id)
        if not meta_path.exists():
            raise FileNotFoundError(f"processed document does not exist: {meta_path}")
        return ProcessedHandle(
            ticker=normalized_ticker,
            document_id=document_id,
        )

    def get_processed_meta(self, ticker: str, document_id: str) -> DocumentMeta:
        """Read processed metadata.

        prefer ``meta.json``; fall back to ``tool_snapshot_meta.json`` when absent
        (CI pipeline artifact).

        Args:
            ticker: ticker.
            document_id: document ID.

        Returns:
            processed metadata dict.

        Raises:
            FileNotFoundError: raised when neither metadata file exists.
            ValueError: raised when the metadata format is invalid.
        """

        normalized_ticker = _normalize_ticker(ticker)
        meta_path = self._processed_meta_path_for_read(normalized_ticker, document_id)
        if meta_path.exists():
            return _read_json_object(meta_path)
        raise FileNotFoundError(f"processed metadata does not exist: {meta_path}")

    # ========== reprocess ==========

    def mark_processed_reprocess_required(self, ticker: str, document_id: str) -> bool:
        """Mark a processed document as needing reprocessing.

        Args:
            ticker: ticker.
            document_id: document ID.

        Returns:
            whether it was marked successfully.

        Raises:
            OSError: raised when read/write fails.
        """

        return self._execute_with_auto_batch(
            ticker,
            self._mark_processed_reprocess_required_impl,
            ticker,
            document_id,
        )

    def _mark_processed_reprocess_required_impl(self, ticker: str, document_id: str) -> bool:
        """Perform reprocessing-marker writes (internal implementation).

        Args:
            ticker: ticker.
            document_id: document ID.

        Returns:
            whether it was marked successfully.

        Raises:
            OSError: raised when read/write fails.
        """

        processed_meta_path = self._processed_meta_path(_normalize_ticker(ticker), document_id)
        if not processed_meta_path.exists():
            return False
        processed_meta = _read_json_object(processed_meta_path)
        processed_meta["reprocess_required"] = True
        processed_meta["updated_at"] = now_iso8601()
        _write_json(processed_meta_path, processed_meta)
        return True

    # ========== bulk cleanup ==========

    def clear_processed_documents(self, ticker: str) -> None:
        """Clear the processed directory contents under a ticker.

        Args:
            ticker: ticker.

        Returns:
            None.

        Raises:
            OSError: raised when cleanup fails.
        """

        self._execute_with_auto_batch(
            ticker,
            self._clear_processed_documents_impl,
            ticker,
        )

    def _clear_processed_documents_impl(self, ticker: str) -> None:
        """Perform processed-directory cleanup (internal implementation).

        Args:
            ticker: ticker.

        Returns:
            None.

        Raises:
            OSError: raised when cleanup fails.
        """

        normalized_ticker = _normalize_ticker(ticker)
        processed_dir = self._ticker_dir_for_write(normalized_ticker) / "processed"
        if not processed_dir.exists():
            return
        for child in processed_dir.iterdir():
            if child.is_dir():
                shutil.rmtree(child)
                continue
            child.unlink(missing_ok=True)

    # ========== internal implementation ==========

    def _upsert_processed(
        self, req: ProcessedCreateRequest | ProcessedUpdateRequest, is_create: bool
    ) -> DocumentHandle:
        """Create or update a processed artifact.

        Args:
            req: processed-artifact request.
            is_create: whether this is a create flow.

        Returns:
            document handle.

        Raises:
            FileExistsError: already exists at creation time.
            FileNotFoundError: does not exist at update time.
            OSError: write failed.
        """

        ticker = _normalize_ticker(req.ticker)
        processed_dir = self._processed_dir_for_write(ticker, req.document_id)
        meta_path = processed_dir / _PROCESSED_META_FILENAME

        exists = processed_dir.exists()
        if is_create and exists:
            raise FileExistsError(f"processed document already exists: {processed_dir}")
        if not is_create and not exists:
            raise FileNotFoundError(f"processed document does not exist: {processed_dir}")

        processed_dir.mkdir(parents=True, exist_ok=True)
        previous_meta = _read_json_object(meta_path) if meta_path.exists() else {}
        financials_path = processed_dir / "financials.json"

        if req.sections is not None:
            _write_json(processed_dir / "sections.json", req.sections)
        if req.tables is not None:
            _write_json(processed_dir / "tables.json", req.tables)
        if req.financials is not None:
            _write_json(financials_path, req.financials)
        elif financials_path.exists():
            # explicitly remove stale financials so has_xbrl is not polluted by historical artifacts.
            financials_path.unlink()

        sections_path = processed_dir / "sections.json"
        tables_path = processed_dir / "tables.json"

        section_count = len(_read_json_array(sections_path)) if sections_path.exists() else 0
        table_count = len(_read_json_array(tables_path)) if tables_path.exists() else 0
        has_xbrl = financials_path.exists()

        merged_meta = dict(previous_meta)
        merged_meta.update(req.meta)
        merged_meta["document_id"] = req.document_id
        merged_meta["internal_document_id"] = req.internal_document_id
        merged_meta["source_kind"] = req.source_kind
        merged_meta.setdefault("source_document_version", "v1")
        merged_meta.setdefault("schema_version", "v1")
        merged_meta.setdefault("parser_version", "v1")
        merged_meta.setdefault("source_fingerprint", "")
        merged_meta.setdefault("reprocess_required", False)
        merged_meta["section_count"] = section_count
        merged_meta["table_count"] = table_count
        merged_meta["has_xbrl"] = has_xbrl
        merged_meta["processed_at"] = now_iso8601()

        _write_json(meta_path, merged_meta)

        self.upsert_processed_manifest(
            ticker,
            [
                ProcessedManifestItem(
                    document_id=req.document_id,
                    internal_document_id=req.internal_document_id,
                    source_kind=req.source_kind,
                    form_type=req.form_type,
                    material_name=merged_meta.get("material_name"),
                    fiscal_year=merged_meta.get("fiscal_year"),
                    fiscal_period=merged_meta.get("fiscal_period"),
                    report_date=merged_meta.get("report_date"),
                    filing_date=merged_meta.get("filing_date"),
                    amended=bool(merged_meta.get("amended", False)),
                    is_deleted=bool(merged_meta.get("is_deleted", False)),
                    document_version=str(merged_meta.get("source_document_version", "v1")),
                    quality=str(merged_meta.get("quality", "full")),
                    has_financials=has_xbrl,
                    section_count=section_count,
                    table_count=table_count,
                )
            ],
        )

        return DocumentHandle(
            ticker=ticker,
            document_id=req.document_id,
            form_type=req.form_type,
        )
