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
import Config from "../../config.js";
import { fragmentFromString } from "../../utils/html.js";
import { Icon } from "../../ui/icons.js";

// Shared machinery for template section-nav widget plugins: the nav renders as a PM widget decoration (survives redraws, stays out of serialization); buttons bubble to the handler in ui/templates/sections.js.

export function isContentDiv(node) {
  return node.type.name === "div" && node.attrs.originalAttributes?.id === "content";
}

// The author nav shows right after the top-level heading, falling back to before the sections container.
export function navPos(doc, isContent = isContentDiv) {
  let afterHeading = null;
  let beforeContent = null;
  doc.forEach((node, offset) => {
    if (node.type.name === "heading" && afterHeading === null) {
      afterHeading = offset + node.nodeSize;
    }
    if (isContent(node) && beforeContent === null) {
      beforeContent = offset;
    }
  });
  return afterHeading ?? beforeContent;
}

// Carries a matching rdf:type link somewhere in the doc; checks node attrs and marks (links are marks).
export function isDocOfType(doc, valuePattern) {
  const matches = (a) => !!a && /\brdf:type\b/.test(a.rel || "") &&
    valuePattern.test(`${a.href || ""} ${a.resource || ""}`);
  let found = false;
  doc.descendants((node) => {
    if (found) return false;
    if (matches(node.attrs?.originalAttributes) ||
        node.marks.some((m) => matches(m.attrs?.originalAttributes))) {
      found = true;
    }
    return !found;
  });
  return found;
}

// First heading's text inside a section node (for slug fallbacks).
export function pmHeadingText(section) {
  let text = "";
  section.forEach((child) => {
    if (!text && child.type.name === "heading") text = child.textContent;
  });
  return text;
}

// An author-mode widget button, kept out of the editor's selection/input.
export function widgetButton({ className, label, title = null, onClick }) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = className;
  b.textContent = label;
  if (title) { b.title = title; b.setAttribute("aria-label", title); }
  b.setAttribute("contenteditable", "false");
  b.addEventListener("mousedown", (e) => e.preventDefault());
  b.addEventListener("click", onClick);
  return b;
}

// "+ Add <entry>" widget at the end of a matched section's list (dl or ul), inserting entryHTML (wrapping a fresh list when the section has none).
export function dlEntryAddDecorations(doc, { matchSection, label, entryHTML, className = "do dl-entry-add", transactionMeta = null, listType = "dl" }) {
  const decos = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "section") return true;
    if (!matchSection(node)) return true;

    let listEnd = null;
    node.descendants((child, childPos) => {
      if (child.type.name === listType) { listEnd = pos + 1 + childPos + 1 + child.content.size; return false; }
      return true;
    });
    const wrap = listEnd === null;
    const insertPos = wrap ? pos + 1 + node.content.size : listEnd;

    decos.push(Decoration.widget(insertPos, (view, getPos) =>
      widgetButton({
        className,
        label,
        onClick: (e) => {
          e.preventDefault();
          const p = typeof getPos === "function" ? getPos() : null;
          if (p == null) return;
          const html = wrap ? `<${listType}>${entryHTML()}</${listType}>` : entryHTML();
          const parsed = DOMParser.fromSchema(view.state.schema).parse(fragmentFromString(html));
          const tr = view.state.tr.insert(p, parsed).scrollIntoView();
          if (transactionMeta) tr.setMeta(transactionMeta, true);
          view.dispatch(tr);
        },
      }), { side: 1, ignoreSelection: true, stopEvent: () => true }));
    return false;
  });
  return decos;
}

// Trash button at pos removing the nearest enclosing node of targetType (e.g. an entry <li> or skill <dd>).
export function deleteWidget(pos, targetType, label, className = "do entry-delete") {
  return Decoration.widget(pos, (view, getPos) => {
    const b = trashButton(label, className);
    b.addEventListener("click", (e) => {
      e.preventDefault();
      const p = typeof getPos === "function" ? getPos() : null;
      if (p == null) return;
      const $p = view.state.doc.resolve(p);
      for (let d = $p.depth; d > 0; d--) {
        if ($p.node(d).type.name === targetType) {
          view.dispatch(view.state.tr.delete($p.before(d), $p.after(d)).scrollIntoView());
          return;
        }
      }
    });
    return b;
  }, { side: -1, ignoreSelection: true, stopEvent: () => true });
}

function trashButton(label, className) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = className;
  b.title = label;
  b.setAttribute("aria-label", label);
  b.setAttribute("contenteditable", "false");
  b.addEventListener("mousedown", (e) => e.preventDefault());
  b.appendChild(fragmentFromString(Icon['.fas.fa-trash-alt']));
  return b;
}

// Delete widgets per <dt>/<dd> pair, removing both, or the whole <dl> when the pair is its last content.
export function dlPairDeleteDecorations(doc, { matchSection, label, className = "do entry-delete" }) {
  const decos = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "section") return true;
    if (!matchSection(node)) return true;
    node.descendants((child, childPos) => {
      if (child.type.name !== "dl") return true;
      let off = pos + 1 + childPos + 1;
      child.forEach((entry) => {
        if (entry.type.name === "dt") {
          decos.push(pairDeleteWidget(off + entry.nodeSize - 1, label, className));
        }
        off += entry.nodeSize;
      });
      return false;
    });
    return false;
  });
  return decos;
}

function pairDeleteWidget(pos, label, className) {
  return Decoration.widget(pos, (view, getPos) => {
    const b = trashButton(label, className);
    b.addEventListener("click", (e) => {
      e.preventDefault();
      const p = typeof getPos === "function" ? getPos() : null;
      if (p == null) return;
      const $p = view.state.doc.resolve(p);
      for (let d = $p.depth; d > 0; d--) {
        if ($p.node(d).type.name !== "dt") continue;
        const dl = $p.node(d - 1);
        const index = $p.index(d - 1);
        let from = $p.before(d);
        let to = $p.after(d);
        let removed = 1;
        if (index + 1 < dl.childCount && dl.child(index + 1).type.name === "dd") {
          to += dl.child(index + 1).nodeSize;
          removed++;
        }
        if (dl.type.name === "dl" && dl.childCount - removed <= 0) {
          from = $p.before(d - 1);
          to = $p.after(d - 1);
        }
        view.dispatch(view.state.tr.delete(from, to).scrollIntoView());
        return;
      }
    });
    return b;
  }, { side: -1, ignoreSelection: true, stopEvent: () => true });
}

// Serialize present entries (Map(type -> { id, subs? })) into a signature chunk.
export function entriesSignature(entries) {
  return Array.from(entries, ([t, info]) => {
    const subs = info.subs ? Array.from(info.subs, ([st, sid]) => `${st}:${sid}`).join('+') : '';
    return `${t}:${info.id}${subs ? `(${subs})` : ''}`;
  }).join(',');
}

// Generic section-nav widget plugin; config: pluginKeyName, isDoc(doc), entries(doc), buildNav(view, entries), signature(doc), extraDecorations(doc).
export function createSectionsNavPlugin(config) {
  const pluginKey = new PluginKey(config.pluginKeyName);

  const signature = (doc) => {
    const base = `${Config.Editor?.mode || ""}|${entriesSignature(config.entries(doc))}`;
    return config.signature ? `${base}|${config.signature(doc)}` : base;
  };

  const buildDecorations = (doc) => {
    if (!config.isDoc(doc)) return DecorationSet.empty;

    const pos = navPos(doc, config.isContentNode || isContentDiv);
    if (pos === null) return DecorationSet.empty;

    const present = config.entries(doc);
    const widget = Decoration.widget(pos, (view) => {
      const nav = config.buildNav(view, present);
      nav.contentEditable = "false";
      nav.setAttribute("contenteditable", "false");
      return nav;
    }, {
      side: 1,
      // Keep the cursor and selection out of the widget...
      ignoreSelection: true,
      // ...and let button clicks bubble to the document handler.
      stopEvent: () => true,
    });

    const extras = config.extraDecorations ? config.extraDecorations(doc) : [];
    return DecorationSet.create(doc, [widget, ...extras]);
  };

  return new Plugin({
    key: pluginKey,
    state: {
      init(_, state) {
        return {
          signature: signature(state.doc),
          decorations: buildDecorations(state.doc),
        };
      },
      apply(tr, value, _oldState, newState) {
        if (!tr.docChanged) return value;
        const sig = signature(newState.doc);
        if (sig === value.signature) {
          return { signature: sig, decorations: value.decorations.map(tr.mapping, tr.doc) };
        }
        return { signature: sig, decorations: buildDecorations(newState.doc) };
      },
    },
    props: {
      decorations(state) {
        return pluginKey.getState(state).decorations;
      },
    },
  });
}
