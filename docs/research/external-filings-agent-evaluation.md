# External Filings-Analysis Agent — Adoption Evaluation

**Status: Findings / Recommendation**
**Date: 2026-09-29**

**Adopt the pattern and (maybe) a vendored subset — never the whole system.**

1. **License is clean** (Apache-2.0, single-author NOTICE) — vendoring a
   modified subset is permitted.
2. **The genuinely valuable, differentiated part is the Fins data layer plus
   the evidence-audit loop**: primary-source filings pipelines (SEC EDGAR
   direct, CNINFO, HKEXnews) with per-form processors and XBRL access, and a
   write → audit → confirm → repair pipeline that hard-fails reports lacking
   evidence anchors. Both fill real gaps in our stack (fund has yfinance
   market data but no filings-level fundamentals; our research skills already
   enforce citation contracts but have no machine-checked evidence layer for
   filings).
3. **The Host/Engine daemon is a poor fit**: it is a *second agent runtime*
   (SQLite sessions, LLM API runner, WeChat UI) — while our ecosystem's
   deliberate architecture descopes LLM invocation to the interactive
   code-agent (networking's research-agent spec, Layer 4) and uses git/docs as
   the ledger. Adopting the daemon would compete with, not serve, the
   "ask questions in the code-agent chat" interface.
4. **It is a dormant one-person alpha** (last push 2026-05-04, ~5 months stale
   at evaluation time; 77/90 commits by one author; self-declared Alpha v0.1.4;
   Windows CI leg red). Wholesale adoption means adopting a maintenance
   burden, not a product.
5. **Recommended sequence**: (a) evaluate as an external appliance in a
   throwaway venv against our actual tickers (ANET, GOOG, PDD — all
   SEC-filers, PDD via 20-F); (b) if the filings output proves valuable, vendor
   only the Fins subset into fund; (c) port the evidence-audit *pattern* into
   our existing research/thesis skills rather than importing their LLM
   pipeline. Do not clone-and-improve the whole repo.

## 1. What the candidate project is (verified against source)

A strict 4-layer pipeline where the docs match the code
(`README.md` + `docs/architect.md:30-48`):

- **UI** (CLI / Streamlit web / WeChat daemon) → **Service** (only layer that
  knows business semantics like `ticker`) → **Host** (governance runtime) →
  **Agent** (message executor).
- **Host**: SQLite-backed runtime — 7-state run machine, concurrency lanes,
  deadline watchers, two-level cancel, resumable pending turns with CAS leases
  and fence tokens, idempotent at-least-once reply outbox, two-tier
  conversation memory (`host/README.md:80-305`; `host/host.py` ≈ 2,114 lines).
- **Engine**: provider-agnostic agent loop — one OpenAI-compatible SSE runner
  covering DeepSeek/OpenAI/Anthropic/Gemini/Qwen/Ollama via config; tool
  registry; context budgets; structured tool-trace recorder
  (`engine/README.md:270-285`).
- **Fins**: the filings domain package — download/upload/process pipelines,
  per-SEC-form processor registry, and 9 LLM-facing read tools
  (`list_documents`, `read_section`, `search_document`, `list_tables`,
  `get_financial_statement`, `query_xbrl_facts`, …;
  `fins/tools/fins_tools.py:84-96`).
- **Config**: JSON model catalog with `{{ENV_VAR}}` secret placeholders;
  declarative scene manifests assembling prompts from typed fragments with
  model allowlists (`config/prompts/manifests/confirm.json:1-70`).

**"Host-constrained LLM-in-the-loop" is real**: the LLM never receives
`ticker` or `model_name` as structured fields — Service degrades them into
prompt text, and the Agent gets only final `messages` plus an intersected
toolset (scene manifest ∩ selected toolsets ∩ execution permissions)
(`README.md:709-745, 892-928`). All five toolsets are read-only
(`config/toolset_registrars.json`) — no shell/file-action tools.

## 2. The auditability claim — mostly verified

The marketing line is "data has confidence levels; conclusions are auditable
and traceable." Verified in code:

- Every report chapter must end with a `证据与出处` (evidence & sources)
  section of pipe-delimited `source | type/ID | date | locator` lines; an
  audit **hard-fails** chapters missing it
  (`services/internal/write_pipeline/audit_rules.py:924-947`).
- A dedicated **confirm scene** re-verifies each evidence anchor with live
  filings + web tools (up to 20 tool iterations), emitting statuses like
  `SUPPORTED_BUT_ANCHOR_TOO_COARSE`, followed by *mechanical* anchor rewriting
  with re-validation (`audit_evidence_rewriter.py:36-52`).
- A final source-list chapter is deterministically built by grouping/deduping
  all evidence lines (`source_list_builder.py:119-181`).
- Full tool-call traces are persisted; compaction exempts `confirmed_facts`
  from truncation (`host/README.md:463-468`).

**One caveat**: there is no *quantitative* confidence — "confidence" in code is
free-text `confidence_notes` (`write_pipeline/models.py:45`) plus a
`low_confidence_extraction` flag. The claim is realized as evidence anchoring +
a second LLM verification pass (so "verified" remains model-graded), not
numeric per-datum confidence.

## 3. Data pipeline — genuinely primary-source

| Market | Source (verified in code) | Format |
| --- | --- | --- |
| US | SEC EDGAR direct (submissions API, Archives `index.json`, browse-edgar atom) | HTML filings + XBRL via `edgartools` (`fins/downloaders/sec_downloader.py:53-60`; `fins/processors/sec_xbrl_query.py:14`) |
| A-share | CNINFO （巨潮） official JSON API + static PDF host | PDF → Docling JSON (`cninfo_downloader.py:14-24`) |
| HK | HKEXnews （披露易） `titleSearchServlet.do` | PDF → Docling JSON (`hkexnews_downloader.py:36-44`) |

The CN/HK downloaders carry serious domain engineering: amended-filing
precedence, English-version/summary-announcement filtering, PDF magic-byte
validation, crash recovery with batch journals and file locks
(`fins/README.md:206-217, 507-510`). Per-form-type SEC processors
(10-K/20-F/10-Q/8-K/6-K/SC13/DEF14A) encode hard-won edge-case lore.

## 4. Maturity and code quality

- **Maturity**: created 2026-04-01; ~90 commits; 5 releases in 2.5 weeks
  (v0.1.0→v0.1.4); 503 stars/136 forks; then **dormant since 2026-05-04** with
  6 unmerged PRs and 25 unanswered issues (including a well-documented ADR/ADS
  valuation bug, issue #164). 6 contributors but 77/90 commits by one author.
- **Hygiene**: ~5,094 test functions across 274 test files (test LOC ≈
  production LOC, ~176k each), pyright + pytest + multi-platform CI,
  architecture-boundary tests, per-platform lockfiles. But scheduled CI is
  currently red on Windows.
- **Code quality** (spot-checked runner, audit rules, downloaders, WeChat
  client): Protocol-based contracts, typed dataclasses, SSRF guard with
  explicit opt-in (`engine/tools/web_tools.py:1999-2020`), no `eval`/`exec`,
  no hardcoded credentials, no unexpected network hosts. Minor red flags:
  `init` permanently writes API keys into shell profiles / Windows `setx`
  (`cli/commands/init.py:477-538`); several 2,000+-line modules;
  Chinese-only comments/docs; heavy install (Docling ML models, Playwright,
  pandoc, headless Chrome) — the opposite of this repo's zero-build ethos.
- **OpenClaw claim**: the architectural parallel is substantive (local daemon +
  chat-channel + governed sessions), but there is no shared code or protocol,
  and the candidate deliberately ships no machine-action tools. Treat as
  design-philosophy alignment, not capability parity.

## 5. Fit against our ecosystem

| Our gap / asset | What the candidate offers | Fit |
| --- | --- | --- |
| fund has yfinance market data only; no filings-level fundamentals (`scripts/analysis/sync_configs.py`) | Primary-source filings pipelines + XBRL facts for US/A/HK | **High** — direct gap fill |
| `/research` skill's citation contract; networking's `citation_engine.py` | Machine-enforced evidence anchors + confirm/repair loop | **High as a pattern** — port the idea, not the pipeline |
| Phase 3 of `docs/research/cross-repo-anki-synergy.md` (finance deep-research orchestration) | Filings read-tools would be the subagents' data source | **High** (as vendored library) |
| Our interface: ask questions in the code-agent chat; LLM descoped to the host (networking research-agent spec, Layer 4) | A second, self-contained LLM daemon with its own sessions/UI (CLI/Streamlit/WeChat) | **Poor** — competing runtime, not a complement |
| Zero-build, vanilla-JS, `venv`-only Python conventions | Heavy deps: Docling ML, Playwright, pandoc, Chrome; Chinese-only docs | **Friction** — another reason to vendor a subset, not adopt wholesale |
| BLF-style evidence log planned for the analysis-lab revival (`docs/research/analysis-lab-revival.md` §5.2) | Evidence-anchored filings extraction feeds `evidence.jsonl` with primary-source anchors | **High** — the two plans compose |

## 6. Recommended integration path

1. **Evaluate as an appliance first (throwaway venv, no vendoring).** Install
   in an isolated environment (beware: its `init` writes API keys into shell
   profiles — set env vars manually instead), download ANET/GOOG 10-Ks and
   PDD's 20-F, and judge the section/table/XBRL extraction quality on companies
   we actually understand. One session, reversible, no repo changes.
2. **If the data proves valuable, vendor the Fins subset into fund** (e.g.
   `scripts/vendor/fins/`): downloaders, per-form processors, XBRL query,
   section/table readers. Drop Docling/PDF processing initially (SEC HTML/XBRL
   covers the current portfolio; CN/HK PDFs matter later for supply-chain
   research). Retain LICENSE + NOTICE per Apache-2.0; add a `VENDORED.md`
   noting origin, version, and local modifications. Import-linter and gates
   apply as for any `scripts/` code.
3. **Port the evidence-audit pattern into our skills** rather than importing
   their write pipeline: the thesis-update flow (`docs/ai_update_flow.md`) and
   the future fund research skill gain a machine-checkable evidence-anchor
   requirement + a confirm pass (the host code agent plays the confirm scene
   using vendored fins read-tools). This matches our "LLM authors, code gates"
   doctrine exactly.
4. **Do not adopt**: Host runtime, Engine runner, WeChat channel, Streamlit
   web, render pipeline (pandoc/Chrome are one-liners we can add if ever
   needed), scene-manifest system.
5. **Never** clone-and-improve the whole repo: dormant single-author alpha,
   176k LOC, heavy deps, competing runtime — the improvement cost exceeds a
   clean-room build of the parts we want.

## 7. Open questions / what I could not verify

1. **Extraction quality on our tickers** — the per-form processors encode
   edge-case lore, but only a real run against ANET/GOOG/PDD filings shows
   whether the output beats what a code agent + `edgartools` could do directly
   (edgartools alone may cover 80% of the value at 5% of the weight).
2. **Dormancy trajectory** — five months stale at evaluation; whether upstream
   revives affects the vendor-vs-depend calculus (a revived upstream favors
   depending; continued dormancy favors vendoring).
3. **Docling weight** — whether the CN/HK PDF pipeline's value justifies its
   ML-model dependencies for supply-chain research is untested.
4. **Issue #164 (ADR/ADS valuation bug)** — reported unanswered; relevant
   because PDD is an ADR; unverified whether it affects the parts we'd vendor.
5. **Chinese-only docs/comments** raise the maintenance cost of a vendored
   subset; the core modules' docstrings are thorough but monolingual.
