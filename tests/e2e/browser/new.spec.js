import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import path from "path";
import fs from "fs";

test.describe("new page", () => {
  test.beforeEach(async ({ page }) => {
    {
    }
    await page.route("https://dokie.li/scripts/dokieli.js", async (route) => {
      const localScriptPath = path.resolve("./scripts/dokieli.js");
      const scriptContent = fs.readFileSync(localScriptPath, "utf8");
      await route.fulfill({
        contentType: "application/javascript",
        body: scriptContent,
      });
    });
  });
  test("new page should not have any automatically detectable accessibility issues", async ({
    page,
  }) => {
    await page.goto("/new");

    await page.waitForLoadState("load");

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("new page should not have any automatically detectable WCAG A, AA, or AAA violations", async ({
    page,
  }) => {
    await page.goto("/new");

    await page.waitForLoadState("load");

    const accessibilityScanResults = await new AxeBuilder({ page })
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

  test("initializes a new document in author mode when navigating to /new", async ({
    page,
  }) => {
    await page.goto("/new");

    // Check if initial elements are visible and contain the correct attributes
    const h1 = page.locator("h1");
    await expect(h1).toBeVisible();
    await expect(h1).toHaveAttribute("data-placeholder", "Title");
    const p = page.locator("p");
    await expect(p).toHaveAttribute("data-placeholder", "Cogito, ergo sum.");

    // Check that placeholder text is visible on screen

    const isVisible = async (element) => {
      return element.evaluate((el) => {
        const style = window.getComputedStyle(el, "::after");
        return style.visibility !== "hidden" && style.content !== "none";
      });
    };

    const getPlaceholderText = async (element) => {
      return element.evaluate((el) => el.getAttribute("data-placeholder"));
    };

    expect(await isVisible(h1)).toBe(true);
    expect(await getPlaceholderText(h1)).toContain("Title");

    expect(await isVisible(p)).toBe(true);
    expect(await getPlaceholderText(p)).toContain("Cogito, ergo sum.");

    // Check if the document is editable
    const documentEditor = page.locator(".do-new.ProseMirror");
    await expect(documentEditor).toHaveAttribute("contenteditable", "true");

    // Input some text
    await h1.click();
    await h1.fill("Test text");
    await h1.focus();

    // Click and drag on text to select it
    const text = h1;
    const box = await text.boundingBox();

    await text.click();
    await page.mouse.down();
    await page.mouse.move(box.x + 30, box.y + box.height / 2);
    await page.mouse.up();

    // Check if the toolbar is visible with the author mode functionality
    const toolbar = page.locator(".editor-toolbar");
    await expect(toolbar).toBeVisible();

    const toolbarActions = page.locator(".editor-form-actions li");
    await expect(toolbarActions).toHaveCount(18);
    const strongButton = page.locator(".editor-toolbar #editor-button-strong");
    await expect(strongButton).toBeVisible();
    const emButton = page.locator(".editor-toolbar #editor-button-em");
    await expect(emButton).toBeVisible();
  });
});

test.describe("via new button", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("load");
    await page.locator("#document-menu button").click();
    const menu = page.locator("[id=document-menu]");
    await expect(menu).toBeVisible();
    await expect(page.locator(".close")).toBeVisible();

    const newBtn = page.locator("[class=resource-new]");
    await newBtn.click();
  });

  test("new page should not have any automatically detectable accessibility issues", async ({
    page,
  }) => {
    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("new page should not have any automatically detectable WCAG A or AA violations", async ({
    page,
  }) => {
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("initializes a new document in author mode", async ({ page }) => {
    // Check if initial elements are visible and contain the correct attributes
    const documentEditor = page.locator(".do-new.ProseMirror");
    await expect(documentEditor).toHaveAttribute("contenteditable", "true");
    const h1 = page.locator("h1");
    await expect(h1).toBeVisible();
    await expect(h1).toHaveAttribute("data-placeholder", "Title");
    const p = page.locator("p");
    await expect(p).toHaveAttribute("data-placeholder", "Cogito, ergo sum.");

    // Check that placeholder text is visible on screen

    const isVisible = async (element) => {
      return element.evaluate((el) => {
        const style = window.getComputedStyle(el, "::after");
        return style.visibility !== "hidden" && style.content !== "none";
      });
    };

    const getPlaceholderText = async (element) => {
      return element.evaluate((el) => el.getAttribute("data-placeholder"));
    };

    expect(await isVisible(h1)).toBe(true);
    expect(await getPlaceholderText(h1)).toContain("Title");

    expect(await isVisible(p)).toBe(true);
    expect(await getPlaceholderText(p)).toContain("Cogito, ergo sum.");

    // Check if toolbar is visible with the author mode functionality

    // Input some text
    await documentEditor.click();
    await documentEditor.type("Test text");
    await expect(documentEditor).toHaveText("Test text");

    // Select the text "Test text" using keyboard shortcuts
    await documentEditor.press("Shift+ArrowLeft"); // Select the last character

    // Check if the toolbar is visible with the author mode functionality
    const toolbar = page.locator(".editor-toolbar");
    await expect(toolbar).toBeVisible();

    const toolbarActions = page.locator(".editor-form-actions li");
    await expect(toolbarActions).toHaveCount(18);
    const strongButton = page.locator(".editor-toolbar #editor-button-strong");
    await expect(strongButton).toBeVisible();
    const emButton = page.locator(".editor-toolbar #editor-button-em");
    await expect(emButton).toBeVisible();
  });
});
