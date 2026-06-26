const { delay, truncateForDebug } = require('./utils');

const BASE_URL = 'https://finnhub.io/api/v1';

function toSymbol(ticker) {
  if (ticker.endsWith('.L')) return 'LON:' + ticker.slice(0, -2);
  return ticker;
}

async function get(endpoint, params, apiKey, secret, debugCb) {
  const qs      = new URLSearchParams({ ...params, token: apiKey }).toString();
  const url     = `${BASE_URL}${endpoint}?${qs}`;
  const t0      = Date.now();
  const label   = `${params.symbol || '?'} — ${endpoint.split('/').pop()}`;
  const headers = { 'X-Finnhub-Token': apiKey };
  if (secret) headers['X-Finnhub-Secret'] = secret;

  let res, data, error;
  try {
    res = await fetch(url, { method: 'GET', headers });
    if (res.status === 429) {
      await delay(12000);
      res = await fetch(url, { method: 'GET', headers });
    }
    const text = await res.text();
    try { data = JSON.parse(text); } catch { data = text; }
    if (!res.ok) error = `HTTP ${res.status}`;
  } catch (err) {
    error = err.message;
  }

  debugCb?.({
    id:         `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ts:         new Date().toISOString(),
    type:       'finnhub',
    label,
    request:    { endpoint, params: { ...params } },
    response:   res ? { status: res.status, data: truncateForDebug(data) } : null,
    error:      error || null,
    durationMs: Date.now() - t0,
  });

  if (error) throw new Error(`Finnhub ${label}: ${error}`);
  return data;
}

async function fetchQuote(ticker, apiKey, secret, debugCb) {
  const symbol = toSymbol(ticker);

  const [quote, profile, metrics] = await Promise.all([
    get('/quote',          { symbol },                apiKey, secret, debugCb),
    get('/stock/profile2', { symbol },                apiKey, secret, debugCb).catch(() => ({})),
    get('/stock/metric',   { symbol, metric: 'all' }, apiKey, secret, debugCb).catch(() => ({})),
  ]);

  const m = metrics?.metric ?? {};

  return {
    ticker,
    name:             profile.name                    || ticker,
    currency:         profile.currency,
    exchange:         profile.exchange,
    marketCap:        profile.marketCapitalization != null ? profile.marketCapitalization * 1e6 : null,
    currentPrice:     quote.c,
    fiftyTwoWeekHigh: m['52WeekHigh']                ?? null,
    fiftyTwoWeekLow:  m['52WeekLow']                 ?? null,
    peRatio:          m.peTTM                        ?? m.peAnnual   ?? null,
    forwardPE:        m.peForward                    ?? null,
    eps:              m.epsTTM                       ?? m.epsBasicExclExtraItemsAnnual ?? null,
    dividendYield:    m.dividendYieldIndicatedAnnual != null ? m.dividendYieldIndicatedAnnual / 100 : null,
    beta:             m.beta                         ?? null,
    revenueGrowth:    m.revenueGrowthQuarterlyYoy   ?? m.revenueGrowthAnnual ?? null,
    earningsGrowth:   m['epsGrowthTTMYoy']           ?? null,
    debtToEquity:     m.debtToEquityAnnual           ?? null,
    returnOnEquity:   m.roeTTM                       ?? m.roeAnnual  ?? null,
  };
}

async function fetchCandles(ticker, apiKey, secret, debugCb) {
  const symbol = toSymbol(ticker);
  const to     = Math.floor(Date.now() / 1000);
  const from   = to - 400 * 24 * 3600;

  const data = await get('/stock/candle', {
    symbol, resolution: 'D', from, to,
  }, apiKey, secret, debugCb);

  if (data?.s !== 'ok' || !Array.isArray(data.t) || !data.t.length) return [];

  return data.t.map((ts, i) => ({
    date:   new Date(ts * 1000).toISOString().slice(0, 10),
    open:   data.o[i] ?? data.c[i],
    high:   data.h[i] ?? data.c[i],
    low:    data.l[i] ?? data.c[i],
    close:  data.c[i],
    volume: data.v[i] ?? 0,
  }));
}

module.exports = { fetchQuote, fetchCandles };
