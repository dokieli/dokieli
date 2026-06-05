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

// Native <select> inside the editable region. Like InputView: stopEvent keeps
// every DOM event away from PM (no selection, no toolbar) and ignoreMutation
// stops reparses. The view renders the <option>s itself (no contentDOM) so PM
// never tries to edit inside the control. The picked value lives only in the DOM
// property, so the change handler writes it into a data-value attribute that
// survives serialization (read by the save/read-mode transform).
export class SelectView {
  constructor(node, view, getPos) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.dom = document.createElement("select");
    const attrs = node.attrs.originalAttributes || {};
    for (const [name, value] of Object.entries(attrs)) {
      this.dom.setAttribute(name, value);
    }
    this.dom.setAttribute("contenteditable", "false");
    this.renderOptions();
    if (attrs["data-value"] != null) this.dom.value = attrs["data-value"];
    this.dom.addEventListener("change", () => this.syncValue());
  }

  renderOptions() {
    this.node.forEach((child) => {
      if (child.type.name !== "option") return;
      const opt = document.createElement("option");
      const attrs = child.attrs.originalAttributes || {};
      for (const [name, value] of Object.entries(attrs)) opt.setAttribute(name, value);
      opt.textContent = child.textContent;
      this.dom.appendChild(opt);
    });
  }

  syncValue() {
    const pos = typeof this.getPos === "function" ? this.getPos() : null;
    if (pos == null) return;
    const next = { ...this.node.attrs.originalAttributes, "data-value": this.dom.value };
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
