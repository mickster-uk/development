Adopt the protocol below for: $ARGUMENTS

# Ideation Protocol

Turns "what should I build next?" into researched, decision-ready proposals. A protocol the main session adopts; it pairs the idea-generator with the researcher — the session sequences them, keeping the hierarchy flat by policy.

## Steps

1. **Scope.** Confirm with Mike what the ideation is for: one app, several, or the new-app space. Default to everything if unscoped.

2. **Generate.** Dispatch `idea-generator` with the scope. It returns five to eight ideas, each with problem, benefit, look & feel, mechanics, effort, and novelty.

3. **Shortlist.** Present the ideas and let Mike pick (AskUserQuestion, multi-select). Do not research ideas nobody wants.

4. **Research.** Dispatch the `researcher` once per shortlisted idea, in parallel: feasibility, the best implementation approach, and how the new-vs-established trade-off falls for this specific idea.

5. **Dossier.** Combine per idea: benefit → look & feel → how it works → researcher's recommendation and risks → effort. One page each, decision-ready.

6. **Route.** Ideas Mike approves flow into the matching build protocol — [electron-build.md](electron-build.md) or [nodejs-build.md](nodejs-build.md) — starting at its interview step.

## Notes

- Ideas that stall at step 5 are still worth keeping: save the dossier to `~/Documents/knowbase/General/ideas/` so Knowbase can surface them later.
- Run occasionally, not continuously — a backlog of unbuilt dossiers is noise, not progress.
