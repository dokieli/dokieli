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

// One tree walk, one numbering pass, one markup shape, shared by the template navs and the
// generic TOC. Numbering lands in bdi.secno, so the counters travel with the HTML.

export const TOC_SCHEMES = ['decimal', 'w3c', 'none'];
export const DEFAULT_TOC_SCHEME = 'decimal';
export const TOC_SCHEME_ATTRIBUTE = 'data-toc-scheme';
export const TOC_ATTRIBUTE = 'data-toc';

const SECTION_SELECTOR = ':scope > section, :scope > div > section';
const HEADING_SELECTOR = ':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > header h1, :scope > header h2, :scope > header h3, :scope > header h4, :scope > header h5, :scope > header h6';

export function escapeHTML(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function sectionHeadingElement(section) {
  return section.querySelector(HEADING_SELECTOR);
}

// Heading text without the generated bits, so numbering never compounds.
export function headingLabel(heading) {
  if (!heading) return '';
  const clone = heading.cloneNode(true);
  clone.querySelectorAll('.secno, .self-link, .do').forEach(n => n.remove());
  return clone.textContent.trim();
}

// Three tracks, by class: introductory (no number), appendix (upper-alpha), numbered.
export const SECTION_ROLES = ['introductory', 'appendix', 'numbered'];

export function sectionRole(section) {
  if (section.classList.contains('introductory')) return 'introductory';
  if (section.classList.contains('appendix')) return 'appendix';
  return 'numbered';
}

// An emptied heading is mid-edit: left out until named again. One that never had a heading
// element still counts, under its id.
export function sectionTOCLabel(section) {
  const heading = sectionHeadingElement(section);
  if (!heading) return section.id;
  return headingLabel(heading);
}

export function sectionTree(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(SECTION_SELECTOR))
    .filter((section) => section.id && !section.classList.contains('do') && !section.classList.contains('slide') && !section.closest('.do'))
    .map((section) => ({
      id: section.id,
      element: section,
      heading: sectionTOCLabel(section),
      role: sectionRole(section),
      children: sectionTree(section),
    }))
    .filter((node) => node.heading);
}

// Assign node.secno across the tree; unnumberedIds covers markup predating the class.
export function numberTree(nodes, scheme = DEFAULT_TOC_SCHEME, { unnumberedIds = new Set(), prefix = null } = {}) {
  let number = 0;
  let letter = 0;

  nodes.forEach((node) => {
    const role = unnumberedIds.has(node.id) ? 'introductory' : (node.role || 'numbered');
    let secno = '';

    if (scheme !== 'none' && role !== 'introductory') {
      if (prefix !== null) {
        // Sublevels stay on their ancestor's track, whichever it is.
        secno = `${prefix}${++number}`;
      }
      else if (scheme === 'w3c' && role === 'appendix') {
        secno = `${String.fromCharCode(65 + letter++)}.`;
      }
      else {
        secno = `${++number}.`;
      }
    }

    node.secno = secno;

    if (node.children.length) {
      // Sublevels continue the parent's number: "1." -> "1.1".
      const childPrefix = scheme === 'none' ? null : (secno ? `${secno.replace(/\.$/, '')}.` : '');
      numberTree(node.children, scheme, { unnumberedIds, prefix: childPrefix });
    }
  });

  return nodes;
}

// dataId opts the line into the CSS counters; a document writing its own bdi.secno omits it.
function tocLinesHTML(nodes, dataId) {
  return nodes.map((node) => {
    const secno = node.secno ? `<bdi class="secno">${escapeHTML(node.secno)}</bdi> ` : '';
    const attrs = `class="tocline"${dataId ? ` data-id="${node.id}"` : ''}`;
    const link = `<a class="tocxref" href="#${node.id}">${secno}<span>${escapeHTML(node.heading)}</span></a>`;
    if (!node.children.length) return `<li ${attrs}>${link}</li>`;
    return `<li ${attrs}><p>${link}</p><ol>${tocLinesHTML(node.children, dataId)}</ol></li>`;
  }).join('');
}

// The list on its own, for callers supplying their own wrapper.
export function tocListHTML(tree, { listAttributes = '', dataId = false } = {}) {
  if (!tree.length) return '';
  return `<ol class="toc"${listAttributes}>${tocLinesHTML(tree, dataId)}</ol>`;
}

// allowEmpty keeps the heading and an empty list for a document with no sections yet.
export function tocHTML(tree, { tocId = null, label = 'Table of Contents', scheme = DEFAULT_TOC_SCHEME, allowEmpty = false } = {}) {
  if (!tree.length && !allowEmpty) return null;
  const id = tocId ? ` id="${tocId}"` : '';
  const list = tree.length ? tocListHTML(tree, { dataId: scheme === 'none' }) : '<ol class="toc"></ol>';
  return `<nav class="do-toc"${id} ${TOC_SCHEME_ATTRIBUTE}="${scheme}"><h2>${escapeHTML(label)}</h2><div>${list}</div></nav>`;
}

// null means "not stated", so the caller's default stands.
export function tocEnabledAttribute(root) {
  const value = root?.getAttribute?.(TOC_ATTRIBUTE);
  return value === 'true' ? true : value === 'false' ? false : null;
}

export function setTOCEnabled(root, enabled) {
  root?.setAttribute?.(TOC_ATTRIBUTE, enabled ? 'true' : 'false');
}

// The document's numbering scheme, from the article root; templates set the default.
export function getTOCScheme(root, fallback = DEFAULT_TOC_SCHEME) {
  const value = root?.getAttribute?.(TOC_SCHEME_ATTRIBUTE) ||
    root?.querySelector?.(`nav.do-toc[${TOC_SCHEME_ATTRIBUTE}]`)?.getAttribute(TOC_SCHEME_ATTRIBUTE);
  return TOC_SCHEMES.includes(value) ? value : fallback;
}

export function setTOCScheme(root, scheme) {
  if (!root || !TOC_SCHEMES.includes(scheme)) return;
  root.setAttribute(TOC_SCHEME_ATTRIBUTE, scheme);
}

// Write the numbers into the headings. Idempotent: an existing bdi.secno is updated or dropped.
export function applySectionNumbers(container, { scheme = DEFAULT_TOC_SCHEME, unnumberedIds = new Set(), tree = null } = {}) {
  const nodes = tree || numberTree(sectionTree(container), scheme, { unnumberedIds });

  const walk = (list) => {
    list.forEach((node) => {
      const heading = sectionHeadingElement(node.element);
      if (heading) {
        const existing = heading.querySelector(':scope > bdi.secno');
        if (!node.secno) {
          existing?.remove();
        }
        else if (existing) {
          existing.textContent = node.secno;
        }
        else {
          const bdi = node.element.ownerDocument.createElement('bdi');
          bdi.className = 'secno';
          bdi.textContent = node.secno;
          // After a self-link, when one is already there.
          const selfLink = heading.querySelector(':scope > a.self-link');
          if (selfLink) selfLink.after(bdi, ' ');
          else heading.prepend(bdi, ' ');
        }
      }
      walk(node.children);
    });
  };

  walk(nodes);
  return nodes;
}

export function removeSectionNumbers(container) {
  container?.querySelectorAll('bdi.secno').forEach((bdi) => {
    // The space it was generated with goes too.
    const next = bdi.nextSibling;
    if (next?.nodeType === 3 && !next.textContent.trim()) next.remove();
    bdi.remove();
  });
}
