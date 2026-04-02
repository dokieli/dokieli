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

import rdf from 'rdf-ext';
import shower from '@shower/core';
import Config from './config.js';
const ns = Config.ns;
import { highlightItems, updateSelectedStylesheets, initCurrentStylesheet, showActionMessage, addMessageToLog, initCopyToClipboard, showFragment, setDocRefType, showRobustLinksDecoration, focusNote, showAsTabs, setDocumentString, setDocumentURL, getDocument } from './doc.js';
import { initButtons } from './ui/buttons.js'
import { setWebExtensionURL } from './util.js';
import { getLocalStorageItem } from './storage.js';
import { syncLocalRemoteResource, monitorNetworkStatus, autoSave } from './sync.js';
import { domSanitize, sanitizeInsertAdjacentHTML, sanitizeIRI, sanitizeObject } from './utils/sanitization.js';
import { afterSetUserInfo, setUserInfo } from './auth.js';
import { showNotificationSources } from './activity.js';
import { getProxyableIRI, getUrlParams, stripFragmentFromString, stripUrlSearchHash } from './uri.js';
import { getMultipleResources } from './fetcher.js';
import { initEditor } from './editor/initEditor.js';
import { showGraph, showVisualisationGraph } from './viz.js';
import { openResource, initDocumentMenu, spawnDokieli, showDocumentMenu } from './dialog.js';
import { Icon } from './ui/icons.js';
import { eventButtonClose, eventButtonSignIn, eventButtonSignOut, eventButtonNotificationsToggle, eventButtonInfo, emitDocEvent } from './events.js';
import { hasNonWhitespaceText, getDocumentContentNode, selectArticleNode, fragmentFromString } from "./utils/html.js";

export async function init (url) {
  initServiceWorker();

  var contentNode = getDocumentContentNode(document);
  if (contentNode) {
    initButtons();
    initDocumentMenu();
    
    emitDocEvent('loading');
    
    setDocumentURL(url);
    setWebExtensionURL();
    setDocumentString();
    setDocumentModeParams();
    initUser();
    initLocalStorage();
    initEvents();
    initEditor();

    await initSyncLocalRemoteResource();

    await initDocumentActions();
    await initDocumentMode();

    emitDocEvent('ready', { url: Config.DocumentURL });

    monitorNetworkStatus();
    initPrint();
  }
}

function initServiceWorker() {
  if ('serviceWorker' in navigator && !Config.WebExtensionEnabled) {
    fetch('/service-worker.js', { method: 'HEAD' })
      .then(res => {
        if (!res.ok) return;
        return navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
      })
      .then(registration => {
        if (registration) console.log('Service Worker registered');
      })
      .catch(() => {
        // SW not available on this domain, silently skip
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
  if (Config.DocumentURL.startsWith('blob:')) {
    return;
  }

  getLocalStorageItem(Config.DocumentURL).then(collection => {
    if (!collection) {
      // autoSave(Config.DocumentURL, { method: 'localStorage' });
      setTimeout(() => autoSave(Config.DocumentURL, { method: 'localStorage' }), 0);
    }
    else if (collection.autoSave) {
      Config.AutoSave.Items[Config.DocumentURL] ||= {};
      Config.AutoSave.Items[Config.DocumentURL]['localStorage'] ||= {};
      // Config.AutoSave.Items[Config.DocumentURL]['localStorage']['digestSRI'] = latestLocalDocumentItem.digestSRI;
      Config.AutoSave.Items[Config.DocumentURL]['localStorage']['updated'] = collection.updated;
    }
  });
}

async function initEvents() {
  eventButtonClose();
  eventButtonInfo();
  eventButtonSignIn();
  eventButtonSignOut();
  eventButtonNotificationsToggle();
}

async function initDocumentActions() {
  showFragment();
  initCopyToClipboard();
  showRobustLinksDecoration();
  processPotentialAction();
  processActivateAction();
  highlightItems();
  showAsTabs();
  initSlideshow();
  initCurrentStylesheet();
  initShowNotificationSources();
  focusNote();
  setDocRefType();
}

function initShowNotificationSources() {
  var documentURL = Config.DocumentURL;

  if (Config.Resource[documentURL].inbox?.length && !Config.Inbox[Config.Resource[documentURL].inbox[0]]) {
    showNotificationSources(Config.Resource[documentURL].inbox[0]);
  }
}

async function initSyncLocalRemoteResource() {
  var documentURL = Config.DocumentURL;

  if (!(documentURL in Config.Resource && 'state' in Config.Resource[documentURL])) {
    await syncLocalRemoteResource();
  }
}

export function setDocumentModeParams() {
  const params = ['author', 'graph', 'graph-view', 'open', 'output', 'social', 'style'];
  Config['DocumentModes'] =  {};
  params.forEach((p) => Config['DocumentModes'][p] = getUrlParams(p));
}

export async function initDocumentMode(mode) {
  Config.Editor.mode = mode || Config.Editor.mode;

  const documentOptions = {
    ...Config.DOMProcessing,
    removeNodesWithSelector: [],
    sanitize: true,
    normalize: true
  };

  const paramAuthor = Config['DocumentModes']['author'];
  const paramGraph = Config['DocumentModes']['graph'];
  const paramGraphView = Config['DocumentModes']['graph-view'];
  const paramOpen = Config['DocumentModes']['open'];
  const paramOutput = Config['DocumentModes']['output'];
  const paramSocial = Config['DocumentModes']['social'];
  const paramStyle = Config['DocumentModes']['style'];

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

    let spawnOptions = {};
    spawnOptions['defaultStylesheet'] = false;
    spawnOptions['init'] = true;
    if (paramOutput.length) {
      spawnOptions['output'] = domSanitize(paramOutput[0]);
    }

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

      let results = await getMultipleResources(openResources)

      const contentTypes = results.map(r => r.type);
      const iris = openResources;

      await spawnDokieli(
        document,
        results,
        contentTypes,
        iris,
        spawnOptions
      );
    } else {
      open = openResources[0];
      open = domSanitize(open);
      open = decodeURIComponent(open);

      await openResource(open);
    }

    if (paramGraphView.length && paramGraphView[0].toLowerCase() == 'true') {
      showVisualisationGraph(Config.DocumentURL, getDocument(null, documentOptions), '#graph-view');
    }

    // stripUrlSearchHash();
  }

  if (paramGraphView.length && paramGraphView[0].toLowerCase() == 'true' && paramOpen.length == 0) {
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


  if (paramAuthor.length && paramAuthor[0] == 'true') {
    Config.Editor.mode = 'author';
    Config.Editor.toggleEditor('author')
    stripUrlSearchHash(['author']);
  }
  else if (paramSocial.length && paramSocial[0] == 'true') {
    Config.Editor.mode = 'social';
    Config.Editor.toggleEditor('social')
    stripUrlSearchHash(['social']);
  }

  //XXX: This else if works but current document needs to be processed for Config.Resource. See also config.js init and whether non text/html is ever the case (e.g., dokieli in SVG?)
  // else if (Config.Resource[Config.DocumentURL].contentType == 'text/html') {
    var node = selectArticleNode(document);
    var hasContent = hasNonWhitespaceText(node);

    if (!hasContent && !Config.EditorEnabled) {
      Config.Editor.toggleEditor('author', { template: 'new' });
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
  resourceInfo = resourceInfo || Config.Resource[Config.DocumentURL];
  var g = resourceInfo.graph;

  // console.log(g.dataset.toCanonical());
  let actions = g.node(rdf.namedNode(Config.DocumentURL)).out(ns.schema.potentialAction).values;

  actions.forEach(action => {
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
                    showVisualisationGraph(options.subjectURI, g, selector, options);
                  // });
              }
            }
          }
        }
      });
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


function initPrint() {
  window.addEventListener('beforeprint', () => {
    document.querySelectorAll('a[href^="http"]').forEach(a => {
      if (a.textContent.trim() === a.href) {
        a.classList.add('do-print-a-href-hide');
      }
    });
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
