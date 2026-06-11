'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { listCsvFiles, findLatestCsv, parseCsvFile } = require('./csv');

// ── parseCsvFile ──────────────────────────────────────────────────────────────

function writeTmp(name, content, encoding = 'utf8') {
  const p = path.join(os.tmpdir(), name);
  fs.writeFileSync(p, content, encoding);
  return p;
}

describe('parseCsvFile — basic parsing', () => {
  test('parses simple CSV into headers + row objects', () => {
    const p = writeTmp('basic.csv', 'Date,Amount,Description\n01/01/2025,100.00,Salary\n');
    const { headers, rows } = parseCsvFile(p);
    expect(headers).toEqual(['Date', 'Amount', 'Description']);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ Date: '01/01/2025', Amount: '100.00', Description: 'Salary' });
  });

  test('handles quoted fields containing commas', () => {
    const p = writeTmp('quoted.csv', 'Date,Description,Amount\n01/01/2025,"Coffee Shop, London",4.50\n');
    const { rows } = parseCsvFile(p);
    expect(rows[0].Description).toBe('Coffee Shop, London');
  });

  test('handles escaped double-quotes inside quoted fields', () => {
    const p = writeTmp('escaped.csv', 'Name\n"He said ""hello"""\n');
    const { rows } = parseCsvFile(p);
    expect(rows[0].Name).toBe('He said "hello"');
  });

  test('strips UTF-8 BOM', () => {
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const content = Buffer.concat([bom, Buffer.from('Col\nval\n')]);
    const p = writeTmp('bom.csv', content);
    fs.writeFileSync(p, content);
    const { headers } = parseCsvFile(p);
    expect(headers[0]).toBe('Col');
  });

  test('decodes Latin-1 (Windows-1252) encoded files', () => {
    // £ in latin1 is 0xA3
    const content = Buffer.concat([
      Buffer.from('Amount\n'),
      Buffer.from([0xA3]), Buffer.from('100.00\n')
    ]);
    const p = path.join(os.tmpdir(), 'latin1.csv');
    fs.writeFileSync(p, content);
    const { rows } = parseCsvFile(p);
    expect(rows[0].Amount).toBe('£100.00');
  });

  test('returns empty rows for header-only file', () => {
    const p = writeTmp('header-only.csv', 'Date,Amount\n');
    const { headers, rows } = parseCsvFile(p);
    expect(headers).toEqual(['Date', 'Amount']);
    expect(rows).toHaveLength(0);
  });

  test('skips blank lines', () => {
    const p = writeTmp('blanks.csv', 'Date,Amount\n\n01/01/2025,10.00\n\n');
    const { rows } = parseCsvFile(p);
    expect(rows).toHaveLength(1);
  });

  test('skips metadata rows before real headers (Nationwide format)', () => {
    const content = [
      '"Account Name:","FlexPlus Account ****1234"',
      '"Account Balance:","£1000.00"',
      '',
      '"Date","Description","Paid out","Paid in","Balance"',
      '"01 Jan 2025","TESCO","£45.00","","£955.00"',
    ].join('\n');
    const p = writeTmp('nationwide.csv', content);
    const { headers, rows } = parseCsvFile(p);
    expect(headers).toEqual(['Date', 'Description', 'Paid out', 'Paid in', 'Balance']);
    expect(rows).toHaveLength(1);
    expect(rows[0].Description).toBe('TESCO');
  });

  test('handles CRLF line endings', () => {
    const p = writeTmp('crlf.csv', 'Date,Amount\r\n01/01/2025,50.00\r\n');
    const { rows } = parseCsvFile(p);
    expect(rows).toHaveLength(1);
    expect(rows[0].Amount).toBe('50.00');
  });
});

// ── listCsvFiles / findLatestCsv ──────────────────────────────────────────────

describe('listCsvFiles', () => {
  test('returns only .csv files sorted by modified date descending', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csvbase-'));
    fs.writeFileSync(path.join(dir, 'a.csv'), 'x');
    fs.writeFileSync(path.join(dir, 'b.txt'), 'x');
    fs.writeFileSync(path.join(dir, 'c.csv'), 'x');
    const files = listCsvFiles(dir);
    expect(files.every(f => f.name.endsWith('.csv'))).toBe(true);
    expect(files).toHaveLength(2);
    fs.rmSync(dir, { recursive: true });
  });

  test('returns empty array for non-existent directory', () => {
    expect(listCsvFiles('/tmp/does-not-exist-csvbase')).toEqual([]);
  });
});

describe('findLatestCsv', () => {
  test('returns path of most recently modified CSV', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csvbase-'));
    const older = path.join(dir, 'older.csv');
    const newer = path.join(dir, 'newer.csv');
    fs.writeFileSync(older, 'x');
    // Ensure different mtime
    fs.utimesSync(older, new Date(0), new Date(0));
    fs.writeFileSync(newer, 'x');
    expect(findLatestCsv(dir)).toBe(newer);
    fs.rmSync(dir, { recursive: true });
  });

  test('returns null when directory is empty', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csvbase-'));
    expect(findLatestCsv(dir)).toBeNull();
    fs.rmSync(dir, { recursive: true });
  });
});
