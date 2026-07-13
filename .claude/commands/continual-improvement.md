Adopt the protocol below for: $ARGUMENTS

# Continual Improvement Protocol

A recurring loop that keeps the agents and protocols in `~/Documents/knowbase/Agents/` up to date, instead of letting them rot. Its engine is the `agent-improver` agent; improvement is **guided** — nothing changes without Mike's answers.

## What the loop does

Each iteration:

1. Dispatch the `researcher` agent: *"Review current best practice for AI agent design, orchestration patterns, and Claude Code subagent capabilities. Compare against the agent definitions and protocols in `~/Documents/knowbase/Agents/`. What is outdated, missing, or now done better?"*
2. Dispatch the `agent-improver` for each agent with recent output in `~/Documents/knowbase/Agents/runs/` (one audit per agent, in parallel), passing the relevant run files as its samples. Agents with no runs since the last iteration get a static audit or are skipped. It returns findings, proposed edits, and a prepared interview.
3. **Interview.** The main session runs the improver's interview with Mike (AskUserQuestion). Only edits supported by his answers are applied — plus anything marked *safe to apply without asking*.
4. **Apply and verify.** Edit the definitions in `definitions/`, run `scripts/sync_agents.sh` (or sync by hand: `.claude/agents/`, `.claude/commands/`, Drive backup), and confirm frontmatter is valid.
5. Log what changed and why under **Change log** in the protocol file.

## Guard rails

- The loop edits *agent definitions and protocols only* — never app code.
- Interview-gated: no definition change without Mike's answer covering it (typo-level fixes excepted).
- Never weaken safety rules (verify-before-build, honest failure reporting, read-only boundaries).
- Every change appears in the change log with a date and a one-line reason.
- Runs locally only — cloud routines can't see this filesystem.
