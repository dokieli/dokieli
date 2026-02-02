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

import { micromark as marked } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';
import { gfmTagfilterHtml } from 'micromark-extension-gfm-tagfilter';
import { escapeRegExp, htmlEncode } from '../util.js'
import { domSanitize } from '../utils/sanitization.js';
import Config from '../config.js'

export function tokenizeHTML(root) {
  const tokens = [];

  function walk(node, parentBlock, marks = {}) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue;
      if (text.trim()) {
        tokens.push({
          block: parentBlock,
          text,
          bold: !!marks.bold,
          italic: !!marks.italic,
          link: marks.link || null,
        });
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.nodeName.toLowerCase();

    // normalize <li><p>only child</p></li>
    if (
      tag === "p" &&
      node.parentNode.nodeName.toLowerCase() === "li" &&
      node.parentNode.childNodes.length === 1
    ) {
      node.childNodes.forEach((child) => walk(child, "li", marks));
      return;
    }

    // block-level elements
    const blockTags = ["p", "h1", "h2", "h3", "li", "blockquote"];
    const isBlock = blockTags.includes(tag);
    const currentBlock = isBlock ? tag : parentBlock;

    // extend marks for inline elements
    let newMarks = { ...marks };
    if (tag === "strong" || tag === "b") newMarks.bold = true;
    if (tag === "em" || tag === "i") newMarks.italic = true;
    if (tag === "a") newMarks.link = node.getAttribute("href");

    node.childNodes.forEach((child) => walk(child, currentBlock, newMarks));
  }

  walk(root, null, {});
  return tokens;
}

export function formatHTML(node, options, noEsc = [false], indentLevel = 0, nextNodeShouldStartOnNewLine = false) {
  // console.trace();
  // console.log(node.outerHTML)
  options = options || Config.DOMProcessing;
  var out = '';

  if (typeof node.nodeType === 'undefined') return out;

  if (node.nodeType === 1) {
    var ename = node.nodeName.toLowerCase();

    const allChildrenAreInlineOrText = 
      [...node.childNodes].every(child => 
        child.nodeType === Node.TEXT_NODE 
        || (child.nodeType === Node.ELEMENT_NODE 
          && Config.DOMProcessing.inlineElements.includes(child.nodeName.toLowerCase())
        )
      );

    if (node.parentNode?.nodeName.toLowerCase() === "head" ? true : (nextNodeShouldStartOnNewLine && !noEsc.includes(true) && !Config.DOMProcessing.inlineElements.includes(node.nodeName.toLowerCase()))) {
      out += '\n' + '  '.repeat(indentLevel);
    }

    out += '<' + ename;

    var attrList = [];

    //Encode attribute values
    for (let i = node.attributes.length - 1; i >= 0; i--) {
      var atn = node.attributes[i];

      let htmlEncodeOptions = { 'mode': 'attribute', 'attributeName': atn.name };

      if (Config.DOMProcessing.urlAttributes.includes(atn.name)) {
        htmlEncodeOptions['mode'] = 'uri';
      }

      attrList.push(atn.name + `="${htmlEncode(atn.value, htmlEncodeOptions)}"`);
    }

    //Sort attributes
    if (attrList.length > 0) {
      if ('sortAttributes' in options && options.sortAttributes) {
        attrList.sort(function (a, b) {
          return a.toLowerCase().localeCompare(b.toLowerCase());
        })
      }
      out += ' ' + attrList.join(' ');
    }

    if (options.voidElements?.includes(ename)) {
      out += ' />';
    } else {
      out += '>';

      noEsc.push(ename === 'style' || ename === 'script' || ename === 'pre' || ename === 'code' || ename === 'samp');

      const nextNodeShouldStartOnNewLine = !allChildrenAreInlineOrText && !noEsc.includes(true) // /n <
      const newlineBeforeClosing = !allChildrenAreInlineOrText && !noEsc.includes(true) && !Config.DOMProcessing.inlineElements.includes(node.nodeName); // /n </

      for (var i = 0; i < node.childNodes.length; i++) {
        out += formatHTML(node.childNodes[i], options, noEsc, indentLevel + 1, nextNodeShouldStartOnNewLine);
      }

      noEsc.pop();

      if (newlineBeforeClosing) {
        out += '\n' + '  '.repeat(indentLevel);
      }

      out += '</' + ename + '>';

      out += (ename == 'html') ? '\n' : ''
    }
  } else if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) {
    let nl = node.nodeValue;

    // XXX: Remove new lines which were added after DOM ready
    // .replace(/\n+$/, '')

    //FIXME: This section needs a lot of testing. If/when domToString is replaced with XML serializer and DOM sanitizer, this section can be removed.

    nl = nl?.replace(/&/g, '&amp;');
    //This space between / / is un-HTML encoded non-breaking space (&nbsp;)
    nl = nl.replace(/ /g, ' ');

    if (noEsc.includes(true)) {
      //Skip style blocks. But do we really want this?
      if (!(node.parentNode && node.parentNode.nodeName.toLowerCase() === 'style') &&
        //Skip data blocks
        !(node.parentNode && node.parentNode.nodeName.toLowerCase() === 'script' && node.parentNode.getAttribute('type') && options.allowedDataBlockTypes.includes(node.parentNode.getAttribute('type').trim()))) {
        nl = nl.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }
    }
    else { //node is not a child text node of style, script, pre, code, or samp, e.g. catches `<p> < > </p>`.
      nl = nl.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    //Clean double escaped entities, e.g., &amp;amp; -> &amp;, &amp;lt; -> &lt;
    nl = fixDoubleEscapedEntities(nl);
    out += nl;
  }
  else {
    console.warn('Warning; Cannot handle serialising nodes of type: ' + node.nodeType);
  }

  //Use a single element with trailing slash for inconsistent use of void and self closing elements.
  var tagList = Config.DOMProcessing.voidElements.concat(Config.DOMProcessing.selfClosing);
  var pattern = new RegExp('<(' + tagList.join('|') + ')([^<>]*?)?><\/\\1>', 'g');
  out = out.replace(pattern, '<$1$2 />');
  // console.log(out)
  return out
}

export function fixDoubleEscapedEntities(string) {
  return string.replace(/&amp;(lt|gt|apos|quot|amp);/g, "&$1;")
}

export function removeXmlns(htmlString, namespace = 'http://www.w3.org/1999/xhtml') {
  const safeNamespace = escapeRegExp(namespace);
  const xmlnsRegex = new RegExp(`\\sxmlns=(["'])${safeNamespace}\\1`, 'g');
  return htmlString.replace(xmlnsRegex, '');
}

export function getDoctype() {
  /* Get DOCTYPE from http://stackoverflow.com/a/10162353 */
  var node = document.doctype;
  var doctype = '';

  if (node !== null) {
    doctype = '<!DOCTYPE ' +
      node.name +
      (node.publicId ? ' PUBLIC "' + node.publicId + '"' : '') +
      (!node.publicId && node.systemId ? ' SYSTEM' : '') +
      (node.systemId ? ' "' + node.systemId + '"' : '') +
      '>';
  }
  return doctype;
}

export function removeNodesWithSelector(node, selectors) {
  const nodesToRemove = node.querySelectorAll(selectors.join(', '));
  for (const n of nodesToRemove) {
    n.remove();
  }

  return node;
}

export function removeClassValues(node, selector, values) {
  const nodesWithClassValue = node.querySelectorAll(selector);

  nodesWithClassValue.forEach(n => {
    values.forEach(value => n.classList.remove(value));
    if(n.classList.length === 0) { n.removeAttribute('class'); }
  });

  return node;
}

export function removeChildren(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

export function getFormValues(form) {
  const formData = new FormData(form);

  const formValues = Object.fromEntries(
    [...formData.entries()].map(([key, value]) => [key, typeof value === "string" ? domSanitize(value.trim()) : value])
  );

// console.log(formValues);
  return formValues;
}

export function getIconsFromCurrentDocument() {
  var usedIcons = Array.from(document.querySelectorAll('i[class*="fa-"]'))
    .flatMap(el => Array.from(el.classList))
    .filter(cls => cls.startsWith('fa-'));

  var uniqueClasses = [...new Set(usedIcons)];

  var filteredEntries = Object.entries(Icon).filter(([cls]) =>
    uniqueClasses.some(usedCls => cls.includes(usedCls))
  );

  var sortedEntries = filteredEntries.sort(([a], [b]) => a.localeCompare(b));

  var newIcons = Object.fromEntries(sortedEntries);

  return newIcons;
}

export function getNodeWithoutClasses (node, classNames) {
  classNames = Array.isArray(classNames) ? classNames : [classNames];
  const rootNode = node.nodeType === Node.DOCUMENT_NODE ? node.documentElement : node;
  const clonedRootNode = rootNode.cloneNode(true);
  const selector = classNames.map(className => `.${className}`).join(',');
  const descendantsWithClass = clonedRootNode.querySelectorAll(selector);

  descendantsWithClass.forEach(descendant => {
    descendant.parentNode.removeChild(descendant);
  });

  return clonedRootNode;
}

export function getFragmentOfNodesChildren(node) {
  const fragment = document.createDocumentFragment();
  [...node.childNodes].forEach(child => fragment.appendChild(child));

  return fragment;
}

export function convertDocumentFragmentToDocument(fragment) {
  const newDoc = document.implementation.createHTMLDocument("New Document");

  while (fragment.firstChild) {
    newDoc.body.appendChild(fragment.firstChild);
  }

  return newDoc;
}

export function getDocumentNodeFromString(data, options = {}) {
  options['contentType'] = options.contentType || 'text/html';

  if (options.contentType === 'text/xml' || options.contentType === 'image/svg+xml') {
    data = data.replace(/<!DOCTYPE[^>]*>/i, '');
  }
  const parser = new DOMParser();
  const node = parser.parseFromString(data, options.contentType);
  // TODO: I don't think we need to do this here anymore, it should happen after we clean the document so that we don't risk altering the structure and missing some elements that need to be removed
  // const pmDocBody = PmDOMParser.fromSchema(schema).parse(node.body);
  // const parsedDoc = DOMSerializer.fromSchema(schema).serializeFragment(pmDocBody.content);
  // const body = stringFromFragment(parsedDoc);

  // node.body.setHTMLUnsafe(body);

  // console.log(parsedDoc, body, node)
  return node;
}

export function getDocumentContentNode(node) {
  if (node instanceof Document) {
    return node.body || undefined; // For HTML documents
  } else if (node instanceof XMLDocument) {
    return node.documentElement || undefined; // For XML documents
  } else if (node instanceof DocumentFragment) {
    return node.firstChild || undefined; // For DocumentFragment
  } else if (node instanceof ShadowRoot) {
    return getDocumentContentNode(node.host); // Recursively check the host element's content
  } else {
    return undefined; // Unknown document type
  }
}

export function getClosestSectionNode(node) {
  return node.closest('section') || node.closest('div') || node.closest('article') || node.closest('main') || node.closest('body');
}

export function removeSelectorFromNode(node, selector) {
  var clone = node.cloneNode(true);
  var x = clone.querySelectorAll(selector);

  x.forEach(i => {
    i.parentNode.removeChild(i);
  })

  return clone;
}

export function getNodeLanguage(node) {
  node = node ?? getDocumentContentNode(document);

  const closestLangNode = node.closest('[lang], [xml\\:lang]');
  return closestLangNode?.getAttribute('lang') || closestLangNode?.getAttributeNS('', 'xml:lang') || '';
}

export function hasNonWhitespaceText(node) {
  return !!node.textContent.trim();
}

export function selectArticleNode(node) {
  var x = node.querySelectorAll(Config.ArticleNodeSelectors.join(','));
  return (x && x.length > 0) ? x[x.length - 1] : getDocumentContentNode(document);
}

export function getRDFaPrefixHTML(prefixes) {
  return Object.keys(prefixes).map(i => { return i + ': ' + prefixes[i]; }).join(' ');
}

export function removeNodesWithIds(ids) {
  if (typeof ids === 'undefined') { return }

  ids = (Array.isArray(ids)) ? ids : [ids];

  ids.forEach(id => {
    var node = document.getElementById(id);
    if (node) {
      node.parentNode.removeChild(node);
    }
  });
}

export function fragmentFromString(strHTML) {
  return document.createRange().createContextualFragment(domSanitize(strHTML));
}

export function getOffset(el) {
  var box = el.getBoundingClientRect();

  return {
    top: box.top + window.pageYOffset - document.documentElement.clientTop,
    left: box.left + window.pageXOffset - document.documentElement.clientLeft
  }
}

export function stringFromFragment(fragment) {
  const container = document.createElement('div');
  container.appendChild(fragment.cloneNode(true));

  // return container.firstChild?.outerHTML || '';

  return container.getHTML();
}

export function parseMarkdown(data, options) {
  options = options || {};
  // console.log(data)
  var extensions = {
    extensions: [gfm()],
    allowDangerousHtml: true,
    htmlExtensions: [gfmHtml(), gfmTagfilterHtml()]
  };
  var html = marked(data, extensions);
  // console.log(parsed)
  if (options.createDocument) {
    html = createHTML('', '<article>' + html + '</article>');
  }
  // console.log(html);
  return html;
}

export function createHTML(title, main, options) {
  title = domSanitize(title) || '';
  main = domSanitize(main);
  options = options || {};
  var prefix = ('prefixes' in options && Object.keys(options.prefixes).length > 0) ? ' prefix="' + getRDFaPrefixHTML(options.prefixes) + '"' : '';
  var lang = options.lang || 'en';
  lang = ' lang="' + lang + '" xml:lang="' + lang + '"';
  lang = ('omitLang' in options) ? '' : lang;
  lang = domSanitize(lang);

  return '<!DOCTYPE html>\n\
<html' + lang + ' xmlns="http://www.w3.org/1999/xhtml">\n\
  <head>\n\
    <meta charset="utf-8" />\n\
    <title>' + title + '</title>\n\
  </head>\n\
  <body' + prefix + '>\n\
    <main>\n\
' + main + '\n\
    </main>\n\
  </body>\n\
</html>\n\
';
}
