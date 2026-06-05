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

// <div class="autocomplete">: input in contentDOM, suggestions injected outside it so PM ignores them.
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
