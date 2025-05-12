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

test("should be able to add a citation with a URL", async ({ page }) => {
  const documentMenu = page.locator("[id=document-menu]");
  await documentMenu.locator("button").first().click();
  expect(documentMenu).toBeVisible();

  await page.waitForSelector("button.signout-user");
  await expect(page.locator("button.signout-user")).toBeVisible();
  const editButton = page.locator(".editor-enable");
  await editButton.click();

  await select(page, "#summary");
  const citationButton = page.locator('[id="editor-button-citation"]');
  await citationButton.click();
  await expect(page.locator("textarea#citation-content")).toBeVisible();
  await page.fill("textarea#citation-content", "This is a citation");
  const saveButton = page.getByRole("button", { name: "Save" });
  expect(saveButton).toBeVisible();
  await saveButton.click();

  const citation = page.locator("sup.ref-footnote");
  await expect(citation).toBeVisible();
});

test("citation popup has no automatically detectable accessibility issues", async ({
  page,
}) => {
  const citationPopup = page.locator("[id=editor-form-citation]");
  const accessibilityScanResults = await new AxeBuilder({ page })
    .include(await citationPopup.elementHandle())
    .analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});

test("citation popup has no WCAG A, AA, or AAA violations", async ({
  page,
}) => {
  const citationPopup = page.locator("[id=editor-form-citation]");
  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags([
      "wcag2a",
      "wcag2aa",
      "wcag2aaa",
      "wcag21a",
      "wcag21aa",
      "wcag21aaa",
    ])
    .include(await citationPopup.elementHandle())
    .analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});
