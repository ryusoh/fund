"""Search-result post-processing utilities.

This module provides unified snippet extraction and deduplication for
multiple Processors, with the goals of:
1. Generating more readable extractive snippets anchored on the query term
   (not generative summaries).
2. Removing near-duplicate fragments within a section so similar hits do
   not flood the results.
3. Producing output via deterministic rules, ensuring reproducibility and
   testability.
"""

from __future__ import annotations

import re
from collections import OrderedDict
from typing import Any, Callable, Protocol, TypeVar

from .base import SearchEvidence, SearchHit, build_search_hit
from .text_utils import normalize_whitespace as _normalize_whitespace

_SENTENCE_END_PUNCT = {"。", "！", "？", "!", "?", "；", ";"}
_NON_WORD_PATTERN = re.compile(r"[\W_]+", flags=re.UNICODE)
# Regex for sentence-ending punctuation, used for efficient splitting in _split_sentence_spans
_SENTENCE_SPLIT_PATTERN = re.compile(r"[。！？!?；;]")

# ---------------------------------------------------------------------------
# Search-result configuration constants
# ---------------------------------------------------------------------------
# Maximum number of hits returned within a single section
SEARCH_PER_SECTION_LIMIT: int = 2
# Maximum snippet length in characters (extractive-summary truncation length)
SEARCH_SNIPPET_MAX_CHARS: int = 360


def extract_query_anchored_snippets(
    content: str,
    query: str,
    max_chars: int = SEARCH_SNIPPET_MAX_CHARS,
    max_per_section: int = SEARCH_PER_SECTION_LIMIT,
) -> list[str]:
    """Extract and deduplicate fragments by query term.

    Args:
        content: section text content.
        query: query term.
        max_chars: maximum characters per snippet.
        max_per_section: maximum entries kept per section.

    Returns:
        deduplicated and rate-limited snippet list.

    Raises:
        RuntimeError: raised when processing fails.
    """

    normalized_content = _normalize_whitespace(content)
    normalized_query = str(query or "").strip()
    if not normalized_content or not normalized_query:
        return []

    sentence_spans = _split_sentence_spans(normalized_content)
    if not sentence_spans:
        return []

    query_pattern = re.compile(re.escape(normalized_query), flags=re.IGNORECASE)
    match_starts = [match.start() for match in query_pattern.finditer(normalized_content)]
    if not match_starts:
        return []

    sentences = [span["sentence"] for span in sentence_spans]
    snippets_raw: list[str] = []
    for match_start in match_starts:
        sentence_index = _locate_sentence_index(sentence_spans, match_start)
        if sentence_index is None:
            continue
        snippet = build_snippet_from_sentence_window(
            sentences=sentences,
            hit_index=sentence_index,
            query=normalized_query,
            max_chars=max_chars,
        )
        if not snippet:
            continue
        if query_pattern.search(snippet) is None:
            # note: the hit segment must contain the query in theory; guard here so a sentence-split anomaly cannot lose the anchor.
            continue
        snippets_raw.append(snippet)

    if not snippets_raw:
        # note: in extreme cases sentence splitting can fail; fall back to a character-window cut so search still returns results.
        snippets_raw = _fallback_char_window_snippets(
            content=normalized_content,
            query=normalized_query,
            max_chars=max_chars,
        )

    deduped = dedup_snippets(snippets_raw)
    return cap_per_section(deduped, max_per_section)


def split_sentences(text: str) -> list[str]:
    """Split sentences by Chinese/English sentence-ending punctuation.

    Args:
        text: input text.

    Returns:
        sentence list.

    Raises:
        RuntimeError: raised when processing fails.
    """

    spans = _split_sentence_spans(_normalize_whitespace(text))
    return [span["sentence"] for span in spans]


def build_snippet_from_sentence_window(
    sentences: list[str],
    hit_index: int,
    query: str,
    max_chars: int,
) -> str:
    """Build a snippet centered on the hit sentence.

    Args:
        sentences: sentence list.
        hit_index: hit sentence index.
        query: query term.
        max_chars: maximum snippet characters.

    Returns:
        built snippet.

    Raises:
        RuntimeError: raised when the snippet build fails.
    """

    normalized_query = str(query or "").strip()
    if not sentences:
        return ""
    if hit_index < 0 or hit_index >= len(sentences):
        return ""
    if max_chars <= 0:
        return ""

    left = hit_index
    right = hit_index
    snippet = _join_sentence_window(sentences, left, right)
    if len(snippet) > max_chars:
        return _truncate_around_query(snippet, normalized_query, max_chars)

    while True:
        expanded = False
        if left > 0:
            candidate_left = _join_sentence_window(sentences, left - 1, right)
            if len(candidate_left) <= max_chars:
                left -= 1
                snippet = candidate_left
                expanded = True
        if right < len(sentences) - 1:
            candidate_right = _join_sentence_window(sentences, left, right + 1)
            if len(candidate_right) <= max_chars:
                right += 1
                snippet = candidate_right
                expanded = True
        if not expanded:
            break

    if re.search(re.escape(normalized_query), snippet, flags=re.IGNORECASE) is None:
        return _truncate_around_query(snippet, normalized_query, max_chars)
    return snippet


def normalize_for_dedup(text: str) -> str:
    """Normalize text for deduplication comparison.

    Args:
        text: raw text.

    Returns:
        normalized string.

    Raises:
        RuntimeError: raised when processing fails.
    """

    lowered = _normalize_whitespace(text).lower()
    return _NON_WORD_PATTERN.sub("", lowered)


def dedup_snippets(snippets: list[str]) -> list[str]:
    """Stably deduplicate fragments.

    Deduplication rules:
    1. Fragments that are identical after normalization count as duplicates.
    2. When one normalized fragment contains another, keep the more
       informative (longer) fragment.

    Args:
        snippets: raw fragment list.

    Returns:
        deduplicated fragment.

    Raises:
        RuntimeError: raised when deduplication fails.
    """

    deduped: list[str] = []
    normalized_values: list[str] = []

    for snippet in snippets:
        current = _normalize_whitespace(snippet)
        if not current:
            continue
        normalized = normalize_for_dedup(current)
        if not normalized:
            continue

        duplicated = False
        for index, existing in enumerate(normalized_values):
            if normalized == existing or normalized in existing:
                duplicated = True
                break
            if existing in normalized:
                deduped[index] = current
                normalized_values[index] = normalized
                duplicated = True
                break

        if not duplicated:
            deduped.append(current)
            normalized_values.append(normalized)

    return deduped


def cap_per_section(snippets: list[str], limit: int = 2) -> list[str]:
    """Rate-limit fragment counts by section.

    Args:
        snippets: fragment list.
        limit: retention cap.

    Returns:
        rate-limited fragment list.

    Raises:
        RuntimeError: raised when rate limiting fails.
    """

    if limit <= 0:
        return []
    return list(snippets[:limit])


def enrich_hits_by_section(
    hits_raw: list[SearchHit],
    section_content_map: dict[str, str],
    query: str,
    per_section_limit: int = SEARCH_PER_SECTION_LIMIT,
    snippet_max_chars: int = SEARCH_SNIPPET_MAX_CHARS,
) -> list[SearchHit]:
    """Aggregate and enrich search hits by section.

    Args:
        hits_raw: raw Processor hits (containing at least `section_ref`).
        section_content_map: `section_ref -> section content` mapping.
        query: query term.
        per_section_limit: maximum returned entries per section.
        snippet_max_chars: maximum snippet length.

    Returns:
        enriched hit list.

    Raises:
        RuntimeError: raised when enrichment fails.
    """

    grouped: "OrderedDict[str, list[SearchHit]]" = OrderedDict()
    for hit in hits_raw:
        section_ref = str(hit.get("section_ref", "")).strip()
        if not section_ref:
            continue
        grouped.setdefault(section_ref, []).append(hit)

    enriched_hits: list[SearchHit] = []
    for section_ref, section_hits in grouped.items():
        title = section_hits[0].get("section_title")
        page_no = _pick_first_positive_page_no(section_hits)
        section_content = section_content_map.get(section_ref, "")

        snippets = extract_query_anchored_snippets(
            content=section_content,
            query=query,
            max_chars=snippet_max_chars,
            max_per_section=per_section_limit,
        )
        if not snippets:
            fallback_raw = [str(hit.get("snippet", "")).strip() for hit in section_hits]
            snippets = cap_per_section(dedup_snippets(fallback_raw), per_section_limit)

        for snippet in snippets:
            hit = build_search_hit(
                section_ref=section_ref,
                section_title=title,
                snippet=snippet,
                page_no=page_no,
            )
            enriched_hits.append(hit)

    return enriched_hits


def _split_sentence_spans(text: str) -> list[dict[str, Any]]:
    """Split sentences and return their original position spans.

    Uses the precompiled ``_SENTENCE_SPLIT_PATTERN`` regex to split on
    sentence-ending punctuation, which is faster than iterating character
    by character.

    Args:
        text: input text.

    Returns:
        sentence span list; each item carries `start/end/sentence`.

    Raises:
        RuntimeError: raised when splitting fails.
    """

    normalized = _normalize_whitespace(text)
    if not normalized:
        return []

    spans: list[dict[str, Any]] = []
    current_start = 0
    for match in _SENTENCE_SPLIT_PATTERN.finditer(normalized):
        end = match.end()
        sentence = normalized[current_start:end].strip()
        if sentence:
            spans.append({"start": current_start, "end": end, "sentence": sentence})
        current_start = end

    tail = normalized[current_start:].strip()
    if tail:
        spans.append({"start": current_start, "end": len(normalized), "sentence": tail})
    return spans


def _locate_sentence_index(sentence_spans: list[dict[str, Any]], position: int) -> int | None:
    """Locate the index of the hit sentence by character position.

    Args:
        sentence_spans: sentence span list.
        position: hit start position.

    Returns:
        hit sentence index; `None` when not found.

    Raises:
        RuntimeError: raised when locating fails.
    """

    for index, span in enumerate(sentence_spans):
        start = int(span["start"])
        end = int(span["end"])
        if start <= position < end:
            return index
    return None


def _join_sentence_window(sentences: list[str], left: int, right: int) -> str:
    """Concatenate the sentence-window text.

    Args:
        sentences: sentence list.
        left: left boundary (inclusive).
        right: right boundary (inclusive).

    Returns:
        concatenated text.

    Raises:
        RuntimeError: raised when joining fails.
    """

    if left < 0 or right >= len(sentences) or left > right:
        return ""
    return _normalize_whitespace(" ".join(sentences[left : right + 1]))


def _truncate_around_query(text: str, query: str, max_chars: int) -> str:
    """Truncate oversized text around the query.

    Args:
        text: raw text.
        query: query term.
        max_chars: maximum length.

    Returns:
        truncated text.

    Raises:
        RuntimeError: raised when truncation fails.
    """

    normalized = _normalize_whitespace(text)
    if len(normalized) <= max_chars:
        return normalized
    if max_chars <= 0:
        return ""

    normalized_query = str(query or "").strip()
    if not normalized_query:
        return normalized[:max_chars]

    # Precompile with re.compile to avoid recompiling the escaped pattern on every call
    try:
        pattern = re.compile(re.escape(normalized_query), flags=re.IGNORECASE)
    except re.error:
        return normalized[:max_chars]
    match = pattern.search(normalized)
    if match is None:
        return normalized[:max_chars]

    left_budget = max(1, max_chars // 2)
    start = max(0, match.start() - left_budget)
    end = min(len(normalized), start + max_chars)
    start = max(0, end - max_chars)
    return normalized[start:end]


def _fallback_char_window_snippets(content: str, query: str, max_chars: int) -> list[str]:
    """Character-window fallback extraction.

    Take a character window centred on the query hit position and
    adaptively align it to the nearest word boundary, so the snippet is not
    cut off in the middle of a word.

    Args:
        content: text content.
        query: query term.
        max_chars: window length cap.

    Returns:
        fallback fragment list.

    Raises:
        RuntimeError: raised when extraction fails.
    """

    snippets: list[str] = []
    if not content or not query:
        return snippets

    pattern = re.compile(re.escape(query), flags=re.IGNORECASE)
    for match in pattern.finditer(content):
        start = max(0, match.start() - max_chars // 2)
        end = min(len(content), start + max_chars)
        start = max(0, end - max_chars)
        # Step 14: adaptively align to the nearest word boundary
        start = _snap_to_word_boundary_left(content, start)
        end = _snap_to_word_boundary_right(content, end)
        snippet = _normalize_whitespace(content[start:end])
        if snippet:
            snippets.append(snippet)
    return snippets


def _snap_to_word_boundary_left(text: str, pos: int) -> int:
    """Align a position leftward to the nearest word boundary (whitespace).

    Search rightward from pos for at most 20 characters and return the
    position after the first whitespace found.
    If pos is already at the start of a word or at the start of the text,
    return it unchanged.

    Args:
        text: raw text.
        pos: start position.

    Returns:
        aligned position.

    Raises:
        RuntimeError: raised when processing fails.
    """
    if pos <= 0:
        return 0
    # If the character before pos is whitespace, already at a boundary
    if text[pos - 1].isspace():
        return pos
    # Find the nearest whitespace to the right (within 20 characters)
    for i in range(pos, min(pos + 20, len(text))):
        if text[i].isspace():
            return i + 1
    return pos


def _snap_to_word_boundary_right(text: str, pos: int) -> int:
    """Align a position rightward to the nearest word boundary (whitespace).

    Search rightward from pos for at most 20 characters and cut at the
    first whitespace found.
    If pos is already at the end of a word or at the end of the text,
    return it unchanged.

    Args:
        text: raw text.
        pos: end position.

    Returns:
        aligned position.

    Raises:
        RuntimeError: raised when processing fails.
    """
    if pos >= len(text):
        return len(text)
    # If pos is whitespace, already at a boundary
    if text[pos].isspace():
        return pos
    # Find the nearest whitespace to the right (within 20 characters)
    for i in range(pos, min(pos + 20, len(text))):
        if text[i].isspace():
            return i
    return pos


# ---------------------------------------------------------------------------
# Token-cooccurrence snippet extraction (for token-fallback search only)
# ---------------------------------------------------------------------------


def extract_token_cooccurrence_snippets(
    content: str,
    tokens: list[str],
    original_query: str,
    max_chars: int = SEARCH_SNIPPET_MAX_CHARS,
    max_per_section: int = SEARCH_PER_SECTION_LIMIT,
) -> list[str]:
    """Extract the optimal snippet based on token co-occurrence density.

    Used in the token-fallback search scenario: the original multi-word
    query has no exact match in the text, but the individual tokens exist.
    This function finds the text window with the highest token-cooccurrence
    density, preferring regions where multiple tokens co-occur over
    single-token hits.

    Args:
        content: section text content.
        tokens: token list after query splitting.
        original_query: original query term (used for exact-match-first fallback).
        max_chars: maximum characters per snippet.
        max_per_section: maximum entries kept per section.

    Returns:
        deduplicated and rate-limited snippet list.
    """
    normalized = _normalize_whitespace(content)
    if not normalized or not tokens:
        return []

    # Try an exact match first (rarely, an exact match still exists on the token-fallback path)
    exact_snippets = extract_query_anchored_snippets(
        content=normalized,
        query=original_query,
        max_chars=max_chars,
        max_per_section=max_per_section,
    )
    if exact_snippets:
        return exact_snippets

    # Collect all occurrence positions of each token
    token_positions: list[tuple[int, int]] = []  # (position, token_index)
    for token_idx, token in enumerate(tokens):
        pattern = re.compile(re.escape(token), flags=re.IGNORECASE)
        for m in pattern.finditer(normalized):
            token_positions.append((m.start(), token_idx))

    if not token_positions:
        return []

    # Sort by position
    token_positions.sort()

    # Sliding window to find the region with the highest token diversity
    best_start = token_positions[0][0]
    best_diversity = 0
    best_center = best_start

    for i, (pos_i, _) in enumerate(token_positions):
        # window: all token occurrences within max_chars starting at pos_i
        seen_tokens: set[int] = set()
        window_end = pos_i + max_chars
        for j in range(i, len(token_positions)):
            pos_j, tok_j = token_positions[j]
            if pos_j > window_end:
                break
            seen_tokens.add(tok_j)

        diversity = len(seen_tokens)
        if diversity > best_diversity:
            best_diversity = diversity
            # window center is the best anchor in the region
            best_center = pos_i
            best_start = pos_i

    # Take the snippet around best_center
    half = max_chars // 2
    start = max(0, best_center - half)
    end = min(len(normalized), start + max_chars)
    start = max(0, end - max_chars)
    start = _snap_to_word_boundary_left(normalized, start)
    end = _snap_to_word_boundary_right(normalized, end)
    snippet = _normalize_whitespace(normalized[start:end])

    if not snippet:
        return []

    return cap_per_section(dedup_snippets([snippet]), max_per_section)


def enrich_hits_by_section_token_or(
    hits_raw: list[SearchHit],
    section_content_map: dict[str, str],
    tokens: list[str],
    original_query: str,
    per_section_limit: int = SEARCH_PER_SECTION_LIMIT,
    snippet_max_chars: int = SEARCH_SNIPPET_MAX_CHARS,
) -> list[SearchHit]:
    """Generate a snippet for a token-OR fallback search hit.

    Similar to ``enrich_hits_by_section``, but extracts the snippet using
    the token-cooccurrence window instead of an exact-phrase anchor. Each
    returned hit carries a ``_token_fallback: True`` marker so upstream can
    distinguish token-fallback hits from exact hits.

    Args:
        hits_raw: raw Processor hits.
        section_content_map: section_ref -> section content mapping.
        tokens: token list after query splitting.
        original_query: original query term.
        per_section_limit: maximum returned entries per section.
        snippet_max_chars: maximum snippet length.

    Returns:
        enriched hit list, each hit carrying ``_token_fallback: True``.
    """
    grouped: "OrderedDict[str, list[SearchHit]]" = OrderedDict()
    for hit in hits_raw:
        section_ref = str(hit.get("section_ref", "")).strip()
        if not section_ref:
            continue
        grouped.setdefault(section_ref, []).append(hit)

    enriched_hits: list[SearchHit] = []
    for section_ref, section_hits in grouped.items():
        title = section_hits[0].get("section_title")
        page_no = _pick_first_positive_page_no(section_hits)
        section_content = section_content_map.get(section_ref, "")

        snippets = extract_token_cooccurrence_snippets(
            content=section_content,
            tokens=tokens,
            original_query=original_query,
            max_chars=snippet_max_chars,
            max_per_section=per_section_limit,
        )
        if not snippets:
            # fallback: use the raw snippet
            fallback_raw = [str(hit.get("snippet", "")).strip() for hit in section_hits]
            snippets = cap_per_section(dedup_snippets(fallback_raw), per_section_limit)

        for snippet in snippets:
            hit = build_search_hit(
                section_ref=section_ref,
                section_title=title,
                snippet=snippet,
                page_no=page_no,
                token_fallback=True,
            )
            enriched_hits.append(hit)

    return enriched_hits


def _pick_first_positive_page_no(hits: list[SearchHit]) -> int | None:
    """Select the first valid page number from a hit list.

    Args:
        hits: hit list.

    Returns:
        first positive-integer page number; `None` when none exists.

    Raises:
        RuntimeError: raised when selection fails.
    """

    for hit in hits:
        page_no = hit.get("page_no")
        if isinstance(page_no, int) and page_no > 0:
            return page_no
    return None


# ---------------------------------------------------------------------------
# Titled-section search loop (shared by the bs / docling / markdown processors)
# ---------------------------------------------------------------------------


class _TitledSection(Protocol):
    """Section protocol with title/ref, used by ``run_titled_section_search``.

    Declares only the shared attribute fields and does not constrain the
    concrete dataclass type, avoiding coupling between processors.
    """

    ref: str
    title: str | None


_TitledSectionT = TypeVar("_TitledSectionT", bound=_TitledSection)


def run_titled_section_search(
    sections: list[_TitledSectionT],
    normalized_query: str,
    get_text: Callable[[_TitledSectionT], str],
    page_no_of: Callable[[_TitledSectionT], int | None] | None = None,
) -> tuple[list[SearchHit], dict[str, str]]:
    """Keyword-search the sections list by title + content dual anchors.

    The three nearly isomorphic search loops formerly in
    `bs_processor` / `docling_processor` / `markdown_processor` are
    extracted here, with the core behaviour kept consistent:

    - Precompile the query regex (to avoid repeated compilation in the loop).
    - Detect both `title` and `content` hits.
    - If the title hits but the content does not, prepend the title to the
      search text so the downstream snippet
      can locate the matched term.
    - On a hit, build a `SearchHit` with the snippet temporarily stored as
      `normalized_query`, which downstream
      `enrich_hits_by_section` replaced with anchor-based snippets.

    Args:
        sections: section list to search.
        normalized_query: stripped query; the caller is responsible for filtering empties first.
        get_text: callback that reads body text from a section.
        page_no_of: callback reading page_no from a section; None when not applicable.

    Returns:
        pair: `(hits_raw, section_content_map)`. `hits_raw` is passed in
        `enrich_hits_by_section`; `section_content_map` provides the
        searchable body text, which is
        used during snippet extraction (the concatenated text wins when the title is prepended).
    """

    query_pattern = re.compile(re.escape(normalized_query), flags=re.IGNORECASE)
    hits_raw: list[SearchHit] = []
    section_content_map: dict[str, str] = {}

    for section in sections:
        text = get_text(section)
        title_text = section.title or ""
        title_hit = bool(title_text) and query_pattern.search(title_text) is not None
        content_hit = query_pattern.search(text) is not None
        if not title_hit and not content_hit:
            continue
        # if the title hits but content does not, prepend the title to the search text so the snippet can locate the matched term.
        searchable_text = (
            (title_text + "\n" + text).strip() if title_hit and not content_hit else text
        )
        section_content_map[section.ref] = searchable_text
        hits_raw.append(
            build_search_hit(
                section_ref=section.ref,
                section_title=section.title,
                snippet=normalized_query,
                page_no=page_no_of(section) if page_no_of is not None else None,
            )
        )
    return hits_raw, section_content_map


# ---------------------------------------------------------------------------
# Evidence mode
# ---------------------------------------------------------------------------
# A structure richer than a snippet, containing the exact matched text and
# its expanded context.
EVIDENCE_CONTEXT_MAX_CHARS: int = 600
"""Maximum evidence-context length in characters (a larger window than the snippet)."""


def extract_evidence_items(
    content: str,
    query: str,
    context_max_chars: int = EVIDENCE_CONTEXT_MAX_CHARS,
    max_per_section: int = SEARCH_PER_SECTION_LIMIT,
) -> list[SearchEvidence]:
    """Extract evidence-based hit entries by query term.

    Similar to extract_query_anchored_snippets, but returns structured
    evidence objects:
    - matched_text: the exact original text of the match
    - context: the sentence-window context containing the hit position
      (a larger span)

    Args:
        content: section text content.
        query: query term.
        context_max_chars: maximum context-window length in characters.
        max_per_section: maximum entries kept per section.

    Returns:
        evidence entry list.
    """
    normalized_content = _normalize_whitespace(content)
    normalized_query = str(query or "").strip()
    if not normalized_content or not normalized_query:
        return []

    sentence_spans = _split_sentence_spans(normalized_content)
    if not sentence_spans:
        return []

    query_pattern = re.compile(re.escape(normalized_query), flags=re.IGNORECASE)
    matches_iter = list(query_pattern.finditer(normalized_content))
    if not matches_iter:
        return []

    sentences = [span["sentence"] for span in sentence_spans]
    evidence_items: list[SearchEvidence] = []
    seen_normalized: set[str] = set()

    for match in matches_iter:
        matched_text = normalized_content[match.start() : match.end()]
        sentence_index = _locate_sentence_index(sentence_spans, match.start())
        if sentence_index is None:
            continue

        # build a larger context window
        context = build_snippet_from_sentence_window(
            sentences=sentences,
            hit_index=sentence_index,
            query=normalized_query,
            max_chars=context_max_chars,
        )
        if not context:
            continue

        # dedupe: based on the normalized form of context
        norm_key = normalize_for_dedup(context)
        if norm_key in seen_normalized:
            continue
        # check containment
        skip = False
        for existing_key in list(seen_normalized):
            if norm_key in existing_key or existing_key in norm_key:
                skip = True
                break
        if skip:
            continue
        seen_normalized.add(norm_key)

        evidence_items.append(
            {
                "matched_text": matched_text,
                "context": context,
            }
        )

        if len(evidence_items) >= max_per_section:
            break

    return evidence_items


def enrich_hits_with_evidence(
    hits_raw: list[SearchHit],
    section_content_map: dict[str, str],
    query: str,
    per_section_limit: int = SEARCH_PER_SECTION_LIMIT,
    context_max_chars: int = EVIDENCE_CONTEXT_MAX_CHARS,
) -> list[SearchHit]:
    """Aggregate by section and generate evidence-based search hits.

    Similar to enrich_hits_by_section but returns the evidence structure.

    Args:
        hits_raw: raw Processor hits.
        section_content_map: section_ref -> section content mapping.
        query: query term.
        per_section_limit: maximum returned entries per section.
        context_max_chars: maximum evidence-context length in characters.

    Returns:
        enriched hit list with evidence fields.
    """
    grouped: "OrderedDict[str, list[SearchHit]]" = OrderedDict()
    for hit in hits_raw:
        section_ref = str(hit.get("section_ref", "")).strip()
        if not section_ref:
            continue
        grouped.setdefault(section_ref, []).append(hit)

    enriched_hits: list[SearchHit] = []
    for section_ref, section_hits in grouped.items():
        title = section_hits[0].get("section_title")
        page_no = _pick_first_positive_page_no(section_hits)
        section_content = section_content_map.get(section_ref, "")

        evidence_items = extract_evidence_items(
            content=section_content,
            query=query,
            context_max_chars=context_max_chars,
            max_per_section=per_section_limit,
        )

        if not evidence_items:
            # fallback: use the legacy snippet approach
            snippets = extract_query_anchored_snippets(
                content=section_content,
                query=query,
                max_chars=SEARCH_SNIPPET_MAX_CHARS,
                max_per_section=per_section_limit,
            )
            if not snippets:
                fallback_raw = [str(hit.get("snippet", "")).strip() for hit in section_hits]
                snippets = cap_per_section(dedup_snippets(fallback_raw), per_section_limit)
            for snippet in snippets:
                evidence: SearchEvidence = {
                    "matched_text": str(query),
                    "context": snippet,
                }
                hit = build_search_hit(
                    section_ref=section_ref,
                    section_title=title,
                    page_no=page_no,
                    evidence=evidence,
                )
                enriched_hits.append(hit)
            continue

        for item in evidence_items:
            hit = build_search_hit(
                section_ref=section_ref,
                section_title=title,
                page_no=page_no,
                evidence=item,
            )
            enriched_hits.append(hit)

    return enriched_hits
