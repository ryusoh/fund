"""Financial-report tool cache component.

This module only provides Processor instance caching:
- in-process caching only.
- LRU eviction only (no TTL).
- thread-safe, suitable for concurrent calls from multi-threaded tools.
"""

from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from threading import RLock
from typing import Generic, Optional, TypeVar

ProcessorT = TypeVar("ProcessorT")


@dataclass(frozen=True)
class ProcessorCacheKey:
    """Processor cache key.

    Attributes:
        ticker: ticker (normalized).
        document_id: unique document identifier.
    """

    ticker: str
    document_id: str


class ProcessorLRUCache(Generic[ProcessorT]):
    """Thread-safe LRU cache for Processors.

    Design notes:
    - This cache evicts by access order only (LRU); it does not expire entries over time.
    - A read hit is promoted to the most-recently-used position.
    - When the capacity limit is reached, the least-recently-used entry is evicted.
    """

    def __init__(self, max_entries: int = 128) -> None:
        """Initialize the cache.

        Args:
            max_entries: maximum cache entries; must be greater than 0.

        Returns:
            None.

        Raises:
            ValueError: raised when `max_entries <= 0`.
        """

        if max_entries <= 0:
            raise ValueError("max_entries must be greater than 0")
        self._max_entries = int(max_entries)
        self._store: OrderedDict[ProcessorCacheKey, ProcessorT] = OrderedDict()
        self._lock = RLock()

    @property
    def max_entries(self) -> int:
        """Return the cache capacity limit.

        Args:
            None.

        Returns:
            cache capacity limit.

        Raises:
            None.
        """

        return self._max_entries

    def get(self, key: ProcessorCacheKey) -> Optional[ProcessorT]:
        """Read the cache and refresh LRU order.

        Args:
            key: cache key.

        Returns:
            the Processor instance on a hit; `None` on a miss.

        Raises:
            RuntimeError: raised on internal storage errors.
        """

        with self._lock:
            value = self._store.get(key)
            if value is None:
                return None
            # note: a hit must be promoted in priority to avoid being wrongly evicted.
            self._store.move_to_end(key, last=True)
            return value

    def peek(self, key: ProcessorCacheKey) -> Optional[ProcessorT]:
        """Read the cache without changing LRU order.

        use this method for diagnostics, statistics, and read-only inspections that should not "count as an access";
        unlike ``get``, ``peek`` does not move a hit entry to the LRU tail, so it does not pollute
        real usage profile of the cache.

        Args:
            key: cache key.

        Returns:
            the Processor instance on a hit; ``None`` on a miss.

        Raises:
            RuntimeError: raised on internal storage errors.
        """

        with self._lock:
            return self._store.get(key)

    def put(self, key: ProcessorCacheKey, value: ProcessorT) -> None:
        """Write the cache with LRU eviction.

        Args:
            key: cache key.
            value: Processor instance.

        Returns:
            None.

        Raises:
            RuntimeError: raised on internal storage errors.
        """

        with self._lock:
            if key in self._store:
                self._store[key] = value
                self._store.move_to_end(key, last=True)
                return
            self._store[key] = value
            # note: once over capacity, keep evicting the oldest entry so capacity stays strictly bounded.
            while len(self._store) > self._max_entries:
                self._store.popitem(last=False)

    def evict(self, key: ProcessorCacheKey) -> bool:
        """Remove a specific cache key.

        Args:
            key: cache key.

        Returns:
            `True` when the key existed and was removed, otherwise `False`.

        Raises:
            RuntimeError: raised on internal storage errors.
        """

        with self._lock:
            if key not in self._store:
                return False
            self._store.pop(key, None)
            return True

    def clear(self) -> None:
        """Clear the cache.

        Args:
            None.

        Returns:
            None.

        Raises:
            RuntimeError: raised on internal storage errors.
        """

        with self._lock:
            self._store.clear()

    def size(self) -> int:
        """Return the current cache entry count.

        Args:
            None.

        Returns:
            current cache entry count.

        Raises:
            RuntimeError: raised on internal storage errors.
        """

        with self._lock:
            return len(self._store)

    def keys_snapshot(self) -> tuple[ProcessorCacheKey, ...]:
        """Return a read-only snapshot of current cache keys.

        the snapshot lets upper layers do read-only diagnostics like "enumerate cached entries"; this method does not change LRU order,
        nor does it expose internal storage references; callers get an immutable tuple.

        Args:
            None.

        Returns:
            ``ProcessorCacheKey`` tuple in current LRU order (least to most recently used).

        Raises:
            RuntimeError: raised on internal storage errors.
        """

        with self._lock:
            return tuple(self._store.keys())
