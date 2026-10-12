"""Search data models and constants.

This module defines the search subsystem's pure data structures (dataclasses)
and vocabularies/constants. It contains no business logic and serves as the
shared foundation of search_engine and service.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from dataclasses import dataclass

# ---------------------------------------------------------------------------
# Search strategy constants
# ---------------------------------------------------------------------------
_SEARCH_STRATEGY_EXACT = "exact"
_SEARCH_STRATEGY_PHRASE_VARIANT = "phrase_variant"
_SEARCH_STRATEGY_SYNONYM = "synonym"
_SEARCH_STRATEGY_TOKEN = "token"
_SEARCH_STRATEGY_PRIORITY: dict[str, int] = {
    _SEARCH_STRATEGY_EXACT: 0,
    _SEARCH_STRATEGY_PHRASE_VARIANT: 1,
    _SEARCH_STRATEGY_SYNONYM: 2,
    _SEARCH_STRATEGY_TOKEN: 3,
}
_SEARCH_RANKING_VERSION = "adaptive_bm25f_v1.0.0"

# ---------------------------------------------------------------------------
# Search mode constants
# ---------------------------------------------------------------------------
SEARCH_MODE_AUTO = "auto"
SEARCH_MODE_EXACT = "exact"
SEARCH_MODE_KEYWORD = "keyword"
SEARCH_MODE_SEMANTIC = "semantic"
_VALID_SEARCH_MODES = frozenset(
    {SEARCH_MODE_AUTO, SEARCH_MODE_EXACT, SEARCH_MODE_KEYWORD, SEARCH_MODE_SEMANTIC}
)

# ---------------------------------------------------------------------------
# Precompiled regexes (shared by the search subsystem)
# ---------------------------------------------------------------------------
_WORD_SPLIT_PATTERN = re.compile(r"[a-z0-9]+")
_SPACE_NORMALIZE_PATTERN = re.compile(r"\s+")

# ---------------------------------------------------------------------------
# Token stop words
# ---------------------------------------------------------------------------
_TOKEN_STOP_WORDS = frozenset(
    {
        "the",
        "and",
        "for",
        "with",
        "from",
        "into",
        "about",
        "this",
        "that",
        "have",
        "has",
        "had",
        "are",
        "was",
        "were",
        "or",
        "but",
    }
)

# ---------------------------------------------------------------------------
# Synonym/term mapping groups
# ---------------------------------------------------------------------------
# Chinese synonym terms are machine-consumed match data (values must stay
# byte-identical), so they live in a JSON resource to keep the Python sources
# English-only.
_SEARCH_SYNONYM_GROUPS: tuple[tuple[str, ...], ...] = tuple(
    tuple(group)
    for group in json.loads((Path(__file__).with_name("_search_synonyms.json")).read_text(encoding="utf-8"))
)

# ---------------------------------------------------------------------------
# Highly ambiguous token set
# ---------------------------------------------------------------------------
_GENERIC_AMBIGUOUS_TOKENS = frozenset(
    {
        "competition",
        "competitor",
        "competitive",
        "market",
        "business",
        "strategy",
        "policy",
        "growth",
        "performance",
        "management",
        "risk",
        "compliance",
    }
)

# ---------------------------------------------------------------------------
# Intent keyword vocabulary
# ---------------------------------------------------------------------------
_INTENT_KEYWORDS: dict[str, frozenset[str]] = {
    "business_competition": frozenset(
        {
            "competitor",
            "competition",
            "competitive",
            "market",
            "marketshare",
            "share",
            "customer",
            "industry",
            "peer",
            "supplier",
            "product",
            "service",
            "lithography",
            "semiconductor",
        }
    ),
    "financial": frozenset(
        {
            "revenue",
            "income",
            "earnings",
            "cash",
            "margin",
            "asset",
            "liability",
            "equity",
            "guidance",
            "profit",
        }
    ),
    "governance": frozenset(
        {
            "board",
            "director",
            "governance",
            "compensation",
            "executive",
            "committee",
            "ethics",
            "compliance",
            "anti",
            "bribery",
        }
    ),
    "people": frozenset(
        {
            "employee",
            "talent",
            "hiring",
            "students",
            "competition",
            "league",
            "recruit",
            "workforce",
            "training",
            "employer",
        }
    ),
    "risk": frozenset(
        {
            "risk",
            "threat",
            "uncertainty",
            "vulnerability",
            "cybersecurity",
            "litigation",
            "exposure",
        }
    ),
}

# ---------------------------------------------------------------------------
# Intent noise/support context vocabulary
# ---------------------------------------------------------------------------
_NOISE_CONTEXT_TOKENS_BY_INTENT: dict[str, frozenset[str]] = {
    "business_competition": frozenset(
        {
            "antitrust",
            "compliance",
            "ethics",
            "students",
            "league",
            "robotics",
            "employer",
            "universum",
            "human",
            "rights",
        }
    ),
}

_SUPPORT_CONTEXT_TOKENS_BY_INTENT: dict[str, frozenset[str]] = {
    "business_competition": frozenset(
        {
            "market",
            "industry",
            "customer",
            "supplier",
            "peer",
            "product",
            "service",
            "technology",
            "lithography",
            "semiconductor",
        }
    ),
}


# ---------------------------------------------------------------------------
# Semantic bucket mapping (adaptive scheme)
# ---------------------------------------------------------------------------

# ── Topic → Bucket direct mapping ──────────────────────────────────
# SectionType.value → semantic bucket, covering the statutory Item semantic
# types across all SEC forms. To add a SectionType, just append one row here;
# no matching-logic changes are needed.
_TOPIC_TO_BUCKET: dict[str, str] = {
    # business domain: company overview, main business, operating environment
    "business": "business",
    "company_information": "business",
    "properties": "business",
    "operating_review": "business",
    # risk domain: risk factors, market risk, cybersecurity
    "risk_factors": "risk",
    "market_risk": "risk",
    "cybersecurity": "risk",
    # financial domain: financial reports, MD&A, quantitative disclosures
    "mda": "financial",
    "financial_statements": "financial",
    "financial_information": "financial",
    "selected_financial_data": "financial",
    "quantitative_disclosures": "financial",
    "key_information": "financial",
    # governance domain: governance, executive compensation, controls & procedures
    "directors": "governance",
    "governance": "governance",
    "executive_compensation": "governance",
    "security_ownership": "governance",
    "certain_relationships": "governance",
    "principal_accountant": "governance",
    "controls_procedures": "governance",
    # people domain: employees, human capital
    "directors_employees": "people",
    # legal domain: legal proceedings
    "legal_proceedings": "legal",
    # other domain: exhibits, signatures, mine safety, etc.
    "exhibits": "other",
    "signature": "other",
    "mine_safety": "other",
    "other_information": "other",
    "unresolved_staff_comments": "other",
    "offer_listing": "other",
    "additional_information": "other",
    "market_for_equity": "financial",
    "securities_description": "other",
    "defaults_arrearages": "other",
    "material_modifications": "other",
    "changes_disagreements": "other",
}

# ── Bucket keyword signals (fallback only) ───────────────────────────
# When the topic is not in _TOPIC_TO_BUCKET, score by keywords from
# title/path/item. Each bucket maps to a set of single-word keywords (set
# intersection matching); the hit count is the score.
# Take the highest-scoring bucket; return "other" when all are zero.
_BUCKET_KEYWORD_SIGNALS: dict[str, frozenset[str]] = {
    "business": frozenset(
        {
            "business",
            "operating",
            "market",
            "product",
            "service",
            "customer",
            "industry",
            "company",
            "overview",
            "operations",
        }
    ),
    "risk": frozenset(
        {
            "risk",
            "risks",
            "threat",
            "uncertainty",
            "cybersecurity",
        }
    ),
    "financial": frozenset(
        {
            "financial",
            "income",
            "revenue",
            "earnings",
            "assets",
            "liabilities",
            "equity",
            "cash",
            "mda",
            "discussion",
            "analysis",
            "quantitative",
        }
    ),
    "governance": frozenset(
        {
            "governance",
            "director",
            "directors",
            "compensation",
            "committee",
            "board",
            "audit",
            "shareholder",
            "ethics",
        }
    ),
    "people": frozenset(
        {
            "employee",
            "employees",
            "workforce",
            "personnel",
            "staff",
            "talent",
            "headcount",
        }
    ),
    "legal": frozenset(
        {
            "legal",
            "proceeding",
            "proceedings",
            "litigation",
            "lawsuit",
            "compliance",
        }
    ),
}

# ── Intent → expected bucket sets ──────────────────────────────────
# Preferred buckets per query intent; the intent-alignment score is 1.0 on a
# hit and 0.0 otherwise. To add an intent, just extend this table.
_EXPECTED_BUCKETS_BY_INTENT: dict[str, frozenset[str]] = {
    "business_competition": frozenset({"business", "risk", "financial"}),
    "financial": frozenset({"financial", "business"}),
    "governance": frozenset({"governance", "legal", "people"}),
    "people": frozenset({"people", "governance"}),
    "risk": frozenset({"risk", "legal", "business"}),
}


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class QueryDiagnosis:
    """Search query diagnosis result.

    Args:
        query: normalized query text.
        tokens: query token list.
        token_count: token count.
        ambiguity_score: query ambiguity score, in the range 0~1.
        is_high_ambiguity: whether the query is highly ambiguous.
        intent: query intent classification.
        allow_direct_token_fallback: whether direct token fallback is allowed.

    Returns:
        None.

    Raises:
        None.
    """

    query: str
    tokens: tuple[str, ...]
    token_count: int
    ambiguity_score: float
    is_high_ambiguity: bool
    intent: str
    allow_direct_token_fallback: bool


@dataclass(frozen=True)
class SectionSemanticProfile:
    """Section semantic profile.

    Args:
        section_ref: section ref.
        topic: section semantic topic.
        path: section semantic path.
        title: section title.
        item: section item.
        bucket: normalized semantic bucket.
        lexical_tokens: searchable tokens of the section.

    Returns:
        None.

    Raises:
        None.
    """

    section_ref: str
    topic: str
    path: str
    title: str
    item: str
    bucket: str
    lexical_tokens: tuple[str, ...]


@dataclass(frozen=True)
class SearchPlan:
    """Query execution plan.

    Args:
        run_exact: whether to run the exact phase.
        expansion_phases: expansion phase list; each phase holds multiple expansions.
        fallback_gated: whether token fallback gating is enabled.
        scoped_before_token: whether a semantic scoped pass runs before the token phase.

    Returns:
        None.

    Raises:
        None.
    """

    run_exact: bool
    expansion_phases: tuple[tuple[dict[str, str], ...], ...]
    fallback_gated: bool
    scoped_before_token: bool
