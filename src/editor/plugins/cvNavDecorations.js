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
import Config from "../../config.js";
import { buildTOC } from "../../cv.js";

// Renders the CV nav inside the article (after <details>, before #content) as a
// widget decoration. PM owns the widget DOM, so it survives PM's redraws and
// stays out of serialization — unlike raw DOM dropped into the editable region,
// which PM's MutationObserver reverts. The nav is marked contenteditable=false
// and its events are kept away from the editor; the add/remove buttons bubble to
// the document-level handler wired in initCV().
export const cvNavDecorationKey = new PluginKey("cvNavDecoration");

// Sections that hold a list of entries and get an "+ add entry" button.
const REPEATABLE = new Set(["experience", "education", "skills", "talks", "scholarly-articles", "technical-contributions", "awards", "credentials"]);

// Friendlier entry-button labels (default is "+ Add <id>").
const ENTRY_LABELS = { skills: "Skill Category" };

function isContentDiv(node) {
  return node.type.name === "div" && node.attrs.originalAttributes?.id === "content";
}

// The doc top-level holds [details, div#content]; the nav goes right after the
// details node, falling back to before #content when there is no details.
function navPos(doc) {
  let afterDetails = null;
  let beforeContent = null;
  doc.forEach((node, offset) => {
    if (node.type.name === "details" && afterDetails === null) {
      afterDetails = offset + node.nodeSize;
    }
    if (isContentDiv(node) && beforeContent === null) {
      beforeContent = offset;
    }
  });
  return afterDetails ?? beforeContent;
}

// Carries the CurriculumVitae rdf:type link somewhere in the document details.
// The link is an <a> mark, not a node, so check both node attrs (for resource
// on a wrapping element) and the marks on each node.
function isCVType(a) {
  return !!a && /\brdf:type\b/.test(a.rel || "") &&
    /CurriculumVitae/.test(`${a.href || ""} ${a.resource || ""}`);
}

function isCVDoc(doc) {
  let found = false;
  doc.descendants((node) => {
    if (found) return false;
    if (isCVType(node.attrs?.originalAttributes) ||
        node.marks.some((m) => isCVType(m.attrs?.originalAttributes))) {
      found = true;
    }
    return !found;
  });
  return found;
}

// Present section ids, in document order, read from the PM doc (the source of
// truth). buildTOC must not probe view.dom: the widget renders before the
// #content sections after it are painted, so the DOM lags a step.
function sectionIds(doc) {
  const ids = [];
  doc.forEach((node) => {
    if (!isContentDiv(node)) return;
    node.forEach((child) => {
      if (child.type.name === "section") {
        const id = child.attrs.originalAttributes?.id;
        if (id) ids.push(id);
      }
    });
  });
  return ids;
}

// Skill-category <dl>s and their end positions (where the "+ add skill" button goes).
function skillCategoryNodes(doc) {
  const found = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "dl") return true;
    const cls = node.attrs.originalAttributes?.class || "";
    if (cls.split(/\s+/).includes("skill-category")) {
      found.push({ id: node.attrs.originalAttributes?.id || "", end: pos + 1 + node.content.size });
      return false;
    }
    return true;
  });
  return found;
}

// Cheap fingerprint of everything the nav's contents depend on: the present
// sections (in order), the skill categories, and the editor mode. Rebuild the
// DecorationSet only when this changes; otherwise map the existing one so we
// don't re-render on every keystroke.
function navSignature(doc) {
  const cats = skillCategoryNodes(doc).map(c => c.id).join(",");
  return `${Config.Editor?.mode || ""}|${sectionIds(doc).join(",")}|${cats}`;
}

function buildDecorations(doc) {
  if (!isCVDoc(doc)) return DecorationSet.empty;

  const pos = navPos(doc);
  if (pos === null) return DecorationSet.empty;

  const presentTypes = new Set(sectionIds(doc));
  const widget = Decoration.widget(pos, (view) => {
    const nav = buildTOC(view.dom, presentTypes);
    nav.contentEditable = "false";
    nav.setAttribute("contenteditable", "false");
    return nav;
  }, {
    side: 1,
    // Keep the cursor and selection out of the widget...
    ignoreSelection: true,
    // ...and let button clicks bubble to the document handler instead of being
    // treated as editor input.
    stopEvent: () => true,
  });

  const entryDecos = entryButtonDecorations(doc);
  return DecorationSet.create(doc, [widget, ...entryDecos, ...skillButtonDecorations(doc)]);
}

// Per skill-category: a "+ add" button at the category's end to add another skill.
function skillButtonDecorations(doc) {
  return skillCategoryNodes(doc).map((cat) =>
    Decoration.widget(cat.end, () => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "do cv-skill-add";
      b.dataset.target = cat.id;
      b.textContent = "+ Add";
      b.setAttribute("contenteditable", "false");
      return b;
    }, { side: 1, ignoreSelection: true, stopEvent: () => true }));
}

export const cvNavDecorationPlugin = new Plugin({
  key: cvNavDecorationKey,
  state: {
    init(_, state) {
      return {
        signature: navSignature(state.doc),
        decorations: buildDecorations(state.doc),
      };
    },
    apply(tr, value, _oldState, newState) {
      if (!tr.docChanged) return value;
      const signature = navSignature(newState.doc);
      if (signature === value.signature) {
        return { signature, decorations: value.decorations.map(tr.mapping, tr.doc) };
      }
      return { signature, decorations: buildDecorations(newState.doc) };
    },
  },
  props: {
    decorations(state) {
      return cvNavDecorationKey.getState(state).decorations;
    },
  },
});

function entryButtonDecorations(doc) {
  const decos = [];
  doc.descendants((node, pos) => {
    // Descend into containers (e.g. div#content) to reach the sections inside.
    if (node.type.name !== "section") return true;
    const id = node.attrs.originalAttributes?.id;
    if (!REPEATABLE.has(id)) return false;
    const end = pos + 1 + node.content.size;
    decos.push(Decoration.widget(end, () => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "do cv-entry-add";
      b.dataset.type = id;
      b.textContent = `+ Add ${ENTRY_LABELS[id] || id}`;
      b.setAttribute("contenteditable", "false");
      return b;
    }, { side: 1, ignoreSelection: true, stopEvent: () => true }));
    return false;
  });
  return decos;
}
