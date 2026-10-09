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

// A native textarea that ProseMirror doesn't edit.
export class TextareaView {
  constructor(node) {
    this.node = node;
    this.dom = document.createElement("textarea");
    const attrs = node.attrs.originalAttributes || {};
    for (const [name, value] of Object.entries(attrs)) {
      this.dom.setAttribute(name, value);
    }
    this.dom.setAttribute("contenteditable", "false");
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
