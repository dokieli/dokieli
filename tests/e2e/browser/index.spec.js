import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("homepage should not have any automatically detectable accessibility issues", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("load");

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("homepage should not have any WCAG A or AA violations", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("load");

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});

test("homepage WCAG AAA violations", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("load");

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2aaa", "wcag21aaa"])
    .analyze();

  if (results.violations.length > 0) {
    console.warn("WCAG AAA issues:", results.violations);
  }
});
