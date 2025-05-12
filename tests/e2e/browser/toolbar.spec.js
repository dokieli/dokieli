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

  test("toolbar should not have any automatically detectable WCAG A, AA, or AAA violations", async ({
    page,
  }) => {
    // Analyze  toolbar element
    const accessibilityScanResults = await new AxeBuilder({ page })
      .include(".editor-toolbar")
      .withTags([
        "wcag2a",
        "wcag2aa",
        "wcag2aaa",
        "wcag21a",
        "wcag21aa",
        "wcag21aaa",
      ])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
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

      const title = await button.getAttribute("title");

      if (title?.toLowerCase() === "share") {
        // Skipping share because it has a different behavior
        continue;
      }

      await button.click();

      const formSelector = `#editor-form-${title}`;
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

      const title = await button.getAttribute("title");

      if (title?.toLowerCase() === "share") {
        // Skipping share because it has a different behavior
        continue;
      }

      await button.click();

      const formSelector = `#editor-form-${title}`;
      const form = page.locator(formSelector);

      await expect(form).toBeVisible();

      const accessibilityScanResults = await new AxeBuilder({ page })
        .include(formSelector)
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
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

    // Click and drag on text to select it
    const text = page.locator("#summary");
    const box = await text.boundingBox();

    await text.click();
    await page.mouse.down();
    await page.mouse.move(box.x + 30, box.y + box.height / 2);
    await page.mouse.up();

    // Wait for the toolbar to be visible
    const toolbar = page.locator(".editor-toolbar");
    await expect(toolbar).toBeVisible();
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

  test("toolbar popups should not have any automatically detectable accessibility issues", async ({
    page,
  }) => {
    const buttonsWithPopups = ["link", "q", "semantics"];
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
      await button.click();

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
    const buttonsWithPopups = ["link", "q", "semantics"];
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
      await button.click();

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
});
