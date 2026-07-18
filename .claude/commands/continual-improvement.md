Adopt the protocol below for: $ARGUMENTS

# Continual Improvement Protocol

A recurring loop that keeps the agents and protocols in this folder up to date, instead of letting them rot. Its engine is the `agent-improver` agent; improvement is **guided** — nothing changes without Mike's answers.

## What the loop does

Each iteration:

1. Dispatch the `researcher` agent: *"Review current best practice for AI agent design, orchestration patterns, and Claude Code subagent capabilities. Compare against the agent definitions and protocols in `~/Documents/knowbase/Agents/`. What is outdated, missing, or now done better?"*
2. Dispatch the `agent-improver` for each agent with recent output in `../runs/` (one audit per agent, in parallel), passing the relevant run files as its samples. Agents with no runs since the last iteration get a static audit or are skipped. It returns findings, proposed edits, and a prepared interview.
3. **Interview.** The main session runs the improver's interview with Mike (AskUserQuestion). Only edits supported by his answers are applied — plus anything marked *safe to apply without asking*.
4. **Apply and verify.** Edit the definitions in `definitions/`, sync the copies in `~/Desktop/development/.claude/agents/`, confirm frontmatter is valid, and refresh the Drive backup (`My Drive/Backups/Agents/`).
5. Log what changed and why under **Change log** below.

## How to run it

- **Manual** — *"Run the continual improvement protocol."* Good for an occasional tune-up, or targeting one agent: *"Run the improver on the researcher."*
- **Session loop** — `/loop` in an open session, with an interval or self-paced.

The loop must run **locally** — a `/schedule` cloud routine cannot see `~/Documents/knowbase/Agents/` (remote environments don't have this filesystem), so scheduled cloud runs are off the table for this protocol. A weekly manual run is the realistic cadence; the interview step needs Mike present anyway.

Recommended cadence: **weekly**.

## Guard rails

- The loop edits *agent definitions and protocols only* — never app code.
- Interview-gated: no definition change without Mike's answer covering it (typo-level fixes excepted).
- Never weaken safety rules (verify-before-build, honest failure reporting, read-only boundaries).
- Every change appears in the change log with a date and a one-line reason.
- If two consecutive runs find nothing to change, widen the research brief or lengthen the cadence.

## Change log

- 10/07/2026 — Protocol created.
- 13/07/2026 — Wired `agent-improver` in as the loop's engine; improvement is now interview-gated.
- 13/07/2026 — Framework review applied: added `validator` agent (code + blind reasoning modes); task tiers in the orchestrator; agent reports persisted to `runs/` as audit evidence; scheduled cloud leg dropped (no local filesystem) in favour of weekly local runs; per-agent `model:` frontmatter; tester toolchain bootstrap; test-data tool trim; version numbers deduplicated to the README; sync script + slash commands added; CLAUDE.md Subagents section replaced with framework pointers.
- 18/07/2026 — Full loop run (researcher review + 7 improver audits; interview complete, all recommended options taken). **Logging**: runs/ reports are now saved verbatim with session notes separate; standard **Status** (complete/partial/blocked) envelope added to every definition — four audits independently found summaries made agents unauditable. **Codified habits**: validator gained Checked-clean + Unverified sections, severity-ordered findings with failure scenarios, verdict counts, blindness statement, blast-radius check, reasoning self-risks; researcher gained always-present Risks, per-option flip conditions, primary-source discipline, incidental-defect flagging, multi-part brief format; tester gained mandatory Untested-surfaces, dated result filenames, never-test-a-copy rule, renderer export-guard route (requested from session), batched Playwright policy (agentBase catch-up queued); documenter gained Flagged list + never-source-code bullet + scope wording fix; architect gained canonical-copy rule, verify/correct/preserve mandate, design-mode report-only, "significant" vocabulary; test-data gained shape-statement preamble. **electron-ui** (after 17/07 double stall): three-deliverable scope guard with Not-attempted list, assets always a separate dispatch, top-down report ordering, matching orchestrator briefing rule; stays fully read-only (checkpoint carve-out declined). **Platform pass**: two-level-hierarchy claims corrected to flat-by-policy in orchestrator/electron-build/ideation/README; re-dispatch → resume; background-by-default noted; validator no-fork rule; delegation-brief template (objective/format/tools/boundaries) in orchestrator step 4; `maxTurns` on all nine definitions; `memory: project` on agent-improver. **Declined**: architect WebSearch removal, tester fixture self-service, test-data description trigger change (routing stays orchestrator-only). Stale agentBase/architecture.md deleted from the repo.
