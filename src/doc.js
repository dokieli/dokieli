'use strict'

import Config from './config.js'
import { getDateTimeISO, fragmentFromString, generateAttributeId, uniqueArray, generateUUID, matchAllIndex, parseISODuration, domSanitize, getRandomIndex } from './util.js'
import { getAbsoluteIRI, getBaseURL, stripFragmentFromString, getFragmentFromString, getURLLastPath, getPrefixedNameFromIRI, generateDataURI, getProxyableIRI } from './uri.js'
import { getResource, getResourceHead, deleteResource, processSave, patchResourceWithAcceptPatch } from './fetcher.js'
import rdf from "rdf-ext";
import { getResourceGraph, sortGraphTriples, getGraphContributors, getGraphAuthors, getGraphEditors, getGraphPerformers, getGraphPublishers, getGraphLabel, getGraphEmail, getGraphTitle, getGraphConceptLabel, getGraphPublished, getGraphUpdated, getGraphDescription, getGraphLicense, getGraphRights, getGraphFromData, getGraphAudience, getGraphTypes, getGraphLanguage, getGraphInbox, getUserLabelOrIRI, getGraphImage } from './graph.js'
import LinkHeader from "http-link-header";
import { micromark as marked } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';
import { gfmTagfilterHtml } from 'micromark-extension-gfm-tagfilter';
import { Icon } from './ui/icons.js';
import { showUserIdentityInput, signOut } from './auth.js'
import { buttonIcons } from './ui/button-icons.js'

const ns = Config.ns;

function escapeCharacters(string) {
  return String(string).replace(/[&<>"']/g, function (match) {
    switch (match) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&apos;';
      default:
        return match;
    }
  });
}

function cleanEscapeCharacters(string) {
  return string.replace(/&amp;(lt|gt|apos|quot|amp);/g, "&$1;")
}

function fixBrokenHTML(html) {
//  var pattern = new RegExp('<(' + Config.DOMNormalisation.voidElements.join('|') + ')([^>]*)></\\1>|<(' + Config.DOMNormalisation.voidElements.join('|') + ')([^>]*)/>', 'g');

  var pattern = new RegExp('<(' + Config.DOMNormalisation.voidElements.join('|') + ')([^<>]*?)?><\/\\1>', 'g');

  var fixedHtml = html.replace(pattern, '<$1$2/>');

  return fixedHtml;
}

function getNodeWithoutClasses (node, classNames) {
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

function domToString (node, options) {
  options = options || Config.DOMNormalisation
  var voidElements = options.voidElements || []
  var skipAttributes = options.skipAttributes || []
  var noEsc = [ false ]

  return dumpNode(node, options, skipAttributes, voidElements, noEsc)
}

function dumpNode (node, options, skipAttributes, voidElements, noEsc) {
  options = options || Config.DOMNormalisation
  var out = ''
// console.log(node)
//   const wrapper = node.querySelector(options.removeWrapperSelector);

//   if (wrapper) {
//     const parent = wrapper.parentNode;

//     while (wrapper.firstChild) {
//       parent.insertBefore(wrapper.firstChild, wrapper);
//     }

//     parent.removeChild(wrapper);
//   }

  if (typeof node.nodeType === 'undefined') return out

  if (node.nodeType === 1) {
    if (options.skipNodeWithId && node.hasAttribute('id') && options.skipNodeWithId.indexOf(node.id) > -1) { return out
    }
    else if (node.hasAttribute('class') && 'classWithChildText' in options && node.matches(options.classWithChildText.class)) {
      out += node.querySelector(options.classWithChildText.element).textContent
    }else if (!(options.skipNodeWithClass && node.matches('.' + options.skipNodeWithClass))) {
      var ename = node.nodeName.toLowerCase()
      out += '<' + ename

      var attrList = []

      for (let i = node.attributes.length - 1; i >= 0; i--) {
        var atn = node.attributes[i]

        if (skipAttributes.indexOf(atn.name) > -1) continue

        if (/^\d+$/.test(atn.name)) continue

        if (atn.name === 'class' && 'replaceClassItemWith' in options) {
          atn.value.split(' ').forEach(function (aValue) {
            if (options.replaceClassItemWith.source.indexOf(aValue) > -1) {
              var re = new RegExp(aValue, 'g')
              atn.value = atn.value.replace(re, options.replaceClassItemWith.target).trim()
            }
          })
        }

        // if ((atn.name === 'class' || atn.name === 'id') && atn.value.length == 0) continue

        if (!(atn.name === 'class' && 'skipClassWithValue' in options &&
            options.skipClassWithValue === atn.value)) {
          attrList.push(
            atn.name + '="' +
            atn.value
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;') +
            '"')
        }
      }

      if (attrList.length > 0) {
        if ('sortAttributes' in options && options.sortAttributes) {
          attrList.sort(function (a, b) {
            return a.toLowerCase().localeCompare(b.toLowerCase())
          })
        }
        out += ' ' + attrList.join(' ')
      }

      if (voidElements.indexOf(ename) > -1) {
        out += ' />'
      } else {
        out += '>'
        out += (ename === 'html') ? '\n  ' : ''
        noEsc.push(ename === 'style' || ename === 'script' || ename === 'pre' || ename === 'code' || ename === 'samp')

        for (var i = 0; i < node.childNodes.length; i++) {
          out += dumpNode(node.childNodes[i], options, skipAttributes, voidElements, noEsc)
        }

        noEsc.pop()
        out += (ename === 'body') ? '  </' + ename + '>\n' : (ename === 'html') ? '</' + ename + '>\n' : '</' + ename + '>'
      }
    }
  } else if (node.nodeType === 8) {
    // FIXME: If comments are not tabbed in source, a new line is not prepended
    out += '\n\
<!--' + node.nodeValue + '-->'
  } else if (node.nodeType === 3 || node.nodeType === 4) {
    let nl = node.nodeValue
    // XXX: Remove new lines which were added after DOM ready
    // .replace(/\n+$/, '')

    //FIXME: This section needs a lot of testing. If/when domToString is replaced with XML serializer and DOM sanitizer, this section can be removed.

    nl = nl.replace(/&/g, '&amp;')
    if (noEsc.includes(true)) {
      //Skip style blocks. But do we really want this?
      if (!(node.parentNode && node.parentNode.nodeName.toLowerCase() === 'style') &&
        //Skip data blocks
        !(node.parentNode && node.parentNode.nodeName.toLowerCase() === 'script' && node.parentNode.getAttribute('type') && options.skipEscapingDataBlockTypes.includes(node.parentNode.getAttribute('type').trim()))) {
          nl = nl.replace(/</g, '&lt;').replace(/>/g, '&gt;')
      }
    }
    else { //node is not a child text node of style, script, pre, code, or samp, e.g. catches `<p> < > </p>`.
      nl = nl.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }
    //Clean double escaped entities, e.g., &amp;amp; -> &amp;, &amp;lt; -> &lt;
    nl = cleanEscapeCharacters(nl)
    out += nl
  } else {
    console.log('Warning; Cannot handle serialising nodes of type: ' + node.nodeType)
  }

  return out
}

function getDoctype () {
  /* Get DOCTYPE from http://stackoverflow.com/a/10162353 */
  var node = document.doctype
  var doctype = ''

  if (node !== null) {
    doctype = '<!DOCTYPE ' +
      node.name +
      (node.publicId ? ' PUBLIC "' + node.publicId + '"' : '') +
      (!node.publicId && node.systemId ? ' SYSTEM' : '') +
      (node.systemId ? ' "' + node.systemId + '"' : '') +
      '>'
  }
  return doctype
}

function getDocument (cn, options) {
  let node = cn || document.documentElement.cloneNode(true)
  options = options || Config.DOMNormalisation

  let doctype = (node.constructor.name === 'SVGSVGElement') ? '<?xml version="1.0" encoding="utf-8"?>' : getDoctype();
  let s = (doctype.length > 0) ? doctype + '\n' : ''
  s += domToString(node, options)
  return s
}

function getDocumentNodeFromString(data, options) {
  options = options || {};
  options['contentType'] = options.contentType || 'text/html';

  var parser = new DOMParser();
  if (options.contentType == 'text/xml') {
    data = data.replace(/<!DOCTYPE[^>]*>/i, '');
  }
  var parsedDoc = parser.parseFromString(data, options.contentType);
  return parsedDoc.documentElement;
}

function getDocumentContentNode(node) {
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

function createHTML(title, main, options) {
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

function createFeedXML(feed, options) {
  options = options || {};

  var feedXML = '';
  var language = ('language' in feed) ? '<language>' + feed.language + '</language>' : '';
  var title = ('title' in feed) ? '<title>' + feed.title + '</title>' : '<title>' + feed.self + '</title>';
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
    var title = ('title' in feed.items[i]) ? '<title>' + feed.items[i].title + '</title>' : '';

    //TODO: This would normally only work for input content is using a markup language.
    var description = feed.items[i].description.replace(/(data|src|href)=(['"])([^'"]+)(['"])/ig, (match, p1, p2, p3, p4) => {
      var isAbsolute = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(p3); // Check if the value is an absolute URL
      return `${p1}="${isAbsolute ? p3 : (p3.startsWith('/') ? origin : url) + '/' + p3}"`;
    });
// console.log(description)
    
    description = escapeCharacters(fixBrokenHTML(description));

    var published = '';
    var updated = '';
    var date = '';
    var license = '';

    switch (options.contentType) {
      case 'application/atom+xml':
        if ('author' in feed.items[i] && typeof feed.items[i].author !== 'undefined') {
          feed.items[i].author.forEach(author => {
            var a = `    <author>
      <uri>${author.uri}</uri>${'name' in author ? `
      <name>${author.name}</name>` : ''}${'email' in author ? `
      <email>${author.email}</email>` : ''}
    </author>`;

            author.uri == feed.author.uri ? authorData.unshift(a) : authorData.push(a);
          })
        }

        published = ('published' in feed.items[i] && typeof feed.items[i].published !== 'undefined') ? '<published>' + feed.items[i].published + '</published>' : '';
        updated = ('updated' in feed.items[i] && typeof feed.items[i].updated !== 'undefined') ? '<updated>' + feed.items[i].updated + '</updated>' : '';

        description = ('description' in feed.items[i]) ? '<content type="html">' + description + '\n\
      </content>' : '';

        license = ('license' in feed.items[i]) ? '<link rel="license" href="' + feed.items[i].license + '" />' : '';

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
        if ('author' in feed.items[i] && typeof feed.items[i].author !== 'undefined') {
          author = feed.items[i].author.find(item => item.uri === feed.author.uri) || feed.items[i].author[0];

          if ('email' in author) {
            author = author.name ? `${author.email} (${author.name})` : author.email;
            authorData.push('<author>' + author + '</author>');
          }
          else if ('uri' in author) {
            authorData.push('<dc:creator>' + (author.name ? author.name : author.uri) + '</dc:creator>');
          }
        }

        published = 'updated' in feed.items[i] && typeof feed.items[i].updated !== 'undefined'
          ? '<pubDate>' + new Date(feed.items[i].updated).toUTCString() + '</pubDate>'
          : 'published' in feed.items[i] && typeof feed.items[i].published !== 'undefined'
          ? '<pubDate>' + new Date(feed.items[i].published).toUTCString() + '</pubDate>'
          : '';

        description = ('description' in feed.items[i]) ? '<description>' + description + '</description>' : '';

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
      if ('author' in feed && 'uri' in feed.author) {
        authorData = `
  <author>
    <uri>${feed.author.uri}</uri>
    ${'name' in feed.author ? `<name>${feed.author.name}</name>` : ''}
  </author>`;

        rights = 'name' in feed.author ? ' ' + feed.author.name : ''
      }

      description = ('description' in feed) ? '<summary>' + feed.description + '</summary>' : '';

      if ('license' in feed) {
        license = '<link rel="license" href="' + feed.license + '" />';
        rightsLicenseText = ' . License: ' + feed.license;
      }

      rights = '<rights>Copyright ' + year + rights + rightsLicenseText + ' . Rights and license are feed only.</rights>';

      generator = '<generator uri="https://dokie.li/">dokieli</generator>';

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

      if ('author' in feed) {
        authorData = feed['author'].name || feed['author'].uri || '';

        rights = 'name' in feed.author ? ' ' + feed.author.name : ''

        if (authorData) {
          authorData = `<dc:creator>${authorData}</dc:creator>`;
        }
      }

      description = 'description' in feed
          ? '<description>' + feed.description + '</description>'
          : 'title' in feed
          ? '<description>' + feed.title + '</description>'
          : '<description>' + feed.self + '</description>';

      generator = '<generator>https://dokie.li/</generator>';

      if ('license' in feed) {
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

function createActivityHTML(o) {
  var prefixes = ' prefix="rdf: http://www.w3.org/1999/02/22-rdf-syntax-ns# schema: http://schema.org/ oa: http://www.w3.org/ns/oa# as: https://www.w3.org/ns/activitystreams#"';

  var types = '<dt>Types</dt>'

  o.type.forEach(function (t) {
    types += '<dd><a about="" href="' + Config.Prefixes[t.split(':')[0]] + t.split(':')[1] + '" typeof="'+ t +'">' + t.split(':')[1] + '</a></dd>'
  })

  var asObjectTypes = ''
  if ('object' in o && 'objectTypes' in o && o.objectTypes.length > 0) {
    asObjectTypes = '<dl><dt>Types</dt>'
    o.objectTypes.forEach(t => {
      asObjectTypes += '<dd><a about="' + o.object + '" href="' + t + '" typeof="'+ t +'">' + t + '</a></dd>'
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
  var asupdated = '<dt>Updated</dt><dd><time datetime="' + datetime + '" datatype="xsd:dateTime" property="as:updated" content="' + datetime + '">' + datetime.substr(0,19).replace('T', ' ') + '</time></dd>'

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
  if(types.indexOf('as:Announce') > -1){
    title += ': Announced'
  } else if (types.indexOf('as:Create') > -1){
    title += ': Created'
  } else if (types.indexOf('as:Like') > -1){
    title += ': Liked'
  } else if (types.indexOf('as:Dislike') > -1){
    title += ': Disliked'
  } else if (types.indexOf('as:Add') > -1){
    title += ': Added'
  }

  var data = '<article'+prefixes+'>\n\
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


function createNoteDataHTML(n) {
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

  switch(motivatedByIRI) {
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

  switch(n.mode) {
    default: case 'read':
      hX = 3;
      if ('creator' in n && 'iri' in n.creator && n.creator.iri == Config.User.IRI) {
        buttonDelete = '<button aria-label="Delete item" class="delete do" title="Delete item">' + Icon[".fas.fa-trash-alt"] + '</button>' ;
      }
      articleClass = (motivatedByIRI == 'oa:commenting') ? '': ' class="do"';
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
    if('iri' in n.creator) {
      creatorIRI = n.creator.iri;
    }

    creatorName = creatorIRI;

    if('name' in n.creator) {
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

  if ('datetime' in n && typeof n.datetime !== 'undefined'){
    var time = '<time datetime="' + n.datetime + '" datatype="xsd:dateTime" property="dcterms:created" content="' + n.datetime + '">' + n.datetime.substr(0,19).replace('T', ' ') + '</time>';
    var timeLinked = ('iri' in n) ? '<a href="' + n.iri + '">' + time + '</a>' : time;
    created = '<dl class="created"><dt>Created</dt><dd>' + timeLinked + '</dd></dl>';
  }

  if (n.language) {
    language = createLanguageHTML(n.language, {property:'dcterms:language', label:'Language'});
    lang = ' lang="' +  n.language + '"';
    xmlLang = ' xml:lang="' +  n.language + '"';
  }
  if (n.license) {
    license = createLicenseHTML(n.license, {rel:'schema:license', label:'License'});
  }
  if (n.rights) {
    rights = createRightsHTML(n.rights, {rel:'dcterms:rights', label:'Rights'});
  }

  //TODO: Differentiate language, license, rights on Annotation from Body
  switch(n.type) {
    case 'comment': case 'note': case 'bookmark': case 'approve': case 'disapprove': case 'specificity':
      if (typeof n.target !== 'undefined' || typeof n.inReplyTo !== 'undefined') { //note, annotation, reply
        //FIXME: Could resourceIRI be a fragment URI or *make sure* it is the document URL without the fragment?
        //TODO: Use n.target.iri?
// console.log(n)
        if (typeof n.body !== 'undefined') {
          var tagsArray = [];

          n.body = Array.isArray(n.body) ? n.body : [n.body];
          n.body.forEach(bodyItem => {
            var bodyLanguage = createLanguageHTML(bodyItem.language, {property:'dcterms:language', label:'Language'}) || language;
            var bodyLicense = createLicenseHTML(bodyItem.license, {rel:'schema:license', label:'License'}) || license;
            var bodyRights = createRightsHTML(bodyItem.rights, {rel:'dcterms:rights', label:'Rights'}) || rights;
            var bodyValue = bodyItem.value || bodyAltLabel;
            // var bodyValue = bodyItem.value || '';
            // var bodyFormat = bodyItem.format ? bodyItem.format : 'rdf:HTML';

            if (bodyItem.purpose) {
              if (bodyItem.purpose == "describing" || bodyItem.purpose == ns.oa.describing.value) {
                body += '<section id="note-' + n.id + '" rel="oa:hasBody" resource="#note-' + n.id + '"><h' + (hX+1) + ' property="schema:name" rel="oa:hasPurpose" resource="oa:describing">Note</h' + (hX+1) + '>' + bodyLanguage + bodyLicense + bodyRights + '<div datatype="rdf:HTML"' + lang + ' property="rdf:value schema:description" resource="#note-' + n.id + '" typeof="oa:TextualBody"' + xmlLang + '>' + bodyValue + '</div></section>';
              }
              if (bodyItem.purpose == "tagging" || bodyItem.purpose == ns.oa.tagging.value) {
                tagsArray.push(bodyValue);
              }
            }
            else {
              body += '<section id="note-' + n.id + '" rel="oa:hasBody" resource="#note-' + n.id + '"><h' + (hX+1) + ' property="schema:name">Note</h' + (hX+1) + '>' + bodyLanguage + bodyLicense + bodyRights + '<div datatype="rdf:HTML"' + lang + ' property="rdf:value schema:description" resource="#note-' + n.id + '" typeof="oa:TextualBody"' + xmlLang + '>' + bodyValue + '</div></section>';
            }
          });

          if (tagsArray.length) {
            tagsArray = tagsArray
              .map(tag => escapeCharacters(tag.trim()))
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
        else if(typeof n.inReplyTo !== 'undefined' && 'iri' in n.inReplyTo) {
          targetIRI = n.inReplyTo.iri;
          targetRelation = ('rel' in n.inReplyTo) ? n.inReplyTo.rel : 'as:inReplyTo';
          // TODO: pass document title and maybe author so they can be displayed on the reply too.
        }

        hasTarget = '<a href="' + targetIRI + '" rel="' + targetRelation + '">' + targetLabel + '</a>';
        if (typeof n.target !== 'undefined' && typeof n.target.source !== 'undefined') {
          hasTarget += ' (<a about="' + n.target.iri + '" href="' + n.target.source +'" rel="oa:hasSource" typeof="oa:SpecificResource">part of</a>)';
        }

        var targetLanguage = (typeof n.target !== 'undefined' && 'language' in n.target && n.target.language.length) ? '<dl><dt>Language</dt><dd><span lang="" property="dcterms:language" xml:lang="">' + n.target.language + '</span></dd></dl>': '';

        target ='<dl class="target"><dt>' + hasTarget + '</dt>';
        if (typeof n.target !== 'undefined' && typeof n.target.selector !== 'undefined') {
          target += '<dd><blockquote about="' + targetIRI + '" cite="' + targetIRI + '">' + targetLanguage + annotationTextSelector + '</blockquote></dd>';
        }
        target += '</dl>';

        target += '<dl class="renderedvia"><dt>Rendered via</dt><dd><a about="' + targetIRI + '" href="https://dokie.li/" rel="oa:renderedVia">dokieli</a></dd></dl>';

        var canonical = '<dl class="canonical"><dt>Canonical</dt><dd rel="oa:canonical" resource="' + canonicalId + '">' + canonicalId + '</dd></dl>';

        note = '<article about="' + aAbout + '" id="' + n.id + '" typeof="oa:Annotation' + noteType + '"' + aPrefix + articleClass + '>'+buttonDelete+'\n\
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
<dl about="#' + n.id +'" id="' + n.id +'" typeof="oa:Annotation">\n\
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
<dt>Citation type</dt><dd><a href="' + n.citation.citationCharacterization + '">' + citationCharacterizationLabel+ '</a></dd>\n\
<dt>Cites</dt><dd><a href="' + n.citation.citedEntity + '" rel="' + n.citation.citationCharacterization + '">' + citedEntityLabel + '</a></dd>\n\
</dl>\n\
';

      note = '<article about="' + aAbout + '" id="' + n.id + '" prefixes="cito: http://purl.org/spart/cito/"' + articleClass + '>\n\
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

function tagsToBodyObjects(string) {
  var bodyObjects = [];

  let tagsArray = string
    .split(',')
    .map(tag => escapeCharacters(tag.trim()))
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

function getClosestSectionNode(node) {
  return node.closest('section') || node.closest('div') || node.closest('article') || node.closest('main') || node.closest('body');
}

function removeSelectorFromNode(node, selector) {
  var clone = node.cloneNode(true);
  var x = clone.querySelectorAll(selector);

  x.forEach(i => {
    i.parentNode.removeChild(i);
  })

  return clone;
}

function getNodeLanguage(node) {
  node = node ?? getDocumentContentNode(document);

  const closestLangNode = node.closest('[lang], [xml\\:lang]');
  return closestLangNode?.getAttribute('lang') || closestLangNode?.getAttributeNS('', 'xml:lang') || '';
}

function addMessageToLog(message, log, options = {}) {
  const m = Object.assign({}, message);
  m['dateTime'] = getDateTimeISO();
  log.unshift(m);
}

function handleActionMessage(resolved, rejected) {
  if (resolved) {
    const { response, message } = resolved;
    showActionMessage(document.body, message);
  }
  else if (rejected) {
    const { error, message } = rejected;
    showActionMessage(document.body, message);
  }
}

function showActionMessage(node, message, options = {}) {
  if (!node || !message) return;

  message['timer'] = ('timer' in message) ? message.timer : Config.ActionMessage.Timer;
  message['type'] = ('type' in message) ? message.type : 'info';

  const id = generateAttributeId();
  const messageItem = domSanitize('<li id="' + id  + '" class="' + message.type + '">' + buttonIcons[message.type].icon + ' ' + message.content + '</li>');

  let aside = node.querySelector('#document-action-message');
  if (!aside) {
    node.appendChild(fragmentFromString('<aside id="document-action-message" class="do on" role="status" tabindex="0">' + Config.Button.Close + '<h2>Messages</h2><ul role="log"></ul></aside>'));
    aside = node.querySelector('#document-action-message');
  }
  aside.querySelector('h2 + ul').insertAdjacentHTML('afterbegin', messageItem);

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

function hasNonWhitespaceText (node) {
  return !!node.textContent.trim();
}

function selectArticleNode(node) {
  var x = node.querySelectorAll(Config.ArticleNodeSelectors.join(','));
  return (x && x.length > 0) ? x[x.length - 1] : getDocumentContentNode(document);
}

function insertDocumentLevelHTML(rootNode, h, options) {
  rootNode = rootNode || document;
  options = options || {};
  h = domSanitize(h);

  options['id'] = ('id' in options) ? options.id : Config.DocumentItems[Config.DocumentItems.length-1];

  var item = Config.DocumentItems.indexOf(options.id);

  var article = selectArticleNode(rootNode);

  var sectioningElements = ['article', 'aside', 'nav', 'section'];
  var skipElements = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

  h = '\n\
' + h;

  if(item > -1) {
    for(var i = item; i >= 0; i--) {
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

function setDate(rootNode, options) {
  rootNode = rootNode || document;
  options = options || {};

  var title = ('title' in options) ? options.title : 'Created';

  var id = (options.id) ? options.id : 'document-' + title.toLowerCase().replace(/\W/g, '-');

  var node = ('property' in options) ? rootNode.querySelector('#' + id + ' [property="' + options.property + '"]') : rootNode.querySelector('#' + id + ' time');

  if(node) {
    var datetime = ('datetime' in options) ? options.datetime.toISOString() : getDateTimeISO();

    if(node.getAttribute('datetime')) {
      node.setAttribute('datetime', datetime);
    }
    if(node.getAttribute('content')) {
      node.setAttribute('content', datetime);
    }
    node.textContent = datetime.substr(0, datetime.indexOf('T'));
  }
  else {
    rootNode = insertDocumentLevelHTML(rootNode, createDateHTML(options), { 'id': id });
  }

  return rootNode;
}

function createDateHTML(options) {
  options = options || {};

  var title = ('title' in options) ? options.title : 'Created';

  var id = ('id' in options && options.id.length > 0) ? ' id="' + options.id + '"' : ' id="document-' + title.toLowerCase().replace(/\W/g, '-') + '"';

  var c = ('class' in options && options.class.length > 0) ? ' class="' + options.class + '"' : '';

  var datetime = ('datetime' in options) ? options.datetime.toISOString() : getDateTimeISO();
  var datetimeLabel = datetime.substr(0, datetime.indexOf('T'));

  var time = ('property' in options)
    ? '<time content="' + datetime + '" datatype="xsd:dateTime" datetime="' + datetime + '" property="' + options.property + '">' + datetimeLabel + '</time>'
    : '<time datetime="' + datetime + '">' + datetimeLabel + '</time>';

  var date = '        <dl'+c+id+'>\n\
      <dt>' + title + '</dt>\n\
      <dd>' + time + '</dd>\n\
    </dl>\n\
';

  return date;
}

function setEditSelections(options) {
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

    if(languageValue == '') {
      dl.parentNode.removeChild(dl);
    }
    else {
      dl.removeAttribute('class');
      var dd = dLangS.closest('dd');
      dd.parentNode.removeChild(dd);
      dd = '<dd><span content="' + languageValue + '" lang="" property="dcterms:language" xml:lang="">' + Config.Languages[languageValue] + '</span></dd>';
      dl.insertAdjacentHTML('beforeend', dd);
    }
  }


  var documentLicense = 'document-license';
  var dLS = document.querySelector('#' + documentLicense + ' option:checked');

  if (dLS) {
    var licenseIRI = dLS.value;

    dl = dLS.closest('#' + documentLicense);
    dl.removeAttribute('contenteditable');

    if(licenseIRI == '') {
      dl.parentNode.removeChild(dl);
    }
    else {
      dl.removeAttribute('class');
      dd = dLS.closest('dd');
      dd.parentNode.removeChild(dd);
      dd = '<dd><a href="' + licenseIRI+ '" rel="schema:license" title="' + Config.License[licenseIRI].description + '">' + Config.License[licenseIRI].name + '</a></dd>';
      dl.insertAdjacentHTML('beforeend', dd);
    }
  }


  var documentType = 'document-type';
  var dTS = document.querySelector('#' + documentType + ' option:checked');

  if (dTS) {
    var typeIRI = dTS.value;

    dl = dTS.closest('#' + documentType);
    dl.removeAttribute('contenteditable');

    if(typeIRI == '') {
      dl.parentNode.removeChild(dl);
    }
    else {
      dl.removeAttribute('class');
      dd = dTS.closest('dd');
      dd.parentNode.removeChild(dd);
      dd = '<dd><a href="' + typeIRI+ '" rel="rdf:type">' + Config.ResourceType[typeIRI].name + '</a></dd>';
      dl.insertAdjacentHTML('beforeend', dd);
    }
  }


  var documentStatus = 'document-status';
  var dSS = document.querySelector('#' + documentStatus + ' option:checked');

  if (dSS) {
    var statusIRI = dSS.value;

    dl = dSS.closest('#' + documentStatus);
    dl.removeAttribute('contenteditable');

    if(statusIRI == '') {
      dl.parentNode.removeChild(dl);
    }
    else {
      dl.removeAttribute('class');
      dd = dSS.closest('dd');
      dd.parentNode.removeChild(dd);
      dd = '<dd prefix="pso: http://purl.org/spar/pso/" rel="pso:holdsStatusInTime" resource="#' + generateAttributeId() + '"><span rel="pso:withStatus" resource="' + statusIRI  + '" typeof="pso:PublicationStatus">' + Config.PublicationStatus[statusIRI].name + '</span></dd>';

      dl.insertAdjacentHTML('beforeend', dd);

      if (statusIRI == 'http://purl.org/spar/pso/published') {
        setDate(document, { 'id': 'document-published', 'property': 'schema:datePublished', 'title': 'Published', 'datetime': options.datetime });
      }
    }
  }

  var documentTestSuite = 'document-test-suite';
  var dTSS = document.querySelector('#' + documentTestSuite + ' input');

  if (dTSS) {
    var testSuiteIRI = dTSS.value;

    dl = dTSS.closest('#' + documentTestSuite);
    dl.removeAttribute('contenteditable');

    if(testSuiteIRI == '') {
      dl.parentNode.removeChild(dl);
    }
    else {
      dl.removeAttribute('class');
      dd = dTSS.closest('dd');
      dd.parentNode.removeChild(dd);
      dd = '<dd><a href="' + testSuiteIRI+ '" rel="spec:testSuite">' + testSuiteIRI + '</a></dd>';
      dl.insertAdjacentHTML('beforeend', dd);
    }
  }

  var documentInbox = 'document-inbox';
  var dIS = document.querySelector('#' + documentInbox + ' input');

  if (dIS) {
    var inboxIRI = dIS.value;

    dl = dIS.closest('#' + documentInbox);
    dl.removeAttribute('contenteditable');

    if(inboxIRI == '') {
      dl.parentNode.removeChild(dl);
    }
    else {
      dl.removeAttribute('class');
      dd = dIS.closest('dd');
      dd.parentNode.removeChild(dd);
      dd = '<dd><a href="' + inboxIRI+ '" rel="ldp:inbox">' + inboxIRI + '</a></dd>';
      dl.insertAdjacentHTML('beforeend', dd);
    }
  }

  var documentInReplyTo = 'document-in-reply-to';
  var dIRTS = document.querySelector('#' + documentInReplyTo + ' input');

  if (dIRTS) {
    var inReplyToIRI = dIRTS.value;

    dl = dIRTS.closest('#' + documentInReplyTo);
    dl.removeAttribute('contenteditable');

    if(inReplyToIRI == '') {
      dl.parentNode.removeChild(dl);
    }
    else {
      dl.removeAttribute('class');
      dd = dIRTS.closest('dd');
      dd.parentNode.removeChild(dd);
      dd = '<dd><a href="' + inReplyToIRI+ '" rel="as:inReplyTo">' + inReplyToIRI + '</a></dd>';
      dl.insertAdjacentHTML('beforeend', dd);
    }
  }

  getResourceInfo();
}

function getRDFaPrefixHTML(prefixes){
  return Object.keys(prefixes).map(i => { return i + ': ' + prefixes[i]; }).join(' ');
}

//TODO: Consider if/how setDocumentRelation and createDefinitionListHTML
function setDocumentRelation(rootNode, data, options) {
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

function showTimeMap(node, url) {
  url = url || Config.OriginalResourceInfo['timemap']
  if(!url) { return; }

  var elementId = 'memento-document';

  getResourceGraph(url)
    .then(g => {
// console.log(g)
      if (!node) {
        node = document.getElementById(elementId);
        if(!node) {
          document.body.appendChild(fragmentFromString('<aside id="' + elementId + '" class="do on"><h2>Memento</h2>' + Config.Button.Close + '<dl><dt>TimeMap</dt><dd><a href="' + url + '">' + url + '</a></dd></dl></aside>'));
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

function setDocumentStatus(rootNode, options) {
  rootNode = rootNode || document;
  options = options || {};

  var s = getDocumentStatusHTML(rootNode, options);

  rootNode = insertDocumentLevelHTML(rootNode, s, options);

  return rootNode;
}

function getDocumentStatusHTML(rootNode, options) {
  rootNode = rootNode || document;
  options = options || {};
  options['mode'] = ('mode' in options) ? options.mode : '';
  options['id'] = ('id' in options) ? options.id : 'document-status';
  var subjectURI = ('subjectURI' in options) ? ' about="' + options.subjectURI + '"' : '';
  var typeLabel = '', typeOf = '';
  var definitionTitle;

  switch(options.type) {
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
      s = '<dl'+c+id+'><dt>' + definitionTitle + '</dt>' + dd + '</dl>';
      break;

    case 'update':
      if(dl) {
        var clone = dl.cloneNode(true);
        dl.parentNode.removeChild(dl);
        clone.insertAdjacentHTML('beforeend', dd);
        s = clone.outerHTML;
      }
      else  {
        s = '<dl'+c+id+'><dt>' + definitionTitle + '</dt>' + dd + '</dl>';
      }
      break;

    case 'delete':
      if(dl) {
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

function handleDeleteNote(button) {
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
function buttonInfo() {
  const errorMessage = `<p class="error">Can't find the documentation. Try later.</p>`;

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
      var getInfoGraph = function() {
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
                  thumbnailUrl = ` (<a href="${videoThumbnailUrl}">poster</a>)`;
                  videoPoster = ` poster="${videoThumbnailUrl}"`;
                }

                figcaption = `
                  <figcaption><a href="${videoContentUrl}">Video</a>${thumbnailUrl} of in dokieli [${duration}${comma}${encodingFormat}]</figcaption>
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
                  <dt>See also</dt><dd><ul>
                  ${seeAlsos.map(seeAlsoIRI => {
                    const seeAlsoIRIG = g.node(rdf.namedNode(seeAlsoIRI));
                    const seeAlsoTitle = getGraphTitle(seeAlsoIRIG) || seeAlsoIRI;
                    return `<li><a href="${seeAlsoIRI}" rel="rdfs:seeAlso noopener" target="_blank">${seeAlsoTitle}</a></li>`;
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
                  <dt>Subjects</dt><dd><dl>
                  ${subjectItems.join('')}
                  </dl></dd>
                `;
              }
            }

            details = `
              <details about="${resource}" open="">
                <summary property="schema:name">About ${title}</summary>
                ${image}
                <div datatype="rdf:HTML" property="schema:description">
                ${description}
                </div>
                ${video}
                <dl>
                  <dt>Source</dt>
                  <dd><a href="${resource}" rel="dcterms:source noopener" target="_blank">${resource}</a></dd>
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

function buttonClose() {
  document.addEventListener('click', e => {
    var button = e.target.closest('button.close')
    if (button) {
      var parent = button.parentNode;
      parent.parentNode.removeChild(parent);
    }
  });
}

function buttonSignIn() {
  document.addEventListener('click', e => {
    var button = e.target.closest('button.signin-user');
    if (button) {
      button.disabled = true;
      showUserIdentityInput();
    }
  });
}

function buttonSignOut() {
  document.addEventListener('click', async (e) => {
    var button = e.target.closest('button.signout-user');
    if (button) {
      button.disabled = true;
      await signOut();
    }
  });
}

function notificationsToggle() {
  document.addEventListener('click', e => {
    var button = e.target.closest('button.toggle');
    if (button) {
      var aside = button.closest('aside');
      aside.classList.toggle("on");

      window.history.replaceState({}, null, Config.DocumentURL);
    }
  });
}

function getButtonDisabledHTML(id) {
  var html = '';

  if (document.location.protocol === 'file:' || !Config.ButtonStates[id]) {
    html = ' disabled="disabled"';  
  }
  if (Config.ButtonStates[id]) {
    html = '';
  }

  return html;
}

function isButtonDisabled(id) {
  return !Config.ButtonStates[id];
}

function getGraphContributorsRole(g, options) {
  options = options || {};
  options['sort'] = options['sort'] || false;
  options['role'] = options['role'] || 'contributor';
// console.log(options)
  var contributors;

  switch(options.role) {
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
function getGraphData(s, options) {
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

    if (info['original']  == options['subjectURI']) {
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
    info['original'] =  original[0];
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

  var timegate = s.out(ns.mem.timegate).values;
  if (timegate.length) {
    info['timegate'] = timegate[0];
  }

  if (!Config.OriginalResourceInfo || ('mode' in options && options.mode == 'update' )) {
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

function getResourceInfo(data, options) {
  data = data || getDocument();
  options = options || {};
  options['contentType'] = ('contentType' in options) ? options.contentType : 'text/html';
  options['subjectURI'] = ('subjectURI' in options) ? options.subjectURI : Config.DocumentURL;

  var documentURL = options['subjectURI'];

  Config['Resource'] = Config['Resource'] || {};
  Config['Resource'][documentURL] = Config['Resource'][documentURL] || {};
  Config['Resource'][documentURL]['data'] = data;
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

      if (documentURL == Config.DocumentURL) {
        updateFeatureStatesOfResourceInfo(info);
      }

      for (var key in info) {
        if (Object.hasOwn(info, key) && key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
            Config['Resource'][documentURL][key] = info[key];
        }
      }

      return info;
    });
}

function getGraphFromDataBlock(data, options) {
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

function getResourceSupplementalInfo (documentURL, options) {
  options = options || {};
  options['reuse'] = options['reuse'] === true ? true : false;
  options['followLinkRelationTypes'] = options['followLinkRelationTypes'] || [];
  var checkHeaders = ['wac-allow', 'link', 'last-modified', 'etag', 'expires'];

  //TODO: Add `acl` and `http://www.w3.org/ns/solid/terms#storageDescription` to `linkRelationTypesOfInterest` and process them.

  if (options.reuse) {
    const currentDate = new Date();
    const previousResponse = Config['Resource'][documentURL].headers?.response;
    const previousResponseDateHeaderValue = previousResponse?.get('date');
    const previousResponseDate = previousResponseDateHeaderValue ? new Date(previousResponseDateHeaderValue) : null;

    if(!previousResponse || !previousResponseDateHeaderValue || (previousResponseDate && (currentDate.getTime() - previousResponseDate.getTime() > Config.RequestCheck.Timer))) {
      options.reuse = false;
    }
  }

  if (!options.reuse) {
    var rHeaders = { 'Cache-Control': 'no-cache' };
    var rOptions = { 'noCache': true };
    return getResourceHead(documentURL, rHeaders, rOptions)
      .then(response => {
        var headers = response.headers;

        Config['Resource'][documentURL]['headers'] = {};
        Config['Resource'][documentURL]['headers']['response'] = headers;

        checkHeaders.forEach(header => {
          var headerValue = response.headers.get(header);
          // headerValue = 'foo=bar ,user=" READ wriTe Append control ", public=" read append" ,other="read " , baz= write, group=" ",,';

          if (headerValue) {
            Config['Resource'][documentURL]['headers'][header] = { 'field-value' : headerValue };

            if (header == 'wac-allow') {
              var permissionGroups = Config['Resource'][documentURL]['headers']['wac-allow']["field-value"];
              var wacAllowRegex = new RegExp(/(\w+)\s*=\s*"?\s*((?:\s*[^",\s]+)*)\s*"?/, 'ig');
              var wacAllowMatches = matchAllIndex(permissionGroups, wacAllowRegex);

              Config['Resource'][documentURL]['headers']['wac-allow']['permissionGroup'] = {};

              wacAllowMatches.forEach(match => {
                var modesString = match[2] || '';
                var accessModes = uniqueArray(modesString.toLowerCase().split(/\s+/));

                Config['Resource'][documentURL]['headers']['wac-allow']['permissionGroup'][match[1]] = accessModes;
              });
            }

            if (header == 'link') {
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
          }
        })
      })
      .then(() => {
        var promises = [];
        var linkHeaders = Config['Resource'][documentURL]['headers']['linkHeaders'];

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
      });
  }
  else {
    return Promise.resolve(Config['Resource'][documentURL]);
  }
}

function getResourceInfoCitations(g) {
  var documentURL = Config.DocumentURL;
  var citationProperties = Object.keys(Config.Citation).concat([ns.dcterms.references.value, ns.schema.citation.value]);

  var predicates = citationProperties.map((property) => {
    return rdf.namedNode(property);
  })

  var citationsList = g.out(predicates).distinct().values;

  var externals = [];
  citationsList.forEach(i => {
    var iAbsolute = stripFragmentFromString(i);
    if (iAbsolute !== documentURL){
      externals.push(iAbsolute)
    }
  });
  citationsList = uniqueArray(externals).sort();

  return citationsList;
}

//TODO: Review grapoi
function getResourceInfoODRLPolicies(s) {
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

//TODO: Review grapoi
function getResourceInfoSpecRequirements(s) {
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
function getResourceInfoSpecAdvisements(s) {
  var info = {}
  info['spec'] = {};
  info['spec']['advisement'] = {};

  s.out(ns.spec.advisement).values.forEach(advisementIRI => {
    info['spec']['advisement'][advisementIRI] = {};

    var advisementGraph = s.node(rdf.namedNode(advisementIRI));

    info['spec']['advisement'][advisementIRI][ns.spec.statement.value] =  advisementGraph.out(ns.spec.statement).values[0];
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
function getResourceInfoSpecChanges(s) {
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
function getResourceInfoSKOS(g) {
  var info = {};
  info['skos'] = {'data': {}, 'type': {}};

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

function updateDocumentDoButtonStates() {
  var documentDo = document.getElementById('document-do');

  if (documentDo) {
    Object.keys(Config.ButtonStates).forEach(id => {
      var s = documentDo.querySelector('.' + id);

      if (s) {
        if (Config.ButtonStates[id]) {
          s.removeAttribute('disabled');
        }
        else {
          s.setAttribute('disabled', 'disabled');
        }
      }
    });
    return;
  }
}

//TODO: This should be triggered after sign-in
function updateFeatureStatesOfResourceInfo(info) {
  var writeRequiredFeatures = ['resource-save', 'create-version', 'create-immutable', 'resource-delete'];

  if (!Config.User.IRI) {
    writeRequiredFeatures.forEach(feature => {
      Config.ButtonStates[feature] = false;
    })
  }
  // else {
  //   if ((Config.User.Storage && Config.User.Storage.length > 0) ||
  //       (Config.User.Outbox && Config.User.Outbox.length > 0) ||
  //       (Config.User.Knows && Config.User.Knows.length > 0) ||
  //       (Config.User.Contacts && Object.keys(Config.User.Contacts).length > 0)) {
  //         Config.ButtonStates['resource-notifications'] = true;
  //   }
  // }

  //XXX: This relies on `wac-allow` HTTP header. What to do if no `wac-allow`?
  var writeAccessMode = accessModeAllowed(Config.DocumentURL, 'write');
  writeRequiredFeatures.forEach(feature => {
    Config.ButtonStates[feature] = writeAccessMode;
  })

  if (typeof info !== 'undefined') {
    if (info['timemap']) {
      Config.ButtonStates['resource-memento'] = true;
    }

    if (info['odrl'] && info['odrl']['prohibitionActions'] && info['odrl']['prohibitionAssignee'] == Config.User.IRI) {
      if (info['odrl']['prohibitionActions'].includes(ns.odrl.archive.value)) {
        Config.ButtonStates['snapshot-internet-archive'] = false;
      }

      if (info['odrl']['prohibitionActions'].includes(ns.odrl.derive.value)) {
        Config.ButtonStates['resource-save-as'] = false;
      }

      if (info['odrl']['prohibitionActions'].includes(ns.odrl.print.value)) {
        Config.ButtonStates['resource-print'] = false;
      }

      if (info['odrl']['prohibitionActions'].includes(ns.odrl.reproduce.value)) {
        Config.ButtonStates['create-immutable'] = false;
        Config.ButtonStates['create-version'] = false;
        Config.ButtonStates['export-as-html'] = false;
        Config.ButtonStates['resource-save-as'] = false;
        Config.ButtonStates['robustify-links'] = false;
        Config.ButtonStates['snapshot-internet-archive'] = false;
        Config.ButtonStates['generate-feed'] = false;
      }

      if (info['odrl']['prohibitionActions'].includes(ns.odrl.transform.value)) {
        Config.ButtonStates['export-as-html'] = false;
      }
    }
  }
}

function accessModeAllowed (documentURL, mode) {
  documentURL = documentURL || Config.DocumentURL;

  var allowedMode = false;

  if ('headers' in Config.Resource[documentURL] && 'wac-allow' in Config.Resource[documentURL]['headers'] && 'permissionGroup' in Config.Resource[documentURL]['headers']['wac-allow']) {
    if (('user' in Config.Resource[documentURL]['headers']['wac-allow']['permissionGroup'] && Config.Resource[documentURL]['headers']['wac-allow']['permissionGroup']['user'].includes(mode))
      || ('public' in Config.Resource[documentURL]['headers']['wac-allow']['permissionGroup'] && Config.Resource[documentURL]['headers']['wac-allow']['permissionGroup']['public'].includes(mode))) {
      allowedMode = true;
    }
  }

  return allowedMode;
}

function createImmutableResource(url, data, options) {
  if(!url) return;

  var uuid = generateUUID();
  var containerIRI = url.substr(0, url.lastIndexOf('/') + 1);
  var immutableURL = containerIRI + uuid;

  var rootNode = document.documentElement.cloneNode(true);

  var date = new Date();
  rootNode = setDate(rootNode, { 'id': 'document-created', 'property': 'schema:dateCreated', 'title': 'Created', 'datetime': date });

  var resourceState = rootNode.querySelector('#' + 'document-resource-state');
  if(!resourceState){
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
  data = getDocument(rootNode);
  processSave(containerIRI, uuid, data, options)
    .then((resolved) => handleActionMessage(resolved))
    .catch((rejected) => handleActionMessage(null, rejected))
    .finally(() => {
      getResourceInfo(data, { 'mode': 'update' });
    });

  timeMapURL = Config.OriginalResourceInfo['timemap'] || url + '.timemap';


  //Update URI-R
  if (Config.OriginalResourceInfo['state'] != ns.mem.Memento.value) {
    setDate(document, { 'id': 'document-created', 'property': 'schema:dateCreated', 'title': 'Created', 'datetime': date });

    o = { 'id': 'document-identifier', 'title': 'Identifier' };
    r = { 'rel': 'owl:sameAs', 'href': url };
    setDocumentRelation(document, [r], o);

    o = { 'id': 'document-latest-version', 'title': 'Latest Version' };
    r = { 'rel': 'mem:memento rel:latest-version', 'href': immutableURL };
    setDocumentRelation(document, [r], o);

    if(Config.OriginalResourceInfo['latest-version']) {
      o = { 'id': 'document-predecessor-version', 'title': 'Predecessor Version' };
      r = { 'rel': 'mem:memento rel:predecessor-version', 'href': Config.OriginalResourceInfo['latest-version'] };
      setDocumentRelation(document, [r], o);
    }

    //TODO document-timegate

    o = { 'id': 'document-timemap', 'title': 'TimeMap' };
    r = { 'rel': 'mem:timemap', 'href': timeMapURL };
    setDocumentRelation(document, [r], o);

    // Create URI-R
    data = getDocument();
    processSave(url, null, data, options)
      .then((resolved) => handleActionMessage(resolved))
      .catch((rejected) => handleActionMessage(null, rejected))
  }


  //Update URI-T
  var insertG = '<' + url + '> <http://mementoweb.org/ns#memento> <' + immutableURL + '> .\n\
<' + immutableURL + '> <http://mementoweb.org/ns#mementoDateTime> "' + date.toISOString() + '"^^<http://www.w3.org/2001/XMLSchema#dateTime> .';

  var patch = { 'insert': insertG };

  patchResourceWithAcceptPatch(timeMapURL, patch).then(() =>{
    showTimeMap(null, timeMapURL)
  });
}

function createMutableResource(url, data, options) {
  if(!url) return;

  setDate(document, { 'id': 'document-created', 'property': 'schema:dateCreated', 'title': 'Created' } );

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

  if(Config.OriginalResourceInfo['latest-version']) {
    o = { 'id': 'document-predecessor-version', 'title': 'Predecessor Version' };
    r = { 'rel': 'rel:predecessor-version', 'href': Config.OriginalResourceInfo['latest-version'] };
    setDocumentRelation(document, [r], o);
  }

  data = getDocument();
  processSave(containerIRI, uuid, data, options)
    .then((resolved) => handleActionMessage(resolved))
    .catch((rejected) => handleActionMessage(null, rejected))

  o = { 'id': 'document-identifier', 'title': 'Identifier' };
  r = { 'rel': 'owl:sameAs', 'href': url };
  setDocumentRelation(document, [r], o);

  data = getDocument();
  processSave(url, null, data, options)
    .then((resolved) => handleActionMessage(resolved))
    .catch((rejected) => handleActionMessage(null, rejected))
    .finally(() => {
      getResourceInfo(data, { 'mode': 'update' });
    });
}

function updateMutableResource(url, data, options) {
  if(!url) return;
  options = options || {};

  var rootNode = (data) ? fragmentFromString(data).cloneNode(true) : document;

  if (!('datetime' in options)) {
    options['datetime'] = new Date();
  }

  setDate(rootNode, { 'id': 'document-modified', 'property': 'schema:dateModified', 'title': 'Modified', 'datetime': options.datetime } );
  setEditSelections(options);

  data = getDocument();
  processSave(url, null, data, options)
    .then((resolved) => handleActionMessage(resolved))
    .catch((rejected) => handleActionMessage(null, rejected))
    .finally(() => {
      getResourceInfo(data, { 'mode': 'update' });
    });
}

function removeNodesWithIds(ids) {
  if (typeof ids === 'undefined') { return }

  ids = (Array.isArray(ids)) ? ids : [ids];

  ids.forEach(id => {
    var node = document.getElementById(id);
    if(node) {
      node.parentNode.removeChild(node);
    }
  });
}

function removeReferences() {
  var refs = document.querySelectorAll('body *:not([id="references"]) cite + .ref:not(.do)');

  refs.forEach(r => {
    r.parentNode.removeChild(r);
  });
}


function referenceItemHTML(referencesList, id, citation) {
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


function buildReferences(referencesList, id, citation) {
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

function updateReferences(referencesList, options){
  options = options || {};
  options['external'] = options.external || true;
  options['internal'] = options.internal || false;

  var citeA = document.querySelectorAll('body *:not([id="references"]) cite > a');
  var uniqueCitations = {};
  var lis = [];

  var docURL = document.location.origin + document.location.pathname;

  var insertRef = function(cite, rId, refId, refLabel) {
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


        if(versionDate && versionURL) {
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

function showRobustLinksDecoration(node) {
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
    originalurl = (originalurl) ? '<span>Original</span><span><a href="' + originalurl + '" rel="noopener" target="_blank">' + originalurl + '</a></span>' : '';

    var versionurl = i.getAttribute('data-versionurl');
    versionurl = (versionurl) ? versionurl.trim() : undefined;
    var versiondate = i.getAttribute('data-versiondate');
    var nearlinkdateurl = '';

    if (versiondate) {
      versiondate = versiondate.trim();
      nearlinkdateurl = 'http://timetravel.mementoweb.org/memento/' + versiondate.replace(/\D/g, '') + '/' + href;
      nearlinkdateurl = '<span>Near Link Date</span><span><a href="' + nearlinkdateurl + '" rel="noopener" target="_blank">' + versiondate + '</a></span>'
    }
    else if (versionurl) {
      versiondate = versionurl;
    }

    versionurl = (versionurl) ? '<span>Version</span><span><a href="' + versionurl + '" rel="noopener" target="_blank">' + versiondate + '</a></span>' : '';

    // var citations = Object.keys(Config.Citation).concat(ns.schema.citation);

    //FIXME: This is ultimately inaccurate because it should be obtained through RDF parser
    var citation = '';
    var citationLabels = [];
    var iri;
    var citationType;
    var rel = i.getAttribute('rel');

    if (rel) {
      citationLabels = getCitationLabelsFromTerms(rel);

      if(citationLabels.length > 0) {
        citationType = citationLabels.join(', ');
        citation = '<span>Citation Reason</span><span>' + citationType + '</span>';
      }
    }

    i.insertAdjacentHTML('afterend', '<span class="do robustlinks"><button title="Show Robust Links">🔗</button><span>' + citation + originalurl + versionurl + nearlinkdateurl + '</span></span>');
  });

  document.querySelectorAll('.do.robustlinks').forEach(i => {
    i.addEventListener('click', (e) => {
      if (e.target.closest('button')) {
        var pN = e.target.parentNode;
        if (pN.classList.contains('on')){
          pN.classList.remove('on');
        }
        else {
          pN.classList.add('on');
        }
      }
    });
  });
}

function getCitationLabelsFromTerms(rel, citations) {
  citations = citations || Object.keys(Config.Citation);

  var citationLabels = [];

  rel.split(' ').forEach(term => {
    if (Config.Citation[term]){
      citationLabels.push(Config.Citation[term]);
    }
    else {
      var s = term.split(':');
      if (s.length == 2) {
        citations.forEach(c=>{
          if (s[1] == getFragmentFromString(c) || s[1] == getURLLastPath(c)) {
            citationLabels.push(Config.Citation[c])
          }
        });
      }
    }
  });

  return citationLabels
}

function getTestDescriptionReviewStatusHTML() {
  var reviewStatusHTML = [];

  reviewStatusHTML.push('<dl id="test-description-review-statuses">');

  Object.keys(Config.TestDescriptionReviewStatus).forEach(i => {
    reviewStatusHTML.push('<dt>' + getFragmentFromString(i) + '</dt>');
    reviewStatusHTML.push('<dd>' + Config.TestDescriptionReviewStatus[i] + '</dd>');
  })

  reviewStatusHTML.push('</dl>');

  return reviewStatusHTML.join('');
}

function getAgentHTML(options = {}) {
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

function getResourceImageHTML(resource, options = {}) {
  var avatarSize = ('avatarSize' in options) ? options.avatarSize : Config['AvatarSize'];

  return `<img alt="" height="${avatarSize}" rel="schema:image" src="${resource}" width="${avatarSize}" />`;
}

function createLicenseHTML(iri, options = {}) {
  options['rel'] = options.rel ? options.rel : 'schema:license';
  options['label'] = options.label ? options.label : 'License';
  return createLicenseRightsHTML(iri, options);
}

function createRightsHTML(iri, options = {}) {
  options['rel'] = options.rel ? options.rel : 'dcterms:rights';
  options['label'] = options.label ? options.label : 'Rights';
  return createLicenseRightsHTML(iri, options);
}

function createLicenseRightsHTML(iri, options = {}) {
  if (!iri) return '';

  var html = '';
  var title = '';
  var name = iri;

  html = '<dl class="' + options.label.toLowerCase() + '"><dt>' + options.label + '</dt><dd>';
  if ('name' in options) {
    name = options.name;
    title = ('description' in options) ? ' title="' + options.description + '"' : '';
  }
  else if (Config.License[iri]) {
    name = Config.License[iri].name;
    title = ' title="' + Config.License[iri].description + '"';
  }

  html += '<a href="' + iri + '" rel="' + options.rel + '"' + title + '>' + name + '</a>';
  html += '</dd></dl>';

  return html;
}

//TODO: Consider if/how setDocumentRelation and createDefinitionListHTML
//TODO: Extend with data.resource, data.datatype
function createDefinitionListHTML(data, options = {}) {
  // console.log(data, options)
  if (!data || !options) { return; }

  var id = (options.id) ? ` id="${options.id}"` : '';
  var title = options.title || options.id;
  var classAttribute = (options.class) ? ` class="${options.class}"` : ` class="${title.toLowerCase()}"`;

  var dds = [];

  data.forEach(d => {
    var prefix = d.prefix ? ` prefix="${d.prefix}"`: '';
    var lang = d.lang !== undefined ? ` lang="${d.lang}"` : '';
    var xmlLang = d.xmlLang !== undefined ? ` xml:lang="${d.xmlLang}"` : '';
    var resource = d.resource ? ` resource="${d.resource}"`: '';
    var content = d.content ? ` content="${d.content}"`: '';
    var datatype = d.datatype ? ` datatype="${d.datatype}"`: '';
    var typeOf = d.typeOf ? ` typeof="${d.typeOf}"`: '';

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
//   var name = Config.Languages[language] || language;

//   var html = `
//     <dl class="${label.toLowerCase()}"${id}>
//       <dt>${label}</dt>
//       <dd><span content="${language}" lang="" property="${property}" xml:lang="">${name}</span></dd>
//     </dl>`;

//   return html;
// }


function createLanguageHTML(language, options = {}) {
  if (!language) return '';

  var property = options.property || 'dcterms:language';
  var content = language;
  var textContent = Config.Languages[language] || language;
  options['title'] = options.label || 'Language';

  return createDefinitionListHTML([{ property, content, textContent, lang: '', xmlLang: '' }], options);
}

function createInboxHTML(url, options = {}) {
  if (!url) return '';

  options['class'] = options.class || 'inbox';
  options['title'] = 'Inbox';

  return createDefinitionListHTML([{'href': url, 'rel': 'ldp:inbox'}], options);
}

function createInReplyToHTML(url, options = {}) {
  if (!url) return '';

  options['class'] = options.class || 'in-reply-to';
  options['title'] = 'In reply to';

  return createDefinitionListHTML([{'href': url, 'rel': 'as:inReplyTo'}], options);
}

function createPublicationStatusHTML(url, options = {}) {
  if (!url) return '';

  options['class'] = options.class || 'publication-status';
  var textContent = Config.PublicationStatus[url].name || url;
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

function createResourceTypeHTML(url, options = {}) {
  if (!url) return '';

  options['class'] = options.class || 'resource-type';
  var textContent = Config.ResourceType[url].name || url;
  options['title'] = 'Type';

  return createDefinitionListHTML([{'href': url, 'rel': 'rdf:type', textContent}], options);
}

function createTestSuiteHTML(url, options = {}) {
  if (!url) return '';

  options['class'] = options.class || 'test-suite';
  options['title'] = 'Test Suite';

  return createDefinitionListHTML([{'href': url, 'rel': 'spec:testSuite'}], options);
}

function getAnnotationInboxLocationHTML(action) {
  var s = '', inputs = [], checked = '';

  if (Config.User.TypeIndex && Config.User.TypeIndex[ns.as.Announce.value]) {
    if (Config.User.UI && Config.User.UI['annotationInboxLocation'] && Config.User.UI.annotationInboxLocation['checked']) {
      checked = ' checked="checked"';
    }
    s = `<input type="checkbox" id="${action}-annotation-inbox" name="${action}-annotation-inbox"${checked} /><label for="annotation-inbox">Inbox</label>`;
  }

  return s;
}

function getAnnotationLocationHTML(action) {
  var s = '', inputs = [], checked = '';

  if(typeof Config.AnnotationService !== 'undefined') {
    if (Config.User.Storage && Config.User.Storage.length > 0 || Config.User.Outbox && Config.User.Outbox.length > 0) {
      if (Config.User.UI && Config.User.UI['annotationLocationService'] && Config.User.UI.annotationLocationService['checked']) {
        checked = ' checked="checked"';
      }
    }
    else {
      checked = ' checked="checked" disabled="disabled"';
    }

    inputs.push(`<input type="checkbox" id="${action}-annotation-location-service" name="${action}-annotation-location-service"${checked} /><label for="annotation-location-service">Annotation service</label>`);
  }

  checked = ' checked="checked"';

  if(Config.User.Storage && Config.User.Storage.length > 0 || Config.User.Outbox && Config.User.Outbox.length > 0) {
    if (Config.User.UI && Config.User.UI['annotationLocationPersonalStorage'] && !Config.User.UI.annotationLocationPersonalStorage['checked']) {
        checked = '';
    }

    inputs.push(`<input type="checkbox" id="${action}-annotation-location-personal-storage" name="${action}-annotation-location-personal-storage"${checked} /><label for="annotation-location-personal-storage">Personal storage</label>`);
  }

  s = 'Store at: ' + inputs.join('');

  return s;
}

function getPublicationStatusOptionsHTML(options) {
  options = options || {};
  var s = '', selectedIRI = '';

  if ('selected' in options) {
    selectedIRI = options.selected;
    if (selectedIRI == '') {
      s += '<option selected="selected" value="">Choose a publication status</option>';
    }
  }
  else {
    selectedIRI = ns.pso.draft.value;
  }

  Object.keys(Config.PublicationStatus).forEach(iri => {
    var selected = (iri == selectedIRI) ? ' selected="selected"' : '';
    s += '<option value="' + iri + '" title="' + Config.PublicationStatus[iri].description  + '"' + selected + '>' + Config.PublicationStatus[iri].name  + '</option>';
  })

  return s;
}

function getResourceTypeOptionsHTML(options) {
  options = options || {};
  var s = '', selectedType = '';

  if ('selected' in options) {
    selectedType = options.selected;
    if (selectedType == '') {
      s += '<option selected="selected" value="">Choose a resource type</option>';
    }
  }
  else {
    selectedType = 'http://schema.org/Article';
  }

  Object.keys(Config.ResourceType).forEach(iri => {
    var selected = (iri == selectedType) ? ' selected="selected"' : '';
    s += '<option value="' + iri + '" title="' + Config.ResourceType[iri].description  + '"' + selected + '>' + Config.ResourceType[iri].name  + '</option>';
  });

  return s;
}

function getLanguageOptionsHTML(options) {
  options = options || {};
  var s = '', selectedLang = '';

  if ('selected' in options) {
    selectedLang = options.selected;
    if (selectedLang == '') {
      s += '<option selected="selected" value="">Choose a language</option>';
    }
  }
  else if(typeof Config.User.UI.Language !== 'undefined') {
    selectedLang = Config.User.UI.Language;
  }
  else {
    selectedLang = 'en';
  }

  Object.keys(Config.Languages).forEach(lang => {
    let selected = (lang == selectedLang) ? ' selected="selected"' : '';
    s += '<option' + selected + ' value="' + lang + '">' + Config.Languages[lang] + '</option>';
  });

  return s;
}

function getLicenseOptionsHTML(options) {
  options = options || {};
  var s = '', selectedIRI = '';

  if ('selected' in options) {
    selectedIRI = options.selected;
    if (selectedIRI == '') {
      s += '<option selected="selected" value="">Choose a license</option>';
    }
  }
  else if(typeof Config.User.UI.License !== 'undefined') {
    selectedIRI = Config.User.UI.License;
  }
  else {
    selectedIRI = 'https://creativecommons.org/licenses/by/4.0/';
  }

  Object.keys(Config.License).forEach(iri => {
    if(iri != 'NoLicense') {
      var selected = (iri == selectedIRI) ? ' selected="selected"' : '';
      s += '<option value="' + iri + '" title="' + Config.License[iri].description  + '"' + selected + '>' + Config.License[iri].name  + '</option>';
    }
  })

  return s;
}

function getCitationOptionsHTML(type) {
  type = type || 'cites';

  var s = '';
  Object.keys(Config.Citation).forEach(iri => {
    s += '<option value="' + iri + '">' + Config.Citation[iri]  + '</option>';
  })

  return s;
}

function showGeneralMessages() {
  showResourceAudienceAgentOccupations();
}

function getAccessModeOptionsHTML(options) {
  // id = encodeURIComponent(id);
  options = options || {};
  //Contextual access control modes and human-readable labels
  //UC-sharing-article: See Config.AccessContext.Share
  options['context'] = options['context'] || 'Share';
  var accessContext = Config.AccessContext[options.context] || 'Share';

  var s  = '<option value="">No access</option>';

  var modes = Object.keys(accessContext);
  modes.forEach(mode => {
    var selected = (options.selected && (mode === options.selected)) ? ' selected="selected"' : '';
    s += '<option' + selected + ' value="' + mode + '">' + accessContext[mode] + '</option>';
  });

  // console.log(s);
  return s;
}

function showResourceAudienceAgentOccupations() {
  if (Config.User.Occupations && Config.User.Occupations.length > 0) {
    var matches = [];

    Config.Resource[Config.DocumentURL].audience.forEach(audience => {
      if (Config.User.Occupations.includes(audience)){
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

        if (ul.length > 0){
          ul = `<ul>${ul.join('')}</ul>`;

          var message = `<span>This document's audience matches your profile:</span>${ul}`;
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

function setCopyToClipboard(contentNode, triggerNode, options = {}) {
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
          var message = `Copied to clipboard.`;
          message = {
            'content': message,
            'type': 'info',
            'timer': 3000
          }
          addMessageToLog(message, Config.MessageLog);
          showActionMessage(document.body, message);
        })
        .catch(error => {
          var message = `Failed to copy text to clipboard.`;
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

function serializeTableToText(table) {
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

function serializeTableSectionToText(section) {
  //FIXME: Needs to handle rowspan/colspan and th/td combinations
  //TODO: Test with example tables:
  //https://csarven.ca/linked-research-decentralised-web#quality-attributes-dokieli
  //https://csarven.ca/linked-research-decentralised-web.html#forces-and-functions-in-specifications
  //https://csarven.ca/linked-research-decentralised-web#fair-metrics-dataset-dokieli
  //https://csarven.ca/linked-research-decentralised-web#dokieli-implementation-web-annotation-motivations-notifications
  //https://csarven.ca/linked-research-decentralised-web#ldn-test-consumer-summary

  var data = [];
  var rows;

  switch(section.nodeName.toLowerCase()) {
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

    switch(section.nodeName.toLowerCase()) {
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


function focusNote() {
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

function parseMarkdown(data, options) {
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

function getReferenceLabel(motivatedBy) {
  motivatedBy = motivatedBy || '';
  //TODO: uriToPrefix
  motivatedBy = (motivatedBy.length && motivatedBy.slice(0, 4) == 'http' && motivatedBy.indexOf('#') > -1) ? 'oa:' + motivatedBy.substr(motivatedBy.lastIndexOf('#') + 1) : motivatedBy;

  return Config.MotivationSign[motivatedBy] || '#';
}

function createRDFaMarkObject(r, mode) {
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

function createRDFaHTML(r, mode) {
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

export {
  escapeCharacters,
  cleanEscapeCharacters,
  fixBrokenHTML,
  getNodeWithoutClasses,
  domToString,
  dumpNode,
  getDoctype,
  getDocument,
  getDocumentNodeFromString,
  getDocumentContentNode,
  createHTML,
  createFeedXML,
  createActivityHTML,
  getClosestSectionNode,
  removeSelectorFromNode,
  removeNodesWithIds,
  getNodeLanguage,
  addMessageToLog,
  showActionMessage,
  handleActionMessage,
  selectArticleNode,
  insertDocumentLevelHTML,
  setDate,
  createDateHTML,
  setEditSelections,
  getRDFaPrefixHTML,
  setDocumentRelation,
  setDocumentStatus,
  getDocumentStatusHTML,
  buttonClose,
  buttonInfo,
  buttonSignIn,
  buttonSignOut,
  notificationsToggle,
  getButtonDisabledHTML,
  showTimeMap,
  getGraphContributorsRole,
  getGraphData,
  getResourceInfo,
  getGraphFromDataBlock,
  getResourceSupplementalInfo,
  getResourceInfoODRLPolicies,
  getResourceInfoSpecRequirements,
  getResourceInfoSpecAdvisements,
  getResourceInfoSpecChanges,
  getResourceInfoSKOS,
  getResourceInfoCitations,
  handleDeleteNote,
  updateDocumentDoButtonStates,
  updateFeatureStatesOfResourceInfo,
  accessModeAllowed,
  createImmutableResource,
  createMutableResource,
  updateMutableResource,
  removeReferences,
  referenceItemHTML,
  buildReferences,
  updateReferences,
  showRobustLinksDecoration,
  getCitationLabelsFromTerms,
  getTestDescriptionReviewStatusHTML,
  getAgentHTML,
  getResourceImageHTML,
  createLanguageHTML,
  createLicenseHTML,
  createRightsHTML,
  createPublicationStatusHTML,
  createResourceTypeHTML,
  createInboxHTML,
  createInReplyToHTML,
  createTestSuiteHTML,
  getAnnotationInboxLocationHTML,
  getAnnotationLocationHTML,
  getResourceTypeOptionsHTML,
  getPublicationStatusOptionsHTML,
  getLanguageOptionsHTML,
  getLicenseOptionsHTML,
  getCitationOptionsHTML,
  getAccessModeOptionsHTML,
  showGeneralMessages,
  showResourceAudienceAgentOccupations,
  setCopyToClipboard,
  serializeTableToText,
  serializeTableSectionToText,
  focusNote,
  parseMarkdown,
  getReferenceLabel,
  createNoteDataHTML,
  tagsToBodyObjects,
  createRDFaHTML,
  createRDFaMarkObject,
  createDefinitionListHTML,
  isButtonDisabled,
  hasNonWhitespaceText
}
