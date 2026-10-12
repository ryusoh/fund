"""Single source of truth for ticker normalization.

This module provides unified normalization logic mapping common variants of
HK/Shanghai/Shenzhen/US tickers to their canonical form.

Design notes:
- Only ``NormalizedTicker`` and ``normalize_ticker`` / ``try_normalize_ticker``
  / ``ticker_to_company_id`` are exposed as the public API; everything else is
  a module-level private helper.
- Canonical form: HK stocks are zero-padded to 4 digits (``0700``) or keep
  their original 5 digits (``89988``); Shanghai stocks are 6 digits
  (``600519``); Shenzhen stocks are 6 digits (``000333`` / ``300750``); US
  stocks keep letters and unify the class-share separator to a dash
  (``AAPL``, ``BRK-B``).
- For US stocks without an explicit exchange suffix, ``exchange`` returns
  ``None``; NYSE/NASDAQ are not distinguished at present.
- Unrecognized input: ``normalize_ticker`` raises ``ValueError``;
  ``try_normalize_ticker`` returns ``None``.
- When market prefix/suffix recognition misfires (e.g. ``SHEL`` mis-split as
  ``SH`` + ``EL``), it falls back to whole-string adaptive classification so
  that valid US tickers are not misjudged as invalid Shanghai tickers.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Final, Literal, Optional

Market = Literal["US", "HK", "CN"]
Exchange = Literal["HKEX", "SSE", "SZSE"]


@dataclass(frozen=True)
class NormalizedTicker:
    """Normalized ticker result.

    Attributes:
        canonical: canonical bare code; pure digits for HK/Shanghai/Shenzhen,
            letters kept for US stocks (may contain
            a ``-`` separator, e.g. ``BRK-B``).
        market: market identifier; one of ``"US"`` / ``"HK"`` / ``"CN"``.
        exchange: exchange identifier; ``"HKEX"`` for HK, ``"SSE"`` for Shanghai, ``"SZSE"`` for Shenzhen;
            ``None`` for US stocks without a suffix.
        raw: raw input (not uppercased, not stripped), for logs and diagnostics.
    """

    canonical: str
    market: Market
    exchange: Optional[Exchange]
    raw: str


# ---- Market prefix/suffix recognition constants (used only within this module) ----
# Prefixes look like ``HK.00700`` / ``SH:600519`` / ``NASDAQ-AAPL``; the separator is optional.
# Single-character exchange suffixes (``N``/``O``) are not treated as prefixes, so that
# names like ``OPEN`` are not mis-split as ``O`` + ``PEN``.
_HK_TOKENS: Final[frozenset[str]] = frozenset({"HK", "HKEX"})
_SH_TOKENS: Final[frozenset[str]] = frozenset({"SH", "SS", "SSE"})
_SZ_TOKENS: Final[frozenset[str]] = frozenset({"SZ", "SZSE"})
_US_TOKENS: Final[frozenset[str]] = frozenset({"US", "N", "O", "OQ", "PK", "NASDAQ", "NYSE"})

_PREFIX_PATTERN: Final[re.Pattern[str]] = re.compile(
    r"^(HKEX|HK|SSE|SH|SS|SZSE|SZ|NASDAQ|NYSE|US)[.:\-_]?(.+)$"
)
# Suffix with separator: all tokens supported (including single-letter N/O).
_SUFFIX_WITH_SEP_PATTERN: Final[re.Pattern[str]] = re.compile(
    r"^(.+?)[.\-_](HKEX|HK|SSE|SH|SS|SZSE|SZ|NASDAQ|NYSE|OQ|PK|US|N|O)$"
)
# Suffix without separator: only multi-character tokens are recognized. N/O are
# excluded so that alphabetic US stocks like ``ALVO``/``NVO`` are not split
# into ``ALV``+``O``.
_SUFFIX_NO_SEP_PATTERN: Final[re.Pattern[str]] = re.compile(
    r"^(.+?)(HKEX|HK|SSE|SH|SS|SZSE|SZ|NASDAQ|NYSE|OQ|PK|US)$"
)
_US_SYMBOL_PATTERN: Final[re.Pattern[str]] = re.compile(r"^[A-Z]+(?:-[A-Z0-9]+|[.][A-Z])?$")
# Maximum literal length of a US ticker symbol.
#
# Design intent: a defensive input whitelist, **not** a business constraint on
# what constitutes a valid ticker.
# - The longest currently listed common-stock ticker on NYSE/NASDAQ/AMEX is 5
#   letters (e.g. ``GOOGL``); one-segment class shares like ``BRK-B`` also stay
#   within 5 characters.
# - The limit is set to 8 to accommodate possible prefix variants (e.g. the
#   ``XXXXY`` Pink Sheet code on OTC, temporary merger warrants like ``XXXXW``)
#   with a little headroom.
#
# Over-long input is filtered to ``None`` by ``_build_us``, entering the
# market-adaptive failure path outside ``_classify_pure_digits``, and
# ``normalize_ticker`` ultimately raises ``ValueError``.
# If a valid ticker with a literal length above this limit ever appears, adjust
# this constant and document the change here — **do not** bypass this check.
_MAX_US_SYMBOL_LENGTH: Final[int] = 8


def normalize_ticker(raw: str) -> NormalizedTicker:
    """Normalize common ticker variants into canonical form.

    Supported (examples covered, not exhaustive):

    - HK: ``0700`` / ``700`` / ``00700`` / ``0700.HK`` / ``700.HK`` /
      ``HK.00700`` / ``HK:0700`` / ``0700HK`` / ``89988`` →
      canonical=``0700`` or ``89988``, market=``HK``, exchange=``HKEX``.
    - Shanghai: ``600519`` / ``600519.SH`` / ``600519.SS`` / ``SH.600519`` /
      ``sh600519`` -> canonical=same value, market=``CN``, exchange=``SSE``.
    - Shenzhen: ``000333`` / ``300750`` / ``000333.SZ`` / ``SZ.000333`` /
      ``sz000333`` -> canonical=same value, market=``CN``, exchange=``SZSE``.
    - US: ``AAPL`` / ``AAPL.US`` / ``AAPL.O`` / ``US.AAPL`` / ``BRK.B`` /
      ``BRK-A`` / ``BF.B`` / ``SHEL`` / ``SHOP`` -> canonical keeps the letter form and
      class separators unified to dashes, market=``US``, exchange=``None``.

    Args:
        raw: raw input string.

    Returns:
        ``NormalizedTicker``.

    Raises:
        ValueError: raised when the input is empty or cannot be recognized as a
            ticker form of any supported market.
    """

    text = unicodedata.normalize("NFKC", raw).strip()
    if not text:
        raise ValueError("ticker must not be empty")
    upper = text.upper()

    # First try to strip prefix/suffix by market hint; when construction fails,
    # fall back to whole-string adaptive classification so that US stocks starting
    # with letters, like ``SHEL``/``SHOP``, are not treated as invalid Shanghai tickers.
    body, market_token = _split_market_token(upper)
    if market_token is not None:
        hinted = _build_by_token(body=body, token=market_token, raw=raw)
        if hinted is not None:
            return hinted
    auto = _build_auto(upper=upper, raw=raw)
    if auto is not None:
        return auto
    raise ValueError(f"unrecognized ticker form: {raw!r}")


def try_normalize_ticker(raw: str) -> Optional[NormalizedTicker]:
    """Non-raising version of ``normalize_ticker``.

    Used by the service-layer "ticker might be a company name" branch: when
    recognition fails, the caller falls back to a company-alias lookup instead
    of erroring out.

    Args:
        raw: raw input.

    Returns:
        ``NormalizedTicker``; returns ``None`` when the input is not a string,
        is empty, or cannot be recognized.

    Raises:
        None.
    """

    try:
        return normalize_ticker(raw)
    except (TypeError, ValueError):
        return None


def ticker_to_company_id(ticker: NormalizedTicker) -> str:
    """Derive the company ID from a ``NormalizedTicker``.

    The current implementation returns ``{ticker.canonical}_{exchange_or_market}``, e.g.
    ``600519_SSE`` / ``000333_SZSE`` / ``0700_HKEX`` / ``AAPL_US``.
    This interface is kept so that a finer-grained company-entity mapping can be
    plugged in later (cross-market listing folding, CIK, unified social credit
    codes, etc.); it is a stable contract whose implementation may evolve.

    Args:
        ticker: normalized ticker.

    Returns:
        company ID string.

    Raises:
        None.
    """

    exchange_or_market = ticker.exchange or ticker.market
    return f"{ticker.canonical}_{exchange_or_market}"


# ---------- Module-level private helpers ----------


def _split_market_token(upper: str) -> tuple[str, Optional[str]]:
    """Try to strip the market prefix/suffix from a ticker.

    Args:
        upper: ticker text after ``upper()``.

    Returns:
        ``(body, market_token)``; when no market token matches, ``market_token``
        is ``None`` and ``body`` is the whole ``upper`` string.

    Raises:
        None.
    """

    prefix_match = _PREFIX_PATTERN.match(upper)
    if prefix_match is not None:
        return prefix_match.group(2), prefix_match.group(1)
    suffix_match = _SUFFIX_WITH_SEP_PATTERN.match(upper)
    if suffix_match is not None:
        return suffix_match.group(1), suffix_match.group(2)
    suffix_match = _SUFFIX_NO_SEP_PATTERN.match(upper)
    if suffix_match is not None:
        return suffix_match.group(1), suffix_match.group(2)
    return upper, None


def _build_by_token(*, body: str, token: str, raw: str) -> Optional[NormalizedTicker]:
    """Build a ``NormalizedTicker`` from a market hint.

    Args:
        body: body string after stripping the market token.
        token: recognized market identifier.
        raw: raw input.

    Returns:
        successfully constructed ``NormalizedTicker``; ``None`` when the format does not match the hint,
        upper layers fall back to adaptive judgment based on this.

    Raises:
        None.
    """

    if token in _HK_TOKENS:
        return _build_hk(body, raw)
    if token in _SH_TOKENS:
        return _build_sh(body, raw)
    if token in _SZ_TOKENS:
        return _build_sz(body, raw)
    if token in _US_TOKENS:
        return _build_us(body, raw)
    return None


def _build_auto(*, upper: str, raw: str) -> Optional[NormalizedTicker]:
    """Adaptive classification when there is no market hint.

    Args:
        upper: ticker text after ``upper()``.
        raw: raw input.

    Returns:
        successfully recognized ``NormalizedTicker``; ``None`` on failure.

    Raises:
        None.
    """

    if upper.isdigit():
        return _classify_pure_digits(upper, raw)
    return _build_us(upper, raw)


def _classify_pure_digits(body: str, raw: str) -> Optional[NormalizedTicker]:
    """Market classification for pure digits without a market hint.

    Args:
        body: pure-digit body.
        raw: raw input.

    Returns:
        successfully recognized ``NormalizedTicker``; ``None`` on failure.

    Raises:
        None.
    """

    length = len(body)
    if 1 <= length <= 5:
        return _build_hk(body, raw)
    if length == 6:
        head = body[0]
        if head == "6":
            return NormalizedTicker(canonical=body, market="CN", exchange="SSE", raw=raw)
        if head in ("0", "3"):
            return NormalizedTicker(canonical=body, market="CN", exchange="SZSE", raw=raw)
    return None


def _build_hk(body: str, raw: str) -> Optional[NormalizedTicker]:
    """Build an HK ``NormalizedTicker``.

    Rules:
    - The body must be pure digits.
    - After stripping leading zeros the length must be between 1 and 5
      (covering the classic 4-digit codes and the newer 5-digit ones like ``89988``).
    - When the length is ≤ 4, zero-pad to 4 digits; when the length is 5, keep as-is.

    Args:
        body: ticker body.
        raw: raw input.

    Returns:
        HK ``NormalizedTicker``; ``None`` for invalid formats.

    Raises:
        None.
    """

    if not body.isdigit():
        return None
    stripped = body.lstrip("0") or "0"
    length = len(stripped)
    if length > 5:
        return None
    canonical = stripped.zfill(4) if length <= 4 else stripped
    return NormalizedTicker(canonical=canonical, market="HK", exchange="HKEX", raw=raw)


def _build_sh(body: str, raw: str) -> Optional[NormalizedTicker]:
    """Build a Shanghai-stock ``NormalizedTicker``.

    Rules: the body must be 6 pure digits with a leading ``6`` (main board
    ``60xxxx``, STAR market ``68xxxx``).

    Args:
        body: ticker body.
        raw: raw input.

    Returns:
        Shanghai ``NormalizedTicker``; ``None`` for invalid formats.

    Raises:
        None.
    """

    if not body.isdigit() or len(body) != 6 or body[0] != "6":
        return None
    return NormalizedTicker(canonical=body, market="CN", exchange="SSE", raw=raw)


def _build_sz(body: str, raw: str) -> Optional[NormalizedTicker]:
    """Build a Shenzhen-stock ``NormalizedTicker``.

    Rules: the body must be 6 pure digits with a leading ``0`` (main board /
    SME board) or ``3`` (ChiNext).

    Args:
        body: ticker body.
        raw: raw input.

    Returns:
        Shenzhen ``NormalizedTicker``; ``None`` for invalid formats.

    Raises:
        None.
    """

    if not body.isdigit() or len(body) != 6 or body[0] not in ("0", "3"):
        return None
    return NormalizedTicker(canonical=body, market="CN", exchange="SZSE", raw=raw)


def _build_us(body: str, raw: str) -> Optional[NormalizedTicker]:
    """Build a US ``NormalizedTicker``.

    Rules: first character is a letter; contains only ``A-Z`` and an optional
    class segment (e.g. ``BRK.B`` / ``BRK-B``); length does not exceed
    ``_MAX_US_SYMBOL_LENGTH``; a dot-separated segment accepts only a
    single-letter class so that foreign-exchange aliases like ``AAPL.SW`` are
    not misrecognized as US class shares.

    Args:
        body: ticker body.
        raw: raw input.

    Returns:
        US ``NormalizedTicker``; ``None`` for invalid formats.

    Raises:
        None.
    """

    if not body or len(body) > _MAX_US_SYMBOL_LENGTH:
        return None
    if _US_SYMBOL_PATTERN.fullmatch(body) is None:
        return None
    return NormalizedTicker(canonical=body.replace(".", "-"), market="US", exchange=None, raw=raw)
