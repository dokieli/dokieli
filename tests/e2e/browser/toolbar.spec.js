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
import { select } from "./utils";

test.describe("social mode", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("load");

    // Click and drag on text to select it
    await select(page, "#summary");
  });

  test("toolbar should not have any automatically detectable accessibility issues", async ({
    page,
  }) => {
    // Analyze  toolbar element
    const accessibilityScanResults = await new AxeBuilder({ page })
      .include(".editor-toolbar")
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("toolbar should not have any automatically detectable WCAG A and AA violations", async ({
    page,
  }) => {
    // Analyze  toolbar element
    const accessibilityScanResults = await new AxeBuilder({ page })
      .include(".editor-toolbar")
      .withTags([
        "wcag2a",
        "wcag2aa",
        "wcag21a",
        "wcag21aa",
      ])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("toolbar should not have any automatically detectable WCAG AAA violations", async ({
    page,
  }) => {
    // Analyze  toolbar element
    const accessibilityScanResults = await new AxeBuilder({ page })
      .include(".editor-toolbar")
      .withTags([
        "wcag2aaa",
        "wcag21aaa",
      ])
      .analyze();

    if (accessibilityScanResults.violations.length > 0) {
      console.log("AAA issues:", accessibilityScanResults.violations);
    }
  });

  test("toolbar popups should not have any automatically detectable accessibility issues", async ({
    page,
  }) => {
    const buttons = page.locator("ul.editor-form-actions button");
    const count = await buttons.count();

    // TODO: this forced me to increase timeout - find a better way
    for (let i = 0; i < count; i++) {
      const button = buttons.nth(i);
      const signInPopup = page.locator("#user-identity-input");
      const signInPopupVisible = await signInPopup.isVisible();

      // workaround for sign in popup blocking clicks but we actually need to postpone that popup
      if (signInPopupVisible) {
        const closeButton = page.locator(".close");
        await closeButton.click();
      }

      const id = await button.getAttribute("id") || "";
      const buttonName = id.startsWith("editor-button-") ? id.slice("editor-button-".length) : null;

      // Skip dropdown triggers, mode toggle, and any other non-action buttons
      if (!buttonName) continue;

      if (buttonName === "share") {
        // Skipping share because it has a different behavior
        continue;
      }

      // Use evaluate to click — some buttons (e.g. specificity) are hidden submenu items
      await page.evaluate((id) => document.getElementById(id)?.click(), `editor-button-${buttonName}`);

      const formSelector = `#editor-form-${buttonName}`;
      const form = page.locator(formSelector);

      await expect(form).toBeVisible();

      const accessibilityScanResults = await new AxeBuilder({ page })
        .include(formSelector)
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    }
  });

  test("toolbar popups should not have any automatically detectable WCAG A or AA violations", async ({
    page,
  }) => {
    const buttons = page.locator("ul.editor-form-actions button");
    const count = await buttons.count();

    // TODO: this forced me to increase timeout - find a better way
    for (let i = 0; i < count; i++) {
      const button = buttons.nth(i);
      const signInPopup = page.locator("#user-identity-input");
      const signInPopupVisible = await signInPopup.isVisible();

      // workaround for sign in popup blocking clicks but we actually need to postpone that popup
      if (signInPopupVisible) {
        const closeButton = page.locator(".close");
        await closeButton.click();
      }

      const id = await button.getAttribute("id") || "";
      const buttonName = id.startsWith("editor-button-") ? id.slice("editor-button-".length) : null;

      // Skip dropdown triggers, mode toggle, and any other non-action buttons
      if (!buttonName) continue;

      if (buttonName === "share") {
        // Skipping share because it has a different behavior
        continue;
      }

      // Use evaluate to click — some buttons (e.g. specificity) are hidden submenu items
      await page.evaluate((id) => document.getElementById(id)?.click(), `editor-button-${buttonName}`);

      const formSelector = `#editor-form-${buttonName}`;
      const form = page.locator(formSelector);

      await expect(form).toBeVisible();

      const accessibilityScanResults = await new AxeBuilder({ page })
        .include(formSelector)
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    }
  });

  test("toolbar popups should not have any automatically detectable WCAG AAA violations", async ({
    page,
  }) => {
    const buttons = page.locator("ul.editor-form-actions button");
    const count = await buttons.count();

    // TODO: this forced me to increase timeout - find a better way
    for (let i = 0; i < count; i++) {
      const button = buttons.nth(i);
      const signInPopup = page.locator("#user-identity-input");
      const signInPopupVisible = await signInPopup.isVisible();

      // workaround for sign in popup blocking clicks but we actually need to postpone that popup
      if (signInPopupVisible) {
        const closeButton = page.locator(".close");
        await closeButton.click();
      }

      const id = await button.getAttribute("id") || "";
      const buttonName = id.startsWith("editor-button-") ? id.slice("editor-button-".length) : null;

      // Skip dropdown triggers, mode toggle, and any other non-action buttons
      if (!buttonName) continue;

      if (buttonName === "share") {
        // Skipping share because it has a different behavior
        continue;
      }

      // Use evaluate to click — some buttons (e.g. specificity) are hidden submenu items
      await page.evaluate((id) => document.getElementById(id)?.click(), `editor-button-${buttonName}`);

      const formSelector = `#editor-form-${buttonName}`;
      const form = page.locator(formSelector);

      await expect(form).toBeVisible();

      const accessibilityScanResults = await new AxeBuilder({ page })
        .include(formSelector)
        .withTags(["wcag2aaa", "wcag21aaa"])
        .analyze();

      if (
        accessibilityScanResults.violations.length > 0
      ) {
        console.log("AAA issues:", accessibilityScanResults.violations);
      }
    }
  });
});

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
  });

  test("toolbar should not have any automatically detectable accessibility issues", async ({
    page,
  }) => {
    // Analyze the toolbar element
    const accessibilityScanResults = await new AxeBuilder({ page })
      .include(".editor-toolbar")
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("toolbar should not have any automatically detectable  WCAG A or AA violations", async ({
    page,
  }) => {
    // Analyze  toolbar element
    const accessibilityScanResults = await new AxeBuilder({ page })
      .include(".editor-toolbar")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("toolbar should not have any automatically detectable  WCAG AAA violations", async ({
    page,
  }) => {
    // Analyze  toolbar element
    const accessibilityScanResults = await new AxeBuilder({ page })
      .include(".editor-toolbar")
      .withTags(["wcag2aaa", "wcag21aaa"])
      .analyze();

    if (accessibilityScanResults.violations.length > 0) {
      console.log("AAA issues:", accessibilityScanResults.violations);
    }
  });

  test("toolbar popups should not have any automatically detectable accessibility issues", async ({
    page,
  }) => {
    const buttonsWithPopups = ["a", "q", "semantics"];
    const buttons = page.locator("ul.editor-form-actions button");
    const count = await buttons.count();

    // TODO: this forced me to increase timeout - find a better way
    for (let i = 0; i < count; i++) {
      const button = buttons.nth(i);

      const id = await button.getAttribute("id");
      const buttonName = id?.split("editor-button-")[1];
      const signInPopup = page.locator("#user-identity-input");
      const signInPopupVisible = await signInPopup.isVisible();

      // workaround for sign in popup blocking clicks but we actually need to postpone that popup
      if (signInPopupVisible) {
        const closeButton = page.locator(".close");
        await closeButton.click();
      }

      if (!buttonName || !buttonsWithPopups.includes(buttonName)) {
        continue; // skip buttons that do not have popups
      }
      // Use evaluate to click — q and semantics are hidden submenu items
      await page.evaluate((id) => document.getElementById(id)?.click(), `editor-button-${buttonName}`);

      const formSelector = `#editor-form-${buttonName}`;
      const form = page.locator(formSelector);

      await expect(form).toBeVisible();

      const accessibilityScanResults = await new AxeBuilder({ page })
        .include(formSelector)
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    }
  });

  test("toolbar popups should not have any automatically detectable WCAG A or AA violations", async ({
    page,
  }) => {
    const buttonsWithPopups = ["a", "q", "semantics"];
    const buttons = page.locator("ul.editor-form-actions button");
    const count = await buttons.count();

    // TODO: this forced me to increase timeout - find a better way
    for (let i = 0; i < count; i++) {
      const button = buttons.nth(i);

      const id = await button.getAttribute("id");
      const buttonName = id?.split("editor-button-")[1];

      if (!buttonName || !buttonsWithPopups.includes(buttonName)) {
        continue; // skip buttons that do not have popups
      }
      // Use evaluate to click — q and semantics are hidden submenu items
      await page.evaluate((id) => document.getElementById(id)?.click(), `editor-button-${buttonName}`);

      const formSelector = `#editor-form-${buttonName}`;
      const form = page.locator(formSelector);

      await expect(form).toBeVisible();

      const accessibilityScanResults = await new AxeBuilder({ page })
        .include(formSelector)
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    }
  });

  test("toolbar popups should not have any automatically detectable WCAG AAA violations", async ({
    page,
  }) => {
    const buttonsWithPopups = ["a", "q", "semantics"];
    const buttons = page.locator("ul.editor-form-actions button");
    const count = await buttons.count();

    // TODO: this forced me to increase timeout - find a better way
    for (let i = 0; i < count; i++) {
      const button = buttons.nth(i);

      const id = await button.getAttribute("id");
      const buttonName = id?.split("editor-button-")[1];

      if (!buttonName || !buttonsWithPopups.includes(buttonName)) {
        continue; // skip buttons that do not have popups
      }
      // Use evaluate to click — q and semantics are hidden submenu items
      await page.evaluate((id) => document.getElementById(id)?.click(), `editor-button-${buttonName}`);

      const formSelector = `#editor-form-${buttonName}`;
      const form = page.locator(formSelector);

      await expect(form).toBeVisible();

      const accessibilityScanResults = await new AxeBuilder({ page })
        .include(formSelector)
        .withTags(["wcag2aa", "wcag21aaa"])
        .analyze();

      if (
        accessibilityScanResults.violations.length > 0
      ) {
        console.log("AAA issues:", accessibilityScanResults.violations);
      }
    }
  });
});

test.describe("layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("load");
    await select(page, "#summary");
  });

  test("mode toggle is a labelled button in the bar, not a sheet item", async ({ page }) => {
    const toggle = page.locator(".editor-toolbar li.editor-mode-toggle button");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveText("Switch to Edit");

    await page.locator("#editor-dropdown-trigger-more").click();
    await expect(page.locator("#editor-dropdown-panel-more")).toBeVisible();
    await expect(page.locator("#editor-dropdown-panel-more .editor-dropdown-item", { hasText: "Switch to Edit" })).toHaveCount(0);
  });

  test("dropdown trigger exposes menu state through ARIA", async ({ page }) => {
    const trigger = page.locator("#editor-dropdown-trigger-more");
    await expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    await expect(trigger).toHaveAttribute("aria-controls", "editor-dropdown-panel-more");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#editor-dropdown-panel-more")).toBeVisible();

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#editor-dropdown-panel-more")).not.toBeVisible();
  });

  test("toolbar floats next to the selection on a wide viewport", async ({ page }) => {
    const viewport = page.viewportSize();
    const box = await page.locator(".editor-toolbar").boundingBox();
    expect(box.width).toBeLessThan(viewport.width);
    expect(box.y + box.height).toBeLessThan(viewport.height - 1);
  });

  test("narrowing the window switches to the pinned layout and back", async ({ page }) => {
    await page.setViewportSize({ width: 500, height: 800 });
    await expect(page.locator(".editor-toolbar li.editor-mode-toggle")).toHaveCount(0);
    const pinned = await page.locator(".editor-toolbar").boundingBox();
    expect(pinned.x).toBe(0);
    expect(pinned.width).toBe(500);
    expect(Math.abs(pinned.y + pinned.height - 800)).toBeLessThanOrEqual(1);

    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.locator(".editor-toolbar li.editor-mode-toggle")).toHaveCount(1);
    const floating = await page.locator(".editor-toolbar").boundingBox();
    expect(floating.width).toBeLessThan(1280);
  });
});

test.describe("dark theme", () => {
  test.use({ colorScheme: "dark" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("load");
    await select(page, "#summary");
  });

  test("toolbar and dropdown have a visible border", async ({ page }) => {
    const shadow = await page.locator(".editor-toolbar").evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow).toContain("rgb(74, 74, 74)");

    await page.locator("#editor-dropdown-trigger-more").click();
    const border = await page.locator("#editor-dropdown-panel-more").evaluate((el) => getComputedStyle(el).borderTopColor);
    expect(border).toBe("rgb(74, 74, 74)");
  });

  test("toolbar has no WCAG A or AA violations", async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .include(".editor-toolbar")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
