Adopt the protocol below for: $ARGUMENTS

# Node.js Build Protocol

The primary protocol for building or significantly changing Node.js tools and services, **specialising in REST API production**. A protocol the main session adopts — the session builds and dispatches the specialist agents.

This protocol is for **significant-tier** work (new app/service, new dependency, structural change — see the orchestrator's task tiers). Small features take the light path: build → tester, docs batched.

## Runtime

Use the **globally installed Node.js** at `/opt/homebrew/bin/node` (version table in the Agents README). No per-project `node_modules` unless a dependency is truly necessary; prefer built-ins:

- `node:http` for servers (reach for a framework only if the researcher makes a concrete case)
- Native `fetch` for outbound requests
- `node:fs/promises`, `node:path`, `node:crypto`, `node:util` over userland equivalents
- Jest remains the repo's test runner (the tester agent owns that trade-off)

## REST conventions

- Plural resource nouns (`/stocks`, `/notes/:id`); verbs come from the HTTP method, never the path
- Correct status codes: 200/201/204 on success; 400 validation, 404 missing, 500 unexpected — with a consistent JSON error envelope `{ "error": { "message": ... } }`
- Validate input at the boundary, reject early; never trust query/body shapes
- Version the base path (`/v1/`) for anything another app consumes (e.g. Mik3Bot → WebAgent)
- Local-first: bind to localhost, no auth layers unless explicitly asked for

## Steps

1. **Interview.** Interview Mike before anything else: goal, consumers of the API, endpoints and payloads expected, constraints, success criteria, non-goals. Structured questions (AskUserQuestion) until nothing material is ambiguous; reflect the understanding back and get confirmation before starting.

2. **Research.** Dispatch the `researcher` agent (orchestrator protocol applies) with the confirmed brief.

3. **Verify thinking.** Before any code: restate the plan, check it against the conventions above and the researcher's recommendation, and name the riskiest assumption. For architectural choices, dispatch the `validator` in reasoning mode with the problem — not the conclusion — and compare. Build only once the plan survives.

4. **Build.** The main session implements. Small focused modules, plain JS, no comments unless the why is non-obvious.

5. **Follow-up agents.** In parallel: `validator` (code mode), `architect` (documentation mode — the API map is required), `documenter`, and `test-data` (fixtures should include malformed request payloads). When test-data reports its paths, dispatch `tester` with them; for HTTP apps the tester also runs k6 performance tests.

6. **Fix and retest.** If the tester or validator report failures: the main session fixes, then re-dispatches the tester with the same fixtures. Repeat until green or genuinely blocked — never ship on a red run, and never weaken a test to get green.

7. **Report and persist.** One summary: research recommendation, endpoints built, validator/test/k6 results (including failures), doc locations. Save each agent's report to `../runs/{YYYY-MM-DD}-{agent}.md` for the improvement loop.
