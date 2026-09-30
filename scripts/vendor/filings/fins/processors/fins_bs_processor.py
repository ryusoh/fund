"""fins domain BS processor.

This processor reuses the generic parsing capability of the engine ``BSProcessor``
and adds at the domain layer:
- table financial-semantics relabeling (via ``relabel_tables``)
- SEC/EDGAR HTML preprocessing and layout-table detection rules
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from scripts.vendor.filings.engine.processors.bs_processor import BSProcessor
from scripts.vendor.filings.engine.processors.source import Source

from .financial_enhancer import FinsProcessorMixin, relabel_tables
from .sec_html_rules import is_sec_layout_table, strip_edgar_sgml_envelope


class FinsBSProcessor(FinsProcessorMixin, BSProcessor):
    """fins domain BS processor.

    Inheritance chain: ``FinsBSProcessor → BSProcessor``

    Adds on top of the engine's generic parsing:
    - table financial-semantics relabeling (``relabel_tables``)
    - SEC-specific layout-table detection:

      * section-heading horizontal-rule tables (e.g. ``Item 7. MD&A ----``)
      * SEC cover-page metadata tables (legal declarations / checkboxes, <=5 rows)
    """

    PARSER_VERSION = "fins_bs_processor_v1.0.0"

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
            ValueError: raised when the source file does not exist or an argument is invalid.
            RuntimeError: raised when parsing fails.
        """

        super().__init__(source=source, form_type=form_type, media_type=media_type)
        relabel_tables(self._tables)

    def _load_html_content(self, source_path: Path) -> str:
        """Read and preprocess HTML file content.

        the Fins path adds EDGAR SGML envelope stripping on top of generic reading, so that exhibit
        HTML has its outer metadata noise removed before entering BeautifulSoup.

        Args:
            source_path: HTML file path.

        Returns:
            preprocessed HTML content string.

        Raises:
            OSError: raised when the read fails.
        """

        raw = super()._load_html_content(source_path)
        return strip_edgar_sgml_envelope(raw)

    @staticmethod
    def _extra_layout_table_check(row_count: int, col_count: int, text: str) -> bool:
        """SEC-specific layout-table detection.

        the single source of truth for the rules lives in ``sec_html_rules``.

        Args:
            row_count: table row count.
            col_count: table column count.
            text: normalized plain text of the table.

        Returns:
            whether it is a layout table.
        """
        del col_count
        return is_sec_layout_table(row_count, text)
