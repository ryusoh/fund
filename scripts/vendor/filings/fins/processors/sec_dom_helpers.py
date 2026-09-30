"""SEC document DOM/HTML parsing utility functions.

Extracts structured information such as plain text and table preceding context
from raw HTML, for use by SecProcessor and the table-building pipeline.
"""

from __future__ import annotations

from typing import Any, Optional

from bs4 import BeautifulSoup, Comment, Tag
from bs4.element import NavigableString

from scripts.vendor.filings.engine.processors.text_utils import (
    PREVIEW_MAX_CHARS as _PREVIEW_MAX_CHARS,
)
from scripts.vendor.filings.engine.processors.text_utils import (
    normalize_whitespace as _normalize_whitespace,
)

_HEADING_TAGS = ("h1", "h2", "h3", "h4", "h5", "h6")
_HIDDEN_STYLE_TOKENS = ("display:none", "visibility:hidden")
_CONTEXT_NOISE_TAGS = {"style", "script", "head", "title", "meta", "link", "noscript", "template"}


def _extract_text_from_raw_html(html_content: str) -> str:
    """Extract plain text from raw HTML, as a fallback when edgartools ``document.text()`` fails.

    Parses the HTML with BeautifulSoup, with dedicated cleanup for iXBRL filings:
    - removes ``<ix:header>`` / ``<ix:hidden>`` (which hold XBRL context
      definitions and can reach hundreds of KB)
    - removes ``display:none`` hidden blocks (usually wrapping the XBRL header)
    - removes non-content nodes such as script/style/noscript

    This method does not rely on edgartools section detection; it only extracts text.

    Args:
        html_content: raw HTML string.

    Returns:
        extracted plain text; empty string on parse failure.
    """

    if not html_content:
        return ""
    try:
        import re as _re
        import warnings

        from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning

        warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

        soup = BeautifulSoup(html_content, "lxml")
        # remove iXBRL header/hidden blocks (they hold xbrli:context/unit definitions and produce heavy noise text)
        for tag in soup.find_all(_re.compile(r"^ix:(header|hidden)$")):
            tag.decompose()
        # remove display:none hidden elements (usually wrapping XBRL data blocks)
        for tag in soup.find_all(style=_re.compile(r"display:\s*none", _re.IGNORECASE)):
            tag.decompose()
        # remove non-content nodes such as script/style/noscript
        for tag in soup.find_all(["script", "style", "noscript"]):
            tag.decompose()
        return soup.get_text(separator=" ", strip=True)
    except Exception:
        return ""


def _extract_dom_table_contexts(
    html_content: str, max_chars: int = _PREVIEW_MAX_CHARS
) -> list[str]:
    """Extract each table's preceding context in DOM order.

    Args:
        html_content: raw HTML text.
        max_chars: maximum preceding-context length per table.

    Returns:
        preceding-context list in DOM table order.

    Raises:
        RuntimeError: raised when parsing fails.
    """

    soup = BeautifulSoup(html_content, "html.parser")
    root = soup.body if soup.body else soup
    all_tables = root.find_all("table")
    # Pre-build the set of table tag ids for O(1) table-containment checks,
    # avoiding per-node find_parent("table") calls that cost O(depth).
    table_tag_ids: frozenset[int] = frozenset(id(t) for t in all_tables)
    contexts: list[str] = []
    for table_tag in all_tables:
        contexts.append(
            _extract_dom_context_before(
                table_tag=table_tag,
                max_chars=max_chars,
                table_tag_ids=table_tag_ids,
            )
        )
    return contexts


def _extract_dom_context_before(
    table_tag: Tag,
    max_chars: int = _PREVIEW_MAX_CHARS,
    table_tag_ids: Optional[frozenset[int]] = None,
) -> str:
    """Extract the preceding context of a single table in the DOM.

    Args:
        table_tag: table node.
        max_chars: maximum length.
        table_tag_ids: optional set of table tag ids, for O(1) table-containment checks.

    Returns:
        preceding-context string.

    Raises:
        RuntimeError: raised when extraction fails.
    """

    text_parts: list[str] = []
    total_len = 0
    for node in table_tag.previous_elements:
        if node == table_tag:
            continue
        if _is_noise_context_node(node):
            continue
        if isinstance(node, Tag):
            tag_name = str(node.name or "").lower()
            if tag_name in _HEADING_TAGS:
                break
            if tag_name == "table":
                break
            if _is_hidden_tag(node):
                continue
        if _is_within_table(node, table_tag_ids=table_tag_ids):
            continue
        if isinstance(node, NavigableString):
            text = _normalize_whitespace(str(node))
            if not text:
                continue
            text_parts.append(text)
            total_len += len(text)
            if total_len >= max_chars:
                break
    if not text_parts:
        return ""
    text_parts.reverse()
    full_text = " ".join(text_parts)
    if len(full_text) > max_chars:
        return full_text[-max_chars:]
    return full_text


def _is_noise_context_node(node: Any) -> bool:
    """Judge whether a node is context noise.

    Noise includes text inside style/script/head tags and HTML comment content.

    Args:
        node: BeautifulSoup node.

    Returns:
        whether it should be ignored during context extraction.

    Raises:
        RuntimeError: raised when the check fails.
    """

    if isinstance(node, Comment):
        return True
    if isinstance(node, Tag):
        return str(node.name or "").lower() in _CONTEXT_NOISE_TAGS
    if isinstance(node, NavigableString):
        parent = node.parent
        if isinstance(parent, Tag):
            return str(parent.name or "").lower() in _CONTEXT_NOISE_TAGS
    return False


def _is_within_table(node: Any, *, table_tag_ids: Optional[frozenset[int]] = None) -> bool:
    """Judge whether a node is inside a table.

    If ``table_tag_ids`` is provided, an O(1) set lookup replaces the
    O(depth) ``find_parent("table")`` search.

    Args:
        node: BeautifulSoup node.
        table_tag_ids: optional set of table tag ids.

    Returns:
        whether it is inside a table.

    Raises:
        RuntimeError: raised when the check fails.
    """

    if table_tag_ids is not None:
        return _is_within_table_fast(node, table_tag_ids)
    if isinstance(node, Tag):
        return node.find_parent("table") is not None or str(node.name).lower() == "table"
    if isinstance(node, NavigableString):
        parent = node.parent
        if isinstance(parent, Tag):
            return parent.find_parent("table") is not None or str(parent.name).lower() == "table"
    return False


def _is_within_table_fast(node: Any, table_tag_ids: frozenset[int]) -> bool:
    """O(1) set-lookup check for whether a node is inside a table.

    Walks up the parent chain and checks whether any ancestor's ``id()`` is in
    ``table_tag_ids``.

    Args:
        node: BeautifulSoup node.
        table_tag_ids: set of table tag ids.

    Returns:
        whether it is inside a table.

    Raises:
        RuntimeError: raised when the check fails.
    """

    # For a Tag node that is itself a table, decide directly
    if isinstance(node, Tag) and str(node.name or "").lower() == "table":
        return True
    # Walk up the parent chain, doing O(1) lookups in the table_tag_ids set
    current = node.parent if isinstance(node, NavigableString) else node
    while current is not None:
        if isinstance(current, Tag):
            if id(current) in table_tag_ids:
                return True
        current = getattr(current, "parent", None)
    return False


def _is_hidden_tag(tag: Tag) -> bool:
    """Judge whether a tag is a hidden node.

    Args:
        tag: tag node.

    Returns:
        whether it is hidden.

    Raises:
        RuntimeError: raised when the check fails.
    """

    style = str(tag.get("style", "")).replace(" ", "").lower()
    if any(token in style for token in _HIDDEN_STYLE_TOKENS):
        return True
    aria_hidden = str(tag.get("aria-hidden", "")).strip().lower()
    if aria_hidden == "true":
        return True
    hidden_attr = tag.get("hidden")
    return hidden_attr is not None
