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

const WebExtension = (typeof browser !== 'undefined') ? browser : chrome;

var C = {
  'Loaded': false,
  'WebID': null
}

function isDokieliReady() {
  return typeof DO !== 'undefined' && DO.U !== undefined && C.Loaded;
}

WebExtension.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  try {
    if (request.action === 'dokieli.status') {
      var ready = isDokieliReady();
      sendResponse({
        loaded: ready,
        editMode: ready ? (DO.C.EditorEnabled || false) : false,
        user: ready && DO.C.User.IRI ? { iri: DO.C.User.IRI } : null
      });
    }
    else if (request.action === 'dokieli.showDocumentMenu') {
      if (!C.Loaded && !document.querySelector('#document-menu')) {
        DO.C.HideInPageMenu = true;
        var attributes = {
          'about': '',
          'prefix': DO.C.prefixStrings.document,
          'typeof': 'schema:CreativeWork'
        };

        var rootNode = DO.U.getContentNode(document);
        var existingAttributes = Array.from(rootNode.attributes).map(attr => attr.name);

        Object.keys(attributes).forEach(function (attribute) {
          if (!existingAttributes.includes(attribute)) {
            rootNode.setAttribute(attribute, attributes[attribute]);
          }
        });

        DO.U.load();
        C.Loaded = true;
      }

      if (request.webid) {
        try {
          var w = JSON.parse(request.webid);
          var iri = w.id;
          if (iri && C.WebID !== iri) {
            DO.C.User.WebIdDelegate = iri;
            C.WebID = iri;
          }
        } catch (e) {
          console.log(e);
        }
      }

      window.setTimeout(function () {
        DO.U.showDocumentMenu();
      }, 50);

      sendResponse({ loaded: true });
    }
    else if (request.action === 'dokieli.menuClick') {
      if (typeof DO === 'undefined' || !DO.U || !request.className) {
        sendResponse({ ok: false });
        return;
      }
      try { DO.U.menuClick(request.className); } catch (e) { console.log(e); }
      sendResponse({ ok: true });
    }
    else if (request.action === 'dokieli.updateLanguage') {
      if (typeof DO === 'undefined' || !DO.U || !request.lang) {
        sendResponse({ ok: false });
        return;
      }
      try { DO.U.updateUILanguage(request.lang); } catch (e) { console.log(e); }
      sendResponse({ ok: true });
    }
    else if (request.action === 'dokieli.activate') {
      if (typeof DO === 'undefined' || !DO.U) {
        sendResponse({ error: 'dokieli not loaded' });
        return;
      }

      if (C.Loaded) {
        sendResponse({ ok: true, alreadyLoaded: true });
        return;
      }

      DO.C.HideInPageMenu = true;

      var attributes = {
        'about': '',
        'prefix': DO.C.prefixStrings.document,
        'typeof': 'schema:CreativeWork'
      };

      var rootNode = DO.U.getContentNode(document);
      var existingAttributes = Array.from(rootNode.attributes).map(attr => attr.name);
      Object.keys(attributes).forEach(function (attribute) {
        if (!existingAttributes.includes(attribute)) {
          rootNode.setAttribute(attribute, attributes[attribute]);
        }
      });

      document.addEventListener('dokieli:ready', function () {
        try {
          if (DO.C && DO.C.Editor && typeof DO.C.Editor.toggleEditor === 'function') {
            DO.C.Editor.toggleEditor('social');
          }
        } catch (e) {
          console.log(e);
        }
      }, { once: true });

      DO.U.load();
      C.Loaded = true;

      sendResponse({ ok: true });
    }
    else if (request.action === 'dokieli.showSignin') {
      if (typeof DO === 'undefined' || !DO.U) {
        sendResponse({ error: 'dokieli not loaded' });
        return;
      }

      var showDialog = function () {
        try { DO.U.showUserIdentityInput(); }
        catch (e) { console.log(e); }
      };

      if (DO.C && DO.C.Button && DO.C.Button.Info && DO.C.Button.Info.SignIn) {
        showDialog();
      } else {
        document.addEventListener('dokieli:ready', showDialog, { once: true });

        if (!C.Loaded) {
          DO.C.HideInPageMenu = true;
          var attributes = {
            'about': '',
            'prefix': DO.C.prefixStrings.document,
            'typeof': 'schema:CreativeWork'
          };

          var rootNode = DO.U.getContentNode(document);
          var existingAttributes = Array.from(rootNode.attributes).map(attr => attr.name);
          Object.keys(attributes).forEach(function (attribute) {
            if (!existingAttributes.includes(attribute)) {
              rootNode.setAttribute(attribute, attributes[attribute]);
            }
          });

          DO.U.load();
          C.Loaded = true;
        }
      }

      sendResponse({ ok: true });
    }
    else {
      sendResponse({});
    }
  } catch (e) {
    console.log(e);
    sendResponse({});
  }
});
