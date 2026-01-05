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
test.describe("auth flow", () => {
  test.beforeEach(async ({ auth, page }) => {
    await auth.login();
    await page.locator("#document-menu button").click();
  });

  test("signs in", async ({ page }) => {
    // Listen for console messages to make sure we are logged in - FIXME: not sure why this is still needed at this point
    page.on("console", async (msg) => {
      if (msg.text().includes(process.env.WEBID)) {
        await page.waitForSelector("#document-menu", { state: "visible" });
        await expect(page.locator("button.signout-user")).toBeVisible();
      }
    });
  });
  test("signs out", async ({ page }) => {
    // Listen for console messages to make sure we are logged in - FIXME: not sure why this is still needed at this point
    page.on("console", async (msg) => {
      if (msg.text().includes(process.env.WEBID)) {
        await page.waitForSelector("button.signout-user");
        await expect(page.locator("button.signout-user")).toBeVisible();
    
        await page.waitForTimeout(1000);
        await page.locator("button.signout-user").click();
    
        await page.waitForTimeout(1000);
        await page.waitForSelector("button.signin-user");
        await expect(page.locator("button.signin-user")).toBeVisible();
      }
    });
  });
});
