# CLAUDE.md

Static financial dashboard (portfolio fund tracker): a vanilla-JS/CSS frontend
served as static pages, plus a Python data pipeline that generates the JSON/CSV
the frontend reads. No build step for the frontend; pages are plain HTML loading
ES modules via an import map.

## Command interface — prefer `make`

| Need                                    | Command                          |
| --------------------------------------- | -------------------------------- |
| All checks (lint + types + sec + tests) | `make verify`                    |
| Lint (JS + CSS + Python)                | `make lint`                      |
| Auto-fix lint + format                  | `make fix`                       |
| Full test suite (JS + Python, coverage) | `make test`                      |
| **Scoped JS test (fast, no coverage)**  | `npx jest <path/to/test>`        |
| One CSS file lint                       | `npx stylelint <path.css>`       |
| Dev server (serves repo root at :8000)  | `make serve`                     |
| **Headless screenshot (visual verify)** | `make screenshot URL=/terminal/` |

Don't reach for raw `npx jest`/`eslint` for whole-repo runs — use the `make`
targets so you match CI. Use scoped `npx jest <file>` only for the tight
edit→verify loop.

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
- Data flow / pipeline → `docs/overview.md`, `docs/ai_update_flow.md`.
- Portfolio math → `docs/fermat-pascal-kelly-system.md`.

## Working rules

- Work directly on `main`. **Commit/push only when explicitly asked** (then branch
  off `main` first).
- Changes scoped to one page must not leak to others (e.g. terminal glass effects).
- Verifying a **visual** change means looking at the rendered page, not just green
  tests (§17C of `docs/ai_native_repo_structure.md`). Use
  `make screenshot URL=/<page>/` and read the PNG it prints.
