# Sharing across multiple personal repos (polyrepo strategy)

Research notes for keeping several independent repos consistent — shared
frontend components / a personal visual language, plus CI, lint configs,
workflows, and agent commands. Captured for later; **not implemented yet**.

The context this is written for: independent static sites (like this one — its
own GitHub Pages deploy, `CNAME`, data pipeline, release cadence), built
vanilla-JS / no-build-step / import-map style. The recommendations below
deliberately preserve that minimalism.

## The repos in this system

| Repo                                           | Role                                                                     | Consumes                             |
| ---------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------ |
| `~/dev/fund`                                   | Portfolio dashboard (this repo)                                          | brand + configs + CI + agents        |
| `~/dev/ryusoh.github.io`                       | Personal site (note: on `master`, not `main`)                            | brand + configs + CI + agents        |
| `~/dev/networking`                             | Networking tools (JS + Python)                                           | configs + CI + agents (+ some brand) |
| `~/Library/Application Support/Anki2/addons21` | **Anki addons — a full frontend twin of `fund`**                         | brand + configs + CI + agents        |
| `~/dev/ryusoh`                                 | **GitHub profile repo** (`username/username`) — **chosen as foundation** | source of truth (not a consumer)     |

All five repos are **public**, which removes the only constraint that would have
forced a separate foundation repo (see below).

`addons21` is **not** a fringe/partial consumer. Despite living outside `~/dev`
and rendering in Anki's Qt WebEngine webview, it duplicates `fund`'s frontend
near-identically: `terminal/index.html` + `js/terminal.js` + `css/terminal/`,
`animated_glass_background/web/glass_effect.js` + `css/ambient/`,
`css/container.css`, `css/table.css`, `js/ui/*`, plus the same toolchain
(`eslint.config.cjs`, `.stylelintrc.cjs`, `Makefile`, `pyproject.toml`,
`.claude`, `.gemini`, `.jules`). The glass effect, terminal, and nav container
are **already copy-duplicated** between `fund` and `addons21` — this is among the
strongest motivations for a shared-brand package, not an edge case.

Constraint this imposes: shared components must be **rendering-host-agnostic** —
the same ESM/CSS has to work in a normal browser _and_ in the Chromium version
Anki's Qt WebEngine ships. Avoid browser-only APIs and check CSS feature support
against that bundled engine.

## Foundation repo: reuse `~/dev/ryusoh` (the profile repo)

**Decision: the `ryusoh/ryusoh` profile repo is the foundation.** Rationale is
minimalism — zero new repos. `ryusoh/ryusoh` is the GitHub profile repo (a repo
whose name equals the username), but **only its `README.md` renders on the public
profile** — any other folders (`.github/workflows/`, a `foundation/` subdir, an
ESM package) are invisible there and behave like a normal repo. So it can host
foundation content without disfiguring the profile.

The one constraint that would have forced a separate repo — _can't hold anything
private_ — **does not apply**: all five repos are already public, so nothing of
value would ever need a private home.

**Disciplines that keep it tidy** (these neutralize the remaining cons —
tag/history mixing, surprise factor):

1. **Namespace foundation content in a subdir** (`foundation/`, plus the natural
   `.github/workflows/` for CI). Keep the repo root and `README.md` pristine so
   the profile stays clean.
2. **Decide the tag strategy up front.** Versioning the brand via git tags
   (`@v1`) puts those tags on the profile repo's release namespace — accept that,
   or prefix/path-scope tags so they read clearly.
3. **Hard rule: nothing private here** (the repo is permanently public).

Consumers reference it as e.g.
`uses: ryusoh/ryusoh/.github/workflows/ci.yml@v1`, vendor brand assets from it,
or pin a jsDelivr CDN URL against it (works because it's public).

- Native bonus available later: a repo literally named `ryusoh/.github` supplies
  **default community-health files** (issue templates, `FUNDING.yml`, profile
  defaults) to any repo lacking its own. It's a separate repo (+1), so skip it
  for now under the minimalist constraint — revisit only if community-health
  defaults become worth one extra repo.
- Before wiring reusable workflows: **normalize `ryusoh.github.io` from `master`
  to `main`** so `@tag`/branch refs stay uniform across consumers.

### Decision record: why the profile repo, not a dedicated one

**Context.** ~5 public repos (`fund`, `ryusoh.github.io`, `networking`, Anki
`addons21`, profile `ryusoh`) share a brand/visual language, configs, CI, and
agent commands by copy. A single source of truth is wanted. The owner's
overriding value is **minimalism — as few repos as possible.**

**Options considered:**

1. **Monorepo** — rejected. Independent deploys (`fund` and `ryusoh.github.io`
   each ship to GitHub Pages with their own `CNAME`) and cadences make it cost
   more than it returns; couples deploys, loses per-repo simplicity.
2. **Dedicated `ryusoh/foundation` repo** — viable and cleanest in isolation
   (self-documenting, separate tag/release namespace), but **+1 repo**, which
   loses on the minimalism criterion.
3. **`ryusoh/.github` repo** — gives native community-health defaults for free,
   but still **+1 repo**.
4. **Reuse the `ryusoh/ryusoh` profile repo** — **chosen.** Net **zero new
   repos**.

**Why option 4 won:** the two objections that originally argued against it both
collapsed on inspection — (a) "it disfigures the public profile" is false, since
_only `README.md` renders_ and other folders are invisible; (b) "it can't hold
private content" is moot, since _all five repos are already public_. What remains
(tag/history mixing, mild surprise factor) is cosmetic and fully handled by the
three disciplines above.

**Consequences accepted:** foundation commits/tags share the profile repo's
history and release namespace; the repo is permanently public (no private
content ever); anyone reading the profile's "Code" tab sees tooling beside the
README. These were judged acceptable in exchange for keeping the system at five
repos instead of six.

**Revisit if:** something needs to go private, the brand package's release
namespace starts conflicting with profile-site versioning, or community-health
defaults become worth a `.github` repo — any of which would justify promoting
foundation into its own dedicated repo (option 2).

## TL;DR

- **Don't monorepo.** Independent deploys + cadences make a monorepo cost more
  than it returns. Stay polyrepo.
- Use the existing **`ryusoh/ryusoh` profile repo as the foundation** (single
  source of truth) — zero new repos. Viable because only its `README.md` renders
  on the profile and all five repos are public. Keep foundation content in a
  subdir.
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
