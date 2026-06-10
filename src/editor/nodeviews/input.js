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

// Native form control; PM ignores its events, change syncs value + data-* back.
import { moveField } from "../eventFieldNav.js";

export class InputView {
  constructor(node, view, getPos) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.dom = document.createElement("input");
    const attrs = node.attrs.originalAttributes || {};
    for (const [name, value] of Object.entries(attrs)) {
      this.dom.setAttribute(name, value);
    }
    this.dom.setAttribute("contenteditable", "false");
    this.dom.addEventListener("change", () => this.syncValue());
    // Tab moves to the next/previous event field.
    this.dom.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const pos = typeof this.getPos === "function" ? this.getPos() : null;
      if (pos != null && moveField(this.view, pos, e.shiftKey ? -1 : 1)) e.preventDefault();
    });
  }

  syncValue() {
    const pos = typeof this.getPos === "function" ? this.getPos() : null;
    if (pos == null) return;
    const next = { ...this.node.attrs.originalAttributes, value: this.dom.value };
    for (const attr of this.dom.attributes) {
      if (attr.name.startsWith("data-")) next[attr.name] = attr.value;
    }
    this.view.dispatch(
      this.view.state.tr.setNodeMarkup(pos, null, { ...this.node.attrs, originalAttributes: next })
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
