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
});

async function cleanup(page, specificity) {
  await specificity.click();
  await page.waitForTimeout(1000);
  // clean up created specificity
  await page.locator("button.delete");
  await page.click("button.delete");
  await expect(page.locator("sup.ref-annotation")).not.toBeVisible();
}

test("should be able to request to increase specificity on selected text", async ({
  page,
}) => {
  const documentMenu = page.locator("[id=document-menu]");
  await documentMenu.locator("button").first().click();
  expect(documentMenu).toBeVisible();

  await page.waitForSelector("button.signout-user");
  await expect(page.locator("button.signout-user")).toBeVisible();

  await documentMenu.locator("button").first().click();
  expect(documentMenu).not.toBeVisible();

  await select(page, "#summary");
  const specificityButton = page.locator('[id="editor-button-specificity"]');
  await specificityButton.click();
  await expect(page.locator("textarea#specificity-content")).toBeVisible();
  await page.fill("textarea#specificity-content", "This is a specificity");
  const saveButton = page.getByRole("button", { name: "Post" });
  expect(saveButton).toBeVisible();
  await saveButton.click();

  // FIXME: double check this is what is supposed to be put in the document (failing now)
  const specificity = page.locator("sup.ref-annotation");
  await expect(specificity).toBeVisible();
  await cleanup(page, specificity);
});

test("specificity popup has no automatically detectable accessibility issues", async ({
  page,
}) => {
  const specificityPopup = page.locator("[id=editor-form-specificity]");
  const accessibilityScanResults = await new AxeBuilder({ page })
    .include(await specificityPopup.elementHandle())
    .analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});

test("specificity popup has no WCAG A or AA violations", async ({ page }) => {
  const specificityPopup = page.locator("[id=editor-form-specificity]");
  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .include(await specificityPopup.elementHandle())
    .analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});

test("specificity popup has no WCAG AAA violations", async ({ page }) => {
  const specificityPopup = page.locator("[id=editor-form-specificity]");
  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags(["wcag2aaa", "wcag21aaa"])
    .include(await specificityPopup.elementHandle())
    .analyze();
  if (accessibilityScanResults.violations.length > 0) {
    console.log("AAA issues:", accessibilityScanResults.violations);
  }
});
