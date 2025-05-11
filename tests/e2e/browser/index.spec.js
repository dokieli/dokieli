import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("homepage should not have any automatically detectable accessibility issues", async ({
  page,
}) => {
  await page.goto("/");

  await page.waitForLoadState("load");

  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();

  expect(accessibilityScanResults.violations).toEqual([]);
});

test("homepage should not have any automatically detectable WCAG A, AA, or AAA violations", async ({
  page,
}) => {
  await page.goto("/");

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
