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
import { fragmentFromString, selectArticleNode } from "../../utils/html.js";
import { numberTree, tocHTML } from "../../ui/toc.js";
import { SELF_LINK_CLASS } from "../../ui/selfLinks.js";
import { selfLinksEnabledForRoot, templateForRoot, tocEnabledForRoot, tocSchemeForRoot, unnumberedIdsForRoot } from "../../ui/templates/sections.js";
import { navPos } from "./sectionsNavDecorations.js";
import { i18n } from "../../i18n.js";

// Section numbers and self-links as widget decorations: out of the document, so never
// editable or serialized. The markup itself is written on save (ui/anchors.js).

export const documentAnchorsPluginKey = new PluginKey("documentAnchors");

// Wrappers a section can sit inside; template markup nests subsections in a descriptionDiv.
const CONTAINER_TYPES = new Set(["div", "descriptionDiv", "header", "main", "article", "body"]);

// Would render an anchor where it cannot live.
const SKIP_TYPES = new Set(["text", "img", "br", "hr", "input", "select", "textarea", "a", "anchor", "button", "form"]);

function nodeId(node) {
  return node.attrs?.originalAttributes?.id || null;
}

function nodeClass(node) {
  return node.attrs?.originalAttributes?.class || "";
}

function pmSectionHeading(section) {
  let heading = null;
  section.forEach((child) => {
    if (!heading && child.type.name === "heading") heading = child;
  });
  return heading;
}

// Section tree over the PM doc, descending through plain containers.
function pmSectionTree(fragment, pos) {
  const nodes = [];
  fragment.forEach((node, offset) => {
    const nodePos = pos + offset;
    if (node.type.name === "section") {
      const className = nodeClass(node);
      if (/\bslide\b/.test(className)) return;
      // An emptied heading is mid-edit: no number parked on it until it is named again.
      const heading = pmSectionHeading(node);
      if (heading && !heading.textContent.trim()) return;
      nodes.push({
        id: nodeId(node) || "",
        pos: nodePos,
        node,
        role: /\bintroductory\b/.test(className) ? "introductory"
          : /\bappendix\b/.test(className) ? "appendix"
          : "numbered",
        children: pmSectionTree(node.content, nodePos + 1),
      });
    }
    else if (CONTAINER_TYPES.has(node.type.name)) {
      nodes.push(...pmSectionTree(node.content, nodePos + 1));
    }
  });
  return nodes;
}

// Just inside the section's first heading, where the number goes.
function headingContentPos(sectionPos, sectionNode) {
  let result = null;
  sectionNode.forEach((child, offset) => {
    if (result === null && child.type.name === "heading") {
      result = sectionPos + 1 + offset + 1;
    }
  });
  return result;
}

// A numbered entry in the shape ui/toc.js renders from.
function toTOCNode(entry) {
  const heading = pmSectionHeading(entry.node);
  return {
    id: entry.id,
    heading: heading?.textContent.trim() || entry.id,
    secno: entry.secno,
    children: entry.children.map(toTOCNode),
  };
}

// Just inside a details' summary, where its self-link goes.
function summaryPos(details, detailsPos) {
  let result = null;
  details.forEach((child, offset) => {
    if (result === null && child.type.name === "summary") {
      result = detailsPos + 1 + offset + 1;
    }
  });
  return result;
}

function secnoWidget(secno) {
  const bdi = document.createElement("bdi");
  bdi.className = "secno";
  bdi.textContent = `${secno} `;
  bdi.setAttribute("contenteditable", "false");
  return bdi;
}

function selfLinkWidget(id) {
  const a = document.createElement("a");
  a.className = SELF_LINK_CLASS;
  a.setAttribute("href", `#${id}`);
  a.setAttribute("contenteditable", "false");
  a.addEventListener("mousedown", (e) => e.preventDefault());
  return a;
}

function anchorDecorations(doc) {
  const decos = [];
  const root = selectArticleNode(document);
  const scheme = tocSchemeForRoot(root);
  const unnumberedIds = unnumberedIdsForRoot(root);

  const tree = numberTree(pmSectionTree(doc.content, 0), scheme, { unnumberedIds });

  // A template-less document shows its own TOC here, read-only, when toggled on.
  if (tocEnabledForRoot(root) && !templateForRoot(root)) {
    const html = tocHTML(tree.map(toTOCNode), { label: i18n.t('toc.h2.textContent'), scheme, allowEmpty: true });
    const pos = tree.length ? tree[0].pos : navPos(doc);
    if (html && pos != null) {
      decos.push(Decoration.widget(pos, () => {
        const nav = fragmentFromString(html).firstElementChild;
        nav.classList.add('do');
        nav.setAttribute('contenteditable', 'false');
        return nav;
        // The markup is the key, so a renamed heading redraws it.
      }, { side: -3, ignoreSelection: true, key: `do-toc-${html}`, stopEvent: () => true }));
    }
  }

  const numbers = (list) => {
    list.forEach((entry) => {
      if (entry.secno) {
        const pos = headingContentPos(entry.pos, entry.node);
        if (pos !== null) {
          decos.push(Decoration.widget(pos, () => secnoWidget(entry.secno), { side: -1, ignoreSelection: true, key: `secno-${entry.id}-${entry.secno}`, stopEvent: () => true }));
        }
      }
      numbers(entry.children);
    });
  };
  numbers(tree);

  if (!selfLinksEnabledForRoot(root)) return decos;

  doc.descendants((node, pos) => {
    // Blocks, plus inline nodes holding inline content (a span carrying an id).
    if (SKIP_TYPES.has(node.type.name) || !(node.isBlock || node.inlineContent)) return true;
    const id = nodeId(node);
    if (!id) return true;
    if (/\bdo\b/.test(nodeClass(node))) return true;
    // An empty textblock shows its placeholder at the block start; an anchor would sit under it.
    if (node.isTextblock && node.content.size === 0) return true;
    // A details hands its anchor to its summary.
    if (node.type.name === "details") {
      const summary = summaryPos(node, pos);
      if (summary !== null) {
        decos.push(Decoration.widget(summary, () => selfLinkWidget(id), { side: -2, ignoreSelection: true, key: `self-link-${id}`, stopEvent: () => true }));
        return true;
      }
    }
    // side -2 keeps it ahead of a section number at the same position.
    decos.push(Decoration.widget(pos + 1, () => selfLinkWidget(id), { side: -2, ignoreSelection: true, key: `self-link-${id}`, stopEvent: () => true }));
    return true;
  });

  return decos;
}

export const documentAnchorsPlugin = new Plugin({
  key: documentAnchorsPluginKey,
  state: {
    init(_, state) {
      return DecorationSet.create(state.doc, anchorDecorations(state.doc));
    },
    apply(tr, value, oldState, newState) {
      if (!tr.docChanged && !tr.getMeta(documentAnchorsPluginKey)) return value;
      return DecorationSet.create(newState.doc, anchorDecorations(newState.doc));
    },
  },
  props: {
    decorations(state) {
      return this.getState(state);
    },
  },
});
