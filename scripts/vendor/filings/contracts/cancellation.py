"""Cooperative cancellation primitive shared by cross-layer executable paths."""

from __future__ import annotations

import threading
from typing import Callable


class CancelledError(Exception):
    """Execution was cancelled.

    Raised by raise_if_cancelled() after the CancellationToken has been triggered.
    """


class CancellationToken:
    """Cooperative cancellation token. Thread-safe.

    Usage:
    - the creator holds the token reference and calls cancel() when cancellation is needed
    - the executor periodically calls raise_if_cancelled() in its loop or checks is_cancelled()
    """

    def __init__(self) -> None:
        """Initialize the cancellation token."""
        self._event = threading.Event()
        self._callbacks: list[Callable[[], None]] = []
        self._lock = threading.Lock()

    def cancel(self) -> None:
        """Trigger cancellation."""
        if self._event.is_set():
            return
        self._event.set()
        with self._lock:
            callbacks = list(self._callbacks)
            self._callbacks.clear()
        for callback in callbacks:
            try:
                callback()
            except Exception:
                pass

    def is_cancelled(self) -> bool:
        """Check whether cancellation has been requested."""
        return self._event.is_set()

    def raise_if_cancelled(self) -> None:
        """Raise CancelledError if already cancelled."""
        if self._event.is_set():
            raise CancelledError("operation cancelled")

    def on_cancel(self, callback: Callable[[], None]) -> Callable[[], None]:
        """Register a cancellation callback.

        Args:
            callback: callback to run when cancellation triggers.

        Returns:
            Callable[[], None]: a function that unregisters the callback; a no-op if the token is already cancelled.

        Raises:
            None. Exceptions raised by callbacks are swallowed internally.
        """
        with self._lock:
            if self._event.is_set():
                try:
                    callback()
                except Exception:
                    pass
                return _noop_unregister
            self._callbacks.append(callback)

        def _unregister() -> None:
            """Remove the currently registered cancellation callback.

            Args:
                None.

            Returns:
                None.

            Raises:
                None.
            """

            with self._lock:
                if self._event.is_set():
                    return
                try:
                    self._callbacks.remove(callback)
                except ValueError:
                    return

        return _unregister

    def wait(self, timeout: float | None = None) -> bool:
        """Block until the cancellation signal fires."""
        return self._event.wait(timeout=timeout)

    @classmethod
    def create_linked(cls, *parents: "CancellationToken") -> "CancellationToken":
        """Create a cascading cancellation token."""
        child = cls()
        for parent in parents:
            parent.on_cancel(child.cancel)
        return child


def _noop_unregister() -> None:
    """No-op callback unregistration function.

    Args:
        None.

    Returns:
        None.

    Raises:
        None.
    """
