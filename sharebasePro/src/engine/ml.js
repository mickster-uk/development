// Weighted indicator scoring — replaces brain.js neural network.
// Same 0–1 output contract; no training phase, no native dependencies.

const WEIGHTS = {
  rsi:          0.25,
  macdHist:     0.20,
  goldenCross:  0.20,
  priceVsMa50:  0.15,
  priceVsMa200: 0.10,
  volumeRatio:  0.10,
};

function normalise(ind) {
  if (!ind) return null;
  return {
    rsi:          ind.rsi !== null          ? ind.rsi / 100                                   : 0.5,
    macdHist:     ind.macd                  ? Math.tanh(ind.macd.histogram) * 0.5 + 0.5       : 0.5,
    goldenCross:  ind.goldenCross !== null  ? (ind.goldenCross ? 1 : 0)                        : 0.5,
    priceVsMa50:  ind.priceVsMa50 !== null  ? Math.tanh(ind.priceVsMa50  * 5) * 0.5 + 0.5    : 0.5,
    priceVsMa200: ind.priceVsMa200 !== null ? Math.tanh(ind.priceVsMa200 * 3) * 0.5 + 0.5    : 0.5,
    volumeRatio:  ind.volumeRatio !== null  ? Math.min(ind.volumeRatio / 3, 1)                 : 0.5,
  };
}

function scoreWithML(ind) {
  const f = normalise(ind);
  if (!f) return null;
  return Object.entries(WEIGHTS).reduce((sum, [k, w]) => sum + f[k] * w, 0);
}

module.exports = { scoreWithML };
