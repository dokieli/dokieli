import { test as base, chromium, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '../../..');

const test = base.extend({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) {
      worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
    }
    const id = worker.url().split('/')[2];
    await use(id);
  },
});

test.describe.configure({ timeout: 60000 });

test.beforeEach(({}, testInfo) => testInfo.setTimeout(60000));

test('popup renders menu chrome', async ({ context, extensionId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  await expect(popup.locator('#document-menu')).toBeVisible();
  await expect(popup.locator('#document-menu-tabs nav a[href="#menu-actions"]')).toBeVisible();
  await expect(popup.locator('#document-menu-tabs nav a[href="#menu-tools"]')).toBeVisible();
  await expect(popup.locator('#document-menu-tabs nav a[href="#menu-settings"]')).toBeVisible();
  await expect(popup.locator('button.signin-user')).toBeVisible();
});

test('popup tab switching', async ({ context, extensionId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  await expect(popup.locator('section#menu-actions.selected')).toBeVisible();
  await popup.click('a[href="#menu-tools"]');
  await expect(popup.locator('section#menu-tools.selected')).toBeVisible();
  await expect(popup.locator('section#menu-actions.selected')).toHaveCount(0);
});

test('new document tab opens', async ({ context, extensionId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  const newTabPromise = context.waitForEvent('page');
  await popup.click('button.resource-new');
  const newTab = await newTabPromise;
  expect(newTab.url()).toBe(`chrome-extension://${extensionId}/new.html`);
});

test('new slideshow tab opens with hash param', async ({ context, extensionId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  const newTabPromise = context.waitForEvent('page');
  await popup.click('button.resource-new-slideshow');
  const newTab = await newTabPromise;
  expect(newTab.url()).toBe(`chrome-extension://${extensionId}/new.html#template=slideshow`);
});

const expectedButtons = [
  '.resource-new', '.resource-new-slideshow', '.resource-open', '.editor-enable',
  '.resource-save', '.resource-save-as', '.create-version', '.create-immutable', '.resource-memento', '.edit-history',
  '.resource-share', '.resource-reply', '.resource-notifications', '.message-log',
  '.robustify-links', '.snapshot-internet-archive', '.generate-feed',
  '.resource-delete',
  '.document-info', '.embed-data-meta', '.resource-source', '.export-as-html', '.resource-print',
];

test('all menu buttons render', async ({ context, extensionId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  for (const cls of expectedButtons) {
    await expect(popup.locator(`button${cls}`)).toHaveCount(1);
  }
});

test('settings tab has language selector and autosave', async ({ context, extensionId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  await popup.click('a[href="#menu-settings"]');
  await expect(popup.locator('#ui-language-select')).toBeVisible();
  await expect(popup.locator('#autosave-remote')).toHaveCount(1);
});

async function waitForContentScript(context, tabId, timeout = 10000) {
  const [sw] = context.serviceWorkers();
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const ok = await sw.evaluate(async (id) => {
      try {
        const r = await chrome.tabs.sendMessage(id, { action: 'dokieli.status' });
        return !!r;
      } catch { return false; }
    }, tabId);
    if (ok) return;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Content script never registered listener');
}

async function activateOnTab(context, tabId) {
  await waitForContentScript(context, tabId);
  const [sw] = context.serviceWorkers();
  await sw.evaluate(async (id) => {
    await chrome.scripting.insertCSS({ target: { tabId: id }, files: ['media/css/dokieli.css'] });
    await chrome.scripting.executeScript({ target: { tabId: id }, files: ['scripts/dokieli.js'] });
    await chrome.tabs.sendMessage(id, { action: 'dokieli.activate' });
  }, tabId);
}

async function getTabId(context, page) {
  const [sw] = context.serviceWorkers();
  return await sw.evaluate(async (url) => {
    const [t] = await chrome.tabs.query({ url });
    return t.id;
  }, page.url());
}

async function dokieliState(context, tabId) {
  const [sw] = context.serviceWorkers();
  const [{ result }] = await sw.evaluate(async (id) => {
    return await chrome.scripting.executeScript({
      target: { tabId: id },
      func: () => ({
        hasDO: typeof DO !== 'undefined',
        hasU: typeof DO !== 'undefined' && !!DO.U,
        hasMenu: typeof DO !== 'undefined' && !!DO.C?.Button?.Menu,
        hasEditor: typeof DO !== 'undefined' && !!DO.C?.Editor,
        editorEnabled: typeof DO !== 'undefined' && !!DO.C?.EditorEnabled,
      }),
    });
  }, tabId);
  return result;
}

async function menuClickViaSw(context, tabId, className) {
  const [sw] = context.serviceWorkers();
  await sw.evaluate(({ id, cls }) =>
    chrome.tabs.sendMessage(id, { action: 'dokieli.menuClick', className: cls }),
  { id: tabId, cls: className });
}

test('activate mounts social toolbar', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto('http://localhost:3000/tests/e2e/browser/html/test.html');
  await page.waitForLoadState('load');

  const tabId = await getTabId(context, page);
  await activateOnTab(context, tabId);

  await expect.poll(() => dokieliState(context, tabId), { timeout: 15000 })
    .toMatchObject({ hasU: true });
  await page.waitForSelector('#document-editor', { state: 'attached', timeout: 15000 });
});

test('selection shows social toolbar', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto('http://localhost:3000/tests/e2e/browser/html/test.html');
  await page.waitForLoadState('load');

  const tabId = await getTabId(context, page);
  await activateOnTab(context, tabId);
  await expect.poll(() => dokieliState(context, tabId), { timeout: 15000 })
    .toMatchObject({ hasU: true });
  await page.waitForSelector('#document-editor', { state: 'attached' });

  await page.evaluate(() => {
    const target = document.querySelector('article a, article p, article');
    const range = document.createRange();
    range.selectNodeContents(target);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  await expect(page.locator('#document-editor')).toBeVisible({ timeout: 5000 });
});

test('edit toggle mounts author editor', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto('http://localhost:3000/tests/e2e/browser/html/test.html');
  await page.waitForLoadState('load');

  const tabId = await getTabId(context, page);
  await activateOnTab(context, tabId);
  await page.waitForSelector('#document-editor', { state: 'attached', timeout: 15000 });

  await menuClickViaSw(context, tabId, 'editor-enable');
  await expect.poll(() => dokieliState(context, tabId), { timeout: 10000 })
    .toMatchObject({ editorEnabled: true });
});


const dialogActions = [
  { className: 'resource-open', selector: '#open-document' },
  { className: 'resource-source', selector: '#source-view' },
  { className: 'embed-data-meta', selector: '#embed-data-entry' },
  { className: 'document-info', selector: '#document-info' },
];

for (const { className, selector } of dialogActions) {
  test(`${className} opens ${selector}`, async ({ context }) => {
    const page = await context.newPage();
    await page.goto('http://localhost:3000/tests/e2e/browser/html/test.html');
    await page.waitForLoadState('load');

    const tabId = await getTabId(context, page);
    await activateOnTab(context, tabId);
    await expect.poll(() => dokieliState(context, tabId), { timeout: 30000 })
      .toMatchObject({ hasMenu: true });

    await menuClickViaSw(context, tabId, className);
    await expect(page.locator(selector)).toBeVisible({ timeout: 10000 });
  });
}
