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
import { DOMParser, Fragment } from "prosemirror-model";
import { createSectionsNavPlugin, isDocOfType, pmHeadingText, dlEntryAddDecorations, dlPairDeleteDecorations, deleteWidget, widgetButton } from "./sectionsNavDecorations.js";
import { slugify } from "./autoId.js";
import { fragmentFromString } from "../../utils/html.js";
import { threatModelDefinitionHTML, THREAT_MODEL_REFERENCES } from "../../threatModel.js";
import { subjectFromCaption } from "../../table.js";
import { i18n } from "../../i18n.js";
import { buildSectionsNav } from "../../ui/templates/sections.js";
import {
  specificationSections, isSpecification, classifySpecificationSection, classifySpecificationSubsection, SPEC_SUBSECTIONS,
  SPEC_CATEGORIES, categoryDefinitionHTML, considerationsDefinitionHTML, termEntryHTML, productClassEntryHTML, interoperabilityEntryHTML, acknowledgementsPersonHTML,
  conceptId, interoperabilityId, personId, applyReportTypeChrome,
  SPEC_SUBDIVISIONS, SPEC_SUBDIVISION_KEYS, SPEC_SUBDIVISION_REL, subdivisionEntryHTML, subdivisionPairHTML, subdivisionDlHTML, subdivisionsDefinitionHTML,
} from "../../ui/templates/specification.js";

// A section PM node matching a well-known key, by id or heading slug.
function isSectionOf(node, key) {
  const id = node.attrs.originalAttributes?.id;
  if (id === key) return true;
  return slugify(pmHeadingText(node).trim()) === key;
}

// Sections live at the doc top level (the outline model); nav falls back to the first section.
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

    Object.entries(SPEC_CATEGORIES)
      .sort((a, b) => a[1].localeCompare(b[1], undefined, { sensitivity: 'base' }))
      .forEach(([key, labelText]) => {
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
    ...dlEntryAddDecorations(doc, {
      matchSection: (node) => isSectionOf(node, 'acknowledgements'),
      label: i18n.t('specification.button.add-person.textContent'),
      entryHTML: acknowledgementsPersonHTML,
      listType: 'ul',
    }),
    ...acknowledgementsDeleteDecorations(doc),
    ...categoryCheckboxDecorations(doc),
    ...interoperabilityDecorations(doc),
    ...subdivisionAddDecorations(doc),
    ...subdivisionDeleteDecorations(doc),
  ];
}

// Each subdivision list in the Subdivisions section, as { rel, type, ulEnd, liEnds }.
function subdivisionLists(doc) {
  const lists = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'section' || !isSectionOf(node, 'subdivisions')) return true;
    node.descendants((child, childPos) => {
      if (child.type.name !== 'ul') return true;
      const rel = child.attrs.originalAttributes?.rel;
      const type = SPEC_SUBDIVISION_REL[rel];
      if (!type) return false;
      const base = pos + 1 + childPos + 1;
      const liEnds = [];
      let off = base;
      child.forEach((li) => {
        if (li.type.name === 'li') liEnds.push(off + li.nodeSize - 1);
        off += li.nodeSize;
      });
      lists.push({ type, ulEnd: base + child.content.size, liEnds });
      return false;
    });
    return false;
  });
  return lists;
}

// Editor-only type-select at the end of the Subdivisions section: pick a type and add an entry, creating that type's list on first use.
function subdivisionAddDecorations(doc) {
  const def = subdivisionsDefinition(doc);
  const anchor = def ? def.pos + def.node.nodeSize : subdivisionsBodyEnd(doc);
  if (anchor == null) return [];
  return [Decoration.widget(anchor, (view) => subdivisionAddWidget(view), { side: 1, ignoreSelection: true, stopEvent: () => true })];
}

// The Subdivisions lead <p> (its node/pos) plus the anchors and text it currently shows.
function subdivisionsDefinition(doc) {
  let found = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (node.type.name !== 'section' || !isSectionOf(node, 'subdivisions')) return true;
    node.descendants((child, childPos) => {
      if (found) return false;
      if (child.isTextblock && child.attrs.originalAttributes?.id === 'subdivisions-definition') {
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
  return { ...found, text: found.node.textContent, hrefs };
}

// End position of the Subdivisions section body (inside its schema:description div, or the section itself if unwrapped) where lists live and the add control sits.
function subdivisionsBodyEnd(doc) {
  let end = null;
  doc.descendants((node, pos) => {
    if (end != null) return false;
    if (node.type.name !== 'section' || !isSectionOf(node, 'subdivisions')) return true;
    node.forEach((child, offset) => {
      if (end == null && child.type.name === 'descriptionDiv') end = pos + 1 + offset + 1 + child.content.size;
    });
    if (end == null) end = pos + 1 + node.content.size;
    return false;
  });
  return end;
}

// The select + "+ Add {type}" control; the button label tracks the selection.
function subdivisionAddWidget(view) {
  const wrap = document.createElement('div');
  wrap.className = 'do subdivision-add';
  wrap.setAttribute('contenteditable', 'false');
  wrap.addEventListener('mousedown', (e) => e.preventDefault());

  const select = document.createElement('select');
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = i18n.t('specification.select.subdivision-type');
  select.appendChild(placeholder);
  SPEC_SUBDIVISION_KEYS.forEach((type) => {
    const opt = document.createElement('option');
    opt.value = type;
    opt.textContent = i18n.t(`specification.subdivision.${type}.option`);
    select.appendChild(opt);
  });

  const addLabel = (type) => type
    ? i18n.t('specification.button.add-subdivision.textContent', { type: i18n.t(`specification.subdivision.${type}.option`).toLowerCase() })
    : i18n.t('specification.button.add-subdivision-generic.textContent');

  const button = widgetButton({
    className: 'subdivision-add-button',
    label: addLabel(''),
    onClick: (e) => { e.preventDefault(); if (select.value) addSubdivisionEntry(view, select.value); },
  });
  button.disabled = true;

  select.addEventListener('mousedown', (e) => e.stopPropagation());
  select.addEventListener('change', () => {
    button.textContent = addLabel(select.value);
    button.disabled = !select.value;
  });

  wrap.append(select, button);
  return wrap;
}

// Add to the Subdivisions section: append an entry to the type's list if present,
// else add the type's dt/dd pair to the shared <dl> (creating the <dl> on first use).
function addSubdivisionEntry(view, type) {
  const rel = SPEC_SUBDIVISIONS[type].rel;
  const { state } = view;
  let ulEnd = null, dlEnd = null;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'section' || !isSectionOf(node, 'subdivisions')) return true;
    node.descendants((child, childPos) => {
      if (child.type.name === 'dl') { dlEnd = pos + 1 + childPos + 1 + child.content.size; return true; }
      if (child.type.name === 'ul') {
        if (child.attrs.originalAttributes?.rel === rel) ulEnd = pos + 1 + childPos + 1 + child.content.size;
        return false;
      }
      return true;
    });
    return false;
  });

  let html, at;
  if (ulEnd != null) { html = subdivisionEntryHTML(); at = ulEnd; }
  else if (dlEnd != null) { html = subdivisionPairHTML(type); at = dlEnd; }
  else { html = subdivisionDlHTML(type); at = subdivisionsBodyEnd(state.doc); }
  if (at == null) return;
  const parsed = DOMParser.fromSchema(state.schema).parse(fragmentFromString(html));
  view.dispatch(state.tr.insert(at, parsed).scrollIntoView().setMeta(SYNC_META, true));
}

// Per-entry delete widgets in each subdivision list.
function subdivisionDeleteDecorations(doc) {
  return subdivisionLists(doc).flatMap(({ liEnds }) =>
    liEnds.map((end) => deleteWidget(end, 'li', i18n.t('specification.button.remove-entry.aria-label'))));
}

// Keep the Subdivisions lead sentence in step with the present type lists (default "can be subdivided" phrasing when none).
function syncSubdivisionsDefinition(newState, sel, blurred, ensure) {
  const def = subdivisionsDefinition(newState.doc);
  if (!def) return;
  if (!blurred && sel.from <= def.pos + def.node.nodeSize && sel.to >= def.pos) return;

  const existing = new Set(subdivisionLists(newState.doc).map((l) => l.type));
  const present = SPEC_SUBDIVISION_KEYS.filter((t) => existing.has(t));
  const desiredActive = present.length > 0;
  const desiredHrefs = (desiredActive ? present : SPEC_SUBDIVISION_KEYS).map((t) => SPEC_SUBDIVISIONS[t].anchor);

  const currentActive = /^This specification is subdivided/.test(def.text);
  if (currentActive === desiredActive && desiredHrefs.length === def.hrefs.length && desiredHrefs.every((h, i) => h === def.hrefs[i])) return;

  const parsed = DOMParser.fromSchema(newState.schema).parse(fragmentFromString(subdivisionsDefinitionHTML(present)));
  ensure().replaceWith(def.pos, def.pos + def.node.nodeSize, parsed.content);
}

// Per-person delete widgets in the Acknowledgements list.
function acknowledgementsDeleteDecorations(doc) {
  const decos = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'section') return true;
    if (!isSectionOf(node, 'acknowledgements')) return true;
    node.descendants((child, childPos) => {
      if (child.type.name !== 'ul') return true;
      let off = pos + 1 + childPos + 1;
      child.forEach((li) => {
        if (li.type.name === 'li') decos.push(deleteWidget(off + li.nodeSize - 1, 'li', i18n.t('specification.button.remove-entry.aria-label')));
        off += li.nodeSize;
      });
      return false;
    });
    return false;
  });
  return decos;
}

// Fold product classes, category selection, and managed-dl state into the rebuild fingerprint.
function extraSignature(doc) {
  const classes = productClassNames(doc).join('|');
  // Track the definition's position too: an outline restructure can move it and
  // map away the checkbox widget without otherwise changing the fingerprint.
  const catDef = categoryDefinition(doc);
  const categories = catDef ? `${catDef.pos}:${Array.from(catDef.selected).join('|')}` : '';
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
  // Include the report-type state so the head wrap/unwrap always rebuilds decorations.
  let headPresent = false;
  doc.forEach((node) => {
    if (node.type.name === 'div' && /\bhead\b/.test(node.attrs.originalAttributes?.class || '')) headPresent = true;
  });
  const ackEntries = [];
  doc.descendants((node) => {
    if (node.type.name !== 'section') return true;
    if (!isSectionOf(node, 'acknowledgements')) return true;
    node.descendants((child) => { if (child.type.name === 'li') ackEntries.push(child.textContent.trim()); return true; });
    return false;
  });
  // Subdivision lists and entry counts, so add/delete widgets rebuild.
  const subs = subdivisionLists(doc).map((l) => `${l.type}:${l.liEnds.length}`);
  return `${classes};${categories};${dts.join(',')};${reportTypeValue(doc)}:${headPresent};ack:${ackEntries.join('|')};sub:${subs.join('|')}`;
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
  state: {
    // Baseline from the parsed document, so only user changes after mount count as transitions.
    init(_, state) {
      lastReportTypeValue = reportTypeValue(state.doc);
      return null;
    },
    apply() { return null; },
  },
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
    const liveDoc = () => (tr ? tr.doc : newState.doc);

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
    syncSubdivisionsDefinition(newState, sel, blurred, ensure);
    // Markup then ordering, both against the live tr doc, so ordering keeps the fresh marks.
    syncAcknowledgementsMarkup(newState, liveDoc, sel, blurred, ensure);
    syncAcknowledgementsOrder(newState, liveDoc, sel, blurred, ensure);
    syncThreatModelDefinition(newState, liveDoc, sel, blurred, ensure);
    syncThreatModelReferences(newState, liveDoc, sel, blurred, ensure);
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

// Keep the Acknowledgements list alphabetical on focus-out; empty entries stay at the end.
function acknowledgementsList(doc) {
  let found = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (node.type.name !== 'section') return true;
    if (!isSectionOf(node, 'acknowledgements')) return true;
    node.descendants((child, childPos) => {
      if (found) return false;
      if (child.type.name === 'ul') found = { node: child, pos: pos + 1 + childPos };
      return !found;
    });
    return false;
  });
  return found;
}

// Live RDFa: on focus-out, wrap each unlinked name in <a about property="schema:name">; linked names are left alone.
function syncAcknowledgementsMarkup(newState, liveDoc, sel, blurred, ensure) {
  const list = acknowledgementsList(liveDoc());
  if (!list) return;
  const aType = newState.schema.marks.a;
  if (!aType) return;

  let off = list.pos + 1;
  list.node.forEach((li) => {
    const liStart = off;
    const liEnd = off + li.nodeSize;
    off = liEnd;

    // Leave the entry alone while the cursor is in it, or a selection spans it even on blur (e.g. adding a link).
    const selInLi = sel.from <= liEnd && sel.to >= liStart;
    if (selInLi && (!blurred || sel.from !== sel.to)) return;

    const para = li.firstChild;
    if (!para || !para.isTextblock) return;
    const name = para.textContent.trim();
    if (!name) return;

    const start = liStart + 2; // inside li, inside paragraph
    const end = start + para.content.size;

    let hasHref = false;
    let hrefValue = null;
    let hrefHasRel = false;
    let currentAbout = null;
    para.forEach((child) => {
      child.marks.forEach((m) => {
        if (m.type !== aType) return;
        const oa = m.attrs.originalAttributes || {};
        if (oa.href) { hasHref = true; hrefValue = oa.href; if (oa.rel) hrefHasRel = true; }
        currentAbout = oa.about ?? currentAbout;
      });
    });

    // A linked name is a contributor here, not a mention: keep the href, drop any rel.
    if (hasHref) {
      if (!hrefHasRel) return;
      const t = ensure();
      t.removeMark(start, end, aType);
      t.addMark(start, end, aType.create({ originalAttributes: { href: hrefValue } }));
      return;
    }

    const wantAbout = `#${personId(name)}`;
    const everyCharMarked = (() => {
      let ok = true;
      para.forEach((child) => {
        if (!child.isText) return;
        if (!child.marks.some((m) => m.type === aType && m.attrs.originalAttributes?.about === wantAbout)) ok = false;
      });
      return ok;
    })();
    if (currentAbout === wantAbout && everyCharMarked) return;

    const t = ensure();
    t.removeMark(start, end, aType);
    t.addMark(start, end, aType.create({ originalAttributes: { about: wantAbout, lang: '', property: 'schema:name', 'xml:lang': '' } }));
  });
}

function syncAcknowledgementsOrder(newState, liveDoc, sel, blurred, ensure) {
  const list = acknowledgementsList(liveDoc());
  if (!list) return;
  const start = list.pos + 1;
  const end = start + list.node.content.size;
  if (!blurred && sel.from <= end && sel.to >= start) return;

  const items = [];
  list.node.forEach((li) => items.push(li));
  const named = items.filter((li) => li.textContent.trim());
  const empty = items.filter((li) => !li.textContent.trim());
  const sorted = named
    .slice()
    .sort((a, b) => a.textContent.trim().localeCompare(b.textContent.trim(), undefined, { sensitivity: 'base' }))
    .concat(empty);
  if (!sorted.some((li, i) => li !== items[i])) return;
  ensure().replaceWith(start, end, sorted);
}

// Transition-only: the document is the source of truth at rest.
let lastReportTypeValue = null;

function syncReportTypeChrome(newState, ensure) {
  const value = reportTypeValue(newState.doc);
  if (value === null) return;

  if (value === lastReportTypeValue) return;
  lastReportTypeValue = value;

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

function threatModelDefinition(doc) {
  let found = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (node.isTextblock && node.attrs.originalAttributes?.id === 'threat-model-definition') {
      found = { node, pos };
      return false;
    }
    return true;
  });
  if (!found) return null;

  const refs = [];
  found.node.descendants((child) => {
    child.marks.forEach((m) => {
      const attrs = m.attrs?.originalAttributes;
      if (m.type.name === 'a' && attrs?.href) refs.push(`${attrs.href}|${attrs.title || ''}`);
    });
    return true;
  });
  return { ...found, refs };
}

function threatTableFramework(table) {
  let framework = null;
  table.descendants((node) => {
    if (framework) return false;
    const attrs = node.attrs?.originalAttributes || {};

    if (node.type.name === 'select' && attrs['data-select'] === 'threat-model-kind') {
      node.descendants((option) => {
        const o = option.attrs?.originalAttributes || {};
        if (option.type.name === 'option' && 'selected' in o && o.value) framework = o.value;
        return !framework;
      });
      return false;
    }
    if (node.type.name === 'select' && attrs['data-framework']) {
      framework = attrs['data-framework'];
      return false;
    }
    return true;
  });
  return framework;
}

function threatTablesAround(doc, defPos) {
  const $def = doc.resolve(defPos);
  let scope = doc;
  for (let depth = $def.depth; depth > 0; depth--) {
    if ($def.node(depth).type.name === 'section') { scope = $def.node(depth); break; }
  }

  const tables = [];
  scope.descendants((node) => {
    if (node.type.name !== 'table') return true;
    const framework = threatTableFramework(node);
    if (framework) {
      const caption = node.firstChild?.type.name === 'caption' ? node.firstChild.textContent.trim() : '';
      const id = (node.attrs.originalAttributes?.resource || subjectFromCaption(caption) || '').slice(1);
      if (id) tables.push({ id, caption, framework });
    }
    return false;
  });
  return tables;
}

// Positions come from the live tr doc: earlier syncs may already have resized it.
function syncThreatModelDefinition(newState, liveDoc, sel, blurred, ensure) {
  const doc = liveDoc();
  const def = threatModelDefinition(doc);
  if (!def) return;
  if (!blurred && sel.from <= def.pos + def.node.nodeSize && sel.to >= def.pos) return;

  const tables = threatTablesAround(doc, def.pos);
  const desired = DOMParser.fromSchema(newState.schema).parse(fragmentFromString(threatModelDefinitionHTML(tables)));

  const desiredRefs = [];
  desired.descendants((child) => {
    child.marks.forEach((m) => {
      const attrs = m.attrs?.originalAttributes;
      if (m.type.name === 'a' && attrs?.href) desiredRefs.push(`${attrs.href}|${attrs.title || ''}`);
    });
    return true;
  });
  if (desiredRefs.length === def.refs.length && desiredRefs.every((r, i) => r === def.refs[i])) return;

  ensure().replaceWith(def.pos, def.pos + def.node.nodeSize, desired.content);
}

// A threat model's cited works belong in Informative References; add what is missing.
function syncThreatModelReferences(newState, liveDoc, sel, blurred, ensure) {
  const doc = liveDoc();
  if (!threatModelDefinition(doc)) return;

  let section = null;
  doc.descendants((node, pos) => {
    if (section) return false;
    if (node.type.name === 'section' && node.attrs.originalAttributes?.id === 'informative-references') {
      section = { node, pos };
      return false;
    }
    return true;
  });
  if (!section) return;
  if (!blurred && sel.from <= section.pos + section.node.nodeSize && sel.to >= section.pos) return;

  const present = new Set();
  section.node.descendants((node) => {
    const id = node.attrs?.originalAttributes?.id;
    if (node.type.name === 'dt' && id) present.add(id);
    return true;
  });

  const missing = THREAT_MODEL_REFERENCES.filter((ref) => !present.has(`bib-${ref.key}`));
  if (!missing.length) return;

  const entries = missing.map((ref) =>
    DOMParser.fromSchema(newState.schema).parse(fragmentFromString(`<dl>${ref.html}</dl>`)).firstChild.content);
  const content = entries.reduce((all, one) => all.append(one), Fragment.empty);

  let dl = null;
  section.node.descendants((node, pos) => {
    if (!dl && node.type.name === 'dl') dl = { node, pos: section.pos + 1 + pos };
    return !dl;
  });

  if (dl) {
    ensure().insert(dl.pos + dl.node.nodeSize - 1, content);
    return;
  }

  // No bibliography yet: one goes at the end of the section's description.
  const dlNode = newState.schema.nodes.dl?.createAndFill({ originalAttributes: { class: 'bibliography' } }, content);
  if (!dlNode) return;

  let target = section.pos + section.node.nodeSize - 1;
  section.node.forEach((child, offset) => {
    if (child.type.name === 'div') target = section.pos + 1 + offset + child.nodeSize - 1;
  });
  ensure().insert(target, dlNode);
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
