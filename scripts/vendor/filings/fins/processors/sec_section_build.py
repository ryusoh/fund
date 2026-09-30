"""SEC document section splitting and locating."""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Optional

import pandas as pd

from scripts.vendor.filings.engine.processors.text_utils import (
    PREVIEW_MAX_CHARS as _PREVIEW_MAX_CHARS,
)
from scripts.vendor.filings.engine.processors.text_utils import (
    format_section_ref as _format_section_ref,
)
from scripts.vendor.filings.engine.processors.text_utils import (
    normalize_optional_string as _normalize_optional_string_base,
)
from scripts.vendor.filings.engine.processors.text_utils import (
    normalize_whitespace as _normalize_whitespace,
)
from scripts.vendor.filings.log import Log

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_SECTION_MARKER_WORD_COUNTS = (28, 24, 20, 16, 12)
_SECTION_MARKER_MIN_CHARS = 80
_CONTEXT_TAIL_MARKER_WORD_COUNTS = (24, 20, 16, 12, 8)
_CONTEXT_TAIL_MARKER_MIN_CHARS = 48
_TABLE_OF_CONTENTS_TOKEN = "table of contents"
_TOC_CUTOFF_BUFFER_CHARS = 1500
_SECTION_ANCHOR_SEQUENCE_PATTERN = re.compile(r"_(\d+)$")
_TABLE_FINGERPRINT_MAX_CHARS = 240


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass
class _SectionBlock:
    """Internal section structure."""

    ref: str
    title: Optional[str]
    level: int
    parent_ref: Optional[str]
    preview: str
    text: str
    table_refs: list[str]
    table_fingerprints: set[str]
    contains_full_text: bool


# ---------------------------------------------------------------------------
# Main section-building functions
# ---------------------------------------------------------------------------


def _build_sections(
    document: Any,
    *,
    fast_mode: bool = False,
    single_full_text: bool = False,
    full_text_override: Optional[str] = None,
) -> list[_SectionBlock]:
    """Build the section list from a document object.

    Args:
        document: edgartools document object.
        fast_mode: whether fast section building is enabled.
        single_full_text: whether fast mode merges the full text into a single section.
        full_text_override: optional preloaded full text (avoids repeated `document.text()`).

    Returns:
        section block list.

    Raises:
        RuntimeError: raised when the extraction fails.
    """

    if fast_mode and single_full_text:
        result = _build_single_full_text_section(document, full_text_override=full_text_override)
        # when document.text() fails or returns empty, the single full-text section has no content;
        # degrade to the standard per-section path (per-section text may still work).
        if result and result[0].text:
            return result
        Log.debug(
            "single_full_text returned empty text; degrading to the standard path",
            module="FINS.SEC_PROCESSOR",
        )

    section_items = _iter_sections(document)
    if not section_items:
        return _build_single_full_text_section(document, full_text_override=full_text_override)
    if fast_mode:
        return _build_sections_fast(
            document=document,
            section_items=section_items,
            single_full_text=single_full_text,
            full_text_override=full_text_override,
        )

    document_text = _normalize_searchable_text(_safe_document_text(document))
    section_entries: list[dict[str, Any]] = []
    for original_index, (section_key, section_obj) in enumerate(section_items, start=1):
        section_text = _normalize_whitespace(_safe_section_text(section_obj))
        title = _build_section_title(section_key=section_key, section_obj=section_obj)
        table_fingerprints = _extract_section_table_fingerprints(section_obj)
        marker_occurrences, anchor_occurrences = _collect_section_appearance_candidates(
            document_text=document_text,
            section_key=section_key,
            section_obj=section_obj,
            section_text=section_text,
        )
        section_entries.append(
            {
                "original_index": original_index,
                "section_key": section_key,
                "section_obj": section_obj,
                "title": title,
                "section_text": section_text,
                "table_fingerprints": table_fingerprints,
                "marker_occurrences": marker_occurrences,
                "anchor_occurrences": anchor_occurrences,
                "appearance_index": None,
                "anchor_sequence": _resolve_section_anchor_sequence(
                    document=document, section_key=section_key
                ),
            }
        )

    body_anchor_index = _resolve_document_body_anchor_index(section_entries)
    toc_cutoff_index = _resolve_toc_cutoff_index(document_text)
    for entry in section_entries:
        entry["appearance_index"] = _locate_section_appearance(
            marker_occurrences=entry["marker_occurrences"],
            anchor_occurrences=entry["anchor_occurrences"],
            body_anchor_index=body_anchor_index,
            toc_cutoff_index=toc_cutoff_index,
            is_primary_body_anchor=_is_primary_body_anchor_section(
                section_key=str(entry["section_key"]),
                section_obj=entry["section_obj"],
            ),
        )

    # Complex-logic note: fixes the section out-of-order bug by sorting only by
    # "document appearance order + original ordinal", with no title/semantic
    # reordering, keeping the output consistent with the reading path.
    # None values sort last: first push None behind with a bool flag, then use
    # float("inf") as the numeric placeholder.
    section_entries.sort(
        key=lambda item: (
            item["anchor_sequence"] is None,
            item["anchor_sequence"] if item["anchor_sequence"] is not None else float("inf"),
            item["appearance_index"] is None,
            item["appearance_index"] if item["appearance_index"] is not None else float("inf"),
            item["original_index"],
        )
    )

    sections: list[_SectionBlock] = []
    for normalized_index, entry in enumerate(section_entries, start=1):
        sections.append(
            _SectionBlock(
                ref=_format_section_ref(normalized_index),
                title=entry["title"],
                level=1,
                parent_ref=None,
                preview=entry["section_text"][:_PREVIEW_MAX_CHARS],
                text=entry["section_text"],
                table_refs=[],
                table_fingerprints=entry["table_fingerprints"],
                # Step 13: with only 1 section, that section holds the entire text
                contains_full_text=len(section_entries) == 1,
            )
        )
    return sections


def _build_sections_fast(
    *,
    document: Any,
    section_items: list[tuple[str, Any]],
    single_full_text: bool = False,
    full_text_override: Optional[str] = None,
) -> list[_SectionBlock]:
    """Quickly build the section list (avoiding per-section full-text locating).

    This path targets the performance scenario of large documents; the core strategy is:
    1. Keep only the necessary information: section text, title, table fingerprints, etc.;
    2. Sort using only ``anchor_sequence`` (when present) and the original ordinal;
    3. Skip the multi-round full-text locating scans for markers/anchors.

    Args:
        document: edgartools document object.
        section_items: raw section key-value pair list.
        single_full_text: whether to merge the full text into a single section.
        full_text_override: optional preloaded full text.

    Returns:
        section block list.

    Raises:
        RuntimeError: raised when the build fails.
    """

    if single_full_text:
        return _build_single_full_text_section(document, full_text_override=full_text_override)

    section_entries: list[dict[str, Any]] = []
    for original_index, (section_key, section_obj) in enumerate(section_items, start=1):
        section_text = _normalize_whitespace(_safe_section_text(section_obj))
        title = _build_section_title(section_key=section_key, section_obj=section_obj)
        table_fingerprints = _extract_section_table_fingerprints(section_obj)
        section_entries.append(
            {
                "original_index": original_index,
                "title": title,
                "section_text": section_text,
                "table_fingerprints": table_fingerprints,
                "anchor_sequence": _resolve_section_anchor_sequence(
                    document=document,
                    section_key=section_key,
                ),
            }
        )

    # Complex-logic note: fast mode skips full-text appearance locating; anchor
    # ordinal takes priority, original ordinal is the fallback, balancing stable
    # order with performance.
    section_entries.sort(
        key=lambda item: (
            item["anchor_sequence"] is None,
            item["anchor_sequence"] if item["anchor_sequence"] is not None else float("inf"),
            item["original_index"],
        )
    )

    sections: list[_SectionBlock] = []
    for normalized_index, entry in enumerate(section_entries, start=1):
        sections.append(
            _SectionBlock(
                ref=_format_section_ref(normalized_index),
                title=entry["title"],
                level=1,
                parent_ref=None,
                preview=entry["section_text"][:_PREVIEW_MAX_CHARS],
                text=entry["section_text"],
                table_refs=[],
                table_fingerprints=entry["table_fingerprints"],
                contains_full_text=len(section_entries) == 1,
            )
        )
    return sections


def _build_single_full_text_section(
    document: Any,
    *,
    full_text_override: Optional[str] = None,
) -> list[_SectionBlock]:
    """Build the "single full-text section" list.

    Args:
        document: edgartools document object.
        full_text_override: optional preloaded full text.

    Returns:
        list containing a single section that carries the full text.

    Raises:
        RuntimeError: raised when the build fails.
    """

    raw_full_text = (
        full_text_override if full_text_override is not None else _safe_document_text(document)
    )
    # Performance-critical: the single-full-text-section mode keeps the raw text,
    # avoiding full whitespace normalization over an oversized 20-F full text
    # (that step can take tens of seconds on large documents).
    full_text = str(raw_full_text or "").strip()
    return [
        _SectionBlock(
            ref=_format_section_ref(1),
            title=None,
            level=1,
            parent_ref=None,
            preview=full_text[:_PREVIEW_MAX_CHARS],
            text=full_text,
            table_refs=[],
            table_fingerprints=set(),
            contains_full_text=True,
        )
    ]


def _locate_section_appearance(
    *,
    marker_occurrences: list[int],
    anchor_occurrences: list[int],
    body_anchor_index: Optional[int],
    toc_cutoff_index: Optional[int],
    is_primary_body_anchor: bool,
) -> Optional[int]:
    """Locate a section's occurrences.

    Args:
        marker_occurrences: section body marker hit positions (sorted, deduplicated).
        anchor_occurrences: section anchor hit positions (sorted, deduplicated).
        body_anchor_index: document body-start anchor position (usually from `Part I Item 1`).
        toc_cutoff_index: ToC cutoff position (`table of contents + buffer`).
        is_primary_body_anchor: whether the current section is the body-start anchor section.

    Returns:
        occurrence position index; `None` when it cannot be located.

    Raises:
        RuntimeError: raised when the locating fails.
    """

    filtered_markers = _filter_occurrences_by_body_anchor(
        occurrences=marker_occurrences,
        body_anchor_index=body_anchor_index,
        toc_cutoff_index=toc_cutoff_index,
        is_primary_body_anchor=is_primary_body_anchor,
    )
    if filtered_markers:
        return filtered_markers[0]

    filtered_anchors = _filter_occurrences_by_body_anchor(
        occurrences=anchor_occurrences,
        body_anchor_index=body_anchor_index,
        toc_cutoff_index=toc_cutoff_index,
        is_primary_body_anchor=is_primary_body_anchor,
    )
    if filtered_anchors:
        return filtered_anchors[0]
    return None


def _collect_section_appearance_candidates(
    *,
    document_text: str,
    section_key: str,
    section_obj: Any,
    section_text: str,
) -> tuple[list[int], list[int]]:
    """Collect the candidate hit positions of a section in the full text.

    Args:
        document_text: normalized document full text.
        section_key: section key name.
        section_obj: section object.
        section_text: section body.

    Returns:
        `(marker_occurrences, anchor_occurrences)`:
        - marker hit positions (by body prefix)
        - anchor hit positions (by Part/Item/heading anchor)

    Raises:
        RuntimeError: raised when the collection fails.
    """

    if not document_text:
        return [], []

    marker_occurrences: list[int] = []
    for marker in _build_section_text_markers(section_text):
        marker_occurrences.extend(
            _find_text_occurrences(document_text=document_text, phrase=marker)
        )
    marker_occurrences = sorted(set(marker_occurrences))

    anchor_occurrences: list[int] = []
    for anchor in _build_section_anchor_candidates(
        section_key=section_key, section_obj=section_obj
    ):
        anchor_occurrences.extend(
            _find_anchor_occurrences(document_text=document_text, anchor=anchor)
        )
    anchor_occurrences = sorted(set(anchor_occurrences))
    return marker_occurrences, anchor_occurrences


def _resolve_document_body_anchor_index(section_entries: list[dict[str, Any]]) -> Optional[int]:
    """Resolve the document body-start anchor position.

    Args:
        section_entries: section entry list collected during the `_build_sections` phase.

    Returns:
        body anchor position; `None` when unparseable.

    Raises:
        RuntimeError: raised when the parsing fails.
    """

    body_anchor_candidates: list[int] = []
    for entry in section_entries:
        if not _is_primary_body_anchor_section(
            section_key=str(entry.get("section_key", "")),
            section_obj=entry.get("section_obj"),
        ):
            continue
        marker_occurrences = entry.get("marker_occurrences")
        if isinstance(marker_occurrences, list) and marker_occurrences:
            body_anchor_candidates.append(int(marker_occurrences[0]))
            continue
        anchor_occurrences = entry.get("anchor_occurrences")
        if isinstance(anchor_occurrences, list) and anchor_occurrences:
            body_anchor_candidates.append(int(anchor_occurrences[0]))
    if not body_anchor_candidates:
        return None
    return min(body_anchor_candidates)


def _resolve_section_anchor_sequence(*, document: Any, section_key: str) -> Optional[int]:
    """Parse the section anchor ordinal from `get_sec_section_info`.

    Args:
        document: edgartools document object.
        section_key: section key name.

    Returns:
        anchor ordinal (integer); `None` when unparseable.

    Raises:
        RuntimeError: raised when the parsing fails.
    """

    info_method = getattr(document, "get_sec_section_info", None)
    if not callable(info_method):
        return None
    try:
        info = info_method(section_key)
    except Exception:
        return None
    if not isinstance(info, dict):
        return None
    anchor_id = _normalize_optional_string(info.get("anchor_id"))
    if not anchor_id:
        return None
    match = _SECTION_ANCHOR_SEQUENCE_PATTERN.search(anchor_id)
    if match is None:
        return None
    try:
        return int(match.group(1))
    except ValueError:
        return None


def _resolve_toc_cutoff_index(document_text: str) -> Optional[int]:
    """Resolve the ToC cutoff position.

    Args:
        document_text: normalized document full text.

    Returns:
        ToC cutoff position (last `table of contents` hit + buffer); `None` on a miss.

    Raises:
        RuntimeError: raised when the parsing fails.
    """

    if not document_text:
        return None
    last_index = document_text.rfind(_TABLE_OF_CONTENTS_TOKEN)
    if last_index < 0:
        return None
    return last_index + _TOC_CUTOFF_BUFFER_CHARS


def _is_primary_body_anchor_section(*, section_key: str, section_obj: Any) -> bool:
    """Judge whether a section can serve as the body-start anchor (`Part I Item 1`).

    Args:
        section_key: section key name.
        section_obj: section object.

    Returns:
        `True` when a body-start anchor section is hit.

    Raises:
        RuntimeError: raised when the judgment fails.
    """

    normalized_key = str(section_key or "").strip().lower()
    if normalized_key in {"part_i_item_1", "part1_item1", "part_i_item_1."}:
        return True
    part = _normalize_optional_string(getattr(section_obj, "part", None))
    item = _normalize_optional_string(getattr(section_obj, "item", None))
    if not part or not item:
        return False
    return part.upper() == "I" and item.upper() == "1"


def _filter_occurrences_by_body_anchor(
    *,
    occurrences: list[int],
    body_anchor_index: Optional[int],
    toc_cutoff_index: Optional[int],
    is_primary_body_anchor: bool,
) -> list[int]:
    """Filter candidate hit positions by body anchors.

    Args:
        occurrences: raw candidate positions (sorted).
        body_anchor_index: body-start anchor position.
        toc_cutoff_index: ToC cutoff position.
        is_primary_body_anchor: whether the current section is the body anchor section.

    Returns:
        filtered candidate position list.

    Raises:
        RuntimeError: raised when the filtering fails.
    """

    if not occurrences:
        return []
    if body_anchor_index is None:
        if toc_cutoff_index is None or is_primary_body_anchor:
            return occurrences
        return [position for position in occurrences if position >= toc_cutoff_index]
    if is_primary_body_anchor:
        return occurrences
    lower_bound = (
        max(body_anchor_index, toc_cutoff_index)
        if toc_cutoff_index is not None
        else body_anchor_index
    )
    return [position for position in occurrences if position >= lower_bound]


def _build_section_text_markers(section_text: str) -> list[str]:
    """Build the section-body locating marker list.

    Args:
        section_text: section body text.

    Returns:
        marker list (longest-first priority).

    Raises:
        RuntimeError: raised when the build fails.
    """

    normalized_text = _normalize_searchable_text(section_text)
    if not normalized_text:
        return []
    words = normalized_text.split()
    if not words:
        return []

    markers: list[str] = []
    seen: set[str] = set()
    for word_count in _SECTION_MARKER_WORD_COUNTS:
        if len(words) < word_count:
            continue
        marker = " ".join(words[:word_count]).strip()
        if len(marker) < _SECTION_MARKER_MIN_CHARS:
            continue
        if marker in seen:
            continue
        seen.add(marker)
        markers.append(marker)
    if markers:
        return markers

    fallback_marker = " ".join(words[: min(10, len(words))]).strip()
    if len(fallback_marker) >= 40:
        return [fallback_marker]
    return []


def _build_section_anchor_candidates(*, section_key: str, section_obj: Any) -> list[str]:
    """Build the section anchor candidate words.

    Args:
        section_key: section key name.
        section_obj: section object.

    Returns:
        anchor candidate list.

    Raises:
        RuntimeError: raised when the build fails.
    """

    candidates: list[str] = []
    part = _normalize_optional_string(getattr(section_obj, "part", None))
    item = _normalize_optional_string(getattr(section_obj, "item", None))
    if part and item:
        candidates.append(f"part {part} item {item}")
    if item:
        candidates.append(f"item {item}")

    key_anchor = _normalize_optional_string(section_key.replace("_", " "))
    if key_anchor:
        candidates.append(key_anchor)

    title = _normalize_optional_string(getattr(section_obj, "title", None))
    if title:
        candidates.append(title)

    normalized_candidates: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        normalized = _normalize_searchable_text(candidate)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        normalized_candidates.append(normalized)
    return normalized_candidates


def _find_text_occurrences(*, document_text: str, phrase: str, max_matches: int = 8) -> list[int]:
    """Locate a phrase's occurrences in the document.

    Args:
        document_text: normalized full text.
        phrase: normalized phrase text.
        max_matches: maximum hit count.

    Returns:
        ascending hit-position list.

    Raises:
        RuntimeError: raised when the locating fails.
    """

    if not phrase or max_matches <= 0:
        return []
    matches: list[int] = []
    start = 0
    while len(matches) < max_matches:
        index = document_text.find(phrase, start)
        if index < 0:
            break
        matches.append(index)
        start = index + max(1, len(phrase))
    return matches


def _find_anchor_occurrences(
    *, document_text: str, anchor: str, max_matches: int = 12
) -> list[int]:
    """Locate anchor occurrences in the document.

    Args:
        document_text: normalized full text.
        anchor: normalized anchor text.
        max_matches: maximum hit count.

    Returns:
        ascending hit-position list.

    Raises:
        RuntimeError: raised when the locating fails.
    """

    if not anchor or max_matches <= 0:
        return []
    pattern = _compile_anchor_occurrence_pattern(anchor)
    matches: list[int] = []
    for match in pattern.finditer(document_text):
        matches.append(match.start())
        if len(matches) >= max_matches:
            break
    return matches


@lru_cache(maxsize=2048)
def _compile_anchor_occurrence_pattern(anchor: str) -> re.Pattern[str]:
    """Compile and cache the anchor-matching regex.

    Args:
        anchor: already-normalized anchor text.

    Returns:
        reusable regex object.

    Raises:
        re.error: raised when regex compilation fails.
    """

    return re.compile(rf"\b{re.escape(anchor)}\b")


def _normalize_searchable_text(text: str) -> str:
    """Normalize text used for locating searches.

    Args:
        text: raw text.

    Returns:
        normalized lowercase text.

    Raises:
        RuntimeError: raised when the normalization fails.
    """

    normalized = _normalize_whitespace(text)
    normalized = normalized.replace("'", "'").replace("`", "'")
    normalized = normalized.replace("\u201c", '"').replace("\u201d", '"')
    return normalized.lower()


# ---------------------------------------------------------------------------
# Helper functions used above
# ---------------------------------------------------------------------------


def _iter_sections(document: Any) -> list[tuple[str, Any]]:
    """Safely iterate document sections.

    Args:
        document: edgartools document object.

    Returns:
        `(section_key, section_obj)` list.

    Raises:
        RuntimeError: raised when the access fails.
    """

    sections_obj = getattr(document, "sections", None)
    if not isinstance(sections_obj, dict):
        return []
    return [(str(key), value) for key, value in sections_obj.items()]


def _safe_document_text(document: Any) -> str:
    """Safely read document full text.

    Args:
        document: edgartools document object.

    Returns:
        text content.

    Raises:
        RuntimeError: raised when the read fails.
    """

    try:
        text = document.text()
    except Exception:
        return ""
    return str(text or "")


def _safe_section_text(section_obj: Any) -> str:
    """Safely read section text.

    Args:
        section_obj: section object.

    Returns:
        section text.

    Raises:
        RuntimeError: raised when the read fails.
    """

    try:
        text = section_obj.text()
    except Exception:
        return ""
    return str(text or "")


def _safe_table_text(table_obj: Any) -> str:
    """Safely read table text.

    Args:
        table_obj: table object.

    Returns:
        table text.

    Raises:
        RuntimeError: raised when the read fails.
    """

    try:
        text = table_obj.text()
    except Exception:
        return ""
    return str(text or "")


def _normalize_table_objects(table_objects: object) -> list[object]:
    """Converge a dynamic table result into a safely iterable object list.

    Args:
        table_objects: dynamic table return value.

    Returns:
        safely iterable table object list; empty list for invalid input.

    Raises:
        None.
    """

    if isinstance(table_objects, Iterable) and not isinstance(table_objects, (str, bytes)):
        return list(table_objects)
    return []


def _build_section_title(section_key: str, section_obj: Any) -> Optional[str]:
    """Build a human-readable section title.

    Args:
        section_key: section dict key.
        section_obj: section object.

    Returns:
        readable title; `None` when no usable information exists.

    Raises:
        RuntimeError: raised when the build fails.
    """

    title = _normalize_optional_string(getattr(section_obj, "title", None))
    name = _normalize_optional_string(getattr(section_obj, "name", None))
    part = _normalize_optional_string(getattr(section_obj, "part", None))
    item = _normalize_optional_string(getattr(section_obj, "item", None))

    if part and item:
        return f"Part {part} Item {item}"
    if title:
        return title
    if name:
        return name
    normalized_key = _normalize_optional_string(section_key)
    return normalized_key


def _extract_section_table_fingerprints(section_obj: Any) -> set[str]:
    """Extract the text-fingerprint set of the tables in a section.

    Args:
        section_obj: section object.

    Returns:
        fingerprint set.

    Raises:
        RuntimeError: raised when the extraction fails.
    """

    table_fingerprints: set[str] = set()
    table_method = getattr(section_obj, "tables", None)
    if not callable(table_method):
        return table_fingerprints
    try:
        section_tables = table_method()
    except Exception:
        return table_fingerprints
    for table_obj in _normalize_table_objects(section_tables):
        fingerprint = _table_fingerprint(_normalize_whitespace(_safe_table_text(table_obj)))
        if fingerprint:
            table_fingerprints.add(fingerprint)
    return table_fingerprints


def _table_fingerprint(text: str) -> str:
    """Compute the table text fingerprint.

    Args:
        text: table text.

    Returns:
        normalized fingerprint string.

    Raises:
        RuntimeError: raised when the computation fails.
    """

    normalized = _normalize_whitespace(text)
    if not normalized:
        return ""
    return normalized[:_TABLE_FINGERPRINT_MAX_CHARS].lower()


def _normalize_optional_string(value: Any) -> Optional[str]:
    """Convert any value to an optional string, additionally handling pandas NaN/NaT.

    For meaningless values such as ``None``, empty string, ``float('nan')``, and
    ``pd.NaT``, uniformly return ``None``.

    Args:
        value: any input value.

    Returns:
        normalized string; ``None`` for empty values.
    """
    if value is None:
        return None
    if isinstance(value, float) and pd.isna(value):
        return None
    return _normalize_optional_string_base(value)
