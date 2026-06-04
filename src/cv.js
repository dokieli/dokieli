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

import Config from './config.js';
import { fragmentFromString, selectArticleNode } from './utils/html.js';
import { slugify } from './editor/plugins/autoId.js';
import { registerDocumentTransform } from './utils/documentTransforms.js';
import { i18n } from './i18n.js';
import { generateAttributeId, generateUUID } from './util.js';

// type === slugify(label) so it matches the id autoIdPlugin derives from the heading.

const SECTIONS = {
  summary: {
    label: 'Summary',
    entryHTML: () => paragraphHTML({ template: 'cv', type: 'summary' })
  },
  experience: {
    label: 'Experience',
    entryHTML: () => eventHTML({ template: 'cv', type: 'experience' })
  },
  skills: {
    label: 'Skills',
    entryHTML: () => skillHTML({ template: 'cv', type: 'skills' })
  },
  education: {
    label: 'Education',
    entryHTML:() => eventHTML({ template: 'cv', type: 'education' })
  },
  talks: {
    label: 'Presentations and Talks',
    entryHTML: () => eventHTML({ template: 'cv', type: 'talks' })
  },
  'scholarly-articles': {
    label: 'Scholarly Articles',
    entryHTML: () => contributionHTML({ template: 'cv', type: 'scholarly-articles' })
  },
  'technical-community-contributions': {
    label: 'Technical and Community Contributions',
    entryHTML: () => contributionHTML({ template: 'cv', type: 'technical-contributions' })
  },
  awards: {
    label: 'Awards',
    entryHTML: () => awardHTML({ template: 'cv', type: 'awards' })
  },
  credentials: {
    label: 'Credentials',
    entryHTML: () => credentialHTML({ template: 'cv', type: 'credentials' })
  },
}

// Placeheld in a new CV; the rest are offered as "+ add" in the nav.
const DEFAULT_SECTIONS = ['summary', 'experience', 'skills'];

let clickHandlerAttached = false;
let modeHandlerAttached = false;

function isAuthorMode() {
  return Config.Editor?.mode === 'author';
}

function getSection(type) {
  return SECTIONS[type] || null;
}

function getCVRoot() {
  return document.querySelector('main > article');
}

function sectionPresent(root, type) {
  return !!root.querySelector(`#content > section[id="${type}"]`);
}

function sectionHTML(type) {
  const s = getSection(type);
  if (!s) {
    var e = `Section type ${type} not found.`;
    console.log(e);
    return `<div class="error"></div>`;
  };

  return `
    <section id="${type}" inlist="" rel="schema:hasPart" resource="#${type}">
      <h2 property="schema:name">${s.label}</h2>
      <div datatype="rdf:HTML" property="schema:description"><p></p></div>
    </section>`;
}

export function buildSection(type) {
  const html = sectionHTML(type);
  return html ? fragmentFromString(html).firstElementChild : null;
}

// Default sections, inlined by the template so they exist before PM mounts.
export function defaultContentHTML() {
  return `<div id="content">${DEFAULT_SECTIONS.map(sectionHTML).join('')}</div>`;
}

// Null unless the author editor is live (section mutations must go through PM).
function pmEditor() {
  return Config.Editor?.authorToolbarView?.editorView ? Config.Editor : null;
}

// Read mode: links to present sections. Author mode: + remove/add buttons.
// presentTypes, when given, is the authoritative set of present section ids
// (e.g. read from the PM doc) and overrides DOM probing — needed when the nav
// is rendered before the section DOM is painted.
export function buildTOC(root, presentTypes = null) {
  const author = isAuthorMode();

  const nav = document.createElement('nav');
  nav.className = 'do';
  nav.id = 'cv-toc';

  const ul = document.createElement('ul');
  nav.appendChild(ul);

  Object.keys(SECTIONS).forEach(section => {
    const present = presentTypes
      ? presentTypes.has(section)
      : sectionPresent(root, section);
    if (!present && !author) return;

    const li = document.createElement('li');

    if (present) {
      const a = document.createElement('a');
      a.href = `#${section}`;
      a.textContent = SECTIONS[section].label;
      li.appendChild(a);

      if (author) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'do cv-section-remove';
        remove.dataset.type = section;
        remove.title = `Remove ${section.label}`;
        remove.setAttribute('aria-label', `Remove ${SECTIONS[section].label}`);
        remove.textContent = '−';
        li.appendChild(remove);
      }
    } else {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'do cv-section-add';
      add.dataset.type = section;
      add.textContent = `+ ${SECTIONS[section].label}`;
      li.appendChild(add);
    }

    ul.appendChild(li);
  });

  return nav;
}

// Read/social mode: the nav lives in <main> before <article>, outside PM, so its
// buttons survive. In author mode the nav is rendered inside the article (after
// <details>) by cvNavDecorationPlugin, which rebuilds on docChanged — so here we
// just clear any stale <main> nav left over from read mode and let PM own it.
function refreshTOC(root) {
  const main = root.closest('main') || root.parentNode;
  if (pmEditor()) {
    main.querySelector(':scope > #cv-toc')?.remove();
    return;
  }
  const nav = buildTOC(root);
  const existing = main.querySelector(':scope > #cv-toc');
  if (existing) {
    existing.replaceWith(nav);
  } else {
    main.insertBefore(nav, root);
  }
}

export function addSection(root, type) {
  if (!getSection(type) || sectionPresent(root, type)) return;

  const editor = pmEditor();
  if (editor) {
    editor.insertFragmentAtEndOf('#content', fragmentFromString(sectionHTML(type)));
  } else {
    const content = root.querySelector('#content');
    if (!content) return;
    const order = Object.keys(SECTIONS);
    const idx = order.indexOf(type);
    const after = Array.from(content.children).find(el => order.indexOf(el.id) > idx);
    content.insertBefore(buildSection(type), after || null);
  }

  refreshTOC(root);
}

export function removeSection(root, type) {
  const editor = pmEditor();
  if (editor) {
    editor.deleteNodeById(type);
  } else {
    root.querySelector(`#content > section[id="${type}"]`)?.remove();
  }
  refreshTOC(root);
}

function isCV(root) {
  return !!root.querySelector('[rel~="rdf:type"][href*="CurriculumVitae"], [rel~="rdf:type"][resource*="CurriculumVitae"]');
}

// Save hook: the live nav is .do (stripped on save); add a clean links-only nav.
function injectCVTOC(doc) {
  const article = selectArticleNode(doc);
  if (!article || !isCV(article)) return;

  const content = article.querySelector('#content');
  if (!content) return;

  doc.querySelectorAll('#cv-toc').forEach(n => n.remove());

  const present = SECTIONS.filter(s => content.querySelector(`:scope > section[id="${s.type}"]`));
  if (!present.length) return;

  const lis = present.map(s => `<li><a href="#${s.type}">${s.label}</a></li>`).join('');
  content.parentNode.insertBefore(fragmentFromString(`<nav id="cv-toc"><ul>${lis}</ul></nav>`), content);
}

function paragraphHTML() {
  return `<p rel="schema:description" datatype="rdf:HTML"><br /></p>`;
}

function contributionHTML() {
  return `<p rev="schema:contributor" rel="foaf:made" property="schema:description" datatype="rdf:HTML"><br /></p>`;
}

function skillHTML() {
  return `<p rel="cco:skill" datatype="rdf:HTML"><br /></p>`;
}

function awardHTML() {
  return `<p rel="schema:award" datatype="rdf:HTML"><br /></p>`;
}

function credentialHTML() {
  return `<p rel="schema:hasCredential" datatype="rdf:HTML"><br /></p>`;
}

//TODO Move this to somewhere else as it is not CV specific
function eventHTML(options = {}) {
  console.log("eventHTML options", options);

  let rel;

  //TODO: Review article and slideshow rels b/c they may not be entirely accurate. Add other templates later.
  switch (options.template) {
    default:
    case 'article':
      rel = 'schema:hasPart';
      break;
    case 'cv':
      rel = 'schema:performerIn';
      break;
    case 'slideshow':
      rel = 'bibo:presentedAt';
      break;
  }

  const eventId = generateAttributeId();
  const eventOrganizerId = generateAttributeId();
  const eventOrganizerUrl = 'https://example.org/';
  const eventOrganizer = 'Organizer';
  const eventOrganizerDepartmentId = generateAttributeId();
  const eventOrganizerDepartmentUrl = 'https://example.org/department';
  const eventOrganizerDepartment = 'Department';
  const eventOrganizerDepartmentCode = 'ABC';
  const eventLocation = 'https://wikidata.org/concept/Bern';
  const eventAddressLocality = 'Bern';
  const eventAddressRegion = 'Bern';
  const eventAddressRegionCode = 'CH-BE';
  const eventAddressCountry = 'Switzerland';
  const eventAddressCountryCode = 'CH';
  const eventDescription = 'To be or not to be';
  const userDetails = {
    IRI: 'https://csarven.ca/#i'
  }

  return `<dl id="${eventId}" rel="${rel}" resource="#${eventId}" typeof="schema:Event">
    <dt class="event-name" data-i18n="event.name.dt">${i18n.t('event.name.dt.textContent')}</dt>
    <dd property="schema:name"><p data-placeholder="Experience name"></p></dd>

    <dt class="event-organizer" data-i18n="event.organizer.dt">${i18n.t('event.organizer.dt.textContent')}</dt>
    <dd rel="schema:organizer" resource="#${eventOrganizerId}" typeof="schema:Organization"><a href="${eventOrganizerUrl}" property="schema:name" rel="schema:url">${eventOrganizer}</a> <span rel="schema:department" resource="#${eventOrganizerDepartmentId}"><a href="${eventOrganizerDepartmentUrl}" property="schema:name" rel="schema:url"><abbr title="${eventOrganizerDepartment}">${eventOrganizerDepartmentCode}</abbr></a></span></dd>

    <dt class="event-location" data-i18n="event.location.dt">${i18n.t('event.location.dt.textContent')}</dt>
    <dd rel="schema:location" resource="${eventLocation}" typeof="schema:Place"><span rel="schema:address"><span property="schema:addressLocality">${eventAddressLocality}</span>, <abbr title="${eventAddressRegion}">${eventAddressRegionCode}</abbr>, <abbr title="${eventAddressCountry}">${eventAddressCountryCode}</abbr></span></dd>

    <dt class="event-date" data-i18n="event.date.dt">${i18n.t('event.date.dt.textContent')}</dt>
    <dd>
      <label for="event-start-date" data-i18n="event.date.start-date.label">${i18n.t('event.date.start-date.label.textContent')}</label><input contenteditable="false" data-i18n="event.date.start-date.input" draggable="false" type="date" value="" />
      <label for="event-end-date" data-i18n="event.date.end-date.label">${i18n.t('event.date.end-date.label.textContent')}</label><input data-i18n="event.date.end-date.input" draggable="false" type="date" value="" />
    </dd>

    <dt class="event-description" data-i18n="event.description.dt">${i18n.t('event.description.dt.textContent')}</dt>
    <dd datatype="rdf:HTML" property="schema:description">
      <p rel="schema:performer" resource="${userDetails.IRI}">${eventDescription}</p>
    </dd>
  </dl>`;

//<time content="${eventStartDate}" datatype="xsd:date" datetime="${eventStartDate}" property="schema:startDate">${eventStartDate}</time>–<time content="${eventEndDate}" datatype="xsd:date" datetime="${eventEndDate}" property="schema:endDate">${eventEndDate}</time>

}

registerDocumentTransform(injectCVTOC);

// Render the nav and wire add/remove. Safe to call repeatedly.
export function initCV() {
  const root = getCVRoot();
  if (!root || !isCV(root)) return;

  refreshTOC(root);

  if (!clickHandlerAttached) {
    clickHandlerAttached = true;
    document.addEventListener('click', (e) => {
      const root = getCVRoot();
      if (!root) return;
      const add = e.target.closest('.cv-section-add');
      if (add) { addSection(root, add.dataset.type); return; }
      const remove = e.target.closest('.cv-section-remove');
      if (remove) { removeSection(root, remove.dataset.type); }

      const addEntry = e.target.closest('.cv-entry-add');
      if (addEntry) {
        const type = addEntry.dataset.type;
        const entryHTML = SECTIONS[type]?.entryHTML;
        if (entryHTML) {
          pmEditor()?.insertFragmentAtEndOf(`#${type}`, fragmentFromString(entryHTML()));
        }
      }
    });
  }

  if (!modeHandlerAttached) {
    modeHandlerAttached = true;
    window.addEventListener('dokieli:editor-mode-changed', () => {
      const root = getCVRoot();
      if (root && isCV(root)) refreshTOC(root);
    });
  }
}
