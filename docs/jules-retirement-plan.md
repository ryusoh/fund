# Jules retirement plan

**Status:** Proposed  
**Last updated:** 2026-11-02

## Context

Jules allows existing sessions to be finished through November 11, 2026. After
that date, the product becomes read-only until it winds down on December 31, 2026.

The repository currently treats Jules as an active execution environment. Six
personas live under `.jules/`, and tests, documentation, skills, and agent
guidance refer to them as live configuration.

## Decision

Retire `.jules/` from the active repository tree rather than preserving it as an
in-repository archive. Git history is the authoritative archive; a retirement
note should identify the final Jules-era revision for discoverability.

Do not mechanically move the personas into another agent directory. Extract
durable repository knowledge, discard Jules-specific operating instructions, and
recreate individual roles for Antigravity only when an actual workflow needs
them.

## Principles

- Do not disrupt sessions that are still finishing before the read-only cutoff.
- Keep one source of truth for agent guidance; avoid copying rules already in
  `AGENTS.md` into additional documents.
- Separate durable repository knowledge from the unattended Jules operating
  model.
- Remove active-looking configuration and conformance tests when their runtime
  disappears.
- Retain shared tooling that remains useful outside Jules.

## Phase 1: Drain active work (through November 11)

1. Keep the six existing personas stable unless a correction is required for an
   in-flight session.
2. Inventory running sessions and open Jules-authored pull requests.
3. Pause each routine's schedule when its lane stops producing useful work;
   finished lanes need not remain active until the cutoff.
4. Merge or close outstanding Jules pull requests. Do not create replacement
   sessions merely to keep a routine busy.
5. Record the final Jules-era revision when the last schedule is disabled.

## Phase 2: Preserve reusable knowledge

Review each persona and separate its contents as follows:

| Persona content                                           | Disposition                                                                               |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Repository-specific pitfalls and verified techniques      | Move to the relevant subsystem document if not already covered                            |
| Verification and diff-coverage requirements               | Retain in `AGENTS.md` or the quality-gates documentation, without duplication             |
| Lane ownership and collision-avoidance lessons            | Preserve as historical design context or reuse only where interactive workflows need them |
| Stack and toolchain constraints                           | Retain in the central agent guidance                                                      |
| Autonomous, zero-interaction behavior                     | Do not carry into Antigravity                                                             |
| Binary approve/close review and autonomous PR publication | Retire with Jules                                                                         |
| Dated incidents and routine-specific operating details    | Leave in Git history unless they document a still-relevant failure mode                   |

Update `docs/agentic-harness-architecture.md` so its primary architecture
reflects interactive agents and current automation. Reduce the Jules operating
model to a short historical section with a pointer to the final Jules-era
revision.

## Phase 3: Remove the retired harness

Prefer one coordinated cleanup change after active Jules work has drained:

1. Remove `.jules/` and its six persona files.
2. Remove `tests/python/test_jules_personas.py`; it enforces the exact live
   persona set and would otherwise fail after removal.
3. Retire `docs/jules-routine-prompts.md` or replace it with a short historical
   note if it contains operational lessons still worth retaining.
4. Remove `.agents/skills/jules-persona/` and regenerate the corresponding
   `.claude/commands/jules-persona.md` through the repository's normal command
   synchronization process. Do not hand-edit the generated command.
5. Rewrite the active-Jules sections of `AGENTS.md`, including the two-audience
   model, Jules-only editing restrictions, and the live lane table. Keep shared
   rules that still apply to interactive agents and other automation.
6. Add a brief retirement note recording the cutoff dates, the replacement
   interactive workflow, and the final Jules-era revision.

Review related tooling individually rather than deleting it by name:

- Keep the `bot-pr-rescue` skill while recoverable Jules pull requests remain;
  retire it when that transitional need ends.
- Keep `scripts/agents/check_bot_pr_hygiene.py` and its CI integration while bot
  commits still require the gate. Reassess separately if other bot workflows
  depend on it.
- Keep `prior_prs` if it remains useful for avoiding duplicate work outside
  Jules.
- Update `docs/agentic-quality-gates.md`, CI documentation, and skill references
  only where they describe retired behavior.

## Phase 4: Final shutdown check (December 31)

No additional repository change should be necessary at the final shutdown if the
cleanup has landed. Confirm that:

- no schedule or documentation presents Jules as an active execution path;
- no open pull request still depends on a `.jules/` persona;
- historical references clearly describe Jules as retired; and
- retained bot tooling has a current, named consumer.

## Antigravity adoption

Use Antigravity as an interactive development environment first. Do not reproduce
the unattended PR fleet by default.

Port a persona only when a concrete recurring workflow justifies it. Any ported
role must use the current interactive approval, review, branching, and commit
policies rather than inheriting Jules' autonomous behavior. Prefer shared skills
and subsystem documentation over six persistent role definitions.

## Verification

The retirement change is complete when:

- the active tree contains no `.jules/` configuration or persona conformance
  test;
- generated commands are synchronized with their canonical skills;
- active guidance no longer instructs agents to behave as unattended Jules
  routines;
- durable persona knowledge has either been migrated without duplication or
  deliberately left in history;
- the repository's Markdown formatting and lint checks pass for changed docs;
- the full repository pre-commit CI parity gate passes on the final cleanup; and
- the Python and JavaScript test suites pass after removing the obsolete test.

Record the verification results with the cleanup change. Visual review is not
required because this retirement plan changes no rendered page.

## Non-goals

- Preserving duplicate persona copies solely for archival purposes.
- Migrating every Jules routine to Antigravity.
- Removing generic bot protections that still protect active workflows.
- Changing application code, generated data, or the visual frontend.

## Assumptions

- Existing sessions can finish through November 11, after which Jules is
  read-only until December 31.
- Git history is an acceptable long-term archive for the retired personas.
- Interactive agents remain supported through `AGENTS.md`, canonical skills, and
  subsystem documentation.
- No external schedule should remain active after its corresponding repository
  configuration is removed.
