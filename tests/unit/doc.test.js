import { JSDOM } from "jsdom";
import {
  domToString,
  normaliseContent,
  escapeCharacters,
  cleanEscapeCharacters,
  fixBrokenHTML,
  getNodeWithoutClasses,
  getDocument,
  getDocumentNodeFromString,
  createHTML,
  createFeedXML,
  dumpNode,
  getDoctype,
  getDocumentContentNode,
  createActivityHTML,
  getClosestSectionNode,
  removeSelectorFromNode,
  getNodeLanguage,
  addMessageToLog,
  selectArticleNode,
  insertDocumentLevelHTML,
  setDate,
  createDateHTML,
  getRDFaPrefixHTML,
  getDocumentStatusHTML,
  getGraphData,
  parseMarkdown,
  serializeTableToText,
  createLanguageHTML,
  createInboxHTML,
  createTestSuiteHTML,
  createResourceTypeHTML,
  createPublicationStatusHTML,
  createInReplyToHTML,
  createRDFaHTML,
  createRDFaMarkObject,
  getReferenceLabel,
} from "../../src/doc";
import Config from "../../src/config";
import MockGrapoi from "../utils/mockGrapoi";
import { domSanitize, generateAttributeId } from "../../src/util";
import rdf from 'rdf-ext';

vi.mock(import("../../src/util"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    generateAttributeId: vi.fn().mockReturnValue("generated-id"),
  };
});

const ns = Config.ns;

Config.PublicationStatus = {
  "http://example.org/status/published": { name: "Published" },
  "http://example.org/status/draft": { name: "Draft" },
};

Config.ResourceType = {
  "http://example.org/type/article": { name: "Article" },
};

Config.MotivationSign = {
  "oa:commenting": "Commenting",
  "oa:liking": "Liking",
};

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
function normalizeHTML(html) {
  return new JSDOM(html).serialize().replace(/\s+/g, " ").trim();
}
const dom = new JSDOM(htmlContent.trim(), { url: "https://example.com/" });

global.window = dom.window;
global.document = dom.window.document;

beforeAll(() => {
  global.Config = {
    ArticleNodeSelectors: ["article", "section"],
    DocumentItems: ["doc-item"],
  };
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

  Object.defineProperty(global, "localStorage", {
    value: localStorageMock,
  });
});

describe("domToString", () => {
  it("serializes a clean DOM", () => {
    const htmlContent = `<head><title>Test</title></head><body><p>asdf</p></body>`;

    const node = window.document.createElement("html");
    node.innerHTML = htmlContent;

    const result = domToString(node);

    const expected =
      `<html>
${htmlContent}
</html>`

    expect(result).toBe(expected);
  });
});

describe("getDocumentNodeFromString", () => {
  it("parses HTML string to document node", () => {
    const htmlContent = `<html><head><title>Test</title></head><body><p>asdf</p></body></html>`;
    const expected = `<html>
<head><title>Test</title></head><body><p>asdf</p></body>
</html>`;
    let result = getDocumentNodeFromString(htmlContent);
    result = domToString(result.documentElement);

    expect(result).toBe(expected);
  })
})

describe('normaliseContent', () => {
  it.only('normalizes content after potential prosemirror schema changes', () => {
    const htmlContent = `<html><head><title>Test</title></head><body><li><p>asdf</p></li></body></html>`;
    const dom = new JSDOM(htmlContent);
    const node = dom.window.document.documentElement.cloneNode(true);
    const expected = `<html><head><title>Test</title></head><body><li>asdf</li></body></html>`;
    const result = normaliseContent(node)
    expect(result).not.toBeUndefined();
    const div = dom.window.document.createElement("div");
    div.appendChild(result);
    expect(div.firstChild.outerHTML).toBe(expected);
  });
})

describe("escapeCharacters", () => {
  it("escapes special characters correctly", () => {
    const input = "<div>&\"'</div>";
    const expectedOutput = "&lt;div&gt;&amp;&quot;&apos;&lt;/div&gt;";
    expect(escapeCharacters(input)).toBe(expectedOutput);
  });
});

describe("cleanEscapeCharacters", () => {
  it("cleans double escaped characters correctly", () => {
    const input = "&amp;lt;&amp;gt;&amp;apos;&amp;quot;&amp;amp;";
    const expectedOutput = "&lt;&gt;&apos;&quot;&amp;";
    expect(cleanEscapeCharacters(input)).toBe(expectedOutput);
  });
});

describe("fixBrokenHTML", () => {
  it("fixes img", () => {
    const input = '<img src="image.jpg"></img>';
    const expectedOutput = '<img src="image.jpg"/>';
    expect(fixBrokenHTML(input)).toBe(expectedOutput);
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

describe("getDocument", () => {
  it("returns document as string", () => {
    const result = getDocument(dom.window.document.documentElement);
    expect(result).toContain("<!DOCTYPE html>");
    expect(result).toContain(
      '<html lang="en" xml:lang="en" xmlns="http://www.w3.org/1999/xhtml">'
    );
  });
});

describe("getDocumentNodeFromString", () => {
  it("parses string to document node", () => {
    const resultNode = getDocumentNodeFromString(htmlContent);
    expect(resultNode.querySelector("title")).not.toBeNull();
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

describe("createFeedXML", () => {
  const feed = {
    language: "en",
    title: "Test Feed",
    self: "https://example.com/feed",
    origin: "https://example.com",
    description: "Test feed description",
    author: {
      uri: "https://example.com/author",
      name: "Author Name",
    },
    items: {
      "https://example.com/item1": {
        title: "Item 1",
        description: "Description of item 1",
        published: "2024-10-17T10:00:00Z",
        updated: "2024-10-17T11:00:00Z",
        author: [
          {
            uri: "https://example.com/author",
            name: "Author Name",
            email: "author@example.com",
          },
        ],
      },
      "https://example.com/item2": {
        title: "Item 2",
        description: "Description of item 2",
        updated: "2024-10-16T10:00:00Z",
      },
    },
  };

  it("creates Atom XML feed", () => {
    const result = createFeedXML(feed, { contentType: "application/atom+xml" });
    const year = new Date().getFullYear();

    expect(result).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    expect(result).toContain("<title>Test Feed</title>");
    expect(result).toContain(
      '<link href="https://example.com/feed" rel="self" />'
    );
    expect(result).toContain(
      `<rights>Copyright ${year} Author Name . Rights and license are feed only.</rights>`
    );
    expect(result).toContain(
      '<generator uri="https://dokie.li/">dokieli</generator>'
    );

    expect(result).toContain("<entry>");
    expect(result).toContain("<id>https://example.com/item1</id>");
    expect(result).toContain("<title>Item 1</title>");
    expect(result).toContain("<published>2024-10-17T10:00:00Z</published>");
    expect(result).toContain("<updated>2024-10-17T11:00:00Z</updated>");
    expect(result).toContain("<author>");
    expect(result).toContain("<name>Author Name</name>");
    expect(result).toContain("<email>author@example.com</email>");
    expect(result).toContain("</entry>");

    expect(result).toContain("<entry>");
    expect(result).toContain("<id>https://example.com/item2</id>");
    expect(result).toContain("<title>Item 2</title>");
    expect(result).toContain("<updated>2024-10-16T10:00:00Z</updated>");
    expect(result).toContain("</entry>");
  });

  it("creates RSS XML feed", () => {
    const result = createFeedXML(feed, { contentType: "application/rss+xml" });
    const year = new Date().getFullYear();

    expect(result).toContain('<?xml version="1.0" encoding="utf-8"?>');
    expect(result).toContain(
      '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">'
    );
    expect(result).toContain("<channel>");
    expect(result).toContain("<title>Test Feed</title>");
    expect(result).toContain("<link>https://example.com</link>");
    expect(result).toContain(
      "<description>Test feed description</description>"
    );
    expect(result).toContain(
      `<copyright>Copyright ${year} Author Name . Rights and license are feed only.</copyright>`
    );
    expect(result).toContain("<generator>https://dokie.li/</generator>");

    expect(result).toContain("<item>");
    expect(result).toContain("<guid>https://example.com/item1</guid>");
    expect(result).toContain("<title>Item 1</title>");
    expect(result).toContain(
      "<pubDate>Thu, 17 Oct 2024 11:00:00 GMT</pubDate>"
    );
    expect(result).toContain(
      "<description>Description of item 1</description>"
    );
    expect(result).toContain(
      "<author>author@example.com (Author Name)</author>"
    );
    expect(result).toContain("</item>");

    expect(result).toContain("<item>");
    expect(result).toContain("<guid>https://example.com/item2</guid>");
    expect(result).toContain("<title>Item 2</title>");
    expect(result).toContain(
      "<pubDate>Wed, 16 Oct 2024 10:00:00 GMT</pubDate>"
    );
    expect(result).toContain(
      "<description>Description of item 2</description>"
    );
    expect(result).toContain("</item>");
  });
});

describe("dumpNode", () => {
  let options, skipAttributes, voidElements, noEsc;

  beforeEach(() => {
    options = {
      skipNodeWithId: [],
      classWithChildText: {
        class: "child-class",
        element: "span",
      },
      skipNodeWithClass: "",
      replaceClassItemWith: {
        source: ["old-class"],
        target: "new-class",
      },
      sortAttributes: true,
      skipEscapingDataBlockTypes: [],
    };
    skipAttributes = [];
    voidElements = [
      "area",
      "base",
      "br",
      "col",
      "embed",
      "hr",
      "img",
      "input",
      "keygen",
      "link",
      "meta",
      "param",
      "source",
      "track",
      "wbr",
    ];
    noEsc = [];
  });

  it("should return empty string for non-nodes", () => {
    const s = "Sample non-node";
    expect(dumpNode(s, options, skipAttributes, voidElements, noEsc)).toBe("");
  });

  it("should handle element nodes correctly", () => {
    const divNode = document.createElement("div");
    divNode.setAttribute("id", "test");
    divNode.setAttribute("class", "test-class");

    const spanNode = document.createElement("span");
    spanNode.textContent = "Hello";
    divNode.appendChild(spanNode);

    const result = dumpNode(
      divNode,
      options,
      skipAttributes,
      voidElements,
      noEsc
    );
    expect(result).toBe(
      '<div class="test-class" id="test"><span>Hello</span></div>'
    );
  });

  it("should skip nodes with specific IDs", () => {
    options.skipNodeWithId.push("test");
    const divNode = document.createElement("div");
    divNode.setAttribute("id", "test");

    const result = dumpNode(
      divNode,
      options,
      skipAttributes,
      voidElements,
      noEsc
    );
    expect(result).toBe("");
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
describe("createActivityHTML", () => {
  it("createActivityHTML returns correct HTML structure", () => {
    const o = {
      type: ["as:Create", "schema:Person"],
      object: "https://example.com/object",
      objectTypes: ["as:Note"],
      objectLicense: "https://example.com/license",
      inReplyTo: "https://example.com/replyTo",
      context: "https://example.com/context",
      target: "https://example.com/target",
      summary: "This is a summary",
      content: "This is content",
      to: "https://example.com/to",
    };

    const result = createActivityHTML(o);

    expect(result).toContain("<h1>Notification: Created</h1>");
    expect(result).toContain('typeof="as:Create"');
    expect(result).toContain('property="as:object"');
    expect(result).toContain('property="as:summary"');
    expect(result).toContain('property="as:inReplyTo"');
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

describe("addMessageToLog", () => {
  it("addMessageToLog adds a message with dateTime to Config.MessageLog", () => {
    const Config = { MessageLog: [] };

    const message = { content: "New message" };
    addMessageToLog(message, Config.MessageLog);

    expect(Config.MessageLog.length).toBe(1);
    expect(Config.MessageLog[0]).toHaveProperty("dateTime");
    expect(Config.MessageLog[0].content).toBe("New message");
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

describe("insertDocumentLevelHTML", () => {
  document = dom.window.document;
  dom.window.Config = {
    DocumentItems: ["doc-item"],
  };
  const rootNode = document.body;

  it("should insert HTML after the identified document node", () => {
    insertDocumentLevelHTML(rootNode, "<p>New Content</p>", { id: "doc-item" });
    expect(rootNode.innerHTML).toContain("<p>New Content</p>");
  });

  it("should insert HTML at the beginning when no matching document item is found", () => {
    insertDocumentLevelHTML(rootNode, "<p>New Content</p>", {
      id: "non-existent",
    });
    expect(rootNode.innerHTML).toContain("<p>New Content</p>");
  });
});

describe("setDate", () => {
  it("should update an existing time element with the correct datetime", () => {
    const d = new JSDOM(`
      <div id="rootNode">
        <div id="document-created">
          <time datetime="2023-01-01"></time>
        </div>
      </div>
    `);
    const rootNode = d.window.document.getElementById("rootNode");

    setDate(rootNode, {
      datetime: new Date("2024-10-15T00:00:00Z"),
      id: "document-created",
    });

    const timeNode = rootNode.querySelector("time");
    expect(timeNode.getAttribute("datetime")).toBe("2024-10-15T00:00:00.000Z");
    expect(timeNode.textContent).toBe("2024-10-15");
  });

  it("should insert new time HTML if no existing time element is found", () => {
    const d = new JSDOM(
      `<div id="rootNode"><div id="document-created"></div></div>`
    );
    const rootNode = d.window.document.getElementById("rootNode");

    setDate(rootNode, {
      datetime: new Date("2024-10-15T00:00:00Z"),
      id: "document-created",
    });

    expect(rootNode.innerHTML).toContain(
      '<time datetime="2024-10-15T00:00:00.000Z">2024-10-15</time>'
    );
  });
});

describe("createDateHTML", () => {
  it("should create HTML with default values when no options are provided", () => {
    const result = createDateHTML();
    expect(result).toContain('id="document-created"');
    expect(result).toContain('<time datetime="');
    expect(result).toContain("<dt>Created</dt>");
  });

  it("should create HTML with provided options", () => {
    const options = {
      title: "Test Title",
      id: "custom-id",
      class: "test-class",
      datetime: new Date("2024-10-15T00:00:00Z"),
      property: "schema:dateCreated",
    };
    const result = createDateHTML(options);
    expect(result).toContain('id="custom-id"');
    expect(result).toContain('class="test-class"');
    expect(result).toContain('datetime="2024-10-15T00:00:00.000Z"');
    expect(result).toContain("<dt>Test Title</dt>");
  });

  it("should create time element without property if not provided", () => {
    const options = {
      datetime: new Date("2024-10-15T00:00:00Z"),
    };
    const result = createDateHTML(options);
    expect(result).toContain(
      '<time datetime="2024-10-15T00:00:00.000Z">2024-10-15</time>'
    );
  });

  it("should create time element with property if provided", () => {
    const options = {
      property: "schema:dateCreated",
      datetime: new Date("2024-10-15T00:00:00Z"),
    };
    const result = createDateHTML(options);
    expect(result).toContain(
      '<time content="2024-10-15T00:00:00.000Z" datatype="xsd:dateTime" datetime="2024-10-15T00:00:00.000Z" property="schema:dateCreated">2024-10-15</time>'
    );
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

describe("getDocumentStatusHTML", () => {
  const rootNode = document.createElement("div");
  document.body.appendChild(rootNode);
  it("should generate correct HTML for create mode", () => {
    const options = { mode: "create" };
    const resultHTML = getDocumentStatusHTML(rootNode, options);

    expect(resultHTML).toContain(
      '<dl id="document-status"><dt>Document Status</dt><dd><span></span></dd></dl>'
    );
  });

  it("should generate correct HTML for update mode", () => {
    const createOptions = {
      mode: "create",
      id: "document-status",
    };
    getDocumentStatusHTML(rootNode, createOptions);

    const updateOptions = {
      mode: "update",
      id: "document-status",
    };
    const resultHTML = getDocumentStatusHTML(rootNode, updateOptions);

    expect(resultHTML).toContain(
      '<dl id="document-status"><dt>Document Status</dt><dd><span></span></dd></dl>'
    );
  });

  it("should generate correct HTML for delete mode", () => {
    const createOptions = {
      mode: "create",
      id: "document-status",
    };
    getDocumentStatusHTML(rootNode, createOptions);

    const deleteOptions = {
      mode: "delete",
      id: "document-status",
    };
    const resultHTML = getDocumentStatusHTML(rootNode, deleteOptions);

    expect(resultHTML).toBe("");
  });

  it("should handle default options correctly", () => {
    const options = {};
    const resultHTML = getDocumentStatusHTML(rootNode, options);

    expect(resultHTML).toContain(
      '<dl id="document-status"><dt>Document Status</dt><dd><span></span></dd></dl>'
    );
  });
});

describe("getGraphData", () => {
  const Config = {
    Vocab: {
      ldpRDFSource: { "@id": "http://www.w3.org/ns/ldp#RDFSource" },
      memMemento: { "@id": "http://example.com/memMemento" },
      memOriginalResource: { "@id": "http://example.com/memOriginalResource" },
    },
    DocumentURL: "http://example.com/document",
    Resource: {},
  };

  it("should return correct graph data information", () => {
    const data = [
      {
        subject: "http://example.com/document",
        predicate: ns.rdf.type.value,
        object: "http://www.w3.org/ns/ldp#RDFSource",
      },
    ];

    const s = new MockGrapoi(data);

    const options = { subjectURI: "http://example.com/document" };

    const result = getGraphData(s, options);

    expect(result).toHaveProperty("graph", s);
  });
});

describe("serializeTableToText", () => {
  it("should serialize table with thead and tbody into text format", () => {
    document.body.innerHTML = `
      <table>
        <thead>
          <tr><th>Header 1</th><th>Header 2</th></tr>
        </thead>
        <tbody>
          <tr><td>Data 1</td><td>Data 2</td></tr>
          <tr><td>Data 3</td><td>Data 4</td></tr>
        </tbody>
      </table>
    `;

    const table = document.querySelector("table");

    const result = serializeTableToText(table);

    expect(result).toContain("Header 1");
    expect(result).toContain("Data 1");
    expect(result).toContain("Data 3");
    expect(result).toContain("Data 4");
  });

  it("should handle multiple tbodies correctly", () => {
    document.body.innerHTML = `
      <table>
        <thead>
          <tr><th>Header 1</th><th>Header 2</th></tr>
        </thead>
        <tbody>
          <tr><td>Data 1</td><td>Data 2</td></tr>
        </tbody>
        <tbody>
          <tr><td>Data 3</td><td>Data 4</td></tr>
        </tbody>
      </table>
    `;

    const table = document.querySelector("table");

    const result = serializeTableToText(table);

    expect(result).toContain("Data 1");
    expect(result).toContain("Data 3");
    expect(result).toContain("Data 4");
    expect(result.split("\n").length).toBeGreaterThan(1);
  });

  it("should return an empty string for tables without tbody", () => {
    document.body.innerHTML = `
      <table>
        <thead>
          <tr><th>Header 1</th><th>Header 2</th></tr>
        </thead>
      </table>
    `;

    const table = document.querySelector("table");

    const result = serializeTableToText(table);

    expect(result).toContain("Header 1");
    expect(result).not.toContain("Data");
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

describe("createLanguageHTML", () => {
  it("returns correct HTML for known language", () => {
    const html = createLanguageHTML("en");
    expect(normalizeHTML(html)).toContain("English");
    expect(html).toContain("dcterms:language");
  });

  it("returns empty string for missing language", () => {
    expect(createLanguageHTML()).toBe("");
  });
});

describe("createInboxHTML", () => {
  it("creates inbox HTML with correct rel", () => {
    const html = createInboxHTML("https://example.org/inbox");
    expect(html).toContain("ldp:inbox");
    expect(html).toContain("https://example.org/inbox");
  });
});
describe("createInReplyToHTML", () => {
  it("creates correct in-reply-to HTML", () => {
    const html = createInReplyToHTML("https://example.org/comment/1");
    expect(html).toContain("as:inReplyTo");
  });
});

describe("createPublicationStatusHTML", () => {
  it("renders status with known label", () => {
    const html = createPublicationStatusHTML(
      "http://example.org/status/published"
    );
    expect(html).toContain("Published");
    expect(html).toContain("pso:withStatus");
  });
});

describe("createResourceTypeHTML", () => {
  it("renders resource type", () => {
    const html = createResourceTypeHTML("http://example.org/type/article");
    expect(html).toContain("Article");
    expect(html).toContain("rdf:type");
  });
});

describe("createTestSuiteHTML", () => {
  it("renders test suite HTML", () => {
    const html = createTestSuiteHTML("https://example.org/tests");
    expect(html).toContain("spec:testSuite");
  });
});

describe("getReferenceLabel", () => {
  it("returns # if motivatedBy is empty or unknown", () => {
    expect(getReferenceLabel("")).toBe("#");
    expect(getReferenceLabel(null)).toBe("#");
    expect(getReferenceLabel("unknown")).toBe("#");
  });

  it("returns prefix label if motivatedBy is full URI with # fragment", () => {
    expect(getReferenceLabel("http://example.org/oa#commenting")).toBe(
      "Commenting"
    );
    expect(getReferenceLabel("http://example.org/oa#liking")).toBe("Liking");
  });

  it("returns label directly if motivatedBy is known prefix", () => {
    expect(getReferenceLabel("oa:commenting")).toBe("Commenting");
  });
});

describe("createRDFaMarkObject", () => {
  it("returns correct element and attributes with defaults", () => {
    const input = {};
    const result = createRDFaMarkObject(input);

    expect(result.element).toBe("a");
    expect(result.attrs.about).toMatch("generated-id");
    expect(result.attrs.property).toBe("rdfs:label");
    expect(result.attrs.lang).toBeUndefined();
    expect(result.attrs["xml:lang"]).toBeUndefined();
    expect(result.attrs.datatype).toBeUndefined();
  });

  it("uses time element if datatype is xsd:dateTime", () => {
    const input = { datatype: "xsd:dateTime" };
    const result = createRDFaMarkObject(input);

    expect(result.element).toBe("time");
  });

  it("uses span element if href is empty string", () => {
    const input = { href: "" };
    const result = createRDFaMarkObject(input);

    expect(result.element).toBe("span");
  });

  it("sets datatype to undefined if lang is present", () => {
    const input = { lang: "en", datatype: "someType" };
    const result = createRDFaMarkObject(input);

    expect(result.attrs.lang).toBe("en");
    expect(result.attrs["xml:lang"]).toBe("en");
    expect(result.attrs.datatype).toBeUndefined();
  });

  it("sets all attributes correctly when provided", () => {
    const input = {
      about: "aboutVal",
      resource: "resourceVal",
      typeof: "typeOfVal",
      rel: "relVal",
      property: "propVal",
      href: "http://example.com",
      content: "contentVal",
      lang: "fr",
      datatype: "datatypeVal",
    };
    const result = createRDFaMarkObject(input);

    expect(result.attrs.about).toBe("aboutVal");
    expect(result.attrs.resource).toBe("resourceVal");
    expect(result.attrs["typeof"]).toBe("typeOfVal");
    expect(result.attrs.rel).toBe("relVal");
    expect(result.attrs.property).toBe("propVal");
    expect(result.attrs.href).toBe("http://example.com");
    expect(result.attrs.content).toBe("contentVal");
    expect(result.attrs.lang).toBe("fr");
    expect(result.attrs["xml:lang"]).toBe("fr");
    expect(result.attrs.datatype).toBeUndefined(); // because lang present
  });
});

describe("createRDFaHTML", () => {
  it("returns span element if no datatype and href is empty string", () => {
    const r = {
      href: "",
      rel: "",
      about: "",
      property: "",
      resource: "",
      content: "",
      lang: "",
      datatype: "",
      typeOf: "",
    };
    const html = createRDFaHTML(r, "");
    expect(html.startsWith("<span")).toBe(true);
  });

  it("returns time element if datatype is xsd:dateTime", () => {
    const r = { datatype: "xsd:dateTime", textContent: "2023-01-01T00:00:00Z" };
    const html = createRDFaHTML(r, "");
    expect(html.startsWith("<time")).toBe(true);
    expect(html).toContain("2023-01-01T00:00:00Z");
  });

  it("creates expanded HTML with defaults when about and property are missing", () => {
    const r = {
      rel: "relVal",
      href: "http://example.com",
      resource: "resVal",
      content: "contVal",
      lang: "en",
      datatype: "",
      typeOf: "typeOfVal",
      textContent: "text",
    };
    const html = createRDFaHTML(r, "expanded");

    expect(html).toContain('rel="relVal"');
    expect(html).toContain('href="http://example.com"');
    expect(html).toContain('resource="resVal"');
    expect(html).toContain('content="contVal"');
    expect(html).toContain('lang="en"');
    expect(html).toContain('xml:lang="en"');
    expect(html).toContain('property="rdfs:label"'); // default property
    expect(html).toContain('typeof="typeOfVal"');
    expect(html).toContain("text</a>");
  });

  it("creates expanded HTML with provided about and property", () => {
    const r = {
      about: "aboutVal",
      property: "propVal",
      rel: "relVal",
      href: "link",
      textContent: "abc",
    };
    const html = createRDFaHTML(r, "expanded");

    expect(html).toContain('about="aboutVal"');
    expect(html).toContain('property="propVal"');
    expect(html).toContain('rel="relVal"');
    expect(html).toContain('href="link"');
    expect(html).toContain("abc</a>");
  });
});

function getResourceInfoODRLPolicies(s) {
  var info = {};
  info['odrl'] = {};

  var policy = s.out(ns.odrl.hasPolicy);

  policy.values.forEach(policyIRI => {
    info['odrl'][policyIRI] = {};

    var policyGraph = s.node(rdf.namedNode(policyIRI));
    var policyTypes = policyGraph.out(ns.rdf.type).values;

    info['odrl'][policyIRI]['rdftype'] = policyTypes;

    policyTypes.forEach(pT => {
      if (pT == ns.odrl.Offer.value) {
        var permissions = policyGraph.out(ns.odrl.permission).values;

        permissions.forEach(permissionIRI => {
          info['odrl'][policyIRI]['permission'] = {};
          info['odrl'][policyIRI]['permission'][permissionIRI] = {};

          var permissionGraph = s.node(rdf.namedNode(permissionIRI));

          var permissionAssigner = permissionGraph.out(ns.odrl.assigner).values;
          info['odrl'][policyIRI]['permission'][permissionIRI]['action'] = info['odrl']['permissionAssigner'] = permissionAssigner;

          var permissionActions = permissionGraph.out(ns.odrl.action).values;
          info['odrl'][policyIRI]['permission'][permissionIRI]['action'] = info['odrl']['permissionActions'] = permissionActions;
        });
      }

      if (pT == ns.odrl.Agreement.value) {
        var prohibition = policyGraph.out(ns.odrl.prohibition).values;

        prohibition.forEach(prohibitionIRI => {
          info['odrl'][policyIRI]['prohibition'] = {};
          info['odrl'][policyIRI]['prohibition'][prohibitionIRI] = {};

          var prohibitionGraph = s.node(rdf.namedNode(prohibitionIRI));

          var prohibitionAssigner = prohibitionGraph.out(ns.odrl.assigner).values;
          info['odrl'][policyIRI]['prohibition'][prohibitionIRI]['action'] = info['odrl']['prohibitionAssigner'] = prohibitionAssigner;

          var prohibitionAssignee = prohibitionGraph.out(ns.odrl.assignee).values;
          info['odrl'][policyIRI]['prohibition'][prohibitionIRI]['action'] = info['odrl']['prohibitionAssignee'] = prohibitionAssignee;

          var prohibitionActions = prohibitionGraph.out(ns.odrl.action).values;
          info['odrl'][policyIRI]['prohibition'][prohibitionIRI]['action'] = info['odrl']['prohibitionActions'] = prohibitionActions;
        });
      }
    });
  });

  return info['odrl'];
}

describe('getResourceInfoODRLPolicies with MockGrapoi', () => {
  it('processes Offer policies with permissions correctly', () => {
    const policyIRI = 'http://example.org/policy/1';
    const permissionIRI = 'http://example.org/permission/1';

    const s = new MockGrapoi([
      { subject: { value: 'root' }, predicate: ns.odrl.hasPolicy, object: { value: policyIRI } },
      { subject: { value: policyIRI }, predicate: ns.rdf.type, object: { value: ns.odrl.Offer.value } },
      { subject: { value: policyIRI }, predicate: ns.odrl.permission, object: { value: permissionIRI } },

      { subject: { value: permissionIRI }, predicate: ns.odrl.assigner, object: { value: 'assigner1' } },
      { subject: { value: permissionIRI }, predicate: ns.odrl.action, object: { value: 'action1' } },
      { subject: { value: permissionIRI }, predicate: ns.odrl.action, object: { value: 'action2' } },
    ]);

    s.node('root');

    const info = getResourceInfoODRLPolicies(s);

    expect(info[policyIRI].rdftype).toEqual([ns.odrl.Offer.value]);
    expect(Object.keys(info[policyIRI].permission)).toContain(permissionIRI);
    expect(info[policyIRI].permission[permissionIRI].action).toEqual(['action1', 'action2']);
    expect(info.permissionAssigner).toEqual(['assigner1']);
    expect(info.permissionActions).toEqual(['action1', 'action2']);
  });

  it('processes Agreement policies with prohibitions correctly', () => {
    const policyIRI = 'http://example.org/policy/2';
    const prohibitionIRI = 'http://example.org/prohibition/1';

    const s = new MockGrapoi([
      { subject: { value: 'root' }, predicate: ns.odrl.hasPolicy, object: { value: policyIRI } },
      { subject: { value: policyIRI }, predicate: ns.rdf.type, object: { value: ns.odrl.Agreement.value } },
      { subject: { value: policyIRI }, predicate: ns.odrl.prohibition, object: { value: prohibitionIRI } },

      { subject: { value: prohibitionIRI }, predicate: ns.odrl.assigner, object: { value: 'prohibitionAssigner1' } },
      { subject: { value: prohibitionIRI }, predicate: ns.odrl.assignee, object: { value: 'prohibitionAssignee1' } },
      { subject: { value: prohibitionIRI }, predicate: ns.odrl.action, object: { value: 'prohibitionAction1' } },
      { subject: { value: prohibitionIRI }, predicate: ns.odrl.action, object: { value: 'prohibitionAction2' } },
    ]);

    s.node('root');

    const info = getResourceInfoODRLPolicies(s);

    expect(info[policyIRI].rdftype).toEqual([ns.odrl.Agreement.value]);
    expect(Object.keys(info[policyIRI].prohibition)).toContain(prohibitionIRI);
    expect(info[policyIRI].prohibition[prohibitionIRI].action).toEqual(['prohibitionAction1', 'prohibitionAction2']);
    expect(info.prohibitionAssigner).toEqual(['prohibitionAssigner1']);
    expect(info.prohibitionAssignee).toEqual(['prohibitionAssignee1']);
    expect(info.prohibitionActions).toEqual(['prohibitionAction1', 'prohibitionAction2']);
  });

  it('returns empty object if no policies', () => {
    const s = new MockGrapoi([]);
    s.node('root');

    const info = getResourceInfoODRLPolicies(s);

    expect(info).toEqual({});
  });
  it('skips unknown policy types', () => {
    const policyIRI = 'http://example.org/policy/3';
  
    const s = new MockGrapoi([
      { subject: { value: 'root' }, predicate: ns.odrl.hasPolicy, object: { value: policyIRI } },
      { subject: { value: policyIRI }, predicate: ns.rdf.type, object: { value: 'http://example.org/UnknownPolicyType' } },
    ]);
  
    s.node('root');
  
    const info = getResourceInfoODRLPolicies(s);
  
    expect(info[policyIRI].rdftype).toEqual(['http://example.org/UnknownPolicyType']);
    expect(info[policyIRI].permission).toBeUndefined();
    expect(info[policyIRI].prohibition).toBeUndefined();
  });
});