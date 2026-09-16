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
import { DOMParser } from "prosemirror-model";
import { fragmentFromString } from "../../utils/html.js";
import { widgetButton } from "./sectionsNavDecorations.js";
import { documentTypeSelectHTML } from "../../ui/templates/shared.js";

// Author-mode controls for the Document Type dl (#document-type): a "−" per
// entry and a "+ Add type" at the end, mirroring the sections nav buttons.
// The selects themselves persist via tableTools' data-select change handling.

function findDocumentTypeDl(doc) {
  let found = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (node.type.name === 'dl' && (node.attrs.originalAttributes || {}).id === 'document-type') {
      found = { node, pos };
      return false;
    }
    return true;
  });
  return found;
}

function removeEntryWidget(pos) {
  return Decoration.widget(pos, (view, getPos) =>
    widgetButton({
      className: 'do document-type-remove',
      label: '−',
      title: 'Remove type',
      onClick: (e) => {
        e.preventDefault();
        const p = typeof getPos === 'function' ? getPos() : null;
        if (p == null) return;
        const $p = view.state.doc.resolve(p);
        for (let d = $p.depth; d > 0; d--) {
          if ($p.node(d).type.name === 'dd') {
            view.dispatch(view.state.tr.delete($p.before(d), $p.after(d)).scrollIntoView());
            return;
          }
        }
      },
    }), { side: 1, ignoreSelection: true, stopEvent: () => true });
}

function addEntryWidget(pos) {
  return Decoration.widget(pos, (view, getPos) =>
    widgetButton({
      className: 'do document-type-add',
      label: '+ Add type',
      onClick: (e) => {
        e.preventDefault();
        const p = typeof getPos === 'function' ? getPos() : null;
        if (p == null) return;
        const parsed = DOMParser.fromSchema(view.state.schema).parse(fragmentFromString(`<dd><p>${documentTypeSelectHTML()}</p></dd>`));
        view.dispatch(view.state.tr.insert(p, parsed).scrollIntoView());
      },
    }), { side: 1, ignoreSelection: true, stopEvent: () => true });
}

function buildDecorations(doc) {
  const dl = findDocumentTypeDl(doc);
  if (!dl) return DecorationSet.empty;

  const decos = [];
  let off = dl.pos + 1;
  dl.node.forEach((child) => {
    if (child.type.name === 'dd') {
      // Right after the entry's select, so the button sits beside it, not below.
      let wpos = off + child.nodeSize - 1;
      child.descendants((n, dpos) => {
        if (n.type.name !== 'select') return true;
        wpos = off + 1 + dpos + n.nodeSize;
        return false;
      });
      decos.push(removeEntryWidget(wpos));
    }
    off += child.nodeSize;
  });
  decos.push(addEntryWidget(dl.pos + 1 + dl.node.content.size));

  return DecorationSet.create(doc, decos);
}

export const documentTypeToolsPlugin = new Plugin({
  key: new PluginKey('documentTypeTools'),
  state: {
    init: (_config, state) => buildDecorations(state.doc),
    apply: (tr, decos, _oldState, newState) => tr.docChanged ? buildDecorations(newState.doc) : decos,
  },
  props: {
    decorations(state) { return this.getState(state); },
  },
});
