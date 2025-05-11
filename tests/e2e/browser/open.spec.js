import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("opens new document from URL", async ({ page }) => {
  await page.goto("/");

  await page.waitForLoadState("load");
  await expect(page.locator("[id=document-menu]")).not.toBeVisible();

  await page.locator("#document-menu button").click();
  const menu = page.locator("[id=document-menu]");
  await expect(menu).toBeVisible();
  await expect(page.locator(".close")).toBeVisible();

  const openBtn = page.locator("[class=resource-open]");
  await openBtn.click();
  const openModal = page.locator("[id=open-document]");
  await expect(openModal).toBeVisible();

  const urlInput = openModal.locator('input[id="location-open-document-input"]');
  await urlInput.fill(process.env.TEST_RESOURCE_URL);

  const openButton = openModal.locator('button:has-text("Open")');
  await openButton.click();

  const documentContent = page.locator('text="This is a test"');
  await expect(documentContent).toBeVisible();
});

test("opens new document from local file", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("[id=document-menu]")).not.toBeVisible();

  await page.locator("#document-menu button").click();
  const menu = page.locator("[id=document-menu]");
  await expect(menu).toBeVisible();
  await expect(page.locator(".close")).toBeVisible();

  const openBtw = page.locator("[class=resource-open]");
  await openBtw.click();
  const openModal = page.locator("[id=open-document]");
  await expect(openModal).toBeVisible();

  const fileInput = openModal.locator('input[type="file"]');
  await fileInput.setInputFiles("index.html");

  const openButton = openModal.locator('button:has-text("Open")');
  await openButton.click();

  const documentContent = page.locator('h1:has-text("dokieli")');
  await expect(documentContent).toBeVisible();
});


test("open modal should not have any automatically detectable WCAG A, AA, or AAA violations", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("[id=document-menu]")).not.toBeVisible();

  await page.locator("#document-menu button").click();
  const menu = page.locator("[id=document-menu]");
  await expect(menu).toBeVisible();
  await expect(page.locator(".close")).toBeVisible();

  const openBtw = page.locator("[class=resource-open]");
  await openBtw.click();
  const openModal = page.locator("[id=open-document]");
  await expect(openModal).toBeVisible();

  const accessibilityScanResults = await new AxeBuilder({ page })
    .include("#open-document")
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
