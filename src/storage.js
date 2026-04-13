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

import { get as idbGet, set as idbSet, del as idbDel, createStore as idbCreateStore } from 'idb-keyval';

// Named database to avoid colliding with idb-keyval's default store.
const DB_NAME = 'dokieli';
const STORE_NAME = 'keyval';
let store = idbCreateStore(DB_NAME, STORE_NAME);

// If the DB was partially cleared (store missing), delete it and rebuild.
function idbRebuildStore() {
  return new Promise(resolve => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = () => {
      store = idbCreateStore(DB_NAME, STORE_NAME);
      resolve();
    };
  });
}
async function get(key) {
  try { return await idbGet(key, store); }
  catch { await idbRebuildStore(); return idbGet(key, store); }
}
async function set(key, value) {
  try { return await idbSet(key, value, store); }
  catch { await idbRebuildStore(); return idbSet(key, value, store); }
}
async function del(key) {
  try { return await idbDel(key, store); }
  catch { await idbRebuildStore(); return idbDel(key, store); }
}

import Config from './config.js';
import { getDateTimeISO, generateUUID } from './util.js';
import { getDocument, updateMutableResource } from './doc.js';

export async function updateDeviceStorageDocumentWithItem(key, data, options = {}) {
  if (!key) { return Promise.resolve(); }

  const documentOptions = {
    ...Config.DOMProcessing,
    format: true,
    sanitize: true,
    normalize: true
  };

  data = data || getDocument(null, documentOptions);

  var collection = await getDeviceStorageItem(key);
  // console.log(collection);

  var id = `${key}#${generateUUID()}`;

  var datetime = getDateTimeISO();

  let isInitialSave = false;
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

    isInitialSave = true;
  }

  const itemOptions = { ...options, datetime: options.datetime || datetime, collectionKey: key };
  if (isInitialSave) {
    itemOptions['init'] = true;
  }

  collection['updated'] = itemOptions.datetime;
  collection.autoSave = (itemOptions.autoSave !== undefined) ? itemOptions.autoSave : collection.autoSave;
  collection.items.unshift(id);

  //TODO: Reconsider this key (which is essentially Config.DocumentURL) because there is a possibility that some other thing on that page will use the same key? We don't want to conflict with that. Perhaps the key in storage should be something unique, e.g., UUID, digestSRI, or something dokieli-specific? Probably dokieli-specific because we need to have a deterministic way of recalling it. Even if it is just `do-${Config.DocumentURL}` which would be sufficient.. or even digestSRI(Config.DocumentURL)
  await set(key, collection);

  Config.AutoSave.Items[itemOptions.collectionKey] ||= {};
  Config.AutoSave.Items[itemOptions.collectionKey]['IndexedDB'] ||= {};

  console.log(datetime + `: ${key} saved.`);

  await addDeviceStorageDocumentItem(id, data, itemOptions);
}

export async function updateDeviceStorageItem(id, data) {
  let item = await getDeviceStorageItem(id);

  if (!item) { return; }

  item = {
    ...item,
    ...data
  }

  await set(id, item);
}

export async function addDeviceStorageDocumentItem(id, data, options = {}) {
  const documentOptions = {
    ...Config.DOMProcessing,
    format: true,
    sanitize: true,
    normalize: true
  };

  data = data || getDocument(null, documentOptions);

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

  if (options['init'] || options['published']) {
    item['published'] = options['published'] || datetime;
  }

  if (Config.User) {
    item['actor'] = Config.User.IRI;
  }

  await set(id, item);

  // if (options.autoSave) {
  Config.AutoSave.Items[options.collectionKey]['IndexedDB']['updated'] = item.updated;
  // }

  console.log(datetime + `: ${id} saved.`);
}

export function updateHTTPStorageDocument(url, data, options = {}) {
  const documentOptions = {
    ...Config.DOMProcessing,
    format: true,
    sanitize: true,
    normalize: true
  };

  data = data || getDocument(null, documentOptions);

  var datetime = getDateTimeISO();

  updateMutableResource(url);

  // if (options.autoSave) {
  // Config.AutoSave.Items[url]['http']['updated'] = datetime;
  // }

  console.log(datetime + ': Document saved.');
}

export async function updateStorage(key, data, options = {}) {
  if (!key && !data) return;

  options['method'] = 'IndexedDB';

  switch (options.method) {
    default:
    case 'IndexedDB':
      await updateDeviceStorageDocumentWithItem(key, data, options);
      break;

    case 'http':
      updateHTTPStorageDocument(key, data, options);
      break;
  }
}



export function removeDeviceStorageItem(key) {
  if (!key) { return Promise.resolve(); }

  console.log(getDateTimeISO() + ': ' + key + ' removed from local storage.')

  if (Config.WebExtensionEnabled) {
    var browser = (typeof browser !== 'undefined') ? browser : chrome;

    return browser.storage.sync.remove(key);
  }
  else {
    return del(key);
  }
}

export async function removeDeviceStorageDocumentFromCollection(collectionKey, itemKey) {
  if (!itemKey) return Promise.resolve();

  const collection = await getDeviceStorageItem(collectionKey);

  if (!collection) return;

  await removeDeviceStorageItem(itemKey);

  const index = collection.items.indexOf(itemKey);
  if (index !== -1) {
    collection.items.splice(index, 1);
    await set(collectionKey, collection)
  }
}

export async function removeDeviceStorageDocumentItems(key) {
  // console.log(key)
  if (!key) return Promise.resolve();
  const collection = await getDeviceStorageItem(key);
  // console.log(collection)

  if (!collection) return;

  if (collection.items) {
    for (const item of collection.items) {
      console.log(item)
      await removeDeviceStorageItem(item);
    }
  }

  await removeDeviceStorageItem(key);
}

export async function removeDeviceStorageAsSignOut() {
  removeDeviceStorageDocumentItems(Config.DocumentURL);

  removeDeviceStorageItem('DO.Config.User');
  removeDeviceStorageItem('DO.Config.OIDC');
  localStorage.removeItem('i18nextLng');
}

export function getDeviceStorageItem(key) {
  if (!key) { return Promise.resolve(); }

  if (Config.WebExtensionEnabled) {
    if (typeof browser !== 'undefined') {
      return browser.storage.sync.get(key).then(o => { return o[key]; });
    }
    else {
      var value = {};
      chrome.storage.sync.get(key, o => { value = o[key]; })

       
      return new Promise((resolve, reject) => {
        window.setTimeout(() => {
          return resolve(value)
        }, 50);
      });
    }
  }
  else {
    return get(key);
  }
}

export function updateBrowserStorageOIDC() {
  return set('DO.Config.OIDC', Config.OIDC);
}

export function updateDeviceStorageProfile(User) {
  if (!User.IRI) { return Promise.resolve({ 'message': 'User.IRI is not set' }); }

  var U = { ...User };
  var key = 'DO.Config.User';

  var id = generateUUID();
  var datetime = getDateTimeISO();

  // Graphs are large and reconstructable, so we don't persist them.
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

  if (Config.WebExtensionEnabled) {
    if (typeof browser !== 'undefined') {
      return browser.storage.sync.set({ [key]: object });
    }
    else {
      return Promise.resolve(chrome.storage.sync.set({ [key]: object }));
    }
  }
  else {
    return set(key, object);
  }
}
