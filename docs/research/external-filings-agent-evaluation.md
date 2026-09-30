# External Filings-Analysis Agent — Adoption Evaluation

**Status: Findings / Recommendation**
**Date: 2026-09-29**
**Synthesis: this is a component finding of `docs/research/compounding-research-engine.md`.**

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
3. **The Host/Engine daemon is a poor fit**: it is a _second agent runtime_
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
   only the Fins subset into fund; (c) port the evidence-audit _pattern_ into
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
  `SUPPORTED_BUT_ANCHOR_TOO_COARSE`, followed by _mechanical_ anchor rewriting
  with re-validation (`audit_evidence_rewriter.py:36-52`).
- A final source-list chapter is deterministically built by grouping/deduping
  all evidence lines (`source_list_builder.py:119-181`).
- Full tool-call traces are persisted; compaction exempts `confirmed_facts`
  from truncation (`host/README.md:463-468`).

**One caveat**: there is no _quantitative_ confidence — "confidence" in code is
free-text `confidence_notes` (`write_pipeline/models.py:45`) plus a
`low_confidence_extraction` flag. The claim is realized as evidence anchoring +
a second LLM verification pass (so "verified" remains model-graded), not
numeric per-datum confidence.

## 3. Data pipeline — genuinely primary-source

| Market  | Source (verified in code)                                                    | Format                                                                                                                    |
| ------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| US      | SEC EDGAR direct (submissions API, Archives `index.json`, browse-edgar atom) | HTML filings + XBRL via `edgartools` (`fins/downloaders/sec_downloader.py:53-60`; `fins/processors/sec_xbrl_query.py:14`) |
| A-share | CNINFO （巨潮） official JSON API + static PDF host                          | PDF → Docling JSON (`cninfo_downloader.py:14-24`)                                                                         |
| HK      | HKEXnews （披露易） `titleSearchServlet.do`                                  | PDF → Docling JSON (`hkexnews_downloader.py:36-44`)                                                                       |

The CN/HK downloaders carry serious domain engineering: amended-filing
precedence, English-version/summary-announcement filtering, PDF magic-byte
validation, crash recovery with batch journals and file locks
(`fins/README.md:206-217, 507-510`). Per-form-type SEC processors
(10-K/20-F/10-Q/8-K/6-K/SC13/DEF14A) encode hard-won edge-case lore.

## 4. Maturity and code quality

- **Maturity**: created 2026-04-01; ~90 commits; 5 releases in 2.5 weeks
  (v0.1.0→v0.1.4); 503 stars/136 forks; then **dormant since 2026-05-04** with
  6 unmerged PRs and 25 unanswered issues (including a well-documented ADR/ADS
  valuation bug report). 6 contributors but 77/90 commits by one author.
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

| Our gap / asset                                                                                                         | What the candidate offers                                                               | Fit                                                                   |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| fund has yfinance market data only; no filings-level fundamentals (`scripts/analysis/sync_configs.py`)                  | Primary-source filings pipelines + XBRL facts for US/A/HK                               | **High** — direct gap fill                                            |
| `/research` skill's citation contract; networking's `citation_engine.py`                                                | Machine-enforced evidence anchors + confirm/repair loop                                 | **High as a pattern** — port the idea, not the pipeline               |
| Phase 3 of `docs/research/cross-repo-anki-synergy.md` (finance deep-research orchestration)                             | Filings read-tools would be the subagents' data source                                  | **High** (as vendored library)                                        |
| Our interface: ask questions in the code-agent chat; LLM descoped to the host (networking research-agent spec, Layer 4) | A second, self-contained LLM daemon with its own sessions/UI (CLI/Streamlit/WeChat)     | **Poor** — competing runtime, not a complement                        |
| Zero-build, vanilla-JS, `venv`-only Python conventions                                                                  | Heavy deps: Docling ML, Playwright, pandoc, Chrome; Chinese-only docs                   | **Friction** — another reason to vendor a subset, not adopt wholesale |
| BLF-style evidence log planned for the analysis-lab revival (`docs/research/analysis-lab-revival.md` §5.2)              | Evidence-anchored filings extraction feeds `evidence.jsonl` with primary-source anchors | **High** — the two plans compose                                      |

## 6. Recommended integration path

1. ~~**Evaluate as an appliance first (throwaway venv, no vendoring).**~~
   **DONE 2026-09-30 — passed.** Live test against ANET 10-Ks confirmed the
   extraction quality (see §8.1): hierarchical section refs, evidence-carrying
   search, financial-table inventory, exact XBRL facts, full citations —
   clearly beyond plain `edgartools` for agent research use. Proceed to step 2.
2. ~~**If the data proves valuable, vendor the Fins subset into fund** (e.g.
   `scripts/vendor/fins/`): downloaders, per-form processors, XBRL query,
   section/table readers. Drop Docling/PDF processing initially (SEC HTML/XBRL
   covers the current portfolio; CN/HK PDFs matter later for supply-chain
   research). Retain LICENSE + NOTICE per Apache-2.0; add a `VENDORED.md`
   noting origin, version, and local modifications. Import-linter and gates
   apply as for any `scripts/` code.~~
   **DONE 2026-09-30 — vendored & cleanroomed.** Vendored SEC download + read path
   under `scripts/vendor/filings/`, translated all Chinese docstrings/comments to
   English, preserved Apache-2.0 LICENSE and NOTICE, configured tooling exclusions,
   and verified via import smoke tests and offline ANET 10-K extraction. Ready for
   first-party integration in future steps. Proceed to step 3.
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

## 7. Enhancement with our Anki infrastructure

The candidate composes unusually well with the existing Anki pipeline
(`docs/research/cross-repo-anki-synergy.md` §1a) because both sides are built
on evidence-anchored artifacts and "LLM authors, code gates":

1. **Filings are a better coverage-tracker fit than fund docs.** Networking's
   `unvisited → candidate → imported` coverage state machine assumes a finite
   corpus (`research/**/*.md` courseware) — which living fund theses aren't,
   but a filing is. A 10-K's sections can be chunked, coverage-tracked, and
   systematically card-ified exactly like courseware. The candidate's
   per-form processors and section navigation produce precisely the metadata
   (`chunk_id, file_path, heading, locator, content, citation`) that
   `tools/research/parse_chunks.py`'s manifest format expects — the missing
   piece is one thin adapter (processed-filing sections → chunks manifest).
2. **Its evidence anchors satisfy our card citation contract for free.** The
   金融 card format mandates a final `源码与文档引用` section with anchored
   citations; the candidate's audit machinery already hard-requires
   `source | type | date | locator` evidence lines and re-verifies them. The
   `citation` / `external_sources` fields of the `anki_cards.jsonl` schema get
   machine-checked provenance — something no other card source we have
   provides.
3. **PageRank steers which parts of a filing become cards.** Filings are huge;
   `anki_graph_bridge.score_chunk_pagerank()` can rank sections by the
   centrality of the 金融 hub concepts they touch, and `get_related_hubs()`
   suggests cross-link targets at authoring time (fronts name hub concepts
   verbatim so edges form on the next graph rebuild).
4. **The confirm pass is the missing factuality gate.** Today our cards are
   validated structurally (`anki_card_validator.py`) and for density, but not
   for truth. The candidate's confirm-scene pattern — re-verify each claim
   against the source with live tools — extends to cards: re-check each card's
   claims against the filing before import.
5. **End-to-end shape**: vendored Fins (filings → section chunks) →
   PageRank-ranked selection → host code-agent authors `anki_cards.jsonl`
   (Chinese-primary bilingual contract) → validator → density gate →
   confirm pass against the filing → AnkiConnect import into 金融 → next
   `make precommit-fix YOLO=1` in the anki repo rebuilds the graph.
6. **Speculative reverse direction**: the Q&A loop could query the existing
   金融 deck via AnkiConnect `findNotes` to inject already-known concepts as
   prior-knowledge context. Unvalidated; treat as a later experiment.

## 8. Open questions / resolutions

1. **Extraction quality on our tickers — RESOLVED by live appliance test
   (2026-09-30).** Ran the real pipeline in a throwaway venv under `/tmp`
   (light deps only — **Docling not needed for the SEC
   path**; no `init`, no shell-profile writes):
    - `download --ticker ANET --forms 10K` pulled 5 annual 10-Ks
      (FY2021–FY2025, main HTML + full XBRL bundle each) from SEC EDGAR in ~19s,
      zero failures.
    - `get_document_sections` on the FY2025 10-K returned a hierarchical
      section tree with stable refs, Item mapping, and topics (e.g.
      `s_0002_c06` = Item 1 → "Our Customers").
    - `read_section("s_0002_c06")` returned exact, clean text with a full
      citation block (accession no, filing date, fiscal year, heading) — e.g.
      the FY2025 customer-concentration disclosure (two customers at 26% and
      16% of revenue).
    - `search_document` (multi-query, adaptive BM25) returns section refs +
      evidence spans; a "Microsoft" query correctly returned **0 matches** —
      verified against the raw HTML that the name disappeared from the 10-K
      after FY2021 (anonymized customers). Accuracy, not a bug.
    - `list_tables` surfaces financial tables with headers, dimensions, and
      containing section; `query_xbrl_facts` returned the exact FY2025 product
      revenue fact (USD 7.5769B) with unit/decimals/period.
    - **vs. plain `edgartools`**: `TenK` objects give item-level blobs
      (Item 1 ≈ 39.5k chars, no named subsections), no evidence-carrying
      search, no financial-table inventory. The candidate's layer is
      meaningfully better for agent research and for card citations; XBRL is
      on par (it builds on edgartools anyway).
    - **Verdict: vendor the Fins SEC subset** (downloaders, SEC processors,
      the 9 read tools, fs storage). One caveat found: `get_financial_statement`
      rejected `statement_type="income_statement"` — the accepted vocabulary
      needs discovery during vendoring.
    - **Vendoring hygiene (new)**: the upstream `AGENTS.md`/`constraints` files
      contain an instruction telling agents to skip security checks — treat as
      prompt-injection-flavored and **do not vendor** them; only the `fins/`
      package code comes across, with LICENSE + NOTICE per Apache-2.0.
2. **Dormancy trajectory** — five months stale at evaluation; whether upstream
   revives affects the vendor-vs-depend calculus (a revived upstream favors
   depending; continued dormancy favors vendoring).
3. **Docling weight** — whether the CN/HK PDF pipeline's value justifies its
   ML-model dependencies for supply-chain research is untested. (The SEC path
   works without Docling, so this no longer blocks vendoring.)
4. **ADR/ADS valuation bug** — reported upstream, unanswered; relevant
   because PDD is an ADR; unverified whether it affects the parts we'd vendor.
   PDD's 20-F path was not exercised in the appliance test.
5. **Chinese-only docs/comments** raise the maintenance cost of a vendored
   subset; the core modules' docstrings are thorough but monolingual.
