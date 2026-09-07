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
import { createActivityObjectHTML, createActivityJSONLD, showCitations, getReferenceLabel, createNoteDataHTML, handleDeleteNote, getItemVisibility, getPreferredTargetIRI, showActionMessage, addMessageToLog } from './doc.js';
import { applyMarksFromTextQuote, applyMarkFromSelector } from '@dokieli/web-annotation';
import { Icon } from './ui/icons.js'
import { getButtonHTML } from './ui/buttons.js'
import { getPathURL, isHttpOrHttpsProtocol, stripFragmentFromString, currentLocation, getFragmentFromString } from './uri.js';
import { serializeDataToPreferredContentType, getGraphLanguage, getGraphLicense, getGraphRights, getGraphTypes, getGraphDate, getGraphImage, getResourceGraph, getResourceOnlyRDF, getAgentTypeIndex, getUserContacts, getAgentName, getSubjectInfo, getItemsList, parseAnnotationFromGraph, jsonldNodesFromData } from './graph.js';
import { activityTypeToken, createNotification, discoverInbox, getAcceptPost, getInboxContents, postNotification, serializeNotificationToHTML } from '@dokieli/notifications';
import { storageFetch } from './storage/backend.js';
import Config from './config.js';
import { domSanitize, sanitizeInsertAdjacentHTML } from './utils/sanitization.js';
import { formatHTMLString } from './utils/normalization.js';
import { generateAttributeId, uniqueArray, findPreviousDateTime } from './util.js';
import { fragmentFromString, getDocumentContentNode, selectArticleNode } from "./utils/html.js";
import { getTextContentExcludingSups } from './editor/utils/annotation.js';
import { i18n } from './i18n.js';
import { showUserIdentityInput } from './auth.js';
import { updateDeviceStorageProfile } from './storage.js';
import { parseWacAllow } from '@dokieli/web-access-control';
import { isJWE } from './crypto.js';
import { isUnlocked, decryptWithSession } from './keystore.js';

var deleteListenerAttached = false;
let pendingEncryptedAnnotations = [];
let encryptionNeededHandler = null;

export function registerEncryptionUnlockHandler(fn) {
  encryptionNeededHandler = fn;
  if (pendingEncryptedAnnotations.length > 0 && !document.getElementById('encryption-unlock')) {
    fn();
  }
}

export function clearPendingEncryptedQueues() {
  pendingEncryptedAnnotations.length = 0;
}

export async function processPendingEncryptedNotes() {
  const pending = pendingEncryptedAnnotations.splice(0);
  for (const { noteIRI, g, options } of pending) {
    try {
      await showAnnotation(noteIRI, g, options);
    } catch(e) {
      console.error('processPendingEncryptedNotes: failed for', noteIRI, e);
    }
  }
}

const ns = Config?.ns;

export function initializeNotifications(options = {}) {
  // var contextNode = selectArticleNode(document);
  // <p class="count"><data about="" datatype="xsd:nonNegativeInteger" property="sioc:num_replies" value="' + interactionsCount + '">' + interactionsCount + '</data> interactions</p>
  //<progress min="0" max="100" value="0"></progress>
  //<div class="actions"><a href="/docs#resource-activities" rel="noopener" target="_blank">${Icon[".fas.fa-circle-info"]}</a></div>

  var buttonToggle = getButtonHTML({ key: 'panel.notifications.toggle.button', button: 'toggle', buttonClass: 'toggle' })

  //TEMP buttonRel/Resource
  var aside = `
  <aside aria-labelledby="document-notifications-label" class="do" contenteditable="false" dir="${Config.User.UI.LanguageDir}" id="document-notifications" lang="${Config.User.UI.Language}" rel="schema:hasPart" resource="#document-notifications" xml:lang="${Config.User.UI.Language}">
    <div aria-hidden="true" class="resizer" title="${i18n.t('panel.notifications.resizer.title')}"></div>
    <h2 data-i18n="panel.notifications.h2" id="document-notifications-label" property="schema:name">${i18n.t('panel.notifications.h2.textContent')} ${Config.Button.Info.Notifications}</h2>
    ${buttonToggle}
    <div>
      <div class="info"></div>
      <ul class="activities"></ul>
    </div>
  </aside>`;
  sanitizeInsertAdjacentHTML(document.body, 'beforeend', aside);
  aside = document.getElementById('document-notifications');

  initializeNotificationsResize(aside);

  if (options.includeButtonMore) {
    initializeButtonMore(aside);
  }

  return aside;
}

const NotificationsWidthProperty = '--dokieli-notifications-width';

export function initializeNotificationsResize(aside) {
  var resizer = aside.querySelector('.resizer');
  if (!resizer) { return; }

  var root = document.documentElement;

  var minWidth = 240;

  resizer.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    var maxWidth = window.innerWidth * 0.9;

    root.classList.add('notifications-resizing');
    resizer.classList.add('active');
    resizer.setPointerCapture(e.pointerId);

    var onMove = (ev) => {
      var width = Math.min(maxWidth, Math.max(minWidth, window.innerWidth - ev.clientX));
      root.style.setProperty(NotificationsWidthProperty, width + 'px');
    };

    var onUp = () => {
      root.classList.remove('notifications-resizing');
      resizer.classList.remove('active');
      resizer.removeEventListener('pointermove', onMove);
      resizer.removeEventListener('pointerup', onUp);
    };

    resizer.addEventListener('pointermove', onMove);
    resizer.addEventListener('pointerup', onUp);
  });

  resizer.addEventListener('dblclick', () => {
    root.style.removeProperty(NotificationsWidthProperty);
  });
}

export function initializeButtonMore(node) {
  var info = node.querySelector('div.info');
  var progressOld = info.querySelector('.progress');
  var progressNew = fragmentFromString(`<div class="progress" data-i18n="panel.notifications.progress.more">${Config.Button.Notifications.More} ${i18n.t('panel.notifications.progress.more.textContent')}</div>`);

  if (progressOld) {
    info.replaceChild(progressNew, progressOld)
  }
  else {
    info.appendChild(progressNew);
  }

  node = document.getElementById('document-notifications');

  var buttonMore = node.querySelector('div.info button.more');
  buttonMore.addEventListener('click', () => {
    if (!Config.User.IRI) {
      showUserIdentityInput();
    }
    else {
      showContactsActivities();
    }
  });
}

export async function addNoteToNotifications(noteData) {
  if (document.getElementById(noteData.id)) return;

  if (Config.User.IRI && !deleteListenerAttached) {
    deleteListenerAttached = true;
    document.addEventListener('click', (e) => {
      var button = e.target.closest('button.delete');
      if (button) handleDeleteNote(button);
    });
  }

  var noteDataIRI = noteData.iri;

// console.log(noteData)
  var note = createNoteDataHTML(noteData);

  var datetime = noteData.datetime ? noteData.datetime : '1900-01-01T00:00:00.000Z';

  // Mark items so the UI can distinguish visibility: authoritative when discovery passed it (public/private TypeIndex), else derived from the item's container; undefined (no class) when unknown.
  var visibility = noteData.visibility || getItemVisibility(noteDataIRI);
  var liClass = visibility ? ' class="' + visibility + '-item"' : '';
  var li = domSanitize('<li' + liClass + ' data-datetime="' + datetime + '"><blockquote cite="' + noteDataIRI + '">'+ note + '</blockquote></li>');
// console.log(li);
  var aside = document.getElementById('document-notifications');

  if(!aside) {
    aside = initializeNotifications({includeButtonMore: true});
  }

  var notifications = document.querySelector('#document-notifications > div > ul');
  var timesNodes = aside.querySelectorAll('div > ul > li[data-datetime]');
  var previousElement = null;

  //Maintain reverse chronological order
  if (timesNodes.length) {
    var times = Array.from(timesNodes).map(element => element.getAttribute("data-datetime"));
    var sortedTimes = times.sort().reverse();
    var previousDateTime = findPreviousDateTime(sortedTimes, noteData.datetime);
    previousElement = Array.from(timesNodes).find((element) => previousDateTime && previousDateTime === element.getAttribute("data-datetime") ? element : null);
  }

  if (previousElement) {
    sanitizeInsertAdjacentHTML(previousElement, 'beforebegin', li);
  }
  else {
    sanitizeInsertAdjacentHTML(notifications, 'beforeend', li);
  }
}


export function sendNotifications(tos, note, iri, shareResource) {
  return new Promise((resolve, reject) => {
    var notificationData = {
      'type': ['as:Announce'],
      'object': iri,
      'summary': note,
      'license': 'https://creativecommons.org/licenses/by/4.0/'
    };

    var rootIRI = Config.Resource[iri] || Config.Resource[getPathURL(iri)];

    if (rootIRI) {
      if (Config.Resource[iri].rdftype.length) {
        notificationData['objectTypes'] = Config.Resource[iri].rdftype;
      }
      if (Config.Resource[iri].license) {
        notificationData['objectLicense'] = Config.Resource[iri].license;
      }
    }
    else {
      var g = Config.Resource[iri].graph.node(rdf.namedNode(iri));
      var types = getGraphTypes(g);
      if (types.length) {
        notificationData['objectTypes'] = types;
      }
      var license = getGraphLicense(g);
      if (license) {
        notificationData['objectLicense'] = license;
      }
    }

    tos.forEach(to => {
      to = domSanitize(to);

      if (!isHttpOrHttpsProtocol(to)) return;

      notificationData['to'] = to;

      var toInput = shareResource.querySelector('[value="' + to + '"]') ||
        shareResource.querySelector('#share-resource-to');

      sanitizeInsertAdjacentHTML(toInput.parentNode, 'beforeend',
        '<span class="progress" data-to="' + to +
        '">' + Icon[".fas.fa-circle-notch.fa-spin.fa-fw"] + '</span>');

      inboxResponse(to, toInput)
        .then(inboxURL => {
          notificationData['inbox'] = inboxURL;

          notifyInbox(notificationData)
            .then(result => {
              if (result.location) {
                var location = domSanitize(result.location);

                toInput
                  .parentNode
                  .querySelector('.progress[data-to="' + to + '"]')
                  .setHTMLUnsafe(domSanitize('<a href="' + location + '" rel="noopener" target="_blank">' + Icon[".fas.fa-check-circle.fa-fw"] + '</a>'));
              }
            })
            .catch(error => {
              // console.log('Error in notifyInbox:', error)
              toInput
                .parentNode
                .querySelector('.progress[data-to="' + to + '"]')
                .setHTMLUnsafe(domSanitize(Icon[".fas.fa-times-circle.fa-fw"] + ' Unable to notify. Try later.'));
            });
        });
    });
  });
}

export function inboxResponse(to, toInput) {
  return discoverInbox(to, { fetch: storageFetch, parser: jsonldNodesFromData })
    .then(inbox => {
      if (!inbox) {
        return Promise.reject(new Error('No inbox found for ' + to));
      }
      return inbox;
    })

    .catch(error => {
      // console.log('Error in inboxResponse:', error)

      toInput
        .parentNode
        .querySelector('.progress[data-to="' + to + '"]')
        .setHTMLUnsafe(domSanitize(Icon[".fas.fa-times-circle.fa-fw"] + ' Inbox not responding. Try later.'))
    });
}

// Accept-Post preference: HTML, then JSON-LD flavors, then other RDF serializations
function preferredContentTypeFor(acceptPost) {
  var bases = (acceptPost || []).map(t => t.split(';')[0].trim().toLowerCase());
  if (bases.includes('text/html') || bases.includes('application/xhtml+xml')) {
    return 'text/html';
  }
  if (['application/ld+json', 'application/json', 'application/activity+json', '*/*'].some(t => bases.includes(t))) {
    return 'application/ld+json';
  }
  var rdfType = ['text/turtle', 'application/n-triples', 'application/n-quads', 'text/n3'].find(t => bases.includes(t));
  return rdfType || 'application/ld+json';
}

export function notifyInbox(o) {
  var slug, inboxURL;

  if ('slug' in o) {
    slug = o.slug;
  }
  if ('inbox' in o) {
    inboxURL = o.inbox;
  }

  if (!inboxURL) {
    return Promise.reject(new Error('No inbox to send notification to'));
  }

  var params = {
    type: o.type,
    object: { id: o.object, html: domSanitize(createActivityObjectHTML(o)) }
  };
  if (Config.User.IRI) { params.actor = Config.User.IRI; }
  if (o.target && o.target.length) { params.target = o.target; }
  if (o.context && o.context.length) { params.context = o.context; }
  if (o.summary && o.summary.length) { params.summary = o.summary; }
  if (o.content && o.content.length) { params.content = o.content; }
  if (o.to && typeof o.to === 'string' && /^https?:\/\//i.test(o.to) && !/\s/.test(o.to)) { params.to = o.to; }
  var notificationLicense = o.license || Config.NotificationLicense;
  if (notificationLicense) { params.license = notificationLicense; }

  var notification = createNotification(params);

  var titleLabel = 'Notification';
  if (o.type.includes('as:Announce')) { titleLabel += ': Announced'; }
  else if (o.type.includes('as:Create')) { titleLabel += ': Created'; }
  else if (o.type.includes('as:Like')) { titleLabel += ': Liked'; }
  else if (o.type.includes('as:Dislike')) { titleLabel += ': Disliked'; }
  else if (o.type.includes('as:Add')) { titleLabel += ': Added'; }

  var data = formatHTMLString(serializeNotificationToHTML(notification, {
    prefixes: Config.prefixStrings.activity,
    labels: { [activityTypeToken(String(o.type[0]))]: titleLabel }
  }));

  var options = {
    'contentType': 'text/html',
    'profile': 'https://www.w3.org/ns/activitystreams'
  };

  // Model-built JSON-LD for content-negotiated inboxes (avoids RDFa-derived langStrings).
  if (o.note) {
    options.activityJSONLD = createActivityJSONLD(o);
  }

  return getAcceptPost(inboxURL, { fetch: storageFetch })
    .catch(() => null)
    .then(acceptPost => {
      options['preferredContentType'] = preferredContentTypeFor(acceptPost);
      return serializeDataToPreferredContentType(data, options);
    })
    .then(serializedData => {
      var profile = ('profile' in options) ? '; profile="' + options.profile + '"' : '';
      var contentType = options['preferredContentType'] + profile + '; charset=utf-8';

      return postNotification(inboxURL, serializedData, {
        fetch: storageFetch,
        contentType: contentType,
        headers: slug ? { 'Slug': slug } : {}
      });
    });
}
export function postActivity(url, slug, data, options) {
  return Config.Storage.getAcceptPost(url)
    .then(preferredContentType => {
      options = options || {};
      options['preferredContentType'] = preferredContentType;

      return serializeDataToPreferredContentType(data, options)
        .then(serializedData => {
          var profile = ('profile' in options) ? '; profile="' + options.profile + '"' : '';
          var contentType = options['preferredContentType'] + profile + '; charset=utf-8';

          return Config.Storage.post(url, slug, serializedData, contentType);
        });
    });
}

const registeredTypeIndexKeys = new Set();

function isContainerPublicReadable(containerIRI) {
  return Config.Storage.head(containerIRI)
    .then(response => parseWacAllow(response.headers.get('WAC-Allow'))?.public?.has('Read') === true)
    .catch(() => false);
}

function typeRegistrationTriples(subject, forClass, containerIRI) {
  return `<${subject}> a <${ns.solid.TypeRegistration.value}> ;\n` +
    `  <${ns.solid.forClass.value}> <${forClass}> ;\n` +
    `  <${ns.solid.instanceContainer.value}> <${containerIRI}> .\n`;
}

function showAnnotationStoreDialog(containerIRI, mode) {
  const id = 'annotation-store-dialog';
  document.getElementById(id)?.remove();

  const submitKey = mode === 'publish' ? 'publish' : 'add';
  const buttonClose = getButtonHTML({ key: 'dialog.annotation-store.close.button', button: 'close', buttonClass: 'close', iconSize: 'fa-2x' });

  document.body.appendChild(fragmentFromString(`
    <aside aria-labelledby="${id}-label" class="do on" dir="${Config.User.UI.LanguageDir}" id="${id}" lang="${Config.User.UI.Language}" rel="schema:hasPart" resource="#${id}" xml:lang="${Config.User.UI.Language}">
      <h2 data-i18n="dialog.annotation-store.h2" id="${id}-label" property="schema:name">${i18n.t('dialog.annotation-store.h2.textContent')}</h2>
      ${buttonClose}
      <div class="info"></div>
      <div>
        <p data-i18n="dialog.annotation-store.${mode}.p">${i18n.t(`dialog.annotation-store.${mode}.p.textContent`, { url: containerIRI })}</p>
      </div>
      <button class="cancel" data-i18n="dialog.annotation-store.cancel.button" title="${i18n.t('dialog.annotation-store.cancel.button.title')}" type="button">${i18n.t('dialog.annotation-store.cancel.button.textContent')}</button>
      <button class="submit" data-i18n="dialog.annotation-store.${submitKey}.button" title="${i18n.t(`dialog.annotation-store.${submitKey}.button.title`)}" type="button">${i18n.t(`dialog.annotation-store.${submitKey}.button.textContent`)}</button>
    </aside>
  `));

  return new Promise(resolve => {
    const dialog = document.getElementById(id);
    dialog.addEventListener('click', (e) => {
      const accepted = !!e.target.closest('button.submit');
      const dismissed = e.target.closest('button.close') || e.target.closest('button.cancel');
      if (!accepted && !dismissed) return;
      e.preventDefault();
      e.stopPropagation();
      dialog.remove();
      resolve(accepted);
    });
  });
}

// Public type index when the container is publicly readable, else private
export async function registerAnnotationInTypeIndex(containerIRI, forClass) {
  const privateTypeIndexIRI = Config.User.PrivateTypeIndex?.[0];
  const publicTypeIndexIRI = Config.User.PublicTypeIndex?.[0];
  if (!privateTypeIndexIRI && !publicTypeIndexIRI) return;
  if (registeredTypeIndexKeys.has(forClass)) return;

  Config.User.TypeIndex = Config.User.TypeIndex || {};
  const privateEntries = Config.User.TypeIndex[ns.solid.privateTypeIndex.value] || {};
  const publicEntries = Config.User.TypeIndex[ns.solid.publicTypeIndex.value] || {};
  const findRegistration = (entries) => Object.entries(entries).find(([, entry]) => entry[ns.solid.forClass.value] === forClass);

  if (findRegistration(publicEntries)) return;

  registeredTypeIndexKeys.add(forClass);

  try {
    const existingPrivate = findRegistration(privateEntries);

    if (existingPrivate) {
      const [subject, entry] = existingPrivate;
      const container = entry[ns.solid.instanceContainer.value];
      if (!publicTypeIndexIRI || !container || !(await isContainerPublicReadable(container))) return;
      if (!(await showAnnotationStoreDialog(container, 'publish'))) return;

      const registrationId = generateAttributeId();
      const insert = typeRegistrationTriples(`#${registrationId}`, forClass, container);
      await Config.Storage.patchWithConneg(publicTypeIndexIRI, { insert });
      await Config.Storage.patchWithConneg(privateTypeIndexIRI, { delete: typeRegistrationTriples(subject, forClass, container) }).catch(() => {});

      delete privateEntries[subject];
      Config.User.TypeIndex[ns.solid.publicTypeIndex.value] = { ...publicEntries, [`${publicTypeIndexIRI}#${registrationId}`]: { [ns.solid.forClass.value]: forClass, [ns.solid.instanceContainer.value]: container } };
      updateDeviceStorageProfile(Config.User);
      return;
    }

    const publicReadable = publicTypeIndexIRI && await isContainerPublicReadable(containerIRI);
    const usePublic = publicReadable || !privateTypeIndexIRI;
    if (!(await showAnnotationStoreDialog(containerIRI, usePublic ? 'add-public' : 'add-private'))) return;

    const typeIndexIRI = usePublic ? publicTypeIndexIRI : privateTypeIndexIRI;
    const typeIndexType = usePublic ? ns.solid.publicTypeIndex.value : ns.solid.privateTypeIndex.value;
    const registrationId = generateAttributeId();
    await Config.Storage.patchWithConneg(typeIndexIRI, { insert: typeRegistrationTriples(`#${registrationId}`, forClass, containerIRI) });

    Config.User.TypeIndex[typeIndexType] = Config.User.TypeIndex[typeIndexType] || {};
    Config.User.TypeIndex[typeIndexType][`${typeIndexIRI}#${registrationId}`] = {
      [ns.solid.forClass.value]: forClass,
      [ns.solid.instanceContainer.value]: containerIRI
    };
    updateDeviceStorageProfile(Config.User);
  }
  catch (e) {
    console.log('Could not register annotation type in TypeIndex:', e);
  }
}

export function getNotifications(url) {
  url = url || currentLocation();

  Config.Inbox[url] = {};
  Config.Inbox[url]['Notifications'] = [];

  return getInboxContents(url, { fetch: storageFetch, parser: jsonldNodesFromData })
    .then(notifications => {
      if (notifications.length) {
        Config.Inbox[url]['Notifications'] = notifications;
        return notifications;
      }
      else {
        var reason = {"message": "There are no notifications."};
        return Promise.reject(reason);
      }
    });
}

// export function showInboxNotifications(url, data) {
//   //TODO: Consider checking multiple getLinkRelation, [ns.ldp.inbox.value, ns.as.inbox.value]
//   getLinkRelation(ns.ldp.inbox.value, url, data)
//     .then(i => {
//       i.forEach(inboxURL => {
//         if (!Config.Inbox[inboxURL]) {
//           showNotificationSources(inboxURL);
//         }
//       });
//     });
// }

export function showNotificationSources(url) {
  if (Config.DocumentURL.startsWith('blob:')) {
    return;
  }

  getNotifications(url).then(
    function(notifications) {
      notifications.forEach(notification => {
        showActivities(notification, { notification: true });
       });
    },
    function(reason) {
      console.log('No notifications');
      return reason;
    }
  );
}

// One scan per container per session; the offset moves as the user asks for more
const collectionScans = new Map();

function nextBatchSize(size) {
  return size < 50 ? 50 : size < 100 ? 100 : size * 2;
}

function offerMoreActivities(url, state) {
  const remaining = state.items.length - state.offset;
  const count = Math.min(state.batch, remaining);
  const button = `<button class="load-more-activities" data-url="${url}" type="button">${i18n.t('activities.collection-limit.more.button.textContent', { count })}</button>`;
  const message = { 'content': i18n.t('activities.collection-limit.textContent', { url, total: state.items.length, checked: state.offset }) + ' ' + button, 'type': 'info', 'timer': null };
  addMessageToLog(message, Config.MessageLog);
  state.messageId = showActionMessage(document.body, message);
}

document.addEventListener('click', (e) => {
  const button = e.target.closest?.('button.load-more-activities');
  if (!button) return;
  const url = button.dataset.url;
  const state = collectionScans.get(url);
  document.getElementById(state?.messageId)?.remove();
  if (state) showActivitiesSources(url, { ...state.options, more: true });
});

async function showActivitiesSourcesUncached(url, options = {}) {
  const state = collectionScans.get(url) || { items: null, offset: 0, batch: Config.CollectionItemsLimit, options };
  if (state.items && !options.more) return;
  collectionScans.set(url, state);

  try {
    // Retry the container listing; rate limiting can return it empty under load
    state.items = state.items || await withReadRetry(() => getItemsList(url));
  }
  catch (error) {
    console.log(url + ' has no activities.');
    return;
  }

  // Until servers can be queried (e.g. SPARQL) the cap keeps requests under rate limits and the UI responsive
  const queue = state.items.slice(state.offset, state.offset + state.batch);
  state.offset += queue.length;
  state.batch = nextBatchSize(state.batch);

  // Cap concurrency to avoid tripping the storage server's rate limiter
  const concurrency = Math.min(Config.CollectionItemsConcurrency, queue.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < queue.length) {
      const iri = queue[cursor++];
      try { await showActivities(iri, options); } catch (e) {}
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));

  if (state.offset < state.items.length) offerMoreActivities(url, state);
}

// export function getActivities(url, options) {
//   url = url || currentLocation();
//   url = stripFragmentFromString(url);

//   switch (options['activityType']) {
//     default:
//     case 'instanceContainer':
//       // console.log(getItemsList(url))
//       return getItemsList(url);
//     case 'instance':
//       return showActivities(url);
//   }
// }

// Bounded gate for activity/notification reads; slots release before recursive calls
let activityReadsActive = 0;
const activityReadsQueue = [];

function activityReadsDrain() {
  while (activityReadsActive < Config.CollectionItemsConcurrency && activityReadsQueue.length) {
    activityReadsActive++;
    activityReadsQueue.shift()();
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Retry with backoff on any rejection; 429s often surface as opaque network failures
async function withReadRetry(fn, attempts = 3) {
  var delay = 600;
  for (var i = 0; ; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i >= attempts - 1) { throw error; }
      var retryAfter = Number(error?.response?.headers?.get?.('Retry-After'));
      var wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : delay;
      await sleep(wait);
      delay *= 2;
    }
  }
}

function gatedGetResourceOnlyRDF(url) {
  return new Promise(resolve => {
    activityReadsQueue.push(resolve);
    activityReadsDrain();
  }).then(() =>
    withReadRetry(() => getResourceOnlyRDF(url)).finally(() => {
      activityReadsActive--;
      activityReadsDrain();
    })
  );
}

// Per-URL in-flight dedup; entries clear on settle so a later scan still refreshes
const showActivitiesInFlight = new Map();
const showActivitiesSourcesInFlight = new Map();

export function showActivities(url, options = {}) {
  if (Config.Activity[url] || Config.Notification[url]) {
    return Promise.reject([]);
  }
  if (showActivitiesInFlight.has(url)) {
    return showActivitiesInFlight.get(url);
  }
  const p = showActivitiesUncached(url, options)
    .finally(() => showActivitiesInFlight.delete(url));
  showActivitiesInFlight.set(url, p);
  return p;
}

export function showActivitiesSources(url, options = {}) {
  if (showActivitiesSourcesInFlight.has(url)) {
    return showActivitiesSourcesInFlight.get(url);
  }
  const p = showActivitiesSourcesUncached(url, options)
    .finally(() => showActivitiesSourcesInFlight.delete(url));
  showActivitiesSourcesInFlight.set(url, p);
  return p;
}

function showActivitiesUncached(url, options = {}) {
  if (Config.Activity[url] || Config.Notification[url]) {
    return Promise.reject([]);
  }

  var documentURL = Config.DocumentURL;
  var preferredTargetIRI = getPreferredTargetIRI(documentURL);

  var documentTypes = Config.ActivitiesObjectTypes.concat(Object.keys(Config.ResourceType));

  return gatedGetResourceOnlyRDF(url)
    //TODO: Needs throws handled from functions calling showActivities
    // .catch(e => {
    //   // return [];
    //   throw e;
    // })
    .then(({ graph: g }) => {
      // console.log(g)
      if (!g) return;

      if (options.notification) {
        Config.Notification[url] = {};
        Config.Notification[url]['Activities'] = [];
        Config.Notification[url]['Graph'] = g;
      }
      else {
        Config.Activity[url] = {};
        Config.Activity[url]['Graph'] = g;
      }

      var currentPathURL = getPathURL(documentURL);

      var subjectsReferences = [];
      var subjects = [];
      g.out().quads().forEach(t => {
        subjects.push(t.subject.value);
      });
      subjects = uniqueArray(subjects);

      const subjectPromises = subjects.map(i => {
        var s = g.node(rdf.namedNode(i));
        var types = getGraphTypes(s);

        if (types.length) {
          var resourceTypes = types;

          var language = getGraphLanguage(s);
          var license = getGraphLicense(s);
          var rights = getGraphRights(s);

          //XXX: May need to be handled in a similar way to to as:Anounce/Create?
          if (resourceTypes.includes(ns.as.Like.value) ||
              resourceTypes.includes(ns.as.Dislike.value)){
            var object = s.out(ns.as.object).values;
            if (object.length && getPathURL(object.values[0]) == currentPathURL) {
              var context = s.out(ns.as.context).values;
              if (context.length) {
                subjectsReferences.push(context[0]);
                return showActivities(context[0])
                  .then(iri => iri)
                  .catch(e => console.log(context[0] + ': context is unreachable', e));
              }
              else {
                var iri = s.term.value;
                var targetIRI = object[0];
                // var motivatedBy = 'oa:assessing';
                var id = generateAttributeId(iri);
                var refId = 'r-' + id;
                var refLabel = id;

                var bodyValue = (resourceTypes.includes(ns.as.Like.value)) ? 'Liked' : 'Disliked';
                var motivatedBy = bodyValue.slice(0, -1);

                var noteData = {
                  "type": bodyValue === 'Liked' ? 'approve' : 'disapprove',
                  "mode": "read",
                  "motivatedBy": motivatedBy,
                  "id": id,
                  "refId": refId,
                  "refLabel": refLabel,
                  "iri": iri, //but don't pass this to createNoteDataHTML?
                  "creator": {},
                  "target": {
                    "iri": targetIRI
                  }
                };

                var bodyObject = {
                  "value": bodyValue
                }

                if (language) {
                  noteData["language"] = language;
                  bodyObject["language"] = language;
                }
                if (license) {
                  noteData["rights"] = noteData["license"] = license;
                  bodyObject["rights"] = bodyObject["license"] = license;
                }

                noteData["body"] = [bodyObject];

                var actor = s.out(ns.as.actor).values;
                if (actor.length) {
                  noteData['creator'] = {
                    'iri': actor[0]
                  }
                  var a = g.node(rdf.namedNode(noteData['creator']['iri']));
                  var actorName = getAgentName(a);
                  var actorImage = getGraphImage(a);

                  if (typeof actorName != 'undefined') {
                    noteData['creator']['name'] = actorName;
                  }
                  if (typeof actorImage != 'undefined') {
                    noteData['creator']['image'] = actorImage;
                  }
                }
                else if (resourceTypes.includes(ns.as.Dislike.value)) {
                  noteData['creator'] = {
                    'name': 'Anonymous Coward'
                  }
                }

                var datetime = getGraphDate(s);
                if (datetime){
                  noteData['datetime'] = datetime;
                }

                noteData['visibility'] = options.visibility;
                return addNoteToNotifications(noteData);
              }
            }
          }
          else if (resourceTypes.includes(ns.as.Relationship.value)) {
            if (s.out(ns.as.subject).values.length && s.out(ns.as.relationship).values.length && s.out(ns.as.object).values.length && getPathURL(s.out(ns.as.object).values[0]) == currentPathURL) {
              var subject = s.out(ns.as.subject).values[0];
              subjectsReferences.push(subject);
              return showActivities(subject)
                .then(iri => iri)
                .catch(e => console.log(subject + ': subject is unreachable', e));
            }
          }
          else if (resourceTypes.includes(ns.as.Announce.value) || resourceTypes.includes(ns.as.Create.value)) {
            var o = {};

            var object = s.out(ns.as.object).values.length ? s.out(ns.as.object).values[0] : undefined;
            //TODO: if no object, leave.

            var target = s.out(ns.as.target).values.length ? s.out(ns.as.target).values[0] : undefined;

            var objectGraph = s.node(rdf.namedNode(object));
            var inReplyTo = objectGraph.out(ns.as.inReplyTo).values.length && objectGraph.out(ns.as.inReplyTo).values[0];

            if (object && (target || inReplyTo)) {
              var targetPathURL = getPathURL(target) || getPathURL(inReplyTo);

              if (targetPathURL == currentPathURL) {
                o['targetInOriginalResource'] = true;
              }
              else if (preferredTargetIRI && targetPathURL == getPathURL(preferredTargetIRI)) {
                o['targetInPreferredIRI'] = true;
              }
              else if (Config.Resource[documentURL].graph.out(ns.owl.sameAs).values.length && Config.Resource[documentURL].graph.out(ns.owl.sameAs).values[0] == targetPathURL) {
                o['targetInSameAs'] = true;
              }

              if (o['targetInOriginalResource'] || o['targetInPreferredIRI'] || o['targetInSameAs']) {
                subjectsReferences.push(object);

                if (options.notification) {
                  Config.Notification[url]['Activities'].push(object);
                }

                if (object.startsWith(url)) {
                  return showAnnotation(object, s, o);
                }
                else {
                  s = s.node(rdf.namedNode(object));
                  var citation = {};

                  // if (target.startsWith(currentPathURL)) {
                    Object.keys(Config.Citation).forEach(citationCharacterization => {
                      var citedEntity = s.out(rdf.namedNode(citationCharacterization)).values;
                      // if(citedEntity) {
                        citedEntity.forEach(cE => {
                          if(cE.startsWith(currentPathURL)) {
                            o['objectCitingEntity'] = true;
                            citation = {
                              'citingEntity': object,
                              'citationCharacterization': citationCharacterization,
                              'citedEntity': target || inReplyTo
                            }
                          }
                        })
                      // }
                    })
                  // }

                  if (o['objectCitingEntity']) {
                    return showCitations(citation, s);
                  }
                  else {
                    return showActivities(object, o)
                      .then(iri => iri)
                      .catch(e => {
                        // console.log(object + ': object is unreachable', e)
                      });
                  }
                }
              }
            }
          }
          // else if (resourceTypes.indexOf('http://purl.org/spar/cito/Citation')) {
            //TODO:
            // var iri = s.iri().toString();
            // return showCitations(iri, s)
          // }
          else if(resourceTypes.includes(ns.as.Add.value)) {
            var object = s.out(ns.as.object).values.length ? s.out(ns.as.object).values[0] : undefined;
            var target = s.out(ns.as.target).values.length ? s.out(ns.as.target).values[0] : undefined;
            var origin = s.out(ns.as.origin).values.length ? s.out(ns.as.origin).values[0] : undefined;


            if (object && (target || origin)) {
              var targetPathURL = getPathURL(target);
              var originPathURL = getPathURL(origin);
// console.log('pathURLs: ', targetPathURL, originPathURL);
              if (targetPathURL == currentPathURL || originPathURL == currentPathURL) {
                subjectsReferences.push(object);
// console.log('object:', object);
// console.log('target:', target);
// console.log('origin:', origin);

                if (object.startsWith(url)) {
                  return showAnnotation(object, s);
                }
                else {
                  return showActivities(object)
                    .then(iri => iri)
                    .catch(e => console.log(object + ': object is unreachable', e));
                }
              }
            }
          }
          else if (resourceTypes.includes(ns.oa.Annotation.value) && !subjectsReferences.includes(i)) {
            // oa:hasTarget may be an IRI or a blank node with oa:hasSource
            var targetPtr = s.out(ns.oa.hasTarget);
            var hasTargetValue = targetPtr.values[0];
            if (hasTargetValue) {
              var hasSourceValue = targetPtr.out(ns.oa.hasSource).values[0];
              var urlToCheck = hasSourceValue || hasTargetValue;
              var targetPathURL;
              try { targetPathURL = getPathURL(urlToCheck); } catch(e) {}
              if (targetPathURL === currentPathURL) {
                return showAnnotation(i, s);
              }
            }
          }
          else if (!subjectsReferences.includes(i) && documentTypes.some(item => resourceTypes.includes(item)) && s.out(ns.as.inReplyTo).values.length && s.out(ns.as.inReplyTo).values[0] && getPathURL(s.out(ns.as.inReplyTo).values[0]) == currentPathURL) {
              subjectsReferences.push(i);
            return showAnnotation(i, s);
          }
          else if (resourceTypes.includes(ns.bookmark.Bookmark.value) && s.out(ns.bookmark.recalls).values.length && getPathURL(s.out(ns.bookmark.recalls).values[0]) == currentPathURL ) {
            var iri = s.term.value;
            var targetIRI = s.out(ns.bookmark.recalls).values[0];
            var motivatedBy = 'bookmark:Bookmark';
            var id = generateAttributeId(iri);
            var refId = 'r-' + id;
            var refLabel = id;

            var bodyValue = 'Bookmarked';

            var noteData = {
              "type": 'bookmark',
              "mode": "read",
              "motivatedBy": motivatedBy,
              "id": id,
              "refId": refId,
              "refLabel": refLabel,
              "iri": iri, //but don't pass this to createNoteDataHTML?
              "creator": {},
              "target": {
                "iri": targetIRI
              },
              "body": [{ "value": bodyValue }]
            };

            var creator = options.agent;
            //TODO: Move to graph.js?
            Object.keys(Config.Actor.Property).some(key => {
              const { values } = s.out(rdf.namedNode(key));
              if (values.length) {
                creator = values[0];
                return true;
              }
            })

            if (creator){
              noteData['creator'] = {
                'iri': creator
              }
              var a = g.node(rdf.namedNode(noteData['creator']['iri']));
              var actorName = getAgentName(a);
              var actorImage = getGraphImage(a);

              if (typeof actorName != 'undefined') {
                noteData['creator']['name'] = actorName;
              }
              if (typeof actorImage != 'undefined') {
                noteData['creator']['image'] = actorImage;
              }
            }

            var datetime = getGraphDate(s);
            if (datetime) {
              noteData['datetime'] = datetime;
            }

            if (license) {
              noteData['license'] = license;
            }

            if (rights) {
              noteData['rights'] = rights;
            }

            noteData['visibility'] = options.visibility;
            return addNoteToNotifications(noteData);
          }
          else {
            // console.log(i + ' has unrecognised types: ' + resourceTypes);
            // return Promise.reject({'message': 'Unrecognised types ' + resourceTypes});
          }
        }
        else {
          // console.log('Skipping ' + i + ': No type.');
          // return Promise.reject({'message': 'Activity has no type. What to do?'});
        }
      }).filter(Boolean);
      return Promise.allSettled(subjectPromises);
    }
    // ,
    // function(reason) {
    //   console.log(url + ': is unreachable. ' + reason);
    //   return reason;
    // }
  );
}

export function showContactsActivities(onComplete) {
  var aside = document.querySelector('#document-notifications');

  var showProgress = function() {
    var info = aside.querySelector('div.info');
    var progressOld = info.querySelector('.progress');
    var progressNew = fragmentFromString(`<div class="progress" data-i18n="panel.notifications.progress.checking">${Icon[".fas.fa-circle-notch.fa-spin.fa-fw"].replace(' fa-fw', '')} ${i18n.t('panel.notifications.progress.checking.textContent')}</div>`);

    if (progressOld) {
      info.replaceChild(progressNew, progressOld)
    }
    else {
      info.appendChild(progressNew);
    }
  }

  var removeProgress = function() {
    var info = aside.querySelector('div.info');
    var progressOld = info.querySelector('.progress');
    info.removeChild(progressOld);
    initializeButtonMore(aside);
  }

  var promises = [];
  promises.push(...processAgentActivities(Config.User));

  showProgress();

  // Cap concurrency so a large foaf:knows list doesn't fan out into hundreds of parallel fetches and lock the tab.
  const CONTACT_CONCURRENCY = 5;

  var runContactsBounded = async (items, fn) => {
    let cursor = 0;
    var workers = Array.from({ length: Math.min(CONTACT_CONCURRENCY, items.length) }, async () => {
      while (cursor < items.length) {
        var i = cursor++;
        try { await fn(items[i]); } catch {}
      }
    });
    await Promise.all(workers);
  };

  var hasTypeIndex = (agent) => agent?.TypeIndex && Object.values(agent.TypeIndex).some(v => v && Object.keys(v).length);

  // Cached contacts lose their Graph, so only reuse ones with a persisted TypeIndex
  var processContacts = (contacts) =>
    runContactsBounded(contacts, async (url) => {
      Config.User['Contacts'] = Config.User['Contacts'] || {};
      var subject = Config.User.Contacts[url];
      if (!hasTypeIndex(subject)) {
        subject = await getSubjectInfo(url, { 'fetchIndexes': true });
        if (!subject.Graph) return;
        Config.User.Contacts[url] = subject;
      }
      await Promise.allSettled(processAgentActivities(subject));
    });

  function getContactsAndActivities() {
    if (!Config.User.IRI) return Promise.resolve();

    // Re-read the profile so newly added contacts are included
    return getUserContacts(Config.User.IRI).then(c => {
      var known = Object.keys(Config.User.Contacts || {});
      var contacts = uniqueArray(c.concat(known));
      // Drop http: contacts on https: pages, mixed content blocks them
      var pageIsHttps = window.location.protocol === 'https:';
      var filtered = pageIsHttps ? contacts.filter(iri => !iri.toLowerCase().startsWith('http:')) : contacts;
      return processContacts(filtered);
    });
  }

  getContactsAndActivities()
    .then(() => Promise.allSettled(promises))
    .then(() => {
      removeProgress();
      onComplete?.();
    })
    .catch(() => {
      removeProgress();
      onComplete?.();
    });
}

export function processAgentActivities(agent) {
  if (Object.values(agent.TypeIndex || {}).some(v => v && Object.keys(v).length)) {
    return processAgentTypeIndex(agent);
  }
  else if (agent.Graph && (agent.PublicTypeIndex?.length || agent.PrivateTypeIndex?.length) && !agent.typeIndexAttempted) {
    // Guard prevents infinite recursion when an unreadable TypeIndex returns 0 entries.
    agent.typeIndexAttempted = true;
    return [getAgentTypeIndex(agent.Graph)
      .then(typeIndexes => {
        var keys = Object.keys(typeIndexes);
        if (keys.length === 0) return;
        agent.TypeIndex = agent.TypeIndex || {};
        keys.forEach(typeIndexType => {
          agent.TypeIndex[typeIndexType] = typeIndexes[typeIndexType];
        });
        return Promise.all(processAgentActivities(agent));
      })
      .catch(() => {})];
  }

  return [Promise.resolve()];

  //TODO: Need proper filtering of storage/outbox matching an object of interest
  // else {
  //   return processAgentStorageOutbox(agent)
  // }
}

export function processAgentTypeIndex(agent) {
  var promises = [];
  var documentTypes = Config.ActivitiesObjectTypes.concat(Object.keys(Config.ResourceType));

  // Keep public and private registrations apart so each item's visibility is carried through discovery (see addNoteToNotifications / the *-item marker) instead of lost in a merge.
  var registries = [
    ['public', agent.TypeIndex[ns.solid.publicTypeIndex.value] || {}],
    ['private', agent.TypeIndex[ns.solid.privateTypeIndex.value] || {}]
  ];

  var recognisedTypes = [];

  registries.forEach(([visibility, registrations]) => {
    Object.values(registrations).forEach(typeRegistration => {
      var forClass = typeRegistration[ns.solid.forClass.value];
      var instance = typeRegistration[ns.solid.instance.value];
      var instanceContainer = typeRegistration[ns.solid.instanceContainer.value];

      if (documentTypes.includes(forClass)) {
        recognisedTypes.push(forClass);

        if (instance) {
          promises.push(showActivities(instance, { excludeMarkup: true, agent: agent.IRI, visibility }));
        }

        if (instanceContainer) {
          promises.push(showActivitiesSources(instanceContainer, { activityType: 'instanceContainer', agent: agent.IRI, visibility }));
        }
      }
    });
  });

  //       TODO: Need proper filtering of storage/outbox matching an object of interest
  //       if (recognisedTypes.length == 0) {
  // console.log(agent, recognisedTypes);
  //         promises.push(processAgentStorageOutbox(agent));
  //       }

  // console.log(promises)
  return promises;
}

export function processAgentStorageOutbox(agent) {
  var promises = [];

  if (agent.Storage && agent.Storage.length) {
    if (agent.Outbox && agent.Outbox.length) {
      if (agent.Storage[0] === agent.Outbox[0]) {
        promises.push(showActivitiesSources(agent.Outbox[0]));
      }
      else {
        promises.push(showActivitiesSources(agent.Storage[0]));
        promises.push(showActivitiesSources(agent.Outbox[0]));
      }
    }
    else {
      promises.push(showActivitiesSources(agent.Storage[0]))
    }
  }
  else if (agent.Outbox && agent.Outbox.length) {
    promises.push(showActivitiesSources(agent.Outbox[0]));
  }

  return promises;
}

//XXX: To be deprecated
export async function positionInteraction(noteIRI, containerNode, options) {
  containerNode = containerNode || getDocumentContentNode(document);

  if (Config.Activity[noteIRI]) {
    return Promise.reject();
  }

  Config.Activity[noteIRI] = {};

  let g;
  try {
    ({ graph: g } = await getResourceGraph(noteIRI));
  } catch {
    return;
  }
  if (!g) return;
  showAnnotation(noteIRI, g, containerNode, options);
}

// Finds the TextQuoteSelector within a typed Selector, following oa:refinedBy
function textQuoteFromSelector(selector) {
  if (!selector) { return undefined; }
  if (selector.type === 'TextQuoteSelector') { return selector; }
  if (selector.refinedBy) { return textQuoteFromSelector(selector.refinedBy); }
  return undefined;
}

// Marks the passage at creation time without waiting on the re-fetch path; idempotent
export function markAnnotationTarget(noteIRI, selector, options = {}) {
  if (!noteIRI || !selector) { return null; }

  var containerNode = selectArticleNode(document);
  if (!containerNode) { return null; }

  // The annotation link now lives on the reference marker, so detect an existing mark by it.
  if (containerNode.querySelector('[resource="' + noteIRI + '"]')) { return null; }

  var motivatedBy = options.motivatedBy || 'oa:replying';
  var id = options.id || generateAttributeId(noteIRI);
  var refLabel = options.refLabel || getReferenceLabel(motivatedBy);
  var docRefType = '<sup class="ref-annotation"><a href="#' + id + '" rel="cito:hasReplyFrom" resource="' + noteIRI + '">' + refLabel + '</a></sup>';

  var markOptions = { 'annotationUrl': noteIRI, 'id': 'r-' + id, 'className': 'ref do', 'reference': docRefType, 'excludeMatchesIn': '#document-notifications', 'ignoreSelector': 'sup' };

  // RangeSelector marks the resolved range; TextQuoteSelector marks every match
  var isTextQuote = selector.type === 'TextQuoteSelector' || (!selector.type && selector.exact);
  if (isTextQuote) {
    if (!selector.exact) { return null; }
    return applyMarksFromTextQuote(containerNode, { exact: selector.exact, prefix: selector.prefix, suffix: selector.suffix }, markOptions);
  }

  return applyMarkFromSelector(containerNode, selector, markOptions);
}

export async function showAnnotation(noteIRI, g, options) {
  // Search within the content node so the notifications panel is excluded
  var containerNode = selectArticleNode(document);
  options = options || {};

  var documentURL = Config.DocumentURL;

  var note = g.node(rdf.namedNode(noteIRI));
  if (note.out(ns.as.object).values.length) {
    note = g.node(rdf.namedNode(note.out(ns.as.object).values[0]));
  }
  // console.log(noteIRI)
  // console.log(note.toString())
  // console.log(note)

  var id = generateAttributeId(noteIRI);
  var refId = 'r-' + id;
  var refLabel = id;

  var inboxIRI = note.out(ns.ldp.inbox).values.length ? note.out(ns.ldp.inbox).values[0] : undefined;
  var asInboxIRI = note.out(ns.as.inbox).values.length ? note.out(ns.as.inbox).values[0] : undefined;
  inboxIRI = inboxIRI || asInboxIRI;
  if (inboxIRI) {
    // console.log('inboxIRI:')
    // console.log(inboxIRI)
    // console.log('Config.Inbox:')
    // console.log(Config.Inbox)
    // console.log('Config.Notification:')
    // console.log(Config.Notification)
    // console.log('Config.Activity:')
    // console.log(Config.Activity)
    if (Config.Inbox[inboxIRI]) {
      Config.Inbox[inboxIRI]['Notifications'].forEach(notification => {
        // console.log(notification)
        if (Config.Notification[notification]) {
          if (Config.Notification[notification]['Activities']) {
            Config.Notification[notification]['Activities'].forEach(activity => {
              // console.log('   ' + activity)
              if (!document.querySelector('[about="' + activity + '"]') && Config.Activity[activity] && Config.Activity[activity]['Graph']) {
                showAnnotation(activity, Config.Activity[activity]['Graph']);
              }
            })
          }
        }
        else {
          showActivities(notification, { notification: true });
        }
      });
    }
    else {
      showNotificationSources(inboxIRI);
    }
  }

  var datetime = getGraphDate(note);

  // console.log(datetime);
  //TODO: Create a helper function to look for annotater, e.g., getGraphAnnotatedBy
  var annotatedBy =
    (note.out(ns.schema.creator).values.length) ? note.out(ns.schema.creator) :
    (note.out(ns.dcterms.creator).values.length) ? note.out(ns.dcterms.creator) :
    (note.out(ns.as.creator).values.length) ? note.out(ns.as.creator) :
    undefined;

  var annotatedByIRI;
  // console.log(annotatedBy);
  if (annotatedBy) {
    annotatedByIRI = annotatedBy.values[0];
    // console.log(annotatedByIRI);
    annotatedBy = g.node(rdf.namedNode(annotatedByIRI));
    // console.log(annotatedBy);

    var annotatedByName = getAgentName(annotatedBy);
    // console.log(annotatedByName);
    var annotatedByImage = getGraphImage(annotatedBy);
    // console.log(annotatedByImage);
    var annotatedByURL = annotatedBy.out(ns.schema.url).values[0];
  }

  var motivatedBy = 'oa:replying';

  //XXX: Is this used? Probably. Fix bodyValue
  var bodyValue = note.out(ns.schema.description).values[0] || note.out(ns.dcterms.description).values[0] || note.out(ns.as.content).values[0];

  var types = getGraphTypes(note);
  // console.log(types);
  var resourceTypes = [];
  types.forEach(type => {
    resourceTypes.push(type);
    // console.log(type);
  });

  if (resourceTypes.includes(ns.oa.Annotation.value)) {
    bodyValue = note.out(ns.oa.bodyValue).values[0] || bodyValue;
    var hasBody = note.out(ns.oa.hasBody).values;

    if (hasBody.length) {
      var noteLanguage = getGraphLanguage(note);
      var noteLicense = getGraphLicense(note);
      var noteRights = getGraphRights(note);

      var bodyObjects = [];
      // console.log(note.oahasBody)
      // console.log(note.oahasBody._array)
      hasBody.forEach(bodyIRI => {
        // console.log(bodyIRI);
        var bodyObject = {
          "id": bodyIRI
        };

        var body = g.node(rdf.namedNode(bodyIRI));

        if (body) {
          // console.log(body.toString());

          var bodyTypes = getGraphTypes(body);
          if (bodyTypes.length) {
            bodyObject['type'] = bodyTypes;
          }

          var rdfValue = body.out(ns.rdf.value).values;
          if (rdfValue.length) {
            bodyObject['value'] = rdfValue[0];
          }

          var hasPurpose = body.out(ns.oa.hasPurpose).values;
          if (hasPurpose.length) {
            // console.log(body.oahasPurpose)
            bodyObject['purpose'] = hasPurpose[0];
          }

          //TODO: Revisit format and language when there is a hasPurpose (e.g., describing, tagging)

          var bodyFormat = body.out(ns.dcelements.format).values[0] || body.out(ns.dcterms.format).values[0];
          if (bodyFormat) {
            bodyObject['format'] = bodyFormat;
          }

          var bodyLanguage = getGraphLanguage(body) || noteLanguage;
          if (bodyLanguage) {
            // console.log(bodyLanguage)
            bodyObject['language'] = bodyLanguage;
          }

          var bodyLicense = getGraphLicense(body) || noteLicense;
          if (bodyLicense) {
            // console.log(bodyLicense)
            bodyObject['license'] = bodyLicense;
          }

          var bodyRights = getGraphRights(body) || noteRights;
          if (bodyRights) {
          // console.log(bodyRights)
            bodyObject['rights'] = bodyRights;
          }
        }
        bodyObjects.push(bodyObject);
      })

      const encryptedBodyItems = bodyObjects.filter(b => b.value && isJWE(b.value));
      if (encryptedBodyItems.length) {
        if (isUnlocked()) {
          for (const b of encryptedBodyItems) {
            try {
              b.value = await decryptWithSession(b.value);
            } catch(e) {
              console.error('showAnnotation: body decrypt failed', e);
            }
          }
        } else {
          if (!pendingEncryptedAnnotations.some(p => p.noteIRI === noteIRI)) {
            pendingEncryptedAnnotations.push({ noteIRI, g, options });
          }
          if (encryptionNeededHandler && !document.getElementById('encryption-unlock')) {
            encryptionNeededHandler();
          }
          return;
        }
      }
      // console.log(bodyObjects)
    }

    // console.log(documentURL)
    // Pointer chaining so blank-node targets are traversed correctly
    var targetPtr = note.out(ns.oa.hasTarget);
    var hasTarget = targetPtr.values[0];
    var targetIRI = hasTarget;
    // console.log(targetIRI);

    var source = targetPtr.out(ns.oa.hasSource).values[0];
    // oa:hasTarget may be a blank node with oa:hasSource pointing to the document
    var targetOrSource = source || hasTarget;
    if (targetOrSource && !(targetOrSource.startsWith(documentURL) || 'targetInPreferredIRI' in options || 'targetInSameAs' in options)){
      return;
    }
    // console.log(source);
    // console.log(note.oamotivatedBy);
    var motivatedBy = note.out(ns.oa.motivatedBy).values[0];
    if (motivatedBy) {
      refLabel = getReferenceLabel(motivatedBy);
    }

    // Resolve the typed selector tree via @dokieli/web-annotation
    var exact, prefix, suffix, selector;
    var parsedAnnotation = await parseAnnotationFromGraph(g, note.value || noteIRI);
    var parsedSelector = parsedAnnotation?.target?.selector;

    var textQuote = textQuoteFromSelector(parsedSelector);
    if (textQuote) {
      exact = textQuote.exact;
      prefix = textQuote.prefix;
      suffix = textQuote.suffix;
    }

    if (parsedSelector?.type === 'FragmentSelector' && parsedSelector.value
        && parsedSelector.conformsTo && parsedSelector.conformsTo.endsWith('://tools.ietf.org/html/rfc3987')) {
      var fragment = parsedSelector.value;
      fragment = (fragment.indexOf('#') == 0) ? getFragmentFromString(fragment) : fragment;

      if (fragment !== '') {
        containerNode = document.getElementById(fragment) || selectArticleNode(document);
      }
    }

    if ([exact, prefix, suffix].some(v => v && isJWE(v))) {
      if (isUnlocked()) {
        const dec = async v => (v && isJWE(v)) ? decryptWithSession(v) : v;
        [exact, prefix, suffix] = await Promise.all([dec(exact), dec(prefix), dec(suffix)]);
      } else {
        if (!pendingEncryptedAnnotations.some(p => p.noteIRI === noteIRI)) {
          pendingEncryptedAnnotations.push({ noteIRI, g, options });
        }
        if (encryptionNeededHandler && !document.getElementById('encryption-unlock')) {
          encryptionNeededHandler();
        }
        return;
      }
    }

    // console.log(exact);
    // console.log(prefix);
    // console.log(suffix);
    // console.log('----')
    var docRefType = '<sup class="ref-annotation"><a href="#' + id + '" rel="cito:hasReplyFrom" resource="' + noteIRI + '">' + refLabel + '</a></sup>';

    var containerNodeTextContent = getTextContentExcludingSups(containerNode);
    //XXX: Seems better?
    // var containerNodeTextContent = fragmentFromString(getDocument(containerNode)).textContent.trim();

    // console.log(containerNodeTextContent);
    // console.log(prefix + exact + suffix);
    var selectorIndex = containerNodeTextContent.indexOf((prefix || '') + (exact || '') + (suffix || ''));
    // console.log(selectorIndex);
    if (selectorIndex >= 0) {
      selector =  {
        "prefix": prefix,
        "exact": exact,
        "suffix": suffix
      };

      // Exclude sup reference markers so offsets match getTextContentExcludingSups
      var markOptions = { 'annotationUrl': noteIRI, 'id': refId, 'className': 'ref do', 'reference': docRefType, 'excludeMatchesIn': '#document-notifications', 'ignoreSelector': 'sup' };
      // Don't re-mark if the passage was already marked at creation time (detect by the reference link).
      var existingMark = containerNode.querySelector('[resource="' + noteIRI + '"]');
      var selectedParentNode = existingMark
        ? existingMark.closest('[id]')
        : (textQuote
          ? applyMarksFromTextQuote(containerNode, selector, markOptions)
          : (parsedSelector ? applyMarkFromSelector(containerNode, parsedSelector, markOptions) : null));

      var parentNodeWithId = selectedParentNode?.closest('[id]');
      targetIRI = (parentNodeWithId) ? documentURL + '#' + parentNodeWithId.id : documentURL;
      // console.log(parentNodeWithId, targetIRI)
      var noteData = {
        "type": 'comment',
        "mode": "read",
        "motivatedBy": motivatedBy,
        "id": id,
        "refId": refId,
        "iri": noteIRI, //e.g., https://example.org/path/to/article
        "creator": {},
        "target": {
          "iri": targetIRI,
          "source": source,
          "selector": {
            "exact": exact,
            "prefix": prefix,
            "suffix": suffix
          }
          //TODO: state
        }
      }
      if (bodyValue) {
        noteData["bodyValue"] = bodyValue;
      }
      if (bodyObjects) {
        noteData["body"] = bodyObjects;
      }
      if (annotatedByIRI) {
        noteData.creator["iri"] = annotatedByIRI;
      }
      if (annotatedByName) {
        noteData.creator["name"] = annotatedByName;
      }
      if (annotatedByImage) {
        noteData.creator["image"] = annotatedByImage;
      }
      if (annotatedByURL) {
        noteData.creator["url"] = annotatedByURL;
      }
      if (noteLanguage) {
        noteData["language"] = noteLanguage;
      }
      if (noteLicense) {
        noteData["license"] = noteLicense;
      }
      if (noteRights) {
        noteData["rights"] = noteRights;
      }
      if (inboxIRI) {
        noteData["inbox"] = inboxIRI;
      }
      if (datetime){
        noteData["datetime"] = datetime;
      }

      await addNoteToNotifications(noteData);

      // var asideNode = fragmentFromString(asideNote);
      // var parentSection = getClosestSectionNode(selectedParentNode);
      // parentSection.appendChild(asideNode);
      // XXX: Keeping this comment around for emergency
      // selectedParentNode.parentNode.insertBefore(asideNode, selectedParentNode.nextSibling);

      //Perhaps return something more useful?
      return noteIRI;
    }

    //XXX: Annotation without a selection
    else {
      noteData = {
        "type": 'comment',
        "mode": "read",
        "motivatedBy": motivatedBy,
        "id": id,
        "refId": refId,
        "refLabel": refLabel,
        "iri": noteIRI,
        "creator": {},
        "target": {
          "iri": targetIRI
        }
      };
      if (bodyValue) {
        noteData["bodyValue"] = bodyValue;
      }
      if (bodyObjects) {
        noteData["body"] = bodyObjects;
      }
      if (annotatedByIRI) {
        noteData.creator["iri"] = annotatedByIRI;
      }
      if (annotatedByName) {
        noteData.creator["name"] = annotatedByName;
      }
      if (annotatedByImage) {
        noteData.creator["image"] = annotatedByImage;
      }
      if (noteLanguage) {
        noteData["language"] = noteLanguage;
      }
      if (noteLicense) {
        noteData["license"] = noteLicense;
      }
      if (noteRights) {
        noteData["rights"] = noteRights;
      }
      if (inboxIRI) {
        noteData["inbox"] = inboxIRI;
      }
      if (datetime){
        noteData["datetime"] = datetime;
      }
      // console.log(noteData)
      await addNoteToNotifications(noteData);
    }
  }
  //TODO: Refactor
  else if (note.out(ns.as.inReplyTo).values[0] || note.out(ns.sioc.replyof).values[0]) {
    var inReplyTo, inReplyToRel;
    if (note.out(ns.as.inReplyTo).values[0]) {
      inReplyTo = note.out(ns.as.inReplyTo).values[0];
      inReplyToRel = 'as:inReplyTo';
    }
    else if (note.out(ns.sioc.reply_of).values[0]) {
      inReplyTo = note.out(ns.sioc.reply_of).values[0];
      inReplyToRel = 'sioc:reply_of';
    }

    if (inReplyTo && inReplyTo.includes(documentURL)) {
      noteData = {
        "type": 'comment',
        "mode": "read",
        "motivatedBy": motivatedBy,
        "id": id,
        "refId": refId,
        "refLabel": refLabel,
        "iri": noteIRI,
        "creator": {},
        "target": {
          'iri': inReplyTo,
          'rel': inReplyToRel
        }
      };
      if (bodyValue) {
        noteData["bodyValue"] = bodyValue;
      }
      if (bodyObjects) {
        noteData["body"] = bodyObjects;
      }
      if (annotatedByIRI) {
        noteData.creator["iri"] = annotatedByIRI;
      }
      if (annotatedByName) {
        noteData.creator["name"] = annotatedByName;
      }
      if (annotatedByImage) {
        noteData.creator["image"] = annotatedByImage;
      }
      if (noteLanguage) {
        noteData["language"] = noteLanguage;
      }
      if (noteLicense) {
        noteData["license"] = noteLicense;
      }
      if (noteRights) {
        noteData["rights"] = noteRights;
      }
      if (inboxIRI) {
        noteData["inbox"] = inboxIRI;
      }
      if (datetime){
        noteData["datetime"] = datetime;
      }
      await addNoteToNotifications(noteData);
    }
    else {
      console.log(noteIRI + ' is not an oa:Annotation, as:inReplyTo, sioc:reply_of');
    }
  }
}
