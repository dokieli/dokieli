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

import { Decoration } from "prosemirror-view";
import { DOMParser } from "prosemirror-model";
import { buildTOC, classifySection, skillInputHTML } from "../../ui/templates/cv.js";
import { collectTerms } from "../../utils/rdfa.js";
import { Icon } from "../../ui/icons.js";
import { fragmentFromString } from "../../utils/html.js";
import { i18n } from "../../i18n.js";
import { createSectionsNavPlugin, isContentDiv, isDocOfType, pmHeadingText, deleteWidget } from "./sectionsNavDecorations.js";

// CV-specific decorations: the section nav (via the shared factory) plus entry add/delete and skill add widgets.

// Sections that hold a list of entries and get an "+ add entry" button.
const REPEATABLE = new Set(["experience", "education", "skills", "talks", "scholarly-communication", "technical-contributions", "awards", "credentials"]);

// Singular entry noun per section, for the "+ Add <entry>" button label.
const entryLabel = (type) => i18n.t(`cv.entry.${type}.label`);

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

// Present sections read from the PM doc (the DOM lags behind the widget render).
function sectionEntries(doc) {
  const entries = new Map();
  doc.forEach((node) => {
    if (!isContentDiv(node)) return;
    node.forEach((child) => {
      if (child.type.name === "section") {
        const type = pmSectionType(child);
        if (type && !entries.has(type)) entries.set(type, { id: child.attrs.originalAttributes?.id || "", heading: pmHeadingText(child).trim() });
      }
    });
  });
  return entries;
}

// Skill-category <dl>s and their end positions (where the "+ add skill" button goes).
// Identified structurally: all <dl> nodes within the skills section.
function skillCategoryNodes(doc) {
  const found = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "section") return true;
    if (pmSectionType(node) !== "skills") return true;
    node.descendants((child, childPos) => {
      if (child.type.name !== "dl") return true;
      found.push({ end: pos + 1 + childPos + 1 + child.content.size });
      return false;
    });
    return false;
  });
  return found;
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

// End-of-content position of each skill <dd> inside the skills section, so
// individual skills are removable (widget placed last, as above).
function skillDdPositions(doc) {
  const positions = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "section") return true;
    if (pmSectionType(node) !== "skills") return true;
    node.descendants((child, childPos) => {
      if (child.type.name !== "dl") return true;
      const dlAbsPos = pos + 1 + childPos;
      let off = dlAbsPos + 1;
      child.forEach((grandchild) => {
        if (grandchild.type.name === "dd") positions.push(off + grandchild.nodeSize - 1);
        off += grandchild.nodeSize;
      });
      return false;
    });
    return false;
  });
  return positions;
}

function entryDeleteDecorations(doc) {
  const decos = [];
  entryLiPositions(doc).forEach((end) => decos.push(deleteWidget(end, "li", i18n.t("cv.button.remove-entry.aria-label"), "do cv-entry-delete")));
  skillDdPositions(doc).forEach((end) => decos.push(deleteWidget(end, "dd", i18n.t("cv.button.remove-skill.aria-label"), "do cv-entry-delete")));
  return decos;
}

// Per skill category <dl>: a "+ add" button at the end to add another skill.
function skillButtonDecorations(doc) {
  return skillCategoryNodes(doc).map((cat) =>
    Decoration.widget(cat.end, (view, getPos) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "do cv-skill-add";
      b.textContent = i18n.t("cv.button.add-skill.textContent");
      b.setAttribute("contenteditable", "false");
      b.addEventListener("mousedown", (e) => e.preventDefault());
      b.addEventListener("click", (e) => {
        e.preventDefault();
        const pos = typeof getPos === "function" ? getPos() : null;
        if (pos == null) return;
        const node = DOMParser.fromSchema(view.state.schema).parse(fragmentFromString(`<dd>${skillInputHTML()}</dd>`));
        view.dispatch(view.state.tr.insert(pos, node).scrollIntoView());
      });
      return b;
    }, { side: 1, ignoreSelection: true, stopEvent: () => true }));
}

export const cvNavDecorationPlugin = createSectionsNavPlugin({
  pluginKeyName: "cvNavDecoration",
  isDoc: (doc) => isDocOfType(doc, /CurriculumVitae/),
  entries: sectionEntries,
  buildNav: (view, present, doc) => buildTOC(view.dom, present, doc),
  // Fold the skill categories and entry/skill counts into the rebuild fingerprint.
  signature: (doc) => `${skillCategoryNodes(doc).map(c => c.end).join(",")}|${entryLiPositions(doc).length}/${skillDdPositions(doc).length}`,
  extraDecorations: (doc) => [...entryButtonDecorations(doc), ...skillButtonDecorations(doc), ...entryDeleteDecorations(doc)],
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
