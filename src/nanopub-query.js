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

import rdf from 'rdf-ext';
import { NANOPUB_QUERY_URLS, QUERY_TIMEOUT_MS } from '@nanopub/nanopub-js/constants';
import Config from './config.js';
import { getOriginDecision, requestOriginConsent } from './consent.js';
import { showAnnotation } from './activity.js';
import { getPreferredTargetIRI } from './doc.js';
import { i18n } from './i18n.js';

const ns = Config?.ns;

const RESULT_LIMIT = 100;

const PREFIXES = `prefix np: <http://www.nanopub.org/nschema#>
prefix npx: <http://purl.org/nanopub/x/>
prefix npa: <http://purl.org/nanopub/admin/>
prefix oa: <http://www.w3.org/ns/oa#>
prefix dct: <http://purl.org/dc/terms/>
`;

// Signed, and not retracted or superseded by the same key
const VALID_NANOPUB = `
    ?np npa:hasValidSignatureForPublicKey ?pubkey .
    filter not exists { ?npx npx:invalidates ?np ; npa:hasValidSignatureForPublicKey ?pubkey . }
    ?np np:hasAssertion ?a .`;

// Target is the document, or a SpecificResource whose source is the document
const TARGETS_DOCUMENT = `
    ?annotation a oa:Annotation .
    { ?annotation oa:hasTarget ?doc . }
    union
    { ?annotation oa:hasTarget ?target . ?target oa:hasSource ?doc . }`;

function values(variable, iris) {
  return `values ?${variable} { ${iris.map(iri => `<${iri}>`).join(' ')} }`;
}

export function buildDocumentNanopubsQuery(documentIRIs, limit = RESULT_LIMIT) {
  return `${PREFIXES}
select distinct ?np ?pubkey ?annotation ?doc ?created where {
  ${values('doc', documentIRIs)}
  graph npa:graph {${VALID_NANOPUB}
    optional { ?np dct:created ?created . }
  }
  graph ?a {${TARGETS_DOCUMENT}
  }
}
order by desc(?created)
limit ${limit}`;
}

export function buildAssertionTriplesQuery(nanopubIRIs) {
  return `${PREFIXES}
select ?np ?s ?p ?o where {
  ${values('np', nanopubIRIs)}
  graph npa:graph { ?np np:hasAssertion ?a . }
  graph ?a { ?s ?p ?o . }
}`;
}

function isQueryableIRI(iri) {
  return typeof iri === 'string' && /^https?:\/\/[^\s<>"{}|\\^`]+$/.test(iri);
}

// Same IRIs the activity code treats as this document
export function getDocumentIRIs(documentURL) {
  const iris = [documentURL, getPreferredTargetIRI(documentURL)];
  const graph = Config.Resource?.[documentURL]?.graph;
  if (graph) iris.push(...graph.out(ns.owl.sameAs).values);
  return [...new Set(iris.filter(isQueryableIRI))];
}

function queryEndpoints() {
  return NANOPUB_QUERY_URLS.map(url => new URL('repo/full', url).href);
}

export function termFromBinding(binding) {
  if (!binding) return null;
  switch (binding.type) {
    case 'uri':
      return rdf.namedNode(binding.value);
    case 'bnode':
      return rdf.blankNode(binding.value);
    case 'literal': case 'typed-literal':
      if (binding['xml:lang']) return rdf.literal(binding.value, binding['xml:lang']);
      return rdf.literal(binding.value, binding.datatype ? rdf.namedNode(binding.datatype) : undefined);
    default:
      return null;
  }
}

// Not NanopubClient.querySparql, which flattens terms to strings
async function select(query) {
  let error;
  for (const endpoint of queryEndpoints()) {
    try {
      const url = new URL(endpoint);
      url.searchParams.set('query', query);
      const response = await fetch(url.href, {
        headers: { Accept: 'application/sparql-results+json' },
        signal: AbortSignal.timeout(QUERY_TIMEOUT_MS)
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return (await response.json()).results.bindings;
    }
    catch (e) {
      error = new Error(`Nanopub query failed at ${endpoint}`, { cause: e });
    }
  }
  throw error;
}

export function groupNanopubs(listBindings, tripleBindings) {
  const nanopubs = new Map();

  listBindings.forEach(b => {
    const np = b.np.value;
    if (nanopubs.has(np)) {
      nanopubs.get(np).documents.add(b.doc.value);
      return;
    }
    nanopubs.set(np, {
      uri: np,
      pubkey: b.pubkey?.value,
      annotation: b.annotation.value,
      created: b.created?.value,
      documents: new Set([b.doc.value]),
      dataset: rdf.dataset()
    });
  });

  tripleBindings.forEach(b => {
    const entry = nanopubs.get(b.np.value);
    const [s, p, o] = [b.s, b.p, b.o].map(termFromBinding);
    if (entry && s && p && o) entry.dataset.add(rdf.quad(s, p, o));
  });

  return [...nanopubs.values()].filter(entry => entry.dataset.size);
}

export async function findDocumentNanopubs(documentIRIs) {
  if (!documentIRIs.length) return [];

  const list = await select(buildDocumentNanopubsQuery(documentIRIs));
  if (!list.length) return [];

  const nanopubIRIs = [...new Set(list.map(b => b.np.value))];
  const triples = await select(buildAssertionTriplesQuery(nanopubIRIs));

  return groupNanopubs(list, triples);
}

// Stored copies link their nanopub with as:url
function hasStoredCopy(annotationIRI) {
  const term = rdf.namedNode(annotationIRI);
  return Object.values(Config.Activity || {}).some(activity =>
    activity?.Graph?.dataset?.match(null, ns.as.url, term).size > 0);
}

function targetOptions(entry, documentURL) {
  if (entry.documents.has(documentURL)) return {};
  const graph = Config.Resource?.[documentURL]?.graph;
  const sameAs = graph ? graph.out(ns.owl.sameAs).values : [];
  return [...entry.documents].some(iri => sameAs.includes(iri))
    ? { targetInSameAs: true }
    : { targetInPreferredIRI: true };
}

export async function showNanopubAnnotations(documentURL) {
  documentURL = documentURL || Config.DocumentURL;

  let nanopubs;
  try {
    nanopubs = await findDocumentNanopubs(getDocumentIRIs(documentURL));
  }
  catch (e) {
    console.warn('dokieli: could not query the nanopub network', e);
    return [];
  }

  const shown = [];
  for (const entry of nanopubs) {
    if (Config.Activity[entry.uri] || Config.Activity[entry.annotation] || hasStoredCopy(entry.annotation)) continue;

    const g = rdf.grapoi({ dataset: entry.dataset });
    // Stops showActivities refetching it from an announcement
    Config.Activity[entry.uri] = Config.Activity[entry.annotation] = { Graph: g, Nanopub: entry };

    const nanopub = { uri: entry.uri, pubkey: entry.pubkey };
    try {
      await showAnnotation(entry.annotation, g, { ...targetOptions(entry, documentURL), nanopub });
      shown.push(entry.uri);
    }
    catch (e) {
      console.warn('dokieli: could not show nanopub annotation ' + entry.uri, e);
    }
  }
  return shown;
}

function queryOrigin() {
  return NANOPUB_QUERY_URLS[0];
}

export async function queryNanopubAnnotations(documentURL) {
  documentURL = documentURL || Config.DocumentURL;
  if (!isQueryableIRI(documentURL)) return [];
  if (!(await requestOriginConsent(queryOrigin(), { reason: 'nanopub-query' }))) return [];
  return showNanopubAnnotations(documentURL);
}

// Runs on load only with prior consent since the document URL is sent
export function initNanopubAnnotations(documentURL) {
  documentURL = documentURL || Config.DocumentURL;
  if (!isQueryableIRI(documentURL)) return;

  // The query services only index the main network
  if (Config.Nanopub?.UseTestRegistry) {
    console.log('dokieli: nanopub annotations on the test registry are not queryable');
  }

  if (getOriginDecision(queryOrigin()) === 'allow') {
    showNanopubAnnotations(documentURL);
  }
}
