"""BeautifulSoup-based specialized processor for 10-Q forms.

This module implements the BeautifulSoup-based (BSProcessor) 10-Q splitting
strategy, parallel to ``ten_q_processor.py`` (based on edgartools/SecProcessor):
- Shares the same two-phase ordered Item-selection logic (``_build_ten_q_markers``);
- HTML parsing is driven entirely by BeautifulSoup, with no edgartools black box;
- XBRL is loaded via independent file discovery, independent of edgartools document objects.

Design intent:
- Provides the main BS-route processor for 10-Q (priority 200), with
  ``TenQFormProcessor`` demoted to fallback (priority 190);
- The BS route provides XBRL financial-statement capability independently, raising
  the score on the D_consistency dimension.
"""

from __future__ import annotations

from typing import Optional

from scripts.vendor.filings.engine.processors.source import Source

from .bs_report_form_common import _BaseBsReportFormProcessor
from .ten_q_form_common import (
    _build_ten_q_markers,
    expand_ten_q_virtual_sections_content,
)


class BsTenQFormProcessor(_BaseBsReportFormProcessor):
    """BeautifulSoup-based 10-Q form specialized processor.

    Inheritance chain:
    ``BsTenQFormProcessor -> _BaseBsReportFormProcessor
    -> _VirtualSectionProcessorMixin -> FinsBSProcessor -> BSProcessor``

    Parallel to ``TenQFormProcessor`` (based on SecProcessor),
    sharing the ``_build_ten_q_markers()`` marker strategy.
    """

    PARSER_VERSION = "bs_ten_q_processor_v1.0.0"
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
        """Build 10-Q-specific boundary markers.

        reuses ``_build_ten_q_markers()``, which only depends on plain-text regex scanning,
        independent of the underlying HTML parsing engine.

        Args:
            full_text: full document text.

        Returns:
            ``(start_index, title)`` list.

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


__all__ = ["BsTenQFormProcessor"]
