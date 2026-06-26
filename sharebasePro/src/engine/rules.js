const { computeAll } = require('./indicators');
const { scoreWithML } = require('./ml');

// RSI buy thresholds by risk level
const RSI_BUY = { conservative: 40, moderate: 45, aggressive: 55 };
const RSI_SELL = { conservative: 65, moderate: 70, aggressive: 75 };

// Returns { signal, score, signals[], mlScore, reasoning }
// signal: 'BUY' | 'HOLD' | 'SELL'
// score: 0–100 composite
function getRecommendations(stockData, strategy) {
  if (!stockData || !stockData.history || stockData.history.length < 30) {
    return { signal: 'INSUFFICIENT_DATA', score: 0, signals: [], mlScore: null, reasoning: 'Not enough history.' };
  }

  const ind = computeAll(stockData.history);
  if (!ind) return { signal: 'INSUFFICIENT_DATA', score: 0, signals: [], mlScore: null, reasoning: 'Indicators could not be computed.' };

  const risk = strategy.risk || 'moderate';
  const horizon = strategy.horizon || 'medium';
  const stockTypes = strategy.stockTypes || [];

  const signals = [];
  let bullPoints = 0;
  let bearPoints = 0;

  // ── RSI ────────────────────────────────────────────────────
  if (ind.rsi !== null) {
    const buyThresh = RSI_BUY[risk];
    const sellThresh = RSI_SELL[risk];
    if (ind.rsi < buyThresh) {
      signals.push({ name: 'RSI Oversold', direction: 'bull', value: ind.rsi.toFixed(1), detail: `RSI ${ind.rsi.toFixed(1)} < ${buyThresh}` });
      bullPoints += 20;
    } else if (ind.rsi > sellThresh) {
      signals.push({ name: 'RSI Overbought', direction: 'bear', value: ind.rsi.toFixed(1), detail: `RSI ${ind.rsi.toFixed(1)} > ${sellThresh}` });
      bearPoints += 20;
    } else {
      signals.push({ name: 'RSI Neutral', direction: 'neutral', value: ind.rsi.toFixed(1), detail: `RSI ${ind.rsi.toFixed(1)}` });
    }
  }

  // ── MACD ───────────────────────────────────────────────────
  if (ind.macd) {
    if (ind.macd.histogram > 0 && ind.macd.macd > ind.macd.signal) {
      signals.push({ name: 'MACD Bullish Cross', direction: 'bull', value: ind.macd.histogram.toFixed(3), detail: 'MACD above signal line' });
      bullPoints += 20;
    } else if (ind.macd.histogram < 0) {
      signals.push({ name: 'MACD Bearish', direction: 'bear', value: ind.macd.histogram.toFixed(3), detail: 'MACD below signal line' });
      bearPoints += 15;
    }
  }

  // ── Moving Average trend ───────────────────────────────────
  if (ind.goldenCross !== null) {
    if (ind.goldenCross) {
      signals.push({ name: 'Golden Cross', direction: 'bull', value: null, detail: '50MA above 200MA' });
      bullPoints += 15;
    } else {
      signals.push({ name: 'Death Cross', direction: 'bear', value: null, detail: '50MA below 200MA' });
      bearPoints += 15;
    }
  }

  // ── Price vs MA50 ─────────────────────────────────────────
  if (ind.priceVsMa50 !== null) {
    const pct = (ind.priceVsMa50 * 100).toFixed(1);
    if (ind.priceVsMa50 > 0) {
      signals.push({ name: 'Above 50MA', direction: 'bull', value: `+${pct}%`, detail: `Price ${pct}% above 50-day MA` });
      bullPoints += 10;
    } else {
      signals.push({ name: 'Below 50MA', direction: 'bear', value: `${pct}%`, detail: `Price ${pct}% below 50-day MA` });
      bearPoints += 10;
    }
  }

  // ── Volume spike ──────────────────────────────────────────
  if (ind.volumeRatio !== null && ind.volumeRatio > 1.5) {
    signals.push({ name: 'Volume Spike', direction: 'bull', value: `${ind.volumeRatio.toFixed(1)}x`, detail: 'Recent volume significantly above average' });
    bullPoints += 10;
  }

  // ── Fundamental overlays (horizon-weighted) ───────────────
  if (horizon === 'medium' || horizon === 'long') {
    if (stockData.peRatio && stockData.peRatio < 20) {
      signals.push({ name: 'Low P/E', direction: 'bull', value: stockData.peRatio.toFixed(1), detail: 'Potentially undervalued' });
      bullPoints += horizon === 'long' ? 20 : 10;
    }
    if (stockData.dividendYield && stockTypes.includes('dividend') && stockData.dividendYield > 0.03) {
      signals.push({ name: 'Strong Dividend', direction: 'bull', value: `${(stockData.dividendYield * 100).toFixed(1)}%`, detail: 'Yield > 3%' });
      bullPoints += 10;
    }
    if (stockData.earningsGrowth && stockData.earningsGrowth > 0.1) {
      signals.push({ name: 'Earnings Growth', direction: 'bull', value: `+${(stockData.earningsGrowth * 100).toFixed(0)}%`, detail: 'YoY earnings growth > 10%' });
      bullPoints += horizon === 'long' ? 15 : 8;
    }
  }

  // ── Composite rule-based score (0–100) ────────────────────
  const totalPossible = bullPoints + bearPoints || 1;
  const ruleScore = Math.round((bullPoints / totalPossible) * 100);

  // ── ML score ──────────────────────────────────────────────
  const mlScore = scoreWithML(ind, strategy);

  // Blend: 60% rules, 40% ML
  const score = mlScore !== null
    ? Math.round(ruleScore * 0.6 + mlScore * 100 * 0.4)
    : ruleScore;

  // ── Signal label ─────────────────────────────────────────
  const signal = score >= 60 ? 'BUY' : score <= 35 ? 'SELL' : 'HOLD';

  const reasoning = `Rule score ${ruleScore}/100. ${mlScore !== null ? `Weighted score ${(mlScore * 100).toFixed(0)}%.` : ''} ${bullPoints} bull pts vs ${bearPoints} bear pts across ${signals.length} signals.`;

  return { signal, score, signals, mlScore, reasoning, indicators: ind };
}

module.exports = { getRecommendations };
