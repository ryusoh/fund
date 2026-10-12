"""Smoke test for the SEC filings toolkit (scripts/filings; Apache-2.0, originally vendored).

Offline only: asserts the package imports and the SEC processor registry
builds. No network, no external workspace dependency.
"""

from scripts.filings.fins.processors.registry import build_fins_processor_registry
from scripts.filings.fins.tools.service import FinsToolService


def test_filings_package_imports() -> None:
    assert FinsToolService is not None


def test_filings_processor_registry_builds() -> None:
    registry = build_fins_processor_registry()
    assert registry is not None
