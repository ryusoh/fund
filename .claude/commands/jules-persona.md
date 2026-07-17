---
description: Improve a Jules routine's scheduled prompt + enhance its .jules/<name>.md persona to the repo's house conventions
argument-hint: "<routine> [— paste the current Jules scheduled prompt]"
---

You are tuning one of this repo's autonomous **Jules routines**. The live routines
are `architect`, `bolt`, `janitor`, `sentinel`, `testpilot`, `typist` (`palette` is
deprecated/retired). Produce two things for the named routine, both conforming to
the shared contract.

## First, read (don't guess)

- `AGENTS.md` — the shared contract every routine inherits. Do **not** restate its
  rules in the prompt/persona; reference it.
- `.jules/<routine>.md` — the current persona.
- If the user pasted the routine's current scheduled prompt, treat it as the source
  to professionalize. If not, derive from the persona + its lane.

## Output A — improved scheduled prompt (plain text, for the Jules UI)

Rewrite to the house style. Hard requirements:

- **Autonomous, zero interaction.** Never ask for permission, confirmation,
  clearance, or instruction; never propose a plan for review. One pass:
  decide → implement → verify → publish. The reviewer accepts or closes the PR.
- **No emoji anywhere** — prompt, PR title, body, commit messages, code comments.
- **Real toolchain only.** `make install-dev`, `make verify`, scoped `venv/bin/*`
  and `npx jest <file>`. Never invent a stack (no pnpm/vitest/SQL/React) — check
  the repo if unsure.
- **Reads `AGENTS.md` + `.jules/<routine>.md`; never modifies `.jules/`.** Remove
  any "append/record/log to journal" clause — personas are read-only.
- **Stays in its lane** (per the AGENTS.md lanes table); skip out-of-lane findings.
- **Before starting:** `python3 -m scripts.agents.prior_prs` to avoid repeating
  pending or previously-rejected work.
- **Smallest single-purpose diff.** Open a PR only if `make verify` is green, and
  paste the verification output in the PR body (self-proving).
- **Conventional Commit title** (`type(scope): summary`), no routine-name prefix,
  no emoji; subject may be English or Japanese. The PR title is the squash subject.
- **Diff-coverage aware:** a behavioural change ships a fail-before/pass-after test
  covering the changed lines; behaviour-preserving lanes (typing, refactor,
  dead-code) need no new test.
- **Visual blind spot:** never claim visual parity; visual work → draft + human
  review.
- Empty run is acceptable — open no PR rather than invent or stray.

## Output B — enhanced `.jules/<routine>.md`

Standard sections, tight: `# <Name> — <role>`, **Operating mode** (autonomous),
**Mandate**, **Before starting** (prior-PR check), **Lane** (own / must-NOT-touch,
naming the other routine that owns adjacent work), optional **Known pitfalls / repo
specifics** (fold durable facts from the pasted prompt; discard any dated log
entries), **Verification gate**, **Commit and pull request** (Conventional Commits
per `AGENTS.md`). Start with the read-only boilerplate: "do not modify it or any
file under `.jules/`."

## Then

- Lint what you wrote: `npx markdownlint <file>` and let the prettier PostToolUse
  hook format it (or `npx prettier --check`). Keep green.
- **Do not edit `AGENTS.md`** unless a genuinely new _shared_ rule is needed — it
  busts the prompt cache for every routine. If one is, call it out explicitly.
- Work on `main`; don't commit unless asked.
