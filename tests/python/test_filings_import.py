"""Smoke test for the SEC filings toolkit (scripts/filings; Apache-2.0, originally vendored).

Offline only: asserts the package imports and the SEC processor registry
builds. No network, no external workspace dependency.
"""

import pytest

import scripts.filings.fins as fins
from scripts.filings.fins.processors.registry import build_fins_processor_registry
from scripts.filings.fins.tools.service import FinsToolService


def test_filings_package_imports() -> None:
    assert FinsToolService is not None


def test_package_level_exports_lazy_load() -> None:
    assert fins.FinsToolLimits is not None
    assert fins.FinsToolService is FinsToolService
    assert fins.register_fins_read_tools is not None
    with pytest.raises(AttributeError, match="has no attribute"):
        _ = fins.unknown_export


def test_filings_processor_registry_builds() -> None:
    registry = build_fins_processor_registry()
    assert registry is not None
