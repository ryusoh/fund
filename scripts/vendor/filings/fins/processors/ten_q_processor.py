"""Specialized processor for 10-Q forms.

This module implements the 10-Q-specific splitting strategy:
- Based on the statutory structure of SEC Form 10-Q (Part I Items 1-4, Part II Items 1-6+1A);
- Uses the statutory SEC Part headings to anchor content-area boundaries, avoiding
  misjudgment caused by an overly wide TOC buffer zone;
- Two-phase ordered selection: Phase 1 selects Items 1-4 in the Part I region,
  Phase 2 selects Items 1-6+1A in the Part II region;
- Appends a ``SIGNATURE`` section at the tail.
"""

from __future__ import annotations

from typing import Optional

from scripts.vendor.filings.engine.processors.source import Source

from .sec_report_form_common import _BaseSecReportFormProcessor
from .ten_q_form_common import (
    _build_ten_q_markers,
    expand_ten_q_virtual_sections_content,
)


class TenQFormProcessor(_BaseSecReportFormProcessor):
    """10-Q form specialized processor.

    10-Q processor based on the edgartools/SecProcessor technical route.
    Serves as a fallback when BsTenQFormProcessor (the BS route) is unavailable.
    """

    PARSER_VERSION = "ten_q_section_processor_v2.0.0"
    _SUPPORTED_FORMS = frozenset({"10-Q"})

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
        # run the 10-Q-specific body repair once more after parent-class init, ensuring what is finally exposed
        # FinsToolService virtual sections already apply the latest boundary-convergence logic.
        self._postprocess_virtual_sections(self._collect_document_text())

    def _build_markers(self, full_text: str) -> list[tuple[int, Optional[str]]]:
        """Build 10-Q-specific boundaries.

        Args:
            full_text: full document text.

        Returns:
            `(start_index, title)` list.

        Raises:
            RuntimeError: raised when the build fails.
        """

        return _build_ten_q_markers(full_text)

    def _postprocess_virtual_sections(self, full_text: str) -> None:
        """Apply 10-Q-specific body repair to virtual sections.

        Args:
            full_text: full text to split.

        Returns:
            None.

        Raises:
            RuntimeError: raised when the repair fails.
        """

        expand_ten_q_virtual_sections_content(
            full_text=full_text,
            virtual_sections=self._virtual_sections,
        )


__all__ = ["TenQFormProcessor"]
