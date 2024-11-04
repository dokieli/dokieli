'use strict'

import Config from './config.js';
import { getDateTimeISO, generateUUID, getHash } from './util.js';
import { getDocument, updateMutableResource } from './doc.js';


function initLocalStorage(key) {
  if (typeof window.localStorage != 'undefined') {
    enableLocalStorage(key);
  }
}

function enableLocalStorage(key) {
  Config.UseLocalStorage = true;
  var o = localStorage.getItem(key);
  try {
    document.documentElement.innerHTML = JSON.parse(o).object.content;
    Config.init();
  } catch(e){
    // Ignore errors
  }
  console.log(getDateTimeISO() + ': ' + key + ' storage enabled.');
  enableAutoSave(key, {'method': 'localStorage'});
}

function disableLocalStorage(key) {
  Config.UseLocalStorage = false;
  localStorage.removeItem(key);
  disableAutoSave(key, {'method': 'localStorage'});
  console.log(getDateTimeISO() + ': ' + key + ' storage disabled.');
}

function updateLocalStorageDocument(key, data, options) {
  data = data || getDocument();
  options = options || {};

  var id = generateUUID();

  var datetime = getDateTimeISO();

  var object = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "id": id,
    "type": "Update",
    "object": {
      "id": key,
      "type": "Document",
      "updated": datetime,
      "mediaType": "text/html",
      "content": data
    }
  };

  localStorage.setItem(key, JSON.stringify(object));

  if (options.autoSave) {
    Config.AutoSave.Items[key]['localStorage']['updated'] = object.object.updated;
  }

  console.log(datetime + ': Document saved.');
}

function updateHTTPStorageDocument(url, data, options) {
  data = data || getDocument();
  options = options || {};

  var datetime = getDateTimeISO();

  updateMutableResource(url);

  if (options.autoSave) {
    Config.AutoSave.Items[url]['http']['updated'] = datetime;
  }

  console.log(datetime + ': Document saved.');
}

function enableAutoSave(key, options) {
  options = options || {};
  options['method'] = ('method' in options) ? options.method : 'localStorage';
  options['autoSave'] = true;
  Config.AutoSave.Items[key] = (Config.AutoSave.Items[key]) ? Config.AutoSave.Items[key] : {};
  Config.AutoSave.Items[key][options.method] = (Config.AutoSave.Items[key][options.method]) ? Config.AutoSave.Items[key][options.method] : {};

  var id;

  switch (options.method) {
    default:
    case 'localStorage':
      id = setInterval(function() {
        var data = getDocument();
        getHash(data).then(hash => {
          if (!('hash' in Config.AutoSave.Items[key][options.method] && Config.AutoSave.Items[key][options.method].hash == hash)) {
            updateLocalStorageDocument(key, data, options);
            Config.AutoSave.Items[key][options.method]['hash'] = hash;
          }
        });
      }, Config.AutoSave.Timer);
      break;

    case 'http':
      id = setInterval(function() {
        var data = getDocument();
        getHash(data).then(hash => {
          if (!('hash' in Config.AutoSave.Items[key][options.method] && Config.AutoSave.Items[key][options.method].hash == hash)) {
            updateHTTPStorageDocument(key, data, options);
            Config.AutoSave.Items[key][options.method]['hash'] = hash;
          }
        });
      }, Config.AutoSave.Timer);
      break;
  }

  Config.AutoSave.Items[key][options.method]['id'] = id;

  console.log(getDateTimeISO() + ': ' + key + ' ' + options.method + ' autosave enabled.');
}

function disableAutoSave(key, options) {
  options = options || {};
  var methods;
  if(!Config.AutoSave.Items[key]) { return; }

  if('method' in options) {
    methods = (Array.isArray(options.method)) ? options.method : [options.method];

    methods.forEach(method => {
      if (Config.AutoSave.Items[key][method]) {
        clearInterval(Config.AutoSave.Items[key][method].id);
        Config.AutoSave.Items[key][method] = undefined;
        console.log(getDateTimeISO() + ': ' + key + ' ' + options.method + ' autosave disabled.');
      }
    })
  }
}

function removeLocalStorageItem(key) {
  if (!key) { Promise.resolve(); }

  // console.log(getDateTimeISO() + ': ' + key + ' removed.')

  if (Config.WebExtension) {
    var browser = (typeof browser !== 'undefined') ? browser : chrome;

    return browser.storage.sync.remove(key);
  }
  else if (window.localStorage) {
    return Promise.resolve(localStorage.removeItem(key));
  }
  else {
    return Promise.reject({'message': 'storage is unavailable'})
  }
}

function removeLocalStorageProfile(key) {
  key = key || 'DO.C.User';

  return removeLocalStorageItem(key)
}

function getLocalStorageProfile(key) {
  key = key || 'DO.C.User'

  if (Config.WebExtension) {
    if (typeof browser !== 'undefined') {
      return browser.storage.sync.get(key).then(function(o){ return o[key]; });
    }
    else {
      var value = {};
      chrome.storage.sync.get(key, function(o){ value = o[key]; })

      // eslint-disable-next-line no-unused-vars
      return new Promise(function(resolve, reject){
        window.setTimeout(function() {
          return resolve(value)
        }, 50);
      });
    }
  }
  else if (window.localStorage) {
    var o = localStorage.getItem(key);
    return Promise.resolve(JSON.parse(o));
  }
  else {
    return Promise.reject({'message': 'storage is unavailable'})
  }
}

function updateLocalStorageProfile(User) {
  if (!User.IRI) { return Promise.resolve({'message': 'User.IRI is not set'}); }

  var U = {...User};
  var key = 'DO.C.User'

  var id = generateUUID();
  var datetime = getDateTimeISO();

  //Need to remove SimpleRDF graphs because they're cyclic.
  if (U.Graph) {
    delete U.Graph
  }
  if (U.Preferences && U.Preferences.graph) {
    delete U.Preferences.graph
  }

  if (U.Contacts) {
    U.Contacts = {}
  }

  var object = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "id": id,
    "type": "Update",
    "object": {
      "id": key,
      "type": "Profile",
      "describes": U
    },
    "datetime": datetime,
    "actor": U.IRI
  };

  if (Config.WebExtension) {
    if (typeof browser !== 'undefined') {
      return browser.storage.sync.set({[key]: object});
    }
    else {
      return Promise.resolve(chrome.storage.sync.set({[key]: object}));
    }
  }
  else if (window.localStorage) {
    // console.log(datetime + ': User ' + User.IRI + ' saved.');
    return Promise.resolve(localStorage.setItem(key, JSON.stringify(object)));
  }
  else {
    return Promise.reject({'message': 'storage is unavailable'})
  }
}

function showAutoSaveStorage(node, iri) {
  iri = iri || Config.DocumentURL;

  if(document.querySelector('#autosave-items')) { return; }

  var checked;
  var useLocalStorage = '';
  if (window.localStorage) {
    checked = (Config.AutoSave.Items[iri] && Config.AutoSave.Items[iri]['localStorage']) ? ' checked="checked"' : '';

    //XXX: May bring this back somewhere else.
    // useLocalStorage = '<li class="local-storage-html-autosave"><input id="local-storage-html-autosave" class="autosave" type="checkbox"' + checked +' /> <label for="local-storage-html-autosave">' + (Config.AutoSave.Timer / 60000) + 'm autosave (local storage)</label></li>';

    //XXX: Enabling autoSave for localStorage
    enableAutoSave(iri, {'method': 'localStorage'});
  }

  checked = (Config.AutoSave.Items[iri] && Config.AutoSave.Items[iri]['http']) ? ' checked="checked"' : '';

  var useHTTPStorage = '<li class="http-storage-html-autosave"><input id="http-storage-html-autosave" class="autosave" type="checkbox"' + checked +' /> <label for="http-storage-html-autosave">' + (Config.AutoSave.Timer / 60000) + 'm autosave (http)</label></li>';
  // var useHTTPStorage = '';

  node.insertAdjacentHTML('beforeend', '<ul id="autosave-items" class="on">' + useLocalStorage + useHTTPStorage + '</ul>');

  node.querySelector('#autosave-items').addEventListener('click', function(e) {
    if (e.target.closest('input.autosave')) {
      var method;
      switch (e.target.id){
        default:
        case 'local-storage-html-autosave':
          method = 'localStorage';
          break;
        case 'http-storage-html-autosave':
          method = 'http';
          break;
      }

      if (e.target.getAttribute('checked')) {
        e.target.removeAttribute('checked');
        disableAutoSave(iri, {'method': method});
      }
      else {
        e.target.setAttribute('checked', 'checked');
        enableAutoSave(iri, {'method': method});
      }
    }
  });
}

function hideAutoSaveStorage(node, iri) {
  node = node || document.getElementById('autosave-items');
  iri = iri || Config.DocumentURL;
  node.parentNode.removeChild(node);
  disableAutoSave(iri);
  //XXX: Disabling autoSave for localStorage (as it was enabled by default)
  if (Config.AutoSave.Items[iri] && Config.AutoSave.Items[iri]['localStorage']) {
    disableAutoSave(iri, {'method': 'localStorage'});
  }
}


export {
  initLocalStorage,
  enableLocalStorage,
  disableLocalStorage,
  updateLocalStorageDocument,
  updateHTTPStorageDocument,
  enableAutoSave,
  disableAutoSave,
  removeLocalStorageItem,
  removeLocalStorageProfile,
  getLocalStorageProfile,
  updateLocalStorageProfile,
  showAutoSaveStorage,
  hideAutoSaveStorage
}