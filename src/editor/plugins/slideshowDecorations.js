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

import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

// PM's MutationObserver reverts external DOM writes; route .active and rail tops through decorations.
export const slideshowDecorationsKey = new PluginKey("slideshowDecorations");

const THUMB_TOP_BASE = 24;
const THUMB_STRIDE = 152;

function isSlideSection(node) {
  if (node.type.name !== "section") return false;
  const cls = node.attrs.originalAttributes?.class || "";
  return cls.split(/\s+/).includes("slide");
}

// Index of the top-level slide section containing pos, or -1.
function slideIndexAt(doc, pos) {
  let idx = 0;
  let found = -1;
  doc.descendants((node, nodePos) => {
    if (found >= 0) return false;
    if (!isSlideSection(node)) return true;
    if (pos >= nodePos && pos <= nodePos + node.nodeSize) found = idx;
    idx++;
    return false;
  });
  return found;
}

function buildDecorations(doc, activeIndex, mode) {
  const decos = [];
  let idx = 0;
  doc.descendants((node, pos) => {
    if (!isSlideSection(node)) return true;
    if (idx === activeIndex) {
      // In single mode set top:auto so PM overwrites any stale inline top from
      // when this slide was a rail thumb. In full mode leave style empty so
      // the CSS rule `.shower.full .slide { top: 0 }` wins.
      const attrs = mode === "full"
        ? { class: "active", style: "" }
        : { class: "active", style: "top:auto" };
      decos.push(Decoration.node(pos, pos + node.nodeSize, attrs));
    } else if (mode === "full") {
      // Hidden off-screen via CSS; clear any leftover rail top from single mode.
      decos.push(Decoration.node(pos, pos + node.nodeSize, { style: "" }));
    } else {
      const top = THUMB_TOP_BASE + idx * THUMB_STRIDE;
      decos.push(Decoration.node(pos, pos + node.nodeSize, { style: `top:${top}px`, draggable: "true" }));
    }
    idx++;
    return false;
  });
  return DecorationSet.create(doc, decos);
}

export const slideshowDecorationsPlugin = new Plugin({
  key: slideshowDecorationsKey,
  state: {
    init(_, state) {
      return { activeIndex: 0, mode: "single", decorations: buildDecorations(state.doc, 0, "single") };
    },
    apply(tr, value, _oldState, newState) {
      const meta = tr.getMeta(slideshowDecorationsKey);
      let activeIndex = value.activeIndex;
      let mode = value.mode;
      if (meta && typeof meta.activeIndex === "number") {
        activeIndex = meta.activeIndex;
      }
      if (meta && typeof meta.mode === "string") {
        mode = meta.mode;
      }
      // Single mode: the slide holding the caret is the active one.
      if (!meta && mode === "single" && tr.selectionSet) {
        const caretIndex = slideIndexAt(newState.doc, newState.selection.from);
        if (caretIndex >= 0) activeIndex = caretIndex;
      }
      if (tr.docChanged || activeIndex !== value.activeIndex || mode !== value.mode) {
        return { activeIndex, mode, decorations: buildDecorations(newState.doc, activeIndex, mode) };
      }
      return value;
    },
  },
  props: {
    decorations(state) {
      return slideshowDecorationsKey.getState(state).decorations;
    },
  },
  view() {
    return {
      update() {
        window.dispatchEvent(new Event("dokieli:slideshow-decorations-updated"));
      },
    };
  },
});

export function getActiveSlideIndex(view) {
  if (!view) return 0;
  return slideshowDecorationsKey.getState(view.state)?.activeIndex ?? 0;
}

export function setActiveSlideIndex(view, activeIndex) {
  if (!view) return;
  view.dispatch(view.state.tr.setMeta(slideshowDecorationsKey, { activeIndex }));
}

export function setSlideshowMode(view, mode) {
  if (!view) return;
  view.dispatch(view.state.tr.setMeta(slideshowDecorationsKey, { mode }));
}
