import rdf from 'rdf-ext';
import Config from './config.js'
import { deleteResource } from './fetcher.js'
import { removeChildren, fragmentFromString } from './util.js'
import { getAgentHTML, showActionMessage, showGeneralMessages, getResourceSupplementalInfo, updateDocumentDoButtonStates, updateFeatureStatesOfResourceInfo, handleDeleteNote } from './doc.js'
import { Icon } from './ui/icons.js'
import { getResourceGraph, getAgentName, getGraphImage, getAgentURL, getAgentPreferredProxy, getAgentPreferredPolicy, getAgentPreferredPolicyRule, setPreferredPolicyInfo, getAgentDelegates, getAgentKnows, getAgentFollowing, getAgentStorage, getAgentOutbox, getAgentInbox, getAgentPreferencesFile, getAgentPublicTypeIndex, getAgentPrivateTypeIndex, getAgentTypeIndex, getAgentSupplementalInfo, getAgentSeeAlso, getAgentPreferencesInfo, getAgentLiked, getAgentOccupations, getAgentPublications, getAgentMade, getAgentOIDCIssuer } from './graph.js'
import { removeLocalStorageDocument, removeLocalStorageProfile, updateLocalStorageProfile } from './storage.js'
import { getButtonHTML } from './ui/button-icons.js';
import { Session } from '@uvdsl/solid-oidc-client-browser';

const ns = Config.ns;
Config['Session'] = new Session();

export async function restoreSession() {
  return Config['Session'].handleRedirectFromLogin();
}

function getUserSignedInHTML() {
  return getAgentHTML() + getButtonHTML({ button: 'signout', buttonClass: 'signout-user', buttonTitle: 'Live long and prosper' });
}

function getUserSignInHTML() {
  return getButtonHTML({ button: 'signin', buttonClass: 'signin-user', buttonTitle: 'Sign in to authenticate', buttonTextContent: 'Sign in', iconSize: 'fa-2x' })
}

async function showUserSigninSignout (node) {
  var webId = Config['Session'].isActive ? Config['Session'].webId : null;

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

    const signedInHTML = getUserSignedInHTML();
    const signInHTML = getUserSignInHTML();

    //Checks if already know the user from prior load of the page
    userInfoHTML = Config.User.IRI ? signedInHTML : signInHTML;

    node.insertAdjacentHTML('afterbegin', userInfoHTML);

    node.addEventListener('click', async (e) => {
      var buttonSignIn = e.target.closest('.signin-user');

      if (buttonSignIn) {
        buttonSignIn.disabled = true;
        showUserIdentityInput();
      }
      else if (e.target.closest('.signout-user')) {
        removeLocalStorageDocument()

        //Sign out for real
        if (Config['Session']?.isActive) {
          await Config['Session'].logout();
        }

        //Remove traces of the user from localStorage
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

        //Clean up the user-info so it can be reconstructed
        removeChildren(node);

        node.insertAdjacentHTML('afterbegin', signInHTML);

        //Signed out so update button states
        getResourceSupplementalInfo(Config.DocumentURL).then(resourceInfo => {
          updateFeatureStatesOfResourceInfo(resourceInfo);
          updateDocumentDoButtonStates();
        });
      }
    });

}


function showUserIdentityInput () {
  var signInUser = document.querySelector('#document-menu button.signin-user');

  if (signInUser) {
    signInUser.disabled = true;
  }

  var webid = Config.User.WebIdDelegate ? Config.User.WebIdDelegate : "";
  var code = `<aside id="user-identity-input" class="do on">${Config.Button.Close}<h2>Sign in ${getButtonHTML({ button: 'info', buttonClass: 'info', buttonTitle: 'About Sign in', buttonRel: 'rel:help', buttonResource: Config.ButtonInfo['feature-sign-in'] })}</h2><div class="info"></div><p id="user-identity-input-webid"><label>WebID</label> <input id="webid" type="text" placeholder="https://csarven.ca/#i" value="${webid}" name="webid"/> <button class="signin">Sign in</button></p></aside>`;

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
        uI.insertAdjacentHTML('beforeend', getUserSignedInHTML());
      }

      if (userIdentityInput) {
        userIdentityInput.parentNode.removeChild(userIdentityInput)
      }

      if (Config.User.IRI && !Config.User.OIDCIssuer) {
        const message = {
          'content': 'OIDC issuer not found in profile, not signed in. Using information from profile to personalise the UI.',
          'type': 'info',
          'timer': null
        }

        showActionMessage(document.body, message);

        afterSetUserInfo();
      }
      else if (Config.User.IRI) {
        signInWithOIDC()
          .catch(e => {
            const message = {
              'content': 'Cannot sign in. Using information from profile to personalise the UI.',
              'type': 'info',
              'timer': null
            }

            showActionMessage(document.body, message);

            afterSetUserInfo();
          })
      }
    })
}

//XXX: User Profile should've been fetch by now.
 async function signInWithOIDC() {
  const idp = Config.User.OIDCIssuer;

  const redirect_uri = window.location.href.split('#')[0];

  // Redirects away from dokieli :( but hopefully only briefly :)
  Config['Session'].login(idp, redirect_uri)
    .catch((e) => {
      const message = {
        'content': 'Cannot sign in. Using information from profile to personalise the UI.',
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
  afterSetUserInfo,
  enableDisableButton,
  getUserSignedInHTML,
  getUserSignInHTML,
  getSubjectInfo,
  setUserInfo,
  setContactInfo,
  showUserIdentityInput,
  showUserSigninSignout,
  submitSignIn
}
