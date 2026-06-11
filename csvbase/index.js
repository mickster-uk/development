#!/usr/bin/env node
'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const { findLatestCsv, listCsvFiles, parseCsvFile } = require('./lib/csv');
const { detectColumns, analyseTransactions } = require('./lib/analyse');
const { generateMarkdown } = require('./lib/markdown');

const DEFAULT_INPUT_DIR = path.join(os.homedir(), 'Downloads');
const DEFAULT_OUTPUT_DIR = path.join(os.homedir(), 'Documents', 'knowbase');

function parseArgs(argv) {
  const args = { file: null, out: DEFAULT_OUTPUT_DIR, list: false, dryRun: false, help: false };
  let i = 2;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { args.help = true; }
    else if (arg === '--list' || arg === '-l') { args.list = true; }
    else if (arg === '--dry-run') { args.dryRun = true; }
    else if ((arg === '--out' || arg === '-o') && argv[i + 1]) { args.out = argv[++i]; }
    else if (!arg.startsWith('-')) { args.file = arg; }
    i++;
  }
  return args;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function printHelp() {
  console.log(`
csvbase — convert CSV financial data to Markdown for Knowbase

Usage: csvbase [options] [file]

  file            CSV file to process
                  (default: most recent .csv in ~/Downloads)

Options:
  -o, --out DIR   Output directory (default: ~/Documents/knowbase)
  -l, --list      List .csv files in ~/Downloads
      --dry-run   Print output to stdout without saving
  -h, --help      Show this help

Examples:
  csvbase                              # process latest CSV in ~/Downloads
  csvbase ~/Downloads/transactions.csv
  csvbase --list
  csvbase transactions.csv --dry-run
  csvbase transactions.csv -o ~/Documents/my-notes
`.trim());
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (args.list) {
    const files = listCsvFiles(DEFAULT_INPUT_DIR);
    if (!files.length) {
      console.log('No .csv files found in ~/Downloads');
    } else {
      console.log('CSV files in ~/Downloads:\n');
      files.forEach((f, i) => {
        const mod = f.modified.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        console.log(`  ${i + 1}. ${f.name}  (${formatBytes(f.size)}, ${mod})`);
      });
    }
    process.exit(0);
  }

  let filePath = args.file;
  if (!filePath) {
    const latest = findLatestCsv(DEFAULT_INPUT_DIR);
    if (!latest) {
      console.error('No .csv files found in ~/Downloads. Pass a file path directly or use --list.');
      process.exit(1);
    }
    filePath = latest;
    console.log(`Using: ${path.basename(filePath)}`);
  }

  filePath = path.resolve(filePath);

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  if (path.extname(filePath).toLowerCase() !== '.csv') {
    console.error(`Not a .csv file: ${filePath}`);
    process.exit(1);
  }

  console.log('Parsing CSV...');
  const { headers, rows } = parseCsvFile(filePath);

  if (!rows.length) {
    console.error('CSV file is empty or has no data rows.');
    process.exit(1);
  }

  console.log(`  ${rows.length} rows · ${headers.length} columns`);

  const cols = detectColumns(headers);
  const detected = Object.entries(cols)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}="${v}"`)
    .join(', ');
  console.log(`  Columns: ${detected || 'none detected'}`);

  if (!cols.date && !cols.amount && !cols.debit && !cols.credit) {
    console.warn('\nWarning: could not detect date or amount columns.');
    console.warn('Headers found:', headers.join(', '));
    console.warn('Output may be incomplete.\n');
  }

  console.log('Analysing...');
  const stats = analyseTransactions(rows, cols);

  if (!stats.count) {
    console.error('No valid transactions found. Check that the file contains amount data.');
    process.exit(1);
  }

  const { count, totalCredits, totalDebits, net, dateFrom, dateTo, currency, formatDate } = stats;
  const dateRangeStr = dateFrom && dateTo ? `${formatDate(dateFrom)} – ${formatDate(dateTo)}` : 'unknown range';
  console.log(`  ${count} transactions · ${dateRangeStr}`);
  console.log(`  In: ${currency}${totalCredits.toFixed(2)}  Out: ${currency}${Math.abs(totalDebits).toFixed(2)}  Net: ${currency}${net.toFixed(2)}`);

  const markdown = generateMarkdown(stats, path.basename(filePath), cols);

  if (args.dryRun) {
    console.log('\n' + '─'.repeat(60) + '\n');
    console.log(markdown);
    process.exit(0);
  }

  if (!fs.existsSync(args.out)) {
    fs.mkdirSync(args.out, { recursive: true });
  }

  const baseName = path.basename(filePath, '.csv').replace(/[^\w\-]/g, '-');
  const datePart = new Date().toISOString().slice(0, 10);
  const outFile = path.join(args.out, `transactions-${baseName}-${datePart}.md`);
  fs.writeFileSync(outFile, markdown, 'utf-8');

  console.log(`\nSaved: ${outFile}`);
  console.log(`Open Knowbase and point it at: ${args.out}`);
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
