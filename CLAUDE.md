# CLAUDE.md

Static financial dashboard (portfolio fund tracker): a vanilla-JS/CSS frontend
served as static pages, plus a Python data pipeline that generates the JSON/CSV
the frontend reads. No build step for the frontend; pages are plain HTML loading
ES modules via an import map.

## Command interface — prefer `make`

| Need                                    | Command                                             |
| --------------------------------------- | --------------------------------------------------- |
| All checks (lint + types + sec + tests) | `make verify`                                       |
| Lint (JS + CSS + Python)                | `make lint`                                         |
| Auto-fix lint + format                  | `make fix`                                          |
| Full test suite (JS + Python, coverage) | `make test`                                         |
| **Scoped JS test (fast, no coverage)**  | `npx jest <path/to/test>`                           |
| **Scoped Python check (fast)**          | `venv/bin/ruff check <path>` (also `black`, `mypy`) |
| One CSS file lint                       | `npx stylelint <path.css>`                          |
| Dev server (serves repo root at :8000)  | `make serve`                                        |
| **Headless screenshot (visual verify)** | `make screenshot URL=/terminal/`                    |

Don't reach for raw `npx jest`/`eslint` for whole-repo runs — use the `make`
targets so you match CI. Use scoped `npx jest <file>` only for the tight
edit→verify loop. Jest runs **silent** (`console.log` prints nothing) — before
debugging an odd/flaky JS test, read `docs/testing-notes.md`.

Python dev tools (`ruff`/`black`/`mypy`/`pytest`/`diff-cover`) live in
**`venv/bin/`** (that's the interpreter `make` itself uses) — call them directly for
scoped single-file loops; whole-repo via `make`. The **CI gate is `make
precommit-fix`** (the `web-ci` job: format + lint + JS/Python tests); `make verify`
is the stricter local superset (adds `mypy` + `bandit`).

## Layout

- `js/` — frontend ES modules. `js/pages/<page>/` = per-page entry; `js/ui/` =
  shared UI/effects; `js/config.js` = central tunables; `@js/` etc. import aliases
  (see the import map in each `*/index.html` and `jest` `moduleNameMapper`).
- `css/` — stylesheets, grouped by page under `css/<page>/`.
- `<page>/index.html` — static page entries (`terminal/`, `position/`, `calendar/`).
- `scripts/` — Python data pipeline + tooling (governed by `pyproject.toml`).
- `data/` — generated JSON/CSV consumed by the frontend (don't hand-edit).
- `tests/` — `tests/js/**` (jest) and `tests/python/**` (pytest).
- `docs/` — architecture & subsystem knowledge. Read the relevant one before deep work.

## Subsystem knowledge (read before touching)

- **Liquid-glass effects** (terminal page panes) → `docs/liquid-glass.md`.
  These are layered Canvas/WebGL/SVG and the refraction lens is **Chromium-only
  and visual** — unit tests can't see a transparent edge or misaligned rim, so
  **verify in Chrome** (`make serve`, open `/terminal/`). Has a gotcha checklist
  that will save you a debugging round-trip.
- **Transaction chart crosshair** (stacked composition/sectors/geography/marketcap) →
  `docs/chart-crosshair-layout.md`. One consumer (`interaction.js`) reads layout fields
  by name; a renderer that omits one (e.g. `dates`) silently renders **0%**, not an
  error. Read before adding/editing a stacked chart.
- **Forward P/E & the PER column** → `docs/pe-forward-pe-pipeline.md`. The Python
  scrape writes `forward_pe.msci_pe_ratio` into `pe_ratio.json`; the frontend
  derives VT's forward P/E from it. A null ratio renders the cell **trailing-only,
  not an error** — verify in the rendered table. Read before editing forward-PE in
  `generate_pe_data.py` or `dataService.js`.
- **Pages deploy & bot data workflows** → `docs/pages-deploy.md`. Bot commits
  reach the live site only via an explicit `workflow_dispatch` of `pages.yml`;
  a skip-ci marker anywhere in a commit message (even quoted in the body) kills
  all push workflows including the deploy. Read before touching `.github/workflows/`.
- Data flow / pipeline → `docs/overview.md`, `docs/ai_update_flow.md`.
- Portfolio math → `docs/fermat-pascal-kelly-system.md`.
- **Calendar renderer migration (in progress)** → `docs/calendar-renderer-migration.md`.
  Moving the calendar off Cal-Heatmap (D3/SVG) to a DOM/CSS renderer behind a flag.
  Read before touching `js/pages/calendar/` or `js/ui/cal-heatmap-src/`.

## Working rules

- Work directly on `main`. **Commit/push only when explicitly asked** (then branch
  off `main` first). **Don't route a trivial config/doc change through a Jules PR** —
  make a direct commit. The async PR flow squash-merges and diverges local `main`;
  if a `git pull --rebase` then cascades into per-commit conflicts, the fix is
  `git reset --hard origin/main` (never keep rebasing) — see `docs/git-sync-notes.md`.
- Changes scoped to one page must not leak to others (e.g. terminal glass effects).
- Verifying a **visual** change means looking at the rendered page, not just green
  tests (§17C of `docs/ai_native_repo_structure.md`). Use
  `make screenshot URL=/<page>/` and read the PNG it prints. But a screenshot only
  proves it _rendered_ — **not that it looks good**. Don't claim visual parity or
  "matches/exceeds" a reference from screenshots (cropped/zoomed ones especially);
  aesthetic quality is the user's call. For fidelity-sensitive effects (glass,
  lighting), have the user view the live page before you change a default.
- **Don't write a command or example into docs/code that you haven't actually run
  this session.** Verify it first — don't infer behaviour from a name or a `case`
  label. (E.g. the terminal's real command semantics live in its `help` output /
  `js/transactions/terminal/handlers/help.js`: `transaction` toggles the table,
  `plot` needs a subcommand, `all` only clears filters.) Guessing here has twice
  cost a correction round-trip.
