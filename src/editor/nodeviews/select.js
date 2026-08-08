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

// Native <select>; renders its own options, PM ignores events, change syncs data-value.
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
    const renderOption = (node, parent) => {
      const opt = document.createElement("option");
      const attrs = node.attrs.originalAttributes || {};
      for (const [name, value] of Object.entries(attrs)) opt.setAttribute(name, value);
      opt.textContent = node.textContent;
      parent.appendChild(opt);
    };

    this.node.forEach((child) => {
      if (child.type.name === "option") {
        renderOption(child, this.dom);
      }
      else if (child.type.name === "optgroup") {
        const group = document.createElement("optgroup");
        const attrs = child.attrs.originalAttributes || {};
        for (const [name, value] of Object.entries(attrs)) group.setAttribute(name, value);
        child.forEach((grandchild) => {
          if (grandchild.type.name === "option") renderOption(grandchild, group);
        });
        this.dom.appendChild(group);
      }
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
