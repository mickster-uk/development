const storage = require('./storage');
const yahoo   = require('./providers/yahoo');
const { delay } = require('./providers/utils');

async function fetchAll(tickers, onStatus = () => {}, debugCb = null, cfg = {}) {
  const failureThreshold = cfg.apiFailureThreshold != null ? Number(cfg.apiFailureThreshold) : 3;

  const results = [];
  let failureCount = 0;

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i];

    if (failureCount >= failureThreshold) {
      results.push({ ticker, ok: false, error: 'Skipped — fetch paused after failure threshold' });
      continue;
    }

    onStatus(`Fetching ${ticker}… (${i + 1}/${tickers.length})`);
    try {
      const [quote, history] = await Promise.all([
        yahoo.fetchQuote(ticker, debugCb),
        yahoo.fetchCandles(ticker, debugCb),
      ]);
      storage.save(ticker, { ...quote, history, fetchedAt: new Date().toISOString() });
      results.push({ ticker, ok: true });
    } catch (err) {
      console.error(`Failed to fetch ${ticker}:`, err.message);
      results.push({ ticker, ok: false, error: err.message });
      failureCount++;
      if (failureCount >= failureThreshold) {
        onStatus(`Fetch paused — ${failureCount} API ${failureCount === 1 ? 'failure' : 'failures'} reached threshold`);
      }
    }

    if (i < tickers.length - 1 && failureCount < failureThreshold) {
      await delay(1000);
    }
  }

  const paused = failureCount >= failureThreshold;
  if (!paused) onStatus('Fetch complete');
  return { results, paused, failureCount };
}

module.exports = { fetchAll };
