"""Helpers for constructing the shared filesystem narrow-repository core."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from ._fs_storage_core import FsStorageCore
from .file_store import FileStore


@dataclass(frozen=True)
class _FsRepositorySet:
    """Shared filesystem repository core set.

    This object is only used during concrete-implementation assembly, to
    avoid multiple narrow repositories each creating their own private
    filesystem storage core, which would break batch/cache sharing semantics
    within the same workspace.
    """

    core: FsStorageCore


def build_fs_repository_set(
    *,
    workspace_root: Path,
    file_store: Optional[FileStore] = None,
    repository_set: Optional[_FsRepositorySet] = None,
    create_directories: bool = True,
) -> _FsRepositorySet:
    """Build the shared filesystem repository core set.

    Args:
        workspace_root: workspace root directory.
        file_store: optional file-store implementation.
        repository_set: optional existing shared set; reused directly when given.
        create_directories: whether to create the repository root directories during initialization.

    Returns:
        shared filesystem repository core set.

    Raises:
        OSError: raised when repository initialization fails.
    """

    if repository_set is not None:
        return repository_set
    core = FsStorageCore(
        workspace_root=workspace_root,
        file_store=file_store,
        create_directories=create_directories,
    )
    if create_directories:
        core.ensure_batch_recovery()
    return _FsRepositorySet(
        core=core,
    )
