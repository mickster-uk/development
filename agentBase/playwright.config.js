module.exports = {
  testDir: 'tests/functional',
  testMatch: '**/*.pw.js',
  timeout: 30000,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'tests/functional/report', open: 'never' }]]
};
