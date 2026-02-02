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

import { JSDOM } from "jsdom";
import {
  createHTML,
  fragmentFromString,
  getClosestSectionNode,
  getDoctype,
  getDocumentContentNode,
  getDocumentNodeFromString,
  getNodeLanguage,
  getNodeWithoutClasses,
  getRDFaPrefixHTML,
  parseMarkdown,
  removeChildren,
  removeSelectorFromNode,
  selectArticleNode,
} from "../../../src/utils/html";

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

describe("getDocumentNodeFromString", () => {
  it("parses HTML string to document node", () => {
    const htmlContent = `<html><head><title>Test</title></head><body><p>asdf</p></body></html>`;
    const expected = `<html><head><title>Test</title></head><body><p>asdf</p></body></html>`;
    let result = getDocumentNodeFromString(htmlContent);
    result = result.documentElement.outerHTML;
    expect(result).toBe(expected);
  });
});

describe("getNodeWithoutClasses", () => {
  it("removes specified classes from node", () => {
    const node = dom.window.document.createElement("div");
    node.innerHTML =
      '<span class="remove-me">Text</span><span class="keep-me">Text</span>';
    const resultNode = getNodeWithoutClasses(node, "remove-me");
    expect(resultNode.querySelector(".remove-me")).toBeNull();
    expect(resultNode.querySelector(".keep-me")).not.toBeNull();
  });
});

describe("getDoctype", () => {
  it("should return correct DOCTYPE string", () => {
    document.implementation.createHTMLDocument();
    expect(getDoctype()).toBe("<!DOCTYPE html>");
  });
});

describe("getDocumentContentNode", () => {
  describe("getDocumentContentNode", () => {
    it("should return body for HTMLDocument", () => {
      const newDom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, {
        url: "https://example.com/",
      });
      global.window = newDom.window;
      global.document = newDom.window.document;
      global.Document = newDom.window.Document;
      global.HTMLElement = newDom.window.HTMLElement;
      expect(getDocumentContentNode(document)).toBe(document.body);
    });

    it("should return first child for DocumentFragment", () => {
      const document = dom.window.document;

      const fragment = new DocumentFragment();
      const divNode = document.createElement("div");
      fragment.appendChild(divNode);
      expect(getDocumentContentNode(fragment)).toBe(divNode);
    });
  });

  it("should return undefined for unknown document types", () => {
    const unknownNode = {};
    expect(getDocumentContentNode(unknownNode)).toBeUndefined();
  });
});

describe("getClosestSectionNode", () => {
  it(" returns the closest section node", () => {
    document.body.innerHTML = `
    <div>
      <article>
        <section id="section1">
          <div id="testNode"></div>
        </section>
      </article>
    </div>`;

    const node = document.getElementById("testNode");
    const result = getClosestSectionNode(node);

    expect(result.tagName.toLowerCase()).toBe("section");
  });
});

describe("removeSelectorFromNode", () => {
  it("removeSelectorFromNode removes the specified selector from node", () => {
    document.body.innerHTML = `
    <div>
      <p class="removeMe">Text1</p>
      <p>Text2</p>
    </div>`;

    const node = document.querySelector("div");
    const clone = removeSelectorFromNode(node, ".removeMe");

    expect(clone.querySelector(".removeMe")).toBeNull();
    expect(clone.querySelectorAll("p").length).toBe(1);
  });
});

describe("getNodeLanguage", () => {
  it("getNodeLanguage returns the correct language attribute", () => {
    document.body.innerHTML = `
    <div lang="en">
      <p lang="fr" id="testNode">Text</p>
    </div>`;

    const node = document.getElementById("testNode");
    const result = getNodeLanguage(node);

    expect(result).toBe("fr");
  });
});

describe("selectArticleNode", () => {
  it("should select the last matching article node", () => {
    const document = dom.window.document;
    const result = selectArticleNode(document.body);
    expect(result.nodeName).toBe("ARTICLE");
  });

  it("should return default content node when no article node is found", () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, {
      url: "https://example.com/",
    });
    const document = dom.window.document;

    global.window = dom.window;
    global.document = dom.window.document;
    global.Document = dom.window.Document;
    global.HTMLElement = dom.window.HTMLElement;

    const result = selectArticleNode(document.body);
    expect(result).toBe(document.body);
  });
});

describe("parseMarkdown", () => {
  it("should parse markdown into HTML without creating a document", () => {
    const markdown = "# Test Markdown";
    const result = parseMarkdown(markdown);

    expect(result).toContain("<h1>Test Markdown</h1>");
  });

  it("should parse markdown and create an article element when createDocument is true", () => {
    const markdown = "# Test Markdown";
    const options = { createDocument: true };
    const result = parseMarkdown(markdown, options);

    expect(result).toContain("<article>");
    expect(result).toContain("<h1>Test Markdown</h1>");
    expect(result).toContain("</article>");
  });

  it("should parse markdown with HTML correctly", () => {
    const markdown = "Some <b>bold</b> text";
    const result = parseMarkdown(markdown);

    expect(result).toContain("<b>bold</b>");
  });
});

describe("getRDFaPrefixHTML", () => {
  it("should return formatted prefix HTML", () => {
    const prefixes = {
      foaf: "http://xmlns.com/foaf/0.1/",
      rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    };
    const result = getRDFaPrefixHTML(prefixes);
    expect(result).toContain("foaf: http://xmlns.com/foaf/0.1/");
    expect(result).toContain(
      "rdf: http://www.w3.org/1999/02/22-rdf-syntax-ns#"
    );
  });

  it("should handle empty prefix object", () => {
    const result = getRDFaPrefixHTML({});
    expect(result).toBe("");
  });
});

describe("createHTML", () => {
  it("creates HTML string with given title and main content", () => {
    const title = "title";
    const main = "<p>content</p>";
    const result = createHTML(title, main);

    const normalizedResult = result.replace(/\s+/g, "").trim();
    const expectedTitle = "<title>title</title>";
    const expectedMain = "<main><p>content</p></main>";

    expect(normalizedResult).toContain(expectedTitle);
    expect(normalizedResult).toContain(expectedMain);
  });
});

describe("fragmentFromString", () => {
  it("creates a document fragment from a string", () => {
    const result = fragmentFromString(
      '<div id="wrapper"><span>test</span></div>'
    );
    expect(result).toMatchInlineSnapshot(`
    <DocumentFragment>
      <div
        id="wrapper"
      >
        <span>
          test
        </span>
      </div>
    </DocumentFragment>
    `);
  });
});

describe("removeChildren", () => {
  it("removes first child", () => {
    const node = `<div id='wrapper'><span>test</span></div>`;
    document.body.innerHTML = node;
    removeChildren(document.getElementById("wrapper"));
    expect(document.body.innerHTML.toString()).toMatchInlineSnapshot(
      `"<div id="wrapper"></div>"`
    );
  });
});

describe("getDocumentNodeFromString", () => {
  it("parses string to document node", () => {
    const resultNode = getDocumentNodeFromString(htmlContent);
    expect(resultNode.querySelector("title")).not.toBeNull();
  });
});