"""Cross-platform text-file lock helper.

Uniformly wraps POSIX `fcntl.flock()` and Windows `msvcrt.locking()`
for modules that need cross-process mutual exclusion.

The module-level `_FCNTL` / `_MSVCRT` serve as the single entry point to the
platform backend, allowing tests to inject fake backends on a non-host platform
via `monkeypatch.setattr` to verify cross-platform branch behavior; in
production these two variables are initialized by `sys.platform` narrowing,
keeping pyright's type analysis precise.
"""

from __future__ import annotations

import errno
import os
import sys
import time
from typing import Protocol, TextIO, cast

_WINDOWS_LOCK_RETRY_INTERVAL_SEC = 0.1


class _MsvcrtLockingModule(Protocol):
    """Minimal protocol of the Windows `msvcrt` lock interface."""

    LK_NBLCK: int
    LK_UNLCK: int

    def locking(self, fd: int, mode: int, nbytes: int) -> None:
        """Lock or unlock the given byte range."""

        ...


class _FcntlLockingModule(Protocol):
    """Minimal protocol of the POSIX `fcntl` lock interface."""

    LOCK_EX: int
    LOCK_NB: int
    LOCK_UN: int

    def flock(self, fd: int, operation: int) -> None:
        """Perform an flock operation on a file descriptor."""

        ...


if sys.platform == "win32":
    import msvcrt as _msvcrt_native

    _FCNTL: _FcntlLockingModule | None = None
    _MSVCRT: _MsvcrtLockingModule | None = cast(_MsvcrtLockingModule, _msvcrt_native)
else:
    import fcntl as _fcntl_native

    _FCNTL: _FcntlLockingModule | None = cast(_FcntlLockingModule, _fcntl_native)
    _MSVCRT: _MsvcrtLockingModule | None = None


def ensure_lock_region(stream: TextIO, *, region_bytes: int) -> None:
    """Ensure the lock file has a fixed lockable byte region.

    Args:
        stream: opened lock-file stream.
        region_bytes: number of bytes to lock.

    Returns:
        None.

    Raises:
        OSError: raised when the write or sync fails.
        ValueError: raised when `region_bytes` is not positive.
    """

    if region_bytes <= 0:
        raise ValueError("region_bytes must be greater than 0")
    stream.seek(0, os.SEEK_END)
    if stream.tell() >= region_bytes:
        stream.seek(0)
        return
    stream.write("\0" * region_bytes)
    stream.flush()
    os.fsync(stream.fileno())
    stream.seek(0)


def is_lock_contention_error(exc: OSError) -> bool:
    """Judge whether this is a cross-process file-lock contention error.

    Args:
        exc: the caught underlying `OSError`.

    Returns:
        `True` when the error is caused by lock contention, otherwise `False`.

    Raises:
        None.
    """

    return exc.errno in {errno.EACCES, errno.EAGAIN} or getattr(exc, "winerror", None) == 33


def acquire_text_file_lock(
    stream: TextIO,
    *,
    blocking: bool,
    region_bytes: int = 1,
    lock_name: str,
) -> None:
    """Acquire a cross-platform exclusive lock on a text file stream.

    Args:
        stream: opened text stream.
        blocking: whether to block waiting for the lock.
        region_bytes: number of bytes to lock on Windows.
        lock_name: description of the lock's purpose, used in error messages.

    Returns:
        None.

    Raises:
        OSError: raised when no lock implementation is available on this platform, or the underlying lock call fails.
        ValueError: raised when `region_bytes` is invalid.
    """

    fcntl_backend = _FCNTL
    if fcntl_backend is not None:
        lock_flags = fcntl_backend.LOCK_EX
        if not blocking:
            lock_flags |= fcntl_backend.LOCK_NB
        fcntl_backend.flock(stream.fileno(), lock_flags)
        return
    msvcrt_backend = _MSVCRT
    if msvcrt_backend is not None:
        ensure_lock_region(stream, region_bytes=region_bytes)
        while True:
            stream.seek(0)
            try:
                msvcrt_backend.locking(stream.fileno(), msvcrt_backend.LK_NBLCK, region_bytes)
                return
            except OSError as exc:
                if not blocking or not is_lock_contention_error(exc):
                    raise
                # Windows LK_LOCK retries at most 10 times, which violates blocking=True semantics;
                # poll LK_NBLCK explicitly here until the lock is actually acquired.
                time.sleep(_WINDOWS_LOCK_RETRY_INTERVAL_SEC)
    raise OSError(f"the current platform does not support {lock_name}")


def release_text_file_lock(
    stream: TextIO,
    *,
    region_bytes: int = 1,
    lock_name: str,
) -> None:
    """Release the cross-platform exclusive lock on a text file stream.

    Args:
        stream: opened and locked text stream.
        region_bytes: number of bytes to unlock on Windows.
        lock_name: description of the lock's purpose, used in error messages.

    Returns:
        None.

    Raises:
        OSError: raised when no lock implementation is available on this platform, or the underlying unlock call fails.
        ValueError: raised when `region_bytes` is invalid.
    """

    fcntl_backend = _FCNTL
    if fcntl_backend is not None:
        fcntl_backend.flock(stream.fileno(), fcntl_backend.LOCK_UN)
        return
    msvcrt_backend = _MSVCRT
    if msvcrt_backend is not None:
        stream.seek(0)
        msvcrt_backend.locking(stream.fileno(), msvcrt_backend.LK_UNLCK, region_bytes)
        return
    raise OSError(f"the current platform does not support {lock_name}")
