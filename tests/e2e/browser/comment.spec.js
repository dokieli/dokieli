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

async function cleanup(page, comment) {
  await comment.click();
  await page.waitForTimeout(1000);
  // clean up created comment
  await page.locator("button.delete");
  await page.click("button.delete");
  await expect(page.locator("sup.ref-annotation")).not.toBeVisible();
}

test("should be able to comment a resource", async ({ page }) => {
  const documentMenu = page.locator("[id=document-menu]");
  await documentMenu.locator('button').first().click();
  expect(documentMenu).toBeVisible();

  await page.waitForSelector("button.signout-user");
  await expect(page.locator("button.signout-user")).toBeVisible();
  
  await documentMenu.locator('button').first().click();
  expect(documentMenu).not.toBeVisible();

  await select(page, "#summary");
  const commentButton = page.locator('[id="editor-button-comment"]');
  await commentButton.click();
  await expect(page.locator("textarea#comment-content")).toBeVisible();
  await page.fill("textarea#comment-content", "This is a comment");
  const saveButton = page.getByRole("button", { name: "Post" });
  expect(saveButton).toBeVisible();
  await saveButton.click();

  const comment = page.locator("sup.ref-annotation");
  await expect(comment).toBeVisible();
  await cleanup(page, comment);
});

test("comment popup has no automatically detectable accessibility issues", async ({
  page,
}) => {
  const commentPopup = page.locator("[id=editor-form-comment]");
  const accessibilityScanResults = await new AxeBuilder({ page })
    .include(await commentPopup.elementHandle())
    .analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});

test("comment popup has no WCAG A, AA, or AAA violations", async ({
  page,
}) => {
  const commentPopup = page.locator("[id=editor-form-comment]");
  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags([
      "wcag2a",
      "wcag2aa",
      "wcag2aaa",
      "wcag21a",
      "wcag21aa",
      "wcag21aaa",
    ])
    .include(await commentPopup.elementHandle())
    .analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});
