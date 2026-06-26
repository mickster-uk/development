const ti = require('technicalindicators');

// All functions accept a `history` array: [{ close, high, low, volume }, ...]
// Returns null if insufficient data

function rsi(history, period = 14) {
  const closes = history.map(d => d.close);
  if (closes.length < period + 1) return null;
  const results = ti.RSI.calculate({ values: closes, period });
  return results[results.length - 1] ?? null;
}

function macd(history, { fast = 12, slow = 26, signal = 9 } = {}) {
  const closes = history.map(d => d.close);
  if (closes.length < slow + signal) return null;
  const results = ti.MACD.calculate({ values: closes, fastPeriod: fast, slowPeriod: slow, signalPeriod: signal, SimpleMAOscillator: false, SimpleMASignal: false });
  const last = results[results.length - 1];
  if (!last) return null;
  return { macd: last.MACD, signal: last.signal, histogram: last.histogram };
}

function sma(history, period) {
  const closes = history.map(d => d.close);
  if (closes.length < period) return null;
  const results = ti.SMA.calculate({ values: closes, period });
  return results[results.length - 1] ?? null;
}

function ema(history, period) {
  const closes = history.map(d => d.close);
  if (closes.length < period) return null;
  const results = ti.EMA.calculate({ values: closes, period });
  return results[results.length - 1] ?? null;
}

function atr(history, period = 14) {
  if (history.length < period + 1) return null;
  const results = ti.ATR.calculate({
    high: history.map(d => d.high),
    low: history.map(d => d.low),
    close: history.map(d => d.close),
    period
  });
  return results[results.length - 1] ?? null;
}

function bollingerBands(history, period = 20, stdDev = 2) {
  const closes = history.map(d => d.close);
  if (closes.length < period) return null;
  const results = ti.BollingerBands.calculate({ values: closes, period, stdDev });
  return results[results.length - 1] ?? null;
}

// Average volume over last N days vs previous N days (volume spike detection)
function volumeRatio(history, period = 10) {
  if (history.length < period * 2) return null;
  const recent = history.slice(-period).map(d => d.volume);
  const prior = history.slice(-period * 2, -period).map(d => d.volume);
  const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  return avg(recent) / avg(prior);
}

// Compute all indicators in one pass — returns a flat object
function computeAll(history) {
  if (!history || history.length < 30) return null;
  const price = history[history.length - 1].close;
  const ma50 = sma(history, 50);
  const ma200 = sma(history, 200);
  return {
    rsi: rsi(history),
    macd: macd(history),
    ma50,
    ma200,
    ema20: ema(history, 20),
    atr: atr(history),
    bb: bollingerBands(history),
    volumeRatio: volumeRatio(history),
    priceVsMa50: ma50 ? (price - ma50) / ma50 : null,
    priceVsMa200: ma200 ? (price - ma200) / ma200 : null,
    goldenCross: ma50 && ma200 ? ma50 > ma200 : null,
    price
  };
}

module.exports = { rsi, macd, sma, ema, atr, bollingerBands, volumeRatio, computeAll };
