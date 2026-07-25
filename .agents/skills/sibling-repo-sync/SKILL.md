---
name: sibling-repo-sync
description: Propagate a tooling/gate improvement from this repo to the sibling repos (ryusoh.github.io, anki, networking) — adapt, don't copy
argument-hint: "[what to sync, e.g. 'the complexity gate' or 'depcheck']"
---

Propagate an improvement made in this repo (`~/dev/fund`) to the sibling repos:

- `~/dev/ryusoh.github.io` — JS-only static site; gate = `.pre-commit-config.yaml`
  hooks (CI runs `pre-commit run --all-files`); Makefile `lint-js` uses
  `--max-warnings=0`; `pnpm-lock.yaml` drifts by convention, don't regenerate it.
- `~/dev/anki` — JS + Python (Anki addons); **no** `.pre-commit-config.yaml`;
  CI gate = `make precommit SKIP=1` (fmt-check lint typecheck-js quality-py
  check sync-check); aliases via package.json `imports` (`#js/*`, `#ui/*`);
  Python addon dirs are REAL packages (`__init__.py` present) — import-linter
  works here.
- `~/dev/networking` — JS + Python; **no** `.pre-commit-config.yaml`; gate =
  `make precommit`; `Dockerfile.precommit` pip-installs `requirements-dev.txt`
  and runs `npm ci`; its AGENTS.md non-negotiable #6 forbids JULES ROUTINES from
  touching build/lint config — interactive agents acting on explicit user
  direction are exempt, note it in the PR body.

Verify these facts against each repo's current AGENTS.md/Makefile before
relying on them — they drift.

## Process

Delegate one subagent per repo, in parallel. Brief each with:

1. **The reference implementation** — point at the concrete files in THIS repo
   that carry the pattern (config, Makefile target, hook, doc status block).
2. **Adapt, don't copy.** Every rule/ceiling must map to the target repo's own
   structure and stated beliefs (its AGENTS.md non-negotiables), measured
   against its code — not fund's. Precedent: fund's `no-cross-page-imports`
   rule was correctly dropped in both JS siblings (no `js/pages/` there), and
   fund's Python import-linter skip was correctly REVERSED in anki (real
   packages, real edges). A rule that fires zero times AND maps to nothing the
   repo believes is decorative; a rule that fires on an accepted pattern is
   false — measure first, then decide.
3. **Find the REAL gate first.** Read `.github/workflows`, Makefile
   `precommit*` targets, and `.pre-commit-config.yaml` BEFORE designing —
   `make verify`-green is not CI-green (fund learned this the hard way: the
   eslint pre-commit hook ran `--max-warnings=0`). Wire the new check into the
   path CI actually executes.
4. **Baselines and ratchets.** If the new check fires on legacy code: prefer
   error-severity + a baseline file (ESLint bulk suppressions model) over
   warning budgets; the baseline only ratchets down. If it fires zero times,
   ship it baseline-free as a preventive gate — that's a fine outcome.
5. **Probe protocol.** Append the probe to a TRACKED file → gate must fail →
   `git restore` → gate must pass → `git status` clean. Never create new files
   for probes; never mask backup/restore errors with `|| true`.
6. **Resolution proof for dependency tooling.** When wiring alias resolution
   for dependency-cruiser: use a webpack-config stub, NEVER `options.tsConfig`
   (typescript v7 repos get a spurious "missing-typescript-transpiler"
   warning); `enhancedResolveOptions` rejects alias keys. Prove resolution by
   comparing "N modules, M dependencies" with and without alias config —
   dependency count must be identical and module count must match the
   tsConfig-route count; an inflated module count means unresolved aliases are
   fake external nodes and path-based rules silently don't match them. If the
   repo has no aliases at all, ship an empty-alias stub with a comment, or no
   stub — don't add decorative config.
7. **Python import-linter check.** grimp has no PEP 420 namespace-package
   support. Check `__init__.py` presence and whether the interesting import
   edges are visible to grimp before wiring a contract; if the graph is
   invisible or empty, document the skip WITH the measurement evidence and the
   unblock condition (fund §3 model). Beware: `python -m importlinter.cli`
   silently no-ops — call the click entry point; grimp writes `.grimp_cache/`
   into the repo root (add to .gitignore or delete).
8. **Finish per repo:** run prettier/fmt over new config files, run the repo's
   own full CI-parity gate green, update its AGENTS.md (command table + short
   note), update the `.jules/` persona whose lane owns the new metric (if
   any). **Never commit** — leave changes uncommitted and report: violation
   counts, resolution proof, files changed, probe exit codes, gate result,
   skip decisions with evidence.

## After the sync

Update this skill's repo profiles above with anything the run learned that
contradicts them, and record the sync in each repo's own docs (they each keep
their own AGENTS.md/tooling docs — the knowledge lives in the repo it
concerns, not here).
