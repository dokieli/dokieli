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

import { Plugin } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { i18n } from "../../i18n.js";

function hasClass(node, name) {
  const cls = node?.attrs?.originalAttributes?.class || "";
  return cls.split(/\s+/).includes(name);
}

function getPlaceholder(node, $pos) {
  const parent = $pos.parent;
  const grandparent = $pos.depth >= 1 ? $pos.node($pos.depth - 1) : null;

  if (node.type.name === "p" && parent?.type.name === "descriptionDiv") {
    if (parent.childCount > 1) return null;
    if (grandparent?.type.name === "section" && hasClass(grandparent, "slide")) {
      return i18n.t("editor.new-slideshow.p.data-placeholder");
    }
    return i18n.t("editor.new.p.data-placeholder");
  }

  if (
    node.type.name === "heading" &&
    node.attrs.level >= 2 &&
    parent?.type.name === "section"
  ) {
    if (hasClass(parent, "slide")) {
      return i18n.t("editor.new-slideshow.h2.data-placeholder");
    }
    return i18n.t("editor.new.h1.data-placeholder");
  }

  if (
    node.type.name === "heading" &&
    node.attrs.level === 1 &&
    (parent?.type.name === "article" || parent?.type.name === "doc")
  ) {
    return i18n.t("editor.new.h1.data-placeholder");
  }

  if (
    node.type.name === "heading" &&
    node.attrs.level === 1 &&
    parent?.type.name === "header" &&
    hasClass(parent, "caption")
  ) {
    return "Presentation title";
  }

  return null;
}

function placeholderWidget(text) {
  const span = document.createElement("span");
  span.className = "editor-placeholder";
  span.textContent = text;
  span.setAttribute("aria-hidden", "true");
  span.contentEditable = "false";
  return span;
}

export const placeholderPlugin = new Plugin({
  props: {
    decorations(state) {
      const { doc, selection } = state;
      const decorations = [];
      const decoratedPositions = new Set();

      const addPlaceholder = (pos, node, text) => {
        decorations.push(
          Decoration.node(pos, pos + node.nodeSize, {
            class: "editor-empty-node",
          })
        );
        decorations.push(
          Decoration.widget(pos + 1, () => placeholderWidget(text), {
            side: 1,
            ignoreSelection: true,
          })
        );
      };

      doc.descendants((node, pos) => {
        if (!node.isTextblock) return;
        if (node.content.size > 0) return;

        const $pos = doc.resolve(pos);
        const placeholder = getPlaceholder(node, $pos);
        if (!placeholder) return;

        addPlaceholder(pos, node, placeholder);
        decoratedPositions.add(pos);
      });

      const { $from } = selection;
      const parentNode = $from.parent;
      if (parentNode.type.name === "p" && parentNode.content.size === 0) {
        const pos = $from.before($from.depth);
        if (!decoratedPositions.has(pos)) {
          addPlaceholder(pos, parentNode, i18n.t("editor.placeholder.slash-hint"));
        }
      }

      return DecorationSet.create(doc, decorations);
    },
  },
});
