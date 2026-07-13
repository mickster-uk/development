Adopt the protocol below for: $ARGUMENTS

# Electron Build Protocol

The primary protocol for building or significantly changing an Electron app. Like the orchestrator, this is a **protocol** the main session adopts — the session does the building and dispatches the specialist agents, because agents cannot spawn agents.

This protocol is for **significant-tier** work (new app, new dependency, IPC/structural change — see the orchestrator's task tiers). Small features take the light path: build → tester, docs batched.

## Runtime

Use the **globally installed Electron** at `/opt/homebrew/bin/electron` (version table in the Agents README). Launch apps with `electron .`; do not add a per-app `electron` devDependency or install `node_modules` just to run an app.

Quirk: inside Claude Code the shell has `ELECTRON_RUN_AS_NODE=1` set, which makes the binary report its embedded Node version. Check versions with `unset ELECTRON_RUN_AS_NODE && electron --version`, and unset it before launching apps from this environment.

## Steps

1. **Interview.** Before anything else, interview Mike: the goal, who uses the feature and when, constraints, success criteria, and explicit non-goals. Ask structured questions (AskUserQuestion) until nothing material is ambiguous, then reflect the full understanding back and get confirmation. Do not start on an unconfirmed understanding.

2. **Research.** Dispatch the `researcher` agent (orchestrator protocol applies) with the confirmed brief.

3. **Verify thinking.** Before any code: restate the plan, check it against the Electron conventions below and the researcher's recommendation, and name the riskiest assumption. For architectural choices, dispatch the `validator` in reasoning mode with the problem — not the conclusion — and compare. Only build once the plan survives this.

4. **UI.** Dispatch the `electron-ui` agent with the interview summary and research findings. Weigh its proposals; apply what fits; surface to Mike anything that diverges from what was agreed.

5. **Build.** The main session implements. Conventions: `contextIsolation: true`, `nodeIntegration: false`; IPC via `ipcMain.handle`/`ipcRenderer.invoke` only; config JSON in `app.getPath('userData')`; unconditional `app.quit()` in `window-all-closed`; plain JS, no build step; arrow wrappers on `addEventListener`.

6. **Follow-up agents.** In parallel: `validator` (code mode), `architect` (documentation mode), `documenter`, and `test-data`. When test-data reports its fixture paths, dispatch `tester` with them — this sequencing is how "the test agent invokes the test-data agent" works within the two-level limit.

7. **Fix and retest.** If the tester or validator report failures: the main session fixes, then re-dispatches the tester with the same fixtures. Repeat until green or genuinely blocked — never ship on a red run, and never weaken a test to get green.

8. **Report and persist.** One summary: what the researcher recommended, what was built, validator and test results (including failures), and where the docs landed. Save each agent's report to `../runs/{YYYY-MM-DD}-{agent}.md` for the improvement loop.
