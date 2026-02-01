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

import Config from './config.js'
import { getDateTimeISO, fragmentFromString, generateAttributeId, uniqueArray, generateUUID, matchAllIndex, parseISODuration, getRandomIndex, getHash, stringFromFragment, isValidISBN, getDateTimeISOFromMDY } from './util.js'
import { getAbsoluteIRI, getBaseURL, stripFragmentFromString, getFragmentFromString, getURLLastPath, getPrefixedNameFromIRI, generateDataURI, getProxyableIRI, getFragmentOrLastPath, isHttpOrHttpsProtocol, isFileProtocol } from './uri.js'
import { getResourceHead, deleteResource, processSave, patchResourceWithAcceptPatch, copyResource, getResource } from './fetcher.js'
import rdf from "rdf-ext";
import { getResourceGraph, sortGraphTriples, getGraphContributors, getGraphAuthors, getGraphEditors, getGraphPerformers, getGraphPublishers, getGraphLabel, getGraphEmail, getGraphTitle, getGraphConceptLabel, getGraphPublished, getGraphUpdated, getGraphDescription, getGraphLicense, getGraphRights, getGraphFromData, getGraphAudience, getGraphTypes, getGraphLanguage, getGraphInbox, getUserLabelOrIRI, getGraphImage, getGraphDate } from './graph.js'
import LinkHeader from "http-link-header";
import { micromark as marked } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';
import { gfmTagfilterHtml } from 'micromark-extension-gfm-tagfilter';
import { Icon } from './ui/icons.js';
import { showUserIdentityInput, signOut } from './auth.js'
import { buttonIcons, getButtonHTML, updateButtons } from './ui/buttons.js'
import { domSanitizeHTMLBody, domSanitize } from './utils/sanitization.js';
import { cleanProseMirrorOutput, normalizeHTML } from './utils/normalization.js';
import { formatHTML, getDoctype, htmlEncode } from './utils/html.js';
import { i18n } from './i18n.js';
import { positionNote, processResources } from './activity.js';
import shower from '@shower/core';
import { csvStringToJson, jsonToHtmlTableString } from './csv.js';
import { generateGeoView } from './geo.js';
import { hideDocumentMenu, initDocumentMenu } from './menu.js';
import { initEditor } from './editor/initEditor.js';
import { diffChars } from 'diff';
import { showVisualisationGraph } from './viz.js';

const ns = Config.ns;

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

export function normalizeWhitespace(root = document.documentElement) {
  const inlineElements = new Set(Config.DOMProcessing.inlineElements);

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        // reject if this text node is inside one of these
        for (let p = node.parentNode; p; p = p.parentNode) {
          const tag = p.nodeName?.toLowerCase?.();
          if (['pre', 'code', 'samp', 'kbd', 'var', 'textarea', 'style'].includes(tag)) {
            return NodeFilter.FILTER_REJECT;
          }
        }

        const parentTag = node.parentNode?.nodeName?.toLowerCase?.();
        if (['p', 'dd', 'li'].includes(parentTag)) {
          return NodeFilter.FILTER_REJECT;
        }

        if (/[\r\n\t]/.test(node.nodeValue)) {
          return NodeFilter.FILTER_ACCEPT;
        }

        return NodeFilter.FILTER_REJECT;
      }
    }
  );

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  for (const node of nodes) {
    const text = node.nodeValue;
    const collapsed = text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ');

    const parentTag = node.parentNode.nodeName.toLowerCase();

    const prev = node.previousSibling;
    const next = node.nextSibling;

    const prevIsInline = prev && prev.nodeType === 1 && inlineElements.has(prev.nodeName.toLowerCase());
    const nextIsInline = next && next.nodeType === 1 && inlineElements.has(next.nodeName.toLowerCase());

    if (prevIsInline && nextIsInline && parentTag !== 'head') {
      node.nodeValue = ' ';
    } else if (collapsed.trim() === '') {
      node.remove();
    } else {
      node.nodeValue = collapsed;
    }
  }

  return root;
}

export function convertDocumentFragmentToDocument(fragment) {
  const newDoc = document.implementation.createHTMLDocument("New Document");

  while (fragment.firstChild) {
    newDoc.body.appendChild(fragment.firstChild);
  }

  return newDoc;
}

export function getDocument(cn, options) {
  let node = cn || document.documentElement;

  if (typeof cn === 'string') {
    const parser = new DOMParser();
    node = parser.parseFromString(cn, 'text/html');
    node = node.documentElement;
  }
  else if (cn instanceof Document) {
    node = cn.documentElement;
  }

  const nodeParseOptions = {
    contentType: (node.nodeName.toLowerCase() === 'svg') ? 'image/svg+xml' : 'text/html'
  };

  node = node.cloneNode(true);

  //In case `node` type is DocumentFragment
  const div = document.createElement('div');
  div.appendChild(node);

  //XXX: DO THIS?
  // div.normalize;

  let htmlString;
  // let htmlString = normalizeWhitespace(div).getHTML();
  // console.log(htmlString)

  let nodeDocument = getDocumentNodeFromString(div.getHTML(), nodeParseOptions);

  let fragment = cleanProseMirrorOutput(nodeDocument);
  nodeDocument.documentElement.setHTMLUnsafe(stringFromFragment(fragment));

  nodeDocument = normalizeWhitespace(nodeDocument);


  if (options.sanitize) {
    nodeDocument = domSanitizeHTMLBody(nodeDocument, options);
  }

  if (options.normalize) {
    nodeDocument = normalizeHTML(nodeDocument);
  }

  if (options.format) {
    htmlString = formatHTML(nodeDocument.documentElement, options);
    // console.log('formatted htmlString:', htmlString);
  }
  else {
    htmlString = nodeDocument.documentElement.outerHTML;
  }

  //Prepend doctype
  let doctype = (nodeDocument.constructor.name === 'XMLDocument') ? '<?xml version="1.0" encoding="utf-8"?>' : getDoctype();
  doctype = (doctype.length > 0) ? doctype + '\n' : '';
  htmlString = doctype + htmlString;

  // console.trace("format: ", options.format, "sanitize: ", options.sanitize, "normalize: ", options.normalize, "output:", htmlString);

  return htmlString;
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

export function createFeedXML(feed, options) {
  options = options || {};

  var feedXML = '';
  var language = feed.language ? '<language>' + feed.language + '</language>' : '';
  var title = feed.title ? '<title>' + feed.title + '</title>' : '<title>' + feed.self + '</title>';
  var generator = '';
  var license = '';
  var rights = '';
  var rightsLicenseText = ''
  var description = '';
  var authorData = '';

  var now = getDateTimeISO();
  var year = new Date(now).getFullYear();

  var feedItems = [];
  Object.keys(feed.items).forEach(i => {
    var fI = '';
    var url = i;
    var origin = new URL(url).origin;
    var author = '';
    var authorData = [];
    var title = (feed.items[i].title) ? '<title>' + feed.items[i].title + '</title>' : '';

    //TODO: This would normally only work for input content is using a markup language.
    var description = feed.items[i].description.replace(/(data|src|href)=(['"])([^'"]+)(['"])/ig, (match, p1, p2, p3, p4) => {
      var isAbsolute = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(p3); // Check if the value is an absolute URL
      return `${p1}="${isAbsolute ? p3 : (p3.startsWith('/') ? origin : url) + '/' + p3}"`;
    });
    // console.log(description)
    
    description = htmlEncode(formatHTML(description));

    var published = '';
    var updated = '';
    var license = '';

    switch (options.contentType) {
      case 'application/atom+xml':
        if (feed.items[i].author) {
          feed.items[i].author.forEach(author => {
            var a = `    <author>
      <uri>${author.uri}</uri>${author.name ? `
      <name>${author.name}</name>` : ''}${author.email ? `
      <email>${author.email}</email>` : ''}
    </author>`;

            author.uri == feed.author.uri ? authorData.unshift(a) : authorData.push(a);
          })
        }

        published = feed.items[i].published
          ? `<published>${feed.items[i].published}</published>`
          : `<published>${now}</published>`

        updated = feed.items[i].updated
          ? `<updated>${feed.items[i].updated}</updated>`
          : '';

        description = (feed.items[i].description) ? '<content type="html">' + description + '\n\
      </content>' : '';

        license = (feed.items[i].license) ? '<link rel="license" href="' + feed.items[i].license + '" />' : '';

        fI = '\n\
  <entry>\n\
    <id>' + url + '</id>\n\
    <link href="' + url + '" />\n\
    ' + title + '\n\
    ' + published + '\n\
    ' + updated + '\n\
    ' + license + '\n\
' + authorData.join('\n') + '\n\
    ' + description + '\n\
  </entry>';
        break;

      case 'application/rss+xml':
        if (feed.items[i].author) {
          author = feed.items[i].author.find(item => item.uri === feed.author.uri) || feed.items[i].author[0];

          if (author.email) {
            author = author.name ? `${author.email} (${author.name})` : author.email;
            authorData.push('<author>' + author + '</author>');
          }
          else if (author.uri) {
            authorData.push('<dc:creator>' + (author.name ? author.name : author.uri) + '</dc:creator>');
          }
        }

        let dateStr =
          feed.items[i].updated ? new Date(feed.items[i].updated) :
          feed.items[i].published ? new Date(feed.items[i].published) :
          feed.items[i].headers?.date?.['field-value'] ? new Date(feed.items[i].headers.date['field-value']) :
          new Date();

        published = `<pubDate>${dateStr.toUTCString()}</pubDate>`;

        description = feed.items[i].description ? '<description>' + description + '</description>' : '';

        // license = ('license' in feed.items[i]) ? '<copyright>License: ' + feed.items[i].license + '</copyright>' : '';

        fI = '\n\
    <item>\n\
      <guid>' + url + '</guid>\n\
      ' + title + '\n\
      ' + published + '\n\
      ' + authorData.join('') + '\n\
      ' + description + '\n\
    </item>';
        break;
    }

    feedItems.push(fI);
  });


  switch (options.contentType) {
    case 'application/atom+xml':
      if (feed.author?.uri) {
        authorData = `
  <author>
    <uri>${feed.author.uri}</uri>
    ${feed.author.name ? `<name>${feed.author.name}</name>` : ''}
  </author>`;

        rights = feed.author.name ? ' ' + feed.author.name : ''
      }

      description = (feed.description) ? '<summary>' + feed.description + '</summary>' : '';

      if (feed.license) {
        license = '<link rel="license" href="' + feed.license + '" />';
        rightsLicenseText = ' . License: ' + feed.license;
      }

      rights = '<rights>Copyright ' + year + rights + rightsLicenseText + ' . Rights and license are feed only.</rights>';

      generator = '<generator uri="https://dokie.li/#i">dokieli</generator>';

      feedXML = '<feed xmlns="http://www.w3.org/2005/Atom">\n\
  ' + title + '\n\
  <link href="' + feed.self + '" rel="self" />\n\
  <id>' + feed.self + '</id>\n\
  <updated>' + now + '</updated>\n\
  ' + rights + '\n\
  ' + license + '\n\
  ' + generator + '\n\
' + authorData + '\n\
' + feedItems.join('') + '\n\
</feed>\n\
';
      break;

    case 'application/rss+xml':
      now = new Date(now).toUTCString();

      if (feed.author) {
        authorData = feed.author.name || feed.author.uri || '';

        rights = feed.author.name ? ' ' + feed.author.name : ''

        if (authorData) {
          authorData = `<dc:creator>${authorData}</dc:creator>`;
        }
      }

      description = feed.description
          ? '<description>' + feed.description + '</description>'
          : feed.title
          ? '<description>' + feed.title + '</description>'
          : '<description>' + feed.self + '</description>';

      generator = '<generator>https://dokie.li/#i</generator>';

      if (feed.license) {
        rightsLicenseText = ' . License: ' + feed.license;
      }

      rights = '<copyright>Copyright ' + year + rights + rightsLicenseText + ' . Rights and license are feed only.</copyright>';

      feedXML = '<?xml version="1.0" encoding="utf-8"?>\n\
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">\n\
  <channel>\n\
    <atom:link href="' + feed.self + '" rel="self" type="application/rss+xml" />\n\
    <link>' + feed.origin + '</link>\n\
    ' + title + '\n\
    <pubDate>' + now + '</pubDate>\n\
    ' + rights + '\n\
    ' + generator + '\n\
    ' + language + '\n\
    ' + authorData + '\n\
    ' + description + '\n\
' + feedItems.join('') + '\n\
  </channel>\n\
</rss>\n\
';
      break;
  }

  return feedXML;
}

export function getFeedFormatSelection() {
  return `
    <div id="feed-format-selection">
      <label data-i18n="dialog.generate-feed.feed-format.label" for="feed-format">${i18n.t('dialog.generate-feed.feed-format.label.textContent')}</label>
      <select id="feed-format">
        <option id="feed-format-atom" lang="en" value="application/atom+xml" xml:lang="en">Atom</option>
        <option id="feed-format-rss" lang="en" value="application/rss+xml" selected="selected" xml:lang="en">RSS</option>
      </select>
    </div>
  `;
}

export function createActivityHTML(o) {
  var prefixes = ' prefix="rdf: http://www.w3.org/1999/02/22-rdf-syntax-ns# schema: http://schema.org/ oa: http://www.w3.org/ns/oa# as: https://www.w3.org/ns/activitystreams#"';

  var types = '<dt>Types</dt>'

  o.type.forEach(function (t) {
    types += '<dd><a about="" href="' + Config.Prefixes[t.split(':')[0]] + t.split(':')[1] + '" typeof="' + t + '">' + t.split(':')[1] + '</a></dd>'
  })

  var asObjectTypes = ''
  if ('object' in o && 'objectTypes' in o && o.objectTypes.length > 0) {
    asObjectTypes = '<dl><dt>Types</dt>'
    o.objectTypes.forEach(t => {
      asObjectTypes += '<dd><a about="' + o.object + '" href="' + t + '" typeof="' + t + '">' + t + '</a></dd>'
    })
    asObjectTypes += '</dl>'
  }

  var asObjectLicense = ''
  if ('object' in o && 'objectLicense' in o && o.objectLicense.length > 0) {
    asObjectLicense = '<dl><dt>License</dt><dd><a about="' + o.object + '" href="' + o.objectLicense + '" property="schema:license">' + o.objectLicense + '</a></dd></dl>'
  }

  var asinReplyTo = ('inReplyTo' in o) ? '<dl><dt>In reply to</dt><dd><a about="' + o.object + '" href="' + o.inReplyTo + '" property="as:inReplyTo">' + o.inReplyTo + '</a></dd></dl>' : ''

  var asobject = ('object' in o) ? '<dt>Object</dt><dd><a href="' + o.object + '" property="as:object">' + o.object + '</a>' + asObjectTypes + asObjectLicense + asinReplyTo + '</dd>' : ''

  var ascontext = ('context' in o && o.context.length > 0) ? '<dt>Context</dt><dd><a href="' + o.context + '" property="as:context">' + o.context + '</a></dd>' : ''

  var astarget = ('target' in o && o.target.length > 0) ? '<dt>Target</dt><dd><a href="' + o.target + '" property="as:target">' + o.target + '</a></dd>' : ''

  var datetime = getDateTimeISO()
  var asupdated = '<dt>Updated</dt><dd><time datetime="' + datetime + '" datatype="xsd:dateTime" property="as:updated" content="' + datetime + '">' + datetime.substr(0, 19).replace('T', ' ') + '</time></dd>'

  var assummary = ('summary' in o && o.summary.length > 0) ? '<dt>Summary</dt><dd property="as:summary" datatype="rdf:HTML">' + o.summary + '</dd>' : ''

  var ascontent = ('content' in o && o.content.length > 0) ? '<dt>Content</dt><dd property="as:content" datatype="rdf:HTML">' + o.content + '</dd>' : ''

  var asactor = (Config.User.IRI) ? '<dt>Actor</dt><dd><a href="' + Config.User.IRI + '" property="as:actor">' + Config.User.IRI + '</a></dd>' : ''

  var license = '<dt>License</dt><dd><a href="' + Config.NotificationLicense + '" property="schema:license">' + Config.NotificationLicense + '</a></dd>'

  var asto = ('to' in o && o.to.length > 0 && !o.to.match(/\s/g) && o.to.match(/^https?:\/\//gi)) ? '<dt>To</dt><dd><a href="' + o.to + '" property="as:to">' + o.to + '</a></dd>' : ''

  var statements = ('statements' in o) ? o.statements : ''

  var dl = [
    types,
    asobject,
    ascontext,
    astarget,
    asupdated,
    assummary,
    ascontent,
    asactor,
    license,
    asto
  ].map(function (n) { if (n !== '') { return '      ' + n + '\n' } }).join('')


  // TODO: Come up with a better title. reuse `types` e.g., Activity Created, Announced..
  var title = 'Notification'
  if (types.indexOf('as:Announce') > -1) {
    title += ': Announced'
  } else if (types.indexOf('as:Create') > -1) {
    title += ': Created'
  } else if (types.indexOf('as:Like') > -1) {
    title += ': Liked'
  } else if (types.indexOf('as:Dislike') > -1) {
    title += ': Disliked'
  } else if (types.indexOf('as:Add') > -1) {
    title += ': Added'
  }

  var data = '<article' + prefixes + '>\n\
  <h1>' + title + '</h1>\n\
  <section>\n\
    <dl about="">\n\
' + dl +
    '    </dl>\n\
  </section>\n\
  <section>\n\
' + statements + '\n\
  </section>\n\
</article>'

  return data
}

export function createNoteDataHTML(n) {
  // console.log(n);
  var created = '';
  var lang = '', xmlLang = '', language = '';
  var license = '';
  var rights = '';
  var creator = '', authors = '', creatorImage = '', creatorNameIRI = '', creatorURLNameIRI = '';
  var hasTarget = '', annotationTextSelector = '', target = '';
  var inbox = '';
  var heading, hX;
  var aAbout = '', aPrefix = '';
  var noteType = '';
  var body = '';
  var buttonDelete = '';
  var note = '';
  var targetLabel = '';
  var bodyAltLabel = '';
  var articleClass = '';
  var prefixes = ' prefix="rdf: http://www.w3.org/1999/02/22-rdf-syntax-ns# schema: http://schema.org/ dcterms: http://purl.org/dc/terms/ oa: http://www.w3.org/ns/oa# as: https://www.w3.org/ns/activitystreams# ldp: http://www.w3.org/ns/ldp#"';

  var canonicalId = n.canonical || 'urn:uuid:' + generateUUID();

  var motivatedByIRI = n.motivatedByIRI || '';
  var motivatedByLabel = '';

  motivatedByIRI = getPrefixedNameFromIRI(motivatedByIRI);

  switch (motivatedByIRI) {
    case 'oa:replying': default:
      motivatedByIRI = 'oa:replying';
      motivatedByLabel = 'replies';
      targetLabel = 'In reply to';
      bodyAltLabel = 'Replied';
      aAbout = ('mode' in n && n.mode == 'object') ? '#' + n.id : '';
      aPrefix = prefixes;
      break;
    case 'oa:assessing':
      motivatedByLabel = 'reviews';
      targetLabel = 'Review of';
      bodyAltLabel = 'Reviewed';
      aAbout = ('mode' in n && n.mode == 'object') ? '#' + n.id : '';
      aPrefix = prefixes;
      break;
    case 'oa:questioning':
      motivatedByLabel = 'questions';
      targetLabel = 'Questions';
      bodyAltLabel = 'Questioned';
      aAbout = ('mode' in n && n.mode == 'object') ? '#' + n.id : '';
      aPrefix = prefixes;
      break;
    case 'oa:describing':
      motivatedByLabel = 'describes';
      targetLabel = 'Describes';
      bodyAltLabel = 'Described'
      aAbout = '#' + n.id;
      break;
    case 'oa:commenting':
      motivatedByLabel = 'comments';
      targetLabel = 'Comments on';
      bodyAltLabel = 'Commented';
      aAbout = '#' + n.id;
      break;
    case 'oa:bookmarking': case 'bookmark:Bookmark':
      motivatedByLabel = 'bookmarks';
      targetLabel = 'Bookmarked';
      bodyAltLabel = 'Bookmarked';
      aAbout = ('mode' in n && n.mode == 'object') ? '#' + n.id : '';
      aPrefix = prefixes;
      break;
    case 'as:Like':
      motivatedByLabel = 'Liked';
      targetLabel = 'Like of';
      bodyAltLabel = 'Liked';
      aAbout = ('mode' in n && n.mode == 'object') ? '#' + n.id : '';
      aPrefix = prefixes;
      break;
    case 'as:Dislike':
      motivatedByLabel = 'Disliked';
      targetLabel = 'Dislike of';
      bodyAltLabel = 'Disliked';
      aAbout = ('mode' in n && n.mode == 'object') ? '#' + n.id : '';
      aPrefix = prefixes;
      break;
  }

  switch (n.mode) {
    default: case 'read':
      hX = 3;
      if ('creator' in n && 'iri' in n.creator && n.creator.iri == Config.User.IRI) {
        buttonDelete = '<button aria-label="Delete item" class="delete do" title="Delete item" type="button">' + Icon[".fas.fa-trash-alt"] + '</button>';
      }
      // articleClass = (motivatedByIRI == 'oa:commenting') ? '' : ' class="do"';
      aAbout = ('iri' in n) ? n.iri : aAbout;
      break;
    case 'write':
      hX = 1;
      break;
    case 'object':
      hX = 2;
      break;
  }

  var creatorName = '';
  var creatorIRI = '#' + generateAttributeId();

  if ('creator' in n) {
    if ('iri' in n.creator) {
      creatorIRI = n.creator.iri;
    }

    creatorName = creatorIRI;

    if ('name' in n.creator) {
      creatorName = n.creator.name;
      creatorNameIRI = '<span about="' + creatorIRI + '" property="schema:name">' + creatorName + '</span>';
    }
    else {
      creatorName = getUserLabelOrIRI(creatorIRI);
      creatorNameIRI = (creatorName == creatorIRI) ? creatorName : '<span about="' + creatorIRI + '" property="schema:name">' + creatorName + '</span>';
    }

    var img = generateDataURI('image/svg+xml', 'base64', Icon['.fas.fa-user-secret']);
    if ('image' in n.creator) {
      img = (n.mode == 'read') ? getProxyableIRI(n.creator.image) : n.creator.image;
    }
    else if (Config.User.Image && (creatorIRI == Config.User.IRI || Config.User.SameAs.includes(creatorIRI))) {
      img = (n.mode == 'read') ? getProxyableIRI(Config.User.Image) : Config.User.Image;
    }
    else {
      img = (Config.User.Contacts && Config.User.Contacts[creatorIRI] && Config.User.Contacts[creatorIRI].Image) ? Config.User.Contacts[creatorIRI].Image : img;
    }
    creatorImage = '<img alt="" height="48" rel="schema:image" src="' + img + '" width="48" /> ';

    creatorURLNameIRI = ('url' in n.creator) ? '<a href="' + n.creator.url + '" rel="schema:url">' + creatorNameIRI + '</a>' : '<a href="' + creatorIRI + '">' + creatorNameIRI + '</a>';

    creator = '<span about="' + creatorIRI + '" typeof="schema:Person">' + creatorImage + creatorURLNameIRI + '</span>';

    authors = '<dl class="author-name"><dt>Authors</dt><dd><span rel="dcterms:creator">' + creator + '</span></dd></dl>';
  }

  heading = '<h' + hX + ' property="schema:name">' + creatorName + ' <span rel="oa:motivatedBy" resource="' + motivatedByIRI + '">' + motivatedByLabel + '</span></h' + hX + '>';

  if ('inbox' in n && typeof n.inbox !== 'undefined') {
    inbox = '<dl class="inbox"><dt>Notifications Inbox</dt><dd><a href="' + n.inbox + '" rel="ldp:inbox">' + n.inbox + '</a></dd></dl>';
  }

  if ('datetime' in n && typeof n.datetime !== 'undefined') {
    var time = '<time datetime="' + n.datetime + '" datatype="xsd:dateTime" property="dcterms:created" content="' + n.datetime + '">' + n.datetime.substr(0, 19).replace('T', ' ') + '</time>';
    var timeLinked = ('iri' in n) ? '<a href="' + n.iri + '">' + time + '</a>' : time;
    created = '<dl class="created"><dt>Created</dt><dd>' + timeLinked + '</dd></dl>';
  }

  if (n.language) {
    language = createLanguageHTML(n.language, { property: 'dcterms:language', label: 'Language' });
    lang = ' lang="' + n.language + '"';
    xmlLang = ' xml:lang="' + n.language + '"';
  }
  if (n.license) {
    license = createLicenseHTML(n.license, { rel: 'schema:license', label: 'License' });
  }
  if (n.rights) {
    rights = createRightsHTML(n.rights, { rel: 'dcterms:rights', label: 'Rights' });
  }

  //TODO: Differentiate language, license, rights on Annotation from Body
  switch (n.type) {
    case 'comment': case 'note': case 'bookmark': case 'approve': case 'disapprove': case 'specificity':
      if (typeof n.target !== 'undefined' || typeof n.inReplyTo !== 'undefined') { //note, annotation, reply
        //FIXME: Could resourceIRI be a fragment URI or *make sure* it is the document URL without the fragment?
        //TODO: Use n.target.iri?
        // console.log(n)
        if (typeof n.body !== 'undefined') {
          var tagsArray = [];

          n.body = Array.isArray(n.body) ? n.body : [n.body];
          n.body.forEach(bodyItem => {
            var bodyLanguage = createLanguageHTML(bodyItem.language, { property: 'dcterms:language', label: 'Language' }) || language;
            var bodyLicense = createLicenseHTML(bodyItem.license, { rel: 'schema:license', label: 'License' }) || license;
            var bodyRights = createRightsHTML(bodyItem.rights, { rel: 'dcterms:rights', label: 'Rights' }) || rights;
            var bodyValue = bodyItem.value || bodyAltLabel;
            // var bodyValue = bodyItem.value || '';
            // var bodyFormat = bodyItem.format ? bodyItem.format : 'rdf:HTML';

            if (bodyItem.purpose) {
              if (bodyItem.purpose == "describing" || bodyItem.purpose == ns.oa.describing.value) {
                body += '<section id="note-' + n.id + '" rel="oa:hasBody" resource="#note-' + n.id + '"><h' + (hX + 1) + ' property="schema:name" rel="oa:hasPurpose" resource="oa:describing">Note</h' + (hX + 1) + '>' + bodyLanguage + bodyLicense + bodyRights + '<div datatype="rdf:HTML"' + lang + ' property="rdf:value schema:description" resource="#note-' + n.id + '" typeof="oa:TextualBody"' + xmlLang + '>' + bodyValue + '</div></section>';
              }
              if (bodyItem.purpose == "tagging" || bodyItem.purpose == ns.oa.tagging.value) {
                tagsArray.push(bodyValue);
              }
            }
            else {
              body += '<section id="note-' + n.id + '" rel="oa:hasBody" resource="#note-' + n.id + '"><h' + (hX + 1) + ' property="schema:name">Note</h' + (hX + 1) + '>' + bodyLanguage + bodyLicense + bodyRights + '<div datatype="rdf:HTML"' + lang + ' property="rdf:value schema:description" resource="#note-' + n.id + '" typeof="oa:TextualBody"' + xmlLang + '>' + bodyValue + '</div></section>';
            }
          });

          if (tagsArray.length) {
            tagsArray = tagsArray
              .map(tag => htmlEncode(tag.trim()))
              .filter(tag => tag.length);
            tagsArray = uniqueArray(tagsArray.sort());

            var tags = tagsArray.map(tag => '<li about="#tag-' + n.id + '-' + generateAttributeId(null, tag) + '" typeof="oa:TextualBody" property="rdf:value" rel="oa:hasPurpose" resource="oa:tagging">' + tag + '</li>').join('');

            body += '<dl id="tags-' + n.id + '" class="tags"><dt>Tags</dt><dd><ul rel="oa:hasBody">' + tags + '</ul></dd></dl>';
          }
        }
        else if (n.bodyValue !== 'undefined') {
          body += '<p property="oa:bodyValue">' + n.bodyValue + '</p>';
        }
        // console.log(body)
        var targetIRI = '';
        var targetRelation = 'oa:hasTarget';
        if (typeof n.target !== 'undefined' && 'iri' in n.target) {
          targetIRI = n.target.iri;
          var targetIRIFragment = getFragmentFromString(n.target.iri);
          //TODO: Handle when there is no fragment
          //TODO: Languages should be whatever is target's (not necessarily 'en')
          if (typeof n.target.selector !== 'undefined') {
            var selectionLanguage = ('language' in n.target.selector && n.target.selector.language) ? n.target.selector.language : '';

            annotationTextSelector = '<div rel="oa:hasSelector" resource="#fragment-selector" typeof="oa:FragmentSelector"><dl class="conformsto"><dt>Fragment selector conforms to</dt><dd><a content="' + targetIRIFragment + '" lang="" property="rdf:value" rel="dcterms:conformsTo" href="https://tools.ietf.org/html/rfc3987" xml:lang="">RFC 3987</a></dd></dl><dl rel="oa:refinedBy" resource="#text-quote-selector" typeof="oa:TextQuoteSelector"><dt>Refined by</dt><dd><span lang="' + selectionLanguage + '" property="oa:prefix" xml:lang="' + selectionLanguage + '">' + n.target.selector.prefix + '</span><mark lang="' + selectionLanguage + '" property="oa:exact" xml:lang="' + selectionLanguage + '">' + n.target.selector.exact + '</mark><span lang="' + selectionLanguage + '" property="oa:suffix" xml:lang="' + selectionLanguage + '">' + n.target.selector.suffix + '</span></dd></dl></div>';
          }
        }
        else if (typeof n.inReplyTo !== 'undefined' && 'iri' in n.inReplyTo) {
          targetIRI = n.inReplyTo.iri;
          targetRelation = ('rel' in n.inReplyTo) ? n.inReplyTo.rel : 'as:inReplyTo';
          // TODO: pass document title and maybe author so they can be displayed on the reply too.
        }

        hasTarget = '<a href="' + targetIRI + '" rel="' + targetRelation + '">' + targetLabel + '</a>';
        if (typeof n.target !== 'undefined' && typeof n.target.source !== 'undefined') {
          hasTarget += ' (<a about="' + n.target.iri + '" href="' + n.target.source + '" rel="oa:hasSource" typeof="oa:SpecificResource">part of</a>)';
        }

        var targetLanguage = (typeof n.target !== 'undefined' && 'language' in n.target && n.target.language.length) ? '<dl><dt>Language</dt><dd><span lang="" property="dcterms:language" xml:lang="">' + n.target.language + '</span></dd></dl>' : '';

        target = '<dl class="target"><dt>' + hasTarget + '</dt>';
        if (typeof n.target !== 'undefined' && typeof n.target.selector !== 'undefined') {
          target += '<dd><blockquote about="' + targetIRI + '" cite="' + targetIRI + '">' + targetLanguage + annotationTextSelector + '</blockquote></dd>';
        }
        target += '</dl>';

        target += '<dl class="renderedvia"><dt>Rendered via</dt><dd><a about="' + targetIRI + '" href="https://dokie.li/" rel="oa:renderedVia">dokieli</a></dd></dl>';

        var canonical = '<dl class="canonical"><dt>Canonical</dt><dd rel="oa:canonical" resource="' + canonicalId + '">' + canonicalId + '</dd></dl>';

        note = '<article about="' + aAbout + '" id="' + n.id + '" typeof="oa:Annotation' + noteType + '"' + aPrefix + '>' + buttonDelete + '\n\
' + heading + '\n\
' + authors + '\n\
' + created + '\n\
' + language + '\n\
' + license + '\n\
' + rights + '\n\
' + inbox + '\n\
' + canonical + '\n\
' + target + '\n\
' + body + '\n\
</article>';
      }
      break;

    case 'ref-footnote':
      var citationURL = (typeof n.citationURL !== 'undefined' && n.citationURL != '') ? '<a href="' + n.citationURL + '" rel="rdfs:seeAlso">' + n.citationURL + '</a>' : '';
      var bodyValue = (n.body && n.body.length) ? n.body[0].value : '';
      body = (bodyValue) ? ((citationURL) ? ', ' + bodyValue : bodyValue) : '';

      note = '\n\
<dl about="#' + n.id + '" id="' + n.id + '" typeof="oa:Annotation">\n\
<dt><a href="#' + n.refId + '" rel="oa:hasTarget">' + n.refLabel + '</a><span rel="oa:motivation" resource="' + motivatedByIRI + '"></span></dt>\n\
<dd rel="oa:hasBody" resource="#n-' + n.id + '"><div datatype="rdf:HTML" property="rdf:value" resource="#n-' + n.id + '" typeof="oa:TextualBody">' + citationURL + body + '</div></dd>\n\
</dl>\n\
';
      break;

    case 'ref-citation':
      heading = '<h' + hX + '>Citation</h' + hX + '>';

      var citingEntityLabel = ('citingEntityLabel' in n.citation) ? n.citation.citingEntityLabel : n.citation.citingEntity;
      var citationCharacterizationLabel = Config.Citation[n.citation.citationCharacterization] || n.citation.citationCharacterization;
      var citedEntityLabel = ('citedEntityLabel' in n.citation) ? n.citation.citedEntityLabel : n.citation.citedEntity;

      var citation = '\n\
<dl about="' + n.citation.citingEntity + '">\n\
<dt>Cited by</dt><dd><a href="' + n.citation.citingEntity + '">' + citingEntityLabel + '</a></dd>\n\
<dt>Citation type</dt><dd><a href="' + n.citation.citationCharacterization + '">' + citationCharacterizationLabel + '</a></dd>\n\
<dt>Cites</dt><dd><a href="' + n.citation.citedEntity + '" rel="' + n.citation.citationCharacterization + '">' + citedEntityLabel + '</a></dd>\n\
</dl>\n\
';

      note = '<article about="' + aAbout + '" id="' + n.id + '" prefixes="cito: http://purl.org/spart/cito/">\n\
' + heading + '\n\
' + citation + '\n\
</article>';
      break;

    default:
      console.log(`XXX: noteData ${n} with "${n.type}" type not implemented yet`);
      break;
  }

  return note;
}

export function tagsToBodyObjects(string) {
  var bodyObjects = [];

  let tagsArray = string
    .split(',')
    .map(tag => htmlEncode(tag.trim()))
    .filter(tag => tag.length);

  tagsArray = uniqueArray(tagsArray.sort());

  tagsArray.forEach(tag => {
    bodyObjects.push({
      "purpose": "tagging",
      "value": tag
    })
  })

  return bodyObjects;
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

export function addMessageToLog(message, log, options = {}) {
  const m = Object.assign({}, message);
  m['dateTime'] = getDateTimeISO();
  log.unshift(m);
}

export function handleActionMessage(resolved, rejected) {
  if (resolved) {
    const { response, message } = resolved;
    showActionMessage(document.body, message);
  }
  else if (rejected) {
    const { error, message } = rejected;
    showActionMessage(document.body, message);
  }
}

export function showActionMessage(node, message, options = {}) {
  if (!node || !message) return;

  if (options.clearId) {
    document.getElementById(options.clearId)?.remove();
  }

  message['timer'] = ('timer' in message) ? message.timer : Config.ActionMessage.Timer;
  message['type'] = ('type' in message) ? message.type : 'info';

  const id = generateAttributeId();
  const messageItem = domSanitize('<li id="' + id + '" class="' + message.type + '">' + buttonIcons[message.type].icon + ' ' + message.content + '</li>');

  let aside = node.querySelector('#document-action-message');
  if (!aside) {
    var buttonClose = getButtonHTML({ key: 'dialog.document-action-message.close.button', button: 'close', buttonClass: 'close', iconSize: 'fa-2x' });

    node.appendChild(fragmentFromString(`
      <aside aria-labelledby="document-action-message-label" class="do on" dir="${Config.User.UI.LanguageDir}" id="document-action-message" lang="${Config.User.UI.Language}" rel="schema:hasPart" resource="#document-action-message" role="status" tabindex="0" xml:lang="${Config.User.UI.Language}">
        <h2 data-i18n="dialog.document-action-message.messages.h2" id="document-action-message-label" property="schema:name">${i18n.t('dialog.document-action-message.messages.h2.textContent')}</h2>
        ${buttonClose}
        <ul role="log"></ul>
      </aside>
    `));
    aside = node.querySelector('#document-action-message');
  }
  aside.querySelector('ul[role="log"]').insertAdjacentHTML('afterbegin', messageItem);

  let timerId = null;

  function startTimer() {
    if (message.timer !== null) {
      timerId = window.setTimeout(() => {
        const aside = node.querySelector('#document-action-message');
        if (aside) {
          const li = aside.querySelector('#' + id);
          if (li) {
            li.parentNode.removeChild(li);
          }

          const remaining = aside.querySelector('h2 + ul > li');
          if (!remaining) {
            node.removeChild(aside);
          }
        }
      }, message.timer);
    }
  }

  function clearTimer() {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  if (message.timer !== null) {
    startTimer();

    const pauseEvents = ['mouseenter', 'focusin'];
    const resumeEvents = ['mouseleave', 'focusout'];

    pauseEvents.forEach(evt => aside.addEventListener(evt, clearTimer));
    resumeEvents.forEach(evt => aside.addEventListener(evt, startTimer));
  }

  return id;
}

export function hasNonWhitespaceText(node) {
  return !!node.textContent.trim();
}

export function selectArticleNode(node) {
  var x = node.querySelectorAll(Config.ArticleNodeSelectors.join(','));
  return (x && x.length > 0) ? x[x.length - 1] : getDocumentContentNode(document);
}

export function insertDocumentLevelHTML(rootNode, h, options) {
  rootNode = rootNode || document;
  options = options || {};
  h = domSanitize(h);

  options['id'] = ('id' in options) ? options.id : Config.DocumentItems[Config.DocumentItems.length - 1];

  var item = Config.DocumentItems.indexOf(options.id);

  var article = selectArticleNode(rootNode);

  var sectioningElements = ['article', 'aside', 'nav', 'section'];
  var skipElements = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

  h = '\n\
' + h;

  if (item > -1) {
    for (var i = item; i >= 0; i--) {
      var node = rootNode.querySelector('#' + Config.DocumentItems[i]);

      if (node) {
        if (skipElements.indexOf(node.nodeName.toLowerCase()) > -1) {
          node = node.closest(sectioningElements.join(',')) || article;
        }
        node.insertAdjacentHTML('afterend', h);
        break;
      }
      else if (i == 0) {
        var a = article.querySelector('h1');

        if (a) {
          a.insertAdjacentHTML('afterend', h);
        }
        else {
          article.insertAdjacentHTML('afterbegin', h);
        }
        break;
      }
    }
  }
  else {
    article.insertAdjacentHTML('afterbegin', h);
  }

  return rootNode;
}

export function setDate(rootNode, options) {
  rootNode = rootNode || document;
  options = options || {};

  var id = (options.id) ? options.id : `document-created`;

  var node = ('property' in options) ? rootNode.querySelector('#' + id + ' [property="' + options.property + '"]') : rootNode.querySelector('#' + id + ' time');

  if (node) {
    var datetime = ('datetime' in options) ? options.datetime.toISOString() : getDateTimeISO();

    if (node.getAttribute('datetime')) {
      node.setAttribute('datetime', datetime);
    }
    if (node.getAttribute('content')) {
      node.setAttribute('content', datetime);
    }
    node.textContent = datetime.substr(0, datetime.indexOf('T'));
  }
  else {
    rootNode = insertDocumentLevelHTML(rootNode, createDateHTML(options), { 'id': id });
  }

  return rootNode;
}

export function createDateHTML(options) {
  options = options || {};

  var titleKey = ('id' in options) ? options.id.replace(/^(document|dataset)-/, '') : 'created';

  var id = ('id' in options && options.id.length > 0) ? ' id="' + options.id + '"' : '';

  var c = ('class' in options && options.class.length > 0) ? ' class="' + options.class + '"' : '';

  var datetime = ('datetime' in options) ? options.datetime.toISOString() : getDateTimeISO();
  // var datetimeLabel = datetime.substr(0, datetime.indexOf('T'));
  var datetimeLabel = i18n.tDoc('datetime.time.textContent', { val: new Date(datetime) });

  var time = ('property' in options)
    ? `<time content="${datetime}" datatype="xsd:dateTime" datetime="${datetime}" property="${options.property}">${datetimeLabel}</time>`
    : `<time datetime="${datetime}">${datetimeLabel}</time>`;

  var date = `
    <dl${c}${id}>
      <dt>${i18n.tDoc(`datetime.${titleKey}.dt.textContent`)}</dt>
      <dd>${time}</dd>
    </dl>`;

  return date;
}

export function setEditSelections(options) {
  options = options || {};

  if (!('datetime' in options)) {
    options['datetime'] = new Date();
  }

  Config.ContributorRoles.forEach(contributorRole => {
    // console.log(contributorRole)
    var contributorNodeId = 'document-' + contributorRole + 's';
    var contributorNode = document.getElementById(contributorNodeId);
    if (contributorNode) {
      if (contributorNode.classList.contains('do')) {
        contributorNode.removeAttribute('class');
      }
      contributorNode.removeAttribute('contenteditable');

      var contributorSelected = document.querySelectorAll('#' + contributorNodeId + ' .do.selected');
      contributorSelected.forEach(selected => {
        selected.removeAttribute('class');
        selected.removeAttribute('contenteditable');
      });

      var remaining = document.querySelectorAll('#' + contributorNodeId + ' .do');
      remaining.forEach(i => {
        i.parentNode.removeChild(i);
      });

      var dd = document.querySelectorAll('#' + contributorNodeId + ' dd');
      if (contributorNode && dd.length == 0) {
        contributorNode = document.getElementById(contributorNodeId);
        contributorNode.parentNode.removeChild(contributorNode);
      }
    }
  });


  var documentLanguage = 'document-language';
  var dLangS = document.querySelector('#' + documentLanguage + ' option:checked');

  if (dLangS) {
    var languageValue = dLangS.value;

    var dl = dLangS.closest('#' + documentLanguage);
    dl.removeAttribute('contenteditable');

    if (languageValue == '') {
      dl.parentNode.removeChild(dl);
    }
    else {
      dl.removeAttribute('class');
      var dd = dLangS.closest('dd');
      dd.parentNode.removeChild(dd);
      dd = '<dd><span content="' + languageValue + '" lang="" property="dcterms:language" xml:lang="">' + Config.Languages[languageValue].sourceName + '</span></dd>';
      dl.insertAdjacentHTML('beforeend', dd);
    }
  }


  var documentLicense = 'document-license';
  var dLS = document.querySelector('#' + documentLicense + ' option:checked');

  if (dLS) {
    var licenseIRI = dLS.value;

    dl = dLS.closest('#' + documentLicense);
    dl.removeAttribute('contenteditable');

    if (licenseIRI == '') {
      dl.parentNode.removeChild(dl);
    }
    else {
      dl.removeAttribute('class');
      dd = dLS.closest('dd');
      dd.parentNode.removeChild(dd);
      dd = '<dd><a href="' + licenseIRI + '" rel="schema:license" title="' + Config.License[licenseIRI].description + '">' + Config.License[licenseIRI].name + '</a></dd>';
      dl.insertAdjacentHTML('beforeend', dd);
    }
  }


  var documentType = 'document-type';
  var dTS = document.querySelector('#' + documentType + ' option:checked');

  if (dTS) {
    var typeIRI = dTS.value;

    dl = dTS.closest('#' + documentType);
    dl.removeAttribute('contenteditable');

    if (typeIRI == '') {
      dl.parentNode.removeChild(dl);
    }
    else {
      dl.removeAttribute('class');
      dd = dTS.closest('dd');
      dd.parentNode.removeChild(dd);
      dd = '<dd><a href="' + typeIRI + '" rel="rdf:type">' + Config.ResourceType[typeIRI].name + '</a></dd>';
      dl.insertAdjacentHTML('beforeend', dd);
    }
  }


  var documentStatus = 'document-status';
  var dSS = document.querySelector('#' + documentStatus + ' option:checked');

  if (dSS) {
    var statusIRI = dSS.value;

    dl = dSS.closest('#' + documentStatus);
    dl.removeAttribute('contenteditable');

    if (statusIRI == '') {
      dl.parentNode.removeChild(dl);
    }
    else {
      dl.removeAttribute('class');
      dd = dSS.closest('dd');
      dd.parentNode.removeChild(dd);
      dd = '<dd prefix="pso: http://purl.org/spar/pso/" rel="pso:holdsStatusInTime" resource="#' + generateAttributeId() + '"><span rel="pso:withStatus" resource="' + statusIRI + '" typeof="pso:PublicationStatus">' + Config.PublicationStatus[statusIRI].name + '</span></dd>';

      dl.insertAdjacentHTML('beforeend', dd);

      if (statusIRI == 'http://purl.org/spar/pso/published') {
        setDate(document, { 'id': 'document-published', 'property': 'schema:datePublished', 'datetime': options.datetime });
      }
    }
  }

  var documentTestSuite = 'document-test-suite';
  var dTSS = document.querySelector('#' + documentTestSuite + ' input');

  if (dTSS) {
    var testSuiteIRI = dTSS.value;

    dl = dTSS.closest('#' + documentTestSuite);
    dl.removeAttribute('contenteditable');

    if (testSuiteIRI == '') {
      dl.parentNode.removeChild(dl);
    }
    else {
      dl.removeAttribute('class');
      dd = dTSS.closest('dd');
      dd.parentNode.removeChild(dd);
      dd = '<dd><a href="' + testSuiteIRI + '" rel="spec:testSuite">' + testSuiteIRI + '</a></dd>';
      dl.insertAdjacentHTML('beforeend', dd);
    }
  }

  var documentInbox = 'document-inbox';
  var dIS = document.querySelector('#' + documentInbox + ' input');

  if (dIS) {
    var inboxIRI = dIS.value;

    dl = dIS.closest('#' + documentInbox);
    dl.removeAttribute('contenteditable');

    if (inboxIRI == '') {
      dl.parentNode.removeChild(dl);
    }
    else {
      dl.removeAttribute('class');
      dd = dIS.closest('dd');
      dd.parentNode.removeChild(dd);
      dd = '<dd><a href="' + inboxIRI + '" rel="ldp:inbox">' + inboxIRI + '</a></dd>';
      dl.insertAdjacentHTML('beforeend', dd);
    }
  }

  var documentInReplyTo = 'document-in-reply-to';
  var dIRTS = document.querySelector('#' + documentInReplyTo + ' input');

  if (dIRTS) {
    var inReplyToIRI = dIRTS.value;

    dl = dIRTS.closest('#' + documentInReplyTo);
    dl.removeAttribute('contenteditable');

    if (inReplyToIRI == '') {
      dl.parentNode.removeChild(dl);
    }
    else {
      dl.removeAttribute('class');
      dd = dIRTS.closest('dd');
      dd.parentNode.removeChild(dd);
      dd = '<dd><a href="' + inReplyToIRI + '" rel="as:inReplyTo">' + inReplyToIRI + '</a></dd>';
      dl.insertAdjacentHTML('beforeend', dd);
    }
  }

  getResourceInfo();
}

export function getRDFaPrefixHTML(prefixes) {
  return Object.keys(prefixes).map(i => { return i + ': ' + prefixes[i]; }).join(' ');
}

//TODO: Consider if/how setDocumentRelation and createDefinitionListHTML
export function setDocumentRelation(rootNode, data, options) {
  rootNode = rootNode || document;
  if (!data || !options) { return; }

  var h = [];
  var dl = rootNode.querySelector('#' + options.id);
  var dd;

  data.forEach(d => {
    var documentRelation = domSanitize('<dd>' + createRDFaHTML(d) + '</dd>');

    if (dl) {
      if (Config.DocumentItems.indexOf(options.id) > -1) {
        dd = dl.querySelector('dd');
        dl.removeChild(dd);
      }
      else {
        var relation = dl.querySelector('[rel="' + d.rel + '"][href="' + d.href + '"]');

        if (relation) {
          dd = relation.closest('dd');
          if (dd) {
            dl.removeChild(dd);
          }
        }
      }
      dl.insertAdjacentHTML('beforeend', documentRelation);
    }
    else {
      h.push(documentRelation);
    }
  });

  if (h.length) {
    var html = '<dl id="' + options.id + '"><dt>' + options.title + '</dt>' + h.join('') + '</dl>';
    rootNode = insertDocumentLevelHTML(rootNode, html, { 'id': options.id });
  }

  return rootNode;
}

export function showTimeMap(node, url) {
  url = url || Config.OriginalResourceInfo['timemap']
  if (!url) { return; }

  var elementId = 'memento-document';

  getResourceGraph(url)
    .then(g => {
      // console.log(g)
      if (!node) {
        node = document.getElementById(elementId);
        if (!node) {
          var buttonClose = getButtonHTML({ key: 'dialog.memento-document.close.button', button: 'close', buttonClass: 'close', iconSize: 'fa-2x' });

          document.body.appendChild(fragmentFromString(`
            <aside aria-labelledby="${elementId}-label" class="do on" dir="${Config.User.UI.LanguageDir}" id="${elementId}" lang="${Config.User.UI.Language}" rel="schema:hasPart" resource="#memento-document" xml:lang="${Config.User.UI.Language}">
              <h2 id="${elementId}-label" property="schema:name">Memento</h2>
              ${buttonClose}
              <dl>
                <dt>TimeMap</dt>
                <dd><a href="${url}">${url}</a></dd>
              </dl>
            </aside>
          `));
          node = document.getElementById(elementId);
        }
      }

      var timemap = node.querySelector('.memento');

      if (timemap) {
        node.removeChild(timemap);
      }

      var items = [];
      var triples = sortGraphTriples(g, { sortBy: 'object' });
      triples.forEach(t => {
        var s = t.subject.value;
        var p = t.predicate.value;
        var o = t.object.value;

        if (p === ns.mem.mementoDateTime.value) {
          items.push('<li><a href="' + s + '" rel="noopener" target="_blank">' + o + '</a></li>');
        }
      });

      var html = '<dl class="memento"><dt>Memento</dt><dd><ul>' + items.join('') + '</ul></dd></dl>';

      node.insertAdjacentHTML('beforeend', html);

      node = document.getElementById(elementId);
      node.addEventListener('click', e => {
        if (e.target.closest('button.close')) {
          document.querySelector('#document-do .resource-memento').disabled = false
        }
      });
    })
    .catch(error => {
      // console.error(error)
    });
}

export function setDocumentStatus(rootNode, options) {
  rootNode = rootNode || document;
  options = options || {};

  var s = getDocumentStatusHTML(rootNode, options);

  rootNode = insertDocumentLevelHTML(rootNode, s, options);

  return rootNode;
}

export function getDocumentStatusHTML(rootNode, options) {
  rootNode = rootNode || document;
  options = options || {};
  options['mode'] = ('mode' in options) ? options.mode : '';
  options['id'] = ('id' in options) ? options.id : 'document-status';
  var subjectURI = ('subjectURI' in options) ? ' about="' + options.subjectURI + '"' : '';
  var typeLabel = '', typeOf = '';
  var definitionTitle;

  switch (options.type) {
    default:
      definitionTitle = 'Document Status';
      break;
    case 'mem:Memento':
      definitionTitle = 'Resource State';
      typeLabel = 'Memento';
      typeOf = ' typeof="' + options.type + '"';
      break;
  }

  var id = ' id="' + options.id + '"';
  var c = ('class' in options && options.class.length > 0) ? ' class="' + options.class + '"' : '';
  // var datetime = ('datetime' in options) ? options.datetime : util.getDateTimeISO();

  var dd = '<dd><span' + subjectURI + typeOf + '>' + typeLabel + '</span></dd>';

  var s = '';
  var dl = rootNode.querySelector('#' + options.id);

  //FIXME: mode should be an array of operations.

  //TODO: s/update/append
  switch (options.mode) {
    case 'create': default:
      s = '<dl' + c + id + '><dt>' + definitionTitle + '</dt>' + dd + '</dl>';
      break;

    case 'update':
      if (dl) {
        var clone = dl.cloneNode(true);
        dl.parentNode.removeChild(dl);
        clone.insertAdjacentHTML('beforeend', dd);
        s = clone.outerHTML;
      }
      else {
        s = '<dl' + c + id + '><dt>' + definitionTitle + '</dt>' + dd + '</dl>';
      }
      break;

    case 'delete':
      if (dl) {
        clone = dl.cloneNode(true);
        dl.parentNode.removeChild(dl);

        var t = clone.querySelector('[typeof="' + options.type + '"]');
        if (t) {
          t.closest('dl').removeChild(t.parentNode);
        }

        var cloneDD = clone.querySelectorAll('#' + options.id + ' dd');
        if (cloneDD.length > 0) {
          s = clone.outerHTML;
        }
      }
      break;
  }

  // console.log(s);
  return s;
}

export function handleDeleteNote(button) {
  button.setAttribute("disabled", "disabled");
  var article = button.closest('article');
  var refId = 'r-' + article.id;
  var li = article.closest('li:has(blockquote[cite])');
  var cite = li.querySelector('blockquote[cite]').getAttribute('cite');

  var url = new URL(cite);
  url = url.href.replace(url.hash, '');

  if (url) {
    deleteResource(url)
      .catch(error => {
        console.log(error);
        //TODO: Alert user.. try again later or..?
        li.classList.add('error');
      })
      .then(() => {
        li.parentNode.removeChild(li);
        var span = document.querySelector('span[resource="#' + refId + '"]');
        span.outerHTML = span.querySelector('mark').textContent;
        window.history.replaceState({}, null, Config.DocumentURL);
        // TODO: Delete notification or send delete activity
      })
  }
}

//TODO: Inform the user that this information feature may fetch a resource from another origin, and ask whether they want to go ahead with it.
export function eventButtonInfo() {
  const errorMessage = `<p class="error" data-i18n="info.button-info.error.p">${i18n.t('info.button-info.error.p.textContent')}</p>`;

  document.addEventListener('click', e => {
    // console.log(e.target)
    const button = e.target.closest('button.info[rel="rel:help"][resource][title]:not([disabled])');
    // console.log(button)

    if (button) {
      button.disabled = true;

      button.closest('.do')?.querySelector('div.info .error')?.remove();;

      // const rel = button.getAttribute('rel');
      const resource = button.getAttribute('resource');
      const url = stripFragmentFromString(resource);
      // console.log(rel, resource, url)

      if (!url && !title) { return; }

      let title = '';
      let description = '';
      let image = '';
      let video = '';
      let details = '';
      let seeAlso = '';
      let subject = '';

      // console.log(title) 
      //TODO: Possibly change reuse of Config.Resource to Cache API or something
      var getInfoGraph = function () {
        if (Config.Resource[url]) {
          return Promise.resolve(Config.Resource[url].graph);
        }
        else {
          return getResourceGraph(url)
            .then(graph => {
              Config.Resource[url] = { graph };
              return graph;
            });
        }
      };

      getInfoGraph()
        .then(g => {
          // console.log(g)
          var infoG = g.node(rdf.namedNode(resource));
          // console.log(infoG.dataset.toCanonical())
          title = getGraphTitle(infoG);
          description = getGraphDescription(infoG);
          // console.log(title, description)

          let imageUrl = getGraphImage(infoG);

          let seeAlsos = infoG.out(ns.rdfs.seeAlso).values;
          // console.log(seeAlsos);

          let subjects = infoG.out(ns.dcterms.subject).values;
          // console.log(subjects);

          //TODO: Multiple video values
          let videoObject = infoG.out(ns.schema.video).value;
          // console.log(videoObject);

          if (title && description) {
            if (imageUrl) {
              imageUrl = new URL(imageUrl).href;
              image = `
                <figure>
                  <img alt="" rel="schema:image" src="${imageUrl}" />
                </figure>
              `;
            }

            let videoContentUrl, videoEncodingFormat, videoThumbnailUrl, videoDuration, videoDurationLabel;

            if (videoObject) {
              let videoObjectGraph = g.node(rdf.namedNode(videoObject));

              if (videoObjectGraph) {
                videoContentUrl = videoObjectGraph.out(ns.schema.contentUrl).value;
                videoEncodingFormat = videoObjectGraph.out(ns.schema.encodingFormat).value;
                videoThumbnailUrl = videoObjectGraph.out(ns.schema.thumbnailUrl).value;
                videoDuration = videoObjectGraph.out(ns.schema.duration).value;
                // console.log(videoContentUrl, videoEncodingFormat, videoThumbnailUrl, videoDuration);

                if (videoDuration) {
                  videoDurationLabel = parseISODuration(videoDuration);
                  // console.log(videoDurationLabel);
                }
              }
            }

            if (videoContentUrl) {
              let figcaption = '';
              let duration = '';
              let encodingFormat = '';
              let comma = (videoDuration && videoEncodingFormat) ? `, ` : '';
              let thumbnailUrl = '';
              let videoPoster = '';

              if (videoDuration || videoEncodingFormat) {
                if (videoDuration) {
                  duration = `<time datatype="xsd:duration" datetime="${videoDuration}" property="schema:duration">${videoDurationLabel}</time>`;
                }

                if (videoEncodingFormat) {
                  encodingFormat = `<span lang="" property="schema:encodingFormat" xml:lang="">${videoEncodingFormat}</span>`;
                }

                if (videoThumbnailUrl) {
                  thumbnailUrl = ` (<a data-i18n="info.button-info.poster.a" href="${videoThumbnailUrl}">${i18n.t('info.button-info.poster.a.textContent')}</a>)`;
                  videoPoster = ` poster="${videoThumbnailUrl}"`;
                }

                figcaption = `
                  <figcaption><a href="${videoContentUrl}" data-i18n="info.button-info.video.a">${i18n.t('info.button-info.video.a.textContent')}</a>${thumbnailUrl} [${duration}${comma}${encodingFormat}]</figcaption>
                `;
              }

              video = `
                <figure about="${videoObject}" id="figure-dokieli-notifications" rel="schema:video" resource="#figure-dokieli-notifications">
                  <video controls="controls" crossorigin="anonymous"${videoPoster} preload="none" resource="${videoObject}" typeof="schema:VideoObject" width="800">
                    <source rel="schema:contentUrl" src="${videoContentUrl}" />
                  </video>
                  ${figcaption}
                </figure>
                `;
            }

            if (seeAlsos) {
              seeAlsos = uniqueArray(seeAlsos).sort();

              if (seeAlsos.length) {
                seeAlso = `
                  <dt data-i18n="info.button-info.see-also.dt">${i18n.t('info.button-info.see-also.dt.textContent')}</dt><dd><ul dir="auto">
                  ${seeAlsos.map(seeAlsoIRI => {
                  const seeAlsoIRIG = g.node(rdf.namedNode(seeAlsoIRI));
                  const seeAlsoTitle = getGraphTitle(seeAlsoIRIG) || seeAlsoIRI;
                  return `<li dir="auto"><a href="${seeAlsoIRI}" rel="rdfs:seeAlso noopener" target="_blank">${seeAlsoTitle}</a></li>`;
                }).join('')}
                  </ul></dd>
                `;
              }
            }

            if (subjects) {
              subjects = uniqueArray(subjects).sort();

              const subjectItems = [];

              subjects.forEach(subjectIRI => {
                const subjectIRIG = g.node(rdf.namedNode(subjectIRI));
                const subjectTitle = getGraphTitle(subjectIRIG);
                const subjectDescription = getGraphDescription(subjectIRIG);
                // console.log(subjectTitle, subjectDescription);

                if (subjectTitle.length && subjectDescription.length) {
                  subjectItems.push(`
                    <dt about="${subjectIRI}" property="skos:prefLabel">${subjectTitle}</dt>
                    <dd about="${subjectIRI}" property="skos:definition">${subjectDescription}</dd>
                  `);
                }
              })

              if (subjectItems.length) {
                subject = `
                  <dt data-i18n="info.button-info.subjects.dt" dir="auto">${i18n.t('info.button-info.subjects.dt.textContent')}</dt><dd><dl dir="auto">
                  ${subjectItems.join('')}
                  </dl></dd>
                `;
              }
            }

            details = `
              <details about="${resource}" open="" dir="auto">
                <summary property="schema:name"><span data-i18n="info.button-info.about.summary">${i18n.t('info.button-info.about.summary.textContent')}</span> ${title}</summary>
                ${image}
                <div datatype="rdf:HTML" dir="auto" property="schema:description">
                ${description}
                </div>
                ${video}
                <dl dir="auto">
                  <dt data-i18n="info.button-info.source.dt">${i18n.t('info.button-info.source.dt.textContent')}</dt>
                  <dd><a dir="ltr" href="${resource}" rel="dcterms:source noopener" target="_blank">${resource}</a></dd>
                  ${subject}
                  ${seeAlso}
                </dl>
              </details>
            `;

            //XXX: the target attribute is sanitized by DOMPurify in fragmentFromString, so it doesn't output at the moment
            // console.log(details)
          }

          return details;
        })
        .then(details => {
          e.target.closest('.do').querySelector('div.info').prepend(fragmentFromString(details));
        })
        .catch((error) => {
          button.disabled = false;
          e.target.closest('.do').querySelector('div.info').prepend(fragmentFromString(errorMessage));
        });
    }
  });
}

export function eventButtonClose() {
  document.addEventListener('click', e => {
    var button = e.target.closest('button.close')
    if (button) {
      var parent = button.parentNode;
      parent.parentNode.removeChild(parent);
    }
  });
}

export function eventButtonSignIn() {
  document.addEventListener('click', e => {
    var button = e.target.closest('button.signin-user');
    if (button) {
      button.disabled = true;
      showUserIdentityInput();
    }
  });
}

export function eventButtonSignOut() {
  document.addEventListener('click', async (e) => {
    var button = e.target.closest('button.signout-user');
    if (button) {
      button.disabled = true;
      await signOut();
    }
  });
}

export function eventButtonNotificationsToggle() {
  document.addEventListener('click', e => {
    var button = e.target.closest('button.toggle');
    if (button) {
      var aside = button.closest('aside');
      aside.classList.toggle("on");

      window.history.replaceState({}, null, Config.DocumentURL);
    }
  });
}

export function getGraphContributorsRole(g, options) {
  options = options || {};
  options['sort'] = options['sort'] || false;
  options['role'] = options['role'] || 'contributor';
  // console.log(options)
  var contributors;

  switch (options.role) {
    case 'contributor':
    default:
      contributors = getGraphContributors(g);
      break;
    case 'author':
      contributors = getGraphAuthors(g);
      break;
    case 'editor':
      contributors = getGraphEditors(g);
      break;
    case 'performer':
      contributors = getGraphPerformers(g);
      break;
    case 'publisher':
      contributors = getGraphPublishers(g);
      break;
  }

  if (!contributors || contributors.length === 0) {
    return undefined;
  }

  var contributorData = [];

  contributors.forEach(contributor => {
    var aUN = {};
    aUN['uri'] = contributor;
    //XXX: Only checks within the same document.
    var go = g.node(rdf.namedNode(contributor));

    var label = getGraphLabel(go);
    if (label) {
      aUN['name'] = label;
    }

    var email = getGraphEmail(go);
    if (email) {
      // email = (typeof email === 'string') ? email : email.iri().toString();
      aUN['email'] = email.startsWith('mailto:') ? email.slice(7) : email;
    }

    contributorData.push(aUN)
  });

  if (options.sort) {
    contributorData.sort(function (a, b) {
      // Sort by name if available, otherwise by uri, and then by email
      return a.name
        ? b.name
          ? a.name.localeCompare(b.name)
          : -1
        : b.name
          ? 1
          : a.uri.localeCompare(b.uri);
    });
  }

  return contributorData;
}

//TODO: Rename this to avoid confusion with graph.getGraphFromData
export function getGraphData(s, options) {
  var documentURL = options['subjectURI'];

  var info = {
    'state': ns.ldp.RDFSource.value,
    'profile': ns.ldp.RDFSource.value
  };

  info['graph'] = s;
  info['rdftype'] = getGraphTypes(s);

  info['title'] = getGraphTitle(s);
  // info['label'] = graph.getGraphLabel(s);
  info['published'] = getGraphPublished(s);
  info['updated'] = getGraphUpdated(s);
  info['description'] = getGraphDescription(s);
  info['license'] = getGraphLicense(s);
  info['rights'] = getGraphRights(s);
  info['language'] = getGraphLanguage(s);
  // info['summary'] = graph.getGraphSummary(s);
  // info['creator'] = graph.getGraphCreators(s);
  info['contributors'] = getGraphContributorsRole(s, { role: 'contributor' });
  info['authors'] = getGraphContributorsRole(s, { role: 'author' });
  info['editors'] = getGraphContributorsRole(s, { role: 'editor' });
  info['performers'] = getGraphContributorsRole(s, { role: 'performer' });
  info['publishers'] = getGraphContributorsRole(s, { role: 'publisher' });
  info['audience'] = getGraphAudience(s);

  info['profile'] = ns.ldp.RDFSource.value;

  //Check if the resource is immutable
  s.out(ns.rdf.type).values.forEach(type => {
    if (type == ns.mem.Memento.value) {
      info['state'] = ns.mem.Memento.value;
    }
  });

  var original = s.out(ns.mem.original).values;
  if (original.length) {
    info['state'] = ns.mem.Memento.value;
    info['original'] = original[0];

    if (info['original'] == options['subjectURI']) {
      //URI-R (The Original Resource is a Fixed Resource)
      info['profile'] = ns.mem.OriginalResource.value;
    }
    else {
      //URI-M
      info['profile'] = ns.mem.Memento.value;
    }
  }

  var memento = s.out(ns.mem.memento).values;
  if (memento.length) {
    //URI-R
    info['profile'] = ns.mem.OriginalResource.value;
    info['memento'] = memento[0];
  }

  original = s.out(ns.mem.original).values;
  memento = s.out(ns.mem.memento).values;
  if (original.length && memento.length && original[0] != memento[0]) {
    //URI-M (Memento without a TimeGate)
    info['profile'] = ns.mem.Memento.value;
    info['original'] = original[0];
    info['memento'] = memento[0];
  }

  var latestVersion = s.out(ns.rel['latest-version']).values;
  if (latestVersion.length) {
    info['latest-version'] = latestVersion[0];
  }

  var predecessorVersion = s.out(ns.rel['predecessor-version']).values;
  if (predecessorVersion.length) {
    info['predecessor-version'] = predecessorVersion[0];
  }

  var timemap = s.out(ns.mem.timemap).values;
  if (timemap.length) {
    info['timemap'] = timemap[0];
  }
  else {
    info['timemap'] = null;
  }

  var timegate = s.out(ns.mem.timegate).values;
  if (timegate.length) {
    info['timegate'] = timegate[0];
  }

  if (!Config.OriginalResourceInfo || ('mode' in options && options.mode == 'update')) {
    Config['OriginalResourceInfo'] = info;
  }

  info['inbox'] = getGraphInbox(s);
  info['annotationService'] = s.out(ns.oa.annotationService).values;

  //TODO: Refactor
  //FIXME: permissionsActions, specrequirement, skosConceptSchemes are assumed to be from document's policies

  var hasPolicy = s.out(ns.odrl.hasPolicy).values;
  if (hasPolicy.length && s.term.value == documentURL) {
    info['odrl'] = getResourceInfoODRLPolicies(s);
  }

  info['spec'] = {};

  var classesOfProducts = s.out(ns.spec.classesOfProducts).values;
  if (classesOfProducts.length && s.term.value == documentURL) {
    info['spec']['classesOfProducts'] = getResourceInfoSpecClassesOfProducts(s);
  }

  var requirement = s.out(ns.spec.requirement).values;
  if (requirement.length && s.term.value == documentURL) {
    info['spec']['requirement'] = getResourceInfoSpecRequirements(s);
  }

  var changelog = s.out(ns.spec.changelog);
  if (changelog.values.length && s.term.value == documentURL) {
    if (changelog.out(ns.spec.change).values.length) {
      info['spec']['change'] = getResourceInfoSpecChanges(changelog);
    }
  }

  var advisement = s.out(ns.spec.advisement).values;
  if (advisement.length && s.term.value == documentURL) {
    info['spec']['advisement'] = getResourceInfoSpecAdvisements(s);
  }

  //XXX: change i to s. testing. should be same as subjectURI?
  info['skos'] = getResourceInfoSKOS(s);
  info['citations'] = getResourceInfoCitations(s);

  info['video'] = s.out(ns.schema.video).values;
  info['audio'] = s.out(ns.schema.audio).values;

  return info;
}

/**
 * getResourceInfo
 * 
 * @param
 * @param 
 * @returns {Promise<Object>}
 */

export async function getResourceInfo(data, options) {
  const documentOptions = {
    ...Config.DOMProcessing,
    format: true,
    sanitize: true,
    normalize: true
  };

  data = data || getDocument(null, documentOptions);

  options = options || {};
  options['contentType'] = ('contentType' in options) ? options.contentType : 'text/html';
  options['subjectURI'] = ('subjectURI' in options) ? options.subjectURI : Config.DocumentURL;

  var documentURL = options['subjectURI'];

  Config['Resource'] = Config['Resource'] || {};
  Config['Resource'][documentURL] = Config['Resource'][documentURL] || {};
  Config['Resource'][documentURL]['data'] = data;
  if (options['storeHash']) {
    Config['Resource'][documentURL]['digestSRI'] = await getHash(data);
  }
  Config['Resource'][documentURL]['contentType'] = options.contentType;

  var promises = [];

  promises.push(getGraphFromDataBlock(data, options));
  promises.push(getGraphFromData(data, options));

  return Promise.allSettled(promises)
    .then(resolvedPromises => {
      const dataset = rdf.dataset();

      resolvedPromises.forEach(response => {
        if (response.value) {
          dataset.addAll(response.value.dataset);
        }
      })

      return rdf.grapoi({ dataset });
    })
    .then(g => {
      g = g.node(rdf.namedNode(documentURL));

      var info = getGraphData(g, options);

      for (var key in info) {
        if (Object.hasOwn(info, key) && key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
          Config['Resource'][documentURL][key] = info[key];
        }
      }

      return info;
    });
}

export function getGraphFromDataBlock(data, options) {
  var documentURL = options['subjectURI'];

  if (Config.MediaTypes.Markup.includes(options.contentType)) {
    var node = getDocumentNodeFromString(data, options);

    var selectors = Config.MediaTypes.RDF
      .filter(mediaType => {
        return !Config.MediaTypes.Markup.includes(mediaType);
      })
      .map(mediaType => {
        return 'script[type="' + mediaType + '"]';
      });
    // console.log(selectors)
    var promises = [];

    var scripts = node.querySelectorAll(selectors.join(', '));
    // console.log(scripts)
    scripts.forEach(script => {
      var scriptType = script.getAttribute('type').trim();
      var scriptData = script.textContent;
      // console.log(scriptData)
      var matches = Array.from(scriptData.matchAll(/<!\[CDATA\[(.*?)\]\]>/gs));
      if (matches.length > 0) {
        scriptData = matches.map(match => match[1].trim()).join('\n');
      }
      // console.log(scriptData)
      //Cleans up the data block from comments at the beginning and end of the script.
      var lines = scriptData.split(/\r\n|\r|\n/);
      lines = lines.filter((line, index) => {
        if (index === 0 || index === lines.length - 1) {
          line = line.trim();
          return !line.startsWith('#') && !line.startsWith('//');
        }
        return true;
      });
      scriptData = lines.join('\n');

      // console.log(scriptData)

      var o = {
        'subjectURI': documentURL,
        'contentType': scriptType
      }

      promises.push(getGraphFromData(scriptData, o))
    });

    return Promise.allSettled(promises)
      .then(resolvedPromises => {
        const dataset = rdf.dataset();

        resolvedPromises.forEach(response => {
          // console.log(response.value)
          if (response.value) {
            dataset.addAll(response.value.dataset);
          }
        })

        return rdf.grapoi({ dataset });
      });
  }
  else {
    return Promise.resolve();
  }
}

export async function updateResourceInfos(documentURL = Config.DocumentURL, data, response, options = {}) {
  const documentOptions = {
    ...Config.DOMProcessing,
    format: true,
    sanitize: true,
    normalize: true
  };

  data = data || getDocument(null, documentOptions);

  const storeHash = options.storeHash !== false;

  await getResourceInfo(data, { storeHash }).then(resourceInfo => {
    Config.Resource[documentURL] = { ...Config.Resource[documentURL], ...resourceInfo };
  });

  if (response) {
    updateSupplementalInfo(response, options);
  }
  else {
    await getResourceSupplementalInfo(documentURL, options);
  }

  updateButtons();
}

export function updateSupplementalInfo(response, options = {}) {
  var checkHeaders = options?.checkHeaders ?? ['wac-allow', 'link', 'last-modified', 'etag', 'expires', 'date', 'allow'];
  var headers = response.headers;
  var documentURL = options?.documentURL || Config.DocumentURL;

  const preservedHeaders = {};
  if (options?.preserveHeaders?.length) {
    for (const key of options.preserveHeaders) {
      const existing = Config['Resource'][documentURL]?.headers?.[key];
      if (existing !== undefined) {
        preservedHeaders[key] = existing;
      }
    }
  }

  Config['Resource'][documentURL]['response'] = response;
  Config['Resource'][documentURL]['headers'] = { ...preservedHeaders };
  Config['Resource'][documentURL]['headers']['response'] = headers;

  checkHeaders.forEach(header => {
    var headerValue = response.headers.get(header);
    // headerValue = 'foo=bar ,user=" READ wriTe Append control ", public=" read append" ,other="read " , baz= write, group=" ",,';

    if (headerValue) {
      Config['Resource'][documentURL]['headers'][header] = { 'field-value': headerValue };

      if (header == 'wac-allow') {
        var permissionGroups = Config['Resource'][documentURL]['headers']['wac-allow']['field-value'];
        var wacAllowRegex = new RegExp(/(\w+)\s*=\s*"?\s*((?:\s*[^",\s]+)*)\s*"?/, 'ig');
        var wacAllowMatches = matchAllIndex(permissionGroups, wacAllowRegex);

        Config['Resource'][documentURL]['headers']['wac-allow']['permissionGroup'] = {};

        wacAllowMatches.forEach(match => {
          var modesString = match[2] || '';
          var accessModes = uniqueArray(modesString.toLowerCase().split(/\s+/));

          Config['Resource'][documentURL]['headers']['wac-allow']['permissionGroup'][match[1]] = accessModes;
        });
      }

      else if (header == 'link') {
        var linkHeaders = LinkHeader.parse(headerValue);

        Config['Resource'][documentURL]['headers']['linkHeaders'] = linkHeaders;

        Config['Resource'][documentURL]['headers']['linkHeaders'].refs.forEach(relationItem => {
          relationItem.rel = relationItem.rel.toLowerCase();
          var linkTarget = relationItem.uri;

          if (!linkTarget.startsWith('http:') && !linkTarget.startsWith('https:')) {
            linkTarget = relationItem.uri = getAbsoluteIRI(getBaseURL(response.url), linkTarget);
          }
        });
      }

      else if (header == 'allow') {
        Config['Resource'][documentURL]['headers']['allow'] = headerValue.toLowerCase().split(',').map(s => s.trim());
      }
    }
  })
}

export function getResourceSupplementalInfo(documentURL, options) {
  options = options || {};
  options['reuse'] = options['reuse'] === true ? true : false;
  options['followLinkRelationTypes'] = options['followLinkRelationTypes'] || [];

  //TODO: Add `acl` and `http://www.w3.org/ns/solid/terms#storageDescription` to `linkRelationTypesOfInterest` and process them.

  if (options.reuse) {
    const currentDate = new Date();
    const previousResponse = Config['Resource'][documentURL].headers?.response;
    const previousResponseDateHeaderValue = previousResponse?.get('date');
    const previousResponseDate = previousResponseDateHeaderValue ? new Date(previousResponseDateHeaderValue) : null;

    if (!previousResponse || !previousResponseDateHeaderValue || (previousResponseDate && (currentDate.getTime() - previousResponseDate.getTime() > Config.RequestCheck.Timer))) {
      options.reuse = false;
    }
  }

  if (!options.reuse) {
    var rHeaders = { 'Cache-Control': 'no-cache' };
    var rOptions = { 'noCache': true };
    return getResourceHead(documentURL, rHeaders, rOptions)
      .then(response => {
        updateSupplementalInfo(response);
        processSupplementalInfoLinkHeaders(documentURL, options);
      });
  }
  else {
    return Promise.resolve(Config['Resource'][documentURL]);
  }
}

export function processSupplementalInfoLinkHeaders(documentURL, options = {}) {
  var promises = [];
  var linkHeaders = Config['Resource'][documentURL]['headers']?.['linkHeaders'];

  if (linkHeaders) {
    linkHeaders.refs.forEach(relationItem => {
      var relationType = relationItem.rel;
      var linkTarget = relationItem.uri;
      //TODO: GET acl linkTarget only if user/public has control permission.
      if ('followLinkRelationTypes' in options && options.followLinkRelationTypes.includes(relationType)) {
        promises.push(getResourceGraph(linkTarget));
      }
    });
  }

  return Promise.allSettled(promises)
    .then(results => {
      results.forEach(result => {
        var g = result.value;

        if (g) {
          //FIXME: Consider the case where `linkTarget` URL is redirected and so may not be same as `s`.
          var s = g.term.value;
          Config['Resource'][s] = {};
          Config['Resource'][s]['graph'] = g;
        }
      });

      return Config['Resource'][documentURL];
    });
}

export function getResourceInfoCitations(g) {
  var documentURL = Config.DocumentURL;
  var citationProperties = Object.keys(Config.Citation).concat([ns.dcterms.references.value, ns.schema.citation.value]);

  var predicates = citationProperties.map((property) => {
    return rdf.namedNode(property);
  })

  var citationsList = g.out(predicates).distinct().values;

  var externals = [];
  citationsList.forEach(i => {
    var iAbsolute = stripFragmentFromString(i);
    if (iAbsolute !== documentURL) {
      externals.push(iAbsolute)
    }
  });
  citationsList = uniqueArray(externals).sort();

  return citationsList;
}

//TODO: Review grapoi
export function getResourceInfoODRLPolicies(s) {
  var info = {}
  info['odrl'] = {};

  var policy = s.out(ns.odrl.hasPolicy);

  // for (const policy of s.outzodrl.hasPolicy)) {
  //   const policyIRI = policy.value

  //   for (const policyType of policy.out(ns.rdf.type)) {
  //     const policyTypeIRI = policyType.values;
  //   }

  // }
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

export function getResourceInfoSpecClassesOfProducts(s) {
  var info = {}
  info['spec'] = {};
  info['spec']['classesOfProducts'] = {};

  // console.trace();
  s.out(ns.spec.classesOfProducts).values.forEach(classesOfProductsConceptSchemeIRI => {
    info['spec']['classesOfProducts'] = {};
    info['spec']['classesOfProducts'][classesOfProductsConceptSchemeIRI] = {};

    var classesOfProductsGraph = s.node(rdf.namedNode(classesOfProductsConceptSchemeIRI));
    info['spec']['classesOfProducts'][classesOfProductsConceptSchemeIRI]['skos'] = getResourceInfoSKOS(classesOfProductsGraph);
    var conceptSchemes = info['spec']['classesOfProducts'][classesOfProductsConceptSchemeIRI]['skos'].data;
    if (conceptSchemes) {
      Object.keys(conceptSchemes).forEach(conceptScheme => {
        var conceptIRIs = conceptSchemes[conceptScheme][ns.skos.hasTopConcept];
        if (conceptIRIs) {
          conceptIRIs.forEach(conceptIRI => {
            var conceptGraph = s.node(rdf.namedNode(conceptIRI));
            Config.Resource[conceptIRI] = {};
            Config.Resource[conceptIRI]['graph'] = conceptGraph;
            Config.Resource[conceptIRI]['skos'] = getResourceInfoSKOS(conceptGraph);
          })
        }
      })
    }
  });

  return info['spec']['classesOfProducts'];
}

//XXX: Should this be stored for cheaper reuse?
export function getClassesOfProductsConcepts() {
  var concepts = [];

  if (Config.Resource[Config.DocumentURL]?.spec?.classesOfProducts) {
    var classesOfProducts = Config.Resource[Config.DocumentURL]?.spec?.classesOfProducts;

    Object.keys(classesOfProducts).forEach(conceptSchemeIRI => {
      var conceptScheme = classesOfProducts[conceptSchemeIRI].skos.data;
      var hasTopConcepts = conceptScheme[conceptSchemeIRI][ns.skos.hasTopConcept];
      if (hasTopConcepts) {
        concepts = concepts.concat(hasTopConcepts);
      }
    })
  }

  return concepts;
}


//TODO: Review grapoi
export function getResourceInfoSpecRequirements(s) {
  var info = {}
  info['spec'] = {};
  info['spec']['requirement'] = {};

  s.out(ns.spec.requirement).values.forEach(requirementIRI => {
    info['spec']['requirement'][requirementIRI] = {};

    var requirementGraph = s.node(rdf.namedNode(requirementIRI));
    info['spec']['requirement'][requirementIRI][ns.spec.statement.value] = requirementGraph.out(ns.spec.statement).values[0];
    info['spec']['requirement'][requirementIRI][ns.spec.requirementSubject.value] = requirementGraph.out(ns.spec.requirementSubject).values[0];
    info['spec']['requirement'][requirementIRI][ns.spec.requirementLevel.value] = requirementGraph.out(ns.spec.requirementLevel).values[0];

    Object.keys(Config.Citation).forEach(citationIRI => {
      var requirementCitations = requirementGraph.out(rdf.namedNode(citationIRI)).values;

      if (requirementCitations.length) {
        info['spec']['requirement'][requirementIRI][citationIRI] = requirementCitations;
      }
    });

    var seeAlso = requirementGraph.out(ns.rdfs.seeAlso).values;
    if (seeAlso.length) {
      info['spec']['requirement'][requirementIRI][ns.rdfs.seeAlso.value] = seeAlso;
    }
  });

  // console.log(info['spec']['requirement']);

  return info['spec']['requirement'];
}

//TODO: Review grapoi
export function getResourceInfoSpecAdvisements(s) {
  var info = {}
  info['spec'] = {};
  info['spec']['advisement'] = {};

  s.out(ns.spec.advisement).values.forEach(advisementIRI => {
    info['spec']['advisement'][advisementIRI] = {};

    var advisementGraph = s.node(rdf.namedNode(advisementIRI));

    info['spec']['advisement'][advisementIRI][ns.spec.statement.value] = advisementGraph.out(ns.spec.statement).values[0];
    // info['spec'][advisementIRI][ns.spec.advisementSubject.value] = advisementSubject;
    info['spec']['advisement'][advisementIRI][ns.spec.advisementLevel.value] = advisementGraph.out(ns.spec.advisementLevel).values[0];
    var advisementCitations = advisementGraph.out(rdf.namedNode(advisementIRI)).values;

    Object.keys(Config.Citation).forEach(citationIRI => {
      if (advisementCitations.length) {
        info['spec']['advisement'][advisementIRI][citationIRI] = advisementCitations;
      }
    });

    var seeAlso = advisementGraph.out(ns.rdfs.seeAlso).values;
    if (seeAlso.length) {
      info['spec']['advisement'][advisementIRI][ns.rdfs.seeAlso.value] = seeAlso;
    }
  });

  // console.log(info['spec']['advisement']);

  return info['spec']['advisement'];
}

//TODO: Review grapoi
export function getResourceInfoSpecChanges(s) {
  var info = {}
  info['change'] = {};

  var change = s.out(ns.spec.change);

  change.values.forEach(changeIRI => {
    var changeGraph = s.node(rdf.namedNode(changeIRI));
    info['change'][changeIRI] = {};
    info['change'][changeIRI][ns.spec.statement.value] = changeGraph.out(ns.spec.statement).values[0];
    info['change'][changeIRI][ns.spec.changeSubject.value] = changeGraph.out(ns.spec.changeSubject).values[0];
    info['change'][changeIRI][ns.spec.changeClass.value] = changeGraph.out(ns.spec.changeClass).values[0];
  });

  return info['change'];
}

//TODO: Review grapoi
export function getResourceInfoSKOS(g) {
  var info = {};
  info['skos'] = { 'data': {}, 'type': {} };

  const quads = [];

  // g.out().filter(ptr => {
  //   return [...ptr.quads()][0].predicate.value.startsWith('')
  // })

  // const people = []

  // for (const person of g.node(null).hasOut(ns.rdf.type, ns.foaf.Person).hasOut(ns.foaf.image)) {
  //   people.push({
  //     firstName: person.out(ns.foaf.firstName).value,
  //     image: ptr.out(ns.foaf.image).value
  //   })
  //  }

  //  const images = await Promise.all(g.node([person1])
  //  .map(ptr => fetch(ptr.out(ns.foaf.image).value)))
  //  //.out([ns.foaf.firstName, ns.foaf.lastName]).values.join(' ')

  // console.log(g.terms.length)
  // console.log(Array.from(g.out().quads()).length)
  g.out().quads().forEach(t => {
    // console.log(t)
    var s = t.subject.value;
    var p = t.predicate.value;
    var o = t.object.value;
    // console.log(s, p, o)
    var isRDFType = (p == ns.rdf.type.value) ? true : false;
    var isSKOSProperty = p.startsWith('http://www.w3.org/2004/02/skos/core#');
    var isSKOSObject = o.startsWith('http://www.w3.org/2004/02/skos/core#');

    // console.log(isRDFType, isSKOSProperty, isSKOSObject);

    if (isRDFType && isSKOSObject) {
      info['skos']['type'][o] = info['skos']['type'][o] || [];
      info['skos']['type'][o].push(s);
    }

    if (isSKOSProperty || (isRDFType && isSKOSObject)) {
      info['skos']['data'][s] = info['skos']['data'][s] || {};
      info['skos']['data'][s][p] = info['skos']['data'][s][p] || [];
      info['skos']['data'][s][p].push(o);
      quads.push(t);
    }
  });

  // console.log(info['skos']);
  // console.log(quads);
  const dataset = rdf.dataset(quads);
  // console.log(dataset);
  info['skos']['graph'] = rdf.grapoi({ dataset });

  return info['skos'];
}

export function accessModeAllowed(documentURL, mode) {
  documentURL = documentURL || Config.DocumentURL;

  const wac = Config.Resource?.[documentURL]?.headers?.['wac-allow']?.permissionGroup;
  if (!wac) return false;

  return (
    (wac.user && wac.user.includes(mode)) ||
    (wac.public && wac.public.includes(mode))
  );
}

export function accessModePossiblyAllowed(documentURL, mode) {
  documentURL = documentURL || Config.DocumentURL;

  const wac = Config.Resource?.[documentURL]?.headers?.['wac-allow']?.permissionGroup;

  if (!wac) return true;

  return accessModeAllowed(documentURL, mode);
}

export function createImmutableResource(url, data, options) {
  if (!url) return;

  const documentOptions = {
    ...Config.DOMProcessing,
    format: true,
    sanitize: true,
    normalize: true
  };

  var uuid = generateUUID();
  var containerIRI = url.substr(0, url.lastIndexOf('/') + 1);
  var immutableURL = containerIRI + uuid;

  var rootNode = document.documentElement.cloneNode(true);

  var date = new Date();
  rootNode = setDate(rootNode, { 'id': 'document-created', 'property': 'schema:dateCreated', 'datetime': date });

  var resourceState = rootNode.querySelector('#' + 'document-resource-state');
  if (!resourceState) {
    var rSO = {
      'id': 'document-resource-state',
      'subjectURI': '',
      'type': 'mem:Memento',
      'mode': 'create'
    }

    rootNode = setDocumentStatus(rootNode, rSO);
  }

  var r, o;

  o = { 'id': 'document-identifier', 'title': 'Identifier' };
  r = { 'rel': 'owl:sameAs', 'href': immutableURL };
  rootNode = setDocumentRelation(rootNode, [r], o);

  o = { 'id': 'document-original', 'title': 'Original resource' };
  if (Config.OriginalResourceInfo['state'] == ns.mem.Memento.value
    && Config.OriginalResourceInfo['profile'] == ns.mem.OriginalResource.value) {
    r = { 'rel': 'mem:original', 'href': immutableURL };
  }
  else {
    r = { 'rel': 'mem:original', 'href': url };
  }
  rootNode = setDocumentRelation(rootNode, [r], o);

  //TODO document-timegate

  var timeMapURL = Config.OriginalResourceInfo['timemap'] || url + '.timemap';
  o = { 'id': 'document-timemap', 'title': 'TimeMap' };
  r = { 'rel': 'mem:timemap', 'href': timeMapURL };
  rootNode = setDocumentRelation(rootNode, [r], o);

  // Create URI-M
  data = getDocument(rootNode, documentOptions);
  processSave(containerIRI, uuid, data, options)
    .then((resolved) => handleActionMessage(resolved))
    .catch((rejected) => handleActionMessage(null, rejected))
    .finally(() => {
      getResourceInfo(data, { 'mode': 'update' });
    });

  timeMapURL = Config.OriginalResourceInfo['timemap'] || url + '.timemap';


  //Update URI-R
  if (Config.OriginalResourceInfo['state'] != ns.mem.Memento.value) {
    setDate(document, { 'id': 'document-created', 'property': 'schema:dateCreated', 'datetime': date });

    o = { 'id': 'document-identifier', 'title': 'Identifier' };
    r = { 'rel': 'owl:sameAs', 'href': url };
    setDocumentRelation(document, [r], o);

    o = { 'id': 'document-latest-version', 'title': 'Latest Version' };
    r = { 'rel': 'mem:memento rel:latest-version', 'href': immutableURL };
    setDocumentRelation(document, [r], o);

    if (Config.OriginalResourceInfo['latest-version']) {
      o = { 'id': 'document-predecessor-version', 'title': 'Predecessor Version' };
      r = { 'rel': 'mem:memento rel:predecessor-version', 'href': Config.OriginalResourceInfo['latest-version'] };
      setDocumentRelation(document, [r], o);
    }

    //TODO document-timegate

    o = { 'id': 'document-timemap', 'title': 'TimeMap' };
    r = { 'rel': 'mem:timemap', 'href': timeMapURL };
    setDocumentRelation(document, [r], o);

    // Create URI-R
    data = getDocument(null, documentOptions);
    processSave(url, null, data, options)
      .then((resolved) => handleActionMessage(resolved))
      .catch((rejected) => handleActionMessage(null, rejected))
  }


  //Update URI-T
  var insertG = '<' + url + '> <http://mementoweb.org/ns#memento> <' + immutableURL + '> .\n\
<' + immutableURL + '> <http://mementoweb.org/ns#mementoDateTime> "' + date.toISOString() + '"^^<http://www.w3.org/2001/XMLSchema#dateTime> .';

  var patch = { 'insert': insertG };

  patchResourceWithAcceptPatch(timeMapURL, patch).then(() => {
    showTimeMap(null, timeMapURL)
  });
}

export function createMutableResource(url, data, options) {
  if (!url) return;

  const documentOptions = {
    ...Config.DOMProcessing,
    format: true,
    sanitize: true,
    normalize: true
  };

  //TODO: Should this options include `datetime: new Date()` similar to createImmutableResource?
  setDate(document, { 'id': 'document-created', 'property': 'schema:dateCreated' });

  var uuid = generateUUID();
  var containerIRI = url.substr(0, url.lastIndexOf('/') + 1);
  var mutableURL = containerIRI + uuid;

  var r, o;

  o = { 'id': 'document-identifier', 'title': 'Identifier' };
  r = { 'rel': 'owl:sameAs', 'href': mutableURL };
  setDocumentRelation(document, [r], o);

  o = { 'id': 'document-latest-version', 'title': 'Latest Version' };
  r = { 'rel': 'rel:latest-version', 'href': mutableURL };
  setDocumentRelation(document, [r], o);

  if (Config.OriginalResourceInfo['latest-version']) {
    o = { 'id': 'document-predecessor-version', 'title': 'Predecessor Version' };
    r = { 'rel': 'rel:predecessor-version', 'href': Config.OriginalResourceInfo['latest-version'] };
    setDocumentRelation(document, [r], o);
  }

  data = getDocument(null, documentOptions);

  processSave(containerIRI, uuid, data, options)
    .then((resolved) => handleActionMessage(resolved))
    .catch((rejected) => handleActionMessage(null, rejected))

  o = { 'id': 'document-identifier', 'title': 'Identifier' };
  r = { 'rel': 'owl:sameAs', 'href': url };
  setDocumentRelation(document, [r], o);

  data = getDocument(null, documentOptions);

  processSave(url, null, data, options)
    .then((resolved) => handleActionMessage(resolved))
    .catch((rejected) => handleActionMessage(null, rejected))
    .finally(() => {
      getResourceInfo(data, { 'mode': 'update' });
    });
}

export function updateMutableResource(url, data, options) {
  if (!url) return;
  options = options || {};

  const documentOptions = {
    ...Config.DOMProcessing,
    format: true,
    sanitize: true,
    normalize: true
  };

  var rootNode = (data) ? fragmentFromString(data).cloneNode(true) : document;

  if (!('datetime' in options)) {
    options['datetime'] = new Date();
  }

  setDate(rootNode, { 'id': 'document-modified', 'property': 'schema:dateModified', 'datetime': options.datetime });
  setEditSelections(options);

  data = getDocument(null, documentOptions);

  processSave(url, null, data, options)
    .then((resolved) => handleActionMessage(resolved))
    .catch((rejected) => handleActionMessage(null, rejected))
    .finally(() => {
      getResourceInfo(data, { 'mode': 'update' });
    });
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

export function removeReferences() {
  var refs = document.querySelectorAll('body *:not([id="references"]) cite + .ref:not(.do)');

  refs.forEach(r => {
    r.parentNode.removeChild(r);
  });
}


export function referenceItemHTML(referencesList, id, citation) {
  var referencesListNodeName = referencesList.nodeName.toLowerCase();
  var s = '';

  switch (referencesListNodeName) {
    case 'ol':
    case 'ul':
    default:
      s = '<li id="' + id + '">' + citation + '</li>';
      break;
    case 'dl':
      s = '<dt id="' + id + '"></dt><dd>' + citation + '</dd>';
      break;
  }

  return s;
}


export function buildReferences(referencesList, id, citation) {
  if (!referencesList) {
    var nodeInsertLocation = selectArticleNode(document);
    var section = '<section id="references"><h2>References</h2><div><ol></ol></div></section>';
    nodeInsertLocation.insertAdjacentHTML('beforeend', section);
  }

  var references = document.querySelector('#references');
  referencesList = references.querySelector('dl, ol, ul');

  updateReferences(referencesList);

  if (citation) {
    var citationItem = referenceItemHTML(referencesList, id, citation);
    referencesList.insertAdjacentHTML('beforeend', citationItem);
  }
}

export function updateReferences(referencesList, options) {
  options = options || {};
  options['external'] = options.external || true;
  options['internal'] = options.internal || false;

  var citeA = document.querySelectorAll('body *:not([id="references"]) cite > a');
  var uniqueCitations = {};
  var lis = [];

  var docURL = document.location.origin + document.location.pathname;

  var insertRef = function (cite, rId, refId, refLabel) {
    // console.log(cite);
    // console.log(rId);
    // console.log(refId);
    // console.log(refLabel)
    var ref = '<span class="ref"> <span class="ref-reference" id="' + rId + '">' + Config.RefType[Config.DocRefType].InlineOpen + '<a href="#' + refId + '">' + refLabel + '</a>' + Config.RefType[Config.DocRefType].InlineClose + '</span></span>';
    cite.insertAdjacentHTML('afterend', ref);
  }

  citeA.forEach(a => {
    var ref, refId, refLabel, rId;
    var cite = a.parentNode;
    var jumpLink;

    if ((options.external && !a.href.startsWith(docURL + '#')) ||
      (options.internal && a.href.startsWith(docURL + '#'))) {

      refId = uniqueCitations[a.outerHTML];
      rId = 'r-' + generateAttributeId();

      if (refId) {
        refLabel = refId;
        refId = 'ref-' + refId;
        // console.log(refId)
        // console.log(rId)

        jumpLink = document.querySelector('#' + refId + ' .jumplink');
        // console.log(jumpLink)
        if (jumpLink) {
          var supAs = jumpLink.querySelectorAll('sup a');

          var newJumpLink = [];
          supAs.forEach((a, key) => {
            newJumpLink.push(' <sup><a href="#' + getFragmentFromString(a.href) + '">' + String.fromCharCode(key + 97) + '</a></sup>');
          });
          newJumpLink.push(' <sup><a href="#' + rId + '">' + String.fromCharCode(supAs.length + 97) + '</a></sup>');

          newJumpLink = fragmentFromString('<span class="jumplink"><sup>^</sup>' + newJumpLink.join(' ') + '</span>');

          jumpLink.parentNode.replaceChild(newJumpLink, jumpLink);

          insertRef(cite, rId, refId, refLabel);
        }
      }
      else {
        var length = Object.keys(uniqueCitations).length;

        uniqueCitations[a.outerHTML] = length + 1;

        refLabel = (length + 1);
        refId = 'ref-' + (length + 1);

        var rel = a.getAttribute('rel');
        // var property = a.getAttribute('property');

        var versionDate = a.getAttribute('data-versiondate') || '';
        var versionURL = a.getAttribute('data-versionurl') || '';
        var title = a.getAttribute('title');
        title = title ? ' title="' + title + '"' : '';


        if (versionDate && versionURL) {
          // && (a.href.startsWith('http:') || a.href.startsWith('https:'))) {
          // console.log(a);

          versionDate = ' data-versiondate="' + versionDate + '"';
          versionURL = ' data-versionurl="' + versionURL + '"';
        }

        var anchor = '<a ' + versionDate + versionURL + ' href="' + a.href + '"' + title + '>' + a.href + '</a>';

        jumpLink = '<span class="jumplink"><sup><a href="#' + rId + '">^</a></sup></span>';

        //FIXME: Better to add to an array and then insert but need to update the DOM before.

        var referencesListNodeName = referencesList.nodeName.toLowerCase();
        var citation = '';

        switch (referencesListNodeName) {
          case 'ol':
          case 'ul':
          default:
            citation = jumpLink + ' <cite>' + a.textContent + '</cite>, <cite>' + anchor + '</cite>';
            break;
          case 'dl':
            citation = '<cite>' + a.textContent + '</cite>, <cite>' + anchor + '</cite>';
            break;
        }

        var referenceItem = referenceItemHTML(referencesList, refId, citation);

        referencesList.insertAdjacentHTML('beforeend', referenceItem);

        insertRef(cite, rId, refId, refLabel);
      }

      // cite.insertAdjacentHTML('afterend', ref);
    }
  })
  // console.log(uniqueCitations);

  // if (lis.length > 0) {
  //   var updatedList = util.fragmentFromString('<ol>' + lis.join('') + '</ol>');
  //   referencesOl.parentNode.replaceChild(updatedList, referencesOl);

  // XXX: Expensive!
  // document.querySelectorAll('#references cite > a[data-versionurl][data-originalurl').forEach(a => {
  //   showRobustLinksDecoration(a.parentNode);
  // })
}

export function showRobustLinksDecoration(node) {
  node = node || document;
  // console.log(node)
  var nodes = node.querySelectorAll('[data-versionurl], [data-originalurl]');
  // console.log(nodes)
  nodes.forEach(i => {
    if (i.nextElementSibling && i.nextElementSibling.classList.contains('do') && i.nextElementSibling.classList.contains('robustlinks')) {
      return;
    }

    var href = i.getAttribute('href');

    var originalurl = i.getAttribute('data-originalurl');
    originalurl = (originalurl) ? originalurl.trim() : undefined;
    originalurl = (originalurl) ? `<span data-i18n="popup.robustlinks.original.span">${i18n.t('popup.robustlinks.original.span.textContent')}</span><span><a href="${originalurl}" rel="noopener" target="_blank">${originalurl}</a></span>` : '';

    var versionurl = i.getAttribute('data-versionurl');
    versionurl = (versionurl) ? versionurl.trim() : undefined;
    var versiondate = i.getAttribute('data-versiondate');
    var nearlinkdateurl = '';

    if (versiondate) {
      versiondate = versiondate.trim();
      nearlinkdateurl = 'http://timetravel.mementoweb.org/memento/' + versiondate.replace(/\D/g, '') + '/' + href;
      nearlinkdateurl = `<span data-i18n="popup.robustlinks.near-link-date.span">${i18n.t('popup.robustlinks.near-link-date.span.textContent')}</span><span><a href="${nearlinkdateurl}" rel="noopener" target="_blank">${versiondate}</a></span>`;
    }
    else if (versionurl) {
      versiondate = versionurl;
    }

    versionurl = (versionurl) ? `<span data-i18n="popup.robustlinks.version.span">${i18n.t('popup.robustlinks.version.span.textContent')}</span><span><a href="${versionurl}" rel="noopener" target="_blank">${versiondate}</a></span>` : '';

    // var citations = Object.keys(Config.Citation).concat(ns.schema.citation);

    //FIXME: This is ultimately inaccurate because it should be obtained through RDF parser
    var citation = '';
    var citationLabels = [];
    var iri;
    var citationType;
    var rel = i.getAttribute('rel');

    if (rel) {
      citationLabels = getCitationLabelsFromTerms(rel);

      if (citationLabels.length > 0) {
        citationType = citationLabels.join(', ');
        citation = `<span data-i18n="popup.robustlinks.citation-reason.span">${i18n.t('popup.robustlinks.citation-reason.span.textContent')}</span><span>${citationType}</span>`;
      }
    }

    i.insertAdjacentHTML('afterend', `<span class="do robustlinks">${getButtonHTML({ key: 'popup.robustlinks.show.button', button: 'robustify-links' })}<span>${citation}${originalurl}${versionurl}${nearlinkdateurl}</span></span>`);
  });

  document.querySelectorAll('.do.robustlinks').forEach(i => {
    i.addEventListener('click', (e) => {
      const button = e.target.closest('button');
      if (button) {
        button.parentNode.classList.toggle("on");
      }
    });
  });
}

export function getCitationLabelsFromTerms(rel, citations) {
  citations = citations || Object.keys(Config.Citation);

  var citationLabels = [];

  rel.split(' ').forEach(term => {
    if (Config.Citation[term]) {
      citationLabels.push(Config.Citation[term]);
    }
    else {
      var s = term.split(':');
      if (s.length == 2) {
        citations.forEach(c => {
          if (s[1] == getFragmentFromString(c) || s[1] == getURLLastPath(c)) {
            citationLabels.push(Config.Citation[c])
          }
        });
      }
    }
  });

  return citationLabels
}

export function getTestDescriptionReviewStatusHTML() {
  var reviewStatusHTML = [];

  reviewStatusHTML.push('<dl id="test-description-review-statuses">');

  Object.keys(Config.TestDescriptionReviewStatus).forEach(i => {
    const key = Config.TestDescriptionReviewStatus[i].toLowerCase().replace(/\s+/g, '-');
    reviewStatusHTML.push('<dt>' + getFragmentFromString(i) + '</dt>');
    reviewStatusHTML.push(`<dd data-i18n="test-description-review-status.${key}.dd">${i18n.t(`test-description-review-status.${key}.dd.textContent`)}</dd>`);
  })

  reviewStatusHTML.push('</dl>');

  return reviewStatusHTML.join('');
}

export function getAgentHTML(options = {}) {
  let userName = Config.SecretAgentNames[getRandomIndex(Config.SecretAgentNames.length)];

  if (Config.User.Name) {
    // XXX: We have the IRI already
    userName = `<span about="${Config.User.IRI}" property="schema:name">${Config.User.Name}</span>`;
  }

  let userImage = '';

  if (!('omitImage' in options && options.omitImage) && 'Image' in Config.User && typeof Config.User.Image !== 'undefined' && Config.User.Image.length > 0) {
    userImage = getResourceImageHTML(Config.User.Image, options) + ' ';
  }

  let user = `<span typeof="schema:Person">${userName}</span>`;

  if ('IRI' in Config.User && Config.User.IRI !== null && Config.User.IRI.length > 0) {
    user = `<span about="${Config.User.IRI}" typeof="schema:Person">${userImage}<a rel="schema:url" href="${Config.User.IRI}">${userName}</a></span>`;
  }

  return user;
}

export function getResourceImageHTML(resource, options = {}) {
  var avatarSize = ('avatarSize' in options) ? options.avatarSize : Config['AvatarSize'];

  return `<img alt="" height="${avatarSize}" rel="schema:image" src="${resource}" width="${avatarSize}" />`;
}

export function createLicenseHTML(iri, options = {}) {
  options['rel'] = options.rel ? options.rel : 'schema:license';
  options['label'] = options.label ? options.label : 'License';
  return createLicenseRightsHTML(iri, options);
}

export function createRightsHTML(iri, options = {}) {
  options['rel'] = options.rel ? options.rel : 'dcterms:rights';
  options['label'] = options.label ? options.label : 'Rights';
  return createLicenseRightsHTML(iri, options);
}

export function createLicenseRightsHTML(iri, options = {}) {
  if (!iri) return '';

  var html = '';
  var title = '';
  var name = iri;

  const labelKey = options.label.toLowerCase().replace(/\s+/g, '-');

  html = `<dl class="${labelKey}"><dt data-i18n="license.${labelKey}.dt">${i18n.t(`license.${labelKey}.dt.textContent`)}</dt><dd>`;
  // if ('name' in options) {
  //   name = options.name;
  //   title = ('description' in options) ? ` title="${i18n.t(`license.${labelKey}.dt.title`)}"` : '';
  // }
  // else
  if (Config.License[iri]) {
    name = Config.License[iri].name;
    title = ` title="${i18n.t('licenses.' + Config.License[iri].code + '.option.title')}""`;
  }

  html += '<a href="' + iri + '" rel="' + options.rel + '"' + title + '>' + name + '</a>';
  html += '</dd></dl>';

  return html;
}

//TODO: Consider if/how setDocumentRelation and createDefinitionListHTML
//TODO: Extend with data.resource, data.datatype
export function createDefinitionListHTML(data, options = {}) {
  // console.log(data, options)
  if (!data || !options) { return; }

  var id = (options.id) ? ` id="${options.id}"` : '';
  var title = options.title || options.id;
  var classAttribute = (options.class) ? ` class="${options.class}"` : ` class="${title.toLowerCase()}"`;

  var dds = [];

  data.forEach(d => {
    var prefix = d.prefix ? ` prefix="${d.prefix}"` : '';
    var lang = d.lang !== undefined ? ` lang="${d.lang}"` : '';
    var xmlLang = d.xmlLang !== undefined ? ` xml:lang="${d.xmlLang}"` : '';
    var resource = d.resource ? ` resource="${d.resource}"` : '';
    var content = d.content ? ` content="${d.content}"` : '';
    var datatype = d.datatype ? ` datatype="${d.datatype}"` : '';
    var typeOf = d.typeOf ? ` typeof="${d.typeOf}"` : '';

    //d.href is required, d.resource is optional.

    ///XXX: This can be further developed
    if (d.child) {
      var childTypeOf = d.child.typeOf ? ` typeof="${d.child.typeOf}"` : '';
      var childResource = d.child.resource ? ` resource="${d.child.resource}"` : '';

      dds.push(`
        <dd>
          <span${content}${datatype}${lang}${prefix} rel="${d.rel}"${resource}${typeOf}${xmlLang}>
            <span rel="${d.child.rel}"${childResource}${childTypeOf}>${d.child.textContent}</span>
          </span>
        </dd>
      `);
    }
    else if (d.rel && d.property) {
      dds.push(`<dd><a href="${d.href}"${content}"${lang} property="${d.property}" rel="${d.rel}${resource}${xmlLang}>${d.textContent || d.href}</a></dd>`);
    }
    else if (d.rel) {
      dds.push(`<dd><a href="${d.href}"${prefix} rel="${d.rel}"${resource}>${d.textContent || d.href}</a></dd>`);
    }
    else if (d.property) {
      dds.push(`<dd><span${content}${datatype}${lang}${prefix} property="${d.property}"${xmlLang}>${d.textContent}</span></dd>`);
    }
  });

  var html = `
    <dl${classAttribute}${id}>
      <dt>${title}</dt>
      ${dds.join('\n')}
    </dl>`;

  // console.log(html);

  return html;
}

// function createLanguageHTML(language, options = {}) {
//   if (!language) return '';

//   var id = (options.id) ? ` id="${options.id}"` : '';
//   var property = options.language || 'dcterms:language';
//   var label = options.label || 'Language';
//   var name = Config.Languages[language].sourceName || language;

//   var html = `
//     <dl class="${label.toLowerCase()}"${id}>
//       <dt>${label}</dt>
//       <dd><span content="${language}" lang="" property="${property}" xml:lang="">${name}</span></dd>
//     </dl>`;

//   return html;
// }


export function createLanguageHTML(language, options = {}) {
  if (!language) return '';

  var property = options.property || 'dcterms:language';
  var content = language;
  var textContent = Config.Languages[language].sourceName || language;
  options['title'] = options.label || 'Language';

  return createDefinitionListHTML([{ property, content, textContent, lang: '', xmlLang: '' }], options);
}

export function createInboxHTML(url, options = {}) {
  if (!url) return '';

  options['class'] = options.class || 'inbox';
  options['title'] = 'Inbox';

  return createDefinitionListHTML([{ 'href': url, 'rel': 'ldp:inbox' }], options);
}

export function createInReplyToHTML(url, options = {}) {
  if (!url) return '';

  options['class'] = options.class || 'in-reply-to';
  options['title'] = 'In reply to';

  return createDefinitionListHTML([{ 'href': url, 'rel': 'as:inReplyTo' }], options);
}

export function createPublicationStatusHTML(url, options = {}) {
  if (!url) return '';

  options['class'] = options.class || 'publication-status';
  var textContent = Config.PublicationStatus[url] || url;
  options['title'] = 'Status';

  return createDefinitionListHTML(
    [
      {
        prefix: 'pso: http://purl.org/spar/pso/',
        rel: 'pso:holdsStatusInTime',
        resource: '#' + generateAttributeId(),
        child: {
          rel: 'pso:withStatus', resource: url, typeOf: 'pso:PublicationStatus', textContent
        }
      }
    ],
    options
  );
}

export function createResourceTypeHTML(url, options = {}) {
  if (!url) return '';

  options['class'] = options.class || 'resource-type';
  var textContent = Config.ResourceType[url] || url;
  options['title'] = 'Type';

  return createDefinitionListHTML([{ 'href': url, 'rel': 'rdf:type', textContent }], options);
}

export function createTestSuiteHTML(url, options = {}) {
  if (!url) return '';

  options['class'] = options.class || 'test-suite';
  options['title'] = 'Test Suite';

  return createDefinitionListHTML([{ 'href': url, 'rel': 'spec:testSuite' }], options);
}

export function getAnnotationInboxLocationHTML(action) {
  var s = '', inputs = [], checked = '';

  if (Config.User.TypeIndex && Config.User.TypeIndex[ns.as.Announce.value]) {
    if (Config.User.UI && Config.User.UI['annotationInboxLocation'] && Config.User.UI.annotationInboxLocation['checked']) {
      checked = ' checked="checked"';
    }
    s = `<input type="checkbox" id="${action}-annotation-inbox" name="${action}-annotation-inbox"${checked} /><label data-i18n="annotation-inbox.label" for="${action}-annotation-inbox">${i18n.t('annotation-inbox.label.textContent')}</label>`;
  }

  return s;
}

export function getAnnotationLocationHTML(action) {
  var s = '', inputs = [], checked = '';

  if (Config.Editor.mode == 'author') {
    return s;
  }

  if (typeof Config.AnnotationService !== 'undefined') {
    if (Config.User.Storage && Config.User.Storage.length > 0 || Config.User.Outbox && Config.User.Outbox.length > 0) {
      if (Config.User.UI && Config.User.UI['annotationLocationService'] && Config.User.UI.annotationLocationService['checked']) {
        checked = ' checked="checked"';
      }
    }
    else {
      checked = ' checked="checked" disabled="disabled"';
    }

    inputs.push(`<input type="checkbox" id="${action}-annotation-location-service" name="${action}-annotation-location-service"${checked} /><label data-i18n="annotation-location.annotation-service.label" for="${action}-annotation-location-service">${i18n.t('annotation-location.annotation-service.label.textContent')}</label>`);
  }

  checked = ' checked="checked"';

  if (Config.User.Storage && Config.User.Storage.length > 0 || Config.User.Outbox && Config.User.Outbox.length > 0) {
    if (Config.User.UI && Config.User.UI['annotationLocationPersonalStorage'] && !Config.User.UI.annotationLocationPersonalStorage['checked']) {
      checked = '';
    }

    inputs.push(`<input type="checkbox" id="${action}-annotation-location-personal-storage" name="${action}-annotation-location-personal-storage"${checked} /><label data-i18n="annotation-location.personal-storage.label" for="${action}-annotation-location-personal-storage">${i18n.t('annotation-location.personal-storage.label.textContent')}</label>`);
  }

  if (inputs.length) {
    s = `<span data-i18n="annotation-location-selection.store-at.span">${i18n.t('annotation-location-selection.store-at.span.textContent')}</span>` + inputs.join('');
  }

  return s;
}

export function getPublicationStatusOptionsHTML(options) {
  options = options || {};
  var s = [], selectedIRI = '';

  if ('selected' in options) {
    selectedIRI = options.selected;
    if (selectedIRI == '') {
      s.push(`<option data-i18n="publication-status.choose.option" selected="selected" value="">${i18n.t('publication-status.choose.option.textContent')}</option>`);
    }
  }
  else {
    selectedIRI = ns.pso.draft.value;
  }

  Object.keys(Config.PublicationStatus).forEach(iri => {
    var selected = (iri == selectedIRI) ? ' selected="selected"' : '';
    const key = Config.PublicationStatus[iri].toLowerCase().replace(/\s+/g, '-');
    s.push(`<option data-i18n="publication-status.${key}.option"${selected} title="${i18n.t(`publication-status.${key}.option.title`)}" value="${iri}">${i18n.t(`publication-status.${key}.option.textContent`)}</option>`);
  })

  return s.join('');
}

export function getResourceTypeOptionsHTML(options) {
  options = options || {};
  var s = [], selectedType = '';

  if ('selected' in options) {
    selectedType = options.selected;
    if (selectedType == '') {
      s.push(`<option data-i18n="resource-type.choose.option" selected="selected" value="">${i18n.t('resource-type.choose.option.textContent')}</option>`);
    }
  }
  else {
    selectedType = 'http://schema.org/Article';
  }

  Object.keys(Config.ResourceType).forEach(iri => {
    var selected = (iri == selectedType) ? ' selected="selected"' : '';
    const key = Config.ResourceType[iri].toLowerCase().replace(/\s+/g, '-');
    s.push(`<option data-i18n="${`resource-type.${key}.option`}"${selected} title="${i18n.t(`resource-type.${key}.option.title`)}" value="${iri}">${i18n.t(`resource-type.${key}.option.textContent`)}</option>`);
  });

  return s.join('');
}

export function getLanguageOptionsHTML(options) {
  options = options || {};
  var s = [], selectedLang = '';

  if ('selected' in options) {
    selectedLang = options.selected;
    if (selectedLang == '') {
      s.push(`<option data-i18n="language.choose.option" selected="selected" value="">${i18n.t('language.choose.option.textContent')}</option>`);
    }
  }
  else if (typeof Config.User.UI?.Language !== 'undefined') {
    selectedLang = Config.User.UI.Language;
  }
  else {
    selectedLang = 'en';
  }

  Object.keys(Config.Languages).forEach(lang => {
    let selected = (lang == selectedLang) ? ' selected="selected"' : '';
    s.push(`<option dir="${Config.Languages[lang].dir}" lang="${lang}"${selected} value="${lang}" xml:lang="${lang}">${Config.Languages[lang].sourceName}</option>`);
  });

  return s.join('');
}

export function getLicenseOptionsHTML(options) {
  options = options || {};
  var s = [], selectedIRI = '';

  if ('selected' in options) {
    selectedIRI = options.selected;
    if (selectedIRI == '') {
      s.push(`<option dir="auto" data-i18n="license.choose.option" selected="selected" value="">${i18n.t('license.choose.option.textContent')}</option>`);
    }
  }
  else if (typeof Config.User.UI.License !== 'undefined') {
    selectedIRI = Config.User.UI.License;
  }
  else {
    selectedIRI = 'https://creativecommons.org/licenses/by/4.0/';
  }

  Object.keys(Config.License).forEach(iri => {
    if (iri != 'NoLicense') {
      var selected = (iri == selectedIRI) ? ' selected="selected"' : '';
      s.push(`<option dir="auto" data-i18n="license.${Config.License[iri].code}.option" value="${iri}"${selected} title="${i18n.t('license.' + Config.License[iri].code + '.option.title')}">${Config.License[iri].name}</option>`);
    }
  })

  return s.join('');
}

export function getCitationOptionsHTML(options) {
  options = options || {};
  var s = [], selectedIRI = '';

  if ('selected' in options) {
    selectedIRI = options.selected;
    if (selectedIRI == '') {
      s.push(`<option data-i18n="citation.choose.option" selected="selected" value="">${i18n.t('citation.choose.option.textContent')}</option>`);
    }
  }

  Object.keys(Config.Citation).forEach(iri => {
    const key = Config.Citation[iri].toLowerCase().replace(/\s+/g, '-');
    s.push(`<option data-i18n="${`citation.${key}.option`}" value="${iri}">${i18n.t(`citation.${key}.option.textContent`)}</option>`);
  })

  return s.join('');
}

export function getRequirementLevelOptionsHTML(type) {
  type = type || 'MUST';

  var s = '';
  Object.keys(Config.RequirementLevel).forEach(iri => {
    s += '<option value="' + iri + '">' + Config.RequirementLevel[iri] + '</option>';
  })

  return s;
}

export function getRequirementSubjectOptionsHTML(options) {
  options = options || {};
  var s = '', selectedIRI = '';
// console.trace();
// console.log(options)

  if ('selected' in options) {
    selectedIRI = options.selected;
    if (selectedIRI == '') {
      s += '<option selected="selected" value="">Choose a requirement subject</option>';
    }
  }

  const conceptIRIs = getClassesOfProductsConcepts();
// console.log(concepts)
  if (conceptIRIs.length) {
    conceptIRIs.forEach(conceptIRI => {
      var conceptData = Config.Resource[conceptIRI]?.skos?.data[conceptIRI];

      if (conceptData) {
        var conceptLabel = conceptData[ns.skos.prefLabel] || '';
        var title = conceptData[ns.skos.definition] || '';
        if (title) {
          title = ` title="${htmlEncode(title)}"`;
        }

        var selected = (conceptIRI == selectedIRI) ? ' selected="selected"' : '';

        s += '<option value="' + conceptIRI + '"' + selected + title + '>' + conceptLabel + '</option>';
      }
    })
  }

  return s;
}


export function showGeneralMessages() {
  showResourceAudienceAgentOccupations();
}

export function getAccessModeOptionsHTML(options) {
  // id = encodeURIComponent(id);
  options = options || {};
  //Contextual access control modes and human-readable labels
  //UC-sharing-article: See Config.AccessContext.Share
  options['context'] = options['context'] || 'Share';
  var accessContext = Config.AccessContext[options.context] || 'Share';

  var s = `<option data-i18n="dialog.share-resource.select-access-mode.no-access.option" value="">${i18n.t(`dialog.share-resource.select-access-mode.no-access.option.textContent`)}</option>`;

  var modes = Object.keys(accessContext);
  modes.forEach(mode => {
    var selected = (options.selected && (mode === options.selected)) ? ' selected="selected"' : '';
    var modeName = accessContext[mode];
    s += `<option data-i18n="dialog.share-resource.select-access-mode.acl-${modeName}.option"${selected} value="${mode}">${i18n.t(`dialog.share-resource.select-access-mode.acl-${modeName}.option.textContent`)}</option>`;
  });

  // console.log(s);
  return s;
}

export function showResourceAudienceAgentOccupations() {
  if (Config.User.Occupations && Config.User.Occupations.length > 0) {
    var matches = [];

    Config.Resource[Config.DocumentURL].audience.forEach(audience => {
      if (Config.User.Occupations.includes(audience)) {
        matches.push(getResourceGraph(audience).then(g => {
          Config.Resource[audience] = { graph: g };
          return g ? g.node(rdf.namedNode(audience)) : g;
        }));
      }
    })

    Promise.allSettled(matches)
      .then(results => {
        var ul = [];

        results.forEach(result => {
          var g = result.value;

          if (g) {
            var iri = g.term.value;

            //TODO: Update getGraphConceptLabel to have an optional parameter that takes language tag, e.g., 'en'.
            var skosLabels = getGraphConceptLabel(g);

            var label = iri;
            if (skosLabels.length) {
              label = skosLabels[0];
              Config.Resource[iri]['labels'] = skosLabels;
            }
            // console.log(label)
            ul.push(`<li><a href="${iri}" rel="noopener" target="_blank">${label}</a></li>`);
          }
        });

        if (ul.length > 0) {
          ul = `<ul>${ul.join('')}</ul>`;

          var message = `<span data-i18n="dialog.document-action-message.audience-occupation.span">${i18n.t("dialog.document-action-message.audience-occupation.span.textContent")}</span>${ul}`;
          message = {
            'content': message,
            'type': 'info',
            'timer': 5000
          }

          addMessageToLog(message, Config.MessageLog);
          showActionMessage(document.body, message);
        }
      });
  }
}

export function setCopyToClipboard(contentNode, triggerNode, options = {}) {
  triggerNode.addEventListener('click', e => {
    if (e.target.closest('button.copy-to-clipboard')) {
      var text;

      switch (contentNode.nodeName.toLowerCase()) {
        default:
        case 'pre':
          text = contentNode.textContent;
          break;

        case 'input':
        case 'textarea':
          text = contentNode.value;
          break;

        case 'table':
          text = serializeTableToText(contentNode);
          break;
      }

      navigator.clipboard.writeText(text)
        .then(() => {
          var message = `<span data-i18n="dialog.document-action-message.clipboard-success.span">${i18n.t('dialog.document-action-message.clipboard-success.span.textContent')}</span>`;
          message = {
            'content': message,
            'type': 'info',
            'timer': 3000
          }
          addMessageToLog(message, Config.MessageLog);
          showActionMessage(document.body, message);
        })
        .catch(error => {
          var message = `<span data-i18n="dialog.document-action-message.clipboard-fail.span">${i18n.t('dialog.document-action-message.clipboard-fail.span.textContent')}</span>`;
          message = {
            'content': message,
            'type': 'error',
            'timer': 3000
          }
          addMessageToLog(message, Config.MessageLog);
          showActionMessage(document.body, message);
        });
    }
  });
}

export function serializeTableToText(table) {
  //FIXME: Multiple tbody

  var thead = table.querySelector('thead');
  var tbodies = table.querySelectorAll('tbody');

  var theadData = serializeTableSectionToText(thead);

  var tbodyData = [];
  tbodies.forEach(tbody => {
    tbodyData.push(serializeTableSectionToText(tbody));
  })
  tbodyData = tbodyData.join('\n');

  return theadData + '\n' + tbodyData;
}

export function serializeTableSectionToText(section) {
  //FIXME: Needs to handle rowspan/colspan and th/td combinations
  //TODO: Test with example tables:
  //https://csarven.ca/linked-research-decentralised-web#quality-attributes-dokieli
  //https://csarven.ca/linked-research-decentralised-web.html#forces-and-functions-in-specifications
  //https://csarven.ca/linked-research-decentralised-web#fair-metrics-dataset-dokieli
  //https://csarven.ca/linked-research-decentralised-web#dokieli-implementation-web-annotation-motivations-notifications
  //https://csarven.ca/linked-research-decentralised-web#ldn-test-consumer-summary

  var data = [];
  var rows;

  switch (section.nodeName.toLowerCase()) {
    case 'thead':
      //FIXME: Assuming the last tr in thead has most specific columns.
      rows = section.querySelectorAll('tr:last-child');
      break;
    case 'tbody':
      rows = section.querySelectorAll('tr');
      break;
  }

  rows.forEach(tr => {
    var cells;

    switch (section.nodeName.toLowerCase()) {
      case 'thead':
        cells = tr.querySelectorAll('th, td');
        break;
      case 'tbody':
        //FIXME:
        cells = tr.querySelectorAll('td');
        break;
    }

    var rowData = [];

    cells.forEach(cell => {
      var sanitized = domSanitize(cell.textContent.trim()).replace(/"/g, '""');
      rowData.push(sanitized);
    });

    data.push(rowData.join('","'));
  });

  return data.map(row => '"' + row + '"').join('\n');
}


export function focusNote() {
  document.addEventListener('click', e => {
    var ref = e.target.closest('span.ref.do sup a');

    if (ref) {
      var hash = new URL(ref.href).hash;
      var refId = hash.substring(1);
      var aside = document.querySelector('#document-notifications[class~="do"]:has(article[id="' + refId + '"])');

      if (!hash.length || !aside) return;

      if (!aside.classList.contains("on")) {
        aside.classList.add('on');
        window.history.replaceState({}, null, hash);
      }
    }
  });
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

export function getReferenceLabel(motivatedBy) {
  motivatedBy = motivatedBy || '';
  //TODO: uriToPrefix
  motivatedBy = (motivatedBy.length && motivatedBy.slice(0, 4) == 'http' && motivatedBy.indexOf('#') > -1) ? 'oa:' + motivatedBy.substr(motivatedBy.lastIndexOf('#') + 1) : motivatedBy;

  return Config.MotivationSign[motivatedBy] || '#';
}

export function createRDFaMarkObject(r, mode) {
  //Generic
  let about = r['about'];
  let resource = r['resource'];
  let typeOf = r['typeof'];
  let rel = r['rel'];
  let property = r['property'];
  let href = r['href'];
  let content = r['content'];
  let lang = r['lang'];
  let datatype = r['datatype'];

  let id = generateAttributeId();

  about = about || '#' + id;

  //TODO: Figure out how to use user's preferred vocabulary. Huh?
  property = property || 'rdfs:label';

  let xmlLang = lang;
  datatype = lang ? undefined : datatype;

  let element = ('datatype' in r && r.datatype == 'xsd:dateTime') ? 'time' : ((href == '') ? 'span' : 'a');

  let attrs = { id, about, resource, 'typeof': typeOf, rel, property, href, content, lang, 'xml:lang': xmlLang, datatype };

  return { element, attrs }
}

//mode value can be: exapanded or null
export function createRDFaHTML(r, mode) {
  var s = '', about = '', property = '', rel = '', resource = '', href = '', content = '', langDatatype = '', typeOf = '', idValue = '', id = '';

  if ('rel' in r && r.rel != '') {
    rel = ' rel="' + r.rel + '"';
  }

  if ('href' in r && r.href != '') {
    href = ' href="' + r.href + '"';
  }

  if (mode == 'expanded') {
    idValue = generateAttributeId();
    id = ' id="' + idValue + '"';

    if ('about' in r && r.about != '') {
      about = ' about="' + r.about + '"';
    }
    else {
      about = ' about="#' + idValue + '"';
    }

    if ('property' in r && r.property != '') {
      property = ' property="' + r.property + '"';
    }
    else {
      //TODO: Figure out how to use user's preferred vocabulary.
      property = ' property="rdfs:label"';
    }

    if ('resource' in r && r.resource != '') {
      resource = ' resource="' + r.resource + '"';
    }

    if ('content' in r && r.content != '') {
      content = ' content="' + r.content + '"';
    }

    if ('lang' in r && r.lang != '') {
      langDatatype = ' lang="' + r.lang + '" xml:lang="' + r.lang + '"';
    }
    else {
      if ('datatype' in r && r.datatype != '') {
        langDatatype = ' datatype="' + r.datatype + '"';
      }
    }

    if ('typeOf' in r && r.typeOf != '') {
      typeOf = ' typeof="' + r.typeOf + '"';
    }
  }

  var element = ('datatype' in r && r.datatype == 'xsd:dateTime') ? 'time' : ((href == '') ? 'span' : 'a');
  var textContent = r.textContent || r.href || '';

  s = '<' + element + about + content + href + id + langDatatype + property + rel + resource + typeOf + '>' + textContent + '</' + element + '>';

  return s;
}

//TODO: Work on HTML nodes instead of the selected text
export function createRDFaHTMLRequirement(r, mode) {
  var s = '', about = '', property = '', rel = '', resource = '', href = '', content = '', langDatatype = '', typeOf = '', idValue = '', id = '', subject = '', level = '', basedOnConsensus;

  var idValue = r.id || generateAttributeId();
  id = ` id="${idValue}"`;

  var aboutValue = ('about' in r && r.about != '') ? r.about : '';
  about= ` about="${aboutValue}"`;

  rel = ' rel="spec:requirement"';
  resource = ' resource="#' + idValue + '"';

  if ('lang' in r && r.lang != '') {
    langDatatype = ' lang="' + r.lang + '" xml:lang="' + r.lang + '"';
  }
  else {
    if ('datatype' in r && r.datatype != '') {
      langDatatype = ' datatype="' + r.datatype + '"';
    }
  }

  if ('typeOf' in r && r.typeOf != '') {
    typeOf = ' typeof="' + r.typeOf + '"';
  }

  //TODO: Perhaps the value passed to this function should include both requirementSubjectURI and requirementSubjectLabel. For now this is URI and label is derived :( Same goes for requirement level.

  //TODO: Handle undefined r.subject, level etc.
  var requirementSubjectURI = r.subject;
  var requirementSubjectLabel = requirementSubjectURI ? getFragmentOrLastPath(requirementSubjectURI) : '';
  var requirementLevelURI = r.level;
  var requirementLevelLabel = requirementLevelURI ? getFragmentOrLastPath(requirementLevelURI): '';
  var prevRequirementLevelLabel = r.prevLevelLabel || requirementLevelLabel;
  var prevRequirementSubjectLabel = r.prevSubjectLabel || requirementSubjectLabel;
  var selectedTextContent = r.selectedTextContent || '';
  var selectedHtmlString = r.selectedHtmlString || selectedTextContent;

  var requirementSubject = `<span rel="spec:requirementSubject" resource="${requirementSubjectURI}">${requirementSubjectLabel}</span>`;
  var requirementLevel = `<span rel="spec:requirementLevel" resource="${requirementLevelURI}">${requirementLevelLabel}</span>`;

  // console.log(selectedTextContent);

  console.log("NODES: ", r.nodes)

  const subjectLabel = prevRequirementSubjectLabel;
  const levelLabel = prevRequirementLevelLabel;
  
  const subjIndex = selectedHtmlString.indexOf(subjectLabel);
  const levelIndex = selectedHtmlString.indexOf(levelLabel);
  
  const replacements = [
    { start: subjIndex, end: subjIndex + (subjectLabel||'').length, replacement: requirementSubject },
    { start: levelIndex, end: levelIndex + (levelLabel||'').length, replacement: requirementLevel }
  ]
    .filter(r => r.start !== -1)
    .sort((a,b) => b.start - a.start);
  
  let newHtmlString = selectedHtmlString;
  for (const { start, end, replacement } of replacements) {
    newHtmlString = newHtmlString.slice(0, start) + replacement + newHtmlString.slice(end);
  }
  var statement = `<span property="spec:statement">${newHtmlString}</span>`;

  //TODO: Do other things that match terms from HTTP-RDF.

  //TODO: if selected text is the only content in parent, consider using `p`
  var element = 'span';

  //Input (with or without p):
  //<p>Client <code>SHOULD</code> generate a Content-Type header field in a message that contains content. [<a href="https://example.org/consensus/1" rel="cito:citesAsSourceDocument">Source</a>]</p>

  // position the markup according to previous subject and level labels positions


  //span or p:
  //<p about="" id="server-content-type-includes" rel="spec:requirement" resource="#server-content-type-includes"><span property="spec:statement"><span rel="spec:requirementSubject" resource="#Server">Server</span> <span rel="spec:requirementLevel" resource="spec:MUST">MUST</span> generate a <code>Content-Type</code> header field in a message that contains content.</span></p>

  s = '<' + element + about + id + langDatatype + rel + resource + typeOf + '>' + statement + '</' + element + '>';

  // console.log(s)

  return s;
}

export function highlightItems() {
  var highlights = getDocumentContentNode(document).querySelectorAll('*[class*="highlight-"]');
  for (var i = 0; i < highlights.length; i++) {
    highlights[i].addEventListener('mouseenter', (e) => {
      var c = e.target.getAttribute('class').split(' ')
                .filter(s => { return s.startsWith('highlight-'); });
      var highlightsX = getDocumentContentNode(document).querySelectorAll('*[class~="'+ c[0] +'"]');
      for (var j = 0; j < highlightsX.length; j++) {
        highlightsX[j].classList.add('do', 'highlight');
      }
    });

    highlights[i].addEventListener('mouseleave', (e) => {
      var c = e.target.getAttribute('class');
      c = e.target.getAttribute('class').split(' ')
                .filter(s => { return s.startsWith('highlight-'); });
      var highlightsX = getDocumentContentNode(document).querySelectorAll('*[class~="'+ c[0] +'"]');
      for (var j = 0; j < highlightsX.length; j++) {
        highlightsX[j].classList.remove('do', 'highlight');
      }
    });
  }
}

export function showAsTabs(selector) {
  selector = selector || '.tabs';
  var nodes = document.querySelectorAll(selector);

  nodes.forEach(node => {
    var li = node.querySelectorAll('nav li.selected');
    var figure = node.querySelectorAll('figure.selected');

    if (li.length == 0 && figure.length == 0) {
      node.querySelector('nav li').classList.add('selected');
      node.querySelector('figure').classList.add('selected');
    }

    node.querySelector('nav').addEventListener('click', (e) => {
      var a = e.target;
      if (a.closest('a')) {
        e.preventDefault();
        e.stopPropagation();

        var li = a.parentNode;
        if(!li.classList.contains('class')) {
          var navLi = node.querySelectorAll('nav li');
          for (var i = 0; i < navLi.length; i++) {
            navLi[i].classList.remove('selected');
          }
          li.classList.add('selected');
          var figures = node.querySelectorAll('figure');
          for (let i = 0; i < figures.length; i++) {
            figures[i].classList.remove('selected');
          }
          node.querySelector('figure' + a.hash).classList.add('selected');
        }
      }
    });
  })
}

export function showRefs() {
  var refs = document.querySelectorAll('span.ref');
  for (var i = 0; i < refs.length; i++) {
    // console.log(this);
    var ref = refs[i].querySelector('mark[id]');
    // console.log(ref);
    if (ref) {
      var refId = ref.id;
      // console.log(refId);
      var refA = refs[i].querySelectorAll('[class*=ref-] a');
      // console.log(refA);
      for (var j = 0; j < refA.length; j++) {
        //XXX: Assuming this is always an internal anchor?
        var noteId = refA[j].getAttribute('href').substr(1);
        // console.log(noteId);
        var refLabel = refA[j].textContent;
        // console.log(refLabel);

        // console.log(refId + ' ' +  refLabel + ' ' + noteId);
        positionNote(refId, noteId, refLabel);
      }
    }
  }
}

export function showCitations(citation, g) {
  // console.log('----- showCitations: ')
  // console.log(citation);

  var cEURL = stripFragmentFromString(citation.citingEntity);
  // console.log(Config.Activity[cEURL]);

  if (Config.Activity[cEURL]) {
    if (Config.Activity[cEURL]['Graph']) {
      addCitation(citation, Config.Activity[cEURL]['Graph']);
    }
    else {
      // console.log('  Waiting...' + citation.citingEntity)
      window.setTimeout(showCitations, 1000, citation, g);
    }
  }
  else {
    processCitationClaim(citation);
  }
}

export function processCitationClaim(citation) {
  // console.log('  processCitationClaim(' + citation.citingEntity + ')')
  // var pIRI = getProxyableIRI(citation.citingEntity);
  return getResourceGraph(citation.citingEntity)
    .then(i => {
        var cEURL = stripFragmentFromString(citation.citingEntity);
        Config.Activity[cEURL] = {};
        Config.Activity[cEURL]['Graph'] = i;
        var s = i.node(rdf.namedNode(citation.citingEntity));
        addCitation(citation, s);
      }
    );
}

export function addCitation(citation, s) {
  // console.log('  addCitation(' + citation.citingEntity + ')')
  var citingEntity = citation.citingEntity;
  var citationCharacterization = citation.citationCharacterization;
  var citedEntity = citation.citedEntity;

  var documentURL = Config.DocumentURL;

  //XXX: Important
  s = s.node(rdf.namedNode(citingEntity));

  //TODO: cito:Citation
  // if rdftypes.indexOf(citoCitation)
  //   note.citocitingEntity && note.citocitationCharacterization && note.citocitedEntity)

  // else

  // console.log("  " + citationCharacterization + "  " + citedEntity);
  var citationCharacterizationLabel = Config.Citation[citationCharacterization] || citationCharacterization;

  var id = generateUUID(citingEntity);
  var refId;

  var cEURL = stripFragmentFromString(citingEntity);
  var citingEntityLabel = getGraphLabel(s);
  if (!citingEntityLabel) {
    var cEL = getGraphLabel(s.node(rdf.namedNode(cEURL)));
    citingEntityLabel = cEL ? cEL : citingEntity;
  }
  citation['citingEntityLabel'] = citingEntityLabel;

  var citedEntityLabel = getGraphLabel(Config.Resource[documentURL].graph.node(rdf.namedNode(citedEntity)));
  if (!citedEntityLabel) {
    cEL = Config.Resource[documentURL].graph(Config.Resource[documentURL].graph.node(rdf.namedNode(stripFragmentFromString(citedEntity))));
    citedEntityLabel = cEL ? cEL : citedEntity;
  }
  citation['citedEntityLabel'] = citedEntityLabel;

  var noteData = {
    'id': id,
    'iri': citingEntity,
    'type': 'ref-citation',
    'mode': 'read',
    'citation': citation
  }

  // console.log(noteData)
  var noteDataHTML = createNoteDataHTML(noteData);

  var asideNote = `
    <aside class="note do">
      <blockquote cite="${citingEntity}">${noteDataHTML}</blockquote>
    </aside>`;

  // console.log(asideNote)
  var asideNode = fragmentFromString(asideNote);

  var fragment, fragmentNode;

  // //FIXME: If containerNode is used.. the rest is buggy

  fragment = getFragmentFromString(citedEntity);
  // console.log("  fragment: " + fragment)
  fragmentNode = document.querySelector('[id="' + fragment + '"]');

  if (fragmentNode) {
    // console.log(asideNote)
    var containerNode = fragmentNode;
    refId = fragment;
    // console.log(fragment);
    // console.log(fragmentNode);
    containerNode.appendChild(asideNode);
    positionNote(refId, id, citingEntityLabel);
  }
  else {
    var dl;
    var citingItem = '<li><a about="' + citingEntity + '" href="' + citingEntity + '" rel="' + citationCharacterization + '" resource="' + citedEntity + '">' + citingEntityLabel + '</a> (' + citationCharacterizationLabel + ')</li>';

    var documentCitedBy = 'document-cited-by';
    var citedBy = document.getElementById(documentCitedBy);

    if(citedBy) {
      var ul = citedBy.querySelector('ul');
      var spo = ul.querySelector('[about="' + citingEntity + '"][rel="' + citationCharacterization + '"][resource="' + citedEntity + '"]');
      if (!spo) {
        ul.appendChild(fragmentFromString(citingItem));
      }
    }
    else {
      dl = '        <dl class="do" id="' + documentCitedBy + '"><dt>Cited By</dt><dd><ul>' + citingItem + '</ul></dl>';
      insertDocumentLevelHTML(document, dl, { 'id': documentCitedBy });
    }
  }
}

export function updateSelectedStylesheets(stylesheets, selected) {
  selected = selected.toLowerCase();

  for (var j = 0; j < stylesheets.length; j++) {
    (function(stylesheet) {
      if (stylesheet.getAttribute('title').toLowerCase() != selected) {
          stylesheet.disabled = true;
          stylesheet.setAttribute('rel', 'stylesheet alternate');
      }
    })(stylesheets[j]);
  }
  for (let j = 0; j < stylesheets.length; j++) {
    (function(stylesheet) {
      if (stylesheet.getAttribute('title').toLowerCase() == selected) {
          stylesheet.setAttribute('rel', 'stylesheet');
          stylesheet.disabled = false;
      }
    })(stylesheets[j]);
  }
}

export function initCurrentStylesheet(e) {
  var currentStylesheet = getCurrentLinkStylesheet();
  currentStylesheet = (currentStylesheet) ? currentStylesheet.getAttribute('title') : '';
  var selected = (e && e.target) ? e.target.textContent.toLowerCase() : currentStylesheet.toLowerCase();
  var stylesheets = document.querySelectorAll('head link[rel~="stylesheet"][title]:not([href$="dokieli.css"])');

  updateSelectedStylesheets(stylesheets, selected);

  var bd = document.querySelectorAll('#document-views button');
  for(var j = 0; j < bd.length; j++) {
    bd[j].disabled = (e && e.target && (e.target.textContent == bd[j].textContent)) ? true : false;
  }

  showRefs();

  if (selected == 'shower') {
    var slides = document.querySelectorAll('.slide');
    for(j = 0; j < slides.length; j++) {
      slides[j].classList.add('do');
    }
    getDocumentContentNode(document).classList.add('on-slideshow', 'list');
    document.querySelector('head').insertAdjacentHTML('beforeend', '<meta content="width=792, user-scalable=no" name="viewport" />');

    var body = getDocumentContentNode(document);
    var dMenu = document.querySelector('#document-menu.do');

    if(dMenu) {
      var dMenuButton = dMenu.querySelector('button');
      dMenuButton.parentNode.replaceChild(fragmentFromString(Config.Button.Menu.CloseMenu), dMenuButton);

      dMenu.classList.remove('on');

      var dMenuSections = dMenu.querySelectorAll('section');
      for (j = 0; j < dMenuSections.length; j++) {
        dMenuSections[j].parentNode.removeChild(dMenuSections[j]);
      }
    }

    var toc = document.getElementById('table-of-contents');
    toc = (toc) ? toc.parentNode.removeChild(toc) : false;

    shower.initRun();
  }

  if (currentStylesheet.toLowerCase() == 'shower') {
    slides = document.querySelectorAll('.slide');
    for (var c = 0; c < slides.length; c++){
      slides[c].classList.remove('do');
    }
    getDocumentContentNode(document).classList.remove('on-slideshow', 'list', 'full');
    getDocumentContentNode(document).removeAttribute('style');
    var mV = document.querySelector('head meta[name="viewport"][content="width=792, user-scalable=no"]');
    mV = (mV) ? mV.parentNode.removeChild(mV) : false;

    history.pushState(null, null, window.location.pathname);

    shower.removeEvents();
  }
}

export function getCurrentLinkStylesheet() {
  return document.querySelector('head link[rel="stylesheet"][title]:not([href$="dokieli.css"]):not([disabled])');
}

export async function spawnDokieli(documentNode, data, contentType, iris, options = {}){
  let iri =  Array.isArray(iris) ? iris[0] : iris;
  iri = domSanitize(iri);
  const isHttpIRI = isHttpOrHttpsProtocol(iri);
  const isFileIRI = isFileProtocol(iri);
  const prefixes = "rdf: http://www.w3.org/1999/02/22-rdf-syntax-ns# rdfs: http://www.w3.org/2000/01/rdf-schema# owl: http://www.w3.org/2002/07/owl# xsd: http://www.w3.org/2001/XMLSchema# rdfa: http://www.w3.org/ns/rdfa# dcterms: http://purl.org/dc/terms/ dctypes: http://purl.org/dc/dcmitype/ foaf: http://xmlns.com/foaf/0.1/ pimspace: http://www.w3.org/ns/pim/space# skos: http://www.w3.org/2004/02/skos/core# prov: http://www.w3.org/ns/prov# mem: http://mementoweb.org/ns# qb: http://purl.org/linked-data/cube# schema: http://schema.org/ void: http://rdfs.org/ns/void# rsa: http://www.w3.org/ns/auth/rsa# cert: http://www.w3.org/ns/auth/cert# wgs: http://www.w3.org/2003/01/geo/wgs84_pos# bibo: http://purl.org/ontology/bibo/ sioc: http://rdfs.org/sioc/ns# doap: http://usefulinc.com/ns/doap# dbr: http://dbpedia.org/resource/ dbp: http://dbpedia.org/property/ sio: http://semanticscience.org/resource/ opmw: http://www.opmw.org/ontology/ deo: http://purl.org/spar/deo/ doco: http://purl.org/spar/doco/ cito: http://purl.org/spar/cito/ fabio: http://purl.org/spar/fabio/ oa: http://www.w3.org/ns/oa# as: https://www.w3.org/ns/activitystreams# ldp: http://www.w3.org/ns/ldp# solid: http://www.w3.org/ns/solid/terms# acl: http://www.w3.org/ns/auth/acl# earl: http://www.w3.org/ns/earl# spec: http://www.w3.org/ns/spec# odrl: http://www.w3.org/ns/odrl/2/ dio: https://w3id.org/dio# rel: https://www.w3.org/ns/iana/link-relations/relation# dcat: http://www.w3.org/ns/dcat csvw: http://www.w3.org/ns/csvw# dpv: https://w3id.org/dpv# risk: https://w3id.org/dpv/risk#";

  if (!isHttpIRI && !isFileIRI) {
    const message = `Cannot open, not valid URL or file location.`;
    const messageObject = {
      'content': message,
      'type': 'error',
      'timer': 3000,
    }
    addMessageToLog({...messageObject, content: message}, Config.MessageLog);
    showActionMessage(document.body, messageObject);

    throw new Error(message);
  }

  let files = Array.isArray(data) ? data : [{
    name: iri,
    type: contentType,
    content: data
  }];

  var tmpl = document.implementation.createHTMLDocument('template');
  const isCsv = !!files.find((f) => f.type == "text/csv");
  // console.log(tmpl);
  if (files.length > 1 && isCsv) {
    // check if one of the files is a metadata.json
    const metadataFiles = [];
    const csvFiles = [];

    files.map((file) => {
      if (file.type == 'application/json' || file.type == 'application/ld+json') {
        file['url'] = file.name;
        metadataFiles.push(file);
      }
      if (file.type === 'text/csv') {
        csvFiles.push(file)
      }
    })

    // handle multiple csv
    const jsonObjects = csvFiles.map(csvFile => {
      let tmp = csvStringToJson(csvFile.content);
      tmp['url'] = csvFile.name;
      return tmp;
    })

    //TODO: multiple metadata files
    let metadata = metadataFiles[0];
    if (metadata && metadata.content) {
      metadata.content = JSON.parse(metadataFiles[0].content);
    }

    const htmlString = jsonToHtmlTableString(jsonObjects, metadata);

    // console.log(fragmentFromString(`<main><article>${htmlString}</article></main>`))
    // this works for urls but not files
    // document.body.appendChild(fragmentFromString(`<main><article>${htmlString}</article></main>`));

    // and this replaces the whole content
    tmpl.body.appendChild(fragmentFromString(`<main><article>${htmlString}</article></main>`));
  }

  else {
    switch(contentType){
      case 'text/html': case 'application/xhtml+xml':
        // if multiple HTML files come in, just open the first for now
        tmpl.documentElement.setHTMLUnsafe(files[0].content);
        tmpl.body.setHTMLUnsafe(domSanitize(tmpl.body.getHTML()));
        break;

      case 'text/csv':
        // console.error("Must provide a metadata file; single CSVs without metadata not supported yet");
        // console.log("TODO: Single CSV case", iri, files);
        let jsonObject = csvStringToJson(files[0].content); // we only have one for now
        jsonObject['url'] = files[0].name;
        jsonObject['name'] = files[0].name;
        const htmlString = jsonToHtmlTableString([jsonObject], {});

        tmpl.body.replaceChildren(fragmentFromString(`<main><article about="" typeof="schema:Article">${htmlString}</article></main>`));
        break;

      case 'application/gpx+xml':
        // console.log(data)
        tmpl = await generateGeoView(files[0].content)
        // FIXME: Tested with generateGeoView returning a Promise but somehow
          .then(i => {
            var id = 'geo';
            var metadataBounds = document.querySelector('#' + id + ' figcaption a');
            if (metadataBounds) {
              var message = `Opened geo data at <a href="${metadataBounds.href}">${metadataBounds.textContent}</a>`;
              message = {
                'content': message,
                'type': 'info',
                'timer': 3000,
              }
              addMessageToLog(message, Config.MessageLog);
              showActionMessage(document.body, message);

              var w = document.getElementById(id);
              window.history.pushState(null, null, '#' + id);
              w.scrollIntoView();
            }

            return i;
          });

        break;

      default:
        data = htmlEncode(files[0].content)
        // console.log(data)
        var iframe = document.createElement('iframe');
        // <pre type=&quot;' + contentType + '&quot; -- nice but `type` is undefined attribute for `pre`.at the moment. Create issue in WHATWG for fun/profit?
        iframe.srcdoc = '<pre>' + data + '</pre>';
        iframe.width = '1280'; iframe.height = '720';

        const dt = (isFileIRI) ? `<code>${iri.slice(5)}</code>` : `<a href="${iri}" rel="noopener" target="_blank">${iri}</a>`;

        var main = fragmentFromString(`<main><article><dl><dt>${dt}</dt><dd></dd></dl></article></main>`);
        main.querySelector('dd').appendChild(iframe);
        tmpl.body.appendChild(main);
        break;
    }
  }

  if (options.defaultStylesheet) {
    var documentCss = document.querySelectorAll('head link[rel~="stylesheet"][href]');

    let hasDokieliCss = false;

    documentCss.forEach(node => {
      const href = node.href;
      const isBasicCss = href === 'https://dokie.li/media/css/basic.css';
      const isDokieliCss = href === 'https://dokie.li/media/css/dokieli.css';

      node.setAttribute('href', href);

      if (!isBasicCss && !isDokieliCss) {
        node.setAttribute('disabled', 'disabled');
        node.classList.add('do');
      }
      else {
        node.setAttribute('rel', 'stylesheet');
        hasDokieliCss = true;
      }
    });

    if (!hasDokieliCss) {
      document.querySelector('head').insertAdjacentHTML('beforeend', `
        <link href="https://dokie.li/media/css/basic.css" media="all" rel="stylesheet" title="Basic" />
        <link href="https://dokie.li/media/css/dokieli.css" media="all" rel="stylesheet" />`);
    }
  }

  var documentScript = document.querySelectorAll('head script[src]');
  documentScript.forEach(node => {
    node.setAttribute('src', node.src);
  })

  if (options.init === true && isHttpIRI && contentType == 'text/html') {
    var baseElements = document.querySelectorAll('head base');
    baseElements.forEach(baseElement => {
      baseElement.remove();
    });

    document.querySelector('head').insertAdjacentHTML('afterbegin', '<base href="' + iri + '" />');
    //TODO: Setting the base URL with `base` seems to work correctly, i.e., link base is opened document's URL, and simpler than updating some of the elements' href/src/data attributes. Which approach may be better depends on actions afterwards, e.g., Save As (perhaps other features as well) may need to remove the base and go with the user selection.
    // var nodes = tmpl.querySelectorAll('head link, [src], object[data]');
    // nodes = rewriteBaseURL(nodes, {'baseURLType': 'base-url-absolute', 'iri': iri});
  }

  if (contentType == 'application/gpx+xml') {
    options['init'] = false;

    //XXX: Should this be taken care by ufpdating the document.documentElement and then running init(iri) ? If I'm asking, then probably yes.
    var asideOpenDocument = document.getElementById('open-document');
    if (asideOpenDocument) {
      asideOpenDocument.parentNode.removeChild(asideOpenDocument);
    }
    document.querySelector('#document-do .resource-open').disabled = false;
    hideDocumentMenu();
  }
  else if (options.init === true) { // && !isFileIRI ?
    // window.open(iri, '_blank');

    //TODO: Which approach?
    // var restrictedNodes = Array.from(document.body.querySelectorAll('.do:not(.copy-to-clipboard):not(.robustlinks):not(.ref):not(.delete):not(#document-action-message)'));
    // var restrictedNodes = [document.getElementById('document-menu'), document.getElementById('document-editor'), document.getElementById('document-action-message')];
    // restrictedNodes.forEach(node => {
    //   tmpl.body.appendChild(node);
    // });

    const tmplBody = tmpl.body.cloneNode(true);
    tmplBody.setAttribute('prefix', prefixes);

    document.documentElement.replaceChild(tmplBody, document.body);
    initDocumentMenu();
    initEditor();
    showFragment();
    initCopyToClipboard();

    // hideDocumentMenu();
    return;
  }

  //XXX: This is used in cases options.init is false or undefined
  return tmpl.documentElement.cloneNode(true);

  // console.log('//TODO: Handle server returning wrong or unknown Response/Content-Type for the Request/Accept');
}

export function initCopyToClipboard() {
  var elements = ['pre', 'table'];

  elements.forEach(element => {
    var nodes = selectArticleNode(document).querySelectorAll(element);
    nodes.forEach(node => {
      node.insertAdjacentHTML('afterend', Config.Button.Clipboard);
      var button = node.nextElementSibling;
      setCopyToClipboard(node, button);
    });
  })
}

export function showFragment(selector) {
  var ids = (selector) ? document.querySelectorAll(selector) : document.querySelectorAll('main *[id]:not(input):not(textarea):not(select):not(#content):not(tr)');

  for(var i = 0; i < ids.length; i++){
    ids[i].addEventListener('mouseenter', (e) => {
      var fragment = document.querySelector('*[id="' + e.target.id + '"] > .do.fragment');
      if (!fragment && e.target.parentNode.nodeName.toLowerCase() != 'aside'){
        const sign = getSelectorSign(e.target);

        e.target.insertAdjacentHTML('afterbegin', '<span class="do fragment"><a href="#' + e.target.id + '">' + sign + '</a></span>');
        fragment = document.querySelector('[id="' + e.target.id + '"] > .do.fragment');
        var fragmentClientWidth = fragment.clientWidth;

        var fragmentOffsetLeft = getOffset(e.target).left;
        var bodyOffsetLeft = getOffset(getDocumentContentNode(document)).left;

        var offsetLeft = 0;
        if ((fragmentOffsetLeft - bodyOffsetLeft) > 200) {
          offsetLeft = e.target.offsetLeft;
        }

        fragment.style.top = Math.ceil(e.target.offsetTop) + 'px';
        fragment.style.left = (offsetLeft - fragmentClientWidth) + 'px';
        fragment.style.height = e.target.clientHeight + 'px';
        fragment.style.width = (fragmentClientWidth - 10) + 'px';
      }
    });

    ids[i].addEventListener('mouseleave', (e) => {
      var fragment = document.querySelector('[id="' + e.target.id + '"] > .do.fragment');
      if (fragment && fragment.parentNode) {
        fragment.parentNode.removeChild(fragment);
      }
    });
  }
}

export function getOffset(el) {
  var box = el.getBoundingClientRect();

  return {
    top: box.top + window.pageYOffset - document.documentElement.clientTop,
    left: box.left + window.pageXOffset - document.documentElement.clientLeft
  }
}

export function getSelectorSign(node) {
  if(!node) {
    return Config.SelectorSign["*"];
  }

  if (typeof node === 'object') {
    var nodeName = node.nodeName.toLowerCase();
    var nodeId = '';

    if(node.id) {
      switch(nodeName) {
        default: break;
        case 'section': case 'dl':
          nodeId = '#' + node.id;
          break;
      }
    }

    return Config.SelectorSign[nodeName + nodeId] || Config.SelectorSign[nodeName] || Config.SelectorSign["*"];
  }

  return Config.SelectorSign["*"];
}

export function setDocRefType() {
  var link = document.querySelector('head link[rel="stylesheet"][title]');
  if (link) {
    Config.DocRefType = link.getAttribute('title');
  }
  if (Object.keys(Config.RefType).indexOf(Config.DocRefType) == -1) {
    Config.DocRefType = 'LNCS';
  }
}

export function generateIndexItemHTML(g, options) {
  if (typeof g.iri === 'undefined') return;

  // console.log(graph);
  options = options || {};
  var image = '';
  var name = '';
  var published = '';
  var summary = '';
  var tags = '';

  image = getGraphImage(g) || '';
  if (image) {
    image = getResourceImageHTML(image) + ' ';
  }

  name = getGraphLabel(g) || g.term.value;
  name = '<a href="' + g.term.value + '" property="schema:name" rel="schema:url">' + name + '</a>';

  //XXX: Is this what's really intended with getValues? Should it return array?
  function getValues(g, properties) {
    let result;
    properties.forEach(p => {
      result = g.out(p).values;
    })
    return result;
  } 

  var properties = [ns.schema.datePublished, ns.dcterms.issued, ns.dcterms.date, ns.as.published, ns.schema.dateCreated, ns.dcterms.created, ns.prov.generatedAtTime, ns.dcterms.modified, ns.as.updated];
  var datePublished = getValues(g, properties)[0] || '';

  if (datePublished) {
    published = ', <time content="' + datePublished + '" datetime="' + datePublished + '" property="schema:dataPublished">' + datePublished.substr(0,10) + '</time>';
  }

  if (g.out(ns.oa.hasBody).values.length) {
    summary = g.node(rdf.namedNode(summary)).out(ns.rdf.value).values[0];
  }
  else {
    summary = getValues(g, [ns.schema.abstract, ns.dcterms.description, ns.rdf.value, ns.as.summary, ns.schema.description, ns.as.content])[0] || '';
  }

  if (summary) {
    summary = '<div datatype="rdf:HTML" property="schema:description">' + summary + '</div>';
  }

  if (g.out(ns.as.tag).values.length) {
    tags = [];
    g.out(ns.as.tag).values.forEach(tagURL => {
      var t = g.node(g.namedNode(tagURL));
      var tagName = getFragmentOrLastPath(tagURL);

      if (t.out(ns.as.href).values.length) {
        tagURL = t.out(ns.as.href).values[0];
      }
      if (t.out(ns.as.name).values.length) {
        tagName = t.out(ns.as.name).values[0];
      }
      tags.push('<li><a href="' + tagURL + '" rel="schema:about">' + tagName + '</a></li>');
    })
    tags = '<ul>' + tags.join('') + '</ul>';
  }

  return image + name + published + summary + tags;
}

export function rewriteBaseURL(nodes, options) {
  options = options || {};
  if (typeof nodes === 'object' && nodes.length) {
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var url, ref;
      switch(node.tagName.toLowerCase()) {
        default:
          url = node.getAttribute('src');
          ref = 'src';
          break;
        case 'link':
          url = node.getAttribute('href');
          ref = 'href';
          break;
        case 'object':
          url = node.getAttribute('data');
          ref = 'data';
          break;
      }

      var s = url.split(':')[0];
      if (s != 'http' && s != 'https' && s != 'file' && s != 'data' && s != 'urn' && document.location.protocol != 'file:') {
        url = setBaseURL(url, options);
      }
      else if (url.startsWith('http:') && node.tagName.toLowerCase()) {
        url = getProxyableIRI(url)
      }
      node.setAttribute(ref, url);
    }
  }

  return nodes;
}


export function buildResourceView(data, options) {
  if (!Config.MediaTypes.RDF.includes(options['contentType'])) {
    return Promise.resolve({"data": data, "options": options});
  }

  return getGraphFromData(data, options).then(
    function(g){
      // console.log(g)
      var title = getGraphLabel(g) || options.subjectURI;
      var h1 = '<a href="' +  options.subjectURI + '">' + title + '</a>';

      var types = getGraphTypes(g);
      // console.log(types)
      if(types.includes(ns.ldp.Container.value) ||
          types.includes(ns.as.Collection.value) ||
          types.includes(ns.as.OrderedCollection.value)) {

        return processResources(options['subjectURI'], options).then(
          function(urls) {
            var promises = [];
            urls.forEach(url => {
              // console.log(u);
              // window.setTimeout(function () {

              // var pIRI = getProxyableIRI(u);
              promises.push(getResourceGraph(url));
              // }, 1000)
            });

            // return Promise.all(promises.map(p => p.catch(e => e)))
            return Promise.allSettled(promises)
              .then(results => {
                var items = [];
                // graphs.filter(result => !(result instanceof Error));

                //TODO: Refactor if/else based on getResourceGraph
                results.forEach(result => {
                  // console.log(result.value)

                  //XXX: Not sure about htis.
                  if (result.value instanceof Error) {
                    // TODO: decide how to handle
                  }
                  //FIXME: This is not actually useful yet. getResourceGraph should return the iri in which its content had no triples or failed to parse perhaps.
                  else if (typeof result.value === 'undefined') {
                    //   items.push('<a href="' + result.value + '">' + result.value + '</a>');
                  }
                  else if ('resource' in result.value) {
                    items.push('<li rel="schema:hasPart" resource="' + result.value.resource + '"><a href="' + result.value.resource + '">' + result.value.resource + '</a></li>');
                  }
                  else {
                    var html = generateIndexItemHTML(result.value);
                    if (typeof html === 'string' && html !== '') {
                      items.push('<li rel="schema:hasPart" resource="' + result.value.term.value + '">' + html + '</li>');
                    }
                  }
                })

                //TODO: Show createNewDocument button.
                var createNewDocument = '';

                var listItems = '';

                if (items.length) {
                  listItems = "<ul>" + items.join('') + "</ul>";
                }

                var html = `      <article about="" typeof="as:Collection">
    <h1 property="schema:name">` + h1 + `</h1>
    <div datatype="rdf:HTML" property="schema:description">
      <section>` + createNewDocument + listItems + `
      </section>
    </div>
  </article>`;

                return {
                  'data': createHTML('Collection: ' + options.subjectURI, html),
                  'options': {
                    'subjectURI': options.subjectURI,
                    'contentType': 'text/html'
                  },
                  'defaultStylesheet': true
                };
              })
              .catch(e => {
                // console.log(e)
              });
          });
      }
      else {
        return {"data": data, "options": options};
      }

    });
}


export function diffRequirements(sourceGraph, targetGraph) {
  var documentURL = Config.DocumentURL;
  var sourceGraphURI = sourceGraph.term.value;
  var targetGraphURI = targetGraph.term.value;
// console.log(sourceGraphURI, targetGraphURI)
  var sourceRequirements = getResourceInfoSpecRequirements(sourceGraph);
  var targetRequirements = getResourceInfoSpecRequirements(targetGraph);
// console.log(sourceRequirements, targetRequirements)
  var changes = Object.values(Config.Resource[sourceGraphURI].spec.change);
// console.log(changes)
  Object.keys(sourceRequirements).forEach(sR => {
    Config.Resource[sourceGraphURI].spec['requirement'][sR]['diff'] = {};

    var sRStatement = sourceRequirements[sR][ns.spec.statement.value] || '';
    var tR = targetGraphURI + '#' + getFragmentFromString(sR);

    Config.Resource[sourceGraphURI].spec['requirement'][sR]['diff'][tR] = {};

    var tRStatement = '';

    if (targetRequirements[tR]) {
      tRStatement = targetRequirements[tR][ns.spec.statement.value] || '';
    }

    var change = changes.filter(change => change[ns.spec.changeSubject.value] == sR)[0];
    var changeHTML = '';
    if (change) {
      var changeClass = change[ns.spec.changeClass.value];
      var changeDescription = change[ns.spec.statement.value];
      if (changeClass) {
        var changeClassValue = Config.ChangeClasses[changeClass] || changeClass;
        if (changeDescription) {
          changeDescription = '<dt>Change Description</dt><dd>' + changeDescription + '</dd>';
        }
        changeHTML = '<details><summary>Changelog</summary><dl><dt>Change Class</dt><dd><a href="' + changeClass + '">' + changeClassValue + '</a></dd>' + changeDescription + '</dl></details>';
      }
    }

    var diff = diffChars(tRStatement, sRStatement);
    var diffHTML = [];
    diff.forEach((part) => {
      var eName = 'span';

      if (part.added) {
        eName = 'ins';
      }
      else if (part.removed) {
        eName = 'del';
      }

      diffHTML.push('<' + eName + '>' + part.value + '</' + eName + '>');
    });

    Config.Resource[sourceGraphURI].spec['requirement'][sR]['diff'][tR]['statement'] = diffHTML.join('') + changeHTML;
  });
}

export function getBaseURLSelection() {
  return `
    <div id="base-url-selection">
      <label data-i18n="dialog.base-url-selection.label" for="base-url">${i18n.t('dialog.base-url-selection.label.textContent')}</label>
      <select id="base-url">
        <option data-i18n="dialog.base-url-relative.option" id="base-url-relative" value="base-url-relative" selected="selected">${i18n.t('dialog.base-url-relative.option.textContent')}</option>
        <option data-i18n="dialog.base-url-absolute.option" id="base-url-absolute" value="base-url-absolute">${i18n.t('dialog.base-url-absolute.option.textContent')}</option>
      </select>
    </div>
  `;
}

export function setBaseURL(url, options) {
  options = options || {};
  var urlType = ('baseURLType' in options) ? options.baseURLType : 'base-url-absolute';
// console.log(url)
// console.log(options)
// console.log(urlType)
  var matches = [];
  var regexp = /(https?:\/\/([^\/]*)\/|file:\/\/\/|data:|urn:|\/\/)?(.*)/;

  matches = url.match(regexp);

  if (matches) {
    switch(urlType) {
      case 'base-url-absolute': default:
        if(matches[1] == '//' && 'iri' in options){
          url = options.iri.split(':')[0] + ':' + url;
        }
        else {
          let href = ('iri' in options) ? getProxyableIRI(options.iri) : document.location.href;
          url = getBaseURL(href);
// console.log(url)
          //TODO: Move/Refactor in uri.js
          //TODO: "./"
          if (matches[3].startsWith('../')) {
            var parts = matches[3].split('../');
            for (var i = 0; i < parts.length - 1; i++) {
              url = getParentURLPath(url) || url;
            }
            url += parts[parts.length - 1];
          }
          else {
            url += matches[3].replace(/^\//g, '');
          }
// console.log(href)
// console.log(url)
        }
        break;
      case 'base-url-relative':
        url = matches[3].replace(/^\//g, '');
// console.log(url)
        break;
    }
  }

  return url;
}

export function copyRelativeResources(storageIRI, relativeNodes) {
  var ref = '';
  var baseURL = getBaseURL(storageIRI);

  for (var i = 0; i < relativeNodes.length; i++) {
    var node = relativeNodes[i];
    switch(node.tagName.toLowerCase()) {
      default:
        ref = 'src';
        break;
      case 'link':
        ref = 'href';
        break;
      case 'object':
        ref = 'data';
        break;
    }

    var fromURL = node.getAttribute(ref).trim();
    var pathToFile = '';
    var s = fromURL.split(':')[0];

    if (s != 'http' && s != 'https' && s != 'file' && s != 'data' && s != 'urn' && s != 'urn') {
      if (fromURL.startsWith('//')) {
        fromURL = document.location.protocol + fromURL
        var toURL = baseURL + fromURL.substr(2)
      }
      else if (fromURL.startsWith('/')) {
        pathToFile = setBaseURL(fromURL, {'baseURLType': 'base-url-relative'});
        fromURL = document.location.origin + fromURL
        toURL = baseURL + pathToFile
      }
      else {
        pathToFile = setBaseURL(fromURL, {'baseURLType': 'base-url-relative'});
        fromURL = getBaseURL(document.location.href) + fromURL
        toURL = baseURL + pathToFile
      }

      copyResource(fromURL, toURL);
    }
  }
}

//TODO: Review grapoi
export function showExtendedConcepts() {
  var documentURL = Config.DocumentURL;
  var citationsList = Config.Resource[documentURL].citations;

  var promises = [];
  citationsList.forEach(url => {
    // console.log(u);
    // window.setTimeout(function () {
      // var pIRI = getProxyableIRI(u);
      promises.push(getResourceGraph(url));
    // }, 1000)
  });

  var dataset = rdf.dataset();
  var html = [];
  var options = { 'resources': [] };

  return Promise.allSettled(promises)
    .then(results => results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value))
    .then(graphs => {
// console.log(graphs);
      graphs.forEach(g => {
        if (g && !(g instanceof Error) && g.out().terms.length){
        // if (g) {
          var documentURL = g.term.value;
          g = rdf.grapoi({dataset: g.dataset})
// console.log(documentURL)
// console.log(g)
          Config.Resource[documentURL] = Config.Resource[documentURL] || {};
          Config.Resource[documentURL]['graph'] = g;
          Config.Resource[documentURL]['skos'] = getResourceInfoSKOS(g);
          Config.Resource[documentURL]['title'] = getGraphLabel(g) || documentURL;

          if (Config.Resource[documentURL]['skos']['graph'].out().terms.length) {
            html.push(`
              <section>
                <h4><a href="${documentURL}">${Config.Resource[documentURL]['title']}</a></h4>
                <div>
                  <dl>${getDocumentConceptDefinitionsHTML(documentURL)}</dl>
                </div>
              </section>`);

            dataset.addAll(Config.Resource[documentURL]['skos']['graph'].dataset);
            options['resources'].push(documentURL);
          }
        }
      });

      var id = 'list-of-additional-concepts';
      html = `
        <section id="${id}" rel="schema:hasPart" resource="#${id}">
          <h3 property="schema:name">Additional Concepts</h3>
          <div>
            <button class="graph" type="button">View Graph</button>
            <figure></figure>${html.join('')}</div>
        </section>`;

      var aC = document.getElementById(id);
      if (aC) {
        aC.parentNode.removeChild(aC);
      }

      var loC = document.getElementById('list-of-concepts');

      var ic = loC.querySelector('#include-concepts');
      if (ic) { ic.parentNode.removeChild(ic); }

      loC.querySelector('div').insertAdjacentHTML('beforeend', domSanitize(html));

      // insertDocumentLevelHTML(document, html, { 'id': id });

      aC = document.getElementById(id);
      window.history.replaceState(null, null, '#' + id);
      aC.scrollIntoView();

      var selector = '#' + id + ' figure';

      aC.addEventListener('click', (e) => {
        var button = e.target.closest('button.graph');
        if (button) {
          button.parentNode.removeChild(button);

          // serializeGraph(dataset, { 'contentType': 'text/turtle' })
          //   .then(data => {
          ///FIXME: This Config.DocumentURL doesn't seem right other than what the visualisation's root node becomes?
              options['subjectURI'] = Config.DocumentURL;
              options['contentType'] = 'text/turtle';
              //FIXME: For multiple graphs (fetched resources), options.subjectURI is the last item, so it is inaccurate
              showVisualisationGraph(options.subjectURI, dataset.toCanonical(), selector, options);
            // });
        }
      })

// console.log(dataGraph)


// console.log(Config.Resource)
      return dataset;
    });
}

//TODO: Review grapoi
export function getDocumentConceptDefinitionsHTML(documentURL) {
// console.log(documentURL)
  var s = '';
  Object.keys(Config.Resource[documentURL]['skos']['type']).forEach(rdftype => {
// console.log(rdftype)
    s += '<dt>' + Config.SKOSClasses[rdftype] + 's</dt>';

    if (rdftype == ns.skos.Concept.value) {
      s += '<dd><ul>';
    }

    sortToLower(Config.Resource[documentURL]['skos']['type'][rdftype]).forEach(subject => {
      var g = Config.Resource[documentURL]['graph'].node(rdf.namedNode(subject));

      var conceptLabel = sortToLower(getGraphConceptLabel(g));
// console.log(conceptLabel)
      conceptLabel = (conceptLabel.length) ? conceptLabel.join(' / ') : getFragmentOrLastPath(subject);
      conceptLabel = conceptLabel.trim();
      conceptLabel = '<a href="' + subject + '">' + conceptLabel + '</a>';

      if (rdftype == ns.skos.Concept.value) {
        s += '<li>' + conceptLabel + '</li>';
      }
      else {
        s += '<dd>';
        s += '<dl>';
        s += '<dt>' + conceptLabel + '</dt><dd><ul>';

        var hasConcepts = [ns.skos.hasTopConcept.value, ns.skos.member.value];

        hasConcepts.forEach(hasConcept => {
          var concept = Config.Resource[documentURL]['skos']['data'][subject][hasConcept];

          if (concept?.length) {
            sortToLower(concept).forEach(c => {
              var conceptGraph = Config.Resource[documentURL]['graph'].node(rdf.namedNode(c));
              var cLabel = getGraphConceptLabel(conceptGraph);
              cLabel = (cLabel.length) ? cLabel : [getFragmentOrLastPath(c)];
              cLabel.forEach(cL => {
                cL = cL.trim();
                // console.log(cL)
                s += '<li><a href="' + c + '">' + cL + '</a></li>';
              });
            });
          }
        });
        s += '</ul></dd></dl>';
        s += '</dd>';
      }
    })

    if (rdftype == ns.skos.Concept.value) {
      s += '</ul></dd>';
    }
  });

  return s;
}

// ?spec spec:requirement ?requirement .
// ?spec spec:implementationReport ?implementationReport .
// ?spec spec:testSuite ?testSuite .
// ?testSuite ldp:contains ?testCase .
// ?testCase spec:requirementReference ?requirement .
export function insertTestCoverageToTable(id, testSuiteGraph) {
  var table = document.getElementById(id);
  var thead = table.querySelector('thead');
  thead.querySelector('tr:first-child').insertAdjacentHTML('beforeend', '<th colspan="2">Coverage</th>');
  thead.querySelector('tr:nth-child(2)').insertAdjacentHTML('beforeend', '<th>Test Case (Review Status)</th>');

  var subjects = [];
  testSuiteGraph  = rdf.grapoi({ dataset: testSuiteGraph.dataset });
// console.log(testSuiteGraph)
  testSuiteGraph.out().quads().forEach(t => {
// console.log(t)
    subjects.push(t.subject.value);
  });
  subjects = uniqueArray(subjects);

  var testCases = [];

  //FIXME: Brittle selector
  var specificationReferenceBase = document.querySelector('#document-latest-published-version [rel~="rel:latest-version"]').href;
// console.log(specificationReferenceBase)

  subjects.forEach(i => {
    var s = testSuiteGraph.node(rdf.namedNode(i));
    var testCaseIRI = s.term.value;
    var types = getGraphTypes(s);

    if (types.length) {
      if (types.includes(ns['test-description'].TestCase.value)) {
        var requirementReference = s.out(ns.spec.requirementReference).values[0];
        if (requirementReference && requirementReference.startsWith(specificationReferenceBase)) {
          testCases[testCaseIRI] = {};
          testCases[testCaseIRI][ns.spec.requirementReference.value] = requirementReference;
          testCases[testCaseIRI][ns['test-description'].reviewStatus.value] = s.out(ns['test-description'].reviewStatus).values[0];
          testCases[testCaseIRI][ns.dcterms.title.value] = s.out(ns.dcterms.title).values[0];
        }
      }
    }
  });

// console.log(testCases);

  table.querySelectorAll('tbody tr').forEach(tr => {
    var requirement = tr.querySelector('td:nth-child(3) a').href;

    Object.keys(testCases).forEach(testCaseIRI => {
      if (testCases[testCaseIRI][ns.spec.requirementReference.value] == requirement) {
        var testCaseLabel = testCases[testCaseIRI][ns.dcterms.title.value] || testCaseIRI;

        var testCaseHTML = '<a href="'+ testCaseIRI + '">' + testCaseLabel + '</a>';

        if (testCases[testCaseIRI][ns['test-description'].reviewStatus.value]) {
          var reviewStatusIRI = testCases[testCaseIRI][ns['test-description'].reviewStatus.value];
          var reviewStatusLabel = getFragmentFromString(reviewStatusIRI) || getURLLastPath(reviewStatusIRI) || reviewStatusIRI;

          var reviewStatusHTML = ' (<a href="'+ reviewStatusIRI + '">' + reviewStatusLabel + '</a>)';

          testCaseHTML = testCaseHTML + reviewStatusHTML;
        }

        testCaseHTML = '<li>' + testCaseHTML + '</li>';

        var tdTestCase = tr.querySelector('td:nth-child(4)');

        if (tdTestCase) {
          tdTestCase.querySelector('ul').insertAdjacentHTML('beforeend', testCaseHTML);
        }
        else {
          tr.insertAdjacentHTML('beforeend', '<td><ul>' + testCaseHTML + '</ul></td>');
        }
      }
    })

    var tC = tr.querySelector('td:nth-child(4)');
    if (!tC) {
      tr.insertAdjacentHTML('beforeend', '<td><span class="warning">?</span></td>');
    }
  });

  table.insertAdjacentHTML('beforeend', '<tfoot><tr>' + getTestDescriptionReviewStatusHTML() + '</tr></tfoot>')
}

export function getStorageSelfDescription(g) {
  var s = '';

  var storageName = getGraphLabel(g);
  
  var storageURL = g.term.value;

  storageName = (typeof storageName !== 'undefined') ? storageName : storageURL;

  Config.Resource[storageURL] = Config.Resource[storageURL] || {};
  Config.Resource[storageURL]['title'] = storageName;
  Config.Resource[storageURL]['description'] = g.out(ns.schema.abstract).values[0] || g.out(ns.dcterms.description).values[0] || g.out(ns.rdf.value).values[0] || g.out(ns.as.summary).values[0] || g.out(ns.schema.description).values[0] || g.out(ns.as.content).values[0] || undefined;

  var storageTitle = '<dt>Storage name</dt><dd><a href="' + storageURL + '">' + storageName + '</a></dd>';
  var storageDescription = (Config.Resource[storageURL]['description']) ? '<dt>Storage description</dt><dd>' + Config.Resource[storageURL]['description'] + '</dd>' : '';

  s = '<dl id="storage-self-description">' + storageTitle + storageDescription + '</dl>';

  return s;
}

export function getPersistencePolicy(g) {
  var s = '';

  var persistencePolicy = g.out(ns.pim.persistencePolicy).values;

  if (persistencePolicy.length) {
    var pp = [];

    Config.Resource[g.term.value] = Config.Resource[g.term.value] || {};
    Config.Resource[g.term.value]['persistencePolicy'] = [];

    persistencePolicy.forEach(iri => {
      Config.Resource[g.term.value]['persistencePolicy'].push(iri);

      pp.push('<dd><a href="' + iri  + '" rel="noopener" target="_blank">' + iri + '</a></dd>');
    });

    s = '<dl id="storage-persistence-policy"><dt>URI persistence policy</dt>' + pp.join('') + '</dl>'
  }

  return s;
}

export function getODRLPolicies(g) {
  var s = '';
  var odrlPolicies = [];

  var hasPolicy = g.out(ns.odrl.hasPolicy).values;

  if (hasPolicy.length) {
    hasPolicy.forEach(iri => {
      var policy = g.node(rdf.namedNode(iri));
      var policyDetails = [];

      var types = getGraphTypes(policy);

      var indexPolicy = types.findIndex(t => 
        t === ns.odrl.Offer.value || t === ns.odrl.Agreement.value
      );

      if (indexPolicy >= 0) {
        var rule = types[indexPolicy];
        //XXX: Label derived from URI.
        var ruleLabel = rule.substr(rule.lastIndexOf('/') + 1);

        policyDetails.push('<dt>Rule<dt><dd><a href="' + rule + '" rel="noopener" target="_blank">' + ruleLabel + '</a></dd>');
      }

      //TODO: odrl:Set

      var uid = policy.out(ns.odrl.uid).values[0];
      if (uid) {
        policyDetails.push('<dt>Unique identifier<dt><dd><a href="' + uid + '" rel="noopener" target="_blank">' + uid + '</a></dd>');
      }

      var target = policy.out(ns.odrl.target).values[0];
      if (target) {
        policyDetails.push('<dt>Target<dt><dd><a href="' + target + '" rel="noopener" target="_blank">' + target + '</a></dd>');
      }

      var permission = policy.out(ns.odrl.permission).values[0];
      if (permission) {
        var ruleG = g.node(rdf.namedNode(permission));

        policyDetails.push(getODRLRuleActions(ruleG));
        policyDetails.push(getODRLRuleAssigners(ruleG));
        policyDetails.push(getODRLRuleAssignees(ruleG));
      }
      var prohibition = policy.out(ns.odrl.prohibition).values[0];
      if (prohibition) {
        ruleG = g.node(rdf.namedNode(prohibition));

        policyDetails.push(getODRLRuleActions(ruleG));
        policyDetails.push(getODRLRuleAssigners(ruleG));
        policyDetails.push(getODRLRuleAssignees(ruleG));
      }

      var detail = '<dl>' + policyDetails.join('') + '</dl>';

      odrlPolicies.push('<dd><details><summary><a href="' + iri + '" rel="noopener" target="_blank">' + iri + '</a></summary>' + detail + '</details></dd>');
    });

    s = '<dl id="odrl-policies"><dt>Policies</dt>' + odrlPolicies.join('') + '</dl>';
  }

  return s;
}

export function getODRLRuleActions(g) {
// console.log(r.odrlaction)
  var actions = [];

  var actionsIRIs = g.out(ns.odrl.action).values;

  actionsIRIs.forEach(iri => {
    //FIXME: Label derived from URI.
    var label = iri;
    var href = iri;

    if (iri.startsWith('http://www.w3.org/ns/odrl/2/')) {
      label = iri.substr(iri.lastIndexOf('/') + 1);
      href = 'https://www.w3.org/TR/odrl-vocab/#term-' + label;
    }
    else if (iri.startsWith('http://creativecommons.org/ns#')) {
      label = iri.substr(iri.lastIndexOf('#') + 1);
      href = 'https://www.w3.org/TR/odrl-vocab/#term-' + label;
    }
    else if (iri.lastIndexOf('#')) {
      label = iri.substr(iri.lastIndexOf('#') + 1);
    }
    else if (iri.lastIndexOf('/')) {
      label = iri.substr(iri.lastIndexOf('/') + 1);
    }

    var warning = '';
    var attributeClass = '';
    var attributeTitle = '';

    //Get user's actions from preferred policy (prohibition) to check for conflicts with storage's policy (permission)
    if (Config.User.PreferredPolicyRule && Config.User.PreferredPolicyRule.Prohibition && Config.User.PreferredPolicyRule.Prohibition.Actions.includes(iri)) {
      warning = Icon[".fas.fa-circle-exclamation"] + ' ';
      attributeClass = ' class="warning"';
      attributeTitle = ' title="The action (' + label + ') is prohibited by preferred policy."';
    }

    actions.push('<li' + attributeTitle + '>' + warning + '<a' + attributeClass + ' href="' + href + '" resource="' + iri + '">' + label + '</a></li>')
  });

  actions = '<dt>Actions</dt><dd><ul rel="odrl:action">' + actions.join('') + '</ul></dd>';

  return actions;
}

export function getODRLRuleAssigners(g) {
  var s = '';
  var a = [];

  var assigners = g.out(ns.odrl.assigner).values;

  assigners.forEach(iri => {
    a.push('<dd><a href="' + iri + '" rel="noopener" target="_blank">' + iri + '</a></dd>');
  });

  s = '<dt>Assigners</dt>' + a.join('');

  return s;
}

export function getODRLRuleAssignees(g) {
  var s = '';
  var a = [];

  var assignees = g.out(ns.odrl.assignees).values;

  assignees.forEach(iri => {
    a.push('<dd><a href="' + iri + '" rel="noopener" target="_blank">' + iri + '</a></dd>');
  });

  s = '<dt>Assignees</dt>' + a.join('');

  return s;
}

export function getContactInformation(g) {
  var s = '';
  var resourceOwners = [];

  var solidOwner = g.out(ns.solid.owner).values;

  if (solidOwner.length) {
    Config.Resource[g.term.value] = Config.Resource[g.term.value] || {};
    Config.Resource[g.term.value]['owner'] = [];

    solidOwner.forEach(iri => {
      Config.Resource[g.term.value]['owner'].push(iri);

      resourceOwners.push('<dd><a href="' + iri + '" rel="noopener" target="_blank">' + iri + '</a></dd>');
    });

    s = '<dl id="resource-owners"><dt>Owners</dt>' + resourceOwners.join('') + '</dl>';
  }

  return s;
}

//TODO: Review grapoi
export function getCitation(i, options) {
  // console.log(i)
  // console.log(options)
  options = options || {};
  options['noCredentials'] = true;
  var url;

  if (isValidISBN(i)) {
    url = 'https://openlibrary.org/isbn/' + i;
    var headers = {'Accept': 'application/json'};
    var wikidataHeaders = {'Accept': 'application/ld+json'};

    var isbnData = rdf.grapoi({ dataset: rdf.dataset() }).node(rdf.namedNode(url));

    return getResource(url, headers, options)
      .then(response => {
        // console.log(response)
        return response.text();
      }).then(data => {
        //TODO: try/catch?
        data = JSON.parse(data);
        // console.log(data)
        //data.identifiers.librarything data.identifiers.goodreads

        var promises = [];

        if (data.title) {
          // console.log(data.title)
          isbnData.addOut(ns.schema.name, data.title);
        }

        //Unused
        // if (data.subtitle) {
        //   console.log(data.subtitle)
        // }

        if (data.publish_date) {
          // console.log(data.publish_date)
          isbnData.addOut(schemadatePublished, getDateTimeISOFromMDY(data.publish_date));
        }

        if (data.covers) {
          // console.log(data.covers)
          isbnData.addOut(ns.schema.image, rdf.namedNode('https://covers.openlibrary.org/b/id/' + data.covers[0] + '-S.jpg'));
          // document.body.insertAdjacentHTML('afterbegin', '<img src="' + img + '"/>');

          //   async function fetchImage(url) {
          //     const img = new Image();
          //     return new Promise((res, rej) => {
          //         img.onload = () => res(img);
          //         img.onerror = e => rej(e);
          //         img.src = url;
          //     });
          // }
          // const img = await fetchImage('https://covers.openlibrary.org/b/id/12547191-L.jpg');
          // const w = img.width;
          // const h = img.height;
        }

        if (data.authors && Array.isArray(data.authors) && data.authors.length && data.authors[0].key) {
          var a = 'https://openlibrary.org' + data.authors[0].key;
          // console.log(a)
          promises.push(getResource(a, headers, options)
            .then(response => {
              // console.log(response)
              return response.text();
            })
            .then(data => {
              //TODO: try/catch?
              data = JSON.parse(data);
              // console.log(data)

              var authorURL = 'http://example.com/.well-known/genid/' + generateUUID();
              if (data.links && Array.isArray(data.links) && data.links.length) {
                // console.log(data.links[0].url)
                authorURL = data.links[0].url;
              }
              isbnData.addOut(ns.schema.author, rdf.namedNode(authorURL), authorName => {
                if (data.name) {
                  authorName.addOut(ns.schema.name, data.name);
                }
              });

              return isbnData;

              // XXX: Working but unused:
              // if (data.remote_ids && data.remote_ids.wikidata) {
              //   wE has a few redirects to wW
              //   var wE = 'https://www.wikidata.org/entity/' + data.remote_ids.wikidata;
              //   var wW = 'https://www.wikidata.org/wiki/Special:EntityData/' + data.remote_ids.wikidata + '.jsonld';
              //   promises.push(getResourceGraph(wW, wikidataHeaders, options)
              //     .then(g => {
              //       console.log(g)
              //       console.log(g.iri().toString())
              //       var s = g.match(wE.replace(/^https:/, 'http:'))
              //         console.log(s.toString());

              //       console.log(isbnData)
              //       console.log(isbnData.toString())

              //       return isbnData;
              //     }));
              // }

            }));
        }

        // XXX: Working but unused:
        // if (data.identifiers?.wikidata && Array.isArray(data.identifiers.wikidata) && data.identifiers.wikidata.length) {
        //   var w = 'https://www.wikidata.org/entity/' + data.identifiers.wikidata[0];
        //   promises.push(getResourceGraph(w, wikidataHeaders, options).then(g => {
        //     console.log(g);
        //     console.log(g.toString());
        //   }));
        // }

        return Promise.allSettled(promises)
          .then(results => {
            var items = [];
            results.forEach(result => {
              // console.log(result)
              items.push(result.value);
            })

            //For now just [0]
            return items[0];
          });

      })
  }
  else {
    if (i.match(/^10\.\d+\//)) {
      url= 'https://doi.org/' + i;
    }
    else {
      url = i.replace(/https?:\/\/dx\.doi\.org\//i, 'https://doi.org/');
    }

    return getResourceGraph(url, null, options);
  }
}

export function getCitationHTML(citationGraph, citationURI, options) {
  if (!citationGraph) { return; }
  options = options || {};
  // var citationId = ('citationId' in options) ? options.citationId : citationURI;
  var subject = citationGraph.node(rdf.namedNode(citationURI));
  // console.log(citationGraph);
  // console.log('citationGraph.iri().toString(): ' + citationGraph.iri().toString());
  // console.log('citationGraph.toString(): ' + citationGraph.toString());
  // console.log('options.citationId: ' + options.citationId);
  // console.log('citationURI: ' + citationURI);
  // console.log('subject.iri().toString(): ' + subject.iri().toString());

  var title = getGraphLabel(subject);
  //FIXME: This is a hack that was related to SimpleRDF's RDFa parser not setting the base properly. May no longer be needed.
  if(typeof title == 'undefined') {
    subject = citationGraph.node(rdf.namedNode(options.citationId));

    title = getGraphLabel(subject) || '';
  }
  title = htmlEncode(title);
  title = (title.length) ? '<cite>' + title + '</cite>, ' : '';
  var datePublished = getGraphDate(subject) || '';
  var dateVersion = subject.out(ns.schema.dateModified).values[0] || datePublished;
  datePublished = (datePublished) ? datePublished.substr(0,4) + ', ' : '';
  var dateAccessed = 'Accessed: ' + getDateTimeISO();
  var authors = [], authorList = [];
  // console.log(subject);
  // console.log(subject.biboauthorList);
  // console.log(subject.schemaauthor);
  // console.log(subject.dctermscreator);

  //   XXX: FIXME: Putting this off for now because SimpleRDF is not finding the bnode for some reason in citationGraph.child(item), or at least authorItem.rdffirst (undefined)
  //   TODO: Revisit using grapoi
  //       if (subject.biboauthorList) {
  // TODO: Just use/test something like: authorList = authorList.concat(traverseRDFList(citationGraph, subject.biboauthorList));
  //       }
  //       else

  var schemaAuthor = subject.out(ns.schema.author).values;
  var dctermsCreator = subject.out(ns.dcterms.creator).values;
  var asActor = subject.out(ns.as.actor).values;
  if (schemaAuthor.length) {
    schemaAuthor.forEach(a => {
      authorList.push(a);
    });
  }
  else if (dctermsCreator.length) {
    dctermsCreator.forEach(a => {
      authorList.push(a);
    });
  }
  else if (asActor.length) {
    asActor.forEach(a => {
      authorList.push(a);
    });
  }
  // console.log(authorList);

  if (authorList.length) {
    authorList.forEach(authorIRI => {
      var s = subject.node(rdf.namedNode(authorIRI));
      var author = getAgentName(s);
      var schemafamilyName = s.out(ns.schema.familyName).values;
      var schemagivenName = s.out(ns.schema.givenName).values;
      var foaffamilyName = s.out(ns.foaf.familyName).values;
      var foafgivenName = s.out(ns.foaf.givenName).values;

      if (schemafamilyName.length && schemagivenName.length) {
        author = createRefName(schemafamilyName[0], schemagivenName[0]);
      }
      else if (foaffamilyName.length && foafgivenName.length) {
        author = createRefName(foaffamilyName[0], foafgivenName[0]);
      }

      if (author) {
        authors.push(author);
      }
      else {
        authors.push(authorIRI);
      }
    });
    authors = authors.join(', ') + ': ';
  }

  var dataVersionURL;
  var memento = subject.out(ns.mem.memento).values;
  var latestVersion = subject.out(ns.rel['latest-version']).values;
  if (memento.length) {
    dataVersionURL = memento;
  }
  else if (latestVersion.length) {
    dataVersionURL = latestVersion;
  }
  dataVersionURL = (dataVersionURL) ? ' data-versionurl="' + dataVersionURL + '"' : '';

  var dataVersionDate = (dateVersion) ? ' data-versiondate="' + dateVersion + '"' : '';

  var content = ('content' in options && options.content.length) ? options.content + ', ' : '';

  var citationReason = 'Reason: ' + Config.Citation[options.citationRelation];

  var citationIdLabel = citationURI;
  var prefixCitationLink = '';

  if (isValidISBN(options.citationId)) {
    citationIdLabel = options.citationId;
    prefixCitationLink = ', ISBN: ';
  }
  else if (options.citationId.match(/^10\.\d+\//)) {
    citationURI = 'https://doi.org/' + options.citationId;
    citationIdLabel = citationURI;
  }
  else {
    citationURI = citationURI.replace(/https?:\/\/dx\.doi\.org\//i, 'https://doi.org/');
    citationIdLabel = citationURI;
  }

  var citationHTML = authors + title + datePublished + content + prefixCitationLink + '<a about="#' + options.refId + '"' + dataVersionDate + dataVersionURL + ' href="' + citationURI + '" rel="schema:citation ' + options.citationRelation  + '" title="' + Config.Citation[options.citationRelation] + '">' + citationIdLabel + '</a> [' + dateAccessed + ', ' + citationReason + ']';
  //console.log(citationHTML);
  return citationHTML;
}

export function createRefName(familyName, givenName, refType) {
  refType = refType || Config.DocRefType;
  switch(refType) {
    case 'LNCS': default:
      return familyName + ', ' + givenName.slice(0,1) + '.';
    case 'ACM':
      return givenName.slice(0,1) + '. ' + familyName;
    case 'fullName':
      return givenName + ' ' + familyName;
  }
}
