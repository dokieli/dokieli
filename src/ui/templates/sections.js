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

// Build the management nav: links + add/remove (and subsection) controls; presentEntries (e.g. from the PM doc) overrides DOM probing.
export function buildSectionsNav(config, root, presentEntries = null) {
  const author = isAuthorMode();
  const entries = presentEntries || config.sectionEntries(root);

  const nav = document.createElement('nav');
  // Author-mode widget keeps the editor id/class; the read/save nav carries the template's published TOC id.
  if (author) {
    nav.className = 'do';
    nav.id = `${config.templateId}-toc`;
  }
  else if (config.tocId) {
    nav.id = config.tocId;
  }

  const ul = document.createElement('ul');
  nav.appendChild(ul);

  Object.keys(config.sections).forEach((type) => {
    const info = entries.get(type);
    const present = !!info;
    if (!present && !author) return;

    const li = document.createElement('li');

    if (present) {
      const a = document.createElement('a');
      a.href = `#${info.id || type}`;
      a.textContent = config.sectionLabel(type);
      li.appendChild(a);

      if (author) {
        li.appendChild(buttonHTML(config, 'section-remove', type, '−', config.removeLabel(type)));
      }

      const subConfig = config.subsections?.[type];
      if (subConfig) {
        const subUl = subsectionsNav(config, subConfig, type, info, author);
        if (subUl) li.appendChild(subUl);
      }
    } else {
      const add = buttonHTML(config, 'section-add', type, `+ ${config.sectionLabel(type)}`);
      li.appendChild(add);
    }

    ul.appendChild(li);
  });

  return nav;
}

function subsectionsNav(config, subConfig, parentType, parentInfo, author) {
  const subs = parentInfo.subs || new Map();
  const ul = document.createElement('ul');

  Object.keys(subConfig.sections).forEach((type) => {
    const subId = subs.get(type);
    const present = !!subId;
    if (!present && !author) return;

    const li = document.createElement('li');
    if (present) {
      const a = document.createElement('a');
      a.href = `#${subId}`;
      a.textContent = subConfig.sectionLabel(type);
      li.appendChild(a);
      if (author) {
        li.appendChild(buttonHTML(config, 'subsection-remove', type, '−', config.removeLabel(type), parentType));
      }
    } else {
      li.appendChild(buttonHTML(config, 'subsection-add', type, `+ ${subConfig.sectionLabel(type)}`, null, parentType));
    }
    ul.appendChild(li);
  });

  return ul.children.length ? ul : null;
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

// Published TOC: with a tocId, an AC/TR-style ol.toc (secno numbering, appendix letters, nested children); without, a plain links list.

function escapeHTML(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sectionTocTree(container) {
  return Array.from(container.querySelectorAll(':scope > section, :scope > div > section'))
    .filter((section) => section.id)
    .map((section) => {
      const heading = section.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6');
      return {
        id: section.id,
        heading: heading?.textContent.trim() || section.id,
        appendix: section.classList.contains('appendix'),
        children: sectionTocTree(section),
      };
    });
}

function tocLinesHTML(nodes, { unnumberedIds = new Set(), prefix = null } = {}) {
  let number = 0;
  let letter = 0;
  return nodes.map((node) => {
    let secno = '';
    if (!unnumberedIds.has(node.id)) {
      if (prefix !== null) secno = `${prefix}${++number}`;
      else if (node.appendix) secno = `${String.fromCharCode(65 + letter++)}.`;
      else secno = `${++number}.`;
    }
    const link = `<a class="tocxref" href="#${node.id}"><bdi class="secno">${secno}</bdi> <span>${escapeHTML(node.heading)}</span></a>`;
    if (!node.children.length) return `<li class="tocline">${link}</li>`;
    const childPrefix = secno ? `${secno.replace(/\.$/, '')}.` : '';
    return `<li class="tocline"><p>${link}</p><ol>${tocLinesHTML(node.children, { prefix: childPrefix })}</ol></li>`;
  }).join('');
}

function publishedTOCHTML(config, root) {
  const content = sectionsContent(config, root);
  if (!content) return null;

  if (!config.tocId) {
    // Plain links list for templates without a published TOC id.
    const entries = config.sectionEntries(root);
    const lis = [];
    Object.keys(config.sections).forEach((type) => {
      const info = entries.get(type);
      if (!info || config.outside?.has(type)) return;
      lis.push(`<li><a href="#${info.id}">${config.sectionLabel(type)}</a></li>`);
    });
    return lis.length ? `<nav><ul>${lis.join('')}</ul></nav>` : null;
  }

  const tree = sectionTocTree(content);
  if (!tree.length) return null;

  // Resolve unnumbered types to the ids they currently carry.
  const entries = config.sectionEntries(root);
  const unnumberedIds = new Set();
  (config.unnumbered ? Array.from(config.unnumbered) : []).forEach((type) => {
    const info = entries.get(type);
    if (info) unnumberedIds.add(info.id);
  });

  const label = config.tocLabel ? config.tocLabel() : 'Table of Contents';
  return `<nav id="${config.tocId}"><h2>${escapeHTML(label)}</h2><div><ol class="toc">${tocLinesHTML(tree, { unnumberedIds })}</ol></div></nav>`;
}

// Refresh the in-article nav: PM's widget owns it in author mode; read mode renders the published TOC.
export function refreshSectionsNav(config, root) {
  const main = root.closest('main') || root.parentNode;
  main.querySelector(`:scope > #${config.templateId}-toc`)?.remove(); // drop a stale nav from an old layout
  if (pmEditor()) return;

  let nav;
  if (isAuthorMode()) {
    nav = buildSectionsNav(config, root);
  }
  else {
    const html = publishedTOCHTML(config, root);
    if (!html) { root.querySelector(':scope > nav')?.remove(); return; }
    nav = fragmentFromString(html).firstElementChild;
  }

  const existing = root.querySelector(':scope > nav');
  if (existing) { existing.replaceWith(nav); return; }
  const content = sectionsContent(config, root);
  const details = findOutsideDetails(root);
  if (content) content.before(nav);
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
    // Lives before the sections container: at the start of div.head when present, else before content.
    if (editor) {
      if (!editor.insertFragmentAtStartOf('.head', fragmentFromString(html))) {
        editor.insertFragmentBeforeNode(config.pmContentSelector || '#content', fragmentFromString(html));
      }
    } else {
      const head = root.querySelector('.head');
      if (head) head.prepend(fragmentFromString(html));
      else if (content) content.before(fragmentFromString(html));
    }
  } else {
    const anchorId = insertionAnchorId(config, root, type);
    if (editor) {
      if (anchorId) editor.insertFragmentBeforeNodeById(anchorId, fragmentFromString(html));
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
    // The description container parses as descriptionDiv in the editor schema.
    else editor.insertFragmentAtEndOfChild(`#${parent.id}`, ['descriptionDiv', 'div'], fragmentFromString(html));
  } else {
    const parentEl = findSection(config, root, parentType);
    const container = parentEl?.querySelector(':scope > div');
    if (!container) return;
    const anchor = anchorId ? container.querySelector(`:scope > #${CSS.escape(anchorId)}`) : null;
    container.insertBefore(fragmentFromString(html).firstElementChild, anchor);
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

  article.querySelectorAll(':scope > nav').forEach(n => n.remove());

  const html = publishedTOCHTML(config, article);
  if (!html) return;

  content.parentNode.insertBefore(fragmentFromString(html), content);
}

// On author entry, drop the read-mode nav so PM doesn't parse it as content.
export function stripSectionsTOC(config, root) {
  if (!root || !config.isDoc(root)) return;
  const content = sectionsContent(config, root);
  (content?.parentNode || root).querySelectorAll(':scope > nav').forEach(n => n.remove());
}
