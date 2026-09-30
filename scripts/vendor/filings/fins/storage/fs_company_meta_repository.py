"""Filesystem-based company-metadata repository implementation."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from scripts.vendor.filings.fins.domain.document_models import (
    CompanyMeta,
    CompanyMetaInventoryEntry,
)

from ._fs_repository_factory import _FsRepositorySet, build_fs_repository_set
from .file_store import FileStore
from .repository_protocols import CompanyMetaRepositoryProtocol


class FsCompanyMetaRepository(CompanyMetaRepositoryProtocol):
    """Filesystem-based company-metadata repository implementation."""

    def __init__(
        self,
        workspace_root: Path,
        *,
        file_store: Optional[FileStore] = None,
        repository_set: Optional[_FsRepositorySet] = None,
    ) -> None:
        """Initialize the company-metadata repository.

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

    def scan_company_meta_inventory(self) -> list[CompanyMetaInventoryEntry]:
        """Scan company directories and return a metadata inventory."""

        return self._repository_set.core.scan_company_meta_inventory()

    def get_company_meta(self, ticker: str) -> CompanyMeta:
        """Read company-level metadata."""

        return self._repository_set.core.get_company_meta(ticker)

    def upsert_company_meta(self, meta: CompanyMeta) -> None:
        """Write company-level metadata."""

        self._repository_set.core.upsert_company_meta(meta)

    def resolve_existing_ticker(self, ticker_candidates: list[str]) -> Optional[str]:
        """Resolve the canonical ticker that exists in the workspace among the candidates."""

        return self._repository_set.core.resolve_existing_ticker(ticker_candidates)
