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
import { getDocument, getDocumentContentNode, showActionMessage, selectArticleNode, showRobustLinksDecoration, getResourceInfo,  getResourceInfoSKOS, removeReferences, buildReferences, removeSelectorFromNode, insertDocumentLevelHTML, getResourceInfoSpecRequirements, getTestDescriptionReviewStatusHTML, createFeedXML, showTimeMap, createMutableResource, createImmutableResource, updateMutableResource, createHTML, getResourceImageHTML, setDocumentRelation, setDate, getLanguageOptionsHTML, getLicenseOptionsHTML, getNodeWithoutClasses, setCopyToClipboard, addMessageToLog, accessModeAllowed, getAccessModeOptionsHTML, parseMarkdown, createNoteDataHTML, hasNonWhitespaceText, updateSupplementalInfo, spawnDokieli } from './doc.js'
import { getProxyableIRI, stripFragmentFromString, getFragmentOrLastPath, getFragmentFromString, getURLLastPath, getLastPathSegment, forceTrailingSlash, getBaseURL, getParentURLPath, encodeString, generateDataURI, isHttpOrHttpsProtocol, isFileProtocol, getUrlParams, stripUrlSearchHash, stripUrlParamsFromString, getAbsoluteIRI } from './uri.js'
import { getResourceGraph, getLinkRelation, getAgentName, getGraphImage, getGraphFromData, isActorType, isActorProperty, getGraphLabel, getGraphLabelOrIRI, getGraphConceptLabel, getUserContacts, getAgentInbox, getLinkRelationFromHead, getACLResourceGraph, getAccessSubjects, getAuthorizationsMatching, getGraphDate, getGraphAuthors, getGraphEditors, getGraphContributors, getGraphPerformers, getUserLabelOrIRI, getGraphTypes, filterQuads, serializeData } from './graph.js'
import { notifyInbox, sendNotifications } from './activity.js'
import { uniqueArray, fragmentFromString, generateAttributeId, sortToLower, getDateTimeISO, getDateTimeISOFromMDY, generateUUID, isValidISBN, escapeRDFLiteral, tranformIconstoCSS, getIconsFromCurrentDocument, setDocumentURL } from './util.js'
import { generateGeoView } from './geo.js'
import { getLocalStorageItem, updateLocalStorageProfile, enableAutoSave, disableAutoSave, removeLocalStorageItem } from './storage.js'
import { getSubjectInfo, restoreSession } from './auth.js'
import { hideDocumentMenu, initDocumentMenu } from './menu.js'
import { Icon } from './ui/icons.js'
import * as d3Selection from 'd3-selection';
import * as d3Force from 'd3-force';
const d3 = { ...d3Selection, ...d3Force };
import { diffChars } from 'diff'
import LinkHeader from 'http-link-header';
import rdf from 'rdf-ext';
import Config from './config.js';
import { Editor } from './editor/editor.js';
import { getButtonHTML, updateButtons } from './ui/buttons.js'
import { csvStringToJson, jsonToHtmlTableString } from './csv.js'
import { getMultipleResources } from './fetcher.js'
import { domSanitize } from './utils/sanitization.js'
import { i18n, i18nextInit } from './i18n.js'
import { htmlEncode } from './utils/html.js'
import { init } from './init.js'

const ns = Config.ns;
let DO;

if (typeof window.DO === 'undefined'){

DO = {
  C: Config,

  U: {
    processResources: function(resources, options) {
      if (Array.isArray(resources)) {
        return Promise.resolve(resources);
      }
      else {
        return DO.U.getItemsList(resources, options);
      }
    },
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

    setDocumentMode: async function(mode) {
      Config.Editor.mode = mode || Config.Editor.mode;

      const documentOptions = {
        ...Config.DOMProcessing,
        removeNodesWithSelector: [],
        sanitize: true,
        normalize: true
      };

      const paramStyle = getUrlParams('style');
      const paramOpen = getUrlParams('open');
      const paramAuthor = getUrlParams('author');
      const paramSocial = getUrlParams('social');
      const paramGraph = getUrlParams('graph');
      const paramGraphView = getUrlParams('graph-view');

      if (paramStyle.length) {
        let style = paramStyle[0];
        style = domSanitize(style);
        var title = style.lastIndexOf('/');
        title = (title > -1) ? style.substr(title + 1) : style;

        if (style.startsWith('http')) {
          var pIRI = getProxyableIRI(style);
          var link = '<link class="do" href="' + pIRI + '" media="all" rel="stylesheet" title="' + title + '" />'
          document.querySelector('head').insertAdjacentHTML('beforeend', link);
        }

        stripUrlSearchHash();

        var stylesheets = document.querySelectorAll('head link[rel~="stylesheet"][title]:not([href$="dokieli.css"])');
        DO.U.updateSelectedStylesheets(stylesheets, title);
      }


      if (paramOpen.length) {
        let openResources = paramOpen.map((url) => domSanitize(url));

        if (paramOpen.length > 1) {
          let urlsHtml = openResources.map((url) => `<a href="${url} rel="noopener" target="_blank">${url}</a>`).join(', ');
          var message = `Opening ${urlsHtml}`;
          var actionMessage = `Opening ${urlsHtml}`;

          const messageObject = {
            'content': actionMessage,
            'type': 'info',
            'timer': 10000
          }

          addMessageToLog({...messageObject, content: message}, Config.MessageLog);
          const messageId = showActionMessage(document.body, messageObject);

          let results = await getMultipleResources(openResources, { filename: true })
          const contentTypes = results.map(r => r.type);
          const contentType = contentTypes.includes('text/csv') ? 'text:csv' : 'text/plain';
          const iris = openResources;
          let spawnOptions = {};
          spawnOptions['defaultStylesheet'] = false;
          spawnOptions['init'] = true;

          await spawnDokieli(
            document,
            results,
            contentType,
            iris,
            spawnOptions
          );
        } else {
          open = openResources[0];

          open = domSanitize(open);
          open = decodeURIComponent(open);

          await DO.U.openResource(open);
        }

        if (paramGraphView.length && paramGraphView[0] == 'true') {
          DO.U.showVisualisationGraph(Config.DocumentURL, getDocument(null, documentOptions), '#graph-view');
        }

        // stripUrlSearchHash();
      }

      if (paramGraphView.length && paramGraphView[0] == 'true' && paramOpen.length == 0) {
        DO.U.showVisualisationGraph(Config.DocumentURL, getDocument(null, documentOptions), '#graph-view');
      }

      var urls = paramGraph.map(url => {
        url = domSanitize(url);
        // var iri = decodeURIComponent(g);

        //TODO: Need a way to handle potential proxy use eg. https://dokie.li/?graph=https://dokie.li/proxy?uri=https://example.org/
        //XXX: if iri startsWith https://dokie.li/proxy? then the rest gets chopped.
        // var docURI = iri.split(/[?#]/)[0];

        //XXX: fugly
        // var docURI = iri.split(/[#]/)[0];
        // iri = iri.split('=').pop();

        return stripFragmentFromString(url);
      });
      // console.log(urls);

      if (urls.length) {
        // var options = {'license': 'https://creativecommons.org/publicdomain/zero/1.0/', 'filter': { 'subjects': [docURI, iri] }, 'title': iri };
        var options = {'subjectURI': urls[0], 'license': 'https://creativecommons.org/publicdomain/zero/1.0/', 'title': urls[0] };

        // DO.U.showGraphResources([docURI], '#graph-view', options);
        // console.log(options);

        var anchors = urls.map(url => `<a href="${url}" rel="noopener" target="_blank">${url}</a>`).join(', ');

        var message = `Loading graph(s) ${anchors}`;
        var actionMessage = `<span class="progress">${Icon[".fas.fa-circle-notch.fa-spin.fa-fw"]} Loading graph(s) ${anchors}</span>`;

        const messageObject = {
          'content': actionMessage,
          'type': 'info',
          'timer': 3000
        }

        addMessageToLog({...messageObject, content: message}, Config.MessageLog);
        showActionMessage(document.body, messageObject);

        DO.U.showGraph(urls, '#graph-view', options);

        // stripUrlSearchHash();
      }


      if (paramSocial.length && paramSocial[0] == 'true') {
        Config.Editor.mode = 'social';
        stripUrlSearchHash(['social']);
      }
      else if (paramAuthor.length && paramAuthor[0] == 'true') {
        Config.Editor.mode = 'author';
        stripUrlSearchHash(['author']);
      }
      // else if (paramGraphView.length && paramGraphView[0] == 'true') {
      //   stripUrlSearchHash(['graph-view']);
      // }

      //XXX: This else if works but current document needs to be processed for Config.Resource. See also config.js init and whether non text/html is ever the case (e.g., dokieli in SVG?)
      // else if (Config.Resource[Config.DocumentURL].contentType == 'text/html') {
        var node = selectArticleNode(document);
        var hasContent = hasNonWhitespaceText(node);

        if (!hasContent) {
          Config.Editor.mode = 'author';
          Config.Editor.new = true;
        }
      // }
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

    showAboutDokieli: function(node) {
      if (document.querySelector('#about-dokieli')) { return; }

      const html = `
      <section id="about-dokieli">
        <dl>
          <dt data-i18n="menu.about-dokieli.dt">${i18n.t('menu.about-dokieli.dt.textContent')}</dt>
          <dd data-i18n="menu.about-dokieli.dd"><img alt="" height="16" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAAAn1BMVEUAAAAAjwAAkAAAjwAAjwAAjwAAjwAAjwAAkAAAdwAAjwAAjQAAcAAAjwAAjwAAiQAAjwAAjAAAjwAAjwAAjwAAjwAAkAAAjwAAjwAAjwAAjQAAjQAAhQAAhQAAkAAAkAAAkAAAjgAAjwAAiQAAhAAAkAAAjwAAjwAAkAAAjwAAjgAAjgAAjQAAjwAAjQAAjwAAkAAAjwAAjQAAiwAAkABp3EJyAAAANHRSTlMA+fH89enaabMF4iADxJ4SiSa+uXztyoNvQDcsDgvl3pRiXBcH1M+ppJlWUUpFMq6OdjwbMc1+ZgAABAhJREFUeNrt29nSmkAQBeAGZBMUxH3f993/vP+zJZVKVZKCRhibyc3/XVt6SimYPjPSt28Vmt5W/fu2T/9B9HIf7Tp+0RsgDC6DY6OLvzxJj8341DnsakgZUNUmo2XsORYYS6rOeugukhnyragiq56JIs5UEQ/FXKgidRTzompEKOhG1biioDFV44mCAqrGAQWtqRptA8VMqCpR6zpo9iy84VO1opWHPBZVb9QAzyQN/D1YNungJ+DMSYsbOFvSIwGjR3p0wGiQHkMw2qRHC4w76RGBcSA9NmAcSY8QjAdpYiFbTJoYyNYnTWrI1iFNusj2JE1sZBuQJtyE5pImc3Y21cRhZ1NNtsh2Ik127HCsSY8djjVpINuVhPnjVefobee2adXqu2S/6FyivABDEjQ9Lxo1pDlNd5wg24ikRK5ngKGhHhg1DSgZk4RrD6pa9LlRAnUBfWp6xCe+6EOvOT6yrmrigZaCZHPAp6b0gaiBFKvRd0/D1rr1OrvxDqiyoZmmPt9onib0t/VybyEXqdu0Cw16rUNVAfZFlzdjr5KOaoAUK6JsrgWGQapuBlIS4gy70gEmTrk1fuAgU40UxWXv6wvZAC2Dqfx0BfBK1z1H0aJ0WH7Ub4oG8JDlpBCgK1l5tSjHQSoAf0HVfMqxF+yqpzVk2ZGuAGdk8ijPHZlmpOCg0vh5cgE2JtN3qQSoU3lXpbKlLRegrzTpt+U2TNpKY2YiFiA0kS1Q6QccweZ/oinASm2B3RML0AGDNAU4qq3udmIXYVttD3YrFsBR24N1xG5EJpTeaiYWwILS5WRKBfChFsCSehpOwKi/yS0V4AsMWym3TWUFgMqIsRYL8AVOSDlaYgEitbZnDKll+UatchyJBSC1c3lDuQA2VHYAL3KneHpgLCjHSS7AHYyEciwh1g88wDB94rlyAVxwhsR7ygW4gRMTry8XwDdUDkXFgjVdD5wRsRaCAWJwPGI1Baval8Ie3Hqn8AjjhHbZr2DzrInumDTBGlCG8xy8QPY3MNLX4TiRP1q+BWs2pn9ECwu5+qTABc+80h++28UbTkjlTW3wrM6Ufrtu8d5J9Svg1Vch/RTcUYQdUHm+g1z1x2gSGyjGGVN5F7xjoTCjE0ndC3jJMzfCftmiciZ1lNGe3vCGufOWVMLIQHHehi3X1O8JJxR236SalUzninbu937BlwfV/I3k4KdGk2xm+MHuLa8Z0i9TC280qLRrF+8cw9RSjrOg8oIG8j2YgULsbGPomsgR0x9nsOzkOLh+kZr1owZGbfC2JJl78fIV0Wei/gxZDl85XWVtt++cxhuSEQ6bdfzLjlvM86PbaD4vQUjSglV8385My7CdXtO9+ZSyrLcf7nBN376V8gMpRztyq6RXYQAAAABJRU5ErkJggg==" width="16" /><span data-i18n="menu.about-dokieli.dd.span">${i18n.t("menu.about-dokieli.dd.span.innerHTML")}</span>
        </dl>
      </section>`;

      node.insertAdjacentHTML('beforeend', html);
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

    showViews: function(node) {
      if(document.querySelector('#document-views')) { return; }

      var stylesheets = document.querySelectorAll('head link[rel~="stylesheet"][title]:not([href$="dokieli.css"])');

      var s = `
        <section aria-labelledby="document-views-label" id="document-views" rel="schema:hasPart" resource="#document-views">
          <h2 data-i18n="menu.document-views.h2" id="document-views-label" property="schema:name">${i18n.t('menu.document-views.h2.textContent')}</h2>
          ${Icon[".fas.fa-magic"]}
          <ul>`;

      if (Config.GraphViewerAvailable) {
        s += `<li><button class="resource-visualise" data-i18n="menu.document-views.graph.button" title="${i18n.t('menu.document-views.graph.button.title')}">${i18n.t('menu.document-views.graph.button.textContent')}</button></li>`;
      }

      s += `<li><button data-i18n="menu.document-views.native-style.button"  title="${i18n.t('menu.document-views.native-style.button.title')}">${i18n.t('menu.document-views.native-style.button.textContent')}</button></li>`;

      if (stylesheets.length) {
        for (var i = 0; i < stylesheets.length; i++) {
          var stylesheet = stylesheets[i];
          var view = stylesheet.getAttribute('title');
          if(stylesheet.closest('[rel~="alternate"]')) {
            s += `<li><button data-i18n="menu.document-views.change-style.button" title="${i18n.t('menu.document-views.change-style.button.title', { view })}">${view}</button></li>`;
          }
          else {
            s += `<li><button data-i18n="menu.document-views.current-style.button" disabled="disabled" title="${i18n.t('menu.document-views.current-style.button.title')}">${view}</button></li>`;
          }
        }
      }

      s += '</ul></section>';
      node.insertAdjacentHTML('beforeend', domSanitize(s));

      var viewButtons = document.querySelectorAll('#document-views button:not([class~="resource-visualise"])');
      for (let i = 0; i < viewButtons.length; i++) {
        viewButtons[i].removeEventListener('click', DO.U.initCurrentStylesheet);
        viewButtons[i].addEventListener('click', DO.U.initCurrentStylesheet);
      }

      if(Config.GraphViewerAvailable) {
        document.querySelector('#document-views').addEventListener('click', (e) => {
          if (e.target.closest('.resource-visualise')) {
            if(document.querySelector('#graph-view')) { return; }

            if (e) {
              e.target.disabled = true;
            }

            var buttonClose = getButtonHTML({ key: 'dialog.graph-view.close.button', button: 'close', buttonClass: 'close', iconSize: 'fa-2x' });

            document.body.appendChild(fragmentFromString(`
              <aside aria-labelledby="graph-view-label" class="do on" dir="${Config.User.UI.LanguageDir}" id="graph-view" lang="${Config.User.UI.Language}" rel="schema:hasPart" resource="#graph-view" xml:lang="${Config.User.UI.Language}">
                <h2 data-i18n="dialog.graph-view.h2" id="graph-view-label" property="schema:name">${i18n.t('dialog.graph-view.h2.textContent')} ${Config.Button.Info.GraphView}</h2>
                ${buttonClose}
                <div class="info"></div>
              </aside>
            `));

            var graphView = document.getElementById('graph-view');
            graphView.addEventListener('click', (e) => {
              if (e.target.closest('button.close')) {
                var rv = document.querySelector('#document-views .resource-visualise');
                if (rv) {
                  rv.disabled = false;
                }
              }
            });

            DO.U.showVisualisationGraph(Config.DocumentURL, undefined, '#graph-view');
          }
        });
      }
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

    diffRequirements: function(sourceGraph, targetGraph) {
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

    showDocumentDo: function (node) {
      var d = node.querySelector('#document-do');
      if (d) { return; }

      const documentOptions = {
        ...Config.DOMProcessing,
        format: true,
        sanitize: true,
        normalize: true
      };

      var buttonDisabled = '';

      const buttons = [
        Config.Button.Menu.Share,
        Config.Button.Menu.Reply,
        Config.Button.Menu.Notifications,
        Config.Button.Menu.New,
        Config.Button.Menu.EditEnable,
        Config.Button.Menu.Open,
        Config.Button.Menu.Save,
        Config.Button.Menu.SaveAs,
        Config.Button.Menu.Version,
        Config.Button.Menu.Immutable,
        Config.Button.Menu.Memento,
        Config.Button.Menu.RobustifyLinks,
        Config.Button.Menu.InternetArchive,
        Config.Button.Menu.GenerateFeed,
        Config.Button.Menu.Export,
        Config.Button.Menu.Source,
        Config.Button.Menu.EmbedData,
        Config.Button.Menu.Print,
        Config.Button.Menu.Delete,
        Config.Button.Menu.MessageLog,
        Config.Button.Menu.DocumentInfo
      ]

      var s = `
        <section aria-labelledby="document-do-label" id="document-do" rel="schema:hasPart" resource="#document-do">
          <h2 id="document-do-label" property="schema:name">Do</h2>
          <ul>${buttons.map(b => `<li>${b}</li>`).join('')}</ul>
        </section>`;

      node.insertAdjacentHTML('beforeend', s);

      var dd = document.getElementById('document-do');

      dd.addEventListener('click', e => {
        if (e.target.closest('.resource-share')) {
          DO.U.shareResource(e);
        }

        if (e.target.closest('.resource-reply')) {
          DO.U.replyToResource(e);
        }

        var b;

        b = e.target.closest('button.editor-disable');

        if (b) {
          var node = b.closest('li');
          b.outerHTML = Config.Button.Menu.EditEnable;
          DO.U.hideDocumentMenu();
          Config.Editor.toggleEditor('social');
          // hideAutoSaveStorage(node.querySelector('#autosave-items'), documentURL);

          disableAutoSave(Config.DocumentURL, {'method': 'localStorage', saveSnapshot: true });
        }
        else {
          b = e.target.closest('button.editor-enable');
          if (b) {
            node = b.closest('li');
            b.outerHTML = Config.Button.Menu.EditDisable;
            DO.U.hideDocumentMenu();
            Config.Editor.toggleEditor('author');
            // showAutoSaveStorage(node, documentURL);

            enableAutoSave(Config.DocumentURL, {'method': 'localStorage'});
          }
        }

        if (e.target.closest('.resource-notifications')) {
          DO.U.showNotifications(e);
        }

        if (e.target.closest('.resource-new')) {
          DO.U.createNewDocument(e);
        }

        if (e.target.closest('.resource-open')) {
          DO.U.openDocument(e);
        }

        if (e.target.closest('.resource-source')) {
          DO.U.viewSource(e);
        }

        if (e.target.closest('.embed-data-meta')) {
          DO.U.showEmbedData(e);
        }

        if (e.target.closest('.resource-save')){
          DO.U.resourceSave(e);
        }

        if (e.target.closest('.resource-save-as')) {
          DO.U.saveAsDocument(e);
        }

        if (e.target.closest('.resource-memento')) {
          DO.U.mementoDocument(e);
        }

        if (e.target.closest('.create-version') ||
            e.target.closest('.create-immutable')) {
          DO.U.resourceSave(e);
        }

        if (e.target.closest('.export-as-html')) {
          var options = {
            subjectURI: Config.DocumentURL,
            mediaType: 'text/html',
            filenameExtension: '.html'
          }
          DO.U.exportAsDocument(getDocument(null, documentOptions), options);
        }

        if (e.target.closest('.robustify-links')){
          DO.U.showRobustLinks(e);
        }

        if (e.target.closest('.snapshot-internet-archive')){
          // DO.U.snapshotAtEndpoint(e, Config.DocumentURL, 'https://pragma.archivelab.org/', '', {'contentType': 'application/json'});
          DO.U.snapshotAtEndpoint(e, Config.DocumentURL, 'https://web.archive.org/save/', '', {'Accept': '*/*', 'showActionMessage': true });
        }

        if (e.target.closest('.generate-feed')) {
          DO.U.generateFeed(e);
        }

        if (e.target.closest('.resource-print')) {
          window.print();
          return false;
        }

        if (e.target.closest('.resource-delete')){
          DO.U.resourceDelete(e, Config.DocumentURL);
        }

        if (e.target.closest('.message-log')) {
          DO.U.showMessageLog(e);
        }

        if (e.target.closest('.document-info')) {
          DO.U.showDocumentInfo(e);
        }
      });
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

    replyToResource: function replyToResource (e, iri) {
      iri = iri || currentLocation()

      const documentOptions = {
        ...Config.DOMProcessing,
        format: true,
        sanitize: true,
        normalize: true
      };

      e.target.closest('button').disabled = true

      var buttonClose = getButtonHTML({ key: 'dialog.reply-to-resource.close.button', button: 'close', buttonClass: 'close', iconSize: 'fa-2x' });

      document.body.appendChild(fragmentFromString(`
        <aside aria-labelledby="reply-to-resource-label" class="do on" dir="${Config.User.UI.LanguageDir}" id="reply-to-resource" lang="${Config.User.UI.Language}" rel="schema:hasPart" resource="#reply-to-resource" xml:lang="${Config.User.UI.Language}">
          <h2 data-i18n="dialog.reply-to-resource.h2" id="reply-to-resource-label" property="schema:name">${i18n.t('dialog.reply-to-resource.h2.textContent')} ${Config.Button.Info.Reply}</h2>
          ${buttonClose}
          <div class="info"></div>
          <div id="reply-to-resource-input">
            <p data-i18n="dialog.reply-to-resource-input.p" data-i18n-iri="${iri}">${i18n.t('dialog.reply-to-resource-input.p.innerHTML', { url: iri })}</p>
            <ul>
              <li>
                <p><label data-i18n="dialog.reply-to-resource-note.label" for="reply-to-resource-note">${i18n.t('dialog.reply-to-resource-note.label.textContent')}</label></p>
                <p><textarea cols="40" data-i18n="dialog.reply-to-resource-note.textarea" dir="auto" id="reply-to-resource-note" rows="10" name="reply-to-resource-note" placeholder="${i18n.t('dialog.reply-to-resource-note.textarea.placeholder')}"></textarea></p>
              </li>
              <li>
                <label data-i18n="language.label" for="reply-to-resource-language">${i18n.t('language.label.textContent')}</label> <select id="reply-to-resource-language" name="reply-to-resource-language">${getLanguageOptionsHTML()}</select></li>
              <li>
                <label data-i18n="license.label" for="reply-to-resource-license">${i18n.t('license.label.textContent')}</label> <select id="reply-to-resource-license" name="reply-to-resource-license">${getLicenseOptionsHTML()}</select>
              </li>
            </ul>
          </div>
        </aside>
      `))

      // TODO: License
      // TODO: ACL - can choose whether to make this reply private (to self), visible only to article author(s), visible to own contacts, public
      // TODO: Show name and face of signed in user reply is from, or 'anon' if article can host replies

      var replyToResource = document.getElementById('reply-to-resource')

      var id = 'location-reply-to'
      var action = 'write'
      var note;
      var noteIRI;

      DO.U.setupResourceBrowser(replyToResource, id, action)
      document.getElementById(id).insertAdjacentHTML('afterbegin', `<p data-i18n="dialog.reply-to-resource.save-location-choose.p">${i18n.t('dialog.reply-to-resource.save-location-choose.p.textContent')}</p>`)

      replyToResource.insertAdjacentHTML('beforeend', `<p data-i18n="dialog.reply-to-resource.save-location.p">${i18n.t('dialog.reply-to-resource.save-location.p.textContent')} <samp id="${id}-${action}"></samp></p>`)

      var bli = document.getElementById(id + '-input')
      bli.focus()
      bli.placeholder = 'https://example.org/path/to/article'
      replyToResource.insertAdjacentHTML('beforeend', `<button class="reply" data-i18n="dialog.reply-to-resource.submit.button" title="${i18n.t('dialog.reply-to-resource.submit.button.title')}" type="submit">${i18n.t('dialog.reply-to-resource.submit.button.textContent')}</button>`)

      replyToResource.addEventListener('click', e => {
        if (e.target.closest('button.close')) {
          document.querySelector('#document-do .resource-reply').disabled = false
        }

        if (e.target.closest('button.reply')) {
          note = document
            .querySelector('#reply-to-resource #reply-to-resource-note')
            .value.trim()

          var rm = replyToResource.querySelector('.response-message')
          if (rm) {
            rm.parentNode.removeChild(rm)
          }
          replyToResource.insertAdjacentHTML('beforeend', '<div class="response-message"></div>')

          noteIRI = document.querySelector('#reply-to-resource #' + id + '-' + action).innerText.trim();

          try {
            noteIRI = noteIRI && noteIRI.length ? new URL(noteIRI).href : noteIRI;
          } catch (e) {
            noteIRI = noteIRI; // Keep the original value if it's not a valid URL
          }

          // TODO: this needs to be form validation instead
          if (!note || !noteIRI) {
            document.querySelector('#reply-to-resource .response-message')
              .setHTMLUnsafe(domSanitize(`<p class="error" data-i18n="dialog.reply-to-resource.error.missing-note-or-location.p">${i18n.t("dialog.reply-to-resource.error.missing-note-or-location.p.textContent")}</p>`));
            return;
          }

          sendReply();
        }
      })

      function sendReply() {
        var datetime = getDateTimeISO()
        var attributeId = generateAttributeId()

        var motivatedBy = "oa:replying"
        var noteData = {
          "type": 'comment',
          "mode": "write",
          "motivatedByIRI": motivatedBy,
          "id": attributeId,
          // "iri": noteIRI, //e.g., https://example.org/path/to/article
          "creator": {},
          "datetime": datetime,
          "target": {
            "iri": iri
          },
          "body": [{ "value": note }],
        }
        if (Config.User.IRI) {
          noteData.creator["iri"] = Config.User.IRI
        }
        if (Config.User.Name) {
          noteData.creator["name"] = Config.User.Name
        }
        if (Config.User.Image) {
          noteData.creator["image"] = Config.User.Image
        }
        if (Config.User.URL) {
          noteData.creator["url"] = Config.User.URL
        }

        var language = document.querySelector('#reply-to-resource-language')
        if (language && language.length) {
          noteData["language"] = language.value.trim()
          noteData["body"]["language"] = noteData["language"];
        }

        var license = document.querySelector('#reply-to-resource-license')
        if (license && license.length) {
          noteData["license"] = license.value.trim()
          noteData["body"]["rights"] = noteData["body"]["license"] = noteData["rights"] = noteData["license"];
        }

        note = createNoteDataHTML(noteData)

        var data = createHTML('', note)

        putResource(noteIRI, data)
          .catch(error => {
            console.log('Could not save reply:')
            console.error(error)

            let message;
            let errorKey = 'default';

            switch (error.status) {
              case 0:
              case 405:
                errorKey = 'unwritable-location';
                break
              case 401:
                errorKey = 'unauthorized';
                if(!Config.User.IRI){
                  errorKey = 'unauthenticated';
                }
                break;
              case 403:
                errorKey = 'forbidden';
                break
              case 406:
                errorKey = 'unacceptable';
                break
              default:
                // some other reason
                break
            }

            message = `<span data-i18n="dialog.reply-to-resource.error.${errorKey}.p">${i18n.t(`dialog.reply-to-resource.error.${errorKey}.p.textContent`)}</span>`;

            // re-throw, to break out of the promise chain
            
            throw new Error('Cannot save your reply: ', i18n.t(`dialog.reply-to-resource.error.${errorKey}.p.textContent`));
          })

          .then(response => {
            replyToResource
              .querySelector('.response-message')
              .setHTMLUnsafe(domSanitize(`<p class="success" data-i18n="dialog.reply-to-resource.success.saved-at.p"><span>${i18n.t('dialog.reply-to-resource.success.saved-at.p.textContent')}</span> <a href="${response.url}" rel="noopener" target="_blank">${response.url}</a></p>`));

            return getLinkRelation(ns.ldp.inbox.value, null, getDocument(null, documentOptions));
          })

          .then(inboxes => {
            if (!inboxes) {
              throw new Error('Inbox is empty or missing')
            }

            var inboxURL = inboxes[0]

            //TODO-i18n
            let notificationStatements = '    <dl about="' + noteIRI +
              '">\n<dt>Object type</dt><dd><a about="' +
              noteIRI + '" typeof="oa:Annotation" href="' +
              ns.oa.Annotation.value +
              '">Annotation</a></dd>\n<dt>Motivation</dt><dd><a href="' +
              Config.Prefixes[motivatedBy.split(':')[0]] +
              motivatedBy.split(':')[1] + '" property="oa:motivation">' +
              motivatedBy.split(':')[1] + '</a></dd>\n</dl>\n'

            let notificationData = {
              "type": ['as:Announce'],
              "inbox": inboxURL,
              "object": noteIRI,
              "target": iri,
              "license": noteData.license,
              "statements": notificationStatements
            }

            return notifyInbox(notificationData)
              .catch(error => {
                console.error('Failed sending notification to ' + inboxURL + ' :', error)

                throw new Error('Failed sending notification to author inbox')
              })
          })

          .then(response => {  // Success!
            var notificationSent = i18n.t('dialog.reply-to-resource.success.notification-sent.p.textContent');
            var location = response.headers.get('Location')
            var notificationLink = '';

            if (location) {
              let locationUrl = getAbsoluteIRI(response.url, location.trim());
              notificationLink = `<a href="${locationUrl}" rel="noopener" "target="_blank">${locationUrl}</a>`;
            }
            // else {
            //   notificationSent = notificationSent + ", but location unknown."
            // }

            var responseMessage = replyToResource.querySelector('.response-message');
            responseMessage.setHTMLUnsafe(domSanitize(responseMessage.getHTML() + `<p class="success" data-i18n="dialog.reply-to-resource.success.notification-sent.p"><span>${notificationSent}</span> ${notificationLink}</p>`));
          })

          //TODO-i18n
          .catch(error => {
            // Catch-all error, actually notify the user
            var responseMessage = replyToResource.querySelector('.response-message');
            responseMessage.setHTMLUnsafe(domSanitize(responseMessage.getHTML() + `<p class="error"><span data-i18n="dialog.reply-to-resource.error.save-error.span">${i18n.t('dialog.reply-to-resource.error.save-error.span.textContent')} </span> ${error.message}</p>`));
          })
      }
    },

    shareResource: function(listenerEvent, iri) {
      if (document.querySelector('#share-resource.do.on')) { return; }

      iri = iri || currentLocation();
      const documentURL = stripFragmentFromString(iri);

      var button = listenerEvent.target.closest('button');
      if (button) {
        button.disabled = true;
      }

      var shareResourceLinkedResearch = '';
      if (Config.User.IRI && Config.OriginalResourceInfo['rdftype'] && Config.OriginalResourceInfo.rdftype.includes(ns.schema.ScholarlyArticle.value) || Config.OriginalResourceInfo.rdftype.includes(ns.schema.Thesis.value)) {
        shareResourceLinkedResearch = `
          <div id="share-resource-external" rel="schema:hasPart" resource="#share-resource-external">
            <h3 data-i18n="dialog.share-resource-linked-research.h3" property="schema:name">${i18n.t('dialog.share-resource-linked-research.h3.textContent')}</h3>
            <input id="share-resource-linked-research" type="checkbox" value="https://linkedresearch.org/cloud" />
            <label for="share-resource-linked-research"><a href="https://linkedresearch.org/cloud">Linked Open Research Cloud</a></label>
          </div>`;
      }

      var buttonClose = getButtonHTML({ key: 'dialog.share-resource.close.button', button: 'close', buttonClass: 'close', iconSize: 'fa-2x' });

      var shareResourceHTML = `
        <aside aria-labelledby="share-resource-label" class="do on" dir="${Config.User.UI.LanguageDir}" dir="${Config.User.UI.LanguageDir}" id="share-resource" lang="${Config.User.UI.Language}" rel="schema:hasPart" resource="#share-resource" xml:lang="${Config.User.UI.Language}">
          <h2 data-i18n="dialog.share.h2" id="share-resource-label" property="schema:name">${i18n.t('dialog.share.h2.textContent')} ${Config.Button.Info.Share}</h2>

          ${buttonClose}

          <div class="info"></div>

          <div id="share-resource-share-url" rel="schema:hasPart" resource="#share-resource-share-url">
            <h3 data-i18n="dialog.share-resource-share-url.h3" property="schema:name">${i18n.t('dialog.share-resource-share-url.h3.textContent')}</h3>

            <label data-i18n="dialog.share-resource-clipboard.label" for="share-resource-clipboard">${i18n.t('dialog.share-resource-clipboard.label.textContent')}</label>
            <input dir="ltr" id="share-resource-clipboard" name="share-resource-clipboard" readonly="readonly" type="url" value="${iri}" />
            ${Config.Button.Clipboard}
          </div>

          ${shareResourceLinkedResearch}

          <div id="share-resource-agents" rel="schema:hasPart" resource="#share-resource-agents">
            <h3 data-i18n="dialog.share-resource-agents.h3" property="schema:name">${i18n.t('dialog.share-resource-agents.h3.textContent')}</h3>

            <ul>
              <li id="share-resource-address-book">
              </li>
            </ul>

            <label data-i18n="dialog.share-resource-note.label" for="share-resource-note">${i18n.t('dialog.share-resource-note.label.textContent')}</label>
            <textarea data-i18n="dialog.share-resource-note.textarea" dir="auto" id="share-resource-note" rows="3" cols="40" name="share-resource-note" placeholder="${i18n.t('dialog.share-resource-note.textarea.placeholder')}"></textarea>

            <button class="share" data-i18n="dialog.share-resource-agents.button" id="share-resource-agents-button" title="${i18n.t('dialog.share-resource-agents.button.title')}" type="submit">${i18n.t('dialog.share-resource-agents.button.textContent')}</button>
          </div>
        </aside>
      `;

      document.body.appendChild(fragmentFromString(shareResourceHTML));

      var clipboardInput = document.querySelector('#share-resource-clipboard');
      var clipboardButton = document.querySelector('#share-resource-clipboard + button.copy-to-clipboard');
      setCopyToClipboard(clipboardInput, clipboardButton);

      clipboardInput.addEventListener('focus', e => {
        var input = e.target.closest('input');
        if (input) {
          input.selectionStart = 0;
          input.selectionEnd = input.value.length;
        }
      });

      var li = document.getElementById('share-resource-address-book');
      li.insertAdjacentHTML('beforeend', Icon[".fas.fa-circle-notch.fa-spin.fa-fw"]);

      DO.U.selectContacts(li, Config.User.IRI);

      var hasAccessModeControl = accessModeAllowed(documentURL, 'control');
      if (hasAccessModeControl) {
        var info = document.querySelector('#share-resource > .info');

        var shareResourcePermissions = `
          <div id="share-resource-permissions" rel="schema:hasPart" resource="#share-resource-permissions">
            <h3 data-i18n="dialog.share-resource-permissions.h3" property="schema:name">${i18n.t('dialog.share-resource-permissions.h3.textContent')}</h3>

            <span class="progress" data-i18n="dialog.share-resource-permissions.progress">${Icon[".fas.fa-circle-notch.fa-spin.fa-fw"]} ${i18n.t('dialog.share-resource-permissions.progress.textContent')}</span>

            <ul class="permissions">
            </ul>

            <div class="autocomplete">
              <label data-i18n="dialog.share-resource-search-contacts.label" for="share-resource-search-contacts">${i18n.t('dialog.share-resource-search-contacts.label.textContent')}</label>
              <input data-i18n="dialog.share-resource-search-contacts.input" id="share-resource-search-contacts" name="share-resource-search-contacts" placeholder="${i18n.t('dialog.share-resource-search-contacts.input.placeholder')}" type="text" value="" />
              <ul class="suggestions">
              </ul>
            </div>
          </div>`;
        info.insertAdjacentHTML('afterend', shareResourcePermissions);

        var accessPermissionsNode = document.getElementById('share-resource-permissions');
        var accessPermissionFetchingIndicator = accessPermissionsNode.querySelector('.progress');

        getACLResourceGraph(documentURL)
          .catch(e => {
            accessPermissionsNode.removeChild(accessPermissionFetchingIndicator);

            console.log('XXX: Cannot access effectiveACLResource', e);
          })
          .then(aclResourceGraph => {
            accessPermissionsNode.removeChild(accessPermissionFetchingIndicator);

            const { defaultACLResource, effectiveACLResource, effectiveContainer } = Config.Resource[documentURL].acl;
            const hasOwnACLResource = defaultACLResource == effectiveACLResource;

            var matchers = {};

            if (hasOwnACLResource) {
              matchers['accessTo'] = documentURL;
            }
            else {
              matchers['default'] = effectiveContainer;
            }

            var authorizations = getAuthorizationsMatching(aclResourceGraph, matchers);
// console.log(authorizations)
            const subjectsWithAccess = getAccessSubjects(authorizations);
// console.log(subjectsWithAccess)

            const input = document.getElementById('share-resource-search-contacts');
            const suggestions = document.querySelector('#share-resource-permissions .suggestions');

            input.addEventListener('focus', (e) => {
              if (!e.target.value.length) {
                showSuggestions(getFilteredContacts());
              }
            });

            input.addEventListener('input', (e) => {
              const query = e.target.value.trim().toLowerCase();
              showSuggestions(getFilteredContacts(query));
            });

            var getFilteredContacts = function(query = '') {
              const contacts = Object.keys(Config.User.Contacts);
              const subjectsWithAccessKeys = new Set(Object.keys(subjectsWithAccess));

              return contacts.filter(contact => {
                const matchesQuery = (
                  !query.length ||
                  contact.toLowerCase().includes(query) ||
                  Config.User.Contacts[contact].Name?.toLowerCase().includes(query) ||
                  Config.User.Contacts[contact].IRI?.toLowerCase().includes(query) ||
                  Config.User.Contacts[contact].URL?.toLowerCase().includes(query)
                );
// console.log(matchesQuery)
                return !subjectsWithAccessKeys.has(contact) && matchesQuery;
              });
            }

            var showSuggestions = function (filteredContacts) {
              suggestions.replaceChildren();

              filteredContacts.forEach(contact => {
                const suggestion = document.createElement('li');

                var name = Config.User.Contacts[contact].Name || contact;
                var img = Config.User.Contacts[contact].Image;
                if (!(img && img.length)) {
                  img = generateDataURI('image/svg+xml', 'base64', Icon['.fas.fa-user-secret']);
                }
                img = '<img alt="" height="32" src="' + img + '" width="32" />';

                suggestion.insertAdjacentHTML('beforeend', img + '<span title="' + contact + '">' + name + '</span>');

                var ul = document.querySelector('#share-resource-permissions ul');

                suggestion.addEventListener('click', () => {
                  DO.U.addAccessSubjectItem(ul, Config.User.Contacts[contact].Graph, contact);
                  var li = document.getElementById('share-resource-access-subject-' + encodeURIComponent(contact));
                  var options = {};
                  options['accessContext'] = 'Share';
                  options['selectedAccessMode'] = ns.acl.Read.value;
                  DO.U.showAccessModeSelection(li, '', contact, 'agent', options);

                  var select = document.querySelector('[id="' + li.id + '"] select');
                  select.disabled = true;
                  select.insertAdjacentHTML('afterend', `<span class="progress">${Icon[".fas.fa-circle-notch.fa-spin.fa-fw"]}</span>`);

                  DO.U.updateAuthorization(options.accessContext, options.selectedAccessMode, contact, 'agent')
                    .catch(error => {
                      console.log(error)
                    })
                    .then(response => {
                      getACLResourceGraph(documentURL)
                        .catch(g => {
                          DO.U.removeProgressIndicator(select);
                        })
                        .then(g => {
                          DO.U.removeProgressIndicator(select);
                        })
                    });

                  suggestions.replaceChildren();
                  input.value = '';
                });

                suggestions.appendChild(suggestion);
              })
            }


            //Allowing only Share-related access modes.
            var accessContext = Config.AccessContext['Share'];

            const accessContextModes = Object.keys(accessContext);

            var ul = document.querySelector('#share-resource-permissions ul');

            var showPermissions = function(s, accessSubject) {
// console.log(accessSubject)
              if (accessSubject != Config.User.IRI) {
                DO.U.addAccessSubjectItem(ul, s, accessSubject);

                //XXX: Relies on knowledge in addAcessSubjectItem where it inserts li with a particular id
                var li = document.getElementById('share-resource-access-subject-' + encodeURIComponent(accessSubject));

                var verifiedAccessModes = [];

                Object.keys(authorizations).forEach(authorization => {
                  var authorizationModes = authorizations[authorization].mode;
                  if (authorizations[authorization].agent.includes(accessSubject) || authorizations[authorization].agentGroup.includes(accessSubject)) {
                    authorizationModes.forEach(grantedMode => {
                      if (accessContextModes.includes(grantedMode)) {
                        verifiedAccessModes.push(grantedMode);
                      }
                    });
                  }
                })
// console.log(verifiedAccessModes)

                const selectedAccessMode =
                  (verifiedAccessModes.includes(ns.acl.Control.value) && ns.acl.Control.value) ||
                  (verifiedAccessModes.includes(ns.acl.Write.value) && ns.acl.Write.value) ||
                  (verifiedAccessModes.includes(ns.acl.Read.value) && ns.acl.Read.value) ||
                  '';

                var options = options || {};
                options['accessContext'] = 'Share';
                options['selectedAccessMode'] = selectedAccessMode;
// console.log(options)
                DO.U.showAccessModeSelection(li, '', accessSubject, subjectsWithAccess[accessSubject]['subjectType'], options);
              }
            }

            Object.keys(subjectsWithAccess).forEach(accessSubject => {
              if (accessSubject === ns.foaf.Agent.value || accessSubject === Config.User.IRI) {
                return;
              }

              //Gets some information about the accessSubject that can be displayed besides their URI.
              getResourceGraph(accessSubject)
                .catch(e => {
                  showPermissions(null, accessSubject);
                })
                .then(g => {
                  var s;
                  if (g && g.node) {
                    s = g.node(rdf.namedNode(accessSubject));
                  }
                  showPermissions(s, accessSubject);
                })
            })
        });
      }

      var shareResource = document.getElementById('share-resource');

      shareResource.querySelector('#share-resource-note').focus();

      shareResource.addEventListener('click', function (e) {
        if (e.target.closest('button.close')) {
          listenerEvent.target.closest('button').disabled = false;
        }

        if (e.target.closest('button.share')) {
          var tos = [];
          //XXX: This is currently not in the UI. https://github.com/dokieli/dokieli/issues/532
          // var resourceTo = document.querySelector('#share-resource #share-resource-to');
          // if (resourceTo) {
          //   resourceTo = domSanitize(resourceTo.value.trim());
          //   tos = (resourceTo.length) ? resourceTo.split(/\r\n|\r|\n/) : [];
          // }

          var note = document.querySelector('#share-resource #share-resource-note').value.trim();

          var ps = document.querySelectorAll('#share-resource-contacts .progress');
          ps.forEach(p => {
            p.parentNode.removeChild(p);
          });

          var srlr = document.querySelector('#share-resource-linked-research:checked');
          if(srlr) {
            tos.push(srlr.value);
          }

          var srci = document.querySelectorAll('#share-resource-contacts input:checked');
          if (srci.length) {
            for(var i = 0; i < srci.length; i++) {
              tos.push(srci[i].value);
            }
          }

          var rm = shareResource.querySelector('.response-message');
          if (rm) {
            rm.parentNode.removeChild(rm);
          }
          shareResource.insertAdjacentHTML('beforeend', '<div class="response-message"></div>');

          return sendNotifications(tos, note, iri, shareResource)
        }
      });
    },

    //TODO: Revisit this function and addShareResourceContactInput to generalise.
    addAccessSubjectItem: function(node, s, url) {
      var iri = s?.term?.value || url;
      iri = domSanitize(iri);

      var id = encodeURIComponent(iri);
      var name = s ? getAgentName(s) || iri : iri;
      var img = s ? getGraphImage(s) : null;
      if (!(img && img.length)) {
        img = generateDataURI('image/svg+xml', 'base64', Icon['.fas.fa-user-secret']);
      }
      img = '<img alt="" height="32" src="' + img + '" width="32" />';

      var input = '<li id="share-resource-access-subject-' + id + '">' + img + '<a href="' + iri + '" rel="noopener" target="_blank">' + name + '</a></li>';

      node.insertAdjacentHTML('beforeend', input);
    },


    showAccessModeSelection: function(node, id, accessSubject, subjectType, options) {
      id = id || generateAttributeId('select-access-mode-');
      options = options || {};
      options['accessContext'] = options.accessContext || 'Share';
      options['selectedAccessMode'] = options.selectedAccessMode || '';

      const documentURL = currentLocation();

      const selectNode = `<select aria-label="${i18n.t('dialog.share-resource.select-access-mode.select.aria-label')}" data-i18n="dialog.share-resource.select-access-mode.select" id="${id}">${getAccessModeOptionsHTML({'context': options.accessContext, 'selected': options.selectedAccessMode })}</select>`;

      node.insertAdjacentHTML('beforeend', selectNode);

      var select = document.getElementById(id);
      select.addEventListener('change', e => {
        var selectedMode = e.target.value;

        if (Config.AccessContext[options.accessContext][selectedMode] || selectedMode == '') {
          e.target.disabled = true;
          e.target.insertAdjacentHTML('afterend', `<span class="progress">${Icon[".fas.fa-circle-notch.fa-spin.fa-fw"]}</span>`);

          DO.U.updateAuthorization(options.accessContext, selectedMode, accessSubject, subjectType)
            .catch(error => {
              console.log(error);
              DO.U.removeProgressIndicator(e.target);
            })
            .then(response => {
// console.log(response)

              getACLResourceGraph(documentURL)
                .catch(g => {
                  DO.U.removeProgressIndicator(select);
                })
                .then(g => {
                  DO.U.removeProgressIndicator(select);
                })
            });
        }
        else {
          //TODO: Naughty
        }
      });
    },

    removeProgressIndicator(node) {
      var progress = document.querySelector('[id="' + node.id + '"] + .progress');

      node.disabled = false;
      node.parentNode.removeChild(progress);
    },


    updateAuthorization: function(accessContext, selectedMode, accessSubject, subjectType) {
      var documentURL = currentLocation();

      const { defaultACLResource, effectiveACLResource, effectiveContainer } = Config.Resource[documentURL].acl;
      const hasOwnACLResource = defaultACLResource == effectiveACLResource;
      const patchACLResource = defaultACLResource;

      var aclResourceGraph = Config.Resource[effectiveACLResource].graph;

      var matchers = {};

      if (hasOwnACLResource) {
        matchers['accessTo'] = documentURL;
      }
      else {
        matchers['default'] = effectiveContainer;
      }

      var authorizations = getAuthorizationsMatching(aclResourceGraph, matchers);

      var insertGraph = '';
      var deleteGraph = '';
      // var whereGraph = '';
      var authorizationSubject;

      var patches = [];

// console.log(authorizations);
      if (hasOwnACLResource) {
        Object.keys(authorizations).forEach(authorization => {
// console.log(authorizations[authorization], selectedMode, accessSubject, subjectType);
          if (authorizations[authorization][subjectType].includes(accessSubject)) {
            var multipleAccessSubjects = (authorizations[authorization][subjectType].length > 1) ? true : false;
            var deleteAccessObjectProperty = (hasOwnACLResource) ? 'accessTo' : 'default';

            var deleteAccessSubjectProperty = subjectType;
            var deleteAccessSubject = accessSubject;

            var accessModes = authorizations[authorization].mode;
            var deleteAccessModes = '<' + accessModes.join('>, <') + '>';

            if (!multipleAccessSubjects) {
              deleteGraph += `
<${authorization}>
  a acl:Authorization ;
  acl:${deleteAccessObjectProperty} <${documentURL}> ;
  acl:mode ${deleteAccessModes} ;
  acl:${deleteAccessSubjectProperty} <${deleteAccessSubject}> .
`;
            }
            else {
              deleteGraph += `
<${authorization}>
  acl:${deleteAccessSubjectProperty} <${deleteAccessSubject}> .
`;
            }

            patches.push({ 'delete': deleteGraph });
          }
        })

        if (selectedMode.length) {
          authorizationSubject = '#' + generateAttributeId();

          insertGraph += `
  <${authorizationSubject}>
    a acl:Authorization ;
    acl:accessTo <${documentURL}> ;
    acl:mode <${selectedMode}> ;
    acl:${subjectType} <${accessSubject}> .
  `;

          patches.push({ 'insert': insertGraph });
        }
      }
      else {
         
        var updatedAuthorizations = structuredClone(authorizations);
        var authorizationsToDelete = [];

        Object.keys(updatedAuthorizations).forEach(authorization => {
          if (updatedAuthorizations[authorization][subjectType].includes(accessSubject)) {
            var updatedMode;

            if (selectedMode.length) {
              authorizationsToDelete.push(authorization);
            }
            else {
              switch (selectedMode) {
                case ns.acl.Read.value:
                  updatedMode = [ns.acl.Read.value];
                  break;
                case ns.acl.Write.value:
                  updatedMode = [ns.acl.Read.value, ns.acl.Write.value];
                  break;
                case ns.acl.Control.value:
                  updatedMode = [ns.acl.Read.value, ns.acl.Write.value, ns.acl.Control.value];
                  break;
              }

              updatedAuthorizations[authorization].mode = updatedMode;
            }
          }
        });

        authorizationsToDelete.forEach(authorization => {
          delete updatedAuthorizations[authorization];
        });

        //XXX: updatedAuthorizations may have different authorization objects with the same properties and values. This is essentially just duplicate authorization rules.

        insertGraph = '';
        Object.keys(updatedAuthorizations).forEach(authorization => {
          authorizationSubject = '#' + generateAttributeId();

          var additionalProperties = [];
          ['agent', 'agentClass', 'agentGroup', 'origin'].forEach(key => {
            if (updatedAuthorizations[authorization][key] && updatedAuthorizations[authorization][key].length) {
              additionalProperties.push(`  acl:${key} <${updatedAuthorizations[authorization][key].join('>, <')}>`);
            }
          })
          additionalProperties = additionalProperties.join(';\n');

          insertGraph += `
<${authorizationSubject}>
  a acl:Authorization ;
  acl:accessTo <${documentURL}> ;
  acl:mode <${updatedAuthorizations[authorization].mode.join('>, <')}> ;
  ${additionalProperties} .
`;
        });

        patches.push({ 'insert': insertGraph });
      }

      if (!patches.length) {
        throw new Error("Check why the patch payload wasn't constructed in updateAuthorization." + patches);
      }
      else {
        return patchResourceWithAcceptPatch(patchACLResource, patches);
      }
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

    nextLevelButton: function(button, url, id, action) {
      url = domSanitize(url);
      id = domSanitize(id);
      action = domSanitize(action);

      //Action is for features that need to show a samp URL, e.g., save as URL (before submitting). The open feature doesn't have samp.
      var actionNode = document.getElementById(id + '-' + action);

      //TODO: Some refactoring needed because it is radio only. For now this function is not called for inputType=checkbox
      var inputType = (id == 'location-generate-feed') ? 'checkbox' : 'radio';

      button.addEventListener('click', () => {
        if(button.parentNode.classList.contains('container')){
          var headers;
          headers = {'Accept': 'text/turtle, application/ld+json'};
          getResourceGraph(url, headers).then(g => {
              if (actionNode) {
                actionNode.textContent = (action == 'write') ? url + generateAttributeId() : url;
              }
              return DO.U.generateBrowserList(g, url, id, action);
            },
            function(reason){
              var node = document.getElementById(id);

              DO.U.showErrorResponseMessage(node, reason.response);
            }
          );
        }
        else {
          document.getElementById(id + '-input').value = url;
          var alreadyChecked = button.parentNode.querySelector('input[type="radio"]').checked;
          var radios = button.parentNode.parentNode.querySelectorAll('input[checked="true"]');

          if (actionNode) {
            actionNode.textContent =  url;
          }

          for(var i = 0; i < radios.length; i++){
            radios[i].removeAttribute('checked');
          }
          if(alreadyChecked){
            button.parentNode.querySelector('input[type="radio"]').removeAttribute('checked');
          }
          else{
            button.parentNode.querySelector('input[type="radio"]').setAttribute('checked', 'true');
          }
        }
      }, false);
    },

    generateBrowserList: function(g, url, id, action) {
      //TODO: This should be part of refactoring.
      var inputType = (id == 'location-generate-feed') ? 'checkbox' : 'radio';

      document.getElementById(id + '-input').value = url;

      return new Promise((resolve, reject) => {
        var msgs = document.getElementById(id).querySelectorAll('.response-message');

        for(var i = 0; i < msgs.length; i++){
          msgs[i].parentNode.removeChild(msgs[i]);
        }

        //TODO: Perhaps this should be handled outside of generateBrowserList?
        var createContainer = document.getElementById(id + '-create-container');
        if (createContainer) {
          createContainer.replaceChildren();
        }

        var list = document.getElementById(id + '-ul');
        list.replaceChildren();

        var urlPath = url.split("/");
        if (urlPath.length > 4){ // This means it's not the base URL
          urlPath.splice(-2,2);
          var prevUrl = forceTrailingSlash(urlPath.join("/"));
          var upBtn = '<li class="container"><input type="radio" name="containers" value="' + prevUrl + '" id="' + prevUrl + '" /><label for="' + prevUrl + '" id="browser-up">..</label></li>';
          list.insertAdjacentHTML('afterbegin', upBtn);
        }

        var current = g.node(rdf.namedNode(url));
        var contains = current.out(ns.ldp.contains).values;
        var containersLi = Array();
        var resourcesLi = Array();
        contains.forEach(c => {
          var cg = g.node(rdf.namedNode(c));
          var resourceTypes = getGraphTypes(cg);
 
          var path = c.split("/");
          if (resourceTypes.includes(ns.ldp.Container.value) || resourceTypes.includes(ns.ldp.BasicContainer.value)){
            var slug = path[path.length-2];
            containersLi.push('<li class="container"><input type="radio" name="resources" value="' + c + '" id="' + slug + '"/><label for="' + slug + '">' + decodeURIComponent(slug) + '</label></li>');
          }
          else {
            slug = path[path.length-1];
            resourcesLi.push('<li><input type="' + inputType + '" name="resources" value="' + c + '" id="' + slug + '"/><label for="' + slug + '">' + decodeURIComponent(slug) + '</label></li>');
          }

        });
        containersLi.sort(function (a, b) {
          return a.toLowerCase().localeCompare(b.toLowerCase());
        });
        resourcesLi.sort(function (a, b) {
          return a.toLowerCase().localeCompare(b.toLowerCase());
        });
        var liHTML = containersLi.join('\n') + resourcesLi.join('\n');
        list.insertAdjacentHTML('beforeend', liHTML);

        var buttons = list.querySelectorAll('label');
        if(buttons.length <= 1){
          list.insertAdjacentHTML('beforeend', '<p><em>(empty)</em></p>');
        }

        for(let i = 0; i < buttons.length; i++) {
          var buttonParent = buttons[i].parentNode;
          var buttonInput = buttonParent.querySelector('input');

          //TODO: Find a better way than checking specific ids.
          if (!(id == 'location-generate-feed' && !buttonParent.classList.contains('container'))) {
            var nextUrl = buttonInput.value;
            DO.U.nextLevelButton(buttons[i], nextUrl, id, action);
          }
        }

        return resolve(list);
      });
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

    showStorageDescription: function(s, id, storageUrl, checkAgain) {
      var samp = document.getElementById(id + '-samp');
      var sD = document.getElementById(id + '-storage-description');

      if (samp && !sD) {
        var sDPromise = getLinkRelation(ns.solid.storageDescription.value, storageUrl);

        return sDPromise
          .then(sDURLs => {
            // TODO: resourceIRI for getLinkRelation should be the
            // closest IRI (not necessarily the document).

            if (sDURLs.length) {
              ///TODO: Handle multiple storage descriptions?
              var sDURL = sDURLs[0];
              Config.Storages = Config.Storages || {};
              Config.Storages[s.term.value] = {
                "storageDescription": sDURL
              };
            }
            if (sD) {
              sD.replaceChildren();
            }
            const details = document.getElementById(`${id}-storage-description-details`);
            if (details) {
              details.remove();
            }
            samp.insertAdjacentHTML('afterend', `<details id="${id}-storage-description-details"><summary data-i18n="dialog.storage-details.summary">${i18n.t('dialog.storage-details.summary.textContent')}</summary></details>`);

            sD = document.getElementById(id + '-storage-description-details');

            sD.addEventListener('click', (e) => {
              if (!sD.open) {
                var storageDescriptionNode = document.getElementById(id + '-storage-description');

                if (!storageDescriptionNode) {
                  var storageLocation = `<dl id="storage-location"><dt data-i18n="dialog.storage-location.dt">${i18n.t('dialog.storage-location.dt.textContent')}</dt><dd><a href="${storageUrl}" rel="noopener" target="_blank">${storageUrl}</a></dd></dl>`;

                  getResourceGraph(sDURL).then(g => {
                    if (g) {
                      var primaryTopic = g.out(ns.foaf.primaryTopic).values;
                      g = (primaryTopic.length) ? g.node(rdf.namedNode(primaryTopic[0])) : g.node(rdf.namedNode(storageUrl));

                      var selfDescription = DO.U.getStorageSelfDescription(g);
                      var contactInformation = DO.U.getContactInformation(g);
                      var persistencePolicy = DO.U.getPersistencePolicy(g);
                      var odrlPolicies = DO.U.getODRLPolicies(g);
                      var communicationOptions = DO.U.getCommunicationOptions(g);

                      sD.insertAdjacentHTML('beforeend', domSanitize('<div id="' + id + '-storage-description">' + storageLocation + selfDescription + contactInformation + persistencePolicy + odrlPolicies + communicationOptions + '</div>'));

                      var subscriptionsId = id + '-storage-description-details';
                      var topicResource = s.term.value;

                      var nodes = document.querySelectorAll('[id="' + id + '-storage-description"] [id^="notification-subscriptions-"]');
                      DO.U.buttonSubscribeNotificationChannel(nodes, topicResource);
                    }
                    else {
                      // TODO: var status = (g.status) ? g.status
                      sD.insertAdjacentHTML('beforeend', '<div id="' + id + '-storage-description">Unavailable</div>');
                    }
                  });
                }
              }
            });

// console.log(Config.Resource);
          })
          .catch(error => {
            // console.log('Error fetching solid:storageDescription endpoint:', error)
            // throw error
          });
      }
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

    //TODO: Refactor, especially buttons.
    initBrowse: function(baseUrl, input, browseButton, createButton, id, action){
      input.value = baseUrl;
      var headers = {'Accept': 'text/turtle, application/ld+json'};
      getResourceGraph(baseUrl, headers)
        .then(g => {
          DO.U.generateBrowserList(g, baseUrl, id, action)
            .then(i => {
              DO.U.showStorageDescription(g, id, baseUrl);
            })
        })
        .then(i => {
          let sampNode = document.getElementById(id + '-' + action);
          if (sampNode) {
            sampNode.textContent = (action == 'write') ? input.value + generateAttributeId() : input.value;
          }
        });



      if (Config['Session']?.isActive) {
        createButton.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();

          DO.U.showCreateContainer(input.value, id, action, e);
        }, false);
      }
    },

    triggerBrowse: function(url, id, action){
      var inputBox = document.getElementById(id);
      if (url.length > 10 && url.match(/^https?:\/\//g) && url.slice(-1) == "/"){
// console.log(url)
        var headers;
        headers = {'Accept': 'text/turtle, application/ld+json'};
        getResourceGraph(url, headers).then(g => {
          DO.U.generateBrowserList(g, url, id, action).then(l => {
            DO.U.showStorageDescription(g, id, url);
            return l;
          },
          function(reason){
            console.log('???? ' + reason); // Probably no reason for it to get to here
          });
        },
        function(reason){
          var node = document.getElementById(id + '-ul');

          DO.U.showErrorResponseMessage(node, reason.response);
        });
      }
      else{
        inputBox.insertAdjacentHTML('beforeend', `<div class="response-message"><p class="error" data-i18n="browser.error.invalid-location.p">${i18n.t('browser.error.invalid-location.p.textContent')}</p></div>`);
      }
    },

    showCreateContainer: function(baseURL, id, action, e) {
      //FIXME: Do these checks for now until showCreateContainer is refactored
      if (!e) {
        return;
      }
      id = id || generateUUID();

      var div = document.getElementById(id + '-create-container');
      if (div) {
        div.replaceChildren();
      }

      div.insertAdjacentHTML('beforeend', `<label data-18n="browser.create-container-name.label" for="${id}-create-container-name">${i18n.t('browser.create-container-name.label.textContent')}</label> <input data-i18n="browser.create-container-name.input" dir="auto" id="${id}-create-container-name" name="${id}-create-container-name" type="text" placeholder="${i18n.t('browser.create-container-name.input.placeholder')}" /> <button class="insert" data-i18n="browser.create-container-name.button" disabled="disabled" title="${i18n.t('browser.create-container-name.button.title')}" type="button">${i18n.t('browser.create-container-name.button.textContent')}</button>`);

      var label = div.querySelector('label');
      var input = div.querySelector('input');

      var createButton = document.querySelector('#' + id + '-create-container button.insert');

      input.addEventListener('keyup', (e) => {
        var containerLabel = domSanitize(input.value.trim());

        if (containerLabel.length) {
          createButton.removeAttribute('disabled');
        }
        else {
          createButton.disabled = 'disabled';
        }
      });

      createButton.addEventListener('click', (e) => {
        //FIXME: Escaping containerLabel and containerURL (request-target) can be better.

        var patch = {};
        var containerLabel = domSanitize(input.value.trim());
        var insertG = '<> <' + ns.dcterms.title.value +  '> """' + escapeRDFLiteral(containerLabel) + '""" .';
        patch = { 'insert': insertG };

        containerLabel = containerLabel.endsWith('/') ? containerLabel.slice(0, -1) : containerLabel;

        var containerURL = baseURL + encodeURIComponent(containerLabel) + '/';

        var options = { 'headers': { 'If-None-Match': '*' } };

        var node = document.getElementById(id + '-create-container');

        patchResourceWithAcceptPatch(containerURL, patch, options)
          .then(response => {
            DO.U.triggerBrowse(containerURL, id, action);
          })
          .catch(reason => {
            // console.log(reason);

            var main = `      <article about=""><dl id="document-title"><dt>Title</dt><dd property="dcterms:title">${containerLabel}</dd></dl></article>`;

            var o = {
              'omitLang': true,
              'prefixes': {
                'dcterms': 'http://purl.org/dc/terms/'
              }
            }

            var data = createHTML(containerLabel, main, o);

            // console.log(data);

            options.headers['Content-Type'] = 'text/html';

            putResourceWithAcceptPut(containerURL, data, options)
              .then(response => {
                DO.U.triggerBrowse(containerURL, id, action);
              })
              .catch(reason => {
                // console.log(reason)

                DO.U.showErrorResponseMessage(node, reason.response, 'createContainer');
              })
          })
      });
    },

    showErrorResponseMessage(node, response, context) {
      var statusCode = ('status' in response) ? response.status : 0;
      statusCode = (typeof statusCode === 'string') ? parseInt(response.slice(-3)) : statusCode;
      // console.log(statusCode);
      // console.log(response);

      var msgs = node.querySelectorAll('.response-message');
      for(var i = 0; i < msgs.length; i++){
        msgs[i].parentNode.removeChild(msgs[i]);
      }

      var statusText = response.statusText || '';
      //TODO: use Sanitizer API?
      statusText = statusText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

      var msg = '';

      let errorKey = 'default';

      switch(statusCode) {
        default:
          break;
        case 401:
          if (Config.User.IRI) {
            errorKey = 'invalid-credentials';
          } else {
            errorKey = 'unauthenticated';
          }
          break;
        case 403:
          errorKey = 'request-forbidden';
          break;
        case 404:
          errorKey = 'not-found';
          break;
        case 405:
          errorKey = 'request-not-supported';
          break;
        case 409:
          errorKey = 'conflict';
          break;
        case 412:
          errorKey = "precondition-failed";
          switch (context) {
            default:
              break;
            case 'createContainer':
              errorKey = `${errorKey}-create-container-name`;
              break;
          }
      }

      msg = i18n.t(`browser.error.${errorKey}.p.textContent`);

      node.insertAdjacentHTML('beforeend', `<div class="response-message"><p class="error" data-i18n="browser.error.${errorKey}.p">${msg}</p></div>`);
    },

    setupResourceBrowser: function(parent, id, action){
      id = id || 'browser-location';
      id = domSanitize(id);
      action = action || 'write';
      action = domSanitize(action);

      const documentOptions = {
        ...Config.DOMProcessing,
        //sanitize: in this context, seems low risk.
        normalize: true
      };

      var createContainerButton = '';
      var createContainerDiv = '';
      if (Config['Session']?.isActive) {
        createContainerButton = ` <button data-i18n="browser.create-container.button" id="${id}-create-container-button" title="${i18n.t('browser.create-container.button.title')}">${i18n.t('browser.create-container.button.textContent')}</button>`;
        createContainerDiv = `<div id="${id}-create-container"></div>`;
      }

      parent.insertAdjacentHTML('beforeend', `<div id="${id}"><label for="${id}-input">URL</label> <input dir="ltr" id="${id}-input" name="${id}-input" placeholder="https://example.org/path/to/" required="" type="url" /><button data-i18n="browser.browse-location.button" id="${id}-update" disabled="disabled" title="${i18n.t('browser.browse-location.button.textContent')}">${i18n.t('browser.browse-location.button.textContent')}</button>${createContainerButton}</div>${createContainerDiv}<div id="${id}-listing"></div>`);

      // var inputBox = document.getElementById(id);
      var createContainer = document.getElementById(id + '-create-container');
      var createButton = document.getElementById(id + '-create-container-button');
      var storageBox = document.getElementById(id + '-listing');
      var input = document.getElementById(id + '-input');
      var browseButton = document.getElementById(id + '-update');

      input.addEventListener('keyup', (e) => {
        var msgs = document.getElementById(id).querySelectorAll('.response-message');
        for(var i = 0; i < msgs.length; i++){
          msgs[i].parentNode.removeChild(msgs[i]);
        }

        var actionNode = document.getElementById(id + '-' + action);
        if (input.value.length > 10 && input.value.match(/^https?:\/\//g) && input.value.slice(-1) == "/") {
          browseButton.removeAttribute('disabled');
          //TODO: enable button if only agent has write permission?
          // createButton.removeAttribute('disabled');

          if(e.which == 13){
            DO.U.triggerBrowse(input.value, id, action);
          }
          if(actionNode){
            actionNode.textContent = input.value + generateAttributeId();
          }
        }
        else {
          browseButton.disabled = 'disabled';
          //TODO: disable button if only agent has write permission?
          // createButton.disabled = 'disabled';
          if(actionNode) {
            actionNode.textContent = input.value;
          }
        }
      }, false);

      browseButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        DO.U.triggerBrowse(input.value, id, action);
      }, false);

      var browserul = document.getElementById(id + '-ul');
      if(!browserul){
        browserul = document.createElement('ul');
        browserul.id = id + '-ul';

        storageBox.appendChild(browserul);
      }

      var baseUrl;

      // TODO: Show and use storage, outbox, annotationService as opposed to first available.

      if(Config.User.Storage?.length) {
        baseUrl = forceTrailingSlash(Config.User.Storage[0]);
      }
      else if(Config.User.Outbox?.length) {
        baseUrl = forceTrailingSlash(Config.User.Outbox[0]);
      }
      else if(Config.Resource[Config.DocumentURL]?.annotationService?.length) {
        baseUrl = forceTrailingSlash(Config.Resource[Config.DocumentURL].annotationService[0]);
      }


      if(baseUrl){
        DO.U.initBrowse(baseUrl, input, browseButton, createButton, id, action);
      }
      else {
        getLinkRelation(ns.oa.annotationService.value, null, getDocument(null, documentOptions))
          .then((storageUrl) => {
            DO.U.initBrowse(storageUrl[0], input, browseButton, createButton, id, action);
          })
          .catch(() => {
            baseUrl = getBaseURL(Config.DocumentURL);
            DO.U.initBrowse(baseUrl, input, browseButton, createButton, id, action);

            // if (Config['Session']?.isActive) {
            //   //Browsing removes whatever was for create container and restarts browse on new location
            //   browseButton.addEventListener('click', () => {
            //     createContainer.replaceChildren();
            //     DO.U.triggerBrowse(input.value, id, action);
            //   }, false);

            //   //Clicking on create container button shows the input
            //   createButton.addEventListener('click', (e) => {
            //     DO.U.showCreateContainer(input.value, id, action, e);
            //   }, false);
            // }
          })
      }
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

    openDocument: function (e) {
      if(typeof e !== 'undefined') {
        e.target.disabled = true;
      }

      var buttonClose = getButtonHTML({ key: 'dialog.open-document.close', button: 'close', buttonClass: 'close', iconSize: 'fa-2x' });

      document.body.insertAdjacentHTML('beforeend', `
        <aside aria-labelledby="open-document-label" class="do on" dir="${Config.User.UI.LanguageDir}" id="open-document" lang="${Config.User.UI.Language}" rel="schema:hasPart" resource="#open-document" xml:lang="${Config.User.UI.Language}">
          <h2 data-i18n="dialog.open-document.h2" id="open-document-label" property="schema:name">${i18n.t('dialog.open-document.h2.textContent')} ${Config.Button.Info.Open}</h2>
          ${buttonClose}
          <div class="info"></div>
          <p><label data-i18n="dialog.open-document.open-local-file.label" for="open-local-file">${i18n.t('dialog.open-document.open-local-file.label.textContent')}</label> <input type="file" id="open-local-file" name="open-local-file" multiple="" /></p>
        </aside>
      `);

      var id = 'location-open-document';
      var action = 'read';

      var openDocument = document.getElementById('open-document');
      DO.U.setupResourceBrowser(openDocument , id, action);
      var idSamp = (typeof Config.User.Storage == 'undefined') ? '' : '<p><samp id="' + id + '-' + action + '">https://example.org/path/to/article</samp></p>';
      openDocument.insertAdjacentHTML('beforeend', `${idSamp}<button class="open" data-i18n="dialog.open-document.open.button" title="${i18n.t('dialog.open-document.open.button.title')}" type="submit">${i18n.t('dialog.open-document.open.button.textContent')}</button>`);

      openDocument.addEventListener('click', function (e) {
        if (e.target.closest('button.close')) {
          document.querySelector('#document-do .resource-open').disabled = false;
        }

        if (e.target.closest('button.open')) {
          var openDocument = document.getElementById('open-document');
          var rm = openDocument.querySelector('.response-message');
          if (rm) {
            rm.parentNode.removeChild(rm);
          }

          var bli = document.getElementById(id + '-input');
          var iri = bli.value;

          var options = {};

          DO.U.openResource(iri, options);
        }
      });

      openDocument.querySelector('#open-local-file').addEventListener('change', DO.U.openInputFile, false);
    },

    openResource: async function(iri, options) {
      options = options || {};
      var headers = { 'Accept': setAcceptRDFTypes() };
      // var pIRI = getProxyableIRI(iri);
      // if (pIRI.slice(0, 5).toLowerCase() == 'http:') {
      // }

      // options['noCredentials'] = true;

      var handleResource = async function handleResource (iri, headers, options) {
        var message = `Opening <a href="${iri} rel="noopener" target="_blank">${iri}</a>.`;
        var actionMessage = `Opening <a href="${iri}" rel="noopener" target="_blank">${iri}</a>`;

        const messageObject = {
          'content': actionMessage,
          'type': 'info',
          'timer': 10000
        }

        addMessageToLog({...messageObject, content: message}, Config.MessageLog);
        const messageId = showActionMessage(document.body, messageObject);
        let response;
        let error;

        try {
          response = await getResource(iri, headers, options);
        } catch(e) {
          error = e;            
          // console.log(error)
          // console.log(error.status)
          // console.log(error.response)

          //XXX: It was either a CORS related issue or 4xx/5xx.

          document.getElementById(messageId).remove();

          var message = `Unable to open <a href="${iri}" rel="noopener" target="_blank">${iri}</a>.`;
          var actionMessage = `Unable to open <a href="${iri}" rel="noopener" target="_blank">${iri}</a>.`;

          const messageObject = {
            'content': actionMessage,
            'type': 'error',
            'timer': 5000,
            'code': error.status
          }

          addMessageToLog({...messageObject, content: message}, Config.MessageLog);
          showActionMessage(document.body, messageObject);

          throw error
        }

        if (response) {
// console.log(response)
          iri = encodeURI(iri)
          var cT = response.headers.get('Content-Type');
          var options = {};
          options['contentType'] = (cT) ? cT.split(';')[0].toLowerCase().trim() : 'text/turtle';
          options['subjectURI'] = iri;

          let data = await response.text()

          setDocumentURL(iri);
          var documentURL = Config.DocumentURL;
          Config['Resource'][documentURL] = Config['Resource'][documentURL] || {};

          var spawnOptions = {};

          var checkMarkdownInMediaTypes = ['text/markdown', 'text/plain'];
          if  (checkMarkdownInMediaTypes.includes(options['contentType'])) {
            data = parseMarkdown(data, {createDocument: true});
            spawnOptions['defaultStylesheet'] = true;
            //XXX: Perhaps okay for text/markdown but not text/plain?
            options.contentType = 'text/html';
          }

          if (Config.MediaTypes.RDF.includes(options['contentType'])) {
            options['storeHash'] = true;
            getResourceInfo(data, options);
          }

          const o = await DO.U.buildResourceView(data, options)
// console.log(o)
          spawnOptions['defaultStylesheet'] = ('defaultStylesheet' in o) ? o.defaultStylesheet : (('defaultStylesheet' in spawnOptions) ? spawnOptions['defaultStylesheet'] : false);
          spawnOptions['init'] = true;

          var html = await spawnDokieli(document, o.data, o.options['contentType'], o.options['subjectURI'], spawnOptions);
        }
        Config.DocumentAction = 'open';

        var rm = document.querySelector('#document-action-message')
        if (rm) {
          rm.parentNode.removeChild(rm)
        }
        var message = `Opened <a href="${iri}" rel="noopener" target="_blank">${iri}</a>.`;
        message = {
          'content': message,
          'type': 'success',
          'timer': 3000
        }
        addMessageToLog(message, Config.MessageLog);
        showActionMessage(document.body, message);
      }

     await handleResource(iri, headers, options);
    },

    //XXX: Review grapoi
    buildResourceView: function(data, options) {
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

            return DO.U.processResources(options['subjectURI'], options).then(
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
                        var html = DO.U.generateIndexItemHTML(result.value);
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
    },

    generateIndexItemHTML: function(g, options) {
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
    },

    createNewDocument: function(e) {
      DO.U.hideDocumentMenu();

      Config.Editor.toggleEditor('author', { template: 'new' });

      Config.DocumentAction = 'new';

      disableAutoSave(Config.DocumentURL, {'method': 'localStorage'});

      updateButtons();
    },

    saveAsDocument: async function saveAsDocument (e) {
      if (e) {
        e.target.closest('button').disabled = true;
      }

      const documentOptions = {
        ...Config.DOMProcessing,
        format: true,
        sanitize: true,
        normalize: true
      };

      var buttonClose = getButtonHTML({ key: 'dialog.save-as-document.close.button', button: 'close', buttonClass: 'close', iconSize: 'fa-2x' });

      document.body.appendChild(fragmentFromString(`
        <aside aria-labelledby="save-as-document-label" class="do on" dir="${Config.User.UI.LanguageDir}" id="save-as-document" lang="${Config.User.UI.Language}" rel="schema:hasPart" resource="#save-as-document" xml:lang="${Config.User.UI.Language}">
          <h2 data-i18n="dialog.save-as-document.h2" id="save-as-document-label" property="schema:name">${i18n.t('dialog.save-as-document.h2.textContent')} ${Config.Button.Info.SaveAs}</h2>
          ${buttonClose}
          <div class="info"></div>
        </aside>
      `));

      var saveAsDocument = document.getElementById('save-as-document');
      saveAsDocument.addEventListener('click', (e) => {
        if (e.target.closest('button.close')) {
          document.querySelector('#document-do .resource-save-as').disabled = false;
        }
      });

      var fieldset = '';

      var locationInboxId = 'location-inbox';
      var locationInboxAction = 'read';
      saveAsDocument.insertAdjacentHTML('beforeend', `<div><input id="${locationInboxId}-set" name="${locationInboxId}-set" type="checkbox" /> <label data-i18n="dialog.save-as-document.set-inbox.label" for="${locationInboxId}-set">${i18n.t('dialog.save-as-document.set-inbox.label.textContent')}</label></div>`);

      saveAsDocument.addEventListener('click', (e) => {
        if (e.target.closest('input#' + locationInboxId + '-set')) {
          if (e.target.getAttribute('checked')) {
            e.target.removeAttribute('checked');

            fieldset = saveAsDocument.querySelector('#' + locationInboxId + '-fieldset');
            fieldset.parentNode.removeChild(fieldset);
          }
          else {
            e.target.setAttribute('checked', 'checked');

            e.target.nextElementSibling.insertAdjacentHTML('afterend', '<fieldset id="' + locationInboxId + '-fieldset"></fieldset>');
            fieldset = saveAsDocument.querySelector('#' + locationInboxId + '-fieldset');
            DO.U.setupResourceBrowser(fieldset, locationInboxId, locationInboxAction);
            fieldset.insertAdjacentHTML('beforeend', `<p data-i18n="dialog.save-as-document.article-inbox.p">${i18n.t('dialog.save-as-document.article-inbox.p.textContent')} <samp id="${locationInboxId}-${locationInboxAction}"></samp></p>`);
            var lii = document.getElementById(locationInboxId + '-input');
            lii.focus();
            lii.placeholder = 'https://example.org/path/to/inbox/';
          }
        }
      });

      var locationAnnotationServiceId = 'location-annotation-service';
      var locationAnnotationServiceAction = 'read';
      saveAsDocument.insertAdjacentHTML('beforeend', `<div><input id="${locationAnnotationServiceId}-set" name="${locationAnnotationServiceId}-set" type="checkbox" /> <label data-i18n="dialog.save-as-document.set-annotation-service.label" for="${locationAnnotationServiceId}-set">${i18n.t('dialog.save-as-document.set-annotation-service.label.textContent')}</label></div>`);

      saveAsDocument.addEventListener('click', (e) => {
        if (e.target.closest('input#' + locationAnnotationServiceId + '-set')) {
          if (e.target.getAttribute('checked')) {
            e.target.removeAttribute('checked');

            fieldset = saveAsDocument.querySelector('#' + locationAnnotationServiceId + '-fieldset');
            fieldset.parentNode.removeChild(fieldset);
          }
          else {
            e.target.setAttribute('checked', 'checked');

            e.target.nextElementSibling.insertAdjacentHTML('afterend', '<fieldset id="' + locationAnnotationServiceId + '-fieldset"></fieldset>');
            fieldset = saveAsDocument.querySelector('#' + locationAnnotationServiceId + '-fieldset');
            DO.U.setupResourceBrowser(fieldset, locationAnnotationServiceId, locationAnnotationServiceAction);
            fieldset.insertAdjacentHTML('beforeend', `<p data-i18n="dialog.save-as-document.article-annotation-service.p">${i18n.t('dialog.save-as-document.article-annotation-service.p.textContent')} <samp id="${locationAnnotationServiceId}-${locationAnnotationServiceAction}"></samp></p>`);
            var lasi = document.getElementById(locationAnnotationServiceId + '-input');
            lasi.focus();
            lasi.placeholder = 'https://example.org/path/to/annotation/';
          }
        }
      });


      //https://www.w3.org/TR/ATAG20/#gl_b31
      //TODO: Better tracking of fails so that author can correct.
      var img = document.querySelectorAll('img:not(:is(.do *))');
      var imgFailed = [];
      var imgPassed = [];
      var imgCantTell = [];
      var imgTestResult;
      if (img.length == 0) {
        imgTestResult = 'earl:inapplicable';
      }
      else {
        img.forEach(i => {
          if (i.hasAttribute('alt')) {
            if(i.alt.trim() === '') {
              imgCantTell.push(i);
            }
            imgPassed.push(i);
          }
          else {
            imgFailed.push(i);
          }
        });
      }
      var imgAccessibilityReport = [];
      if (imgFailed.length) {
        imgAccessibilityReport.push(`<li data-i18n="dialog.accessibility-report.image-failed.li">${i18n.t('dialog.accessibility-report.image-failed.li.innerHTML')}</li>`);
      }
      if (imgCantTell.length) {
        imgAccessibilityReport.push(`<li data-i18n="dialog.accessibility-report.image-cant-tell.li">${i18n.t('dialog.accessibility-report.image-cant-tell.li.innerHTML')}</li>`);
      }

      var video = document.querySelectorAll('video');
      var videoFailed = [];
      var videoPassed = [];
      var videoCantTell = [];
      var videoTestResult = 'earl:untested';
      if (video.length == 0) {
        videoTestResult = 'earl:inapplicable';
      }
      else {
        video.forEach(i => {
          if (i.querySelector('track') && i.hasAttribute('kind')) {
            videoPassed.push(i);
          }
          else {
            videoFailed.push(i);
          }
        });
      }
      var videoAccessibilityReport = [];
      if (videoFailed.length) {
        videoAccessibilityReport.push(`<li data-i18n="dialog.accessibility-report.video-failed.li">${i18n.t('dialog.accessibility-report.video-failed.li.innerHTML')}</li>`);
      }

      var audio = document.querySelectorAll('audio');
      var audioFailed = [];
      var audioPassed = [];
      var audioCantTell = [];
      var audioTestResult = 'earl:untested';
      if (audio.length == 0) {
        audioTestResult = 'earl:inapplicable';
      }
      else {
        audio.forEach(i => {
          if (i.querySelector('track') && i.hasAttribute('kind')) {
            audioPassed.push(i);
          }
          else {
            audioFailed.push(i);
          }
        });
      }
      var audioAccessibilityReport = [];
      if (audioFailed.length) {
        audioAccessibilityReport.push(`<li> data-i18n="dialog.accessibility-report.audio-failed.li">${i18n.t('dialog.accessibility-report.audio-failed.li.innerHTML')}</li>`);
      }

      var aRWarning = `<p data-i18n="dialog.accessibility-report.warning.p">${i18n.t('dialog.accessibility-report.warning.p.textContent')}</p>`;
      var aRSuccess = `<p data-i18n="dialog.accessibility-report.success.p">${i18n.t('dialog.accessibility-report.success.p.textContent')}</p>`;
      var accessibilityReport = '';
      if (imgAccessibilityReport.length || audioAccessibilityReport.length || videoAccessibilityReport.length) {
        accessibilityReport += aRWarning + '<ul>' + imgAccessibilityReport.join('') + audioAccessibilityReport.join('') + videoAccessibilityReport.join('') + '</ul>';
      }
      else {
        accessibilityReport += aRSuccess;
      }
      accessibilityReport = `<details id="accessibility-report-save-as"><summary data-i18n="dialog.accessibility-report.summary">${i18n.t('dialog.accessibility-report.summary.textContent')}</summary>${accessibilityReport}</details>`;

      let dokielizeResource = '';
      let derivationData = '';
      
      if (!Config.Editor['new']) {
        dokielizeResource = '<li><input type="checkbox" id="dokielize-resource" name="dokielize-resource" /><label for="dokielize-resource">dokielize</label></li>';
        derivationData = `<li><input type="checkbox" id="derivation-data" name="derivation-data" checked="checked" /><label data-i18n="dialog.save-as-document.derivation-data.label" for="derivation-data">${i18n.t('dialog.save-as-document.derivation-data.label.textContent')}</label></li>`;
      }

      var id = 'location-save-as';
      var action = 'write';
      saveAsDocument.insertAdjacentHTML('beforeend', `<form><fieldset id="${id}-fieldset"><legend data-i18n="dialog.save-as-document.save-to.legend">${i18n.t('dialog.save-as-document.save-to.legend.textContent')}</legend></fieldset></form>`);
      fieldset = saveAsDocument.querySelector('fieldset#' + id + '-fieldset');
      DO.U.setupResourceBrowser(fieldset, id, action);
      fieldset.insertAdjacentHTML('beforeend', `<p data-i18n="dialog.save-as-document.save-location.p" id="${id}-samp">${i18n.t('dialog.save-as-document.save-location.p.textContent')} <samp id="${id}-${action}"></samp></p>${DO.U.getBaseURLSelection()}<ul>${dokielizeResource}${derivationData}</ul>${accessibilityReport}<button class="create" data-i18n="dialog.save-as-document.save.button" title="${i18n.t('dialog.save-as-document.save.button.title')}" type="submit">${i18n.t('dialog.save-as-document.save.button.textContent')}</button>`);
      var bli = document.getElementById(id + '-input');
      bli.focus();
      bli.placeholder = 'https://example.org/path/to/article';

      saveAsDocument.addEventListener('click', async (e) => {
        if (!e.target.closest('button.create')) {
          return
        }

        e.preventDefault();
        e.stopPropagation();

        var saveAsDocument = document.getElementById('save-as-document')
        var storageIRI = saveAsDocument.querySelector('#' + id + '-' + action).innerText.trim()

        var rm = saveAsDocument.querySelector('.response-message')
        if (rm) {
          rm.parentNode.removeChild(rm)
        }


        // TODO: this needs to be form validation instead
        if (!storageIRI.length) {
          saveAsDocument.insertAdjacentHTML('beforeend',
            `<div class="response-message"><p class="error" data-i18n="dialog.save-as-document.error.missing-location.p">${i18n.t("dialog.save-as-document.error.missing-location.p.textContent")}</p></div>`
          )

          return
        }

        var html = document.documentElement.cloneNode(true)
        var o, r

        if (!Config.Editor['new']) {
          var dokielize = document.querySelector('#dokielize-resource')
          if (dokielize.checked) {
            html = getDocument(html, documentOptions)
            html = await spawnDokieli(document, html, 'text/html', storageIRI, {'init': false})
          }

          var wasDerived = document.querySelector('#derivation-data')
          if (wasDerived.checked) {
            o = { 'id': 'document-derived-from', 'title': 'Derived From' };
            r = { 'rel': 'prov:wasDerivedFrom', 'href': Config.DocumentURL };
            html = setDocumentRelation(html, [r], o);

            html = setDate(html, { 'id': 'document-derived-on', 'property': 'prov:generatedAtTime' });
            o = { 'id': 'document-identifier', 'title': 'Identifier' };
            r = { 'rel': 'owl:sameAs', 'href': storageIRI };
            html = setDocumentRelation(html, [r], o);
          }
        }

        var inboxLocation = saveAsDocument.querySelector('#' + locationInboxId + '-' + locationInboxAction);
        if (inboxLocation) {
          inboxLocation = inboxLocation.innerText.trim();
          o = { 'id': 'document-inbox', 'title': 'Notifications Inbox' };
          r = { 'rel': 'ldp:inbox', 'href': inboxLocation };
          html = setDocumentRelation(html, [r], o);
        }

        var annotationServiceLocation = saveAsDocument.querySelector('#' + locationAnnotationServiceId + '-' + locationAnnotationServiceAction)
        if (annotationServiceLocation) {
          annotationServiceLocation = annotationServiceLocation.innerText.trim();
          o = { 'id': 'document-annotation-service', 'title': 'Annotation Service' };
          r = { 'rel': 'oa:annotationService', 'href': annotationServiceLocation };
          html = setDocumentRelation(html, [r], o);
        }

        var baseURLSelectionChecked = saveAsDocument.querySelector('select[id="base-url"]');
        let baseURLType;
        if (baseURLSelectionChecked.length) {
          baseURLType = baseURLSelectionChecked.value
          var nodes = html.querySelectorAll('head link, [src], object[data]')
          var base = html.querySelector('head base[href]');
          var baseOptions = {'baseURLType': baseURLType};
          if (base) {
            baseOptions['iri'] = base.href;
          }
          nodes = DO.U.rewriteBaseURL(nodes, baseOptions)
        }

        html = getDocument(html, documentOptions)

        var progress = saveAsDocument.querySelector('progress')
        if(progress) {
          progress.parentNode.removeChild(progress)
        }
        e.target.insertAdjacentHTML('afterend', '<progress min="0" max="100" value="0"></progress>')
        progress = saveAsDocument.querySelector('progress')

        putResource(storageIRI, html, null, null, { 'progress': progress })
          .then(response => {
            progress.parentNode.removeChild(progress)

            if (baseURLType == 'base-url-relative') {
              DO.U.copyRelativeResources(storageIRI, nodes)
            }

            let url = response.url || storageIRI
            url = domSanitize(url);

            saveAsDocument.insertAdjacentHTML('beforeend',
              `<div class="response-message"><p class="success" data-i18n="dialog.save-as-document.success.saved-at.p"><span>${i18n.t('dialog.save-as-document.success.saved-at.p.textContent')}</span> <a href="${url}">${url}</a></p></div>`
            )

            Config.DocumentAction = 'save-as';

            setTimeout(() => {
              if (Config.Editor['new']) {
                //XXX: Commenting this out for now, not sure what this was supposed to fix
                // Config.Editor.replaceContent('author', fragmentFromString(html));
                Config.Editor['new'] = false;
  
                var urlObject = new URL(url);
                var documentURLObject = new URL(Config.DocumentURL);
  
                if (urlObject.origin === documentURLObject.origin) {
                  window.history.pushState({}, null, url);
                  setDocumentURL(url);
                  DO.U.hideDocumentMenu();
                }
                else {
                  window.open(url, '_blank');
                }
              }
              else {
                window.open(url, '_blank');
              }
            }, 3000)
          })

          .catch(error => {
            console.log('Error saving document: ' + error)

            progress.parentNode.removeChild(progress)

            let message

            var requestAccess = '';
            var linkHeaders;
            var inboxURL;
            var link = error?.response?.headers?.get('Link');
            if (link) {
              linkHeaders = LinkHeader.parse(link);
            }

            if (Config.User.IRI && linkHeaders && linkHeaders.has('rel', ns.ldp.inbox.value)){
              inboxURL = linkHeaders.rel(ns.ldp.inbox.value)[0].uri;
              requestAccess = `<p><button class="request-access" data-i18n="dialog.save-as-document.request-access.button" data-inbox="${inboxURL}" data-target="${storageIRI}" title="${i18n.t('dialog.save-as-document.request-access.button.title')}" type="button">${i18n.t('dialog.save-as-document.request-access.button.textContent')}</button></p>`;
            }

            let errorKey = 'default'

            switch (error.status) {
              case 0:
              case 405:
                errorKey = 'unwritable-location';
                break
              case 401:
                errorKey = 'invalid-credentials';
                if(!Config.User.IRI){
                  errorKey = 'unauthenticated';
                }
                break
              case 403:
                errorKey = 'unauthorized';
                break
              case 406:
                errorKey = 'unacceptable';
                break
              default:
                // message = error.message // Could not save
                break
            }

            message = i18n.t(`dialog.save-as-document.error.${errorKey}.p.textContent`);

            //TODO:i18n
            saveAsDocument.insertAdjacentHTML('beforeend', domSanitize(
              `<div class="response-message"><p class="error" data-i18n="dialog.save-as-document.error.${errorKey}.p">${message}</p>${requestAccess}</div>`
            ));

            if (Config.User.IRI && requestAccess) {
              document.querySelector('#save-as-document .response-message .request-access').addEventListener('click', (e) => {
                var objectId = '#' + generateUUID();

                inboxURL = e.target.dataset.inbox;
                var accessTo = e.target.dataset.target;
                var agent = Config.User.IRI;

                e.target.disabled = true;
                var responseMessage = e.target.parentNode;
                responseMessage.insertAdjacentHTML('beforeend', domSanitize(
                  `<span class="progress" data-to="${inboxURL}">${Icon[".fas.fa-circle-notch.fa-spin.fa-fw"]}</span>`
                ))

                var notificationStatements = `<dl about="` + objectId + `" prefix="acl: http://www.w3.org/ns/auth/acl#">
  <dt>Object type</dt><dd><a about="` + objectId + `" href="` + ns.acl.Authorization.value + `" typeof="acl:Authorization">Authorization</a></dd>
  <dt>Agents</dt><dd><a href="` + agent + `" property="acl:agent">` + agent + `</a></dd>
  <dt>Access to</dt><dd><a href="` + accessTo + `" property="acl:accessTo">` + accessTo + `</a></dd>
  <dt>Modes</dt><dd><a href="` + ns.acl.Read.value + `" property="acl:mode">Read</a></dd><dd><a href="` + ns.acl.Write.value + `" property="acl:mode">Write</a></dd>
</dl>
`;

                var notificationData = {
                  "type": ['as:Request'],
                  "inbox": inboxURL,
                  "object": objectId,
                  "statements": notificationStatements
                };

                responseMessage = document.querySelector('#save-as-document .response-message');

                return notifyInbox(notificationData)
                  .catch(error => {
                    console.log('Error notifying the inbox:', error)

                    responseMessage
                      .querySelector('.progress[data-to="' + inboxURL + '"]')
                      .setHTMLUnsafe(domSanitize(`${Icon[".fas.fa-times-circle.fa-fw"]} <span data-i18n="dialog.save-as-document.request-access.not-notified.span">${i18n.t('dialog.save-as-document.request-access.not-notified.span.textContent')}</span>`))
                  })
                  .then(response => {
                    var notificationSent = Icon[".fas.fa-check-circle.fa-fw"];
                    var location = response.headers.get('Location');

                    if (location) {
                      let locationUrl = getAbsoluteIRI(response.url, location.trim());
                      notificationSent = `<a href="${locationUrl}" rel="noopener" "target="_blank">${Icon[".fas.fa-check-circle.fa-fw"]}</a>`;
                    }

                    responseMessage
                      .querySelector('.progress[data-to="' + inboxURL + '"]')
                      .setHTMLUnsafe(domSanitize(notificationSent))
                  })

              })
            }
          })
      })
    },

    viewSource: function(e) {
      if (e) {
        e.target.closest('button').disabled = true;
      }

      const documentOptions = {
        ...Config.DOMProcessing,
        format: true,
        // TODO: Revisit because the user should be informed (show dialog) whether they want to retain or include certain scripts.
        // sanitize: true,
        normalize: true
      };

      var buttonDisabled = (document.location.protocol === 'file:') ? ' disabled="disabled"' : '';

      var buttonClose = getButtonHTML({ key: 'dialog.source-view.close.button', button: 'close', buttonClass: 'close', iconSize: 'fa-2x' });

      document.body.appendChild(fragmentFromString(`
        <aside aria-labelledby="source-view-label" class="do on" dir="${Config.User.UI.LanguageDir}" id="source-view" lang="${Config.User.UI.Language}" rel="schema:hasPart" resource="#source-view" xml:lang="${Config.User.UI.Language}">
          <h2 data-i18n="dialog.source-view.h2" id="source-view-label" property="schema:name">${i18n.t('dialog.source-view.h2.textContent')} ${Config.Button.Info.Source}</h2>
          ${buttonClose}
          <div class="info"></div>
          <textarea dir="ltr id="source-edit" rows="24" cols="80"></textarea>
          <p><button class="update" data-i18n="dialog.source-view.update.button"${buttonDisabled} title="Update source" type="submit">${i18n.t('dialog.source-view.update.button.textContent')}</button></p>
        </aside>
      `));
      var sourceBox = document.getElementById('source-view');
      var input = document.getElementById('source-edit');
      input.value = getDocument(null, documentOptions);

      sourceBox.addEventListener('click', (e) => {
        if (e.target.closest('button.update')) {
          var data = document.getElementById('source-edit').value;
          //FIXME: dokieli related stuff may be getting repainted / updated in the DOM
          document.documentElement.setHTMLUnsafe(domSanitize(data));
          initDocumentMenu();
          DO.U.showDocumentMenu(e);
          DO.U.viewSource();
          document.querySelector('#document-do .resource-source').disabled = true;
        }

        if (e.target.closest('button.close')) {
          document.querySelector('#document-do .resource-source').disabled = false;
        }
      });
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

    getBaseURLSelection: function() {
      return `
        <div id="base-url-selection">
          <label data-i18n="dialog.base-url-selection.label" for="base-url">${i18n.t('dialog.base-url-selection.label.textContent')}</label>
          <select id="base-url">
            <option data-i18n="dialog.base-url-relative.option" id="base-url-relative" value="base-url-relative" selected="selected">${i18n.t('dialog.base-url-relative.option.textContent')}</option>
            <option data-i18n="dialog.base-url-absolute.option" id="base-url-absolute" value="base-url-absolute">${i18n.t('dialog.base-url-absolute.option.textContent')}</option>
          </select>
        </div>
      `;
    },

    rewriteBaseURL: function(nodes, options) {
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
            url = DO.U.setBaseURL(url, options);
          }
          else if (url.startsWith('http:') && node.tagName.toLowerCase()) {
            url = getProxyableIRI(url)
          }
          node.setAttribute(ref, url);
        }
      }

      return nodes;
    },

    setBaseURL: function(url, options) {
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
    },

    generateLabelFromString: function(s) {
      if (typeof s === 'string' && s.length) {
        s = s.replace(/-/g, ' ');
        s = (s !== '.html' && s.endsWith('.html')) ? s.substr(0, s.lastIndexOf('.html')) : s;
        s = (s !== '.' && s.endsWith('.')) ? s.substr(0, s.lastIndexOf('.')) : s;

        s = s.charAt(0).toUpperCase() + s.slice(1);
      }

      return s;
    },

    copyRelativeResources: function copyRelativeResources (storageIRI, relativeNodes) {
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
            pathToFile = DO.U.setBaseURL(fromURL, {'baseURLType': 'base-url-relative'});
            fromURL = document.location.origin + fromURL
            toURL = baseURL + pathToFile
          }
          else {
            pathToFile = DO.U.setBaseURL(fromURL, {'baseURLType': 'base-url-relative'});
            fromURL = getBaseURL(document.location.href) + fromURL
            toURL = baseURL + pathToFile
          }

          copyResource(fromURL, toURL);
        }
      }
    },

    createAttributeDateTime: function(element) {
      //Creates datetime attribute.
      //TODO: Include @data-author for the signed in user e.g., WebID or URL.
      var a = getDateTimeISO();

      switch(element) {
        case 'mark': case 'article':
          a = 'data-datetime="' + a + '"';
          break;
        case 'del': case 'ins':
          a = 'datetime="' + a + '"';
          break;
        default:
          a = '';
          break;
      }

      return a;
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
