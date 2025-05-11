import { test, expect } from "./fixtures";
test.describe("auth flow", () => {
  test.beforeEach(async ({ auth, page }) => {
    await auth.login();
    await page.locator("#document-menu button").click();
  });

  test("signs in", async ({ page }) => {
    // Listen for console messages to make sure we are logged in - FIXME: not sure why this is still needed at this point
    page.on("console", async (msg) => {
      if (msg.text().includes(process.env.WEBID)) {
        await page.waitForSelector("#document-menu", { state: "visible" });
        await expect(page.locator("button.signout-user")).toBeVisible();
      }
    });
  });
  test("signs out", async ({ page }) => {
    // Listen for console messages to make sure we are logged in - FIXME: not sure why this is still needed at this point
    page.on("console", async (msg) => {
      if (msg.text().includes(process.env.WEBID)) {
        await page.waitForSelector("button.signout-user");
        await expect(page.locator("button.signout-user")).toBeVisible();
    
        await page.waitForTimeout(1000);
        await page.locator("button.signout-user").click();
    
        await page.waitForTimeout(1000);
        await page.waitForSelector("button.signin-user");
        await expect(page.locator("button.signin-user")).toBeVisible();
      }
    });
  });
});
