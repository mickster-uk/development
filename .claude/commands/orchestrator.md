Adopt the protocol below for: $ARGUMENTS

# Orchestrator Protocol

This is a **protocol**, not a spawnable agent. The main Claude Code session adopts it: the session itself is the orchestrator, and it manages the agents defined in `../definitions/`.

## The rule

For any non-trivial task, **always consult the researcher agent first** to check whether a better approach exists, before writing any code — at the depth the task's tier warrants.

## Task tiers

| Tier | Criteria | Process |
|---|---|---|
| **Trivial** | Typo, rename, one-liner, pure question | Just do it — no agents |
| **Small** | Single-app feature, no new dependency, no IPC/structural change | researcher only if the approach is genuinely unclear → build → `tester`; docs batched for later |
| **Significant** | New app, new dependency, IPC/structural change, cross-app work | Full build protocol with the complete agent fan |

A lighter rule that is always followed beats a heavier one that gets skipped. When in doubt between small and significant, ask Mike — one question, not an interview.

## Steps (significant tier)

1. **Classify the task** against the tiers above.

2. **Dispatch the researcher** with the full task description and any constraints. Subagents run in the background by default; request a synchronous run only when the answer decides what to build before anything else can start. Background agents' permission prompts surface in the main session — they are not auto-denied.

3. **Weigh the recommendation.** The researcher advises; the orchestrator decides.
   - If the recommendation matches the plan, proceed.
   - If it diverges from what the user asked for, surface the difference and the reasoning to Mike before proceeding — never silently substitute an approach.

4. **Delegate execution.** Split independent work across parallel agents (one per app for cross-app changes, per CLAUDE.md). Keep dependent work sequential in the main session. Electron app builds follow [electron-build.md](electron-build.md); Node.js / REST API builds follow [nodejs-build.md](nodejs-build.md) — those protocols take over from here and return at the report step.

   Every dispatch brief contains four parts: **objective** (what done looks like), **output format** (the sections expected back), **tool/source guidance** (what to read or search first), and **boundaries** (what is out of scope, including files it must not touch). Agents start cold — a brief that assumes session context is a defective brief. electron-ui dispatches carry at most three deliverables; bulk asset generation (icon sets) is always its own dispatch.

5. **Validate.** After non-trivial code: dispatch `validator` in code mode. For complex bug diagnoses or architectural decisions: dispatch `validator` in reasoning mode, briefed **blind** — the problem, never the conclusion.

6. **Post-work agents.** Per the tier: architect (structure/IPC changed), documenter (behaviour changed), test-data → tester.

7. **Report and persist.** Summarise in one place: what the researcher recommended, what was built, what the validator and tester found. Save every dispatched agent's report **verbatim** to `../runs/{YYYY-MM-DD}-{agent}.md` — the agent's own words, not a session summary. Session notes (fix outcomes, adjudications) go below the verbatim report under a separate heading, never merged into it. The continual-improvement loop audits these files; a paraphrase audits the session, not the agent.

## Notes

- Flat by policy: the platform allows nested subagent spawning (to depth five, since Claude Code v2.1.172), but this framework keeps the hierarchy flat — orchestrator → agents — **by choice**, because every dispatch stays visible to the session and lands in `runs/`. Design for **wide** parallelism (many sibling agents), not deep hierarchies.
- On failure or partial output, prefer **resuming** the same agent (it keeps its full context) over a cold re-dispatch. A stalled or cut-off agent returns partial output — salvage it, then resume with what's missing.
- The researcher is advisory. If its recommendation is weak or generic, say so and fall back on established practice rather than following it blindly.
