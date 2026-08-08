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

import Config from '../../config.js';
import { i18n } from '../../i18n.js';
import { slugify } from '../../editor/plugins/autoId.js';
import { fragmentFromString, selectArticleNode } from '../../utils/html.js';
import { updateSelectedStylesheets } from '../../doc.js';
import { showViews } from '../../dialog.js';
import { registerDocumentTransform, registerEditorParseTransform } from '../../utils/documentTransforms.js';
import { prepareDocumentForTemplate, replaceDocumentBody, documentDetailsHTML, sectionHTML } from './shared.js';
import { registerSectionsTemplate, refreshSectionsNav, injectSectionsTOC, stripSectionsTOC, findOutsideDetails } from './sections.js';

// Specification template: sections managed from the top nav (sections.js); identity is the section id, with the English label slug as fallback.

const SECTIONS = {
  'document-details': { label: 'More details about this document' },
  'abstract': { label: 'Abstract' },
  'sotd': { label: 'Status of This Document' },
  'introduction': { label: 'Introduction' },
  'terminology': { label: 'Terminology' },
  'conformance': { label: 'Conformance' },
  'explainer': { label: 'Explainer' },
  'use-cases': { label: 'Use Cases' },
  'considerations': { label: 'Considerations' },
  'changelog': { label: 'Changelog' },
  'acknowledgements': { label: 'Acknowledgements' },
  'references': { label: 'References' },
};

const DEFAULT_SECTIONS = ['document-details', 'abstract', 'sotd', 'introduction', 'references'];

// Considerations subsections (the AC set minus Application Considerations); typeof carries the spec: class where one exists.
export const SPEC_SUBSECTIONS = {
  'considerations': {
    'security-considerations': { label: 'Security Considerations', typeof: 'spec:SecurityConsiderations' },
    'privacy-considerations': { label: 'Privacy Considerations', typeof: 'spec:PrivacyConsiderations' },
    'threat-model': { label: 'Threat Model' },
    'security-privacy-review': { label: 'Security and Privacy Review', typeof: 'spec:SelfReviewQuestionnaireSecurityPrivacy' },
    'societal-impact-review': { label: 'Societal Impact Review', typeof: 'spec:SelfReviewQuestionnaireSocietalImpact' },
    'accessibility-considerations': { label: 'Accessibility Considerations', typeof: 'spec:AccessibilityConsiderations' },
    'internationalization-considerations': { label: 'Internationalization Considerations', typeof: 'spec:InternationalizationConsiderations' },
  },
};

const nonNormative = `<p><em>This section is non-normative.</em></p>`;

// Sentence fragment per Considerations subsection, for the definition sentence (AC phrasing).
const CONSIDERATION_PHRASES = {
  'security-considerations': (href) => `<a href="${href}">security</a> considerations`,
  'privacy-considerations': (href) => `<a href="${href}">privacy</a> considerations`,
  'threat-model': (href) => `a <a href="${href}">threat model</a>`,
  'security-privacy-review': (href) => `a <a href="${href}">security and privacy review</a>`,
  'societal-impact-review': (href) => `a <a href="${href}">societal impact review</a>`,
  'accessibility-considerations': (href) => `<a href="${href}">accessibility</a> considerations`,
  'internationalization-considerations': (href) => `<a href="${href}">internationalization</a> considerations`,
};

// Considerations definition sentence: present subsections as links in a spec:consideration span; rewritten by the sync plugin. subs: [{ type, id }].
export function considerationsDefinitionHTML(subs = []) {
  const phrases = subs
    .filter(({ type }) => CONSIDERATION_PHRASES[type])
    .map(({ type, id }) => CONSIDERATION_PHRASES[type](`#${id}`));
  if (!phrases.length) {
    return `<p id="considerations-definition">This section details considerations relevant to this specification.</p>`;
  }
  const list = phrases.length === 1 ? phrases[0]
    : phrases.length === 2 ? `${phrases[0]} and ${phrases[1]}`
    : `${phrases.slice(0, -1).join(', ')}, and ${phrases[phrases.length - 1]}`;
  return `<p id="considerations-definition">This section details <span about="" rel="spec:consideration">${list}</span>.</p>`;
}

// Specification Category concepts (spec: vocabulary): local name -> prose label used in the definition sentence.
export const SPEC_CATEGORIES = {
  'SetOfGuidelines': 'set of guidelines',
  'FoundationOrAbstract': 'foundation or abstract',
  'NotationSyntax': 'notation/syntax',
  'ContentData': 'content/data',
  'SetOfEvents': 'set of events',
  'Protocol': 'protocol',
  'ProcessorBehavior': 'processor behavior',
  'API': 'API',
  'RulesForDerivingProfiles': 'rules for deriving profiles',
};

// Specification Category definition sentence with the selection as skos:hasTopConcept spans; written by the checkbox widget.
export function categoryDefinitionHTML(selected = []) {
  const list = selected
    .filter((key) => SPEC_CATEGORIES[key])
    .map((key) => `<span rel="skos:hasTopConcept" resource="spec:${key}">${SPEC_CATEGORIES[key]}</span>`)
    .join(', ');
  return `<p id="specification-category-definition" property="skos:definition">This <span about="" rel="spec:specificationCategory" resource="#specification-category">specification identifies</span> the following <cite><a href="https://www.w3.org/TR/spec-variability/#spec-cat" rel="dcterms:subject" resource="spec:SpecificationCategory">Specification Category</a></cite> to distinguish the types of conformance${list ? `: ${list}.` : ':'}</p>`;
}

// Editable dt/dd pairs for the widgets; the dd hint sits on an inner <p> since only empty textblocks display data-placeholder.
export function termEntryHTML() {
  return `<dt data-placeholder="${i18n.t('specification.placeholder.term')}"></dt><dd><p data-placeholder="${i18n.t('specification.placeholder.term-definition')}"></p></dd>`;
}

export function productClassEntryHTML() {
  return `<dt data-placeholder="${i18n.t('specification.placeholder.class-of-product-name')}"></dt><dd><p data-placeholder="${i18n.t('specification.placeholder.class-of-product-definition')}"></p></dd>`;
}

export function interoperabilityEntryHTML(a, b) {
  return `<dt>${a}–${b} interoperability</dt><dd><p data-placeholder="${i18n.t('specification.placeholder.interoperability')}"></p></dd>`;
}

function getSpecificationRoot() {
  return document.querySelector('main > article');
}

// The article's own typeof is the primary marker (survives removal of the details block).
export function isSpecification(root) {
  return root.matches?.('[typeof~="doap:Specification"]') ||
    !!root.querySelector('[typeof~="doap:Specification"], [rel~="rdf:type"][href*="doap#Specification"], [rel~="rdf:type"][resource*="doap#Specification"]');
}

function sectionLabel(type) {
  return i18n.t(`specification.section.${type}.label`);
}

// Heading-text slug -> type, the fallback when a section id no longer matches.
let slugCache = null;
function slugToType() {
  if (!slugCache) {
    slugCache = {};
    const register = (registry) => Object.entries(registry).forEach(([type, s]) => {
      slugCache[type] = type;
      slugCache[slugify(s.label)] = type;
    });
    register(SECTIONS);
    Object.values(SPEC_SUBSECTIONS).forEach(register);
  }
  return slugCache;
}

// Classify by id, then heading slug. Tree-agnostic so DOM and PM share it.
export function classifySpecificationSection({ id, headingText } = {}) {
  if (id && SECTIONS[id]) return id;
  const slug = headingText ? slugify(headingText.trim()) : '';
  const type = slug ? slugToType()[slug] : null;
  return type && SECTIONS[type] ? type : null;
}

export function classifySpecificationSubsection(parentType, { id, headingText } = {}) {
  const registry = SPEC_SUBSECTIONS[parentType];
  if (!registry) return null;
  if (id && registry[id]) return id;
  const slug = headingText ? slugify(headingText.trim()) : '';
  const type = slug ? slugToType()[slug] : null;
  return type && registry[type] ? type : null;
}

function headingText(section) {
  return section.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6')?.textContent || '';
}

// Sections are direct article children (the outline model); their parent is
// the article, or the editor's wrapper element in author mode.
function getContent(root) {
  return root.querySelector(':scope > .ProseMirror') || root;
}

// Present sections: Map(type -> { id, subs?: Map(subtype -> id) }), from the DOM.
function sectionEntries(root) {
  const entries = new Map();
  const details = findOutsideDetails(root);
  if (details) entries.set('document-details', { id: details.id || 'document-details' });

  getContent(root)?.querySelectorAll(':scope > section').forEach((section) => {
    const type = classifySpecificationSection({ id: section.id, headingText: headingText(section) });
    if (!type || entries.has(type)) return;
    const info = { id: section.id || type };
    if (SPEC_SUBSECTIONS[type]) {
      info.subs = new Map();
      section.querySelectorAll(':scope > section, :scope > div > section').forEach((sub) => {
        const subType = classifySpecificationSubsection(type, { id: sub.id, headingText: headingText(sub) });
        if (subType && !info.subs.has(subType)) info.subs.set(subType, sub.id);
      });
    }
    entries.set(type, info);
  });
  return entries;
}

// Editor-only Report type control (class="do", stripped on save); value restored from the persisted chrome.
function reportTypeSelectHTML(value = 'dokieli-basic') {
  const selected = (v) => v === value ? ' selected="selected"' : '';
  const dataValue = value ? ` data-value="${value}"` : '';
  return `<select id="specification-report-type" name="specification-report-type"${dataValue}><optgroup label="dokieli"><option${selected('dokieli-basic')} value="dokieli-basic">dokieli Basic</option></optgroup><optgroup label="W3C"><option${selected('w3c-base')} value="w3c-base">W3C Base</option></optgroup></select>`;
}

function specificationStatusHTML(value = 'dokieli-basic') {
  return `<dl class="do" id="specification-status">
    <dt>Report type</dt>
    <dd><label contenteditable="false" for="specification-report-type">Select report type</label> ${reportTypeSelectHTML(value)}</dd>
  </dl>`;
}

// Editor hook: re-add the Report type control on author entry.
function restoreSpecificationStatus(root) {
  if (!root || !isSpecification(root)) return;
  if (root.querySelector('#specification-status')) return;
  const h1 = root.querySelector('h1');
  if (!h1) return;
  const value = document.head.querySelector(`link[href="${TR_BASE_CSS}"]`) ? 'w3c-base' : 'dokieli-basic';
  h1.after(fragmentFromString(specificationStatusHTML(value)));
}

registerEditorParseTransform(restoreSpecificationStatus);

function documentDetailsBlockHTML() {
  const documentURL = Config.DocumentURL.split('?')[0];

  //TODO: i18n
  const userDetails = {
    IRI: Config.User.IRI || 'https://example.org/profile/card#me',
    Name: Config.User.Name || 'Your Name',
  };

  const now = new Date();
  const dateTime = now.toISOString();
  const date = dateTime.slice(0, 10);
  const timeHTML = (property) => `<time content="${dateTime}" datatype="xsd:dateTime" datetime="${dateTime}" property="${property}">${date}</time>`;

  const language = Config.User.UI.Language || 'en';
  let languageName = Config.Languages?.[language]?.name;
  if (!languageName) {
    try { languageName = new Intl.DisplayNames([language], { type: 'language', languageDisplay: 'standard' }).of(language) || language; } catch { languageName = language; }
  }

  return documentDetailsHTML([
    { id: 'document-identifier', dt: 'This version', dds: [`<a href="${documentURL}">${documentURL}</a>`] },
    { id: 'document-editors', dt: 'Editors', dds: [`<a href="${userDetails.IRI}" rel="schema:creator schema:editor schema:author" typeof="schema:Person">${userDetails.Name}</a>`] },
    { id: 'document-published', dt: 'Published', dds: [timeHTML('schema:datePublished')] },
    { id: 'document-modified', dt: 'Modified', dds: [timeHTML('schema:dateModified')] },
    { id: 'document-language', dt: 'Language', dds: [`<span content="${language}" lang="" property="dcterms:language" xml:lang="">${languageName}</span>`] },
    { id: 'document-version', dt: 'Version', dds: [`<span lang="" property="schema:version" xml:lang="">0.1.0</span>`] },
    { id: 'document-type', dt: 'Document Type', dds: [`<a href="http://usefulinc.com/ns/doap#Specification" rel="rdf:type">Specification</a>`] },
  ], { id: 'document-details', summary: sectionLabel('document-details') });
}

function explainerHTML() {
  return sectionHTML({ id: 'explainer', heading: sectionLabel('explainer'), content: nonNormative + `<p data-placeholder="${i18n.t('specification.placeholder.explainer')}"></p>` });
}

function conformanceHTML() {
  const content = `<p>This section describes the <span about="" rel="spec:conformance" resource="#conformance">conformance model of this specification</span>.</p>` +
    sectionHTML({
      id: 'normative-and-informative-content',
      level: 3,
      heading: 'Normative and Informative Content',
      content:
        `<p id="normative-informative-sections">All assertions, diagrams, examples, and notes are non-normative, as are all sections explicitly marked non-normative. Everything else is normative.</p>` +
        `<p id="requirement-levels">The key words "<span rel="dcterms:subject" resource="spec:MUST">MUST</span>", "<span rel="dcterms:subject" resource="spec:MUSTNOT">MUST NOT</span>", "<span rel="dcterms:subject" resource="spec:SHOULD">SHOULD</span>", and "<span rel="dcterms:subject" resource="spec:MAY">MAY</span>" are to be interpreted as described in <a href="https://www.rfc-editor.org/info/bcp14">BCP 14</a> [<cite><a class="bibref" href="#bib-rfc2119">RFC2119</a></cite>] [<cite><a class="bibref" href="#bib-rfc8174">RFC8174</a></cite>] when, and only when, they appear in all capitals, as shown here.</p>` +
        `<p id="advisement-levels">The key words "<span rel="dcterms:subject" resource="spec:StronglyEncouraged">strongly encouraged</span>", "<span rel="dcterms:subject" resource="spec:StronglyDiscouraged">strongly discouraged</span>", "<span rel="dcterms:subject" resource="spec:Encouraged">encouraged</span>", "<span rel="dcterms:subject" resource="spec:Discouraged">discouraged</span>", "<span rel="dcterms:subject" resource="spec:Can">can</span>", "<span rel="dcterms:subject" resource="spec:Cannot">cannot</span>", "<span rel="dcterms:subject" resource="spec:Could">could</span>", "<span rel="dcterms:subject" resource="spec:CouldNot">could not</span>", "<span rel="dcterms:subject" resource="spec:Might">might</span>", and "<span rel="dcterms:subject" resource="spec:MightNot">might not</span>" are used for non-normative content.</p>`,
    }) +
    sectionHTML({
      id: 'specification-category',
      level: 3,
      heading: 'Specification Category',
      headingProperty: 'schema:name skos:prefLabel',
      rel: 'schema:hasPart spec:specificationCategory',
      attrs: ' typeof="skos:ConceptScheme"',
      content: categoryDefinitionHTML(),
    }) +
    sectionHTML({
      id: 'classes-of-products',
      level: 3,
      heading: 'Classes of Products',
      headingProperty: 'schema:name skos:prefLabel',
      attrs: ' typeof="skos:ConceptScheme"',
      content:
        `<p property="skos:definition">This <span about="" rel="spec:classesOfProducts" resource="#classes-of-products">specification identifies</span> the following <cite><a href="https://www.w3.org/TR/qaframe-spec/#cop-def" rel="dcterms:subject" resource="spec:ClassesOfProducts">Classes of Products</a></cite> for conforming implementations.</p>` +
        `<p>A single implementation can fulfil more than one role simultaneously.</p>` +
        `<dl rel="skos:hasTopConcept">${productClassEntryHTML()}</dl>`,
    }) +
    sectionHTML({
      id: 'interoperability',
      level: 3,
      heading: 'Interoperability',
      headingProperty: 'schema:name skos:prefLabel',
      content:
        `<p property="skos:definition">In this specification, interoperability occurs between the <a href="#classes-of-products" rel="rdfs:seeAlso">Classes of Products</a> defined by this specification.</p>`,
    });

  return sectionHTML({ id: 'conformance', heading: sectionLabel('conformance'), content });
}

function terminologyHTML() {
  return sectionHTML({
    id: 'terminology',
    heading: sectionLabel('terminology'),
    headingProperty: 'schema:name skos:prefLabel',
    attrs: ' typeof="skos:ConceptScheme"',
    content: nonNormative +
      `<p property="skos:definition">This specification defines the following terms. These terms are referenced throughout this specification.</p>` +
      `<dl rel="skos:hasTopConcept">${termEntryHTML()}</dl>`,
  });
}

function referencesHTML() {
  const normative = `<dl class="bibliography" resource="">
    <dt id="bib-rfc2119">[RFC2119]</dt>
    <dd><cite><a href="https://datatracker.ietf.org/doc/html/rfc2119" rel="cito:citesAsAuthority">Key words for use in RFCs to Indicate Requirement Levels</a></cite>. S. Bradner.  IETF. March 1997. Best Current Practice. URL: <a href="https://datatracker.ietf.org/doc/html/rfc2119">https://datatracker.ietf.org/doc/html/rfc2119</a></dd>
    <dt id="bib-rfc8174">[RFC8174]</dt>
    <dd><cite><a href="https://www.rfc-editor.org/info/rfc8174" rel="cito:citesAsAuthority">Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words</a></cite>. B. Leiba.  IETF. May 2017. Best Current Practice. URL: <a href="https://www.rfc-editor.org/info/rfc8174">https://www.rfc-editor.org/info/rfc8174</a></dd>
  </dl>`;
  const content =
    sectionHTML({ id: 'normative-references', level: 3, heading: i18n.t('specification.section.normative-references.label'), content: normative }) +
    sectionHTML({ id: 'informative-references', level: 3, heading: i18n.t('specification.section.informative-references.label'), content: '<p></p>' });
  return sectionHTML({ id: 'references', className: 'appendix', heading: sectionLabel('references'), content });
}

function specificationSectionHTML(type) {
  switch (type) {
    case 'document-details':
      return documentDetailsBlockHTML();
    case 'abstract':
      return `<section id="abstract"><h2>${sectionLabel('abstract')}</h2><div datatype="rdf:HTML" property="schema:abstract"><p data-placeholder="${i18n.t('specification.placeholder.abstract')}"></p></div></section>`;
    case 'sotd':
      return sectionHTML({ id: 'sotd', heading: sectionLabel('sotd'), content: `<p data-placeholder="${i18n.t('specification.placeholder.sotd')}"></p>` });
    case 'introduction':
      return sectionHTML({ id: 'introduction', heading: sectionLabel('introduction'), content: nonNormative + `<p data-placeholder="${i18n.t('specification.placeholder.introduction')}"></p>` });
    case 'terminology':
      return terminologyHTML();
    case 'conformance':
      return conformanceHTML();
    case 'explainer':
      return explainerHTML();
    case 'use-cases':
      return sectionHTML({ id: 'use-cases', heading: sectionLabel('use-cases'), content: nonNormative + `<ul><li><p data-placeholder="${i18n.t('specification.placeholder.use-case')}"></p></li></ul>` });
    case 'considerations':
      return sectionHTML({ id: 'considerations', heading: sectionLabel('considerations'), attrs: ' typeof="spec:Considerations"', content: considerationsDefinitionHTML() + '<p></p>' });
    case 'changelog':
      return sectionHTML({ id: 'changelog', className: 'appendix', heading: sectionLabel('changelog'), content: '<p></p>' });
    case 'acknowledgements':
      return sectionHTML({ id: 'acknowledgements', className: 'appendix', heading: sectionLabel('acknowledgements'), content: `<p data-placeholder="${i18n.t('specification.placeholder.acknowledgements')}"></p>` });
    case 'references':
      return referencesHTML();
  }
  return '';
}

function considerationsSubsectionHTML(type) {
  const typeOf = SPEC_SUBSECTIONS['considerations'][type]?.typeof;
  return sectionHTML({
    id: type,
    level: 3,
    heading: sectionLabel(type),
    attrs: typeOf ? ` typeof="${typeOf}"` : '',
    content: nonNormative + '<p></p>',
  });
}

export const specificationSections = registerSectionsTemplate({
  templateId: 'specification',
  getRoot: getSpecificationRoot,
  isDoc: isSpecification,
  sections: SECTIONS,
  sectionLabel,
  sectionHTML: specificationSectionHTML,
  sectionEntries,
  removeLabel: (type) => i18n.t('specification.button.remove-section.aria-label', { label: sectionLabel(type) }),
  getContent,
  sectionsAtRoot: true,
  tocId: 'toc',
  tocLabel: () => i18n.t('specification.toc.h2.textContent'),
  unnumbered: new Set(['abstract', 'sotd']),
  outside: new Set(['document-details']),
  subsections: {
    'considerations': {
      sections: SPEC_SUBSECTIONS['considerations'],
      sectionLabel,
      sectionHTML: considerationsSubsectionHTML,
    },
  },
});

registerDocumentTransform((doc) => injectSectionsTOC(specificationSections, doc));
registerEditorParseTransform((root) => stripSectionsTOC(specificationSections, root));

// Section element by key: id match, then heading slug (ids can be rewritten by autoId).
function findSpecificationSectionElement(article, key) {
  return article.querySelector(`section#${CSS.escape(key)}`) ||
    Array.from(article.querySelectorAll('section')).find(s => slugify(headingText(s).trim()) === key) || null;
}

// PascalCase concept id from a product-class name: "capability description" -> "CapabilityDescription".
export function conceptId(text) {
  return text.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('').replace(/[^\w.-]/g, '');
}

// "Consumer–Capability Description interoperability" -> "Consumer-CapabilityDescription".
export function interoperabilityId(text) {
  return text.replace(/\s*interoperability\s*$/i, '')
    .split(/[–—]/)
    .map(part => conceptId(part.trim()))
    .join('-');
}

function upgradeConceptPair(doc, dt, dd, id) {
  dt.setAttribute('about', `#${id}`);
  dt.setAttribute('property', 'skos:prefLabel');
  dt.setAttribute('typeof', 'skos:Concept');
  if (!dt.querySelector('dfn')) {
    const dfn = doc.createElement('dfn');
    dfn.setAttribute('id', id);
    dfn.append(...Array.from(dt.childNodes));
    dt.replaceChildren(dfn);
  }
  if (dd) {
    dd.setAttribute('about', `#${id}`);
    dd.setAttribute('property', 'skos:definition');
  }
}

// Save hook: prune empty pairs in the managed <dl>s, then upgrade entries to the AC RDFa markup.
function upgradeSpecificationDlEntries(doc) {
  const article = selectArticleNode(doc);
  if (!article || !isSpecification(article)) return;

  ['terminology', 'classes-of-products', 'interoperability'].forEach((key) => {
    const dl = findSpecificationSectionElement(article, key)?.querySelector('dl');
    if (!dl) return;

    Array.from(dl.querySelectorAll(':scope > dt')).forEach((dt) => {
      let dd = dt.nextElementSibling?.tagName === 'DD' ? dt.nextElementSibling : null;
      const dtEmpty = !dt.textContent.trim();
      const ddEmpty = !dd || !dd.textContent.trim();

      if (dtEmpty && ddEmpty) {
        dd?.remove();
        dt.remove();
        return;
      }
      if (dtEmpty) return;

      // The serializer drops empty <dd>s; recreate so every dt keeps its pair.
      if (!dd) {
        dd = doc.createElement('dd');
        dt.after(dd);
      }

      if (dt.getAttribute('about')) return;
      const text = dt.textContent.trim();
      if (key === 'terminology') upgradeConceptPair(doc, dt, dd, `dfn-${slugify(text)}`);
      else if (key === 'classes-of-products') upgradeConceptPair(doc, dt, dd, conceptId(text));
      else upgradeConceptPair(doc, dt, dd, interoperabilityId(text));
    });

    if (!dl.children.length) dl.remove();
  });
}

registerDocumentTransform(upgradeSpecificationDlEntries);

// No inverse transform: the RDFa stays in the editor; the concept sync plugin keeps it coherent on focus-out.

const FIXUP_SRC = 'https://www.w3.org/scripts/TR/2021/fixup.js';
const TR_BASE_CSS = 'https://www.w3.org/StyleSheets/TR/2021/base.css';
const TR_DARK_CSS = 'https://www.w3.org/StyleSheets/TR/2021/dark.css';

// Refresh only the Display Modes menu section (the one that lists stylesheets):
// rebuilt in place when the menu is open, else on the next open.
function refreshDisplayModes() {
  const documentMenu = document.getElementById('document-menu');
  if (!documentMenu) return;
  documentMenu.querySelector('#document-views')?.remove();
  if (documentMenu.classList.contains('on')) {
    const tabTools = documentMenu.querySelector('#menu-tools');
    if (tabTools) showViews(tabTools);
  }
}

// W3C TR stylesheets become the preferred style, inserted above basic.css (kept as alternate).
function setSpecificationStylesheets() {
  if (document.head.querySelector(`link[href="${TR_BASE_CSS}"]`)) return;

  const base = document.createElement('link');
  base.setAttribute('href', TR_BASE_CSS);
  base.setAttribute('media', 'all');
  base.setAttribute('rel', 'stylesheet');
  base.setAttribute('title', 'W3C-Base');

  const dark = document.createElement('link');
  dark.setAttribute('href', TR_DARK_CSS);
  dark.setAttribute('media', '(prefers-color-scheme: dark)');
  dark.setAttribute('rel', 'stylesheet');

  const basic = document.head.querySelector('link[href$="basic.css"]');
  if (basic) {
    basic.setAttribute('rel', 'stylesheet alternate');
    basic.setAttribute('title', 'Basic');
    basic.before(base, dark);
  }
  else {
    document.head.append(base, dark);
  }

  // rel alone does not deactivate an applied titled stylesheet; toggle flags via the switcher.
  updateSelectedStylesheets(document.querySelectorAll('head link[rel~="stylesheet"][title]:not([href$="dokieli.css"])'), 'W3C-Base');

  refreshDisplayModes();
}

function removeSpecificationStylesheets() {
  const base = document.head.querySelector(`link[href="${TR_BASE_CSS}"]`);
  const dark = document.head.querySelector(`link[href="${TR_DARK_CSS}"]`);
  if (!base && !dark) return;
  base?.remove();
  dark?.remove();
  updateSelectedStylesheets(document.querySelectorAll('head link[rel~="stylesheet"][title]:not([href$="dokieli.css"])'), 'Basic');
  refreshDisplayModes();
}

// TR fixup.js needs the published structure; inserted inert (innerHTML-parsed) so it only runs when the saved document loads.
function ensureFixupScript() {
  if (document.querySelector(`script[src="${FIXUP_SRC}"]`)) return;
  const holder = document.createElement('div');
  holder.innerHTML = `<script src="${FIXUP_SRC}"></script>`;
  document.body.appendChild(holder.firstElementChild);
}

function removeFixupScript() {
  document.querySelector(`script[src="${FIXUP_SRC}"]`)?.remove();
}

// Report type drives the W3C TR chrome: stylesheets and fixup script (div.head/hr is handled by the sync plugin).
export function applyReportTypeChrome(reportType) {
  if (reportType === 'w3c-base') {
    setSpecificationStylesheets();
    ensureFixupScript();
  }
  else {
    removeSpecificationStylesheets();
    removeFixupScript();
  }
}

export function setTemplateNewSpecification(mode, options) {
  prepareDocumentForTemplate();

  const sections = DEFAULT_SECTIONS
    .filter((type) => type !== 'document-details')
    .map(specificationSectionHTML)
    .join('');

  replaceDocumentBody(`<main><article about="" dir="auto" typeof="schema:Article doap:Specification"><h1 aria-label="${i18n.t('editor.new.h1.aria-label')}" property="schema:name"></h1>${specificationStatusHTML()}${documentDetailsBlockHTML()}${sections}</article></main><p id="back-to-top" role="navigation"><a href="#toc"><abbr title="Back to top">↑</abbr></a></p>`);

  initSpecification();
}

let modeHandlerAttached = false;

// Render the nav and keep it fresh across mode changes. Safe to call repeatedly.
export function initSpecification() {
  const root = getSpecificationRoot();
  if (!root || !isSpecification(root)) return;

  refreshSectionsNav(specificationSections, root);

  if (!modeHandlerAttached) {
    modeHandlerAttached = true;
    window.addEventListener('dokieli:editor-mode-changed', (e) => {
      const root = getSpecificationRoot();
      if (!root || !isSpecification(root)) return;
      // Leaving author mode: upgrade entries as on save; drop editor-only placeholder hints.
      if (e.detail?.mode !== 'author') {
        upgradeSpecificationDlEntries(document);
        root.querySelectorAll('[data-placeholder]').forEach(el => el.removeAttribute('data-placeholder'));
        root.querySelector('#specification-status')?.remove();
      }
      refreshSectionsNav(specificationSections, root);
    });
  }
}
