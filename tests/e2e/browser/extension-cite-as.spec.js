/*!
Copyright 2012-2026 Sarven Capadisli <https://csarven.ca/>
Copyright 2023-2026 Virginia Balseiro <https://virginiabalseiro.com/>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { extensionTest, expect } from "./fixtures";

const PAGE = "http://localhost:3000/tests/e2e/browser/html/cite-as.html";
const NANOPUB = "https://w3id.org/np/RAwtNbf9tGEu7uPkfqOO9fRzjXH1OM2SlYyAritUJMAeM";

const test = extensionTest.extend({
  page: async ({ context }, use) => {
    const page = await context.newPage();
    page.on("console", (msg) => console.log(`[page console] ${msg.type()}: ${msg.text()}`));
    await page.goto(PAGE);
    await page.waitForLoadState("load");
    await use(page);
  },
});

test.describe.configure({ timeout: 240000 });
test.beforeEach(({}, testInfo) => testInfo.setTimeout(240000));

test.beforeEach(async ({ extensionAuth }) => {
  if (!process.env.IDP || !process.env.WEBID || !process.env.LOGIN_ID || !process.env.LOGIN_PASSWORD || !process.env.KEY_PASSPHRASE) {
    test.skip(true, "Set IDP, WEBID, LOGIN_ID, LOGIN_PASSWORD, KEY_PASSPHRASE in .env");
  }
  await extensionAuth.login();
});

async function getTabId(context, page) {
  const [sw] = context.serviceWorkers();
  return sw.evaluate(async (url) => (await chrome.tabs.query({ url }))[0].id, page.url());
}

async function useTestRegistry(context, tabId) {
  const [sw] = context.serviceWorkers();
  await sw.evaluate((id) => chrome.scripting.executeScript({
    target: { tabId: id },
    func: () => { DO.C.Nanopub.UseTestRegistry = true; },
  }), tabId);
}

async function userStorage(context, tabId) {
  const [sw] = context.serviceWorkers();
  const [{ result }] = await sw.evaluate((id) => chrome.scripting.executeScript({
    target: { tabId: id },
    func: () => (typeof DO !== "undefined" && DO.C?.User?.Storage?.[0]) || null,
  }), tabId);
  return result;
}

async function enterPassphrase(page, passphrase) {
  const setup = page.locator("#signing-setup");
  const unlock = page.locator("#encryption-unlock");
  await expect(setup.or(unlock)).toBeVisible({ timeout: 30000 });

  if (await setup.isVisible()) {
    await setup.locator("#signing-passphrase").fill(passphrase);
    const confirm = setup.locator("#signing-passphrase-confirm");
    if (await confirm.count()) await confirm.fill(passphrase);
    await setup.locator("button[type=submit]").click();
  }
  else {
    await unlock.locator("#encryption-unlock-passphrase").fill(passphrase);
    await unlock.locator("button[type=submit]").click();
  }
}

test("annotation on a page citing a nanopub targets the nanopub through its HTML representation", async ({ context, page }) => {
  const tabId = await getTabId(context, page);
  await useTestRegistry(context, tabId);
  await expect.poll(() => userStorage(context, tabId), { timeout: 60000 }).toMatch(/^https?:\/\//);

  await page.evaluate(() => {
    const p = document.querySelector("#np-content");
    const range = document.createRange();
    range.selectNodeContents(p);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await expect(page.locator("#document-editor")).toBeVisible({ timeout: 10000 });

  await page.click("#editor-button-comment");
  await expect(page.locator("textarea#comment-content")).toBeVisible();
  await page.fill("textarea#comment-content", `e2e cite-as ${Date.now()}`);

  await page.locator("#editor-form-comment button.editor-form-advanced-toggle").click();
  const locations = page.locator("#editor-form-comment .annotation-location-selection input[type=checkbox]");
  for (const box of await locations.all()) await box.uncheck();
  await page.locator("#comment-annotation-location-nanopub-network").check();

  await page.locator("#editor-form-comment button.editor-form-submit").click();
  await enterPassphrase(page, process.env.KEY_PASSPHRASE);

  const message = page.locator("#document-action-message");
  await expect(message).toContainText("Published to the nanopub network", { timeout: 120000 });
  const registryURI = await message.locator('a[href*="test.registry"]').first().getAttribute("href");
  expect(registryURI).toBeTruthy();

  const response = await page.request.get(registryURI, { headers: { Accept: "application/trig" } });
  expect(response.ok()).toBeTruthy();
  const trig = await response.text();

  expect(trig).toContain(NANOPUB);
  expect(trig).not.toContain(`${NANOPUB}#`);
  expect(trig).not.toContain(`${PAGE}#`);
  expect(trig).toContain("HttpRequestState");
  expect(trig).toContain("Accept: text/html");
  expect(trig).toContain("FragmentSelector");
  expect(trig).toContain("np-content");
  expect(trig).toContain("hasNanopubType");
  expect(trig).not.toMatch(/this:\s+a\s+<http:\/\/www\.w3\.org\/ns\/oa#Annotation>/);
});
