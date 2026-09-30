"""Common utility functions for filesystem repositories.

Provides pure-function utilities for ticker/entry-name/source-kind
normalization, URI parsing, atomic JSON read/write, and more.
"""

from __future__ import annotations

import json
import mimetypes
import os
import uuid
from pathlib import Path
from typing import Any, Optional

from scripts.vendor.filings.fins.domain.document_models import FileObjectMeta, now_iso8601
from scripts.vendor.filings.fins.domain.enums import SourceKind
from scripts.vendor.filings.fins.ticker_normalization import try_normalize_ticker

# -- Filename constants --
_SOURCE_META_FILENAME = "meta.json"
_PROCESSED_META_FILENAME = "tool_snapshot_meta.json"
_DOWNLOAD_REJECTIONS_FILENAME = "_download_rejections.json"
_REJECTED_FILINGS_DIRNAME = ".rejections"


# ---------- Normalization ----------


def _normalize_ticker(ticker: str) -> str:
    """Normalize a ticker.

    Prefer the ``try_normalize_ticker`` source of truth; when recognition
    fails (e.g. the input is a company name), fall back to
    ``strip().upper()``, preserving the repository's tolerance for unusual
    tickers on the write path.

    Args:
        ticker: raw ticker.

    Returns:
        normalized ticker.

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


def _normalize_company_ticker_aliases(
    *,
    canonical_ticker: str,
    ticker_aliases: Optional[list[str]],
) -> list[str]:
    """Normalize a company-level ticker alias list.

    Args:
        canonical_ticker: canonical ticker.
        ticker_aliases: raw alias list.

    Returns:
        deduplicated alias list, with the canonical ticker always first.

    Raises:
        ValueError: raised when an alias contains a blank ticker.
    """

    normalized_aliases: list[str] = []
    for raw_alias in [canonical_ticker, *(ticker_aliases or [])]:
        normalized_alias = _normalize_ticker(raw_alias)
        if normalized_alias in normalized_aliases:
            continue
        normalized_aliases.append(normalized_alias)
    return normalized_aliases


def _normalize_entry_name(name: str) -> str:
    """Normalize a direct child entry name of a document directory.

    Args:
        name: entry name.

    Returns:
        normalized entry name.

    Raises:
        ValueError: raised when the name is empty, contains a path
            separator, or is `.` / `..`.
    """

    normalized = str(name).strip()
    if not normalized:
        raise ValueError("entry name must not be empty")
    if normalized in {".", ".."}:
        raise ValueError("invalid entry name")
    if "/" in normalized or "\\" in normalized:
        raise ValueError("entry name must not contain path separators")
    return normalized


def _normalize_source_kind(source_kind: str | SourceKind) -> SourceKind:
    """Normalize a source kind.

    Args:
        source_kind: source kind.

    Returns:
        normalized `SourceKind`.

    Raises:
        ValueError: raised when the source kind is invalid.
    """

    if isinstance(source_kind, SourceKind):
        return source_kind
    try:
        return SourceKind(str(source_kind))
    except ValueError as exc:
        raise ValueError(f"invalid source_kind: {source_kind}") from exc


def _source_dir_name(source_kind: SourceKind) -> str:
    """Return the source directory name.

    Args:
        source_kind: source kind.

    Returns:
        directory name (filings/materials).

    Raises:
        ValueError: raised when the source kind is invalid.
    """

    if source_kind == SourceKind.FILING:
        return "filings"
    if source_kind == SourceKind.MATERIAL:
        return "materials"
    raise ValueError(f"invalid source_kind: {source_kind}")


# ---------- URI / filename ----------


def _infer_filename_from_uri(uri: str) -> str:
    """Infer a filename from a URI.

    Args:
        uri: file URI.

    Returns:
        filename; empty string on parse failure.

    Raises:
        None.
    """

    raw = str(uri or "").strip()
    if not raw:
        return ""
    if "://" in raw:
        raw = raw.split("://", 1)[1]
    raw = raw.rstrip("/")
    if not raw:
        return ""
    return Path(raw).name or raw.split("/")[-1]


def _local_path_from_uri(portfolio_root: Path, uri: str) -> Path:
    """Resolve a local path from a local URI.

    Args:
        portfolio_root: portfolio root directory.
        uri: local URI.

    Returns:
        local path.

    Raises:
        ValueError: raised when the URI is invalid or the scheme is unsupported.
    """

    raw = str(uri or "").strip()
    if not raw:
        raise ValueError("uri must not be empty")
    if not raw.startswith("local://"):
        raise ValueError(f"unsupported URI scheme: {raw}")
    key = raw.split("local://", 1)[1].lstrip("/")
    if not key:
        raise ValueError("local URI lacks a key")
    return (portfolio_root / Path(*key.split("/"))).resolve()


def _guess_media_type(path: Path) -> Optional[str]:
    """Infer the media_type from a path.

    Args:
        path: file path.

    Returns:
        media_type or None.

    Raises:
        None.
    """

    return mimetypes.guess_type(str(path))[0]


# ---------- File-entry operations ----------


def _extract_file_payloads(meta: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract the files list from meta.

    Args:
        meta: document metadata dict.

    Returns:
        file entry list.

    Raises:
        None.
    """

    files = meta.get("files", [])
    if not isinstance(files, list):
        return []
    return [item for item in files if isinstance(item, dict)]


def _normalize_file_entries(file_entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Normalize externally supplied file entries.

    Args:
        file_entries: external file entry list.

    Returns:
        normalized file entry list.

    Raises:
        None.
    """

    normalized: list[dict[str, Any]] = []
    for item in file_entries:
        if not isinstance(item, dict):
            continue
        payload = dict(item)
        if not payload.get("name"):
            payload["name"] = _infer_filename_from_uri(payload.get("uri", ""))
        normalized.append(payload)
    return normalized


def _build_file_payloads(files: list[FileObjectMeta]) -> list[dict[str, Any]]:
    """Build the files list of meta.json.

    Args:
        files: file object metadata list.

    Returns:
        serializable file entry list.

    Raises:
        None.
    """

    payloads: list[dict[str, Any]] = []
    for item in files:
        name = _infer_filename_from_uri(item.uri)
        payloads.append(
            {
                "name": name,
                "uri": item.uri,
                "etag": item.etag,
                "last_modified": item.last_modified,
                "size": item.size,
                "content_type": item.content_type,
                "sha256": item.sha256,
                "ingested_at": now_iso8601(),
            }
        )
    return payloads


def _extract_file_names(file_payloads: list[dict[str, Any]]) -> list[str]:
    """Extract the filename list.

    Args:
        file_payloads: file entry list.

    Returns:
        filename list.

    Raises:
        None.
    """

    names: list[str] = []
    for item in file_payloads:
        name = str(item.get("name") or _infer_filename_from_uri(item.get("uri", ""))).strip()
        if name:
            names.append(name)
    return names


def _resolve_primary_uri(
    file_payloads: list[dict[str, Any]], primary_name: Optional[str]
) -> Optional[str]:
    """Resolve the primary file URI from a file entry list.

    Args:
        file_payloads: file entry list.
        primary_name: primary filename.

    Returns:
        primary file URI; `None` when not found.

    Raises:
        None.
    """

    if not file_payloads:
        return None
    if primary_name:
        for item in file_payloads:
            name = str(item.get("name") or _infer_filename_from_uri(item.get("uri", ""))).strip()
            if name == primary_name:
                return str(item.get("uri"))
    return str(file_payloads[0].get("uri"))


def _file_object_meta_from_dict(payload: dict[str, Any]) -> FileObjectMeta:
    """Build a `FileObjectMeta` from a dict.

    Args:
        payload: file entry dict.

    Returns:
        `FileObjectMeta` instance.

    Raises:
        KeyError: raised when uri is missing.
    """

    return FileObjectMeta(
        uri=str(payload["uri"]),
        etag=str(payload.get("etag")) if payload.get("etag") is not None else None,
        last_modified=(
            str(payload.get("last_modified")) if payload.get("last_modified") is not None else None
        ),
        size=_coerce_optional_int(payload.get("size")),
        content_type=(
            str(payload.get("content_type")) if payload.get("content_type") is not None else None
        ),
        sha256=str(payload.get("sha256")) if payload.get("sha256") is not None else None,
    )


def _coerce_optional_int(value: object) -> int | None:
    """Narrow an unknown value to an optional integer.

    Args:
        value: raw value.

    Returns:
        valid integer; otherwise ``None``.

    Raises:
        None.
    """

    if value is None or isinstance(value, bool) or not isinstance(value, int):
        return None
    return value


# ---------- JSON read/write ----------


def _read_json(path: Path) -> dict[str, Any] | list[Any]:
    """Read a JSON file.

    Args:
        path: JSON file path.

    Returns:
        parsed object.

    Raises:
        FileNotFoundError: raised when the file does not exist.
        ValueError: raised when the JSON cannot be parsed.
    """

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"JSON parse failed: {path}") from exc


def _read_json_object(path: Path) -> dict[str, Any]:
    """Read a JSON object file.

    Args:
        path: JSON file path.

    Returns:
        parsed JSON object.

    Raises:
        FileNotFoundError: raised when the file does not exist.
        ValueError: raised when the JSON cannot be parsed or the root is not an object.
    """

    payload = _read_json(path)
    if not isinstance(payload, dict):
        raise ValueError(f"JSON root must be an object: {path}")
    return payload


def _read_json_array(path: Path) -> list[Any]:
    """Read a JSON array file.

    Args:
        path: JSON file path.

    Returns:
        parsed JSON array.

    Raises:
        FileNotFoundError: raised when the file does not exist.
        ValueError: raised when the JSON cannot be parsed or the root is not an array.
    """

    payload = _read_json(path)
    if not isinstance(payload, list):
        raise ValueError(f"JSON root must be an array: {path}")
    return payload


def _write_json(path: Path, payload: Any) -> None:
    """Write a JSON file.

    Args:
        path: target path.
        payload: serializable object.

    Returns:
        None.

    Raises:
        OSError: raised when the write fails.
        TypeError: raised when the object is not serializable.
    """

    path.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(payload, ensure_ascii=False, indent=2)
    temp_path = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    with temp_path.open("w", encoding="utf-8") as stream:
        stream.write(serialized)
        stream.flush()
        os.fsync(stream.fileno())
    # Rationale: atomic replacement ensures an unexpected exit cannot leave a half-written JSON file behind.
    temp_path.replace(path)
    _fsync_directory(path.parent)


def _fsync_directory(path: Path) -> None:
    """Flush directory metadata to disk (best effort).

    Args:
        path: directory path.

    Returns:
        None.

    Raises:
        None.
    """

    try:
        directory_fd = os.open(str(path), os.O_RDONLY)
    except OSError:
        return
    try:
        os.fsync(directory_fd)
    except OSError:
        return
    finally:
        os.close(directory_fd)


def _list_directory_names(root: Path) -> list[str]:
    """List first-level subdirectory names under a directory.

    Args:
        root: root directory.

    Returns:
        sorted directory name list.

    Raises:
        OSError: raised when the directory cannot be read.
    """

    if not root.exists():
        return []
    # Hidden directories (e.g. `.rejections/`) are internal repository governance
    # data and must not be exposed as active document IDs.
    names = [
        path.name for path in root.iterdir() if path.is_dir() and not path.name.startswith(".")
    ]
    names.sort()
    return names
