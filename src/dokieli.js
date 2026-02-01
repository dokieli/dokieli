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

import { getResource, setAcceptRDFTypes, postResource, putResource, currentLocation, patchResourceWithAcceptPatch, putResourceWithAcceptPut, copyResource, deleteResource } from './fetcher.js'
import { getDocument, getDocumentContentNode, showActionMessage, selectArticleNode, showRobustLinksDecoration, getResourceInfo,  getResourceInfoSKOS, removeReferences, buildReferences, removeSelectorFromNode, insertDocumentLevelHTML, getResourceInfoSpecRequirements, getTestDescriptionReviewStatusHTML, createFeedXML, showTimeMap, createMutableResource, createImmutableResource, updateMutableResource, createHTML, getResourceImageHTML, setDocumentRelation, setDate, getLanguageOptionsHTML, getLicenseOptionsHTML, getNodeWithoutClasses, setCopyToClipboard, addMessageToLog, accessModeAllowed, getAccessModeOptionsHTML, parseMarkdown, createNoteDataHTML, hasNonWhitespaceText, updateSupplementalInfo, spawnDokieli, rewriteBaseURL, generateIndexItemHTML } from './doc.js'
import { getProxyableIRI, stripFragmentFromString, getFragmentOrLastPath, getFragmentFromString, getURLLastPath, getLastPathSegment, forceTrailingSlash, getBaseURL, getParentURLPath, encodeString, generateDataURI, isHttpOrHttpsProtocol, isFileProtocol, getUrlParams, stripUrlSearchHash, stripUrlParamsFromString, getAbsoluteIRI } from './uri.js'
import { getResourceGraph, getLinkRelation, getAgentName, getGraphImage, getGraphFromData, isActorType, isActorProperty, getGraphLabel, getGraphLabelOrIRI, getGraphConceptLabel, getUserContacts, getAgentInbox, getLinkRelationFromHead, getACLResourceGraph, getAccessSubjects, getAuthorizationsMatching, getGraphDate, getGraphAuthors, getGraphEditors, getGraphContributors, getGraphPerformers, getUserLabelOrIRI, getGraphTypes, filterQuads, serializeData } from './graph.js'
import { notifyInbox, sendNotifications } from './activity.js'
import { uniqueArray, fragmentFromString, generateAttributeId, sortToLower, getDateTimeISO, getDateTimeISOFromMDY, generateUUID, isValidISBN, escapeRDFLiteral, tranformIconstoCSS, getIconsFromCurrentDocument, setDocumentURL } from './util.js'
import { generateGeoView } from './geo.js'
import { getLocalStorageItem, updateLocalStorageProfile, enableAutoSave, disableAutoSave, removeLocalStorageItem } from './storage.js'
import { getSubjectInfo, restoreSession } from './auth.js'
import { hideDocumentMenu, initDocumentMenu } from './menu.js'
import { Icon } from './ui/icons.js'
import LinkHeader from 'http-link-header';
import rdf from 'rdf-ext';
import Config from './config.js';
import { getButtonHTML, updateButtons } from './ui/buttons.js'
import { csvStringToJson, jsonToHtmlTableString } from './csv.js'
import { getMultipleResources } from './fetcher.js'
import { domSanitize } from './utils/sanitization.js'
import { i18n, i18nextInit } from './i18n.js'
import { htmlEncode } from './utils/html.js'
import { init } from './init.js'
import { openResource } from './dialog.js'

const ns = Config.ns;
let DO;

if (typeof window.DO === 'undefined'){

DO = {
  C: Config,

  U: {
    handleIncomingRedirect: async function() {
      // const params = new URLSearchParams(window.location.search);

      getLocalStorageItem('Config.OIDC').then(OIDC => {
        // console.log(OIDC)
        if (OIDC?.authStartLocation && OIDC.authStartLocation !== window.location.href.split('#')[0]) {
          var urlsHtml = `<a href="${OIDC.authStartLocation}" rel="noopener" target="_blank">${OIDC.authStartLocation}</a>`
          var message = `Hang on tight, redirecting you to where you want to be ${urlsHtml}`;
          var actionMessage = `Redirecting to ${urlsHtml}`;

          const messageObject = {
            'content': actionMessage,
            'type': 'info',
            'timer': 10000
          }

          addMessageToLog({...messageObject, content: message}, Config.MessageLog);
          const messageId = showActionMessage(document.body, messageObject);

          removeLocalStorageItem('Config.OIDC');
          window.location.replace(OIDC.authStartLocation);
        }
        else {
          DO.U.initAuth().then(() => init())
        }
      });
    },

    load: function() {
      document.addEventListener('i18n-ready', () => {
        DO.U.initUserLanguage().then(() => {
          const params = new URLSearchParams(window.location.search);

          if (params.has('code') && params.has('iss') && params.has('state')) {
            DO.U.initAuth().then(() => DO.U.handleIncomingRedirect());
          }
          else {
            DO.U.initAuth();

            init();
          }
        })
      });

      i18nextInit().then(() => {
        document.dispatchEvent(new Event('i18n-ready'));
      })
    },

    initAuth: async function() {
      return restoreSession().then(() => {
        if (!Config['Session']) {
          console.log("No session");
          return;
        }

        console.log("Logged in: ", Config['Session'].webId);
      })
    },

    initUserLanguage: function() {
      return getLocalStorageItem('i18nextLng').then(lang => {
        lang = i18n.code();

        if (lang && Config.Languages[lang]) {
          Config.User.UI['Language'] = lang;
          Config.User.UI['LanguageDir'] = i18n.dir();
        }
      });
    },

    getContentNode: function(node) {
      return getDocumentContentNode(document);
    },

    //XXX: Not applied because of ProseMirror schema issue when `select` ever becomes a child of something like `p`
    processChooseActions: function() {
      var licenseOptions = document.querySelectorAll('[about="#feature-license-options"][typeof="schema:ChooseAction"], [href="#feature-license-options"][typeof="schema:ChooseAction"], [resource="#feature-license-options"][typeof="schema:ChooseAction"]');
      for (var i = 0; i < licenseOptions.length; i++){
        licenseOptions[i].parentNode.replaceChild(fragmentFromString('<label class="do" for="feature-license-options">License</label> <select class="do" id="feature-license-options">' + getLicenseOptionsHTML() + '</select>'), licenseOptions[i]);
      }

      var languageOptions = document.querySelectorAll('[about="#feature-language-options"][typeof="schema:ChooseAction"], [href="#feature-language-options"][typeof="schema:ChooseAction"], [resource="#feature-language-options"][typeof="schema:ChooseAction"]');
      for (var i = 0; i < languageOptions.length; i++){
        languageOptions[i].parentNode.replaceChild(fragmentFromString('<label class="do" for="feature-language-options">Languages</label> <select class="do" id="feature-language-options">' + getLanguageOptionsHTML() + '</select>'), languageOptions[i]);
      }
    },

    showXHRProgressHTML: function(http, options) {
      if ('progress' in options) {
        http.upload.onprogress = function(e) {
          if (e.lengthComputable) {
            options.progress.value = (e.loaded / e.total) * 100;
            options.progress.textContent = options.progress.value; // Fallback for unsupported browsers.
          }
        };
      }
    },

    generateCSSBasedOnCurrentDocumentIcons: function() {
      var icons = getIconsFromCurrentDocument();
      var css = tranformIconstoCSS(icons);
      console.log(css);
    },

    SPARQLQueryURL: {
      getResourcesOfTypeWithLabel: function(sparqlEndpoint, resourceType, textInput, options) {
        options = options || {};
        var labelsPattern = '', resourcePattern = '';

        if(!('lang' in options)) {
          options['lang'] = 'en';
        }

        if ('filter' in options) {
          if(resourceType == '<http://purl.org/linked-data/cube#DataSet>' || resourceType == 'qb:DataSet'
            && 'dimensionRefAreaNotation' in options.filter) {
              var dimensionPattern, dimensionDefault = '';
              var dataSetPattern = "\n\
    [] qb:dataSet ?resource";
            if ('dimensionProperty' in options.filter) {
              dimensionPattern = " ; " + options.filter.dimensionProperty;
            }
            else {
              dimensionDefault = " .\n\
  { SELECT DISTINCT ?propertyRefArea WHERE { ?propertyRefArea rdfs:subPropertyOf* sdmx-dimension:refArea . } }";
              dimensionPattern = " ; ?propertyRefArea ";

            }
            var notationPattern = " [ skos:notation '" + options.filter.dimensionRefAreaNotation.toUpperCase() + "' ] ."
          }
          resourcePattern = dimensionDefault + dataSetPattern + dimensionPattern + notationPattern;
        }

        labelsPattern = "\n\
  ";
        if ('optional' in options) {
          if('prefLabels' in options.optional) {
            if (options.optional.prefLabels.length == 1) {
              labelsPattern += "  ?resource " + options.optional.prefLabels[0] + " ?prefLabel .";
            }
            else {
              labelsPattern += "  VALUES ?labelProperty {";
              options.optional.prefLabels.forEach(property => {
                labelsPattern += ' ' + property;
              });
              labelsPattern += " } ?resource ?labelProperty ?prefLabel .";
            }
          }
        }
        else {
          labelsPattern += "  ?resource rdfs:label ?prefLabel .";
        }


//  FILTER (!STRSTARTS(STR(?resource), 'http://purl.org/linked-data/sdmx/'))\n\
      var query = "PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\n\
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>\n\
PREFIX dcterms: <http://purl.org/dc/terms/>\n\
PREFIX qb: <http://purl.org/linked-data/cube#>\n\
PREFIX sdmx-dimension: <http://purl.org/linked-data/sdmx/2009/dimension#>\n\
PREFIX sdmx-measure: <http://purl.org/linked-data/sdmx/2009/measure#>\n\
CONSTRUCT {\n\
  ?resource skos:prefLabel ?prefLabel .\n\
}\n\
WHERE {\n\
  ?resource a " + resourceType + " ."
+ labelsPattern + "\n\
  FILTER (CONTAINS(LCASE(?prefLabel), '" + textInput + "') && (LANG(?prefLabel) = '' || LANGMATCHES(LANG(?prefLabel), '" + options.lang + "')))"
+ resourcePattern + "\n\
}";
       return sparqlEndpoint + "?query=" + encodeString(query);
      },

      getObservationsWithDimension: function(sparqlEndpoint, dataset, paramDimension, options) {
        var query = "PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\n\
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>\n\
PREFIX dcterms: <http://purl.org/dc/terms/>\n\
PREFIX qb: <http://purl.org/linked-data/cube#>\n\
PREFIX sdmx-dimension: <http://purl.org/linked-data/sdmx/2009/dimension#>\n\
PREFIX sdmx-measure: <http://purl.org/linked-data/sdmx/2009/measure#>\n\
CONSTRUCT {\n\
  ?observation sdmx-dimension:refPeriod ?refPeriod .\n\
  ?observation sdmx-measure:obsValue ?obsValue .\n\
}\n\
WHERE {\n\
  ?observation qb:dataSet <" + dataset + "> .\n\
  " + paramDimension + "\n\
  ?propertyRefPeriod rdfs:subPropertyOf* sdmx-dimension:refPeriod .\n\
  ?observation ?propertyRefPeriod ?refPeriod .\n\
  ?propertyMeasure rdfs:subPropertyOf* sdmx-measure:obsValue .\n\
  ?observation ?propertyMeasure ?obsValue .\n\
}";

        return sparqlEndpoint + "?query=" + encodeString(query);
      },
    },

    getSparkline: function(data, options) {
      options = options || {};
      if(!('cssStroke' in options)) {
        options['cssStroke'] = '#000';
      }

      var svg = '<svg height="100%" prefix="rdf: http://www.w3.org/1999/02/22-rdf-syntax-ns# rdfs: http://www.w3.org/2000/01/rdf-schema# xsd: http://www.w3.org/2001/XMLSchema# qb: http://purl.org/linked-data/cube# prov: http://www.w3.org/ns/prov# schema: http://schema.org/" width="100%" xmlns="http://www.w3.org/2000/svg">';

      svg += DO.U.drawSparklineGraph(data, options);
      svg += '</svg>';

      return svg;
    },

    drawSparklineGraph: function(data, options) {
      options = options || {};
      if(!('cssStroke' in options)) {
        options['cssStroke'] = '#000';
      }
      var svg= '';

      var obsValue = 'http://purl.org/linked-data/sdmx/2009/measure#obsValue';
      var observation = 'http://purl.org/linked-data/cube#Observation';

      var dotSize = 1;
      var values = data.map(n => { return n[obsValue]; }),
        min = Math.min.apply(null, values),
        max = Math.max.apply(null, values);

      var new_max = 98;
      var new_min = 0;
      var range = new_max - new_min;

      var parts = values.map(function (v) {
        return (new_max - new_min) / (max - min) * (v - min) + new_min || 0;
      });

      var div = 100 / parts.length;
      var x1 = 0, y1 = 0, x2 = div / 2, y2 = range - parts[0];

      var lines = '';
      for (var i=0; i < parts.length; i++) {
        x1 = x2; y1 = y2;
        x2 = range * (i / parts.length) + (div / 2);
        y2 = range - parts[i];

        lines += '<a href="' + data[i][observation] + '" rel="rdfs:seeAlso noopener" resource="' + data[i][observation] + '" target="_blank"><line' +
          ' x1="' + x1 + '%"' +
          ' x2="' + x2 + '%"' +
          ' y1="' + y1 + '%"' +
          ' y2="' + y2 + '%"' +
          ' stroke="' + options.cssStroke + '"' +
          ' /></a>';

        //Last data item
        if(i+1 === parts.length) {
          lines += '<a href="' + data[i][observation] + '" rel="noopener" target="_blank"><circle' +
            ' cx="' + x2 + '%"' +
            ' cy="' + y2 + '%"' +
            ' r="' + dotSize + '"' +
            ' stroke="#f00"' +
            ' fill:#f00' +
            ' /></a>';
        }
      }

      var wasDerivedFrom = '';
      if(options && 'url' in options) {
        wasDerivedFrom = ' rel="prov:wasDerivedFrom" resource="' + options.url + '"';
      }
      svg += '<g' + wasDerivedFrom + '>';
      svg += '<metadata rel="schema:license" resource="https://creativecommons.org/publicdomain/zero/1.0/"></metadata>';
      if (options && 'title' in options) {
        svg += '<title property="schema:name">' + options['title'] + '</title>';
      }
      svg += lines + '</g>';

      return svg;
    },

    getListHTMLFromTriples: function(triples, options) {
      options = options || {element: 'ul'};
      var elementId = ('elementId' in options) ? ' id="' + options.elementId + '"' : '';
      var elementName = ('elementName' in options) ? ' name="' + options.elementName + '"' : '';
      var elementLabel = ('elementLabel' in options) ? ' aria-label="' + options.elementLabel + '"': '';
      var elementTitle = ('elementTitle' in options) ? options.elementTitle : '';
      var items = '';
      triples.forEach(t => {
        var s = t.subject.value;
        var o = t.object.value;
        switch(options.element) {
          case 'ol': case 'ul': default:
            items += '<li><a href="' + s + '">' + o + '</a></li>';
            break;
          case 'dl':
            items += '<dd><a href="' + s + '">' + o + '</a></dd>';
            break;
          case 'select':
            items += '<option value="' +   s + '">' + o + '</option>';
            break;
        }
      });

      switch(options.element) {
        case 'ul': default:
          return '<ul' + elementId + '>' + items + '</ul>';
        case 'ol':
          return '<ol' + elementId + '>' + items + '</ol>';
        case 'dl':
          return '<dl' + elementId + '><dt>' + elementTitle + '</dt>' + items + '</dl>';
        case 'select':
          return '<select' + elementLabel + elementId + elementName + '>' + items + '</select>';
      }
    },

    showRefs: function() {
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
            DO.U.positionNote(refId, noteId, refLabel);
          }
        }
      }
    },

    showCitations: function(citation, g) {
// console.log('----- showCitations: ')
// console.log(citation);

      var cEURL = stripFragmentFromString(citation.citingEntity);
// console.log(Config.Activity[cEURL]);

      if (Config.Activity[cEURL]) {
        if (Config.Activity[cEURL]['Graph']) {
          DO.U.addCitation(citation, Config.Activity[cEURL]['Graph']);
        }
        else {
// console.log('  Waiting...' + citation.citingEntity)
          window.setTimeout(DO.U.showCitations, 1000, citation, g);
        }
      }
      else {
        DO.U.processCitationClaim(citation);
      }
    },

    processCitationClaim: function(citation) {
// console.log('  processCitationClaim(' + citation.citingEntity + ')')
      // var pIRI = getProxyableIRI(citation.citingEntity);
      return getResourceGraph(citation.citingEntity)
      .then(i => {
          var cEURL = stripFragmentFromString(citation.citingEntity);
          Config.Activity[cEURL] = {};
          Config.Activity[cEURL]['Graph'] = i;
          var s = i.node(rdf.namedNode(citation.citingEntity));
          DO.U.addCitation(citation, s);
        }
      );
    },

    addCitation: function(citation, s) {
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

      var asideNote = '\n\
<aside class="note do">\n\
<blockquote cite="' + citingEntity + '">'+ noteDataHTML + '</blockquote>\n\
</aside>\n\
';
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
        DO.U.positionNote(refId, id, citingEntityLabel);
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
  } //DO.U
}; //DO

if (document.readyState === "loading") {
  document.addEventListener('DOMContentLoaded', () => { DO.U.load(); });
}
else {
  window.addEventListener("load", () => { 
    DO.U.load(); });
}

}

window.DO = DO;
export default DO
