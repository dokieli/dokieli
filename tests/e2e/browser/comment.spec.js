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
  await page.locator("button.delete");
  await page.click("button.delete");
  await expect(page.locator("sup.ref-annotation")).not.toBeVisible();
}

test("should be able to comment a resource", async ({ page }) => {
  const documentMenu = page.locator("[id=document-menu]");
  await documentMenu.locator("button").first().click();
  expect(documentMenu).toBeVisible();

  await page.waitForSelector("button.signout-user");
  await expect(page.locator("button.signout-user")).toBeVisible();

  await documentMenu.locator("button").first().click();
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
  const results = await new AxeBuilder({ page })
    .include(await commentPopup.elementHandle())
    .analyze();
  expect(results.violations).toEqual([]);
});

test("comment popup has no WCAG A or AA violations", async ({ page }) => {
  const commentPopup = page.locator("[id=editor-form-comment]");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .include(await commentPopup.elementHandle())
    .analyze();
  expect(results.violations).toEqual([]);
});

test("comment popup has no WCAG AAA violations", async ({ page }) => {
  const commentPopup = page.locator("[id=editor-form-comment]");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2aaa", "wcag21aaa"])
    .include(await commentPopup.elementHandle())
    .analyze();
  if (results.violations.length > 0) {
    console.warn("AAA issues:", results.violations);
  }
});
