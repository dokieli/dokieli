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
import { select } from "./utils";

let selectedText;

test.describe("author mode", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("load");

    // Toggle author mode
    await page.locator("#document-menu button").click();
    const menu = page.locator("[id=document-menu]");
    await expect(menu).toBeVisible();
    const editButton = page.locator(".editor-enable");
    await editButton.click();

    // Wait for document to be editable
    const documentEditor = page.locator(".ProseMirror");
    await expect(documentEditor).toHaveAttribute("contenteditable", "true");

    await select(page, "#summary");

    // Store the selected text globally
    selectedText = await page.evaluate(() => {
      const selection = window.getSelection();
      return selection ? selection.toString() : "";
    });
  });

  test("toolbar formatting commands work as expected", async ({
    page,
  }) => {
    const commands = [
      { label: "h1", tag: "h1" },
      { label: "h2", tag: "h2" },
      { label: "h3", tag: "h3" },
      { label: "h4", tag: "h4" },
      { label: "em", tag: "em" },
      { label: "strong", tag: "strong" },
      { label: "pre", tag: "pre" },
      { label: "code", tag: "code" },
    ];

    const editor = page.locator(".ProseMirror");

    for (const { label, tag } of commands) {
      await page.click(`.editor-toolbar [id="editor-button-${label}"]`);

      const wrappedText = editor.locator(`${tag}:has-text("${selectedText}")`);
      await wrappedText.first().waitFor({ state: "visible", timeout: 3000 });

      await expect(wrappedText.first()).toBeVisible();

      // toggle back with button
      await page.click(`.editor-toolbar [id="editor-button-${label}"]`);

      const restoredText = editor.locator(`text=${selectedText}`);

      // Wait for the element to return to its original state (allow DOM update)
      await restoredText.first().waitFor({ state: "visible", timeout: 3000 });

      // Ensure the text is restored
      await expect(restoredText.first()).toBeVisible();
    }
  });
});
