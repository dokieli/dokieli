'use strict'

const Config = require('./config')
const fetcher = require('./fetcher')
const util = require('./util')
const uri = require('./uri')
const storage = require('./storage')

// const { OIDCWebClient } = require('@trust/oidc-web')

module.exports = {
  afterSignIn,
  enableDisableButton,
  getAgentImage,
  getAgentName,
  getAgentURL,
  getAgentStorage,
  getAgentOutbox,
  getAgentInbox,
  getAgentKnows,
  getAgentSupplementalInfo,
  getAgentSeeAlso,
  getUserContacts,
  getUserHTML,
  getUserSignedInHTML,
  setUserInfo,
  showUserIdentityInput,
  showUserSigninSignout,
  submitSignIn,
  processSameAs
}


function getUserHTML () {
  let userName = Config.SecretAgentNames[Math.floor(Math.random() * Config.SecretAgentNames.length)]

  if (Config.User.Name) {
    // XXX: We have the IRI already
    userName = '<span about="' + Config.User.IRI + '" property="schema:name">' +
      Config.User.Name + '</span>'
  }

  let userImage = ''

  if ('Image' in Config.User && typeof Config.User.Image !== 'undefined' && Config.User.Image.length > 0) {
    userImage = '<img alt="" height="48" rel="schema:image" src="' +
      Config.User.Image + '" width="48" /> '
  }

  let user = ''

  if ('IRI' in Config.User && Config.User.IRI !== null && Config.User.IRI.length > 0) {
    user = '<span about="' + Config.User.IRI + '" typeof="schema:Person">' +
      userImage + '<a rel="schema:url" href="' + Config.User.IRI + '"> ' +
      userName + '</a></span>'
  } else {
    user = '<span typeof="schema:Person">' + userName + '</span>'
  }

  return user
}

function getUserSignedInHTML() {
  return getUserHTML() + '<button class="signout-user" title="Live long and prosper"><i class="fa fa-hand-spock-o"></i></button>'
}


function showUserSigninSignout (node) {
  var userInfo = document.getElementById('user-info');

  if (!userInfo) {
    var s = ''

    if (Config.User.IRI) {
      s = getUserSignedInHTML()
    }
    else {
      s = '<button class="signin-user" title="Sign in to authenticate"><i class="fa fa-user-secret fa-2x"></i>Sign in</button>'
    }

    node.insertAdjacentHTML('beforeend', '<section id="user-info">' + s + '</section>')

    userInfo = document.getElementById('user-info')

    userInfo.addEventListener('click', function(e) {
      e.preventDefault()
      e.stopPropagation()

      if (Config.User.OIDC && solid && solid.auth) {
        solid.auth.logout();
      }

      if (e.target.closest('.signout-user')) {
        storage.removeStorageProfile()

        Config.User = {
          IRI: null,
          Role: null,
          UI: {}
        }

        util.removeChildren(node);

        showUserSigninSignout(document.querySelector('#document-menu header'))
      }
    });

    var su = document.querySelector('#document-menu button.signin-user')
    if (su) {
      su.addEventListener('click', showUserIdentityInput)
    }

    var rA = document.querySelector('#document-menu .resource-activities')
    if(rA) { rA.setAttribute('disabled', 'disabled') }
  }
}


function showUserIdentityInput (e) {
  if (typeof e !== 'undefined') {
    e.target.disabled = true
  }

  var webid = Config.User.WebIdDelegate ? Config.User.WebIdDelegate : "";
  var code = '<aside id="user-identity-input" class="do on">' + DO.C.Button.Close + '<h2>Sign in with WebID</h2><label>HTTP(S) IRI</label> <input id="webid" type="text" placeholder="http://csarven.ca/#i" value="'+webid+'" name="webid"/> <button class="signin">Sign in</button>';
  if (window.location.protocol === "https:")
    code += ' <h2>Sign in with OIDC</h2> <button class="signin_oidc">Sign in OIDC</button>';

  code += ' </aside>';

  document.documentElement.appendChild(DO.U.fragmentFromString(code))

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

  var inputWebid = document.querySelector('#user-identity-input input#webid')

  buttonSignIn.addEventListener('click', submitSignIn)

  let events = ['keyup', 'cut', 'paste', 'input']

  events.forEach(eventType => {
    inputWebid.addEventListener(eventType, e => { enableDisableButton(e, buttonSignIn) })
  })

  var buttonSignInOIDC = document.querySelector('#user-identity-input button.signin_oidc')
  buttonSignInOIDC.addEventListener('click', submitSignInOIDC)

  inputWebid.focus()
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
      userIdentityInput.insertAdjacentHTML('beforeend',
        '<i class="fa fa-circle-o-notch fa-spin fa-fw"></i>')
    }

    url = userIdentityInput.querySelector('input#webid').value.trim()
  }

  if (!url) {
    console.log('submitSignIn - no user url input')
    return Promise.resolve()
  }

  return setUserInfo(url, false)
    .then(() => {
      var uI = document.getElementById('user-info')
      if (uI) {
        util.removeChildren(uI);
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

  if (solid && solid.auth) {
    solid.auth
      .popupLogin({ popupUri })
      .then((session) => {
         if (session && session.webId) {
           console.log("Connected:", session.webId);
           setUserInfo(session.webId, true)
            .then(() => {
              var uI = document.getElementById('user-info')
              if (uI) {
                util.removeChildren(uI);
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

/**
 * @param userIRI {string}
 *
 * @returns {Promise}
 */
function setUserInfo (userIRI, oidc) {
  if (!userIRI) {
    return Promise.reject(new Error('Could not set user info - no user IRI'))
  }

  return fetcher.getResourceGraph(userIRI)
    .then(g => {
      var s = g.child(userIRI)

      Config.User.Graph = s
      Config.User.IRI = userIRI
      Config.User.Name = getAgentName(s)
      Config.User.Image = getAgentImage(s)
      Config.User.URL = getAgentURL(s)
      Config.User.OIDC = oidc ? true : false;

      Config.User.Contacts = {}
      Config.User.Knows = getAgentKnows(s)
      Config.User.SameAs = []
      Config.User.SeeAlso = []

      Config.User.Storage = getAgentStorage(s)
      Config.User.Outbox = getAgentOutbox(s)
      Config.User.Inbox = getAgentInbox(s)

      var preferredProxy = getAgentPreferredProxy(s)
      Config.ProxyURL = (preferredProxy) ? preferredProxy : Config.ProxyURL

      if (s.preferencesFile && s.preferencesFile.length > 0) {
        Config.User.PreferencesFile = s.preferencesFile

        // TODO: Reconsider if/where to use this.
        // setUserWorkspaces(Config.User.PreferencesFile)
      }
      return Config.User
    })
}

function afterSignIn () {
  var promises = [];

  promises.push(getAgentSupplementalInfo(Config.User.IRI))

  promises.push(getAgentSeeAlso(Config.User.Graph))

  Promise.all(promises)
    .then(function(results) {
      var uI = document.getElementById('user-info')
      if (uI) {
        uI.innerHTML = getUserSignedInHTML()
      }

      return storage.updateStorageProfile(Config.User)
    })
    .catch(function(e) {
      return Promise.resolve();
    });

  var rA = document.querySelector('#document-menu .resource-activities')
  if(rA) { rA.removeAttribute('disabled') }

  var user = document.querySelectorAll('aside.do article *[rel~="schema:creator"] > *[about="' + Config.User.IRI + '"]')
  for (let i = 0; i < user.length; i++) {
    var article = user[i].closest('article')
    article.insertAdjacentHTML('afterbegin', '<button class="delete"><i class="fa fa-trash"></i></button>')
  }

  var buttonDelete = document.querySelectorAll('aside.do blockquote[cite] article button.delete')

  for (let i = 0; i < buttonDelete.length; i++) {
    buttonDelete[i].addEventListener('click', function (e) {
      e.preventDefault()
      e.stopPropagation()
      var article = e.target.closest('article')
      var refId = 'r-' + article.id
      var noteIRI = article.closest('blockquote[cite]')
      noteIRI = noteIRI.getAttribute('cite')

      fetcher.deleteResource(noteIRI)
        .then(() => {
          var aside = e.target.closest('aside.do')
          aside.parentNode.removeChild(aside)
          var span = document.querySelector('span[resource="#' + refId + '"]')
          span.outerHTML = span.querySelector('mark').textContent
          // TODO: Delete notification or send delete activity
        })
    })
  }
}

function getAgentSupplementalInfo(iri) {
  if (iri == Config.User.IRI) {
    return processSameAs(Config.User.Graph, getAgentSupplementalInfo);
  }
  else {
    return fetcher.getResourceGraph(iri).then(
      function(g){
        if(typeof g._graph == 'undefined') {
          return Promise.resolve([]);
        }
        var s = g.child(iri);

        Config.User.Name = Config.User.Name || getAgentName(s);

        Config.User.Image = Config.User.Image || getAgentImage(s);

        var storage = getAgentStorage(s) || [];
        var outbox = getAgentOutbox(s) || [];
        var knows = getAgentKnows(s) || [];

        if (storage.length > 0) {
          Config.User.Storage = (Config.User.Storage)
            ? util.uniqueArray(Config.User.Storage.concat(storage))
            : storage;
        }

        if (outbox.length > 0) {
          Config.User.Outbox = (Config.User.Outbox)
            ? util.uniqueArray(Config.User.Outbox.concat(outbox))
            : outbox;
        }

        if (knows.length > 0) {
          Config.User.Knows = (Config.User.Knows)
            ? util.uniqueArray(Config.User.Knows.concat(knows))
            : knows;
        }

        return processSameAs(s, getAgentSupplementalInfo);
      },
      function(reason){
        return Promise.resolve([]);
      });
  }
}

function getAgentSeeAlso(g, baseURI, subjectURI) {
  if (!g) { return; }

  subjectURI = baseURI = baseURI || g.iri().toString();

  var seeAlso = g.child(baseURI).rdfsseeAlso;

  if (seeAlso && seeAlso._array.length > 0) {
    var iris = [];
    var promises = [];

    seeAlso._array.forEach(function(iri){
      if (Config.User.SeeAlso.indexOf(iri) < 0) {
        iris.push(iri)
      }
    });

    iris.forEach(function(iri){
      Config.User.SeeAlso = util.uniqueArray(Config.User.SeeAlso.concat(iri));

      fetcher.getResourceGraph(iri)
        .then(g => {

          var s = g.child(subjectURI)

          var knows = getAgentKnows(s) || [];

          if (knows.length > 0) {
            Config.User.Knows = (Config.User.Knows)
              ? util.uniqueArray(Config.User.Knows.concat(knows))
              : knows;
          }

          promises.push(getAgentSeeAlso(g, iri, subjectURI))
        })
    });

    Promise.all(promises)
      .then(function(results) {
        return Promise.resolve([]);
      })
      .catch(function(e) {
        return Promise.resolve([]);
      });
  }
  else {
    return Promise.resolve([])
  }
}

function getUserContacts(iri) {
  var fyn = function(iri){
    if ((iri == Config.User.IRI) && Config.User.Graph) {
      return processSameAs(Config.User.Graph, getUserContacts);
    }
    else {
      return fetcher.getResourceGraph(iri).then(
        function(g){
          if(typeof g._graph == 'undefined') {
            return Promise.resolve([]);
          }

          var s = g.child(iri);

          var knows = getAgentKnows(s) || [];

          if (knows.length > 0) {
            Config.User.Knows = (Config.User.Knows)
              ? util.uniqueArray(Config.User.Knows.concat(knows))
              : knows;
          }

          return processSameAs(s, getUserContacts);
        },
        function(reason){
          return Promise.resolve([]);
        });
    }
  }

  return fyn(iri).then(function(i){ return Config.User.Knows || []; });
}

function processSameAs(s, callback) {
  if (s.owlsameAs && s.owlsameAs._array.length > 0){
    var iris = s.owlsameAs._array;
    var promises = [];
    iris.forEach(function(iri){
// console.log(iri);
      if(iri != Config.User.IRI && Config.User.SameAs.indexOf(iri) < 0) {
        Config.User.SameAs = util.uniqueArray(Config.User.SameAs.concat(iri));

        if (typeof callback !== 'undefined') {
          promises.push(callback(iri));
        }
        else {
          promises.push(Promise.resolve(Config.User.SameAs));
        }
      }
    });

    return Promise.all(promises)
      .then(function(results) {
        return Promise.resolve([]);
      })
      .catch(function(e) {
        return Promise.resolve([]);
      });
  }
  else {
    return Promise.resolve([]);
  }
}

function getAgentPreferredProxy (s) {
  return s.solidpreferredProxy || undefined
}

function getAgentImage (s) {
  return s.foafimg || s.schemaimage || s.vcardphoto || s.vcardhasPhoto || s.asimage ||
    s.siocavatar || s.foafdepiction || undefined
}

function getAgentName (s) {
  var name = s.foafname || s.schemaname || s.vcardfn || s.asname || s.rdfslabel || undefined
  if (typeof name === 'undefined') {
    if (s.schemafamilyName && s.schemafamilyName.length > 0 && s.schemagivenName && s.schemagivenName.length > 0) {
      name = s.schemagivenName + ' ' + s.schemafamilyName
    } else if (s.foaffamilyName && s.foaffamilyName.length > 0 && s.foafgivenName && s.foafgivenName.length > 0) {
      name = s.foafgivenName + ' ' + s.foaffamilyName
    } else if (s.vcardfamilyname && s.vcardfamilyname.length > 0 && s.vcardgivenname && s.vcardgivenname.length > 0) {
      name = s.vcardgivenname + ' ' + s.vcardfamilyname
    } else if (s.foafnick && s.foafnick.length > 0) {
      name = s.foafnick
    } else if (s.vcardnickname && s.vcardnickname.length > 0) {
      name = s.vcardnickname
    }
  }
  return name
}

function getAgentURL (s) {
    return s.foafhomepage || s.foafweblog || s.schemaurl || s.vcardurl || undefined
}

function getAgentStorage (s) {
  return (s.pimstorage && s.pimstorage._array.length > 0)
    ? s.pimstorage._array
    : undefined
}

function getAgentOutbox (s) {
  return (s.asoutbox && s.asoutbox._array.length > 0)
    ? s.asoutbox._array
    : undefined
}

function getAgentInbox (s) {
  return (s.ldpinbox && s.ldpinbox._array.length > 0)
    ? s.ldpinbox._array
    : undefined
}

function getAgentKnows (s) {
  var knows = [];

  if(s.foafknows && s.foafknows._array.length > 0){
    knows = knows.concat(s.foafknows._array);
  }
  if(s.schemaknows && s.schemaknows._array.length > 0){
    knows = knows.concat(s.schemaknows._array);
  }

  knows = util.uniqueArray(knows);

  return (knows.length > 0) ? knows : undefined;
}
