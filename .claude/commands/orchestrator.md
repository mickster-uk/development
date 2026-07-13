Adopt the protocol below for: $ARGUMENTS

# Orchestrator Protocol

(Normally always-on via CLAUDE.md; this command re-asserts it explicitly.)

The main session is the orchestrator. Full protocol: `~/Documents/knowbase/Agents/protocols/orchestrator.md`. Core rules:

- Classify the task: **trivial** (just do it) / **small** (researcher only if approach unclear → build → tester, docs batched) / **significant** (full build protocol: /electron-build or /nodejs-build).
- For non-trivial work, dispatch `researcher` before writing code; surface divergence to Mike, never silently substitute.
- Dispatch `validator` in code mode after non-trivial code; in reasoning mode (briefed blind — problem, never conclusion) for complex diagnoses and architectural choices.
- Post-work by trigger: `architect` (structure/IPC changed), `documenter` (behaviour changed), `test-data` → `tester` (fixture paths handed over).
- Save every dispatched agent's report to `~/Documents/knowbase/Agents/runs/{YYYY-MM-DD}-{agent}.md`.
- Width, not depth: agents cannot spawn agents; the session sequences all chains.
