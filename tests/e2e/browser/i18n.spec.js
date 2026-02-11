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
