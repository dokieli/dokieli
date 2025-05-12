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
    await page.goto("/new");

    const h1 = page.locator("h1");
    await expect(h1).toBeVisible();
    await expect(h1).toHaveAttribute("data-placeholder", "Title");

    const p = page.locator("p");
    await expect(p).toHaveAttribute("data-placeholder", "Cogito, ergo sum.");

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

    const documentEditor = page.locator(".do-new.ProseMirror");
    await expect(documentEditor).toHaveAttribute("contenteditable", "true");

    await h1.click();
    await h1.fill("Test text");
    await h1.focus();

    const text = h1;
    const box = await text.boundingBox();
    await text.click();
    await page.mouse.down();
    await page.mouse.move(box.x + 30, box.y + box.height / 2);
    await page.mouse.up();

    const toolbar = page.locator(".editor-toolbar");
    await expect(toolbar).toBeVisible();
    const toolbarActions = page.locator(".editor-form-actions li");
    await expect(toolbarActions).toHaveCount(18);
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
    await expect(page.locator(".close")).toBeVisible();
    await page.locator("[class=resource-new]").click();
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
    await expect(h1).toHaveAttribute("data-placeholder", "Title");

    const p = page.locator("p");
    await expect(p).toHaveAttribute("data-placeholder", "Cogito, ergo sum.");

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

    await documentEditor.click();
    await documentEditor.type("Test text");
    await expect(documentEditor).toHaveText("Test text");

    await documentEditor.press("Shift+ArrowLeft");

    const toolbar = page.locator(".editor-toolbar");
    await expect(toolbar).toBeVisible();

    const toolbarActions = page.locator(".editor-form-actions li");
    await expect(toolbarActions).toHaveCount(18);
    await expect(page.locator(".editor-toolbar #editor-button-strong")).toBeVisible();
    await expect(page.locator(".editor-toolbar #editor-button-em")).toBeVisible();
  });
});
