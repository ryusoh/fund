"""Filesystem repository — company-metadata operations mixin."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from scripts.vendor.filings.fins.domain.document_models import (
    CompanyMeta,
    CompanyMetaInventoryEntry,
    now_iso8601,
)

from ._fs_storage_infra import _FsStorageInfra
from ._fs_storage_utils import (
    _SOURCE_META_FILENAME,
    _normalize_company_ticker_aliases,
    _normalize_ticker,
    _read_json_object,
    _write_json,
)


class _FsCompanyMetaMixin(_FsStorageInfra):
    """Company-metadata operations mixin."""

    # ---------- public interface ----------

    def get_company_meta(self, ticker: str) -> CompanyMeta:
        """Read company-level metadata.

        Args:
            ticker: ticker.

        Returns:
            company-level metadata object.

        Raises:
            FileNotFoundError: raised when the metadata file does not exist.
            ValueError: raised when a metadata field is missing or malformed.
        """

        normalized_ticker = _normalize_ticker(ticker)
        if normalized_ticker not in self._active_batches:
            cached_company_meta = self._get_cached_company_meta(normalized_ticker)
            if cached_company_meta is not None:
                return cached_company_meta
        company_meta_path = self._company_meta_path_for_read(normalized_ticker)
        if not company_meta_path.exists():
            raise FileNotFoundError(f"company metadata does not exist: {company_meta_path}")
        data = _read_json_object(company_meta_path)
        company_meta = CompanyMeta.from_dict(data)
        if normalized_ticker not in self._active_batches:
            self._cache_company_meta(company_meta)
        return company_meta

    def scan_company_meta_inventory(self) -> list[CompanyMetaInventoryEntry]:
        """Scan company directories and return a metadata inventory.

        this interface serves upper-layer callers that enumerate company directories in bulk, uniformly via the storage
        layer identifies hidden directories, missing `meta.json`, and invalid metadata, so upper layers need not blindly
        scan the assembled `portfolio/` path.

        Args:
            None.

        Returns:
            scan result list sorted by directory name.

        Raises:
            OSError: raised when filesystem access fails.
        """

        inventory: list[CompanyMetaInventoryEntry] = []
        if self.state_root.exists():
            inventory.append(
                CompanyMetaInventoryEntry(
                    directory_name=self.state_root.name,
                    status="hidden_directory",
                    detail="internal state directory is excluded from company meta batch processing",
                )
            )
        if not self.portfolio_root.exists():
            return inventory

        for ticker_dir in sorted(self.portfolio_root.iterdir(), key=lambda item: item.name):
            if not ticker_dir.is_dir():
                continue
            directory_name = ticker_dir.name.strip()
            if not directory_name:
                continue
            if ticker_dir.name.startswith("."):
                inventory.append(
                    CompanyMetaInventoryEntry(
                        directory_name=directory_name,
                        status="hidden_directory",
                        detail="hidden directory is excluded from company meta batch processing",
                    )
                )
                continue

            meta_path = ticker_dir / _SOURCE_META_FILENAME
            if not meta_path.exists():
                inventory.append(
                    CompanyMetaInventoryEntry(
                        directory_name=directory_name,
                        status="missing_meta",
                        detail="missing meta.json",
                    )
                )
                continue

            try:
                company_meta = CompanyMeta.from_dict(_read_json_object(meta_path))
            except (KeyError, TypeError, ValueError) as exc:
                inventory.append(
                    CompanyMetaInventoryEntry(
                        directory_name=directory_name,
                        status="invalid_meta",
                        detail=str(exc),
                    )
                )
                continue

            inventory.append(
                CompanyMetaInventoryEntry(
                    directory_name=directory_name,
                    status="available",
                    company_meta=company_meta,
                )
            )
        return inventory

    def upsert_company_meta(self, meta: CompanyMeta) -> None:
        """Write company-level metadata.

        Args:
            meta: company-level metadata object.

        Returns:
            None.

        Raises:
            OSError: raised when the write fails.
        """

        self._execute_with_auto_batch(meta.ticker, self._upsert_company_meta_impl, meta)

    def _upsert_company_meta_impl(self, meta: CompanyMeta) -> None:
        """Perform the company-metadata write (internal implementation).

        Args:
            meta: company-level metadata object.

        Returns:
            None.

        Raises:
            OSError: raised when the write fails.
        """

        ticker = _normalize_ticker(meta.ticker)
        ticker_dir = self._ticker_dir_for_write(ticker)
        self._ensure_ticker_structure(ticker_dir)
        normalized_meta = CompanyMeta(
            company_id=meta.company_id,
            company_name=meta.company_name,
            ticker=ticker,
            market=meta.market,
            resolver_version=meta.resolver_version,
            updated_at=meta.updated_at or now_iso8601(),
            ticker_aliases=_normalize_company_ticker_aliases(
                canonical_ticker=ticker,
                ticker_aliases=meta.ticker_aliases,
            ),
        )
        _write_json(ticker_dir / _SOURCE_META_FILENAME, normalized_meta.to_dict())
        self._invalidate_company_meta_caches()

    def resolve_existing_ticker(self, candidates: list[str]) -> Optional[str]:
        """Resolve an existing repository ticker by candidate order.

        Args:
            candidates: candidate ticker list; order is priority.

        Returns:
            first matching repository ticker; `None` when none exists.

        Raises:
            OSError: raised when filesystem access fails.
            ValueError: raised when one alias matches multiple company directories.
        """

        for candidate in candidates:
            normalized_ticker = _normalize_ticker(candidate)
            if self._target_ticker_dir(normalized_ticker).exists():
                return normalized_ticker
        return self._resolve_existing_ticker_by_company_alias(candidates)

    # ---------- internal implementation ----------

    def _resolve_existing_ticker_by_company_alias(self, candidates: list[str]) -> Optional[str]:
        """Resolve an existing ticker via the alias in company-level `meta.json`.

        Args:
            candidates: candidate ticker list; order is priority.

        Returns:
            first matching canonical ticker; `None` when none exists.

        Raises:
            OSError: raised when filesystem access fails.
            ValueError: raised when one alias matches multiple company directories.
        """

        normalized_candidates = [_normalize_ticker(candidate) for candidate in candidates]
        if not normalized_candidates:
            return None
        alias_to_tickers = self._build_company_alias_index()
        for candidate in normalized_candidates:
            matched_tickers = alias_to_tickers.get(candidate, [])
            if len(matched_tickers) > 1:
                raise ValueError(f"ticker alias={candidate} matches multiple company directories: {matched_tickers}")
            if len(matched_tickers) == 1:
                return matched_tickers[0]
        return None

    def _build_company_alias_index(self) -> dict[str, list[str]]:
        """Scan company-level `meta.json` files and build the alias index.

        Args:
            None.

        Returns:
            `alias -> [ticker]` mapping.

        Raises:
            OSError: raised when filesystem access fails.
            ValueError: raised when company-level metadata format is invalid.
        """

        if self._alias_index is not None and not self._active_batches:
            return {alias: tickers.copy() for alias, tickers in self._alias_index.items()}
        company_meta_by_ticker = self._scan_company_meta_by_ticker()
        alias_index = self._build_company_alias_index_from_meta(company_meta_by_ticker)
        if not self._active_batches:
            self._company_meta_by_ticker = company_meta_by_ticker
            self._alias_index = alias_index
        return {alias: tickers.copy() for alias, tickers in alias_index.items()}

    def _get_cached_company_meta(self, ticker: str) -> Optional[CompanyMeta]:
        """Read company-level metadata from the cache.

        Args:
            ticker: canonical ticker.

        Returns:
            cached company-level metadata; `None` on a miss.

        Raises:
            None.
        """

        if self._company_meta_by_ticker is None:
            return None
        return self._company_meta_by_ticker.get(ticker)

    def _cache_company_meta(self, meta: CompanyMeta) -> None:
        """Write a single company-level metadata entry into the cache.

        Args:
            meta: company-level metadata.

        Returns:
            None.

        Raises:
            None.
        """

        if self._company_meta_by_ticker is None:
            self._company_meta_by_ticker = {}
        self._company_meta_by_ticker[_normalize_ticker(meta.ticker)] = meta

    def _scan_company_meta_by_ticker(self) -> dict[str, CompanyMeta]:
        """Scan company-level metadata in the current readable view.

        the current readable view contains:
        - company directories already committed to `portfolio/*`.
        - staging directories of active batches in the same instance (overriding canonical directories).

        Args:
            None.

        Returns:
            `ticker -> CompanyMeta` mapping.

        Raises:
            OSError: raised when filesystem access fails.
            ValueError: raised when company-level metadata format is invalid.
        """

        company_meta_by_ticker: dict[str, CompanyMeta] = {}
        ticker_dirs = self._collect_readable_ticker_dirs()
        for ticker, ticker_dir in ticker_dirs.items():
            meta_path = ticker_dir / _SOURCE_META_FILENAME
            if not meta_path.exists():
                continue
            company_meta = CompanyMeta.from_dict(_read_json_object(meta_path))
            company_meta_by_ticker[_normalize_ticker(ticker)] = company_meta
        return company_meta_by_ticker

    def _build_company_alias_index_from_meta(
        self,
        company_meta_by_ticker: dict[str, CompanyMeta],
    ) -> dict[str, list[str]]:
        """Build the alias index from company-level metadata.

        Args:
            company_meta_by_ticker: `ticker -> CompanyMeta` mapping.

        Returns:
            `alias -> [ticker]` mapping.

        Raises:
            ValueError: raised when a ticker in company-level metadata is invalid.
        """

        alias_index: dict[str, list[str]] = {}
        for normalized_ticker in sorted(company_meta_by_ticker):
            company_meta = company_meta_by_ticker[normalized_ticker]
            normalized_aliases = _normalize_company_ticker_aliases(
                canonical_ticker=normalized_ticker,
                ticker_aliases=company_meta.ticker_aliases,
            )
            for alias in normalized_aliases:
                alias_index.setdefault(alias, [])
                if normalized_ticker not in alias_index[alias]:
                    alias_index[alias].append(normalized_ticker)
        return alias_index

    def _collect_readable_ticker_dirs(self) -> dict[str, Path]:
        """Collect ticker directories in this instance's readable view.

        an active batch's staging directory shadows the canonical directory of the same name, keeping alias resolution and
        `get_company_meta()` working on the same read view.

        Args:
            None.

        Returns:
            `ticker -> directory path` mapping.

        Raises:
            OSError: raised when filesystem access fails.
        """

        ticker_dirs: dict[str, Path] = {}
        if self.portfolio_root.exists():
            for ticker_dir in sorted(self.portfolio_root.iterdir(), key=lambda item: item.name):
                if not ticker_dir.is_dir():
                    continue
                ticker_dirs[_normalize_ticker(ticker_dir.name)] = ticker_dir
        for ticker, token in self._active_batches.items():
            ticker_dirs[_normalize_ticker(ticker)] = token.staging_ticker_dir
        return ticker_dirs
