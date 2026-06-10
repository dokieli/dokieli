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
import { registerDocumentTransform, registerEditorParseTransform } from './utils/documentTransforms.js';
import { i18n } from './i18n.js';
import { generateAttributeId, generateUUID } from './util.js';
import { getCountryOptionsHTML, showLocationSuggestions, showSkillSuggestions, setupAutocomplete } from './doc.js';
import { getWikidataResults, getEscoResults } from './graph.js';

// Sections are identified by a stable data-cv-section marker (= the SECTIONS key),
// not by id: autoIdPlugin rewrites a section's id to the heading slug, so the id
// follows the user's heading while the marker stays put.

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
  'scholarly-communication': {
    label: 'Scholarly Communication',
    entryHTML: () => contributionHTML({ template: 'cv', type: 'scholarly-communication' })
  },
  'technical-contributions': {
    label: 'Technical Contributions',
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

// Simple list sections (plain <p> entries) seeded with one placeholder <li> so an
// empty section shows a prompt as a proper list item, not a bare <ul>. The richer
// sections (experience/education/talks/skills) start empty and rely on "+ add".
const SEED_ENTRY = new Set(['scholarly-communication', 'technical-contributions', 'awards', 'credentials']);

let clickHandlerAttached = false;
let modeHandlerAttached = false;
let authHandlerAttached = false;

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
  return !!root.querySelector(`#content > section[data-cv-section="${type}"]`);
}

function sectionHTML(type) {
  const s = getSection(type);
  if (!s) {
    var e = `Section type ${type} not found.`;
    console.log(e);
    return `<div class="error"></div>`;
  };

  let html = '';

  const webid = Config.User?.IRI;
  const about = webid ? ` about="${webid}"` : '';

  switch(type) {
    default: {
      const seed = SEED_ENTRY.has(type) ? s.entryHTML() : '';
      html = `<div datatype="rdf:HTML" property="schema:description"><ul${about}>${seed}</ul></div>`;
      break;
    }
    case 'summary':
      html = `<div datatype="rdf:HTML" property="schema:abstract"><p></p></div>`;
      break;
  }

  return `
    <section id="${type}" data-cv-section="${type}" rel="schema:hasPart" resource="#${type}">
      <h2 property="schema:name">${s.label}</h2>
      ${html}
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

// Back-fill the data-cv-section marker on CVs authored before it existed: derive
// it from a section's id while the id still matches a section key or its default
// heading slug. Runs on author entry; persists once the marker is set.
function migrateSectionMarkers(root) {
  if (!root || !isCV(root)) return;
  const byLabelSlug = {};
  Object.entries(SECTIONS).forEach(([type, s]) => { byLabelSlug[slugify(s.label)] = type; });
  root.querySelectorAll('#content > section').forEach((section) => {
    if (section.getAttribute('data-cv-section')) return;
    const id = section.getAttribute('id') || '';
    const type = SECTIONS[id] ? id : byLabelSlug[id];
    if (type) section.setAttribute('data-cv-section', type);
  });
}
registerEditorParseTransform(migrateSectionMarkers);

// Null unless the author editor is live (section mutations must go through PM).
function pmEditor() {
  return Config.Editor?.authorToolbarView?.editorView ? Config.Editor : null;
}

// Read mode: links to present sections. Author mode: + remove/add buttons.
// presentTypes, when given, is the authoritative Map of present section type ->
// actual section id (e.g. read from the PM doc) and overrides DOM probing — needed
// when the nav is rendered before the section DOM is painted.
export function buildTOC(root, presentTypes = null) {
  const author = isAuthorMode();

  const nav = document.createElement('nav');
  nav.className = 'do';
  nav.id = 'cv-toc';

  const ul = document.createElement('ul');
  nav.appendChild(ul);

  Object.keys(SECTIONS).forEach(section => {
    let present, sectionId;
    if (presentTypes) {
      present = presentTypes.has(section);
      sectionId = present ? presentTypes.get(section) : null;
    } else {
      const el = root.querySelector(`#content > section[data-cv-section="${section}"]`);
      present = !!el;
      sectionId = el?.id || null;
    }
    if (!present && !author) return;

    const li = document.createElement('li');

    if (present) {
      const a = document.createElement('a');
      a.href = `#${sectionId || section}`;
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

// The nav sits inside the article, right after <details> (matching author mode,
// where cvNavDecorationPlugin renders it there). It is a .do element: stripped on
// save and removed from the parse root on entering author mode, so PM never owns
// it. In author mode PM's widget is the nav, so here we just leave it alone.
function refreshTOC(root) {
  const main = root.closest('main') || root.parentNode;
  main.querySelector(':scope > #cv-toc')?.remove(); // drop a stale nav from the old <main> layout
  if (pmEditor()) return;

  const nav = buildTOC(root);
  const existing = root.querySelector(':scope > #cv-toc');
  if (existing) { existing.replaceWith(nav); return; }
  const details = root.querySelector(':scope > details');
  const content = root.querySelector(':scope > #content');
  if (details) details.after(nav);
  else if (content) content.before(nav);
  else root.prepend(nav);
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
    const after = Array.from(content.children).find(el => order.indexOf(el.getAttribute('data-cv-section')) > idx);
    content.insertBefore(buildSection(type), after || null);
  }

  refreshTOC(root);
}

export function removeSection(root, type) {
  const section = root.querySelector(`#content > section[data-cv-section="${type}"]`);
  if (!section) return;
  const editor = pmEditor();
  if (editor) {
    editor.deleteNodeById(section.id);
  } else {
    section.remove();
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

  const present = Object.keys(SECTIONS)
    .map(type => ({ type, section: content.querySelector(`:scope > section[data-cv-section="${type}"]`) }))
    .filter(x => x.section);
  if (!present.length) return;

  const lis = present.map(({ type, section }) => `<li><a href="#${section.id}">${SECTIONS[type].label}</a></li>`).join('');
  content.parentNode.insertBefore(fragmentFromString(`<nav id="cv-toc"><ul>${lis}</ul></nav>`), content);
}

function paragraphHTML() {
  return `<p rel="schema:description" datatype="rdf:HTML"><br /></p>`;
}

function contributionHTML(options = {}) {
  const ph = options.type === 'technical-contributions' ? 'Technical contribution' : 'Scholarly communication';
  return `<li rev="schema:contributor" rel="foaf:made" property="schema:description" datatype="rdf:HTML"><p data-placeholder="${ph}"></p></li>`;
}

function skillInputHTML({ title = '', uri = '' } = {}) {
  const id = generateAttributeId();
  const esc = (s) => (s || '').replace(/"/g, '&quot;');
  const data = uri ? `data-entity="${esc(uri)}"` : '';
  return `<div class="autocomplete"><input data-autocomplete="skill" name="${id}-skill" placeholder="Enter skill" value="${esc(title)}" ${data} type="text" /></div>`;
}

function skillHTML() {
  const id = `${generateAttributeId()}-skill-category`;
  return `<li><dl class="skill-category" id="${id}">
    <dt data-placeholder="Category name"></dt>
    <dd>${skillInputHTML()}</dd>
  </dl></li>`;
}

function awardHTML() {
  return `<li property="schema:award" datatype="rdf:HTML"><p data-placeholder="Award"></p></li>`;
}

function credentialHTML() {
  return `<li rel="schema:hasCredential" datatype="rdf:HTML"><p data-placeholder="Credential"></p></li>`;
}

//TODO Move this to somewhere else as it is not CV specific
function eventHTML(options = {}) {
  // console.log("eventHTML options", options);

  //TODO: Review article and slideshow rels b/c they may not be entirely accurate. Add other templates later.
  const templateEventRel = {
    article: 'schema:hasPart',
    cv: 'schema:performerIn',
    slideshow: 'bibo:presentedAt',
  };
  const eventRel = templateEventRel[options.template] ?? 'schema:hasPart';

  const eventType = EVENT_TYPE_BY_SECTION[options.type] ?? 'schema:Event';

  const eventId = generateAttributeId();
  const fields = EVENT_FIELDS_ORDER.map((key) => eventFieldHTML(key, eventId)).join('\n    ');

  // console.log(eventId, eventRel, eventType, fields)

  return `<li><dl id="${eventId}" rel="${eventRel}" resource="#${eventId}" typeof="${eventType}">
    ${fields}
  </dl></li>`;
}

const EVENT_FIELDS_ORDER = ['name', 'organizer', 'location', 'date', 'description'];

// Section type -> RDFa event subtype; schema:Event is the generic fallback.
const EVENT_TYPE_BY_SECTION = {
  experience: 'schema:BusinessEvent',
  education: 'schema:EducationEvent',
  talks: 'schema:ConferenceEvent',
};

// Matches any event dl regardless of subtype, so prune/restore cover every
// event-based section (experience, education, talks) and the generic case.
const EVENT_SELECTOR = ['schema:Event', ...Object.values(EVENT_TYPE_BY_SECTION)]
  .map(t => `dl[typeof~="${t}"]`).join(', ');

// One dt/dd pair of an event, in editable form. Shared by eventHTML and
// restoreEventFields so re-created fields match freshly added ones.
function eventFieldHTML(key, eventId) {
  switch (key) {
    case 'name':
      return `<dt class="event-name" data-i18n="event.name.dt">${i18n.t('event.name.dt.textContent')}</dt>
    <dd property="schema:name"><p data-placeholder="Experience name"></p></dd>`;

    case 'organizer':
      return `<dt class="event-organizer" data-i18n="event.organizer.dt">${i18n.t('event.organizer.dt.textContent')}</dt>
    <dd rel="schema:organizer" resource="#${generateAttributeId()}" typeof="schema:Organization">
      <p class="event-organization-name" data-placeholder="Organizer"></p>
      <p class="event-organization-department-name" data-placeholder="Department"></p>
    </dd>`;

    case 'location':
      return `<dt class="event-location" data-i18n="event.location.dt">${i18n.t('event.location.dt.textContent')}</dt>
    <dd rel="schema:location" typeof="schema:Place"><div class="autocomplete" rel="schema:address"><input name="${eventId}-event-location" placeholder="Enter location (locality, region, country)" value="" type="text" /></div></dd>`;

    case 'date':
      return `<dt class="event-date" data-i18n="event.date.dt">${i18n.t('event.date.dt.textContent')}</dt>
    <dd>
      <label contenteditable="false" for="event-start-date" data-i18n="event.date.start-date.label">${i18n.t('event.date.start-date.label.textContent')}</label><input contenteditable="false" data-i18n="event.date.start-date.input" data-property="schema:startDate" draggable="false" type="date" value="" /><label contenteditable="false" for="event-end-date" data-i18n="event.date.end-date.label">${i18n.t('event.date.end-date.label.textContent')}</label><input data-i18n="event.date.end-date.input" data-property="schema:endDate" draggable="false" type="date" value="" />
    </dd>`;

    case 'description':
      return `<dt class="event-description" data-i18n="event.description.dt">${i18n.t('event.description.dt.textContent')}</dt>
    <dd datatype="rdf:HTML" property="schema:description"><p data-placeholder="Experience description"></p></dd>`;
  }
  return '';
}

registerDocumentTransform(injectCVTOC);

// Save hook: collapse the editable date inputs back into <time> elements, as in
// a published CV. A date <dd> holds one or two <input type="date">; replace its
// contents with <time>start</time>–<time>end</time>.
function transformDateInputs(doc) {
  const article = selectArticleNode(doc);
  if (!article || !isCV(article)) return;

  const toTime = (input) => {
    const value = input.getAttribute('value') || '';
    const time = doc.createElement('time');
    time.setAttribute('datatype', 'xsd:date');
    const property = input.getAttribute('data-property');
    if (property) time.setAttribute('property', property);
    if (value) {
      time.setAttribute('content', value);
      time.setAttribute('datetime', value);
    }
    time.textContent = value;
    return time;
  };

  article.querySelectorAll('dd').forEach((dd) => {
    const inputs = dd.querySelectorAll('input[type="date"]');
    if (!inputs.length) return;
    const times = Array.from(inputs, toTime);
    dd.replaceChildren(...times.flatMap((t, i) => (i ? [doc.createTextNode('–'), t] : [t])));
  });
}

registerDocumentTransform(transformDateInputs);

// Editor hook (inverse of transformDateInputs): expand published <time> date
// pairs back into the editable label+input form so saved CVs get the picker.
// Acts only on a date <dd>, identified by a <time> carrying schema:startDate/End.
function dateInputHTML(kind, value) {
  const property = kind === 'start' ? 'schema:startDate' : 'schema:endDate';
  return `<label for="event-${kind}-date" data-i18n="event.date.${kind}-date.label">${i18n.t(`event.date.${kind}-date.label.textContent`)}</label><input data-i18n="event.date.${kind}-date.input" data-property="${property}" draggable="false" type="date" value="${value}" />`;
}

function transformDatesToInputs(root) {
  if (!root || !isCV(root)) return;

  const valueOf = (t) => t ? (t.getAttribute('content') || t.getAttribute('datetime') || t.textContent.trim()) : '';

  root.querySelectorAll('dd').forEach((dd) => {
    const start = dd.querySelector(':scope > time[property="schema:startDate"]');
    const end = dd.querySelector(':scope > time[property="schema:endDate"]');
    if (!start && !end) return;
    let html = dateInputHTML('start', valueOf(start));
    if (end) html += dateInputHTML('end', valueOf(end));
    dd.replaceChildren(fragmentFromString(html));
  });
}

registerEditorParseTransform(transformDatesToInputs);


// Save/read hook: collapse the editable country <select> into an <abbr> like a
// published CV (<abbr title="Switzerland">CH</abbr>). The selected code lives in
// data-value (synced by SelectView); the matching <option>'s text is the name.
function transformCountrySelects(doc) {
  const article = selectArticleNode(doc);
  if (!article || !isCV(article)) return;

  article.querySelectorAll('select[id$="-country"]').forEach((select) => {
    const code = select.getAttribute('data-value') ||
      (select.querySelector('option[selected]') || select.querySelector('option[value]:not([value=""])'))?.getAttribute('value') || '';
    if (!code) { select.remove(); return; }
    const option = select.querySelector(`option[value="${code}"]`);
    const name = option ? (option.textContent.trim() || option.getAttribute('title') || '') : '';
    //TODO: Change this to <span without using country code
    const abbr = doc.createElement('abbr');
    abbr.setAttribute('property', 'schema:addressCountry');
    if (name) abbr.setAttribute('title', name);
    abbr.textContent = code;
    select.replaceWith(abbr);
  });
}

registerDocumentTransform(transformCountrySelects);

// Editor hook (inverse): expand a published country <abbr> back into the
// editable <select> with that country pre-selected.
function countrySelectHTML(code) {
  const id = `${generateAttributeId()}-country`;
  return `<select id="${id}" name="${id}">${getCountryOptionsHTML({ selected: code })}</select>`;
}

function transformCountriesToSelects(root) {
  if (!root || !isCV(root)) return;

  root.querySelectorAll('abbr[property="schema:addressCountry"]').forEach((abbr) => {
    const code = abbr.textContent.trim();
    abbr.replaceWith(fragmentFromString(countrySelectHTML(code)));
  });
}

registerEditorParseTransform(transformCountriesToSelects);

// Location autocomplete -> published address markup.
function transformLocationInputs(doc) {
  const article = selectArticleNode(doc);
  if (!article || !isCV(article)) return;

  article.querySelectorAll('.autocomplete').forEach((wrapper) => {
    const input = wrapper.querySelector('input[name$="-event-location"]');
    if (!input) return;
    const label = (input.value || input.getAttribute('value') || '').trim();
    const entity = input.getAttribute('data-entity') || '';
    const locationType = input.getAttribute('data-location-type') || 'addressLocality';
    const regionCode = input.getAttribute('data-region-code') || '';
    const regionName = input.getAttribute('data-region-name') || '';
    const countryCode = input.getAttribute('data-country-code') || '';
    const countryName = input.getAttribute('data-country-name') || '';

    const address = doc.createElement('span');
    const rel = wrapper.getAttribute('rel');
    if (rel) address.setAttribute('rel', rel);

    if (locationType === 'addressLocality') {
      const span = doc.createElement('span');
      span.setAttribute('property', 'schema:addressLocality');
      span.textContent = label;
      address.appendChild(span);
      if (regionCode) {
        address.appendChild(doc.createTextNode(', '));
        const abbr = doc.createElement('abbr');
        abbr.setAttribute('property', 'schema:addressRegion');
        if (regionName) abbr.setAttribute('title', regionName);
        abbr.textContent = regionCode;
        address.appendChild(abbr);
      }
      if (countryCode) {
        address.appendChild(doc.createTextNode(', '));
        const abbr = doc.createElement('abbr');
        abbr.setAttribute('property', 'schema:addressCountry');
        if (countryName) abbr.setAttribute('title', countryName);
        abbr.textContent = countryCode;
        address.appendChild(abbr);
      }
    } else if (locationType === 'addressRegion') {
      if (regionCode) {
        const abbr = doc.createElement('abbr');
        abbr.setAttribute('property', 'schema:addressRegion');
        if (regionName) abbr.setAttribute('title', regionName);
        abbr.textContent = regionCode;
        address.appendChild(abbr);
      } else {
        const span = doc.createElement('span');
        span.setAttribute('property', 'schema:addressRegion');
        span.textContent = label;
        address.appendChild(span);
      }
      if (countryCode) {
        address.appendChild(doc.createTextNode(', '));
        const abbr = doc.createElement('abbr');
        abbr.setAttribute('property', 'schema:addressCountry');
        if (countryName) abbr.setAttribute('title', countryName);
        abbr.textContent = countryCode;
        address.appendChild(abbr);
      }
    } else {
      if (countryCode) {
        const abbr = doc.createElement('abbr');
        abbr.setAttribute('property', 'schema:addressCountry');
        if (countryName) abbr.setAttribute('title', countryName);
        abbr.textContent = countryCode;
        address.appendChild(abbr);
      } else {
        const span = doc.createElement('span');
        span.setAttribute('property', 'schema:addressCountry');
        span.textContent = label;
        address.appendChild(span);
      }
    }
    const dd = wrapper.closest('dd');
    if (dd && entity) dd.setAttribute('resource', entity);
    wrapper.replaceWith(address);
  });
}

registerDocumentTransform(transformLocationInputs);

// Inverse: published address -> editable autocomplete.
function locationInputHTML({ label = '', entity = '', locationType = '', regionCode = '', regionName = '', countryCode = '', countryName = '' } = {}) {
  const id = generateAttributeId();
  const esc = (s) => (s || '').replace(/"/g, '&quot;');
  const data = [
    entity && `data-entity="${esc(entity)}"`,
    locationType && `data-location-type="${esc(locationType)}"`,
    regionCode && `data-region-code="${esc(regionCode)}"`,
    regionName && `data-region-name="${esc(regionName)}"`,
    countryCode && `data-country-code="${esc(countryCode)}"`,
    countryName && `data-country-name="${esc(countryName)}"`,
  ].filter(Boolean).join(' ');
  return `<div class="autocomplete" rel="schema:address"><input name="${id}-event-location" placeholder="Enter location (city, region, country)" value="${esc(label)}" ${data} type="text" /></div>`;
}

function transformLocationsToInputs(root) {
  if (!root || !isCV(root)) return;

  root.querySelectorAll('span[rel~="schema:address"]').forEach((address) => {
    const locality = address.querySelector('[property~="schema:addressLocality"]');
    const region = address.querySelector('[property~="schema:addressRegion"]');
    const country = address.querySelector('[property~="schema:addressCountry"]');
    const dd = address.closest('dd');

    let locationType, label;
    if (locality) {
      locationType = 'addressLocality';
      label = locality.textContent.trim();
    } else if (region) {
      locationType = 'addressRegion';
      label = region.getAttribute('title') || region.textContent.trim();
    } else {
      locationType = 'addressCountry';
      label = country ? (country.getAttribute('title') || country.textContent.trim()) : '';
    }

    address.replaceWith(fragmentFromString(locationInputHTML({
      label,
      entity: dd ? (dd.getAttribute('resource') || '') : '',
      locationType,
      regionCode: region ? region.textContent.trim() : '',
      regionName: region ? (region.getAttribute('title') || '') : '',
      countryCode: country ? country.textContent.trim() : '',
      countryName: country ? (country.getAttribute('title') || '') : '',
    })));
  });
}

registerEditorParseTransform(transformLocationsToInputs);

// Skill autocomplete -> published markup.
function transformSkillInputs(doc) {
  const article = selectArticleNode(doc);
  if (!article || !isCV(article)) return;

  article.querySelectorAll('.autocomplete').forEach((wrapper) => {
    const input = wrapper.querySelector('input[data-autocomplete="skill"]');
    if (!input) return;
    const title = (input.value || input.getAttribute('value') || '').trim();
    const uri = input.getAttribute('data-entity') || '';
    if (!title) { wrapper.remove(); return; }
    if (uri) {
      const a = doc.createElement('a');
      a.setAttribute('property', 'schema:knowsAbout');
      a.setAttribute('href', uri);
      a.textContent = title;
      wrapper.replaceWith(a);
    } else {
      const span = doc.createElement('span');
      span.setAttribute('property', 'schema:knowsAbout');
      span.textContent = title;
      wrapper.replaceWith(span);
    }
  });
}

registerDocumentTransform(transformSkillInputs);

// Inverse: published skill -> editable autocomplete.
function transformSkillsToInputs(root) {
  if (!root || !isCV(root)) return;

  root.querySelectorAll('[property~="schema:knowsAbout"]').forEach((el) => {
    const title = el.textContent.trim();
    const uri = el.tagName === 'A' ? (el.getAttribute('href') || '') : '';
    el.replaceWith(fragmentFromString(skillInputHTML({ title, uri })));
  });
}

registerEditorParseTransform(transformSkillsToInputs);

// Organizer/department anchors -> published semantic attributes + department span wrapper.
function transformOrganizerInputs(doc) {
  const article = selectArticleNode(doc);
  if (!article || !isCV(article)) return;

  article.querySelectorAll('p.event-organization-name').forEach((p) => {
    const a = p.querySelector('a');
    if (a) {
      a.setAttribute('property', 'schema:name');
      a.setAttribute('rel', 'schema:url');
    }
    p.replaceWith(...Array.from(p.childNodes));
  });

  article.querySelectorAll('p.event-organization-department-name').forEach((p) => {
    const a = p.querySelector('a');
    if (a) {
      a.setAttribute('property', 'schema:name');
      a.setAttribute('rel', 'schema:url');
    }
    const span = doc.createElement('span');
    span.setAttribute('rel', 'schema:department');
    span.setAttribute('resource', `#${generateAttributeId()}`);
    span.append(...Array.from(p.childNodes));
    p.replaceWith(doc.createTextNode(' '), span);
  });
}

registerDocumentTransform(transformOrganizerInputs);

// Inverse: strip the semantic attributes and unwrap the department span on re-edit.
function transformOrganizerToInputs(root) {
  if (!root || !isCV(root)) return;

  root.querySelectorAll('dd[rel~="schema:organizer"]').forEach((dd) => {
    const deptSpan = dd.querySelector(':scope > span[rel~="schema:department"]');

    const deptP = document.createElement('p');
    deptP.className = 'event-organization-department-name';
    deptP.setAttribute('data-placeholder', 'Department');
    if (deptSpan) {
      const a = deptSpan.querySelector('a');
      if (a) { a.removeAttribute('property'); a.removeAttribute('rel'); }
      deptP.append(...Array.from(deptSpan.childNodes));
      deptSpan.remove();
    }

    const orgP = document.createElement('p');
    orgP.className = 'event-organization-name';
    orgP.setAttribute('data-placeholder', 'Organizer');
    const orgA = dd.querySelector(':scope > a');
    if (orgA) { orgA.removeAttribute('property'); orgA.removeAttribute('rel'); }
    orgP.append(...Array.from(dd.childNodes));

    dd.append(orgP, deptP);
  });
}

registerEditorParseTransform(transformOrganizerToInputs);

// data-placeholder is an editor-only hint for empty fields; drop it in read mode.
function removePlaceholders(doc) {
  const article = selectArticleNode(doc);
  if (!article) return;
  article.querySelectorAll('[data-placeholder]').forEach(el => el.removeAttribute('data-placeholder'));
}

// Inverse: re-add the editor-only hints when entering author mode (after a read
// toggle or reopening a saved CV, where they were stripped). The plugin only
// shows them on empty fields, so adding to all matching fields is harmless.
// Event fields are handled by restoreEventFields (they are pruned in read mode).
const PLACEHOLDERS = [
  ['dl.skill-category > dt', 'Category name'],
];

function addPlaceholders(root) {
  if (!root || !isCV(root)) return;
  PLACEHOLDERS.forEach(([selector, text]) => {
    root.querySelectorAll(selector).forEach(el => {
      if (!el.getAttribute('data-placeholder')) el.setAttribute('data-placeholder', text);
    });
  });
}

registerEditorParseTransform(addPlaceholders);

// Read mode prunes empty event fields, so on author switch re-add any missing
// field (dt/dd pair) in canonical order, with its placeholder, ready to edit.
function restoreEventFields(root) {
  if (!root || !isCV(root)) return;
  root.querySelectorAll(EVENT_SELECTOR).forEach((dl) => {
    const eventId = dl.getAttribute('id') || generateAttributeId();
    EVENT_FIELDS_ORDER.forEach((key, idx) => {
      if (dl.querySelector(`:scope > dt.event-${key}`)) return;
      let anchor = null;
      for (let j = idx + 1; j < EVENT_FIELDS_ORDER.length; j++) {
        anchor = dl.querySelector(`:scope > dt.event-${EVENT_FIELDS_ORDER[j]}`);
        if (anchor) break;
      }
      const frag = fragmentFromString(eventFieldHTML(key, eventId));
      if (anchor) anchor.before(frag); else dl.append(frag);
    });
  });
}

registerEditorParseTransform(restoreEventFields);

// True when an event <dd> carries no real value, ignoring label chrome and the
// separators (date "–", address commas) that are always present.
function isEventFieldEmpty(dd) {
  const clone = dd.cloneNode(true);
  clone.querySelectorAll('label').forEach(el => el.remove());
  if (clone.textContent.replace(/[\s,–—-]+/g, '')) return false;
  if (clone.querySelector('img, iframe, audio, video, svg, object, embed')) return false;
  if (Array.from(clone.querySelectorAll('input')).some(i => (i.getAttribute('value') || '').trim())) return false;
  if (Array.from(clone.querySelectorAll('time')).some(t => (t.getAttribute('datetime') || t.textContent).trim())) return false;
  return true;
}

// Drop empty event fields so read mode only shows filled ones; restoreEventFields
// re-adds them with placeholders on the next author switch. A field is the <dt>
// plus its following <dd>; remove the pair when the <dd> is empty, and remove an
// orphan <dt> whose <dd> was already stripped (e.g. by an earlier save).
function pruneEmptyEventFields(dl) {
  Array.from(dl.children).forEach((dt) => {
    if (dt.tagName !== 'DT') return;
    const dd = dt.nextElementSibling;
    const hasDd = dd && dd.tagName === 'DD';
    if (!hasDd || isEventFieldEmpty(dd)) {
      dt.remove();
      if (hasDd) dd.remove();
    }
  });
}

// Drop items left completely empty (no text, no media): a skill with no value, a
// category with no name or skills, an empty award/credential or list item. Loops
// so emptying children can empty parents (e.g. last skill removed -> empty
// category).
function pruneEmptyItems(doc) {
  const article = selectArticleNode(doc);
  if (!article) return;

  // Event entries: prune each empty field, then drop the whole <li> if nothing
  // is left, ignoring the <dt>/<label> chrome and leftover separators.
  article.querySelectorAll(EVENT_SELECTOR).forEach((dl) => {
    pruneEmptyEventFields(dl);
    const clone = dl.cloneNode(true);
    clone.querySelectorAll('dt, label').forEach(el => el.remove());
    const text = clone.textContent.replace(/[\s,–—-]+/g, '');
    if (!text && !clone.querySelector('img, iframe, audio, video, svg')) {
      (dl.closest('li') || dl).remove();
    }
  });

  const keep = 'img, hr, input, time, iframe, audio, video, svg, object, embed';
  const isEmpty = (el) => !el.textContent.trim() && !el.querySelector(keep);
  // p[rel] is scoped to award/credential entries — not event fields like the
  // description <p rel="schema:performer">, which must survive as an editable field.
  const selector = 'dl.skill-category dd, dl.skill-category, li, p[property~="schema:award"], p[rel~="schema:hasCredential"]';
  let changed = true;
  while (changed) {
    changed = false;
    article.querySelectorAll(selector).forEach((el) => {
      if (isEmpty(el)) { el.remove(); changed = true; }
    });
  }
}

registerDocumentTransform(pruneEmptyItems);

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
        const sectionId = addEntry.dataset.sectionId;
        const entryHTML = SECTIONS[type]?.entryHTML;
        if (entryHTML && sectionId) {
          pmEditor()?.insertFragmentAtEndOfChild(`#${sectionId}`, 'ul', fragmentFromString(entryHTML()));
        }
        return;
      }

      const addSkill = e.target.closest('.cv-skill-add');
      if (addSkill) {
        const target = addSkill.dataset.target;
        if (target) {
          pmEditor()?.insertFragmentAtEndOf(`#${target}`, fragmentFromString(`<dd>${skillInputHTML()}</dd>`));
        }
      }
    });

    setupAutocomplete('input[name$="-event-location"]', getWikidataResults, showLocationSuggestions, {
      listId: 'cv-location-suggestions',
      debounceMs: 1000,
    });

    setupAutocomplete('input[data-autocomplete="skill"]', getEscoResults, showSkillSuggestions, {
      listId: 'cv-skill-suggestions',
      debounceMs: 300,
    });
  }

  if (!authHandlerAttached) {
    authHandlerAttached = true;
    document.addEventListener('dokieli:auth-ready', () => {
      const iri = Config.User?.IRI;
      if (!iri) return;
      const root = getCVRoot();
      if (!root || !isCV(root)) return;
      const editor = pmEditor();
      if (editor) {
        editor.setOriginalAttributeOnDescendants('#content', 'ul', 'about', iri);
      } else {
        root.querySelectorAll('#content > section ul').forEach(ul => {
          if (!ul.getAttribute('about')) ul.setAttribute('about', iri);
        });
      }
    });
  }

  if (!modeHandlerAttached) {
    modeHandlerAttached = true;
    window.addEventListener('dokieli:editor-mode-changed', (e) => {
      const root = getCVRoot();
      if (!root || !isCV(root)) return;
      // Leaving author mode: PM is already torn down, so the live DOM holds the
      // date inputs (with synced values). Collapse them to <time>, as on save.
      if (e.detail?.mode !== 'author') {
        transformDateInputs(document);
        transformCountrySelects(document);
        transformLocationInputs(document);
        transformSkillInputs(document);
        transformOrganizerInputs(document);
        removePlaceholders(document);
        pruneEmptyItems(document);
      }
      refreshTOC(root);
  });
  }
}
