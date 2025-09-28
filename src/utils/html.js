import { escapeRegExp } from '../util.js'
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

    if (options.voidElements.includes(ename)) {
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

export function htmlEncode(str, options = { mode: 'text', attributeName: null }) {
  str = String(str).trim();

  if (options.mode === 'uri') {
    const isMulti = options.attributeName && Config.DOMProcessing.multiTermAttributes.includes(options.attributeName);
    if (isMulti) {
      return str.split(/[\t\n\r ]+/).map(term => encodeUriTerm(term)).join(' ');
    } else {
      return encodeUriTerm(str);
    }
  }

  if (options.mode === 'attribute') {
    return str.replace(/([&<>"'])/g, (match, p1, offset, fullStr) => {
      if (p1 === '&') {
        const semicolonIndex = fullStr.indexOf(';', offset);
        if (semicolonIndex > -1) {
          const entity = fullStr.slice(offset, semicolonIndex + 1);
          if (/^&(?:[a-zA-Z][a-zA-Z0-9]+|#\d+|#x[0-9a-fA-F]+);$/.test(entity)) {
            return '&';
          }
        }
      }
      switch (p1) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return p1;
      }
    });
  }

  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}


export function encodeUriTerm(term) {
  return term.replace(/%[0-9A-Fa-f]{2}|&|[^A-Za-z0-9\-._~:/?#\[\]@!$'()*+,;=%]/g, match => {
    if (match === '&') return '&amp;';
    if (/^%[0-9A-Fa-f]{2}$/.test(match)) return match;
    switch (match) {
      case ' ': return '%20';
      case "'": return '%27';
      case '"': return '%22';
      case '<': return '%3C';
      case '>': return '%3E';
      default: return '%' + match.charCodeAt(0).toString(16).toUpperCase();
    }
  });
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
