"""Smoke test for the vendored SEC filings toolkit (scripts/vendor/filings).

Offline only: asserts the package imports and the SEC processor registry
builds. No network, no external workspace dependency.
"""

from scripts.vendor.filings.fins.processors.registry import build_fins_processor_registry
from scripts.vendor.filings.fins.tools.service import FinsToolService


def test_vendored_filings_package_imports() -> None:
    assert FinsToolService is not None


def test_vendored_processor_registry_builds() -> None:
    registry = build_fins_processor_registry()
    assert registry is not None
