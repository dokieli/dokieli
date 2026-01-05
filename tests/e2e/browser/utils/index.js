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

import { expect } from "../fixtures";

// FIXME: I think the following function is not used anywhere
export async function selectText(wordToSelect, page) {
  const boundingBox = await page.evaluate((wordToSelect) => {
    const range = document.createRange();
    const selection = window.getSelection();

    const textNodes = document.evaluate(
      "//text()[contains(., '" + wordToSelect + "')]",
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );

    for (let i = 0; i < textNodes.snapshotLength; i++) {
      const textNode = textNodes.snapshotItem(i);
      const nodeText = textNode.textContent;
      const startOffset = nodeText.indexOf(wordToSelect);
      const endOffset = startOffset + wordToSelect.length;

      range.setStart(textNode, startOffset);
      range.setEnd(textNode, endOffset);

      selection.removeAllRanges();
      selection.addRange(range);

      const rect = range.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        };
      }
    }
    return null;
  }, wordToSelect);

  if (boundingBox) {
    const startX = boundingBox.x;
    const startY = boundingBox.y;
    const endX = startX + boundingBox.width;
    const endY = startY + boundingBox.height;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY);
    await page.mouse.up();
  } else {
    console.log("Word not found on the page.");
  }
}

export async function select(page, selector) {
  // Click and drag on text to select it
  const text = page.locator(selector);
  const box = await text.boundingBox();

  await text.click();
  await page.mouse.down();
  await page.mouse.move(box.x + 30, box.y + box.height / 2);
  await page.mouse.up();

  // Wait for the toolbar to be visible
  const toolbar = page.locator(".editor-toolbar");
  await expect(toolbar).toBeVisible();
}

export async function toggleMode(page, mode) {
  await page.locator("#document-menu button").click();
  const menu = page.locator("[id=document-menu]");
  await expect(menu).toBeVisible();
  // Toggle mode
  if (mode === "author") {
    const editButton = page.locator(".editor-enable");
    await editButton.click();
    // Wait for document to be editable
    const documentEditor = page.locator(".ProseMirror");
    await expect(documentEditor).toHaveAttribute("contenteditable", "true");
  } else {
    const editButton = page.locator(".editor-disable");
    await editButton.click();
    // Wait for document to be read-only
    const documentEditor = page.locator(".ProseMirror");
    await expect(documentEditor).toHaveAttribute("contenteditable", "false");
  }
}

export async function openMenu (page) {
  await page.locator("#document-menu button").click();
  const menu = page.locator("[id=document-menu]");
  await expect(menu).toBeVisible();
};