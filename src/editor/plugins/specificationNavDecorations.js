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
import { Decoration } from "prosemirror-view";
import { DOMParser } from "prosemirror-model";
import { createSectionsNavPlugin, isDocOfType, pmHeadingText, dlEntryAddDecorations, dlPairDeleteDecorations, widgetButton } from "./sectionsNavDecorations.js";
import { slugify } from "./autoId.js";
import { fragmentFromString } from "../../utils/html.js";
import { i18n } from "../../i18n.js";
import { buildSectionsNav } from "../../ui/templates/sections.js";
import {
  specificationSections, isSpecification, classifySpecificationSection, classifySpecificationSubsection, SPEC_SUBSECTIONS,
  SPEC_CATEGORIES, categoryDefinitionHTML, considerationsDefinitionHTML, termEntryHTML, productClassEntryHTML, interoperabilityEntryHTML,
  conceptId, interoperabilityId, applyReportTypeChrome,
} from "../../ui/templates/specification.js";

// A section PM node matching a well-known key, by id or heading slug.
function isSectionOf(node, key) {
  const id = node.attrs.originalAttributes?.id;
  if (id === key) return true;
  return slugify(pmHeadingText(node).trim()) === key;
}

// Sections live at the doc top level (the outline model); the nav's fallback
// anchor is the first section.
function isSpecificationContent(node) {
  return node.type.name === 'section';
}

// Present sections read from the PM doc (the DOM lags behind the widget render).
function sectionEntries(doc) {
  const entries = new Map();
  const registerDetails = (node) => {
    if (!entries.has('document-details')) {
      entries.set('document-details', { id: node.attrs.originalAttributes?.id || 'document-details' });
    }
  };
  doc.forEach((node) => {
    // The details block sits inside div.head (or at the top level in older documents).
    if (node.type.name === 'details') { registerDetails(node); return; }
    if (node.type.name === 'div') {
      node.forEach((child) => { if (child.type.name === 'details') registerDetails(child); });
      return;
    }
    if (node.type.name !== 'section') return;
    const id = node.attrs.originalAttributes?.id;
    const type = classifySpecificationSection({ id, headingText: pmHeadingText(node) });
    if (!type || entries.has(type)) return;
    const info = { id: id || type };
    if (SPEC_SUBSECTIONS[type]) {
      info.subs = new Map();
      node.descendants((sub) => {
        if (sub.type.name !== 'section') return true;
        const subId = sub.attrs.originalAttributes?.id;
        const subType = classifySpecificationSubsection(type, { id: subId, headingText: pmHeadingText(sub) });
        if (subType && !info.subs.has(subType)) info.subs.set(subType, subId || subType);
        return false;
      });
    }
    entries.set(type, info);
  });
  return entries;
}

// The names of the defined product classes, read from the classes-of-products <dl>'s <dt>s.
function productClassNames(doc) {
  const names = [];
  doc.descendants((node) => {
    if (node.type.name !== 'section') return true;
    if (!isSectionOf(node, 'classes-of-products')) return true;
    node.descendants((child) => {
      if (child.type.name === 'dt') {
        const text = child.textContent.trim();
        if (text && !names.includes(text)) names.push(text);
      }
      return child.type.name !== 'dt';
    });
    return false;
  });
  return names;
}

// The Specification Category definition <p> node and the categories asserted in it.
function categoryDefinition(doc) {
  let found = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (node.type.name !== 'section') return true;
    if (!isSectionOf(node, 'specification-category')) return true;
    node.descendants((child, childPos) => {
      if (found) return false;
      if (child.isTextblock && child.attrs.originalAttributes?.id === 'specification-category-definition') {
        found = { node: child, pos: pos + 1 + childPos };
      }
      return !found;
    });
    return false;
  });
  if (!found) return null;

  // Category spans can surface as inline nodes or marks; read attributes from both.
  const selected = new Set();
  const collect = (attrs) => {
    if (attrs && /\bskos:hasTopConcept\b/.test(attrs.rel || '') && (attrs.resource || '').startsWith('spec:')) {
      selected.add(attrs.resource.slice('spec:'.length));
    }
  };
  found.node.descendants((child) => {
    collect(child.attrs?.originalAttributes);
    child.marks.forEach((m) => collect(m.attrs?.originalAttributes));
    return true;
  });
  return { ...found, selected };
}

// Category checkboxes; toggling rewrites the definition sentence with skos:hasTopConcept spans (AC markup).
function categoryCheckboxDecorations(doc) {
  const def = categoryDefinition(doc);
  if (!def) return [];

  return [Decoration.widget(def.pos + def.node.nodeSize, (view, getPos) => {
    const wrapper = document.createElement('ul');
    wrapper.className = 'do category-checkboxes';
    wrapper.setAttribute('contenteditable', 'false');

    Object.entries(SPEC_CATEGORIES).forEach(([key, labelText]) => {
      const id = `spec-category-${key}`;
      const li = document.createElement('li');

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = id;
      input.checked = def.selected.has(key);
      input.addEventListener('change', () => {
        const current = categoryDefinition(view.state.doc);
        if (!current) return;
        const selected = new Set(current.selected);
        if (input.checked) selected.add(key); else selected.delete(key);
        const ordered = Object.keys(SPEC_CATEGORIES).filter(k => selected.has(k));
        const parsed = DOMParser.fromSchema(view.state.schema).parse(fragmentFromString(categoryDefinitionHTML(ordered)));
        view.dispatch(view.state.tr.replaceWith(current.pos, current.pos + current.node.nodeSize, parsed.content));
      });

      const label = document.createElement('label');
      label.setAttribute('for', id);
      label.textContent = labelText;

      li.appendChild(input);
      li.appendChild(label);
      wrapper.appendChild(li);
    });

    return wrapper;
  }, { side: 1, ignoreSelection: true, stopEvent: () => true })];
}

// Interoperability pair widget: two product-class dropdowns inserting a "X–Y interoperability" dt/dd pair.
function interoperabilityDecorations(doc) {
  const classes = productClassNames(doc);
  if (classes.length < 2) return [];

  let target = null;
  doc.descendants((node, pos) => {
    if (target) return false;
    if (node.type.name !== 'section') return true;
    if (!isSectionOf(node, 'interoperability')) return true;
    let dlEnd = null;
    node.descendants((child, childPos) => {
      if (child.type.name === 'dl') { dlEnd = pos + 1 + childPos + 1 + child.content.size; return false; }
      return true;
    });
    target = { pos: dlEnd ?? (pos + 1 + node.content.size), wrap: dlEnd === null };
    return false;
  });
  if (!target) return [];

  return [Decoration.widget(target.pos, (view, getPos) => {
    const wrapper = document.createElement('span');
    wrapper.className = 'do interoperability-add';
    wrapper.setAttribute('contenteditable', 'false');

    const select = () => {
      const s = document.createElement('select');
      classes.forEach((name) => {
        const o = document.createElement('option');
        o.value = name;
        o.textContent = name;
        s.appendChild(o);
      });
      return s;
    };
    const a = select();
    const b = select();
    if (b.options.length > 1) b.selectedIndex = 1;

    wrapper.appendChild(a);
    wrapper.appendChild(document.createTextNode('–'));
    wrapper.appendChild(b);
    wrapper.appendChild(widgetButton({
      className: 'do dl-entry-add',
      label: i18n.t('specification.button.add-interoperability.textContent'),
      onClick: (e) => {
        e.preventDefault();
        if (!a.value || !b.value || a.value === b.value) return;
        const p = typeof getPos === 'function' ? getPos() : null;
        if (p == null) return;
        const entry = interoperabilityEntryHTML(a.value, b.value);
        const html = target.wrap ? `<dl>${entry}</dl>` : entry;
        const parsed = DOMParser.fromSchema(view.state.schema).parse(fragmentFromString(html));
        view.dispatch(view.state.tr.insert(p, parsed).scrollIntoView().setMeta(SYNC_META, true));
      },
    }));

    return wrapper;
  }, { side: 1, ignoreSelection: true, stopEvent: () => true })];
}

function extraDecorations(doc) {
  return [
    ...dlEntryAddDecorations(doc, {
      matchSection: (node) => isSectionOf(node, 'terminology'),
      label: i18n.t('specification.button.add-term.textContent'),
      entryHTML: termEntryHTML,
      transactionMeta: SYNC_META,
    }),
    ...dlEntryAddDecorations(doc, {
      matchSection: (node) => isSectionOf(node, 'classes-of-products'),
      label: i18n.t('specification.button.add-product-class.textContent'),
      entryHTML: productClassEntryHTML,
      transactionMeta: SYNC_META,
    }),
    ...['terminology', 'classes-of-products', 'interoperability'].flatMap((key) =>
      dlPairDeleteDecorations(doc, {
        matchSection: (node) => isSectionOf(node, key),
        label: i18n.t('specification.button.remove-entry.aria-label'),
      })),
    ...categoryCheckboxDecorations(doc),
    ...interoperabilityDecorations(doc),
  ];
}

// Fold product classes, category selection, and managed-dl state into the rebuild fingerprint.
function extraSignature(doc) {
  const classes = productClassNames(doc).join('|');
  const categories = Array.from(categoryDefinition(doc)?.selected || []).join('|');
  // Fingerprint each dt's about/dfn id: the sync rewrites them and widgets inside must rebuild.
  const dts = [];
  doc.descendants((node) => {
    if (node.type.name !== 'dt') return true;
    let markId = '';
    node.forEach((child) => {
      if (markId) return;
      const dfn = child.marks.find((m) => m.type.name === 'dfn');
      markId = dfn?.attrs.originalAttributes?.id || '';
    });
    dts.push(`${node.attrs.originalAttributes?.about || ''}~${markId}`);
    return true;
  });
  // Include the report-type state so the head wrap/unwrap always rebuilds
  // decorations (mapping across the structural replace can drop widgets).
  let headPresent = false;
  doc.forEach((node) => {
    if (node.type.name === 'div' && /\bhead\b/.test(node.attrs.originalAttributes?.class || '')) headPresent = true;
  });
  return `${classes};${categories};${dts.join(',')};${reportTypeValue(doc)}:${headPresent}`;
}

// The article's typeof lives on the mount element; check it alongside the in-doc rdf:type links.
function isSpecificationDoc(doc) {
  if (isDocOfType(doc, /doap#Specification/)) return true;
  const article = document.querySelector('main > article');
  return !!article && isSpecification(article);
}

export const specificationNavDecorationPlugin = createSectionsNavPlugin({
  pluginKeyName: 'specificationNavDecoration',
  isDoc: isSpecificationDoc,
  isContentNode: isSpecificationContent,
  entries: sectionEntries,
  buildNav: (view, present) => buildSectionsNav(specificationSections, view.dom, present),
  signature: extraSignature,
  extraDecorations,
});

// Concept markup sync: completes the AC RDFa of managed dl entries (dfn ids, about/skos attrs, from text) on focus-out; the save transform covers entries still focused at save.

const SYNC_KINDS = [
  ['terminology', 'term'],
  ['classes-of-products', 'concept'],
  ['interoperability', 'interoperability'],
];

const SYNC_META = 'specification-concept-sync';

function desiredFor(kind, text) {
  if (!text) return { markId: null, dtAttrs: {}, ddAttrs: {} };
  const id = kind === 'term' ? `dfn-${slugify(text)}`
    : kind === 'concept' ? conceptId(text)
    : interoperabilityId(text);
  return {
    markId: id,
    dtAttrs: { about: `#${id}`, property: 'skos:prefLabel', typeof: 'skos:Concept' },
    ddAttrs: { about: `#${id}`, property: 'skos:definition' },
  };
}

// Whether every inline child of the dt carries exactly the wanted dfn mark.
function dfnMarkMatches(dtNode, dfnType, markId) {
  let ok = true;
  dtNode.forEach((child) => {
    const mark = child.marks.find((m) => m.type === dfnType);
    if (markId === null ? mark : (!mark || mark.attrs.originalAttributes?.id !== markId)) ok = false;
  });
  return ok;
}

function attrsMatch(node, wanted, managedKeys) {
  const current = node.attrs.originalAttributes || {};
  return managedKeys.every((key) => (current[key] || null) === (wanted[key] || null));
}

function mergeAttrs(node, wanted, managedKeys) {
  const next = { ...(node.attrs.originalAttributes || {}) };
  managedKeys.forEach((key) => {
    if (wanted[key]) next[key] = wanted[key];
    else delete next[key];
  });
  return { ...node.attrs, originalAttributes: next };
}

export const specificationConceptSyncPlugin = new Plugin({
  props: {
    handleDOMEvents: {
      // Clicks outside the editable region don't move the selection; a blur ping syncs everything.
      blur(view) {
        view.dispatch(view.state.tr.setMeta(SYNC_META, true));
        return false;
      },
    },
  },
  appendTransaction(transactions, oldState, newState) {
    if (!transactions.length) return null;
    const blurred = transactions.some((t) => t.getMeta(SYNC_META));
    if (!blurred && !transactions.some((t) => t.docChanged || t.selectionSet)) return null;
    if (!isSpecificationDoc(newState.doc)) return null;

    const dfnType = newState.schema.marks.dfn;
    if (!dfnType) return null;
    const sel = newState.selection;

    let tr = null;
    const ensure = () => (tr ||= newState.tr);

    const syncPair = (kind, dt, dd) => {
      const start = dt.pos + 1;
      const end = start + dt.node.content.size;
      // Leave the pair alone while typing in the dt; clicking into its dd counts as leaving it.
      if (!blurred && sel.from <= end && sel.to >= start) return;

      const text = dt.node.textContent.trim();
      const { markId, dtAttrs, ddAttrs } = desiredFor(kind, text);

      if (!dfnMarkMatches(dt.node, dfnType, markId)) {
        ensure().removeMark(start, end, dfnType);
        if (markId) tr.addMark(start, end, dfnType.create({ originalAttributes: { id: markId } }));
      }
      if (!attrsMatch(dt.node, dtAttrs, ['about', 'property', 'typeof'])) {
        ensure().setNodeMarkup(dt.pos, null, mergeAttrs(dt.node, dtAttrs, ['about', 'property', 'typeof']));
      }
      if (dd && !attrsMatch(dd.node, ddAttrs, ['about', 'property'])) {
        ensure().setNodeMarkup(dd.pos, null, mergeAttrs(dd.node, ddAttrs, ['about', 'property']));
      }
    };

    newState.doc.descendants((node, pos) => {
      if (node.type.name !== 'section') return true;
      const kindEntry = SYNC_KINDS.find(([key]) => isSectionOf(node, key));
      if (!kindEntry) return true;
      const kind = kindEntry[1];

      node.descendants((child, childPos) => {
        if (child.type.name !== 'dl') return true;
        const dlPos = pos + 1 + childPos;
        let off = dlPos + 1;
        let pendingDt = null;
        child.forEach((entry) => {
          if (entry.type.name === 'dt') {
            if (pendingDt) syncPair(kind, pendingDt, null);
            pendingDt = { node: entry, pos: off };
          } else if (entry.type.name === 'dd' && pendingDt) {
            syncPair(kind, pendingDt, { node: entry, pos: off });
            pendingDt = null;
          }
          off += entry.nodeSize;
        });
        if (pendingDt) syncPair(kind, pendingDt, null);
        return false;
      });
      return false;
    });

    syncConsiderationsDefinition(newState, sel, blurred, ensure);
    syncReportTypeChrome(newState, ensure);

    if (!tr) return null;
    tr.setMeta('addToHistory', false);
    return tr;
  },
});

// Report type drives the W3C TR chrome: div.head/hr wrap plus TR stylesheets and fixup script; deselecting reverts.
function reportTypeValue(doc) {
  let value = null;
  doc.descendants((node) => {
    if (value !== null) return false;
    if (node.type.name === 'select' && node.attrs.originalAttributes?.id === 'specification-report-type') {
      value = node.attrs.originalAttributes['data-value'] || '';
      return false;
    }
    return true;
  });
  return value;
}

function syncReportTypeChrome(newState, ensure) {
  const value = reportTypeValue(newState.doc);
  if (value === null) return;

  let head = null;
  let details = null;
  newState.doc.forEach((node, offset) => {
    if (!head && node.type.name === 'div' && /\bhead\b/.test(node.attrs.originalAttributes?.class || '')) head = { pos: offset, node };
    if (!details && node.type.name === 'details') details = { pos: offset, node };
  });

  const wantHead = value === 'w3c-base';
  const { schema } = newState;

  if (wantHead && !head && details) {
    const hr = schema.nodes.hr.create({ originalAttributes: { title: 'Separator for header' } });
    const headNode = schema.nodes.div.create({ originalAttributes: { class: 'head' } }, [details.node, hr]);
    ensure().replaceWith(details.pos, details.pos + details.node.nodeSize, headNode);
  }
  else if (!wantHead && head) {
    // Unwrap: keep everything except the header-separator hr.
    const keep = [];
    head.node.forEach((child) => {
      if (child.type.name !== 'hr') keep.push(child);
    });
    ensure().replaceWith(head.pos, head.pos + head.node.nodeSize, keep);
  }

  applyReportTypeChrome(value);
}

// The Considerations definition <p> and the subsection links it currently lists.
function considerationsDefinition(doc) {
  let found = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (node.type.name !== 'section') return true;
    if (!isSectionOf(node, 'considerations')) return true;
    node.descendants((child, childPos) => {
      if (found) return false;
      if (child.isTextblock && child.attrs.originalAttributes?.id === 'considerations-definition') {
        found = { node: child, pos: pos + 1 + childPos };
      }
      return !found;
    });
    return false;
  });
  if (!found) return null;

  const hrefs = [];
  found.node.descendants((child) => {
    child.marks.forEach((m) => {
      const href = m.attrs?.originalAttributes?.href;
      if (m.type.name === 'a' && href) hrefs.push(href);
    });
    return true;
  });
  return { ...found, hrefs };
}

// Keep the machine-managed Considerations definition sentence in step with the present subsections.
function syncConsiderationsDefinition(newState, sel, blurred, ensure) {
  const def = considerationsDefinition(newState.doc);
  if (!def) return;
  if (!blurred && sel.from <= def.pos + def.node.nodeSize && sel.to >= def.pos) return;

  const subs = sectionEntries(newState.doc).get('considerations')?.subs || new Map();
  const present = Object.keys(SPEC_SUBSECTIONS['considerations'])
    .filter((type) => subs.has(type))
    .map((type) => ({ type, id: subs.get(type) }));

  const desiredHrefs = present.map(({ id }) => `#${id}`);
  if (desiredHrefs.length === def.hrefs.length && desiredHrefs.every((h, i) => h === def.hrefs[i])) return;

  const parsed = DOMParser.fromSchema(newState.schema).parse(fragmentFromString(considerationsDefinitionHTML(present)));
  ensure().replaceWith(def.pos, def.pos + def.node.nodeSize, parsed.content);
}
