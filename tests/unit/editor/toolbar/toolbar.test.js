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

import { ToolbarView } from "src/editor/toolbar/toolbar.js";
import { JSDOM } from "jsdom";

const htmlContent = `
<!DOCTYPE html>
<html lang="en" xml:lang="en" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta charset="utf-8" />
    <title></title>
    <meta content="width=device-width, initial-scale=1" name="viewport" />
    <link href="https://dokie.li/media/css/basic.css" media="all" rel="stylesheet" title="Basic" />
    <link href="https://dokie.li/media/css/dokieli.css" media="all" rel="stylesheet" />
    <script src="https://dokie.li/scripts/dokieli.js"></script>
  </head>

  <body about="" prefix="rdf: http://www.w3.org/1999/02/22-rdf-syntax-ns# rdfs: http://www.w3.org/2000/01/rdf-schema# owl: http://www.w3.org/2002/07/owl# xsd: http://www.w3.org/2001/XMLSchema# rdfa: http://www.w3.org/ns/rdfa# dcterms: http://purl.org/dc/terms/ dctypes: http://purl.org/dc/dcmitype/ foaf: http://xmlns.com/foaf/0.1/ pimspace: http://www.w3.org/ns/pim/space# skos: http://www.w3.org/2004/02/skos/core# prov: http://www.w3.org/ns/prov# mem: http://mementoweb.org/ns# qb: http://purl.org/linked-data/cube# schema: http://schema.org/ void: http://rdfs.org/ns/void# rsa: http://www.w3.org/ns/auth/rsa# cert: http://www.w3.org/ns/auth/cert# wgs: http://www.w3.org/2003/01/geo/wgs84_pos# bibo: http://purl.org/ontology/bibo/ sioc: http://rdfs.org/sioc/ns# doap: http://usefulinc.com/ns/doap# dbr: http://dbpedia.org/resource/ dbp: http://dbpedia.org/property/ sio: http://semanticscience.org/resource/ opmw: http://www.opmw.org/ontology/ deo: http://purl.org/spar/deo/ doco: http://purl.org/spar/doco/ cito: http://purl.org/spar/cito/ fabio: http://purl.org/spar/fabio/ oa: http://www.w3.org/ns/oa# as: https://www.w3.org/ns/activitystreams# ldp: http://www.w3.org/ns/ldp# solid: http://www.w3.org/ns/solid/terms# acl: http://www.w3.org/ns/auth/acl# earl: http://www.w3.org/ns/earl# spec: http://www.w3.org/ns/spec# odrl: http://www.w3.org/ns/odrl/2/ dio: https://w3id.org/dio# rel: https://www.w3.org/ns/iana/link-relations/relation#" typeof="schema:CreativeWork prov:Entity">
    <main>
      <article about="" typeof="schema:Article">
        <p><code id="foo">&lt;script id="meta-json-ld" type="application/ld+json" title="JSON-LD"&gt;&lt;/script&gt;</code>.</p>
      </article>
    </main>
  </body>
</html>
`;

const dom = new JSDOM(htmlContent.trim(), { url: "https://example.com/" });

global.window = dom.window;
global.document = dom.window.document;

beforeAll(() => {
  const localStorageMock = (() => {
    let store = {};
    return {
      getItem(key) {
        return store[key] || null;
      },
      setItem(key, value) {
        store[key] = String(value);
      },
      removeItem(key) {
        delete store[key];
      },
      clear() {
        store = {};
      },
    };
  })();

  Object.defineProperty(global, 'localStorage', {
    value: localStorageMock,
  });
});

const createMockEditorView = () => ({
  state: {},
  dispatch: vi.fn(),
  focus: vi.fn(),
  dom: dom.window.document.createElement("div"),
});

describe("ToolbarView", () => {
  beforeEach(() => {
    global.document = dom.window.document;
    global.window = dom.window;

    document.body.innerHTML = "";
  });

  test("initializes with buttons and appends DOM", () => {
    const mockEditorView = createMockEditorView();
    const toolbar = new ToolbarView("social", ["quote"], mockEditorView);

    expect(toolbar.dom).toHaveProperty('nodeType', 1);
    expect(typeof toolbar.dom.tagName).toBe('string');
    expect(document.body.contains(toolbar.dom)).toBe(true);
    expect(toolbar.buttons).toHaveLength(1);
    expect(toolbar.buttons[0].button).toBe("quote");
  });
});
