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

// Atom view for the location autocomplete: renders the <input> itself (no
// contentDOM), so PM owns nothing inside. ignoreMutation + atom mean the injected
// suggestions <ul> is left alone and the input can't be edited/deleted as content.
import { moveField } from "../eventFieldNav.js";

export class AutocompleteView {
  constructor(node, view, getPos) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.dom = document.createElement("div");
    for (const [name, value] of Object.entries(node.attrs.originalAttributes || {})) {
      this.dom.setAttribute(name, value);
    }
    this.input = document.createElement("input");
    for (const [name, value] of Object.entries(node.attrs.inputAttributes || {})) {
      this.input.setAttribute(name, value);
    }
    this.input.setAttribute("contenteditable", "false");
    this.dom.appendChild(this.input);
    this.input.addEventListener("change", () => this.syncInput());
    // Tab leaves to the next/previous event field. Arrows stay native (the
    // suggestions list uses them).
    this.input.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const pos = typeof this.getPos === "function" ? this.getPos() : null;
      if (pos != null && moveField(this.view, pos, e.shiftKey ? -1 : 1)) e.preventDefault();
    });
  }

  syncInput() {
    const pos = typeof this.getPos === "function" ? this.getPos() : null;
    if (pos == null) return;
    const inputAttributes = { ...this.node.attrs.inputAttributes, value: this.input.value };
    for (const attr of this.input.attributes) {
      if (attr.name.startsWith("data-")) inputAttributes[attr.name] = attr.value;
    }
    this.view.dispatch(
      this.view.state.tr.setNodeMarkup(pos, null, { ...this.node.attrs, inputAttributes })
    );
  }

  stopEvent() {
    return true;
  }

  ignoreMutation() {
    return true;
  }

  update(node) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    return true;
  }
}
