"""SEC Item semantic-mapping module.

This module maps SEC filing Item numbers to semantic types, covering:
- 10-K (Annual Report)
- 10-Q (Quarterly Report)
- 20-F (Foreign Private Issuer Annual Report)

The mapping is based on the statutory Item system of SEC Regulation S-K.
"""

from __future__ import annotations

import re
from typing import Optional

from scripts.vendor.filings.fins.domain.tool_models import SectionType

# ── Item-number extraction regex ──────────────────────────────
# Matches formats like "Item 1A. Risk Factors", "ITEM 7A — Quantitative...",
# "Item 1 Business", "Part I - Item 1A", etc., extracting the Item-number part.
# Note: no ^ anchor, so combined with re.search it supports the "Part X - Item Y" prefix format.
_ITEM_NUMBER_PATTERN = re.compile(r"(?i)\bitem\s+(16[A-J]|[1-9][0-9]?[A-C]?)\b")


# ── 10-K Item -> SectionType mapping ──────────────────────────
# Reference: SEC Form 10-K, Regulation S-K
_TEN_K_ITEM_MAP: dict[str, tuple[str, SectionType]] = {
    "1": ("Business", SectionType.BUSINESS),
    "1A": ("Risk Factors", SectionType.RISK_FACTORS),
    "1B": ("Unresolved Staff Comments", SectionType.UNRESOLVED_STAFF_COMMENTS),
    "1C": ("Cybersecurity", SectionType.CYBERSECURITY),
    "2": ("Properties", SectionType.PROPERTIES),
    "3": ("Legal Proceedings", SectionType.LEGAL_PROCEEDINGS),
    "4": ("Mine Safety Disclosures", SectionType.MINE_SAFETY),
    "5": ("Market for Registrant's Common Equity", SectionType.MARKET_FOR_EQUITY),
    "6": ("[Reserved]", SectionType.SELECTED_FINANCIAL_DATA),
    "7": ("Management's Discussion and Analysis", SectionType.MDA),
    "7A": (
        "Quantitative and Qualitative Disclosures About Market Risk",
        SectionType.QUANTITATIVE_DISCLOSURES,
    ),
    "8": ("Financial Statements and Supplementary Data", SectionType.FINANCIAL_STATEMENTS),
    "9": ("Changes in and Disagreements With Accountants", SectionType.CHANGES_DISAGREEMENTS),
    "9A": ("Controls and Procedures", SectionType.CONTROLS_PROCEDURES),
    "9B": ("Other Information", SectionType.OTHER_INFORMATION),
    "9C": ("Disclosure Regarding Foreign Jurisdictions", SectionType.OTHER_INFORMATION),
    "10": ("Directors, Executive Officers and Corporate Governance", SectionType.DIRECTORS),
    "11": ("Executive Compensation", SectionType.EXECUTIVE_COMPENSATION),
    "12": ("Security Ownership of Certain Beneficial Owners", SectionType.SECURITY_OWNERSHIP),
    "13": ("Certain Relationships and Related Transactions", SectionType.CERTAIN_RELATIONSHIPS),
    "14": ("Principal Accountant Fees and Services", SectionType.PRINCIPAL_ACCOUNTANT),
    "15": ("Exhibits and Financial Statement Schedules", SectionType.EXHIBITS),
}

# ── 10-K Part -> Item-range mapping ───────────────────────────
_TEN_K_PART_MAP: dict[str, str] = {
    "1": "I",
    "1A": "I",
    "1B": "I",
    "1C": "I",
    "2": "I",
    "3": "I",
    "4": "I",
    "5": "II",
    "6": "II",
    "7": "II",
    "7A": "II",
    "8": "II",
    "9": "II",
    "9A": "II",
    "9B": "II",
    "9C": "II",
    "10": "III",
    "11": "III",
    "12": "III",
    "13": "III",
    "14": "III",
    "15": "IV",
}


# ── 10-Q Item -> SectionType mapping ──────────────────────────
# Reference: SEC Form 10-Q, Regulation S-K
# 10-Q Item numbers overlap between Part I and Part II (e.g. Item 1, Item 2),
# so the Part must be distinguished when mapping.
_TEN_Q_PART_I_ITEM_MAP: dict[str, tuple[str, SectionType]] = {
    "1": ("Financial Statements", SectionType.FINANCIAL_STATEMENTS),
    "2": ("Management's Discussion and Analysis", SectionType.MDA),
    "3": (
        "Quantitative and Qualitative Disclosures About Market Risk",
        SectionType.QUANTITATIVE_DISCLOSURES,
    ),
    "4": ("Controls and Procedures", SectionType.CONTROLS_PROCEDURES),
}

_TEN_Q_PART_II_ITEM_MAP: dict[str, tuple[str, SectionType]] = {
    "1": ("Legal Proceedings", SectionType.LEGAL_PROCEEDINGS),
    "1A": ("Risk Factors", SectionType.RISK_FACTORS),
    "2": ("Unregistered Sales of Equity Securities", SectionType.OTHER_INFORMATION),
    "3": ("Defaults Upon Senior Securities", SectionType.OTHER_INFORMATION),
    "4": ("Mine Safety Disclosures", SectionType.MINE_SAFETY),
    "5": ("Other Information", SectionType.OTHER_INFORMATION),
    "6": ("Exhibits", SectionType.EXHIBITS),
}


# ── 20-F Item -> SectionType mapping ──────────────────────────
# Reference: SEC Form 20-F General Instructions
_TWENTY_F_ITEM_MAP: dict[str, tuple[str, SectionType]] = {
    "1": ("Identity of Directors, Senior Management and Advisers", SectionType.DIRECTORS),
    "2": ("Offer Statistics and Expected Timetable", SectionType.OFFER_LISTING),
    "3": ("Key Information", SectionType.KEY_INFORMATION),
    "4": ("Information on the Company", SectionType.COMPANY_INFORMATION),
    "4A": ("Unresolved Staff Comments", SectionType.UNRESOLVED_STAFF_COMMENTS),
    "5": ("Operating and Financial Review and Prospects", SectionType.OPERATING_REVIEW),
    "6": ("Directors, Senior Management and Employees", SectionType.DIRECTORS_EMPLOYEES),
    "7": ("Major Shareholders and Related Party Transactions", SectionType.MAJOR_SHAREHOLDERS),
    "8": ("Financial Information", SectionType.FINANCIAL_INFORMATION),
    "9": ("The Offer and Listing", SectionType.OFFER_LISTING),
    "10": ("Additional Information", SectionType.ADDITIONAL_INFORMATION),
    "11": ("Quantitative and Qualitative Disclosures About Market Risk", SectionType.MARKET_RISK),
    "12": (
        "Description of Securities Other Than Equity Securities",
        SectionType.SECURITIES_DESCRIPTION,
    ),
    "13": ("Defaults, Dividend Arrearages and Delinquencies", SectionType.DEFAULTS_ARREARAGES),
    "14": (
        "Material Modifications to the Rights of Security Holders",
        SectionType.MATERIAL_MODIFICATIONS,
    ),
    "15": ("Controls and Procedures", SectionType.CONTROLS_PROCEDURES),
    "16A": ("Audit Committee Financial Expert", SectionType.GOVERNANCE),
    "16B": ("Code of Ethics", SectionType.GOVERNANCE),
    "16C": ("Principal Accountant Fees and Services", SectionType.GOVERNANCE),
    "16D": ("Exemptions from the Listing Standards for Audit Committees", SectionType.GOVERNANCE),
    "16E": ("Purchases of Equity Securities by the Issuer", SectionType.GOVERNANCE),
    "16F": ("Change in Registrant's Certifying Accountant", SectionType.GOVERNANCE),
    "16G": ("Corporate Governance", SectionType.GOVERNANCE),
    "16H": ("Mine Safety Disclosure", SectionType.GOVERNANCE),
    "16I": ("Disclosure Regarding Foreign Jurisdictions", SectionType.GOVERNANCE),
    "16J": ("Insider Trading Policies", SectionType.GOVERNANCE),
    "17": ("Financial Statements", SectionType.FINANCIAL_STATEMENTS),
    "18": ("Financial Statements", SectionType.FINANCIAL_STATEMENTS),
    "19": ("Exhibits", SectionType.EXHIBITS),
}

# ── 20-F Part mapping (from twenty_f_processor.py) ────────────
_TWENTY_F_PART_MAP: dict[str, str] = {
    "1": "I",
    "2": "I",
    "3": "I",
    "4": "I",
    "4A": "I",
    "5": "II",
    "6": "II",
    "7": "II",
    "8": "II",
    "9": "II",
    "10": "II",
    "11": "II",
    "12": "II",
    "13": "III",
    "14": "III",
    "15": "III",
    "16": "III",
    "16A": "III",
    "16B": "III",
    "16C": "III",
    "16D": "III",
    "16E": "III",
    "16F": "III",
    "16G": "III",
    "16H": "III",
    "16I": "III",
    "16J": "III",
    "17": "IV",
    "18": "IV",
    "19": "IV",
}


# ── form-type -> mapping-table routing ────────────────────────
# Lets the unified entry function pick the correct mapping table by form_type.
_FORM_ITEM_MAPS: dict[str, dict[str, tuple[str, SectionType]]] = {
    "10-K": _TEN_K_ITEM_MAP,
    "10-K/A": _TEN_K_ITEM_MAP,
    "20-F": _TWENTY_F_ITEM_MAP,
    "20-F/A": _TWENTY_F_ITEM_MAP,
}

_FORM_PART_MAPS: dict[str, dict[str, str]] = {
    "10-K": _TEN_K_PART_MAP,
    "10-K/A": _TEN_K_PART_MAP,
    "20-F": _TWENTY_F_PART_MAP,
    "20-F/A": _TWENTY_F_PART_MAP,
}


def extract_item_number(title: Optional[str]) -> Optional[str]:
    """Extract the Item number from a section title.

    Args:
        title: section title text (e.g. "Item 1A. Risk Factors").

    Returns:
        Item number string (e.g. "1A"); None when it cannot be extracted.
    """
    if not title:
        return None
    # Use search rather than match, to support prefix formats like "Part I - Item 1A"
    m = _ITEM_NUMBER_PATTERN.search(title.strip())
    if m:
        return m.group(1).upper()
    return None


def resolve_section_semantic(
    *,
    title: Optional[str],
    form_type: Optional[str],
    parent_title: Optional[str] = None,
) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """Resolve the semantic information of a section.

    Based on the section title and form_type, resolves the Item number,
    canonical title, and semantic type.

    Args:
        title: section title.
        form_type: form type (e.g. "10-K").
        parent_title: parent section title (for 10-Q Part disambiguation).

    Returns:
        (item_number, canonical_title, topic_value) triple.
        None when any field cannot be determined.
    """
    item_number = extract_item_number(title)
    if item_number is None:
        # try to match the SIGNATURE section
        if title and re.search(r"(?i)\bsignatures?\b", title):
            return None, "Signatures", SectionType.SIGNATURE.value
        return None, None, None

    normalized_form = (form_type or "").strip().upper()

    # 10-Q special handling: the Item mapping must be disambiguated by Part
    # When parent_title is None (top-level section), try to extract Part info from the title itself
    if normalized_form in ("10-Q", "10-Q/A"):
        return _resolve_ten_q_semantic(item_number, parent_title or title)

    # 10-K / 20-F common path
    item_map = _FORM_ITEM_MAPS.get(normalized_form)
    if item_map is None:
        # unknown form_type; return only the item number
        return item_number, None, None

    entry = item_map.get(item_number)
    if entry is None:
        return item_number, None, None

    canonical_title, section_type = entry
    return item_number, canonical_title, section_type.value


def _resolve_ten_q_semantic(
    item_number: str,
    parent_title: Optional[str],
) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """Resolve the semantic information of a 10-Q section.

    10-Q Item numbers overlap between Part I and Part II, so the Part must be
    determined from the parent section title.

    Args:
        item_number: Item number (e.g. "1", "1A").
        parent_title: parent section title.

    Returns:
        (item_number, canonical_title, topic_value) triple.
    """
    part = _infer_ten_q_part(parent_title)

    if part == "II":
        entry = _TEN_Q_PART_II_ITEM_MAP.get(item_number)
    elif part == "I":
        entry = _TEN_Q_PART_I_ITEM_MAP.get(item_number)
    else:
        # when the Part is uncertain, try Part I first (high-frequency sections), then fall back to Part II
        entry = _TEN_Q_PART_I_ITEM_MAP.get(item_number) or _TEN_Q_PART_II_ITEM_MAP.get(item_number)

    if entry is None:
        return item_number, None, None

    canonical_title, section_type = entry
    return item_number, canonical_title, section_type.value


def _infer_ten_q_part(parent_title: Optional[str]) -> Optional[str]:
    """Infer the 10-Q Part number from the parent section title.

    Args:
        parent_title: parent section title.

    Returns:
        "I" / "II" / None.
    """
    if not parent_title:
        return None
    upper = parent_title.upper().strip()
    # Match "Part I" (but not "Part II")
    if re.search(r"\bPART\s+I\b(?!\s*I)", upper):
        return "I"
    if re.search(r"\bPART\s+II\b", upper):
        return "II"
    return None


def build_section_path(
    *,
    form_type: Optional[str],
    item_number: Optional[str],
    canonical_title: Optional[str],
    section_title: Optional[str],
    parent_titles: list[str],
) -> list[str]:
    """Build the hierarchical path of a section.

    The path runs from root to leaf, including the Part prefix (if any),
    the Item number, and the section title.

    Args:
        form_type: form type.
        item_number: Item number.
        canonical_title: canonical title.
        section_title: raw section title.
        parent_titles: all ancestor section titles (direct parent first, up to the root).

    Returns:
        hierarchical path list (e.g. ["Part I", "Item 1A", "Risk Factors"]).
    """
    path: list[str] = []

    # Add the Part prefix
    if item_number and form_type:
        normalized_form = (form_type or "").strip().upper()
        part_map = _FORM_PART_MAPS.get(normalized_form)
        if part_map:
            part = part_map.get(item_number)
            if part:
                path.append(f"Part {part}")

    # Add parent section titles (reverse order -> forward order)
    for pt in reversed(parent_titles):
        # skip parent headings already represented by a Part
        if pt and not re.match(r"(?i)^\s*part\s+", pt):
            path.append(pt)

    # Add the Item identifier
    if item_number:
        path.append(f"Item {item_number}")

    # Add the title
    display_title = canonical_title or section_title
    if display_title:
        # avoid duplication: skip when the last path item already carries the title information
        if not path or display_title not in path[-1]:
            path.append(display_title)

    return path
