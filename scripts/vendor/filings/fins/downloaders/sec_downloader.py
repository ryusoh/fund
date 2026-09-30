"""SEC EDGAR downloader (low-level networking and file downloads).

Scope:
- SEC API access (ticker -> CIK, submissions, index.json)
- remote file-list retrieval (including XBRL/exhibits)
- file download with retry / pacing / UA / 304 skip

Does not contain business-process logic (e.g. form selection, time windows,
meta/manifest writes).

Maintenance note (do not split this module):
    This module is ~2050 lines, consisting of the SecDownloader class
    (1134 lines, 7 methods) and 33 module-level utility functions, all
    centered on a single I/O concern: SEC EDGAR HTTP access and file
    parsing. Class methods and utility functions call each other densely;
    splitting would only add import complexity. Externally only a few
    public symbols are consumed, such as SecDownloader /
    RemoteFileDescriptor / DownloaderEvent.
"""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import html
import inspect
import json
import os
import posixpath
import re
import sys
import time
from dataclasses import dataclass
from html.parser import HTMLParser
from io import BytesIO
from pathlib import Path
from typing import (
    Any,
    AsyncIterator,
    Awaitable,
    BinaryIO,
    Callable,
    Literal,
    Optional,
    TypeVar,
    cast,
    overload,
)
from urllib.parse import urlparse
from xml.etree import ElementTree as ET

import httpx

from scripts.vendor.filings.contracts.env_keys import SEC_USER_AGENT_ENV
from scripts.vendor.filings.workspace_paths import build_sec_throttle_dir

if sys.platform != "win32":
    import fcntl

from scripts.vendor.filings.fins._converters import normalize_optional_text, optional_int
from scripts.vendor.filings.fins.domain.document_models import FileObjectMeta
from scripts.vendor.filings.fins.ticker_normalization import try_normalize_ticker
from scripts.vendor.filings.log import Log

SEC_TICKER_MAP_URL = "https://www.sec.gov/files/company_tickers.json"
SEC_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik10}.json"
ARCHIVES_BASE = "https://www.sec.gov/Archives/edgar/data/{cik}/{accession_no_dash}/"
ARCHIVES_INDEX_JSON = ARCHIVES_BASE + "index.json"
ARCHIVES_INDEX_HEADERS_HTML = ARCHIVES_BASE + "{accession}-index-headers.html"
BROWSE_EDGAR_ATOM_URL = (
    "https://www.sec.gov/cgi-bin/browse-edgar?"
    "action=getcompany&filenum={filenum}&owner=include&count={count}&output=atom"
)
BROWSE_EDGAR_TICKER_ATOM_URL = (
    "https://www.sec.gov/cgi-bin/browse-edgar?"
    "action=getcompany&CIK={ticker}&owner=exclude&count={count}&output=atom"
)

DEFAULT_SLEEP_SECONDS = 0.2
_UNCONFIGURED_USER_AGENT = "SecFilingsAgent/1.0 unconfigured@example.com"
DEFAULT_REQUEST_TIMEOUT_SECONDS = 30
DEFAULT_MAX_RETRIES = 3
RETRY_BACKOFF_BASE_SECONDS = 0.8
_GLOBAL_SEC_THROTTLE_STATE_FILENAME = "state.json"
_GLOBAL_SEC_THROTTLE_LOCK_FILENAME = "state.lock"

# SEC rate limit: minimum request interval (seconds). SEC requires <=10
# requests/second; leave a safety margin.
_SEC_MIN_REQUEST_INTERVAL_SECONDS = 0.12
# HTTP status codes that trigger throttle backoff
_THROTTLE_STATUS_CODES: frozenset[int] = frozenset({429, 503})
# default throttle backoff seconds (used when there is no Retry-After header)
_SEC_THROTTLE_BACKOFF_SECONDS = 5.0
# Per SEC's published guidance: after exceeding the threshold, throttling may
# take up to 10 minutes to lift even after falling back below it.
_SEC_THROTTLE_RECOVERY_SECONDS = 600.0
# extra retries for throttling (do not consume the normal retry budget)
_SEC_THROTTLE_MAX_RETRIES = 3
_ETAG_WEAK_PREFIX = "W/"
_ETAG_GZIP_SUFFIX = "-gzip"
_AwaitedValueT = TypeVar("_AwaitedValueT")
_HttpResultT = TypeVar("_HttpResultT")


@dataclass(frozen=True)
class RemoteFileDescriptor:
    """Remote file descriptor."""

    name: str
    source_url: str
    http_etag: Optional[str]
    http_last_modified: Optional[str]
    remote_size: Optional[int]
    http_status: Optional[int] = None
    sec_document_type: Optional[str] = None
    sec_description: Optional[str] = None


@dataclass(frozen=True)
class BrowseEdgarFiling:
    """browse-edgar record."""

    form_type: str
    filing_date: str
    accession_number: str
    cik: str
    index_url: str


@dataclass(frozen=True)
class Sc13PartyRoles:
    """SC 13 filing-party roles."""

    filed_by_cik: str
    subject_cik: str


DownloaderEventType = Literal["file_downloaded", "file_skipped", "file_failed"]


@dataclass(frozen=True)
class DownloaderEvent:
    """Downloader file-level event."""

    event_type: DownloaderEventType
    name: str
    source_url: str
    http_etag: Optional[str]
    http_last_modified: Optional[str]
    http_status: Optional[int]
    file_meta: Optional[FileObjectMeta] = None
    reason_code: Optional[str] = None
    reason_message: Optional[str] = None
    error: Optional[str] = None


@dataclass(frozen=True)
class _SecThrottleState:
    """SEC throttle shared state."""

    next_request_at: float = 0.0
    cooldown_until: float = 0.0


def _build_empty_content_failure_event(
    descriptor: RemoteFileDescriptor,
    http_status: Optional[int],
) -> DownloaderEvent:
    """Build the 0-byte download-failure event.

    Args:
        descriptor: current remote file descriptor.
        http_status: HTTP status code of this download.

    Returns:
        a failure event of type `empty_content`.

    Raises:
        None.
    """

    return DownloaderEvent(
        event_type="file_failed",
        name=descriptor.name,
        source_url=descriptor.source_url,
        http_etag=descriptor.http_etag,
        http_last_modified=descriptor.http_last_modified,
        http_status=http_status,
        reason_code="empty_content",
        reason_message="downloaded content is 0 bytes; treated as a download failure",
        error="downloaded content is 0 bytes; treated as a download failure",
    )


def _should_abort_after_empty_primary(
    descriptor_name: str,
    primary_document: Optional[str],
) -> bool:
    """Judge whether a 0-byte file should abort the whole filing download.

    Args:
        descriptor_name: current file name.
        primary_document: primary document filename specified by the caller.

    Returns:
        `True` when the current file is the primary document and returns 0 bytes.

    Raises:
        None.
    """

    return bool(primary_document) and descriptor_name == primary_document


def _handle_conditional_download_response(response: httpx.Response) -> tuple[int, Optional[bytes]]:
    """Handle a conditional-download response.

    Args:
        response: HTTP response object.

    Returns:
        `(status_code, payload)`; on a `304` hit, payload is `None`.

    Raises:
        httpx.HTTPError: raised on non-success statuses other than `304`.
    """

    if response.status_code == 304:
        return 304, None
    response.raise_for_status()
    return response.status_code, response.content


def _parse_http_json_response(response: httpx.Response) -> dict[str, Any]:
    """Parse a JSON response body.

    Args:
        response: HTTP response object.

    Returns:
        JSON dict.

    Raises:
        httpx.HTTPError: raised on HTTP status errors.
        ValueError: raised when JSON parsing fails.
    """

    response.raise_for_status()
    return cast(dict[str, Any], response.json())


def _read_http_binary_response(response: httpx.Response) -> bytes:
    """Read the byte response body.

    Args:
        response: HTTP response object.

    Returns:
        response body bytes.

    Raises:
        httpx.HTTPError: raised on HTTP status errors.
    """

    response.raise_for_status()
    return response.content


def _return_http_response(response: httpx.Response) -> httpx.Response:
    """Return the HTTP response as-is.

    Args:
        response: HTTP response object.

    Returns:
        raw response object.

    Raises:
        None.
    """

    return response


class _RelativeHtmlLinkExtractor(HTMLParser):
    """Extract hyperlink URLs from HTML."""

    def __init__(self) -> None:
        """Initialize the link extractor."""

        super().__init__(convert_charrefs=True)
        self.hrefs: list[str] = []

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, Optional[str]]],
    ) -> None:
        """Handle a start tag and extract `href`.

        Args:
            tag: tag name.
            attrs: tag attribute list.

        Returns:
            None.

        Raises:
            None.
        """

        if tag.lower() != "a":
            return
        for attribute_name, attribute_value in attrs:
            if attribute_name.lower() != "href":
                continue
            if attribute_value is None:
                continue
            normalized_href = attribute_value.strip()
            if normalized_href:
                self.hrefs.append(normalized_href)


def accession_to_no_dash(accession_number: str) -> str:
    """Remove hyphens from an accession number.

    Args:
        accession_number: original accession.

    Returns:
        accession without hyphens.

    Raises:
        ValueError: raised when the accession is empty.
    """

    normalized = accession_number.strip()
    if not normalized:
        raise ValueError("accession_number must not be empty")
    return normalized.replace("-", "")


def pick_extracted_instance_xml(items: list[dict[str, Any]]) -> Optional[str]:
    """Select the XBRL instance xml from index items.

    Args:
        items: `directory.item` list from index.json.

    Returns:
        matched filename; `None` when nothing matches.

    Raises:
        None.
    """

    names = [str(item.get("name", "")) for item in items if isinstance(item, dict)]
    for name in names:
        if name.endswith("_htm.xml"):
            return name
    for name in names:
        if name.endswith(".xml") and "htm" in name:
            return name
    non_linkbase = [
        name
        for name in names
        if name.endswith(".xml")
        and not name.lower().endswith(("_pre.xml", "_lab.xml", "_cal.xml", "_def.xml"))
        and name.lower() not in {"filingsummary.xml"}
    ]
    if not non_linkbase:
        return None
    non_linkbase.sort(
        key=lambda item: (0 if re.search(r"[-_]\d{8}\.xml$", item.lower()) else 1, len(item))
    )
    return non_linkbase[0]


def pick_taxonomy_files(items: list[dict[str, Any]]) -> list[str]:
    """Select taxonomy/linkbase filenames.

    Args:
        items: index.json entry list.

    Returns:
        taxonomy filename list (deduplicated).

    Raises:
        None.
    """

    names = [str(item.get("name", "")) for item in items if isinstance(item, dict)]
    selected: list[str] = []
    for suffix in [".xsd", "_pre.xml", "_cal.xml", "_def.xml", "_lab.xml"]:
        for name in names:
            if name.endswith(suffix):
                selected.append(name)
                break
    return sorted(set(selected))


def pick_exhibit_files(items: list[dict[str, Any]]) -> list[str]:
    """Select 6-K exhibit files.

    Identification strategy:
    1. prefer the SEC document type (`EX-99.x`);
    2. when no type field is present, fall back to filename patterns
       (`dex99*` / `ex99*`).

    Args:
        items: file entry list (from `index.json` or `index-headers` parse results).

    Returns:
        exhibit filename list.

    Raises:
        None.
    """

    exhibits: list[str] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", ""))
        lowered = name.lower()
        if not lowered.endswith((".htm", ".html")):
            continue
        document_type = _normalize_sec_document_type(item.get("type"))
        if document_type and document_type.startswith("EX-99"):
            exhibits.append(name)
            continue
        # Donnelley format: dex991.htm, dex992.htm, ...
        # Edgar Filing Services format: xxx_ex99-1.htm, xxx_ex99_1.htm, ...
        if "dex99" in lowered or "ex99" in lowered:
            exhibits.append(name)
    return sorted(set(exhibits))


def pick_form_document_files(items: list[dict[str, Any]], form_type: str) -> list[str]:
    """Select HTML files of the same form as the filing form.

    Currently mainly used for 6-K: some foreign issuers attach the real
    quarterly-results body to the `TYPE=6-K` cover HTML rather than to an
    `EX-99.x` exhibit. Keeping only the primary_document and the exhibits
    would miss such candidates, preventing pre-filtering from converging on
    the correct primary file.

    Args:
        items: file entry list (from `index.json` or `index-headers` parse results).
        form_type: filing form type.

    Returns:
        HTML filename list for the same form_type.

    Raises:
        None.
    """

    normalized_form_type = _normalize_sec_document_type(form_type)
    if normalized_form_type is None:
        return []
    matched: list[str] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", ""))
        lowered = name.lower()
        if not lowered.endswith((".htm", ".html")):
            continue
        document_type = _normalize_sec_document_type(item.get("type"))
        if document_type == normalized_form_type:
            matched.append(name)
    return sorted(set(matched))


def extract_same_filing_linked_html_files(
    payload: bytes,
    primary_document: str,
) -> list[str]:
    """Extract same-filing relative HTML links from the primary document.

    Keep only high-confidence supplemental-link targets:
    - must be a relative path;
    - must not escape the current archive directory after normalization;
    - only `.htm/.html` files in the same directory are accepted;
    - anchors, scripts, mailto links, and the primary document itself are skipped.

    Args:
        payload: primary document HTML bytes.
        primary_document: primary document filename.

    Returns:
        normalized relative HTML filename list.

    Raises:
        None.
    """

    if not payload:
        return []
    extractor = _RelativeHtmlLinkExtractor()
    extractor.feed(payload.decode("utf-8", errors="ignore"))
    candidates: set[str] = set()
    for raw_href in extractor.hrefs:
        normalized_href = _normalize_same_filing_relative_html_href(
            href=raw_href,
            primary_document=primary_document,
        )
        if normalized_href is not None:
            candidates.add(normalized_href)
    return sorted(candidates)


def _normalize_same_filing_relative_html_href(
    href: str,
    primary_document: str,
) -> Optional[str]:
    """Normalize a same-filing relative HTML link from the primary document.

    Args:
        href: raw link address.
        primary_document: primary document filename.

    Returns:
        normalized relative filename; `None` when not a high-confidence same-filing HTML link.

    Raises:
        None.
    """

    normalized_href = html.unescape(href).strip().replace("\\", "/")
    if not normalized_href or normalized_href.startswith("#"):
        return None
    lowered_href = normalized_href.lower()
    if lowered_href.startswith(("javascript:", "mailto:", "tel:", "data:")):
        return None
    parsed = urlparse(normalized_href)
    if parsed.scheme or parsed.netloc:
        return None
    normalized_path = posixpath.normpath(parsed.path.strip())
    if normalized_path in {"", "."}:
        return None
    if normalized_path.startswith("/") or normalized_path.startswith("../"):
        return None
    # Only accept same-directory filenames, to avoid pulling in non-filing-body
    # resources from parent/subdirectories.
    if "/" in normalized_path:
        return None
    if not normalized_path.lower().endswith((".htm", ".html")):
        return None
    if normalized_path == primary_document:
        return None
    return normalized_path


def build_source_fingerprint(descriptors: list[RemoteFileDescriptor]) -> str:
    """Build the source_fingerprint.

    Args:
        descriptors: list of remote file descriptors.

    Returns:
        fingerprint string (sha256).

    Raises:
        None.
    """

    payload = [
        {
            "name": descriptor.name,
            # notes:
            # - SEC/CloudFront may return transport-variant ETags for identical content (e.g. a -gzip suffix);
            # - Content-Length can also jitter under compressed transfers;
            # the fingerprint must focus on "content identity" rather than transport details to avoid false-positive remote-change detection.
            "etag": _normalize_fingerprint_etag(descriptor.http_etag),
            "last_modified": _normalize_fingerprint_last_modified(descriptor.http_last_modified),
        }
        for descriptor in sorted(descriptors, key=lambda item: item.name)
    ]
    serialized = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _normalize_fingerprint_etag(raw_etag: Optional[str]) -> Optional[str]:
    """Normalize an ETag for fingerprinting.

    Args:
        raw_etag: raw HTTP ETag.

    Returns:
        normalized ETag; `None` when there is no valid value.

    Raises:
        None.
    """

    if raw_etag is None:
        return None
    normalized = str(raw_etag).strip()
    if not normalized:
        return None
    if normalized.upper().startswith(_ETAG_WEAK_PREFIX):
        normalized = normalized[2:].strip()
    if normalized.startswith('"') and normalized.endswith('"') and len(normalized) >= 2:
        normalized = normalized[1:-1]
    if normalized.lower().endswith(_ETAG_GZIP_SUFFIX):
        normalized = normalized[: -len(_ETAG_GZIP_SUFFIX)]
    normalized = normalized.strip().lower()
    return normalized or None


def _normalize_fingerprint_last_modified(raw_last_modified: Optional[str]) -> Optional[str]:
    """Normalize a Last-Modified value for fingerprinting.

    Args:
        raw_last_modified: raw Last-Modified.

    Returns:
        normalized time string; `None` when there is no valid value.

    Raises:
        None.
    """

    if raw_last_modified is None:
        return None
    normalized = str(raw_last_modified).strip()
    return normalized or None


def hash_file_sha256(file_path: Path) -> str:
    """Compute the sha256 of a file.

    Args:
        file_path: file path.

    Returns:
        hex digest.

    Raises:
        OSError: raised when file reading fails.
    """

    sha256 = hashlib.sha256()
    with file_path.open("rb") as stream:
        while True:
            chunk = stream.read(1024 * 64)
            if not chunk:
                break
            sha256.update(chunk)
    return sha256.hexdigest()


def _load_sec_throttle_state(state_path: Path) -> _SecThrottleState:
    """Read the SEC shared throttle state.

    Args:
        state_path: state file path.

    Returns:
        shared throttle state; the default state when the file is missing or corrupted.

    Raises:
        None.
    """

    if not state_path.exists():
        return _SecThrottleState()
    try:
        with state_path.open("r", encoding="utf-8") as stream:
            payload = json.load(stream)
    except (OSError, json.JSONDecodeError):
        return _SecThrottleState()
    if not isinstance(payload, dict):
        return _SecThrottleState()
    next_request_at = payload.get("next_request_at", 0.0)
    cooldown_until = payload.get("cooldown_until", 0.0)
    try:
        return _SecThrottleState(
            next_request_at=max(float(next_request_at), 0.0),
            cooldown_until=max(float(cooldown_until), 0.0),
        )
    except (TypeError, ValueError):
        return _SecThrottleState()


def _save_sec_throttle_state(state_path: Path, state: _SecThrottleState) -> None:
    """Write the SEC shared throttle state.

    Args:
        state_path: state file path.
        state: shared throttle state to write.

    Returns:
        None.

    Raises:
        OSError: raised when the write fails.
    """

    state_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "next_request_at": state.next_request_at,
        "cooldown_until": state.cooldown_until,
    }
    with state_path.open("w", encoding="utf-8") as stream:
        json.dump(payload, stream, ensure_ascii=False, indent=2)


@contextlib.contextmanager
def _sec_throttle_lock(lock_path: Path) -> Any:
    """Acquire the SEC shared throttle file lock.

    Args:
        lock_path: lock-file path.

    Yields:
        opened and locked file object.

    Raises:
        OSError: raised when the file cannot be opened.
    """

    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("a+", encoding="utf-8") as stream:
        if sys.platform != "win32":
            fcntl.flock(stream.fileno(), fcntl.LOCK_EX)
        try:
            yield stream
        finally:
            if sys.platform != "win32":
                fcntl.flock(stream.fileno(), fcntl.LOCK_UN)


def _resolve_sec_throttle_delay(response: httpx.Response) -> float:
    """Resolve the post-throttle recovery wait time for SEC.

    Args:
        response: HTTP response object.

    Returns:
        seconds to wait. When the response lacks sufficient information, wait at least 10 minutes.

    Raises:
        None.
    """

    return max(_parse_retry_after(response), _SEC_THROTTLE_RECOVERY_SECONDS)


class SecDownloader:
    """SEC downloader."""

    MODULE = "FINS.SEC_DOWNLOADER"

    def __init__(
        self,
        workspace_root: Path,
        client: Optional[httpx.AsyncClient] = None,
    ) -> None:
        """Initialize the downloader.

        Args:
            workspace_root: workspace root directory.
            client: optional `httpx.AsyncClient` (for test injection).

        Returns:
            None.

        Raises:
            ValueError: raised when an argument is invalid.
        """

        self.workspace_root = workspace_root.resolve()
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient()
        self._sleep_seconds = DEFAULT_SLEEP_SECONDS
        self._request_timeout_seconds = DEFAULT_REQUEST_TIMEOUT_SECONDS
        self._max_retries = DEFAULT_MAX_RETRIES
        self._user_agent = self._resolve_user_agent(None)
        self._last_request_time: float = 0.0  # last request time (monotonic clock)
        self._throttle_state_dir = build_sec_throttle_dir(self.workspace_root)
        self._throttle_state_path = self._throttle_state_dir / _GLOBAL_SEC_THROTTLE_STATE_FILENAME
        self._throttle_lock_path = self._throttle_state_dir / _GLOBAL_SEC_THROTTLE_LOCK_FILENAME
        Log.debug(
            f"SecDownloader initialized: workspace_root={self.workspace_root}",
            module=self.MODULE,
        )

    async def close(self) -> None:
        """Close the underlying HTTP client.

        Args:
            None.

        Returns:
            None.

        Raises:
            RuntimeError: raised when the close fails.
        """

        if self._owns_client:
            await self._client.aclose()

    def normalize_ticker(self, ticker: str) -> str:
        """Normalize a ticker.

        delegates to the ``scripts.vendor.filings.fins.ticker_normalization`` source of truth; falls back to
        ``strip().upper()`` to preserve empty-value validation (this method is
        kept so the upstream pipeline can call it via
        ``host._downloader.normalize_ticker(...)``).

        Args:
            ticker: raw ticker.

        Returns:
            canonical or upper-case ticker.

        Raises:
            ValueError: raised when the ticker is empty.
        """

        normalized_source = try_normalize_ticker(ticker)
        if normalized_source is not None:
            return normalized_source.canonical
        normalized = ticker.strip().upper()
        if not normalized:
            raise ValueError("ticker must not be empty")
        return normalized

    def configure(
        self,
        user_agent: Optional[str],
        sleep_seconds: float,
        max_retries: int,
    ) -> None:
        """Configure download parameters.

        Args:
            user_agent: User-Agent string.
            sleep_seconds: seconds between requests.
            max_retries: maximum retry count.

        Returns:
            None.

        Raises:
            ValueError: raised when an argument is invalid.
        """

        if max_retries <= 0:
            raise ValueError("max_retries must be greater than 0")
        if sleep_seconds < 0:
            raise ValueError("sleep_seconds must not be negative")
        self._max_retries = max_retries
        self._sleep_seconds = sleep_seconds
        self._user_agent = self._resolve_user_agent(user_agent)
        Log.debug(
            f"download config updated: ua={self._user_agent} sleep_seconds={self._sleep_seconds} max_retries={self._max_retries}",
            module=self.MODULE,
        )

    async def resolve_company(self, ticker: str) -> tuple[str, str, str]:
        """Resolve the CIK and company name for a ticker.

        Args:
            ticker: ticker.

        Returns:
            `(cik, company_name, cik10)`。

        Raises:
            RuntimeError: raised when the ticker does not exist.
        """

        normalized = self.normalize_ticker(ticker)
        mapping = await _await_if_needed(self._http_get_json(SEC_TICKER_MAP_URL))
        for row in mapping.values():
            if str(row.get("ticker", "")).upper() != normalized:
                continue
            cik = str(row.get("cik_str", "")).strip()
            company_name = str(row.get("title", "")).strip()
            if cik.isdigit():
                cik10 = str(int(cik)).zfill(10)
                return cik, company_name, cik10
        fallback_result = await _await_if_needed(
            self._resolve_company_via_browse_edgar_ticker(normalized)
        )
        if fallback_result is not None:
            return fallback_result
        raise RuntimeError(f"ticker={normalized} not found in the SEC ticker map")

    async def _resolve_company_via_browse_edgar_ticker(
        self,
        ticker: str,
        count: int = 40,
    ) -> Optional[tuple[str, str, str]]:
        """Look up company info for a ticker via browse-edgar.

        Args:
            ticker: normalized upper-case ticker.
            count: maximum number of items browse-edgar fetches.

        Returns:
            `(cik, company_name, cik10)` on a hit, otherwise `None`.

        Raises:
            None.
        """

        normalized_ticker = ticker.strip().upper()
        if not normalized_ticker:
            return None
        url = BROWSE_EDGAR_TICKER_ATOM_URL.format(ticker=normalized_ticker, count=count)
        try:
            payload = await _await_if_needed(self._http_get_bytes(url))
        except RuntimeError as exc:
            Log.warn(
                f"browse-edgar ticker lookup failed: ticker={normalized_ticker} error={exc}",
                module=self.MODULE,
            )
            return None
        try:
            entries = _parse_browse_edgar_atom(payload)
        except RuntimeError as exc:
            Log.warn(
                f"browse-edgar XML parse failed; skipping ticker={normalized_ticker}: {exc}",
                module=self.MODULE,
            )
            return None
        if not entries:
            return None
        for entry in entries:
            raw_cik = str(entry.cik).strip()
            if not raw_cik.isdigit():
                continue
            # SEC downstream interfaces use CIK with and without leading zeros (10-digit); build both forms uniformly here.
            cik = str(int(raw_cik))
            cik10 = cik.zfill(10)
            try:
                submissions = await _await_if_needed(self.fetch_submissions(cik10))
            except RuntimeError as exc:
                Log.warn(
                    (
                        "failed to fetch submissions after browse-edgar ticker hit: "
                        f"ticker={normalized_ticker} cik10={cik10} error={exc}"
                    ),
                    module=self.MODULE,
                )
                continue
            company_name = str(submissions.get("name", "")).strip()
            return cik, (company_name or normalized_ticker), cik10
        return None

    async def fetch_submissions(self, cik10: str) -> dict[str, Any]:
        """Fetch submissions JSON.

        Args:
            cik10: 10-digit CIK string.

        Returns:
            submissions JSON dict.

        Raises:
            RuntimeError: raised when the request fails.
        """

        url = SEC_SUBMISSIONS_URL.format(cik10=cik10)
        return await _await_if_needed(self._http_get_json(url))

    async def fetch_json(self, url: str) -> dict[str, Any]:
        """Fetch an arbitrary JSON URL.

        Args:
            url: target JSON URL.

        Returns:
            JSON dict.

        Raises:
            RuntimeError: raised when the request fails.
        """

        return await _await_if_needed(self._http_get_json(url))

    async def fetch_browse_edgar_filenum(
        self,
        filenum: str,
        count: int = 100,
    ) -> list[BrowseEdgarFiling]:
        """Fetch filings for a filenum via browse-edgar.

        Args:
            filenum: SEC file number (e.g. 005-XXXX).
            count: maximum number of items to fetch.

        Returns:
            filings list.

        Raises:
            RuntimeError: raised when the request fails.
        """

        normalized = filenum.strip()
        if not normalized:
            return []
        url = BROWSE_EDGAR_ATOM_URL.format(filenum=normalized, count=count)
        payload = await _await_if_needed(self._http_get_bytes(url))
        return _parse_browse_edgar_atom(payload)

    async def resolve_primary_document(
        self,
        cik: str,
        accession_no_dash: str,
        form_type: str,
    ) -> str:
        """Infer the primary filename from index.json.

        Args:
            cik: CIK (no leading zeros).
            accession_no_dash: accession without hyphens.
            form_type: form type.

        Returns:
            primary filename.

        Raises:
            RuntimeError: raised when the primary file cannot be located.
        """

        index_url = ARCHIVES_INDEX_JSON.format(
            cik=str(int(cik)), accession_no_dash=accession_no_dash
        )
        index_json = await _await_if_needed(self._http_get_json(index_url))
        items = list(index_json.get("directory", {}).get("item", []) or [])
        primary = _select_primary_from_index_items(items, form_type)
        if primary:
            return primary
        raise RuntimeError("cannot parse primary_document")

    async def fetch_sc13_party_roles(
        self,
        archive_cik: str,
        accession_number: str,
    ) -> Optional[Sc13PartyRoles]:
        """Parse the filing and subject CIKs of an SC 13 filing.

        data source: the `CENTRAL INDEX KEY` within the
        `FILED BY` and `SUBJECT COMPANY` sections.

        Args:
            archive_cik: CIK in the archive path (with or without leading zeros).
            accession_number: accession (with hyphens).

        Returns:
            `Sc13PartyRoles` on successful parse; `None` on network failure or missing fields.

        Raises:
            None.
        """

        normalized_archive_cik = _normalize_cik_value(archive_cik)
        normalized_accession = accession_number.strip()
        if normalized_archive_cik is None or not normalized_accession:
            return None
        accession_no_dash = accession_to_no_dash(normalized_accession)
        url = ARCHIVES_INDEX_HEADERS_HTML.format(
            cik=normalized_archive_cik,
            accession_no_dash=accession_no_dash,
            accession=normalized_accession,
        )
        try:
            payload = await _await_if_needed(self._http_get_bytes(url))
        except RuntimeError as exc:
            Log.warn(
                (
                    "failed to fetch SC13 index-headers: "
                    f"archive_cik={normalized_archive_cik} accession={normalized_accession} error={exc}"
                ),
                module=self.MODULE,
            )
            return None
        return _parse_sc13_party_roles_from_index_headers(payload)

    async def fetch_file_bytes(self, url: str) -> bytes:
        """Download a file and return its byte content.

        Args:
            url: file URL.

        Returns:
            file content bytes.

        Raises:
            RuntimeError: raised when the download fails.
        """

        return await _await_if_needed(self._http_download(url))

    async def list_filing_files(
        self,
        cik: str,
        accession_no_dash: str,
        primary_document: str,
        form_type: str,
        include_xbrl: bool = True,
        include_exhibits: bool = True,
        include_http_metadata: bool = True,
    ) -> list[RemoteFileDescriptor]:
        """List remote files related to a filing.

        Args:
            cik: CIK (no leading zeros).
            accession_no_dash: accession without hyphens.
            primary_document: primaryDocument filename.
            form_type: filing form type.
            include_xbrl: whether to include XBRL files.
            include_exhibits: whether to include exhibit files (6-K).
            include_http_metadata: whether to also fetch file-level HTTP metadata.

        Returns:
            remote file descriptor list.

        Raises:
            RuntimeError: raised when network requests fail consecutively.
        """

        archive_base = ARCHIVES_BASE.format(cik=str(int(cik)), accession_no_dash=accession_no_dash)
        filenames: list[str] = [primary_document]
        index_items: list[dict[str, Any]] = []
        index_header_documents: list[dict[str, Any]] = []
        if include_xbrl or include_exhibits:
            index_items = await _await_if_needed(
                self._try_fetch_index_items(cik=cik, accession_no_dash=accession_no_dash)
            )
        if include_exhibits and form_type == "6-K":
            index_header_documents = await _await_if_needed(
                self._try_fetch_index_header_documents(
                    cik=cik,
                    accession_no_dash=accession_no_dash,
                )
            )
        if include_xbrl:
            extracted_xml = pick_extracted_instance_xml(index_items)
            if extracted_xml:
                filenames.append(extracted_xml)
            filenames.extend(pick_taxonomy_files(index_items))
        if include_exhibits and form_type == "6-K":
            filenames.extend(pick_form_document_files(index_items, form_type))
            filenames.extend(pick_form_document_files(index_header_documents, form_type))
            filenames.extend(pick_exhibit_files(index_items))
            filenames.extend(pick_exhibit_files(index_header_documents))
            filenames.extend(
                await _await_if_needed(
                    self._try_fetch_primary_linked_html_files(
                        archive_base=archive_base,
                        primary_document=primary_document,
                    )
                )
            )
        file_meta_map = _build_file_metadata_map(index_items, index_header_documents)
        unique_filenames = sorted(set(filenames))
        Log.verbose(
            f"remote file list: {unique_filenames}",
            module=self.MODULE,
        )
        descriptors: list[RemoteFileDescriptor] = []
        for filename in unique_filenames:
            source_url = archive_base + filename
            metadata = file_meta_map.get(filename, {})
            head_response: Optional[httpx.Response] = None
            if include_http_metadata:
                head_response = await _await_if_needed(
                    self._http_head(source_url, allow_redirects=True)
                )
            descriptors.append(
                RemoteFileDescriptor(
                    name=filename,
                    source_url=source_url,
                    http_etag=_safe_header(head_response, "ETag"),
                    http_last_modified=_safe_header(head_response, "Last-Modified"),
                    remote_size=optional_int(_safe_header(head_response, "Content-Length")),
                    http_status=head_response.status_code if head_response else None,
                    sec_document_type=_normalize_sec_document_type(metadata.get("type")),
                    sec_description=normalize_optional_text(metadata.get("description")),
                )
            )
        return descriptors

    async def download_files_stream(
        self,
        remote_files: list[RemoteFileDescriptor],
        overwrite: bool,
        store_file: Callable[[str, BinaryIO], FileObjectMeta],
        existing_files: Optional[dict[str, dict[str, Any]]] = None,
        primary_document: Optional[str] = None,
    ) -> AsyncIterator[DownloaderEvent]:
        """Download the remote file list and stream file-level events.

        Args:
            remote_files: remote file descriptor list.
            overwrite: whether to overwrite on download.
            store_file: file-storage callback (args: filename, binary stream).
            existing_files: existing file-metadata mapping (keyed by filename).
            primary_document: primary document filename (e.g. *.htm); when specified and that file downloads as 0 bytes,
                the generator stops immediately; no further files are downloaded so the filing never lands on disk.

        Yields:
            file-level download event.

        Raises:
            OSError: raised when writing to local disk fails.
        """

        previous_map = existing_files or {}
        for descriptor in remote_files:
            previous = previous_map.get(descriptor.name, {})
            previous_etag = (
                str(previous.get("http_etag") or previous.get("etag") or "").strip() or None
            )
            previous_last_modified = (
                str(
                    previous.get("http_last_modified") or previous.get("last_modified") or ""
                ).strip()
                or None
            )
            if not overwrite:
                try:
                    status_code, payload = await _await_if_needed(
                        self._http_download_if_modified(
                            url=descriptor.source_url,
                            etag=previous_etag,
                            last_modified=previous_last_modified,
                        )
                    )
                except RuntimeError as exc:
                    # catch download errors (e.g. HTTP 503) and convert them to a file_failed event
                    yield DownloaderEvent(
                        event_type="file_failed",
                        name=descriptor.name,
                        source_url=descriptor.source_url,
                        http_etag=descriptor.http_etag,
                        http_last_modified=descriptor.http_last_modified,
                        http_status=None,
                        reason_code="download_error",
                        reason_message=str(exc),
                        error=str(exc),
                    )
                    continue
                if status_code == 304:
                    yield DownloaderEvent(
                        event_type="file_skipped",
                        name=descriptor.name,
                        source_url=descriptor.source_url,
                        http_etag=descriptor.http_etag,
                        http_last_modified=descriptor.http_last_modified,
                        http_status=304,
                        reason_code="not_modified",
                        reason_message="remote file unmodified; skipping re-download",
                    )
                    continue
                if payload is None:
                    yield DownloaderEvent(
                        event_type="file_failed",
                        name=descriptor.name,
                        source_url=descriptor.source_url,
                        http_etag=descriptor.http_etag,
                        http_last_modified=descriptor.http_last_modified,
                        http_status=status_code,
                        reason_code="empty_response",
                        reason_message="download failed; no content returned",
                        error="download failed; no content returned",
                    )
                    continue
                if len(payload) == 0:
                    yield _build_empty_content_failure_event(descriptor, status_code)
                    if _should_abort_after_empty_primary(descriptor.name, primary_document):
                        # 0-byte primary document: the entire filing is invalid; abort the download so no further files land on disk.
                        return
                    continue
                file_meta = store_file(descriptor.name, _to_binary_stream(payload))
                yield DownloaderEvent(
                    event_type="file_downloaded",
                    name=descriptor.name,
                    source_url=descriptor.source_url,
                    http_etag=descriptor.http_etag,
                    http_last_modified=descriptor.http_last_modified,
                    http_status=status_code,
                    file_meta=file_meta,
                )
                continue
            try:
                payload = await _await_if_needed(self._http_download(descriptor.source_url))
                if len(payload) == 0:
                    yield _build_empty_content_failure_event(descriptor, descriptor.http_status)
                    if _should_abort_after_empty_primary(descriptor.name, primary_document):
                        # 0-byte primary document: the entire filing is invalid; abort the download so no further files land on disk.
                        return
                    continue
                file_meta = store_file(descriptor.name, _to_binary_stream(payload))
                yield DownloaderEvent(
                    event_type="file_downloaded",
                    name=descriptor.name,
                    source_url=descriptor.source_url,
                    http_etag=descriptor.http_etag,
                    http_last_modified=descriptor.http_last_modified,
                    http_status=descriptor.http_status,
                    file_meta=file_meta,
                )
            except RuntimeError as exc:
                yield DownloaderEvent(
                    event_type="file_failed",
                    name=descriptor.name,
                    source_url=descriptor.source_url,
                    http_etag=descriptor.http_etag,
                    http_last_modified=descriptor.http_last_modified,
                    http_status=descriptor.http_status,
                    reason_code="download_error",
                    reason_message=str(exc),
                    error=str(exc),
                )

    async def download_files(
        self,
        remote_files: list[RemoteFileDescriptor],
        overwrite: bool,
        store_file: Callable[[str, BinaryIO], FileObjectMeta],
        existing_files: Optional[dict[str, dict[str, Any]]] = None,
        primary_document: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        """Download the remote file list and return aggregated results.

        Args:
            remote_files: remote file descriptor list.
            overwrite: whether to overwrite on download.
            store_file: file-storage callback (args: filename, binary stream).
            existing_files: existing file-metadata mapping (keyed by filename).
            primary_document: primary document filename, forwarded to download_files_stream.

        Returns:
            single-file download result list.

        Raises:
            OSError: raised when writing to local disk fails.
        """

        results: list[dict[str, Any]] = []
        async for event in self.download_files_stream(
            remote_files=remote_files,
            overwrite=overwrite,
            store_file=store_file,
            existing_files=existing_files,
            primary_document=primary_document,
        ):
            if event.event_type == "file_downloaded":
                results.append(
                    {
                        "name": event.name,
                        "status": "downloaded",
                        "file_meta": event.file_meta,
                        "source_url": event.source_url,
                        "http_etag": event.http_etag,
                        "http_last_modified": event.http_last_modified,
                        "http_status": event.http_status,
                    }
                )
            elif event.event_type == "file_skipped":
                results.append(
                    {
                        "name": event.name,
                        "status": "skipped",
                        "source_url": event.source_url,
                        "http_etag": event.http_etag,
                        "http_last_modified": event.http_last_modified,
                        "http_status": event.http_status,
                        "reason_code": event.reason_code,
                        "reason_message": event.reason_message,
                    }
                )
            else:
                results.append(
                    {
                        "name": event.name,
                        "status": "failed",
                        "source_url": event.source_url,
                        "http_etag": event.http_etag,
                        "http_last_modified": event.http_last_modified,
                        "http_status": event.http_status,
                        "reason_code": event.reason_code,
                        "reason_message": event.reason_message,
                        "error": event.error,
                    }
                )
        return results

    async def _execute_sec_request(
        self,
        *,
        url: str,
        method: Literal["GET", "HEAD"],
        response_handler: Callable[[httpx.Response], _HttpResultT],
        handled_exceptions: tuple[type[Exception], ...],
        attempt_log_prefix: str,
        failure_prefix: str,
        extra_headers: Optional[dict[str, str]] = None,
        allow_redirects: bool = False,
    ) -> _HttpResultT:
        """Execute an HTTP request with SEC throttling and retry policy.

        Args:
            url: request URL.
            method: HTTP method.
            response_handler: success-response handler; may call `raise_for_status()` or parse the response body.
            handled_exceptions: exception types that trigger a retry.
            attempt_log_prefix: log prefix for a single failure.
            failure_prefix: exception prefix after retries are exhausted.
            extra_headers: extra request headers.
            allow_redirects: whether `HEAD` requests follow redirects.

        Returns:
            the result produced by `response_handler`.

        Raises:
            RuntimeError: raised after retries are exhausted.
        """

        headers = self._build_headers()
        if extra_headers:
            headers.update(extra_headers)
        last_exception: Optional[Exception] = None
        throttle_retries_remaining = _SEC_THROTTLE_MAX_RETRIES
        attempt_index = 0
        while attempt_index < self._max_retries:
            await self._rate_limit()
            try:
                if method == "GET":
                    response = await self._client.get(
                        url=url,
                        headers=headers,
                        timeout=self._request_timeout_seconds,
                    )
                else:
                    response = await self._client.head(
                        url=url,
                        headers=headers,
                        timeout=self._request_timeout_seconds,
                        follow_redirects=allow_redirects,
                    )
                if (
                    response.status_code in _THROTTLE_STATUS_CODES
                    and throttle_retries_remaining > 0
                ):
                    throttle_retries_remaining -= 1
                    delay = _resolve_sec_throttle_delay(response)
                    self._register_global_throttle_cooldown(delay)
                    Log.warn(
                        f"SEC rate limit {response.status_code}: url={url} waiting {delay:.1f}s",
                        module=self.MODULE,
                    )
                    await asyncio.sleep(delay)
                    continue
                return response_handler(response)
            except handled_exceptions as exc:
                last_exception = exc
                Log.debug(
                    f"{attempt_log_prefix}: url={url} attempt={attempt_index + 1} error={exc}",
                    module=self.MODULE,
                )
                await self._retry_backoff(attempt_index)
                attempt_index += 1
        raise RuntimeError(f"{failure_prefix}: url={url} error={last_exception}")

    async def _http_download_if_modified(
        self,
        url: str,
        etag: Optional[str],
        last_modified: Optional[str],
    ) -> tuple[int, Optional[bytes]]:
        """Download a file conditionally, returning 304 when unmodified.

        Args:
            url: file URL.
            etag: remote ETag (optional).
            last_modified: remote Last-Modified (optional).

        Returns:
            (HTTP status code, content bytes); `304` means unmodified with empty content.

        Raises:
            RuntimeError: raised when the download fails.
        """

        conditional_headers: dict[str, str] = {}
        if etag:
            conditional_headers["If-None-Match"] = etag
        if last_modified:
            conditional_headers["If-Modified-Since"] = last_modified
        if not conditional_headers:
            return 200, await self._http_download(url=url)

        return await self._execute_sec_request(
            url=url,
            method="GET",
            response_handler=_handle_conditional_download_response,
            handled_exceptions=(httpx.HTTPError,),
            attempt_log_prefix="conditional download failed",
            failure_prefix="conditional download failed",
            extra_headers=conditional_headers,
        )

    async def _http_get_json(self, url: str) -> dict[str, Any]:
        """Execute a GET JSON request.

        Args:
            url: request URL.

        Returns:
            JSON dict.

        Raises:
            RuntimeError: raised when the request fails.
        """

        return await self._execute_sec_request(
            url=url,
            method="GET",
            response_handler=_parse_http_json_response,
            handled_exceptions=(httpx.HTTPError, ValueError),
            attempt_log_prefix="GET JSON failed",
            failure_prefix="GET JSON failed",
        )

    async def _http_head(self, url: str, allow_redirects: bool) -> Optional[httpx.Response]:
        """Execute a HEAD request.

        Args:
            url: request URL.
            allow_redirects: whether to follow redirects.

        Returns:
            Response object; `None` on failure.

        Raises:
            None.
        """

        try:
            return await self._execute_sec_request(
                url=url,
                method="HEAD",
                response_handler=_return_http_response,
                handled_exceptions=(httpx.HTTPError,),
                attempt_log_prefix="HEAD failed",
                failure_prefix="HEAD failed",
                allow_redirects=allow_redirects,
            )
        except RuntimeError:
            return None

    async def _http_download(self, url: str) -> bytes:
        """Download a file and return its content.

        Args:
            url: file URL.

        Returns:
            file content bytes.

        Raises:
            RuntimeError: raised when the download fails.
        """

        return await self._execute_sec_request(
            url=url,
            method="GET",
            response_handler=_read_http_binary_response,
            handled_exceptions=(httpx.HTTPError,),
            attempt_log_prefix="download failed",
            failure_prefix="download failed",
        )

    async def _http_get_bytes(self, url: str) -> bytes:
        """Execute a GET request and return byte content.

        Args:
            url: request URL.

        Returns:
            response body bytes.

        Raises:
            RuntimeError: raised when the request fails.
        """

        return await self._execute_sec_request(
            url=url,
            method="GET",
            response_handler=_read_http_binary_response,
            handled_exceptions=(httpx.HTTPError,),
            attempt_log_prefix="GET bytes failed",
            failure_prefix="GET bytes failed",
        )

    async def _try_fetch_index_items(
        self, cik: str, accession_no_dash: str
    ) -> list[dict[str, Any]]:
        """Try to fetch the item list from index.json.

        Args:
            cik: CIK (no leading zeros).
            accession_no_dash: accession without hyphens.

        Returns:
            item list from index.json; empty list on failure.

        Raises:
            None.
        """

        index_url = ARCHIVES_INDEX_JSON.format(
            cik=str(int(cik)),
            accession_no_dash=accession_no_dash,
        )
        try:
            index_json = await _await_if_needed(self._http_get_json(index_url))
        except RuntimeError as exc:
            Log.warn(f"failed to read index.json: {index_url} error={exc}", module=self.MODULE)
            return []
        return list(index_json.get("directory", {}).get("item", []) or [])

    async def _try_fetch_index_header_documents(
        self,
        cik: str,
        accession_no_dash: str,
    ) -> list[dict[str, Any]]:
        """Try to parse document entries from the index-headers page.

        Args:
            cik: CIK (no leading zeros).
            accession_no_dash: accession without hyphens.

        Returns:
            document entry list; empty list on request or parse failure.

        Raises:
            None.
        """

        accession = _format_accession_with_dash(accession_no_dash)
        index_headers_url = ARCHIVES_INDEX_HEADERS_HTML.format(
            cik=str(int(cik)),
            accession_no_dash=accession_no_dash,
            accession=accession,
        )
        try:
            payload = await _await_if_needed(self._http_get_bytes(index_headers_url))
        except RuntimeError as exc:
            Log.warn(
                f"failed to read index-headers: {index_headers_url} error={exc}",
                module=self.MODULE,
            )
            return []
        return _parse_index_header_document_entries(payload)

    async def _try_fetch_primary_linked_html_files(
        self,
        archive_base: str,
        primary_document: str,
    ) -> list[str]:
        """Try to supplement same-filing relative HTML files from the primary document.

        Args:
            archive_base: base URL of the filing archive.
            primary_document: primary document filename.

        Returns:
            normalized relative HTML filename list; empty list on request failure.

        Raises:
            None.
        """

        primary_document_url = archive_base + primary_document
        try:
            payload = await _await_if_needed(self._http_get_bytes(primary_document_url))
        except RuntimeError as exc:
            Log.warn(
                f"failed to read primary-document supplement link: {primary_document_url} error={exc}",
                module=self.MODULE,
            )
            return []
        return extract_same_filing_linked_html_files(
            payload=payload,
            primary_document=primary_document,
        )

    def _resolve_user_agent(self, configured_user_agent: Optional[str]) -> str:
        """Resolve the User-Agent.

        priority: explicit argument > SEC_USER_AGENT environment variable > unconfigured fallback (with a warning).

        Args:
            configured_user_agent: explicitly supplied User-Agent.

        Returns:
            final User-Agent.

        Raises:
            None.
        """

        value = (configured_user_agent or os.environ.get(SEC_USER_AGENT_ENV) or "").strip()
        if value:
            return value
        Log.warning(
            f"SEC User-Agent is not configured. SEC requires real contact information, otherwise requests may be throttled or blocked."
            f"configure it via the {SEC_USER_AGENT_ENV} environment variable.",
            module=self.MODULE,
        )
        return _UNCONFIGURED_USER_AGENT

    def _build_headers(self) -> dict[str, str]:
        """Build request headers.

        Args:
            None.

        Returns:
            request header dict.

        Raises:
            None.
        """

        return {
            "User-Agent": self._user_agent,
            "Accept-Encoding": "gzip, deflate",
        }

    def _reserve_global_request_slot(self, min_interval: float) -> float:
        """Reserve the next request time slice in shared state.

        design goals:
        - multiple download processes in one workspace share a single rate limit;
        - after an SEC 429/503, all processes share the same cooldown window;
        - keep decisions and data co-located, avoiding each process "believing it is within the limit" on its own.

        Args:
            min_interval: minimum seconds between requests.

        Returns:
            seconds the current request should wait.

        Raises:
            OSError: raised when the state-file read/write fails.
        """

        now = time.time()
        with _sec_throttle_lock(self._throttle_lock_path):
            state = _load_sec_throttle_state(self._throttle_state_path)
            allowed_at = max(now, state.cooldown_until, state.next_request_at)
            next_state = _SecThrottleState(
                next_request_at=allowed_at + min_interval,
                cooldown_until=state.cooldown_until,
            )
            _save_sec_throttle_state(self._throttle_state_path, next_state)
        return max(allowed_at - now, 0.0)

    def _register_global_throttle_cooldown(self, delay_seconds: float) -> None:
        """Register the shared cooldown window after SEC throttling.

        Args:
            delay_seconds: cooldown seconds.

        Returns:
            None.

        Raises:
            OSError: raised when the state-file write fails.
        """

        cooldown_until = time.time() + max(delay_seconds, 0.0)
        with _sec_throttle_lock(self._throttle_lock_path):
            state = _load_sec_throttle_state(self._throttle_state_path)
            next_state = _SecThrottleState(
                next_request_at=max(state.next_request_at, cooldown_until),
                cooldown_until=max(state.cooldown_until, cooldown_until),
            )
            _save_sec_throttle_state(self._throttle_state_path, next_state)

    async def _rate_limit(self) -> None:
        """Monotonic-clock request rate limiter.

        ensures adjacent requests are spaced >= max(_SEC_MIN_REQUEST_INTERVAL_SECONDS, sleep_seconds).
        call **before** every HTTP request.

        Args:
            None.

        Returns:
            None.

        Raises:
            None.
        """

        min_interval = max(_SEC_MIN_REQUEST_INTERVAL_SECONDS, self._sleep_seconds)
        if min_interval <= 0:
            return
        # run in-instance throttling first to avoid hammering the shared lock within one event loop.
        now = time.monotonic()
        elapsed = now - self._last_request_time
        if elapsed < min_interval:
            await asyncio.sleep(min_interval - elapsed)
        # then run cross-process shared throttling so all download processes in one workspace share throttle state.
        shared_wait_seconds = self._reserve_global_request_slot(min_interval)
        if shared_wait_seconds > 0:
            await asyncio.sleep(shared_wait_seconds)
        self._last_request_time = time.monotonic()

    async def _retry_backoff(self, attempt_index: int) -> None:
        """Perform exponential backoff.

        Args:
            attempt_index: retry index (0-based).

        Returns:
            None.

        Raises:
            None.
        """

        if attempt_index >= self._max_retries - 1:
            return
        delay = RETRY_BACKOFF_BASE_SECONDS * (2**attempt_index)
        await asyncio.sleep(delay)


def _parse_retry_after(response: httpx.Response) -> float:
    """Parse the Retry-After response header and return the wait in seconds.

    Args:
        response: HTTP response object.

    Returns:
        seconds to wait. The default backoff is used when there is no Retry-After header.

    Raises:
        None.
    """

    retry_after = response.headers.get("Retry-After", "").strip()
    if retry_after:
        try:
            return max(float(retry_after), 1.0)
        except ValueError:
            pass
    return _SEC_THROTTLE_BACKOFF_SECONDS


def _safe_header(response: Optional[httpx.Response], key: str) -> Optional[str]:
    """Safely read a response header.

    Args:
        response: Response object.
        key: header field name.

    Returns:
        response header content or `None`.

    Raises:
        None.
    """

    if response is None:
        return None
    return response.headers.get(key)


def _to_binary_stream(payload: bytes) -> BinaryIO:
    """Wrap bytes into a readable binary stream.

    Args:
        payload: content bytes.

    Returns:
        binary stream object.

    Raises:
        None.
    """

    return BytesIO(payload)


@overload
async def _await_if_needed(value: Awaitable[_AwaitedValueT]) -> _AwaitedValueT:
    """Await an awaitable when needed (awaitable overload)."""


@overload
async def _await_if_needed(value: _AwaitedValueT) -> _AwaitedValueT:
    """Await an awaitable when needed (plain-value overload)."""


async def _await_if_needed(value: Awaitable[_AwaitedValueT] | _AwaitedValueT) -> _AwaitedValueT:
    """Await an awaitable when needed.

    Args:
        value: plain value or awaitable.

    Returns:
        parsed value.

    Raises:
        RuntimeError: raised when the awaitable fails to execute.
    """

    if inspect.isawaitable(value):
        return await cast(Awaitable[_AwaitedValueT], value)
    return cast(_AwaitedValueT, value)


def _parse_sc13_party_roles_from_index_headers(payload: bytes) -> Optional[Sc13PartyRoles]:
    """Parse the two SC 13 parties' CIKs from index-headers page content.

    Args:
        payload: `-index-headers.html` response bytes.

    Returns:
        `Sc13PartyRoles` on successful parse, otherwise `None`.

    Raises:
        None.
    """

    if not payload:
        return None
    text = payload.decode("utf-8", errors="ignore")
    filed_by_section = _extract_sc13_section_text(text=text, section_name="FILED BY")
    subject_section = _extract_sc13_section_text(text=text, section_name="SUBJECT COMPANY")
    if filed_by_section is None or subject_section is None:
        return None
    filed_by_cik = _extract_first_cik_from_text(filed_by_section)
    subject_cik = _extract_first_cik_from_text(subject_section)
    if filed_by_cik is None or subject_cik is None:
        return None
    return Sc13PartyRoles(filed_by_cik=filed_by_cik, subject_cik=subject_cik)


def _format_accession_with_dash(accession_no_dash: str) -> str:
    """Convert a hyphenless accession to the SEC standard format.

    Args:
        accession_no_dash: accession without hyphens.

    Returns:
        standard accession (`xxxxxxxxxx-xx-xxxxxx`); the original value when it cannot be matched.

    Raises:
        None.
    """

    normalized = str(accession_no_dash or "").strip()
    matched = re.fullmatch(r"(\d{10})(\d{2})(\d{6})", normalized)
    if matched is None:
        return normalized
    return f"{matched.group(1)}-{matched.group(2)}-{matched.group(3)}"


def _parse_index_header_document_entries(payload: bytes) -> list[dict[str, str]]:
    """Parse the `<DOCUMENT>` entries in a `-index-headers.html` page.

    SEC's index-headers pages usually place escaped SGML text inside `<pre>`;
    this function first unescapes the HTML, then extracts
    `TYPE/FILENAME/DESCRIPTION` from each `<DOCUMENT>...</DOCUMENT>` block.

    Args:
        payload: index-headers response bytes.

    Returns:
        parsed document entry list (each carrying `name/type/description`).

    Raises:
        None.
    """

    if not payload:
        return []
    raw_text = payload.decode("utf-8", errors="ignore")
    normalized_text = html.unescape(raw_text)
    document_blocks = re.findall(
        r"(?is)<DOCUMENT>\s*(.*?)\s*</DOCUMENT>",
        normalized_text,
    )
    documents: list[dict[str, str]] = []
    for block in document_blocks:
        filename_match = re.search(r"(?im)^\s*<FILENAME>\s*([^\n<]+)\s*$", block)
        if filename_match is None:
            continue
        name = filename_match.group(1).strip()
        if not name:
            continue
        type_match = re.search(r"(?im)^\s*<TYPE>\s*([^\n<]+)\s*$", block)
        description_match = re.search(r"(?im)^\s*<DESCRIPTION>\s*([^\n<]+)\s*$", block)
        documents.append(
            {
                "name": name,
                "type": (type_match.group(1).strip() if type_match else ""),
                "description": (description_match.group(1).strip() if description_match else ""),
            }
        )
    return documents


def _extract_sc13_section_text(
    text: str,
    section_name: str,
) -> Optional[str]:
    """Extract the given party's block text from index-headers.

    Args:
        text: page plain text.
        section_name: block name (e.g. `FILED BY`, `SUBJECT COMPANY`).

    Returns:
        paragraph text; `None` when not found.

    Raises:
        None.
    """

    headers = list(re.finditer(r"(?im)^\s*(FILED BY|SUBJECT COMPANY)\s*:\s*$", text))
    if not headers:
        return None
    normalized_target = section_name.strip().upper()
    for index, matched in enumerate(headers):
        current_name = matched.group(1).strip().upper()
        if current_name != normalized_target:
            continue
        section_start = matched.end()
        section_end = headers[index + 1].start() if index + 1 < len(headers) else len(text)
        return text[section_start:section_end]
    return None


def _normalize_sec_document_type(value: Any) -> Optional[str]:
    """Normalize an SEC document type.

    `index.json` often contains `type=text.gif`, which is not a real document
    type and is filtered out here.

    Args:
        value: raw type value.

    Returns:
        normalized type string; `None` for invalid values.

    Raises:
        None.
    """

    normalized = normalize_optional_text(value)
    if normalized is None:
        return None
    upper = normalized.upper()
    if upper == "TEXT.GIF":
        return None
    return upper


def _build_file_metadata_map(
    index_items: list[dict[str, Any]],
    index_header_documents: list[dict[str, Any]],
) -> dict[str, dict[str, str]]:
    """Build the filename-to-metadata mapping.

    Merge priority:
    - write `index.json` entries first;
    - then override with `index-headers` entries (their `TYPE/DESCRIPTION`
      is more reliable).

    Args:
        index_items: `index.json` document entries.
        index_header_documents: document entries parsed from `index-headers`.

    Returns:
        filename -> metadata mapping.

    Raises:
        None.
    """

    mapping: dict[str, dict[str, str]] = {}
    for item in [*index_items, *index_header_documents]:
        if not isinstance(item, dict):
            continue
        name = normalize_optional_text(item.get("name"))
        if name is None:
            continue
        target = mapping.setdefault(name, {})
        document_type = _normalize_sec_document_type(item.get("type"))
        if document_type is not None:
            target["type"] = document_type
        description = normalize_optional_text(item.get("description"))
        if description is not None:
            target["description"] = description
    return mapping


def _extract_first_cik_from_text(text: str) -> Optional[str]:
    """Extract the first `CENTRAL INDEX KEY` from block text.

    Args:
        text: paragraph text.

    Returns:
        normalized CIK string; `None` on a miss.

    Raises:
        None.
    """

    matched = re.search(r"(?im)^\s*CENTRAL INDEX KEY:\s*([0-9]+)\s*$", text)
    if matched is None:
        return None
    return _normalize_cik_value(matched.group(1))


def _normalize_cik_value(raw_cik: Any) -> Optional[str]:
    """Normalize a CIK to a digit string without leading zeros.

    Args:
        raw_cik: raw CIK.

    Returns:
        normalized CIK; `None` for invalid input.

    Raises:
        None.
    """

    normalized = str(raw_cik or "").strip()
    if not normalized.isdigit():
        return None
    return str(int(normalized))


def _parse_browse_edgar_atom(payload: bytes) -> list[BrowseEdgarFiling]:
    """Parse the browse-edgar Atom output.

    Args:
        payload: XML byte content.

    Returns:
        filings list.

    Raises:
        RuntimeError: raised when XML parsing fails.
    """

    try:
        root = ET.fromstring(payload)
    except ET.ParseError as exc:  # noqa: BLE001
        raise RuntimeError("browse-edgar XML parse failed") from exc
    ns = {"a": "http://www.w3.org/2005/Atom"}
    results: list[BrowseEdgarFiling] = []
    for entry in root.findall("a:entry", ns):
        title = entry.findtext("a:title", default="", namespaces=ns).strip()
        updated = entry.findtext("a:updated", default="", namespaces=ns).strip()
        link = entry.find("a:link", ns)
        href = link.get("href", "") if link is not None else ""
        if not title or not href:
            continue
        form_type = _extract_form_from_title(title)
        filing_date = updated.split("T")[0] if updated else ""
        accession_number, cik = _parse_browse_edgar_href(href)
        if not accession_number or not cik or not filing_date:
            continue
        results.append(
            BrowseEdgarFiling(
                form_type=form_type,
                filing_date=filing_date,
                accession_number=accession_number,
                cik=cik,
                index_url=href,
            )
        )
    return results


def _extract_form_from_title(title: str) -> str:
    """Extract the form type from a browse-edgar title.

    Args:
        title: raw title text.

    Returns:
        form type.

    Raises:
        None.
    """

    prefix = title.split(" - ", 1)[0].strip()
    return re.sub(r"\s*\[.*\]\s*$", "", prefix).strip()


def _parse_browse_edgar_href(href: str) -> tuple[str, str]:
    """Extract accession and CIK from a browse-edgar link.

    Args:
        href: link address.

    Returns:
        (accession_number, cik); empty string on parse failure.

    Raises:
        None.
    """

    accession_match = re.search(r"/(\d{10}-\d{2}-\d{6})-index\.htm", href)
    if accession_match is None:
        accession_match = re.search(r"/(\d{10}-\d{2}-\d{6})-index\.html", href)
    accession_number = accession_match.group(1) if accession_match else ""
    cik_match = re.search(r"/data/(\d+)/", href)
    cik = cik_match.group(1) if cik_match else ""
    return accession_number, cik


def _select_primary_from_index_items(items: list[dict[str, Any]], form_type: str) -> str:
    """Select the primary filename from index.json entries.

    Args:
        items: item list from index.json.
        form_type: form type.

    Returns:
        primary filename; empty string when it cannot be determined.

    Raises:
        None.
    """

    normalized_form = str(form_type).strip().upper()
    for item in items:
        if not isinstance(item, dict):
            continue
        item_type = str(item.get("type", "")).strip().upper()
        name = str(item.get("name", "")).strip()
        if item_type == normalized_form and name:
            return name
    candidates: list[str] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()
        if not name:
            continue
        lower = name.lower()
        if lower.endswith((".htm", ".html", ".txt")):
            candidates.append(name)
    if not candidates:
        for item in items:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name", "")).strip()
            if name:
                candidates.append(name)
    return candidates[0] if candidates else ""
