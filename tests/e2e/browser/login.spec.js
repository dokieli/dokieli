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
  // One test covering both transitions: two back-to-back OIDC round trips get
  // stalled by the IDP.
  test("signs in and out", async ({ auth, page }) => {
    await auth.login();
    await page.locator("#document-menu > button").click();

    await expect(page.locator("#document-menu button.signout-user")).toBeVisible();
    await expect(page.locator("#document-menu button.signin-user")).not.toBeVisible();

    await page.locator("#document-menu button.signout-user").click();

    await expect(page.locator("#document-menu button.signin-user")).toBeVisible();
    await expect(page.locator("#document-menu button.signout-user")).not.toBeVisible();
  });
});
