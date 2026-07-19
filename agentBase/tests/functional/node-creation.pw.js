const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./support/electron-app');

test.describe('node creation flows', () => {
  let app;

  test.beforeEach(async () => {
    app = await launchApp();
    await app.window.click('#btn-new-project');
    await app.window.waitForFunction(() => window.ABState.project);
  });

  test.afterEach(async () => {
    await closeApp(app);
  });

  test('New agent button creates a blank orchestrator node first', async () => {
    const { window } = app;
    await window.click('#btn-add-agent');
    await window.waitForSelector('#node-layer .node');
    const nodes = await window.evaluate(() => window.ABState.project.nodes.map((n) => ({ role: n.role, name: n.name, prompt: n.prompt })));
    expect(nodes).toHaveLength(1);
    expect(nodes[0].role).toBe('orchestrator');
    expect(nodes[0].prompt).toBe('');
  });

  test('New agent button creates a blank agent node on subsequent clicks', async () => {
    const { window } = app;
    await window.click('#btn-add-agent');
    await window.click('#btn-add-agent');
    await window.waitForFunction(() => window.ABState.project.nodes.length === 2);
    const nodes = await window.evaluate(() => window.ABState.project.nodes.map((n) => n.role));
    expect(nodes).toEqual(['orchestrator', 'agent']);
    const nodeEls = await window.locator('#node-layer .node').count();
    expect(nodeEls).toBe(2);
  });

  test('dragging on empty canvas shows the guided-create chooser', async () => {
    const { window } = app;
    const wrap = window.locator('#canvas-wrap');
    const box = await wrap.boundingBox();
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    await window.mouse.move(startX, startY);
    await window.mouse.down();
    await window.mouse.move(startX + 60, startY + 60, { steps: 8 });
    await window.mouse.up();

    const chooser = window.locator('#create-chooser');
    await expect(chooser).toBeVisible();
    await expect(chooser.locator('button', { hasText: 'Blank agent' })).toBeVisible();
    await expect(chooser.locator('button', { hasText: 'AI-assist' })).toBeVisible();
  });

  test('guided-create chooser "Blank agent" option creates a node directly', async () => {
    const { window } = app;
    const wrap = window.locator('#canvas-wrap');
    const box = await wrap.boundingBox();
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    await window.mouse.move(startX, startY);
    await window.mouse.down();
    await window.mouse.move(startX + 60, startY + 60, { steps: 8 });
    await window.mouse.up();

    await window.locator('#create-chooser button', { hasText: 'Blank agent' }).click();

    await window.waitForFunction(() => window.ABState.project.nodes.length === 1);
    await expect(window.locator('#create-chooser')).toHaveCount(0);
    await expect(window.locator('#assist-dialog')).not.toBeVisible();
    const nodes = await window.evaluate(() => window.ABState.project.nodes);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].role).toBe('orchestrator');
  });

  test('guided-create chooser "AI-assist" option opens the assist dialog', async () => {
    const { window } = app;
    const wrap = window.locator('#canvas-wrap');
    const box = await wrap.boundingBox();
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    await window.mouse.move(startX, startY);
    await window.mouse.down();
    await window.mouse.move(startX + 60, startY + 60, { steps: 8 });
    await window.mouse.up();

    await window.locator('#create-chooser button', { hasText: 'AI-assist' }).click();

    await expect(window.locator('#assist-dialog')).toBeVisible();
    await expect(window.locator('#assist-phase-describe')).toBeVisible();
    const nodeCount = await window.evaluate(() => window.ABState.project.nodes.length);
    expect(nodeCount).toBe(0);
  });
});
