# The Compounding Research Engine — Integrated Design

**Status: Synthesis / Proposal**
**Date: 2026-09-29**
**Component findings** (evidence lives there, not repeated here):

- `docs/research/cross-repo-anki-synergy.md` — the loop: chat → docs → cards → PageRank
- `docs/research/analysis-lab-revival.md` — the feedback surface: what the human sees
- `docs/research/external-filings-agent-evaluation.md` — the data source: primary-source filings

The synergy doc's loop lacks a primary-source data plane (supplied by the
filings evaluation) and a human feedback surface (supplied by the lab revival).
Integrated, they form one engine with a single invariant: **every session starts
smarter than the last, because the last session left durable, ranked, testable
artifacts behind.**

```text
            ┌─────────────────────────────────────────────────────┐
            │                    ASK (entry)                      │
            │  fund chat: thesis-affecting research               │
            │  networking chat: pure domain study                 │
            └──────────────┬──────────────────────────────────────┘
                           ▼
            ┌─────────────────────────────────────────────────────┐
            │                 RETRIEVE (data plane)               │
            │  fund pipeline (yfinance, P/E) · vendored filings   │
            │  layer (SEC/CNINFO/HKEX, XBRL) · networking         │
            │  courseware corpus · web primary sources            │
            └──────────────┬──────────────────────────────────────┘
                           ▼
            ┌─────────────────────────────────────────────────────┐
            │                 REASON (agent plane)                │
            │  host code agent + parallel subagents               │
            │  (fundamentals / industry / valuation split),       │
            │  citation contract, belief-state update             │
            └──────────────┬──────────────────────────────────────┘
                           ▼
            ┌─────────────────────────────────────────────────────┐
            │              COMMIT (durable artifacts)             │
            │  findings docs · thesis patches (md+json) ·         │
            │  belief-state JSON · evidence.jsonl ·               │
            │  decision-journal entries  — all git-reviewed       │
            └──────────────┬──────────────────────────────────────┘
                           ▼
            ┌─────────────────────────────────────────────────────┐
            │              DISTILL (Anki plane)                   │
            │  LLM authors anki_cards.jsonl → validator →         │
            │  density gate → confirm pass → AnkiConnect → 金融    │
            └──────────────┬──────────────────────────────────────┘
                           ▼
            ┌─────────────────────────────────────────────────────┐
            │           RENDER + RANK (feedback plane)            │
            │  Lab page: probability history, Kelly curves, fan   │
            │  charts, calibration — read-only over data/         │
            │  anki repo: graph rebuild → PageRank hubs           │
            └──────────────┬──────────────────────────────────────┘
                           │
                           └── feedback into next ASK ──►
                 (hubs steer card/research priorities;
                  Brier scores discipline future probabilities;
                  retro turns friction into gates/skills)
```

## Design invariants (each traced to a component doc)

1. **LLM authors, code gates** — card prose is agent-written; structure,
   density, dedup, and (with the filings layer) factuality are machine-checked
   (synergy §4.2; evaluation §2).
2. **Cards are downstream of docs** — the git-versioned doc is the source of
   truth; cards derive from it and cite it (synergy §3).
3. **The UI never writes state** — the Lab page renders derived views only;
   judgment artifacts live in git (lab revival §5).
4. **PageRank ⊥ FSRS** — centrality decides _what_ to learn/emphasize; the
   scheduler decides _when_ (synergy §4.3).
5. **Domain ownership of sessions** — ask in the repo that owns the artifact;
   networking's research-agent serves pure-study questions directly (synergy
   §3, question-surface subsection).
6. **Evidence has an anchor or it didn't happen** — thesis claims, report
   chapters, and cards all carry `source | locator` citations; the confirm
   pass re-verifies them (evaluation §2, §7.2).

## Component status

| Engine piece                                           | Home              | Status                                                              |
| ------------------------------------------------------ | ----------------- | ------------------------------------------------------------------- |
| Findings/thesis capture (`/research`, thesis flow)     | fund              | **Exists**                                                          |
| Card pipeline (validator, density, dedup, AnkiConnect) | networking        | **Exists**; ad-hoc path usable from fund today                      |
| PageRank graph + bridge                                | anki + networking | **Exists**; rebuild already hooked to anki's `precommit-fix YOLO=1` |
| Fund `/anki-capture` skill + finance tags              | fund + networking | **Implemented** (`.agents/skills/anki-capture/`)                    |
| Belief-state schema + evidence.jsonl                   | fund              | **Implemented** (`data/analysis/*.evidence.jsonl`, BLF schema)      |
| Lab page revival (read-only derived views)             | fund              | **Implemented** (repaired, inverted, consensus visuals, nav links)  |
| Filings layer (vendored subset)                        | fund              | **Unevaluated** — appliance test first (evaluation §6.1)            |
| Filings→cards manifest adapter + confirm pass          | fund + networking | **Missing** (evaluation §7)                                         |
| Industry-thesis layer + covariance Kelly               | fund              | **Implemented** (`docs/thesis/industry/`, cross-asset covariance)   |
| Research orchestration (parallel subagents)            | fund              | **Missing** (synergy Phase 3)                                       |

## Build order (dependencies respected)

- **Phase 0 — this week, zero new infra.** Repair the Lab's four bugs (lab
  revival §3a); use networking's ad-hoc card path after research chats
  (synergy Phase 0).
- **Phase 1 — the skill.** Fund `/anki-capture` (JSONL schema + card-format
  contract + invocation of networking's gates); add finance tags to
  `CANONICAL_TAGS` in networking.
- **Phase 2 — the feedback surface.** Belief-state schema + `evidence.jsonl`
  in `data/analysis/`; Lab page renders probability history, Kelly curves,
  calibration; resolution criteria added to thesis template.
- **Phase 3 — the data plane.** Appliance-test the external filings project on
  ANET/GOOG/PDD; if it beats plain `edgartools`, vendor the subset; build the
  sections→chunks adapter so filings become coverage-tracked card corpora with
  a confirm pass.
- **Phase 4 — orchestration.** Finance research skill fanning out parallel
  subagents; industry-thesis layer; covariance-aware (or explicitly
  industry-scenario) Kelly on the Lab's PORT view.

## What the engine buys that the pieces don't

- **Ranking closes the loop**: PageRank hubs over the unified 金融 deck
  identify which concepts are load-bearing for both domain understanding and
  the (networking-concentrated) portfolio — steering both study and research
  priorities (synergy §3, concentration subsection).
- **Scoring closes the loop**: dated falsifiable predictions + Brier
  calibration turn thesis probabilities from decoration into a feedback
  signal (lab revival §4.1, §5.4).
- **Provenance closes the loop**: machine-checked evidence anchors flow from
  filings → reports → theses → cards, so every artifact can be re-verified
  against its source (evaluation §7.2).

## Open questions

Consolidated, unresolved: extraction quality of the filings candidate on our
tickers (evaluation §8.1); whether the Lab stays a page or folds into the
terminal (lab revival §6.1); PORT Monte Carlo semantics (lab revival §6.3);
finance-card density behavior vs. the pinned baseline — monitor, revisit only
on empirical divergence (synergy §5.5).

## Action items

### Preamble — rules for the implementer

- Work **one work order per change, in order**. Commit after each item
  (Conventional Commits, e.g. `fix(analysis): guard monte carlo worker on
port scenarios`); **never push** — pushing is a human decision.
- `Find` strings are exact unique anchors verified against the files on
  2026-09-29. Line numbers may drift; if a `Find` string does not match,
  **STOP and report** — do not improvise.
- Never edit `data/` (generated). Never run repo-wide formatters; format only
  files you touched (`npx prettier --write <file>`).
- WO-2 touches the **networking repo** (`~/dev/networking`) — that change gets
  its own commit _in that repo_; its gate is `make precommit` there (read
  `~/dev/networking/AGENTS.md` before editing).
- After each JS/CSS/HTML edit, run the item's `Verify` commands. If the
  diff-coverage gate complains about new uncovered branches in `lab.js`
  (WO-1), add a `lab_dom` test covering the error branch — the existing DOM
  tests mock the worker, so follow `tests/js/pages/analysis/lab_dom.test.js`'s
  mocking pattern.

### WO-1 [low] — Fix the Monte Carlo crash on PORT (default view)

PORT scenarios carry `precomputedMultiple`/`precomputedCagr` but no
`growth`/`valuation` blocks, so the worker dies on
`scenario.growth.epsCagrSigma` and the button spins forever.

**File:** `js/pages/analysis/monte_carlo.worker.js`
**Find:**

```js
function runSimulation(config) {
    const { scenarios, volatility, horizon, paths = 10000 } = config;
```

**Change:** insert immediately after the destructuring line:

```js
if (!scenarios.length || scenarios.some((s) => !s.growth || !s.valuation)) {
    return { error: 'Scenario data lacks growth/valuation blocks' };
}
```

**File:** `js/pages/analysis/lab.js`
**Find:**

```js
state.monteCarloWorker.onmessage = function (e) {
    const { type, result } = e.data;
    if (type === 'SIMULATION_COMPLETE') {
        renderMonteCarloResults(result);
        btnRunMonteCarlo.textContent = 'Run 10k Paths';
        btnRunMonteCarlo.disabled = false;
        btnRunMonteCarlo.removeAttribute('aria-busy');
    }
};
```

**Change:** replace with:

```js
state.monteCarloWorker.onmessage = function (e) {
    const { type, result } = e.data;
    if (type === 'SIMULATION_COMPLETE') {
        if (result && result.error) {
            riskMetricsEl.replaceChildren(document.createTextNode(result.error));
        } else {
            renderMonteCarloResults(result);
        }
        btnRunMonteCarlo.textContent = 'Run 10k Paths';
        btnRunMonteCarlo.disabled = false;
        btnRunMonteCarlo.removeAttribute('aria-busy');
    }
};

state.monteCarloWorker.onerror = function () {
    riskMetricsEl.replaceChildren(
        document.createTextNode('Monte Carlo simulation failed; see console for details.')
    );
    btnRunMonteCarlo.textContent = 'Run 10k Paths';
    btnRunMonteCarlo.disabled = false;
    btnRunMonteCarlo.removeAttribute('aria-busy');
};
```

**File:** `tests/js/pages/analysis/monte_carlo.worker.test.js`
**Find:** the closing of the first test (`expect(typeof arg.result.histogram.binSize).toBe('number');` … `});`)
**Change:** add a new test following the existing `initWorker(global.self)` /
`mockPostMessage` pattern in that file:

```js
it('returns an error for scenarios missing growth/valuation blocks (PORT view)', () => {
    const payload = {
        scenarios: [{ prob: 1.0, precomputedCagr: 0.1 }],
        volatility: 0.2,
        horizon: 5,
        paths: 100,
        eps: 10,
    };
    global.self.onmessage({ data: { type: 'RUN_SIMULATION', payload } });
    const arg = mockPostMessage.mock.calls[0][0];
    expect(arg.type).toBe('SIMULATION_COMPLETE');
    expect(arg.result.error).toMatch(/lacks growth\/valuation/);
});
```

**Verify:** `npx jest tests/js/pages/analysis/`
**Guardrail:** proper PORT Monte Carlo _semantics_ (portfolio-level sigmas) is
a design decision — out of scope here; see `docs/research/analysis-lab-revival.md`
§6.3.

### WO-2 [low] — Add a finance tag vocabulary to the card validator (networking repo)

Unblocks fund-authored cards (they currently fail the validator's
canonical-tag gate). Deliberately excludes per-ticker tags to avoid vocabulary
sprawl; add later if a real need appears.

**File:** `~/dev/networking/tools/research/anki_card_validator.py`
**Find:**

```python
        "fault_tolerance",
    }
)
```

**Change:** insert before the closing `}`:

```python
        # finance
        "finance",
        "valuation",
        "moat",
        "earnings",
        "industry",
        "macro",
```

**Verify:** `cd ~/dev/networking && python3 -m pytest tools/research/__tests__/test_anki_card_validator.py -q`
**Guardrail:** commit in the networking repo separately
(`feat(research): add finance tags to anki card vocabulary`); that repo's
full gate is `make precommit` (run it before opening any PR there).

### WO-3 [trivial] — Remove the duplicated background canvas

**File:** `analysis/index.html`
**Find:**

```html
<canvas id="holo-bg"></canvas> <canvas id="holo-bg"></canvas>
```

**Change:** delete the second `<canvas id="holo-bg"></canvas>` line (keep one).
**Verify:** `npx prettier --check analysis/index.html && make smoke`

### WO-4 [visual] — Define the three missing CSS custom properties

`--accent`, `--border-thin`, `--ink` are referenced but never defined, so
several borders/colors silently fall back.

**File:** `css/analysis-proto.css`
**Find:**

```css
    --font-display: 'JetBrains Mono', monospace;
    --font-mono: 'JetBrains Mono', monospace;
}
```

**Change:** insert before the closing `}`:

```css
--accent: var(--accent-primary);
--border-thin: 1px solid var(--border-color);
--ink: var(--text-main);
```

**Verify:** `npx stylelint css/analysis-proto.css`, then
`make screenshot URL=/analysis/` and have a human glance at the PNG (borders
and the reset-button accent change appearance).

### WO-5 [visual] — Prune dead CSS and the unused font

Render-neutral cleanup confirmed by audit (no `grid-template-areas` exists
anywhere in the file, so the `grid-area` declarations are inert; the second of
the two duplicate card rules wins today, so deleting the _first_ changes
nothing).

**File:** `css/analysis-proto.css`
**Changes:**

1. **Find** the first of the two identical selector blocks:

```css
.scenario-block,
.value-card,
.bayes-lab,
.risk-sim {
    background: rgba(0, 10, 0, 0.9);
    border: 1px solid var(--border-color);
    padding: 15px;
    position: relative;
    flex-shrink: 0;
    /* Prevent shrinking */
}
```

Delete it (the block with `padding: 15px` — the later `padding: 20px` copy
must stay; it is the one that actually renders). 2. **Find** `grid-area: scenarios;` — delete that one declaration.
Same for `grid-area: values;`, `grid-area: bayes;`,
`grid-area: risk;`. Keep the rest of those rule blocks (they carry
`display: flex` etc.). 3. **Find** the `.nav-brand { … }` rule (font-size 1.2rem, uppercase; no
element uses this class) — delete the whole rule.

**File:** `analysis/index.html`
**Find:** `family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700`
**Change:** `family=JetBrains+Mono:wght@400;500;700` (Space Grotesk is loaded
but referenced by no rule).
**Verify:** `npx stylelint css/analysis-proto.css && npx prettier --check analysis/index.html && make smoke`;
`make screenshot URL=/analysis/` for a human glance.

### WO-6 [skip] — Author the fund `/anki-capture` skill

Needs skill-authorship judgment, not mechanics. Spec:
`docs/research/cross-repo-anki-synergy.md` §3 (Phase 1) — reads the session's
findings doc / thesis diff, authors candidate cards in networking's JSONL
schema (card-format contract: `~/dev/networking/docs/research/anki-card-pipeline-spec.md`
§8), then invokes `anki_card_validator.py` + `anki_generator.py --import
--cards <path>` with `cwd=~/dev/networking`. Remember `.agents/skills/` is
canonical; run `make sync-check` after adding.

### WO-7 [done] — Belief-state schema + evidence log + Lab read-only rework

Completed. Spec: `docs/research/analysis-lab-revival.md` §5 items 1–8.

- BLF semi-structured belief state (`belief_state`: probability, confidence, evidence_for, evidence_against, open_questions, as_of) in `data/analysis/<TICKER>.json`.
- Per-ticker sequential evidence logs: `data/analysis/<TICKER>.evidence.jsonl`.
- Dated falsifiable predictions with binary resolution criteria and live Brier score tracking.
- Farnam Street decision journal entries (`decision_journal` array: action, situation, alternatives_rejected, review_date).
- Bayesian replay engine (`js/pages/analysis/bayes.js`) replaying JSONL logs to compute historical posterior trajectories.
- Read-only UI inversion (`js/pages/analysis/lab.js`, `analysis/index.html`): primary is read-only record; sandbox is local session only.
- Visualizations consensus trio: Bank of England percentile fan chart, 20% & 5% VaR tail histograms, Kelly growth curve with 1/4, 1/2, full Kelly and 2x Kelly cliff.
- Lab navigation: Deliberately kept unlisted from main nav container (`index.html`, `position/`, `calendar/`, `terminal/`) per product decision; internal header on `analysis/` provides outbound links.

### WO-8 [skip] — Appliance-test the external filings project

Interactive evaluation, not a mechanical edit. Spec:
`docs/research/external-filings-agent-evaluation.md` §6.1 — isolated venv, set
API keys via env (its `init` writes shell profiles — do not run it), download
ANET/GOOG 10-Ks and PDD's 20-F, judge extraction quality vs. plain
`edgartools`. Outcome decides vendor-vs-skip.

### WO-9 [done] — Industry-thesis layer + PORT Kelly semantics

Completed.

- Authored industry thesis layers:
    - `docs/thesis/industry/ai-networking.md`: AI interconnects, Broadcom vs Arista vs Nvidia, Ethernet vs InfiniBand, transceivers, hyperscaler capex sensitivity, portfolio failure modes.
    - `docs/thesis/industry/cloud-ai-ecosystem.md`: Hyperscaler capex, custom silicon (TPU, Maia, Trainium), optical circuit switching, token unit economics, cloud margins.
- Linked industry theses in `docs/thesis/ANET.md`, `docs/thesis/GOOG.md` and referenced in `data/analysis/ANET.json`, `GOOG.json`.
- Implemented multi-asset covariance Kelly semantics in `js/pages/analysis/lab.js`:
    - Calibrated cross-asset correlation matrix (`ANET:GOOG`, `ANET:VT`, `GOOG:VT`, `ANET:PDD`, `GOOG:PDD`, `PDD:VT`).
    - Portfolio covariance volatility $\sigma_{\text{cov}} = \sqrt{\mathbf{w}^T \mathbf{\Sigma} \mathbf{w}}$ vs diagonal volatility $\sigma_{\text{diag}}$.
    - Dampens inflated independent Kelly sizing on PORT to realistic levels while maintaining fallback for uncorrelated assets.
