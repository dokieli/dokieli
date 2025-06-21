'use strict'

import Config from './config.js';
import { getDateTimeISO, generateUUID, getHash, fragmentFromString, debounce } from './util.js';
import { accessModeAllowed, getDocument, updateMutableResource } from './doc.js';


// function initLocalStorage(key) {
//   if (typeof window.localStorage != 'undefined') {
//     enableLocalStorage(key);
//   }
// }

// function enableLocalStorage(key) {
//   Config.UseLocalStorage = true;
//   var o = localStorage.getItem(key);
//   try {
//     document.documentElement.replaceChildren(fragmentFromString(JSON.parse(o).object.content));
//     Config.init();
//   } catch(e){
//     // Ignore errors
//   }
//   console.log(getDateTimeISO() + ': ' + key + ' storage enabled.');
//   enableAutoSave(key, {'method': 'localStorage'});
// }

// function disableLocalStorage(key) {
//   Config.UseLocalStorage = false;
//   localStorage.removeItem(key);
//   disableAutoSave(key, {'method': 'localStorage'});
//   console.log(getDateTimeISO() + ': ' + key + ' storage disabled.');
// }


async function updateLocalStorageDocumentWithItem(key, data, options = {}) {
  if (!key) { Promise.resolve(); }

  data = data || getDocument();

  var collection = await getLocalStorageItem(key);
  // console.log(collection);

  var id = `${key}#${generateUUID()}`;

  var datetime = getDateTimeISO();
  options.datetime = options.datetime || datetime;

  if (!collection) {
    collection = {
      "@context": [
        "https://www.w3.org/ns/activitystreams",
        { "digestSRI": "https://www.w3.org/2018/credentials#digestSRI" }
      ],
      id: key,
      type: "OrderedCollection",
      items: [],
      autoSave: true
    }
  }

  collection['updated'] = options.datetime;
  collection.autoSave = (options.autoSave !== undefined) ? options.autoSave : collection.autoSave;
  collection.items.unshift(id);
  options.collectionKey = key;

  //TODO: Reconsider this key (which is essentially DO.C.DocumentURL) because there is a possibility that some other thing on that page will use the same key? We don't want to conflict with that. Perhaps the key in storage should be something unique, e.g., UUID, digestSRI, or something dokieli-specific? Probably dokieli-specific because we need to have a deterministic way of recalling it. Even if it is just `do-${DO.C.DocumentURL}` which would be sufficient.. or even digestSRI(DO.C.DocumentURL)
  localStorage.setItem(key, JSON.stringify(collection));

  Config.AutoSave.Items[options.collectionKey] ||= {};
  Config.AutoSave.Items[options.collectionKey].localStorage ||= {};

  console.log(datetime + `: ${key} saved.`);

  addLocalStorageDocumentItem(id, data, options);
}

async function updateLocalStorageItem(id, data) {
  let item = await getLocalStorageItem(id);

  if (!item) { return; }

  item = {
    ...item,
    ...data
  }

  localStorage.setItem(id, JSON.stringify(item));
}

//TODO removeLocalStorageDocumenItem

function addLocalStorageDocumentItem(id, data, options = {}) {
  data = data || getDocument();

  var datetime = options.datetime || getDateTimeISO();

  var item = {
    "@context": [
      "https://www.w3.org/ns/activitystreams",
      { "digestSRI": "https://www.w3.org/2018/credentials#digestSRI" }
    ],
    id: id,
    type: "Document",
    updated: datetime,
    mediaType: "text/html",
    content: data,
    digestSRI: options.digestSRI,
    partOf: options.collectionKey
  };

  if (options['init']) {
    item['published'] = datetime;
  }

  if (DO.C.User) {
    item['actor'] = DO.C.User.IRI;
  }

  localStorage.setItem(id, JSON.stringify(item));

  // if (options.autoSave) {
  Config.AutoSave.Items[options.collectionKey]['localStorage']['updated'] = item.updated;
  // }

  console.log(datetime + `: ${id} saved.`);
}

function updateHTTPStorageDocument(url, data, options = {}) {
  data = data || getDocument();

  var datetime = getDateTimeISO();

  updateMutableResource(url);

  // if (options.autoSave) {
  // Config.AutoSave.Items[url]['http']['updated'] = datetime;
  // }

  console.log(datetime + ': Document saved.');
}

function updateStorage(key, data, options = {}) {
  if (!key && !data) return;

  options['method'] = 'localStorage';

  switch (options.method) {
    default:
    case 'localStorage':
      updateLocalStorageDocumentWithItem(key, data, options);
      break;

    case 'http':
      updateHTTPStorageDocument(key, data, options);
      break;
  }
}

async function autoSave(key, options) {
  if (!key) return;

  // console.log(key, options);

  const data = getDocument();
  const hash = await getHash(data);

  // console.log(Config.AutoSave.Items[key]);

  const item = Config.AutoSave.Items[key]?.[options.method];
  // console.log(item);

  const hasMatchingDigest = item?.digestSRI === hash;
  // console.log(hasMatchingDigest);

  if (!hasMatchingDigest) {
    options['digestSRI'] = hash;

    try {
      await updateStorage(key, data, options);
      Config.AutoSave.Items[key] ||= {};
      Config.AutoSave.Items[key][options.method] ||= {};
      Config.AutoSave.Items[key][options.method].digestSRI = hash;
    } catch (error) {
      console.error(getDateTimeISO() + ': Error saving document: ', error);
    }
  }
}


async function enableAutoSave(key, options = {}) {
  if (!key) return;

  options['method'] = ('method' in options) ? options.method : 'localStorage';
  // options['autoSave'] = true;
  Config.AutoSave.Items[key] ||= {};
  Config.AutoSave.Items[key][options.method] ||= {};

  //TEMPORARY FOR TESTING
  // Config.AutoSave.Items[key]['http'] = {};

  let debounceTimeout;

  console.log(getDateTimeISO() + ': ' + key + ' ' + options.method + ' autosave enabled.');

  await autoSave(key, options);

  document.addEventListener('input', e => {
    if (e.target.closest('.ProseMirror[contenteditable]')) {
      // debounceTimeout = debounce(() => autoSave, Config.AutoSave.Timer)(key, options);
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
      debounceTimeout = setTimeout(() => autoSave(key, options), Config.AutoSave.Timer); // debounce delay 
      // Config.AutoSave.Items[key][options.method]['id'] = debounceTimeout;
    }
  })

}

async function disableAutoSave(key, options = {}) {
  if (!Config.AutoSave.Items[key]) { return; }

  options['method'] = ('method' in options) ? options.method : 'localStorage';
  // options['autoSave'] = true;

  let methods = Array.isArray(options.method) ? options.method : [options.method];

  for (const method of methods) {
    if (Config.AutoSave.Items[key][method]) {
      console.log(getDateTimeISO() + ': ' + key + ' ' + options.method + ' autosave disabled.');

      await autoSave(key, options);
      clearInterval(Config.AutoSave.Items[key][method].id);
      Config.AutoSave.Items[key][method] = undefined;
    }
  }
}

function removeLocalStorageItem(key) {
  if (!key) { Promise.resolve(); }

  console.log(getDateTimeISO() + ': ' + key + ' removed from local storage.')

  if (Config.WebExtension) {
    var browser = (typeof browser !== 'undefined') ? browser : chrome;

    return browser.storage.sync.remove(key);
  }
  else if (window.localStorage) {
    return Promise.resolve(localStorage.removeItem(key));
  }
  else {
    return Promise.reject({ 'message': 'storage is unavailable' })
  }
}

async function removeLocalStorageDocumentItems(key) {
  if (!key) return Promise.resolve();

  const collection = await getLocalStorageItem(key);

  if (!collection) return;

  if (collection.items) {
    for (const item of collection.items) {
      await removeLocalStorageItem(item);
    }
  }

  await removeLocalStorageItem(key);
}

async function removeLocalStorageAsSignOut() {
  removeLocalStorageDocumentItems(DO.C.DocumentURL);

  removeLocalStorageItem('DO.C.User');
}

function getLocalStorageItem(key) {
  if (!key) { Promise.resolve(); }

  if (Config.WebExtension) {
    if (typeof browser !== 'undefined') {
      return browser.storage.sync.get(key).then(o => { return o[key]; });
    }
    else {
      var value = {};
      chrome.storage.sync.get(key, o => { value = o[key]; })

      // eslint-disable-next-line no-unused-vars
      return new Promise((resolve, reject) => {
        window.setTimeout(() => {
          return resolve(value)
        }, 50);
      });
    }
  }
  else if (window.localStorage) {
    var o = localStorage.getItem(key);
    let value = null;
    try {
      value = JSON.parse(o);
    } catch (e) {
      value = null;
    }
    return Promise.resolve(value);
  }
  else {
    return Promise.reject({ 'message': 'storage is unavailable' })
  }
}

function updateLocalStorageProfile(User) {
  if (!User.IRI) { return Promise.resolve({ 'message': 'User.IRI is not set' }); }

  var U = { ...User };
  var key = 'DO.C.User'

  var id = generateUUID();
  var datetime = getDateTimeISO();

  //Graphs seem to be cyclic and not allowed in localStorage, so we delete.
  U.Graph && delete U.Graph;
  U.Preferences?.graph && delete U.Preferences.graph;
  Object.entries(U.Contacts).forEach(([key, contact]) => {
    contact.Graph && delete contact.Graph;
    contact.Preferences?.graph && delete contact.Preferences.graph;
  });

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
      return browser.storage.sync.set({ [key]: object });
    }
    else {
      return Promise.resolve(chrome.storage.sync.set({ [key]: object }));
    }
  }
  else if (window.localStorage) {
    // console.log(datetime + ': User ' + User.IRI + ' saved.');
    return Promise.resolve(localStorage.setItem(key, JSON.stringify(object)));
  }
  else {
    return Promise.reject({ 'message': 'storage is unavailable' })
  }
}

//XXX: Currently unused but needs to be revisited when there is a UI to allow user to disable autosave
// function showAutoSaveStorage(node, iri) {
//   iri = iri || Config.DocumentURL;

//   if (document.querySelector('#autosave-items')) { return; }

//   var checked;
//   var useLocalStorage = '';
//   if (window.localStorage) {
//     checked = (Config.AutoSave.Items[iri] && Config.AutoSave.Items[iri]['localStorage']) ? ' checked="checked"' : '';

//     //XXX: May bring this back somewhere else.
//     // useLocalStorage = '<li class="local-storage-html-autosave"><input id="local-storage-html-autosave" class="autosave" type="checkbox"' + checked +' /> <label for="local-storage-html-autosave">' + (Config.AutoSave.Timer / 60000) + 'm autosave (local storage)</label></li>';

//     //XXX: Enabling autoSave for localStorage
//     enableAutoSave(iri, {'method': 'localStorage'});
//   }

//   if (accessModeAllowed(iri, 'write') && navigator.onLine) {
//     checked = (Config.AutoSave.Items[iri] && Config.AutoSave.Items[iri]['http']) ? ' checked="checked"' : '';

//     var useHTTPStorage = '<li class="http-storage-html-autosave"><input id="http-storage-html-autosave" class="autosave" type="checkbox"' + checked +' /> <label for="http-storage-html-autosave">' + (Config.AutoSave.Timer / 60000) + 'm autosave (http)</label></li>';

//     node.insertAdjacentHTML('beforeend', '<ul id="autosave-items" class="on">' + useLocalStorage + useHTTPStorage + '</ul>');

//     node.querySelector('#autosave-items').addEventListener('click', e => {
//       if (e.target.closest('input.autosave')) {
//         var method;
//         switch (e.target.id){
//           default:
//           case 'local-storage-html-autosave':
//             method = 'localStorage';
//             break;
//           case 'http-storage-html-autosave':
//             method = 'http';
//             break;
//         }

//         if (e.target.getAttribute('checked')) {
//           e.target.removeAttribute('checked');
//           disableAutoSave(iri, {'method': method});
//         }
//         else {
//           e.target.setAttribute('checked', 'checked');
//           enableAutoSave(iri, {'method': method});
//         }
//       }
//     });
//   }
// }

// function hideAutoSaveStorage(node, iri) {
//   node = node || document.getElementById('autosave-items');

//   if (!node) { return; }

//   iri = iri || Config.DocumentURL;
//   node.parentNode.removeChild(node);
//   disableAutoSave(iri);
//   //XXX: Disabling autoSave for localStorage (as it was enabled by default)
//   if (Config.AutoSave.Items[iri] && Config.AutoSave.Items[iri]['localStorage']) {
//     disableAutoSave(iri, {'method': 'localStorage'});
//   }
// }


export {
  // initLocalStorage,
  // enableLocalStorage,
  // disableLocalStorage,
  updateHTTPStorageDocument,
  enableAutoSave,
  disableAutoSave,
  autoSave,
  updateLocalStorageItem,
  addLocalStorageDocumentItem,
  getLocalStorageItem,
  removeLocalStorageItem,
  removeLocalStorageDocumentItems,
  removeLocalStorageAsSignOut,
  updateLocalStorageProfile,
  // showAutoSaveStorage,
  // hideAutoSaveStorage
}