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

  await page.waitForLoadState("load");
  await expect(page.locator("[id=document-menu]")).not.toBeVisible();

  await page.locator("#document-menu > button").click();
  const menu = await page.locator("[id=document-menu]");
  await expect(menu).toBeVisible();
  

  const openBtn = page.locator("[class=resource-open]");
  await openBtn.click();
  const openModal = page.locator("[id=open-document]");
  await expect(openModal).toBeVisible();

  const urlInput = await openModal.locator(
    'input[id="location-open-document-input"]'
  );
  await urlInput.fill(process.env.TEST_RESOURCE_URL);

  const openButton = await openModal.locator('button:has-text("Open")');
  await openButton.click();

  const documentContent = page.locator('text="This is a test"');
  await expect(documentContent).toBeVisible();

  // open share modal
  await page.locator("#document-menu > button").click();
  await expect(menu).toBeVisible();
  const shareButton = await page.locator(".resource-share");
  await shareButton.click();
  const shareModal = page.locator("[id=share-resource]");
  await expect(shareModal).toBeVisible();
});
test("document can be shared with user's contacts", async ({ page }) => {
  const shareModal = page.locator("[id=share-resource]");
  const contacts = await shareModal.locator('[id="share-resource-contacts"]');
  expect(await contacts.locator("li").count()).toBeGreaterThan(0);

  // select first contact
  const firstContact = await contacts.locator("li").first().locator("input");
  await firstContact.click();
  await expect(await firstContact).toBeChecked();

  // share
  const shareButton2 = await shareModal.locator('button:has-text("Share")');
  await shareButton2.click();
  const progress = await page.locator("[class=progress]");
  expect(progress.locator("svg)")).toBeTruthy(); // confirmation icon
});

test("share modal has no automatically detectable accessibility issues", async ({
  page,
}) => {
  const shareModal = page.locator("[id=share-resource]");
  const accessibilityScanResults = await new AxeBuilder({ page })
    .include(await shareModal.elementHandle())
    .analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});

test("share modal has no WCAG A or AA violations", async ({
  page,
}) => {
  const shareModal = page.locator("[id=share-resource]");
  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags([
      "wcag2a",
      "wcag2aa",
      "wcag21a",
      "wcag21aa",
    ])
    .include(await shareModal.elementHandle())
    .analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});

test("share modal has no WCAG AAA violations", async ({
  page,
}) => {
  const shareModal = page.locator("[id=share-resource]");
  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags([
      "wcag2aaa",
      "wcag21aaa",
    ])
    .include(await shareModal.elementHandle())
    .analyze();
  if (accessibilityScanResults.violations.length > 0) {
    console.warn("AAA issues:", accessibilityScanResults.violations);
  }
});
