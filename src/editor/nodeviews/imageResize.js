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

import { allowedEmptyAttributes } from "../schema/base.js";

// Skips empty attributes except allowed ones, e.g., alt="" marking a decorative image.
function setImgAttributes(img, attrs) {
  for (const [key, value] of Object.entries(attrs)) {
    if (value != null && (value !== "" || allowedEmptyAttributes.includes(key))) {
      img.setAttribute(key, value);
    }
  }
}

export class ImageResizeView {
  constructor(node, view, getPos) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;

    this.dom = document.createElement("span");
    this.dom.classList.add("do", "editor-image-resize");

    const attrs = node.attrs.originalAttributes || {};
    this.img = document.createElement("img");
    setImgAttributes(this.img, attrs);
    this.dom.appendChild(this.img);

    this.handle = document.createElement("span");
    this.handle.classList.add("editor-image-resize-handle");
    this.dom.appendChild(this.handle);

    this.onMouseDown = this.onMouseDown.bind(this);
    this.handle.addEventListener("mousedown", this.onMouseDown);
  }

  onMouseDown(e) {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = this.img.offsetWidth;
    const startHeight = this.img.offsetHeight;
    const ratio = startWidth > 0 ? startHeight / startWidth : 1;

    const onMouseMove = (e) => {
      const newWidth = Math.max(32, startWidth + (e.clientX - startX));
      const newHeight = Math.round(newWidth * ratio);
      this.img.setAttribute("width", String(newWidth));
      this.img.setAttribute("height", String(newHeight));
    };

    const onMouseUp = (e) => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);

      const finalWidth = this.img.offsetWidth;
      const finalHeight = Math.round(finalWidth * ratio);
      const pos = this.getPos();
      if (pos == null) return;

      const attrs = { ...this.node.attrs.originalAttributes };
      attrs.width = String(finalWidth);
      attrs.height = String(finalHeight);
      delete attrs.style;

      this.view.dispatch(
        this.view.state.tr.setNodeMarkup(pos, null, {
          ...this.node.attrs,
          originalAttributes: attrs
        })
      );
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  stopEvent() {
    return false;
  }

  ignoreMutation() {
    return true;
  }

  update(node) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    const attrs = node.attrs.originalAttributes || {};
    for (const attr of [...this.img.attributes]) {
      this.img.removeAttribute(attr.name);
    }
    setImgAttributes(this.img, attrs);
    return true;
  }

  destroy() {
    this.handle.removeEventListener("mousedown", this.onMouseDown);
  }
}
