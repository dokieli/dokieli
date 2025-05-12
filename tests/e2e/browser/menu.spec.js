import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("menu should not have any automatically detectable accessibility issues", async ({ page }) => {
  await openMenu(page);

  const results = await new AxeBuilder({ page })
    .include("#document-menu")
    .analyze();

  expect(results.violations).toEqual([]);
});

test("menu should not have any WCAG A or AA violations", async ({ page }) => {
  await openMenu(page);

  const results = await new AxeBuilder({ page })
    .include("#document-menu")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});

test("menu WCAG AAA violations", async ({ page }) => {
  await openMenu(page);

  const results = await new AxeBuilder({ page })
    .include("#document-menu")
    .withTags(["wcag2aaa", "wcag21aaa"])
    .analyze();

  if (results.violations.length > 0) {
    console.warn("WCAG AAA issues:", results.violations);
  }
});


test("clicking on the menu button displays menu", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("load");
  await expect(page.locator("[id=document-menu]")).not.toBeVisible();

  await page.locator("#document-menu button").click();
  const menu = page.locator("[id=document-menu]");
  await expect(menu).toBeVisible();
});

test("clicking on the sign in button displays sign in modal", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await expect(page.locator("[id=document-menu]")).not.toBeVisible();

  await page.locator("#document-menu button").click();
  const menu = page.locator("[id=document-menu]");
  await expect(menu).toBeVisible();
  await expect(page.locator(".close")).toBeVisible();
  const signinbtn = page.locator("[class=signin-user]");
  await signinbtn.click();
  const signinmodal = page.locator("[id=user-identity-input]");
  await expect(signinmodal).toBeVisible();
});

test("clicking on the reply button displays reply modal", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await expect(page.locator("[id=document-menu]")).not.toBeVisible();

  await page.locator("#document-menu button").click();
  const menu = page.locator("[id=document-menu]");
  await expect(menu).toBeVisible();
  await expect(page.locator(".close")).toBeVisible();

  const replyBtn = page.locator("[class=resource-reply]");
  await replyBtn.click();
  const replyModal = page.locator("[id=reply-to-resource]");
  await expect(replyModal).toBeVisible();
});

test("clicking on the new button displays creates new document", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await expect(page.locator("[id=document-menu]")).not.toBeVisible();

  await page.locator("#document-menu button").click();
  const menu = page.locator("[id=document-menu]");
  await expect(menu).toBeVisible();
  await expect(page.locator(".close")).toBeVisible();

  const newBtn = page.locator("[class=resource-new]");
  await newBtn.click();
  const newDoc = page.locator(".do-new");
  await expect(newDoc).toBeEditable();
});

test("clicking on the open button displays open document modal", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await expect(page.locator("[id=document-menu]")).not.toBeVisible();

  await page.locator("#document-menu button").click();
  const menu = page.locator("[id=document-menu]");
  await expect(menu).toBeVisible();
  await expect(page.locator(".close")).toBeVisible();

  const openBtw = page.locator("[class=resource-open]");
  await openBtw.click();
  const openModal = page.locator("[id=open-document]");
  await expect(openModal).toBeVisible();
});

test("clicking on the save-as button displays save-as modal", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await expect(page.locator("[id=document-menu]")).not.toBeVisible();

  await page.locator("#document-menu button").click();
  const menu = page.locator("[id=document-menu]");
  await expect(menu).toBeVisible();
  await expect(page.locator(".close")).toBeVisible();

  const saveAsBtw = page.locator("[class=resource-save-as]");
  await saveAsBtw.click();
  const saveAsModal = page.locator("[id=save-as-document]");
  await expect(saveAsModal).toBeVisible();
});

test("clicking on the memento button displays additional buttons", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await expect(page.locator("[id=document-menu]")).not.toBeVisible();

  await page.locator("#document-menu button").click();
  const menu = page.locator("[id=document-menu]");
  await expect(menu).toBeVisible();
  await expect(page.locator(".close")).toBeVisible();

  const mementoBtw = page.locator("[class=resource-memento]");
  await mementoBtw.click();
  const versionBtn = page.locator("[class=create-version]");
  await expect(versionBtn).toBeVisible();
  const immutableBtn = page.locator("[class=create-immutable]");
  await expect(immutableBtn).toBeVisible();
  const robustifyBtn = page.locator("[class=robustify-links]");
  await expect(robustifyBtn).toBeVisible();
  const snapshotBtn = page.locator("[class=snapshot-internet-archive]");
  await expect(snapshotBtn).toBeVisible();
  const exportBtn = page.locator("[class=export-as-html]");
  await expect(exportBtn).toBeVisible();
});

test("clicking on the edit button button enables author mode", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await expect(page.locator("[id=document-menu]")).not.toBeVisible();

  await page.locator("#document-menu button").click();
  const menu = page.locator("[id=document-menu]");
  await expect(menu).toBeVisible();
  await expect(page.locator(".close")).toBeVisible();

  const editBtw = page.locator("[class=editor-enable]");
  await editBtw.click();
  const documentEditor = page.locator("[class=ProseMirror]");
  await expect(documentEditor).toHaveAttribute("contenteditable", "true");
});

test("clicking on the source button displays source modal", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await expect(page.locator("[id=document-menu]")).not.toBeVisible();

  await page.locator("#document-menu button").click();
  const menu = page.locator("[id=document-menu]");
  await expect(menu).toBeVisible();
  await expect(page.locator(".close")).toBeVisible();

  const sourceBtn = page.locator("[class=resource-source]");
  await sourceBtn.click();
  const sourceModal = page.locator("[id=source-view]");
  await expect(sourceModal).toBeVisible();
});

test("clicking on the embed button embed data modal", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await expect(page.locator("[id=document-menu]")).not.toBeVisible();

  await page.locator("#document-menu button").click();
  const menu = page.locator("[id=document-menu]");
  await expect(menu).toBeVisible();
  await expect(page.locator(".close")).toBeVisible();

  const embedBtn = page.locator("[class=embed-data-meta]");
  await embedBtn.click();
  const embedModal = page.locator("[id=embed-data-entry]");
  await expect(embedModal).toBeVisible();
});
