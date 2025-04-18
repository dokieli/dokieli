'use strict'

import rdf from 'rdf-ext';
import Config from './config.js'
import { deleteResource } from './fetcher.js'
import { removeChildren, fragmentFromString } from './util.js'
import { getAgentHTML, showActionMessage, showGeneralMessages, getResourceSupplementalInfo, updateDocumentDoButtonStates, updateFeatureStatesOfResourceInfo, handleDeleteNote } from './doc.js'
import { Icon } from './ui/icons.js'
import { getResourceGraph, getAgentName, getGraphImage, getAgentURL, getAgentPreferredProxy, getAgentPreferredPolicy, getAgentPreferredPolicyRule, setPreferredPolicyInfo, getAgentDelegates, getAgentKnows, getAgentFollowing, getAgentStorage, getAgentOutbox, getAgentInbox, getAgentPreferencesFile, getAgentPublicTypeIndex, getAgentPrivateTypeIndex, getAgentTypeIndex, getAgentSupplementalInfo, getAgentSeeAlso, getAgentPreferencesInfo, getAgentLiked, getAgentOccupations, getAgentPublications, getAgentMade } from './graph.js'
import { removeLocalStorageAuthClient, removeLocalStorageDocument, removeLocalStorageProfile, updateLocalStorageProfile } from './storage.js'
import solidAuth from 'solid-auth-client'
import { getButtonHTML } from './ui/button-icons.js';

const ns = Config.ns;
const { logout, popupLogin } = solidAuth;

// const { OIDCWebClient } = require('@trust/oidc-web')


function getUserSignedInHTML() {
  // return getAgentHTML() + '<button class="signout-user" title="Live long and prosper">' + Icon[".far.fa-spock-hand"] + '</button>'
  return getAgentHTML() + getButtonHTML({ button: 'signout', buttonClass: 'signout-user', buttonTitle: 'Live long and prosper"' });
}


async function showUserSigninSignout (node) {
  const session = await solidAuth.currentSession();
  var webId = session ? session.webId : null;
  // was LoggedId with new OIDC WebID
  if (webId && (webId != Config.User.IRI || !Config.User.IRI)) {
     await setUserInfo(webId, { oidc: true })
          .then(() => {
            afterSignIn()
          })
  }
  // was LoggedOut as OIDC
  if (!webId && Config.User.IRI && Config.User.OIDC) {
    removeLocalStorageProfile()

    Config.User = {
      IRI: null,
      Role: 'social',
      UI: {}
    }

    var buttonDeletes = document.querySelectorAll('aside.do blockquote[cite] article button.delete');
    buttonDeletes.forEach(button => {
      button.parentNode.removeChild(button);
    })

    removeChildren(node);
  }


  var userInfo = document.getElementById('user-info');

  if (!userInfo) {
    var s = ''

    if (Config.User.IRI) {
      s = getUserSignedInHTML()
    }
    else {
      // s = '<button class="signin-user" title="Sign in to authenticate">' + Icon['.fas.fa-user-astronaut'] + 'Sign in</button>'
      s = `${getButtonHTML({ button: 'signin', buttonClass: 'signin-user', buttonTitle: 'Sign in to authenticate', buttonTextContent: 'Sign in', iconSize: 'fa-2x' })}`;
    }

    node.insertAdjacentHTML('beforeend', '<section id="user-info">' + s + '</section>')

    userInfo = document.getElementById('user-info')

    userInfo.addEventListener('click', async (e) => {
      if (e.target.closest('.signout-user')) {
        removeLocalStorageDocument()

        if (Config.User.OIDC) {
          await logout();
          removeLocalStorageAuthClient()
        }

        removeLocalStorageProfile()

        Config.User = {
          IRI: null,
          Role: 'social',
          UI: {}
        }

        removeChildren(node);

        var documentMenu = document.querySelector('#document-menu')

        showUserSigninSignout(documentMenu.querySelector('header'))

        getResourceSupplementalInfo(Config.DocumentURL).then(resourceInfo => {
          updateFeatureStatesOfResourceInfo(resourceInfo);
          updateDocumentDoButtonStates();
        });
      }
    });

    var su = document.querySelector('#document-menu button.signin-user')
    if (su) {
      su.addEventListener('click', showUserIdentityInput)
    }

    // var rA = document.querySelector('#document-menu .resource-notifications')
    // if(rA) { rA.setAttribute('disabled', 'disabled') }
  }
}


function showUserIdentityInput (e) {
  if (typeof e !== 'undefined') {
    e.target.disabled = true
  }

  var webid = Config.User.WebIdDelegate ? Config.User.WebIdDelegate : "";
  var code = '<aside id="user-identity-input" class="do on">' + Config.Button.Close + '<h2>Sign in</h2><p id="user-identity-input-webid"><label>WebID</label> <input id="webid" type="text" placeholder="https://csarven.ca/#i" value="'+webid+'" name="webid"/> <button class="signin">Sign in</button></p>';
  //XXX: This limitation may not be necessary.
  // if (window.location.protocol === "https:") {
    code += '<p id="user-identity-input-oidc">or with <label>OpenID Connect</label> <button class="signin-oidc">Sign in</button></p>';
  // }
  code += '</aside>';

  document.body.appendChild(fragmentFromString(code))

  var buttonSignIn = document.querySelector('#user-identity-input button.signin')
  if (! Config.User.WebIdDelegate)
    buttonSignIn.setAttribute('disabled', 'disabled')

  document.querySelector('#user-identity-input').addEventListener('click', e => {
    if (e.target.closest('button.close')) {
      var signinUser = document.querySelector('#document-menu button.signin-user')
      if (signinUser) {
        signinUser.disabled = false
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

  var buttonSignInOIDC = document.querySelector('#user-identity-input button.signin-oidc')
  if (buttonSignInOIDC) {
    buttonSignInOIDC.addEventListener('click', submitSignInOIDC)
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
    console.log('submitSignIn - no user url input')
    return Promise.resolve()
  }

  return setUserInfo(url, { oidc: false })
    .then(() => {
      var uI = document.getElementById('user-info')
      if (uI) {
        removeChildren(uI);
        uI.insertAdjacentHTML('beforeend', getUserSignedInHTML());
      }

      if (userIdentityInput) {
        userIdentityInput.parentNode.removeChild(userIdentityInput)
      }

      afterSignIn()
    })
}


function submitSignInOIDC (url) {
  var userIdentityInput = document.getElementById('user-identity-input')

  var popupUri = Config.OidcPopupUrl;

  if (solidAuth) {
    popupLogin({ popupUri })
      .then((session) => {
         if (session && session.webId) {
           console.log("Connected:", session.webId);
           setUserInfo(session.webId, { oidc: true })
            .then(() => {
              var uI = document.getElementById('user-info')
              if (uI) {
                removeChildren(uI);
                uI.insertAdjacentHTML('beforeend', getUserSignedInHTML());
              }

              if (userIdentityInput) {
                userIdentityInput.parentNode.removeChild(userIdentityInput)
              }

              afterSignIn()
            })
         }
      }).catch((err) => {
        console.log('submitSignInOIDC - '+err);
        return Promise.resolve();
      });
  }
}

function setUserInfo (subjectIRI, options = {}) {
  options.ui = Config.User.UI;

  return getSubjectInfo(subjectIRI, options).then(subject => {
    Object.keys(subject).forEach((key) => {
      Config.User[key] = subject[key];
    })
  });
}

function setContactInfo(subjectIRI, options = {}) {
  return getSubjectInfo(subjectIRI, options).then(subject => {
    Config.User['Contacts'] = Config.User.Contacts || {};
    Config.User.Contacts[subjectIRI] = subject;
  });
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

      if (!g || g.resource || (g && !Array.from(g.out().quads()).length)) {
        return {};
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
        OIDC: !!options.oidc,
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
      if (!agent.Graph) return agent;

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
function afterSignIn () {
  getResourceSupplementalInfo(Config.DocumentURL).then(resourceInfo => {
    updateFeatureStatesOfResourceInfo(resourceInfo);
    updateDocumentDoButtonStates();
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
      if (uI) {
        uI.replaceChildren(fragmentFromString(getUserSignedInHTML()))
      }

      showGeneralMessages();

      return updateLocalStorageProfile(Config.User)
    })
    .catch(e => {
      return Promise.resolve();
    });

  // var rA = document.querySelector('#document-menu .resource-notifications')
  // if(rA) { rA.removeAttribute('disabled') }

  var user = document.querySelectorAll('aside.do article *[rel~="dcterms:creator"] > *[about="' + Config.User.IRI + '"]');

  for (let i = 0; i < user.length; i++) {
    var article = user[i].closest('article')
    article.insertAdjacentHTML('afterbegin', '<button class="delete">' + Icon[".fas.fa-trash-alt"] + '</button>')
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
  afterSignIn,
  enableDisableButton,
  getUserSignedInHTML,
  getSubjectInfo,
  setUserInfo,
  setContactInfo,
  showUserIdentityInput,
  showUserSigninSignout,
  submitSignIn,
  submitSignInOIDC
}