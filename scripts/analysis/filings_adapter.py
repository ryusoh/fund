"""Fins SEC filings adapter module.

Bridges the SEC filings toolkit (`scripts.filings`, Apache-2.0 — see its
PROVENANCE.md) with:
1. The Anki card-generation chunks manifest (`parse_chunks.py` contract).
2. The portfolio research evidence log (`data/analysis/<TICKER>.evidence.jsonl`).
3. Factuality verification / confirm-pass tool queries against primary filing text.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
from pathlib import Path
from typing import Any, Optional

from scripts.filings.fins.domain.document_models import (
    CompanyMeta,
    SourceDocumentUpsertRequest,
    now_iso8601,
)
from scripts.filings.fins.domain.enums import SourceKind
from scripts.filings.fins.downloaders.sec_downloader import SecDownloader
from scripts.filings.fins.processors.registry import build_fins_processor_registry
from scripts.filings.fins.storage.fs_company_meta_repository import FsCompanyMetaRepository
from scripts.filings.fins.storage.fs_processed_document_repository import (
    FsProcessedDocumentRepository,
)
from scripts.filings.fins.storage.fs_source_document_repository import (
    FsSourceDocumentRepository,
)
from scripts.filings.fins.storage.local_file_store import LocalFileStore
from scripts.filings.fins.tools.service import FinsToolService

DEFAULT_INGEST_FORMS = ("10-K", "10-Q")


def resolve_workspace(override: Optional[Path | str] = None) -> Path:
    """Resolve the active workspace root directory for filings storage."""
    if override:
        path = Path(override)
        path.mkdir(parents=True, exist_ok=True)
        return path

    env_path = os.environ.get("FILINGS_WORKSPACE")
    if env_path:
        path = Path(env_path)
        path.mkdir(parents=True, exist_ok=True)
        return path

    # Secure default: avoid predictable /tmp directory fallbacks to prevent symlink/race condition vulnerabilities.
    default_cache = Path.home() / ".cache" / "filings"
    default_cache.mkdir(parents=True, exist_ok=True)
    return default_cache


def build_filings_service(workspace_root: Optional[Path | str] = None) -> FinsToolService:
    """Build and return an initialized FinsToolService over the target workspace."""
    workspace = resolve_workspace(workspace_root)
    company_repo = FsCompanyMetaRepository(workspace)
    source_repo = FsSourceDocumentRepository(workspace)
    processed_repo = FsProcessedDocumentRepository(workspace)
    registry = build_fins_processor_registry()

    return FinsToolService(
        company_repository=company_repo,
        source_repository=source_repo,
        processed_repository=processed_repo,
        processor_registry=registry,
    )


def list_ticker_filings(service: FinsToolService, ticker: str) -> list[dict[str, Any]]:
    """List all available filings for a ticker sorted by filing date descending."""
    result = service.list_documents(ticker=ticker)
    docs = result.get("documents", [])
    return sorted(
        docs,
        key=lambda d: str(d.get("filing_date") or d.get("report_date") or ""),
        reverse=True,
    )


def _infer_fiscal_context(
    report_date: str, fy_end_month: int, form_type: str
) -> tuple[Optional[int], Optional[str]]:
    """Infer (fiscal_year, fiscal_period) from a report date and fiscal year-end month.

    Heuristic: the fiscal year is named by the calendar year of its end month,
    so a report dated after the year-end month belongs to the next fiscal year
    (unless the year ends in December). Quarters are counted in 3-month steps
    from the year-end month; a 10-K is always FY.
    """
    if not report_date:
        return None, None
    year = int(report_date[:4])
    month = int(report_date[5:7])
    if form_type == "10-K":
        return year, "FY"
    months_since_fy_end = (month - fy_end_month) % 12
    quarter = 4 if months_since_fy_end == 0 else min(4, (months_since_fy_end + 2) // 3)
    fiscal_year = year + (1 if fy_end_month < 12 and month > fy_end_month else 0)
    return fiscal_year, f"Q{quarter}"


async def _ingest_filings_async(
    ticker: str, forms: tuple[str, ...], workspace: Path
) -> list[dict[str, Any]]:
    """Download the latest filing per form from SEC EDGAR into the workspace.

    Requires the SEC_USER_AGENT env var (SEC fair-access policy). Registers the
    company so the read tools (`list`/`sections`/`read`/`verify`) resolve the
    ticker afterwards.
    """
    downloader = SecDownloader(workspace)
    try:
        ticker = downloader.normalize_ticker(ticker)
        cik, company_name, cik10 = await downloader.resolve_company(ticker)
        submissions = await downloader.fetch_submissions(cik10)
        recent = submissions.get("filings", {}).get("recent", {})

        picked: dict[str, int] = {}
        for idx, form in enumerate(recent.get("form", [])):
            if form in forms and form not in picked:
                picked[form] = idx
        if not picked:
            return []

        ten_k_idx = picked.get("10-K")
        fy_end_month = 12
        if ten_k_idx is not None and recent["reportDate"][ten_k_idx]:
            fy_end_month = int(recent["reportDate"][ten_k_idx][5:7])

        FsCompanyMetaRepository(workspace).upsert_company_meta(
            CompanyMeta(
                company_id=cik,
                company_name=company_name,
                ticker=ticker,
                market="US",
                resolver_version="cli-ingest-1",
                updated_at=now_iso8601(),
                ticker_aliases=[],
            )
        )
        file_store = LocalFileStore(root=workspace / "portfolio", scheme="local")
        source_repo = FsSourceDocumentRepository(workspace)
        existing_ids = set(source_repo.list_source_document_ids(ticker, SourceKind.FILING))

        ingested: list[dict[str, Any]] = []
        for form, idx in picked.items():
            accession = recent["accessionNumber"][idx]
            primary = recent["primaryDocument"][idx]
            filing_date = recent["filingDate"][idx]
            report_date = recent["reportDate"][idx]
            document_id = f"fil_{accession}"
            fiscal_year, fiscal_period = _infer_fiscal_context(report_date, fy_end_month, form)

            descriptors = await downloader.list_filing_files(
                cik=cik,
                accession_no_dash=accession.replace("-", ""),
                primary_document=primary,
                form_type=form,
            )
            stored: list[Any] = []

            def store_file(
                name: str, stream: Any, _document_id: str = document_id, _stored: list = stored
            ) -> Any:
                meta = file_store.put_object(f"{ticker}/filings/{_document_id}/{name}", stream)
                _stored.append(meta)
                return meta

            await downloader.download_files(
                remote_files=descriptors,
                overwrite=True,
                store_file=store_file,
                primary_document=primary,
            )
            request = SourceDocumentUpsertRequest(
                ticker=ticker,
                document_id=document_id,
                internal_document_id=accession,
                form_type=form,
                primary_document=primary,
                meta={
                    "accession_number": accession,
                    "company_id": cik,
                    "filing_date": filing_date,
                    "report_date": report_date,
                    "fiscal_year": fiscal_year,
                    "fiscal_period": fiscal_period,
                    "ingest_method": "download",
                    "ingest_complete": True,
                    "source_url": (
                        f"https://www.sec.gov/Archives/edgar/data/"
                        f"{cik}/{accession.replace('-', '')}/"
                    ),
                },
                files=list(stored),
            )
            action = "updated" if document_id in existing_ids else "created"
            if document_id in existing_ids:
                source_repo.update_source_document(request, SourceKind.FILING)
            else:
                source_repo.create_source_document(request, SourceKind.FILING)
            ingested.append(
                {
                    "form_type": form,
                    "document_id": document_id,
                    "filing_date": filing_date,
                    "report_date": report_date,
                    "fiscal_year": fiscal_year,
                    "fiscal_period": fiscal_period,
                    "action": action,
                }
            )
        return ingested
    finally:
        await downloader.close()


def ingest_ticker(
    ticker: str,
    forms: Optional[tuple[str, ...]] = None,
    workspace_root: Optional[Path | str] = None,
) -> list[dict[str, Any]]:
    """Ingest the latest filings for a ticker (sync wrapper for CLI use)."""
    workspace = resolve_workspace(workspace_root)
    return asyncio.run(_ingest_filings_async(ticker, forms or DEFAULT_INGEST_FORMS, workspace))


def get_latest_annual_report(service: FinsToolService, ticker: str) -> Optional[dict[str, Any]]:
    """Retrieve metadata for the latest annual report (10-K or 20-F)."""
    docs = list_ticker_filings(service, ticker)
    for doc in docs:
        dtype = str(doc.get("document_type") or "").lower()
        if "annual" in dtype or doc.get("fiscal_period") == "FY":
            return doc
    return docs[0] if docs else None


def get_document_sections_tree(
    service: FinsToolService,
    ticker: str,
    document_id: Optional[str] = None,
) -> dict[str, Any]:
    """Retrieve the hierarchical section tree for a filing."""
    target_doc_id = document_id
    if not target_doc_id:
        doc = get_latest_annual_report(service, ticker)
        if not doc:
            return {"ticker": ticker, "document_id": None, "sections": [], "citation": {}}
        target_doc_id = doc["document_id"]

    return dict(service.get_document_sections(ticker=ticker, document_id=target_doc_id))


def read_filing_section(
    service: FinsToolService,
    ticker: str,
    ref: str,
    document_id: Optional[str] = None,
) -> dict[str, Any]:
    """Read full section text and citation metadata."""
    target_doc_id = document_id
    if not target_doc_id:
        doc = get_latest_annual_report(service, ticker)
        if not doc:
            return {"error": f"No filings found for {ticker}"}
        target_doc_id = doc["document_id"]

    return dict(service.read_section(ticker=ticker, document_id=target_doc_id, ref=ref))


def estimate_token_count(text: str) -> int:
    """Estimate token count (approx 4 chars per token)."""
    return max(1, len(text) // 4)


def export_chunks_manifest(
    service: FinsToolService,
    ticker: str,
    document_id: Optional[str] = None,
    min_chars: int = 40,
    output_path: Optional[Path | str] = None,
) -> list[dict[str, Any]]:
    """Export filing sections into an Anki-compatible chunks manifest.

    Conforms to the networking `parse_chunks.py` contract:
    {chunk_id, file_path, heading, locator, content, token_count, citation}.
    """
    sections_result = get_document_sections_tree(service, ticker, document_id)
    doc_id = sections_result.get("document_id")
    if not doc_id:
        return []

    sections = sections_result.get("sections", [])
    chunks: list[dict[str, Any]] = []

    for s in sections:
        ref = s.get("ref")
        if not ref:
            continue
        try:
            sec_data = service.read_section(ticker=ticker, document_id=doc_id, ref=ref)
        except (KeyError, RuntimeError, ValueError):
            continue

        content = sec_data.get("content", "").strip()
        if len(content) < min_chars:
            continue

        citation = sec_data.get("citation", {})
        title = s.get("title") or "Untitled"
        item = s.get("item")
        form_type = citation.get("form_type") or "10-K"
        fy = citation.get("fiscal_year") or ""
        locator = f'{form_type} FY{fy} §{ref} ("{title}")'
        heading = f"{item} - {title}".strip(" -") if item else title

        chunk = {
            "chunk_id": f"sec:{ticker}:{doc_id}:{ref}",
            "file_path": f"portfolio/{ticker}/filings/{doc_id}",
            "heading": heading,
            "locator": locator,
            "content": content,
            "token_count": estimate_token_count(content),
            "citation": citation,
            "metadata": {
                "ticker": ticker,
                "document_id": doc_id,
                "ref": ref,
                "item": item,
                "topic": s.get("topic"),
                "level": s.get("level"),
                "word_count": sec_data.get("content_word_count", 0),
            },
        }
        chunks.append(chunk)

    if output_path:
        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(chunks, indent=2, ensure_ascii=False), encoding="utf-8")

    return chunks


def _extract_clean_search_keywords(text: str) -> str:
    """Clean and select key content words from a claim for BM25 search."""
    tokens = re.findall(r"\b[A-Za-z0-9%$.\-_]+\b", text)
    stopwords = {
        "the",
        "a",
        "an",
        "and",
        "or",
        "in",
        "on",
        "at",
        "to",
        "for",
        "of",
        "with",
        "by",
        "from",
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "have",
        "has",
        "had",
        "do",
        "does",
        "did",
        "that",
        "this",
        "these",
        "those",
        "it",
        "its",
        "as",
        "into",
    }
    keywords = [t for t in tokens if t.lower() not in stopwords]
    return " ".join(keywords[:10])


_CLAIM_NUMBER_RE = re.compile(r"\d+(?:\.\d+)?%?")


def _extract_claim_numbers(claim: str) -> list[str]:
    """Extract numeric tokens from a claim (e.g. "80.6", "70%", "2026")."""
    return _CLAIM_NUMBER_RE.findall(claim)


def _match_text_blob(match: dict[str, Any]) -> str:
    evidence = match.get("evidence", {})
    return f"{evidence.get('matched_text') or ''} {evidence.get('context') or ''}"


def _numeric_overlap(text: str, numbers: list[str]) -> int:
    return sum(1 for n in numbers if n in text)


def verify_claim_against_filing(
    service: FinsToolService,
    ticker: str,
    claim: str,
    document_id: Optional[str] = None,
) -> dict[str, Any]:
    """Execute a confirm pass: verify claim groundedness against filing text.

    Uses adaptive multi-query search to find supporting evidence spans and citations.
    """
    target_doc_id = document_id
    if not target_doc_id:
        doc = get_latest_annual_report(service, ticker)
        if not doc:
            return {"verified": False, "confidence": 0.0, "reason": f"No filing for {ticker}"}
        target_doc_id = doc["document_id"]

    query = _extract_clean_search_keywords(claim)
    if not query:
        return {"verified": False, "confidence": 0.0, "reason": "Empty search query from claim"}

    search_res = service.search_document(ticker=ticker, document_id=target_doc_id, query=query)
    matches = search_res.get("matches", [])
    total_matches = search_res.get("total_matches", len(matches))

    claim_numbers = _extract_claim_numbers(claim)
    pool = matches[:10]

    # Re-rank the raw BM25 order for display: spans containing the claim's
    # numbers first, exact phrases next, cover-page sections demoted. Without
    # this, boilerplate-heavy fragments crowd out the load-bearing paragraph.
    def rank_key(m: dict[str, Any]) -> tuple[int, int, int]:
        title = str(m.get("section", {}).get("title") or "")
        return (
            _numeric_overlap(_match_text_blob(m), claim_numbers),
            1 if m.get("is_exact_phrase") else 0,
            0 if "cover" in title.lower() else 1,
        )

    ranked = sorted(pool, key=rank_key, reverse=True)

    # A number-bearing claim is anchored only if some matched span actually
    # contains one of its numbers; otherwise boilerplate matches inflate the
    # count-based confidence without touching the authoritative figure.
    numbers_anchored = True
    if claim_numbers:
        numbers_anchored = any(
            _numeric_overlap(_match_text_blob(m), claim_numbers) > 0 for m in pool
        )

    evidence_spans: list[dict[str, Any]] = []
    has_exact = False

    for m in ranked[:5]:
        section = m.get("section", {})
        evidence = m.get("evidence", {})
        if m.get("is_exact_phrase"):
            has_exact = True
        evidence_spans.append(
            {
                "section_ref": section.get("ref"),
                "section_title": section.get("title"),
                "matched_text": evidence.get("matched_text"),
                "context": evidence.get("context"),
            }
        )

    confidence = 0.0
    if has_exact:
        confidence = 0.95
    elif total_matches >= 5:
        confidence = 0.80
    elif total_matches >= 1:
        confidence = 0.60
    if claim_numbers and not numbers_anchored:
        confidence = min(confidence, 0.60)

    return {
        "verified": total_matches > 0,
        "confidence": confidence,
        "query": query,
        "total_matches": total_matches,
        "numbers_anchored": numbers_anchored,
        "document_id": target_doc_id,
        "evidence_spans": evidence_spans,
        "citation": search_res.get("citation"),
    }


def extract_evidence_candidates(
    service: FinsToolService,
    ticker: str,
    document_id: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Extract high-signal candidate items for the evidence log."""
    sections_res = get_document_sections_tree(service, ticker, document_id)
    doc_id = sections_res.get("document_id")
    if not doc_id:
        return []

    sections = sections_res.get("sections", [])
    candidates: list[dict[str, Any]] = []

    target_topics = {"business", "risk_factors", "financial_statements"}
    high_signal_titles = {"customer", "sales", "supplier", "concentration", "ai", "product"}

    for s in sections:
        ref = s.get("ref")
        topic = s.get("topic")
        title = s.get("title") or ""
        title_lower = title.lower()

        is_match = (topic in target_topics) and any(kw in title_lower for kw in high_signal_titles)
        if not is_match or not ref:
            continue

        try:
            sec_data = service.read_section(ticker=ticker, document_id=doc_id, ref=ref)
        except (KeyError, RuntimeError, ValueError):
            continue

        content = sec_data.get("content", "").strip()
        if len(content) < 50:
            continue

        citation = sec_data.get("citation", {})
        sentences = [sen.strip() for sen in content.split(".") if len(sen.strip()) > 20]
        snippet = ". ".join(sentences[:2]) + "." if sentences else content[:200]

        direction = (
            "bearish" if topic == "risk_factors" or "concentration" in title_lower else "bullish"
        )
        if "customer" in title_lower and "concentration" not in title_lower:
            direction = "neutral"

        candidates.append(
            {
                "date": citation.get("filing_date") or str(citation.get("fiscal_year")),
                "claim": f"SEC {citation.get('form_type')} (§{ref} {title}): {snippet}",
                "source_url": "https://www.sec.gov/edgar",
                "direction": direction,
                "strength": 0.60,
                "locator": f"§{ref} ({title})",
                "accession_no": citation.get("accession_no"),
                "document_id": doc_id,
            }
        )

    return candidates


def main() -> None:
    """CLI entrypoint for filings adapter operations."""
    parser = argparse.ArgumentParser(description="SEC Filings Tooling & Manifest Adapter")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # list
    list_p = subparsers.add_parser("list", help="List filings for a ticker")
    list_p.add_argument("--ticker", required=True, help="Stock ticker (e.g. ANET)")
    list_p.add_argument("--workspace", default=None, help="Workspace directory override")

    # sections
    sec_p = subparsers.add_parser("sections", help="List section tree for a filing")
    sec_p.add_argument("--ticker", required=True)
    sec_p.add_argument("--doc", default=None, help="Document ID (defaults to latest annual report)")
    sec_p.add_argument("--workspace", default=None)

    # read
    read_p = subparsers.add_parser("read", help="Read a specific filing section")
    read_p.add_argument("--ticker", required=True)
    read_p.add_argument("--ref", required=True, help="Section ref (e.g. s_0002_c06)")
    read_p.add_argument("--doc", default=None)
    read_p.add_argument("--workspace", default=None)

    # export-manifest
    exp_p = subparsers.add_parser("export-manifest", help="Export Anki chunks manifest")
    exp_p.add_argument("--ticker", required=True)
    exp_p.add_argument("--doc", default=None)
    exp_p.add_argument("--out", required=True, help="Output JSON path")
    exp_p.add_argument("--workspace", default=None)

    # verify
    ver_p = subparsers.add_parser(
        "verify", help="Execute confirm pass verifying claim against filing"
    )
    ver_p.add_argument("--ticker", required=True)
    ver_p.add_argument("--claim", required=True, help="Claim text to verify")
    ver_p.add_argument("--doc", default=None)
    ver_p.add_argument("--workspace", default=None)

    # candidates
    cand_p = subparsers.add_parser("candidates", help="Extract evidence log candidates")
    cand_p.add_argument("--ticker", required=True)
    cand_p.add_argument("--doc", default=None)
    cand_p.add_argument("--workspace", default=None)

    # ingest
    ing_p = subparsers.add_parser(
        "ingest", help="Download latest filings for a ticker from SEC EDGAR"
    )
    ing_p.add_argument("--ticker", required=True)
    ing_p.add_argument(
        "--forms",
        default=",".join(DEFAULT_INGEST_FORMS),
        help="Comma-separated SEC forms, latest filing each (default: 10-K,10-Q)",
    )
    ing_p.add_argument("--workspace", default=None)

    args = parser.parse_args()

    if args.command == "ingest":
        forms = tuple(f.strip() for f in args.forms.split(",") if f.strip())
        ingested = ingest_ticker(args.ticker, forms=forms, workspace_root=args.workspace)
        print(f"Ingested {len(ingested)} filing(s) for {args.ticker.upper()}:")
        for d in ingested:
            print(
                f"  {d['document_id']} | {d['form_type']:<5} | FY{d.get('fiscal_year', '----')} {d.get('fiscal_period') or ''} | filed {d.get('filing_date', 'N/A')} | {d.get('action', '')}"
            )
        return

    service = build_filings_service(args.workspace)

    if args.command == "list":
        docs = list_ticker_filings(service, args.ticker)
        print(f"Filings for {args.ticker.upper()} ({len(docs)} found):")
        for d in docs:
            doc_type = str(d.get("document_type") or "N/A").replace("_report", "")
            print(
                f"  {d.get('document_id')} | {doc_type:<10} | FY{d.get('fiscal_year', '----')} | {d.get('filing_date', 'N/A')}"
            )

    elif args.command == "sections":
        res = get_document_sections_tree(service, args.ticker, args.doc)
        sections = res.get("sections", [])
        print(f"Sections for {args.ticker.upper()} ({len(sections)} items):")
        for s in sections[:25]:
            indent = "  " * (s.get("level", 1) - 1)
            print(f"{indent}- [{s.get('ref')}] {s.get('title')} ({s.get('topic') or 'general'})")

    elif args.command == "read":
        sec = read_filing_section(service, args.ticker, args.ref, args.doc)
        citation = sec.get("citation", {})
        print(f"=== {citation.get('heading', 'Section')} ({args.ref}) ===")
        print(
            f"Filing: {citation.get('form_type')} FY{citation.get('fiscal_year')} ({citation.get('filing_date')})"
        )
        print("\n" + sec.get("content", ""))

    elif args.command == "export-manifest":
        chunks = export_chunks_manifest(service, args.ticker, args.doc, output_path=args.out)
        print(f"Exported {len(chunks)} chunks for {args.ticker} to {args.out}")

    elif args.command == "verify":
        res = verify_claim_against_filing(service, args.ticker, args.claim, args.doc)
        print(
            f"Verification: {'PASS' if res['verified'] else 'FAIL'} (confidence: {res['confidence'] * 100:.0f}%)"
        )
        print(f"Query terms: {res['query']}")
        print(f"Matches count: {res['total_matches']}")
        for span in res.get("evidence_spans", [])[:2]:
            print(f"  - [{span.get('section_ref')}] {span.get('section_title')}:")
            print(f'    "{span.get("context")}"')

    elif args.command == "candidates":
        cands = extract_evidence_candidates(service, args.ticker, args.doc)
        print(f"Extracted {len(cands)} evidence candidates for {args.ticker}:")
        for c in cands:
            print(f"  [{c['direction'].upper()}] {c['claim'][:120]}...")


if __name__ == "__main__":
    main()
