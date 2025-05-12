import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("load");

  await page.locator("#document-menu button").click();
  const menu = page.locator("[id=document-menu]");
  await expect(menu).toBeVisible();

  const graphButton = page.locator("[class=resource-visualise]");
  await graphButton.click();
  const graphModal = page.locator("[id=graph-view]");
  await expect(graphModal).toBeVisible();
});

test("graph loads", async ({ page }) => {
  const graphModal = page.locator("[id=graph-view]");
  const graphSvg = graphModal.locator('svg[typeof*="Image"]');
  await expect(graphSvg).toBeVisible();
});

test("graph modal has no automatically detectable accessibility issues", async ({ page }) => {
  const graphModal = page.locator("[id=graph-view]");
  const accessibilityScanResults = await new AxeBuilder({ page })
    .include(await graphModal.elementHandle())
    .analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});

test("graph modal has no WCAG A, AA, or AAA violations", async ({ page }) => {
  const graphModal = page.locator("[id=graph-view]");
  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags([
      "wcag2a",
      "wcag2aa",
      "wcag2aaa",
      "wcag21a",
      "wcag21aa",
      "wcag21aaa",
    ])
    .include(await graphModal.elementHandle())
    .analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});
