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

import { NANOPUB_QUERY_URLS } from '@nanopub/nanopub-js/constants';
import Config from './config.js';
import { i18n } from './i18n.js';
import { getButtonHTML, getExperimentalBadgeHTML } from './ui/buttons.js';
import { Icon } from './ui/icons.js';
import { fragmentFromString, getNodeLanguage, selectArticleNode } from './utils/html.js';
import { htmlEncode, domSanitize } from './utils/sanitization.js';
import { generateAttributeId } from './util.js';
import { getFragmentOrLastPath, isLocalhost } from './uri.js';
import { requestOriginConsent } from './consent.js';
import { searchWikidataEntities } from './services.js';
import { loadNanopubLibrary } from './nanopub.js';
import { findAssertionQuads, findNanopubCreators, findProvenanceQuads } from './nanopub-query.js';
import { extractEntitiesFromText, NAME_LANGUAGES } from './nlp.js';
import { showVisualisationGraph } from './viz.js';
import { getDocument } from './doc.js';
import { RDAP_BOOTSTRAP_URL, lookupDomain } from './rdap.js';
import { replyToResource, hideDocumentMenu } from './dialog.js';
import { extensionFetch } from './auth.js';
import { fitSidePanelToTabs, initializeNotificationsResize, openSidePanel } from './activity.js';
import { getDeviceStorageItem, setDeviceStorageItem, removeDeviceStorageItem } from './storage.js';
import { selectionToTextQuote, setSelectionFromTextQuote } from './editor/utils/annotation.js';
import { loadPilotCode, getPilotClaimLanguageHTML, getPilotHTML, initPilotForm, getPilotRequestFields, getPilotErrorKey } from './ohyeah-pilot.js';

const ENTITY_GROUPS = ['people', 'organizations', 'places', 'names', 'acronyms'];
const LOOKUP_GROUPS = ['people', 'organizations', 'places', 'names'];
// Higher wins where highlights overlap
const HIGHLIGHT_PRIORITY = { acronyms: 0, names: 1, places: 2, organizations: 3, people: 4 };
// Labels from the ClaimBuster dataset
const CLAIM_LABELS = ['CFS', 'UFS', 'NFS'];
// Labels from the LOGIC dataset
const FALLACY_LABELS = ['ad_hominem', 'ad_populum', 'appeal_to_emotion', 'circular_reasoning', 'equivocation', 'fallacy_of_credibility', 'fallacy_of_extension', 'fallacy_of_logic', 'fallacy_of_relevance', 'false_causality', 'false_dilemma', 'faulty_generalization', 'intentional'];
const WIKIDATA_RESULTS_PER_NAME = 5;
const NANOPUB_RESULTS_PER_NAME = 10;
const MAX_LOOKUP_NAMES = 20;
// Matches the service's default limit
const MAX_TEXT_LENGTH = 200000;

// Claim and fallacy checks send the text in parts, so results arrive early and often
// The first part is small and goes alone, sized for a fast first response
const FIRST_PART_LENGTH = 500;
const MIN_PART_LENGTH = 500;
const MAX_PART_LENGTH = 32000;
// Later parts are sized from the measured speed to come back in about this time
const TARGET_PART_TIME = 3000;
const PART_CONCURRENCY = 2;

const SKIP_SELECTOR = '.do, script, style, noscript, template, [hidden], [aria-hidden="true"]';
const BLOCK_SELECTOR = 'p, li, dt, dd, h1, h2, h3, h4, h5, h6, td, th, caption, figcaption, blockquote, pre, div, section, article, aside, header, footer, nav';

const SERVICE_STORAGE_KEY = 'DO.Config.OhYeah';
const WIDTH_PROPERTY = '--dokieli-ohyeah-width';

const MODEL_URL = 'https://huggingface.co/Nithiwat/mdeberta-v3-base_claimbuster';
const SENTENCE_MODEL_URL = 'https://huggingface.co/spacy/en_core_web_sm';
const FALLACY_MODEL_URL = 'https://huggingface.co/MidhunKanadan/roberta-large-fallacy-classification';

let state = {};
let ownServiceURL = null;

function getServiceURL(path) {
  return new URL(path, getActiveServiceURL()).href;
}

function serviceFetch(url, init) {
  return Config.WebExtensionEnabled ? extensionFetch(url, init, { anonymous: true }) : fetch(url, init);
}

function getActiveServiceURL() {
  return ownServiceURL || Config.OhYeah.ServiceURL;
}

function normaliseServiceURL(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    return url.href;
  }
  catch {
    return null;
  }
}

async function loadOwnService() {
  try {
    const stored = await getDeviceStorageItem(SERVICE_STORAGE_KEY);
    ownServiceURL = normaliseServiceURL(stored?.serviceURL);
  }
  catch {
    ownServiceURL = null;
  }

  await loadPilotCode();
}

function encodeAttribute(value) {
  return htmlEncode(value, { mode: 'attribute' });
}

function getLanguageName(code) {
  try {
    return new Intl.DisplayNames([Config.User.UI.Language], { type: 'language' }).of(code) || code;
  }
  catch {
    return code;
  }
}

function formatDate(value) {
  const date = new Date(Array.isArray(value) ? value[0] : value);
  if (isNaN(date)) return htmlEncode(value);
  return htmlEncode(new Intl.DateTimeFormat(Config.User.UI.Language, { dateStyle: 'medium' }).format(date));
}

// Text of the range with the text node behind each part, so offsets map back to the DOM
function getRangeText(range) {
  const container = range.commonAncestorContainer;
  const root = container.nodeType === Node.TEXT_NODE ? container.parentNode : container;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const segments = [];
  let text = '';
  let previousBlock = null;
  let node;

  while ((node = walker.nextNode())) {
    if (!range.intersectsNode(node)) continue;

    const skip = node.parentElement?.closest(SKIP_SELECTOR);
    if (skip && skip !== root && root.contains(skip)) continue;

    const start = node === range.startContainer ? range.startOffset : 0;
    const end = node === range.endContainer ? range.endOffset : node.length;
    if (end <= start) continue;

    // Keeps headings and paragraphs apart so they are not read as one sentence
    const block = node.parentElement?.closest(BLOCK_SELECTOR);
    if (previousBlock && block !== previousBlock && !/\s$/.test(text)) text += '\n\n';
    previousBlock = block;

    segments.push({ node, start, offset: text.length, length: end - start });
    text += node.data.slice(start, end);
  }

  return { text, segments };
}

function getRangesForOffsets(segments, start, end) {
  const ranges = [];

  segments.forEach(segment => {
    const from = Math.max(start, segment.offset);
    const to = Math.min(end, segment.offset + segment.length);
    if (from >= to) return;

    const range = document.createRange();
    range.setStart(segment.node, segment.start + from - segment.offset);
    range.setEnd(segment.node, segment.start + to - segment.offset);
    ranges.push(range);
  });

  return ranges;
}

function canHighlight() {
  return !!window.CSS?.highlights && typeof Highlight !== 'undefined';
}

function getMarks(entities, segments) {
  return ENTITY_GROUPS.flatMap(group => entities[group].map(entity => ({
    group,
    text: entity.text,
    ranges: getRangesForOffsets(segments, entity.start, entity.end)
  })));
}

function applyHighlights() {
  if (!canHighlight()) return;

  ENTITY_GROUPS.forEach(group => {
    const name = `${group}-selection-highlights`;
    const ranges = (state.marks || []).filter(mark => mark.group === group).flatMap(mark => mark.ranges);

    if (!ranges.length) {
      CSS.highlights.delete(name);
      return;
    }

    const highlight = new Highlight(...ranges);
    highlight.priority = HIGHLIGHT_PRIORITY[group];
    CSS.highlights.set(name, highlight);
  });

  const claimRanges = (state.claimTargets || []).flatMap(target => target.ranges);
  if (claimRanges.length) {
    CSS.highlights.set('claims-cfs-highlights', new Highlight(...claimRanges));
  }
  else {
    CSS.highlights.delete('claims-cfs-highlights');
  }

  const fallacyRanges = (state.fallacyTargets || []).flatMap(target => target.ranges);
  if (fallacyRanges.length) {
    CSS.highlights.set('fallacies-highlights', new Highlight(...fallacyRanges));
  }
  else {
    CSS.highlights.delete('fallacies-highlights');
  }
}

function removeHighlights() {
  if (!canHighlight()) return;
  ENTITY_GROUPS.forEach(group => CSS.highlights.delete(`${group}-selection-highlights`));
  CSS.highlights.delete('claims-cfs-highlights');
  CSS.highlights.delete('fallacies-highlights');
}

// Highlights get no pointer events, so the pointer is tested against each range's boxes
function rangesContainPoint(ranges, x, y) {
  return ranges.some(range =>
    [...range.getClientRects()].some(r => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom));
}

function getMarkAtPoint(x, y) {
  const marks = [...(state.marks || [])].sort((a, b) => HIGHLIGHT_PRIORITY[b.group] - HIGHLIGHT_PRIORITY[a.group]);

  return marks.find(mark => rangesContainPoint(mark.ranges, x, y));
}

// The claim or fallacy sentence under the pointer, with the card section it belongs to
function getCheckTargetAtPoint(x, y) {
  const lists = [
    { sectionId: 'claimcheck-results', targets: state.claimTargets },
    { sectionId: 'fallacycheck-results', targets: state.fallacyTargets }
  ];

  for (const { sectionId, targets } of lists) {
    const target = (targets || []).find(item => rangesContainPoint(item.ranges, x, y));
    if (target) return { sectionId, target };
  }

  return null;
}

function getTooltip() {
  let tooltip = document.getElementById('ohyeah-entity-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'ohyeah-entity-tooltip';
    tooltip.className = 'do';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.hidden = true;
    document.body.appendChild(tooltip);
  }
  return tooltip;
}

// Highlights are not elements, so the element holding the marked text is described by the tooltip while it shows
let describedElement = null;

function setDescribedElement(element) {
  if (describedElement === element) return;

  if (describedElement) {
    const ids = (describedElement.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== 'ohyeah-entity-tooltip');
    if (ids.length) describedElement.setAttribute('aria-describedby', ids.join(' '));
    else describedElement.removeAttribute('aria-describedby');
  }

  describedElement = element;

  if (element) {
    const ids = (element.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    element.setAttribute('aria-describedby', [...ids, 'ohyeah-entity-tooltip'].join(' '));
  }
}

function showTooltip(mark, x, y) {
  const tooltip = getTooltip();
  const methodKey = state.nameMethod === 'service' ? 'panel.ohyeah.tooltip.method-service' : 'panel.ohyeah.tooltip.method';
  const lookup = LOOKUP_GROUPS.includes(mark.group) ? `
      <dt data-i18n="panel.ohyeah.tooltip.lookup.dt">${i18n.t('panel.ohyeah.tooltip.lookup.dt.textContent')}</dt>
      <dd data-i18n="panel.ohyeah.tooltip.lookup">${i18n.t('panel.ohyeah.tooltip.lookup.textContent')}</dd>` : '';

  tooltip.replaceChildren(fragmentFromString(domSanitize(`
    <dl>
      <dt data-i18n="panel.ohyeah.tooltip.legend.dt">${i18n.t('panel.ohyeah.tooltip.legend.dt.textContent')}</dt>
      <dd class="entity-legend-${mark.group}">${htmlEncode(i18n.t(`panel.ohyeah.entity.${mark.group}.textContent`))}</dd>
      <dt data-i18n="panel.ohyeah.tooltip.term.dt">${i18n.t('panel.ohyeah.tooltip.term.dt.textContent')}</dt>
      <dd>${htmlEncode(mark.text)}</dd>
      <dt data-i18n="panel.ohyeah.tooltip.method.dt">${i18n.t('panel.ohyeah.tooltip.method.dt.textContent')}</dt>
      <dd data-i18n="${methodKey}">${i18n.t(`${methodKey}.textContent`)}</dd>${lookup}
    </dl>`)));

  setDescribedElement(mark.ranges[0]?.startContainer.parentElement || null);
  tooltip.hidden = false;
  const left = Math.min(x + 12, window.innerWidth - tooltip.offsetWidth - 8);
  const top = y + 16 + tooltip.offsetHeight > window.innerHeight ? y - tooltip.offsetHeight - 8 : y + 16;
  tooltip.style.left = `${Math.max(8, left)}px`;
  tooltip.style.top = `${Math.max(8, top)}px`;
}

function hideTooltip() {
  const tooltip = document.getElementById('ohyeah-entity-tooltip');
  if (tooltip) tooltip.hidden = true;
  setDescribedElement(null);
  document.documentElement.classList.remove('ohyeah-mark-hover');
}

let pointerFrame = null;

function onPointerMove(e) {
  if (pointerFrame) return;
  const { clientX, clientY, target } = e;
  pointerFrame = requestAnimationFrame(() => {
    pointerFrame = null;
    const inPanel = target.closest?.('.do');
    const mark = inPanel ? null : getMarkAtPoint(clientX, clientY);
    if (mark) {
      document.documentElement.classList.add('ohyeah-mark-hover');
      showTooltip(mark, clientX, clientY);
      return;
    }

    hideTooltip();
    if (!inPanel && getCheckTargetAtPoint(clientX, clientY)) {
      document.documentElement.classList.add('ohyeah-check-hover');
    }
    else {
      document.documentElement.classList.remove('ohyeah-check-hover');
    }
  });
}

function onPointerClick(e) {
  if (e.target.closest?.('.do')) return;
  // A click at the end of a drag selection keeps the toolbar flow untouched
  if (!document.getSelection()?.isCollapsed) return;

  const aside = document.getElementById('document-ohyeah');
  if (!aside) return;

  const mark = getMarkAtPoint(e.clientX, e.clientY);
  if (mark) {
    if (!LOOKUP_GROUPS.includes(mark.group)) return;
    const showCard = () => {
      const card = [...aside.querySelectorAll('#wikidata-results [data-name]')].find(node => node.dataset.name === mark.text.toLowerCase());
      (card || aside.querySelector('#wikidata-results')).scrollIntoView({ block: 'nearest' });
    };
    const loading = selectTab(aside, 'wikidata-results');
    showCard();
    loading?.then(showCard);
    return;
  }

  const found = getCheckTargetAtPoint(e.clientX, e.clientY);
  if (!found) return;

  selectTab(aside, found.sectionId);
  aside.querySelector(`#${found.sectionId} li[data-start="${found.target.start}"][data-end="${found.target.end}"]`)
    ?.scrollIntoView({ block: 'nearest' });
}

function addPointerListeners() {
  if (!state.marks?.length && !state.claimTargets?.length && !state.fallacyTargets?.length) return;
  document.addEventListener('mousemove', onPointerMove);
  document.addEventListener('click', onPointerClick);
}

function removePointerListeners() {
  document.removeEventListener('mousemove', onPointerMove);
  document.removeEventListener('click', onPointerClick);
  document.documentElement.classList.remove('ohyeah-check-hover');
  hideTooltip();
}

function teardown() {
  state.aborts?.forEach(controller => controller.abort());
  state.observer?.disconnect();
  removePointerListeners();
  document.getElementById('ohyeah-entity-tooltip')?.remove();
  removeHighlights();
  state = {};
}

function getLookupNames(entities) {
  const counts = new Map();

  LOOKUP_GROUPS.forEach(group => {
    entities[group].forEach(entity => {
      const key = entity.text.toLowerCase();
      if (!entity.text) return;
      const current = counts.get(key) || { group, text: entity.text, count: 0 };
      current.count++;
      counts.set(key, current);
    });
  });

  const names = [...counts.values()].sort((a, b) => b.count - a.count);
  return { names: names.slice(0, MAX_LOOKUP_NAMES), total: names.length };
}

function setSectionContent(section, html) {
  section.querySelector('.results').replaceChildren(fragmentFromString(domSanitize(html)));
}

// A paragraph that keeps its key and values, so it can be translated again when the language changes
function getMessageHTML(key, options = {}, className = '', html = false) {
  const vars = Object.entries(options).map(([name, value]) => ` data-i18n-${name}="${encodeAttribute(value)}"`).join('');
  const classAttribute = className ? ` class="${className}"` : '';
  return `<p${classAttribute} data-i18n="${key}"${vars}>${i18n.t(`${key}.${html ? 'innerHTML' : 'textContent'}`, options)}</p>`;
}

function getProgressHTML(key) {
  return `<p class="progress"><span data-i18n="${key}">${i18n.t(`${key}.textContent`)}</span> ${Icon['.fas.fa-circle-notch.fa-spin.fa-fw']}</p>`;
}

function getPartProgressHTML(percent) {
  return `<p class="progress"><span data-i18n="panel.ohyeah.check.progress-parts" data-i18n-percent="${encodeAttribute(percent)}">${i18n.t('panel.ohyeah.check.progress-parts.textContent', { percent })}</span> ${Icon['.fas.fa-circle-notch.fa-spin.fa-fw']}</p>`;
}

function getSourceHTML(link) {
  return `
    <dl class="query-source">
      <dt data-i18n="panel.ohyeah.source.dt">${i18n.t('panel.ohyeah.source.dt.textContent')}</dt>
      <dd>${link}</dd>
    </dl>`;
}

function getLanguageNoticeHTML() {
  const { language } = state;
  if (language === 'en') return '';

  const key = language === 'es' ? 'panel.ohyeah.language.es.p' : 'panel.ohyeah.language.other.p';
  const name = getLanguageName(language);
  return `<p class="ohyeah-notice ohyeah-language-notice" data-i18n="${key}" data-i18n-language="${encodeAttribute(name)}">${i18n.t(`${key}.innerHTML`, { language: name })}</p>`;
}

// Text in a span, so a language change keeps the info button that follows it
function getTextWithInfoHTML(key, options, infoButton, className = '') {
  const vars = Object.entries(options).map(([name, value]) => ` data-i18n-${name}="${encodeAttribute(value)}"`).join('');
  return `<p${className ? ` class="${className}"` : ''}><span data-i18n="${key}"${vars}>${i18n.t(`${key}.innerHTML`, options)}</span> ${infoButton}</p>`;
}

function getClaimCheckServiceHTML() {
  const url = getActiveServiceURL();
  const key = ownServiceURL ? 'panel.ohyeah.claimcheck.optional-own.p' : 'panel.ohyeah.claimcheck.optional.p';
  return `<p class="ohyeah-service-text" data-i18n="${key}" data-i18n-url="${encodeAttribute(url)}">${i18n.t(`${key}.innerHTML`, { url })}</p>`;
}

function getWhoisServiceHTML() {
  const url = Config.OhYeah.ServiceURL;
  return `<p class="ohyeah-whois-service-text" data-i18n="panel.ohyeah.whois.about.p" data-i18n-url="${encodeAttribute(url)}">${i18n.t('panel.ohyeah.whois.about.p.innerHTML', { url })}</p>`;
}

function getOwnServiceHTML() {
  return `
    <details class="ohyeah-service"${ownServiceURL ? ' open=""' : ''}>
      <summary data-i18n="panel.ohyeah.service.summary">${i18n.t('panel.ohyeah.service.summary.textContent')}</summary>
      ${getTextWithInfoHTML('panel.ohyeah.service.about.p', { model: MODEL_URL, sentences: SENTENCE_MODEL_URL }, Config.Button.Info.OhYeahService)}
      <form class="ohyeah-service-form">
        <label data-i18n="panel.ohyeah.service.label" for="ohyeah-service-url">${i18n.t('panel.ohyeah.service.label.textContent')}</label>
        <input id="ohyeah-service-url" name="ohyeah-service-url" placeholder="http://127.0.0.1:4848/" required="" type="url" value="${encodeAttribute(ownServiceURL || '')}" />
        <button data-i18n="panel.ohyeah.service.save.button" type="submit">${i18n.t('panel.ohyeah.service.save.button.textContent')}</button>
        <button class="ohyeah-service-reset" data-i18n="panel.ohyeah.service.reset.button"${ownServiceURL ? '' : ' disabled=""'} type="button">${i18n.t('panel.ohyeah.service.reset.button.textContent')}</button>
        <p class="ohyeah-service-message" role="status"></p>
      </form>
    </details>`;
}

function getClaimContextHTML() {
  const key = state.scope === 'document' ? 'panel.ohyeah.claimcheck.context-document.p' : 'panel.ohyeah.claimcheck.context-selection.p';
  return `<p data-i18n="${key}">${i18n.t(`${key}.innerHTML`)}</p>`;
}

function getFallacyServiceHTML() {
  const url = getActiveServiceURL();
  const key = ownServiceURL ? 'panel.ohyeah.fallacycheck.optional-own.p' : 'panel.ohyeah.fallacycheck.optional.p';
  return `<p class="ohyeah-fallacy-service-text" data-i18n="${key}" data-i18n-url="${encodeAttribute(url)}">${i18n.t(`${key}.innerHTML`, { url })}</p>`;
}

function getFallacyContextHTML() {
  return `<p data-i18n="panel.ohyeah.fallacycheck.context.p" data-i18n-model="${encodeAttribute(FALLACY_MODEL_URL)}">${i18n.t('panel.ohyeah.fallacycheck.context.p.innerHTML', { model: FALLACY_MODEL_URL })}</p>`;
}

function getFallacyLanguageHTML() {
  if (state.language === 'en') return '';
  return `<p class="ohyeah-warning" data-i18n="panel.ohyeah.fallacycheck.language-other.p">${i18n.t('panel.ohyeah.fallacycheck.language-other.p.textContent')}</p>`;
}

function getClaimLanguageHTML() {
  const { language } = state;
  if (language === 'en') return '';

  const pilot = getPilotClaimLanguageHTML(language);
  if (pilot) return pilot;

  const key = language === 'es' ? 'panel.ohyeah.claimcheck.language-es.p' : 'panel.ohyeah.claimcheck.language-other.p';
  return `<p class="ohyeah-warning ohyeah-claim-language" data-i18n="${key}">${i18n.t(`${key}.textContent`)}</p>`;
}

function getLegendHTML() {
  if (!state.entities) return '';
  const groups = ENTITY_GROUPS.filter(group => state.entities[group].length);
  if (!groups.length) return '';

  return `
    <details class="entity-legend">
      <summary><span data-i18n="panel.ohyeah.legend.summary">${i18n.t('panel.ohyeah.legend.summary.textContent')}</span> ${Config.Button.Info.OhYeahNames}</summary>
      <ul>
        ${groups.map(group => `<li class="entity-legend-${group}" data-i18n="panel.ohyeah.legend.${group}">${i18n.t(`panel.ohyeah.legend.${group}.textContent`)}</li>`).join('')}
      </ul>
    </details>`;
}

function getPanelHTML() {
  const lang = Config.User.UI.Language;
  const dir = Config.User.UI.LanguageDir;
  const buttonToggle = getButtonHTML({ key: 'panel.ohyeah.toggle.button', button: 'toggle', buttonClass: 'toggle' });
  const buttonGraph = Config.GraphViewerAvailable ? getButtonHTML({ key: 'panel.ohyeah.graph.button', button: 'graph', buttonClass: 'graph' }) : '';
  const canRequestAssessment = state.scope === 'document' || !!Config.Editor?.socialToolbarView;
  const buttonRequestAssessment = canRequestAssessment ? getButtonHTML({ key: 'panel.ohyeah.request-assessment.button', button: 'request-assessment', buttonClass: 'request-assessment' }) : '';
  const buttonClaimCheck = getButtonHTML({ key: 'panel.ohyeah.claimcheck.run.button', button: 'ohyeah', buttonClass: 'claim-check' });
  const buttonFallacyCheck = getButtonHTML({ key: 'panel.ohyeah.fallacycheck.run.button', button: 'ohyeah', buttonClass: 'fallacy-check' });
  const scopeKey = state.scope === 'document' ? 'panel.ohyeah.scope.document.p' : 'panel.ohyeah.scope.selection.p';
  const tabs = ['claimcheck', 'fallacycheck', 'wikidata', 'nanopub', 'whois'];

  return `
    <aside aria-labelledby="document-ohyeah-label" class="do on" contenteditable="false" dir="${dir}" id="document-ohyeah" lang="${lang}" rel="schema:hasPart" resource="#document-ohyeah" xml:lang="${lang}">
      <div aria-hidden="true" class="resizer" title="${i18n.t('panel.ohyeah.resizer.title')}"></div>
      <h2 id="document-ohyeah-label" property="schema:name"><span data-i18n="panel.ohyeah.h2">${i18n.t('panel.ohyeah.h2.textContent')}</span> ${getExperimentalBadgeHTML()} ${Config.Button.Info.OhYeah}</h2>
      ${buttonToggle}
      <div class="info"></div>
      <div>
        <dl class="ohyeah-notice">
          ${['experimental', 'method', 'purpose', 'errors'].map(item => `
            <dt data-i18n="panel.ohyeah.disclaimer.${item}.dt">${i18n.t(`panel.ohyeah.disclaimer.${item}.dt.textContent`)}</dt>
            <dd data-i18n="panel.ohyeah.disclaimer.${item}.dd">${i18n.t(`panel.ohyeah.disclaimer.${item}.dd.textContent`)}</dd>`).join('')}
        </dl>
        <p class="ohyeah-scope" data-i18n="${scopeKey}">${i18n.t(`${scopeKey}.textContent`)}</p>
        ${getLanguageNoticeHTML()}
        <p class="ohyeah-actions">${buttonGraph}${buttonRequestAssessment}</p>
        <div class="tabs">
          <nav aria-label="${i18n.t('panel.ohyeah.tabs.nav.aria-label')}">
            <ul>
              ${tabs.map((tab, i) => `<li${i === 0 ? ' class="selected"' : ''}><a data-i18n="panel.ohyeah.${tab}.tab" href="#${tab}-results">${i18n.t(`panel.ohyeah.${tab}.tab.textContent`)}</a></li>`).join('')}
            </ul>
          </nav>
          <section class="selected" id="claimcheck-results" rel="schema:hasPart" resource="#claimcheck-results">
            <h3 property="schema:name"><span data-i18n="panel.ohyeah.claimcheck.h3">${i18n.t('panel.ohyeah.claimcheck.h3.textContent')}</span> ${Config.Button.Info.OhYeahClaimCheck}</h3>
            <div class="ohyeah-notice">
              ${getClaimCheckServiceHTML()}
              ${getOwnServiceHTML()}
              ${getClaimContextHTML()}
              ${getClaimLanguageHTML()}
              ${getPilotHTML(state.language)}
            </div>
            <p>${buttonClaimCheck}</p>
            <div class="results"></div>
          </section>
          <section id="fallacycheck-results" rel="schema:hasPart" resource="#fallacycheck-results">
            <h3 property="schema:name"><span data-i18n="panel.ohyeah.fallacycheck.h3">${i18n.t('panel.ohyeah.fallacycheck.h3.textContent')}</span> ${Config.Button.Info.OhYeahFallacyCheck}</h3>
            <div class="ohyeah-notice">
              ${getFallacyServiceHTML()}
              ${getFallacyContextHTML()}
              ${getFallacyLanguageHTML()}
            </div>
            <p>${buttonFallacyCheck}</p>
            <div class="results"></div>
          </section>
          <section id="wikidata-results" rel="schema:hasPart" resource="#wikidata-results">
            <h3 property="schema:name"><span data-i18n="panel.ohyeah.wikidata.h3">${i18n.t('panel.ohyeah.wikidata.h3.textContent')}</span> ${Config.Button.Info.OhYeahSources}</h3>
            <div class="results"></div>
          </section>
          <section id="nanopub-results" rel="schema:hasPart" resource="#nanopub-results">
            <h3 property="schema:name"><span data-i18n="panel.ohyeah.nanopub.h3">${i18n.t('panel.ohyeah.nanopub.h3.textContent')}</span> ${Config.Button.Info.OhYeahSources}</h3>
            <div class="results"></div>
          </section>
          <section id="whois-results" rel="schema:hasPart" resource="#whois-results">
            <h3 property="schema:name"><span data-i18n="panel.ohyeah.whois.h3">${i18n.t('panel.ohyeah.whois.h3.textContent')}</span> ${Config.Button.Info.OhYeahSources}</h3>
            ${getWhoisServiceHTML()}
            <div class="results"></div>
          </section>
        </div>
      </div>
    </aside>`;
}

function selectTab(aside, id) {
  const tabs = aside.querySelector('.tabs');
  tabs.querySelector('nav li.selected')?.classList.remove('selected');
  tabs.querySelector(`nav a[href="#${id}"]`)?.parentNode.classList.add('selected');
  tabs.querySelector(':scope > section.selected')?.classList.remove('selected');
  tabs.querySelector(`:scope > section#${id}`)?.classList.add('selected');
  return loadTab(aside, id);
}

const TAB_LOADERS = {
  'wikidata-results': section => showWikidataResults(section, getLookupNames(state.entities)),
  'nanopub-results': section => showNanopubResults(section, getLookupNames(state.entities)),
  'whois-results': section => showWhoisResults(section)
};

// Tabs load when first opened, so consent is asked only for what the reader looks at
function loadTab(aside, id) {
  const load = TAB_LOADERS[id];
  if (!load) return;
  if (state.loadedTabs.has(id)) return state.loadedTabs.get(id);
  // Name lookups wait for the names; openPanel loads the open tab once they are found
  if (id !== 'whois-results' && !state.entities) return;
  state.loadedTabs.set(id, load(aside.querySelector(`#${id}`)));
  return state.loadedTabs.get(id);
}

async function setOwnService(aside, value) {
  if (value) {
    await setDeviceStorageItem(SERVICE_STORAGE_KEY, { serviceURL: value });
  }
  else {
    removeDeviceStorageItem(SERVICE_STORAGE_KEY);
  }
  ownServiceURL = value;

  aside.querySelector('.ohyeah-service-text').replaceWith(fragmentFromString(domSanitize(getClaimCheckServiceHTML())));
  aside.querySelector('.ohyeah-fallacy-service-text').replaceWith(fragmentFromString(domSanitize(getFallacyServiceHTML())));
  aside.querySelector('.ohyeah-service-reset').disabled = !value;
  aside.querySelector('#ohyeah-service-url').value = value || '';
  aside.querySelector('#claimcheck-results .results').replaceChildren();
  aside.querySelector('#fallacycheck-results .results').replaceChildren();
  state.claimTargets = [];
  state.fallacyTargets = [];
  applyHighlights();
}

function initPanelEvents(aside) {
  aside.querySelector('.tabs nav').addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;

    e.preventDefault();
    e.stopPropagation();

    selectTab(aside, a.hash.slice(1));
  });

  const serviceForm = aside.querySelector('.ohyeah-service-form');
  const serviceMessage = serviceForm.querySelector('.ohyeah-service-message');

  serviceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = normaliseServiceURL(serviceForm.querySelector('#ohyeah-service-url').value);
    if (!value) {
      serviceMessage.textContent = i18n.t('panel.ohyeah.service.invalid.p.textContent');
      return;
    }
    await setOwnService(aside, value);
    serviceMessage.textContent = i18n.t('panel.ohyeah.service.saved.p.textContent');
  });

  serviceForm.querySelector('.ohyeah-service-reset').addEventListener('click', async () => {
    await setOwnService(aside, null);
    serviceMessage.textContent = i18n.t('panel.ohyeah.service.reset.p.textContent');
  });

  initPilotForm(aside, () => {
    aside.querySelector('.ohyeah-claim-language').replaceWith(fragmentFromString(domSanitize(getClaimLanguageHTML())));
    aside.querySelector('#claimcheck-results .results').replaceChildren();
    state.claimTargets = [];
    applyHighlights();
  });

  aside.addEventListener('click', (e) => {
    const graph = e.target.closest('button.graph');
    if (graph) {
      showPanelGraph(aside, graph);
      return;
    }

    if (e.target.closest('button.request-assessment')) {
      requestAssessment(e);
      return;
    }

    const claimCheck = e.target.closest('button.claim-check');
    if (claimCheck) {
      showClaimCheckResults(aside.querySelector('#claimcheck-results'), claimCheck);
      return;
    }

    const fallacyCheck = e.target.closest('button.fallacy-check');
    if (fallacyCheck) {
      showFallacyCheckResults(aside.querySelector('#fallacycheck-results'), fallacyCheck);
      return;
    }

    const claim = e.target.closest('#claimcheck-results li[data-start], #fallacycheck-results li[data-start]');
    if (claim && !e.target.closest('a')) {
      showClaimInText(Number(claim.dataset.start), Number(claim.dataset.end));
    }
  });

  // The toggle hides the panel; highlights go with it
  state.observer = new MutationObserver(() => {
    if (aside.classList.contains('on')) {
      applyHighlights();
      addPointerListeners();
    }
    else {
      removeHighlights();
      removePointerListeners();
    }
  });
  state.observer.observe(aside, { attributes: true, attributeFilter: ['class'] });
}

function getLanguage(range) {
  const container = range.commonAncestorContainer;
  const element = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
  const language = getNodeLanguage(element) || document.documentElement.getAttribute('lang') || 'en';
  return language.split('-')[0].toLowerCase();
}

function getEmptyEntities() {
  return Object.fromEntries(ENTITY_GROUPS.map(group => [group, []]));
}

async function findEntities(text, language) {
  if (!NAME_LANGUAGES.includes(language)) return { entities: getEmptyEntities(), method: null };

  const url = getServiceURL('ner');
  if (text.length <= MAX_TEXT_LENGTH && await requestOriginConsent(url, { reason: 'names' })) {
    try {
      const res = await serviceFetch(url, {
        method: 'POST',
        referrerPolicy: 'no-referrer',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language }),
        signal: AbortSignal.timeout(60000)
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      // Older services return names without positions, which cannot be highlighted
      if (!Array.isArray(data.entities) || data.entities.some(entity => !entity.group || !Number.isFinite(entity.start))) {
        throw new Error('Names without positions');
      }
      const entities = getEmptyEntities();
      (data.entities || []).forEach(entity => {
        entities[entity.group]?.push({ type: entity.group, text: entity.text, start: entity.start, end: entity.end });
      });
      return { entities, method: 'service', model: data.model };
    }
    catch (e) {
      console.warn('dokieli: name finding service failed, using the browser instead', e);
    }
  }

  return { entities: await extractEntitiesFromText(text, language), method: 'browser' };
}

async function openPanel(range, scope, textQuote) {
  const { text, segments } = getRangeText(range);
  if (!text.trim()) return;

  const language = getLanguage(range);

  await loadOwnService();

  teardown();
  state = { scope, text, segments, textQuote, entities: null, language, claimTargets: [], fallacyTargets: [], marks: [], loadedTabs: new Map() };

  document.getElementById('document-ohyeah')?.remove();
  document.body.appendChild(fragmentFromString(getPanelHTML()));
  const aside = document.getElementById('document-ohyeah');

  openSidePanel(aside, WIDTH_PROPERTY);
  fitSidePanelToTabs(aside);
  initializeNotificationsResize(aside, { widthProperty: WIDTH_PROPERTY, resizingClass: 'ohyeah-resizing' });
  initPanelEvents(aside);

  ['wikidata-results', 'nanopub-results'].forEach(id => setSectionContent(aside.querySelector(`#${id}`), getProgressHTML('panel.ohyeah.names.progress')));

  const { entities, method } = await findEntities(text, language);
  // The panel may have been replaced while names were being found
  if (state.text !== text || !aside.isConnected) return aside;

  state.entities = entities;
  state.nameMethod = method;
  state.marks = getMarks(entities, segments);
  applyHighlights();
  addPointerListeners();

  aside.querySelector('.tabs').insertAdjacentHTML('afterend', domSanitize(getLegendHTML()));
  if (method === 'browser') {
    aside.querySelector('.ohyeah-scope').insertAdjacentHTML('afterend', domSanitize(getMessageHTML('panel.ohyeah.names.browser.p', {}, 'ohyeah-notice')));
  }

  loadTab(aside, aside.querySelector('.tabs > section.selected')?.id);

  return aside;
}

export async function showOhYeahPanel(selection) {
  if (!selection?.rangeCount || selection.isCollapsed) return;

  hideDocumentMenu();

  const range = selection.getRangeAt(0).cloneRange();
  const article = selectArticleNode(document);
  const textQuote = article ? selectionToTextQuote(article, selection) : null;

  return openPanel(range, 'selection', textQuote);
}

export async function showOhYeahDocument() {
  hideDocumentMenu();

  const existing = document.getElementById('document-ohyeah');
  if (existing && state.scope === 'document') {
    openSidePanel(existing, WIDTH_PROPERTY);
    return existing;
  }

  const article = selectArticleNode(document);
  if (!article) return;

  const range = document.createRange();
  range.selectNodeContents(article);

  const aside = await openPanel(range, 'document', null);
  if (aside) selectTab(aside, 'claimcheck-results');
  return aside;
}

function requestAssessment(e) {
  if (state.scope === 'document') {
    if (document.getElementById('reply-to-resource')) return;
    const button = e.target.closest('button');
    const title = (selectArticleNode(document)?.querySelector('h1')?.textContent || document.title || '').trim();
    replyToResource(e, Config.DocumentURL, { kind: 'assessment', title, onClose: () => { button.disabled = false; } });
    return;
  }

  const toolbar = Config.Editor?.socialToolbarView;
  const article = selectArticleNode(document);
  if (!toolbar || !article || !state.textQuote) return;
  if (!setSelectionFromTextQuote(article, state.textQuote)) return;

  toolbar.selectionUpdate(null);
  toolbar.dom.querySelector('#editor-button-specificity')?.click();
}

function showPanelGraph(aside, button) {
  if (document.getElementById('graph-view')) return;

  button.disabled = true;

  const documentOptions = {
    ...Config.DOMProcessing,
    removeNodesWithSelector: [],
    sanitize: true,
    normalize: true
  };
  const html = getDocument(aside, documentOptions);

  const buttonClose = getButtonHTML({ key: 'dialog.graph-view.close.button', button: 'close', buttonClass: 'close', iconSize: 'fa-2x' });

  document.body.appendChild(fragmentFromString(`
    <aside aria-labelledby="graph-view-label" class="do on" dir="${Config.User.UI.LanguageDir}" id="graph-view" lang="${Config.User.UI.Language}" rel="schema:hasPart" resource="#graph-view" xml:lang="${Config.User.UI.Language}">
      <h2 data-i18n="dialog.graph-view.h2" id="graph-view-label" property="schema:name">${i18n.t('dialog.graph-view.h2.textContent')}</h2>
      ${buttonClose}
      <div class="info"></div>
      <div id="viz-tooltip"></div>
    </aside>`));

  document.querySelector('#graph-view button.close').addEventListener('click', () => {
    button.disabled = false;
  });

  showVisualisationGraph(Config.DocumentURL, html, '#graph-view', { subjectURI: Config.DocumentURL + '#document-ohyeah' });
}

function getClaimLabel(code) {
  return CLAIM_LABELS.includes(code)
    ? i18n.t(`panel.ohyeah.claimcheck.label.${code.toLowerCase()}.textContent`)
    : code;
}

// Explanations come as codes so they can be shown in the interface language
function getExplanations(item) {
  const codes = Array.isArray(item.explanation_codes) ? item.explanation_codes : [];
  const texts = Array.isArray(item.explanation) ? item.explanation : [];

  return (codes.length ? codes : texts).map((code, i) => {
    const key = `panel.ohyeah.claimcheck.explanation.${code}.textContent`;
    const translated = i18n.t(key);
    return translated !== key ? translated : (texts[i] || code);
  });
}

function showClaimInText(start, end) {
  if (!Number.isFinite(start)) return;
  const [range] = getRangesForOffsets(state.segments || [], start, end);
  range?.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function getClaimHTML(item, numberFormat) {
  const annotationId = generateAttributeId();
  const code = String(item.label || '').toUpperCase();
  const confidence = Number(item.confidence);
  const explanations = getExplanations(item);
  const position = Number.isFinite(item.start) ? ` data-end="${item.end}" data-start="${item.start}"` : '';

  const explanationHTML = explanations.length ? `
    <details class="ohyeah-why">
      <summary><span data-i18n="panel.ohyeah.claimcheck.explanation.summary">${i18n.t('panel.ohyeah.claimcheck.explanation.summary.textContent')}</span> ${Config.Button.Info.OhYeahRules}</summary>
      <ul about="#${annotationId}-rating">${explanations.map(e => `<li property="schema:ratingExplanation">${htmlEncode(e)}</li>`).join('')}</ul>
    </details>` : '';

  return `
    <li class="ohyeah-card claim-${htmlEncode(code.toLowerCase())}"${position} rel="prov:generated" resource="#${annotationId}" typeof="oa:Annotation">
      <span rel="oa:motivatedBy" resource="oa:classifying"></span>
      <span rel="oa:hasTarget" resource="#${annotationId}-target">
        <span rel="oa:hasSource" resource="${encodeAttribute(Config.DocumentURL)}"></span>
        <span rel="oa:hasSelector" resource="#${annotationId}-selector" typeof="oa:TextQuoteSelector">
          <span content="${encodeAttribute(item.sentence)}" property="oa:exact"></span>
        </span>
      </span>
      <div rel="oa:hasBody" resource="#${annotationId}-review">
        <div about="#${annotationId}-review" typeof="schema:ClaimReview">
          <p class="ohyeah-card-meta" rel="schema:reviewRating" resource="#${annotationId}-rating" typeof="schema:Rating">
            <span class="ohyeah-claim-label"${state.scope === 'document' ? ' hidden=""' : ''}><span property="schema:name">${htmlEncode(getClaimLabel(code))}</span> <span class="ohyeah-code">(<span property="schema:alternateName">${htmlEncode(code)}</span>)</span></span>
            <span data-i18n="panel.ohyeah.claimcheck.confidence" title="${i18n.t('panel.ohyeah.claimcheck.confidence.title')}">${i18n.t('panel.ohyeah.claimcheck.confidence.textContent')} <data datatype="xsd:decimal" property="schema:ratingValue" value="${Number.isFinite(confidence) ? confidence : ''}">${Number.isFinite(confidence) ? numberFormat.format(confidence) : ''}</data></span>
          </p>
          <blockquote class="ohyeah-card-text"><p property="schema:claimReviewed">${htmlEncode(item.sentence)}</p></blockquote>
          ${explanationHTML}
        </div>
      </div>
    </li>`;
}

// Offsets of the service's sentences in the whole text, starting the search at the part's offset
function locateSentences(sentences, cursor) {
  sentences.forEach(item => {
    const index = state.text.indexOf(item.sentence, cursor);
    if (index === -1) return;
    item.start = index;
    item.end = index + item.sentence.length;
    cursor = item.end;
  });
}

// Ends a part at a block break, a sentence end, or a space near the target length
function findPartEnd(text, start, targetLength) {
  const ideal = start + targetLength;
  if (ideal >= text.length) return text.length;

  const windowStart = start + Math.ceil(targetLength / 2);
  const window = text.slice(windowStart, ideal);

  const block = window.lastIndexOf('\n\n');
  if (block !== -1) return windowStart + block + 2;

  const sentence = /[.!?…]['")\]]*\s/g;
  let sentenceEnd = -1;
  let match;
  while ((match = sentence.exec(window))) sentenceEnd = match.index + match[0].length;
  if (sentenceEnd !== -1) return windowStart + sentenceEnd;

  const space = window.search(/\s\S*$/);
  if (space !== -1) return windowStart + space + 1;

  return ideal;
}

function newCheckAbortController() {
  const controller = new AbortController();
  state.aborts ||= [];
  state.aborts.push(controller);
  return controller;
}

// Sends the text to the service in parts. The first part goes alone, so nothing queues in
// front of it. Later parts keep a couple of requests in flight, and results are delivered
// in document order
async function runCheckInParts({ url, getBody, getFatalErrorKey, onResult, signal }) {
  const text = state.text;
  const started = performance.now();
  let completed = 0;
  let nextStart = 0;
  let nextIndex = 0;
  let deliverIndex = 0;
  let error = null;
  const arrived = new Map();

  const targetLength = () => {
    if (!completed) return FIRST_PART_LENGTH;
    const rate = completed / (performance.now() - started);
    return Math.min(MAX_PART_LENGTH, Math.max(MIN_PART_LENGTH, Math.round(rate * TARGET_PART_TIME)));
  };

  const takePart = () => {
    if (error || signal.aborted || nextStart >= text.length) return null;
    const end = findPartEnd(text, nextStart, targetLength());
    const part = { index: nextIndex++, start: nextStart, text: text.slice(nextStart, end) };
    nextStart = end;
    return part;
  };

  const fetchPart = async (part, retry = true) => {
    try {
      const res = await serviceFetch(url, {
        method: 'POST',
        referrerPolicy: 'no-referrer',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(getBody(part.text)),
        signal
      });
      const fatalKey = getFatalErrorKey?.(res);
      if (fatalKey) {
        const fatal = new Error(fatalKey);
        fatal.errorKey = fatalKey;
        fatal.fatal = true;
        throw fatal;
      }
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.json();
    }
    catch (e) {
      if (e.fatal || signal.aborted || !retry) throw e;
      return fetchPart(part, false);
    }
  };

  const deliver = (part, response) => {
    arrived.set(part.index, { part, response });
    while (arrived.has(deliverIndex)) {
      const next = arrived.get(deliverIndex);
      arrived.delete(deliverIndex);
      deliverIndex++;
      if (!signal.aborted) onResult(next.part, next.response, completed / text.length);
    }
  };

  const runOne = async (part) => {
    try {
      const response = await fetchPart(part);
      completed += part.text.length;
      deliver(part, response);
      return true;
    }
    catch (e) {
      if (!error) error = e;
      return false;
    }
  };

  const worker = async () => {
    let part;
    while ((part = takePart())) {
      if (!(await runOne(part))) return;
    }
  };

  const first = takePart();
  if (first && await runOne(first)) {
    await Promise.all(Array.from({ length: PART_CONCURRENCY }, worker));
  }

  return { error };
}

function getPartResultsList(section) {
  return section.querySelector('.results ul.ohyeah-cards');
}

// The results skeleton goes up with the first part: source, running summary, progress, list
function ensurePartResults(section, { url, model, listClass, percent }) {
  if (getPartResultsList(section)) return;

  const activityId = generateAttributeId();
  const modelLink = model?.url ? `<a href="${encodeAttribute(model.url)}" rel="prov:wasAssociatedWith" target="_blank">${htmlEncode(model.id || model.url)}</a>` : '';

  setSectionContent(section, `
    <div id="${activityId}" rel="prov:activity" resource="#${activityId}" typeof="prov:Activity">
      ${getSourceHTML(`<a href="${encodeAttribute(url)}" rel="prov:used" target="_blank">${htmlEncode(url)}</a>${modelLink ? ` (${modelLink})` : ''}`)}
      <p class="ohyeah-parts-summary"></p>
      ${getPartProgressHTML(percent)}
      <ul class="ohyeah-cards ${listClass}"></ul>
    </div>`);
}

function appendPartCards(section, cards) {
  if (!cards) return;
  const fragment = fragmentFromString(domSanitize(`<ul>${cards}</ul>`));
  getPartResultsList(section).append(...fragment.firstElementChild.children);
}

function updatePartSummary(section, key, options) {
  section.querySelector('.results .ohyeah-parts-summary')
    ?.replaceWith(fragmentFromString(domSanitize(getMessageHTML(key, options, 'ohyeah-parts-summary'))));
}

function updatePartProgress(section, percent) {
  section.querySelector('.results p.progress')
    ?.replaceWith(fragmentFromString(domSanitize(getPartProgressHTML(percent))));
}

function removePartProgress(section) {
  section.querySelector('.results p.progress')?.remove();
}

function showPartError(section, error, errorKey) {
  const html = error.errorKey
    ? getMessageHTML(error.errorKey, {}, 'error')
    : getMessageHTML(errorKey, { url: getActiveServiceURL() }, 'error', true);

  if (!getPartResultsList(section)) {
    setSectionContent(section, html);
    return;
  }

  const partial = getMessageHTML('panel.ohyeah.check.partial.p', {}, 'error');
  section.querySelector('.results > div')?.insertAdjacentHTML('beforeend', domSanitize(partial + html));
}

async function showClaimCheckResults(section, button) {
  const url = getServiceURL('factcheck');

  if (!(await requestOriginConsent(url, { reason: 'claim-check', ask: true }))) {
    setSectionContent(section, getMessageHTML('panel.ohyeah.claimcheck.declined.p'));
    return;
  }

  button.disabled = true;
  setSectionContent(section, getProgressHTML(state.scope === 'document' ? 'panel.ohyeah.claimcheck.progress-document' : 'panel.ohyeah.claimcheck.progress'));

  const text = state.text;
  const numberFormat = new Intl.NumberFormat(Config.User.UI.Language, { style: 'percent', maximumFractionDigits: 0 });
  const pilotFields = getPilotRequestFields(state.language);
  const controller = newCheckAbortController();
  const stale = () => state.text !== text || !section.isConnected;

  state.claimTargets = [];
  applyHighlights();

  let checkWorthy = 0;
  let total = 0;

  const { error } = await runCheckInParts({
    url,
    signal: controller.signal,
    getBody: partText => ({ text: partText, language: state.language, ...pilotFields }),
    getFatalErrorKey: res => getPilotErrorKey(pilotFields, res.status),
    onResult: (part, response, fraction) => {
      if (stale()) return controller.abort();

      const sentences = Array.isArray(response?.sentences) ? response.sentences : [];
      locateSentences(sentences, part.start);
      state.claimTargets.push(...sentences
        .filter(item => String(item.label).toUpperCase() === 'CFS' && Number.isFinite(item.start))
        .map(item => ({ start: item.start, end: item.end, ranges: getRangesForOffsets(state.segments, item.start, item.end) })));
      applyHighlights();
      addPointerListeners();

      const partCheckWorthy = sentences.filter(item => String(item.label).toUpperCase() === 'CFS');
      checkWorthy += partCheckWorthy.length;
      total += sentences.length;

      const percent = numberFormat.format(fraction);
      ensurePartResults(section, { url, model: response?.model, listClass: 'claims', percent });
      appendPartCards(section, (state.scope === 'document' ? partCheckWorthy : sentences).map(item => getClaimHTML(item, numberFormat)).join(''));
      updatePartSummary(section, 'panel.ohyeah.claimcheck.summary.p', { count: checkWorthy, total });
      updatePartProgress(section, percent);
    }
  });

  button.disabled = false;
  if (stale() || controller.signal.aborted) return;

  removePartProgress(section);

  if (error) {
    console.warn('dokieli: claim check failed', error);
    showPartError(section, error, 'panel.ohyeah.claimcheck.error.p');
    return;
  }

  if (!total) {
    setSectionContent(section, getMessageHTML('panel.ohyeah.claimcheck.none.p'));
  }
}

function getFallacyLabel(code) {
  return FALLACY_LABELS.includes(code)
    ? i18n.t(`panel.ohyeah.fallacycheck.label.${code}.textContent`)
    : code.replace(/_/g, ' ');
}

function getFallacyHTML(item, numberFormat) {
  const annotationId = generateAttributeId();
  const code = String(item.label || '').toLowerCase().replace(/[\s-]+/g, '_');
  const confidence = Number(item.confidence);
  const position = Number.isFinite(item.start) ? ` data-end="${item.end}" data-start="${item.start}"` : '';

  const definitionKey = `panel.ohyeah.fallacycheck.definition.${code}.textContent`;
  const definition = i18n.t(definitionKey);
  const definitionHTML = definition !== definitionKey ? `
    <details class="ohyeah-why">
      <summary data-i18n="panel.ohyeah.fallacycheck.definition.summary">${i18n.t('panel.ohyeah.fallacycheck.definition.summary.textContent')}</summary>
      <ul about="#${annotationId}-rating"><li data-i18n="panel.ohyeah.fallacycheck.definition.${code}" property="schema:ratingExplanation">${htmlEncode(definition)}</li></ul>
    </details>` : '';

  return `
    <li class="ohyeah-card fallacy fallacy-${htmlEncode(code)}"${position} rel="prov:generated" resource="#${annotationId}" typeof="oa:Annotation">
      <span rel="oa:motivatedBy" resource="oa:classifying"></span>
      <span rel="oa:hasTarget" resource="#${annotationId}-target">
        <span rel="oa:hasSource" resource="${encodeAttribute(Config.DocumentURL)}"></span>
        <span rel="oa:hasSelector" resource="#${annotationId}-selector" typeof="oa:TextQuoteSelector">
          <span content="${encodeAttribute(item.sentence)}" property="oa:exact"></span>
        </span>
      </span>
      <div rel="oa:hasBody" resource="#${annotationId}-review">
        <div about="#${annotationId}-review" typeof="schema:Review">
          <p class="ohyeah-card-meta" rel="schema:reviewRating" resource="#${annotationId}-rating" typeof="schema:Rating">
            <span class="ohyeah-claim-label"><span property="schema:name">${htmlEncode(getFallacyLabel(code))}</span></span>
            <span data-i18n="panel.ohyeah.claimcheck.confidence" title="${i18n.t('panel.ohyeah.claimcheck.confidence.title')}">${i18n.t('panel.ohyeah.claimcheck.confidence.textContent')} <data datatype="xsd:decimal" property="schema:ratingValue" value="${Number.isFinite(confidence) ? confidence : ''}">${Number.isFinite(confidence) ? numberFormat.format(confidence) : ''}</data></span>
          </p>
          <blockquote class="ohyeah-card-text"><p>${htmlEncode(item.sentence)}</p></blockquote>
          ${definitionHTML}
        </div>
      </div>
    </li>`;
}

async function showFallacyCheckResults(section, button) {
  const url = getServiceURL('fallacy');

  if (!(await requestOriginConsent(url, { reason: 'fallacy-check', ask: true }))) {
    setSectionContent(section, getMessageHTML('panel.ohyeah.fallacycheck.declined.p'));
    return;
  }

  button.disabled = true;
  setSectionContent(section, getProgressHTML(state.scope === 'document' ? 'panel.ohyeah.fallacycheck.progress-document' : 'panel.ohyeah.fallacycheck.progress'));

  const text = state.text;
  const numberFormat = new Intl.NumberFormat(Config.User.UI.Language, { style: 'percent', maximumFractionDigits: 0 });
  const controller = newCheckAbortController();
  const stale = () => state.text !== text || !section.isConnected;

  state.fallacyTargets = [];
  applyHighlights();

  let flagged = 0;
  let total = 0;

  const { error } = await runCheckInParts({
    url,
    signal: controller.signal,
    getBody: partText => ({ text: partText, language: state.language }),
    onResult: (part, response, fraction) => {
      if (stale()) return controller.abort();

      const sentences = Array.isArray(response?.sentences) ? response.sentences : [];
      locateSentences(sentences, part.start);
      state.fallacyTargets.push(...sentences
        .filter(item => Number.isFinite(item.start))
        .map(item => ({ start: item.start, end: item.end, ranges: getRangesForOffsets(state.segments, item.start, item.end) })));
      applyHighlights();
      addPointerListeners();

      flagged += sentences.length;
      total += Number.isFinite(Number(response?.total)) ? Number(response.total) : sentences.length;

      const percent = numberFormat.format(fraction);
      ensurePartResults(section, { url, model: response?.model, listClass: 'fallacies', percent });
      appendPartCards(section, sentences.map(item => getFallacyHTML(item, numberFormat)).join(''));
      updatePartSummary(section, 'panel.ohyeah.fallacycheck.summary.p', { count: flagged, total });
      updatePartProgress(section, percent);
    }
  });

  button.disabled = false;
  if (stale() || controller.signal.aborted) return;

  removePartProgress(section);

  if (error) {
    console.warn('dokieli: fallacy check failed', error);
    showPartError(section, error, 'panel.ohyeah.fallacycheck.error.p');
    return;
  }

  if (!flagged) {
    setSectionContent(section, getMessageHTML('panel.ohyeah.fallacycheck.none.p'));
  }
}

function getMoreNamesHTML(lookup) {
  return lookup.total > lookup.names.length
    ? getMessageHTML('panel.ohyeah.names.limit.p', { count: lookup.names.length, total: lookup.total })
    : '';
}

function getNoNamesHTML() {
  return NAME_LANGUAGES.includes(state.language)
    ? getMessageHTML('panel.ohyeah.no-names.p')
    : getMessageHTML('panel.ohyeah.no-names-language.p', { language: getLanguageName(state.language) });
}

async function showWikidataResults(section, lookup) {
  const { names } = lookup;
  if (!names.length) {
    setSectionContent(section, getNoNamesHTML());
    return;
  }

  setSectionContent(section, getProgressHTML('panel.ohyeah.wikidata.progress'));

  const results = await Promise.all(names.map(name =>
    searchWikidataEntities(name.text, { limit: WIKIDATA_RESULTS_PER_NAME }).then(matches => ({ ...name, matches }))
  ));

  const found = results.filter(result => result.matches.length);
  const missing = results.filter(result => !result.matches.length);
  const activityId = generateAttributeId();

  const cards = found.map(result => `
    <li class="ohyeah-card" data-name="${encodeAttribute(result.text.toLowerCase())}">
      <p class="ohyeah-card-meta"><span class="ohyeah-entity entity-legend-${result.group}" data-i18n="panel.ohyeah.entity.${result.group}">${i18n.t(`panel.ohyeah.entity.${result.group}.textContent`)}</span></p>
      <h4 class="ohyeah-card-title">${htmlEncode(result.text)}</h4>
      <ul class="ohyeah-matches">
        ${result.matches.map(match => `
          <li rel="prov:generated" resource="${encodeAttribute(match.uri)}">
            <a href="${encodeAttribute(match.uri)}" rel="noopener" target="_blank"><span property="rdfs:label">${htmlEncode(match.label)}</span></a>
            ${match.description ? `<span class="ohyeah-description" property="schema:description">${htmlEncode(match.description)}</span>` : ''}
          </li>`).join('')}
      </ul>
    </li>`).join('');

  const missingHTML = missing.length
    ? getMessageHTML('panel.ohyeah.wikidata.missing.p', { names: missing.map(result => result.text).join(', ') })
    : '';

  setSectionContent(section, found.length ? `
    <div id="${activityId}" rel="prov:activity" resource="#${activityId}" typeof="prov:Activity">
      ${getSourceHTML('<a href="https://www.wikidata.org/" rel="prov:used" target="_blank">Wikidata</a>')}
      ${getMoreNamesHTML(lookup)}
      <ul class="ohyeah-cards">${cards}</ul>
      ${missingHTML}
    </div>` : getMessageHTML('panel.ohyeah.wikidata.none.p'));
}

const LABEL_PREDICATES = [
  'http://www.w3.org/2000/01/rdf-schema#label',
  'http://schema.org/name',
  'https://schema.org/name',
  'http://purl.org/dc/terms/title',
  'http://www.w3.org/2004/02/skos/core#prefLabel',
  'http://xmlns.com/foaf/0.1/name'
];
// In order of preference
const CONTENT_PREDICATES = [
  'http://schema.org/articleBody',
  'https://schema.org/articleBody',
  'https://www.w3.org/ns/activitystreams#content',
  'http://schema.org/text',
  'https://schema.org/text',
  'http://www.w3.org/ns/oa#bodyValue',
  'http://www.w3.org/2000/01/rdf-schema#comment',
  'http://schema.org/description',
  'https://schema.org/description',
  'http://purl.org/dc/terms/description',
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#value'
];
// In order of preference
const TITLE_PREDICATES = [
  'http://schema.org/headline',
  'https://schema.org/headline',
  'http://schema.org/name',
  'https://schema.org/name',
  'http://purl.org/dc/terms/title',
  'https://www.w3.org/ns/activitystreams#name',
  'http://www.w3.org/2000/01/rdf-schema#label'
];
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const RDF_HTML = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#HTML';
const CITO = 'http://purl.org/spar/cito/';
const STANCES = ['agreesWith', 'corrects', 'critiques', 'discusses', 'disputes', 'extends', 'qualifies', 'supports'];
const IN_REPLY_TO = 'https://www.w3.org/ns/activitystreams#inReplyTo';
const CITES_AS_EVIDENCE = CITO + 'citesAsEvidence';
const CONTENT_SKIP_ATTRIBUTES = ['about', 'content', 'datatype', 'id', 'inlist', 'prefix', 'property', 'rel', 'resource', 'rev', 'typeof', 'vocab'];

function getLabels(quads) {
  const labels = new Map();
  quads.forEach(q => {
    if (LABEL_PREDICATES.includes(q.predicate.value) && q.object.termType === 'Literal' && !labels.has(q.subject.value)) {
      labels.set(q.subject.value, q.object.value);
    }
  });
  return labels;
}

// "hasMember" reads as "has member"
function getReadableName(iri) {
  if (iri === RDF_TYPE) return i18n.t('panel.ohyeah.nanopub.type.textContent');
  const name = getFragmentOrLastPath(iri) || iri;
  return name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
}

function getTermHTML(term, labels) {
  if (term.termType === 'NamedNode') {
    const label = labels.get(term.value) || getFragmentOrLastPath(term.value) || term.value;
    return `<a href="${encodeAttribute(term.value)}" rel="noopener" target="_blank" title="${encodeAttribute(term.value)}">${htmlEncode(label)}</a>`;
  }
  return htmlEncode(term.value);
}

function getStatementsHTML(quads, labels) {
  const subjects = new Map();
  quads.forEach(q => {
    if (!subjects.has(q.subject.value)) subjects.set(q.subject.value, []);
    subjects.get(q.subject.value).push(q);
  });

  return [...subjects.entries()].map(([subject, list]) => {
    const items = list.map(q => `<li><span class="ohyeah-predicate"${q.predicate.value === RDF_TYPE ? ' data-i18n="panel.ohyeah.nanopub.type"' : ''} title="${encodeAttribute(q.predicate.value)}">${htmlEncode(getReadableName(q.predicate.value))}</span> ${getTermHTML(q.object, labels)}</li>`).join('');

    return `
    <li>
      <span class="ohyeah-subject" title="${encodeAttribute(subject)}">${htmlEncode(labels.get(subject) || getFragmentOrLastPath(subject) || subject)}</span>
      <ul>${items}</ul>
    </li>`;
  }).join('');
}

function getCreatorHTML(creator) {
  if (!creator) return '';
  const name = creator.name || getFragmentOrLastPath(creator.creator) || creator.creator;
  return `<a class="ohyeah-creator" href="${encodeAttribute(creator.creator)}" rel="noopener" target="_blank">${htmlEncode(name)}</a>`;
}

function getNanopubDetailsHTML(others, graphs, labels) {
  const parts = [['other', others], ['provenance', graphs?.provenance || []], ['pubinfo', graphs?.pubinfo || []]]
    .map(([part, quads]) => [part, quads.filter(q => !LABEL_PREDICATES.includes(q.predicate.value))])
    .filter(([, quads]) => quads.length);
  if (!parts.length) return '';

  return `
    <details>
      <summary data-i18n="panel.ohyeah.nanopub.details.summary">${i18n.t('panel.ohyeah.nanopub.details.summary.textContent')}</summary>
      <dl class="ohyeah-nanopub-details">${parts.map(([part, quads]) => `
        <dt data-i18n="panel.ohyeah.nanopub.${part}.dt">${i18n.t(`panel.ohyeah.nanopub.${part}.dt.textContent`)}</dt>
        <dd><ul class="ohyeah-statements">${getStatementsHTML(quads, labels)}</ul></dd>`).join('')}
      </dl>
    </details>`;
}

function findLiteral(quads, predicates) {
  for (const predicate of predicates) {
    const quad = quads.find(q => q.predicate.value === predicate && q.object.termType === 'Literal' && q.object.value.trim());
    if (quad) return quad;
  }
}

// HTML content is shown as HTML, without its RDFa and ids, so it does not add to this document's data
function getContentHTML(literal) {
  const isHTML = literal.datatype?.value === RDF_HTML || /<[a-z][^>]*>/i.test(literal.value);
  if (!isHTML) return `<p>${htmlEncode(literal.value)}</p>`;

  const template = document.createElement('template');
  template.innerHTML = domSanitize(literal.value);
  template.content.querySelectorAll('*').forEach(element => {
    CONTENT_SKIP_ATTRIBUTES.forEach(attribute => element.removeAttribute(attribute));
    if (element.matches('a[href]')) {
      element.setAttribute('rel', 'noopener');
      element.setAttribute('target', '_blank');
    }
  });
  return template.innerHTML;
}

function getNanopubCardHTML(np, quads, creator, graphs) {
  const labels = getLabels([...quads, ...(graphs?.provenance || []), ...(graphs?.pubinfo || [])]);
  if (np.label && !labels.has(np.uri)) labels.set(np.uri, np.label);

  const contentQuad = findLiteral(quads, CONTENT_PREDICATES);
  const titleQuad = findLiteral(quads, TITLE_PREDICATES);
  const title = titleQuad?.object.value.trim() || (contentQuad ? '' : np.label || '');
  const subject = (contentQuad || titleQuad)?.subject.value;
  const typeQuads = quads.filter(q => q.subject.value === subject && q.predicate.value === RDF_TYPE && q.object.termType === 'NamedNode');
  const stanceQuad = quads.find(q => q.predicate.value.startsWith(CITO) && STANCES.includes(q.predicate.value.slice(CITO.length)))
    || quads.find(q => q.predicate.value === IN_REPLY_TO);
  const evidenceQuads = quads.filter(q => q.predicate.value === CITES_AS_EVIDENCE);
  const shown = [contentQuad, titleQuad, stanceQuad, ...typeQuads, ...evidenceQuads];
  const others = quads.filter(q => !shown.includes(q));

  const stanceKey = stanceQuad && (stanceQuad.predicate.value === IN_REPLY_TO ? 'panel.ohyeah.nanopub.reply' : `panel.ohyeah.nanopub.stance.${stanceQuad.predicate.value.slice(CITO.length)}`);
  const contextHTML = stanceQuad ? `<p class="ohyeah-card-context"><span data-i18n="${stanceKey}">${i18n.t(`${stanceKey}.textContent`)}</span> ${getTermHTML(stanceQuad.object, labels)}</p>` : '';
  const evidenceHTML = evidenceQuads.length ? `<p class="ohyeah-card-evidence"><span data-i18n="panel.ohyeah.nanopub.evidence">${i18n.t('panel.ohyeah.nanopub.evidence.textContent')}</span>: ${evidenceQuads.map(q => getTermHTML(q.object, labels)).join(', ')}</p>` : '';

  const titleHTML = title && title !== contentQuad?.object.value.trim() ? `<h4 class="ohyeah-card-title">${htmlEncode(title)}</h4>` : '';
  const contentHTML = contentQuad ? `<blockquote class="ohyeah-card-text">${getContentHTML(contentQuad.object)}</blockquote>` : '';
  const detailsHTML = getNanopubDetailsHTML(others, graphs, labels);

  return `
    <li class="ohyeah-card" rel="prov:hadMember" resource="${encodeAttribute(np.uri)}">
      <p class="ohyeah-card-meta">
        ${getCreatorHTML(creator)}
        ${np.date ? `<time datetime="${encodeAttribute(np.date)}">${formatDate(np.date)}</time>` : ''}
        ${typeQuads.map(q => `<span class="ohyeah-card-type" title="${encodeAttribute(q.object.value)}">${htmlEncode(labels.get(q.object.value) || getReadableName(q.object.value))}</span>`).join('')}
      </p>
      ${titleHTML}
      ${contextHTML}
      ${contentHTML}
      ${evidenceHTML}
      ${detailsHTML}
      <p class="ohyeah-card-footer"><a data-i18n="panel.ohyeah.nanopub.view" href="${encodeAttribute(np.uri)}" rel="noopener" target="_blank">${i18n.t('panel.ohyeah.nanopub.view.textContent')}</a></p>
    </li>`;
}

async function findNanopubs(names) {
  const { NanopubClient } = await loadNanopubLibrary();
  const client = new NanopubClient();
  const found = new Map();

  for (const name of names) {
    let count = 0;
    try {
      // Quoted, so it matches the whole name and not any one of its words
      for await (const item of client.findNanopubsWithText(`"${name.text.replace(/"/g, '')}"`)) {
        if (item.np && !found.has(item.np)) {
          found.set(item.np, { uri: item.np, label: item.label, date: item.date, name: name.text });
        }
        if (++count >= NANOPUB_RESULTS_PER_NAME) break;
      }
    }
    catch (e) {
      console.warn('dokieli: nanopub text search failed for ' + name.text, e);
    }
  }

  return [...found.values()];
}

async function showNanopubResults(section, lookup) {
  const { names } = lookup;
  if (!names.length) {
    setSectionContent(section, getNoNamesHTML());
    return;
  }

  setSectionContent(section, getProgressHTML('panel.ohyeah.nanopub.progress'));

  if (!(await requestOriginConsent(NANOPUB_QUERY_URLS[0], { reason: 'nanopub-search' }))) {
    setSectionContent(section, getMessageHTML('panel.ohyeah.nanopub.declined.p'));
    return;
  }

  const nanopubs = await findNanopubs(names);

  if (!nanopubs.length) {
    setSectionContent(section, getMessageHTML('panel.ohyeah.nanopub.none.p'));
    return;
  }

  const uris = nanopubs.map(np => np.uri);
  const [assertions, creators, provenance] = await Promise.all([
    findAssertionQuads(uris).catch(e => { console.warn('dokieli: could not fetch nanopub assertions', e); return new Map(); }),
    findNanopubCreators(uris).catch(e => { console.warn('dokieli: could not fetch nanopub creators', e); return new Map(); }),
    findProvenanceQuads(uris).catch(e => { console.warn('dokieli: could not fetch nanopub provenance', e); return new Map(); })
  ]);

  const activityId = generateAttributeId();
  const groups = names
    .map(name => ({ name: name.text, items: nanopubs.filter(np => np.name === name.text) }))
    .filter(group => group.items.length);

  setSectionContent(section, `
    <div id="${activityId}" rel="prov:activity" resource="#${activityId}" typeof="prov:Activity">
      ${getSourceHTML('<a href="https://nanopub.net/" rel="prov:used" target="_blank">Nanopub network</a>')}
      ${getMoreNamesHTML(lookup)}
      ${groups.map(group => `
        <section class="ohyeah-group">
          <h4 data-i18n="panel.ohyeah.nanopub.mentioning" data-i18n-name="${encodeAttribute(group.name)}">${i18n.t('panel.ohyeah.nanopub.mentioning.textContent', { name: group.name })}</h4>
          <ul class="ohyeah-cards">${group.items.map(np => getNanopubCardHTML(np, assertions.get(np.uri) || [], creators.get(np.uri), provenance.get(np.uri))).join('')}</ul>
        </section>`).join('')}
    </div>`);
}

function getDocumentDomain() {
  try {
    const url = new URL(Config.DocumentURL);
    if (!['http:', 'https:'].includes(url.protocol) || isLocalhost(url.href)) return null;
    return url.hostname;
  }
  catch {
    return null;
  }
}

const WHOIS_FIELDS = ['registrar', 'creation_date', 'updated_date', 'expiration_date', 'org', 'country', 'name_servers', 'status', 'dnssec'];
const WHOIS_DATES = ['creation_date', 'updated_date', 'expiration_date'];

function getWhoisValueHTML(field, value) {
  if (WHOIS_DATES.includes(field)) return formatDate(value);

  let values = [].concat(value).map(String);
  if (field === 'status') {
    // "clientTransferProhibited https://icann.org/..." reads as "client transfer prohibited"
    values = values.map(v => v.replace(/\s+https?:\/\/\S+$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase());
  }
  if (field === 'name_servers') values = values.map(v => v.toLowerCase());

  return htmlEncode([...new Set(values)].join(', '));
}

// RDAP from the browser first; dokieli's service queries WHOIS for registries without RDAP
async function findDomainRecord(domain) {
  if (await requestOriginConsent(RDAP_BOOTSTRAP_URL, { reason: 'rdap' })) {
    try {
      const found = await lookupDomain(domain);
      if (found) return { record: found.record, url: found.url, method: 'rdap' };
    }
    catch (e) {
      console.warn('dokieli: RDAP lookup failed', e);
    }
  }

  const url = new URL('whois', Config.OhYeah.ServiceURL).href;
  if (await requestOriginConsent(url, { reason: 'whois' })) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        referrerPolicy: 'no-referrer',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain })
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const record = await res.json();
      if (!record.error) return { record, url, method: 'whois' };
    }
    catch (e) {
      console.warn('dokieli: whois lookup failed', e);
    }
    return {};
  }

  // Without the service, a registry that has no RDAP or did not answer leaves nothing to show
  return { declined: true };
}

async function showWhoisResults(section) {
  const domain = getDocumentDomain();
  if (!domain) {
    setSectionContent(section, getMessageHTML('panel.ohyeah.whois.unavailable.p'));
    return;
  }

  setSectionContent(section, getProgressHTML('panel.ohyeah.whois.progress'));

  const { record, url, method, declined } = await findDomainRecord(domain);

  if (!record) {
    setSectionContent(section, declined
      ? getMessageHTML('panel.ohyeah.whois.declined.p')
      : getMessageHTML('panel.ohyeah.whois.error.p', {}, 'error'));
    return;
  }

  const rows = WHOIS_FIELDS
    .filter(field => record[field] !== undefined && record[field] !== null && record[field] !== '' && !(Array.isArray(record[field]) && !record[field].length))
    .map(field => `<dt data-i18n="panel.ohyeah.whois.field.${field}">${i18n.t(`panel.ohyeah.whois.field.${field}.textContent`)}</dt><dd>${getWhoisValueHTML(field, record[field])}</dd>`);

  const sourceKey = method === 'rdap' ? 'panel.ohyeah.whois.source.rdap' : 'panel.ohyeah.whois.source.whois';
  const activityId = generateAttributeId();
  setSectionContent(section, `
    <div id="${activityId}" rel="prov:activity" resource="#${activityId}" typeof="prov:Activity">
      ${getSourceHTML(`<span data-i18n="${sourceKey}">${i18n.t(`${sourceKey}.textContent`)}</span> (<a href="${encodeAttribute(url)}" rel="prov:used" target="_blank">${htmlEncode(new URL(url).host)}</a>)`)}
      ${rows.length ? `
        <div class="ohyeah-card">
          <h4 class="ohyeah-card-title">${htmlEncode(record.domain_name || domain)}</h4>
          <dl class="ohyeah-facts">${rows.join('')}</dl>
        </div>` : getMessageHTML('panel.ohyeah.whois.none.p')}
    </div>`);
}
