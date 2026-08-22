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
import uriTemplates from 'uri-templates';
import Config from './config.js';
import { getResource } from './fetcher.js';
import { getResourceGraph } from './graph.js';

/**
 * Lookup services bind an identifier column to a remote description of the
 * thing it identifies. CSVW stops at the table; this is the extension.
 *
 * url      RFC 6570 template; {id} is the identifier cell, other column names
 *          are available as variables.
 * format   'json' or 'rdf'. For 'rdf' the column's own propertyUrl selects the
 *          value, so columns need no per-column source.
 * record   For 'json', a template locating the record within the response.
 * columns  Suggested column set offered when the service is chosen.
 *
 * identifierClean / identifierPattern normalise whatever gets pasted into the
 * identifier cell -- a bare id, a full URL, a hyphenated ISBN -- down to the
 * form the template expects. Without this, pasting "https://orcid.org/0009-..."
 * into an ORCID column percent-encodes the whole URL into the {id} slot.
 */
export const LookupServices = {
  // openlibrary.org/isbn/{id}.rdf serves RDF, but 302s to /books/OL...M.rdf and
  // the redirect carries no CORS header, so a browser blocks the chain before
  // the RDF arrives. The JSON API answers directly with Access-Control-Allow-Origin.
  openlibrary: {
    label: 'Open Library (openlibrary.org)',
    identifier: 'ISBN',
    url: 'https://openlibrary.org/api/books?bibkeys=ISBN:{id}&format=json&jscmd=data',
    format: 'json',
    record: 'ISBN:{id}',
    accept: 'application/json',
    scan: 'isbn',
    identifierClean: /[^0-9Xx]/g,
    identifierPattern: /(?:97[89])?\d{9}[\dXx]/,
    identifierValid: isValidISBN,
    // An ISBN does not say what kind of material it names, so the generic type.
    tableSchema: {
      typeof: 'schema:CreativeWork',
      aboutUrl: 'urn:isbn:{isbn}'
    },
    columns: [
      { name: 'isbn', titles: 'ISBN', propertyUrl: 'schema:isbn', lang: '', identifier: true },
      { titles: 'Title', propertyUrl: 'schema:name', valueRel: 'schema:url', lookup: { source: 'title', urlSource: 'url' } },
      { titles: 'Author', propertyUrl: 'schema:author', lang: '', lookup: { source: 'authors.*.name' } },
      { titles: 'Publisher', propertyUrl: 'schema:publisher', lang: '', lookup: { source: 'publishers.*.name' } },
      { titles: 'Published', propertyUrl: 'schema:datePublished', time: true, lookup: { source: 'publish_date' } },
      { titles: 'Cover', propertyUrl: 'schema:image', image: true, lookup: { source: 'cover.medium' } }
    ]
  },

  specref: {
    label: 'Specref (specref.org)',
    identifier: 'Reference',
    url: 'https://api.specref.org/bibrefs?refs={id}',
    format: 'json',
    record: '{id}',
    accept: 'application/json',
    search: 'specref',
    tableSchema: { typeof: 'schema:CreativeWork' },
    columns: [
      // Typing a title here searches; picking a result fills Reference with its id.
      { titles: 'Title', propertyUrl: 'schema:name', identifier: true, lookup: { source: 'title' } },
      { titles: 'Reference', propertyUrl: 'schema:identifier', lang: '', lookup: { source: 'id' } },
      { titles: 'Authors', propertyUrl: 'schema:author', lang: '', lookup: { source: 'authors.*' } },
      { titles: 'Publisher', propertyUrl: 'schema:publisher', lang: '', lookup: { source: 'publisher' } },
      { titles: 'Status', propertyUrl: 'schema:creativeWorkStatus', lookup: { source: 'status' } },
      { titles: 'Date', propertyUrl: 'schema:datePublished', time: true, lookup: { source: 'date' } },
      { name: 'url', titles: 'URL', propertyUrl: 'schema:url', valueUrl: '{url}', lookup: { source: 'href' } }
    ]
  },

  doi: {
    label: 'DOI (doi.org)',
    identifier: 'DOI',
    // {+id} rather than {id}: a DOI contains "/", which simple expansion would
    // percent-encode into a URL doi.org does not resolve.
    url: 'https://doi.org/{+id}',
    format: 'rdf',
    subject: 'https://doi.org/{+id}',
    identifierPattern: /10\.\d{4,9}\/[^\s?#]+/,
    tableSchema: { typeof: 'schema:CreativeWork' },
    columns: [
      { titles: 'DOI', propertyUrl: 'bibo:doi', lang: '', identifier: true },
      { titles: 'Title', propertyUrl: 'schema:name' },
      { titles: 'Author', propertyUrl: 'schema:author', lang: '' },
      { titles: 'Published', propertyUrl: 'schema:datePublished', time: true }
    ]
  },

  wikidata: {
    label: 'Wikidata (wikidata.org)',
    identifier: 'Q-id',
    url: 'https://www.wikidata.org/wiki/Special:EntityData/{id}.ttl',
    format: 'rdf',
    subject: 'http://www.wikidata.org/entity/{id}',
    identifierPattern: /^[QP]\d+$/i,
    search: 'wikidata',
    columns: [
      // Typing a label here searches; picking a result resolves it to an entity.
      { titles: 'Label', propertyUrl: 'rdfs:label', identifier: true },
      { titles: 'Description', propertyUrl: 'schema:description' },
      // SUBJECT_SOURCE fills this with the entity the search resolved to.
      { titles: 'Entity', propertyUrl: 'owl:sameAs', lookup: { source: '@id' } }
    ]
  },

  // Requests the RDF endpoint directly rather than orcid.org/{id}: that URL
  // 302s twice, and a browser applies the CORS check to every response in a
  // redirect chain, not just the last one. Only the final 200 carries
  // Access-Control-Allow-Origin, so the redirect itself is what gets blocked.
  // The subject in the payload is still https://orcid.org/{id}.
  // ORCID's vocabulary here is rdfs/foaf, not schema.org.
  orcid: {
    label: 'ORCID (orcid.org)',
    identifier: 'ORCID',
    url: 'https://pub.orcid.org/experimental_rdf_v1/{id}',
    format: 'rdf',
    subject: 'https://orcid.org/{id}',
    accept: 'text/turtle',
    identifierPattern: /\d{4}-\d{4}-\d{4}-\d{3}[\dXx]/,
    tableSchema: { typeof: 'schema:Person' },
    columns: [
      { titles: 'ORCID', propertyUrl: 'schema:identifier', lang: '', identifier: true },
      { titles: 'Name', propertyUrl: 'rdfs:label', lang: '' },
      { titles: 'Given name', propertyUrl: 'foaf:givenName', lang: '' },
      { titles: 'Family name', propertyUrl: 'foaf:familyName', lang: '' }
    ]
  },

  custom: {
    label: 'Custom endpoint',
    identifier: 'Identifier',
    url: '',
    format: 'json',
    columns: []
  }
};

export function getLookupService(name) {
  return LookupServices[name] || null;
}

// Services whose identifiers can come off a barcode.
export function getScannableServices() {
  return Object.entries(LookupServices)
    .filter(([, service]) => service.scan)
    .map(([name]) => name);
}

function fill(template, values) {
  if (!template) return null;
  try {
    return uriTemplates(template).fill(values);
  } catch {
    return template;
  }
}

// URL.canParse accepts any scheme, so "urn:isbn:1", "mailto:a@b" and the CURIE
// "rdfs:label" all pass. Where the question is really "is this a link someone
// can follow", require http(s).
function isHttpUrl(value) {
  if (!URL.canParse(value)) return false;
  const protocol = new URL(value).protocol;
  return protocol === 'http:' || protocol === 'https:';
}

/**
 * Reduce a pasted identifier to the form the URL template expects.
 *
 * People paste whole URLs, hyphenated ISBNs, and "doi:" prefixes. Feeding any
 * of those to {id} percent-encodes them into a nonsense URL, so normalise
 * first: strip separators the service declares noise, then pull out the first
 * substring matching its identifier shape. With no declared shape, fall back
 * to the last path segment of a URL, or the value as typed.
 */
export function normalizeIdentifier(service, raw) {
  let value = String(raw ?? '').trim();
  if (!value) return '';

  if (service?.identifierClean) {
    value = value.replace(service.identifierClean, '');
  }

  const segment = lastPathSegment(value);

  if (service?.identifierPattern) {
    // The whole value first, so an unanchored pattern like a DOI's
    // "10.x/rest" wins over the URL's trailing segment; then the segment, so
    // an anchored pattern like ^Q\d+$ can still match inside a wiki URL.
    for (const candidate of [value, segment]) {
      const match = candidate?.match(service.identifierPattern);
      if (match) return match[0];
    }

    // No shape match: hand back the search term for a resolver to look up.
    return segment && !service.search ? segment : value;
  }

  return segment ?? value;
}

function lastPathSegment(value) {
  if (!isHttpUrl(value)) return null;
  const segments = new URL(value).pathname.split('/').filter(Boolean);
  return segments.length ? decodeURIComponent(segments[segments.length - 1]) : null;
}

/**
 * Turn a search term into an entity id, so an identifier column can be filled
 * by typing "Cat" instead of looking up Q146 by hand. Anything already in
 * identifier form is passed straight through.
 *
 * https://www.wikidata.org/w/api.php?action=help&modules=wbsearchentities
 */
async function resolveWikidataEntity(value, options = {}) {
  if (/^[QP]\d+$/i.test(value)) return value.toUpperCase();

  const results = await searchWikidataEntities(value, { ...options, limit: 1 });
  return results[0]?.id || null;
}

/**
 * Label search, so an identifier column can offer real choices instead of
 * silently taking the top hit for an ambiguous term like "Cat".
 * https://www.wikidata.org/w/api.php?action=help&modules=wbsearchentities
 */
export async function searchWikidataEntities(keyword, options = {}) {
  const term = String(keyword ?? '').trim();
  if (!term) return [];

  const language = (Config.User?.UI?.Language || 'en').split('-')[0];
  const limit = options.limit || 10;
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(term)}&language=${language}&uselang=${language}&type=item&limit=${limit}&format=json&origin=*`;

  try {
    const response = await getResource(url, { Accept: 'application/json' }, options);
    const data = await response.json();

    return (data?.search || []).map((r) => ({
      id: r.id,
      label: r.label || r.id,
      description: r.description || '',
      uri: r.concepturi || `http://www.wikidata.org/entity/${r.id}`
    }));
  } catch (e) {
    console.warn('Wikidata entity search failed:', e?.message || e);
    return [];
  }
}

const IDENTIFIER_RESOLVERS = {
  wikidata: resolveWikidataEntity
};

// https://github.com/tobie/specref#api
export async function searchSpecrefEntries(keyword, options = {}) {
  const term = String(keyword ?? '').trim();
  if (!term) return [];

  const url = `https://api.specref.org/search-refs?q=${encodeURIComponent(term)}`;

  try {
    const response = await getResource(url, { Accept: 'application/json' }, options);
    const data = await response.json();

    return Object.entries(data || {})
      .filter(([, ref]) => ref && typeof ref === 'object' && ref.title)
      .slice(0, options.limit || 10)
      .map(([id, ref]) => ({
        id,
        label: ref.title,
        description: [ref.publisher, ref.status, ref.date].filter(Boolean).join(', '),
        uri: ref.href || `https://api.specref.org/bibrefs?refs=${encodeURIComponent(id)}`
      }));
  } catch (e) {
    console.warn('Specref search failed:', e?.message || e);
    return [];
  }
}

const IDENTIFIER_SEARCHERS = {
  wikidata: searchWikidataEntities,
  specref: searchSpecrefEntries
};

// Does this table's service offer a pick-list for its identifier column?
export function getIdentifierSearch(lookup) {
  const service = getLookupService(lookup?.service);
  const name = lookup?.search || service?.search;
  return name ? IDENTIFIER_SEARCHERS[name] || null : null;
}

/**
 * True when the value is a search term rather than an identifier, for a
 * service that can search. Autofilling those silently picks the top hit for
 * something like "Cat", so the suggestion list should decide instead.
 */
export function needsIdentifierPick(lookup, value) {
  if (!getIdentifierSearch(lookup)) return false;

  const service = getLookupService(lookup?.service);
  if (!service?.identifierPattern) return false;

  return !service.identifierPattern.test(String(value ?? '').trim());
}

/**
 * Columns that could drive this service's lookups. A service's template names
 * the property its identifier carries -- an ISBN, a DOI -- and only a column
 * mapped to that property can answer for it. Services that name none, or a
 * table whose columns match none, place no restriction.
 */
export function identifierColumnCandidates(lookup, columns) {
  const service = getLookupService(lookup?.service);
  const template = service?.columns?.find((column) => column.identifier);
  if (!template?.propertyUrl) return columns;

  const matching = columns.filter((column) => column.propertyUrl === template.propertyUrl);
  return matching.length ? matching : columns;
}

/**
 * Could this value be an identifier for the service at all? A service that
 * declares a shape -- an ISBN, a DOI, a Q-id -- cannot answer to anything else,
 * so asking is a wasted request and an error the caller cannot act on.
 */
export function looksLikeIdentifier(lookup, value) {
  const service = getLookupService(lookup?.service);
  if (!service?.identifierPattern) return true;

  const id = normalizeIdentifier(service, value);
  if (!service.identifierPattern.test(id)) return false;

  // A shape can carry a check digit; a service that can verify it, does.
  return service.identifierValid ? service.identifierValid(id) : true;
}

// ISBN-10 (X-check allowed) and ISBN-13 check digits, per ISO 2108.
export function isValidISBN(value) {
  const id = String(value ?? '').replace(/[^0-9Xx]/g, '');

  if (/^\d{9}[\dXx]$/.test(id)) {
    const sum = [...id].reduce((total, c, i) => total + (c.toUpperCase() === 'X' ? 10 : +c) * (10 - i), 0);
    return sum % 11 === 0;
  }

  if (/^97[89]\d{10}$/.test(id)) {
    const sum = [...id].reduce((total, c, i) => total + +c * (i % 2 ? 3 : 1), 0);
    return sum % 10 === 0;
  }

  return false;
}

// Reserved source: the resource the lookup resolved to, rather than one of its
// properties. Lets a search-by-label column report which entity it matched.
export const SUBJECT_SOURCE = '@id';

/**
 * Read a value out of a JSON record.
 *
 * Supports dotted paths, numeric indices, and `*` to map across an array:
 *   title              -> "The Dispossessed"
 *   authors.*.name     -> "Ursula K. Le Guin, …"
 *   cover.medium
 */
export function extractJSONValues(record, path) {
  if (!record || !path) return [];

  const values = path
    .split('.')
    .reduce((acc, segment) => {
      if (!acc.length) return acc;

      if (segment === '*') {
        return acc.flatMap((v) => (Array.isArray(v) ? v : [v]));
      }

      return acc
        .map((v) => (v === null || v === undefined ? undefined : v[segment]))
        .filter((v) => v !== undefined && v !== null);
    }, [record])
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .filter((v) => v !== undefined && v !== null && typeof v !== 'object');

  return [...new Set(values.map(String))];
}

export function extractJSONValue(record, path) {
  const values = extractJSONValues(record, path);
  return values.length ? values.join(', ') : null;
}

// The prefix map has to be consulted before URL.canParse, which reports true
// for a CURIE -- "rdfs:label" is a valid URI whose scheme is "rdfs".
function expandTerm(term) {
  if (!term || typeof term !== 'string') return null;

  const [prefix, ...rest] = term.split(':');
  const name = rest.join(':');

  if (prefix && name && Config.ns[prefix]) return Config.ns[prefix](name).value;

  return URL.canParse(term) ? term : null;
}

/**
 * Read values for each column straight off the graph, using the column's own
 * propertyUrl as the selector. This is why RDF responses need no per-column
 * source configuration.
 *
 * `graph` is the grapoi pointer from getResourceGraph, which returns
 * { response, graph, error } -- not a bare dataset.
 */
export function extractRDFValues(graph, subject, columns) {
  if (!graph?.node) return {};

  const node = graph.node(rdf.namedNode(subject));
  const preferred = (Config.User?.UI?.Language || 'en').split('-')[0];
  const values = {};

  columns.forEach((column) => {
    const predicate = expandTerm(column.propertyUrl);
    if (!predicate) return;

    const terms = [...node.out(rdf.namedNode(predicate)).terms];
    if (!terms.length) return;

    const literals = terms.filter((t) => t.termType === 'Literal');
    const inLanguage = literals.filter((t) => t.language?.startsWith(preferred));
    const chosen = inLanguage.length ? inLanguage : literals.length ? literals : terms;

    const texts = [...new Set(chosen.map((t) => labelFor(graph, t, preferred)))];

    values[column.name] = {
      text: texts.join(', '),
      values: texts.length > 1 ? texts : undefined,
      valueUrl: chosen[0]?.termType === 'NamedNode' ? chosen[0].value : null
    };
  });

  return values;
}

// A named node is more useful with its label than as a bare IRI.
function labelFor(graph, term, preferred) {
  if (term.termType !== 'NamedNode') return term.value;

  const node = graph.node(term);
  const labels = ['http://www.w3.org/2000/01/rdf-schema#label', 'http://schema.org/name', 'http://xmlns.com/foaf/0.1/name']
    .flatMap((p) => [...node.out(rdf.namedNode(p)).terms])
    .filter((t) => t.termType === 'Literal');

  const inLanguage = labels.find((t) => t.language?.startsWith(preferred));
  return (inLanguage || labels[0])?.value || term.value;
}

/**
 * Run a lookup for one identifier.
 *
 * Returns { values: { <columnName>: { text, valueUrl } }, subject } or null.
 */
export async function lookupIdentifier(tableSchema, columns, identifier, options = {}) {
  const lookup = tableSchema?.lookup;
  if (!lookup?.url || !identifier) return null;

  const service = getLookupService(lookup.service);
  const format = lookup.format || service?.format || 'json';

  // options.resolvedId short-circuits the resolver when the caller already
  // knows the entity, e.g. the user picked it from the suggestion list.
  let id = options.resolvedId || normalizeIdentifier(service, identifier);
  if (!id) return null;

  if (!options.resolvedId) {
    // Some services accept a search term where an id is expected.
    const resolve = IDENTIFIER_RESOLVERS[lookup.service];
    if (resolve) {
      id = await resolve(id, options);
      if (!id) return null;
    }
  }

  const fillValues = { ...(options.fillValues || {}), id };

  const url = fill(lookup.url, fillValues);
  if (!url || !URL.canParse(url)) return null;

  const subjectTemplate = lookup.subject || service?.subject;
  const subject = subjectTemplate ? fill(subjectTemplate, fillValues) : null;

  if (format === 'rdf') {
    const accept = lookup.accept || service?.accept;
    const { graph, error } = await getResourceGraph(url, accept ? { Accept: accept } : null, options);
    if (error || !graph) return null;

    const values = extractRDFValues(graph, subject || url, columns);
    return { values: withSubjectValues(values, columns, subject || url), subject, id };
  }

  const accept = lookup.accept || service?.accept || 'application/json';
  const response = await getResource(url, { Accept: accept }, options);
  const data = await response.json();

  const recordPath = lookup.record || service?.record;
  const record = recordPath ? data[fill(recordPath, fillValues)] ?? resolveRecord(data, fill(recordPath, fillValues)) : data;
  if (!record) return null;

  const values = {};
  columns.forEach((column) => {
    const source = column.lookup?.source;
    if (!source || source === SUBJECT_SOURCE) return;

    const texts = extractJSONValues(record, source);
    if (!texts.length) return;

    const text = texts.join(', ');

    // urlSource names a result field holding the value's own page.
    const url = column.lookup.urlSource ? extractJSONValue(record, column.lookup.urlSource) : null;

    values[column.name] = {
      text,
      values: texts.length > 1 ? texts : undefined,
      valueUrl: isHttpUrl(url) ? url : isHttpUrl(text) ? text : null
    };
  });

  return { values: withSubjectValues(values, columns, subject), subject, id };
}

function withSubjectValues(values, columns, subject) {
  if (!subject) return values;

  columns.forEach((column) => {
    if (column.lookup?.source !== SUBJECT_SOURCE) return;
    values[column.name] = { text: subject, valueUrl: isHttpUrl(subject) ? subject : null };
  });

  return values;
}

// A record path may be a plain key with dots in it (`ISBN:978…`) or a real path.
function resolveRecord(data, path) {
  if (!path) return data;
  if (data && Object.prototype.hasOwnProperty.call(data, path)) return data[path];

  return path.split('.').reduce((acc, segment) => (acc ? acc[segment] : undefined), data);
}

/**
 * Suggest a JSON path for each column by matching column titles against the
 * keys of a sample record, so configuring a custom endpoint doesn't require
 * hand-writing every path.
 */
export function suggestSources(record, columns) {
  const paths = collectPaths(record);

  return columns.map((column) => {
    if (column.lookup?.source) return column;

    const title = String(column.titles || column.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!title) return column;

    const match = paths.find((p) => {
      const leaf = p.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '');
      return leaf === title;
    });

    return match ? { ...column, lookup: { ...column.lookup, source: match } } : column;
  });
}

function collectPaths(value, prefix = '', depth = 0) {
  if (depth > 3 || value === null || typeof value !== 'object') return [];

  if (Array.isArray(value)) {
    return value.length ? collectPaths(value[0], prefix ? `${prefix}.*` : '*', depth + 1) : [];
  }

  return Object.entries(value).flatMap(([key, v]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (v !== null && typeof v === 'object') return collectPaths(v, path, depth + 1);
    return [path];
  });
}
