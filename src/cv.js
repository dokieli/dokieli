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
import { generateAttributeId, generateUUID, debounce } from './util.js';
import { getCountryOptionsHTML, showLocationSuggestions } from './doc.js';
import { getWikidataResults } from './graph.js';
import { Icon } from './ui/icons.js';
import { sanitizeInsertAdjacentHTML } from './utils/sanitization.js';

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

  const present = Object.keys(SECTIONS).filter(type => content.querySelector(`:scope > section[id="${type}"]`));
  if (!present.length) return;

  const lis = present.map(type => `<li><a href="#${type}">${SECTIONS[type].label}</a></li>`).join('');
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
  const userDetails = {
    IRI: 'https://csarven.ca/#i'
  }

  return `<dl id="${eventId}" rel="${rel}" resource="#${eventId}" typeof="schema:Event">
    <dt class="event-name" data-i18n="event.name.dt">${i18n.t('event.name.dt.textContent')}</dt>
    <dd property="schema:name"><p data-placeholder="Experience name"></p></dd>

    <dt class="event-organizer" data-i18n="event.organizer.dt">${i18n.t('event.organizer.dt.textContent')}</dt>
    <dd rel="schema:organizer" resource="#${eventOrganizerId}" typeof="schema:Organization"><a href="${eventOrganizerUrl}" property="schema:name" rel="schema:url">${eventOrganizer}</a> <span rel="schema:department" resource="#${eventOrganizerDepartmentId}"><a href="${eventOrganizerDepartmentUrl}" property="schema:name" rel="schema:url"><abbr title="${eventOrganizerDepartment}">${eventOrganizerDepartmentCode}</abbr></a></span></dd>

    <dt class="event-location" data-i18n="event.location.dt">${i18n.t('event.location.dt.textContent')}</dt>
    <dd rel="schema:location" resource="${eventLocation}" typeof="schema:Place"><div class="autocomplete" rel="schema:address"><input name="${eventId}-event-location" placeholder="Enter location (locality, region, country)" value="" type="text" /></div></dd>

    <dt class="event-date" data-i18n="event.date.dt">${i18n.t('event.date.dt.textContent')}</dt>
    <dd>
      <label for="event-start-date" data-i18n="event.date.start-date.label">${i18n.t('event.date.start-date.label.textContent')}</label><input contenteditable="false" data-i18n="event.date.start-date.input" data-property="schema:startDate" draggable="false" type="date" value="" /><label for="event-end-date" data-i18n="event.date.end-date.label">${i18n.t('event.date.end-date.label.textContent')}</label><input data-i18n="event.date.end-date.input" data-property="schema:endDate" draggable="false" type="date" value="" />
    </dd>

    <dt class="event-description" data-i18n="event.description.dt">${i18n.t('event.description.dt.textContent')}</dt>
    <dd datatype="rdf:HTML" property="schema:description">
      <p data-placeholder="Experience description" rel="schema:performer" resource="${userDetails.IRI}"></p>
    </dd>
  </dl>`;
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

    const locationSearchOptions = { wikidataTypes: ['places'] };
    let locationSuggestionsClosed = false;

    const doLocationSearch = async (input) => {
      const keyword = input.value.trim();
      document.getElementById('cv-location-suggestions')?.remove();

      if (!keyword) {
        document.getElementById('cv-location-suggestions')?.remove();
        return;
      }

      try {
        let progress = input.nextElementSibling?.classList.contains('progress') ? input.nextElementSibling : null;

        if (progress) {
          progress.remove();
        }

        progress = `<span class="progress">${Icon[".fas.fa-circle-notch.fa-spin.fa-fw"]}</span>`;
        sanitizeInsertAdjacentHTML(input, 'afterend', progress);

        const results = await getWikidataResults(keyword, locationSearchOptions);

        progress = input.nextElementSibling?.classList.contains('progress') ? input.nextElementSibling : null;

        progress.remove();

        if (locationSuggestionsClosed || input.value.trim() !== keyword) return;

        showLocationSuggestions(input, results);
      } catch(err) {
        console.log(err)
      }
    };

    const runLocationSearch = debounce(doLocationSearch, 1000);

    document.addEventListener('input', (e) => {
      if (!e.target.matches('input[name$="-event-location"]')) return;
      locationSuggestionsClosed = false;
      runLocationSearch(e.target);
    });

    document.addEventListener('keyup', (e) => {
      if (!e.target.matches('input[name$="-event-location"]')) return;
      const list = document.getElementById('cv-location-suggestions');
      const items = list ? Array.from(list.children) : [];

      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowUp': {
          if (!items.length) return;
          e.preventDefault();
          e.stopPropagation();
          let i = items.findIndex(li => li.classList.contains('active'));
          items.forEach(li => { li.classList.remove('active'); li.setAttribute('aria-selected', 'false'); });
          i = e.key === 'ArrowDown' ? (i + 1) % items.length : (i <= 0 ? items.length : i) - 1;
          const active = items[i];
          active.classList.add('active');
          active.setAttribute('aria-selected', 'true');
          break;
        }
        case 'Enter': {
          e.preventDefault();
          e.stopPropagation();
          const active = items.find(li => li.classList.contains('active'));
          if (active) active.selectResult();
          else doLocationSearch(e.target); 
          break;
        }
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          locationSuggestionsClosed = true;
          list?.remove();
          break;
      }
    }, true);
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
      }      
      refreshTOC(root);
  });
  }
}
