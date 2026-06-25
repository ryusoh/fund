# Sharing across multiple personal repos (polyrepo strategy)

Research notes for keeping several independent repos consistent — shared
frontend components / a personal visual language, plus CI, lint configs,
workflows, and agent commands. Captured for later; **not implemented yet**.

The context this is written for: independent static sites (like this one — its
own GitHub Pages deploy, `CNAME`, data pipeline, release cadence), built
vanilla-JS / no-build-step / import-map style. The recommendations below
deliberately preserve that minimalism.

## TL;DR

- **Don't monorepo.** Independent deploys + cadences make a monorepo cost more
  than it returns. Stay polyrepo.
- Create **one `foundation` repo** as the single source of truth.
- **Match the distribution mechanism to the artifact type** — this is the whole
  game. Reference what can be referenced; sync what must physically exist;
  version the brand so rollout is controlled.
- Everything lands in each repo as a **reviewed PR**, never a direct push (so
  each repo's own CI gates it, and it dodges the squash-merge divergence pain
  documented in [git-sync-notes.md](git-sync-notes.md)).
- **No runtime performance cost** if sharing is resolved at sync time and served
  same-origin (see [Performance](#performance) below).

## Why not a monorepo

A monorepo wins when you need _atomic cross-project changes_ and a _shared
deploy_. For independent personal sites you have neither: each repo ships
separately (this one to GitHub Pages with its own `CNAME`), on its own schedule.
A monorepo would couple deploys and surrender the per-repo simplicity that makes
these pleasant to maintain. Keep polyrepo; distribute _out_ of a `foundation`
repo.

## The four buckets

The mistake is using one mechanism for everything. Sort artifacts by how they're
consumed:

### Bucket 1 — CI / GitHub Actions → reusable workflows (reference, never copy)

The cleanest win, and native. Put generic workflows in `foundation` as
**reusable workflows** (`on: workflow_call`) and **composite actions** (shared
setup steps). Each consumer gets a ~5-line stub:

```yaml
jobs:
    ci:
        uses: you/foundation/.github/workflows/ci.yml@v1
```

Pin to a tag (`@v1`); bump deliberately. The logic genuinely lives in one place,
zero drift, zero copies.

⚠️ **Triage first — not every workflow is shareable.** In this repo the generic
candidates are `ci.yml`, `claude*.yml`, `npm-audit.yml`, `commit-lint.yml`,
`sync-labels.yml`. The data-pipeline / site-specific ones stay local:
`twrr-refresh`, `daily-forex-update`, `update-vt-sectors`, `analysis-sync`,
`pages.yml`.

### Bucket 2 — Lint / format / type configs → shareable configs, with a split

- **JS configs** (`eslint.config.cjs`, `.prettierrc.cjs`, `.stylelintrc.cjs`)
  support `extends`/import from a package. Publish `@you/eslint-config` (or
  import from `foundation`); each repo's config becomes "extend the base + local
  overrides."
- **Python configs** (`pyproject.toml` for ruff/black/mypy) lack good
  remote-extends support (black can't; ruff only extends local paths). These are
  realistically **file-synced**, not referenced.
- **`Makefile`** — keep a shared `include foundation.mk` for common targets;
  local Makefile for project-specific ones.

### Bucket 3 — The brand: frontend components + design tokens → versioned ESM package

The one place a real published/versioned artifact earns its keep, and it fits
the no-build-step world:

- **Design tokens first** (highest leverage, lowest cost). Extract the visual
  language — palette (e.g. `--accent-primary: #00ff41`), fonts, spacing, themes
  — into a tiny `tokens.css` of custom properties (+ optional JSON for JS). Every
  repo imports that one file → enforced visual consistency; change a color once,
  all sites inherit it.
- **Shared components** ship as **plain ESM** (no build, same as this repo).
  Consume them exactly like existing vendor code: **vendor them** via the
  existing `vendor:fetch` script (preferred), or pin a CDN URL in the import map.
  Versioning gives _controlled rollout_ instead of silent drift.

### Bucket 4 — Agent commands / `.claude` + repo meta → file sync

`.claude/commands/*.md`, `.claude/settings.json`, `CODEOWNERS`, `labels.json`,
`ISSUE_TEMPLATE/`, `dependabot.yml` are plain files you can't import — they must
physically exist in each repo. These want **file sync** (see machinery below).

## The machinery: automated PRs, never direct pushes

For everything _synced_ rather than _referenced_ (Bucket 2-Python, Bucket 4):

- A workflow in `foundation` that, on change, **opens a PR into each consumer**
  (e.g. `BetaHuhn/repo-file-sync-action`, or a small `gh pr create` loop).
- **Renovate** (or the existing Dependabot) to auto-PR version bumps for the
  Bucket-3 package.

**Why PRs, not pushes:** each repo's CI gates the synced change, you get a review
checkpoint, and it sidesteps the squash-merge / Jules divergence pain in
[git-sync-notes.md](git-sync-notes.md). Direct pushes would reintroduce it.

> GitHub's **template repo** feature is genesis-only — great for _bootstrapping_
> a new brand-consistent repo, but it does **not** sync afterward. Use it for a
> new repo's birth, not ongoing consistency.

## Performance

Sharing and runtime cost are separable. It depends on _when_ sharing is resolved:

- **Resolve at sync time, serve same-origin (recommended).** Vendored components
    - `tokens.css` are copied into each repo and served from GitHub Pages, cached
      by the service worker (`sw.js`), on the same HTTP/2 connection as everything
      else. **Runtime is byte-for-byte identical to today** — the user never pays for
      the sharing.
- **Live third-party CDN linking at runtime (avoid for production).** Adds a DNS
    - TLS handshake to a new origin, risks an **ESM waterfall** (nested imports
      discovered sequentially), and puts a third-party origin in the critical render
      path. Fine for prototyping, not production.

CSS custom properties have **no runtime cost** vs hardcoded values. CI/sync/
Renovate latency is async background process — off the page-load critical path
entirely.

One tradeoff: vendoring many small ESM files means more (same-origin) requests;
cheap under HTTP/2 at this scale. Only if a shared bundle grows large would you
minify/concat **at sync time** — and that reintroduces a build step, so do it
only if measurement shows a problem. Don't pre-optimize.

## Recommended concrete stack

1. **`foundation` repo** = source of truth.
2. **CI / agents** → reusable workflows + composite actions, referenced by
   `@tag`. _(reference)_
3. **JS lint/format** → shared config package via `extends`. **Python configs +
   Makefile common targets** → file-sync / `include`. _(mixed)_
4. **Brand** → `tokens.css` + ESM component package, vendored via `vendor:fetch`
   (or pinned CDN). _(versioned)_
5. **`.claude` commands, issue templates, labels, CODEOWNERS** → file-sync action
   that opens PRs. _(sync)_
6. **Renovate / Dependabot** drives bumps; everything lands as a reviewed PR.

Throughline: **reference what can be referenced (workflows, JS configs, ESM
components); sync what must physically exist (Python configs, `.claude` files,
templates); version the brand so rollout is controlled** — single-source-of-truth
consistency without a monorepo and without breaking no-build-step minimalism.
