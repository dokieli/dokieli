import { fragmentFromString, generateUUID } from "./../../util.js";
import { tagsToBodyObjects } from "./../../doc.js";
import { Icon } from "../../ui/icons.js";
import Config from "../../config.js";
import { generateDataURI } from "../../uri.js";

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

  refId = refId || generateUUID();
  motivatedBy = motivatedBy || 'oa:replying';
  docRefType = docRefType || '';
  options = options || {};

  var doMode = (options.do) ? ' do' : '';

  var refOpen = '<span class="ref' + doMode + '" rel="schema:hasPart" resource="#' + refId + '" typeof="http://purl.org/dc/dcmitype/Text">';
  var refClose = '</span>';
  if (motivatedBy == 'oa:highlighting') {
    refOpen = '<span class="ref' + doMode + '" rel="schema:hasPart" resource="#h-' + refId + '" typeof="oa:Annotation"><span rel="oa:motivatedBy" resource="oa:highlighting"></span><span rel="oa:hasTarget" resource="#' + refId + '" typeof="http://purl.org/dc/dcmitype/Text">';
    refClose = '</span></span>';
  }
  var mark = '<mark datatype="rdf:HTML" id="' + refId + '" property="rdf:value">' + selectedContent + '</mark>';

  return refOpen + mark + docRefType + refClose;
}


//Outputs:
// {
//   type: 'TextQuoteSelector',
//   exact: 'ipsum',
//   prefix: 'Lorem ',
//   suffix: ' dolor'
// }

//From https://github.com/yabwe/medium-editor/blob/master/src/js/selection.js
export function getSelectedParentElement(range) {
  if (!range) {
    return null;
  }

  // Selection encompasses a single element
  if (rangeSelectsSingleNode(range) && range.startContainer.childNodes[range.startOffset].nodeType !== 3) {
    return range.startContainer.childNodes[range.startOffset];
  }

  // Selection range starts inside a text node, so get its parent
  if (range.startContainer.nodeType === 3) {
    return range.startContainer.parentNode;
  }

  // Selection starts inside an element
  return range.startContainer;
}

//From https://github.com/yabwe/medium-editor/blob/master/src/js/selection.js
//http://stackoverflow.com/questions/15867542/range-object-get-selection-parent-node-chrome-vs-firefox
export function rangeSelectsSingleNode(range) {
  var startNode = range.startContainer;
  return startNode === range.endContainer &&
    startNode.hasChildNodes() &&
    range.endOffset === range.startOffset + 1;
}

export function exportSelection(selectedParentElement, selection) {
  if (!selection.rangeCount) return;

  const ranges = [];

  for (let i = 0; i < selection.rangeCount; i++) {
    ranges.push(selection.getRangeAt(i));
  }

  const mergedRange = document.createRange();
  mergedRange.setStart(ranges[0].startContainer, ranges[0].startOffset);
  mergedRange.setEnd(ranges[ranges.length - 1].endContainer, ranges[ranges.length - 1].endOffset);

  const preSelectionRange = mergedRange.cloneRange();
  preSelectionRange.selectNodeContents(selectedParentElement);
  preSelectionRange.setEnd(mergedRange.startContainer, mergedRange.startOffset);
  const start = preSelectionRange.toString().length;

  const selectionState = {
    start: start,
    end: start + mergedRange.toString().length
  };

  return selectionState;
}

export function cloneSelection() {
  const selection = window.getSelection();
  if (!selection.rangeCount) return null;

  const clonedSelection = [];

  for (let i = 0; i < selection.rangeCount; i++) {
    const range = selection.getRangeAt(i).cloneRange();
    const fragment = range.cloneContents();
    clonedSelection.push({ range, fragment });
  }

  return clonedSelection;
}

//XXX: Note Firefox bug handling contenteditable true/false differently: https://bugzilla.mozilla.org/show_bug.cgi?id=818515
export function restoreSelection(clonedSelection) {
  const selection = window.getSelection();
  selection.removeAllRanges(); // Clear existing selection

  if (!clonedSelection) return;

  clonedSelection.forEach(({ range }) => {
    selection.addRange(range);
  });
}

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

      noteData = {
        "type": action,
        "mode": mode,
        "motivatedByIRI": motivatedBy,
        "id": id,
        "canonical": 'urn:uuid:' + id,
        "refId": refId,
        "refLabel": refLabel,
        // "iri": noteIRI, //e.g., https://example.org/path/to/article
        "creator": {},
        "datetime": datetime,
        "target": {
          "iri": targetIRI,
          "source": resourceIRI,
          "selector": {
            "exact": selectionData.selector.exact,
            "prefix": selectionData.selector.prefix,
            "suffix": selectionData.selector.suffix,
            "language": selectionLanguage
          },
          "language": targetLanguage
          //TODO: state
        }
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

      noteData["body"] = [bodyObject].concat(tagsToBodyObjects(tagging));

      if (Config.User.IRI) {
        noteData.creator["iri"] = Config.User.IRI;
      }

      if (Config.User.Name) {
        noteData.creator["name"] = Config.User.Name;
      }

      noteData.creator["image"] = Config.User.Image || generateDataURI('image/svg+xml', 'base64', Icon['.fas.fa-user-secret']);

      if (Config.User.URL) {
        noteData.creator["url"] = Config.User.URL;
      }

      if (annotationInboxLocation && Config.User.TypeIndex && Config.User.TypeIndex[ns.as.Announce.value]) {
        noteData.inbox = Config.User.TypeIndex[ns.as.Announce.value];
      }

      break;

    case 'bookmark':
      docRefType = '';

      noteData = {
        "type": action,
        "mode": mode,
        "motivatedByIRI": motivatedBy,
        "id": id,
        "canonical": 'urn:uuid:' + id,
        "refId": refId,
        "refLabel": refLabel,
        // "iri": noteIRI, //e.g., https://example.org/path/to/article
        "creator": {},
        "datetime": datetime,
        "target": {
          "iri": targetIRI,
          "source": resourceIRI,
          "selector": {
            "exact": selectionData.selector.exact,
            "prefix": selectionData.selector.prefix,
            "suffix": selectionData.selector.suffix,
            "language": selectionLanguage
          },
          "language": targetLanguage
          //TODO: state
        }
      };

      var bodyObject = {
        "purpose": "describing",
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

      noteData["body"] = [bodyObject].concat(tagsToBodyObjects(tagging));

      if (Config.User.IRI) {
        noteData.creator["iri"] = Config.User.IRI;
      }

      if (Config.User.Name) {
        noteData.creator["name"] = Config.User.Name;
      }

      noteData.creator["image"] = Config.User.Image || generateDataURI('image/svg+xml', 'base64', Icon['.fas.fa-user-secret']);

      if (Config.User.URL) {
        noteData.creator["url"] = Config.User.URL;
      }

      // note = DO.U.createNoteDataHTML(noteData);
      ref = getTextQuoteHTML(refId, motivatedBy, selectionData.selectedContent, docRefType, { 'do': true });

      break;

    //Internal Note
    case 'note':
      var docRefType = '<sup class="ref-comment"><a href="#' + id + '"rel="cito:isCitedBy">' + refLabel + '</a></sup>';

      noteData = {
        "type": action,
        "mode": "read",
        "motivatedByIRI": motivatedBy,
        "id": id,
        "canonical": 'urn:uuid:' + id,
        "refId": refId,
        "refLabel": refLabel,
        // "iri": noteIRI, //e.g., https://example.org/path/to/article
        "creator": {},
        "datetime": datetime,
        "target": {
          "iri": targetIRI,
          "source": resourceIRI,
          "selector": {
            "exact": selectionData.selector.exact,
            "prefix": selectionData.selector.prefix,
            "suffix": selectionData.selector.suffix,
            "language": selectionLanguage
          },
          "language": targetLanguage
          //TODO: state
        }
      };

      var bodyObject = {
        "purpose": "describing",
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

      noteData["body"] = [bodyObject].concat(tagsToBodyObjects(tagging));

      if (Config.User.IRI) {
        noteData.creator["iri"] = Config.User.IRI;
      }

      if (Config.User.Name) {
        noteData.creator["name"] = Config.User.Name;
      }

      noteData.creator["image"] = Config.User.Image || generateDataURI('image/svg+xml', 'base64', Icon['.fas.fa-user-secret']);

      if (Config.User.URL) {
        noteData.creator["url"] = Config.User.URL;
      }

      ref = getTextQuoteHTML(refId, motivatedBy, selectionData.selectedContent, docRefType);
      DO.Editor.replaceSelectionWithFragment(fragmentFromString(ref));
      break;

    case 'citation': //footnote reference
      switch (refType) {
        case 'ref-footnote': default:
          docRefType = '<sup class="' + refType + '"><a href="#' + id + '" rel="cito:isCitedBy">' + refLabel + '</a></sup>';

          noteData = {
            "type": refType,
            "mode": mode,
            "motivatedByIRI": motivatedBy,
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

      DO.Editor.replaceSelectionWithFragment(fragmentFromString(ref));

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

      // DO.Editor.replaceSelectionWithFragment(fragmentFromString(ref));
      DO.Editor.replaceSelectionWithNodeFromFragment(fragmentFromString(ref));

      break;
  }

  // revisit when we refactor importTextQuoteSelector
  // if (ref) {
  //   // console.log(this.mode)
  //   console.log(DO.Editor)
  //   DO.Editor.replaceSelectionWithFragment(fragmentFromString(ref));
  // }

  return noteData;
}

export function setSelection(start, end, containerNode) {
  const range = document.createRange();
  const selection = window.getSelection();

  let currentNode = containerNode;
  let charIndex = 0;

  function traverseNodes(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      let nextCharIndex = charIndex + node.textContent.length;
      if (charIndex <= start && nextCharIndex >= start) {
        range.setStart(node, start - charIndex);
      }
      if (charIndex <= end && nextCharIndex >= end) {
        range.setEnd(node, end - charIndex);
      }
      charIndex = nextCharIndex;
    }
    else {
      for (let i = 0; i < node.childNodes.length; i++) {
        traverseNodes(node.childNodes[i]);
      }
    }
  }

  traverseNodes(currentNode);

  selection.removeAllRanges();
  selection.addRange(range);
}
