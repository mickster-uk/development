'use strict';

const MONTH_NAMES = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };

function detectColumns(headers) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normed = headers.map(norm);

  const find = (...patterns) => {
    for (const p of patterns) {
      const i = normed.findIndex(h => h === p || h.includes(p));
      if (i !== -1) return headers[i];
    }
    return null;
  };

  // For the generic amount column, exclude columns that are specifically debit or credit
  const findAmount = (...patterns) => {
    for (const p of patterns) {
      const i = normed.findIndex(h => (h === p || h.includes(p)) && !h.includes('debit') && !h.includes('credit'));
      if (i !== -1) return headers[i];
    }
    return null;
  };

  return {
    date: find('transactiondate', 'date', 'valuedate', 'posteddate', 'settleddate'),
    description: find('description', 'narrative', 'memo', 'payee', 'merchant', 'details', 'name', 'particulars', 'counterparty'),
    amount: findAmount('amount', 'transactionamount', 'value', 'net'),
    debit: find('paidout', 'debit', 'debitamount', 'withdrawal', 'out', 'payments'),
    credit: find('paidin', 'credit', 'creditamount', 'deposit', 'in', 'receipts'),
    category: find('category', 'subcategory', 'transactiontype', 'type'),
    balance: find('balance', 'runningbalance', 'accountbalance'),
    reference: find('reference', 'transactionid', 'transactionref'),
  };
}

function parseDate(str) {
  if (!str) return null;
  str = str.trim();
  let m;

  // ISO: 2024-01-15
  m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);

  // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  m = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]); // assume UK day-first

  // DD/MM/YY
  m = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})$/);
  if (m) return new Date(2000 + +m[3], +m[2] - 1, +m[1]);

  // 15 Jan 2024
  m = str.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/);
  if (m) {
    const mo = MONTH_NAMES[m[2].toLowerCase().slice(0, 3)];
    if (mo !== undefined) return new Date(+m[3], mo, +m[1]);
  }

  // Jan 15, 2024
  m = str.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const mo = MONTH_NAMES[m[1].toLowerCase().slice(0, 3)];
    if (mo !== undefined) return new Date(+m[3], mo, +m[2]);
  }

  return null;
}

function parseAmount(str) {
  if (!str || str.trim() === '' || str.trim() === '-') return null;
  let s = str.trim();
  const negative = s.startsWith('(') && s.endsWith(')');
  s = s.replace(/[()]/g, '');
  s = s.replace(/[£$€¥\s]/g, '');
  // Remove thousand-separator commas (e.g. 1,234.56 → 1234.56)
  s = s.replace(/,(?=\d{3}(\D|$))/g, '');
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return negative ? -Math.abs(n) : n;
}

function detectCurrency(rows, cols) {
  const fields = [cols.amount, cols.debit, cols.credit].filter(Boolean);
  for (const row of rows.slice(0, 30)) {
    for (const field of fields) {
      const val = row[field] || '';
      if (val.includes('£')) return '£';
      if (val.includes('$')) return '$';
      if (val.includes('€')) return '€';
      if (val.includes('¥')) return '¥';
    }
  }
  return '£';
}

function formatDate(date) {
  if (!date) return '';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatMonthKey(key) {
  const [year, month] = key.split('-');
  return new Date(+year, +month - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function analyseTransactions(rows, cols) {
  const currency = detectCurrency(rows, cols);
  const transactions = [];

  for (const row of rows) {
    const dateStr = cols.date ? row[cols.date] : '';
    const description = (cols.description ? row[cols.description] : '') || '';
    const category = (cols.category ? row[cols.category] : '') || '';
    const reference = (cols.reference ? row[cols.reference] : '') || '';
    const balanceStr = cols.balance ? row[cols.balance] : null;

    let amount = null;
    if (cols.amount) {
      amount = parseAmount(row[cols.amount]);
    }
    // Fall back to separate debit/credit columns
    if (amount === null && (cols.debit || cols.credit)) {
      const debit = cols.debit ? parseAmount(row[cols.debit]) : null;
      const credit = cols.credit ? parseAmount(row[cols.credit]) : null;
      if (credit != null && credit !== 0) amount = Math.abs(credit);
      else if (debit != null && debit !== 0) amount = -Math.abs(debit);
    }

    if (amount === null) continue;

    transactions.push({
      date: parseDate(dateStr),
      dateStr,
      description,
      category,
      reference,
      amount,
      balance: parseAmount(balanceStr),
    });
  }

  transactions.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date - b.date;
  });

  const credits = transactions.filter(t => t.amount > 0);
  const debits = transactions.filter(t => t.amount < 0);
  const totalCredits = credits.reduce((s, t) => s + t.amount, 0);
  const totalDebits = debits.reduce((s, t) => s + t.amount, 0);

  // Monthly breakdown
  const monthlyMap = new Map();
  for (const t of transactions) {
    if (!t.date) continue;
    const key = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, '0')}`;
    if (!monthlyMap.has(key)) {
      monthlyMap.set(key, { label: formatMonthKey(key), credits: 0, debits: 0, count: 0 });
    }
    const m = monthlyMap.get(key);
    if (t.amount > 0) m.credits += t.amount;
    else m.debits += t.amount;
    m.count++;
  }

  // Category breakdown
  const catMap = new Map();
  if (cols.category) {
    for (const t of transactions) {
      const cat = t.category || 'Uncategorised';
      if (!catMap.has(cat)) catMap.set(cat, { total: 0, count: 0 });
      const c = catMap.get(cat);
      c.total += t.amount;
      c.count++;
    }
  }

  const datedTxns = transactions.filter(t => t.date);

  return {
    transactions,
    currency,
    count: transactions.length,
    totalCredits,
    totalDebits,
    net: totalCredits + totalDebits,
    dateFrom: datedTxns[0]?.date,
    dateTo: datedTxns[datedTxns.length - 1]?.date,
    monthly: [...monthlyMap.entries()].map(([key, val]) => ({ key, ...val })),
    categories: [...catMap.entries()]
      .map(([name, val]) => ({ name, ...val }))
      .sort((a, b) => a.total - b.total),
    topDebits: [...debits].sort((a, b) => a.amount - b.amount).slice(0, 10),
    topCredits: [...credits].sort((a, b) => b.amount - a.amount).slice(0, 5),
    formatDate,
  };
}

module.exports = { detectColumns, analyseTransactions };
