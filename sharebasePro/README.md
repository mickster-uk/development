# sharebasePro

Electron desktop app for UK and US stock analysis. Scores a curated universe of equities against a configurable investment strategy using technical indicators, fundamental overlays, and an ML pattern score. Integrates with Yahoo Finance for market data and generates Claude-ready analysis prompts.

## Running

```bash
npm install
npm start
```

## First launch

On first launch the interview wizard runs — six steps to configure your investment strategy (markets, risk, horizon, stock types, sectors, market cap). On completion the app builds a tailored analysis prompt and opens Claude.ai so you can get a full stock review.

After completing the interview the dashboard opens automatically and begins fetching data for the matched universe.

## Data storage

| Data | Location |
|---|---|
| Strategy (`strategy.json`) | `~/Documents/knowbase/apps/sharebasePro/` |
| Claude prompts (`.md`) | `~/Documents/knowbase/apps/sharebasePro/prompts/` |
| Config (`config.json`) | `~/Library/Application Support/stock-recommender/` |
| Stock cache | `~/Library/Application Support/stock-recommender/stocks/` |
| Preferences (starred/dismissed) | `~/Library/Application Support/stock-recommender/preferences.json` |

Strategy and generated prompts live in the Knowbase folder so they are queryable via the Knowbase LLM. Config and cached stock data stay in Electron's `userData` path.

## Configuration

Open the settings modal (⚙ icon in the dashboard toolbar) to set:

- **Failure threshold** — stop fetching after N consecutive Yahoo Finance errors (default: 3)
- **Ollama URL** — local Ollama instance for debug analysis (default: `http://localhost:11434`)
- **Ollama model** — model used for debug panel analysis
- **Debug mode** — enables the debug panel showing all API request/response logs

## Stock universe

A curated list of ~75 stocks and ETFs covering UK (LSE) and US equities across all major sectors. Filtered at runtime by strategy: market, sector, market cap, and minimum risk tolerance. The matched subset is shown in the post-interview review and in the dashboard sidebar.

UK stocks use Yahoo Finance `.L` tickers (e.g. `LLOY.L`). US stocks and ETFs use standard tickers.

## Scoring

Each stock is scored 0–100 using:

**Technical signals (always applied)**
- RSI — oversold/overbought thresholds vary by risk tolerance
- MACD histogram — bullish/bearish cross signals
- Golden Cross / Death Cross — 50-day vs 200-day MA relationship
- Price vs 50-day MA
- Volume spike (> 1.5× 20-day average)

**Fundamental overlays (medium/long horizon only)**
- P/E ratio < 20
- Dividend yield > 3% (dividend stock type only)
- Earnings growth > 10% YoY

Final score blends rule-based (60%) with an ML pattern score (40%). BUY ≥ 60, SELL ≤ 35, HOLD otherwise.

## Data source

All market data fetched from Yahoo Finance:
- `v10/finance/quoteSummary` — fundamentals (price, PE, dividend yield, beta, growth rates)
- `v8/finance/chart` — OHLCV history (400 days, daily)

No API key required.

## Debug panel

Enable debug mode in settings to open a slide-in panel showing every API call made, with request/response details, timing, and colour-coded type badges (Yahoo Finance, Ollama). Entries are individually scrollable. The panel includes an "Analyse with Ollama" button to send all logs to the local LLM for diagnosis.

## Project structure

```
sharebasePro/
  main.js               ← Electron main process, IPC handlers
  preload.js            ← Context bridge
  src/
    interview/          ← Strategy wizard (6-step questionnaire + Claude prompt generation)
    dashboard/          ← Main UI (sidebar badge grid, detail panel, charts, debug panel)
    data/
      fetcher.js        ← Orchestrates fetches across the universe
      storage.js        ← Per-ticker daily snapshots + preferences
      scheduler.js      ← Cron-based auto-fetch
      universe.js       ← Stock universe + filterForStrategy()
      providers/
        yahoo.js        ← Yahoo Finance API (quote + candles)
        finnhub.js      ← Finnhub API (dormant, available for reuse)
        utils.js        ← delay(), truncateForDebug()
    engine/
      rules.js          ← Scoring engine (signals → composite score)
      indicators.js     ← RSI, MACD, MA computations
      ml.js             ← ML pattern score
```
