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

import {
  getResourceGraph,
  getGraphDescription,
  getGraphTypes,
  getGraphTitle,
  getUserLabelOrIRI,
  serializeData
} from "../../src/graph";
import * as graphModule from "../../src/graph";
import { setupMockFetch, resetMockFetch, mockFetch } from "../utils/mockFetch";
import MockGrapoi from "../utils/mockGrapoi";
import Config from "../../src/config";
import { Session } from "@uvdsl/solid-oidc-client-browser";

const localhostUUID = 'http://localhost/d79351f4-cdb8-4228-b24f-3e9ac74a840d';

const ns = Config.ns;

vi.mock('stream', () => ({
  Readable: {
    from: vi.fn()
  }
}))

Config.DocumentURL = "http://example.org/doc";
Config.Resource = {
  "http://example.org/doc": {
    graph: new MockGrapoi([
      {
        subject: { value: "http://label1" },
        predicate: { value: "http://skosxl.literalForm" },
        object: { value: "XL Pref Label", language: "en" },
      },
    ]),
  },
};

describe("graph", () => {
  describe("getResourceGraph", () => {
    beforeEach(() => {
      vi.spyOn(global, "fetch").mockImplementation(mockFetch);
    });

    afterEach(() => {
      resetMockFetch();
    });

    test("should return undefined if graph cannot be returned", async () => {
      const iri = "http://example.com/nonexistent-resource";
      const headers = { Accept: "text/turtle" };
      const options = {};

      setupMockFetch({
        "http://example.com/nonexistent-resource": {
          ok: true,
          data: null,
        },
      });

      await expect(
        getResourceGraph(iri, headers, options)
      ).resolves.toBeUndefined();
    });

    test("should return a resource", async () => {
      const iri = "http://example.com/Person1";
      const headers = { Accept: "text/turtle" };
      const options = {};
      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {
          get: () => "text/turtle",
        },
        text: () => `@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .

<http://example.com/Person1> rdf:type <http://example.com/Person> ;
  foaf:name "John Doe" .
`,
      });

      const result = await getResourceGraph(iri, headers, options);

      expect(result.out().values).toHaveLength(2);

      expect(result.out().values).toEqual([
        "http://example.com/Person",
        "John Doe",
      ]);

      const johnDoeQuad = result.out(ns.foaf.name).values;
      expect(johnDoeQuad).toEqual(["John Doe"]);
    });
  });

  describe("getGraphDescription", () => {
    it("returns  schema:description", () => {
      const s = {
        out: vi.fn((predicate) => {
          return {
            value:
              predicate.value === ns.schema.description.value
                ? "A description"
                : undefined,
          };
        }),
      };
      const desc = getGraphDescription(s);
      expect(desc).toBe("A description");
    });

    it("returns undefined if no description", () => {
      const s = { out: vi.fn(() => ({ value: undefined })) };
      const desc = getGraphDescription(s);
      expect(desc).toBeUndefined();
    });
  });

  describe("getGraphTypes", () => {
    it("returns type values", () => {
      const s = {
        out: vi.fn(() => ({
          values: ["http://example.org/type1", "http://example.org/type2"],
        })),
      };
      const types = getGraphTypes(s);
      expect(types).toEqual([
        "http://example.org/type1",
        "http://example.org/type2",
      ]);
    });
  });

  describe("getGraphTitle", () => {
    const iri = { value: "http://example.org/concept1" };

    it("returns schema:name if present", () => {
      const g = new MockGrapoi([
        {
          subject: iri,
          predicate: ns.schema.name,
          object: { value: "Schema Title" },
        },
      ]);
      g.node(iri);
      expect(getGraphTitle(g)).toBe("Schema Title");
    });

    it("falls back to dcterms:title", () => {
      const g = new MockGrapoi([
        {
          subject: iri,
          predicate: ns.dcterms.title,
          object: { value: "DCTerms Title" },
        },
      ]);
      g.node(iri);
      expect(getGraphTitle(g)).toBe("DCTerms Title");
    });

    it("falls back to skos:prefLabel", () => {
      const g = new MockGrapoi([
        {
          subject: iri,
          predicate: ns.skos.prefLabel,
          object: { value: "SKOS Label" },
        },
      ]);
      g.node(iri);
      expect(getGraphTitle(g)).toBe("SKOS Label");
    });

    it("returns undefined if no relevant predicate is found", () => {
      const g = new MockGrapoi([]);
      g.node(iri);
      expect(getGraphTitle(g)).toBe(undefined);
    });
  });

  describe("getUserLabelOrIRI", () => {
    it("returns user name if IRI matches Config.User.IRI", () => {
      Config.User = {
        IRI: "https://me.example/profile/card#me",
        Name: "Alice",
      };
      expect(getUserLabelOrIRI("https://me.example/profile/card#me")).toBe(
        "Alice"
      );
    });

    it("returns user name if IRI matches one of Config.User.SameAs", () => {
      Config.User = {
        IRI: "https://me.example/profile/card#me",
        Name: "Alice",
        SameAs: ["https://alt.example/me"],
      };
      expect(getUserLabelOrIRI("https://alt.example/me")).toBe("Alice");
    });

    it("returns contact name if IRI matches a contact", () => {
      Config.User = {
        Contacts: {
          "https://bob.example": { Name: "Bob" },
        },
      };
      expect(getUserLabelOrIRI("https://bob.example")).toBe("Bob");
    });

    it("returns raw IRI if no match found", () => {
      Config.User = {
        IRI: "https://me.example/profile/card#me",
        Name: "Alice",
        SameAs: [],
        Contacts: {},
      };
      expect(getUserLabelOrIRI("https://unknown.example")).toBe(
        "https://unknown.example"
      );
    });
  });
  
  describe('serializeData', () => {
    it('resolves with original data if fromContentType === toContentType', async () => {
      const data = 'some data';
      const result = await serializeData(data, 'text/turtle', 'text/turtle');
      expect(result).toBe(data);
    });
  });

  describe('applyParserSerializerFixes', () => {
    it('removes localhostUUID and fixes Turtle content', () => {
      const input = `@prefix 0: <https://schema.org/> .
      someZ"@en; start> "123"@en; end> "456"@en; %2523 ${localhostUUID}`
  
      const output = graphModule.applyParserSerializerFixes(input, 'text/turtle')
  
      expect(output).not.toContain(localhostUUID)
      expect(output).not.toMatch(/^@prefix 0: .*$/m)
      expect(output).toContain('Z"^^<http://www.w3.org/2001/XMLSchema#dateTime>;')
      expect(output).toContain('start> "123"^^<http://www.w3.org/2001/XMLSchema#nonNegativeInteger>;')
      expect(output).toContain('end> "456"^^<http://www.w3.org/2001/XMLSchema#nonNegativeInteger>;')
      expect(output).not.toContain('%2523')
      expect(output).toContain('%23')
    })
  
    it('fixes application/ld+json content', () => {
      const inputArray = [
        {
          'https://www.w3.org/ns/activitystreams#published': { '@value': '2023-01-01T00:00:00Z' },
          'http://www.w3.org/ns/oa#start': { '@value': 5 }
        }
      ]
      const input = JSON.stringify(inputArray)
  
      const fixed = graphModule.applyParserSerializerFixes(input, 'application/ld+json')
      const parsed = JSON.parse(fixed)
  
      expect(parsed[0]['https://www.w3.org/ns/activitystreams#published']).toEqual({
        '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
        '@value': '2023-01-01T00:00:00Z'
      })
      expect(parsed[0]['http://www.w3.org/ns/oa#start']).toEqual({
        '@type': 'http://www.w3.org/2001/XMLSchema#nonNegativeInteger',
        '@value': 5
      })
    })
  })
  
  describe('skolem', () => {
    it('replaces blank nodes with skolem IRIs', () => {
      const input = '_:bnode1, _:bnode2 ; _:bnode3.'
      const expected = '<http://example.com/.well-known/genid/bnode1>, <http://example.com/.well-known/genid/bnode2> ; _:bnode3.'
  
      const output = graphModule.skolem(input)
  
      expect(output).toBe(expected)
    })
  })
  
});
