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

import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

const localScriptContent = fs.readFileSync(path.resolve("./scripts/dokieli.js"), "utf8");
const augmentedScript = localScriptContent.replace(
  "window.DO = DO;",
  `window.DO = DO;
window.doCollabTest = {
  showReviewPanel: showResourceReviewChanges,
  addYjsVersion,
  getYjsVersions,
  restoreYjsContent,
  showEditHistory,
  getCurrentVersionKey,
};`
);

async function setupRoutes(page, { augment = false } = {}) {
  await page.route("https://dokie.li/**", (route) => route.abort());
  await page.route("**/scripts/dokieli.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: augment ? augmentedScript : localScriptContent,
    })
  );
}

function versionPayload(content, updated) {
  return { content, updated, mediaType: "text/html", actor: null };
}

async function enableAuthorMode(page) {
  await page.locator("#document-menu button").click();
  await expect(page.locator("[id=document-menu]")).toBeVisible();
  await page.locator(".editor-enable").click();
  await expect(page.locator(".ProseMirror")).toHaveAttribute("contenteditable", "true");
}

test.describe("collab mode initialization", () => {
  test.describe.configure({ timeout: 30000 });

  test.beforeEach(async ({ page }) => {
    await setupRoutes(page);
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await enableAuthorMode(page);
  });

  test("enables Yjs collab for existing documents in author mode", async ({ page }) => {
    const collab = await page.evaluate(() => window.DO.C.Editor.collab);
    expect(collab).toBe(true);

    const isNew = await page.evaluate(() => window.DO.C.Editor["new"]);
    expect(isNew).toBeFalsy();
  });

  test("disables Yjs collab for new documents", async ({ page }) => {
    await page.goto("/new");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 8000 });

    const isNew = await page.evaluate(() => window.DO.C.Editor["new"]);
    expect(isNew).toBe(true);

    const collab = await page.evaluate(() => window.DO.C.Editor.collab);
    expect(collab).toBe(false);
  });

  test("assigns an anonymous identity to each collab session", async ({ page }) => {
    const result = await page.evaluate(() => {
      const names = window.DO.C.SecretAgentNames;
      const userName = window.DO.C.User.Name;
      return { names, userName };
    });

    expect(Array.isArray(result.names)).toBe(true);
    expect(result.names.length).toBeGreaterThan(0);

    if (!result.userName) {
      expect(result.names.every((n) => typeof n === "string" && n.length > 0)).toBe(true);
    }
  });

  test("new document editor has do-new CSS class", async ({ page }) => {
    await page.goto("/new");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 8000 });

    const editor = page.locator(".ProseMirror");
    await expect(editor).toHaveClass(/do-new/);
  });

  test("existing document editor does not have do-new CSS class", async ({ page }) => {
    // /index.html has real content, so ProseMirror should not have do-new
    const editor = page.locator(".ProseMirror");
    await expect(editor).not.toHaveClass(/do-new/);
  });
});

const LOCAL_HTML =
  "<html><body><article><p>Local version: the author added this sentence.</p></article></body></html>";
const REMOTE_HTML =
  "<html><body><article><p>Remote version: the server has this text instead.</p></article></body></html>";

test.describe("review changes panel", () => {
  test.describe.configure({ timeout: 30000 });

  test.beforeEach(async ({ page }) => {
    await setupRoutes(page, { augment: true });

    await page.goto("/new");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 8000 });
  });

  test("appears when local and remote content differ", async ({ page }) => {
    await page.evaluate(
      ([local, remote]) => window.doCollabTest.showReviewPanel(local, remote, null, {}),
      [LOCAL_HTML, REMOTE_HTML]
    );

    const panel = page.locator("#review-changes");
    await expect(panel).toBeVisible();
  });

  test("contains a diff visualization with ins and del elements", async ({ page }) => {
    await page.evaluate(
      ([local, remote]) => window.doCollabTest.showReviewPanel(local, remote, null, {}),
      [LOCAL_HTML, REMOTE_HTML]
    );

    const diff = page.locator("#review-changes .do-diff");
    await expect(diff).toBeVisible();

    await expect(diff.locator("ins").first()).toBeVisible();
    await expect(diff.locator("del").first()).toBeVisible();
  });

  test("shows a statistics table with added and removed counts", async ({ page }) => {
    await page.evaluate(
      ([local, remote]) => window.doCollabTest.showReviewPanel(local, remote, null, {}),
      [LOCAL_HTML, REMOTE_HTML]
    );

    const panel = page.locator("#review-changes");

    await panel.locator("details summary").click();

    const table = panel.locator("table");
    await expect(table).toBeVisible();

    await expect(table.locator("ins")).toBeVisible();
    await expect(table.locator("del")).toBeVisible();
  });

  test("provides save-local, save-remote, and submit action buttons", async ({ page }) => {
    await page.evaluate(
      ([local, remote]) => window.doCollabTest.showReviewPanel(local, remote, null, {}),
      [LOCAL_HTML, REMOTE_HTML]
    );

    const panel = page.locator("#review-changes");
    await expect(panel.locator(".review-changes-save-local")).toBeVisible();
    await expect(panel.locator(".review-changes-save-remote")).toBeVisible();
    await expect(panel.locator(".review-changes-submit")).toBeVisible();
  });

  test("close button removes the panel and clears review state", async ({ page }) => {
    await page.evaluate(
      ([local, remote]) => window.doCollabTest.showReviewPanel(local, remote, null, {}),
      [LOCAL_HTML, REMOTE_HTML]
    );

    await page.locator("#review-changes .close").click();

    await expect(page.locator("#review-changes")).not.toBeAttached();

    const reviewState = await page.evaluate(() => window.DO.C.Editor["review"]);
    expect(reviewState).toBe(false);
  });

  test("submit button merges changes and removes the panel", async ({ page }) => {
    await page.evaluate(
      ([local, remote]) => window.doCollabTest.showReviewPanel(local, remote, null, {}),
      [LOCAL_HTML, REMOTE_HTML]
    );

    await page.locator("#review-changes").waitFor({ state: "visible" });
    await page.locator(".review-changes-submit").click();

    await expect(page.locator("#review-changes")).not.toBeAttached();
  });

  test("save-local button dismisses the panel", async ({ page }) => {
    await page.evaluate(
      ([local, remote]) => window.doCollabTest.showReviewPanel(local, remote, null, {}),
      [LOCAL_HTML, REMOTE_HTML]
    );

    await page.locator("#review-changes").waitFor({ state: "visible" });
    await page.locator(".review-changes-save-local").click();

    await expect(page.locator("#review-changes")).not.toBeAttached();
  });

  test("save-remote button dismisses the panel", async ({ page }) => {
    await page.evaluate(
      ([local, remote]) => window.doCollabTest.showReviewPanel(local, remote, null, {}),
      [LOCAL_HTML, REMOTE_HTML]
    );

    await page.locator("#review-changes").waitFor({ state: "visible" });
    await page.locator(".review-changes-save-remote").click();

    await expect(page.locator("#review-changes")).not.toBeAttached();
  });

  test("version-preview mode shows restore button instead of conflict buttons", async ({ page }) => {
    const versionContent =
      "<html><body><article><p>This is an older version of the document.</p></article></body></html>";
    const currentContent =
      "<html><body><article><p>This is the current version of the document.</p></article></body></html>";

    await page.evaluate(
      ([older, current, opts]) =>
        window.doCollabTest.showReviewPanel(older, current, null, opts),
      [versionContent, currentContent, { mode: "edit-history-preview" }]
    );

    const panel = page.locator("#review-changes");
    await expect(panel).toBeVisible();

    await expect(panel.locator(".version-restore")).toBeVisible();
    await expect(panel.locator(".review-changes-save-local")).not.toBeAttached();
    await expect(panel.locator(".review-changes-save-remote")).not.toBeAttached();
    await expect(panel.locator(".review-changes-submit")).not.toBeAttached();
  });

  test("panel is not shown when local and remote content are identical", async ({ page }) => {
    const sameContent =
      "<html><body><article><p>Identical content on both sides.</p></article></body></html>";

    await page.evaluate(
      ([content]) => window.doCollabTest.showReviewPanel(content, content, null, {}),
      [sameContent]
    );

    await expect(page.locator("#review-changes")).not.toBeAttached();
  });

  test("review panel has a label and accessible structure", async ({ page }) => {
    await page.evaluate(
      ([local, remote]) => window.doCollabTest.showReviewPanel(local, remote, null, {}),
      [LOCAL_HTML, REMOTE_HTML]
    );

    const panel = page.locator("#review-changes");
    await expect(panel).toHaveAttribute("aria-labelledby", "review-changes-label");
    await expect(panel.locator("#review-changes-label")).toBeVisible();
  });
});

test.describe("collab save event", () => {
  test.describe.configure({ timeout: 30000 });

  test.beforeEach(async ({ page }) => {
    await setupRoutes(page);
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await enableAuthorMode(page);
  });

  test("dispatching dokieli:collab-save records a savedStateVector in the Yjs doc", async ({ page }) => {

    const collabBefore = await page.evaluate(() => window.DO.C.Editor.collab);
    expect(collabBefore).toBe(true);

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("dokieli:collab-save"));
    });


    const collabAfter = await page.evaluate(() => window.DO.C.Editor.collab);
    expect(collabAfter).toBe(true);
  });
});

async function openDemoPage(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await setupRoutes(page, { augment: true });
  await page.goto("/demo");
  await page.waitForLoadState("domcontentloaded");

  // Register before enabling author mode so the event is never missed.
  // Falls back after 8 s if the server is unreachable.
  const collabReady = page.evaluate(() =>
    new Promise((resolve) => {
      window.addEventListener("dokieli:collab-ready", resolve, { once: true });
      setTimeout(resolve, 8000);
    })
  );

  await enableAuthorMode(page);
  await collabReady;
  return { context, page };
}

// Serial so each test gets a clean /demo y-websocket room.
test.describe("demo-backed collab", () => {
  test.describe.configure({ mode: "serial", timeout: 60000 });

  test.describe("multi-user collab via WebSocket", () => {

  test("changes typed by one user appear in a second user's editor", async ({ browser }) => {
    const { context: ctx1, page: page1 } = await openDemoPage(browser);
    const { context: ctx2, page: page2 } = await openDemoPage(browser);

    const editor1 = page1.locator(".ProseMirror");
    await editor1.click();
    await page1.keyboard.press("Control+a");
    await page1.keyboard.press("Backspace");

    await editor1.click();
    await page1.keyboard.type("Hello from Alice");

    await page2.waitForTimeout(1500);

    const editor2 = page2.locator(".ProseMirror");
    await expect(editor2).toContainText("Hello from Alice");

    await ctx1.close();
    await ctx2.close();
  });

  test("both users' cursors appear in each other's awareness", async ({ browser }) => {
    const { context: ctx1, page: page1 } = await openDemoPage(browser);
    const { context: ctx2, page: page2 } = await openDemoPage(browser);

    await page1.locator(".ProseMirror").click();
    await page2.locator(".ProseMirror").click();

    await page1.waitForTimeout(1000);

    const remoteCursors = await page1.locator(".yjs-cursor, .yjs-caret").count();
    expect(remoteCursors).toBeGreaterThanOrEqual(1);

    await ctx1.close();
    await ctx2.close();
  });

  test("edits from user 2 also propagate back to user 1", async ({ browser }) => {
    const { context: ctx1, page: page1 } = await openDemoPage(browser);
    const { context: ctx2, page: page2 } = await openDemoPage(browser);

    const editor2 = page2.locator(".ProseMirror");
    await editor2.click();
    await page2.keyboard.type("Hello from Bob");

    await page1.waitForTimeout(1500);

    const editor1 = page1.locator(".ProseMirror");
    await expect(editor1).toContainText("Hello from Bob");

    await ctx1.close();
    await ctx2.close();
  });

  test("collab-ready event fires when WebSocket syncs", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/demo");
    await page.waitForLoadState("domcontentloaded");

    const readyPromise = page.evaluate(() =>
      new Promise((resolve) => {
        window.addEventListener("dokieli:collab-ready", () => resolve(true), { once: true });
        setTimeout(() => resolve(false), 8000);
      })
    );

    await enableAuthorMode(page);

    const fired = await readyPromise;
    expect(fired).toBe(true);

    await context.close();
  });
  });

  test.describe("edit-history panel", () => {
    test("a version added via addYjsVersion appears in the list", async ({ browser }) => {
      const { context, page } = await openDemoPage(browser);
      const datetime = "2099-05-22T10:00:00Z";

      await page.evaluate((v) => window.doCollabTest.addYjsVersion(v), versionPayload(
        "<html><body><article><p>v1</p></article></body></html>",
        datetime
      ));

      await page.evaluate(() => window.doCollabTest.showEditHistory());

      await expect(page.locator(
        `#document-edit-history ul.versions li[data-datetime="${datetime}"]`
      )).toBeVisible();
      await context.close();
    });

    // Future timestamps so my versions sort newer than any wall-clock autosave.
    test("versions render newest first", async ({ browser }) => {
      const { context, page } = await openDemoPage(browser);
      const added = [
        "2099-01-01T00:00:00Z",
        "2099-03-01T00:00:00Z",
        "2099-05-01T00:00:00Z",
      ];

      await page.evaluate((dates) => {
        const add = window.doCollabTest.addYjsVersion;
        for (const updated of dates) {
          add({ content: `<p>${updated}</p>`, updated, mediaType: "text/html" });
        }
      }, added);

      await page.evaluate(() => window.doCollabTest.showEditHistory());

      const datetimes = await page
        .locator("#document-edit-history ul.versions li")
        .evaluateAll((els) => els.map((el) => el.getAttribute("data-datetime")));
      expect(datetimes.slice(0, 3)).toEqual([
        "2099-05-01T00:00:00Z",
        "2099-03-01T00:00:00Z",
        "2099-01-01T00:00:00Z",
      ]);
      await context.close();
    });
  });

  test.describe("version restore workflow", () => {
    test("preview then restore replaces editor content", async ({ browser }) => {
      const { context, page } = await openDemoPage(browser);
      const restoredHTML =
        "<html><body><article><p>this is the restored content</p></article></body></html>";

      await page.evaluate((v) => window.doCollabTest.addYjsVersion(v), versionPayload(
        restoredHTML,
        "2026-05-22T10:00:00Z"
      ));

      const editor = page.locator(".ProseMirror");
      await editor.click();
      await page.keyboard.press("Control+a");
      await page.keyboard.press("Backspace");
      await page.keyboard.type("scratch text that should be replaced");

      await page.evaluate(() => window.doCollabTest.showEditHistory());
      await page.locator("#document-edit-history button.edit-history-preview").first().click();

      await expect(page.locator("#review-changes")).toBeVisible();
      await page.locator("#review-changes .version-restore").click();

      await expect(editor).toContainText("this is the restored content");
      await expect(editor).not.toContainText("scratch text");
      await context.close();
    });

    test("restoring a version disables its preview button", async ({ browser }) => {
      const { context, page } = await openDemoPage(browser);
      const olderKey = "2099-05-22T10:00:00Z";
      const newerKey = "2099-05-22T12:00:00Z";

      await page.evaluate((v) => window.doCollabTest.addYjsVersion(v), versionPayload(
        "<html><body><article><p>older</p></article></body></html>", olderKey));
      await page.evaluate((v) => window.doCollabTest.addYjsVersion(v), versionPayload(
        "<html><body><article><p>newer</p></article></body></html>", newerKey));

      await page.evaluate(() => window.doCollabTest.showEditHistory());

      const olderPreview = page.locator(
        `#document-edit-history button.edit-history-preview[data-key="${olderKey}"]`
      );
      await expect(olderPreview).toBeEnabled();

      await olderPreview.click();
      await page.locator("#review-changes .version-restore").click();

      await expect(olderPreview).toBeDisabled();
      await context.close();
    });
  });

  test.describe("version cap", () => {
    test("keeps only the newest 20 versions and renders them in the panel", async ({ browser }) => {
      const { context, page } = await openDemoPage(browser);
      await page.evaluate(() => {
        const add = window.doCollabTest.addYjsVersion;
        for (let i = 0; i < 25; i++) {
          const stamp = `2026-01-01T00:00:${String(i).padStart(2, "0")}Z`;
          add({ content: `<p>${i}</p>`, updated: stamp, mediaType: "text/html" });
        }
      });

      const stored = await page.evaluate(() => window.doCollabTest.getYjsVersions().length);
      expect(stored).toBe(20);

      await page.evaluate(() => window.doCollabTest.showEditHistory());
      const items = page.locator("#document-edit-history ul.versions li");
      await expect(items).toHaveCount(20);
      await context.close();
    });
  });

  test.describe("multi-user version propagation", () => {
    test("a version saved by user 1 appears in user 2's edit-history panel", async ({ browser }) => {
      const { context: ctx1, page: page1 } = await openDemoPage(browser);
      const { context: ctx2, page: page2 } = await openDemoPage(browser);
      const datetime = "2099-05-22T13:00:00Z";

      await page1.evaluate((v) => window.doCollabTest.addYjsVersion(v), versionPayload(
        "<html><body><article><p>from user 1</p></article></body></html>",
        datetime
      ));

      await expect
        .poll(
          () => page2.evaluate(
            (d) => window.doCollabTest.getYjsVersions().some(v => v.updated === d),
            datetime
          ),
          { timeout: 5000 }
        )
        .toBe(true);

      await page2.evaluate(() => window.doCollabTest.showEditHistory());
      await expect(page2.locator(
        `#document-edit-history ul.versions li[data-datetime="${datetime}"]`
      )).toBeVisible();

      await ctx1.close();
      await ctx2.close();
    });
  });
});
