---
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
   If `$ARGUMENTS` is non-empty, focus the retrospective there.

2. **Map each friction point to a principle and a durable artifact.** Use
   `docs/ai_native_repo_structure.md` as the framework (e.g. §2 fast scoped
   verification, §7B knowledge capture, §11 edit precision, §15 cache-stable
   context, §17 the compounding loop). For each, name the artifact that would
   have prevented it: a knowledge doc under `docs/`, a line in `CLAUDE.md`, a
   `Makefile` target, a test / lint / CI gate, or a script/skill.

3. **Check what already exists first.** Read the relevant `CLAUDE.md`, `Makefile`,
   `docs/`, and `.claude/` before adding anything, so you patch real gaps instead
   of duplicating. Don't put repo knowledge in chat or memory if it belongs in a
   version-controlled file.

4. **Implement the safe, high-leverage fixes now.** Knowledge capture, auto-loaded
   context updates, scoped commands, deduplication, and tests/gates are usually
   safe to just do. Keep `CLAUDE.md`/`AGENTS.md` small and stable (every edit
   busts the prompt cache for future sessions). Promote standards up the ratchet:
   prose → checklist → lint/type rule → CI-blocking check.

5. **Ask before anything heavy or hard to reverse** — new dependencies, browser or
   tool installs, CI changes, file moves, anything outward-facing. Present the
   trade-off and let the user choose; don't install it unilaterally.

6. **Verify and report.** Run the relevant `make` checks, keep tests and lint
   green, and summarize what you changed and exactly how it pays off next time.
   Do not commit unless explicitly asked.

Guiding test (§17A): _a correction given today should be impossible to need next
month_ — because it now lives in the repo, not in this conversation.
