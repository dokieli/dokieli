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

    // Field protection: a field (the parent of placeholder paragraphs, e.g. a <dd>)
    // must keep ALL of them. Count per field before the transaction; reject if a
    // surviving field has fewer after. This protects every template placeholder
    // (e.g. both organizer and department) from removal, merge or lift, while still
    // letting their text be edited and plain paragraphs (uncounted) be added/removed.
    // A field removed entirely is allowed.
    const fields = new Map();
    state.doc.descendants((node, pos) => {
      if (!node.isTextblock) return;
      if (!node.attrs.originalAttributes?.['data-placeholder']) return;
      const $pos = state.doc.resolve(pos);
      if ($pos.depth < 1) return;
      const open = $pos.before($pos.depth);
      let f = fields.get(open);
      if (!f) { f = { close: $pos.after($pos.depth), count: 0 }; fields.set(open, f); }
      f.count++;
    });
    for (const [open, f] of fields) {
      const start = tr.mapping.map(open, 1);
      const end = tr.mapping.map(f.close, -1);
      if (end <= start) continue; // field removed entirely: allowed
      let now = 0;
      tr.doc.nodesBetween(start, end, (n) => {
        if (n.isTextblock && n.attrs.originalAttributes?.['data-placeholder']) now++;
      });
      if (now < f.count) { rejected = true; break; }
    }
    if (rejected) return false;

    // Protect fixed labels (dt and the date-picker <label>s, both data-i18n) from
    // being modified or typed into. Covers deletions (from < to) and insertions
    // (from === to).
    for (const step of tr.steps) {
      if (typeof step.from !== 'number') continue;
      const from = step.from;
      const to = typeof step.to === 'number' ? step.to : from;
      state.doc.descendants((node, pos) => {
        if (rejected) return false;
        if (node.type.name !== 'dt' && node.type.name !== 'label') return;
        if (!node.attrs.originalAttributes?.['data-i18n']) return;
        const labelFrom = pos + 1;
        const labelTo = pos + node.nodeSize - 1;
        if (from <= labelTo && to >= labelFrom && !tr.mapping.mapResult(pos).deleted) {
          rejected = true;
        }
      });
      if (rejected) break;
    }

    return !rejected;
  },
});
