const delay = ms => new Promise(r => setTimeout(r, ms));

function truncateForDebug(obj, limit = 5) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    if (obj.length <= limit) return obj.map(v => truncateForDebug(v, limit));
    return [
      ...obj.slice(0, 3).map(v => truncateForDebug(v, limit)),
      `… ${obj.length - 3} more items`,
    ];
  }
  if (typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = truncateForDebug(v, limit);
    return out;
  }
  return obj;
}

module.exports = { delay, truncateForDebug };
