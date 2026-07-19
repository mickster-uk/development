const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./support/electron-app');
const { startMockOllama } = require('./support/mock-ollama');

test.describe('AI-assist dialog', () => {
  let mock;
  let app;

  test.beforeAll(async () => {
    mock = await startMockOllama({ tagsModels: ['other-model:latest'] });
  });

  test.afterAll(async () => {
    await mock.close();
  });

  test.beforeEach(async () => {
    app = await launchApp({ endpoint: mock.url, defaultModel: 'missing-model:latest', assistModel: null });
    await app.window.click('#btn-new-project');
    await app.window.waitForFunction(() => window.ABState.project);
  });

  test.afterEach(async () => {
    await closeApp(app);
  });

  test('opens from the AI agent button', async () => {
    const { window } = app;
    await window.click('#btn-add-ai');
    await expect(window.locator('#assist-dialog')).toBeVisible();
    await expect(window.locator('#assist-phase-describe')).toBeVisible();
    await expect(window.locator('#assist-phase-interview')).toBeHidden();
    await expect(window.locator('#assist-phase-preview')).toBeHidden();
  });

  test('describe phase accepts input', async () => {
    const { window } = app;
    await window.click('#btn-add-ai');
    const desc = window.locator('#assist-desc');
    await desc.fill('Reviews a draft blog post and returns feedback on tone.');
    await expect(desc).toHaveValue('Reviews a draft blog post and returns feedback on tone.');
    await expect(window.locator('#assist-begin')).toBeEnabled();
  });

  test('shows a non-retryable error with Try again hidden when the configured model is missing', async () => {
    const { window } = app;
    await window.click('#btn-add-ai');
    await window.fill('#assist-desc', 'Reviews a draft blog post and returns feedback on tone.');
    await window.click('#assist-begin');

    await expect(window.locator('#assist-phase-interview')).toBeVisible();
    await expect(window.locator('#assist-error')).toBeVisible({ timeout: 10000 });
    await expect(window.locator('#assist-error-text')).toContainText('missing-model:latest');
    await expect(window.locator('#assist-error-text')).toContainText('not installed');
    const hiddenProp = await window.locator('#assist-retry').evaluate((el) => el.hidden);
    expect(hiddenProp).toBe(true);
    await expect(window.locator('#assist-retry')).toBeHidden();
  });
});
