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
  <body about="" prefix="rdf: ... " typeof="schema:CreativeWork prov:Entity">
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

// Polyfill helper
function patchElementPrototype(win) {
  if (!win.Element.prototype.getHTML) {
    win.Element.prototype.getHTML = function () { return this.innerHTML; };
  }
  if (!win.Element.prototype.setHTMLUnsafe) {
    win.Element.prototype.setHTMLUnsafe = function (html) { this.innerHTML = html; };
  }
}

// Patch the initial window
patchElementPrototype(dom.window);

// Replace global DOMParser with one that uses JSDOM **and applies the polyfill**
global.DOMParser = class {
  parseFromString(htmlString, contentType) {
    const jsdomInstance = new JSDOM(htmlString, { contentType });
    const doc = jsdomInstance.window.document;

    // patch this document's elements
    patchElementPrototype(jsdomInstance.window);

    return doc;
  }
};
