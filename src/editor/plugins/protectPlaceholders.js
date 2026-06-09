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

export const protectPlaceholdersPlugin = new Plugin({
  filterTransaction(tr, state) {
    if (!tr.docChanged) return true;
    // Allow internal structural repairs (appendTransaction plugins, etc.)
    if (tr.getMeta('addToHistory') === false) return true;

    let rejected = false;

    // Protect nodes with data-placeholder from deletion while their parent survives.
    // Uses mapResult to detect whether a node's position was inside a deleted range.
    state.doc.descendants((node, pos) => {
      if (rejected) return false;
      if (!node.attrs.originalAttributes?.['data-placeholder']) return;
      if (!tr.mapping.mapResult(pos).deleted) return;
      try {
        const $pos = state.doc.resolve(pos + 1);
        if ($pos.depth < 2) return;
        // $pos.before(depth - 1) is the opening-token position of the direct parent.
        if (!tr.mapping.mapResult($pos.before($pos.depth - 1)).deleted) rejected = true;
      } catch (_) {}
    });
    if (rejected) return false;

    // Protect dt[data-i18n] label content from being modified or typed into.
    // Covers both deletions (from < to) and insertions (from === to).
    for (const step of tr.steps) {
      if (typeof step.from !== 'number') continue;
      const from = step.from;
      const to = typeof step.to === 'number' ? step.to : from;
      state.doc.descendants((node, pos) => {
        if (rejected) return false;
        if (node.type.name !== 'dt') return;
        if (!node.attrs.originalAttributes?.['data-i18n']) return;
        const dtFrom = pos + 1;
        const dtTo = pos + node.nodeSize - 1;
        if (from <= dtTo && to >= dtFrom && !tr.mapping.mapResult(pos).deleted) {
          rejected = true;
        }
      });
      if (rejected) break;
    }

    return !rejected;
  },
});
