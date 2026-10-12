"""Semantic model definitions for tool output.

This module defines the semantically enriched data structures used uniformly
by the tool layer, including:
- Citation: unified citation/provenance object
- SectionSemantic: section-level semantic fields
- NumericContext: numeric context (unit/precision/period)
- SourceType / SectionType enums
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any, Optional


class SourceType(str, Enum):
    """Document source-type enum."""

    SEC_EDGAR = "SEC_EDGAR"
    """US-stock filing downloaded from SEC EDGAR."""

    UPLOADED = "UPLOADED"
    """User-uploaded filing (HK/A-share, etc.)."""

    SUPPLEMENTARY = "SUPPLEMENTARY"
    """Supplementary material (earnings call, presentation, etc.)."""


class SectionType(str, Enum):
    """SEC filing section semantic-type enum.

    Based on the statutory Item system of SEC Regulation S-K, covering common
    sections of 10-K, 10-Q, and 20-F. For non-SEC filings or unmappable
    sections the value is None (this enum is not used).
    """

    # -- Common to 10-K / 10-Q --
    BUSINESS = "business"
    RISK_FACTORS = "risk_factors"
    UNRESOLVED_STAFF_COMMENTS = "unresolved_staff_comments"
    CYBERSECURITY = "cybersecurity"
    PROPERTIES = "properties"
    LEGAL_PROCEEDINGS = "legal_proceedings"
    MINE_SAFETY = "mine_safety"
    MARKET_FOR_EQUITY = "market_for_equity"
    SELECTED_FINANCIAL_DATA = "selected_financial_data"
    MDA = "mda"
    """Management's Discussion and Analysis。"""
    QUANTITATIVE_DISCLOSURES = "quantitative_disclosures"
    FINANCIAL_STATEMENTS = "financial_statements"
    CHANGES_DISAGREEMENTS = "changes_disagreements"
    CONTROLS_PROCEDURES = "controls_procedures"
    OTHER_INFORMATION = "other_information"
    DIRECTORS = "directors"
    EXECUTIVE_COMPENSATION = "executive_compensation"
    SECURITY_OWNERSHIP = "security_ownership"
    CERTAIN_RELATIONSHIPS = "certain_relationships"
    PRINCIPAL_ACCOUNTANT = "principal_accountant"
    EXHIBITS = "exhibits"
    SIGNATURE = "signature"

    # -- 20-F specific --
    KEY_INFORMATION = "key_information"
    COMPANY_INFORMATION = "company_information"
    OPERATING_REVIEW = "operating_review"
    DIRECTORS_EMPLOYEES = "directors_employees"
    MAJOR_SHAREHOLDERS = "major_shareholders"
    FINANCIAL_INFORMATION = "financial_information"
    OFFER_LISTING = "offer_listing"
    ADDITIONAL_INFORMATION = "additional_information"
    MARKET_RISK = "market_risk"
    SECURITIES_DESCRIPTION = "securities_description"
    DEFAULTS_ARREARAGES = "defaults_arrearages"
    MATERIAL_MODIFICATIONS = "material_modifications"

    # -- Governance (16A-16J) --
    GOVERNANCE = "governance"


@dataclass(frozen=True)
class Citation:
    """Unified citation/provenance object.

    All fins tool outputs carry this object, letting the LLM generate precise
    source citations in the final report without extra document-metadata queries.

    Attributes:
        source_type: document source type.
        form_type: form type (e.g. "10-K"); None for non-filings.
        filing_date: filing date (ISO format); None for non-filings.
        accession_no: SEC accession number; populated only for US-stock filings.
        document_id: unique document identifier.
        ticker: ticker.
        fiscal_year: fiscal year.
        fiscal_period: fiscal period.
        item: section Item number (e.g. "Item 1A"); filled only by some tools.
        heading: section title (e.g. "Risk Factors"); filled only by some tools.
    """

    source_type: str
    document_id: str
    ticker: str
    form_type: Optional[str] = None
    filing_date: Optional[str] = None
    accession_no: Optional[str] = None
    fiscal_year: Optional[int] = None
    fiscal_period: Optional[str] = None
    item: Optional[str] = None
    heading: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to a serializable dict, removing None-valued keys.

        Returns:
            compact dict.
        """
        return {k: v for k, v in asdict(self).items() if v is not None}

    def with_section(
        self, *, item: Optional[str] = None, heading: Optional[str] = None
    ) -> "Citation":
        """Derive a Citation copy with section information attached.

        Args:
            item: section Item number.
            heading: section title.

        Returns:
            new Citation instance.
        """
        return Citation(
            source_type=self.source_type,
            document_id=self.document_id,
            ticker=self.ticker,
            form_type=self.form_type,
            filing_date=self.filing_date,
            accession_no=self.accession_no,
            fiscal_year=self.fiscal_year,
            fiscal_period=self.fiscal_period,
            item=item or self.item,
            heading=heading or self.heading,
        )


@dataclass(frozen=True)
class SectionSemantic:
    """Section-level semantic fields.

    Semantic enrichment of SectionSummary, injected by the service layer when returning.

    Attributes:
        item: Item number (e.g. "Item 1A"); None for non-SEC filings.
        item_title: canonical Item title (e.g. "Risk Factors").
        topic: section topic identifier (e.g. "risk_factors", "mda"), based on the SectionType enum values.
        path: hierarchical path (e.g. ["Part I", "Item 1A", "Risk Factors"]).
    """

    item: Optional[str] = None
    item_title: Optional[str] = None
    topic: Optional[str] = None
    path: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """Convert to a serializable dict.

        Returns:
            dict.
        """
        return asdict(self)


@dataclass(frozen=True)
class NumericContext:
    """Numeric context information.

    Provides unit/precision/period metadata for XBRL facts and financial
    statements, helping the LLM interpret numeric values correctly.

    Attributes:
        unit: unit (e.g. "USD", "shares").
        scale: magnitude (e.g. "thousands", "millions", "billions", "units").
        decimals: XBRL decimals precision value.
        period_type: period type ("instant" / "duration").
        period_start: period start date (ISO format).
        period_end: period end date (ISO format).
    """

    unit: Optional[str] = None
    scale: Optional[str] = None
    decimals: Optional[int] = None
    period_type: Optional[str] = None
    period_start: Optional[str] = None
    period_end: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to a serializable dict, removing None-valued keys.

        Returns:
            compact dict.
        """
        return {k: v for k, v in asdict(self).items() if v is not None}
