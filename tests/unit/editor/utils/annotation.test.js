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

import {
  getTextQuoteHTML,
  rangeSelectsSingleNode,
  getSelectedParentElement,
  exportSelection,
  cloneSelection,
} from "../../../../src/editor/utils/annotation";

describe("getTextQuoteHTML", () => {
  it("throws if selectedContent is not a string", () => {
    expect(() => getTextQuoteHTML("id", "oa:replying", {}, "", {})).toThrow(
      "getTextQuoteHTML: selectedContent is of type object"
    );
  });

  it("throws if selectedContent is empty", () => {
    expect(() => getTextQuoteHTML("id", "oa:replying", "", "", {})).toThrow(
      "getTextQuoteHTML: selectedContent is empty"
    );
  });

  it("returns valid HTML with default args", () => {
    const html = getTextQuoteHTML(null, null, "Hello world");
    expect(html).toMatch(
      /<span class="ref".*?><mark .*?>Hello world<\/mark><\/span>/
    );
  });

  it("returns HTML with highlighting motivation", () => {
    const html = getTextQuoteHTML("123", "oa:highlighting", "highlighted text");
    expect(html).toContain("oa:highlighting");
    expect(html).toContain("<mark");
    expect(html).toContain("highlighted text");
  });
});

describe("rangeSelectsSingleNode", () => {
  it("returns false for different start and end containers", () => {
    const div = document.createElement("div");
    const span1 = document.createElement("span");
    const span2 = document.createElement("span");
    span1.textContent = "Hello";
    span2.textContent = "World";
    div.append(span1, span2);

    const range = document.createRange();
    range.setStart(span1.firstChild, 0);
    range.setEnd(span2.firstChild, 1);

    expect(rangeSelectsSingleNode(range)).toBe(false);
  });

  it("returns true for same container and offset + 1", () => {
    const div = document.createElement("div");
    const span1 = document.createElement("span");
    const span2 = document.createElement("span");
    span1.textContent = "Hello";
    span2.textContent = "World";
    div.append(span1, span2);

    const range = document.createRange();
    range.setStart(div, 0);
    range.setEnd(div, 1);

    expect(rangeSelectsSingleNode(range)).toBe(true);
  });
});

describe("getSelectedParentElement", () => {
  it("returns null if no range is provided", () => {
    expect(getSelectedParentElement(null)).toBeNull();
  });

  it("returns parentNode if range starts in text node", () => {
    const div = document.createElement("div");
    const text = document.createTextNode("hello");
    div.appendChild(text);

    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 1);

    expect(getSelectedParentElement(range)).toBe(div);
  });

  it("returns startContainer for element node", () => {
    const div = document.createElement("div");
    const span = document.createElement("span");
    div.appendChild(span);

    const range = document.createRange();
    range.setStart(span, 0);
    range.setEnd(span, 0);

    expect(getSelectedParentElement(range)).toBe(span);
  });
});

describe("exportSelection", () => {
  it("returns undefined if selection has no range", () => {
    const selection = {
      rangeCount: 0,
    };
    expect(exportSelection(document.body, selection)).toBeUndefined();
  });

  it("returns start and end positions for selection", () => {
    document.body.innerHTML = '<div id="el">Hello <b>world</b>!</div>';
    const el = document.getElementById("el");
    const textNode = el.firstChild;

    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 5);

    const selection = {
      rangeCount: 1,
      getRangeAt: () => range,
    };

    const result = exportSelection(el, selection);
    expect(result).toEqual({ start: 0, end: 5 });
  });
});

describe("cloneSelection", () => {
  it("returns null if no selection", () => {
    const sel = window.getSelection();
    sel.removeAllRanges();
    expect(cloneSelection()).toBeNull();
  });

  it("returns array with cloned range and fragment", () => {
    const p = document.createElement("p");
    p.textContent = "Test text";
    document.body.appendChild(p);

    const range = document.createRange();
    range.setStart(p.firstChild, 0);
    range.setEnd(p.firstChild, 5);

    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    const result = cloneSelection();
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty("range");
    expect(result[0]).toHaveProperty("fragment");
  });
});
