const fs   = require('fs');
const path = require('path');

let stocksDir = null;
let prefsFile = null;

function init(baseDir) {
  stocksDir = path.join(baseDir, 'stocks');
  prefsFile = path.join(baseDir, 'preferences.json');
  if (!fs.existsSync(stocksDir)) fs.mkdirSync(stocksDir, { recursive: true });
}

function loadPrefs() {
  if (!prefsFile || !fs.existsSync(prefsFile)) return { starred: [], dismissed: [] };
  try { return JSON.parse(fs.readFileSync(prefsFile, 'utf8')); } catch { return { starred: [], dismissed: [] }; }
}

function savePrefs(prefs) {
  fs.writeFileSync(prefsFile, JSON.stringify(prefs, null, 2));
}

function starTicker(ticker) {
  const p = loadPrefs();
  if (!p.starred.includes(ticker)) p.starred.push(ticker);
  p.dismissed = p.dismissed.filter(t => t !== ticker);
  savePrefs(p);
}

function dismissTicker(ticker) {
  const p = loadPrefs();
  if (!p.dismissed.includes(ticker)) p.dismissed.push(ticker);
  p.starred = p.starred.filter(t => t !== ticker);
  savePrefs(p);
}

function unstarTicker(ticker) {
  const p = loadPrefs();
  p.starred = p.starred.filter(t => t !== ticker);
  savePrefs(p);
}

function resetDismissed() {
  const p = loadPrefs();
  p.dismissed = [];
  savePrefs(p);
}

function getPrefs() { return loadPrefs(); }

function tickerDir(ticker) {
  return path.join(stocksDir, ticker.replace('/', '_'));
}

function save(ticker, data) {
  const dir = tickerDir(ticker);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function getLatestForTicker(ticker) {
  const dir = tickerDir(ticker);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().reverse();
  if (!files.length) return null;
  return JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf8'));
}

function getHistory(ticker, days = 90) {
  const dir = tickerDir(ticker);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .slice(-days)
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

module.exports = { init, save, getLatestForTicker, getHistory, starTicker, dismissTicker, unstarTicker, resetDismissed, getPrefs };
