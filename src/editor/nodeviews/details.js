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

// Without a NodeView, clicking <summary> toggles the native `open` attribute;
// PM's MutationObserver sees that attribute mutation, marks the node dirty and
// reparses the subtree, which coerces the metadata content and leaves stray
// empty paragraphs behind. This view owns the <details> element so expand/
// collapse is a view-only concern: ignoreMutation drops the `open` toggle so it
// never reaches the doc, and update() keeps the current open state across PM
// redraws instead of resetting it from the stored attributes.
export class DetailsView {
  constructor(node) {
    this.node = node;
    this.dom = this.contentDOM = document.createElement("details");
    const attrs = node.attrs.originalAttributes || {};
    for (const [name, value] of Object.entries(attrs)) {
      if (name === "open") continue;
      this.dom.setAttribute(name, value);
    }
    this.dom.open = "open" in attrs;
  }

  ignoreMutation(mutation) {
    return mutation.type === "attributes" &&
      mutation.target === this.dom &&
      mutation.attributeName === "open";
  }

  update(node) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    return true;
  }
}
