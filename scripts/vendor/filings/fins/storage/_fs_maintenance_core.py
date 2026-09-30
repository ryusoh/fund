"""Filesystem repository — rejection-registry and cleanup operations mixin."""

from __future__ import annotations

import shutil
from typing import BinaryIO, Optional

from scripts.vendor.filings.fins.domain.document_models import (
    FileObjectMeta,
    RejectedFilingArtifact,
    RejectedFilingArtifactUpsertRequest,
    now_iso8601,
)
from scripts.vendor.filings.log import Log

from ._fs_storage_infra import _FsStorageInfra
from ._fs_storage_utils import (
    _REJECTED_FILINGS_DIRNAME,
    _SOURCE_META_FILENAME,
    _list_directory_names,
    _normalize_ticker,
    _read_json_object,
    _write_json,
)


class _FsMaintenanceMixin(_FsStorageInfra):
    """Rejection-registry and cleanup operations mixin."""

    # ========== download-rejection registry ==========

    def load_download_rejection_registry(self, ticker: str) -> dict[str, dict[str, str]]:
        """Read the download-rejection registry.

        Args:
            ticker: ticker.

        Returns:
            `document_id -> rejection payload` mapping; an empty dict when missing or invalid.

        Raises:
            OSError: raised when the underlying read fails.
        """

        path = self._download_rejections_path_for_read(_normalize_ticker(ticker))
        if not path.exists():
            return {}
        try:
            data = _read_json_object(path)
        except (ValueError, OSError):
            return {}
        result: dict[str, dict[str, str]] = {}
        for document_id, payload in data.items():
            if not isinstance(document_id, str) or not isinstance(payload, dict):
                continue
            normalized_payload: dict[str, str] = {}
            for key, value in payload.items():
                if not isinstance(key, str):
                    continue
                normalized_payload[key] = str(value)
            result[document_id] = normalized_payload
        return result

    def save_download_rejection_registry(
        self,
        ticker: str,
        registry: dict[str, dict[str, str]],
    ) -> None:
        """Save the download-rejection registry.

        Args:
            ticker: ticker.
            registry: `document_id -> rejection payload` mapping.

        Returns:
            None.

        Raises:
            OSError: raised when the write fails.
        """

        self._execute_with_auto_batch(
            ticker,
            self._save_download_rejection_registry_impl,
            ticker,
            registry,
        )

    def _save_download_rejection_registry_impl(
        self,
        ticker: str,
        registry: dict[str, dict[str, str]],
    ) -> None:
        """Perform download-rejection-registry persistence (internal implementation).

        Args:
            ticker: ticker.
            registry: `document_id -> rejection payload` mapping.

        Returns:
            None.

        Raises:
            OSError: raised when the write fails.
        """

        normalized_ticker = _normalize_ticker(ticker)
        path = self._download_rejections_path(normalized_ticker)
        _write_json(path, registry)

    # ========== rejected filing artifact ==========

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
        """Write a rejected filing file object.

        Args:
            ticker: ticker.
            document_id: rejected-filing document ID.
            filename: filename.
            data: file byte stream.
            content_type: optional content type.
            metadata: optional extended metadata.

        Returns:
            file object metadata.

        Raises:
            OSError: raised when the write fails.
            ValueError: raised when the filename is empty.
        """

        normalized_ticker = _normalize_ticker(ticker)
        normalized_filename = str(filename).strip()
        if not normalized_filename:
            raise ValueError("filename must not be empty")
        file_store = self._build_file_store(normalized_ticker)
        return file_store.put_object(
            f"{normalized_ticker}/filings/{_REJECTED_FILINGS_DIRNAME}/{document_id}/{normalized_filename}",
            data,
            content_type=content_type,
            metadata=metadata,
        )

    def upsert_rejected_filing_artifact(
        self,
        req: RejectedFilingArtifactUpsertRequest,
    ) -> RejectedFilingArtifact:
        """Write or update a rejected filing artifact.

        Args:
            req: artifact write request.

        Returns:
            the artifact after write-back.

        Raises:
            OSError: raised when the write fails.
        """

        return self._execute_with_auto_batch(
            req.ticker,
            self._upsert_rejected_filing_artifact_impl,
            req,
        )

    def _upsert_rejected_filing_artifact_impl(
        self,
        req: RejectedFilingArtifactUpsertRequest,
    ) -> RejectedFilingArtifact:
        """Perform the rejected-filing artifact write.

        Args:
            req: artifact write request.

        Returns:
            the artifact after write-back.

        Raises:
            OSError: raised when the write fails.
        """

        normalized_ticker = _normalize_ticker(req.ticker)
        meta_path = self._rejected_filing_meta_path(normalized_ticker, req.document_id)
        now = now_iso8601()
        previous_meta = _read_json_object(meta_path) if meta_path.exists() else {}
        artifact = RejectedFilingArtifact(
            ticker=normalized_ticker,
            document_id=req.document_id,
            internal_document_id=req.internal_document_id,
            accession_number=req.accession_number,
            company_id=req.company_id,
            form_type=req.form_type,
            filing_date=req.filing_date,
            report_date=req.report_date,
            primary_document=req.primary_document,
            selected_primary_document=req.selected_primary_document,
            rejection_reason=req.rejection_reason,
            rejection_category=req.rejection_category,
            classification_version=req.classification_version,
            source_fingerprint=req.source_fingerprint,
            files=req.files,
            fiscal_year=req.fiscal_year,
            fiscal_period=req.fiscal_period,
            report_kind=req.report_kind,
            amended=req.amended,
            has_xbrl=req.has_xbrl,
            ingest_method=req.ingest_method,
            rejected_at=str(previous_meta.get("rejected_at", "")).strip() or now,
            created_at=str(previous_meta.get("created_at", "")).strip() or now,
            updated_at=now,
        )
        _write_json(meta_path, artifact.to_meta_dict())
        return artifact

    def get_rejected_filing_artifact(
        self,
        ticker: str,
        document_id: str,
    ) -> RejectedFilingArtifact:
        """Read a rejected filing artifact.

        Args:
            ticker: ticker.
            document_id: document ID.

        Returns:
            artifact object.

        Raises:
            FileNotFoundError: raised when the meta does not exist.
            ValueError: raised when the meta content is invalid.
        """

        normalized_ticker = _normalize_ticker(ticker)
        meta = _read_json_object(
            self._rejected_filing_meta_path_for_read(normalized_ticker, document_id)
        )
        return RejectedFilingArtifact.from_meta_dict(meta)

    def list_rejected_filing_artifacts(
        self,
        ticker: str,
    ) -> list[RejectedFilingArtifact]:
        """List rejected filing artifacts under a ticker.

        Args:
            ticker: ticker.

        Returns:
            artifact list, sorted ascending by document_id.

        Raises:
            OSError: raised when the directory read fails.
        """

        normalized_ticker = _normalize_ticker(ticker)
        result: list[RejectedFilingArtifact] = []
        for document_id in _list_directory_names(
            self._rejected_filings_root_for_read(normalized_ticker)
        ):
            try:
                result.append(self.get_rejected_filing_artifact(normalized_ticker, document_id))
            except (FileNotFoundError, ValueError) as exc:
                Log.warn(
                    (
                        "skipping corrupted rejected filing artifact: "
                        f"ticker={normalized_ticker} document_id={document_id} error={exc}"
                    ),
                    module=self.MODULE,
                )
                continue
        return result

    def read_rejected_filing_file_bytes(
        self,
        ticker: str,
        document_id: str,
        filename: str,
    ) -> bytes:
        """Read rejected filing file content.

        Args:
            ticker: ticker.
            document_id: document ID.
            filename: filename.

        Returns:
            file binary content.

        Raises:
            FileNotFoundError: raised when the file does not exist.
            IsADirectoryError: raised when the target is a directory.
            OSError: raised when the read fails.
        """

        path = self._rejected_filing_file_path_for_read(
            _normalize_ticker(ticker), document_id, filename
        )
        if not path.exists():
            raise FileNotFoundError(f"rejected filing file does not exist: {path}")
        if path.is_dir():
            raise IsADirectoryError(f"target is a directory; cannot read it as a file: {path}")
        return path.read_bytes()

    # ========== filing-directory cleanup ==========

    def clear_filing_documents(self, ticker: str) -> None:
        """Clear the filings directory contents under a ticker.

        Args:
            ticker: ticker.

        Returns:
            None.

        Raises:
            OSError: raised when cleanup fails.
        """

        self._execute_with_auto_batch(
            ticker,
            self._clear_filing_documents_impl,
            ticker,
        )

    def _clear_filing_documents_impl(self, ticker: str) -> None:
        """Perform filings-directory cleanup (internal implementation).

        Args:
            ticker: ticker.

        Returns:
            None.

        Raises:
            OSError: raised when cleanup fails.
        """

        normalized_ticker = _normalize_ticker(ticker)
        filings_dir = self._ticker_dir_for_write(normalized_ticker) / "filings"
        if not filings_dir.exists():
            return
        for child in filings_dir.iterdir():
            if child.is_dir():
                shutil.rmtree(child)
                continue
            child.unlink(missing_ok=True)

    def cleanup_stale_filing_documents(
        self,
        ticker: str,
        *,
        active_form_types: set[str],
        valid_document_ids: set[str],
    ) -> int:
        """Clean up expired in-window filing documents and manifest entries.

        Args:
            ticker: ticker.
            active_form_types: the set of form_types covered by this download window.
            valid_document_ids: set of document_ids that should survive this round.

        Returns:
            number of documents actually cleaned up.

        Raises:
            OSError: raised when cleanup or manifest update fails.
            ValueError: raised when metadata or manifest content is invalid.
        """

        return self._execute_with_auto_batch(
            ticker,
            self._cleanup_stale_filing_documents_impl,
            ticker,
            active_form_types,
            valid_document_ids,
        )

    def _cleanup_stale_filing_documents_impl(
        self,
        ticker: str,
        active_form_types: set[str],
        valid_document_ids: set[str],
    ) -> int:
        """Perform in-window expired-filing cleanup (internal implementation).

        Args:
            ticker: ticker.
            active_form_types: the set of form_types covered by this download window.
            valid_document_ids: set of document_ids that should survive this round.

        Returns:
            number of documents actually cleaned up.

        Raises:
            OSError: raised when cleanup or manifest update fails.
            ValueError: raised when metadata or manifest content is invalid.
        """

        normalized_ticker = _normalize_ticker(ticker)
        filings_dir = self._ticker_dir_for_write(normalized_ticker) / "filings"
        if not filings_dir.exists() or not active_form_types:
            return 0

        stale_document_ids: list[str] = []
        for child in filings_dir.iterdir():
            if not child.is_dir() or not child.name.startswith("fil_"):
                continue
            meta_path = child / _SOURCE_META_FILENAME
            if not meta_path.exists():
                continue
            try:
                meta = _read_json_object(meta_path)
            except (ValueError, OSError):
                continue
            form_type = str(meta.get("form_type", "")).strip()
            if form_type not in active_form_types:
                continue
            if child.name in valid_document_ids:
                continue
            stale_document_ids.append(child.name)

        if not stale_document_ids:
            return 0

        stale_document_ids.sort()
        self._remove_manifest_items(
            self._filing_manifest_path(normalized_ticker),
            normalized_ticker,
            stale_document_ids,
        )
        for document_id in stale_document_ids:
            shutil.rmtree(filings_dir / document_id)
        return len(stale_document_ids)
