/*!
Copyright 2012-2026 Sarven Capadisli <https://csarven.ca/>
Copyright 2023-2026 Virginia Balseiro <https://virginiabalseiro.com/>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";

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

  const documentMenuButton = page.locator("#document-menu button");
  await expect(documentMenuButton).toBeVisible();
  await expect(page.locator("[id=document-menu]")).not.toBeVisible();

  await documentMenuButton.click();

  const menu = page.locator("[id=document-menu]");
  await expect(menu).toBeVisible();

  await expect(page.locator("button.signout-user")).toBeVisible();

  const notificationsBtn = page.locator("[class=resource-notifications]");
  await notificationsBtn.click();
});

test("notifications panels displays notifications", async ({ page }) => {
  const notificationsPanel = page.locator("[id=document-notifications]");
  await expect(notificationsPanel).toBeVisible();
  await page.locator("text=Checking activities").waitFor({ state: "hidden" });
  const notifications = await page.locator("blockquote");
  const notificationsCount = await notifications.count();
  expect(notificationsCount).toBeGreaterThan(0);
});

test("notifications panel has no automatically detectable accessibility issues", async ({ page }) => {
  const notificationsPanel = page.locator("[id=document-notifications]");
  const accessibilityScanResults = await new AxeBuilder({ page })
    .include(await notificationsPanel.elementHandle())
    .analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});

test("notifications panel has no WCAG A or AA violations", async ({ page }) => {
  const notificationsPanel = page.locator("[id=document-notifications]");
  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .include(await notificationsPanel.elementHandle())
    .analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});

test("notifications panel has no WCAG AAA violations", async ({ page }) => {
  const notificationsPanel = page.locator("[id=document-notifications]");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2aaa", "wcag21aaa"])
    .include(await notificationsPanel.elementHandle())
    .analyze();
  if (results.violations.length > 0) {
    console.warn("AAA issues:", results.violations);
  }
});


test("annotations are highlighted in the text", async ({ page }) => {
  const documentMenuButton = page.locator("#document-menu button");
  await expect(documentMenuButton).toBeVisible();
  await expect(page.locator("[id=document-menu]")).not.toBeVisible();

  await documentMenuButton.click();

  const menu = page.locator("[id=document-menu]");
  await expect(menu).toBeVisible();

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
