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

// NodeView for <div class="autocomplete">. The editable content (the input)
// lives in contentDOM; the suggestions list is injected into dom *outside*
// contentDOM. ignoreMutation tells PM to leave anything outside contentDOM
// alone, so the dynamically injected <ul> isn't reverted, doesn't lose its
// contenteditable=false, and doesn't corrupt the editor selection. PM still
// owns and edits the input inside contentDOM as normal.
export class AutocompleteView {
  constructor(node) {
    this.node = node;
    this.dom = document.createElement("div");
    const attrs = node.attrs.originalAttributes || {};
    for (const [name, value] of Object.entries(attrs)) {
      this.dom.setAttribute(name, value);
    }
    this.contentDOM = document.createElement("div");
    this.contentDOM.className = "autocomplete-content";
    this.dom.appendChild(this.contentDOM);
  }

  // Only mutations within the content area (the input) are PM's business. The
  // injected suggestions <ul> is a sibling of contentDOM, so contains() is
  // false for it and we tell PM to ignore it.
  ignoreMutation(mutation) {
    return !this.contentDOM.contains(mutation.target);
  }

  update(node) {
    if (node.type !== this.node.type) return false;
    const cls = node.attrs.originalAttributes?.class || "";
    if (!cls.split(/\s+/).includes("autocomplete")) return false;
    this.node = node;
    return true;
  }
}
