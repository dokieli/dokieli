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

import { generateAttributeId } from "./../../util.js";
import { fragmentFromString } from "../../utils/html.js";
import { Icon } from "../../ui/icons.js";
import Config from "../../config.js";
import { generateDataURI, stripFragmentFromString } from "../../uri.js";
import {
  getSelectedParentElement,
  rangeSelectsSingleNode,
  exportSelection,
  cloneSelection,
  restoreSelection,
  selectionToTextQuote,
  selectionToSelectors,
  setSelectionFromTextQuote,
  setSelectionByOffset,
  createAnnotation,
  markSegmentHTML,
} from '@dokieli/web-annotation';

// 1. new annotation
// replace the selection with fragment 
// 2. old annotation
// take textQuoteSelector
// calculate to anchorand head --> anchor will be the index of the first character of anchor and so on
// create a new (PM) selection
// now that we have a selection --> docSelectionToHTML --> fragmentFromString --> replaceSelectionWithDOMFragment


//replaceSelection
//highlightSelection

//update DOM ()

//getTextQuoteHTML modified from dokieli.js
export function getTextQuoteHTML(refId, motivatedBy, selectedContent, docRefType, options) {
  if (typeof selectedContent !== "string") { throw new Error(`getTextQuoteHTML: selectedContent is of type ${typeof selectedContent}`) }
  if (!selectedContent.length) { throw new Error(`getTextQuoteHTML: selectedContent is empty`) }

  refId = refId || generateAttributeId();
  motivatedBy = motivatedBy || 'oa:replying';
  docRefType = docRefType || '';
  options = options || {};

  // The library builds the fragment markup (span dcterms:hasPart / mark rdf:value with id=refId);
  // the reference marker (the <sup> tying it to the annotation) is passed as `reference`.
  return markSegmentHTML(selectedContent, {
    annotationUrl: options.annotationUrl || ('#' + refId),
    id: refId,
    className: options.do ? 'ref do' : 'ref',
    reference: docRefType,
  });
}


export {
  getSelectedParentElement,
  rangeSelectsSingleNode,
  exportSelection,
  cloneSelection,
  restoreSelection,
  selectionToTextQuote,
  setSelectionFromTextQuote,
} from '@dokieli/web-annotation';

// Re-exported under the original name for call sites that import setSelection
export { setSelectionByOffset as setSelection } from '@dokieli/web-annotation';

//FIXME: A bit hacky - should use RDF?
//TODO: Move to inbox.js
/**
 * Finds the inbox URL (`ldp:inbox` or `as:inbox`) of the closest ancestor matching the given selector.
 *
 * @param {Element} node - The starting DOM node to search from.
 * @param {string} selector - A CSS selector to identify the ancestor element, e.g., `.do[typeof="oa:Annotation"]`
 * @returns {string|null} The decoded inbox URL if found, otherwise `null`.
 */
export function getInboxOfClosestNodeWithSelector(node, selector) {
  if (!selector) { return; }

  node = node || document.body;

  let inbox = null;
  const nodeWithSelector = node.closest(selector);

  if (nodeWithSelector) {
    inbox = nodeWithSelector.querySelector('[rel="ldp:inbox"], [rel="as:inbox"]');

    if (inbox) {
      inbox = inbox.href || inbox.getAttribute('resource');
      inbox = decodeURIComponent(inbox);
    }
  }

  return inbox;
}

//TODO: This function returns noteData and also replaces the selection with an HTML reference to the note. Make it so that the reference related stuff is done elsewehere.
export function createNoteData(annotation) {
  const { action, id, datetime, selectionData, refId, refLabel, motivatedBy, targetIRI, resourceIRI, selectionLanguage, targetLanguage, formData, annotationInboxLocation, profile } = annotation;
  // console.log(annotation)

  const { tagging, content, language, license, ['ref-type']: refType, url,
    about, resource, ['typeof']: typeOf, href, rel, property, datatype, subject, level
  } = formData;

  // console.log(formData)

  // aLS = { 'id': id, 'containerIRI': containerIRI, 'noteURL': noteURL, 'noteIRI': noteIRI, 'fromContentType': fromContentType, 'contentType': contentType, 'canonical': true, 'annotationInbox': annotationInbox };

  var mode;
  var ref;
  let noteData = {};

  //TODO: This should be an object elsewhere?
  switch (profile) {
    case 'https://www.w3.org/ns/activitystreams':
      mode = 'object';
      break;

      default:
      mode = 'write';
      break;
  }

  // dokieli maps its own UI action to a W3C motivation IRI (Config.ActionToMotivation,
  // resolved by the caller into `motivatedBy`) and passes it directly to
  // createAnnotation. The library no longer knows about dokieli "actions".
  const annotationUser = {
    iri: Config.User.IRI || undefined,
    name: Config.User.Name || undefined,
    // Never store the secret-agent placeholder; it's a display fallback the library adds
    // (and dokieli re-adds when rendering an image-less annotation), not annotation data.
    image: Config.User.Image || undefined,
    url: Config.User.URL || undefined,
    type: Config.User.Types || undefined
  };

  const textQuoteSelector = (selectionData && selectionData.selector) ? {
    type: 'TextQuoteSelector',
    exact: selectionData.selector.exact,
    prefix: selectionData.selector.prefix,
    suffix: selectionData.selector.suffix,
    language: selectionLanguage
  } : undefined;

  // The library decides the selector shape from the live selection: a RangeSelector
  // (XPath start/end refined by per-element TextQuotes) for cross-element selections,
  // a FragmentSelector for same-element-with-id, else a plain TextQuoteSelector. It
  // also captures each element's language. Fall back to the manual TextQuote when no
  // live selection is available.
  let targetSelector;
  if (selectionData && selectionData.selection) {
    try {
      const { selectors = [] } = selectionToSelectors(selectionData.selection, {
        container: selectionData.selectedParentElement,
        contextLength: Config.ContextLength
      }) || {};
      targetSelector = selectors.find(s => s.type === 'RangeSelector')
        || selectors.find(s => s.type === 'FragmentSelector')
        || selectors.find(s => s.type === 'TextQuoteSelector');
    } catch (e) {
      // fall back to the manual TextQuoteSelector below
    }
  }

  // Legacy fallback: anchor with a FragmentSelector (the element id) refined by the
  // TextQuoteSelector when the target IRI carries a fragment, else the bare quote.
  const targetFragment = (targetIRI && targetIRI.includes('#'))
    ? targetIRI.substring(targetIRI.indexOf('#') + 1)
    : null;

  const fallbackSelector = textQuoteSelector
    ? (targetFragment
      ? {
          type: 'FragmentSelector',
          value: targetFragment,
          conformsTo: 'https://tools.ietf.org/html/rfc3987',
          refinedBy: textQuoteSelector
        }
      : textQuoteSelector)
    : undefined;

  const annotationTarget = {
    iri: targetIRI,
    source: resourceIRI,
    language: targetLanguage,
    selector: targetSelector || fallbackSelector,
    renderedVia: { iri: 'https://dokie.li/#i', name: 'dokieli' }
    //TODO: state
  };

  switch (action) {
    // case 'sparkline':
    //   var figureIRI = generateAttributeId(null, opts.selectionDataSet);
    //   ref = '<span rel="schema:hasPart" resource="#figure-' + figureIRI + '">\n\
    //   <a href="' + opts.select + '" property="schema:name" rel="prov:wasDerivedFrom" resource="' + opts.select + '" typeof="qb:DataSet">' + opts.selectionDataSet + '</a> [' + htmlEncode(Config.RefAreas[opts.selectionRefArea]) + ']\n\
    //   <span class="sparkline" rel="schema:image" resource="#' + figureIRI + '">' + opts.sparkline + '</span></span>';
    //   break;

    //External Note
    case 'approve': case 'disapprove': case 'specificity': case 'comment':
      //XXX: No need to replace the nodes with itself.
      // ref = selectionData.selectedContent;

      noteData = createAnnotation({
        motivatedBy,
        type: action,
        id,
        datetime,
        language,
        license,
        rights: license,
        target: annotationTarget,
        body: { content, tags: tagging },
        creator: annotationUser
      });
      noteData.mode = mode;

      if (annotationInboxLocation && Config.User.TypeIndex && Config.User.TypeIndex[ns.as.Announce.value]) {
        noteData.inbox = Config.User.TypeIndex[ns.as.Announce.value];
      }

      break;

    case 'bookmark':
      noteData = createAnnotation({
        motivatedBy,
        type: action,
        id,
        datetime,
        language,
        license,
        rights: license,
        target: annotationTarget,
        body: { content, tags: tagging, purpose: 'describing' },
        creator: annotationUser
      });
      noteData.mode = mode;

      // note = createNoteDataHTML(noteData);
      ref = getTextQuoteHTML(refId, motivatedBy, selectionData.selectedContent, '', { 'do': true });

      break;

    //Internal Note
    case 'note':
      var docRefType = '<sup class="ref-comment"><a href="#' + id + '"rel="cito:isCitedBy">' + refLabel + '</a></sup>';

      noteData = createAnnotation({
        motivatedBy,
        type: action,
        id,
        datetime,
        language,
        license,
        rights: license,
        target: annotationTarget,
        body: { content, tags: tagging, purpose: 'describing' },
        creator: annotationUser
      });
      noteData.mode = 'read';

      ref = getTextQuoteHTML(refId, motivatedBy, selectionData.selectedContent, docRefType);
      Config.Editor.replaceSelectionWithInlineFragment(fragmentFromString(ref));
      break;

    case 'citation': //footnote reference
      switch (refType) {
        case 'ref-footnote': default:
          docRefType = '<sup class="' + refType + '"><a href="#' + id + '" rel="cito:isCitedBy">' + refLabel + '</a></sup>';

          noteData = {
            "type": refType,
            "mode": mode,
            "motivatedBy": motivatedBy,
            "id": id,
            "refId": refId,
            "refLabel": refLabel,
            // "iri": noteIRI,
            "datetime": datetime,
            "citationURL": url
          };

          var bodyObject = {
            "value": content
          };

          if (language) {
            noteData["language"] = language;
            bodyObject["language"] = language;
          }

          if (license) {
            noteData["rights"] = noteData["license"] = license;
            bodyObject["rights"] = bodyObject["license"] = license;
          }

          noteData["body"] = [bodyObject];

          break;

        case 'ref-reference':
          docRefType = '<span class="' + refType + '">' + Config.RefType[Config.DocRefType].InlineOpen + '<a href="#' + id + '">' + refLabel + '</a>' + Config.RefType[Config.DocRefType].InlineClose + '</span>';
          break;
      }

      ref = getTextQuoteHTML(refId, motivatedBy, selectionData.selectedContent, docRefType);

      Config.Editor.replaceSelectionWithInlineFragment(fragmentFromString(ref));

      break;

    case 'requirement':
      //TODO: inlist, prefix
      //TODO: lang/xmlllang
      noteData = {
        subject,
        level,
        lang: language,
        textContent: selectionData.selectedContent
      };
// console.log('createNodeData::requirement', noteData);
      // ref = createRDFaHTMLRequirement(noteData, 'requirement');
      var preview = document.querySelector('#requirement-preview-samp');
      ref = preview.getHTML();

// console.log(ref)
// console.log(fragmentFromString(ref))

      // Config.Editor.replaceSelectionWithFragment(fragmentFromString(ref));
      Config.Editor.replaceSelectionWithNodeFromFragment(fragmentFromString(ref));

      break;
  }

  // Annotation subject (about/@id), serializer-agnostic: write -> '' (resolves to the
  // Location on POST), object -> relative '#id' (dokieli wraps it in a notification),
  // read -> absolute documentURL#id (we already have the document URL).
  if (noteData && noteData.id && noteData.mode) {
    noteData.iri =
      noteData.mode === 'write' ? ''
      : noteData.mode === 'read' ? `${stripFragmentFromString(resourceIRI)}#${noteData.id}`
      : `#${noteData.id}`;
  }

  return noteData;
}

// textContent skipping <sup> subtrees, so reference markers injected by prior
// annotations don't shift offsets across annotations on the same passage. dokieli
// renders those markers; the @dokieli/web-annotation core is sup-agnostic.
export function getTextContentExcludingSups(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node.tagName?.toUpperCase() === 'SUP') return '';
  let text = '';
  for (const child of node.childNodes) text += getTextContentExcludingSups(child);
  return text;
}
