"""Event Scanner (scripts/analysis/event_scanner.py).

Flags thesis-relevant events on the tracked universe (data/analysis/*.json):

1. EDGAR leg — filings in {8-K, 10-Q, 10-K, S-1, 424B4} filed within a rolling
   lookback window (stateless; the weekly cadence overlaps safely).
2. Review-date leg — the latest decision_journal entry's review_date, flagged
   when past or within N days.

Read-only by design: never ingests anything; a flag is a prompt to run
/thesis-update, not an auto-pipeline trigger.
Fail-open: a missing SEC_USER_AGENT, EDGAR fetch failures, and ticker-resolution
failures produce one stderr warning per ticker and skip that ticker's EDGAR leg;
the exit code reflects flags found, never fetch errors.
"""

from __future__ import annotations

import argparse
import asyncio
import datetime
import json
import os
import sys
from pathlib import Path
from typing import Any, Optional

sys.path.append(str(Path(__file__).resolve().parents[2]))
from scripts.filings.contracts.env_keys import SEC_USER_AGENT_ENV
from scripts.filings.fins.downloaders.sec_downloader import SecDownloader

DEFAULT_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "analysis"

WATCH_FORMS = ("8-K", "10-Q", "10-K", "S-1", "424B4")
SKIP_FILES = {"index.json", "theme_timeline.json", "watchlist.json"}
DEFAULT_LOOKBACK_DAYS = 14
REVIEW_WARN_DAYS = 14
EDGAR_ARCHIVES_BASE = "https://www.sec.gov/Archives/edgar/data"
# Tracked tickers that are not SEC reporting companies (e.g. VT is an ETF) —
# EDGAR resolution can never succeed for them, so the leg skips them outright
# instead of emitting a permanent weekly warning.
EDGAR_SKIP_TICKERS = {"VT"}


def resolve_filings_workspace(override: Optional[Path | str] = None) -> Path:
    """Resolve the filings workspace root (mirrors filings_adapter.resolve_workspace).

    Only the throttle-state directory is ever touched — no filings are read or
    written. Kept dependency-light so this module imports the vendored
    downloader only, not the full adapter service stack.
    """
    if override:
        path = Path(override)
        path.mkdir(parents=True, exist_ok=True)
        return path

    env_path = os.environ.get("FILINGS_WORKSPACE")
    if env_path:
        path = Path(env_path)
        path.mkdir(parents=True, exist_ok=True)
        return path

    # Secure default: avoid predictable /tmp fallbacks (symlink/race risks).
    default_cache = Path.home() / ".cache" / "filings"
    default_cache.mkdir(parents=True, exist_ok=True)
    return default_cache


def tracked_tickers(data_dir: Path) -> list[str]:
    """Tracked universe: data/analysis/*.json minus non-ticker configs."""
    if not data_dir.exists() or not data_dir.is_dir():
        return []
    return sorted(p.stem for p in data_dir.glob("*.json") if p.name not in SKIP_FILES)


def _edgar_url(cik: str, accession: str, primary_document: str) -> str:
    accession_clean = accession.replace("-", "")
    return f"{EDGAR_ARCHIVES_BASE}/{int(cik)}/{accession_clean}/{primary_document}"


async def _recent_filings(
    ticker: str, workspace: Path, today: datetime.date, lookback_days: int
) -> list[dict[str, Any]]:
    downloader = SecDownloader(workspace)
    try:
        normalized = downloader.normalize_ticker(ticker)
        cik, _company_name, cik10 = await downloader.resolve_company(normalized)
        submissions = await downloader.fetch_submissions(cik10)
    finally:
        await downloader.close()

    recent = submissions.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    filing_dates = recent.get("filingDate", [])
    accessions = recent.get("accessionNumber", [])
    primary_docs = recent.get("primaryDocument", [])

    filings: list[dict[str, Any]] = []
    for idx, form in enumerate(forms):
        if form not in WATCH_FORMS or idx >= len(filing_dates):
            continue
        try:
            filed = datetime.date.fromisoformat(filing_dates[idx])
        except (ValueError, TypeError):
            continue
        age_days = (today - filed).days
        if not 0 <= age_days <= lookback_days:
            continue
        accession = accessions[idx] if idx < len(accessions) else ""
        primary_document = primary_docs[idx] if idx < len(primary_docs) else ""
        filings.append(
            {
                "ticker": ticker,
                "type": "filing",
                "form": form,
                "filing_date": filing_dates[idx],
                "url": _edgar_url(cik, accession, primary_document),
            }
        )
    return filings


def scan_edgar_leg(
    tickers: list[str], workspace: Path, today: datetime.date, lookback_days: int
) -> list[dict[str, Any]]:
    """Fetch and filter recent filings per ticker. Fail-open, never raises."""
    flags: list[dict[str, Any]] = []
    if not os.environ.get(SEC_USER_AGENT_ENV):
        sys.stderr.write(
            f"Warning: {SEC_USER_AGENT_ENV} unset; skipping EDGAR leg for all tickers.\n"
        )
        return flags
    for ticker in tickers:
        if ticker.upper() in EDGAR_SKIP_TICKERS:
            continue
        try:
            flags.extend(asyncio.run(_recent_filings(ticker, workspace, today, lookback_days)))
        except Exception as e:
            sys.stderr.write(f"Warning: EDGAR leg failed for {ticker}: {e}\n")
    return flags


def scan_review_dates(
    data_dir: Path, tickers: list[str], today: datetime.date, warn_days: int
) -> list[dict[str, Any]]:
    """Flag decision_journal review dates that are past or due within warn_days."""
    flags: list[dict[str, Any]] = []
    for ticker in tickers:
        file_path = data_dir / f"{ticker}.json"
        try:
            data = json.loads(file_path.read_text(encoding="utf-8"))
        except Exception as e:
            sys.stderr.write(f"Warning: could not read {file_path}: {e}\n")
            continue

        journal = data.get("decision_journal")
        if not isinstance(journal, list) or not journal:
            continue
        latest = journal[-1]
        if not isinstance(latest, dict):
            continue
        review_date_str = latest.get("review_date")
        if not review_date_str:
            continue
        try:
            review_date = datetime.date.fromisoformat(review_date_str)
        except (ValueError, TypeError):
            sys.stderr.write(
                f"Warning: malformed review_date in {ticker} decision_journal: {review_date_str}\n"
            )
            continue

        days = (review_date - today).days
        if days < 0:
            flags.append(
                {
                    "ticker": ticker,
                    "type": "review_date",
                    "review_date": review_date_str,
                    "days_overdue": -days,
                }
            )
        elif days <= warn_days:
            flags.append(
                {
                    "ticker": ticker,
                    "type": "review_date",
                    "review_date": review_date_str,
                    "days_due": days,
                }
            )
    return flags


def _format_flag(flag: dict[str, Any]) -> str:
    if flag["type"] == "filing":
        return f"{flag['ticker']} {flag['form']} filed {flag['filing_date']}: {flag['url']}"
    if "days_overdue" in flag:
        return (
            f"{flag['ticker']} review_date {flag['review_date']} "
            f"({flag['days_overdue']} days past)"
        )
    return (
        f"{flag['ticker']} review_date {flag['review_date']} " f"(due in {flag['days_due']} days)"
    )


def _contract_flags(flags: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Map internal flags to the WO-5c JSON schema consumed by the Lab surface."""
    contract: list[dict[str, Any]] = []
    for flag in flags:
        if flag["type"] == "filing":
            contract.append(
                {
                    "ticker": flag["ticker"],
                    "kind": "filing",
                    "form": flag["form"],
                    "date": flag["filing_date"],
                    "url": flag["url"],
                }
            )
        else:
            contract.append(
                {
                    "ticker": flag["ticker"],
                    "kind": "review-date",
                    "date": flag["review_date"],
                }
            )
    return contract


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Scan data/analysis/*.json for new filings and upcoming review dates."
    )
    parser.add_argument(
        "--fail-on-flag",
        action="store_true",
        help="Exit with code 1 if any event flag is found.",
    )
    parser.add_argument(
        "--json-out",
        type=Path,
        default=None,
        help="Optional path to dump the flags list as JSON.",
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=DEFAULT_DATA_DIR,
        help=f"Directory containing analysis JSON files (default: {DEFAULT_DATA_DIR})",
    )
    parser.add_argument(
        "--lookback-days",
        type=int,
        default=DEFAULT_LOOKBACK_DAYS,
        help="EDGAR filing lookback window in days (default: 14).",
    )
    parser.add_argument(
        "--as-of",
        type=str,
        default=None,
        help="Override current date (ISO format YYYY-MM-DD) for evaluation.",
    )
    args = parser.parse_args(argv)

    as_of_date = None
    if args.as_of:
        try:
            as_of_date = datetime.date.fromisoformat(args.as_of)
        except ValueError:
            sys.stderr.write(f"Error: invalid --as-of date format: {args.as_of}\n")
            return 2

    today = as_of_date or datetime.date.today()
    tickers = tracked_tickers(args.data_dir)
    workspace = resolve_filings_workspace()

    flags = scan_edgar_leg(tickers, workspace, today, args.lookback_days)
    flags += scan_review_dates(args.data_dir, tickers, today, REVIEW_WARN_DAYS)

    for flag in flags:
        print(_format_flag(flag))

    flagged_tickers = {f["ticker"] for f in flags}
    if flags:
        print(f"Summary: {len(flags)} event flag(s) found across {len(flagged_tickers)} ticker(s).")
    else:
        print("Summary: 0 event flags found.")

    if args.json_out is not None:
        payload = {
            "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "flags": _contract_flags(flags),
        }
        args.json_out.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )

    if args.fail_on_flag and flags:
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
