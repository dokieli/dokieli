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

import { fragmentFromString, selectArticleNode } from '../../utils/html.js';
import { isAuthorMode, pmEditor } from './shared.js';
import { DEFAULT_TOC_SCHEME, getTOCScheme, numberTree, sectionHeadingElement, sectionTOCLabel, sectionTree, setTOCEnabled, setTOCScheme, tocEnabledAttribute, tocHTML } from '../toc.js';
import Config from '../../config.js';
import { DOMParser as PMDOMParser } from 'prosemirror-model';

// Template-agnostic section management: each template registers a config (registry, labels, markup builders, probes) and shares the nav, add/remove, and TOC machinery here.

const templates = new Map();
let clickHandlerAttached = false;

export function registerSectionsTemplate(config) {
  config.contentSelector = config.contentSelector || '#content';
  config.getRoot = config.getRoot || (() => selectArticleNode(document));
  templates.set(config.templateId, config);
  attachClickHandler();
  return config;
}

export function getSectionsTemplate(templateId) {
  return templates.get(templateId) || null;
}

// The registered template this document belongs to, if any.
export function templateForRoot(root) {
  if (!root) return null;
  for (const config of templates.values()) {
    try {
      if (config.isDoc?.(root)) return config;
    } catch { /* a template's probe should never break the caller */ }
  }
  return null;
}

// Ids of sections the document's template excludes from numbering (e.g. Abstract, SotD).
export function unnumberedIdsForRoot(root) {
  const config = templateForRoot(root);
  const ids = new Set();
  if (!config?.unnumbered) return ids;
  const entries = config.sectionEntries(root);
  config.unnumbered.forEach((type) => {
    const info = entries.get(type);
    if (info?.id) ids.add(info.id);
  });
  return ids;
}

// The document's numbering scheme: what the root carries, else the template's default.
export function tocSchemeForRoot(root) {
  if (!sectionNumbersEnabledForRoot(root)) return 'none';
  const config = templateForRoot(root);
  return getTOCScheme(root, config?.tocScheme || DEFAULT_TOC_SCHEME);
}

// Self-links are a specification convention: only a template that asks for them gets them.
export function selfLinksEnabledForRoot(root) {
  return !!templateForRoot(root)?.selfLinks;
}

// So is numbering sections in their own markup; elsewhere the CSS counters do it.
export function sectionNumbersEnabledForRoot(root) {
  return !!templateForRoot(root)?.sectionNumbers;
}

// A template ships a TOC, a plain document once asked for; the document's data-toc wins.
export function tocEnabledForRoot(root) {
  return tocEnabledAttribute(root) ?? !!templateForRoot(root);
}

export function toggleTOCForRoot(root) {
  const enabled = !tocEnabledForRoot(root);
  setTOCEnabled(root, enabled);
  const config = templateForRoot(root);
  if (config) refreshSectionsNav(config, root);
  return enabled;
}

export function setTOCSchemeForRoot(root, scheme) {
  setTOCScheme(root, scheme);
  const config = templateForRoot(root);
  if (config) refreshSectionsNav(config, root);
}

// The template's sections container; config.getContent(root) overrides the selector lookup.
export function sectionsContent(config, root) {
  return config.getContent ? config.getContent(root) : root.querySelector(config.contentSelector);
}

// The document-details block: inside div.head, or at the top level.
export function findOutsideDetails(root) {
  return root.querySelector('.head > details') ||
    Array.from(root.querySelectorAll('details')).find(d => !d.closest('section') && !d.closest('.do')) || null;
}

export function findSection(config, root, type) {
  const entries = config.sectionEntries(root);
  const info = entries.get(type);
  if (!info) return null;
  if (config.outside?.has(type)) {
    return findOutsideDetails(root);
  }
  return info.id ? root.querySelector(`#${CSS.escape(info.id)}`) : null;
}

// The document's sections as a tree; the depth-first index addresses one for renaming,
// moving or removing, subsections included. The doc comes from the nav plugin, which has it.
const PM_CONTAINERS = new Set(['div', 'descriptionDiv', 'header', 'main', 'article', 'body']);

function roleOf(className) {
  if (/\bintroductory\b/.test(className)) return 'introductory';
  if (/\bappendix\b/.test(className)) return 'appendix';
  return 'numbered';
}

function pmSectionTreeOf(doc, markerAttribute) {
  let index = 0;
  const walk = (fragment) => {
    const nodes = [];
    fragment.forEach((node) => {
      if (node.type.name === 'section') {
        const attrs = node.attrs.originalAttributes || {};
        const className = attrs.class || '';
        if (/\bslide\b/.test(className)) return;
        let heading = '';
        node.forEach((child) => {
          if (!heading && child.type.name === 'heading') heading = child.textContent.trim();
        });
        const entry = {
          id: attrs.id || '',
          type: markerAttribute ? attrs[markerAttribute] || null : null,
          heading,
          role: roleOf(className),
          index: index++,
          children: [],
        };
        entry.children = walk(node.content);
        nodes.push(entry);
        return;
      }
      if (PM_CONTAINERS.has(node.type.name)) nodes.push(...walk(node.content));
    });
    return nodes;
  };
  return walk(doc.content);
}

function domSectionTreeOf(config, root) {
  let index = 0;
  const walk = (container) => Array.from(container.querySelectorAll(':scope > section, :scope > div > section'))
    .filter((section) => !section.classList.contains('do') && !section.classList.contains('slide'))
    .map((section) => {
      const entry = {
        id: section.id || '',
        type: config.markerAttribute ? section.getAttribute(config.markerAttribute) : null,
        heading: sectionTOCLabel(section),
        role: roleOf(section.className),
        index: index++,
        children: [],
      };
      entry.children = walk(section);
      return entry;
    });
  return walk(sectionsContent(config, root) || root);
}

function sectionTreeForNav(config, root, doc) {
  return doc ? pmSectionTreeOf(doc, config.markerAttribute) : domSectionTreeOf(config, root);
}

// The document's sections as an editable, reorderable list, then "+ add" for missing ones.
export function buildSectionsNav(config, root, presentEntries = null, doc = null) {
  const author = isAuthorMode();
  const entries = presentEntries || config.sectionEntries(root);

  const nav = document.createElement('nav');
  // The author widget keeps the editor id/class; the read nav carries the published TOC id.
  if (author) {
    nav.className = 'do';
    nav.id = `${config.templateId}-toc`;
  }
  else if (config.tocId) {
    nav.id = config.tocId;
  }

  // From the template, not the document: at first build the DOM may not carry the rdf:type
  // yet, and a nav that guessed differently would change shape on its next rebuild.
  const scheme = config.sectionNumbers ? (config.tocScheme || DEFAULT_TOC_SCHEME) : 'none';
  if (author) nav.dataset.tocScheme = scheme;

  let tree = sectionTreeForNav(config, root, doc);
  if (!tree.length) {
    tree = Object.keys(config.sections)
      .filter((type) => entries.has(type))
      .map((type, i) => ({ id: entries.get(type).id || type, type, heading: entries.get(type).heading || '', role: 'numbered', index: i, children: [] }));
  }
  // Numbered off the same pass as the published TOC.
  numberTree(tree, scheme, { unnumberedIds: unnumberedIdsForRoot(root) });

  nav.appendChild(navList(config, root, tree, entries, author, true));

  if (!author) return nav;

  // Not in the document, so nothing to edit: buttons, not list items.
  const missing = Object.keys(config.sections).filter((type) => !entries.has(type));
  if (missing.length) {
    const adds = document.createElement('ul');
    adds.className = 'do section-adds';
    missing.forEach((type) => {
      const li = document.createElement('li');
      li.appendChild(buttonHTML(config, 'section-add', type, `+ ${config.sectionLabel(type)}`));
      adds.appendChild(li);
    });
    nav.appendChild(adds);
  }

  return nav;
}

// Only the outermost list carries the toc class; .toc ol styles the nested ones.
function navList(config, root, nodes, entries, author, top) {
  const ol = document.createElement('ol');
  if (top) ol.className = 'toc';

  nodes.forEach((section) => {
    const type = section.type && config.sections[section.type] ? section.type : null;

    const li = document.createElement('li');
    li.className = 'tocline';

    const a = document.createElement('a');
    a.className = 'tocxref';
    if (section.id) a.href = `#${section.id}`;
    if (section.secno) {
      const secno = document.createElement('bdi');
      secno.className = 'secno';
      secno.textContent = section.secno;
      secno.contentEditable = 'false';
      a.appendChild(secno);
      a.appendChild(document.createTextNode(' '));
    }
    const name = document.createElement('span');
    name.textContent = section.heading || (type ? config.sectionLabel(type) : '');
    a.appendChild(name);
    li.appendChild(a);

    if (author) {
      li.dataset.template = config.templateId;
      li.dataset.sectionIndex = String(section.index);
      // The handle drags, not the row: the row has to stay clickable to edit.
      li.prepend(dragHandle(section.index));
      wireNavItemDrop(config, root, li, section.index);
      // The name is editable, the number is not.
      makeNavLabelEditable(config, root, name, section.index, type);
      if (type) {
        li.appendChild(buttonHTML(config, 'section-remove', type, '−', config.removeLabel(type)));
      }
    }

    const subConfig = type ? config.subsections?.[type] : null;
    const children = section.children.length ? navList(config, root, section.children, entries, author, false) : null;
    if (children) li.appendChild(children);

    // Template subsections this one is missing.
    if (author && subConfig) {
      const subs = (type && entries.get(type)?.subs) || new Map();
      const missingSubs = Object.keys(subConfig.sections).filter((subType) => !subs.has(subType));
      if (missingSubs.length) {
        const adds = document.createElement('ul');
        adds.className = 'do section-adds';
        missingSubs.forEach((subType) => {
          const item = document.createElement('li');
          item.appendChild(buttonHTML(config, 'subsection-add', subType, `+ ${subConfig.sectionLabel(subType)}`, null, type));
          adds.appendChild(item);
        });
        li.appendChild(adds);
      }
    }

    ol.appendChild(li);
  });

  return ol;
}

function buttonHTML(config, action, type, text, ariaLabel = null, parentType = null) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `do ${action}`;
  button.dataset.template = config.templateId;
  button.dataset.type = type;
  if (parentType) button.dataset.parent = parentType;
  button.textContent = text;
  if (ariaLabel) {
    button.title = ariaLabel;
    button.setAttribute('aria-label', ariaLabel);
  }
  return button;
}

// Published TOC: the shared ol.toc markup (bdi.secno numbering, nested children) for every template.

function publishedTOCHTML(config, root) {
  const content = sectionsContent(config, root);
  if (!content || !tocEnabledForRoot(root)) return null;

  const scheme = tocSchemeForRoot(root);
  const tree = numberTree(sectionTree(content), scheme, { unnumberedIds: unnumberedIdsForRoot(root) });
  const label = config.tocLabel ? config.tocLabel() : 'Table of Contents';

  return tocHTML(tree, { tocId: config.tocId, label, scheme, allowEmpty: true });
}

// Refresh the in-article nav: PM's widget owns it in author mode; read mode renders the published TOC.
export function refreshSectionsNav(config, root) {
  const main = root.closest('main') || root.parentNode;
  main.querySelector(`:scope > #${config.templateId}-toc`)?.remove(); // drop a stale nav from an old layout
  if (pmEditor()) return;

  // An author's own nav (not dokieli-generated) is left untouched.
  if (root.querySelector(':scope > nav:not(.do-toc)')) {
    root.querySelector(':scope > nav.do-toc')?.remove();
    return;
  }

  let nav;
  if (isAuthorMode()) {
    nav = buildSectionsNav(config, root);
  }
  else {
    const html = publishedTOCHTML(config, root);
    if (!html) { root.querySelector(':scope > nav.do-toc')?.remove(); return; }
    nav = fragmentFromString(html).firstElementChild;
  }

  const existing = root.querySelector(':scope > nav.do-toc');
  if (existing) { existing.replaceWith(nav); return; }
  const content = sectionsContent(config, root);
  const details = findOutsideDetails(root);
  if (config.sectionsAtRoot) {
    const firstSection = content?.querySelector(':scope > section');
    if (firstSection) firstSection.before(nav);
    else if (details) details.after(nav);
    else root.prepend(nav);
  }
  else if (content) content.before(nav);
  else if (details) details.after(nav);
  else root.prepend(nav);
}

// Id of the first present section after `type` in canonical order, for ordered insertion.
function insertionAnchorId(config, root, type) {
  const order = Object.keys(config.sections);
  const idx = order.indexOf(type);
  const entries = config.sectionEntries(root);
  for (const t of order.slice(idx + 1)) {
    if (config.outside?.has(t)) continue;
    const info = entries.get(t);
    if (info?.id) return info.id;
  }
  return null;
}

export function addSection(config, root, type) {
  if (!config.sections[type] || config.sectionEntries(root).has(type)) return;

  const html = config.sectionHTML(type);
  const editor = pmEditor();
  const content = sectionsContent(config, root);

  if (config.outside?.has(type)) {
    // Lives before the sections: at the start of div.head when present, else before them.
    if (editor) {
      if (!editor.insertFragmentAtStartOf('.head', fragmentFromString(html))) {
        editor.insertFragmentBeforeNode(config.sectionsAtRoot ? 'section' : (config.pmContentSelector || '#content'), fragmentFromString(html));
      }
    } else {
      const head = root.querySelector('.head');
      if (head) head.prepend(fragmentFromString(html));
      else if (config.sectionsAtRoot) content?.querySelector(':scope > section')?.before(fragmentFromString(html));
      else if (content) content.before(fragmentFromString(html));
    }
  } else {
    const anchorId = insertionAnchorId(config, root, type);
    if (editor) {
      if (anchorId) editor.insertFragmentBeforeNodeById(anchorId, fragmentFromString(html));
      else if (config.sectionsAtRoot) editor.insertFragmentAtEndOfDoc(fragmentFromString(html));
      else editor.insertFragmentAtEndOf(config.pmContentSelector || config.contentSelector, fragmentFromString(html));
    } else {
      if (!content) return;
      const anchor = anchorId ? content.querySelector(`:scope > #${CSS.escape(anchorId)}`) : null;
      content.insertBefore(fragmentFromString(html).firstElementChild, anchor);
    }
  }

  refreshSectionsNav(config, root);
}

export function removeSection(config, root, type) {
  const entries = config.sectionEntries(root);
  const info = entries.get(type);
  if (!info) return;
  const editor = pmEditor();
  if (editor) {
    editor.deleteNodeById(info.id);
  } else {
    findSection(config, root, type)?.remove();
  }
  refreshSectionsNav(config, root);
}

export function addSubsection(config, root, parentType, type) {
  const subConfig = config.subsections?.[parentType];
  if (!subConfig?.sections[type]) return;
  const entries = config.sectionEntries(root);
  const parent = entries.get(parentType);
  if (!parent || parent.subs?.has(type)) return;

  const html = subConfig.sectionHTML(type);
  const editor = pmEditor();

  // Ordered insertion within the parent's description container.
  const order = Object.keys(subConfig.sections);
  let anchorId = null;
  for (const t of order.slice(order.indexOf(type) + 1)) {
    if (parent.subs?.has(t)) { anchorId = parent.subs.get(t); break; }
  }

  if (editor) {
    if (anchorId) editor.insertFragmentBeforeNodeById(anchorId, fragmentFromString(html));
    // Subsections nest as section children (outline model); container templates use the description div.
    else if (config.sectionsAtRoot) editor.insertFragmentAtEndOf(`#${parent.id}`, fragmentFromString(html));
    else editor.insertFragmentAtEndOfChild(`#${parent.id}`, ['descriptionDiv', 'div'], fragmentFromString(html));
  } else {
    const parentEl = findSection(config, root, parentType);
    if (!parentEl) return;
    const anchor = anchorId ? parentEl.querySelector(`#${CSS.escape(anchorId)}`) : null;
    if (anchor) anchor.before(fragmentFromString(html).firstElementChild);
    else if (config.sectionsAtRoot) parentEl.append(fragmentFromString(html).firstElementChild);
    else (parentEl.querySelector(':scope > div') || parentEl).append(fragmentFromString(html).firstElementChild);
  }

  refreshSectionsNav(config, root);
}

export function removeSubsection(config, root, parentType, type) {
  const entries = config.sectionEntries(root);
  const subId = entries.get(parentType)?.subs?.get(type);
  if (!subId) return;
  const editor = pmEditor();
  if (editor) {
    editor.deleteNodeById(subId);
  } else {
    root.querySelector(`#${CSS.escape(subId)}`)?.remove();
  }
  refreshSectionsNav(config, root);
}

// Read at event time: by the time anyone types or drags, the editor is up.
function pmView() {
  return Config.Editor?.authorToolbarView?.editorView || null;
}

// The nth section in the order the nav lists them, with the positions to act on it.
function pmSectionAt(doc, index) {
  const found = [];
  const walk = (fragment, pos) => {
    fragment.forEach((node, offset) => {
      const nodePos = pos + offset;
      if (node.type.name === 'section') {
        if (/\bslide\b/.test(node.attrs.originalAttributes?.class || '')) return;
        let heading = null;
        let headingPos = null;
        node.forEach((child, childOffset) => {
          if (heading === null && child.type.name === 'heading') {
            heading = child;
            headingPos = nodePos + 1 + childOffset;
          }
        });
        found.push({ node, pos: nodePos, heading, headingPos });
        walk(node.content, nodePos + 1);
        return;
      }
      if (PM_CONTAINERS.has(node.type.name)) walk(node.content, nodePos + 1);
    });
  };
  walk(doc.content, 0);
  return found[index] || null;
}

function domSectionAt(config, root, index) {
  const found = [];
  const walk = (container) => {
    Array.from(container.querySelectorAll(':scope > section, :scope > div > section'))
      .filter((section) => !section.classList.contains('do') && !section.classList.contains('slide'))
      .forEach((section) => { found.push(section); walk(section); });
  };
  walk(sectionsContent(config, root) || root);
  return found[index] || null;
}

// The name typed in the list is written into the section's heading.
function renameSection(config, root, index, text) {
  const view = pmView();

  if (!view) {
    const heading = sectionHeadingElement(domSectionAt(config, root, index));
    if (heading) heading.textContent = text;
    return;
  }

  const section = pmSectionAt(view.state.doc, index);
  if (!section?.heading || section.heading.textContent.trim() === text.trim()) return;

  const from = section.headingPos + 1;
  const to = section.headingPos + section.heading.nodeSize - 1;
  const tr = view.state.tr;
  if (text.length) tr.replaceWith(from, to, view.state.schema.text(text));
  else tr.delete(from, to);
  view.dispatch(tr);
}

// autoId gives it an id once the heading has text.
function newSectionHTML(level = 2) {
  return `<section inlist="" rel="schema:hasPart"><h${level} property="schema:name"></h${level}><div datatype="rdf:HTML" property="schema:description"><p></p></div></section>`;
}

// Enter adds a section after this one, leaving the caret on its name in the list.
function addSectionAfter(config, root, index) {
  const view = pmView();
  const html = newSectionHTML();

  if (view) {
    const section = pmSectionAt(view.state.doc, index);
    if (!section) return;
    // By position, not id: a section just made has no id yet.
    const node = PMDOMParser.fromSchema(view.state.schema).parse(fragmentFromString(html));
    view.dispatch(view.state.tr.insert(section.pos + section.node.nodeSize, node));
  }
  else {
    const section = domSectionAt(config, root, index);
    if (!section) return;
    section.after(fragmentFromString(html).firstElementChild);
    refreshSectionsNav(config, root);
  }

  // Take the caret once the widget has redrawn.
  requestAnimationFrame(() => focusNavLabel(config, index + 1));
}

function focusNavLabel(config, index) {
  const nav = document.getElementById(`${config.templateId}-toc`);
  const xref = nav?.querySelectorAll('li.tocline > a.tocxref')[index];
  // The name span is what's editable; the anchor around it takes focus without a caret.
  const label = xref?.querySelector('[contenteditable="true"]') || xref;
  if (!label) return;
  label.focus();
  const range = document.createRange();
  range.selectNodeContents(label);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

// Reorder: the section moves with its subsections.
function moveSection(config, root, fromIndex, toIndex, after) {
  const view = pmView();

  if (view) {
    const source = pmSectionAt(view.state.doc, fromIndex);
    const target = pmSectionAt(view.state.doc, toIndex);
    if (!source || !target) return;
    // Dropping into its own subtree would delete the target with it.
    if (target.pos > source.pos && target.pos < source.pos + source.node.nodeSize) return;
    let tr = view.state.tr.delete(source.pos, source.pos + source.node.nodeSize);
    const at = tr.mapping.map(after ? target.pos + target.node.nodeSize : target.pos);
    view.dispatch(tr.insert(at, source.node).scrollIntoView());
    return;
  }

  const source = domSectionAt(config, root, fromIndex);
  const target = domSectionAt(config, root, toIndex);
  if (!source || !target || source === target || source.contains(target)) return;
  if (after) target.after(source);
  else target.before(source);
  refreshSectionsNav(config, root);
}

// Only user sections come out this way; a template's own goes by its "−" button.
function removeSectionAt(config, root, index) {
  const view = pmView();

  if (view) {
    const section = pmSectionAt(view.state.doc, index);
    if (!section) return;
    view.dispatch(view.state.tr.delete(section.pos, section.pos + section.node.nodeSize));
  }
  else {
    const section = domSectionAt(config, root, index);
    if (!section) return;
    section.remove();
    refreshSectionsNav(config, root);
  }

  // Back to the end of the name above, as backspacing between list items does.
  if (index > 0) requestAnimationFrame(() => focusNavLabel(config, index - 1));
}

// A built-in section can be renamed but not un-named: emptying it restores the default.
// A user's own has no default, so backspacing past empty removes it.
function makeNavLabelEditable(config, root, label, index, type) {
  const reserved = !!type;
  const defaultLabel = reserved ? config.sectionLabel(type) : '';

  label.contentEditable = 'true';
  label.spellcheck = false;
  // As much a text field as a link; following it would fight the editing.
  label.addEventListener('click', (e) => e.preventDefault());

  const restoreDefault = () => {
    label.textContent = defaultLabel;
    renameSection(config, root, index, defaultLabel);
  };

  label.addEventListener('input', () => {
    renameSection(config, root, index, label.textContent.trim());
  });

  label.addEventListener('keydown', (e) => {
    e.stopPropagation();

    if ((e.key === 'Backspace' || e.key === 'Delete') && !label.textContent.trim()) {
      e.preventDefault();
      // A template's own keeps its place; a user's own goes.
      if (reserved) return;
      label.blur();
      removeSectionAt(config, root, index);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (reserved && !label.textContent.trim()) { restoreDefault(); return; }
      // Blur first: the nav skips rebuilding while it holds the caret, and this must rebuild.
      label.blur();
      addSectionAfter(config, root, index);
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      label.blur();
    }
  });

  label.addEventListener('blur', () => {
    if (reserved && !label.textContent.trim()) restoreDefault();
  });
}

let dragSourceIndex = null;

// Appears on hover, so the row itself stays plain text to click into.
function dragHandle(index) {
  const handle = document.createElement('span');
  handle.className = 'do section-drag';
  handle.draggable = true;
  handle.textContent = '⠿';
  handle.title = 'Drag to reorder';
  handle.setAttribute('aria-hidden', 'true');
  handle.addEventListener('dragstart', (e) => {
    e.stopPropagation();
    dragSourceIndex = index;
    e.dataTransfer?.setData('text/plain', String(index));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  });
  handle.addEventListener('dragend', (e) => {
    e.stopPropagation();
    dragSourceIndex = null;
    document.querySelectorAll('li.tocline.drop-before, li.tocline.drop-after')
      .forEach((li) => li.classList.remove('drop-before', 'drop-after'));
  });
  return handle;
}

function wireNavItemDrop(config, root, li, index) {
  const clear = () => li.classList.remove('drop-before', 'drop-after');
  const dropsAfter = (e) => {
    const box = li.getBoundingClientRect();
    return e.clientY > box.top + box.height / 2;
  };

  li.addEventListener('dragover', (e) => {
    if (dragSourceIndex === null) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    li.classList.toggle('drop-after', dropsAfter(e));
    li.classList.toggle('drop-before', !dropsAfter(e));
  });

  li.addEventListener('dragleave', clear);

  li.addEventListener('drop', (e) => {
    if (dragSourceIndex === null) return;
    e.preventDefault();
    e.stopPropagation();
    clear();
    const from = dragSourceIndex;
    dragSourceIndex = null;
    if (from !== index) moveSection(config, root, from, index, dropsAfter(e));
  });
}

// One document-level handler for every template's nav buttons; data-template resolves the config.
function attachClickHandler() {
  if (clickHandlerAttached) return;
  clickHandlerAttached = true;

  document.addEventListener('click', (e) => {
    const button = e.target.closest('.section-add, .section-remove, .subsection-add, .subsection-remove');
    if (!button) return;
    const config = templates.get(button.dataset.template);
    if (!config) return;
    const root = config.getRoot();
    if (!root) return;

    const { type, parent } = button.dataset;
    if (button.classList.contains('section-add')) addSection(config, root, type);
    else if (button.classList.contains('section-remove')) removeSection(config, root, type);
    else if (button.classList.contains('subsection-add')) addSubsection(config, root, parent, type);
    else if (button.classList.contains('subsection-remove')) removeSubsection(config, root, parent, type);
  });
}

// Save hook: the live nav is .do (stripped on save); add the published TOC.
export function injectSectionsTOC(config, doc) {
  const article = selectArticleNode(doc);
  if (!article || !config.isDoc(article)) return;

  const content = sectionsContent(config, article);
  if (!content) return;

  // Leave an author-supplied nav in place; only manage dokieli's own.
  if (article.querySelector(':scope > nav:not(.do-toc)')) return;
  article.querySelectorAll(':scope > nav.do-toc').forEach(n => n.remove());

  const html = publishedTOCHTML(config, article);
  if (!html) return;

  if (config.sectionsAtRoot) {
    const firstSection = content.querySelector(':scope > section');
    if (firstSection) firstSection.before(fragmentFromString(html));
    else content.append(fragmentFromString(html));
  }
  else {
    content.parentNode.insertBefore(fragmentFromString(html), content);
  }
}

// On author entry, drop dokieli's own read-mode nav so PM doesn't parse it as
// content; an author-supplied nav is left for PM to keep as content.
export function stripSectionsTOC(config, root) {
  if (!root || !config.isDoc(root)) return;
  const content = sectionsContent(config, root);
  const navParent = config.sectionsAtRoot ? (content || root) : (content?.parentNode || root);
  navParent.querySelectorAll(':scope > nav.do-toc').forEach(n => n.remove());
}
