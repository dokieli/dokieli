import { test, expect } from "./fixtures";

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

test("notifications are displayed on side panel for authenticated user", async ({
  page,
}) => {
  const documentMenuButton = page.locator("#document-menu button");
  await expect(documentMenuButton).toBeVisible();
  await expect(page.locator("[id=document-menu]")).not.toBeVisible();

  await documentMenuButton.click();

  const menu = page.locator("[id=document-menu]");
  await expect(menu).toBeVisible();

  await expect(page.locator(".close")).toBeVisible();

  await expect(page.locator("button.signout-user")).toBeVisible();

  const notificationsBtn = page.locator("[class=resource-notifications]");
  await notificationsBtn.click();
  const notificationsPanel = page.locator("[id=document-notifications]");
  await expect(notificationsPanel).toBeVisible();
  await page.locator("text=Checking activities").waitFor({ state: "hidden" });
  const notifications = await page.locator("blockquote");
  // check if there are any notifications
  const notificationsCount = await notifications.count();
  expect(notificationsCount).toBeGreaterThan(0);
});

test("annotations are highlighted in the text", async ({ page }) => {
  const documentMenuButton = page.locator("#document-menu button");
  await expect(documentMenuButton).toBeVisible();
  await expect(page.locator("[id=document-menu]")).not.toBeVisible();

  await documentMenuButton.click();

  const menu = page.locator("[id=document-menu]");
  await expect(menu).toBeVisible();

  await expect(page.locator(".close")).toBeVisible();

  await expect(page.locator("button.signout-user")).toBeVisible();

  const notificationsBtn = page.locator("[class=resource-notifications]");
  await notificationsBtn.click();
  const notificationsPanel = page.locator("[id=document-notifications]");
  await expect(notificationsPanel).toBeVisible();
  await page.locator("text=Checking activities").waitFor({ state: "hidden" });
  const annotations = await page.locator("mark");
  const annotationsCount = await annotations.count();
  expect(annotationsCount).toBeGreaterThan(0);
});
