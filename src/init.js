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

import Config from './config.js';
import { getDocumentContentNode, highlightItems, updateSelectedStylesheets, initCurrentStylesheet, selectArticleNode, hasNonWhitespaceText, showActionMessage, addMessageToLog, initCopyToClipboard, showFragment, setDocRefType, eventButtonClose, eventButtonInfo, eventButtonSignIn, eventButtonSignOut, eventButtonNotificationsToggle, showRobustLinksDecoration, focusNote, showAsTabs, getResourceInfo } from './doc.js';
import { initButtons } from './ui/buttons.js'
import { setDocumentURL, setWebExtensionURL, setDocumentString } from './util.js';
import { getLocalStorageItem, autoSave, syncLocalRemoteResource, monitorNetworkStatus } from './storage.js';
import { domSanitize, sanitizeObject } from './utils/sanitization.js';
import { setUserInfo } from './auth.js';
import { initDocumentMenu } from './menu.js';
import { processActivateAction, processPotentialAction } from './actions.js';
import { showNotificationSources } from './activity.js';
import { getProxyableIRI, getUrlParams, stripUrlSearchHash } from './uri.js';
import { getMultipleResources } from './fetcher.js';
import shower from '@shower/core';
import { initEditor } from './editor/initEditor.js';

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
  getLocalStorageItem('Config.User').then(user => {
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

function initLocalStorage() {
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
// console.log(DO.C.Resource[documentURL])

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

      // getResourceSupplementalInfo(DO.C.DocumentURL, options).then(resourceInfo => {
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
      document.querySelector('head').insertAdjacentHTML('beforeend', link);
    }

    stripUrlSearchHash();

    var stylesheets = document.querySelectorAll('head link[rel~="stylesheet"][title]:not([href$="dokieli.css"])');
    updateSelectedStylesheets(stylesheets, title);
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

      await DO.U.spawnDokieli(
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
      DO.U.showVisualisationGraph(DO.C.DocumentURL, getDocument(null, documentOptions), '#graph-view');
    }

    // stripUrlSearchHash();
  }

  if (paramGraphView.length && paramGraphView[0] == 'true' && paramOpen.length == 0) {
    DO.U.showVisualisationGraph(DO.C.DocumentURL, getDocument(null, documentOptions), '#graph-view');
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

  //XXX: This else if works but current document needs to be processed for DO.C.Resource. See also config.js init and whether non text/html is ever the case (e.g., dokieli in SVG?)
  // else if (DO.C.Resource[DO.C.DocumentURL].contentType == 'text/html') {
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
