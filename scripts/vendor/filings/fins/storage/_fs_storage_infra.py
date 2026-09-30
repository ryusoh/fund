"""Filesystem storage infrastructure layer.

Provides shared instance state, batch transactions, path methods, manifest
operations, handle helpers, etc., as the single base class for all domain
mixins.
"""

from __future__ import annotations

import os
import shutil
import socket
import uuid
from pathlib import Path
from typing import Any, Callable, Optional, TextIO, TypeVar

import scripts.vendor.filings.file_lock as file_lock_module
from scripts.vendor.filings.fins.domain.document_models import (
    BatchToken,
    CompanyMeta,
    FilingManifestItem,
    MaterialManifestItem,
    ProcessedHandle,
    ProcessedManifestItem,
    SourceHandle,
    now_iso8601,
)
from scripts.vendor.filings.fins.domain.enums import SourceKind
from scripts.vendor.filings.log import Log

from ._fs_storage_utils import (
    _DOWNLOAD_REJECTIONS_FILENAME,
    _PROCESSED_META_FILENAME,
    _REJECTED_FILINGS_DIRNAME,
    _SOURCE_META_FILENAME,
    _normalize_entry_name,
    _normalize_source_kind,
    _normalize_ticker,
    _read_json_object,
    _source_dir_name,
    _write_json,
)
from .file_store import FileStore
from .local_file_store import LocalFileStore

_T = TypeVar("_T")

_STATE_DIRNAME = ".filings"
_BATCH_ROOT_DIRNAME = "repo_batches"
_BACKUP_ROOT_DIRNAME = "repo_backups"
_LOCK_ROOT_DIRNAME = "batch_locks"
_RECOVERY_LOCK_FILENAME = "batch_recovery.lock"
_JOURNAL_FILENAME = "transaction.json"
_PHASE_STARTED = "started"
_PHASE_BACKED_UP_TARGET = "backed_up_target"
_PHASE_SWAPPED_TARGET = "swapped_target"
_PHASE_COMMITTED = "committed"
_PHASE_ROLLED_BACK = "rolled_back"


def _parse_backup_directory_name(name: str) -> tuple[str, str] | None:
    """Parse the ticker and token from a backup directory name.

    Args:
        name: backup directory name.

    Returns:
        `(ticker, token_id)` on success, otherwise `None`.

    Raises:
        None.
    """

    ticker, separator, token_id = name.rpartition(".bak.")
    if not separator or not ticker or not token_id:
        return None
    return ticker, token_id


class _FsStorageInfra:
    """Filesystem storage infrastructure base class.

    Provides shared state, batch transactions, path resolution, manifest
    operations, and handle helpers; all domain mixins inherit from this class.
    """

    MODULE = "FINS.FS_REPOSITORY"

    def __init__(
        self,
        workspace_root: Path,
        file_store: Optional[FileStore] = None,
        *,
        create_directories: bool = True,
    ) -> None:
        """Initialize the repository infrastructure.

        Args:
            workspace_root: workspace root directory.
            file_store: optional file-store implementation (defaults to the local filesystem).
            create_directories: whether to create repository root directories at initialization.

        Returns:
            None.

        Raises:
            OSError: raised when directory creation fails.
        """

        self.workspace_root = workspace_root.resolve()
        self.portfolio_root = self.workspace_root / "portfolio"
        self.state_root = self.workspace_root / _STATE_DIRNAME
        self.batch_root = self.state_root / _BATCH_ROOT_DIRNAME
        self.backup_root = self.state_root / _BACKUP_ROOT_DIRNAME
        self._batch_lock_root = self.state_root / _LOCK_ROOT_DIRNAME
        self._recovery_lock_path = self.state_root / _RECOVERY_LOCK_FILENAME
        self._create_directories = create_directories
        self._batch_recovery_completed = False
        self._active_batches: dict[str, BatchToken] = {}
        self._ticker_lock_streams: dict[str, TextIO] = {}
        self._company_meta_by_ticker: Optional[dict[str, CompanyMeta]] = None
        self._alias_index: Optional[dict[str, list[str]]] = None
        self._file_store = file_store
        if create_directories:
            self.portfolio_root.mkdir(parents=True, exist_ok=True)
            self._ensure_batch_storage_dirs()

    def ensure_batch_recovery(self) -> tuple[str, ...]:
        """Ensure orphan-batch recovery has run once for the current workspace.

        Args:
            None.

        Returns:
            summary of actions taken by this recovery.

        Raises:
            OSError: raised when recovery fails to access the filesystem.
        """

        if self._batch_recovery_completed:
            return ()
        actions = self.recover_orphan_batches()
        self._batch_recovery_completed = True
        return actions

    # ========== Batch transactions ==========

    def begin_batch(self, ticker: str) -> BatchToken:
        """Open a batch transaction.

        Args:
            ticker: ticker.

        Returns:
            batch token.

        Raises:
            RuntimeError: raised when an active transaction already exists for the same ticker.
            OSError: raised when staging-directory preparation fails.
        """

        normalized_ticker = _normalize_ticker(ticker)
        if normalized_ticker in self._active_batches:
            raise RuntimeError(f"ticker={normalized_ticker} already has an active batch")

        self._ensure_batch_storage_dirs()
        self.ensure_batch_recovery()
        lock_stream = self._acquire_ticker_lock(normalized_ticker)
        token_id = uuid.uuid4().hex
        target_ticker_dir = self._target_ticker_dir(normalized_ticker)
        staging_root_dir = self.batch_root / token_id
        staging_ticker_dir = staging_root_dir / normalized_ticker
        backup_dir = self.backup_root / f"{target_ticker_dir.name}.bak.{token_id}"
        journal_path = staging_root_dir / _JOURNAL_FILENAME
        token = BatchToken(
            token_id=token_id,
            ticker=normalized_ticker,
            target_ticker_dir=target_ticker_dir,
            staging_root_dir=staging_root_dir,
            staging_ticker_dir=staging_ticker_dir,
            backup_dir=backup_dir,
            journal_path=journal_path,
            ticker_lock_path=self._ticker_lock_path(normalized_ticker),
            created_at=now_iso8601(),
        )
        try:
            self._write_batch_journal(token, _PHASE_STARTED)
            if target_ticker_dir.exists():
                shutil.copytree(target_ticker_dir, staging_ticker_dir)
            else:
                self._ensure_ticker_structure(staging_ticker_dir)
        except Exception:
            shutil.rmtree(staging_root_dir, ignore_errors=True)
            self._release_ticker_lock(normalized_ticker, stream=lock_stream)
            raise

        self._active_batches[normalized_ticker] = token
        return token

    def commit_batch(self, token: BatchToken) -> None:
        """Commit a batch transaction.

        Args:
            token: batch token.

        Returns:
            None.

        Raises:
            ValueError: raised when the token is not the current active transaction.
            OSError: raised when the commit fails.
        """

        current = self._active_batches.get(token.ticker)
        if current is None or current.token_id != token.token_id:
            raise ValueError("invalid batch token; cannot commit")

        target_dir = token.target_ticker_dir
        staging_dir = token.staging_ticker_dir
        backup_dir = token.backup_dir
        preserved_swapped_target = False

        try:
            # use a "backup first, then replace" approach to reduce corruption risk from interrupted commits.
            if target_dir.exists():
                shutil.move(str(target_dir), str(backup_dir))
                self._write_batch_journal(token, _PHASE_BACKED_UP_TARGET)
            target_dir.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(staging_dir), str(target_dir))
            self._write_batch_journal(token, _PHASE_SWAPPED_TARGET)
            if backup_dir.exists():
                shutil.rmtree(backup_dir)
            self._write_batch_journal(token, _PHASE_COMMITTED)
            self._invalidate_company_meta_caches()
        except Exception:
            if backup_dir.exists() and target_dir.exists() and not staging_dir.exists():
                shutil.rmtree(target_dir, ignore_errors=True)
            if backup_dir.exists() and not target_dir.exists():
                shutil.move(str(backup_dir), str(target_dir))
            elif target_dir.exists() and not staging_dir.exists():
                preserved_swapped_target = True

            if preserved_swapped_target:
                self._invalidate_company_meta_caches()
                Log.warn(
                    f"commit_batch failed to write the journal after the target swap; target directory kept: ticker={token.ticker}",
                    module=self.MODULE,
                )
            else:
                self._write_batch_journal(token, _PHASE_ROLLED_BACK)
                Log.warn(
                    f"commit_batch failed; backup restored: ticker={token.ticker}", module=self.MODULE
                )
            raise
        finally:
            self._active_batches.pop(token.ticker, None)
            shutil.rmtree(token.staging_root_dir, ignore_errors=True)
            self._release_ticker_lock(token.ticker)

    def rollback_batch(self, token: BatchToken) -> None:
        """Roll back a batch transaction.

        Args:
            token: batch token.

        Returns:
            None.

        Raises:
            ValueError: raised when the token is not the current active transaction.
            OSError: raised when cleanup fails.
        """

        current = self._active_batches.get(token.ticker)
        if current is None or current.token_id != token.token_id:
            raise ValueError("invalid batch token; cannot roll back")
        self._active_batches.pop(token.ticker, None)
        self._invalidate_company_meta_caches()
        rollback_error: Exception | None = None
        try:
            self._write_batch_journal(token, _PHASE_ROLLED_BACK)
        except Exception as exc:
            rollback_error = exc
            Log.warn(
                f"rollback_batch failed to write the journal but still cleans staging and releases the lock: ticker={token.ticker}",
                module=self.MODULE,
            )
        finally:
            try:
                shutil.rmtree(token.staging_root_dir, ignore_errors=True)
            finally:
                self._release_ticker_lock(token.ticker)
        if rollback_error is not None:
            raise rollback_error

    def _execute_with_auto_batch(
        self,
        ticker: str,
        operation: Callable[..., _T],
        *args: Any,
        **kwargs: Any,
    ) -> _T:
        """Execute writes with an automatically opened batch when no transaction is active.

        Args:
            ticker: ticker.
            operation: the concrete execution function.
            *args: positional arguments passed to the execution function.
            **kwargs: keyword arguments passed to the execution function.

        Returns:
            execution function return value.

        Raises:
            Exception: the original exception is re-raised when execution or commit fails.
        """

        normalized_ticker = _normalize_ticker(ticker)
        if normalized_ticker in self._active_batches:
            return operation(*args, **kwargs)
        token = self.begin_batch(normalized_ticker)
        try:
            result = operation(*args, **kwargs)
        except Exception as operation_error:
            # note: when a write fails, staging must be rolled back explicitly to avoid a half-updated directory.
            Log.warn(f"write failed; batch rolled back: ticker={token.ticker}", module=self.MODULE)
            rollback_error: Exception | None = None
            try:
                self.rollback_batch(token)
            except Exception as exc:
                rollback_error = exc
            if rollback_error is not None:
                operation_error.add_note(f"rollback_batch failed: {rollback_error}")
            raise
        self.commit_batch(token)
        return result

    def _invalidate_company_meta_caches(self) -> None:
        """Clear company-level metadata and alias-index caches.

        Args:
            None.

        Returns:
            None.

        Raises:
            None.
        """

        self._company_meta_by_ticker = None
        self._alias_index = None

    def recover_orphan_batches(self, *, dry_run: bool = False) -> tuple[str, ...]:
        """Recover orphan batches/backups left behind by an abnormal exit.

        Args:
            dry_run: whether to only return the actions that would be taken, without touching the filesystem.

        Returns:
            action-summary tuple.

        Raises:
            OSError: raised when filesystem access fails.
        """

        if not self._should_manage_batch_state():
            return ()
        self._ensure_batch_storage_dirs()
        lock_stream = self._acquire_recovery_lock()
        try:
            actions = self._recover_orphan_batch_dirs(dry_run=dry_run)
            actions.extend(self._recover_orphan_backup_dirs(dry_run=dry_run))
        finally:
            self._release_lock_stream(lock_stream)
        return tuple(actions)

    def _should_manage_batch_state(self) -> bool:
        """Determine whether batch persistent state needs to be touched.

        Args:
            None.

        Returns:
            `True` when batch state under `.filings` should be accessed.

        Raises:
            None.
        """

        return (
            self._create_directories
            or self.state_root.exists()
            or self.batch_root.exists()
            or self.backup_root.exists()
        )

    def _ensure_batch_storage_dirs(self) -> None:
        """Ensure the batch base directories under `.filings` exist.

        Args:
            None.

        Returns:
            None.

        Raises:
            OSError: raised when directory creation fails.
        """

        self.state_root.mkdir(parents=True, exist_ok=True)
        self.batch_root.mkdir(parents=True, exist_ok=True)
        self.backup_root.mkdir(parents=True, exist_ok=True)
        self._batch_lock_root.mkdir(parents=True, exist_ok=True)

    def _ticker_lock_path(self, ticker: str) -> Path:
        """Return the transaction lock path for the given ticker.

        Args:
            ticker: ticker.

        Returns:
            lock-file path.

        Raises:
            None.
        """

        return self._batch_lock_root / f"{ticker}.lock"

    def _open_and_lock_stream(self, lock_path: Path, *, blocking: bool) -> TextIO:
        """Open and hold a file lock.

        Args:
            lock_path: lock-file path.
            blocking: whether to block while waiting for the lock.

        Returns:
            locked file stream.

        Raises:
            RuntimeError: raised when the lock is already held in non-blocking mode.
            OSError: raised when the lock file cannot be opened or locked.
        """

        lock_path.parent.mkdir(parents=True, exist_ok=True)
        stream = lock_path.open("a+", encoding="utf-8")
        try:
            file_lock_module.acquire_text_file_lock(
                stream,
                blocking=blocking,
                lock_name="Fins batch file lock",
            )
        except OSError as exc:
            stream.close()
            if not blocking and file_lock_module.is_lock_contention_error(exc):
                raise RuntimeError(f"ticker={lock_path.stem} already has an active cross-process batch") from exc
            raise
        return stream

    def _release_lock_stream(self, stream: TextIO) -> None:
        """Release and close the file lock stream.

        Args:
            stream: locked file stream.

        Returns:
            None.

        Raises:
            OSError: raised when the unlock fails.
        """

        try:
            file_lock_module.release_text_file_lock(
                stream,
                lock_name="Fins batch file lock",
            )
        finally:
            stream.close()

    def _acquire_ticker_lock(self, ticker: str) -> TextIO:
        """Acquire the cross-process transaction lock for a ticker.

        Args:
            ticker: ticker.

        Returns:
            locked file stream.

        Raises:
            RuntimeError: raised when the lock is held by another process.
            OSError: raised when lock-file access fails.
        """

        stream = self._open_and_lock_stream(self._ticker_lock_path(ticker), blocking=False)
        self._ticker_lock_streams[ticker] = stream
        return stream

    def _release_ticker_lock(self, ticker: str, *, stream: TextIO | None = None) -> None:
        """Release the cross-process transaction lock for a ticker.

        Args:
            ticker: ticker.
            stream: optional explicit file stream; the internal cached stream is used when not provided.

        Returns:
            None.

        Raises:
            OSError: raised when the unlock fails.
        """

        effective_stream = stream or self._ticker_lock_streams.pop(ticker, None)
        if effective_stream is None:
            return
        self._release_lock_stream(effective_stream)

    def _acquire_recovery_lock(self) -> TextIO:
        """Acquire the global batch recovery lock.

        Args:
            None.

        Returns:
            locked file stream.

        Raises:
            OSError: raised when lock-file access fails.
        """

        return self._open_and_lock_stream(self._recovery_lock_path, blocking=True)

    def _write_batch_journal(self, token: BatchToken, phase: str) -> None:
        """Write the transaction phase to the journal.

        Args:
            token: batch token.
            phase: current transaction phase.

        Returns:
            None.

        Raises:
            OSError: raised when the journal write fails.
        """

        payload = {
            "token_id": token.token_id,
            "ticker": token.ticker,
            "created_at": token.created_at,
            "owner_pid": str(self._current_pid()),
            "hostname": socket.gethostname(),
            "phase": phase,
            "target_dir": str(token.target_ticker_dir),
            "staging_root_dir": str(token.staging_root_dir),
            "staging_ticker_dir": str(token.staging_ticker_dir),
            "backup_dir": str(token.backup_dir),
            "journal_path": str(token.journal_path),
            "ticker_lock_path": str(token.ticker_lock_path),
        }
        _write_json(token.journal_path, payload)

    def _current_pid(self) -> int:
        """Return the current process PID.

        Args:
            None.

        Returns:
            current process PID.

        Raises:
            None.
        """
        return os.getpid()

    def _recover_orphan_batch_dirs(self, *, dry_run: bool) -> list[str]:
        """Scan and recover batch staging directories.

        Args:
            dry_run: whether to only return the actions that would be taken.

        Returns:
            action-summary list.

        Raises:
            OSError: raised when filesystem access fails.
        """

        actions: list[str] = []
        if not self.batch_root.exists():
            return actions
        for token_dir in sorted(self.batch_root.iterdir(), key=lambda item: item.name):
            if not token_dir.is_dir():
                continue
            actions.extend(self._recover_single_batch_dir(token_dir, dry_run=dry_run))
        return actions

    def _recover_single_batch_dir(self, token_dir: Path, *, dry_run: bool) -> list[str]:
        """Recover a single batch-token directory.

        Args:
            token_dir: token root directory.
            dry_run: whether to only return the actions that would be taken.

        Returns:
            action-summary list.

        Raises:
            OSError: raised when filesystem access fails.
        """

        actions: list[str] = []
        journal_path = token_dir / _JOURNAL_FILENAME
        journal_exists = journal_path.exists()
        journal = _read_json_object(journal_path) if journal_exists else {}
        ticker = str(journal.get("ticker", "")).strip() or self._infer_batch_ticker(token_dir)
        phase = str(journal.get("phase", "")).strip()
        if not ticker:
            reason = "missing ticker journal" if journal_exists else "missing journal"
            action = f"skip batch token={token_dir.name} phase={phase or 'unknown'} reason={reason}"
            actions.append(action)
            return actions
        normalized_ticker = _normalize_ticker(ticker)
        ticker_stream = self._try_acquire_recovery_ticker_lock(normalized_ticker)
        if ticker_stream is None:
            return actions
        try:
            target_dir = self._target_ticker_dir(normalized_ticker)
            backup_dir = Path(
                str(journal.get("backup_dir", "")).strip()
                or self.backup_root / f"{normalized_ticker}.bak.{token_dir.name}"
            )
            if phase == _PHASE_BACKED_UP_TARGET and backup_dir.exists() and not target_dir.exists():
                actions.append(
                    f"restore backup ticker={normalized_ticker} token={token_dir.name} phase={phase}"
                )
                if not dry_run:
                    target_dir.parent.mkdir(parents=True, exist_ok=True)
                    shutil.move(str(backup_dir), str(target_dir))
            elif phase == _PHASE_SWAPPED_TARGET and backup_dir.exists() and target_dir.exists():
                actions.append(
                    f"delete backup ticker={normalized_ticker} token={token_dir.name} phase={phase}"
                )
                if not dry_run:
                    shutil.rmtree(backup_dir, ignore_errors=True)
            elif backup_dir.exists() and not target_dir.exists():
                actions.append(
                    f"restore backup ticker={normalized_ticker} token={token_dir.name} phase={phase or 'unknown'}"
                )
                if not dry_run:
                    target_dir.parent.mkdir(parents=True, exist_ok=True)
                    shutil.move(str(backup_dir), str(target_dir))
            elif backup_dir.exists() and target_dir.exists():
                actions.append(
                    f"delete backup ticker={normalized_ticker} token={token_dir.name} phase={phase or 'unknown'}"
                )
                if not dry_run:
                    shutil.rmtree(backup_dir, ignore_errors=True)
            actions.append(
                f"cleanup batch ticker={normalized_ticker} token={token_dir.name} phase={phase or 'unknown'}"
            )
            if not dry_run:
                shutil.rmtree(token_dir, ignore_errors=True)
        finally:
            self._release_lock_stream(ticker_stream)
        return actions

    def _recover_orphan_backup_dirs(self, *, dry_run: bool) -> list[str]:
        """Scan and recover orphan backup directories.

        Args:
            dry_run: whether to only return the actions that would be taken.

        Returns:
            action-summary list.

        Raises:
            OSError: raised when filesystem access fails.
        """

        actions: list[str] = []
        if not self.backup_root.exists():
            return actions
        for backup_dir in sorted(self.backup_root.iterdir(), key=lambda item: item.name):
            if not backup_dir.is_dir():
                continue
            parsed = _parse_backup_directory_name(backup_dir.name)
            if parsed is None:
                continue
            ticker, token_id = parsed
            token_dir = self.batch_root / token_id
            if token_dir.exists():
                continue
            normalized_ticker = _normalize_ticker(ticker)
            ticker_stream = self._try_acquire_recovery_ticker_lock(normalized_ticker)
            if ticker_stream is None:
                continue
            try:
                target_dir = self._target_ticker_dir(normalized_ticker)
                if target_dir.exists():
                    actions.append(f"delete backup ticker={normalized_ticker} token={token_id}")
                    if not dry_run:
                        shutil.rmtree(backup_dir, ignore_errors=True)
                    continue
                actions.append(f"restore backup ticker={normalized_ticker} token={token_id}")
                if not dry_run:
                    target_dir.parent.mkdir(parents=True, exist_ok=True)
                    shutil.move(str(backup_dir), str(target_dir))
            finally:
                self._release_lock_stream(ticker_stream)
        return actions

    def _infer_batch_ticker(self, token_dir: Path) -> str:
        """Infer the ticker from the token directory structure.

        Args:
            token_dir: token root directory.

        Returns:
            inferred ticker; empty string when it cannot be inferred.

        Raises:
            OSError: raised when directory access fails.
        """

        try:
            for child in token_dir.iterdir():
                if child.is_dir():
                    return child.name.strip()
        except FileNotFoundError:
            # under concurrent recovery, a live batch may, after the recovery scan collected the token list,
            # have already committed and removed the staging root before this token is actually entered.
            # treat it as a "vanished token that needs no recovery" instead of letting ENOENT
            # abort the entire recover_orphan_batches flow.
            return ""
        return ""

    def _try_acquire_recovery_ticker_lock(self, ticker: str) -> TextIO | None:
        """Try to acquire a ticker's lock during recovery.

        Args:
            ticker: ticker.

        Returns:
            the locked file stream on success; `None` when the lock is held by an active transaction.

        Raises:
            OSError: raised when lock-file access fails.
        """

        try:
            return self._open_and_lock_stream(self._ticker_lock_path(ticker), blocking=False)
        except RuntimeError:
            return None

    # ========== Handle helpers ==========

    def _handle_dir_path(self, handle: SourceHandle | ProcessedHandle) -> Path:
        """Return the document directory path for a handle.

        Args:
            handle: source-document/processed-artifact handle.

        Returns:
            document directory path.

        Raises:
            ValueError: raised when the source kind is invalid.
            OSError: raised when path construction fails.
        """

        normalized_ticker = _normalize_ticker(handle.ticker)
        if isinstance(handle, ProcessedHandle):
            return self._processed_dir_for_read(normalized_ticker, handle.document_id)
        source_kind = _normalize_source_kind(handle.source_kind)
        return self._source_root_for_read(normalized_ticker, source_kind) / handle.document_id

    def _resolve_handle_child_path(self, handle: SourceHandle | ProcessedHandle, name: str) -> Path:
        """Resolve direct child entry paths under a handle directory.

        Args:
            handle: source-document/processed-artifact handle.
            name: direct child entry name.

        Returns:
            resolved absolute path.

        Raises:
            ValueError: raised when the name is empty, contains a path separator, or escapes the root.
        """

        normalized_name = _normalize_entry_name(name)
        base_dir = self._handle_dir_path(handle)
        candidate = (base_dir / normalized_name).resolve()
        try:
            candidate.relative_to(base_dir.resolve())
        except ValueError as exc:
            raise ValueError("entry name escapes the root; accessing paths outside the document directory is forbidden") from exc
        return candidate

    def _get_handle_meta(self, handle: SourceHandle | ProcessedHandle) -> dict[str, Any]:
        """Read the meta.json for a handle.

        Args:
            handle: document handle.

        Returns:
            meta.json content.

        Raises:
            FileNotFoundError: raised when meta.json does not exist.
            ValueError: raised when the JSON content is invalid.
        """

        normalized_ticker = _normalize_ticker(handle.ticker)
        if isinstance(handle, ProcessedHandle):
            meta_path = self._processed_meta_path_for_read(normalized_ticker, handle.document_id)
        else:
            source_kind = _normalize_source_kind(handle.source_kind)
            meta_path = self._source_meta_path_for_read(
                normalized_ticker, handle.document_id, source_kind
            )
        if not meta_path.exists():
            raise FileNotFoundError(f"meta.json does not exist: {meta_path}")
        return _read_json_object(meta_path)

    # ========== Core helpers ==========

    def _ensure_ticker_structure(self, ticker_dir: Path) -> None:
        """Ensure the ticker directory structure exists.

        Args:
            ticker_dir: ticker directory path.

        Returns:
            None.

        Raises:
            OSError: raised when directory creation fails.
        """

        (ticker_dir / "filings").mkdir(parents=True, exist_ok=True)
        (ticker_dir / "materials").mkdir(parents=True, exist_ok=True)
        (ticker_dir / "processed").mkdir(parents=True, exist_ok=True)

    def _build_file_store(self, ticker: str) -> FileStore:
        """Build the file-store instance.

        Args:
            ticker: ticker.

        Returns:
            file-store instance.

        Raises:
            OSError: raised when directory creation fails.
        """

        if self._file_store is not None:
            return self._file_store
        return LocalFileStore(root=self._file_store_root_for_ticker(ticker), scheme="local")

    def _build_store_key(self, handle: SourceHandle | ProcessedHandle, filename: str) -> str:
        """Build an object-store key.

        Args:
            handle: document handle.
            filename: filename.

        Returns:
            logical key.

        Raises:
            ValueError: raised when the source kind is invalid.
        """

        normalized_ticker = _normalize_ticker(handle.ticker)
        if isinstance(handle, ProcessedHandle):
            return f"{normalized_ticker}/processed/{handle.document_id}/{filename}"
        source_kind = _normalize_source_kind(handle.source_kind)
        return (
            f"{normalized_ticker}/{_source_dir_name(source_kind)}/{handle.document_id}/{filename}"
        )

    def _select_primary_document(
        self,
        explicit_primary: Optional[str],
        previous_primary: Any,
        current_file_names: list[str],
        previous_file_names: list[str],
    ) -> Optional[str]:
        """Determine the primary filename.

        Args:
            explicit_primary: primary filename explicitly passed in the request.
            previous_primary: primary filename in the old meta.
            current_file_names: filenames written this time.
            previous_file_names: filenames saved last time.

        Returns:
            primary filename; `None` when it cannot be determined.

        Raises:
            None.
        """

        if isinstance(explicit_primary, str) and explicit_primary.strip():
            return explicit_primary
        if isinstance(previous_primary, str) and previous_primary.strip():
            return previous_primary
        if current_file_names:
            return current_file_names[0]
        if previous_file_names:
            return previous_file_names[0]
        return None

    # ========== Manifest operations ==========

    def upsert_filing_manifest(self, ticker: str, items: list[FilingManifestItem]) -> None:
        """Batch merge-write the filing manifest.

        Args:
            ticker: ticker.
            items: filing manifest item list.

        Returns:
            None.

        Raises:
            OSError: raised when the write fails.
        """

        self._execute_with_auto_batch(
            ticker,
            self._upsert_filing_manifest_impl,
            ticker,
            items,
        )

    def _upsert_filing_manifest_impl(self, ticker: str, items: list[FilingManifestItem]) -> None:
        """Perform the filing-manifest merge write (internal implementation).

        Args:
            ticker: ticker.
            items: filing manifest item list.

        Returns:
            None.

        Raises:
            OSError: raised when the write fails.
        """

        normalized_ticker = _normalize_ticker(ticker)
        payloads = [item.to_dict() for item in items]
        self._upsert_manifest_items(
            self._filing_manifest_path(normalized_ticker), normalized_ticker, payloads
        )

    def upsert_material_manifest(self, ticker: str, items: list[MaterialManifestItem]) -> None:
        """Batch merge-write the material manifest.

        Args:
            ticker: ticker.
            items: material manifest item list.

        Returns:
            None.

        Raises:
            OSError: raised when the write fails.
        """

        self._execute_with_auto_batch(
            ticker,
            self._upsert_material_manifest_impl,
            ticker,
            items,
        )

    def _upsert_material_manifest_impl(
        self, ticker: str, items: list[MaterialManifestItem]
    ) -> None:
        """Perform the material-manifest merge write (internal implementation).

        Args:
            ticker: ticker.
            items: material manifest item list.

        Returns:
            None.

        Raises:
            OSError: raised when the write fails.
        """

        normalized_ticker = _normalize_ticker(ticker)
        payloads = [item.to_dict() for item in items]
        self._upsert_manifest_items(
            self._material_manifest_path(normalized_ticker), normalized_ticker, payloads
        )

    def upsert_processed_manifest(self, ticker: str, items: list[ProcessedManifestItem]) -> None:
        """Batch merge-write the processed manifest.

        Args:
            ticker: ticker.
            items: processed manifest item list.

        Returns:
            None.

        Raises:
            OSError: raised when the write fails.
        """

        self._execute_with_auto_batch(
            ticker,
            self._upsert_processed_manifest_impl,
            ticker,
            items,
        )

    def _upsert_processed_manifest_impl(
        self, ticker: str, items: list[ProcessedManifestItem]
    ) -> None:
        """Perform the processed-manifest merge write (internal implementation).

        Args:
            ticker: ticker.
            items: processed manifest item list.

        Returns:
            None.

        Raises:
            OSError: raised when the write fails.
        """

        normalized_ticker = _normalize_ticker(ticker)
        payloads = [item.to_dict() for item in items]
        self._upsert_manifest_items(
            self._processed_manifest_path(normalized_ticker), normalized_ticker, payloads
        )

    def _upsert_manifest_items(self, path: Path, ticker: str, items: list[dict[str, Any]]) -> None:
        """Merge and write manifest items.

        Args:
            path: manifest file path.
            ticker: ticker.
            items: list of items to write.

        Returns:
            None.

        Raises:
            OSError: write failed.
        """

        manifest = self._read_manifest(path, ticker)
        documents_map = {
            doc["document_id"]: doc for doc in manifest["documents"] if "document_id" in doc
        }
        for item in items:
            documents_map[item["document_id"]] = item
        manifest["documents"] = sorted(documents_map.values(), key=lambda x: x["document_id"])
        manifest["updated_at"] = now_iso8601()
        _write_json(path, manifest)

    def _remove_manifest_item(self, path: Path, ticker: str, document_id: str) -> None:
        """Remove one document item from a manifest.

        Args:
            path: manifest file path.
            ticker: ticker.
            document_id: document ID.

        Returns:
            None.

        Raises:
            OSError: write failed.
        """

        manifest = self._read_manifest(path, ticker)
        manifest["documents"] = [
            doc for doc in manifest["documents"] if doc.get("document_id") != document_id
        ]
        manifest["updated_at"] = now_iso8601()
        _write_json(path, manifest)

    def _remove_manifest_items(self, path: Path, ticker: str, document_ids: list[str]) -> None:
        """Remove multiple document items from a manifest.

        Args:
            path: manifest file path.
            ticker: ticker.
            document_ids: list of document IDs to remove.

        Returns:
            None.

        Raises:
            OSError: raised when the write fails.
        """

        stale_set = set(document_ids)
        manifest = self._read_manifest(path, ticker)
        manifest["documents"] = [
            doc for doc in manifest["documents"] if doc.get("document_id") not in stale_set
        ]
        manifest["updated_at"] = now_iso8601()
        _write_json(path, manifest)

    def _read_manifest(self, path: Path, ticker: str) -> dict[str, Any]:
        """Read the manifest, returning the default structure when absent.

        Args:
            path: manifest path.
            ticker: ticker.

        Returns:
            manifest dict.

        Raises:
            ValueError: raised when the JSON content is invalid.
            OSError: raised when the file read fails.
        """

        if path.exists():
            return _read_json_object(path)
        return {"ticker": ticker, "updated_at": now_iso8601(), "documents": []}

    # ========== Path methods ==========

    def _target_ticker_dir(self, ticker: str) -> Path:
        """Return the canonical ticker directory.

        Args:
            ticker: ticker.

        Returns:
            canonical directory path.

        Raises:
            None.
        """

        return self.portfolio_root / ticker

    def _ticker_dir_for_write(self, ticker: str) -> Path:
        """Return the currently writable ticker directory (batch staging preferred).

        Args:
            ticker: ticker.

        Returns:
            writable directory path.

        Raises:
            OSError: raised when directory creation fails.
        """

        token = self._active_batches.get(ticker)
        if token is not None:
            self._ensure_ticker_structure(token.staging_ticker_dir)
            return token.staging_ticker_dir
        target = self._target_ticker_dir(ticker)
        self._ensure_ticker_structure(target)
        return target

    def _ticker_dir_for_read(self, ticker: str) -> Path:
        """Return the currently readable ticker directory (batch staging preferred).

        Args:
            ticker: ticker.

        Returns:
            readable directory path.

        Raises:
            None.
        """

        token = self._active_batches.get(ticker)
        if token is not None:
            return token.staging_ticker_dir
        return self._target_ticker_dir(ticker)

    def _file_store_root_for_ticker(self, ticker: str) -> Path:
        """Get the file-store root directory (batch-staging compatible).

        Args:
            ticker: ticker.

        Returns:
            file-store root directory.

        Raises:
            OSError: raised when directory creation fails.
        """

        token = self._active_batches.get(ticker)
        if token is not None:
            self._ensure_ticker_structure(token.staging_ticker_dir)
            return token.staging_ticker_dir.parent
        self._ensure_ticker_structure(self._target_ticker_dir(ticker))
        return self.portfolio_root

    def _source_root(self, ticker: str, source_kind: SourceKind) -> Path:
        """Return the source-directory root path.

        Args:
            ticker: ticker.
            source_kind: source kind.

        Returns:
            source directory path.

        Raises:
            OSError: raised when directory creation fails.
        """

        ticker_dir = self._ticker_dir_for_write(ticker)
        if source_kind == SourceKind.FILING:
            return ticker_dir / "filings"
        return ticker_dir / "materials"

    def _source_root_for_read(self, ticker: str, source_kind: SourceKind) -> Path:
        """Return the source-directory root path (for reading).

        Args:
            ticker: ticker.
            source_kind: source kind.

        Returns:
            source directory path.

        Raises:
            None.
        """

        ticker_dir = self._ticker_dir_for_read(ticker)
        if source_kind == SourceKind.FILING:
            return ticker_dir / "filings"
        return ticker_dir / "materials"

    def _source_meta_path(self, ticker: str, document_id: str, source_kind: SourceKind) -> Path:
        """Return the source-document meta path.

        Args:
            ticker: ticker.
            document_id: document ID.
            source_kind: source kind.

        Returns:
            meta file path.

        Raises:
            OSError: raised when path construction fails.
        """

        return self._source_root(ticker, source_kind) / document_id / _SOURCE_META_FILENAME

    def _source_meta_path_for_read(
        self, ticker: str, document_id: str, source_kind: SourceKind
    ) -> Path:
        """Return the source-document meta path (for reading).

        Args:
            ticker: ticker.
            document_id: document ID.
            source_kind: source kind.

        Returns:
            meta file path.

        Raises:
            None.
        """

        return self._source_root_for_read(ticker, source_kind) / document_id / _SOURCE_META_FILENAME

    def _company_meta_path(self, ticker: str) -> Path:
        """Return the company-level meta path.

        Args:
            ticker: ticker.

        Returns:
            company-level meta path.

        Raises:
            OSError: raised when path construction fails.
        """

        normalized_ticker = _normalize_ticker(ticker)
        return self._ticker_dir_for_write(normalized_ticker) / _SOURCE_META_FILENAME

    def _company_meta_path_for_read(self, ticker: str) -> Path:
        """Return the company-level meta path (for reading).

        Args:
            ticker: ticker.

        Returns:
            company-level meta path.

        Raises:
            None.
        """

        normalized_ticker = _normalize_ticker(ticker)
        return self._ticker_dir_for_read(normalized_ticker) / _SOURCE_META_FILENAME

    def _filing_manifest_path(self, ticker: str) -> Path:
        """Return the filing manifest path.

        Args:
            ticker: ticker.

        Returns:
            filing manifest path.

        Raises:
            OSError: raised when path construction fails.
        """

        return self._ticker_dir_for_write(ticker) / "filings" / "filing_manifest.json"

    def _filing_manifest_path_for_read(self, ticker: str) -> Path:
        """Return the filing manifest path (for reading).

        Args:
            ticker: ticker.

        Returns:
            filing manifest path.

        Raises:
            None.
        """

        return self._ticker_dir_for_read(ticker) / "filings" / "filing_manifest.json"

    def _material_manifest_path(self, ticker: str) -> Path:
        """Return the material manifest path.

        Args:
            ticker: ticker.

        Returns:
            material manifest path.

        Raises:
            OSError: raised when path construction fails.
        """

        return self._ticker_dir_for_write(ticker) / "materials" / "material_manifest.json"

    def _material_manifest_path_for_read(self, ticker: str) -> Path:
        """Return the material manifest path (for reading).

        Args:
            ticker: ticker.

        Returns:
            material manifest path.

        Raises:
            None.
        """

        return self._ticker_dir_for_read(ticker) / "materials" / "material_manifest.json"

    def _processed_manifest_path(self, ticker: str) -> Path:
        """Return the processed manifest path.

        Args:
            ticker: ticker.

        Returns:
            processed manifest path.

        Raises:
            OSError: raised when path construction fails.
        """

        return self._ticker_dir_for_write(ticker) / "processed" / "manifest.json"

    def _processed_manifest_path_for_read(self, ticker: str) -> Path:
        """Return the processed manifest path (for reading).

        Args:
            ticker: ticker.

        Returns:
            processed manifest path.

        Raises:
            None.
        """

        return self._ticker_dir_for_read(ticker) / "processed" / "manifest.json"

    def _processed_dir_for_write(self, ticker: str, document_id: str) -> Path:
        """Get the processed-artifact directory path (for writing).

        Args:
            ticker: ticker.
            document_id: document ID.

        Returns:
            processed-artifact directory path.

        Raises:
            OSError: raised when path construction fails.
        """

        normalized_ticker = _normalize_ticker(ticker)
        return self._ticker_dir_for_write(normalized_ticker) / "processed" / document_id

    def _processed_dir_for_read(self, ticker: str, document_id: str) -> Path:
        """Get the processed-artifact directory path (for reading).

        Args:
            ticker: ticker.
            document_id: document ID.

        Returns:
            processed-artifact directory path.

        Raises:
            None.
        """

        normalized_ticker = _normalize_ticker(ticker)
        return self._ticker_dir_for_read(normalized_ticker) / "processed" / document_id

    def _processed_meta_path(self, ticker: str, document_id: str) -> Path:
        """Get the processed-artifact tool_snapshot_meta.json path.

        Args:
            ticker: ticker.
            document_id: document ID.

        Returns:
            tool_snapshot_meta.json path.

        Raises:
            OSError: raised when path construction fails.
        """

        return self._processed_dir_for_write(ticker, document_id) / _PROCESSED_META_FILENAME

    def _processed_meta_path_for_read(self, ticker: str, document_id: str) -> Path:
        """Get the processed-artifact tool_snapshot_meta.json path (for reading).

        Args:
            ticker: ticker.
            document_id: document ID.

        Returns:
            tool_snapshot_meta.json path.

        Raises:
            None.
        """

        return self._processed_dir_for_read(ticker, document_id) / _PROCESSED_META_FILENAME

    def _download_rejections_path(self, ticker: str) -> Path:
        """Return the download-rejection-registry path.

        Args:
            ticker: ticker.

        Returns:
            rejection-registry path.

        Raises:
            OSError: raised when path construction fails.
        """

        return self._ticker_dir_for_write(ticker) / "filings" / _DOWNLOAD_REJECTIONS_FILENAME

    def _download_rejections_path_for_read(self, ticker: str) -> Path:
        """Return the download-rejection-registry path (for reading).

        Args:
            ticker: ticker.

        Returns:
            rejection-registry path.

        Raises:
            None.
        """

        return self._ticker_dir_for_read(ticker) / "filings" / _DOWNLOAD_REJECTIONS_FILENAME

    def _rejected_filings_root(self, ticker: str) -> Path:
        """Return the rejected filings root directory.

        Args:
            ticker: ticker.

        Returns:
            rejected filings root directory.

        Raises:
            OSError: raised when path construction fails.
        """

        return self._ticker_dir_for_write(ticker) / "filings" / _REJECTED_FILINGS_DIRNAME

    def _rejected_filings_root_for_read(self, ticker: str) -> Path:
        """Return the rejected filings root directory (for reading).

        Args:
            ticker: ticker.

        Returns:
            rejected filings root directory.

        Raises:
            None.
        """

        return self._ticker_dir_for_read(ticker) / "filings" / _REJECTED_FILINGS_DIRNAME

    def _rejected_filing_dir(self, ticker: str, document_id: str) -> Path:
        """Return a single rejected filing directory.

        Args:
            ticker: ticker.
            document_id: document ID.

        Returns:
            document directory path.

        Raises:
            OSError: raised when path construction fails.
        """

        return self._rejected_filings_root(ticker) / document_id

    def _rejected_filing_dir_for_read(self, ticker: str, document_id: str) -> Path:
        """Return a single rejected filing directory (for reading).

        Args:
            ticker: ticker.
            document_id: document ID.

        Returns:
            document directory path.

        Raises:
            None.
        """

        return self._rejected_filings_root_for_read(ticker) / document_id

    def _rejected_filing_meta_path(self, ticker: str, document_id: str) -> Path:
        """Return the rejected filing meta path.

        Args:
            ticker: ticker.
            document_id: document ID.

        Returns:
            meta.json path.

        Raises:
            OSError: raised when path construction fails.
        """

        return self._rejected_filing_dir(ticker, document_id) / _SOURCE_META_FILENAME

    def _rejected_filing_meta_path_for_read(self, ticker: str, document_id: str) -> Path:
        """Return the rejected filing meta path (for reading).

        Args:
            ticker: ticker.
            document_id: document ID.

        Returns:
            meta.json path.

        Raises:
            None.
        """

        return self._rejected_filing_dir_for_read(ticker, document_id) / _SOURCE_META_FILENAME

    def _rejected_filing_file_path_for_read(
        self, ticker: str, document_id: str, filename: str
    ) -> Path:
        """Return the rejected filing file path (for reading).

        Args:
            ticker: ticker.
            document_id: document ID.
            filename: filename.

        Returns:
            file path.

        Raises:
            ValueError: raised when the filename is empty or escapes the root.
        """

        normalized_name = _normalize_entry_name(filename)
        base_dir = self._rejected_filing_dir_for_read(ticker, document_id)
        candidate = (base_dir / normalized_name).resolve()
        try:
            candidate.relative_to(base_dir.resolve())
        except ValueError as exc:
            raise ValueError("entry name escapes the root; accessing paths outside the document directory is forbidden") from exc
        return candidate
