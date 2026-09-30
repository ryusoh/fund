"""Financial-report domain model definitions.

This module centrally defines the data objects shared by the storage layer and
the pipeline layer, including:
- batch transaction tokens
- company-level metadata
- document CRUD request objects
- document query objects and summary objects
- manifest item objects

Notes:
- These models are used in method signatures of the financial-report storage narrow protocols and the concrete filesystem storage implementations.
- All objects are dataclasses, which eases type checking, testing, and serialization.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal, Optional

DocumentMeta = dict[str, Any]
"""Document metadata dict type alias."""


@dataclass(frozen=True)
class FileObjectMeta:
    """File-object metadata."""

    uri: str
    etag: Optional[str] = None
    last_modified: Optional[str] = None
    size: Optional[int] = None
    content_type: Optional[str] = None
    sha256: Optional[str] = None


@dataclass(frozen=True)
class SourceFileEntry:
    """Source-document file entry.

    This model corresponds to a `files[]` entry in `filings/*/meta.json`,
    expressing file-level metadata without relying on loose dicts.
    """

    name: str
    uri: str
    etag: Optional[str] = None
    last_modified: Optional[str] = None
    size: Optional[int] = None
    content_type: Optional[str] = None
    sha256: Optional[str] = None
    source_url: Optional[str] = None
    http_etag: Optional[str] = None
    http_last_modified: Optional[str] = None
    ingested_at: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        """Convert an entry to a serializable dict.

        Args:
            None.

        Returns:
            JSON-serializable dict.

        Raises:
            None.
        """

        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "SourceFileEntry":
        """Build a source-document file entry from a dict.

        Args:
            data: raw dict.

        Returns:
            `SourceFileEntry` instance.

        Raises:
            KeyError: raised when a required field is missing.
            ValueError: raised when a required field is empty.
        """

        name = str(data["name"]).strip()
        uri = str(data["uri"]).strip()
        if not name:
            raise ValueError("SourceFileEntry.name must not be empty")
        if not uri:
            raise ValueError("SourceFileEntry.uri must not be empty")
        raw_size = data.get("size")
        size = int(raw_size) if isinstance(raw_size, int) else None
        return cls(
            name=name,
            uri=uri,
            etag=_optional_str(data.get("etag")),
            last_modified=_optional_str(data.get("last_modified")),
            size=size,
            content_type=_optional_str(data.get("content_type")),
            sha256=_optional_str(data.get("sha256")),
            source_url=_optional_str(data.get("source_url")),
            http_etag=_optional_str(data.get("http_etag")),
            http_last_modified=_optional_str(data.get("http_last_modified")),
            ingested_at=_optional_str(data.get("ingested_at")),
        )


@dataclass(frozen=True)
class DocumentEntry:
    """Direct child entry of a document directory."""

    name: str
    is_file: bool


@dataclass(frozen=True)
class BatchToken:
    """Batch transaction token.

    Attributes:
        token_id: unique batch identifier.
        ticker: corresponding ticker.
        target_ticker_dir: canonical `portfolio/{ticker}` directory.
        staging_root_dir: batch staging root directory.
        staging_ticker_dir: batch staging directory.
        backup_dir: backup directory for the commit phase.
        journal_path: transaction journal path.
        ticker_lock_path: ticker transaction lock path.
        created_at: token creation time (ISO8601).
    """

    token_id: str
    ticker: str
    target_ticker_dir: Path
    staging_root_dir: Path
    staging_ticker_dir: Path
    backup_dir: Path
    journal_path: Path
    ticker_lock_path: Path
    created_at: str


@dataclass(frozen=True)
class CompanyMeta:
    """Company-level metadata model."""

    company_id: str
    company_name: str
    ticker: str
    market: str
    resolver_version: str
    updated_at: str
    ticker_aliases: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """Convert an object to a dict.

        Args:
            None.

        Returns:
            serializable dict.

        Raises:
            None.
        """

        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "CompanyMeta":
        """Build a `CompanyMeta` from a dict.

        Args:
            data: raw dict data.

        Returns:
            `CompanyMeta` instance.

        Raises:
            KeyError: raised when a required field is missing.
        """

        raw_ticker_aliases = data.get("ticker_aliases")
        ticker_aliases = raw_ticker_aliases if isinstance(raw_ticker_aliases, list) else []
        return cls(
            company_id=str(data["company_id"]),
            company_name=str(data["company_name"]),
            ticker=str(data["ticker"]),
            ticker_aliases=[str(item).strip() for item in ticker_aliases if str(item).strip()],
            market=str(data["market"]),
            resolver_version=str(data["resolver_version"]),
            updated_at=str(data["updated_at"]),
        )


CompanyMetaInventoryStatus = Literal[
    "available",
    "hidden_directory",
    "missing_meta",
    "invalid_meta",
]
"""Company directory scan status."""


@dataclass(frozen=True)
class CompanyMetaInventoryEntry:
    """Company directory scan result.

    Attributes:
        directory_name: company directory name.
        status: scan status.
        company_meta: company metadata when the status is ``available``.
        detail: additional note or error message.
    """

    directory_name: str
    status: CompanyMetaInventoryStatus
    company_meta: Optional[CompanyMeta] = None
    detail: str = ""


@dataclass(frozen=True)
class DocumentHandle:
    """Document handle."""

    ticker: str
    document_id: str
    form_type: Optional[str] = None
    primary_file_uri: Optional[str] = None
    file_uris: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class SourceHandle:
    """Source-document handle."""

    ticker: str
    document_id: str
    source_kind: str


@dataclass(frozen=True)
class ProcessedHandle:
    """Processed-artifact handle."""

    ticker: str
    document_id: str


@dataclass(frozen=True)
class SourceDocumentUpsertRequest:
    """Base class for source-document (filings/materials) write requests."""

    ticker: str
    document_id: str
    internal_document_id: str
    form_type: Optional[str] = None
    primary_document: Optional[str] = None
    meta: dict[str, Any] = field(default_factory=dict)
    files: list[FileObjectMeta] = field(default_factory=list)
    file_entries: Optional[list[dict[str, Any]]] = None


@dataclass(frozen=True)
class SourceDocumentStateChangeRequest:
    """Source-document state-change request.

    Unifies the logical delete and restore operations for filings / materials,
    so the public storage protocols stop exposing paired, duplicated
    filing/material methods.
    """

    ticker: str
    document_id: str
    source_kind: str


@dataclass(frozen=True)
class MaterialCreateRequest(SourceDocumentUpsertRequest):
    """Material creation request."""


@dataclass(frozen=True)
class MaterialUpdateRequest(SourceDocumentUpsertRequest):
    """Material update request."""


@dataclass(frozen=True)
class MaterialDeleteRequest:
    """Material deletion request."""

    ticker: str
    document_id: str


@dataclass(frozen=True)
class MaterialRestoreRequest:
    """Material restore request."""

    ticker: str
    document_id: str


@dataclass(frozen=True)
class FilingCreateRequest(SourceDocumentUpsertRequest):
    """Filing creation request."""


@dataclass(frozen=True)
class FilingUpdateRequest(SourceDocumentUpsertRequest):
    """Filing update request."""


@dataclass(frozen=True)
class RejectedFilingArtifactUpsertRequest:
    """rejected filing artifact write request.

    This request persists a policy-rejected filing to `.rejections/` in its
    complete source-artifact form, without entering the active filings manifest.
    """

    ticker: str
    document_id: str
    internal_document_id: str
    accession_number: str
    company_id: str
    form_type: str
    filing_date: str
    report_date: Optional[str]
    primary_document: str
    selected_primary_document: str
    rejection_reason: str
    rejection_category: str
    classification_version: str
    source_fingerprint: str
    files: list[SourceFileEntry] = field(default_factory=list)
    fiscal_year: Optional[int] = None
    fiscal_period: Optional[str] = None
    report_kind: Optional[str] = None
    amended: bool = False
    has_xbrl: Optional[bool] = None
    ingest_method: str = "download"


@dataclass(frozen=True)
class RejectedFilingArtifact:
    """rejected filing artifact read result."""

    ticker: str
    document_id: str
    internal_document_id: str
    accession_number: str
    company_id: str
    form_type: str
    filing_date: str
    report_date: Optional[str]
    primary_document: str
    selected_primary_document: str
    rejection_reason: str
    rejection_category: str
    classification_version: str
    source_fingerprint: str
    files: list[SourceFileEntry] = field(default_factory=list)
    fiscal_year: Optional[int] = None
    fiscal_period: Optional[str] = None
    report_kind: Optional[str] = None
    amended: bool = False
    has_xbrl: Optional[bool] = None
    ingest_method: str = "download"
    rejected_at: str = ""
    created_at: str = ""
    updated_at: str = ""

    @classmethod
    def from_meta_dict(cls, data: dict[str, Any]) -> "RejectedFilingArtifact":
        """Build an object from rejected-artifact meta.

        Args:
            data: meta.json dict.

        Returns:
            `RejectedFilingArtifact` instance.

        Raises:
            KeyError: raised when a required field is missing.
            ValueError: raised when a required field is invalid.
        """

        return cls(
            ticker=str(data["ticker"]).strip(),
            document_id=str(data["document_id"]).strip(),
            internal_document_id=str(data["internal_document_id"]).strip(),
            accession_number=str(data["accession_number"]).strip(),
            company_id=str(data["company_id"]).strip(),
            form_type=str(data["form_type"]).strip(),
            filing_date=str(data["filing_date"]).strip(),
            report_date=_optional_str(data.get("report_date")),
            primary_document=str(data["primary_document"]).strip(),
            selected_primary_document=str(data["selected_primary_document"]).strip(),
            rejection_reason=str(data["rejection_reason"]).strip(),
            rejection_category=str(data["rejection_category"]).strip(),
            classification_version=str(data["classification_version"]).strip(),
            source_fingerprint=str(data.get("source_fingerprint", "")).strip(),
            files=[
                SourceFileEntry.from_dict(item)
                for item in data.get("files", [])
                if isinstance(item, dict)
            ],
            fiscal_year=(
                int(data["fiscal_year"]) if isinstance(data.get("fiscal_year"), int) else None
            ),
            fiscal_period=_optional_str(data.get("fiscal_period")),
            report_kind=_optional_str(data.get("report_kind")),
            amended=bool(data.get("amended", False)),
            has_xbrl=data.get("has_xbrl") if isinstance(data.get("has_xbrl"), bool) else None,
            ingest_method=str(data.get("ingest_method", "download")).strip() or "download",
            rejected_at=str(data.get("rejected_at", "")).strip(),
            created_at=str(data.get("created_at", "")).strip(),
            updated_at=str(data.get("updated_at", "")).strip(),
        )

    def to_meta_dict(self) -> dict[str, Any]:
        """Convert an object to a rejected-artifact meta dict.

        Args:
            None.

        Returns:
            meta.json dict.

        Raises:
            None.
        """

        return {
            "ticker": self.ticker,
            "document_id": self.document_id,
            "internal_document_id": self.internal_document_id,
            "accession_number": self.accession_number,
            "company_id": self.company_id,
            "form_type": self.form_type,
            "filing_date": self.filing_date,
            "report_date": self.report_date,
            "primary_document": self.primary_document,
            "selected_primary_document": self.selected_primary_document,
            "rejection_reason": self.rejection_reason,
            "rejection_category": self.rejection_category,
            "classification_version": self.classification_version,
            "source_fingerprint": self.source_fingerprint,
            "files": [item.to_dict() for item in self.files],
            "fiscal_year": self.fiscal_year,
            "fiscal_period": self.fiscal_period,
            "report_kind": self.report_kind,
            "amended": self.amended,
            "has_xbrl": self.has_xbrl,
            "ingest_method": self.ingest_method,
            "rejected_at": self.rejected_at,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


@dataclass(frozen=True)
class FilingDeleteRequest:
    """Filing deletion request."""

    ticker: str
    document_id: str


@dataclass(frozen=True)
class FilingRestoreRequest:
    """Filing restore request."""

    ticker: str
    document_id: str


@dataclass(frozen=True)
class ProcessedUpsertRequest:
    """Base class for processed-artifact write requests."""

    ticker: str
    document_id: str
    internal_document_id: str
    source_kind: str
    form_type: Optional[str] = None
    meta: dict[str, Any] = field(default_factory=dict)
    sections: Optional[list[dict[str, Any]]] = None
    tables: Optional[list[dict[str, Any]]] = None
    financials: Optional[dict[str, Any]] = None


@dataclass(frozen=True)
class ProcessedCreateRequest(ProcessedUpsertRequest):
    """Processed-artifact creation request."""


@dataclass(frozen=True)
class ProcessedUpdateRequest(ProcessedUpsertRequest):
    """Processed-artifact update request."""


@dataclass(frozen=True)
class ProcessedDeleteRequest:
    """Processed-artifact deletion request."""

    ticker: str
    document_id: str


@dataclass(frozen=True)
class DocumentQuery:
    """Document query criteria."""

    form_type: Optional[str] = None
    fiscal_years: Optional[list[int]] = None
    fiscal_periods: Optional[list[str]] = None
    source_kind: Optional[str] = None
    include_deleted: bool = False


@dataclass(frozen=True)
class DocumentSummary:
    """Document summary object."""

    document_id: str
    internal_document_id: str
    source_kind: str
    form_type: Optional[str] = None
    material_name: Optional[str] = None
    fiscal_year: Optional[int] = None
    fiscal_period: Optional[str] = None
    report_date: Optional[str] = None
    filing_date: Optional[str] = None
    amended: bool = False
    is_deleted: bool = False
    document_version: str = "v1"
    quality: str = "full"
    has_financials: bool = False
    section_count: int = 0
    table_count: int = 0

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "DocumentSummary":
        """Create a `DocumentSummary` from a dict.

        Args:
            data: summary dict.

        Returns:
            document summary object.

        Raises:
            KeyError: raised when a required field is missing.
        """

        return cls(
            document_id=str(data["document_id"]),
            internal_document_id=str(data.get("internal_document_id", "")),
            source_kind=str(data.get("source_kind", "filing")),
            form_type=data.get("form_type"),
            material_name=data.get("material_name"),
            fiscal_year=data.get("fiscal_year"),
            fiscal_period=data.get("fiscal_period"),
            report_date=data.get("report_date"),
            filing_date=data.get("filing_date"),
            amended=bool(data.get("amended", False)),
            is_deleted=bool(data.get("is_deleted", False)),
            document_version=str(data.get("document_version", "v1")),
            quality=str(data.get("quality", "full")),
            has_financials=bool(data.get("has_financials", False)),
            section_count=int(data.get("section_count", 0)),
            table_count=int(data.get("table_count", 0)),
        )

    def to_dict(self) -> dict[str, Any]:
        """Convert an object to a dict.

        Args:
            None.

        Returns:
            serializable dict.

        Raises:
            None.
        """

        return asdict(self)


@dataclass(frozen=True)
class FilingSummary:
    """Summary of a filing source file.

    Exposes basic information about downloaded filing files from the service
    layer to the UI layer, including fields needed for display such as document
    identifier, form type, filing/report dates, fiscal year/period, and the
    primary file path.
    """

    document_id: str
    form_type: Optional[str] = None
    filing_date: Optional[str] = None
    report_date: Optional[str] = None
    fiscal_year: Optional[int] = None
    fiscal_period: Optional[str] = None
    is_deleted: bool = False
    primary_file_name: Optional[str] = None
    primary_file_path: Optional[str] = None


@dataclass(frozen=True)
class FilingManifestItem:
    """`filings/filing_manifest.json` item."""

    document_id: str
    internal_document_id: str
    form_type: Optional[str] = None
    fiscal_year: Optional[int] = None
    fiscal_period: Optional[str] = None
    report_date: Optional[str] = None
    filing_date: Optional[str] = None
    amended: bool = False
    ingest_method: str = "download"
    ingest_complete: bool = True
    is_deleted: bool = False
    deleted_at: Optional[str] = None
    document_version: str = "v1"
    source_fingerprint: str = ""
    has_xbrl: Optional[bool] = None

    def to_dict(self) -> dict[str, Any]:
        """Convert an object to a manifest dict.

        Args:
            None.

        Returns:
            item dict.

        Raises:
            None.
        """

        return asdict(self)


@dataclass(frozen=True)
class MaterialManifestItem:
    """`materials/material_manifest.json` item."""

    document_id: str
    internal_document_id: str
    form_type: Optional[str] = None
    material_name: Optional[str] = None
    filing_date: Optional[str] = None
    report_date: Optional[str] = None
    ingest_complete: bool = True
    is_deleted: bool = False
    deleted_at: Optional[str] = None
    document_version: str = "v1"
    source_fingerprint: str = ""

    def to_dict(self) -> dict[str, Any]:
        """Convert an object to a manifest dict.

        Args:
            None.

        Returns:
            item dict.

        Raises:
            None.
        """

        return asdict(self)


@dataclass(frozen=True)
class ProcessedManifestItem:
    """`processed/manifest.json` item."""

    document_id: str
    internal_document_id: str
    source_kind: str
    form_type: Optional[str] = None
    material_name: Optional[str] = None
    fiscal_year: Optional[int] = None
    fiscal_period: Optional[str] = None
    report_date: Optional[str] = None
    filing_date: Optional[str] = None
    amended: bool = False
    is_deleted: bool = False
    document_version: str = "v1"
    quality: str = "full"
    has_financials: bool = False
    section_count: int = 0
    table_count: int = 0

    def to_dict(self) -> dict[str, Any]:
        """Convert an object to a manifest dict.

        Args:
            None.

        Returns:
            item dict.

        Raises:
            None.
        """

        return asdict(self)


def now_iso8601() -> str:
    """Return the ISO8601 string of the current UTC time.

    Args:
        None.

    Returns:
        ISO8601 time string.

    Raises:
        None.
    """

    return datetime.now(UTC).replace(microsecond=0).isoformat()


def _optional_str(value: Any) -> Optional[str]:
    """Normalize any value to an optional string.

    Args:
        value: raw value.

    Returns:
        whitespace-stripped string; `None` when empty.

    Raises:
        None.
    """

    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None
