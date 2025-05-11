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

test("saveAs saves copy of document in selected storage location", async ({
  page,
}) => {
  const documentMenuButton = page.locator("#document-menu button");
  await expect(documentMenuButton).toBeVisible();
  await expect(page.locator("[id=document-menu]")).not.toBeVisible();

  await documentMenuButton.click();

  const menu = await page.locator("[id=document-menu]");
  await expect(menu).toBeVisible();

  await expect(page.locator(".close")).toBeVisible();

  await expect(page.locator("button.signout-user")).toBeVisible();

  const saveAsBtw = await page.locator("[class=resource-save-as]");
  await saveAsBtw.click();

  const saveAsModal = await page.locator("[id=save-as-document]");
  await expect(saveAsModal).toBeVisible();

  // input URL - for now hardcoded but need to :
  // 1. create new 'dokieli-tests' container if not exist
  // 2. run tests
  // 3. delete file and container (this could be a fixture which tests delete also)

  const urlInput = saveAsModal.locator('input[id="location-save-as-input"]');
  await urlInput.fill("https://virginia.solidcommunity.net/dokieli-tests/");
  await urlInput.press("Enter");
  await page.waitForTimeout(1000);

  const saveButton = saveAsModal.locator('button:has-text("Save")');
  await saveButton.click();
  await page.waitForTimeout(1000);

  const saveAsSuccess = await page.locator("text=Document saved");
  await expect(saveAsSuccess).toBeVisible();
});
