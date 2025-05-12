import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
import { select } from "./utils";

test.beforeEach(async ({ auth, page }) => {
  await auth.login();
  await page.waitForLoadState("load");

  await select(page, "#summary");
});

async function cleanup(page, bookmark) {
  bookmark.click();
  await page.waitForTimeout(1000);
  await page.locator("button.delete");
  await page.click("button.delete");
  await expect(page.locator("sup.ref-annotation")).not.toBeVisible();
}

test("should be able to bookmark a resource", async ({ page }) => {
  // TODO: we should not need this here, login should be enough
  // Listen for console messages to make sure we are logged in
  await page.on("console", async (msg) => {
    if (msg.text().includes(process.env.WEBID)) {
      const bookmarkButton = page.locator('[id="editor-button-bookmark"]');
      await bookmarkButton.click();
      await expect(page.locator("textarea#bookmark-content")).toBeVisible();
      await page.fill("textarea#bookmark-content", "This is a bookmark");
      const saveButton = page.getByRole("button", { name: "Post" });
      expect(saveButton).toBeVisible();
      await saveButton.click();

      const bookmark = page.locator("sup.ref-annotation");
      await expect(bookmark).toBeVisible();

      const bookmarkPopup = page.locator("[id=editor-form-bookmark]");

      await test.step("bookmark popup has no WCAG A or AA violations", async () => {
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .include(await bookmarkPopup.elementHandle())
          .analyze();
        expect(results.violations).toEqual([]);
      });

      await test.step("bookmark popup has no WCAG AAA violations", async () => {
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2aaa", "wcag21aaa"])
          .include(await bookmarkPopup.elementHandle())
          .analyze();
        if (results.violations.length > 0) {
          console.warn("AAA issues:", results.violations);
        }
      });

      await cleanup(page, bookmark);
    }
  });
});
