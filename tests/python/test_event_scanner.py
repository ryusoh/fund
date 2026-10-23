"""Tests for event_scanner (scripts.analysis.event_scanner)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from scripts.analysis.event_scanner import (
    SEC_USER_AGENT_ENV,
    main,
    scan_edgar_leg,
    scan_review_dates,
    tracked_tickers,
)


def _submissions(rows: list[tuple[str, str, str, str]]) -> dict[str, Any]:
    """Canned submissions payload: parallel arrays, one tuple per filing."""
    return {
        "filings": {
            "recent": {
                "form": [r[0] for r in rows],
                "filingDate": [r[1] for r in rows],
                "accessionNumber": [r[2] for r in rows],
                "primaryDocument": [r[3] for r in rows],
            }
        }
    }


class _FakeDownloader:
    """Test double for SecDownloader; canned payload, no network."""

    payload: dict[str, Any] | Exception = {}

    def __init__(self, workspace: Path) -> None:
        self.workspace = workspace

    async def close(self) -> None:
        return None

    def normalize_ticker(self, ticker: str) -> str:
        return ticker.upper()

    async def resolve_company(self, ticker: str) -> tuple[str, str, str]:
        return ("0000320193", "Fake Co", "0000320193")

    async def fetch_submissions(self, cik10: str) -> dict[str, Any]:
        if isinstance(self.payload, Exception):
            raise self.payload
        return self.payload


@pytest.fixture
def fake_downloader(monkeypatch: pytest.MonkeyPatch) -> type[_FakeDownloader]:
    monkeypatch.setenv(SEC_USER_AGENT_ENV, "event-scanner-test contact@example.com")
    monkeypatch.setattr("scripts.analysis.event_scanner.SecDownloader", _FakeDownloader)
    return _FakeDownloader


@pytest.fixture
def analysis_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setenv("FILINGS_WORKSPACE", str(tmp_path / "ws"))
    data_dir = tmp_path / "analysis"
    data_dir.mkdir()
    return data_dir


def _write_ticker(data_dir: Path, ticker: str, review_date: str | None) -> None:
    entry: dict[str, Any] = {"date": "2026-06-01", "action": "HOLD"}
    if review_date is not None:
        entry["review_date"] = review_date
    config = {"decision_journal": [entry]}
    (data_dir / f"{ticker}.json").write_text(json.dumps(config), encoding="utf-8")


def test_tracked_tickers_excludes_non_ticker_configs(analysis_dir: Path) -> None:
    _write_ticker(analysis_dir, "AAPL", "2027-01-01")
    for name in ("index.json", "theme_timeline.json", "watchlist.json"):
        (analysis_dir / name).write_text(json.dumps({"tickers": []}), encoding="utf-8")
    assert tracked_tickers(analysis_dir) == ["AAPL"]


def test_edgar_form_filtering_and_lookback_boundary(
    fake_downloader: type[_FakeDownloader],
    analysis_dir: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    fake_downloader.payload = _submissions(
        [
            ("8-K", "2026-06-10", "0000320193-26-000001", "a.htm"),
            ("10-Q", "2026-06-01", "0000320193-26-000002", "b.htm"),
            ("4-K", "2026-06-12", "0000320193-26-000003", "c.htm"),
            ("10-K", "2026-05-31", "0000320193-26-000004", "d.htm"),
        ]
    )
    _write_ticker(analysis_dir, "AAPL", "2027-01-01")
    code = main(["--data-dir", str(analysis_dir), "--as-of", "2026-06-15"])
    captured = capsys.readouterr().out
    assert code == 0
    assert (
        "AAPL 8-K filed 2026-06-10: https://www.sec.gov/Archives/edgar/data/320193/000032019326000001/a.htm"
        in captured
    )
    assert (
        "AAPL 10-Q filed 2026-06-01: https://www.sec.gov/Archives/edgar/data/320193/000032019326000002/b.htm"
        in captured
    )
    assert "4-K" not in captured
    assert "2026-05-31" not in captured


def test_edgar_future_filings_not_flagged(
    fake_downloader: type[_FakeDownloader], analysis_dir: Path
) -> None:
    fake_downloader.payload = _submissions([("8-K", "2026-06-20", "0000320193-26-000001", "a.htm")])
    _write_ticker(analysis_dir, "AAPL", "2027-01-01")
    flags = scan_edgar_leg(
        ["AAPL"], analysis_dir / "ws", pytest.importorskip("datetime").date(2026, 6, 15), 14
    )
    assert flags == []


def test_edgar_skips_non_sec_tickers(
    monkeypatch: pytest.MonkeyPatch,
    analysis_dir: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setenv(SEC_USER_AGENT_ENV, "event-scanner-test contact@example.com")

    class _ExplodingDownloader:
        def __init__(self, workspace: Path) -> None:
            raise AssertionError("downloader must not be constructed for skipped tickers")

    monkeypatch.setattr("scripts.analysis.event_scanner.SecDownloader", _ExplodingDownloader)
    flags = scan_edgar_leg(
        ["VT"], analysis_dir / "ws", pytest.importorskip("datetime").date(2026, 6, 15), 14
    )
    assert flags == []
    assert capsys.readouterr().err == ""


def test_review_dates_past_soon_future(
    fake_downloader: type[_FakeDownloader],
    analysis_dir: Path,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv(SEC_USER_AGENT_ENV, raising=False)
    _write_ticker(analysis_dir, "PAST", "2026-06-01")
    _write_ticker(analysis_dir, "SOON", "2026-06-20")
    _write_ticker(analysis_dir, "FUTURE", "2026-08-01")

    code = main(["--data-dir", str(analysis_dir), "--as-of", "2026-06-15"])
    out = capsys.readouterr().out
    assert code == 0
    assert "PAST review_date 2026-06-01 (14 days past)" in out
    assert "SOON review_date 2026-06-20 (due in 5 days)" in out
    assert "FUTURE" not in out


def test_fail_open_on_downloader_runtime_error(
    fake_downloader: type[_FakeDownloader],
    analysis_dir: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    fake_downloader.payload = RuntimeError("EDGAR unreachable")
    _write_ticker(analysis_dir, "AAPL", "2027-01-01")

    flags = scan_edgar_leg(
        ["AAPL"], analysis_dir / "ws", pytest.importorskip("datetime").date(2026, 6, 15), 14
    )
    assert flags == []
    assert "Warning: EDGAR leg failed for AAPL: EDGAR unreachable" in capsys.readouterr().err


def test_edgar_skipped_without_user_agent(
    fake_downloader: type[_FakeDownloader],
    analysis_dir: Path,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv(SEC_USER_AGENT_ENV, raising=False)
    _write_ticker(analysis_dir, "AAPL", "2027-01-01")

    flags = scan_edgar_leg(
        ["AAPL"], analysis_dir / "ws", pytest.importorskip("datetime").date(2026, 6, 15), 14
    )
    assert flags == []
    assert f"Warning: {SEC_USER_AGENT_ENV} unset" in capsys.readouterr().err


def test_main_fail_on_flag_exit_codes(
    fake_downloader: type[_FakeDownloader],
    analysis_dir: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    fake_downloader.payload = _submissions([])
    _write_ticker(analysis_dir, "AAPL", "2026-06-01")

    code = main(["--data-dir", str(analysis_dir), "--as-of", "2026-06-15", "--fail-on-flag"])
    assert code == 1
    out = capsys.readouterr().out
    assert "Summary: 1 event flag(s) found across 1 ticker(s)." in out

    code = main(["--data-dir", str(analysis_dir), "--as-of", "2026-06-15"])
    assert code == 0

    _write_ticker(analysis_dir, "AAPL", "2027-01-01")
    code = main(["--data-dir", str(analysis_dir), "--as-of", "2026-06-15", "--fail-on-flag"])
    assert code == 0
    assert "Summary: 0 event flags found." in capsys.readouterr().out


def test_malformed_review_date_warns(
    fake_downloader: type[_FakeDownloader],
    analysis_dir: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    fake_downloader.payload = _submissions([])
    _write_ticker(analysis_dir, "AAPL", "not-a-date")
    flags = scan_review_dates(
        analysis_dir, ["AAPL"], pytest.importorskip("datetime").date(2026, 6, 15), 14
    )
    assert flags == []
    assert (
        "Warning: malformed review_date in AAPL decision_journal: not-a-date"
        in capsys.readouterr().err
    )


def test_json_out_dump(
    fake_downloader: type[_FakeDownloader], analysis_dir: Path, tmp_path: Path
) -> None:
    fake_downloader.payload = _submissions([("8-K", "2026-06-10", "0000320193-26-000001", "a.htm")])
    _write_ticker(analysis_dir, "AAPL", "2026-06-20")
    out_path = tmp_path / "event_flags.json"
    code = main(
        ["--data-dir", str(analysis_dir), "--as-of", "2026-06-15", "--json-out", str(out_path)]
    )
    assert code == 0
    dumped = json.loads(out_path.read_text(encoding="utf-8"))
    assert isinstance(dumped["generatedAt"], str) and dumped["generatedAt"]
    filing = dumped["flags"][0]
    assert filing == {
        "ticker": "AAPL",
        "kind": "filing",
        "form": "8-K",
        "date": "2026-06-10",
        "url": "https://www.sec.gov/Archives/edgar/data/320193/000032019326000001/a.htm",
    }
    review = dumped["flags"][1]
    assert review == {"ticker": "AAPL", "kind": "review-date", "date": "2026-06-20"}
