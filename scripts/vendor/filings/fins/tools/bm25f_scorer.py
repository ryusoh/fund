"""BM25F-style section retrieval scoring module.

This module provides low-intrusion multi-field lexical ranking for
``search_document``:
- builds a document-level lexical index from section summary fields.
- computes a BM25F-style score for a single search hit.
- only enhances ranking; retrieval is out of scope.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Mapping

_TOKEN_PATTERN = re.compile(r"[a-z0-9]+")

_FIELD_WEIGHTS: dict[str, float] = {
    "title": 3.0,
    "item": 2.0,
    "topic": 2.0,
    "path": 2.0,
    "preview": 1.0,
    "content": 1.0,
}

_FIELD_B: dict[str, float] = {
    "title": 0.35,
    "item": 0.2,
    "topic": 0.2,
    "path": 0.35,
    "preview": 0.75,
    "content": 0.75,
}

_K1 = 1.2


@dataclass(frozen=True)
class BM25FSectionProfile:
    """Lexical field profile of a single section.

    Args:
        section_ref: unique section identifier.
        field_tokens: token sequence per field.

    Returns:
        None.

    Raises:
        None.
    """

    section_ref: str
    field_tokens: dict[str, tuple[str, ...]]


@dataclass(frozen=True)
class BM25FSectionIndex:
    """BM25F-style section index.

    Args:
        profiles: ``section_ref -> BM25FSectionProfile`` mapping.
        document_frequency: section-level document frequency of the token.
        avg_field_lengths: average length of each field.
        avg_content_length: average length of the content field.
        document_count: total section count.

    Returns:
        None.

    Raises:
        None.
    """

    profiles: dict[str, BM25FSectionProfile]
    document_frequency: dict[str, int]
    avg_field_lengths: dict[str, float]
    avg_content_length: float
    document_count: int


def build_section_bm25f_index(sections: Sequence[Mapping[str, Any]]) -> BM25FSectionIndex:
    """Build a BM25F index from enriched section summaries.

    Args:
        sections: section summaries already carrying fields like ``title/item/topic/path/preview``.

    Returns:
        BM25FSectionIndex instance.

    Raises:
        RuntimeError: raised when construction fails.
    """

    profiles: dict[str, BM25FSectionProfile] = {}
    document_frequency: Counter[str] = Counter()
    total_field_lengths: Counter[str] = Counter()

    for section in sections:
        section_ref = str(section.get("ref") or "").strip()
        if not section_ref:
            continue
        field_texts = {
            "title": _normalize_text(section.get("title")),
            "item": _normalize_text(section.get("item")),
            "topic": _normalize_text(section.get("topic")),
            "path": _normalize_text(section.get("path")),
            "preview": _normalize_text(section.get("preview")),
        }
        field_tokens = {
            field_name: tuple(_tokenize(text)) for field_name, text in field_texts.items()
        }
        profiles[section_ref] = BM25FSectionProfile(
            section_ref=section_ref,
            field_tokens=field_tokens,
        )
        seen_terms: set[str] = set()
        for field_name, tokens in field_tokens.items():
            total_field_lengths[field_name] += len(tokens)
            seen_terms.update(tokens)
        document_frequency.update(seen_terms)

    document_count = len(profiles)
    avg_field_lengths: dict[str, float] = {}
    for field_name in ("title", "item", "topic", "path", "preview"):
        avg_field_lengths[field_name] = (
            total_field_lengths[field_name] / document_count if document_count > 0 else 0.0
        )

    return BM25FSectionIndex(
        profiles=profiles,
        document_frequency=dict(document_frequency),
        avg_field_lengths=avg_field_lengths,
        avg_content_length=avg_field_lengths.get("preview", 0.0),
        document_count=document_count,
    )


def score_search_entry_bm25f(
    *,
    entry: Mapping[str, Any],
    query: str,
    index: BM25FSectionIndex,
) -> float:
    """Compute the BM25F-style score for a single search hit.

    Args:
        entry: search hit entry.
        query: raw query term.
        index: prebuilt BM25F index.

    Returns:
        BM25F-style score; ``0.0`` when it cannot be computed.

    Raises:
        RuntimeError: raised when computation fails.
    """

    query_terms = _tokenize(query)
    if not query_terms or index.document_count <= 0:
        return 0.0

    section_ref = str(entry.get("section_ref") or "").strip()
    if not section_ref:
        return 0.0
    profile = index.profiles.get(section_ref)
    if profile is None:
        return 0.0

    content_tokens = tuple(_tokenize(_extract_entry_content_text(entry)))
    field_counters: dict[str, Counter[str]] = {
        field_name: Counter(tokens) for field_name, tokens in profile.field_tokens.items()
    }
    field_counters["content"] = Counter(content_tokens)

    avg_field_lengths = dict(index.avg_field_lengths)
    avg_field_lengths["content"] = index.avg_content_length

    score = 0.0
    for term in query_terms:
        term_df = index.document_frequency.get(term, 0)
        if term_df <= 0:
            continue
        idf = math.log(1.0 + ((index.document_count - term_df + 0.5) / (term_df + 0.5)))
        weighted_tf = 0.0
        for field_name, weight in _FIELD_WEIGHTS.items():
            counter = field_counters.get(field_name)
            if counter is None:
                continue
            tf = counter.get(term, 0)
            if tf <= 0:
                continue
            field_length = sum(counter.values())
            avg_length = avg_field_lengths.get(field_name, 0.0)
            normalized_tf = _normalize_tf(
                tf=tf,
                field_length=field_length,
                avg_field_length=avg_length,
                b=_FIELD_B[field_name],
            )
            weighted_tf += weight * normalized_tf
        if weighted_tf <= 0:
            continue
        score += idf * (((_K1 + 1.0) * weighted_tf) / (_K1 + weighted_tf))
    return round(score, 6)


def _normalize_tf(*, tf: int, field_length: int, avg_field_length: float, b: float) -> float:
    """Normalize in-field term frequency per the BM25F formula.

    Args:
        tf: raw term frequency within the field.
        field_length: field token length.
        avg_field_length: average field length.
        b: length-normalization parameter.

    Returns:
        normalized tf.

    Raises:
        RuntimeError: raised when computation fails.
    """

    if tf <= 0:
        return 0.0
    if field_length <= 0 or avg_field_length <= 0:
        return float(tf)
    denominator = 1.0 - b + b * (field_length / avg_field_length)
    if denominator <= 0:
        return float(tf)
    return float(tf) / denominator


def _extract_entry_content_text(entry: Mapping[str, Any]) -> str:
    """Extract the body-corpus field of a search hit.

    Args:
        entry: search hit entry.

    Returns:
        prefer evidence.context, then matched_text/snippet.

    Raises:
        RuntimeError: raised when extraction fails.
    """

    evidence = entry.get("evidence")
    if isinstance(evidence, Mapping):
        context = _normalize_text(evidence.get("context"))
        if context:
            return context
        matched_text = _normalize_text(evidence.get("matched_text"))
        if matched_text:
            return matched_text
    return _normalize_text(entry.get("snippet"))


def _normalize_text(value: Any) -> str:
    """Normalize any input into tokenizable text.

    Args:
        value: raw value.

    Returns:
        normalized string.

    Raises:
        RuntimeError: raised when conversion fails.
    """

    text = str(value or "").strip().lower()
    return " ".join(text.split())


def _tokenize(text: str) -> list[str]:
    """Extract ASCII tokens.

    Args:
        text: input text.

    Returns:
        token list.

    Raises:
        RuntimeError: raised when tokenization fails.
    """

    return _TOKEN_PATTERN.findall(text)
