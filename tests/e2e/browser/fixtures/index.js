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

import base, { chromium } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, "../../../..");

export class ExtensionAuth {
  constructor(context, extensionId, page) {
    this.context = context;
    this.extensionId = extensionId;
    this.page = page;
  }

  async login() {
    let [sw] = this.context.serviceWorkers();
    if (!sw) sw = await this.context.waitForEvent("serviceworker", { timeout: 30000 });

    await sw.evaluate(async () => { await chrome.storage.local.clear(); });

    const tabId = await sw.evaluate(async (url) => {
      const [t] = await chrome.tabs.query({ url });
      return t.id;
    }, this.page.url());

    const csStart = Date.now();
    while (Date.now() - csStart < 10000) {
      const ok = await sw.evaluate(async (id) => {
        try { return !!(await chrome.tabs.sendMessage(id, { action: "dokieli.status" })); }
        catch { return false; }
      }, tabId);
      if (ok) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    const popup = await this.context.newPage();
    await popup.goto(`chrome-extension://${this.extensionId}/popup.html`);
    await popup.locator("button.signin-user").waitFor({ state: "visible" });
    await this.page.bringToFront();
    await this.page.waitForTimeout(500);

    const popupClosed = popup.waitForEvent("close", { timeout: 30000 });
    await popup.locator("button.signin-user").click();
    await popupClosed;

    const dialog = this.page.locator("#user-identity-input");
    await dialog.waitFor({ state: "visible", timeout: 30000 });

    const solidProvider = dialog.locator('button.do-signin-provider[data-provider="solid"]');
    await solidProvider.click();
    await dialog.locator("#solid-provider-url").waitFor({ state: "visible" });
    await dialog.locator("#solid-provider-url").fill(process.env.IDP);

    const authPagePromise = this.context.waitForEvent("page", { timeout: 60000 });
    await dialog.locator('button.do-signin-provider-go[data-provider="solid"]').click();
    const authPage = await authPagePromise;
    authPage.on("console", (msg) => console.log(`[auth console] ${msg.type()}: ${msg.text()}`));
    await authPage.waitForLoadState("domcontentloaded");

    await authPage.waitForURL(/\.account\/login\/password\/?/, { timeout: 60000 });
    await authPage.locator("#email").waitFor({ state: "visible" });
    await authPage.locator("#email").fill(process.env.LOGIN_ID);
    await authPage.locator("#password").fill(process.env.LOGIN_PASSWORD);
    await authPage.locator("button[type=submit]").click();

    await authPage.waitForURL(/\.account\/oidc\/consent\/?/, { timeout: 60000 });
    await authPage.locator("button[type=submit]").waitFor({ state: "visible" });
    await authPage.locator("button[type=submit]").click();

    await authPage.waitForEvent("close", { timeout: 60000 }).catch(() => {});

    await base.expect.poll(() => this.#isolatedState(tabId), { timeout: 60000, intervals: [500, 1000] })
      .toMatchObject({ sessionActive: true });
    await base.expect.poll(() => this.#isolatedState(tabId), { timeout: 60000, intervals: [500, 1000] })
      .toMatchObject({ userIRI: base.expect.stringMatching(/^https?:\/\//) });

    return { tabId };
  }

  async #isolatedState(tabId) {
    const [sw] = this.context.serviceWorkers();
    const [{ result }] = await sw.evaluate(async (id) => {
      return await chrome.scripting.executeScript({
        target: { tabId: id },
        func: () => ({
          sessionActive: typeof DO !== "undefined" && !!DO.C?.Session?.isActive,
          userIRI: typeof DO !== "undefined" ? DO.C?.User?.IRI : null,
          userStorage: typeof DO !== "undefined" ? DO.C?.User?.Storage?.[0] || null : null,
          userOutbox: typeof DO !== "undefined" ? DO.C?.User?.Outbox?.[0] || null : null,
          hasTypeIndex: typeof DO !== "undefined" && !!DO.C?.User?.TypeIndex && Object.keys(DO.C.User.TypeIndex).length > 0,
        }),
      });
    }, tabId);
    return result;
  }
}

export const extensionTest = base.test.extend({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
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
    if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 60000 });
    await use(worker.url().split("/")[2]);
  },
  page: async ({ context }, use) => {
    const page = await context.newPage();
    page.on("console", (msg) => console.log(`[page console] ${msg.type()}: ${msg.text()}`));
    await page.goto("http://localhost:3000/tests/e2e/browser/html/test.html");
    await page.waitForLoadState("load");
    await use(page);
  },
  extensionAuth: async ({ context, extensionId, page }, use) => {
    await use(new ExtensionAuth(context, extensionId, page));
  },
});

export class Auth {
  constructor(page, isMobile) {
    
    this.page = page;
    this.isMobile = isMobile;
  }

  async login() {
    await this.page.goto("/");
    await this.page.locator("#document-menu > button").click();

    const signinbtn = "button.signin-user";
    await this.page.waitForSelector(signinbtn);
    await this.page.click(signinbtn);

    await this.page.fill('input[id="webid"]', process.env.WEBID);
    await this.page.click('button[class="signin"]');

    // click login btn
    await this.page.waitForSelector("button[type=submit]");
    await this.page.click("button[type=submit]");

    // account page to enter credentials and login

    await this.page.waitForURL(/https:\/\/[^/]+\/\.account\/login\/password\/?/, {
      timeout: 10000,
    });
    await this.page.waitForSelector("input#email");

    await this.page.fill("#email", process.env.LOGIN_ID);
    await this.page.fill("#password", process.env.LOGIN_PASSWORD);
    await this.page.click("button[type=submit]");


    // consent page to authorize the client
    await this.page.waitForURL(/https:\/\/[^/]+\/\.account\/oidc\/consent\/?/, {
      timeout: 10000,
    });
    // wait until page fully loaded (last item to appear is ID)
    await this.page.waitForSelector('[id="client"]');


    // click authorize btn
    await this.page.waitForSelector("button[type=submit]");
    await this.page.click("button[type=submit]");
    


    // await redirect
    await this.page.waitForURL('**', { timeout: 10000 });  

    // wait to redirect to homepage
    await this.page.waitForURL("http://localhost:3000/");

    // Listen for console messages to make sure we are logged in // FIX THIS: ideally we would check something in the UI
    await this.page.on("console", async (msg) => {
      await new Promise(async (resolve) => {
          if (msg.text().includes(process.env.WEBID)) {
            resolve();
          }
      });
    });

  }
}

export const test = base.test.extend({
  page: async ({ browser }, use) => {
    // fresh context per test
    const context = await browser.newContext();
    const page = await context.newPage();
    await use(page);
    await context.close();
  },

  auth: async ({ page }, use) => {
    const auth = new Auth(page);
    await use(auth);
  },
});
export const expect = base.expect;
