const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./support/electron-app');
const { startMockOllama } = require('./support/mock-ollama');

test.describe('debug panel', () => {
  let mock;
  let app;

  test.beforeAll(async () => {
    mock = await startMockOllama({
      tagsModels: ['test-model:latest'],
      chatContent: 'Hello world this is the mock agent output.',
      gateVerdict: { score: 9, reason: 'Meets the bar.' }
    });
  });

  test.afterAll(async () => {
    await mock.close();
  });

  test.beforeEach(async () => {
    app = await launchApp({ endpoint: mock.url, defaultModel: 'test-model:latest' });
    const { window } = app;
    await window.click('#btn-new-project');
    await window.waitForFunction(() => window.ABState.project);

    await window.evaluate(() => {
      const S = window.ABState;
      const orch = S.addNode(100, 100);
      const agent = S.addNode(400, 100);
      S.addEdge(orch.id, agent.id, { label: 'Always pass', text: 'Always passes.', threshold: 1, onFail: 'block' });
    });
    await window.evaluate(() => window.ABState.save());

    await window.fill('#run-input', 'Do the thing.');
    await window.click('#btn-run');
    await window.waitForFunction(
      () => document.querySelectorAll('#invocation-list .invocation-row').length === 3,
      { timeout: 20000 }
    );
  });

  test.afterEach(async () => {
    await closeApp(app);
  });

  test('request and response sections render for an invocation', async () => {
    const { window } = app;
    const sections = window.locator('#invocation-detail .detail-section');
    await expect(sections).toHaveCount(2);
    await expect(sections.nth(0).locator('summary')).toHaveText('Request');
    await expect(sections.nth(1).locator('summary')).toHaveText('Response');
    await expect(sections.nth(0).locator('pre')).not.toBeEmpty();
  });

  test('sections are collapsible via their summary headers', async () => {
    const { window } = app;
    const responseSection = window.locator('#invocation-detail .detail-section').nth(1);
    await expect(responseSection).toHaveJSProperty('open', true);
    await responseSection.locator('summary').click();
    await expect(responseSection).toHaveJSProperty('open', false);
    await responseSection.locator('summary').click();
    await expect(responseSection).toHaveJSProperty('open', true);
  });

  test('collapse state survives switching invocations', async () => {
    const { window } = app;
    const responseSection = () => window.locator('#invocation-detail .detail-section').nth(1);
    await expect(responseSection()).toHaveJSProperty('open', true);
    await responseSection().locator('summary').click();
    await expect(responseSection()).toHaveJSProperty('open', false);

    const rows = window.locator('#invocation-list .invocation-row');
    await rows.nth(1).click();
    await expect(responseSection()).toHaveJSProperty('open', false);

    await rows.nth(2).click();
    await expect(responseSection()).toHaveJSProperty('open', false);

    await rows.nth(0).click();
    await expect(responseSection()).toHaveJSProperty('open', false);
  });
});

test.describe('settings dialog', () => {
  let app;

  test.beforeEach(async () => {
    app = await launchApp();
  });

  test.afterEach(async () => {
    await closeApp(app);
  });

  test('opens and persists a changed setting', async () => {
    const { window } = app;
    await window.click('#btn-settings');
    await expect(window.locator('#settings-dialog')).toBeVisible();

    const maxStepsInput = window.locator('#set-maxsteps');
    await expect(maxStepsInput).toHaveValue('50');
    await maxStepsInput.fill('77');
    await window.locator('#settings-form button[type="submit"]').click();

    await window.waitForFunction(async () => {
      const res = await window.agentbase.getConfig();
      return res.success && res.config.maxSteps === 77;
    });

    const persisted = await window.evaluate(async () => (await window.agentbase.getConfig()).config.maxSteps);
    expect(persisted).toBe(77);
  });
});
