'use strict';

const { detectColumns, analyseTransactions } = require('./analyse');

// ── detectColumns ─────────────────────────────────────────────────────────────

describe('detectColumns', () => {
  test('detects standard signed-amount headers', () => {
    const cols = detectColumns(['Date', 'Description', 'Amount', 'Balance']);
    expect(cols.date).toBe('Date');
    expect(cols.description).toBe('Description');
    expect(cols.amount).toBe('Amount');
    expect(cols.balance).toBe('Balance');
  });

  test('detects separate debit/credit columns (HSBC/Barclays style)', () => {
    const cols = detectColumns(['Date', 'Description', 'Debit Amount', 'Credit Amount', 'Balance']);
    expect(cols.debit).toBe('Debit Amount');
    expect(cols.credit).toBe('Credit Amount');
    expect(cols.amount).toBeNull();
  });

  test('detects Nationwide "Paid out" / "Paid in" columns', () => {
    const cols = detectColumns(['Date', 'Transaction type', 'Description', 'Paid out', 'Paid in', 'Balance']);
    expect(cols.debit).toBe('Paid out');
    expect(cols.credit).toBe('Paid in');
    expect(cols.category).toBe('Transaction type');
  });

  test('detects Monzo column names', () => {
    const cols = detectColumns(['Date', 'Name', 'Category', 'Amount']);
    expect(cols.description).toBe('Name');
    expect(cols.category).toBe('Category');
    expect(cols.amount).toBe('Amount');
  });

  test('is case-insensitive', () => {
    const cols = detectColumns(['TRANSACTION DATE', 'DESCRIPTION', 'AMOUNT']);
    expect(cols.date).toBe('TRANSACTION DATE');
    expect(cols.description).toBe('DESCRIPTION');
    expect(cols.amount).toBe('AMOUNT');
  });

  test('does not match "Paid out" as generic amount column', () => {
    const cols = detectColumns(['Paid out', 'Paid in']);
    expect(cols.amount).toBeNull();
  });
});

// ── analyseTransactions ───────────────────────────────────────────────────────

function makeRows(data) {
  return data.map(([date, desc, amount, category, balance]) => ({
    Date: date, Description: desc, Amount: amount, Category: category || '', Balance: balance || ''
  }));
}

const stdCols = {
  date: 'Date', description: 'Description', amount: 'Amount',
  category: 'Category', balance: 'Balance', debit: null, credit: null, reference: null
};

describe('analyseTransactions — amounts', () => {
  test('sums credits and debits correctly', () => {
    const rows = makeRows([
      ['01/01/2025', 'Salary', '2000.00', 'Income', '3000.00'],
      ['02/01/2025', 'Tesco', '-50.00', 'Groceries', '2950.00'],
      ['03/01/2025', 'Netflix', '-15.00', 'Entertainment', '2935.00'],
    ]);
    const stats = analyseTransactions(rows, stdCols);
    expect(stats.totalCredits).toBeCloseTo(2000);
    expect(stats.totalDebits).toBeCloseTo(-65);
    expect(stats.net).toBeCloseTo(1935);
    expect(stats.count).toBe(3);
  });

  test('parses currency symbols', () => {
    const rows = [{ Date: '01/01/2025', Description: 'Test', Amount: '£100.00', Category: '', Balance: '' }];
    const stats = analyseTransactions(rows, stdCols);
    expect(stats.totalCredits).toBeCloseTo(100);
  });

  test('parses parentheses as negative', () => {
    const rows = [{ Date: '01/01/2025', Description: 'Fee', Amount: '(25.00)', Category: '', Balance: '' }];
    const stats = analyseTransactions(rows, stdCols);
    expect(stats.totalDebits).toBeCloseTo(-25);
  });

  test('parses amounts with thousand separators', () => {
    const rows = [{ Date: '01/01/2025', Description: 'Transfer', Amount: '1,500.00', Category: '', Balance: '' }];
    const stats = analyseTransactions(rows, stdCols);
    expect(stats.totalCredits).toBeCloseTo(1500);
  });

  test('skips rows with unparseable amounts', () => {
    const rows = makeRows([
      ['01/01/2025', 'Valid', '100.00', '', ''],
      ['02/01/2025', 'Invalid', 'n/a', '', ''],
    ]);
    const stats = analyseTransactions(rows, stdCols);
    expect(stats.count).toBe(1);
  });
});

describe('analyseTransactions — separate debit/credit columns', () => {
  const debitCreditCols = {
    date: 'Date', description: 'Description', amount: null,
    debit: 'Debit', credit: 'Credit', category: null, balance: null, reference: null
  };

  test('treats debit column as negative, credit as positive', () => {
    const rows = [
      { Date: '01/01/2025', Description: 'Tesco', Debit: '50.00', Credit: '' },
      { Date: '02/01/2025', Description: 'Salary', Debit: '', Credit: '2000.00' },
    ];
    const stats = analyseTransactions(rows, debitCreditCols);
    expect(stats.totalDebits).toBeCloseTo(-50);
    expect(stats.totalCredits).toBeCloseTo(2000);
  });
});

describe('analyseTransactions — dates', () => {
  test('parses ISO dates', () => {
    const rows = [{ Date: '2025-01-15', Description: 'Test', Amount: '10', Category: '', Balance: '' }];
    const stats = analyseTransactions(rows, stdCols);
    expect(stats.dateFrom).toEqual(new Date(2025, 0, 15));
  });

  test('parses UK DD/MM/YYYY dates', () => {
    const rows = [{ Date: '15/01/2025', Description: 'Test', Amount: '10', Category: '', Balance: '' }];
    const stats = analyseTransactions(rows, stdCols);
    expect(stats.dateFrom).toEqual(new Date(2025, 0, 15));
  });

  test('parses long-form dates (01 Jan 2025)', () => {
    const rows = [{ Date: '01 Jan 2025', Description: 'Test', Amount: '10', Category: '', Balance: '' }];
    const stats = analyseTransactions(rows, stdCols);
    expect(stats.dateFrom).toEqual(new Date(2025, 0, 1));
  });

  test('sorts transactions by date ascending', () => {
    const rows = makeRows([
      ['15/01/2025', 'B', '10', '', ''],
      ['01/01/2025', 'A', '20', '', ''],
    ]);
    const stats = analyseTransactions(rows, stdCols);
    expect(stats.transactions[0].description).toBe('A');
    expect(stats.transactions[1].description).toBe('B');
  });
});

describe('analyseTransactions — monthly breakdown', () => {
  test('groups transactions by month', () => {
    const rows = makeRows([
      ['01/01/2025', 'A', '-10', '', ''],
      ['15/01/2025', 'B', '-20', '', ''],
      ['01/02/2025', 'C', '100', '', ''],
    ]);
    const stats = analyseTransactions(rows, stdCols);
    expect(stats.monthly).toHaveLength(2);
    expect(stats.monthly[0].debits).toBeCloseTo(-30);
    expect(stats.monthly[1].credits).toBeCloseTo(100);
  });
});

describe('analyseTransactions — category breakdown', () => {
  test('groups by category when column present', () => {
    const rows = makeRows([
      ['01/01/2025', 'Tesco', '-50', 'Groceries', ''],
      ['02/01/2025', 'Lidl', '-30', 'Groceries', ''],
      ['03/01/2025', 'Netflix', '-15', 'Entertainment', ''],
    ]);
    const stats = analyseTransactions(rows, stdCols);
    const groceries = stats.categories.find(c => c.name === 'Groceries');
    expect(groceries.total).toBeCloseTo(-80);
    expect(groceries.count).toBe(2);
  });
});

describe('analyseTransactions — currency detection', () => {
  test('detects £ from amount values', () => {
    const rows = [{ Date: '01/01/2025', Description: 'Test', Amount: '£100.00', Category: '', Balance: '' }];
    const stats = analyseTransactions(rows, stdCols);
    expect(stats.currency).toBe('£');
  });

  test('defaults to £ when no symbol found', () => {
    const rows = makeRows([['01/01/2025', 'Test', '100.00', '', '']]);
    const stats = analyseTransactions(rows, stdCols);
    expect(stats.currency).toBe('£');
  });
});
