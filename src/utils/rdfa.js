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

// Minimal RDFa term resolver. It expands CURIEs ("schema:name") to full IRIs
// using the document's known prefixes, so callers can identify nodes by RDF
// semantics rather than literal attribute strings (schema:name vs s:name vs the
// full IRI all collapse to one key). Tree-agnostic: it only deals with attribute
// values, leaving DOM/ProseMirror traversal to the caller.

import Config from '../config.js';

let prefixCache = null;

// Prefix -> namespace IRI, built from Config.ns (the same table RDFa parsing and
// serialization use). Cached; call resetPrefixes() if the table ever changes.
export function getPrefixes() {
  if (prefixCache) return prefixCache;
  const map = {};
  const ns = Config.ns || {};
  Object.keys(ns).forEach((prefix) => {
    try {
      const uri = ns[prefix]?.('')?.value;
      if (uri) map[prefix] = uri;
    } catch (e) { /* not a namespace fn */ }
  });
  prefixCache = map;
  return map;
}

export function resetPrefixes() {
  prefixCache = null;
}

const ABSOLUTE = /^[a-z][a-z0-9+.-]*:/i;

// Expand a single CURIE or term to a full IRI. Returns the input unchanged when
// it is already absolute or its prefix is unknown.
export function expandTerm(term, prefixes = getPrefixes()) {
  if (!term) return '';
  const t = term.trim();
  const colon = t.indexOf(':');
  if (colon > 0) {
    const prefix = t.slice(0, colon);
    if (Object.prototype.hasOwnProperty.call(prefixes, prefix)) {
      return prefixes[prefix] + t.slice(colon + 1);
    }
  }
  return t;
}

// Expand a whitespace-separated attribute value (typeof, rel, rev, property) to
// a Set of full IRIs.
export function expandTokens(value, prefixes = getPrefixes()) {
  const out = new Set();
  (value || '').split(/\s+/).forEach((token) => {
    if (token) out.add(expandTerm(token, prefixes));
  });
  return out;
}

// Collect the RDFa terms a subtree asserts, keyed by attribute, as Sets of full
// IRIs. `getAttr(node, name)` and `forEachNode(cb)` decouple this from the tree
// type (DOM element vs ProseMirror node).
export function collectTerms(forEachNode, getAttr, prefixes = getPrefixes()) {
  const terms = { typeof: new Set(), property: new Set(), rel: new Set(), rev: new Set() };
  forEachNode((node) => {
    Object.keys(terms).forEach((attr) => {
      const value = getAttr(node, attr);
      if (value) expandTokens(value, prefixes).forEach((iri) => terms[attr].add(iri));
    });
  });
  return terms;
}
