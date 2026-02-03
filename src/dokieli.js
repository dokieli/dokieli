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

import { showActionMessage, addMessageToLog } from './doc.js'
import { getLocalStorageItem, removeLocalStorageItem } from './storage.js'
import { restoreSession } from './auth.js'
import Config from './config.js';
import { i18n, i18nextInit } from './i18n.js'
import { init } from './init.js'
import { getDocumentContentNode } from './utils/html.js';

let DO;

if (typeof window.DO === 'undefined'){

DO = {
  C: Config,

  U: {
    handleIncomingRedirect: async function() {
      // const params = new URLSearchParams(window.location.search);

      getLocalStorageItem('DO.Config.OIDC').then(OIDC => {
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

          removeLocalStorageItem('DO.Config.OIDC');
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
