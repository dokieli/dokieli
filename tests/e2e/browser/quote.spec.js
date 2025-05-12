import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
import { select } from "./utils";

test.beforeEach(async ({ auth, page }) => {
  await auth.login();
  await page.waitForLoadState("load");

  // FIXME: This is needed to make sure we're effectively finished logging in, it should not be necessary.
  await new Promise((resolve) => {
    page.on("console", (msg) => {
      if (msg.text().includes(process.env.WEBID)) {
        resolve();
      }
    });
  });
  const documentMenu = page.locator("[id=document-menu]");
  await documentMenu.locator("button").first().click();
  expect(documentMenu).toBeVisible();

  await page.waitForSelector("button.signout-user");
  await expect(page.locator("button.signout-user")).toBeVisible();
  const editButton = page.locator(".editor-enable");
  await editButton.click();

  await select(page, "#summary");
  const qButton = page.locator('[id="editor-button-q"]');
  await qButton.click();
});

test("should be able to add a quote with a URL", async ({ page }) => {
  await expect(page.locator("#editor-form-q")).toBeVisible();
  await page.locator('#q-cite').fill('https://example.org');
  const saveButton = page.getByRole("button", { name: "Save" });
  expect(saveButton).toBeVisible();
  await saveButton.click();

  // expect the quote to be visible
  const quote = page.locator("q");
  await expect(quote).toBeVisible();
  expect(quote).toHaveAttribute("cite", "https://example.org");
});

test("quote popup has no automatically detectable accessibility issues", async ({
  page,
}) => {
  const qPopup = page.locator("[id=editor-form-q]");
  const accessibilityScanResults = await new AxeBuilder({ page })
    .include(await qPopup.elementHandle())
    .analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});

test("quote popup has no WCAG A or AA violations", async ({
  page,
}) => {
  const qPopup = page.locator("[id=editor-form-q]");
  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags([
      "wcag2a",
      "wcag2aa",
      "wcag21a",
      "wcag21aa",
    ])
    .include(await qPopup.elementHandle())
    .analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});


test("quote popup has no WCAG AAA violations", async ({
  page,
}) => {
  const qPopup = page.locator("[id=editor-form-q]");
  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags([
      "wcag2aaa",
      "wcag21aaa",
    ])
    .include(await qPopup.elementHandle())
    .analyze();
  if (accessibilityScanResults.violations.length > 0) {
    console.warn("AAA issues:", accessibilityScanResults.violations);
  }
});
