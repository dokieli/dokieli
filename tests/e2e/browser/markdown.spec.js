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

// Cache the script content so it's read once per worker, not once per test
const localScriptContent = fs.readFileSync(path.resolve("./scripts/dokieli.js"), "utf8");

test.describe("markdown mode toggle on new document", () => {
  test.describe.configure({ timeout: 30000 });

  test.beforeEach(async ({ page }) => {
    // Abort external CSS/font requests so they don't delay page load (registered first = lower priority)
    await page.route("https://dokie.li/**", async (route) => {
      await route.abort();
    });

    // Override the script with the local build (registered last = higher priority)
    await page.route("https://dokie.li/scripts/dokieli.js", async (route) => {
      await route.fulfill({
        contentType: "application/javascript",
        body: localScriptContent,
      });
    });

    await page.goto("/new");
    await page.waitForLoadState("domcontentloaded");
    // Wait for ProseMirror to be ready (auto-started on empty documents)
    await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 8000 });
  });

  test("W|MD toggle is visible in the author toolbar on a new document", async ({ page }) => {
    const toggle = page.locator("#editor-area-toggle");
    await expect(toggle).toBeVisible();

    const wysiwygBtn = toggle.locator(".mode-wysiwym");
    const mdBtn = toggle.locator(".mode-markdown");

    await expect(wysiwygBtn).toBeVisible();
    await expect(mdBtn).toBeVisible();

    // Initially in WYSIWYG mode
    await expect(wysiwygBtn).toHaveAttribute("aria-pressed", "true");
    await expect(mdBtn).toHaveAttribute("aria-pressed", "false");
  });

  test("clicking MD switches to markdown mode", async ({ page }) => {
    // Type some content first
    const editor = page.locator(".ProseMirror");
    await editor.click();
    const h1 = page.locator("h1");
    await h1.fill("My Title");
    await editor.press("Enter");
    await page.keyboard.type("Hello world");

    // Accept the confirm dialog
    page.once("dialog", (dialog) => dialog.accept());

    const mdBtn = page.locator("#editor-area-toggle .mode-markdown");
    await mdBtn.click();

    // Article should be in plaintext-only mode with markdown content
    const article = page.locator("article");
    await expect(article).toHaveAttribute("contenteditable", "plaintext-only");
    await expect(article).toHaveAttribute("data-markdown-mode", "true");

    // Content should contain markdown heading syntax
    const content = await article.textContent();
    expect(content).toContain("# My Title");
  });

  test("markdown content uses * for bullet lists", async ({ page }) => {
    const editor = page.locator(".ProseMirror");
    await editor.click();

    // Add a bullet list via toolbar
    await page.locator("#editor-button-ul").click();
    await page.keyboard.type("Item one");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Item two");

    page.once("dialog", (dialog) => dialog.accept());

    const mdBtn = page.locator("#editor-area-toggle .mode-markdown");
    await mdBtn.click();

    const article = page.locator("article");
    const content = await article.textContent();
    expect(content).toMatch(/\*\s+Item one/);
    expect(content).toMatch(/\*\s+Item two/);
  });

  test("stub toolbar shown in markdown mode has W|MD toggle with MD active", async ({ page }) => {
    page.once("dialog", (dialog) => dialog.accept());

    const mdBtn = page.locator("#editor-area-toggle .mode-markdown");
    await mdBtn.click();

    // document-editor toolbar should still be visible (in markdown mode)
    const stubToolbar = page.locator("#document-editor");
    await expect(stubToolbar).toBeVisible();

    // The toggle is in #editor-area-toggle (standalone, not inside #document-editor)
    const stubMd = page.locator("#editor-area-toggle .mode-markdown");
    const stubW = page.locator("#editor-area-toggle .mode-wysiwym");
    await expect(stubMd).toHaveAttribute("aria-pressed", "true");
    await expect(stubW).toHaveAttribute("aria-pressed", "false");
  });

  test("clicking W in stub toolbar returns to WYSIWYG mode", async ({ page }) => {
    // Enter markdown mode
    page.once("dialog", (dialog) => dialog.accept());
    const mdBtn = page.locator("#editor-area-toggle .mode-markdown");
    await mdBtn.click();

    const article = page.locator("article");
    await expect(article).toHaveAttribute("data-markdown-mode", "true");

    // Click W to return to visual editor
    const wBtn = page.locator("#editor-area-toggle .mode-wysiwym");
    await wBtn.click();

    // Should be back in PM author mode
    await expect(page.locator(".ProseMirror")).toBeVisible();
    await expect(page.locator(".ProseMirror")).toHaveAttribute("contenteditable", "true");

    // Article should no longer have markdown-mode attribute
    await expect(article).not.toHaveAttribute("data-markdown-mode");

    // W|MD toggle should still be visible with W active
    const toggle = page.locator("#editor-area-toggle");
    await expect(toggle).toBeVisible();
    await expect(toggle.locator(".mode-wysiwym")).toHaveAttribute("aria-pressed", "true");
  });

  test("content round-trips correctly through markdown and back", async ({ page }) => {
    // Type a heading and a paragraph
    const editor = page.locator(".ProseMirror");
    await editor.click();
    const h1 = page.locator("h1");
    await h1.fill("Round Trip Test");
    // Move to next block
    await page.keyboard.press("Enter");
    await page.keyboard.type("Some content here.");

    // Enter markdown mode
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#editor-area-toggle .mode-markdown").click();

    const article = page.locator("article");
    await expect(article).toHaveAttribute("data-markdown-mode", "true");

    // Return to WYSIWYG
    await page.locator("#editor-area-toggle .mode-wysiwym").click();

    await expect(page.locator(".ProseMirror")).toBeVisible();

    // The heading and paragraph content should survive the round-trip
    const heading = page.locator("h1");
    await expect(heading).toContainText("Round Trip Test");
    const para = page.locator("p");
    await expect(para.first()).toContainText("Some content here.");
  });

  test("empty document enters markdown mode without confirm dialog", async ({ page }) => {
    // Don't type anything — document is empty

    // Should switch without a confirm dialog (no dialog handler needed)
    const mdBtn = page.locator("#editor-area-toggle .mode-markdown");
    await mdBtn.click();

    const article = page.locator("article");
    await expect(article).toHaveAttribute("data-markdown-mode", "true");
  });
});
