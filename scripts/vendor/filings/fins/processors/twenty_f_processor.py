"""Specialized processor for 20-F forms.

This module implements the 20-F (annual report of a foreign private issuer)
specific splitting strategy:
- Splits sections along the ``Item`` axis (statutory Items 1-19 of SEC Form 20-F);
- Labels each Item with its Part based on the statutory SEC Part->Item mapping;
- Attaches the standard SEC description to key Items, improving LLM section-locating efficiency;
- Appends a ``SIGNATURE`` section at the tail.

References for the SEC 20-F structure:
- SEC Form 20-F General Instructions
- 17 CFR Part 249 §249.220f

Core differences from the 10-K:
- Item numbers are globally unique (the Part prefix is informational, not required for disambiguation);
- Item 16 is [Reserved]; 16A-16J are standalone governance-disclosure sub-items;
- Most FPIs use IFRS; Item 18 is the main financial-statements section.
"""

from __future__ import annotations

from typing import Optional

from scripts.vendor.filings.engine.processors.source import Source

from .sec_report_form_common import (
    _BaseSecReportFormProcessor,
    _extract_source_text_preserving_lines,
)
from .twenty_f_form_common import (
    _build_twenty_f_markers,
    _select_preferred_twenty_f_text,
    _trim_twenty_f_source_text,
)


class TwentyFFormProcessor(_BaseSecReportFormProcessor):
    """20-F form specialized processor (edgartools path).

    Serves as a fallback when ``BsTwentyFFormProcessor`` (the BS route) is unavailable.
    """

    PARSER_VERSION = "twenty_f_section_processor_v2.1.5"
    _SUPPORTED_FORMS = frozenset({"20-F"})
    _ENABLE_FAST_SECTION_BUILD = True
    _FAST_SECTION_BUILD_SINGLE_FULL_TEXT = True

    def __init__(
        self,
        source: Source,
        *,
        form_type: Optional[str] = None,
        media_type: Optional[str] = None,
    ) -> None:
        """Initialize the processor.

        Args:
            source: document source abstraction.
            form_type: optional form type.
            media_type: optional media type.

        Returns:
            None.

        Raises:
            ValueError: raised when an argument is invalid.
            RuntimeError: raised when parsing fails.
        """

        super().__init__(source=source, form_type=form_type, media_type=media_type)

    def _build_markers(self, full_text: str) -> list[tuple[int, Optional[str]]]:
        """Build 20-F-specific boundaries.

        Args:
            full_text: full document text.

        Returns:
            `(start_index, title)` list.

        Raises:
            RuntimeError: raised when the build fails.
        """

        return _build_twenty_f_markers(full_text)

    def _collect_document_text(self) -> str:
        """Extract 20-F full text preserving row boundaries where possible.

        20-F Item headings often appear as table rows or standalone blocks. edgartools'
        ``document.text()`` flattens these boundaries on some documents, causing marker
        built unsuccessfully and fell back to misaligned section reconstruction. Here we prefer extracting directly from the source HTML
        text with line breaks; falls back to the parent implementation on failure.

        Args:
            None.

        Returns:
            full text preserving heading line-break structure where possible; falls back to the parent-class result on failure.

        Raises:
            RuntimeError: raised when the read fails.
        """

        parsed_text = super()._collect_document_text()
        extracted = _trim_twenty_f_source_text(_extract_source_text_preserving_lines(self._source))
        return _select_preferred_twenty_f_text(
            source_text=extracted,
            parsed_text=parsed_text,
        )


__all__ = ["TwentyFFormProcessor"]
