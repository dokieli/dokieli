import { test, expect } from "./fixtures";

test.beforeEach(async ({ auth, page }) => {
  await auth.login();
  await page.waitForLoadState("load");

  // Wait until console shows we're logged in
  await new Promise((resolve) => {
    page.on("console", (msg) => {
      if (msg.text().includes(process.env.WEBID)) {
        resolve();
      }
    });
  });
});

test("saveAs saves copy of document in selected storage location", async ({ page }) => {
  const documentMenuButton = page.locator("#document-menu > button");
  await expect(documentMenuButton).toBeVisible();
  await expect(page.locator("[id=document-menu]")).not.toBeVisible();

  await documentMenuButton.click();
  await expect(page.locator("[id=document-menu]")).toBeVisible();
  await expect(page.locator(".close")).toBeVisible();
  await expect(page.locator("button.signout-user")).toBeVisible();

  const saveAsBtn = page.locator("[class=resource-save-as]");
  await saveAsBtn.click();

  const saveAsModal = page.locator("[id=save-as-document]");
  await expect(saveAsModal).toBeVisible();
  await page.waitForTimeout(1000);

  const saveButton = saveAsModal.locator('button:has-text("Save")');
  await saveButton.click();
  const saveAsSuccess = page.locator("text=Document saved");
  await expect(saveAsSuccess).toBeVisible();

  // TODO: cleanup
});
