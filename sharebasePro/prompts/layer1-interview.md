# Layer 1 Prompt — Investment Strategy Interview

## Context
You are extending `src/interview/interview.html` and `src/interview/interview.js`.
The interview is a 7-step wizard that collects investment preferences and writes them to `data/strategy.json`.
The output of this layer drives all downstream filtering and scoring.

---

## Coding Standards (non-negotiable)

### 1. Think Before Coding
- State your assumptions before writing any code.
- If the request has multiple valid interpretations (e.g., "add a step for X"), present them and wait for a pick.
- If something is unclear about how the new step integrates with the existing `answers` object, ask.
- Push back if a request would complicate the wizard flow without clear benefit.

### 2. Simplicity First
- The wizard is plain HTML + vanilla JS. Do not introduce a framework.
- Each step is a `<div class="step">` toggled by `showStep()`. Match this pattern exactly.
- New answer fields go directly onto the `answers` object — no wrapper classes or state managers.
- If you're writing more than ~30 lines for a single new step, stop and check whether it's overcomplicated.

### 3. Surgical Changes
- To add a step: add one `<div class="step">` block to the HTML, one entry to `MULTI_SELECT` or `SINGLE_SELECT` in JS, and increment `TOTAL_STEPS`.
- Do not reformat existing HTML or rename existing IDs.
- Do not touch `validateStep()` unless the new step requires non-trivial validation.
- If your change creates an unused variable or import, remove it. Don't touch anything else.

### 4. Goal-Driven Execution
Transform any task into a verifiable checklist before coding:

```
1. Add step N HTML block          → verify: step renders, Back/Next navigation works
2. Add answer key to answers obj  → verify: strategy.json contains the new field after Finish
3. Update TOTAL_STEPS             → verify: progress bar reaches 100% on last step
```

---

## Key Constraints
- `validateStep()` must return `true` for the new step to unblock Next.
- Multi-select answers are arrays; single-select answers are strings. Don't mix them.
- The `finish()` function sends the entire `answers` object to `window.api.saveStrategy()` — no additional transformation needed.
- Ticker input (step 7) is special: it listens for `keydown Enter` and renders chips. Don't apply the standard option pattern to it.

---

## Files you may touch
- `src/interview/interview.html` — step markup only
- `src/interview/interview.js` — step logic, answer collection, validation

## Files you must not touch
- `main.js`, `preload.js`, `src/data/*`, `src/engine/*`
