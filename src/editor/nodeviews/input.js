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

// A native form control inside the editable region. stopEvent keeps every DOM
// event (click, focus, keydown) away from PM, so clicking the input never sets
// a PM selection and the author toolbar stays hidden; the native picker still
// works. ignoreMutation stops PM from reparsing when the value changes.
//
// Because PM ignores the input, the picked value lives only in the DOM property
// and would never reach serialization. The change handler writes it back into
// the node's value attribute so it survives save (and downstream transforms).
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
  }

  syncValue() {
    const pos = typeof this.getPos === "function" ? this.getPos() : null;
    if (pos == null) return;
    const next = { ...this.node.attrs.originalAttributes, value: this.dom.value };
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
