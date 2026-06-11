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
import { buildTOC, classifySection } from "../../cv.js";
import { collectTerms } from "../../utils/rdfa.js";
import { Icon } from "../../ui/icons.js";
import { fragmentFromString } from "../../utils/html.js";
import { i18n } from "../../i18n.js";

// Renders the CV nav inside the article (after <details>, before #content) as a
// widget decoration. PM owns the widget DOM, so it survives PM's redraws and
// stays out of serialization — unlike raw DOM dropped into the editable region,
// which PM's MutationObserver reverts. The nav is marked contenteditable=false
// and its events are kept away from the editor; the add/remove buttons bubble to
// the document-level handler wired in initCV().
export const cvNavDecorationKey = new PluginKey("cvNavDecoration");

// Sections that hold a list of entries and get an "+ add entry" button.
const REPEATABLE = new Set(["experience", "education", "skills", "talks", "scholarly-communication", "technical-contributions", "awards", "credentials"]);

// Singular entry noun per section, for the "+ Add <entry>" button label.
const entryLabel = (type) => i18n.t(`cv.entry.${type}.label`);

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

// First heading's text inside a section node (for the classifier's slug fallback).
function pmHeadingText(section) {
  let text = "";
  section.forEach((child) => {
    if (!text && child.type.name === "heading") text = child.textContent;
  });
  return text;
}

// Identify a section PM node's type. The transient marker is preferred here: in
// author mode it is present and authoritative, and it agrees with the RDFa
// whenever the RDFa is present — so this avoids walking the subtree on every
// transaction. Only when the marker is absent do we collect the RDFa terms and
// fall back to the shared classifier (RDFa signal, then heading slug).
function pmSectionType(section) {
  const marker = section.attrs.originalAttributes?.["data-cv-section"];
  const byMarker = classifySection({ marker });
  if (byMarker) return byMarker;
  const terms = collectTerms(
    (cb) => section.descendants((node) => { cb(node); return true; }),
    (node, name) => node.attrs?.originalAttributes?.[name]
  );
  return classifySection({ terms, headingText: pmHeadingText(section) });
}

// Present sections as [type, id] pairs, in document order, read from the PM doc
// (the source of truth). type comes from pmSectionType, id is the heading-derived
// anchor. buildTOC must not probe view.dom: the widget renders before the
// #content sections after it are painted, so the DOM lags a step.
function sectionEntries(doc) {
  const entries = [];
  doc.forEach((node) => {
    if (!isContentDiv(node)) return;
    node.forEach((child) => {
      if (child.type.name === "section") {
        const type = pmSectionType(child);
        if (type) entries.push([type, child.attrs.originalAttributes?.id || ""]);
      }
    });
  });
  return entries;
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
  const secs = sectionEntries(doc).map(([t, id]) => `${t}:${id}`).join(",");
  const entries = `${entryLiPositions(doc).length}/${skillDdPositions(doc).length}`;
  return `${Config.Editor?.mode || ""}|${secs}|${cats}|${entries}`;
}

function buildDecorations(doc) {
  if (!isCVDoc(doc)) return DecorationSet.empty;

  const pos = navPos(doc);
  if (pos === null) return DecorationSet.empty;

  const presentTypes = new Map(sectionEntries(doc));
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
  return DecorationSet.create(doc, [widget, ...entryDecos, ...skillButtonDecorations(doc), ...entryDeleteDecorations(doc)]);
}

// Position at the END of each entry <li>'s content (section > div > ul > li),
// where the delete widget goes. Placing it last (not first) keeps the entry's
// first child first, so CSS like `li > p:first-child { display: inline }` still
// applies. Nested user lists deeper in a description are left alone.
function entryLiPositions(doc) {
  const positions = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "section") return true;
    const type = pmSectionType(node);
    if (!REPEATABLE.has(type)) return false;
    let off = pos + 1;
    node.forEach((child) => {
      if (child.type.name === "div" || child.type.name === "descriptionDiv") {
        let o2 = off + 1;
        child.forEach((gc) => {
          if (gc.type.name === "ul") {
            let o3 = o2 + 1;
            gc.forEach((li) => {
              if (li.type.name === "li") positions.push(o3 + li.nodeSize - 1);
              o3 += li.nodeSize;
            });
          }
          o2 += gc.nodeSize;
        });
      }
      off += child.nodeSize;
    });
    return false;
  });
  return positions;
}

// End-of-content position of each skill <dd> inside a skill-category <dl>, so
// individual skills are removable (widget placed last, as above).
function skillDdPositions(doc) {
  const positions = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "dl") return true;
    const cls = node.attrs.originalAttributes?.class || "";
    if (!cls.split(/\s+/).includes("skill-category")) return true;
    let off = pos + 1;
    node.forEach((child) => {
      if (child.type.name === "dd") positions.push(off + child.nodeSize - 1);
      off += child.nodeSize;
    });
    return false;
  });
  return positions;
}

// A small red delete button pinned top-right of an entry. Placed at the entry's
// content start; on click, resolves its live position and removes the nearest
// enclosing node of targetType (the <li> entry, or a skill <dd>).
function deleteWidget(pos, targetType, label) {
  return Decoration.widget(pos, (view, getPos) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "do cv-entry-delete";
    b.title = label;
    b.setAttribute("aria-label", label);
    b.setAttribute("contenteditable", "false");
    b.appendChild(fragmentFromString(Icon['.fas.fa-trash-alt']));
    b.addEventListener("mousedown", (e) => e.preventDefault());
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

function entryDeleteDecorations(doc) {
  const decos = [];
  entryLiPositions(doc).forEach((end) => decos.push(deleteWidget(end, "li", i18n.t("cv.button.remove-entry.aria-label"))));
  skillDdPositions(doc).forEach((end) => decos.push(deleteWidget(end, "dd", i18n.t("cv.button.remove-skill.aria-label"))));
  return decos;
}

// Per skill-category: a "+ add" button at the category's end to add another skill.
function skillButtonDecorations(doc) {
  return skillCategoryNodes(doc).map((cat) =>
    Decoration.widget(cat.end, () => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "do cv-skill-add";
      b.dataset.target = cat.id;
      b.textContent = i18n.t("cv.button.add-skill.textContent");
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
    const attrs = node.attrs.originalAttributes || {};
    const type = pmSectionType(node);
    if (!REPEATABLE.has(type)) return false;
    const end = pos + 1 + node.content.size;
    decos.push(Decoration.widget(end, () => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "do cv-entry-add";
      b.dataset.type = type;
      b.dataset.sectionId = attrs.id || "";
      b.textContent = i18n.t("cv.button.add-entry.textContent", { label: entryLabel(type) });
      b.setAttribute("contenteditable", "false");
      return b;
    }, { side: 1, ignoreSelection: true, stopEvent: () => true }));
    return false;
  });
  return decos;
}
