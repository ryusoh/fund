"""Filesystem repository — blob / file-entry operations mixin."""

from __future__ import annotations

import shutil
from typing import BinaryIO, Optional

from scripts.vendor.filings.fins.domain.document_models import (
    DocumentEntry,
    FileObjectMeta,
    ProcessedHandle,
    SourceHandle,
)

from ._fs_storage_infra import _FsStorageInfra
from ._fs_storage_utils import (
    _file_object_meta_from_dict,
    _normalize_ticker,
)


class _FsBlobMixin(_FsStorageInfra):
    """Blob / file-entry operations mixin."""

    def list_entries(self, handle: SourceHandle | ProcessedHandle) -> list[DocumentEntry]:
        """List direct child entries of a document directory.

        Args:
            handle: source-document/processed-artifact handle.

        Returns:
            direct child entry list; empty list when the directory does not exist.

        Raises:
            OSError: raised when the directory read fails.
        """

        directory = self._handle_dir_path(handle)
        if not directory.exists() or not directory.is_dir():
            return []
        return [
            DocumentEntry(name=child.name, is_file=child.is_file())
            for child in sorted(directory.iterdir(), key=lambda item: item.name)
        ]

    def read_file_bytes(self, handle: SourceHandle | ProcessedHandle, filename: str) -> bytes:
        """Read a single file's content under a document directory.

        Args:
            handle: source-document/processed-artifact handle.
            filename: direct child filename.

        Returns:
            file binary content.

        Raises:
            FileNotFoundError: raised when the file does not exist.
            IsADirectoryError: raised when the target is a directory.
            OSError: raised when the read fails.
        """

        path = self._resolve_handle_child_path(handle, filename)
        if not path.exists():
            raise FileNotFoundError(f"file does not exist: {path}")
        if path.is_dir():
            raise IsADirectoryError(f"target is a directory; cannot read it as a file: {path}")
        return path.read_bytes()

    def delete_entry(self, handle: SourceHandle | ProcessedHandle, name: str) -> None:
        """Delete a single direct child entry of a document directory.

        Args:
            handle: source-document/processed-artifact handle.
            name: direct child entry name.

        Returns:
            None.

        Raises:
            FileNotFoundError: raised when the entry does not exist.
            OSError: raised when the delete fails.
        """

        self._execute_with_auto_batch(
            handle.ticker,
            self._delete_entry_impl,
            handle,
            name,
        )

    def _delete_entry_impl(self, handle: SourceHandle | ProcessedHandle, name: str) -> None:
        """Perform a single direct-child-entry deletion (internal implementation).

        Args:
            handle: source-document/processed-artifact handle.
            name: direct child entry name.

        Returns:
            None.

        Raises:
            FileNotFoundError: raised when the entry does not exist.
            OSError: raised when the delete fails.
        """

        path = self._resolve_handle_child_path(handle, name)
        if not path.exists():
            raise FileNotFoundError(f"entry does not exist: {path}")
        if path.is_dir():
            shutil.rmtree(path)
            return
        path.unlink()

    def store_file(
        self,
        handle: SourceHandle | ProcessedHandle,
        filename: str,
        data: BinaryIO,
        *,
        content_type: Optional[str] = None,
        metadata: Optional[dict[str, str]] = None,
    ) -> FileObjectMeta:
        """Store a file and return its metadata.

        Args:
            handle: source-document/processed-artifact handle.
            filename: filename.
            data: file binary stream.
            content_type: optional content type.
            metadata: optional extended metadata.

        Returns:
            file object metadata.

        Raises:
            FileNotFoundError: raised when the document for the handle does not exist.
            OSError: raised when the write fails.
        """

        normalized_filename = str(filename).strip()
        if not normalized_filename:
            raise ValueError("filename must not be empty")
        normalized_ticker = _normalize_ticker(handle.ticker)
        key = self._build_store_key(handle, normalized_filename)
        file_store = self._build_file_store(normalized_ticker)
        return file_store.put_object(
            key,
            data,
            content_type=content_type,
            metadata=metadata,
        )

    def list_files(self, handle: SourceHandle | ProcessedHandle) -> list[FileObjectMeta]:
        """List the file metadata associated with a document.

        Args:
            handle: source-document/processed-artifact handle.

        Returns:
            file metadata list.

        Raises:
            FileNotFoundError: raised when the document does not exist.
            ValueError: raised when the metadata format is invalid.
        """

        meta = self._get_handle_meta(handle)
        files = meta.get("files", [])
        if not isinstance(files, list):
            raise ValueError("meta.files must be a list")
        result: list[FileObjectMeta] = []
        for item in files:
            if not isinstance(item, dict):
                continue
            result.append(_file_object_meta_from_dict(item))
        return result
