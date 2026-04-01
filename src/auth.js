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
import Config from './config.js'
import { fragmentFromString, removeChildren } from "./utils/html.js";
import { getAgentHTML, showActionMessage, getResourceSupplementalInfo, handleDeleteNote, addMessageToLog } from './doc.js';
import { Icon } from './ui/icons.js';
import { setPreferredPolicyInfo, getAgentTypeIndex, getAgentSupplementalInfo, getAgentSeeAlsoPrimaryTopicOf, getAgentPreferencesInfo, getSubjectInfo } from './graph.js';
import { removeLocalStorageAsSignOut, updateLocalStorageProfile } from './storage.js';
import { updateButtons, getButtonHTML } from './ui/buttons.js';
import { SessionCore } from '@uvdsl/solid-oidc-client-browser/core';
import { isCurrentScriptSameOrigin, isLocalhost } from './uri.js';
import { SessionIDB } from '@uvdsl/solid-oidc-client-browser';
import { i18n } from './i18n.js';
import { showGeneralMessages, setPreferredLanguagesInfo } from './actions.js';
import { sanitizeInsertAdjacentHTML } from './utils/sanitization.js';
import { updateCollabUserIdentity } from './editor/editor.js';

const ns = Config.ns;

Config.OIDC['client_id'] = isLocalhost(window.location) ? process.env.DEV_CLIENT_ID : process.env.CLIENT_ID;

const clientid = (Config.OIDC['client_id']) ? Config.OIDC['client_id'] : null;

const currentScriptSameOrigin = isCurrentScriptSameOrigin();

//Use static client registration if there is a Client ID Document URL and the dokieli script is on same origin as webpage and not Web Extension mode. Otherwise, use dynamic registration.
// Manually configuring the database so that we can restore the session without using the refresher worker 
Config['Session'] = (clientid && !Config['WebExtensionEnabled'] && currentScriptSameOrigin) ? new SessionCore({ client_id: clientid }, { database: new SessionIDB() }) : new SessionCore({ redirect_uris: [window.location.href], client_name: "dokieli" }, { database: new SessionIDB() });

export async function restoreSession() {
  await Config['Session']?.handleRedirectFromLogin();
  await Config['Session']?.restore().catch(e => console.log(e.message));
}

export async function showUserSigninSignout (node) {
  var webId = Config['Session']?.isActive ? Config['Session']?.webId : null;

  // was LoggedIn with new OIDC WebID
  if (webId && (webId != Config.User.IRI || !Config.User.IRI)) {
    //Sets Config.User based on webId
     await setUserInfo(webId)
          .then(() => {
            afterSetUserInfo()
          })
  }

  if (node.hasChildNodes()) { return; }

  let userInfoHTML;

  //Checks if already know the user from prior load of the page
  userInfoHTML = Config.User.IRI ? getAgentHTML() + Config.Button.Menu.SignOut : Config.Button.Menu.SignIn;

  sanitizeInsertAdjacentHTML(node, 'afterbegin', userInfoHTML);
}

export async function signOut() {
  //Sign out for real
  if (Config['Session']?.isActive) {
    await Config['Session']?.logout();
  }

  removeLocalStorageAsSignOut();

  Config.User = {
    IRI: null,
    Role: 'social',
    UI: {}
  }

  updateButtons();

  setPreferredLanguagesInfo();
}


export async function userInfoSignOut(node) {
  //Clean up the user-info so it can be reconstructed
  removeChildren(node);

  sanitizeInsertAdjacentHTML(node, 'afterbegin', Config.Button.Menu.SignIn);

  var buttonDeletes = document.querySelectorAll('aside.do blockquote[cite] article button.delete');
  buttonDeletes.forEach(button => {
    button.parentNode.removeChild(button);
  })

  //Signed out so update button states
  getResourceSupplementalInfo(Config.DocumentURL).then(resourceInfo => {
    updateButtons();
  });
}

export function showUserIdentityInput () {
  var userIdentityInput = document.getElementById('user-identity-input');

  if (userIdentityInput) {
    return;
  }

  var signInUser = document.querySelector('#document-menu button.signin-user');

  if (signInUser) {
    signInUser.disabled = true;
  }

  var buttonClose = getButtonHTML({ key: 'dialog.signin.close.button', button: 'close', buttonClass: 'close', iconSize: 'fa-2x' });

  var webid = Config.User.WebIdDelegate ? Config.User.WebIdDelegate : "";
  var buttonSignInDisabled = webid ? '' : ' disabled="disabled"';

  var code = `
    <aside aria-labelledby="user-identity-input-label" class="do on" dir="${Config.User.UI.LanguageDir}" id="user-identity-input" lang="${Config.User.UI.Language}" rel="schema:hasPart" resource="#user-identity-input" xml:lang="${Config.User.UI.Language}">
      <h2 data-i18n="dialog.signin.h2" id="user-identity-input-label" property="schema:name">${i18n.t('dialog.signin.h2.textContent')} ${Config.Button.Info.SignIn}</h2>
      ${buttonClose}
      <div class="info"></div>

      <section id="user-identity-input-login">
        <p data-i18n="dialog.signin.description.p">${i18n.t('dialog.signin.description.p.textContent')}</p>

        <ul class="do-signin-providers">
          <li>
            <button aria-expanded="false" class="do-signin-provider" data-provider="solid" data-i18n="dialog.signin.provider-solid.button" title="${i18n.t('dialog.signin.provider-solid.button.title')}" type="button">
              <i class="fas solid-project"></i>
              <span>
                <span data-i18n="dialog.signin.provider-solid.button.span">${i18n.t('dialog.signin.provider-solid.button.span.textContent')}</span>
                <span data-i18n="dialog.signin.provider-solid.small">${i18n.t('dialog.signin.provider-solid.small.textContent')}</span>
              </span>
              ${Icon['.fas.fa-angle-right']}
            </button>
            <div class="do-signin-provider-form" id="do-signin-solid" hidden="">
              <p><label data-i18n="dialog.signin.provider-solid-form.label" for="solid-provider-url">${i18n.t('dialog.signin.provider-solid-form.label.textContent')}</label></p>
              <p><input id="solid-provider-url" name="solid-provider-url" placeholder="https://solidcommunity.net/" type="url" value="https://solidcommunity.net/"/> <button class="do-signin-provider-go" data-i18n="dialog.signin.provider-form.go.button" data-provider="solid" title="${i18n.t('dialog.signin.provider-form.go.button.title')}" type="button">${i18n.t('dialog.signin.provider-form.go.button.textContent')}</button></p>
            </div>
          </li>
        </ul>

        <details id="user-identity-input-advanced">
          <summary data-i18n="dialog.signin.advanced.summary">${i18n.t('dialog.signin.advanced.summary.textContent')}</summary>
          <p id="user-identity-input-webid">
            <label for="webid" data-i18n="dialog.signin.webid.label">${i18n.t('dialog.signin.webid.label.textContent')}</label>
            <input dir="ltr" id="webid" type="url" placeholder="https://username.solidcommunity.net/" value="${webid}" name="webid"/>
            <button data-i18n="dialog.signin.submit.button" class="signin" type="button"${buttonSignInDisabled}>${i18n.t('dialog.signin.submit.button.textContent')}</button>
          </p>
        </details>

        <p>${Config.Button.Info.WebId}</p>
      </section>
    </aside>`;

  document.body.appendChild(fragmentFromString(code));

  var aside = document.getElementById('user-identity-input');

  aside.addEventListener('click', e => {
    if (e.target.closest('button.close')) {
      if (signInUser) {
        signInUser.disabled = false;
      }
      return;
    }

    var providerButton = e.target.closest('button.do-signin-provider');
    if (providerButton) {
      var provider = providerButton.dataset.provider;
      var form = aside.querySelector('#do-signin-' + provider);
      var isExpanded = providerButton.getAttribute('aria-expanded') === 'true';

      aside.querySelectorAll('button.do-signin-provider[aria-expanded="true"]').forEach(btn => {
        if (btn !== providerButton) {
          btn.setAttribute('aria-expanded', 'false');
          var otherForm = aside.querySelector('#do-signin-' + btn.dataset.provider);
          if (otherForm) { otherForm.hidden = true; }
        }
      });

      providerButton.setAttribute('aria-expanded', isExpanded ? 'false' : 'true');
      form.hidden = isExpanded;
      if (!isExpanded) {
        form.querySelector('input[type="url"]').focus();
      }
      return;
    }

    var goButton = e.target.closest('button.do-signin-provider-go');
    if (goButton) {
      var provider = goButton.dataset.provider;
      var urlInput = aside.querySelector('#' + provider + '-provider-url');
      var idpUrl = urlInput ? urlInput.value.trim() : '';
      if (idpUrl) {
        loginWithIDP(idpUrl);
      }
      return;
    }
  });

  let details = aside.querySelector('#user-identity-input-advanced');
  let userIdentityInputWebidInput = details.querySelector('input');
  details.addEventListener('toggle', e => {
    if (details.open) {
      userIdentityInputWebidInput.focus();
    }
  });

  var buttonSignIn = aside.querySelector('button.signin');
  var inputWebID = aside.querySelector('input#webid');

  if (inputWebID) {
    buttonSignIn.addEventListener('click', submitSignIn);

    let events = ['keyup', 'cut', 'paste', 'input'];

    events.forEach(eventType => {
      inputWebID.addEventListener(eventType, e => { enableDisableButton(e, buttonSignIn); });
    });
  }
}


// TODO: Generalize this further so that it is not only for submitSignIn
function enableDisableButton(e, button) {
  var delay = (e.type === 'cut' || e.type === 'paste') ? 250 : 0
  var input

  window.setTimeout(function () {
    input = e.target.value
    if (input.length > 10 && input.match(/^https?:\/\//g)) {
      if (typeof e.which !== 'undefined' && e.which === 13) {
        if (!button.getAttribute('disabled')) {
          button.setAttribute('disabled', 'disabled')
          e.preventDefault()
          e.stopPropagation()
          submitSignIn()
        }
      } else {
        button.removeAttribute('disabled')
      }
    } else {
      if (!button.getAttribute('disabled')) {
        button.setAttribute('disabled', 'disabled')
      }
    }
  }, delay)
}

// FIXME: This parameter value can be an event or a string
function submitSignIn (url) {
  var userIdentityInput = document.getElementById('user-identity-input')

  if (typeof url !== 'string') {
    if (userIdentityInput) {
      sanitizeInsertAdjacentHTML(userIdentityInput.querySelector('#user-identity-input-webid'), 'beforeend', Icon[".fas.fa-circle-notch.fa-spin.fa-fw"])
    }

    url = userIdentityInput.querySelector('input#webid').value.trim()
  }

  if (!url) {
    return Promise.resolve()
  }

  //TODO: Consider throwing an error with setUserInfo where there is no profile, and so don't trigger signInWithOIDC at all.
  return setUserInfo(url)
    .then(() => {
      var uI = document.getElementById('user-info')
      if (uI) {
        removeChildren(uI);
        sanitizeInsertAdjacentHTML(uI, 'beforeend', getAgentHTML() + Config.Button.Menu.SignOut);
      }

      if (userIdentityInput) {
        userIdentityInput.parentNode.removeChild(userIdentityInput)
      }

      if (Config.User.IRI && !Config.User.OIDCIssuer) {
        const message = {
          'content': `Cannot sign in. Using information from profile to personalise the UI.`,
          'type': 'info',
          'timer': null
        }

        addMessageToLog(message, Config.MessageLog);
        showActionMessage(document.body, message);

        afterSetUserInfo();
      }
      else if (Config.User.IRI) {
        signInWithOIDC()
          .catch(e => {
            const message = {
              'content': `Cannot sign in. Using information from profile to personalise the UI.`,
              'type': 'info',
              'timer': null
            }
            
            addMessageToLog(message, Config.MessageLog);
            showActionMessage(document.body, message);

            afterSetUserInfo();
          })
      }
    })
}

async function loginWithIDP(idpUrl) {
  Config.OIDC['authStartLocation'] = Config.OIDC['client_id'] ? window.location.href.split('#')[0] : null;
  localStorage.setItem('DO.Config.OIDC', JSON.stringify(Config.OIDC));

  let redirect_uri = process.env.OIDC_REDIRECT_URI || (window.location.origin + '/');
  redirect_uri = Config.OIDC['client_id'] ? redirect_uri : window.location.href.split('#')[0];

  Config['Session']?.login(idpUrl, redirect_uri)
    .catch(e => {
      const message = {
        'content': `Cannot sign in with ${idpUrl}. ${e.message}`,
        'type': 'error',
        'timer': null
      };
      showActionMessage(document.body, message);
    });
}

//XXX: User Profile should've been fetch by now.
 async function signInWithOIDC() {
  const idp = Config.User.OIDCIssuer;

  Config.OIDC['authStartLocation'] = window.location.href.split('#')[0];
  localStorage.setItem('DO.Config.OIDC', JSON.stringify(Config.OIDC));

  let redirect_uri = process.env.OIDC_REDIRECT_URI || (window.location.origin + '/');
  redirect_uri = Config.OIDC['client_id'] ? redirect_uri :  window.location.href.split('#')[0];

  // Redirects away from dokieli :( but hopefully only briefly :)
  Config['Session']?.login(idp, redirect_uri)
    .catch((e) => {
      const message = {
        'content': `Cannot sign in. Using information from profile to personalise the UI.`,
        'type': 'info',
        'timer': null
      }

      showActionMessage(document.body, message);

      afterSetUserInfo();
    });
}

export function setUserInfo (subjectIRI, options = {}) {
  options.ui = Config.User.UI;
  options.fetchIndexes = options.fetchIndexes ?? true;

  return getSubjectInfo(subjectIRI, options).then(subject => {
    Object.keys(subject).forEach((key) => {
      Config.User[key] = subject[key];
    })

    setPreferredLanguagesInfo(subject.Graph);

    updateLocalStorageProfile(subject);
  });
}


//TODO: Review grapoi
/**
 * @param subjectIRI {string}
 *
 * @returns {Promise}
 */

//TODO: Review grapoi
export function afterSetUserInfo() {
  updateCollabUserIdentity();

  getResourceSupplementalInfo(Config.DocumentURL).then(resourceInfo => {
    updateButtons();
  });

  var promises = [];

  if (Config.User.Graph) {
    promises.push(getAgentTypeIndex(Config.User.Graph)
      .then(typeIndexes => {
        Object.keys(typeIndexes).forEach(typeIndexType => {
          Config.User.TypeIndex[typeIndexType] = typeIndexes[typeIndexType];
        });
      }));

    promises.push(getAgentPreferencesInfo(Config.User.Graph)
      .then(preferencesInfo => {
        Config.User['Preferences'] = { graph: preferencesInfo };
        return preferencesInfo.node(rdf.namedNode(Config.User.IRI));
      })
      .then(g => {
        setPreferredPolicyInfo(g);
        setPreferredLanguagesInfo(g);
      })
      .catch(error => {
        var g = Config.User.Graph.node(rdf.namedNode(Config.User.IRI));
        setPreferredPolicyInfo(g);
        setPreferredLanguagesInfo(g);
      }))

    promises.push(getAgentSupplementalInfo(Config.User.IRI))
    promises.push(getAgentSeeAlsoPrimaryTopicOf(Config.User.Graph))
  }

  Promise.allSettled(promises)
    .then(results => {
      var uI = document.getElementById('user-info')

      //FIXME: This works but is it fugly? It is so that 1) we don't have double assignment of event handler on user-info's signOut and to also make sure that the user with a Session can actually signOut (removing children loses the event)
      if (uI && !Config['Session']?.isActive) {
        // uI.replaceChildren(fragmentFromString(DO.Config.Button.Menu.SignOut))

        removeChildren(node);
        showUserSigninSignout(node);
      }

      showGeneralMessages();

      return updateLocalStorageProfile(Config.User)
    })
    .catch(e => {
      return Promise.resolve();
    });

  var user = document.querySelectorAll('aside.do article *[rel~="dcterms:creator"] > *[about="' + Config.User.IRI + '"]');

  for (let i = 0; i < user.length; i++) {
    var article = user[i].closest('article')
    sanitizeInsertAdjacentHTML(article, 'afterbegin', '<button class="delete" type="button">' + Icon[".fas.fa-trash-alt"] + '</button>')
  }

  var buttonDelete = document.querySelectorAll('aside.do blockquote[cite] article button.delete')

  for (let i = 0; i < buttonDelete.length; i++) {
    buttonDelete[i].addEventListener('click', function (e) {
      var button = e.target.closest('button.delete');
      handleDeleteNote(button);
    })
  }
}
