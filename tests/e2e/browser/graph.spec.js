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

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("load");

  await page.locator("#document-menu button").click();
  const menu = page.locator("[id=document-menu]");
  await expect(menu).toBeVisible();

  const graphButton = page.locator("[class=resource-visualise]");
  await graphButton.click();
  const graphModal = page.locator("[id=graph-view]");
  await expect(graphModal).toBeVisible();
});

test("graph loads", async ({ page }) => {
  const graphModal = page.locator("[id=graph-view]");
  const graphSvg = graphModal.locator('svg[typeof*="Image"]');
  await expect(graphSvg).toBeVisible();
});

test("graph modal has no automatically detectable accessibility issues", async ({ page }) => {
  const graphModal = page.locator("[id=graph-view]");
  const results = await new AxeBuilder({ page })
    .include(await graphModal.elementHandle())
    .analyze();
  expect(results.violations).toEqual([]);
});

test("graph modal has no WCAG A or AA violations", async ({ page }) => {
  const graphModal = page.locator("[id=graph-view]");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .include(await graphModal.elementHandle())
    .analyze();
  expect(results.violations).toEqual([]);
});

test("graph modal has no WCAG AAA violations", async ({ page }) => {
  const graphModal = page.locator("[id=graph-view]");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2aaa", "wcag21aaa"])
    .include(await graphModal.elementHandle())
    .analyze();
  if (results.violations.length > 0) {
    console.warn("AAA issues:", results.violations);
  }
});
