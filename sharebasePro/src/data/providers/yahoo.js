const { truncateForDebug } = require('./utils');

const CHART_URL   = 'https://query2.finance.yahoo.com/v8/finance/chart';
const SUMMARY_URL = 'https://query2.finance.yahoo.com/v10/finance/quoteSummary';
const CRUMB_URL   = 'https://query2.finance.yahoo.com/v1/test/getcrumb';
const CONSENT_URL = 'https://fc.yahoo.com';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Session is cached per process lifetime; cleared on 401 and re-fetched
let _session = null;

function parseCookies(headers, into = {}) {
  const list = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : (headers.get('set-cookie') || '').split(/,(?=[^;]+=)/);
  for (const c of list) {
    const m = c.match(/^\s*([^=\s]+)=([^;]*)/);
    if (m) into[m[1]] = m[2];
  }
  return into;
}

function formatCookies(obj) {
  return Object.entries(obj).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function fetchSession() {
  const cookies = {};

  // Step 1 — GDPR consent cookie
  try {
    const r = await fetch(CONSENT_URL, { headers: { 'User-Agent': UA }, redirect: 'follow' });
    parseCookies(r.headers, cookies);
  } catch { /* proceed without consent cookie */ }

  // Step 2 — visit finance.yahoo.com to get session cookies (A1, A3, etc.)
  // The crumb endpoint requires these; the consent cookie alone is no longer sufficient.
  try {
    const r = await fetch('https://finance.yahoo.com/', {
      headers: { 'User-Agent': UA, 'Cookie': formatCookies(cookies) },
      redirect: 'follow',
    });
    parseCookies(r.headers, cookies);
  } catch { /* proceed */ }

  // Step 3 — get crumb token
  const cookieStr = formatCookies(cookies);
  const cr = await fetch(CRUMB_URL, {
    headers: { 'User-Agent': UA, 'Cookie': cookieStr },
  });
  if (!cr.ok) throw new Error(`Yahoo crumb fetch failed: HTTP ${cr.status}`);
  const crumb = (await cr.text()).trim();

  return { cookie: cookieStr, crumb };
}

async function getSession() {
  if (!_session) _session = await fetchSession();
  return _session;
}

function clearSession() { _session = null; }

function buildHeaders(cookie) {
  return {
    'User-Agent':      UA,
    'Cookie':          cookie,
    'Accept':          'application/json, text/plain, */*',
    'Accept-Language': 'en-GB,en;q=0.9',
    'Referer':         'https://finance.yahoo.com/',
  };
}

async function yahooGet(url, label, debugCb) {
  const t0 = Date.now();
  let res, data, error;

  try {
    const { cookie, crumb } = await getSession();
    const sep     = url.includes('?') ? '&' : '?';
    let   fullUrl = `${url}${sep}crumb=${encodeURIComponent(crumb)}`;

    res = await fetch(fullUrl, { headers: buildHeaders(cookie) });

    // On 401 the crumb has expired — refresh session and retry once
    if (res.status === 401) {
      clearSession();
      const s2     = await getSession();
      fullUrl      = `${url}${sep}crumb=${encodeURIComponent(s2.crumb)}`;
      res          = await fetch(fullUrl, { headers: buildHeaders(s2.cookie) });
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
    type:       'yahoo',
    label,
    request:    { url },
    response:   res ? { status: res.status, data: truncateForDebug(data) } : null,
    error:      error || null,
    durationMs: Date.now() - t0,
  });

  if (error) throw new Error(`Yahoo Finance ${label}: ${error}`);
  return data;
}

async function fetchQuote(ticker, debugCb) {
  const modules = 'price,summaryDetail,defaultKeyStatistics,financialData';
  const url     = `${SUMMARY_URL}/${encodeURIComponent(ticker)}?modules=${encodeURIComponent(modules)}`;
  const raw     = await yahooGet(url, `${ticker} — quoteSummary`, debugCb);

  const result  = raw?.quoteSummary?.result?.[0];
  if (!result) throw new Error(`Yahoo Finance ${ticker}: no quoteSummary result`);

  const price   = result.price               ?? {};
  const detail  = result.summaryDetail       ?? {};
  const stats   = result.defaultKeyStatistics ?? {};
  const fin     = result.financialData       ?? {};

  return {
    ticker,
    name:             price.longName          || price.shortName || ticker,
    currency:         price.currency,
    exchange:         price.exchangeName,
    marketCap:        price.marketCap?.raw    ?? null,
    currentPrice:     price.regularMarketPrice?.raw ?? null,
    fiftyTwoWeekHigh: detail.fiftyTwoWeekHigh?.raw ?? null,
    fiftyTwoWeekLow:  detail.fiftyTwoWeekLow?.raw  ?? null,
    peRatio:          detail.trailingPE?.raw   ?? null,
    forwardPE:        detail.forwardPE?.raw    ?? null,
    eps:              stats.trailingEps?.raw   ?? null,
    dividendYield:    detail.dividendYield?.raw ?? null,
    beta:             detail.beta?.raw         ?? null,
    revenueGrowth:    fin.revenueGrowth?.raw   ?? null,
    earningsGrowth:   fin.earningsGrowth?.raw  ?? null,
    debtToEquity:     fin.debtToEquity?.raw    ?? null,
    returnOnEquity:   fin.returnOnEquity?.raw  ?? null,
  };
}

async function fetchCandles(ticker, debugCb) {
  const to   = Math.floor(Date.now() / 1000);
  const from = to - 400 * 24 * 3600;
  const url  = `${CHART_URL}/${encodeURIComponent(ticker)}?period1=${from}&period2=${to}&interval=1d&includePrePost=false`;
  const raw  = await yahooGet(url, `${ticker} — chart`, debugCb);

  const result = raw?.chart?.result?.[0];
  const ts     = result?.timestamp;
  const quote  = result?.indicators?.quote?.[0];

  if (!ts?.length || !quote) return [];

  return ts.map((timestamp, i) => ({
    date:   new Date(timestamp * 1000).toISOString().slice(0, 10),
    open:   quote.open?.[i]   ?? quote.close?.[i],
    high:   quote.high?.[i]   ?? quote.close?.[i],
    low:    quote.low?.[i]    ?? quote.close?.[i],
    close:  quote.close?.[i],
    volume: quote.volume?.[i] ?? 0,
  })).filter(c => c.close != null);
}

module.exports = { fetchQuote, fetchCandles };
