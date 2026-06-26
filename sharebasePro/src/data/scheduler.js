const cron    = require('node-cron');
const fetcher = require('./fetcher');

let task = null;

// Run Mon–Fri: 5:00pm London time (covers both LSE 4:30pm and NYSE 4:00pm ET close)
const SCHEDULE = '0 17 * * 1-5';

// getUniverse and getConfig are injected from main.js to avoid a circular dep
function start(strategy, onStatus = () => {}, getUniverse, getConfig) {
  if (task) task.stop();
  task = cron.schedule(SCHEDULE, async () => {
    onStatus('Scheduled fetch starting…');
    const tickers = getUniverse(strategy).map(s => s.ticker);
    await fetcher.fetchAll(tickers, onStatus, null, getConfig());
  }, { timezone: 'Europe/London' });
  console.log('[scheduler] Started — runs Mon–Fri at 17:00 London time');
}

function stop() {
  if (task) {
    task.stop();
    task = null;
  }
}

module.exports = { start, stop };
