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

import shower from '@shower/core';
import Config from './config.js';
const ns = Config.ns;
import { highlightItems, updateSelectedStylesheets, initCurrentStylesheet, showActionMessage, addMessageToLog, initCopyToClipboard, showFragment, setDocRefType, showRobustLinksDecoration, focusNote, showAsTabs, getResourceInfo, setDocumentString } from './doc.js';
import { initButtons } from './ui/buttons.js'
import { setDocumentURL, setWebExtensionURL } from './util.js';
import { getLocalStorageItem } from './storage.js';
import { syncLocalRemoteResource, monitorNetworkStatus, autoSave } from './sync.js';
import { domSanitize, sanitizeInsertAdjacentHTML, sanitizeObject } from './utils/sanitization.js';
import { afterSetUserInfo, setUserInfo } from './auth.js';
import { showNotificationSources } from './activity.js';
import { getProxyableIRI, getUrlParams, stripFragmentFromString, stripUrlSearchHash } from './uri.js';
import { getMultipleResources } from './fetcher.js';
import { initEditor } from './editor/initEditor.js';
import { showGraph, showVisualisationGraph } from './viz.js';
import { openResource, initDocumentMenu, spawnDokieli, showDocumentMenu } from './dialog.js';
import { Icon } from './ui/icons.js';
import { eventButtonClose, eventButtonSignIn, eventButtonSignOut, eventButtonNotificationsToggle, eventButtonInfo } from './events.js';
import { hasNonWhitespaceText, getDocumentContentNode, selectArticleNode } from "./utils/html.js";

export function init (url) {
  initServiceWorker();

  var contentNode = getDocumentContentNode(document);
  if (contentNode) {
    initButtons();
    setDocumentURL(url);
    setWebExtensionURL();
    setDocumentString();
    initUser();
    setDocumentMode();
    initLocalStorage();
    initDocumentActions();
    initDocumentMenu();
    setDocRefType();
    initCurrentStylesheet();
    showFragment();
    initCopyToClipboard();
    initSlideshow();
    initEditor();
    monitorNetworkStatus();
  }
}

function initServiceWorker() {
  if ('serviceWorker' in navigator && !Config.WebExtensionEnabled) {
    navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
      .then(() => {
        console.log('Service Worker registered');
      })
      .catch((err) => {
        console.error('Service Worker registration failed:', err);
      });
  }
}

function initUser() {
  getLocalStorageItem('DO.Config.User').then(user => {
    if (user && 'object' in user) {
      // user.object.describes.Role = (Config.User.IRI && user.object.describes.Role) ? user.object.describes.Role : 'social';

      Config.User = sanitizeObject(user.object.describes);

      if (!Config.User.Graph) {
        setUserInfo(Config.User.IRI)
          .then(afterSetUserInfo);
      }
    }
  })
}

export function initLocalStorage() {
  getLocalStorageItem(Config.DocumentURL).then(collection => {
    if (!collection) {
      autoSave(Config.DocumentURL, { method: 'localStorage' });
    }
    else if (collection.autoSave) {
      Config.AutoSave.Items[Config.DocumentURL] ||= {};
      Config.AutoSave.Items[Config.DocumentURL]['localStorage'] ||= {};
      // Config.AutoSave.Items[Config.DocumentURL]['localStorage']['digestSRI'] = latestLocalDocumentItem.digestSRI;
      Config.AutoSave.Items[Config.DocumentURL]['localStorage']['updated'] = collection.updated;
    }
  });
}

function initDocumentActions() {
  eventButtonClose();
  eventButtonInfo();
  eventButtonSignIn();
  eventButtonSignOut();
  eventButtonNotificationsToggle();
  showRobustLinksDecoration();
  focusNote();
  highlightItems();
  showAsTabs();

  var documentURL = Config.DocumentURL;

  //Fugly
  function checkResourceInfo() {
// console.log(Config.Resource[documentURL])

    if (documentURL in Config.Resource && 'state' in Config.Resource[documentURL]) {
      processPotentialAction(Config.Resource[documentURL]);

      if (Config.Resource[documentURL].inbox?.length && !Config.Inbox[Config.Resource[documentURL].inbox[0]]) {
        showNotificationSources(Config.Resource[documentURL].inbox[0]);
      }
    }
    else {
      //XXX: syncLocalRemoteResource is also eventually calling getResourceInfo through updateResourceInfos (in try)
      getResourceInfo(Config.DocumentString).then(resourceInfo => {
        processPotentialAction(resourceInfo);

        if (Config.Resource[documentURL].inbox?.length && !Config.Inbox[Config.Resource[documentURL].inbox[0]]) {
          showNotificationSources(Config.Resource[documentURL].inbox[0]);
        }
      });

      // var options = { reuse: true };
      // var options = { init: true };
      // var options = {};
      // if (document.location.protocol.startsWith('http')) {
      //   options['followLinkRelationTypes'] = ['describedby'];
      // }

      // getResourceSupplementalInfo(Config.DocumentURL, options).then(resourceInfo => {
      //   updateButtons();

        syncLocalRemoteResource();
      // });

      // window.setTimeout(checkResourceInfo, 100);
    }
  }

  checkResourceInfo();

  processActivateAction();
}

export async function setDocumentMode(mode) {
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
      sanitizeInsertAdjacentHTML(document.querySelector('head'), 'beforeend', link);
    }

    stripUrlSearchHash();

    var stylesheets = document.querySelectorAll('head link[rel~="stylesheet"][title]:not([href$="dokieli.css"])');
    updateSelectedStylesheets(stylesheets, title);
  }

  if (paramOpen.length) {
    let openResources = paramOpen.map((url) => domSanitize(sanitizeIRI(url)));

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

      await openResource(open);
    }

    if (paramGraphView.length && paramGraphView[0] == 'true') {
      showVisualisationGraph(Config.DocumentURL, getDocument(null, documentOptions), '#graph-view');
    }

    // stripUrlSearchHash();
  }

  if (paramGraphView.length && paramGraphView[0] == 'true' && paramOpen.length == 0) {
    showVisualisationGraph(Config.DocumentURL, getDocument(null, documentOptions), '#graph-view');
  }

  var urls = paramGraph.map(url => {
    url = sanitizeIRI(url);
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

    // showGraphResources([docURI], '#graph-view', options);
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

    showGraph(urls, '#graph-view', options);

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
}

function initSlideshow(options) {
  options = options || {};
  options.progress = options.progress || true;

  //TODO: .shower can be anywhere?
  //TODO: check for rdf:type bibo:Slideshow or schema:PresentationDigitalDocument
  if (getDocumentContentNode(document).classList.contains('shower')) {
    //TODO: Check if .shower.list or .shower.full. pick a default in a dokieli or leave default to shower (list)?

    //TODO: Check if .bibo:Slide, and if there is no .slide, add .slide

    if (!getDocumentContentNode(document).querySelector('.progress') && options.progress) {
      getDocumentContentNode(document).appendChild(fragmentFromString('<div class="progress"></progress>'));
    }

    var shwr = new shower();
    shwr.start();
  }
}

//TODO: Review grapoi
function processPotentialAction(resourceInfo) {
  var g = resourceInfo.graph;
  var triples = g.out().quads();
  triples.forEach(t => {
    var s = t.subject.value;
    var p = t.predicate.value;
    var o = t.object.value;

    if (p == ns.schema.potentialAction.value) {
      var action = o;
      var documentOrigin = (document.location.origin === "null") ? "file://" : document.location.origin;
      var originPathname = documentOrigin + document.location.pathname;
// console.log(originPathname)
// console.log(action.startsWith(originPathname + '#'))
      if (action.startsWith(originPathname)) {
        document.addEventListener('click', (e) => {
          var fragment = action.substr(action.lastIndexOf('#'));
// console.log(fragment)
          if (fragment) {
            var selector = '[about="' + fragment  + '"][typeof="schema:ViewAction"], [href="' + fragment  + '"][typeof="schema:ViewAction"], [resource="' + fragment  + '"][typeof="schema:ViewAction"]';
// console.log(selector)
            // var element = document.querySelectorAll(selector);
            var element = e.target.closest(selector);
// console.log(element)
            if (element) {
              e.preventDefault();
              e.stopPropagation();

              var so = g.node(rdf.namedNode(action)).out(ns.schema.object).values;
              if (so.length) {
                selector = '#' + element.closest('[id]').id;

                var svgGraph = document.querySelector(selector + ' svg');
                if (svgGraph) {
                  svgGraph.nextSibling.parentNode.removeChild(svgGraph.nextSibling);
                  svgGraph.parentNode.removeChild(svgGraph);
                }
                else {
                  // serializeGraph(g, { 'contentType': 'text/turtle' })
                  //   .then(data => {
                      var options = {};
                      options['subjectURI'] = so[0];
                      options['contentType'] = 'text/turtle';
                      showVisualisationGraph(options.subjectURI, g.dataset.toCanonical(), selector, options);
                    // });
                }
              }
            }
          }
        });
      }
    }
  });
}

function processActivateAction() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('[about="#document-menu"][typeof="schema:ActivateAction"], [href="#document-menu"][typeof="schema:ActivateAction"], [resource="#document-menu"][typeof="schema:ActivateAction"]')) {
      e.preventDefault();
      e.stopPropagation();

      showDocumentMenu(e);
    }
  });
}

// function initMath(config) {
//   if (!Config.MathAvailable) { return; }

//   config = config || {
//     skipTags: ["script","noscript","style","textarea","pre","code", "math"],
//     ignoreClass: "equation",
//     MathML: {
//       useMathMLspacing: true
//     },
//     tex2jax: {
//       inlineMath: [["$","$"],["\\(","\\)"]],
//       processEscapes: true
//     },
//     asciimath2jax: {
//       delimiters: [['$','$'], ['`','`']]
//     }
//   }

//   window.MathJax.Hub.Config(config);

//   window.MathJax.Hub.Register.StartupHook("End Jax",function () {
//     var BROWSER = window.MathJax.Hub.Browser;
//     var jax = "SVG";
//     if (BROWSER.isMSIE && BROWSER.hasMathPlayer) jax = "NativeMML";
//     if (BROWSER.isFirefox) jax = "NativeMML";
//     if (BROWSER.isSafari && BROWSER.versionAtLeast("5.0")) jax = "NativeMML";

//     window.MathJax.Hub.setRenderer(jax);
//   });
// }
