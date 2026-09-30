"""Processor registry implementation."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Optional

from .base import DocumentProcessor
from .source import Source


@dataclass(frozen=True)
class ProcessorRegistration:
    """Processor registration record."""

    name: str
    processor_cls: type[DocumentProcessor]
    priority: int


class ProcessorRegistry:
    """Processor registry.

    Selects a processor by `supports`, avoiding hard-coded if/else chains in the Pipeline layer.
    """

    def __init__(self) -> None:
        """Initialize the registry.

        Args:
            None.

        Returns:
            None.

        Raises:
            RuntimeError: raised when initialization fails.
        """

        self._items: list[ProcessorRegistration] = []

    def register(
        self,
        processor_cls: type[DocumentProcessor],
        *,
        name: Optional[str] = None,
        priority: int = 0,
        overwrite: bool = False,
    ) -> None:
        """Register a processor.

        Args:
            processor_cls: processor class.
            name: registration name (defaults to the class name).
            priority: priority; larger wins.
            overwrite: whether to overwrite an existing registration.

        Returns:
            None.

        Raises:
            ValueError: raised when the registration name conflicts and overwrite is not allowed.
        """

        reg_name = name or processor_cls.__name__
        existing = self._find(reg_name)
        if existing and not overwrite:
            raise ValueError(f"processor already registered: {reg_name}")

        if existing:
            self._items = [item for item in self._items if item.name != reg_name]

        self._items.append(
            ProcessorRegistration(
                name=reg_name,
                processor_cls=processor_cls,
                priority=priority,
            )
        )
        self._items.sort(key=lambda item: item.priority, reverse=True)

    def unregister(self, name: str) -> None:
        """Remove a processor registration.

        Args:
            name: registration name.

        Returns:
            None.

        Raises:
            KeyError: raised when the registration name does not exist.
        """

        if not self._find(name):
            raise KeyError(f"processor not registered: {name}")
        self._items = [item for item in self._items if item.name != name]

    def list_processors(self) -> list[dict[str, object]]:
        """List registered processors.

        Args:
            None.

        Returns:
            registered processor list.

        Raises:
            RuntimeError: raised when the read fails.
        """

        return [
            {
                "name": item.name,
                "class": item.processor_cls.__name__,
                "priority": item.priority,
            }
            for item in self._items
        ]

    def resolve(
        self,
        source: Source,
        *,
        form_type: Optional[str] = None,
        media_type: Optional[str] = None,
    ) -> Optional[type[DocumentProcessor]]:
        """Select a suitable processor class.

        Args:
            source: document source abstraction.
            form_type: optional form type.
            media_type: optional media type.

        Returns:
            processor class or None.

        Raises:
            RuntimeError: raised when selection fails.
        """

        candidates = self.resolve_candidates(
            source,
            form_type=form_type,
            media_type=media_type,
        )
        if not candidates:
            return None
        return candidates[0]

    def resolve_candidates(
        self,
        source: Source,
        *,
        form_type: Optional[str] = None,
        media_type: Optional[str] = None,
    ) -> list[type[DocumentProcessor]]:
        """Return all usable processor classes by priority.

        Args:
            source: document source abstraction.
            form_type: optional form type.
            media_type: optional media type.

        Returns:
            processor class list sorted by priority (descending).

        Raises:
            RuntimeError: raised when selection fails.
        """

        candidates: list[type[DocumentProcessor]] = []
        # note: `resolve_candidates` iterates all registrations and evaluates supports for each.
        for item in self._items:
            try:
                if item.processor_cls.supports(
                    source,
                    form_type=form_type,
                    media_type=media_type,
                ):
                    candidates.append(item.processor_cls)
            except OSError:
                continue
        return candidates

    def create(
        self,
        source: Source,
        *,
        form_type: Optional[str] = None,
        media_type: Optional[str] = None,
    ) -> DocumentProcessor:
        """Create a processor instance.

        Args:
            source: document source abstraction.
            form_type: optional form type.
            media_type: optional media type.

        Returns:
            processor instance.

        Raises:
            ValueError: raised when no processor is available.
        """

        processor_cls = self.resolve(
            source,
            form_type=form_type,
            media_type=media_type,
        )
        if not processor_cls:
            raise ValueError(f"no usable processor found: {source}")
        return processor_cls(
            source=source,
            form_type=form_type,
            media_type=media_type,
        )

    def create_with_fallback(
        self,
        source: Source,
        *,
        form_type: Optional[str] = None,
        media_type: Optional[str] = None,
        on_fallback: Optional[
            Callable[[type[DocumentProcessor], Exception, int, int], None]
        ] = None,
    ) -> DocumentProcessor:
        """Create a processor instance, falling back to the next candidate when instantiation fails.

        Args:
            source: document source abstraction.
            form_type: optional form type.
            media_type: optional media type.
            on_fallback: callback invoked when a candidate fails to build and a next candidate exists.

        Returns:
            successfully created processor instance.

        Raises:
            ValueError: raised when no processor is available.
            RuntimeError: raised when all candidate processors fail to be created.
        """

        candidates = self.resolve_candidates(
            source,
            form_type=form_type,
            media_type=media_type,
        )
        if not candidates:
            raise ValueError(f"no usable processor found: {source}")

        errors: list[str] = []
        total_candidates = len(candidates)
        # note: candidates are priority-ordered; on creation failure the next candidate is tried, implementing a uniform fallback policy.
        for index, processor_cls in enumerate(candidates):
            try:
                return processor_cls(
                    source=source,
                    form_type=form_type,
                    media_type=media_type,
                )
            except Exception as exc:
                errors.append(f"{processor_cls.__name__}: {exc}")
                if on_fallback is not None and index + 1 < total_candidates:
                    on_fallback(processor_cls, exc, index + 1, total_candidates)
                continue

        error_text = "; ".join(errors)
        raise RuntimeError(f"processor creation failed with no usable fallback: source={source} errors={error_text}")

    def _find(self, name: str) -> Optional[ProcessorRegistration]:
        """Look up a registration record.

        Args:
            name: registration name.

        Returns:
            registration record or None.

        Raises:
            RuntimeError: raised when the lookup fails.
        """

        for item in self._items:
            if item.name == name:
                return item
        return None
