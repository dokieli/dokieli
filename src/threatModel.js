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
import { i18n } from './i18n.js';
import { htmlEncode } from './utils/sanitization.js';
import { getTableAttributes, getColumnAttributes, getPrefixesUsed, ensureDocumentPrefixes, subjectFromCaption } from './table.js';
import { getLookupService } from './services.js';
import { bibref, bibliographyEntry } from './bibliography.js';


export const THREAT_MODEL_WEB = 'https://www.w3.org/TR/threat-model-web/';

// The select carries one of these markers; the saved document carries the rel.
export const THREAT_SELECT_RELS = {
  'threat-type': 'dpv:hasImpact',
  'threat-element': 'dcat:theme',
  'risk-level': 'dpv:hasRiskLevel'
};

export function strideTypes() {
  return Object.values(Config.STRIDEThreatTypes).map(({ uri, name }) => ({ value: uri, label: name }));
}

export function linddunTypes() {
  return [
    { value: 'https://linddun.org/threat-types/#L', label: 'Linking' },
    { value: 'https://linddun.org/threat-types/#I', label: 'Identifying' },
    { value: 'https://linddun.org/threat-types/#Nr', label: 'Non-repudiation' },
    { value: 'https://linddun.org/threat-types/#D', label: 'Detecting' },
    { value: 'https://linddun.org/threat-types/#DD', label: 'Data Disclosure' },
    { value: 'https://linddun.org/threat-types/#U', label: 'Unawareness & Unintervenability' },
    { value: 'https://linddun.org/threat-types/#Nc', label: 'Non-compliance' }
  ];
}

export function riskLevels() {
  return ['Extremely High', 'Very High', 'High', 'Moderate', 'Low', 'Very Low', 'Extremely Low'].map((label) => ({
    value: `https://w3id.org/dpv/risk#${label.replace(/ /g, '')}`,
    label
  }));
}

// Elements of https://www.w3.org/TR/threat-model-web/ with their notations.
const THREAT_MODEL_ELEMENTS = {
  highLevel: [
    { id: 'user', notation: 'E0', label: 'User' },
    { id: 'remote-web-origins', notation: 'E1', label: 'Remote Web Origin(s)' },
    { id: 'network-infrastructure', notation: 'E2', label: 'Network Infrastructure' },
    { id: 'operating-system-device-platform', notation: 'E3', label: 'Operating System / Device / Platform' },
    { id: 'user-agent-web-browser', notation: 'P0', label: 'User Agent / Web Browser' },
    { id: 'browser-managed-state', notation: 'S0', label: 'Browser-managed State' },
    { id: 'user-interaction', notation: 'F0', label: 'User interaction' },
    { id: 'web-request-response', notation: 'F1', label: 'Web request / response' },
    { id: 'subresource-and-third-party-loads', notation: 'F2', label: 'Subresource and third-party loads' },
    { id: 'browser-state-access', notation: 'F3', label: 'Browser state access' },
    { id: 'brokered-platform-access', notation: 'F4', label: 'Brokered platform access' },
    { id: 'user-agent-boundary', notation: 'B0', label: 'User Agent Boundary' },
    { id: 'web-origin-boundary', notation: 'B1', label: 'Web Origin Boundary' },
    { id: 'network-boundary', notation: 'B2', label: 'Network Boundary' },
    { id: 'browser-state-boundary', notation: 'B3', label: 'Browser State Boundary' },
    { id: 'operating-system-device-boundary', notation: 'B4', label: 'Operating System / Device Boundary' }
  ],
  browser: [
    { id: 'browser-user', notation: 'E1', label: 'User' },
    { id: 'browser-remote-web-origins', notation: 'E2', label: 'Remote Web Origin(s)' },
    { id: 'underlying-network-infrastructure', notation: 'E3', label: 'Underlying Network Infrastructure' },
    { id: 'operating-system', notation: 'E4', label: 'Operating System' },
    { id: 'web-browser-boundary', notation: 'B1', label: 'Web Browser Boundary' },
    { id: 'privileged-browser-process-boundary', notation: 'B1.1', label: 'Privileged Browser Process Boundary' },
    { id: 'sandboxed-content-execution-and-rendering-boundary', notation: 'B1.2', label: 'Sandboxed Content Execution and Rendering Boundary' },
    { id: 'web-content-execution-process-boundary', notation: 'B1.3', label: 'Web-Content Execution Process Boundary' },
    { id: 'helper-services-boundary', notation: 'B1.4', label: 'Helper Services Boundary' },
    { id: 'profile-and-policy-state-boundary', notation: 'B1.5', label: 'Profile and Policy State Boundary' },
    { id: 'site-state-boundary', notation: 'B1.6', label: 'Site State Boundary' },
    { id: 'sandboxed-privileged-content-execution-boundary', notation: 'B1.7', label: 'Sandboxed Privileged Content Execution Boundary' },
    { id: 'local-network-boundary', notation: 'B1.8', label: 'Local Network Boundary' },
    { id: 'web-boundary', notation: 'B1.9', label: 'Web Boundary' },
    { id: 'browser-web-origin-boundary', notation: 'B1.10', label: 'Web Origin Boundary' },
    { id: 'browser-ui-parent', notation: 'P1', label: 'Browser / UI / Parent' },
    { id: 'content-renderer-webcontent', notation: 'P2', label: 'Content / Renderer / WebContent' },
    { id: 'network-socket-networking', notation: 'P3', label: 'Network / Socket / Networking' },
    { id: 'gpu-compositor-media-helpers', notation: 'P4', label: 'GPU / compositor / media helper(s)' },
    { id: 'privileged-extension-internal-content', notation: 'P5', label: 'Privileged extension / internal content' },
    { id: 'profile-session-policy-store', notation: 'S1', label: 'Profile / session / policy store' },
    { id: 'permissions-browser-metadata', notation: 'S2', label: 'Permissions / browser metadata' },
    { id: 'cookies-http-cache', notation: 'S3', label: 'Cookies + HTTP cache' },
    { id: 'web-storage-indexeddb-service-worker-data', notation: 'S4', label: 'Web storage / IndexedDB / service-worker data' },
    { id: 'browser-user-interaction', notation: 'F1', label: 'User interaction' },
    { id: 'navigation-frame-control-ipc', notation: 'F2', label: 'Navigation / frame control / IPC' },
    { id: 'subresource-fetch-network-mediation', notation: 'F3', label: 'Subresource fetch / network mediation' },
    { id: 'https-dns-remote-data', notation: 'F4', label: 'HTTPS / DNS / remote data' },
    { id: 'display-media-compositing', notation: 'F5', label: 'Display / media / compositing' },
    { id: 'profile-session-reads-and-writes', notation: 'F6', label: 'Profile/session reads and writes' },
    { id: 'permissions-browser-policy', notation: 'F7', label: 'Permissions / browser policy' },
    { id: 'cookie-cache-mediation', notation: 'F8', label: 'Cookie / cache mediation' },
    { id: 'web-storage-path', notation: 'F9', label: 'Web storage path' },
    { id: 'brokered-os-access', notation: 'F10', label: 'Brokered OS access' }
  ]
};

export function threatModelElementGroups() {
  const asOption = ({ id, notation, label }) => ({ value: `${THREAT_MODEL_WEB}#${id}`, label: `${notation} ${label}` });

  return [
    { label: 'High-Level Web Threat Model', options: THREAT_MODEL_ELEMENTS.highLevel.map(asOption) },
    { label: 'Web Browser Threat Model', options: THREAT_MODEL_ELEMENTS.browser.map(asOption) }
  ];
}

function attrString(attrs) {
  return Object.entries(attrs)
    .map(([name, value]) => `${name}="${htmlEncode(String(value), { mode: 'attribute', attributeName: name })}"`)
    .join(' ');
}

// The select as markup, mirroring the node builder in the editor commands.
export function threatSelectHTML(kind, framework = 'stride', chosenValue = null) {
  const chosen = kind === 'threat-model-kind' ? (chosenValue || framework) : chosenValue;

  const optionHTML = ({ value, label }) =>
    `<option value="${htmlEncode(value, { mode: 'attribute', attributeName: 'value' })}"${value === chosen ? ' selected="selected"' : ''}>${htmlEncode(label)}</option>`;

  const groups = threatSelectGroups(kind, framework).map((group) => group.label
    ? `<optgroup label="${htmlEncode(group.label, { mode: 'attribute', attributeName: 'label' })}">${group.options.map(optionHTML).join('')}</optgroup>`
    : group.options.map(optionHTML).join('')).join('');

  const placeholder = kind === 'threat-model-kind'
    ? ''
    : `<option value="">${htmlEncode(i18n.t(`editor.table.threat.select.${kind}.textContent`))}</option>`;

  const marker = kind === 'threat-type' ? ` data-framework="${framework}"` : '';

  return `<select data-select="${kind}"${marker}>${placeholder}${groups}</select>`;
}

export function defaultThreatCaption(framework = 'stride') {
  return framework === 'linddun' ? 'Privacy Threats and Mitigations' : 'Security Threats and Mitigations';
}

// A table reference for the definition sentence: identifier, caption, framework.
export function threatTableRef(caption, framework = 'stride') {
  return { id: (subjectFromCaption(caption) || '#').slice(1), caption, framework };
}

export function threatClassificationSentence(tables = []) {
  const attr = (value, name) => htmlEncode(String(value), { mode: 'attribute', attributeName: name });
  const tableRef = (table, label) =>
    `<a href="#${attr(table.id, 'href')}" rel="rdfs:seeAlso" title="${attr(table.caption, 'title')}">${label}</a>`;

  const stride = tables.find((t) => t.framework === 'stride' && t.id);
  const linddun = tables.find((t) => t.framework === 'linddun' && t.id);

  const strideBy = 'classified by a <a href="https://en.wikipedia.org/wiki/STRIDE_model" rel="rdfs:seeAlso" resource="http://www.wikidata.org/entity/Q7394815">STRIDE</a> threat type';
  const linddunBy = 'a <a href="https://linddun.org/" rel="rdfs:seeAlso">LINDDUN</a> threat type';

  if (stride && linddun) {
    return `${tableRef(stride, 'Security Threats')} are ${strideBy} and ${tableRef(linddun, 'Privacy Threats')} by ${linddunBy}.`;
  }
  if (stride) return `${tableRef(stride, 'Security Threats')} are ${strideBy}.`;
  if (linddun) return `${tableRef(linddun, 'Privacy Threats')} are classified by ${linddunBy}.`;
  return '';
}

// The machine-managed definition paragraph; the classification sentence follows the tables.
const THREAT_MODEL_BIBS = {
  'dpv-risk': { id: 'dpv-risk', shortName: 'DPV-RISK', title: 'Risk Extension', url: 'https://w3id.org/dpv/risk', rel: 'cito:citesAsPotentialSolution', authors: 'Harshvardhan J. Pandit', publisher: 'W3C Data Privacy Vocabularies and Controls Community Group', date: '25 February 2026', status: 'Final Community Group Report' },
  'privacy-principles': { id: 'privacy-principles', shortName: 'PRIVACY-PRINCIPLES', title: 'Privacy Principles', url: 'https://www.w3.org/TR/privacy-principles/', rel: 'cito:citesAsPotentialSolution', authors: 'Robin Berjon; Jeffrey Yasskin', publisher: 'W3C', date: '15 May 2025', status: 'W3C Statement' },
  'threat-model-web': { id: 'threat-model-web', shortName: 'THREAT-MODEL-WEB', title: 'Threat Model for the Web', url: 'https://www.w3.org/TR/threat-model-web/', rel: 'cito:obtainsBackgroundFrom', authors: 'Simone Onofri; Joe Andrieu; Giovanni Corti', publisher: 'W3C', date: '21 July 2026', status: 'W3C Group Note Draft' },
};

export function threatModelDefinitionHTML(tables = []) {
  const classification = threatClassificationSentence(tables);

  return '<p id="threat-model-definition">'
    + `This threat analysis follows the framework of the <cite><a href="https://www.w3.org/TR/threat-model-web/" rel="cito:obtainsBackgroundFrom">W3C Threat Model for the Web</a></cite> ${bibref(THREAT_MODEL_BIBS['threat-model-web'])}`
    + ` and draws on terminology from the <cite><a href="https://www.w3.org/TR/privacy-principles/" rel="cito:obtainsBackgroundFrom">Privacy Principles</a></cite> ${bibref(THREAT_MODEL_BIBS['privacy-principles'])}.`
    + (classification ? ` ${classification}` : '')
    + ` Each threat is assigned a risk level from the <cite><a href="https://w3id.org/dpv/risk">RISK Extension</a></cite> to DPV taxonomy ${bibref(THREAT_MODEL_BIBS['dpv-risk'])}.`
    + '</p>';
}

export const THREAT_MODEL_REFERENCES = Object.values(THREAT_MODEL_BIBS).map((bib) => ({
  key: bib.id,
  html: bibliographyEntry(bib),
}));

// A ready-to-edit threat model table, for templates that start a section with one.
export function threatModelTableHTML({ caption = defaultThreatCaption(), rows = 1 } = {}) {
  const service = getLookupService('threatmodel');

  ensureDocumentPrefixes([...getPrefixesUsed(service.tableSchema, service.columns), ...(service.prefixes || [])]);

  const headers = service.columns.map((column) => {
    const { identifier, select, kindSelect, ...schema } = column;
    const inner = kindSelect ? threatSelectHTML('threat-model-kind') : htmlEncode(column.titles);
    return `<th ${attrString(getColumnAttributes(schema))}>${inner}</th>`;
  }).join('');

  const bodyRow = `<tr>${service.columns.map((column) =>
    `<td>${column.select ? threatSelectHTML(column.select) : ''}</td>`).join('')}</tr>`;

  return `<table ${attrString(getTableAttributes(service.tableSchema))}>` +
    `<caption>${htmlEncode(caption)}</caption>` +
    `<thead><tr>${headers}</tr></thead>` +
    `<tbody>${Array.from({ length: rows }, () => bodyRow).join('')}</tbody></table>`;
}

// Rank of a reference within its vocabulary's declared order, -1 when unknown.
export function threatValueRank(rel, href) {
  const kind = Object.keys(THREAT_SELECT_RELS).find((k) => THREAT_SELECT_RELS[k] === rel);
  if (!kind || !href) return -1;

  const values = kind === 'threat-type'
    ? [...strideTypes(), ...linddunTypes()].map((o) => o.value)
    : threatSelectGroups(kind).flatMap((g) => g.options.map((o) => o.value));

  return values.indexOf(href);
}

export function threatSelectGroups(kind, framework = 'stride') {
  switch (kind) {
    case 'threat-model-kind':
      return [{ options: [
        { value: 'stride', label: 'STRIDE type' },
        { value: 'linddun', label: 'LINDDUN type' }
      ] }];
    case 'threat-type':
      return [{ options: framework === 'linddun' ? linddunTypes() : strideTypes() }];
    case 'threat-element':
      return threatModelElementGroups();
    case 'risk-level':
      return [{ options: riskLevels() }];
    default:
      return [];
  }
}
