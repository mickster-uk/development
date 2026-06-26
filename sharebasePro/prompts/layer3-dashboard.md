# Layer 3 Prompt — Dashboard & Prediction Engine

## Context
You are extending `src/dashboard/dashboard.html`, `src/dashboard/dashboard.js`,
`src/engine/indicators.js`, `src/engine/rules.js`, or `src/engine/ml.js`.

Architecture:
- `indicators.js` — pure functions, no side effects. Input: history array. Output: computed values.
- `rules.js` — rule-based signal engine. Calls `computeAll()` from indicators, applies thresholds from `strategy`, returns `{ signal, score, signals[], mlScore, reasoning }`.
- `ml.js` — brain.js neural network. `trainModel(history)` trains from rule labels. `scoreWithML(ind)` returns 0–1.
- `dashboard.js` — renderer. Calls `window.api.*` (IPC) only. Draws charts with Chart.js. No Node.js APIs.
- `dashboard.html` — static shell. All dynamic content injected by `dashboard.js`.

Scoring: `score = ruleScore * 0.6 + mlScore * 100 * 0.4`. Signal: score ≥ 60 = BUY, ≤ 35 = SELL, else HOLD.

---

## Coding Standards (non-negotiable)

### 1. Think Before Coding
- Before adding a new indicator: confirm which npm package provides it, or state that you'll implement it from first principles. Don't assume `technicalindicators` has everything.
- Before changing score weights or thresholds: state the assumption about why the current values are wrong, and propose the change explicitly. Don't silently adjust numbers.
- If a new rule's interaction with existing rules is unclear (e.g., double-counting a signal), name the conflict and propose a resolution.
- If adding an ML feature: explain why it's a meaningful predictor before adding it to the `normalise()` function.

### 2. Simplicity First
- `indicators.js` functions must be pure: same input → same output, no state. If you need state, it belongs in `ml.js`.
- Chart.js is already loaded via CDN. Do not add another charting library.
- The renderer recomputes SMA/RSI/MACD series client-side for charting. Don't add an IPC call to fetch pre-computed series — the computation is cheap enough for the renderer.
- `rules.js` returns a flat result object. Do not nest signal groups or add sub-categories unless asked.
- brain.js hidden layers are `[8, 4]` and activation is `sigmoid`. Don't change the architecture unless you have a specific reason and state it.

### 3. Surgical Changes
- To add a new indicator: add one exported function to `indicators.js` and call it inside `computeAll()`.
- To add a new rule: add one `if` block in `getRecommendations()` in `rules.js`. Each rule pushes to `signals[]` and adjusts `bullPoints`/`bearPoints`.
- To add a new ML input feature: add one normalised key to `normalise()` in `ml.js` and the matching raw computation to `buildTrainingData()`.
- To add a new dashboard panel: add one `<div>` to the injected `detailEl.innerHTML` in `renderDetail()`. Do not restructure the existing layout.
- Chart changes: destroy the old chart instance before creating a new one (see `[priceChart, rsiChart, macdChart].forEach(c => c?.destroy())`).

### 4. Goal-Driven Execution
Transform any task into a verifiable checklist before coding:

```
1. Add Stochastic indicator          → verify: computeAll() returns stoch field; rules.js can read it
2. Add a new BUY rule for Stoch      → verify: signal appears in rec.signals[] when stoch < 20
3. Add normalised stoch to ML        → verify: normalise() returns stochK key in [0,1]
4. Display stoch on dashboard        → verify: new chart renders without breaking price/RSI/MACD charts
```

---

## Scoring rules — important invariants
- `bullPoints + bearPoints` is the denominator for `ruleScore`. Adding a new signal without cap can dilute all existing scores.
  → Before adding a new signal, state how many points it awards and whether that's proportionate to existing signals.
- `mlScore` is `null` until `trainModel()` has been called with sufficient history (30+ data points).
  → The UI must handle `null` gracefully — it already shows "ML: training…" in this case. Don't remove that fallback.

---

## Files you may touch
- `src/engine/indicators.js`
- `src/engine/rules.js`
- `src/engine/ml.js`
- `src/dashboard/dashboard.html`
- `src/dashboard/dashboard.js`

## Files you must not touch
- `main.js`, `preload.js`, `src/interview/*`, `src/data/*`
