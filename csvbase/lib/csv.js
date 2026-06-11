'use strict';

const fs = require('fs');
const path = require('path');

function listCsvFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(name => path.extname(name).toLowerCase() === '.csv')
    .map(name => {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      return { name, path: full, size: stat.size, modified: stat.mtime };
    })
    .sort((a, b) => b.modified - a.modified);
}

function findLatestCsv(dir) {
  const files = listCsvFiles(dir);
  return files.length ? files[0].path : null;
}

function readFile(filePath) {
  const raw = fs.readFileSync(filePath);
  // UTF-16 LE BOM
  if (raw[0] === 0xff && raw[1] === 0xfe) return raw.slice(2).toString('utf16le');
  // UTF-8 BOM
  if (raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) return raw.slice(3).toString('utf-8');
  // Try UTF-8; fall back to Latin-1 (Windows-1252) if invalid sequences found
  const utf8 = raw.toString('utf-8');
  return utf8.includes('�') ? raw.toString('latin1') : utf8;
}

// Find the row index that contains the real column headers.
// Some bank exports prepend account metadata before the header row.
function findHeaderRowIndex(rows) {
  const dateRe = /^(date|transaction\s*date|value\s*date|posted\s*date|settled\s*date)$/i;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    if (rows[i].some(cell => dateRe.test(cell.trim()))) return i;
  }
  return 0;
}

function parseCsvContent(content) {
  // Strip UTF-8 BOM
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);

  const rows = [];
  let i = 0;
  const n = content.length;

  while (i < n) {
    // Skip blank lines
    if (content[i] === '\r' || content[i] === '\n') {
      if (content[i] === '\r' && content[i + 1] === '\n') i++;
      i++;
      continue;
    }

    const row = [];

    while (i < n && content[i] !== '\r' && content[i] !== '\n') {
      if (content[i] === '"') {
        i++; // skip opening quote
        let field = '';
        while (i < n) {
          if (content[i] === '"') {
            if (content[i + 1] === '"') {
              field += '"';
              i += 2;
            } else {
              i++;
              break;
            }
          } else {
            field += content[i++];
          }
        }
        row.push(field.trim());
      } else {
        let field = '';
        while (i < n && content[i] !== ',' && content[i] !== '\r' && content[i] !== '\n') {
          field += content[i++];
        }
        row.push(field.trim());
      }

      if (i < n && content[i] === ',') i++;
      else break;
    }

    if (i < n && content[i] === '\r') i++;
    if (i < n && content[i] === '\n') i++;

    if (row.some(cell => cell !== '')) rows.push(row);
  }

  return rows;
}

function parseCsvFile(filePath) {
  const content = readFile(filePath);
  const rows = parseCsvContent(content);
  if (rows.length === 0) return { headers: [], rows: [] };

  const headerIdx = findHeaderRowIndex(rows);
  const headers = rows[headerIdx];
  const dataRows = rows.slice(headerIdx + 1).map(row => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = row[idx] ?? ''; });
    return obj;
  });

  return { headers, rows: dataRows };
}

module.exports = { listCsvFiles, findLatestCsv, parseCsvFile };
