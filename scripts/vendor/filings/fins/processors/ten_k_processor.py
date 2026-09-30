"""Specialized processor for 10-K forms.

This module implements the first version of the 10-K-specific splitting strategy:
- Generates virtual sections along the `Part + Item` axis;
- Automatically avoids pseudo-Items in the Table of Contents region;
- Appends a `SIGNATURE` section at the tail.
"""

from __future__ import annotations

from typing import Optional

from scripts.vendor.filings.engine.processors.source import Source

from .sec_report_form_common import _BaseSecReportFormProcessor
from .ten_k_form_common import (
    _build_ten_k_markers,
    expand_ten_k_virtual_sections_content,
)


class TenKFormProcessor(_BaseSecReportFormProcessor):
    """10-K form specialized processor."""

    PARSER_VERSION = "ten_k_section_processor_v2.0.0"
    _SUPPORTED_FORMS = frozenset({"10-K"})

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
        # run the 10-K-specific body repair once more after parent-class init, ensuring what is finally exposed
        # FinsToolService virtual sections already apply the latest boundary-convergence logic.
        self._postprocess_virtual_sections(self._collect_document_text())

    def _build_markers(self, full_text: str) -> list[tuple[int, Optional[str]]]:
        """Build 10-K-specific boundaries.

        Args:
            full_text: full document text.

        Returns:
            `(start_index, title)` list.

        Raises:
            RuntimeError: raised when the build fails.
        """

        return _build_ten_k_markers(full_text)

    def _postprocess_virtual_sections(self, full_text: str) -> None:
        """Apply 10-K-specific body repair to virtual sections.

        Args:
            full_text: full text to split.

        Returns:
            None.

        Raises:
            RuntimeError: raised when the repair fails.
        """

        expand_ten_k_virtual_sections_content(
            full_text=full_text,
            virtual_sections=self._virtual_sections,
        )
        self._virtual_section_by_ref = {section.ref: section for section in self._virtual_sections}
        self._assign_tables_to_virtual_sections()


__all__ = ["TenKFormProcessor"]
