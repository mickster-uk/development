const cron = require('node-cron');
const { indexSite } = require('./indexer');

// Daily at 3:00am — re-scrapes all configured sites.
// Changed content gets re-embedded; unchanged chunks are skipped.
function startScheduler(sitesStore, vectorStore, getEndpoint) {
  cron.schedule('0 3 * * *', async () => {
    const sites = sitesStore.all();
    if (sites.length === 0) return;

    console.log(`[Scheduler] Daily run — ${sites.length} site(s)`);
    const endpoint = getEndpoint();

    for (const site of sites) {
      try {
        console.log(`[Scheduler] Indexing "${site.name}" (${site.url})…`);
        sitesStore.update(site.id, { status: 'indexing' });
        const count = await indexSite(site, vectorStore, endpoint);
        sitesStore.update(site.id, { status: 'ready', lastScrapedAt: new Date().toISOString() });
        console.log(`[Scheduler] "${site.name}" done — ${count} page(s)`);
      } catch (e) {
        sitesStore.update(site.id, { status: 'error' });
        console.error(`[Scheduler] "${site.name}" failed: ${e.message}`);
      }
    }
  });

  console.log('[Scheduler] Daily scrape scheduled at 03:00');
}

module.exports = { startScheduler };
