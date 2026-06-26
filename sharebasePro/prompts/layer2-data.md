# Layer 2 Prompt — Data Fetching & Storage

## Context
You are extending `src/data/fetcher.js`, `src/data/scheduler.js`, or `src/data/storage.js`.
This layer fetches UK and US equity data from Yahoo Finance via `yahoo-finance2`,
schedules daily fetches with `node-cron`, and stores per-ticker per-date JSON snapshots.

Data directory layout:
```
data/
  strategy.json
  stocks/
    AAPL/
      2026-06-24.json
    BARC.L/
      2026-06-24.json
```

Each snapshot contains: `ticker`, `name`, `currency`, `exchange`, `marketCap`,
`currentPrice`, fundamentals (P/E, EPS, dividend yield, beta, growth rates),
and `history` — an array of `{ date, open, high, low, close, volume }` objects
covering the last 300 trading days.

---

## Coding Standards (non-negotiable)

### 1. Think Before Coding
- `yahoo-finance2` has a quirky API. Before assuming a method exists, check the docs or state your assumption explicitly.
- UK tickers use the `.L` suffix on Yahoo Finance (e.g. `BARC.L`). If anything about UK data handling is unclear, ask.
- If a fetch fails for one ticker, it must not block others. State how you're handling partial failures before coding.
- If the request touches the scheduler, confirm the cron expression and timezone before implementing.

### 2. Simplicity First
- Each file has one job. `fetcher.js` fetches, `storage.js` reads/writes, `scheduler.js` starts/stops cron. Don't blur these.
- `storage.js` uses plain `fs.readFileSync`/`writeFileSync`. Do not introduce streams or async file I/O unless dealing with files >10MB.
- The snapshot shape is flat JSON. Do not nest or restructure it without being asked.
- Error handling: catch per-ticker, log to console, push `{ ticker, ok: false, error }` to results. Nothing more.

### 3. Surgical Changes
- To add a new field to the snapshot: add it to `fetchQuote()` in `fetcher.js` only. `storage.js` is transparent.
- To change the schedule: change only the `SCHEDULE` constant in `scheduler.js`.
- To add a new storage query (e.g., get data for a date range): add one exported function to `storage.js`. Don't modify existing functions.
- Do not add retry logic, caching layers, or connection pooling unless explicitly asked.

### 4. Goal-Driven Execution
Transform any task into a verifiable checklist before coding:

```
1. Add field X to fetchQuote()       → verify: data/stocks/AAPL/YYYY-MM-DD.json contains field X after fetch
2. Add getHistory(ticker, days)      → verify: returns correct N entries, sorted ascending
3. Change cron schedule              → verify: scheduler.js logs the new time on start
```

---

## Key Constraints
- `fetchAll(tickers, onStatus)` is the only public entry point for fetching. `main.js` calls it directly.
- `onStatus(msg)` sends progress strings to the renderer via IPC — keep them short (< 60 chars).
- `getLatestForTicker(ticker)` is called by `main.js` to serve dashboard data — it must stay synchronous.
- `node-cron` timezone option is set to `'Europe/London'` — do not change this.
- Never write to `data/strategy.json` from this layer. That file is owned by `main.js`.

---

## Files you may touch
- `src/data/fetcher.js`
- `src/data/scheduler.js`
- `src/data/storage.js`

## Files you must not touch
- `main.js`, `preload.js`, `src/interview/*`, `src/dashboard/*`, `src/engine/*`
