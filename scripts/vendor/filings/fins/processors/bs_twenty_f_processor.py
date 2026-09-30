"""BeautifulSoup-based specialized processor for 20-F forms.

This module implements the BSProcessor (BeautifulSoup)-based 20-F splitting
strategy, parallel to ``twenty_f_processor.py`` (based on
edgartools/SecProcessor):
- shares the same ``Part + Item + description`` marker scanning logic
  (``_build_twenty_f_markers``);
- HTML parsing is driven entirely by BeautifulSoup, with no edgartools black box;
- XBRL is loaded via independent file discovery, without depending on the
  edgartools document object.

Design intent:
- provides the BS-route primary processor for 20-F (priority 200), with
  ``TwentyFFormProcessor`` demoted to fallback (priority 190);
- the BS route independently provides XBRL financial-statement capabilities
  (``get_financial_statement`` / ``query_xbrl_facts``), improving the
  D_consistency dimension score.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from typing import Optional

from scripts.vendor.filings.engine.processors.source import Source

from .bs_report_form_common import _BaseBsReportFormProcessor
from .sec_report_form_common import _extract_source_text_preserving_lines
from .twenty_f_form_common import (
    _build_twenty_f_markers,
    _select_preferred_twenty_f_text,
    _trim_twenty_f_source_text,
)

_ITEM_TITLE_PATTERN = re.compile(r"(?i)\bitem\s+(16[a-j]|4a|1[0-9]|[1-9])\b")
_TWENTY_F_KEY_ITEMS = frozenset({"3", "5", "18"})
_MIN_TOTAL_ITEMS_FOR_BS = 3
_MAX_SAFE_SECTION_CHARS_FOR_BS = 300000
_TOC_PAGE_LINE_PATTERN = re.compile(r"(?im)^\s*[A-Za-z][^\n]{0,180}\b\d{1,3}\s*$")
_ITEM_18_REFERENCE_PHRASE_PATTERN = re.compile(
    r"(?i)\binformation\s+required\s+by\s+this\s+item\s+is\s+set\s+forth\b"
)
_ITEM_18_PAGE_RANGE_REFERENCE_PATTERN = re.compile(
    r"(?is)\b(?:included|set\s+forth|contained|appear(?:s|ing)?|presented)\b"
    r".{0,120}\bpages?\s+F-\d+\s*(?:through|to|[-\u2013\u2014])\s*F-\d+\b"
)


def _has_minimum_twenty_f_marker_quality(full_text: str) -> bool:
    """Judge whether the full-text marker quality meets BS 20-F's minimum requirement.

    This function reuses the 20-F marker construction result and does not
    depend on any particular HTML parsing path. Its purpose is to judge
    whether the BS default full-text extraction is already good enough, so as
    to avoid spreading the more aggressive ``source_text`` replacement into
    documents that are fine as-is.

    Args:
        full_text: candidate full text.

    Returns:
        ``True`` when the minimum Item quality requirement is met, otherwise ``False``.

    Raises:
        None.
    """

    titles = [title for _, title in _build_twenty_f_markers(str(full_text or ""))]
    return _has_minimum_twenty_f_item_quality(titles)


def _has_minimum_twenty_f_item_quality(section_titles: list[Optional[str]]) -> bool:
    """Judge whether a BS 20-F split result meets the minimum Item structure quality.

    Args:
        section_titles: virtual-section title list.

    Returns:
        ``True`` when the minimum quality threshold is met, otherwise ``False``.

    Raises:
        None.
    """

    recognized_items: set[str] = set()
    for title in section_titles:
        if not title:
            continue
        match = _ITEM_TITLE_PATTERN.search(str(title))
        if match is None:
            continue
        recognized_items.add(str(match.group(1)).upper())

    if len(recognized_items) < _MIN_TOTAL_ITEMS_FOR_BS:
        return False
    # The BS primary path for 20-F only proceeds when the core analysis-skeleton
    # Items 3 / 5 / 18 are all present, which marks the minimum analysis
    # threshold for further enhancement of the current marker quality.
    return _TWENTY_F_KEY_ITEMS.issubset(recognized_items)


def _has_risky_twenty_f_section_profile(sections: Sequence[object]) -> bool:
    """Judge whether a BS 20-F split has high-risk structure.

    Risk conditions:
    1. any section content exceeds the CI hard-gate threshold (>300000);
    2. Item 18 shows the "short text + title page-number line" TOC-stub
       signature.

    Args:
        sections: virtual-section object list (must carry ``title`` and ``content`` attributes).

    Returns:
        ``True`` when a risk pattern hits, otherwise ``False``.

    Raises:
        None.
    """

    for section in sections:
        title = str(getattr(section, "title", "") or "")
        content = str(getattr(section, "content", "") or "")
        normalized = " ".join(content.split())
        if len(normalized) > _MAX_SAFE_SECTION_CHARS_FOR_BS:
            return True
        if "item 18" in title.lower():
            has_reference_phrase = _ITEM_18_REFERENCE_PHRASE_PATTERN.search(normalized) is not None
            has_toc_like_line = _TOC_PAGE_LINE_PATTERN.search(content) is not None
            has_page_range_reference = (
                _ITEM_18_PAGE_RANGE_REFERENCE_PATTERN.search(normalized) is not None
            )
            # Item 18 legitimately allows "incorporation by reference of financial statement annexes" (common in
            # "The information required by this item is set forth ..."），
            # must not be misclassified as a table-of-contents stub; only structural risk signals are emitted here for later analysis.
            if len(normalized) < 120 and has_toc_like_line and not has_reference_phrase:
                return True
            # if only a short page-range reference remains (e.g. "included on pages F-1 through F-86"),
            # the current BS split has usually already lost the real financial statements; treat as a high-risk signal.
            if len(normalized) < 220 and has_page_range_reference:
                return True
    return False


class BsTwentyFFormProcessor(_BaseBsReportFormProcessor):
    """BeautifulSoup-based 20-F form specialized processor.

    Inheritance chain:
    ``BsTwentyFFormProcessor → _BaseBsReportFormProcessor
    → _VirtualSectionProcessorMixin → FinsBSProcessor → BSProcessor``

    Parallel to ``TwentyFFormProcessor`` (based on SecProcessor), sharing the
    ``_build_twenty_f_markers()`` marker strategy.
    """

    PARSER_VERSION = "bs_twenty_f_processor_v1.1.8"
    _SUPPORTED_FORMS = frozenset({"20-F"})

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

        self._cached_marker_source_text: Optional[str] = None
        self._cached_marker_source_result: list[tuple[int, Optional[str]]] = []
        super().__init__(source=source, form_type=form_type, media_type=media_type)

    def _collect_document_text(self) -> str:
        """Extract full text better suited to 20-F marker detection.

        the BS path uses ``root.get_text(separator="\\n")`` by default to preserve line breaks,
        but 20-F's common iXBRL leading noise and heading flattening still need extra repair.

        unlike the edgartools path, the BS path's default full-text extraction is already based on cleaned
        DOM, usually more stable than raw source text. So a more conservative migration strategy is used here:
        1. first use the BS default full-text extraction;
        2. when the text already meets the minimum Item quality, return it directly to avoid a global rewrite;
        3. only when the default extraction is so distorted it fails even the minimum Item quality,
           raw source text + XBRL leading trim + marker-quality selection.

        Args:
            None.

        Returns:
            full text better suited to 20-F virtual-section splitting.

        Raises:
            RuntimeError: raised when the read fails.
        """

        try:
            # 20-F table-of-contents and body headings are often assembled from multiple adjacent DOM nodes.
            # must not use ``strip=True`` here, otherwise node boundaries get flattened,
            # would easily squeeze headings like ``Item 5`` back into ToC/guide form.
            parsed_text = self._root.get_text(separator="\n").strip()
        except Exception:
            parsed_text = super()._collect_document_text()
        if self._has_minimum_twenty_f_marker_quality_with_cache(parsed_text):
            return parsed_text

        extracted = _trim_twenty_f_source_text(_extract_source_text_preserving_lines(self._source))
        return _select_preferred_twenty_f_text(
            source_text=extracted,
            parsed_text=parsed_text,
        )

    def _has_minimum_twenty_f_marker_quality_with_cache(self, full_text: str) -> bool:
        """Judge minimum full-text quality using the instance-level marker cache.

        Args:
            full_text: full text to inspect.

        Returns:
            ``True`` when the minimum Item quality requirement is met.

        Raises:
            RuntimeError: raised when marker construction fails.
        """

        cached_markers = self._get_cached_twenty_f_markers(full_text)
        return _has_minimum_twenty_f_item_quality([title for _, title in cached_markers])

    def _get_cached_twenty_f_markers(
        self,
        full_text: str,
    ) -> list[tuple[int, Optional[str]]]:
        """Read the current Processor-lifetime 20-F marker cache.

        20-F first quality-judges the same ``full_text`` at initialization, then performs the formal split.
        In documents like UBS's, which carry an extremely long cross-reference
        guide, re-running ``_build_twenty_f_markers()`` in both steps would
        pay the full Item/guide re-scan cost twice.
        an instance-level single-slot cache is used here, reusing marker results on hits.

        Args:
            full_text: full text to build markers from.

        Returns:
            copy of the ``(position, title)`` marker list.

        Raises:
            RuntimeError: raised when marker construction fails.
        """

        normalized_text = str(full_text or "")
        if normalized_text == self._cached_marker_source_text:
            return list(self._cached_marker_source_result)

        markers = list(_build_twenty_f_markers(normalized_text))
        self._cached_marker_source_text = normalized_text
        self._cached_marker_source_result = markers
        return list(markers)

    def _build_markers(self, full_text: str) -> list[tuple[int, Optional[str]]]:
        """Build 20-F-specific boundary markers.

        reuses ``_build_twenty_f_markers()``, which only depends on plain-text regex scanning,
        independent of the underlying HTML parsing engine.

        Args:
            full_text: full document text.

        Returns:
            ``(start_index, title)`` list.

        Raises:
            RuntimeError: raised when the build fails.
        """

        return self._get_cached_twenty_f_markers(full_text)


__all__ = [
    "BsTwentyFFormProcessor",
    "_has_minimum_twenty_f_marker_quality",
    "_has_minimum_twenty_f_item_quality",
    "_has_risky_twenty_f_section_profile",
]
