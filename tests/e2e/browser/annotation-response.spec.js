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

test.beforeEach(async ({ auth, page }) => {
  await auth.login();
  await page.waitForLoadState("load");
});

async function postFromForm(page, action, text) {
  const form = page.locator(`#editor-form-${action}`);
  await expect(form.locator(`textarea#${action}-content`)).toBeVisible();
  await form.locator(`textarea#${action}-content`).fill(text);
  await form.getByRole("button", { name: "Post" }).click();
}

async function postResponse(parent, action, text) {
  const form = parent.locator(`> form.annotation-response-form[data-action="${action}"]`);
  await expect(form.locator(`textarea#response-${action}-content`)).toBeVisible();
  await form.locator(`textarea#response-${action}-content`).fill(text);
  await form.getByRole("button", { name: "Post" }).click();
}

test("should be able to approve and comment on an annotation", async ({ page }) => {
  const parentText = `Parent annotation ${Date.now()}`;

  await select(page, "#summary");
  await page.locator("#editor-button-comment").click();
  await postFromForm(page, "comment", parentText);
  await expect(page.locator("sup.ref-annotation")).toBeVisible();

  await page.locator("#document-menu > button").click();
  await page.locator("button.resource-notifications").click();
  await expect(page.locator("#document-notifications")).toBeVisible();

  const parent = page.locator("#document-notifications > div > ul > li").filter({ has: page.locator(`blockquote:has-text("${parentText}")`) });
  await expect(parent).toHaveCount(1);

  const responses = parent.locator("> ul.annotation-responses");
  const count = (action) => parent.locator(`> ul.annotation-response-actions button[data-action="${action}"] + .annotation-response-count`);
  await expect(responses).toBeHidden();

  await parent.locator('button.annotation-response[data-action="approve"]').click();
  await postResponse(parent, "approve", "Agreed with this");
  await expect(responses).toBeVisible();
  await expect(count("approve")).toHaveText("1");
  await expect(page.locator("#document-editor .editor-form-active")).toHaveCount(0);

  await parent.locator('button.annotation-response[data-action="comment"]').click();
  await postResponse(parent, "comment", "A reply to the annotation");
  await expect(count("comment")).toHaveText("1");
  await expect(count("disapprove")).toHaveText("");

  await expect(responses.locator("> li")).toHaveCount(2);
  await expect(responses).toContainText("Agreed with this");
  await expect(responses).toContainText("A reply to the annotation");
  await expect(responses.locator('> li[data-response="approve"] article')).toHaveAttribute("typeof", /activitystreams#Like/);

  await expect(page.locator("sup.ref-annotation")).toHaveCount(1);

  await responses.locator('> li[data-response="comment"] button.delete').click();
  await expect(responses.locator("> li")).toHaveCount(1);
  await expect(count("comment")).toHaveText("");

  await responses.locator('> li[data-response="approve"] button.delete').click();
  await expect(responses).toBeHidden();

  await parent.locator("> blockquote button.delete").click();
  await expect(parent).toHaveCount(0);
});
