import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("graph loads and passes accessibility checks", async ({ page }) => {
  let graphModal;

  await test.step("load graph", async () => {
    await page.goto("/");
    await page.waitForLoadState("load");

    await page.locator("#document-menu button").click();
    const menu = page.locator("[id=document-menu]");
    await expect(menu).toBeVisible();

    const graphButton = page.locator("[class=resource-visualise]");
    await graphButton.click();
    graphModal = page.locator("[id=graph-view]");
    await expect(graphModal).toBeVisible();
    const graphSvg = graphModal.locator('svg[typeof*="Image"]');
    await expect(graphSvg).toBeVisible();
  });

  await test.step("graph modal has no automatically detectable accessibility issues", async () => {
    const accessibilityScanResults = await new AxeBuilder({ page })
      .include(await graphModal.elementHandle())
      .analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  await test.step("graph modal has no WCAG A or AA violations", async () => {
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .include(await graphModal.elementHandle()) 
      .analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  await test.step("close graph modal", async () => {
    const closeButton = graphModal.locator(".close");
    await closeButton.click();
    await expect(graphModal).not.toBeVisible();
  });
});
