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
import { select, selectByTouch, toggleMode } from "./utils";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const DARK_BORDER = "rgb(74, 74, 74)";

async function expectNoViolations(page, selector, tags) {
  const builder = new AxeBuilder({ page }).include(selector);
  if (tags) builder.withTags(tags);
  const results = await builder.analyze();
  expect(results.violations).toEqual([]);
}

async function expectPinnedToBottom(page) {
  const viewport = page.viewportSize();
  const box = await page.locator(".editor-toolbar").boundingBox();
  expect(box.x).toBe(0);
  expect(box.width).toBe(viewport.width);
  expect(Math.abs(box.y + box.height - viewport.height)).toBeLessThanOrEqual(1);
}

async function expectAboveToolbar(page, selector) {
  const toolbar = await page.locator(".editor-toolbar").boundingBox();
  const box = await page.locator(selector).boundingBox();
  const viewport = page.viewportSize();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(toolbar.y + 1);
}

test.describe("social mode", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("load");
    await selectByTouch(page, "#summary");
  });

  test("uses the compact layout on a phone viewport", async ({ page }) => {
    const matches = await page.evaluate(() => window.matchMedia("(pointer: coarse), (max-width: 768px)").matches);
    expect(matches).toBe(true);
  });

  test("toolbar is pinned to the bottom edge and spans the viewport", async ({ page }) => {
    await expectPinnedToBottom(page);
    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflows).toBe(false);
  });

  test("toolbar has no shadow and a top border on the button row", async ({ page }) => {
    const styles = await page.locator(".editor-toolbar").evaluate((toolbar) => {
      const actions = toolbar.querySelector(".editor-form-actions");
      return {
        toolbarShadow: getComputedStyle(toolbar).boxShadow,
        borderTopWidth: getComputedStyle(actions).borderTopWidth,
        borderTopStyle: getComputedStyle(actions).borderTopStyle,
      };
    });
    expect(styles.toolbarShadow).toBe("none");
    expect(styles.borderTopWidth).toBe("1px");
    expect(styles.borderTopStyle).toBe("solid");
  });

  test("mode toggle is not in the bar but in the more sheet with an icon", async ({ page }) => {
    await expect(page.locator(".editor-toolbar li.editor-mode-toggle")).toHaveCount(0);

    const trigger = page.locator("#editor-dropdown-trigger-more");
    await expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toHaveAttribute("aria-controls", "editor-dropdown-panel-more");

    await trigger.tap();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

    const item = page.locator("#editor-dropdown-panel-more .editor-dropdown-item", { hasText: "Switch to Edit" });
    await expect(item).toBeVisible();
    await expect(item.locator("svg")).toHaveCount(1);
    await expect(item.locator("svg")).toHaveAttribute("aria-hidden", "true");
  });

  test("more sheet opens above the bar inside the viewport", async ({ page }) => {
    await page.locator("#editor-dropdown-trigger-more").tap();
    await expect(page.locator("#editor-dropdown-panel-more")).toBeVisible();
    await expectAboveToolbar(page, "#editor-dropdown-panel-more");
  });

  test("tapping the more trigger again closes the sheet", async ({ page }) => {
    const trigger = page.locator("#editor-dropdown-trigger-more");
    await trigger.tap();
    await expect(page.locator("#editor-dropdown-panel-more")).toBeVisible();
    await trigger.tap();
    await expect(page.locator("#editor-dropdown-panel-more")).not.toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  test("tapping switch to edit enters author mode", async ({ page }) => {
    await page.locator("#editor-dropdown-trigger-more").tap();
    await page.locator("#editor-dropdown-panel-more .editor-dropdown-item", { hasText: "Switch to Edit" }).tap();
    await expect(page.locator(".ProseMirror")).toHaveAttribute("contenteditable", "true");
    await expect(page.locator("#editor-dropdown-trigger-meta")).toBeVisible();
  });

  test("tapping a button keeps the selection and opens its popup", async ({ page }) => {
    await page.locator("#editor-button-comment").tap();
    await expect(page.locator("#editor-form-comment")).toBeVisible();
    const collapsed = await page.evaluate(() => window.getSelection().isCollapsed);
    expect(collapsed).toBe(false);
  });

  for (const button of ["approve", "disapprove", "bookmark", "comment"]) {
    test(`${button} popup fits the viewport`, async ({ page }) => {
      await page.locator(`#editor-button-${button}`).tap();
      const form = page.locator(`#editor-form-${button}`);
      await expect(form).toBeVisible();
      await expectAboveToolbar(page, `#editor-form-${button}`);

      const overflow = await form.evaluate((el) => ({
        form: el.scrollWidth - el.clientWidth,
        fields: Array.from(el.querySelectorAll("textarea, select, input"))
          .map((f) => f.getBoundingClientRect().right - el.getBoundingClientRect().right)
          .filter((d) => d > 1),
      }));
      expect(overflow.form).toBeLessThanOrEqual(1);
      expect(overflow.fields).toEqual([]);
    });
  }

  test("tapping outside the toolbar closes it", async ({ page }) => {
    await expect(page.locator(".editor-toolbar")).toBeVisible();
    await page.touchscreen.tap(10, 10);
    await expect(page.locator(".editor-toolbar")).not.toBeVisible();
  });

  test("toolbar has no WCAG A or AA violations", async ({ page }) => {
    await expectNoViolations(page, ".editor-toolbar", WCAG_TAGS);
  });

  test("more sheet has no WCAG A or AA violations", async ({ page }) => {
    await page.locator("#editor-dropdown-trigger-more").tap();
    await expect(page.locator("#editor-dropdown-panel-more")).toBeVisible();
    await expectNoViolations(page, "#editor-dropdown-panel-more", WCAG_TAGS);
  });

  test("comment popup has no WCAG A or AA violations", async ({ page }) => {
    await page.locator("#editor-button-comment").tap();
    await expect(page.locator("#editor-form-comment")).toBeVisible();
    await expectNoViolations(page, "#editor-form-comment", WCAG_TAGS);
  });
});

test.describe("social mode, dark theme", () => {
  test.use({ colorScheme: "dark" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("load");
    await selectByTouch(page, "#summary");
  });

  test("bar and sheet borders use the dark border color", async ({ page }) => {
    const barBorder = await page.locator(".editor-toolbar .editor-form-actions").evaluate((el) => getComputedStyle(el).borderTopColor);
    expect(barBorder).toBe(DARK_BORDER);

    await page.locator("#editor-dropdown-trigger-more").tap();
    const panelBorder = await page.locator("#editor-dropdown-panel-more").evaluate((el) => getComputedStyle(el).borderTopColor);
    expect(panelBorder).toBe(DARK_BORDER);
  });

  test("toolbar has no WCAG A or AA violations", async ({ page }) => {
    await expectNoViolations(page, ".editor-toolbar", WCAG_TAGS);
  });
});

test.describe("author mode", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("load");
    await toggleMode(page, "author");
    await select(page, "#summary");
  });

  test("bar holds only the compact controls", async ({ page }) => {
    const bar = page.locator(".editor-toolbar .editor-form-actions");
    await expect(bar.locator("#editor-blocktype-selector")).toBeVisible();
    await expect(bar.locator("#editor-button-strong")).toBeVisible();
    await expect(bar.locator("#editor-button-em")).toBeVisible();
    await expect(bar.locator("#editor-button-a")).toBeVisible();
    await expect(bar.locator("#editor-dropdown-trigger-meta")).toBeVisible();
    await expect(bar.locator("#editor-dropdown-trigger-align")).toHaveCount(0);
    await expect(bar.locator("#editor-dropdown-trigger-plus")).toHaveCount(0);
    await expect(bar.locator("li.editor-mode-toggle")).toHaveCount(0);
    await expectPinnedToBottom(page);
  });

  test("meta sheet holds back to reading with an icon plus align and insert sections", async ({ page }) => {
    await page.locator("#editor-dropdown-trigger-meta").tap();
    const panel = page.locator("#editor-dropdown-panel-meta");
    await expect(panel).toBeVisible();
    await expectAboveToolbar(page, "#editor-dropdown-panel-meta");

    const item = panel.locator(".editor-dropdown-item", { hasText: "Back to Reading" });
    await expect(item).toBeVisible();
    await expect(item.locator("svg")).toHaveCount(1);
    await expect(panel.locator(".editor-dropdown-section-label", { hasText: "Align" })).toHaveCount(1);
    await expect(panel.locator(".editor-dropdown-section-label", { hasText: "Insert" })).toHaveCount(1);
  });

  test("markdown toggle sits above the toolbar", async ({ page }) => {
    await expect(page.locator("#editor-area-toggle")).toBeVisible();
    await expectAboveToolbar(page, "#editor-area-toggle");
  });

  test("tapping back to reading leaves author mode", async ({ page }) => {
    await page.locator("#editor-dropdown-trigger-meta").tap();
    await page.locator("#editor-dropdown-panel-meta .editor-dropdown-item", { hasText: "Back to Reading" }).tap();
    await expect(page.locator(".ProseMirror")).toHaveAttribute("contenteditable", "false");
  });

  test("toolbar has no WCAG A or AA violations", async ({ page }) => {
    await expectNoViolations(page, ".editor-toolbar", WCAG_TAGS);
  });

  test("meta sheet has no WCAG A or AA violations", async ({ page }) => {
    await page.locator("#editor-dropdown-trigger-meta").tap();
    await expect(page.locator("#editor-dropdown-panel-meta")).toBeVisible();
    await expectNoViolations(page, "#editor-dropdown-panel-meta", WCAG_TAGS);
  });
});
