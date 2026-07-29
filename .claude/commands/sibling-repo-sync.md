---
description: Propagate a tooling/gate improvement from this repo to the sibling repos (ryusoh.github.io, anki, networking) — adapt, don't copy
argument-hint: "[what to sync, e.g. 'the complexity gate' or 'depcheck']"
---

Propagate an improvement made in this repo (`~/dev/fund`) to the sibling repos:

- `~/dev/ryusoh.github.io` — JS-only static site (plain `<script>` tags, no ES
  modules, no Python pipeline); CI-parity gate = `make precommit-fix` (runs
  `.pre-commit-config.yaml` hooks, sync-check, Jest + coverage, etc.); Makefile
  `lint-js` uses `--max-warnings=0`; default branch is **`master`**, not `main`;
  `package-lock.json` is authoritative, `pnpm-lock.yaml` drifts by convention
  (regenerated out-of-band) — don't regenerate it; its sync generator is
  `tools/sync_commands.py` (not `scripts/`); `precommit-fix` stages auto-fixes
  via `git add -u` — uncommitted work may get staged; its `ship` skill has no
  Mode A/B split (single numbered flow on `master`, gates `make check` +
  `make test`, asks for acknowledgement before pushing); run prettier there
  via `./scripts/run-npx.sh prettier`.
- `~/dev/anki` — JS + Python (Anki addons); **no** `.pre-commit-config.yaml`;
  CI gate = `make precommit SKIP=1` (fmt-check lint typecheck-js quality-py
  check sync-check); aliases via package.json `imports` (`#js/*`, `#ui/*`);
  Python addon dirs are REAL packages (`__init__.py` present) — import-linter
  works here; its sync generator is `tools/sync_commands.py` and its
  frontmatter parser is naive (single-line `description`/`argument-hint` only);
  `precommit-fix` has a `YOLO=1`/`MSG=` mode that runs `git add -A` — hazard
  for uncommitted work.
- `~/dev/networking` — JS + Python; **no** `.pre-commit-config.yaml`; gate =
  `make precommit` (on macOS the parity gate is `make precommit-docker` —
  raw-socket tests fail on the host; gate **exits 0 amid alarming-looking
  noise** — judge by exit code, not the log); `Dockerfile.precommit`
  pip-installs `requirements-dev.txt` and runs `npm ci`; its AGENTS.md
  non-negotiable #6 forbids JULES ROUTINES from adding dependencies or touching
  build/lint/test config (and #5 pins jest to v29) — interactive agents acting
  on explicit user direction are exempt, note it in the PR body; its sync
  generator is `tools/sync_commands.py` (naive `content.split("---", 2)`
  frontmatter parser — a `---` horizontal rule in a skill body would be
  mangled); its `ship` skill uses `<primary-branch>`/`<branch_name>`
  placeholders (deliberately no hardcoded `main`), has an audience check and
  asks for acknowledgement before pushing.

Verify these facts against each repo's current AGENTS.md/Makefile before
relying on them — they drift.

Fund-specific quirks that do NOT exist in any sibling (checked 2026-07):
none of the three has a pre-push hook (fund's `.husky/pre-push` fast-forward/
deletion guard is unique — anki's `make hooks` installs only pre-commit), and
their `.jules/` personas already gate on their own CI-parity gate — the
`make verify` vs `make precommit-fix` split that bit fund's Bolt persona is
fund-specific.

This skill exists in all four repos (added 2026-07), each with the perspective
flipped to its own home repo — a sync can be initiated from any side. When
improving this skill, sync the improvement to the other three copies.

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

## Fleet resilience (learned running 5 parallel sync agents)

A provider quota/error event can kill background agents mid-flight (4 of 5
died at once in the 2026-07 run). Recovery pattern that worked cleanly:
`Agent(resume=...)` retains the agent's full context — resume each failed
agent with "audit what you already did (git status / git log), then
continue"; commits it made are fine, uncommitted partial work gets assessed
before it proceeds. The per-repo isolation of this skill's delegation pattern
is what makes partial failure cheap: one dead agent never poisons another
repo's tree.
