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
import AxeBuilder from "@axe-core/playwright";
import path from "path";
import fs from "fs";

test.describe("new page", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("https://dokie.li/scripts/dokieli.js", async (route) => {
      const localScriptPath = path.resolve("./scripts/dokieli.js");
      const scriptContent = fs.readFileSync(localScriptPath, "utf8");
      await route.fulfill({
        contentType: "application/javascript",
        body: scriptContent,
      });
    });
  });

  test("should not have any automatically detectable accessibility issues", async ({ page }) => {
    await page.goto("/new");
    await page.waitForLoadState("load");

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("should not have WCAG A or AA violations", async ({ page }) => {
    await page.goto("/new");
    await page.waitForLoadState("load");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test("should not have WCAG AAA violations", async ({ page }) => {
    await page.goto("/new");
    await page.waitForLoadState("load");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2aaa", "wcag21aaa"])
      .analyze();

    if (results.violations.length > 0) {
      console.warn("WCAG AAA violations:", results.violations);
    }
  });

  test("initializes a new document in author mode when navigating to /new", async ({ page }) => {
    // Bare /new only opens the template picker; a document needs a template.
    await page.goto("/new?template=article");

    // Placeholders are widget decorations now, not data-placeholder attributes.
    const h1 = page.locator("h1");
    await expect(h1).toBeVisible();
    await expect(h1.locator(".editor-placeholder")).toHaveText("Title");

    const p = page.locator("p");
    await expect(p.locator(".editor-placeholder")).toHaveText("Cogito, ergo sum.");

    const documentEditor = page.locator(".do-new.ProseMirror");
    await expect(documentEditor).toHaveAttribute("contenteditable", "true");

    await h1.click();
    await h1.fill("Test text");

    // Keyboard, not a drag: the "Activated author mode" message overlays the
    // heading and a drag would select the message instead.
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");

    const toolbar = page.locator(".editor-toolbar");
    await expect(toolbar).toBeVisible();
    // A count grows as buttons are added; assert the toolbar is populated.
    const toolbarActions = page.locator(".editor-form-actions li");
    expect(await toolbarActions.count()).toBeGreaterThanOrEqual(19);
    await expect(page.locator(".editor-toolbar #editor-button-strong")).toBeVisible();
    await expect(page.locator(".editor-toolbar #editor-button-em")).toBeVisible();
  });
});

test.describe("via new button", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("load");
    await page.locator("#document-menu button").click();
    await expect(page.locator("[id=document-menu]")).toBeVisible();
    await page.locator("[class=resource-new]").click();

    // Picking New opens a template chooser; the document only exists after it.
    await page.locator("#new-document-article").check();
    await page.locator("#new-document button.create").click();
  });

  test("should not have any automatically detectable accessibility issues", async ({ page }) => {
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("should not have WCAG A or AA violations", async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("should not have WCAG AAA violations", async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2aaa", "wcag21aaa"])
      .analyze();

    if (results.violations.length > 0) {
      console.warn("WCAG AAA violations:", results.violations);
    }
  });

  test("initializes a new document in author mode", async ({ page }) => {
    const documentEditor = page.locator(".do-new.ProseMirror");
    await expect(documentEditor).toHaveAttribute("contenteditable", "true");

    const h1 = page.locator("h1");
    await expect(h1).toBeVisible();
    await expect(h1.locator(".editor-placeholder")).toHaveText("Title");

    const p = page.locator("p");
    await expect(p.locator(".editor-placeholder")).toHaveText("Cogito, ergo sum.");

    await documentEditor.click();
    await documentEditor.type("Test text");
    // Placeholder widgets contribute text, so the editor is not exactly this.
    await expect(documentEditor).toContainText("Test text");

    await documentEditor.press("Shift+ArrowLeft");

    const toolbar = page.locator(".editor-toolbar");
    await expect(toolbar).toBeVisible();

    const toolbarActions = page.locator(".editor-form-actions li");
    // A count grows as buttons are added; assert the toolbar is populated.
    expect(await toolbarActions.count()).toBeGreaterThanOrEqual(19);
    await expect(page.locator(".editor-toolbar #editor-button-strong")).toBeVisible();
    await expect(page.locator(".editor-toolbar #editor-button-em")).toBeVisible();
  });
});
