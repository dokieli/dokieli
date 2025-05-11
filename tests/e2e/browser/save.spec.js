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
test("saves changes to existing documents", async ({ page }) => {
  await page.waitForLoadState("load");
  await expect(page.locator("[id=document-menu]")).not.toBeVisible();

  await page.locator("#document-menu > button").click();
  const menu = await page.locator("[id=document-menu]");
  await expect(menu).toBeVisible();
  await expect(page.locator(".close")).toBeVisible();

  const openBtn = page.locator("[class=resource-open]");
  await openBtn.click();
  const openModal = page.locator("[id=open-document]");
  await expect(openModal).toBeVisible();

  const urlInput = await openModal.locator(
    'input[id="location-open-document-input"]'
  );
  await urlInput.fill(
    "https://virginia.solidcommunity.net/bd443f2a-4e32-45c5-afca-ccd701b769e6"
  );

  const openButton = await openModal.locator('button:has-text("Open")');
  await openButton.click();

  const documentContent = page.locator('text="This is a test"');
  await expect(documentContent).toBeVisible();

  // Toggle author mode
  await page.locator("#document-menu button").click();
  await expect(menu).toBeVisible();
  const editButton = await page.locator(".editor-enable");
  await editButton.click();
  await page.waitForTimeout(2000);

  // input new text
  const documentInput = await page.locator("h1");
  await documentInput.fill("This is a test - edited");
  await documentInput.press("Enter");

  // save changes
  await page.locator("#document-menu > button").click();
  await page.waitForSelector("#document-menu", { state: "visible" });
  await expect(menu).toBeVisible();
  const saveBtn = page.locator("[class=resource-save]");
  await saveBtn.click();
  const saveSuccess = page.locator("text=Saved document to");
  await expect(saveSuccess).toBeVisible();

});
