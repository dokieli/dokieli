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

import { vi } from 'vitest';
import rdf from 'rdf-ext';

vi.mock('src/activity.js', () => ({ showAnnotation: vi.fn(() => Promise.resolve()) }));

import Config from 'src/config.js';
import { showAnnotation } from 'src/activity.js';
import {
  buildDocumentNanopubsQuery,
  buildAssertionTriplesQuery,
  termFromBinding,
  groupNanopubs,
  findDocumentNanopubs,
  showNanopubAnnotations
} from 'src/nanopub-query.js';

const NP = 'https://w3id.org/np/RABVZkX_FbsyPbIyBG4E3YU3EG0i1KAsG1HsM-lmXpn30';
const ANNOTATION = NP + '/annotation';
const DOC = 'https://example.org/article';

const uri = value => ({ type: 'uri', value });
const literal = (value, extra = {}) => ({ type: 'literal', value, ...extra });

const listBindings = [
  { np: uri(NP), pubkey: literal('MIIB'), annotation: uri(ANNOTATION), doc: uri(DOC), created: literal('2026-09-23T07:02:58.806Z') }
];

const tripleBindings = [
  { np: uri(NP), s: uri(ANNOTATION), p: uri('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), o: uri('http://www.w3.org/ns/oa#Annotation') },
  { np: uri(NP), s: uri(ANNOTATION), p: uri('http://www.w3.org/ns/oa#hasTarget'), o: uri(DOC + '#summary') },
  { np: uri(NP), s: uri(DOC + '#summary'), p: uri('http://www.w3.org/ns/oa#hasSource'), o: uri(DOC) },
  { np: uri(NP), s: uri(NP + '/body'), p: uri('http://www.w3.org/1999/02/22-rdf-syntax-ns#value'), o: literal('<p>Hi</p>', { datatype: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#HTML' }) },
  { np: uri('https://w3id.org/np/RAother'), s: uri('https://example.org/x'), p: uri('https://example.org/p'), o: uri('https://example.org/o') }
];

function sparqlResponse(bindings) {
  return { ok: true, json: () => Promise.resolve({ results: { bindings } }) };
}

describe('nanopub query building', () => {
  test('matches the document as target or as source of the target', () => {
    const query = buildDocumentNanopubsQuery([DOC, DOC + '/cite-as']);
    expect(query).toContain(`values ?doc { <${DOC}> <${DOC}/cite-as> }`);
    expect(query).toContain('?annotation oa:hasTarget ?doc .');
    expect(query).toContain('?target oa:hasSource ?doc .');
  });

  test('leaves out nanopubs invalidated with the same key', () => {
    expect(buildDocumentNanopubsQuery([DOC])).toMatch(/filter not exists \{ \?npx npx:invalidates \?np ; npa:hasValidSignatureForPublicKey \?pubkey \. \}/);
  });

  test('asks for the assertion triples of the given nanopubs', () => {
    const query = buildAssertionTriplesQuery([NP]);
    expect(query).toContain(`values ?np { <${NP}> }`);
    expect(query).toContain('graph ?a { ?s ?p ?o . }');
  });
});

describe('termFromBinding', () => {
  test('keeps datatypes and languages', () => {
    const html = termFromBinding(literal('<p>Hi</p>', { datatype: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#HTML' }));
    expect(html.datatype.value).toBe('http://www.w3.org/1999/02/22-rdf-syntax-ns#HTML');
    expect(termFromBinding(literal('hola', { 'xml:lang': 'es' })).language).toBe('es');
    expect(termFromBinding({ type: 'bnode', value: 'b0' }).termType).toBe('BlankNode');
    expect(termFromBinding(uri(DOC)).termType).toBe('NamedNode');
  });
});

describe('groupNanopubs', () => {
  test('builds one graph per listed nanopub and ignores triples of unlisted ones', () => {
    const [entry, ...rest] = groupNanopubs(listBindings, tripleBindings);
    expect(rest).toHaveLength(0);
    expect(entry.uri).toBe(NP);
    expect(entry.annotation).toBe(ANNOTATION);
    expect(entry.pubkey).toBe('MIIB');
    expect(entry.dataset.size).toBe(4);
    expect(entry.documents.has(DOC)).toBe(true);
  });
});

describe('findDocumentNanopubs', () => {
  afterEach(() => vi.unstubAllGlobals());

  test('lists the nanopubs, then fetches their assertions', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sparqlResponse(listBindings))
      .mockResolvedValueOnce(sparqlResponse(tripleBindings));
    vi.stubGlobal('fetch', fetchMock);

    const result = await findDocumentNanopubs([DOC]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
    expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get('query')).toContain(`<${NP}>`);
  });

  test('skips the second query when nothing refers to the document', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sparqlResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    expect(await findDocumentNanopubs([DOC])).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('falls back to the next query service', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Service Unavailable' })
      .mockResolvedValueOnce(sparqlResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    expect(await findDocumentNanopubs([DOC])).toEqual([]);
    expect(new URL(fetchMock.mock.calls[0][0]).origin).not.toBe(new URL(fetchMock.mock.calls[1][0]).origin);
  });
});

describe('showNanopubAnnotations', () => {
  beforeEach(() => {
    showAnnotation.mockClear();
    Config.Activity = {};
    Config.Resource = { [DOC]: {} };
  });
  afterEach(() => vi.unstubAllGlobals());

  function stubNetwork() {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(sparqlResponse(listBindings))
      .mockResolvedValueOnce(sparqlResponse(tripleBindings)));
  }

  test('shows each annotation with its nanopub', async () => {
    stubNetwork();
    await showNanopubAnnotations(DOC);

    expect(showAnnotation).toHaveBeenCalledTimes(1);
    const [iri, , options] = showAnnotation.mock.calls[0];
    expect(iri).toBe(ANNOTATION);
    expect(options.nanopub).toEqual({ uri: NP, pubkey: 'MIIB' });
    expect(Config.Activity[NP]).toBeDefined();
  });

  test('skips an annotation whose stored copy links the nanopub', async () => {
    const stored = rdf.dataset([rdf.quad(
      rdf.namedNode('https://storage.example/activity'),
      rdf.namedNode('https://www.w3.org/ns/activitystreams#url'),
      rdf.namedNode(ANNOTATION)
    )]);
    Config.Activity['https://storage.example/activity'] = { Graph: rdf.grapoi({ dataset: stored }) };

    stubNetwork();
    await showNanopubAnnotations(DOC);
    expect(showAnnotation).not.toHaveBeenCalled();
  });

  test('passes the preferred target when the match was not the document URL', async () => {
    const citeAs = 'https://doi.example/10.1/abc';
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(sparqlResponse([{ ...listBindings[0], doc: uri(citeAs) }]))
      .mockResolvedValueOnce(sparqlResponse(tripleBindings)));

    await showNanopubAnnotations(DOC);
    expect(showAnnotation.mock.calls[0][2].targetInPreferredIRI).toBe(true);
  });

  test('does not throw when the network is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(showNanopubAnnotations(DOC)).resolves.toEqual([]);
  });
});
