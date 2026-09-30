"""Filesystem batch-transaction repository implementation."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from scripts.vendor.filings.fins.domain.document_models import BatchToken

from ._fs_repository_factory import _FsRepositorySet, build_fs_repository_set
from .file_store import FileStore
from .repository_protocols import BatchingRepositoryProtocol


class FsBatchingRepository(BatchingRepositoryProtocol):
    """Filesystem-based batch-transaction repository implementation."""

    def __init__(
        self,
        workspace_root: Path,
        *,
        file_store: Optional[FileStore] = None,
        repository_set: Optional[_FsRepositorySet] = None,
    ) -> None:
        """Initialize the batch-transaction repository.

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

    def begin_batch(self, ticker: str) -> BatchToken:
        """Open a batch transaction."""

        return self._repository_set.core.begin_batch(ticker)

    def commit_batch(self, token: BatchToken) -> None:
        """Commit a batch transaction."""

        self._repository_set.core.commit_batch(token)

    def rollback_batch(self, token: BatchToken) -> None:
        """Roll back a batch transaction."""

        self._repository_set.core.rollback_batch(token)

    def recover_orphan_batches(self, *, dry_run: bool = False) -> tuple[str, ...]:
        """Recover orphan batches/backups left behind by an abnormal exit."""

        return self._repository_set.core.recover_orphan_batches(dry_run=dry_run)
