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

    showEmbedData: function(e) {
      if(document.querySelector('#embed-data-in-html')) { return; }

      // var eventEmbedData = function(e) {
        e.target.setAttribute('disabled', 'disabled');
        var scriptCurrent = document.querySelectorAll('head script[id^="meta-"]');

        var scriptType = {
          'meta-turtle': {
            mediaType: 'text/turtle',
            scriptStart: '<script id="meta-turtle" title="Turtle" type="text/turtle">',
            cdataStart: '# ' + Config.CDATAStart + '\n',
            cdataEnd: '\n# ' + Config.CDATAEnd,
            scriptEnd: '</script>'
          },
          'meta-json-ld': {
            mediaType: 'application/ld+json',
            scriptStart: '<script id="meta-json-ld" title="JSON-LD" type="application/ld+json">',
            cdataStart: Config.CDATAStart + '\n',
            cdataEnd: '\n' + Config.CDATAEnd,
            scriptEnd: '</script>'
          },
          'meta-trig': {
            mediaType: 'application/trig',
            scriptStart: '<script id="meta-trig" title="TriG" type="application/trig">',
            cdataStart: '# ' + Config.CDATAStart + '\n',
            cdataEnd: '\n# ' + Config.CDATAEnd,
            scriptEnd: '</script>'
          }
        }

        var scriptCurrentData = {};
        if (scriptCurrent.length) {
          for(var i = 0; i < scriptCurrent.length; i++) {
            var v = scriptCurrent[i];
            var id = v.id;
            scriptCurrentData[id] = v.getHTML().split(/\r\n|\r|\n/);
            scriptCurrentData[id].shift();
            scriptCurrentData[id].pop();
            scriptCurrentData[id] = {
              'type': v.getAttribute('type') || '',
              'title': v.getAttribute('title') || '',
              'content' : scriptCurrentData[id].join('\n')
            };
          }
        }

        var buttonClose = getButtonHTML({ key: 'dialog.embed-data-entry.close.button', button: 'close', buttonClass: 'close', iconSize: 'fa-2x' });

        var embedMenu = `
        <aside aria-labelledby="embed-data-entry-label" class="do on tabs" dir="${Config.User.UI.LanguageDir}" id="embed-data-entry" lang="${Config.User.UI.Language}" rel="schema:hasPart" resource="#embed-data-entry" xml:lang="${Config.User.UI.Language}">
          <h2 data-i18n="dialog.embed-data-entry.h2" id="embed-data-entry-label" property="schema:name">${i18n.t('dialog.embed-data-entry.h2.textContent')} ${Config.Button.Info.EmbedData}</h2>
          ${buttonClose}
          <div class="info"></div>
          <nav><ul><li class="selected"><a href="#embed-data-turtle">Turtle</a></li><li><a href="#embed-data-json-ld">JSON-LD</a></li><li><a href="#embed-data-trig">TriG</a></li></ul></nav>
          <div id="embed-data-turtle" class="selected"><textarea dir="ltr" placeholder="Enter data in Turtle" name="meta-turtle" cols="80" rows="24">${(scriptCurrentData['meta-turtle'] ? scriptCurrentData['meta-turtle'].content : '')}</textarea><button class="save" data-i18n="dialog.embed-data-entry.submit.button" title="${i18n.t('dialog.embed-data-entry.submit.button.title')}" type="submit">${i18n.t('dialog.embed-data-entry.submit.button.textContent')}</button></div>
          <div id="embed-data-json-ld"><textarea dir="ltr" placeholder="Enter data in JSON-LD" name="meta-json-ld" cols="80" rows="24">${(scriptCurrentData['meta-json-ld'] ? scriptCurrentData['meta-json-ld'].content : '')}</textarea><button class="save" data-i18n="dialog.embed-data-entry.submit.button" title="${i18n.t('dialog.embed-data-entry.submit.button.title')}" type="submit">${i18n.t('dialog.embed-data-entry.submit.button.textContent')}</button></div>
          <div id="embed-data-trig"><textarea dir="ltr" placeholder="Enter data in TriG" name="meta-trig" cols="80" rows="24">${(scriptCurrentData['meta-trig'] ? scriptCurrentData['meta-trig'].content : '')}</textarea><button class="save" data-i18n="dialog.embed-data-entry.submit.button" title="${i18n.t('dialog.embed-data-entry.submit.button.title')}" type="submit">${i18n.t('dialog.embed-data-entry.submit.button.textContent')}</button></div>
        </aside>
        `;

        document.body.appendChild(fragmentFromString(embedMenu));
        document.querySelector('#embed-data-turtle textarea').focus();
        var a = document.querySelectorAll('#embed-data-entry nav a');
        for(let i = 0; i < a.length; i++) {
          a[i].addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            var li = e.target.parentNode;
            if(!li.classList.contains('selected')) {
              document.querySelector('#embed-data-entry nav li.selected').classList.remove('selected');
              li.classList.add('selected');
              document.querySelector('#embed-data-entry > div.selected').classList.remove('selected');
              var d = document.querySelector('#embed-data-entry > div' + e.target.hash);
              d.classList.add('selected');
              d.querySelector('textarea').focus();
            }
          });
        }

        document.querySelector('#embed-data-entry button.close').addEventListener('click', (e) => {
          document.querySelector('button.embed-data-meta').removeAttribute('disabled');
        });

        var buttonSave = document.querySelectorAll('#embed-data-entry button.save');
        for (let i = 0; i < buttonSave.length; i++) {
          buttonSave[i].addEventListener('click', (e) => {
            var textarea = e.target.closest('.selected').querySelector('textarea');
            var name = textarea.getAttribute('name');
            var data = textarea.value.trim();

            var script = document.getElementById(name);
            if (scriptType[name] && data.length) {
              //If there was a script already

              serializeData(data, scriptType[name].mediaType, scriptType[name].mediaType, { sanitize: true })
                .then(scriptEntry => {
                  if (script) {
                    script.textContent = scriptType[name].cdataStart + scriptEntry + scriptType[name].cdataEnd;
                  }
                  else {
                    document.querySelector('head').insertAdjacentHTML('beforeend',
                      scriptType[name].scriptStart +
                      scriptType[name].cdataStart +
                      scriptEntry +
                      scriptType[name].cdataEnd +
                      scriptType[name].scriptEnd
                    );
                  }
                })
            }
            else {
              //Remove if no longer used
              script.parentNode.removeChild(script);
            }

            var ede = document.getElementById('embed-data-entry');
            ede.parentNode.removeChild(ede);
            document.querySelector('.embed-data-meta').removeAttribute('disabled');
          });
        }
      // };

      // var edih = document.querySelector('button.embed-data-meta');
      // edih.removeEventListener('click', eventEmbedData);
      // edih.addEventListener('click', eventEmbedData);
    },

    //TODO: Review grapoi
    showDocumentMetadata: function(node) {
      if(document.querySelector('#document-metadata')) { return; }

      var documentURL = Config.DocumentURL;

      var content = selectArticleNode(document);
      var count = DO.U.contentCount(content);
      var authors = [], contributors = [], editors = [], performers = [];
      var citationsTo = [];
      var requirements = [];
      var advisements = [];
      var skos = [];

      // var subjectURI = currentLocation();
      // var options = {'contentType': 'text/html', 'subjectURI': subjectURI };
// console.log(options)
      var g = Config.Resource[documentURL].graph;
      var citations = Object.keys(Config.Citation).concat([ns.dcterms.references.value, ns.schema.citation.value]);
      var triples = g.out().quads();
      // g.out().terms.length
      for (const t of triples) {
// console.log(t)
        var s = t.subject.value;
        var p = t.predicate.value;
        var o = t.object.value;

        //TODO: Distinguish between external/internal for Config.Resource[documentURL].citations (right now it is external only), then use that for citations in showDocumentMetadata instead of using this triples.forEach
        if (citations.includes(p)) {
          citationsTo.push(t);
        }
      };

      requirements = (Config.Resource[documentURL].spec && Config.Resource[documentURL].spec['requirement']) ? Object.keys(Config.Resource[documentURL].spec['requirement']) : [];
      advisements = (Config.Resource[documentURL].spec && Config.Resource[documentURL].spec['advisement']) ? Object.keys(Config.Resource[documentURL].spec['advisement']) : [];
      skos = (Config.Resource[documentURL].skos) ? Config.Resource[documentURL].skos : [];

      citations = `<tr class="citations"><th data-i18n="panel.document-metadata.citations.th">${i18n.t('panel.document-metadata.citations.th.textContent')}</th><td>${citationsTo.length}</td></tr>`;
      requirements = `<tr class="requirements"><th data-i18n="panel.document-metadata.requirements.th">${i18n.t('panel.document-metadata.requirements.th.textContent')}</th><td>${requirements.length}</td></tr>`;
      advisements = `<tr class="advisements"><th data-i18n="panel.document-metadata.advisements.th">${i18n.t('panel.document-metadata.advisements.th.textContent')}</th><td>${advisements.length}</td></tr>`;
      var conceptsList = [];
      conceptsList = (skos.type && skos.type[ns.skos.Concept.value]) ? skos.type[ns.skos.Concept.value] : conceptsList;

      var concepts = `<tr class="concepts"><th data-i18n="panel.document-metadata.concepts.th">${i18n.t('panel.document-metadata.concepts.th.textContent')}</th><td>${conceptsList.length}</td></tr>`;
      // TODO: Review grapoi . Check it matches expected
      var statements = `<tr class="statements"><th data-i18n="panel.document-metadata.statements.th">${i18n.t('panel.document-metadata.statements.th.textContent')}</th><td>${g.out().terms.length}</td></tr>`;

      var graphEditors = getGraphEditors(g);
      var graphAuthors = getGraphAuthors(g);
      var graphContributors = getGraphContributors(g);
      var graphPerformers = getGraphPerformers(g);

      if (graphEditors) {
        graphEditors.forEach(i => {
          var go = g.node(rdf.namedNode(i));
          let name = getGraphLabelOrIRI(go);
          name = (name === i) ? getUserLabelOrIRI(i) : name;
          editors.push(`<li>${name}</li>`);
        });
        if (editors.length){
          editors = `<tr class="people"><th data-i18n="panel.document-metadata.editors.th">${i18n.t('panel.document-metadata.editors.th.textContent')}</th><td><ul class="editors">${editors.join('')}</ul></td></tr>`;
        }
      }

      if (graphAuthors) {
        graphAuthors.forEach(i => {
          var go = g.node(rdf.namedNode(i));
          let name = getGraphLabelOrIRI(go);
          name = (name === i) ? getUserLabelOrIRI(i) : name;
          authors.push(`<li>${name}</li>`);
        });
        if (authors.length){
          authors = `<tr class="people"><th data-i18n="panel.document-metadata.authors.th">${i18n.t('panel.document-metadata.authors.th.textContent')}</th><td><ul class="authors">${authors.join('')}</ul></td></tr>`;
        }
      }

      if (graphContributors) {
        graphContributors.forEach(i => {
          var go = g.node(rdf.namedNode(i));
          let name = getGraphLabelOrIRI(go);
          name = (name === i) ? getUserLabelOrIRI(i) : name;
          contributors.push(`<li>${name}</li>`);
        });
        if (contributors.length){
          contributors = `<tr class="people"><th data-i18n="panel.document-metadata.contributors.th">${i18n.t('panel.document-metadata.contributors.th.textContent')}</th><td><ul class="contributors">${contributors.join('')}</ul></td></tr>`;
        }
      }

      if (graphPerformers) {
        graphPerformers.forEach(i => {
          var go = g.node(rdf.namedNode(i));
          let name = getGraphLabelOrIRI(go);
          name = (name === i) ? getUserLabelOrIRI(i) : name;
          performers.push(`<li>${name}</li>`);
        });
        if (performers.length){
          performers = `<tr class="people"><th>Performers</th><td><ul class="performers">${performers.join('')}</ul></td></tr>`;
        }
      }

      var data = authors + editors + contributors + performers + citations + requirements + advisements + concepts + statements;

          // <tr><th>Lines</th><td>' + count.lines + '</td></tr>\n\
          // <tr><th>A4 Pages</th><td>' + count.pages.A4 + '</td></tr>\n\
          // <tr><th>US Letter</th><td>' + count.pages.USLetter + '</td></tr>\n\
      var html = `
      <section id="document-metadata">
        <table>
          <caption data-i18n="panel.document-metadata.caption">${i18n.t('panel.document-metadata.caption.textContent')}</caption>
          <tbody>
            ${data}
            <tr><th data-i18n="panel.document-metadata.reading-time.th">${i18n.t('panel.document-metadata.reading-time.th.textContent')}</th><td>${count.readingTime} <span data-i18n="datetime.minutes.span">${i18n.t('datetime.minutes.span.textContent')}</span></td></tr>
            <tr><th data-i18n="panel.document-metadata.characters.th">${i18n.t('panel.document-metadata.characters.th.textContent')}</th><td>${count.chars}</td></tr>
            <tr><th data-i18n="panel.document-metadata.words.th">${i18n.t('panel.document-metadata.words.th.textContent')}</th><td>${count.words}</td></tr>
            <tr><th data-i18n="panel.document-metadata.bytes.th">${i18n.t('panel.document-metadata.bytes.th.textContent')}</th><td>${count.bytes}</td></tr>
          </tbody>
        </table>
      </section>`;

      node.insertAdjacentHTML('beforeend', domSanitize(html));
    },

    contentCount: function contentCount (node) {
      node = node || selectArticleNode(document);
      node = getNodeWithoutClasses(node, 'do');
      var doctype = (node instanceof Element && node.tagName.toLowerCase() === 'html') ? getDoctype() : '';
      var content = node.textContent.trim();
      var contentCount = { readingTime:1, words:0, chars:0, lines:0, pages:{A4:1, USLetter:1}, bytes:0 };
      if (content.length) {
        var lineHeight = node.ownerDocument.defaultView.getComputedStyle(node, null)["line-height"];
        var linesCount = Math.ceil(node.clientHeight / parseInt(lineHeight));
        contentCount = {
          readingTime: Math.ceil(content.split(' ').length / 200),
          words: content.match(/\S+/g).length,
          chars: content.length,
          lines: linesCount,
          pages: { A4: Math.ceil(linesCount / 47), USLetter: Math.ceil(linesCount / 63) },
          bytes: encodeURI(doctype + node.outerHTML).split(/%..|./).length - 1
        };
      }
      return contentCount;
    },

    //TODO: Review grapoi
    showExtendedConcepts: function() {
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
                      <dl>${DO.U.getDocumentConceptDefinitionsHTML(documentURL)}</dl>
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
                  DO.U.showVisualisationGraph(options.subjectURI, dataset.toCanonical(), selector, options);
                // });
            }
          })

// console.log(dataGraph)


// console.log(Config.Resource)
          return dataset;
        });
    },

    //TODO: Review grapoi
    getDocumentConceptDefinitionsHTML: function(documentURL) {
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
    },

    showDocumentCommunicationOptions: function(node) {
      var communicationOptionsHTML = [];

      var documentURL = Config.DocumentURL;

      function waitUntil() {
        if (!Config.Resource[documentURL].headers?.linkHeaders?.has('rel', 'describedby')) {
          window.setTimeout(waitUntil, 250);
        }
        else {
          var db = Config.Resource[documentURL].headers.linkHeaders.rel('describedby');

          if (!db.every(relationItem => Config.Resource[relationItem.uri]?.graph !== undefined)) {
            window.setTimeout(waitUntil, 250);
          }
          else {
            db.forEach(relationItem => {
              if (Config.Resource[relationItem.uri]?.graph !== undefined) {
                communicationOptionsHTML.push(DO.U.getCommunicationOptions(Config.Resource[relationItem.uri].graph, { 'subjectURI': documentURL }));
              }
            });

            communicationOptionsHTML.forEach(html => {
              node.insertAdjacentHTML('beforeend', domSanitize(html));
              var nodes = document.querySelectorAll('#' + node.id + ' [id^="notification-subscriptions-"]');
              DO.U.buttonSubscribeNotificationChannel(nodes, documentURL);
            });
          }
        }
      }

      waitUntil();
    },

    showDocumentInfo: function(e) {
      var documentInfo = document.getElementById('document-info');
      if (documentInfo) {
        documentInfo.parentNode.removeChild(documentInfo);
      }

      e.target.closest('button').disabled = true

      var documentMenu = document.getElementById('document-menu');

      var buttonClose = getButtonHTML({ key: 'panel.document-info.close.button', button: 'close', buttonClass: 'close', iconSize: 'fa-2x' });

      document.body.insertBefore(fragmentFromString(`
        <aside aria-labelledby="document-info-label" class="do on" dir="${Config.User.UI.LanguageDir}" id="document-info" lang="${Config.User.UI.Language}" rel="schema:hasPart" resource="#document-info" xml:lang="${Config.User.UI.Language}">
          <h2 data-i18n="panel.document-info.h2" id="document-info-label" property="schema:name">${i18n.t('panel.document-info.h2.textContent')}</h2>
          ${buttonClose}
        </aside>
      `), documentMenu.nextSibling);
      var documentInfo = document.getElementById('document-info');

      documentInfo.setAttribute('tabindex', '-1');
      documentInfo.focus();

      documentInfo.addEventListener('click', (e) => {
        if (e.target.closest('button.close')) {
          document.querySelector('#document-do .document-info').disabled = false;
        }
      });

      var articleNode = selectArticleNode(document);
      var sections = articleNode.querySelectorAll('section:not(section section):not([id^=table-of]):not([id^=list-of])');

      DO.U.showListOfStuff(documentInfo);

      DO.U.showHighlightStructuredData(documentInfo);

      if (sections.length) {
        DO.U.showTableOfContents(documentInfo, sections)

        if (Config.SortableList && Config.EditorEnabled) {
          DO.U.sortToC();
        }
      }

      DO.U.showDocumentMetadata(documentInfo);

      DO.U.showDocumentCommunicationOptions(documentInfo);
    },

    showHighlightStructuredData: function(node) {
      if (!node) { return; }

      var contextNode = selectArticleNode(document);
      var checked = (contextNode.classList.contains('highlight-structure')) ? 'checked="checked"' : '';

      var html = `
        <section id="highlight-data" rel="schema:hasPart" resource="#highligh-data">
          <h3 data-i18n="panel.higlight-data.h3" property="schema:name">${i18n.t('panel.higlight-data.h3.textContent')}</h3>
          <ul>
            <li><input id="highlight-structured-data" name="highlight-structured-data" type="checkbox" ${checked}/> <label data-i18n="panel.higlight-structured-data.label" for="highlight-structured-data">${i18n.t('panel.higlight-structured-data.label.textContent')}</label></li>
          </ul>
        </section>`;

      node.insertAdjacentHTML('beforeend', html);

      var structuredData = document.querySelector('#highlight-data')

      structuredData.addEventListener('change', (e) => {
        var input = e.target.closest('#highlight-structured-data');
        if (input) {
          if (input.checked) {
            contextNode.classList.add('highlight-structure');
          }
          else {
            contextNode.classList.remove('highlight-structure');
          }
        }
      });
    },

    showListOfStuff: function(node) {
      if (!node) { return; }

      var disabledInput = '', s = [];
      // if (!Config.EditorEnabled) {
      //   disabledInput = ' disabled="disabled"';
      // }

      Object.keys(Config.ListOfStuff).forEach(id => {
        var checkedInput = '';
        var label = i18n.t(`panel.list-of-stuff.${id}.label.textContent`);
        // var selector = Config.ListOfStuff[id].selector;

        var item = document.getElementById(id);

        if(item) {
          checkedInput = ' checked="checked"';

          // DO.U.buildListOfStuff(id);
        }

        s.push(`<li><input id="l-o-s-${id}" type="checkbox"${disabledInput}${checkedInput} /><label data-i18n="panel.list-of-stuff.${id}.label" for="l-o-s-${id}">${label}</label></li>`);
      });

      if (s.length) {
        node.insertAdjacentHTML('beforeend', `
          <section id="list-of-stuff" rel="schema:hasPart" resource="#list-of-stuff">
            <h3 data-i18n="panel.list-of-stuff.h3" property="schema:name">${i18n.t('panel.list-of-stuff.h3.textContent')}</h3>
            <ul>${s.join('')}</ul>
          </section>`);

        // if (Config.EditorEnabled) {
          document.getElementById('list-of-stuff').addEventListener('click', (e) => {
            if (e.target.closest('input')) {
              var id = e.target.id.slice(6);
              if(!e.target.getAttribute('checked')) {
                DO.U.buildListOfStuff(id);
                e.target.setAttribute('checked', 'checked');
                window.location.hash = '#' + id;
              }
              else {
                var tol = document.getElementById(id);
                if(tol) {
                  tol.parentNode.removeChild(tol);

                  removeReferences();
                }
                e.target.removeAttribute('checked');
                window.history.replaceState(null, null, window.location.pathname);
              }
            }
          });
        // }
      }
    },

    showTableOfContents: function(node, sections, options) {
      options = options || {}
      var sortable = (Config.SortableList && Config.EditorEnabled) ? ' sortable' : '';

      if (!node) { return; }

      var toc = `
      <section id="table-of-contents-i" rel="schema:hasPart" resource="#table-of-contents-i">
        <h3 data-i18n="panel.list-of-stuff.table-of-contents.label" property="schema:name">${i18n.t(`panel.list-of-stuff.table-of-contents.label.textContent`)}</h3>
        <ol class="toc${sortable}">`;
      toc += DO.U.getListOfSections(sections, {'sortable': Config.SortableList});
      toc += '</ol></section>';

      node.insertAdjacentHTML('beforeend', domSanitize(toc));
    },


    sortToC: function() {
    },

    getListOfSections: function(sections, options) {
      options = options || {};
      var s = '', attributeClass = '';
      if (options.sortable == true) { attributeClass = ' class="sortable"'; }

      for (var i = 0; i < sections.length; i++) {
        var section = sections[i];
        if(section.id) {
          var heading = section.querySelector('h1, h2, h3, h4, h5, h6, header h1, header h2, header h3, header h4, header h5, header h6') || { 'textContent': section.id };
          var currentHash = '';
          var dataId = ' data-id="' + section.id +'"';

          if (!options.raw) {
            currentHash = (document.location.hash == '#' + section.id) ? ' class="selected"' : '';
            attributeClass = '';
          }

          if (heading) {
            s += '<li' + currentHash + dataId + '><a href="#' + section.id + '">' + heading.textContent + '</a>';
            var subsections = section.parentNode.querySelectorAll('[id="' + section.id + '"] > div > section[rel*="hasPart"]:not([class~="slide"]), [id="' + section.id + '"] > section[rel*="hasPart"]:not([class~="slide"])');

            if (subsections.length) {
              s += '<ol'+ attributeClass +'>';
              s += DO.U.getListOfSections(subsections, options);
              s += '</ol>';
            }
            s += '</li>';
          }
        }
      }

      return s;
    },

    buildListOfStuff: function(id) {
      var s = '';

      var documentURL = Config.DocumentURL;

      var rootNode = selectArticleNode(document);

      if(id == 'references'){
        buildReferences();
      }
      else {
        var label = i18n.t(`panel.list-of-stuff.${id}.label.textContent`);
        var selector = Config.ListOfStuff[id].selector;
        var titleSelector = Config.ListOfStuff[id].titleSelector;

        var nodes = rootNode.querySelectorAll('*:not([class~="do"]) ' + selector);

        if (id == 'table-of-contents' || id == 'list-of-concepts' || nodes.length) {
          var tId = document.getElementById(id);

          if(tId) { tId.parentNode.removeChild(tId); }

          let nav = `<nav id="${id}" rel="schema:hasPart" resource="#${id}">`;
          let section = `<section id="${id}" rel="schema:hasPart" resource="#${id}">`;
          let heading = `z data-i18n="panel.list-of-stuff.${id}.label" property="schema:name">${label}</h2>`;

          switch(id) {
            default:
              s += `${nav}>`;
              s += `${heading}`;
              s += '<div><ol class="toc">';
              break;

            case 'list-of-abbreviations':
              s += `${section}`;
              s += `${heading}`;
              s += '<div><dl>';
              break;

            case 'list-of-quotations':
              s += `${section}`;
              s += `${heading}`;
              s += '<div><ul>';
              break;

            case 'list-of-concepts':
              s += `${section}`;
              s += `${heading}`;
              var d = Config.Resource[documentURL].citations || [];
              if (d.length) {
                s += '<div><p id="include-concepts"><button class="add" type="button">Include concepts</button> from <data value="' + d.length + '">' + d.length + '</data> external references.</p>';
              }
              s += '<dl>';
              break;

            case 'table-of-requirements':
              s += `${section}`;
              s += `${heading}`;
              s += '<div><table>';
              break;

            case 'table-of-advisements':
              s += `${section}`;
              s += `${heading}`;
              s += '<div><table>';
              break;
          }

          if (id == 'table-of-contents') {
            var articleNode = selectArticleNode(document);
            s += DO.U.getListOfSections(articleNode.querySelectorAll('section:not(section section)'), {'raw': true});
          }
          else {
            //TODO: Perhaps table-of-requirements and table-of-advisements could be consolidated / generalised.

            if (id == 'table-of-requirements') {
//TODO: Sort by requirementSubject then requirementLevel? or offer controls on the table.

              s += '<caption>Conformance Requirements and Test Coverage</caption>'
              s += '<thead><tr><th colspan="3">Requirement</th></tr><tr><th>Subject</th><th>Level</th><th>Statement</th></tr></thead>';
              s += '<tbody>';
              Object.keys(Config.Resource[documentURL]['spec']['requirement']).forEach(i => {
// console.log(Config.Resource[documentURL]['spec'][i])
                var statement = Config.Resource[documentURL]['spec']['requirement'][i][ns.spec.statement.value] || i;
                //FIXME: This selector is brittle.
                // var requirementIRI = document.querySelector('#document-identifier [rel="owl:sameAs"]');
                var requirementIRI = document.querySelector('#document-latest-published-version [rel~="rel:latest-version"]');
                requirementIRI = (requirementIRI) ? requirementIRI.href : i;

                requirementIRI = i.replace(stripFragmentFromString(i), requirementIRI);
                statement = '<a href="' + requirementIRI + '">' + statement + '</a>';

                var requirementSubjectIRI = Config.Resource[documentURL]['spec']['requirement'][i][ns.spec.requirementSubject.value];
                var requirementSubjectLabel = requirementSubjectIRI || '<span class="warning">?</span>';
                if (requirementSubjectLabel.startsWith('http')) {
                  requirementSubjectLabel = getFragmentFromString(requirementSubjectIRI) || getURLLastPath(requirementSubjectIRI) || requirementSubjectLabel;
                }
                var requirementSubject = '<a href="' + requirementSubjectIRI + '">' + requirementSubjectLabel + '</a>';

                var requirementLevelIRI = Config.Resource[documentURL]['spec']['requirement'][i][ns.spec.requirementLevel.value];
                var requirementLevelLabel = requirementLevelIRI || '<span class="warning">?</span>';
                if (requirementLevelLabel.startsWith('http')) {
                  requirementLevelLabel = getFragmentFromString(requirementLevelIRI) || getURLLastPath(requirementLevelIRI) || requirementLevelLabel;
                }
                var requirementLevel = '<a href="' + requirementLevelIRI + '">' + requirementLevelLabel + '</a>';

                s += '<tr about="' + requirementIRI + '">';
                s += '<td>' + requirementSubject + '</td>';
                s += '<td>' + requirementLevel + '</td>';
                s += '<td>' + statement + '</td>';
                s += '</tr>'
              });
              s += '</tbody>';
            }
            else if (id == 'table-of-advisements') {
//TODO: Sort by advisementSubject then advisementLevel? or offer controls on the table.

              s += '<caption>Non-normative Advisements</caption>'
              s += '<thead><tr><th colspan="2">Advisement</th></tr><tr><th>Level</th><th>Statement</th></tr></thead>';
              s += '<tbody>';
              Object.keys(Config.Resource[documentURL]['spec']['advisement']).forEach(i => {
// console.log(Config.Resource[documentURL]['spec']['advisement'][i])
                var statement = Config.Resource[documentURL]['spec']['advisement'][i][ns.spec.statement.value] || i;
                //FIXME: This selector is brittle.
                //TODO: Revisit this:
                // var advisementIRI = document.querySelector('#document-identifier [rel="owl:sameAs"]');
                var advisementIRI = document.querySelector('#document-latest-published-version [rel~="rel:latest-version"]');
                advisementIRI = (advisementIRI) ? advisementIRI.href : i;

                advisementIRI = i.replace(stripFragmentFromString(i), advisementIRI);
                statement = '<a href="' + advisementIRI + '">' + statement + '</a>';

                // var advisementSubjectIRI = Config.Resource[documentURL]['spec']['advisement'][i][ns.spec.advisementSubject.value];
                // var advisementSubjectLabel = advisementSubjectIRI || '<span class="warning">?</span>';
                // if (advisementSubjectLabel.startsWith('http')) {
                //   advisementSubjectLabel = getFragmentFromString(advisementSubjectIRI) || getURLLastPath(advisementSubjectIRI) || advisementSubjectLabel;
                // }
                // var advisementSubject = '<a href="' + advisementSubjectIRI + '">' + advisementSubjectLabel + '</a>';

                var advisementLevelIRI = Config.Resource[documentURL]['spec']['advisement'][i][ns.spec.advisementLevel.value];
                var advisementLevelLabel = advisementLevelIRI || '<span class="warning">?</span>';
                if (advisementLevelLabel.startsWith('http')) {
                  advisementLevelLabel = getFragmentFromString(advisementLevelIRI) || getURLLastPath(advisementLevelIRI) || advisementLevelLabel;
                }
                var advisementLevel = '<a href="' + advisementLevelIRI + '">' + advisementLevelLabel + '</a>';

                s += '<tr about="' + advisementIRI + '">';
                // s += '<td>' + advisementSubject + '</td>';
                s += '<td>' + advisementLevel + '</td>';
                s += '<td>' + statement + '</td>';
                s += '</tr>'
              });
              s += '</tbody>';
            }
            else if (id == 'list-of-abbreviations') {
              if (nodes.length) {
                nodes = [].slice.call(nodes);
                nodes.sort((a, b) => {
                  return a.textContent.toLowerCase().localeCompare(b.textContent.toLowerCase());
                });
              }

              var processed = [];
              for (var i = 0; i < nodes.length; i++) {
                if (!processed.includes(nodes[i].textContent)) {
                  s += '<dt>' + nodes[i].textContent + '</dt>';
                  s += '<dd>' + nodes[i].getAttribute(titleSelector) + '</dd>';
                  processed.push(nodes[i].textContent);
                }
              }
            }
            else if (id == 'list-of-concepts') {
// console.log(Config.Resource[documentURL]['skos'])
              s += DO.U.getDocumentConceptDefinitionsHTML(documentURL);
            }
            //list-of-figures, list-of-tables, list-of-quotations, table-of-requirements
            else {
              processed = [];
              for (let i = 0; i < nodes.length; i++) {
                var title, textContent;

                if (id == 'list-of-quotations') {
                  title = nodes[i].getAttribute(titleSelector);
                }
                else {
                  title = nodes[i].querySelector(titleSelector);
                }

                if (title) {
                  if (id == 'list-of-quotations') {
                    textContent = removeSelectorFromNode(nodes[i], '.do').textContent;
                  }
                  else {
                    textContent = removeSelectorFromNode(title, '.do').textContent;
                  }

                  if (processed.indexOf(textContent) < 0) {
                    if (id == 'list-of-quotations') {
                      s += '<li><q>' + textContent + '</q>, <a href="' + title + '">' + title + '</a></li>';
                    }
                    else if(nodes[i].id){
                      s += '<li><a href="#' + nodes[i].id +'">' + textContent +'</a></li>';
                    }
                    else {
                      s += '<li>' + textContent +'</li>';
                    }

                    processed.push(textContent);
                  }
                }
              }
            }
          }

          switch(id) {
            default:
              s += '</ol></div>';
              s += '</nav>';
              break;

            case 'list-of-abbreviations':
              s += '</dl></div>';
              s += '</section>';
              break;

            case 'list-of-quotations':
              s += '</ul></div>';
              s += '</section>';
              break;

            case 'list-of-concepts':
              s += '</dl></div>';
              s += '</section>';
              break;

            case 'table-of-requirements':
              s += '</table></div>';
              s += '</section>';
              break;
          }
        }
      }

      insertDocumentLevelHTML(document, s, { id });

      if (id == 'table-of-requirements') {
        var options = { noCredentials: true };
        // var options = {};
        var testSuites = Config.Resource[documentURL].graph.out(ns.spec.testSuite).values;
// testSuites = [];
// console.log(testSuites)
        if (testSuites.length) {
          //TODO: Process all spec:testSuites
          var url = testSuites[0];

          getResourceGraph(url, null, options)
            .then(g => {
// console.log(g.out().values)
              if (g) {
                DO.U.insertTestCoverageToTable(id, g);
              }
            })
            .catch(reason => {
console.log(reason);
            });
        }

        var predecessorVersion = Config.Resource[documentURL].graph.out(ns.rel['predecessor-version']).values;
// predecessorVersion = [];
        if (predecessorVersion.length) {
          url = predecessorVersion[0];

          var sourceGraph = Config.Resource[documentURL].graph;
          var sourceGraphURI = sourceGraph.term.value;
// console.log(sourceGraphURI)
          var buttonTextDiffRequirements = 'Diff requirements with the predecessor version';

          var table = document.getElementById(id);
          var thead = table.querySelector('thead');
          thead.querySelector('tr > th').insertAdjacentHTML('beforeend', '<button id="include-diff-requirements" class="do add" disabled="disabled" title="' + buttonTextDiffRequirements + '">' + Icon[".fas.fa-circle-notch.fa-spin.fa-fw"] + '</button>');

          getResourceGraph(url, null, options)
            .then(targetGraph => {
              if (targetGraph) {
                var targetGraphURI = targetGraph.term.value;
// console.log(targetGraphURI)

                var buttonRD = document.getElementById('include-diff-requirements');
                buttonRD.setHTMLUnsafe(domSanitize(Icon[".fas.fa-plus-minus"]));
                buttonRD.disabled = false;

                buttonRD.addEventListener('click', (e) => {
                  var button = e.target.closest('button');
                  if (button){
                    if (button.classList.contains('add')) {
                      button.classList.remove('add');
                      button.classList.add('remove');
                      button.setAttribute('title', "Show requirements");
                      button.setHTMLUnsafe(domSanitize(Icon[".fas.fa-list-check"]));

                      if (!button.classList.contains('checked')) {
                        DO.U.diffRequirements(sourceGraph, targetGraph);
                        button.classList.add('checked');
                      }

                      table.querySelectorAll('tbody tr').forEach(tr => {
                        var sR = tr.getAttribute('about');
                        var td = tr.querySelector('td:nth-child(3)');
                        sR = sR.replace(stripFragmentFromString(sR), sourceGraphURI);
                        var tR = targetGraphURI + '#' + getFragmentFromString(sR);
                        td.setHTMLUnsafe(domSanitize(Config.Resource[sourceGraphURI].spec['requirement'][sR]['diff'][tR]['statement'])) || '';
                      });
                    }
                    else if (button.classList.contains('remove')) {
                      button.classList.remove('remove');
                      button.classList.add('add');
                      button.setAttribute('title', buttonTextDiffRequirements);
                      button.setHTMLUnsafe(domSanitize(Icon[".fas.fa-plus-minus"]));

                      table.querySelectorAll('tbody tr').forEach(tr => {
                        var sR = tr.getAttribute('about');
                        var td = tr.querySelector('td:nth-child(3)');
                        var sourceRequirementURI = sourceGraphURI + '#' + getFragmentFromString(sR);
                        var statement = Config.Resource[sourceGraphURI].spec['requirement'][sourceRequirementURI][ns.spec.statement.value] || sR;
                        td.setHTMLUnsafe(domSanitize('<a href="' + sR + '">' + statement + '</a>'));
                      });
                    }
                  }
                });
              }
            });
        }
      }

      if (id == 'list-of-concepts') {
        document.getElementById(id).addEventListener('click', (e) => {
          var button = e.target.closest('button.add');
          if (button) {
            button.disabled = true;
            button.insertAdjacentHTML('beforeend', Icon[".fas.fa-circle-notch.fa-spin.fa-fw"]);

            DO.U.showExtendedConcepts();
          }
        })
      }
    },

    // ?spec spec:requirement ?requirement .
    // ?spec spec:implementationReport ?implementationReport .
    // ?spec spec:testSuite ?testSuite .
    // ?testSuite ldp:contains ?testCase .
    // ?testCase spec:requirementReference ?requirement .
    insertTestCoverageToTable(id, testSuiteGraph) {
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
    },

    showRobustLinks: function(e, selector) {
      if (e) {
        e.target.closest('button').disabled = true;
      }

      var robustLinks = selector || document.querySelectorAll('cite > a[href^="http"][data-versionurl][data-versiondate]');

      var buttonClose = getButtonHTML({ key: 'dialog.robustify-links.close.button', button: 'close', buttonClass: 'close', iconSize: 'fa-2x' });

      document.body.appendChild(fragmentFromString(`
        <aside aria-labelledby="robustify-links-label" class="do on" dir="${Config.User.UI.LanguageDir}" id="robustify-links" lang="${Config.User.UI.Language}" rel="schema:hasPart" resource="#robustify-links" xml:lang="${Config.User.UI.Language}">
          <h2 id="robustify-links-label" property="schema:name">Robustify Links ${Config.Button.Info.RobustLinks}</h2>
          ${buttonClose}
          <div class="info"></div>
          <div id="robustify-links-input">
            <p><input id="robustify-links-select-all" type="checkbox" value="true"/><label data-i18n="dialog.robustify-links.select-all.label" for="robustify-links-select-all">${i18n.t('dialog.robustify-links.select-all.label.textContent')}</label></p>
            <p><input id="robustify-links-reuse" type="checkbox" value="true" checked="checked"/><label data-i18n="dialog.robustify-links.reuse.label" for="robustify-links-reuse">${i18n.t('dialog.robustify-links.reuse.label.textContent')}</label></p>
            <ul id="robustify-links-list"></ul>
          </div>
          <button class="robustify" title="Robustify Links" type="submit">Robustify</button>
        </aside>
      `));

      //TODO: Move unique list of existing RL's to Config.Resource?
      var robustLinksUnique = {};
      robustLinks.forEach(i => {
        if (!robustLinksUnique[i.href]) {
          robustLinksUnique[i.href] = {
            "node": i,
            "data-versionurl": i.getAttribute("data-versionurl"),
            "data-versiondate": i.getAttribute("data-versiondate")
          };
        }
        else {
          // console.log(i);
        }
      });

// console.log('robustLinks: ' + robustLinks.length);
// console.log(robustLinksUnique)
// console.log('<robustLinksUnique:  ' + Object.keys(robustLinksUnique).length);

      var rlCandidates = document.querySelectorAll('cite > a[href^="http"]:not([data-versionurl]):not([data-versiondate])');
// console.log(rlCandidates)
      var rlInput = document.querySelector('#robustify-links-input');

      rlInput.insertAdjacentHTML('afterbegin', '<p class="count"><data>' + rlCandidates.length + '</data> candidates.</p>');

      var rlUL = document.querySelector('#robustify-links-list');
      rlCandidates.forEach(i => {
        var html = '<li><input id="' + i.href + '" type="checkbox" value="' + i.href + '" /> <label for="' + i.href + '"><a dir="ltr" href="' + i.href + '" rel="noopener" target="_blank" title="' + i.textContent + '">' + i.href + '</a></label>';

          //TODO: addEventListener
//         if(robustLinksUnique[i.href]) {
//           //Reuse RL
// // console.log('Reuse Robust Link? ' + robustLinksUnique[i.href]["data-versionurl"]);
//           html += '<button class="robustlinks-reuse" title="' + robustLinksUnique[i.href]["data-versionurl"] + '">' + Icon[".fas.fa-recycle"] + '</button>';
//         }

        html += '</li>';
        rlUL.insertAdjacentHTML('beforeend', html);
      });


      var robustifyLinks = document.getElementById('robustify-links');
      robustifyLinks.addEventListener('click', function (e) {
        if (e.target.closest('button.close')) {
          var rs = document.querySelector('#document-do .robustify-links');
          if (rs) {
            rs.disabled = false;
          }
        }

        if (e.target.closest('button.robustify')) {
          e.target.disabled = true;

          var rlChecked = document.querySelectorAll('#robustify-links-list input:checked');

          var promises = [];

          rlChecked.forEach(i => {
// console.log('Robustifying: ' + i.value)
// console.log(i);

            var options = {};
            options['showRobustLinksDecoration'] = false;
            options['showActionMessage'] = false;
            var node = document.querySelector('cite > a[href="' + i.value + '"]:not([data-versionurl]):not([data-versiondate])');

// console.log(node);

            i.parentNode.insertAdjacentHTML('beforeend', '<span class="progress" data-to="' + i.value + '">' + Icon[".fas.fa-circle-notch.fa-spin.fa-fw"] + '</span>')

            // window.setTimeout(function () {
// console.log(i.value);

            var progress = document.querySelector('#robustify-links-list .progress[data-to="' + i.value + '"]');

            var robustLinkFound = false;

            var robustifyLinksReuse = document.querySelector('#robustify-links-reuse');
            if (robustifyLinksReuse.checked) {
              Object.keys(robustLinksUnique).forEach(url => {
                if (i.value == url) {
// console.log(robustLinksUnique[url])
                  progress.setHTMLUnsafe(domSanitize('<a href="' + robustLinksUnique[url]["data-versionurl"] + '" rel="noopener" target="_blank">' + Icon[".fas.fa-archive"] + '</a>'));
// console.log(node)
                  node.setAttribute("data-versionurl", robustLinksUnique[url]["data-versionurl"]);
                  node.setAttribute("data-versiondate", robustLinksUnique[url]["data-versiondate"]);

                  showRobustLinksDecoration(node.closest('cite'));

                  robustLinkFound = true;
                }
              });
            }

            if (!robustLinkFound) {
              DO.U.createRobustLink(i.value, node, options).then(
                function(rl){
                  var versionURL = ("data-versionurl" in rl) ? rl["data-versionurl"] : rl.href;

                  if ("data-versionurl" in rl && "data-versiondate" in rl) {
                    robustLinksUnique[i.value] = {
                      "node": node,
                      "data-versionurl": rl["data-versionurl"],
                      "data-versiondate": rl["data-versiondate"]
                    }
// console.log('Add    robustLinksUnique: ' + Object.keys(robustLinksUnique).length);
                  }

                  progress.setHTMLUnsafe(domSanitize('<a href="' + versionURL + '" rel="noopener" target="_blank">' + Icon[".fas.fa-archive"] + '</a>'));

                  showRobustLinksDecoration(node.closest('cite'));
                })
                .catch(r => {
                  progress.setHTMLUnsafe(domSanitize(Icon[".fas.fa-times-circle"] + ' Unable to archive. Try later.'));
                });
            }
// console.log('</robustLinksUnique: ' + Object.keys(robustLinksUnique).length);
            e.target.disabled = false;
          });
        }

        if (e.target.closest('#robustify-links-select-all')) {
          var rlInput = document.querySelectorAll('#robustify-links-list input');
          // console.log(rlInput.value)
          // console.log(e.target.checked)
          if (e.target.checked) {
            rlInput.forEach(i => {
              i.setAttribute('checked', 'checked');
              i.checked = true;
            });
          }
          else {
            rlInput.forEach(i => {
              i.removeAttribute('checked');
              i.checked = false;
            });
          }
        }

        if (e.target.closest('#robustify-links-list input')) {
          // console.log(e.target)
          if(e.target.getAttribute('checked')) {
            e.target.removeAttribute('checked');
          }
          else {
            e.target.setAttribute('checked', 'checked');
          }
          // console.log(e.target);
        }
      });
    },

    createRobustLink: function(uri, node, options){
      return DO.U.snapshotAtEndpoint(undefined, uri, 'https://web.archive.org/save/', '', {'Accept': '*/*', 'showActionMessage': false })
        .then(r => {
// console.log(r)
          //FIXME TODO: Doesn't handle relative URLs in Content-Location from w3.org or something. Getting Overview.html but base is lost.
          if (r) {
            var o = {
              "href": uri
            };
            var versionURL = r.location;

            if (typeof versionURL === 'string') {
              var vD = versionURL.split('/')[4];
              if (vD) {
                var versionDate = vD.substr(0,4) + '-' + vD.substr(4,2) + '-' + vD.substr(6,2) + 'T' + vD.substr(8,2) + ':' + vD.substr(10,2) + ':' + vD.substr(12,2) + 'Z';

                node.setAttribute('data-versionurl', versionURL);
                node.setAttribute('data-versiondate', versionDate);

                o["data-versionurl"] = versionURL;
                o["data-versiondate"] = versionDate;
              }
            }

            options['showActionMessage'] = ('showActionMessage' in options) ? options.showActionMessage : true;

            if (options.showActionMessage) {
              var message = `Archived <a href="${uri}">${uri}</a> at <a href="${versionURL}">${versionURL}</a> and created RobustLink.`;

              message = {
                'content': message,
                'type': 'success'
              }

              addMessageToLog(message, Config.MessageLog);
              showActionMessage(document.body, message);
            }

            if (options.showRobustLinksDecoration) {
              showRobustLinksDecoration();
            }

            return o;
          }
          else {
            return Promise.reject();
          }
        });
    },

    snapshotAtEndpoint: function(e, iri, endpoint, noteData, options = {}) {
      iri = iri || currentLocation();
      endpoint = endpoint || 'https://pragma.archivelab.org/';
      options.noCredentials = true

      var progress, svgFail, messageArchivedAt;
      options['showActionMessage'] = ('showActionMessage' in options) ? options.showActionMessage : true;

      //TODO: Move to Config?
      svgFail = Icon[".fas.fa-times-circle.fa-fw"];

      messageArchivedAt = Icon[".fas.fa-archive"] + ' Archived at ';

      var responseMessages = {
        "403": svgFail + ' Archive unavailable. Please try later.',
        "504": svgFail + ' Archive timeout. Please try later.'
      }

      // if(note.length) {
      //   noteData.annotation["message"] = note;
      // }

      if (options.showActionMessage) {
        var button = e.target.closest('button');

        if (typeof e !== 'undefined' && button) {
          if (button.disabled) { return; }
          else { button.disabled = true; }

          var archiveNode = button.parentNode;
          var message = 'Archiving in progress.';
          message = {
            'content': message,
            'type': 'info'
          }
          addMessageToLog(message, Config.MessageLog);
          archiveNode.insertAdjacentHTML('beforeend', ' <span class="progress">' + Icon[".fas.fa-circle-notch.fa-spin.fa-fw"] + ' ' + message.content + '</span>');
        }

        progress = archiveNode.querySelector('.progress');
      }

      var handleError = function(response) {
        if (options.showActionMessage) {
          var message = responseMessages[response.status];
          message = {
            'content': message,
            'type': 'error',
            'timer': 3000
          }
          addMessageToLog(message, Config.MessageLog);
          progress.setHTMLUnsafe(domSanitize(responseMessages[response.status]));
        }

        return Promise.reject(responseMessages[response.status]);
      }

      var handleSuccess = function(o) {
// console.log(o)
        if (options.showActionMessage) {
          var message = messageArchivedAt + '<a rel="noopener" target="_blank" href="' + o.location + '">' + o.location + '</a>';
          message = {
            'content': message,
            'type': 'success'
          }
          addMessageToLog(message, Config.MessageLog);
          progress.setHTMLUnsafe(domSanitize(message.content));
        }

        return Promise.resolve(o);
      }

      var checkLinkHeader = function(response) {
        var link = response.headers.get('Link');

        if (link && link.length) {
          var rels = LinkHeader.parse(link);
          if (rels.has('rel', 'memento')) {
            var o = {
              "response": response,
              "location": rels.rel('memento')[0].uri
            }
            return handleSuccess(o);
          }
        }

        return handleError(response);
      }


      //TODO: See also https://archive.org/help/wayback_api.php

      switch (endpoint) {
        case 'https://web.archive.org/save/':
          var headers = { 'Accept': '*/*' };
// options['mode'] = 'no-cors';
          var pIRI = endpoint + iri;
          // i = 'https://web.archive.org/save/https://example.org/';

          pIRI = (Config.WebExtensionEnabled) ? pIRI : getProxyableIRI(pIRI, {'forceProxy': true});
          // pIRI = getProxyableIRI(pIRI, {'forceProxy': true})
// console.log(pIRI)
          return getResource(pIRI, headers, options)
            .then(response => {
// console.log(response)
// for(var key of response.headers.keys()) {
//   console.log(key + ': ' + response.headers.get(key))
// }

              let location = response.headers.get('Content-Location');
// console.log(location)
              if (location && location.length) {
                //XXX: Scrape Internet Archive's HTML
                if (location.startsWith('/web/')) {
                  var o = {
                    "response": response,
                    "location": 'https://web.archive.org' + location
                  }
                  return handleSuccess(o);
                }
                else {
                  return response.text()
                    .then(data => {
// console.log(data)
                      // ALLOW_UNKNOWN_PROTOCOLS is needed for namespaced attribute values that DOMPurify mistakenly interpret as an unknown protocol protocol; it will allow mailto: but strip out others it does not recognize
                      data = domSanitize(data);

                      var regexp = /var redirUrl = "([^"]*)";/;
                      var match = data.match(regexp);
// console.log(match)
                      if (match && match[1].startsWith('/web/')) {
                        var o = {
                          "response": response,
                          "location": 'https://web.archive.org' + match[1]
                        }
                        return handleSuccess(o);
                      }
                      else {
                        return checkLinkHeader(response);
                      }
                    })
                }
              }
              else {
// response.text().then(data => { console.log(data) })

                return checkLinkHeader(response);
              }
            })
            .catch(response => {
// console.log(response)
              return handleError(response);
            })

        case 'https://pragma.archivelab.org/':
        default:
          noteData = noteData || {
            "url": iri,
            "annotation": {
              "@context": "http://www.w3.org/ns/anno.jsonld",
              "@type": "Annotation",
              "motivation": "linking",
              "target": iri,
              "rights": "https://creativecommons.org/publicdomain/zero/1.0/"
            }
          };

          if (Config.User.IRI) {
            noteData.annotation['creator'] = {};
            noteData.annotation.creator["@id"] = Config.User.IRI;
          }
          if (Config.User.Name) {
            noteData.annotation.creator["http://schema.org/name"] = Config.User.Name;
          }
          if (Config.User.Image) {
            noteData.annotation.creator["http://schema.org/image"] = Config.User.Image;
          }
          if (Config.User.URL) {
            noteData.annotation.creator["http://schema.org/url"] = Config.User.URL;
          }

          if(!('contentType' in options)){
            options['contentType'] = 'application/json';
          }

          return postResource(endpoint, '', JSON.stringify(noteData), options.contentType, null, options)

          .then(response => response.json())

          .then(response => {
            if (response['wayback_id']) {
              var message;
              let location = 'https://web.archive.org' + response.wayback_id

              if (options.showActionMessage) {
                message = messageArchivedAt + '<a href="' + location + '" rel="noopener" target="_blank">' + location + '</a>';
                message = {
                  'content': message,
                  'type': 'info'
                }
                addMessageToLog(message, Config.MessageLog);
                progress.setHTMLUnsafe(domSanitize(message.content));
              }

              return { "response": response, "location": location };
            }
            else {
              if (options.showActionMessage) {
                message = responseMessages[response.status];
                message = {
                  'content': message,
                  'type': 'error'
                }
                addMessageToLog(message, Config.MessageLog);
                progress.setHTMLUnsafe(domSanitize(message.content));
              }

              return Promise.reject(responseMessages[response.status])
            }
          })

          .catch((err) => {
            if (options.showActionMessage) {
              var message = responseMessages[err.response.status];
              message = {
                'content': message,
                'type': 'error'
              }
              addMessageToLog(message, Config.MessageLog);
              progress.setHTMLUnsafe(domSanitize(message.content));
            }
          })
      }
    },

    //Derived from saveAsDocument
    generateFeed: function generateFeed (e) {
      e.target.disabled = true;

      var buttonClose = getButtonHTML({ key: "dialog.generate-feed.close.button", button: 'close', buttonClass: 'close', iconSize: 'fa-2x' });

      document.body.appendChild(fragmentFromString(`
        <aside aria-labelledby="generate-feed-label" class="do on" dir="${Config.User.UI.LanguageDir}" id="generate-feed" lang="${Config.User.UI.Language}" rel="schema:hasPart" resource="#generate-feed" xml:lang="${Config.User.UI.Language}">
          <h2 data-i18n="dialog.generate-feed.h2" id="generate-feed-label" property="schema:name">${i18n.t('dialog.generate-feed.h2.textContent')} ${Config.Button.Info.GenerateFeeds}</h2>
          ${buttonClose}
          <div class="info"></div>
        </aside>
      `));

      var generateFeed = document.getElementById('generate-feed');
      generateFeed.addEventListener('click', (e) => {
        if (e.target.closest('button.close')) {
          document.querySelector('#document-do .generate-feed').disabled = false;
        }
      });

      var fieldset = '';

      var id = 'location-generate-feed';
      var action = 'write';
      generateFeed.insertAdjacentHTML('beforeend', `<form><fieldset id="${id}-fieldset"><legend data-i18n="dialog.generate-feed.save-to.legend">${i18n.t('dialog.generate-feed.save-to.legend.textContent')}</legend></fieldset></form>`);
      fieldset = generateFeed.querySelector('fieldset#' + id + '-fieldset');
      DO.U.setupResourceBrowser(fieldset, id, action);
      var feedTitlePlaceholder = (Config.User.IRI && Config.User.Name) ? Config.User.Name + "'s" : "Foo's";
      fieldset.insertAdjacentHTML('beforeend', `<p data-i18n="dialog.generate-feed.generate-location.p" id="${id}-samp">${i18n.t('dialog.generate-feed.generate-location.p.textContent')} <samp id="${id}-${action}"></samp></p><ul><li><label data-i18n="dialog.generate-feed.title.label" for="${id}-title">${i18n.t('dialog.generate-feed.title.label.textContent')}</label> <input type="text" placeholder="${feedTitlePlaceholder} Web Feed" name="${id}-title" value=""></li><li><label data-i18n="language.label" for="${id}-language">${i18n.t('language.label.textContent')}</label> <select id="${id}-language" name="${id}-language">${getLanguageOptionsHTML()}</select></li><li><label data-i18n="license.label" for="${id}-license">${i18n.t('license.label.textContent')}</label> <select id="${id}-license" name="${id}-license">${getLicenseOptionsHTML()}</select></li><li>${DO.U.getFeedFormatSelection()}</li></ul><button class="create" data-i18n="dialog.generate-feed.generate.button" title="${i18n.t('dialog.generate-feed.generate.button.title')}" type="submit">${i18n.t('dialog.generate-feed.generate.button.textContent')}</button>`);
      var bli = document.getElementById(id + '-input');
      bli.focus();
      bli.placeholder = 'https://example.org/path/to/feed.xml';

      generateFeed.addEventListener('click', e => {
        if (!e.target.closest('button.create')) {
          return
        }

        e.preventDefault();
        e.stopPropagation();

        var generateFeed = document.getElementById('generate-feed')
        var storageIRI = generateFeed.querySelector('#' + id + '-' + action).innerText.trim();

        // console.log('storageIRI: ' + storageIRI)
        var rm = generateFeed.querySelector('.response-message')
        if (rm) {
          rm.parentNode.removeChild(rm)
        }

        // TODO: this needs to be form validation instead
        if (!isHttpOrHttpsProtocol(storageIRI) || !storageIRI.length) {
          generateFeed.insertAdjacentHTML('beforeend',
            `<div class="response-message"><p class="error" data-i18n="dialog.generate-feed.error.missing-location.p">${i18n.t("dialog.generate-feed.error.missing-location.p.textContent")}</p></div>`
          )

          return
        }

        var options = {};
        var feedFormat = Config.MediaTypes.Feed[0];
        var feedFormatSelectionChecked = generateFeed.querySelector('select[id="feed-format"]')
        if (feedFormatSelectionChecked.length) {
          feedFormat = (Config.MediaTypes.Feed.indexOf(feedFormatSelectionChecked.value) > -1) ? feedFormatSelectionChecked.value : feedFormat;

          options['contentType'] = feedFormat;
        }

        var feedTitle = generateFeed.querySelector('input[name="' + id + '-title"]').value || storageIRI

        var feedLanguageSelected = generateFeed.querySelector('select[name="' + id + '-language"]').value
        var feedLicenseSelected = generateFeed.querySelector('select[name="' + id + '-license"]').value

        var feedURLSelection = [];

        var checkedInput = generateFeed.querySelectorAll('#' + id + '-ul' + ' input[type="checkbox"]:checked')
        checkedInput = Array.from(checkedInput)
        if (checkedInput.length) {
          feedURLSelection = checkedInput.map((el) => el.value);
        }
// console.log(feedURLSelection)

        function getFeedData(urls) {
          var promises = [];
          var resourceData = {};

          //TODO: update setAcceptTypes to give higher q-value to Config.MediaTypes.Markup than the rest of Config.MediaTypes.RDF
          // const headers = {'Accept': 'text/html, application/xhtml+xml, image/svg+xml, text/turtle;q=0.9, application/ld+json;q=0.9'};
          const headers = {};
          urls.forEach(function (url) {
            // var pIRI = getProxyableIRI(u);
            promises.push(
              getResource(url, headers)
                .then(response => {
                  var cT = response.headers.get('Content-Type');
                  var options = {};
                  options['contentType'] = (cT) ? cT.split(';')[0].toLowerCase().trim() : 'text/turtle';
                  options['subjectURI'] = response.url;
                  options['storeHash'] = true;

                  return response.text()
                    .then(data => {
                      return getResourceInfo(data, options)
                      .then(d => ({ response, result: d }))
                    })
                    .catch(function (error) {
                      console.error(`Error fetching ${url}:`, error.message);
                      return Promise.resolve(); 
                    });
                })
                .then(({response, result}) => {
                  Config.Resource[url] = result;
                  updateSupplementalInfo(response, { documentURL: url });
                  resourceData[url] = Config.Resource[url];
                })
            );
          });

          return Promise.all(promises).then(() => resourceData);
        }

        getFeedData(feedURLSelection)
          .then(resourceData => {
            var feed = {
              self: storageIRI,
              title: feedTitle,
              // description: 'TODO: User Input',
              language: feedLanguageSelected,
              license: feedLicenseSelected,
              // copyright: 'TODO: User Input',
              // rights: 'TODO: User Input',
              author: {},
              origin: new URL(storageIRI).origin,
              items: resourceData
            };

            if (Config.User.IRI) {
              feed['author']['uri'] = Config.User.IRI;
              if (Config.User.Name) {
                feed['author']['name'] = Config.User.Name;
              }
            }

// console.log(feed)
// console.log(options)

            feed = createFeedXML(feed, options);
// console.log(feed);
            return feed;
          })
          .then(feedData => {
            var progress = generateFeed.querySelector('progress')
            if(progress) {
              progress.parentNode.removeChild(progress)
            }
            e.target.insertAdjacentHTML('afterend', '<progress min="0" max="100" value="0"></progress>')
            progress = generateFeed.querySelector('progress')

// console.log(feedData)
// console.log(storageIRI)
// console.log(options);
            putResource(storageIRI, feedData, options.contentType, null, { 'progress': progress })
              .then(response => {
                progress.parentNode.removeChild(progress)

                let url = response.url || storageIRI

                // TODO: this needs to be form validation instead
                if (!isHttpOrHttpsProtocol(url)) {
                  throw Error("Not a valid URL for value: ", url);
                }

                generateFeed.insertAdjacentHTML('beforeend',
                  `<div class="response-message"><p class="success" data-i18n="dialog.generate-feed.success.saved-at.p"><span>${i18n.t('dialog.generate-feed.success.saved-at.p.textContent')}</span> <a href="${url}" rel="noopener" target="_blank">${url}</a></p></div>`
                )

                setTimeout(() => {
                  window.open(url, '_blank')
                }, 3000)
              })

              //TODO: Reuse saveAsDocument's catch
              .catch(error => {
                console.log('Error saving document. Status: ' + error.status)
              })
          })
      })
    },

    mementoDocument: function(e) {
      if(typeof e !== 'undefined') {
        var b = e.target.closest('button');
        if(b.disabled) { return; }
        else {
          b.disabled = true;
        }
      }

      showTimeMap();
    },

    showMessageLog: function(e, options) {
      e.target.closest('button').disabled = true

      var messageLog;

      if (Config.MessageLog && Config.MessageLog.length) {
        messageLog = `<table role="log"><caption data-i18n="dialog.message-log.caption">${i18n.t('dialog.message-log.caption.textContent')}</caption><thead><tr><th data-i18n="dialog.message-log.datetime.th">${i18n.t('dialog.message-log.datetime.th.textContent')}</th><th data-i18n="dialog.message-log.message.th">${i18n.t('dialog.message-log.message.th.textContent')}</th><th data-i18n="dialog.message-log.type.th">${i18n.t('dialog.message-log.type.th.textContent')}</th></tr></thead><tbody>`;
        Object.keys(Config.MessageLog).forEach(i => {
          messageLog += `<tr><td><time>${Config.MessageLog[i].dateTime}</time></td><td>${Config.MessageLog[i].content}</td><td data-i18n="dialog.message-log.${Config.MessageLog[i].type}.td">${i18n.t(`dialog.message-log.${Config.MessageLog[i].type}.td.textContent`)}</td></tr>`;
        });
        messageLog += '</tbody></table>';
      }
      else {
        messageLog = `<p data-i18n="dialog.message-log.no-messages.p">${i18n.t('dialog.message-log.no-messages.p.textContent')}</p>`;
      }

      var buttonClose = getButtonHTML({ key: 'dialog.message-log.close.button', button: 'close', buttonClass: 'close', iconSize: 'fa-2x' });
      document.body.appendChild(fragmentFromString(`
        <aside aria-labelledby="message-log-label" class="do on" dir="${Config.User.UI.LanguageDir}" id="message-log" lang="${Config.User.UI.Language}" rel="schema:hasPart" resource="#message-log" xml:lang="${Config.User.UI.Language}">
          <h2 data-i18n="dialog.message-log.h2" id="message-log-label" property="schema:name">${i18n.t('dialog.message-log.h2.textContent')} ${Config.Button.Info.MessageLog}</h2>
          ${buttonClose}
          <div class="info"></div>
          <div>${messageLog}</div>
        </aside>
      `));

      document.querySelector('#message-log button.close').addEventListener('click', (e) => {
        document.querySelector('button.message-log').removeAttribute('disabled');
      });
    },

    //TODO: Minor refactoring to delete any URL, e.g., annotation (already implemented)
    resourceDelete: function(e, url, options) {
      if (!url) { return; }

      e.target.closest('button').disabled = true

      var buttonClose = getButtonHTML({ key: 'dialog.delete.close.button', button: 'close', buttonClass: 'close', iconSize: 'fa-2x' });

      document.body.appendChild(fragmentFromString(`
        <aside aria-labelledby="delete-document-label" class="do on" dir="${Config.User.UI.LanguageDir}" id="delete-document" lang="${Config.User.UI.Language}" rel="schema:hasPart" resource="#delete-document" xml:lang="${Config.User.UI.Language}">
          <h2 data-i18n="dialog.delete.h2" id="delete-document-label" property="schema:name">${i18n.t('dialog.delete.h2.textContent')} ${Config.Button.Info.Delete}</h2>
          ${buttonClose}
          <div class="info"></div>
          <div>
            <p data-i18n="dialog.delete.confirmation.p">${i18n.t('dialog.delete.confirmation.p.textContent')}</p><p><code>${url}</code></p>
          </div>
          <button class="cancel" title="${i18n.t('dialog.delete.cancel.button.title')}" type="button">${i18n.t('dialog.delete.cancel.button.textContent')}</button>
          <button class="delete" data-i18n="dialog.delete.submit.button" title="${i18n.t('dialog.delete.submit.button.title')}" type="button">${i18n.t('dialog.delete.submit.button.textContent')}</button>
        </aside>
      `));

      document.querySelector('#delete-document').addEventListener('click', (e) => {
        if (e.target.closest('button.info')) { return; }

        e.preventDefault();
        e.stopPropagation();

        var buttonCC = e.target.closest('button.close') || e.target.closest('button.cancel');
        var buttonDelete = e.target.closest('button.delete');

        if (buttonCC) {
          var parent = buttonCC.parentNode;
          parent.parentNode.removeChild(parent);

          var rd = document.querySelector('#document-do .resource-delete');
          if (rd) {
            rd.disabled = false;
          }
        }
        else if (buttonDelete) {
          deleteResource(url)
            .then(response => {
              Config.Editor.toggleEditor('author', { template: 'new' });

              var message = `<span data-i18n="dialog.delete.success.default.p">${i18n.t('dialog.delete.success.default.p.textContent', {url}) }</span>`;
              var actionMessage = '';

              switch(response.status) {
                case 200: case 204: default:
                  actionMessage = message;
                  break;

                case 202:
                  message = `<span data-i18n="dialog.delete.success.in-progress.p">${i18n.t('dialog.delete.success.default.p.textContent', {url}) }</span>`;
                  actionMessage =  `<span data-i18n="dialog.delete.success.in-progress.p">${i18n.t('dialog.delete.success.default.p.textContent', {url}) }</span>`;

                  break;
              }

              const messageObject = {
                'content': actionMessage,
                'type': 'success',
                'timer': 3000,
                'code': response.status
              }

              addMessageToLog({...messageObject, content: message}, Config.MessageLog);
              showActionMessage(document.body, messageObject);
            })
            .catch((error) => {
              // console.log(error)
              // console.log(error.status)
              // console.log(error.response)

              //TODO: Reuse saveAsDocument's catch to request access by checking the Link header.

              var message = '';
              var actionMessage = '';
              // let actionTerm = 'delete';
              var errorKey = 'default';
              var actionMessageKey = 'default-action-message';

              if (error.status) {
                switch(error.status) {
                  case 401:
                    if (Config.User.IRI) {
                      errorKey = 'unauthenticated';
                    }
                    else {
                      errorKey = 'unauthenticated';
                      actionMessageKey = 'unauthenticated-action-message';
                    }

                    break;

                  case 403: default:
                    if (Config.User.IRI) {
                      var errorKey = 'default';
                      var actionMessageKey = 'default-action-message';

                    }
                    else {
                      errorKey = 'unauthenticated';
                      actionMessageKey = 'unauthenticated-action-message';
                    }

                    break;

                  case 409:
                    //XXX: If/when there is more (structured) detail from the server, it can be processed and used here.
                    errorKey = "conflict";
                    actionMessageKey = "conflict-action-message";

                    break;
                }
              }

              message = `<span data-i18n="dialog.delete.error.${errorKey}.p">${i18n.t(`dialog.delete.error.${errorKey}.p.textContent`, {url})}</span>`
              //TODO: signoutShowSignIn()
              actionMessage = `<span data-i18n="dialog.delete.error.${actionMessageKey}.p">${i18n.t(`dialog.delete.error.${actionMessageKey}.p.textContent`, {url, button: Config.Button.SignIn})}</span>`;

              const messageObject = {
                'content': actionMessage,
                'type': 'error',
                'timer': null,
                'code': error.status
              }

              addMessageToLog({...messageObject, content: message}, Config.MessageLog);
              showActionMessage(document.body, messageObject);
            })
          }
      });
    },

    resourceSave: function(e, options) {
      const documentOptions = {
        ...Config.DOMProcessing,
        format: true,
        sanitize: true,
        normalize: true
      };

      var url = currentLocation();
      var data = getDocument(null, documentOptions);
      options = options || {};

      getResourceInfo(data, options).then(i => {
        if (Config.DocumentAction == 'new'|| Config.DocumentAction == 'open') {
          DO.U.saveAsDocument(e);
        }
        else {
          if (e.target.closest('.create-version')) {
            createMutableResource(url);
          }
          else if (e.target.closest('.create-immutable')) {
            createImmutableResource(url);
          }
          else if (e.target.closest('.resource-save')) {
            updateMutableResource(url);
          }
        }
      });
    },

    selectContacts: function(node, url) {
      node.setHTMLUnsafe(domSanitize('<ul id="share-resource-contacts"></ul>'));
      var shareResourceNode = document.getElementById('share-resource-contacts');

      if (Config.User.Contacts && Object.keys(Config.User.Contacts).length){
        Object.keys(Config.User.Contacts).forEach(iri => {
          if (Config.User.Contacts[iri].Inbox && Config.User.IRI !== iri) {
            DO.U.addShareResourceContactInput(shareResourceNode, Config.User.Contacts[iri]);
          }
        });
      }
      else {
        DO.U.updateContactsInfo(url, shareResourceNode);
      }
    },

    updateContactsInfo: function(url, node, options) {
      options = options || {};

      return getUserContacts(url)
        .then(contacts => {
          if (contacts.length) {
            contacts.forEach(url => {
              getSubjectInfo(url)
                .then(subject => {
                  Config.User['Contacts'] = Config.User['Contacts'] || {};
                  Config.User.Contacts[url] = subject;

                  DO.U.addShareResourceContactInput(node, subject);

                  //TODO: This should be called only once after processing all contacts. Refactor the loop to eventually use Promise.allSettled perhaps.
                  updateLocalStorageProfile(Config.User);
                })
            });

            // return Promise.all(promises)
          }
          //TODO: This feature used to exist where user was able to enter WebIDs in a textarea (one per line? comma-separated).
          // else {
          //   node.setHTMLUnsafe(domSanitize('No contacts with ' + Icon[".fas.fa-inbox"] + ' inbox found in your profile, but you can enter contacts individually:'));
          // }

          return Promise.resolve();
        });
    },

    addShareResourceContactInput: function(node, agent) {
      var iri = agent.IRI
      var inbox = agent.Inbox;

      if (inbox && inbox.length) {
        var id = encodeURIComponent(iri);
        var name = agent.Name || iri;
        var img = agent.Image;
        if (!(img && img.length)) {
          img = generateDataURI('image/svg+xml', 'base64', Icon['.fas.fa-user-secret']);
        }
        img = '<img alt="" height="32" src="' + img + '" width="32" />';

        var input = '<li><input id="share-resource-contact-' + id + '" type="checkbox" value="' + iri + '" /><label for="share-resource-contact-' + id + '">' + img + '<a href="' + iri + '" rel="noopener" target="_blank">' + name + '</a></label></li>';

        node.insertAdjacentHTML('beforeend', input);
      }
    },

    updateContactsInbox: function(iri, s) {
      var checkInbox = function(s) {
        var aI = getAgentInbox(s);

        if (aI) {
          return Promise.resolve(aI);
        }
        else {
          return getLinkRelationFromHead(ns.ldp.inbox.value, iri);
        }
      }

      return checkInbox(s)
        .then(inboxes => {
          if (inboxes && inboxes.length) {
            Config.User.Contacts[iri]['Inbox'] = inboxes;
          }
        })
    },

    buttonSubscribeNotificationChannel: function(nodes, topicResource) {
      //TODO: Consider using typeof selector instead and make sure it is in the markup
      nodes.forEach(subNode => {
        subNode.addEventListener('click', (e) => {
          var button = e.target.closest('button');

          if (button && (button.classList.contains('subscribe') || button.classList.contains('unsubscribe'))) {
            e.preventDefault();
            e.stopPropagation();

            if (!(topicResource in Config.Subscription && 'Connection' in Config.Subscription[topicResource]) && button.classList.contains('subscribe')) {
              var subscription = subNode.querySelector('[rel="notify:subscription"]').getAttribute('resource');
              // console.log(Config.Resource[s.iri().toString()].subscription);
              var channelType = Config.Resource[topicResource]['subscription'][subscription]['channelType'];

              var data = {
                "type": channelType[0],
                "topic": topicResource
              };

              var features = Config.Resource[topicResource]['subscription'][subscription]['feature'];

              if (features && features.length) {
                var d = new Date();
                var startAt = new Date(d.getTime() + 1000);
                var endAt = new Date(startAt.getTime() + 3600000);

                if (features.includes(ns.notify.startAt.value)) {
                  data['startAt'] = startAt.toISOString();
                }
                if (features.includes(ns.notify.endAt.value)) {
                  data['endAt'] = endAt.toISOString();
                }
                if (features.includes(ns.notify.rate.value)) {
                  data['rate'] = "PT10S";
                }
              }

              DO.U.subscribeToNotificationChannel(subscription, data)
              .then(i => {
                if (Config.Subscription[data.topic] && 'Connection' in Config.Subscription[data.topic]) {
                  button.textContent = i18n.t('dialog.notification-subscriptions.unsubscribe.button.textContent');
                  button.setAttribute('class', 'unsubscribe');
                  button.setAttribute('data-i18n', 'dialog.notification-subscriptions.unsubscribe.button');
                }
              }).catch(e => {
                console.log(e);
              });
            }
            else {
              Config.Subscription[topicResource].Connection.close();
              Config.Subscription[topicResource] = {};
              button.textContent = i18n.t('dialog.notification-subscriptions.subscribe.button.textContent');
              button.setAttribute('class', 'subscribe');
              button.setAttribute('data-i18n', 'dialog.notification-subscriptions.subscribe.button');
            }
          }
        });
      });
    },
    
    getStorageSelfDescription: function(g) {
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
    },

    getPersistencePolicy: function(g) {
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
    },

    getODRLPolicies: function(g) {
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

            policyDetails.push(DO.U.getODRLRuleActions(ruleG));
            policyDetails.push(DO.U.getODRLRuleAssigners(ruleG));
            policyDetails.push(DO.U.getODRLRuleAssignees(ruleG));
          }
          var prohibition = policy.out(ns.odrl.prohibition).values[0];
          if (prohibition) {
            ruleG = g.node(rdf.namedNode(prohibition));

            policyDetails.push(DO.U.getODRLRuleActions(ruleG));
            policyDetails.push(DO.U.getODRLRuleAssigners(ruleG));
            policyDetails.push(DO.U.getODRLRuleAssignees(ruleG));
          }

          var detail = '<dl>' + policyDetails.join('') + '</dl>';

          odrlPolicies.push('<dd><details><summary><a href="' + iri + '" rel="noopener" target="_blank">' + iri + '</a></summary>' + detail + '</details></dd>');
        });

        s = '<dl id="odrl-policies"><dt>Policies</dt>' + odrlPolicies.join('') + '</dl>';
      }

      return s;
    },

    getODRLRuleActions: function(g) {
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
    },

    getODRLRuleAssigners: function(g) {
      var s = '';
      var a = [];

      var assigners = g.out(ns.odrl.assigner).values;

      assigners.forEach(iri => {
        a.push('<dd><a href="' + iri + '" rel="noopener" target="_blank">' + iri + '</a></dd>');
      });

      s = '<dt>Assigners</dt>' + a.join('');

      return s;
    },

    getODRLRuleAssignees: function(g) {
      var s = '';
      var a = [];

      var assignees = g.out(ns.odrl.assignees).values;

      assignees.forEach(iri => {
        a.push('<dd><a href="' + iri + '" rel="noopener" target="_blank">' + iri + '</a></dd>');
      });

      s = '<dt>Assignees</dt>' + a.join('');

      return s;
    },

    getContactInformation: function(g) {
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
    },

    getCommunicationOptions: function(g, options = {}) {
      var subjectURI = options.subjectURI || g.term.value;
      g = g.node(rdf.namedNode(subjectURI));
// console.log(subjectURI)
      var notificationSubscriptions = DO.U.getNotificationSubscriptions(g);
      var notificationChannels = DO.U.getNotificationChannels(g);

      Config.Resource[subjectURI] = Config.Resource[subjectURI] || {};

      if (notificationSubscriptions) {
        Config.Resource[subjectURI]['subscription'] = Config.Resource[subjectURI]['subscription'] || {};
      }

      if (notificationChannels) {
        Config.Resource[subjectURI]['channel'] = Config.Resource[subjectURI]['channel'] || {};
      }

      var nSHTML = [];

      if (notificationSubscriptions) {
        nSHTML.push(`<dl id="notification-subscriptions-${subjectURI}"><dt data-i18n="dialog.notification-subscriptions.dt">${i18n.t('dialog.notification-subscriptions.dt.textContent')}</dt>`);

        notificationSubscriptions.forEach(subscription => {
          var nS = g.node(rdf.namedNode(subscription));
          var channelType = DO.U.getNotificationChannelTypes(nS);
          var features = DO.U.getNotificationFeatures(nS);

          Config.Resource[subjectURI]['subscription'][subscription] = {};
          Config.Resource[subjectURI]['subscription'][subscription]['channelType'] = channelType;
          Config.Resource[subjectURI]['subscription'][subscription]['feature'] = features;

          var buttonSubscribe = i18n.t('dialog.notification-subscriptions.subscribe.button.textContent');
          var buttonDataI18n = 'dialog.notification-subscriptions.subscribe.button';
          var buttonSubscribeClass = 'subscribe';

          var topicResource = subjectURI;

          if (Config.Subscription[topicResource] && Config.Subscription[topicResource].Connection) {
            buttonSubscribe = i18n.t('dialog.notification-subscriptions.unsubscribe.button.textContent');
            buttonDataI18n = 'dialog.notification-subscriptions.unsubscribe.button';
            buttonSubscribeClass = 'unsubscribe';
          }

          nSHTML.push(`<dd id="notification-subscription-${subscription}"><details><summary><a href="${subscription}" rel="noopener" target="_blank">${subscription}</a></summary>`);
          nSHTML.push(`<dl rel="notify:subscription" resource="${subscription}">`);
          // nSHTML.push('<dt>Subscription</dt><dd><a href="' + subscription + '" rel="noopener" target="_blank">' + subscription + '</a></dd>');

          var topic = subjectURI;

          if (topic) {
            nSHTML.push(`<dt data-i18n="dialog.notification-subscriptions.topic">${i18n.t('dialog.notification-subscriptions.topic.dt.textContent')}</dt><dd><a href="${topic}" rel="notify:topic nopener" target="_blank">${topic}</a> <button data-i18n="${buttonDataI18n}" id="notification-subscription-${subscription}-button" class="${buttonSubscribeClass}">${buttonSubscribe}</button></dd>`);
          }

          if (channelType) {
            nSHTML.push(`<dt data-i18n="dialog.notification-subscriptions.channel-type">${i18n.t('dialog.notification-subscriptions.channel-type.dt.textContent')}</dt><dd><a href="${channelType}" rel="notify:channelType noopener" target="_blank">${channelType}</a></dd>`);
          }

          if (features) {
            nSHTML.push(`<dt data-i18n="dialog.notification-subscriptions.features">${i18n.t('dialog.notification-subscriptions.features.dt.textContent')}</dt><dd><ul rel="notify:feature">`);

            var nF = [];

            features.forEach(iri => {
              var label, href = iri;

              switch (iri) {
                case ns.notify.startAt.value:
                case ns.notify.endAt.value:
                case ns.notify.state.value:
                case ns.notify.rate.value:
                case ns.notify.accept.value:
                  label = getFragmentFromString(iri);
                  href = 'https://solidproject.org/TR/2022/notifications-protocol-20221231#notify-' + label;
                  break;

                default:
                  break;
              }

              nSHTML.push('<li><a href="' + href + '" resource="' + iri + '" rel="noopener" target="_blank">' + label + '</a></li>');
            });

            nSHTML.push('</ul></dd>');
          }

          nSHTML.push('</dl></details></dd>');
        })

        nSHTML.push('</dl>');
      }

      return nSHTML.join('');
    },

    //https://solidproject.org/TR/notifications-protocol#discovery
    getNotificationSubscriptions: function(g) {
      var notifysubscription = g.out(ns.notify.subscription).values;
      return (notifysubscription.length)
        ? notifysubscription
        : undefined
    },

    getNotificationChannels: function(g) {
      var notifychannel = g.out(ns.notify.channel).values;
      return (notifychannel.length)
        ? notifychannel
        : undefined
    },

    getNotificationChannelTypes: function(g) {
      var notifychannelType = g.out(ns.notify.channelType).values;
      return (notifychannelType)
        ? notifychannelType
        : undefined
    },

    getNotificationFeatures: function(g) {
      var notifyfeature = g.out(ns.notify.feature).values;
      return (notifyfeature.length)
        ? notifyfeature
        : undefined
    },

    //doap:implements <https://solidproject.org/TR/2022/notification-protocol-20221231#subscription-client-subscription-request>
    subscribeToNotificationChannel: function(url, data) {
      switch(data.type){
        //doap:implements <https://solidproject.org/TR/websocket-channel-2023>
        case ns.notify.WebSocketChannel2023.value:
          return DO.U.subscribeToWebSocketChannel(url, data);
      }
    },

    //doap:implements <https://solidproject.org/TR/2022/notification-protocol-20221231#notification-channel-data-model>
    subscribeToWebSocketChannel: function(url, d, options = {}) {
      if (!url || !d.type || !d.topic) { return Promise.reject(); }

      options['contentType'] = options.contentType || 'application/ld+json';

      var data;

      switch (options.contentType) {
        case 'text/turtle':
          data = '<> a <' + d.type  + '> ;\n\
  <http://www.w3.org/ns/solid/notifications#topic> <' + d.topic + '> .';
          break;

        default:
        case 'application/ld+json':
          d['@context'] = d['@context'] || ["https://www.w3.org/ns/solid/notification/v1"];
          // d['id'] = d['id'] || '';
          // data['feature'] = '';
          data = JSON.stringify(d);
          break;
      }

// d.topic = 'https://csarven.localhost:8443/foo.html';
      if (Config.Subscription[d.topic] && Config.Subscription[d.topic]['Connection']) {
        Config.Subscription[d.topic]['Connection'].close();
      }

      Config.Subscription[d.topic] = {};
      Config.Subscription[d.topic]['Request'] = d;

// console.log(Config.Subscription)

      return postResource(url, '', data, options.contentType, null, options)
        .then(response => {
          return DO.U.processNotificationSubscriptionResponse(response, d);
        })
        .catch(error => {
            console.error(error);

            let message;

            switch (error.status) {
              case 0:
              case 405:
                message = 'subscription request not allowed.';
                break;
              case 401:
                message = 'you are not authorized.'
                if(!Config.User.IRI){
                  message += ' Try signing in.';
                }
                break;
              case 403:
                message = 'you do not have permission to request a subscription.';
                break;
              case 406:
                message = 'representation not acceptable to the user agent.';
                break;
              default:
                // some other reason
                message = error.message;
                break;
            }

            // re-throw, to break out of the promise chain
            throw new Error('Cannot subscribe: ', message);
        })
        .then(data => {
// console.log(data);
// data = {
//   '@context': ['https://www.w3.org/ns/solid/notifications/v1'],
//   'type': 'WebSocketChannel2023',
//   'topic': 'https://csarven.localhost:8443/foo.html',
//   'receiveFrom': 'wss://csarven.localhost:8443/'
// }

          if (!(data.topic in Config.Subscription)) {
            console.log('Config.Subscription[' + data.topic + '] undefined.');
          }
          Config.Subscription[data.topic]['Response'] = data;

          switch (data.type) {
            case 'WebSocketChannel2023': case ns.notify.WebSocketChannel2023.value:
              data.type = ns.notify.WebSocketChannel2023.value;
              return DO.U.connectToWebSocket(data.receiveFrom, data).then(i => {
                Config.Subscription[data.topic]['Connection'] = i;
                // return Promise.resolve();
              });
          }
        });
    },

    processNotificationSubscriptionResponse: function(response, d) {
      var cT = response.headers.get('Content-Type');
      var contentType = cT.split(';')[0].trim();

      var rD = (contentType == 'application/ld+json') ? response.json() : response.text();

      return rD.then(data => {
// console.log(data)
        // return getGraphFromData(data, options).then
        switch (contentType) {
          case 'text/turtle':
            return Promise.reject({'message': 'TODO text/turtle', 'data': data});

          case 'application/ld+json':
            if (data['@context'] && data.type && data.topic) {
              if (d.topic != data.topic) {
                console.log('TODO: topic requested != response');
              }
// console.log(d.type, data)
              //TODO d.type == 'LDNChannel2023' && data.sender
              if ((d.type == 'WebSocketChannel2023' || d.type == ns.notify.WebSocketChannel2023.value) && data.receiveFrom) {
                return Promise.resolve(data);
              }
            }
            else {
              return Promise.reject({'message': 'Missing @context, type, topic(, receiveFrom)', 'data': data})
            }
            break;

          default:
          case 'text/plain':
            return Promise.reject({'message': 'TODO text/plain?', 'data': data});
        }
      });
    },

    processNotificationChannelMessage: function(data, options) {
// console.log(data);
// console.log(options);
// data = {
//   "@context": [
//     "https://www.w3.org/ns/activitystreams",
//     "https://www.w3.org/ns/solid/notification/v1"
//   ],
//   "id": "urn:uuid:" + generateUUID(),
//   "type": "Update",
//   "object": "https://csarven.localhost:8443/foo.html",
//   "state": "128f-MtYev",
//   "published": "2021-08-05T01:01:49.550Z"
// }

      //TODO: Only process ns/solid/notifications/v1 JSON-LD context.
      // return getGraphFromData(data, options).then(

      if (data['@context'] && data.id && data.type && data.object && data.published) {
        if (options.subjectURI != data.object) {
          console.log('TODO: topic requested != message object ');
        }

        // if (data.type.startsWith('https://www.w3.org/ns/activitystreams#')) {
          //TODO: Move this UI somewhere else

          //TODO: See if createActivityHTML can be generalised/reusable.


          Config.Subscription[data.object]['Notifications'] = Config.Subscription[data.object]['Notifications'] || {};
          //TODO: Max notifications to store. FIFO
          Config.Subscription[data.object]['Notifications'][data.id] = data;
          // Config.Subscription[data.object]['Notifications'][data.id] = g;
// console.log(Config.Subscription[data.object]['Notifications'])

          var nTypes = (Array.isArray(data.type)) ? data.type : [data.type];
          var types = '';
          nTypes.forEach(t => {
            types += types + '<dd><a href="' + t + '">' + t + '</a></dd>';
          })

          var message = [];
          message.push('<details>');
          message.push('<summary>Notification Received</summary>');
          message.push('<dl>');
          message.push('<dt>Identifier</dt><dd><a href="' + data.id  + '">' + data.id + '</a></dd>');
          message.push('<dt>Types</dt>' + types);
          message.push('<dt>Object</dt><dd><a href="' + data.object  + '">' + data.object + '</a></dd>');
          message.push('<dt>Published</dt><dd><time>' + data.published + '</time></dd>');
          message.push('</dl>');
          message.push('</details>');
          message = message.join('');

          message = {
            'content': message,
            'type': 'info',
            'timer': 3000
          }
          addMessageToLog(message, Config.MessageLog);
          showActionMessage(document.body, message);

          // return Promise.resolve(data);
        // }
      }
    },

    connectToWebSocket: function(url, data) {
      function connect() {
        return new Promise((resolve, reject) => {
// console.log(data)
          var protocols = [data.type];
// protocols = ['solid-0.1'];
// console.log(url, protocols)
          var ws = new WebSocket(url);
          var message;

          ws.onopen = function() {
            message = {'message': 'Connected to ' + url + ' (' + data.type + ').'};
            console.log(message);
// ws.send('sub ' + data.topic);

            // ws.send(JSON.stringify({
            // }));
            resolve(ws);
          };

          ws.onclose = function(e) {
            message = {'message': 'Socket to ' + url + ' is closed.'};
            //TODO: Separate reconnect on connection dropping from intentional close.
            // setTimeout(() => { connect(); }, 1000);
            // var timeout = 250;
            // setTimeout(connect, Math.min(10000,timeout+=timeout));

            console.log(message, e.reason);
          };

          ws.onerror = function(err) {
            console.error('Socket encountered error: ', err.message, 'Closing socket');
            ws.close();

            reject(err);
          };

          ws.onmessage = function(msg) {
// console.log(msg)
            var options = { 'subjectURI': data.topic }
            DO.U.processNotificationChannelMessage(msg.data, options);
          };
        });
      }

      return connect().then().catch((err) => {
        console.log(err)
      });
    },

    openInputFile: function(e) {
      let files = Array.from(e.target.files); 
      let options = { 'init': true };
    
      let readers = files.map(file => {
        return new Promise((resolve, reject) => {
          let reader = new FileReader();
          reader.onload = () => {
            resolve({
              name: file.name,
              type: file.type,
              content: reader.result
            });
          };
          reader.onerror = reject;
          reader.readAsText(file);
        });
      });
    
      Promise.all(readers).then(results => {
        let contentType = results.length === 1 ? results[0].type : "application/octet-stream";
        let iris = results.map(r => 'file:' + r.name)

        let filesUrls = iris.map((url) => `<a href="${url} rel="noopener" target="_blank">${url}</a>`);
        let urlsHtml = filesUrls.join(', ');
        var message = `Opening ${urlsHtml}`;
        var actionMessage = `Opening ${urlsHtml}`;

        const messageObject = {
          'content': actionMessage,
          'type': 'info',
          'timer': 10000
        }

        addMessageToLog({...messageObject, content: message}, Config.MessageLog);
        const messageId = showActionMessage(document.body, messageObject);

        spawnDokieli(
          document,
          results, 
          contentType,
          iris,
          options
        );
      }).catch(err => {
        console.error("Error reading files:", err);
      });
    },

    createNewDocument: function(e) {
      DO.U.hideDocumentMenu();

      Config.Editor.toggleEditor('author', { template: 'new' });

      Config.DocumentAction = 'new';

      disableAutoSave(Config.DocumentURL, {'method': 'localStorage'});

      updateButtons();
    },

    getFeedFormatSelection: function() {
      return `
        <div id="feed-format-selection">
          <label data-i18n="dialog.generate-feed.feed-format.label" for="feed-format">${i18n.t('dialog.generate-feed.feed-format.label.textContent')}</label>
          <select id="feed-format">
            <option id="feed-format-atom" lang="en" value="application/atom+xml" xml:lang="en">Atom</option>
            <option id="feed-format-rss" lang="en" value="application/rss+xml" selected="selected" xml:lang="en">RSS</option>
          </select>
        </div>
      `;
    },

    //TODO: Review grapoi
    getCitation: function(i, options) {
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
//           if (data.subtitle) {
// console.log(data.subtitle)
//           }

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

                //XXX: Working but unused:
//                 if (data.remote_ids && data.remote_ids.wikidata) {
//                   //wE has a few redirects to wW
//                   var wE = 'https://www.wikidata.org/entity/' + data.remote_ids.wikidata;
//                   var wW = 'https://www.wikidata.org/wiki/Special:EntityData/' + data.remote_ids.wikidata + '.jsonld';
//                   promises.push(getResourceGraph(wW, wikidataHeaders, options)
//                     .then(g => {
// // console.log(g)
// // console.log(g.iri().toString())
//                       var s = g.match(wE.replace(/^https:/, 'http:'))
// // console.log(s.toString());

//                       console.log(isbnData)
//                       console.log(isbnData.toString())

//                       return isbnData;
//                     }));
//                 }

                }));
            }

            // XXX: Working but unused:
            // if (data.identifiers?.wikidata && Array.isArray(data.identifiers.wikidata) && data.identifiers.wikidata.length) {
              // var w = 'https://www.wikidata.org/entity/' + data.identifiers.wikidata[0];
              // promises.push(getResourceGraph(w, wikidataHeaders, options).then(g => {
// console.log(g);
// console.log(g.toString());
              // }));
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
    },

    getCitationHTML: function(citationGraph, citationURI, options) {
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

      //XXX: FIXME: Putting this off for now because SimpleRDF is not finding the bnode for some reason in citationGraph.child(item), or at least authorItem.rdffirst (undefined)
      //TODO: Revisit using grapoi
//       if (subject.biboauthorList) {
//TODO: Just use/test something like: authorList = authorList.concat(traverseRDFList(citationGraph, subject.biboauthorList));
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
            author = DO.U.createRefName(schemafamilyName[0], schemagivenName[0]);
          }
          else if (foaffamilyName.length && foafgivenName.length) {
            author = DO.U.createRefName(foaffamilyName[0], foafgivenName[0]);
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
    },

    createRefName: function(familyName, givenName, refType) {
      refType = refType || Config.DocRefType;
      switch(refType) {
        case 'LNCS': default:
          return familyName + ', ' + givenName.slice(0,1) + '.';
        case 'ACM':
          return givenName.slice(0,1) + '. ' + familyName;
        case 'fullName':
          return givenName + ' ' + familyName;
      }
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
