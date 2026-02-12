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
import { select } from "./utils";

test("language switching updates visible strings", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("[id=document-menu]")).not.toBeVisible();

  await page.locator("#document-menu button").click();
  const menu = page.locator("[id=document-menu]");
  await expect(menu).toBeVisible();
  
  const shareButton = await page.locator(".resource-share");

  expect(shareButton).toHaveText('Share');

  await page.selectOption('#ui-language-select', 'es');
  await expect(shareButton).toHaveText('Compartir');

  await page.selectOption('#ui-language-select', 'fr');
  await expect(shareButton).toHaveText('Partager');
});

test("aside opens up in the selected language", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("[id=document-menu]")).not.toBeVisible();

  await page.locator("#document-menu button").click();
  const menu = page.locator("[id=document-menu]");
  await expect(menu).toBeVisible();
  
  const shareButton = await page.locator(".resource-share");
  shareButton.click();

  const shareDialog = await page.locator("#share-resource");
  await expect(shareDialog).toBeVisible();
  await expect(shareDialog).toContainText('Copy URL to clipboard');

  await page.selectOption('#ui-language-select', 'es');
  await expect(shareDialog).toContainText('Copiar URL al portapapeles');
});

test("comment popup uses UI language for content by default", async ({ page }) => {
  await page.goto("/");
  await select(page, "#summary");
  const commentButton = page.locator('[id="editor-button-comment"]');
  await commentButton.click();
  
  await expect(page.locator("#comment-language")).toHaveValue("en-GB");

  await page.selectOption("#comment-language", "ar");

  await expect(page.locator("#comment-language")).toHaveValue("ar");
});

test("comment popup correctly switches to Arabic and sets dir to auto", async ({ page }) => {
  await page.goto("/");
  await select(page, "#summary");
  const commentButton = page.locator('[id="editor-button-comment"]');
  await commentButton.click();
  await expect(page.locator("textarea#comment-content")).toBeVisible();

  await page.selectOption("#comment-language", "ar");

  const dir = await page.getAttribute("textarea#comment-content", "dir");
  expect(dir).toBe("auto");
});

test("preferred language from user profile is used", async ({ page, auth }) => {
  test.setTimeout(60_000);
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

  await expect(page.locator("[id=document-menu]")).not.toBeVisible();

  await page.locator("#document-menu button").click();
  const menu = page.locator("[id=document-menu]");
  await expect(menu).toBeVisible();

  await expect(page.locator("#ui-language-select")).toHaveValue("es");
})

test.only("info opens up in the selected language", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("[id=document-menu]")).not.toBeVisible();

  await page.locator("#document-menu button").click();
  const menu = page.locator("[id=document-menu]");
  await expect(menu).toBeVisible();

  await page.selectOption('#ui-language-select', 'es');
  
  const shareButton = await page.locator(".resource-share");
  shareButton.click();

  const shareDialog = await page.locator("#share-resource");
  await expect(shareDialog).toBeVisible();
 
  const infoButton = await page.locator('#share-resource button[rel="rel:help"]');
  const resourceUrl = await infoButton.getAttribute('resource');
  expect(resourceUrl).toBe('https://dokie.li/es/docs#feature-share');
  await infoButton.click();
  
  await expect(shareDialog).toContainText('Acerca de Compartir');
  await page.waitForTimeout(3000);
});