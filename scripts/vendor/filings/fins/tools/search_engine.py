"""Search engine core logic.

This module implements the complete document search pipeline:
- Query diagnosis (ambiguity, intent classification)
- Adaptive search plan generation
- Query expansion (phrase variants, synonyms, token fallback)
- Intent filtering and semantic bucket matching
- Ranking (strategy priority -> intent consistency -> noise penalty -> BM25F -> proximity)
- Deduplication and evidenced structure construction

All functions are module-level private functions called by FinsToolService.
"""

from __future__ import annotations

import re
from collections import Counter
from typing import Any, Optional

from scripts.vendor.filings.engine.exceptions import ToolArgumentError
from scripts.vendor.filings.engine.processors.base import (
    DocumentProcessor,
    SearchHit,
)
from scripts.vendor.filings.fins._converters import normalize_optional_text, require_non_empty_text

from .bm25f_scorer import BM25FSectionIndex, score_search_entry_bm25f
from .search_models import (
    _BUCKET_KEYWORD_SIGNALS,
    _EXPECTED_BUCKETS_BY_INTENT,
    _GENERIC_AMBIGUOUS_TOKENS,
    _INTENT_KEYWORDS,
    _NOISE_CONTEXT_TOKENS_BY_INTENT,
    _SEARCH_STRATEGY_EXACT,
    _SEARCH_STRATEGY_PHRASE_VARIANT,
    _SEARCH_STRATEGY_PRIORITY,
    _SEARCH_STRATEGY_SYNONYM,
    _SEARCH_STRATEGY_TOKEN,
    _SEARCH_SYNONYM_GROUPS,
    _SPACE_NORMALIZE_PATTERN,
    _SUPPORT_CONTEXT_TOKENS_BY_INTENT,
    _TOKEN_STOP_WORDS,
    _TOPIC_TO_BUCKET,
    _VALID_SEARCH_MODES,
    _WORD_SPLIT_PATTERN,
    SEARCH_MODE_AUTO,
    SEARCH_MODE_EXACT,
    SEARCH_MODE_KEYWORD,
    SEARCH_MODE_SEMANTIC,
    QueryDiagnosis,
    SearchPlan,
    SectionSemanticProfile,
)
from .section_semantic import resolve_section_semantic

# =====================================================================
# Search match normalization
# =====================================================================


def _normalize_search_matches(matches_raw: list[SearchHit]) -> list[dict[str, Any]]:
    """Normalize search hit structure.

    Supports two hit modes:
    - Traditional snippet mode: hit contains snippet field.
    - Evidence mode: hit contains evidence field.

    Args:
        matches_raw: processor raw hit list.

    Returns:
        normalized hit list.

    Raises:
        RuntimeError: Raised when normalization fails.
    """

    normalized_matches: list[dict[str, Any]] = []
    for hit in matches_raw:
        page_no = hit.get("page_no")
        entry: dict[str, Any] = {
            "section_ref": hit.get("section_ref"),
            "section_title": hit.get("section_title"),
            "page_no": page_no if isinstance(page_no, int) and page_no > 0 else None,
        }
        # pass through the processor-level token_fallback flag so upstream can distinguish exact/fallback hits
        if hit.get("_token_fallback"):
            entry["_token_fallback"] = True
        # keep the evidence structure (when the processor returned evidence-based hits)
        evidence = hit.get("evidence")
        if isinstance(evidence, dict):
            entry["evidence"] = evidence
        else:
            entry["snippet"] = str(hit.get("snippet", ""))
        normalized_matches.append(entry)
    return normalized_matches


# =====================================================================
# Search mode and query parameter validation
# =====================================================================


def _resolve_search_mode(mode: Optional[str]) -> str:
    """Validate and normalize search mode parameters.

    Args:
        mode: raw mode parameter; defaults to ``auto`` when None.

    Returns:
        normalized search-mode string.

    Raises:
        ToolArgumentError: Raised when mode value is invalid.
    """

    if mode is None:
        return SEARCH_MODE_AUTO
    normalized = str(mode).strip().lower()
    if not normalized:
        return SEARCH_MODE_AUTO
    if normalized not in _VALID_SEARCH_MODES:
        raise ToolArgumentError(
            "search_document",
            "mode",
            mode,
            f"invalid value; allowed values are {sorted(_VALID_SEARCH_MODES)}",
        )
    return normalized


def _build_empty_search_strategy_hit_counts() -> dict[str, int]:
    """Build search strategy hit statistics dictionary.

    Args:
        None.

    Returns:
        initialized strategy hit-count dict.

    Raises:
        None.
    """

    return {
        _SEARCH_STRATEGY_EXACT: 0,
        _SEARCH_STRATEGY_PHRASE_VARIANT: 0,
        _SEARCH_STRATEGY_SYNONYM: 0,
        _SEARCH_STRATEGY_TOKEN: 0,
    }


def _resolve_search_queries(
    *,
    query: Optional[str],
    queries: Optional[list[str]],
    max_queries: int,
) -> list[str]:
    """Validate and resolve mutually exclusive query / queries parameters, returning normalized query list.

    Args:
        query: single query.
        queries: batch queries.
        max_queries: batch query limit.

    Returns:
        non-empty normalized query list.

    Raises:
        ToolArgumentError: Raised when both or neither are specified, or limit exceeded.
    """

    has_query = query is not None and str(query).strip() != ""
    has_queries = queries is not None and len(queries) > 0

    if has_query and has_queries:
        raise ToolArgumentError(
            "search_document",
            "query/queries",
            None,
            "Cannot specify both 'query' and 'queries'. Use one or the other.",
        )
    if not has_query and not has_queries:
        raise ToolArgumentError(
            "search_document",
            "query/queries",
            None,
            "Must specify either 'query' or 'queries'.",
        )

    if has_query:
        normalized = require_non_empty_text(
            query,
            empty_error=ToolArgumentError(
                "search_document",
                "query",
                query,
                "Argument must not be empty",
            ),
        )
        return [normalized]

    # Batch path: remove empty values, deduplicate, validate limit
    assert queries is not None
    seen: set[str] = set()
    result: list[str] = []
    for item in queries:
        normalized = normalize_optional_text(item)
        if normalized is None:
            continue
        key = normalized.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(normalized)

    if not result:
        raise ToolArgumentError(
            "search_document",
            "queries",
            queries,
            "'queries' must contain at least one non-empty string.",
        )
    if len(result) > max_queries:
        raise ToolArgumentError(
            "search_document",
            "queries",
            None,
            f"'queries' exceeds maximum of {max_queries} items (got {len(result)}).",
        )
    return result


# =====================================================================
# Section semantic profiling
# =====================================================================


def _build_section_semantic_profiles(
    sections: list[dict[str, Any]],
) -> tuple[dict[str, SectionSemanticProfile], dict[str, int]]:
    """Build section semantic profiles and query word document frequencies.

    Args:
        sections: semantically enriched section list.

    Returns:
        ``(semantic_profiles, term_document_frequency)``。

    Raises:
        RuntimeError: Raised when construction fails.
    """

    profiles: dict[str, SectionSemanticProfile] = {}
    term_df: Counter[str] = Counter()
    for section in sections:
        section_ref = str(section.get("ref") or "").strip()
        if not section_ref:
            continue
        topic = str(section.get("topic") or "").strip().lower()
        path = str(section.get("path") or "").strip()
        title = str(section.get("title") or "").strip()
        item = str(section.get("item") or "").strip()
        preview = str(section.get("preview") or "").strip()
        bucket = _resolve_semantic_bucket(topic=topic, path=path, title=title, item=item)
        lexical_text = " ".join([title, item, topic, path, preview]).lower()
        lexical_tokens = tuple(_extract_ascii_tokens(lexical_text))
        profiles[section_ref] = SectionSemanticProfile(
            section_ref=section_ref,
            topic=topic,
            path=path,
            title=title,
            item=item,
            bucket=bucket,
            lexical_tokens=lexical_tokens,
        )
        term_df.update(set(lexical_tokens))
    return profiles, dict(term_df)


def _resolve_semantic_bucket(*, topic: str, path: str, title: str, item: str) -> str:
    """Normalize semantic bucket based on section semantic fields (adaptive approach).

    Uses two-level decision:

    1. **Direct Topic Match** (Level 1): returns immediately if topic is in ``_TOPIC_TO_BUCKET`` table,
       covering every ``SectionType`` value; adding a SectionType only needs one mapping row.
    2. **Keyword Scoring** (Level 2 fallback): when topic misses, tokenize path / title / item
       and score against each bucket's keyword set in ``_BUCKET_KEYWORD_SIGNALS`` by intersection,
       taking the highest-scoring bucket. Returns ``"other"`` when all are zero.

    This design avoids order dependency and substring mismatch issues of if-else chains.

    Args:
        topic: section topic (``SectionType.value`` from ``section_semantic.py``).
        path: section hierarchy path.
        title: section title.
        item: section Item number.

    Returns:
        semantic bucket name (business / risk / financial / governance / people / legal / other).
    """

    # Level 1: direct topic match (most reliable signal, O(1) lookup)
    bucket = _TOPIC_TO_BUCKET.get(topic.lower().strip())
    if bucket is not None:
        return bucket

    # Level 2: keyword scoring fallback (for sections without topic or with custom topics)
    text = f"{path} {title} {item}".lower()
    words = frozenset(_WORD_SPLIT_PATTERN.findall(text))
    best_bucket = "other"
    best_score = 0
    for candidate, keywords in _BUCKET_KEYWORD_SIGNALS.items():
        score = len(words & keywords)
        if score > best_score:
            best_score = score
            best_bucket = candidate
    return best_bucket


# =====================================================================
# Query diagnosis and intent classification
# =====================================================================


def _diagnose_search_query(
    *,
    query: str,
    term_document_frequency: dict[str, int],
    document_count: int,
    mode: str,
) -> QueryDiagnosis:
    """Diagnose query ambiguity and intent for adaptive retrieval.

    Args:
        query: normalized query term.
        term_document_frequency: term document frequency.
        document_count: document section count.
        mode: search mode.

    Returns:
        QueryDiagnosis struct.

    Raises:
        RuntimeError: Raised when diagnosis fails.
    """

    tokens = tuple(_extract_ascii_tokens(query.lower()))
    token_count = len(tokens)
    if token_count == 0:
        return QueryDiagnosis(
            query=query,
            tokens=tokens,
            token_count=0,
            ambiguity_score=0.0,
            is_high_ambiguity=False,
            intent="general",
            allow_direct_token_fallback=True,
        )

    generic_hits = sum(1 for token in tokens if token in _GENERIC_AMBIGUOUS_TOKENS)
    generic_ratio = generic_hits / token_count
    df_ratio = 0.0
    for token in tokens:
        token_df = term_document_frequency.get(token, 0)
        if document_count > 0:
            df_ratio += min(1.0, token_df / document_count)
    df_ratio = df_ratio / token_count
    short_query_factor = 1.0 if token_count <= 2 else 0.0
    ambiguity_score = round((generic_ratio + df_ratio + short_query_factor) / 3.0, 4)
    is_high_ambiguity = ambiguity_score >= 0.62
    intent = _classify_query_intent(tokens)
    allow_direct_token_fallback = not (mode == SEARCH_MODE_AUTO and is_high_ambiguity)

    return QueryDiagnosis(
        query=query,
        tokens=tokens,
        token_count=token_count,
        ambiguity_score=ambiguity_score,
        is_high_ambiguity=is_high_ambiguity,
        intent=intent,
        allow_direct_token_fallback=allow_direct_token_fallback,
    )


def _classify_query_intent(tokens: tuple[str, ...]) -> str:
    """Estimate query intent from tokens.

    Args:
        tokens: query token list.

    Returns:
        intent name.

    Raises:
        RuntimeError: Raised when classification fails.
    """

    if not tokens:
        return "general"
    scored: dict[str, int] = {}
    token_set = set(tokens)
    for intent, keywords in _INTENT_KEYWORDS.items():
        scored[intent] = len(token_set.intersection(keywords))
    best_intent = "general"
    best_score = 0
    for intent, score in scored.items():
        if score > best_score:
            best_intent = intent
            best_score = score
    return best_intent


# =====================================================================
# Adaptive search plan
# =====================================================================


def _build_adaptive_search_plan(
    *,
    query: str,
    mode: str,
    diagnosis: QueryDiagnosis,
) -> SearchPlan:
    """Generate search execution plan from query diagnosis.

    Args:
        query: normalized query term.
        mode: search mode.
        diagnosis: query diagnosis result.

    Returns:
        SearchPlan。

    Raises:
        RuntimeError: Raised when generation fails.
    """

    run_exact = mode in (SEARCH_MODE_AUTO, SEARCH_MODE_EXACT)
    run_expansion = mode in (SEARCH_MODE_AUTO, SEARCH_MODE_KEYWORD, SEARCH_MODE_SEMANTIC)
    if not run_expansion:
        return SearchPlan(
            run_exact=run_exact,
            expansion_phases=(),
            fallback_gated=False,
            scoped_before_token=False,
        )

    expansions = _build_search_query_expansions(query, mode=mode)
    if mode == SEARCH_MODE_KEYWORD:
        return SearchPlan(
            run_exact=False,
            expansion_phases=(tuple(expansions),),
            fallback_gated=False,
            scoped_before_token=False,
        )

    if mode == SEARCH_MODE_AUTO and diagnosis.is_high_ambiguity:
        non_token = [item for item in expansions if item.get("strategy") != _SEARCH_STRATEGY_TOKEN]
        token_only = [item for item in expansions if item.get("strategy") == _SEARCH_STRATEGY_TOKEN]
        phases: list[tuple[dict[str, str], ...]] = []
        if non_token:
            phases.append(tuple(non_token))
        if token_only:
            phases.append(tuple(token_only))
        return SearchPlan(
            run_exact=True,
            expansion_phases=tuple(phases),
            fallback_gated=True,
            scoped_before_token=True,
        )

    return SearchPlan(
        run_exact=run_exact,
        expansion_phases=(tuple(expansions),),
        fallback_gated=False,
        scoped_before_token=False,
    )


# =====================================================================
# Intent filtering
# =====================================================================


def _filter_matches_by_intent(
    *,
    matches: list[dict[str, Any]],
    diagnosis: QueryDiagnosis,
    semantic_profiles: dict[str, SectionSemanticProfile],
) -> list[dict[str, Any]]:
    """Filter the hit set by query intent.

    Args:
        matches: raw hit list.
        diagnosis: query diagnosis result.
        semantic_profiles: section semantic profiles.

    Returns:
        filtered hit list; empty list when nothing matches.

    Raises:
        RuntimeError: Raised when filtering fails.
    """

    expected_buckets = _expected_buckets_for_intent(diagnosis.intent)
    if not expected_buckets:
        return matches
    filtered: list[dict[str, Any]] = []
    for match in matches:
        section_ref = str(match.get("section_ref") or "").strip()
        profile = semantic_profiles.get(section_ref)
        if profile is None:
            continue
        if profile.bucket in expected_buckets:
            filtered.append(match)
    return filtered


def _expected_buckets_for_intent(intent: str) -> set[str]:
    """Return preferred semantic bucket set corresponding to query intent.

    Data-driven: mapped via ``_EXPECTED_BUCKETS_BY_INTENT`` table.
    Adding new intents only requires extending the table without modifying this function.
    """

    return set(_EXPECTED_BUCKETS_BY_INTENT.get(intent, frozenset()))


# =====================================================================
# Query execution
# =====================================================================


def _execute_query_search(
    *,
    processor: "DocumentProcessor",
    query: str,
    within_ref: Optional[str],
    mode: str,
    diagnosis: QueryDiagnosis,
    semantic_profiles: dict[str, SectionSemanticProfile],
) -> tuple[list[dict[str, Any]], dict[str, int], list[dict[str, Any]], list[dict[str, str]]]:
    """Execute search strategies for a single query, returning raw ranked_entries plus diagnostics.

    Args:
        processor: document processor.
        query: normalized query term.
        within_ref: optional section scope.
        mode: search mode.
        diagnosis: query diagnosis result.
        semantic_profiles: section semantic-profile mapping.

    Returns:
        ``(ranked_entries, strategy_hit_counts, exact_matches, expansion_queries)`` 4-tuple.
    """

    exact_matches: list[dict[str, Any]] = []
    expansion_queries: list[dict[str, str]] = []
    strategy_hit_counts = _build_empty_search_strategy_hit_counts()
    ranked_entries: list[dict[str, Any]] = []

    search_plan = _build_adaptive_search_plan(
        query=query,
        mode=mode,
        diagnosis=diagnosis,
    )

    if search_plan.run_exact:
        # strip quotes: LLMs often use quotes to express exact-match intent (search-engine syntax),
        # the run_exact path already implies exact-match semantics; literal quotes would cause false negatives.
        # applies to both auto and exact modes (keyword/semantic do not use this path).
        exact_query = query.replace('"', '').strip()
        exact_matches_raw: list[SearchHit] = processor.search(exact_query or query, within_ref)
        all_normalized = _normalize_search_matches(exact_matches_raw)
        # separate true exact hits from processor-level token-fallback hits.
        # hits carrying the _token_fallback flag come from the processor-internal token OR fallback,
        # and belong to the token strategy rather than the exact strategy.
        exact_matches = [m for m in all_normalized if not m.get("_token_fallback")]
        token_fallback_matches = [m for m in all_normalized if m.get("_token_fallback")]
        if exact_matches:
            strategy_hit_counts[_SEARCH_STRATEGY_EXACT] = len(exact_matches)
            ranked_entries = _build_ranked_search_entries(
                matches=exact_matches,
                strategy=_SEARCH_STRATEGY_EXACT,
                query=query,
            )
        if token_fallback_matches:
            strategy_hit_counts[_SEARCH_STRATEGY_TOKEN] = strategy_hit_counts.get(
                _SEARCH_STRATEGY_TOKEN, 0
            ) + len(token_fallback_matches)
            ranked_entries.extend(
                _build_ranked_search_entries(
                    matches=token_fallback_matches,
                    strategy=_SEARCH_STRATEGY_TOKEN,
                    query=query,
                )
            )

    should_expand = bool(search_plan.expansion_phases) and (
        mode != SEARCH_MODE_AUTO or not exact_matches
    )
    if should_expand:
        for phase_index, phase in enumerate(search_plan.expansion_phases, start=1):
            for expansion in phase:
                expanded_query = expansion["query"]
                strategy = expansion["strategy"]
                expansion_queries.append({"query": expanded_query, "strategy": strategy})
                matches_raw = processor.search(expanded_query, within_ref)
                normalized_matches = _normalize_search_matches(matches_raw)
                if not normalized_matches:
                    continue

                token_phase = strategy == _SEARCH_STRATEGY_TOKEN
                if diagnosis.intent != "general" and search_plan.scoped_before_token:
                    strict_scope = token_phase and search_plan.fallback_gated and phase_index > 1
                    scoped_matches = _filter_matches_by_intent(
                        matches=normalized_matches,
                        diagnosis=diagnosis,
                        semantic_profiles=semantic_profiles,
                    )
                    if scoped_matches:
                        normalized_matches = scoped_matches
                    elif strict_scope:
                        for item in normalized_matches:
                            item["_token_fallback_opened"] = True

                if not normalized_matches:
                    continue
                strategy_hit_counts[strategy] = strategy_hit_counts.get(strategy, 0) + len(
                    normalized_matches
                )
                ranked_entries.extend(
                    _build_ranked_search_entries(
                        matches=normalized_matches,
                        strategy=strategy,
                        query=expanded_query,
                    )
                )

    return ranked_entries, strategy_hit_counts, exact_matches, expansion_queries


# =====================================================================
# Query expansion
# =====================================================================


def _build_search_query_expansions(
    query: str,
    *,
    mode: str = SEARCH_MODE_AUTO,
) -> list[dict[str, str]]:
    """Build search expansion query set.

    Expansion order is fixed as:
    1. ``phrase_variant`` (morphological and delimiter variants)
    2. ``synonym`` (synonym/terminology mapping)
    3. ``token`` (keyword split fallback)

    When ``mode`` is ``keyword``, only token split queries are generated;
    other modes generate all expansions.

    Args:
        query: raw query term.
        mode: search mode; affects the generated expansion-strategy subset.

    Returns:
        expansion query list; each item carries ``query`` and ``strategy``.

    Raises:
        RuntimeError: Raised when construction fails.
    """

    expansions: list[dict[str, str]] = []
    seen: set[str] = {_normalize_search_query_for_key(query)}

    # keyword mode only splits tokens, skipping phrase variants and synonyms
    include_phrase_variant = mode != SEARCH_MODE_KEYWORD
    include_synonym = mode != SEARCH_MODE_KEYWORD

    if include_phrase_variant:
        phrase_variants = _build_phrase_variant_queries(query)
        for variant in phrase_variants:
            _append_search_expansion(
                expansions=expansions,
                seen=seen,
                query=variant,
                strategy=_SEARCH_STRATEGY_PHRASE_VARIANT,
            )

    if include_synonym:
        synonym_queries = _build_synonym_queries(query)
        for synonym_query in synonym_queries:
            _append_search_expansion(
                expansions=expansions,
                seen=seen,
                query=synonym_query,
                strategy=_SEARCH_STRATEGY_SYNONYM,
            )

    token_queries = _build_token_queries(query)
    for token_query in token_queries:
        _append_search_expansion(
            expansions=expansions,
            seen=seen,
            query=token_query,
            strategy=_SEARCH_STRATEGY_TOKEN,
        )
    return expansions


def _append_search_expansion(
    *,
    expansions: list[dict[str, str]],
    seen: set[str],
    query: str,
    strategy: str,
) -> None:
    """Append a unique query item to the expansion query list.

    Args:
        expansions: target expansion list.
        seen: set of seen queries (normalized).
        query: candidate query.
        strategy: query strategy name.

    Returns:
        None.

    Raises:
        RuntimeError: Raised when appending fails.
    """

    normalized_query = normalize_optional_text(query)
    if normalized_query is None:
        return
    normalized_key = _normalize_search_query_for_key(normalized_query)
    if normalized_key in seen:
        return
    seen.add(normalized_key)
    expansions.append({"query": normalized_query, "strategy": strategy})


def _normalize_search_query_for_key(query: str) -> str:
    """Normalize query word for deduplication key.

    Args:
        query: raw query term.

    Returns:
        normalized key string.

    Raises:
        RuntimeError: Raised when normalization fails.
    """

    normalized = normalize_optional_text(query) or ""
    lowered = normalized.lower()
    return _SPACE_NORMALIZE_PATTERN.sub(" ", lowered).strip()


def _build_phrase_variant_queries(query: str) -> list[str]:
    """Generate phrase variant queries.

    Args:
        query: raw query term.

    Returns:
        variant query list.

    Raises:
        RuntimeError: Raised when construction fails.
    """

    normalized = normalize_optional_text(query)
    if normalized is None:
        return []

    variants: set[str] = set()
    if "-" in normalized:
        variants.add(normalized.replace("-", " "))
    if "/" in normalized:
        variants.add(normalized.replace("/", " "))

    lowered = normalized.lower()
    ascii_tokens = _extract_ascii_tokens(lowered)
    if ascii_tokens:
        for index, token in enumerate(ascii_tokens):
            for inflection in _expand_ascii_token_inflections(token):
                replaced = list(ascii_tokens)
                replaced[index] = inflection
                variants.add(" ".join(replaced))

    normalized_key = _normalize_search_query_for_key(normalized)
    ordered_variants: list[str] = []
    for candidate in variants:
        candidate_key = _normalize_search_query_for_key(candidate)
        if not candidate_key or candidate_key == normalized_key:
            continue
        ordered_variants.append(candidate)
    ordered_variants.sort()
    return ordered_variants


def _build_synonym_queries(query: str) -> list[str]:
    """Generate synonym expansion queries.

    Args:
        query: raw query term.

    Returns:
        synonym query list.

    Raises:
        RuntimeError: Raised when construction fails.
    """

    normalized_key = _normalize_search_query_for_key(query)
    if not normalized_key:
        return []
    synonyms: set[str] = set()
    for group in _SEARCH_SYNONYM_GROUPS:
        group_keys = {_normalize_search_query_for_key(item): item for item in group}
        if normalized_key not in group_keys:
            continue
        for key, value in group_keys.items():
            if key == normalized_key:
                continue
            synonyms.add(value)
    ordered_synonyms = sorted(synonyms, key=lambda item: _normalize_search_query_for_key(item))
    return ordered_synonyms


def _build_token_queries(query: str) -> list[str]:
    """Generate token fallback queries.

    Args:
        query: raw query term.

    Returns:
        token query list.

    Raises:
        RuntimeError: Raised when construction fails.
    """

    tokens = _extract_ascii_tokens(query.lower())
    result: list[str] = []
    for token in tokens:
        if len(token) < 3 or token in _TOKEN_STOP_WORDS:
            continue
        result.append(token)
    return result


def _extract_ascii_tokens(query: str) -> list[str]:
    """Extract alphanumeric tokens from query.

    Args:
        query: raw query term.

    Returns:
        token list.

    Raises:
        RuntimeError: Raised when extraction fails.
    """

    return _WORD_SPLIT_PATTERN.findall(query or "")


def _expand_ascii_token_inflections(token: str) -> list[str]:
    """Generate simple morphological variants of English tokens.

    Args:
        token: raw token.

    Returns:
        word-form variant list (excluding the original token).

    Raises:
        RuntimeError: Raised when generation fails.
    """

    normalized = token.strip().lower()
    if len(normalized) < 3:
        return []
    variants: set[str] = set()
    if normalized.endswith("ies") and len(normalized) > 4:
        variants.add(f"{normalized[:-3]}y")
    if normalized.endswith("es") and len(normalized) > 3:
        variants.add(normalized[:-2])
    if normalized.endswith("s") and len(normalized) > 3:
        variants.add(normalized[:-1])
    else:
        variants.add(f"{normalized}s")
    variants.discard(normalized)
    ordered = sorted(variants)
    return ordered


# =====================================================================
# Hit ranking and deduplication
# =====================================================================


def _build_ranked_search_entries(
    *,
    matches: list[dict[str, Any]],
    strategy: str,
    query: str,
) -> list[dict[str, Any]]:
    """Build search hit entries with strategy priority.

    Args:
        matches: normalized hit list.
        strategy: hit strategy name.
        query: raw query term that produced this hit.

    Returns:
        hit entry list with sort weights.

    Raises:
        RuntimeError: Raised when construction fails.
    """

    priority = _SEARCH_STRATEGY_PRIORITY.get(strategy, 999)
    result: list[dict[str, Any]] = []
    for match in matches:
        entry = dict(match)
        entry["_strategy"] = strategy
        entry["_priority"] = priority
        entry["_query"] = query
        result.append(entry)
    return result


def _deduplicate_ranked_search_entries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Deduplicate by hit content, keeping the higher-priority entry.

    Args:
        entries: raw weighted hit list.

    Returns:
        deduplicated hit list.

    Raises:
        RuntimeError: Raised when deduplication fails.
    """

    selected: dict[tuple[str, str, str, str], dict[str, Any]] = {}
    for entry in entries:
        section_ref = str(entry.get("section_ref") or "")
        section_title = str(entry.get("section_title") or "")
        # dedupe keys supporting both evidence and legacy snippet modes
        evidence = entry.get("evidence")
        if isinstance(evidence, dict):
            content_key = str(evidence.get("context") or evidence.get("matched_text") or "")
        else:
            content_key = str(entry.get("snippet") or "")
        page_no = str(entry.get("page_no") or "")
        key = (section_ref, section_title, content_key, page_no)
        current = selected.get(key)
        if current is None:
            selected[key] = entry
            continue
        if int(entry.get("_priority", 999)) < int(current.get("_priority", 999)):
            selected[key] = entry
    return list(selected.values())


def _compute_keyword_proximity_score(entry: dict[str, Any]) -> int:
    """Calculate proximity score of keywords in hit entries.

    For multi-word queries, closer keyword distances yield lower scores (ranked earlier).
    Single-word queries or uncomputable cases return 0 (no effect on ranking).

    Algorithm: extracts all token positions in evidence.context, computes length
    of minimum enclosing window of query tokens as proximity score.

    Args:
        entry: search hit entry with evidence.

    Returns:
        proximity score (smaller is better); 0 when it cannot be computed.
    """

    evidence = entry.get("evidence")
    if not isinstance(evidence, dict):
        return 0
    context = str(evidence.get("context") or "").lower()
    if not context:
        return 0
    # Extract tokens from entry raw query information
    # Use evidence.matched_text as query approximation
    matched_text = str(evidence.get("matched_text") or "").lower()
    query_tokens = _WORD_SPLIT_PATTERN.findall(matched_text)
    # Remove stopwords and short tokens
    query_tokens = [t for t in query_tokens if len(t) >= 3 and t not in _TOKEN_STOP_WORDS]
    if len(query_tokens) < 2:
        return 0

    # Find all occurrences of each query token in context
    context_tokens = _WORD_SPLIT_PATTERN.findall(context)
    token_positions: dict[str, list[int]] = {}
    for pos, ct in enumerate(context_tokens):
        for qt in query_tokens:
            if ct == qt or ct.startswith(qt) or qt.startswith(ct):
                token_positions.setdefault(qt, []).append(pos)

    # Only compute window when all query tokens appear
    if len(token_positions) < 2:
        return 0

    # Minimum enclosing window: take first occurrence of each token, compute max-min span
    min_window = 999999
    first_positions = [positions[0] for positions in token_positions.values()]
    window = max(first_positions) - min(first_positions)
    min_window = min(min_window, window)

    return min_window


def _sort_ranked_search_entries(
    entries: list[dict[str, Any]],
    *,
    bm25f_index: Optional[BM25FSectionIndex] = None,
    diagnosis: Optional[QueryDiagnosis] = None,
    semantic_profiles: Optional[dict[str, SectionSemanticProfile]] = None,
) -> list[dict[str, Any]]:
    """Stably sort hit entries.

    Ranking axes: strategy priority -> intent consistency (desc) -> noise penalty (asc)
    -> BM25F score (desc) -> keyword proximity -> section ref -> page number -> content text.
    Smaller proximity score (closer keywords) ranks higher.

    Args:
        entries: deduplicated hit entry list.
        bm25f_index: optional BM25F index; skips this ranking signal when None.
        diagnosis: optional query diagnosis result.
        semantic_profiles: optional section semantic-profile index.

    Returns:
        sorted hit entry list.

    Raises:
        RuntimeError: Raised when ranking fails.
    """

    for item in entries:
        query = str(item.get("_query") or "").strip()
        if bm25f_index is None or not query:
            item["_bm25f_score"] = 0.0
        else:
            item["_bm25f_score"] = score_search_entry_bm25f(
                entry=item,
                query=query,
                index=bm25f_index,
            )
        item["_intent_alignment_score"] = _compute_intent_alignment_score(
            entry=item,
            diagnosis=diagnosis,
            semantic_profiles=semantic_profiles,
        )
        item["_context_noise_penalty"] = _compute_context_noise_penalty(
            entry=item,
            diagnosis=diagnosis,
        )

    return sorted(
        entries,
        key=lambda item: (
            int(item.get("_priority", 999)),
            -float(item.get("_intent_alignment_score", 0.0)),
            float(item.get("_context_noise_penalty", 0.0)),
            -float(item.get("_bm25f_score", 0.0)),
            _compute_keyword_proximity_score(item),
            str(item.get("section_ref") or ""),
            int(item.get("page_no") or 0),
            str(item.get("snippet") or item.get("evidence", {}).get("context", "") or ""),
        ),
    )


def _compute_intent_alignment_score(
    *,
    entry: dict[str, Any],
    diagnosis: Optional[QueryDiagnosis],
    semantic_profiles: Optional[dict[str, SectionSemanticProfile]],
) -> float:
    """Calculate consistency score between hit and query intent.

    Args:
        entry: search hit entry.
        diagnosis: query diagnosis result.
        semantic_profiles: section semantic-profile index.

    Returns:
        consistency score, range ``0~1``.

    Raises:
        RuntimeError: Raised when computation fails.
    """

    if diagnosis is None or semantic_profiles is None:
        return 0.0
    if diagnosis.intent == "general":
        return 0.0
    section_ref = str(entry.get("section_ref") or "").strip()
    if not section_ref:
        return 0.0
    profile = semantic_profiles.get(section_ref)
    if profile is None:
        return 0.0
    expected_buckets = _expected_buckets_for_intent(diagnosis.intent)
    if not expected_buckets:
        return 0.0
    return 1.0 if profile.bucket in expected_buckets else 0.0


def _compute_context_noise_penalty(
    *,
    entry: dict[str, Any],
    diagnosis: Optional[QueryDiagnosis],
) -> float:
    """Calculate hit context noise penalty score.

    Args:
        entry: search hit entry.
        diagnosis: query diagnosis result.

    Returns:
        penalty score (larger means noisier).

    Raises:
        RuntimeError: Raised when computation fails.
    """

    if diagnosis is None:
        return 0.0
    noise_terms = _NOISE_CONTEXT_TOKENS_BY_INTENT.get(diagnosis.intent)
    support_terms = _SUPPORT_CONTEXT_TOKENS_BY_INTENT.get(diagnosis.intent)
    if not noise_terms:
        return 0.0

    evidence = entry.get("evidence")
    context = ""
    if isinstance(evidence, dict):
        context = str(evidence.get("context") or evidence.get("matched_text") or "")
    if not context:
        context = str(entry.get("snippet") or "")
    tokens = _extract_ascii_tokens(context.lower())
    if not tokens:
        return 0.0

    token_set = set(tokens)
    noise_hits = len(token_set.intersection(noise_terms))
    if noise_hits <= 0:
        return 0.0
    support_hits = len(token_set.intersection(support_terms or frozenset()))
    # Lower penalty when context also contains industry support words, avoiding false penalties on real business descriptions.
    return 0.8 if support_hits > 0 else min(2.0, 0.6 + (0.25 * noise_hits))


# =====================================================================
# exact-priority throttling
# =====================================================================

# Maximum fraction of expansion when exact + expansion coexist
_EXPANSION_RATIO_WHEN_EXACT_EXISTS: float = 0.3
# Minimum entry threshold for throttling (no pruning triggered below this)
_CAP_MIN_TRIGGER: int = 8


def _cap_entries_with_exact_priority(
    sorted_entries: list[dict[str, Any]],
    display_budget: Optional[int] = None,
) -> list[dict[str, Any]]:
    """Exact-first limiting: when exact hits exist, compress the share of expansion results.

    All exact hits are retained; expansion results occupy at most 30% of total capacity (at least 2 retained).
    No pruning triggered when total entries is below _CAP_MIN_TRIGGER.

    When ``display_budget`` exists and all exact entries fit within budget,
    further tighten expansion quota so pruned total <= display_budget,
    avoiding downstream truncation_manager cursor vs hint signal conflicts.

    Args:
        sorted_entries: sorted search entries (exact first).
        display_budget: optional display-budget cap (corresponds to truncation max_items).

    Returns:
        trimmed entry list.
    """
    total = len(sorted_entries)
    if total < _CAP_MIN_TRIGGER:
        return sorted_entries

    exact_entries: list[dict[str, Any]] = []
    expansion_entries: list[dict[str, Any]] = []
    for entry in sorted_entries:
        if entry.get("_strategy") == _SEARCH_STRATEGY_EXACT:
            exact_entries.append(entry)
        else:
            expansion_entries.append(entry)

    # Do not prune expansion when there are no exact hits
    if not exact_entries:
        return sorted_entries

    # Expansion quota = total * max ratio, at least 2 retained
    expansion_cap = max(2, int(total * _EXPANSION_RATIO_WHEN_EXACT_EXISTS))

    # When display_budget exists and exact hits fit within it,
    # tighten expansion quota so total does not exceed display_budget
    if display_budget and len(exact_entries) <= display_budget:
        budget_remaining = display_budget - len(exact_entries)
        expansion_cap = min(expansion_cap, max(2, budget_remaining))

    capped_expansion = expansion_entries[:expansion_cap]

    return exact_entries + capped_expansion


# =====================================================================
# Evidenced structure construction
# =====================================================================

# Maximum characters for matched_text -- used to trim hit sentence from snippet
_MATCHED_TEXT_MAX_CHARS: int = 120


def _center_matched_text(snippet: str, query: str, max_chars: int = _MATCHED_TEXT_MAX_CHARS) -> str:
    """Extract summary text centered on the query hit position from a snippet.

    After finding query position in snippet, center-trim max_chars around that position;
    if query does not exist in snippet, fallback to trimming from snippet head.

    Args:
        snippet: full snippet text.
        query: query term.
        max_chars: maximum character count.

    Returns:
        summary text centered on the query hit position.
    """
    if not snippet:
        return ""
    if len(snippet) <= max_chars:
        return snippet
    normalized_query = str(query or "").strip()
    if not normalized_query:
        return snippet[:max_chars]
    # Find query occurrence position in snippet
    try:
        pattern = re.compile(re.escape(normalized_query), flags=re.IGNORECASE)
    except re.error:
        return snippet[:max_chars]
    match = pattern.search(snippet)
    if match is None:
        return snippet[:max_chars]
    # Left budget = half of max_chars, centering the hit position
    left_budget = max(1, max_chars // 2)
    start = max(0, match.start() - left_budget)
    end = min(len(snippet), start + max_chars)
    start = max(0, end - max_chars)
    return snippet[start:end]


def _build_evidence_matches(
    sorted_entries: list[dict[str, Any]],
    form_type: Optional[str],
    ref_to_topic: Optional[dict[str, Optional[str]]] = None,
) -> list[dict[str, Any]]:
    """Convert sorted search entries into the evidence-based return format.

    Each hit contains:
    - evidence compound structure (matched_text + context + match_position)
    - matched_query: raw query that generated this hit
    - is_exact_phrase: whether it was an exact phrase match
    - topic semantic tag

    Args:
        sorted_entries: sorted and deduplicated search entries.
        form_type: document form_type (used for semantic parsing).
        ref_to_topic: optional prebuilt section_ref -> topic index,
            used for topic fallback lookups of child-section hits.

    Returns:
        evidence-based hit list.
    """
    matches: list[dict[str, Any]] = []
    for entry in sorted_entries:
        section_ref = entry.get("section_ref")
        section_title = entry.get("section_title")
        # parse section semantics
        item_number, _, topic = resolve_section_semantic(
            title=section_title,
            form_type=form_type,
        )
        # when a child section cannot resolve itself, fall back to the prebuilt index
        if topic is None and ref_to_topic and section_ref:
            topic = ref_to_topic.get(section_ref)
        # query attribution and exactness
        matched_query = str(entry.get("_query") or "")
        strategy = str(entry.get("_strategy") or "")
        is_exact = strategy == _SEARCH_STRATEGY_EXACT
        # build the evidence structure
        evidence = entry.get("evidence")
        if not isinstance(evidence, dict):
            # legacy snippet-hit compatibility: upgrade to an evidence structure with matched_text centered on the query
            snippet_text = str(entry.get("snippet") or "")
            evidence = {
                "matched_text": _center_matched_text(snippet_text, matched_query),
                "context": snippet_text,
            }
        # section object: same structure as get_document_sections / read_section
        item_label = f"Item {item_number}" if item_number else None
        match_entry: dict[str, Any] = {
            "section": {
                "ref": section_ref,
                "title": section_title,
                "item": item_label,
                "topic": topic,
            },
            "matched_query": matched_query,
            "is_exact_phrase": is_exact,
            "evidence": evidence,
            "page_no": entry.get("page_no"),
        }
        matches.append(match_entry)
    return matches
