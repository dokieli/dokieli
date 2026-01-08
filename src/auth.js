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
import { removeChildren, fragmentFromString } from './util.js'
import { getAgentHTML, showActionMessage, showGeneralMessages, getResourceSupplementalInfo, handleDeleteNote, addMessageToLog } from './doc.js'
import { Icon } from './ui/icons.js'
import { getResourceGraph, getAgentName, getGraphImage, getAgentURL, getAgentPreferredProxy, getAgentPreferredPolicy, setPreferredPolicyInfo, getAgentDelegates, getAgentKnows, getAgentFollowing, getAgentStorage, getAgentOutbox, getAgentInbox, getAgentPreferencesFile, getAgentPublicTypeIndex, getAgentPrivateTypeIndex, getAgentTypeIndex, getAgentSupplementalInfo, getAgentSeeAlso, getAgentPreferencesInfo, getAgentLiked, getAgentOccupations, getAgentPublications, getAgentMade, getAgentOIDCIssuer } from './graph.js'
import { removeLocalStorageAsSignOut, updateLocalStorageProfile } from './storage.js'
import { updateButtons, getButtonHTML } from './ui/buttons.js';
import { SessionCore } from '@uvdsl/solid-oidc-client-browser/core';
import { isCurrentScriptSameOrigin, isLocalhost } from './uri.js';
import { SessionIDB } from '@uvdsl/solid-oidc-client-browser';
import { i18n } from './i18n.js';

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

async function showUserSigninSignout (node) {
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

  node.insertAdjacentHTML('afterbegin', userInfoHTML);
}

async function signOut() {
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
}


async function userInfoSignOut(node) {
  //Clean up the user-info so it can be reconstructed
  removeChildren(node);

  node.insertAdjacentHTML('afterbegin', Config.Button.Menu.SignIn);

  var buttonDeletes = document.querySelectorAll('aside.do blockquote[cite] article button.delete');
  buttonDeletes.forEach(button => {
    button.parentNode.removeChild(button);
  })

  //Signed out so update button states
  getResourceSupplementalInfo(Config.DocumentURL).then(resourceInfo => {
    updateButtons();
  });
}

function showUserIdentityInput () {
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
  var code = `<aside aria-labelledby="user-identity-input-label" class="do on" id="user-identity-input" lang="${i18n.code()}" xml:lang="${i18n.code()}"><h2 data-i18n="dialog.signin.h2" id="user-identity-input-label">${i18n.t('dialog.signin.h2.textContent')} ${Config.Button.Info.SignIn}</h2>${buttonClose}<div class="info"></div><p id="user-identity-input-webid"><label>WebID</label> <input id="webid" type="text" placeholder="https://csarven.ca/#i" value="${webid}" name="webid"/> <button data-i18n="dialog.signin.submit.button" class="signin" type="button">${i18n.t('dialog.signin.submit.button.textContent')}</button></p></aside>`;

  document.body.appendChild(fragmentFromString(code))

  var buttonSignIn = document.querySelector('#user-identity-input button.signin')
  if (!Config.User.WebIdDelegate) {
    buttonSignIn.setAttribute('disabled', 'disabled');
  }

  document.querySelector('#user-identity-input').addEventListener('click', e => {
    if (e.target.closest('button.close')) {
      if (signInUser) {
        signInUser.disabled = false
      }
    }
  })

  var inputWebID = document.querySelector('#user-identity-input input#webid')
  if(inputWebID) {
    buttonSignIn.addEventListener('click', submitSignIn)

    let events = ['keyup', 'cut', 'paste', 'input']

    events.forEach(eventType => {
      inputWebID.addEventListener(eventType, e => { enableDisableButton(e, buttonSignIn) })
    })
  }

  inputWebID.focus()
}


// TODO: Generalize this further so that it is not only for submitSignIn
function enableDisableButton (e, button) {
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
      userIdentityInput.querySelector('#user-identity-input-webid').insertAdjacentHTML('beforeend', Icon[".fas.fa-circle-notch.fa-spin.fa-fw"])
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
        uI.insertAdjacentHTML('beforeend', getAgentHTML() + Config.Button.Menu.SignOut);
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

//XXX: User Profile should've been fetch by now.
 async function signInWithOIDC() {
  const idp = Config.User.OIDCIssuer;

  Config.OIDC['authStartLocation'] = Config.OIDC['client_id'] ? window.location.href.split('#')[0] : null;
  localStorage.setItem('DO.C.OIDC', JSON.stringify(Config.OIDC));

  let redirect_uri = process.env.OIDC_REDIRECT_URI || (window.location.origin + '/') ;

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

function setUserInfo (subjectIRI, options = {}) {
  options.ui = Config.User.UI;
  options.fetchIndexes = options.fetchIndexes ?? true;

  return getSubjectInfo(subjectIRI, options).then(subject => {
    Object.keys(subject).forEach((key) => {
      Config.User[key] = subject[key];
    })

    updateLocalStorageProfile(subject);
  });
}

function setContactInfo(subjectIRI, options = {}) {
  return getSubjectInfo(subjectIRI, options).then(subject => {
    Config.User['Contacts'] = Config.User.Contacts || {};
    Config.User.Contacts[subjectIRI] = subject;

    updateLocalStorageProfile(Config.User);
  });
}

function isGraphValid(g) {
  if (!g) return false;
  if (g.resource || g.cause) return false;
  if (g.status?.toString().startsWith('4') || g.status?.toString().startsWith('5')) return false;
  if (typeof g.out !== 'function') return false;
  if (!Array.from(g.out().quads()).length) return false;
  return true;
}

//TODO: Review grapoi
/**
 * @param subjectIRI {string}
 *
 * @returns {Promise}
 */
function getSubjectInfo (subjectIRI, options = {}) {
  if (!subjectIRI) {
    return Promise.reject(new Error('Could not set subject info - no subjectIRI'));
  }
  else if (!subjectIRI.toLowerCase().startsWith('http:') && !(subjectIRI.toLowerCase().startsWith('https:'))) {
    return Promise.reject(new Error('Could not set subject info - subjectIRI is not `http(s):`'));
  }

  var headers = {};
  options['noCredentials'] = !!options['noCredentials'];
  options['noStore'] = !!options['noStore'];

  return getResourceGraph(subjectIRI, headers, options)
    .then(g => {
      //TODO: Consider whether to construct an empty graph (useful to work only with their IRI);

      if (!isGraphValid(g)) {
        // console.warn('Invalid graph object:', g);
        return {}
      }

      g = g.node(rdf.namedNode(subjectIRI));

      return {
        Graph: g,
        IRI: subjectIRI,
        Name: getAgentName(g),
        Image: getGraphImage(g),
        URL: getAgentURL(g),
        Role: options.role,
        UI: options.ui,
        OIDCIssuer: getAgentOIDCIssuer(g),
        ProxyURL: getAgentPreferredProxy(g),
        PreferredPolicy: getAgentPreferredPolicy(g),
        Delegates: getAgentDelegates(g),
        Contacts: {},
        Knows: getAgentKnows(g),
        Following: getAgentFollowing(g),
        SameAs: [],
        SeeAlso: [],
        Storage: getAgentStorage(g),
        Outbox: getAgentOutbox(g),
        Inbox: getAgentInbox(g),
        TypeIndex: {},
        Preferences: {},
        PreferencesFile: getAgentPreferencesFile(g),
        PublicTypeIndex: getAgentPublicTypeIndex(g),
        PrivateTypeIndex: getAgentPrivateTypeIndex(g),
        Liked: getAgentLiked(g),
        Occupations: getAgentOccupations(g),
        Publications: getAgentPublications(g),
        Made: getAgentMade(g)
      }
    })
    .then(agent => {
      //XXX: Revisit what the retun should be, whether to be undefined, {}, or someting else. Is it useful to retain an agent object that doesn't have a Graph? (Probably better not.)
      if (!agent.Graph || !options.fetchIndexes) return agent;

      return getAgentTypeIndex(agent.Graph)
        .then(typeIndexes => {
          Object.keys(typeIndexes).forEach(typeIndexType => {
            agent.TypeIndex[typeIndexType] = typeIndexes[typeIndexType];
          });

          return agent;
        })
    });
  }

//TODO: Review grapoi
function afterSetUserInfo () {
  getResourceSupplementalInfo(Config.DocumentURL).then(resourceInfo => {
    updateButtons();
  });

  var promises = [];

  if (Config.User.Graph) {
    promises.push(getAgentTypeIndex(Config.User.Graph).then(typeIndexes => {
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
      })
      .catch(error => {
        var g = Config.User.Graph.node(rdf.namedNode(Config.User.IRI));
        setPreferredPolicyInfo(g);
      }))

    promises.push(getAgentSupplementalInfo(Config.User.IRI))
    promises.push(getAgentSeeAlso(Config.User.Graph))
  }

  Promise.allSettled(promises)
    .then(results => {
      var uI = document.getElementById('user-info')

      //FIXME: This works but is it fugly? It is so that 1) we don't have double assignment of event handler on user-info's signOut and to also make sure that the user with a Session can actually signOut (removing children loses the event)
      if (uI && !Config['Session']?.isActive) {
        // uI.replaceChildren(fragmentFromString(DO.C.Button.Menu.SignOut))

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
    article.insertAdjacentHTML('afterbegin', '<button class="delete" type="button">' + Icon[".fas.fa-trash-alt"] + '</button>')
  }

  var buttonDelete = document.querySelectorAll('aside.do blockquote[cite] article button.delete')

  for (let i = 0; i < buttonDelete.length; i++) {
    buttonDelete[i].addEventListener('click', function (e) {
      var button = e.target.closest('button.delete');
      handleDeleteNote(button);
    })
  }
}

export {
  afterSetUserInfo,
  enableDisableButton,
  getSubjectInfo,
  setUserInfo,
  setContactInfo,
  showUserIdentityInput,
  showUserSigninSignout,
  submitSignIn,
  userInfoSignOut,
  signOut
}
