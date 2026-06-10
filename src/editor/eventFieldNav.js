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

// Tab/arrow navigation between the fields of a CV event card (experience,
// education, talks). Bridges PM text fields (name/organizer/description) and the
// native inputs (location autocomplete, date pickers) so Tab moves field to field
// and arrows can step into an input. Only active inside an event <dl>.

import { TextSelection } from "prosemirror-state";

function isEventDl(node) {
  if (node.type.name !== "dl") return false;
  const t = node.attrs.originalAttributes?.typeof || "";
  return /(^|\s)schema:\w*Event(\s|$)/.test(t);
}

export function eventDlAt(state, pos) {
  const $pos = state.doc.resolve(Math.max(0, Math.min(pos, state.doc.content.size)));
  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d);
    if (isEventDl(node)) return { node, pos: $pos.before(d) };
  }
  return null;
}

// Ordered tab stops inside the event: PM text fields and native inputs alike.
function collectTargets(view, dl) {
  const targets = [];
  dl.node.descendants((node, relPos) => {
    const pos = dl.pos + 1 + relPos;
    if (node.type.name === "input" || node.type.name === "autocomplete") {
      const dom = view.nodeDOM(pos);
      const input = node.type.name === "autocomplete"
        ? (dom && dom.querySelector ? dom.querySelector("input") : null)
        : dom;
      if (input) targets.push({ kind: "dom", pos, input });
      return false;
    }
    if (node.isTextblock && node.attrs.originalAttributes?.["data-placeholder"]) {
      targets.push({ kind: "pm", pos });
      return false;
    }
    return true;
  });
  return targets;
}

function focusTarget(view, t) {
  if (!t) return false;
  if (t.kind === "dom") {
    t.input.focus();
    try { t.input.select(); } catch (_) {}
    return true;
  }
  const at = view.state.doc.resolve(t.pos + 1);
  view.dispatch(view.state.tr.setSelection(TextSelection.near(at)).scrollIntoView());
  view.focus();
  return true;
}

// Move from the field at fromPos to the dir-adjacent one (dir = +1 / -1).
// kindFilter, when given, only moves if the neighbour matches (e.g. "dom" so
// arrows only step *into* an input, leaving text-to-text movement to PM).
export function moveField(view, fromPos, dir, kindFilter = null) {
  const dl = eventDlAt(view.state, fromPos);
  if (!dl) return false;
  const targets = collectTargets(view, dl);
  const idx = targets.findIndex((t) => t.pos === fromPos);
  if (idx === -1) return false;
  const next = targets[idx + dir];
  if (!next) return false;
  if (kindFilter && next.kind !== kindFilter) return false;
  return focusTarget(view, next);
}
