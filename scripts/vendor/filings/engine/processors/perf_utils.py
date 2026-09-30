"""Processor performance instrumentation utilities.

This module provides optional performance instrumentation that reports the
duration of each processor stage without changing business behaviour.
Instrumentation is off by default and enabled via an environment variable:

- `FINS_PROCESSOR_PROFILE=1`: enable instrumentation logging;
- any other value or unset: disable instrumentation logging.
"""

from __future__ import annotations

import os
import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Iterator

from scripts.vendor.filings.contracts.env_keys import FINS_PROCESSOR_PROFILE_ENV
from scripts.vendor.filings.log import Log

MODULE = "ENGINE.PERF_UTILS"
_PROFILE_ENABLED_VALUES = {"1", "true", "yes", "on"}


def is_processor_profile_enabled() -> bool:
    """Judge whether processor performance instrumentation is enabled.

    Args:
        None.

    Returns:
        `True` when the environment variable enables it, otherwise `False`.

    Raises:
        RuntimeError: raised when the environment variable cannot be read.
    """

    raw_value = os.getenv(FINS_PROCESSOR_PROFILE_ENV, "")
    normalized = str(raw_value).strip().lower()
    return normalized in _PROFILE_ENABLED_VALUES


@dataclass
class ProcessorStageProfiler:
    """Processor stage-duration profiler.

    Attributes:
        component: component name (usually the processor class name).
        enabled: whether instrumentation is enabled.
        records: stage durations in milliseconds.
    """

    component: str
    enabled: bool = False
    records: dict[str, float] = field(default_factory=dict)

    @contextmanager
    def stage(self, stage_name: str) -> Iterator[None]:
        """Measure the duration of a single stage.

        Args:
            stage_name: stage name.

        Returns:
            context-manager iterator.

        Raises:
            RuntimeError: raised when duration computation fails.
        """

        if not self.enabled:
            yield
            return
        started = time.perf_counter()
        try:
            yield
        finally:
            elapsed_ms = (time.perf_counter() - started) * 1000.0
            self.records[stage_name] = self.records.get(stage_name, 0.0) + elapsed_ms

    def log_summary(self, extra: str = "") -> None:
        """Emit the stage-duration summary log.

        Args:
            extra: additional explanation text.

        Returns:
            None.

        Raises:
            RuntimeError: raised when log serialization fails.
        """

        if not self.enabled or not self.records:
            return
        ordered = sorted(self.records.items(), key=lambda item: item[0])
        summary = ", ".join(f"{name}={value:.2f}ms" for name, value in ordered)
        suffix = f" | {extra}" if extra else ""
        Log.info(f"processor_profile[{self.component}] {summary}{suffix}", module=MODULE)
