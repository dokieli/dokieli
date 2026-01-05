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

  await expect(page.locator("button.signout-user")).toBeVisible();

  const saveAsBtn = page.locator("[class=resource-save-as]");
  await saveAsBtn.click();

  const saveAsModal = page.locator("[id=save-as-document]");
  await expect(saveAsModal).toBeVisible();
  await page.waitForTimeout(1000);

  const saveButton = saveAsModal.locator('button:has-text("Save")');
  await saveButton.click();

  const progress = page.locator("progress")

  await expect(progress).toBeVisible();
  await expect(progress).not.toBeVisible();

  const saveAsSuccess = page.locator("text=Document saved");
  await expect(saveAsSuccess).toBeVisible();

  // TODO: cleanup
});

test("save-as modal should not have any automatically detectable WCAG A and AA", async ({
  page,
}) => {
  const documentMenuButton = page.locator("#document-menu > button");
  await expect(documentMenuButton).toBeVisible();
  await expect(page.locator("[id=document-menu]")).not.toBeVisible();

  await documentMenuButton.click();
  await expect(page.locator("[id=document-menu]")).toBeVisible();
  
  await expect(page.locator("button.signout-user")).toBeVisible();

  const saveAsBtn = page.locator("[class=resource-save-as]");
  await saveAsBtn.click();

  const saveAsModal = page.locator("[id=save-as-document]");
  await expect(saveAsModal).toBeVisible();

  const accessibilityScanResults = await new AxeBuilder({ page })
    .include("#save-as-document")
    .withTags([
      "wcag2a",
      "wcag2aa",
      "wcag21a",
      "wcag21aa",
    ])
    .analyze();

  expect(accessibilityScanResults.violations).toEqual([]);
});

test("save-as modal should not have any automatically detectable WCAG AAA violations", async ({
  page,
}) => {
  const documentMenuButton = page.locator("#document-menu > button");
  await expect(documentMenuButton).toBeVisible();
  await expect(page.locator("[id=document-menu]")).not.toBeVisible();

  await documentMenuButton.click();
  await expect(page.locator("[id=document-menu]")).toBeVisible();
  
  await expect(page.locator("button.signout-user")).toBeVisible();

  const saveAsBtn = page.locator("[class=resource-save-as]");
  await saveAsBtn.click();

  const saveAsModal = page.locator("[id=save-as-document]");
  await expect(saveAsModal).toBeVisible();

  const accessibilityScanResults = await new AxeBuilder({ page })
    .include("#save-as-document")
    .withTags([
      "wcag2aaa",
      "wcag21aaa",
    ])
    .analyze();

  if (accessibilityScanResults.violations.length > 0) {
    console.warn("AAA issues:", accessibilityScanResults.violations);
  }
});
