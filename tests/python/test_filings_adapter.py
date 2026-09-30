"""Tests for the SEC filings adapter module (scripts.analysis.filings_adapter)."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

from scripts.analysis.filings_adapter import (
    _extract_clean_search_keywords,
    build_filings_service,
    estimate_token_count,
    export_chunks_manifest,
    extract_evidence_candidates,
    get_document_sections_tree,
    get_latest_annual_report,
    list_ticker_filings,
    main,
    read_filing_section,
    resolve_workspace,
    verify_claim_against_filing,
)


def test_resolve_workspace(tmp_path: Path, monkeypatch) -> None:
    # 1. Override takes highest precedence
    custom = tmp_path / "custom_ws"
    ws = resolve_workspace(custom)
    assert ws == custom
    assert custom.exists()

    # 2. Environment variable
    env_ws = tmp_path / "env_ws"
    monkeypatch.setenv("FILINGS_WORKSPACE", str(env_ws))
    assert resolve_workspace() == env_ws
    assert env_ws.exists()

    # 3. Default fallback
    monkeypatch.delenv("FILINGS_WORKSPACE", raising=False)
    default_ws = resolve_workspace()
    assert isinstance(default_ws, Path)


def test_build_filings_service(tmp_path: Path) -> None:
    service = build_filings_service(tmp_path)
    assert service is not None
    assert hasattr(service, "list_documents")


def test_estimate_token_count() -> None:
    assert estimate_token_count("") == 1
    assert estimate_token_count("abc") == 1
    assert estimate_token_count("12345678") == 2
    assert estimate_token_count("a" * 100) == 25


def test_extract_clean_search_keywords() -> None:
    claim = "Two of our customers accounted for 26% and 16% of total revenue in 2025"
    keywords = _extract_clean_search_keywords(claim)
    assert "Two" in keywords
    assert "customers" in keywords
    assert "revenue" in keywords
    assert "of" not in keywords.split()
    assert "in" not in keywords.split()


def test_list_ticker_filings_and_latest_annual() -> None:
    mock_service = MagicMock()
    mock_service.list_documents.return_value = {
        "documents": [
            {
                "document_id": "doc1",
                "filing_date": "2024-02-15",
                "fiscal_period": "FY",
                "document_type": "annual_report",
            },
            {
                "document_id": "doc2",
                "filing_date": "2025-02-15",
                "fiscal_period": "FY",
                "document_type": "annual_report",
            },
            {
                "document_id": "doc3",
                "filing_date": "2024-08-10",
                "fiscal_period": "Q2",
                "document_type": "quarterly_report",
            },
        ]
    }

    docs = list_ticker_filings(mock_service, "ANET")
    assert len(docs) == 3
    # Sorted newest first
    assert docs[0]["document_id"] == "doc2"

    latest = get_latest_annual_report(mock_service, "ANET")
    assert latest is not None
    assert latest["document_id"] == "doc2"

    # Fallback when no annual reports
    mock_service.list_documents.return_value = {
        "documents": [{"document_id": "doc_q", "document_type": "quarterly_report"}]
    }
    fallback = get_latest_annual_report(mock_service, "ANET")
    assert fallback is not None
    assert fallback["document_id"] == "doc_q"


def test_get_document_sections_tree() -> None:
    mock_service = MagicMock()
    mock_service.list_documents.return_value = {
        "documents": [{"document_id": "doc1", "document_type": "annual_report"}]
    }
    mock_service.get_document_sections.return_value = {
        "ticker": "ANET",
        "document_id": "doc1",
        "sections": [{"ref": "s_0001", "title": "Overview"}],
    }

    res = get_document_sections_tree(mock_service, "ANET")
    assert res["document_id"] == "doc1"
    assert len(res["sections"]) == 1

    # Empty filings fallback
    mock_service.list_documents.return_value = {"documents": []}
    res_empty = get_document_sections_tree(mock_service, "ANET")
    assert res_empty["document_id"] is None


def test_read_filing_section() -> None:
    mock_service = MagicMock()
    mock_service.list_documents.return_value = {
        "documents": [{"document_id": "doc1", "document_type": "annual_report"}]
    }
    mock_service.read_section.return_value = {
        "content": "Sample content text.",
        "citation": {"heading": "Overview"},
    }

    sec = read_filing_section(mock_service, "ANET", "s_0001")
    assert sec["content"] == "Sample content text."
    assert sec["citation"]["heading"] == "Overview"

    # No doc found error
    mock_service.list_documents.return_value = {"documents": []}
    sec_err = read_filing_section(mock_service, "ANET", "s_0001")
    assert "error" in sec_err


def test_export_chunks_manifest(tmp_path: Path) -> None:
    mock_service = MagicMock()
    mock_service.list_documents.return_value = {
        "documents": [{"document_id": "doc1", "document_type": "annual_report"}]
    }
    mock_service.get_document_sections.return_value = {
        "ticker": "ANET",
        "document_id": "doc1",
        "sections": [
            {"ref": "s_0001", "title": "Item 1 - Business", "item": "Item 1", "topic": "business"},
            {"ref": "s_0002", "title": "Short", "item": None, "topic": "general"},
            {"ref": "s_err", "title": "Fails", "item": None, "topic": "general"},
            {"ref": None, "title": "No Ref"},
        ],
    }

    def mock_read(ticker, document_id, ref):
        if ref == "s_0001":
            return {
                "content": "This is a substantial business description section that exceeds the min length threshold.",
                "citation": {"form_type": "10-K", "fiscal_year": 2025, "filing_date": "2026-02-15"},
                "content_word_count": 13,
            }
        if ref == "s_err":
            raise RuntimeError("Read failure")
        return {"content": "Tiny", "citation": {}}

    mock_service.read_section.side_effect = mock_read

    out_file = tmp_path / "manifest.json"
    chunks = export_chunks_manifest(
        mock_service, "ANET", "doc1", min_chars=30, output_path=out_file
    )

    assert len(chunks) == 1
    chunk = chunks[0]
    assert chunk["chunk_id"] == "sec:ANET:doc1:s_0001"
    assert "Item 1" in chunk["heading"]
    assert "FY2025" in chunk["locator"]
    assert chunk["token_count"] > 1

    # Verify file output
    assert out_file.exists()
    saved = json.loads(out_file.read_text(encoding="utf-8"))
    assert len(saved) == 1
    assert saved[0]["chunk_id"] == chunk["chunk_id"]

    # When no document exists
    mock_service.list_documents.return_value = {"documents": []}
    assert export_chunks_manifest(mock_service, "UNKNOWN") == []


def test_verify_claim_against_filing() -> None:
    mock_service = MagicMock()
    mock_service.list_documents.return_value = {
        "documents": [{"document_id": "doc1", "document_type": "annual_report"}]
    }
    mock_service.search_document.return_value = {
        "total_matches": 6,
        "matches": [
            {
                "section": {"ref": "s_0002_c06", "title": "Our Customers"},
                "is_exact_phrase": True,
                "evidence": {
                    "matched_text": "represented 26% and 16% of our total revenue",
                    "context": "Sales to these two customers represented 26% and 16% of our total revenue.",
                },
            }
        ],
        "citation": {"accession_no": "0001596532-26-000013"},
    }

    res = verify_claim_against_filing(
        mock_service, "ANET", "Two customers represented 26% and 16% of revenue"
    )
    assert res["verified"] is True
    assert res["confidence"] >= 0.90
    assert len(res["evidence_spans"]) == 1
    assert res["evidence_spans"][0]["section_ref"] == "s_0002_c06"

    # Partial matches (no exact phrase)
    mock_service.search_document.return_value = {
        "total_matches": 2,
        "matches": [
            {
                "section": {"ref": "s_1", "title": "Some Topic"},
                "is_exact_phrase": False,
                "evidence": {"matched_text": "foo", "context": "bar"},
            }
        ],
    }
    res_partial = verify_claim_against_filing(mock_service, "ANET", "some topic query")
    assert res_partial["verified"] is True
    assert res_partial["confidence"] == 0.60

    # No matches found
    mock_service.search_document.return_value = {"total_matches": 0, "matches": []}
    res_none = verify_claim_against_filing(mock_service, "ANET", "nonexistent phrase")
    assert res_none["verified"] is False
    assert res_none["confidence"] == 0.0

    # Empty search query
    res_empty_q = verify_claim_against_filing(mock_service, "ANET", "the in on at")
    assert res_empty_q["verified"] is False

    # No document found
    mock_service.list_documents.return_value = {"documents": []}
    res_no_doc = verify_claim_against_filing(mock_service, "UNKNOWN", "some claim")
    assert res_no_doc["verified"] is False


def test_extract_evidence_candidates() -> None:
    mock_service = MagicMock()
    mock_service.list_documents.return_value = {
        "documents": [{"document_id": "doc1", "document_type": "annual_report"}]
    }
    mock_service.get_document_sections.return_value = {
        "ticker": "ANET",
        "document_id": "doc1",
        "sections": [
            {
                "ref": "s_0003_c12",
                "title": "Risks Related to Supply Chain",
                "topic": "risk_factors",
            },
            {"ref": "s_0002_c06", "title": "Our Customers", "topic": "business"},
            {"ref": "s_0002_c10", "title": "Product Overview", "topic": "business"},
            {"ref": "s_err", "title": "Customer Error", "topic": "business"},
            {"ref": "s_ignored", "title": "Unrelated Notice", "topic": "general"},
        ],
    }

    def mock_read(ticker, document_id, ref):
        if ref == "s_0003_c12":
            return {
                "content": "Single source suppliers present inventory and delivery disruption risks to manufacturing. Disruption could harm operations.",
                "citation": {
                    "form_type": "10-K",
                    "filing_date": "2026-02-15",
                    "accession_no": "0001",
                },
            }
        if ref == "s_0002_c06":
            return {
                "content": "Two customers represented 26% and 16% of our total revenue in 2025. Other customers diversified across enterprise.",
                "citation": {
                    "form_type": "10-K",
                    "filing_date": "2026-02-15",
                    "accession_no": "0001",
                },
            }
        if ref == "s_0002_c10":
            return {
                "content": "Short description.",
                "citation": {},
            }
        raise RuntimeError("Section read failure")

    mock_service.read_section.side_effect = mock_read

    cands = extract_evidence_candidates(mock_service, "ANET", "doc1")
    assert len(cands) == 2
    assert any(c["direction"] == "bearish" for c in cands)
    assert any(c["direction"] == "neutral" for c in cands)
    assert all("claim" in c and "source_url" in c for c in cands)

    # When no document exists
    mock_service.list_documents.return_value = {"documents": []}
    assert extract_evidence_candidates(mock_service, "UNKNOWN") == []


def test_cli_subcommands(capsys, monkeypatch, tmp_path: Path) -> None:
    mock_service = MagicMock()
    mock_service.list_documents.return_value = {
        "documents": [
            {
                "document_id": "doc1",
                "form_type": "10-K",
                "fiscal_year": 2025,
                "filing_date": "2026-02-17",
            }
        ]
    }
    mock_service.get_document_sections.return_value = {
        "ticker": "ANET",
        "document_id": "doc1",
        "sections": [{"ref": "s_1", "title": "Item 1", "level": 1, "topic": "business"}],
    }
    mock_service.read_section.return_value = {
        "content": "Full section text content for testing purposes.",
        "citation": {
            "form_type": "10-K",
            "fiscal_year": 2025,
            "filing_date": "2026-02-17",
            "heading": "Item 1",
        },
    }
    mock_service.search_document.return_value = {
        "total_matches": 1,
        "matches": [
            {
                "section": {"ref": "s_1", "title": "Item 1"},
                "is_exact_phrase": True,
                "evidence": {
                    "matched_text": "text content",
                    "context": "Full section text content.",
                },
            }
        ],
        "citation": {"form_type": "10-K"},
    }

    with patch("scripts.analysis.filings_adapter.build_filings_service", return_value=mock_service):
        # 1. list
        monkeypatch.setattr("sys.argv", ["filings_adapter", "list", "--ticker", "ANET"])
        main()
        out = capsys.readouterr().out
        assert "Filings for ANET" in out
        assert "doc1" in out

        # 2. sections
        monkeypatch.setattr("sys.argv", ["filings_adapter", "sections", "--ticker", "ANET"])
        main()
        out = capsys.readouterr().out
        assert "Sections for ANET" in out
        assert "Item 1" in out

        # 3. read
        monkeypatch.setattr(
            "sys.argv", ["filings_adapter", "read", "--ticker", "ANET", "--ref", "s_1"]
        )
        main()
        out = capsys.readouterr().out
        assert "=== Item 1 (s_1) ===" in out
        assert "Full section text content" in out

        # 4. export-manifest
        out_file = tmp_path / "cli_manifest.json"
        monkeypatch.setattr(
            "sys.argv",
            ["filings_adapter", "export-manifest", "--ticker", "ANET", "--out", str(out_file)],
        )
        main()
        out = capsys.readouterr().out
        assert "Exported" in out

        # 5. verify
        monkeypatch.setattr(
            "sys.argv", ["filings_adapter", "verify", "--ticker", "ANET", "--claim", "text content"]
        )
        main()
        out = capsys.readouterr().out
        assert "Verification: PASS" in out

        # 6. candidates
        monkeypatch.setattr("sys.argv", ["filings_adapter", "candidates", "--ticker", "ANET"])
        main()
        out = capsys.readouterr().out
        assert "evidence candidates" in out
