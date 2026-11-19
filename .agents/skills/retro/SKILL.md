---
name: retro
description: Retrospective — turn this session's friction into durable repo improvements (the compounding loop)
argument-hint: "[optional focus area, e.g. 'visual verification']"
---

You just finished a task. Run a **compounding-loop retrospective** so the next task
in this repo is closer to one-shot. Be honest and concrete, and prefer patching the
repo over re-explaining things in chat.

Work through these steps:

1. **Diagnose the friction.** Look back over THIS session and name the specific
   things that cost tokens or caused back-and-forth: wrong guesses, missing
   context, repeated verification, commands you had to discover, knowledge you
   re-derived from scratch, edits that matched the wrong site. Quote concrete
   moments — don't generalize.
   If `{{args}}` is non-empty, focus the retrospective there.

2. **Map each friction point to a principle and a durable artifact.** Use
   `docs/ai_native_repo_structure.md` as the framework (e.g. §2 fast scoped
   verification, §7B knowledge capture, §11 edit precision, §15 cache-stable
   context, §17 the compounding loop). For each, name the artifact that would
   have prevented it: a knowledge doc under `docs/`, a line in `AGENTS.md`, a
   `Makefile` target, a test / lint / CI gate, or a script/skill.

3. **Check what already exists first.** Read the relevant `AGENTS.md` section,
   `Makefile`, `docs/`, and skills before adding anything, so you patch real
   gaps instead of duplicating. Repo knowledge belongs in a version-controlled
   file rather than chat or memory.

4. **Implement the safe, high-leverage fixes now.** Knowledge capture, scoped
   commands, deduplication, and tests/gates are usually safe to just do.
   Promote standards up the ratchet: prose → checklist → lint/type rule →
   CI-blocking check — a gate makes the prose redundant, so shrink the prose
   when you add one.

5. **Ask before anything heavy or hard to reverse** — new dependencies, browser or
   tool installs, CI changes, file moves, anything outward-facing. Present the
   trade-off and let the user choose; don't install it unilaterally.

6. **Verify and report.** Run the relevant `make` checks, keep tests and lint
   green, and summarize what you changed and exactly how it pays off next time.
   Do not commit unless explicitly asked.

7. **Distill the session into a skill delta (ACE step).** Ask: "what did this
   session teach about _how_ to do X?" If the answer generalizes beyond this
   task, edit the existing `.agents/skills/*/SKILL.md` or `AGENTS.md` it
   belongs to rather than spawning a near-duplicate skill. Every line in an
   auto-loaded file is paid for in every session, so a line earns its place
   only if it is a repo/environment fact a capable model can't infer, a user
   preference, or cheaper than rediscovery. Write it as the fact or goal
   ("`data/` is pipeline output — regenerate it"), not a new prohibition or an
   incident story (dates and PR numbers belong in commit messages and docs).
   When the section you touch already covers the point, merge or replace
   instead of appending. Run `make sync-check` after any skill edit.

Guiding test (§17A): _a correction given today should be impossible to need next
month_ — because it now lives in the repo, not in this conversation.
