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

import { diffArrays } from "diff";
import { accessModePossiblyAllowed } from "./access.js";
import { addMessageToLog, getDocument, getResourceInfo, processSupplementalInfoLinkHeaders, showActionMessage, updateResourceInfos, updateSupplementalInfo } from "./doc.js";
import { getDeviceStorageItem, updateDeviceStorageItem, updateStorage, removeDeviceStorageDocumentFromCollection } from "./storage.js";
import { getDateTimeISO, getDateTimeISOFromDate, getHash } from "./util.js";
import { fragmentFromString, getDocumentNodeFromString, parseMarkdown } from "./utils/html.js";
import { normalizeForDiff } from "./utils/normalization.js";
import { getButtonHTML, updateButtons } from "./ui/buttons.js";
import Config from "./config.js";
import { i18n } from "./i18n.js";
import { sanitizeInsertAdjacentHTML } from "./utils/sanitization.js";
import { restoreYjsContent, addYjsVersion, getYjsVersions } from "./editor/editor.js";

export async function syncLocalRemoteResource(options = {}) {
  // console.log('--- syncLocalRemoteResource');

  const documentOptions = {
    ...Config.DOMProcessing,
    format: true,
    sanitize: true,
    normalize: true
  };

  const localETag = Config.Resource[Config.DocumentURL]?.headers?.etag?.['field-value'];
  let localContentType = 'text/html';
  const headers = {
    'Accept': localContentType
  };

  if (localETag) {
    headers['If-None-Match'] = localETag;
  }

  let reviewOptions = {}

  let storageObject;
  let remoteHash;
  let remoteContent;
  let remoteContentNode;
  let response;
  let status;
  let remoteETag;
  let remoteLastModified;
  let remoteDate;
  Config['Resource'][Config.DocumentURL] ||= {};
  const previousRemoteHash = Config.Resource[Config.DocumentURL]['digestSRI'];

  const hasAccessModeWrite = accessModePossiblyAllowed(Config.DocumentURL, 'write');

  storageObject = await getDeviceStorageItem(Config.DocumentURL);

  const remoteAutoSaveEnabled = (storageObject && storageObject.autoSave !== undefined) ? storageObject.autoSave : true;

  // let latestLocalDocumentItemObject = (storageObject && storageObject.items?.length) ? await getDeviceStorageItem(storageObject.items[0]) : null;

  let localContent;
  let latestLocalDocumentItemObjectPublished;
  let latestLocalDocumentItemObjectUnpublished;

  if (storageObject?.items?.length) {
    for (const item of storageObject.items) {
      const r = await getDeviceStorageItem(item);
      if (r?.published && !latestLocalDocumentItemObjectPublished) {
        latestLocalDocumentItemObjectPublished = r;
      }
      if (!r?.published && !latestLocalDocumentItemObjectUnpublished) {
        latestLocalDocumentItemObjectUnpublished = r;
      }
      if (latestLocalDocumentItemObjectPublished && latestLocalDocumentItemObjectUnpublished) {
        break;
      }
    }
  }

  localContent = Config.DocumentString || getDocument(null, documentOptions);
  Config.DocumentString = null;


// console.log(localContent)
  let localHash = await getHash(localContent);
  let data;

  if (latestLocalDocumentItemObjectUnpublished) {
    const { digestSRI, mediaType, content } = latestLocalDocumentItemObjectUnpublished;
    localContent = content;
    localHash = digestSRI;
    localContentType = mediaType;
  }

  if (Config.DocumentURL.startsWith('file:')) {
    await updateResourceInfos(Config.DocumentURL, localContent, null, { storeHash: true, digestSRI: localHash });
    return;
  }

  //200
  try {
    response = await Config.Storage.get(Config.DocumentURL, headers, {});
    status = response.status;
    remoteETag = response.headers.get('ETag');
    remoteLastModified = response.headers.get('Last-Modified');
    remoteDate = response.headers.get('Date');

    data = await response.text();

    const remoteContentType = response.headers.get('Content-Type')?.split(';')[0].toLowerCase().trim();
    if (['text/markdown', 'text/plain'].includes(remoteContentType)) {
      data = parseMarkdown(data, { createDocument: true });
    }

    // remoteContentNode = getDocumentNodeFromString(data);
    // remoteContent = getDocument(remoteContentNode.documentElement, documentOptions);
    remoteContent = getDocument(data, documentOptions);
// console.log('remoteContent: ', remoteContent)
    remoteContentNode = getDocumentNodeFromString(remoteContent);

    remoteHash = await getHash(remoteContent);

    let linkHeadersOptions = {};
    if (!Config['Resource'][Config.DocumentURL]['headers']) {
      linkHeadersOptions['followLinkRelationTypes'] = ['describedby'];
    }

    //Need to make sure to wait
    await updateResourceInfos(Config.DocumentURL, remoteContent, response, { storeHash: true, digestSRI: remoteHash });
    processSupplementalInfoLinkHeaders(Config.DocumentURL, linkHeadersOptions);

    // Config.Resource[Config.DocumentURL]['digestSRI'] = remoteHash;
  }
  //304, 403, 404, 405
  catch (e) {
    // console.log(e);
    // console.log(e.response)
    status = e.status || 0;
    response = e.response;
    remoteETag = response?.headers.get('ETag');
    remoteLastModified = response?.headers.get('Last-Modified');
    remoteDate = response?.headers.get('Date');

    remoteContent = Config.Resource[Config.DocumentURL].data;
    remoteContentNode = getDocumentNodeFromString(remoteContent);
    remoteHash = await getHash(remoteContent);

    if (response) {
      updateSupplementalInfo(response);
    }

    var message = '';
    var actionMessage = '';
    let errorKey = 'default';
    let actionMessageKey = 'default-action-message';
    // var actionTerm = 'update';
    var url = Config.DocumentURL;

    if (status != 304 && status != 404) {
      console.log(e)
      switch (status) {
        default:
          message = `<code>${status}, ${e.message}</code>`;
          break;

        case 401:
          if (Config.User.IRI) {
            errorKey = 'unauthorized';
            actionMessageKey = 'unauthorized-action-message';
          }
          else {
            errorKey = 'unauthenticated';
            actionMessageKey = 'unauthenticated-action-message';
          }

          return;

        case 403:
          if (Config.User.IRI) {
            errorKey = 'forbidden';
            actionMessageKey = 'forbidden-action-message';
          }
          else {
            errorKey = 'unauthenticated';
            actionMessageKey = 'unauthenticated-action-message';
          }

          return;
      }

      message = message + `<span data-i18n="dialog.remote-sync.error.${errorKey}.span">${i18n.t(`dialog.remote-sync.error.${errorKey}.span.textContent`),{url,button:Config.Button.SignIn}}</span>`;
      

      let messageObject = {
        'content': actionMessage,
        'type': 'error',
        'timer': null,
        'code': status
      }

      addMessageToLog({...messageObject, content: message}, Config.MessageLog);
      showActionMessage(document.body, messageObject);
    }
  }

  // console.log(`localContent: ${localContent}`);
  // console.log(`localHash: ${localHash}`);
  // console.log('-------');
  // console.log(`data: ${data}`);
  // console.log(`dataHash: ${dataHash}`);
  // console.log('-------');
  // console.log(`remoteContent: ${remoteContent}`);
  // console.log(`remoteHash: ${remoteHash}`);
  // console.log(`previousRemoteHash: ${previousRemoteHash}`);

  const remotePublishDate = getDateTimeISOFromDate(remoteLastModified) || getDateTimeISOFromDate(remoteDate) || getDateTimeISO();

  const etagWasUsed = !!(headers['If-None-Match'] && remoteETag);
  const etagsMatch = etagWasUsed && headers['If-None-Match'] === remoteETag;

  const localRemoteHashMatch = localHash == remoteHash;

  if (localHash && remoteHash && localRemoteHashMatch) {
    return;
  }

  if (options.forceLocal || options.forceRemote) {
    if (etagWasUsed && !etagsMatch && !options.forceRemote && status !== 304) {
      if (Config.Editor['collab']) {
        // In collab mode the Yjs CRDT is the authority — force-push local state.
        console.log('Collab mode: ETag mismatch, force-pushing Yjs state.');
        await pushLocalContentToRemote(latestLocalDocumentItemObjectUnpublished, {});
        return;
      }
      reviewOptions['message'] = `<span data-i18n="dialog.review-changes.message.etag-mismatch.span">${i18n.t('dialog.review-changes.message.etag-mismatch.span.textContent')}</span>`;
      showResourceReviewChanges(localContent, remoteContent, response, reviewOptions);
      return;
    }

    if (!etagWasUsed) {
      console.log(`ETags were not used. Assume user intent is valid.`);
    }

    if (options.forceLocal) {
      if (!hasAccessModeWrite) {
        console.log(`No Write access.`);

        //TODO: showModalSyncRemote()

        return;
      }

      if (!remoteAutoSaveEnabled) {
        console.log('Remote autoSave is disabled. Asking to enable autosave-remote');

        //TODO: showModalEnableAutoSave()
      }

      console.log(`Force pushing local content.`);

      const h = localETag ? { 'If-Match': localETag } : {};

      try {
        await pushLocalContentToRemote(latestLocalDocumentItemObjectUnpublished, h);
        return;
      }
      catch(error) {
        if (error.status === 412) {
          syncLocalRemoteResource();
        }
        else {
          throw new Error(`${error.status} Unhandled status ${error}`);
        }
      }

      return;
    }

    if (options.forceRemote) {
      console.log(`Force replacing with remote content.`);

      removeDeviceStorageDocumentFromCollection(Config.DocumentURL, latestLocalDocumentItemObjectUnpublished.id);

      Config.Editor.replaceContent(Config.Editor.mode, remoteContentNode);
      Config.Editor.init(Config.Editor.mode, document.body);
      await autoSave(Config.DocumentURL, { method: 'IndexedDB', published: remotePublishDate });
      await updateResourceInfos(Config.DocumentURL, remoteContent, response);
      return;
    }
  }

  if (latestLocalDocumentItemObjectUnpublished) {
    var tmplLocal = document.implementation.createHTMLDocument('template');
    tmplLocal.documentElement.setHTMLUnsafe(localContent);
    const localContentNode = tmplLocal.body;

    if (previousRemoteHash !== undefined && previousRemoteHash !== remoteHash && status !== 304) {
      if (Config.Editor['collab']) {
        console.log('Collab mode: conflict, force-pushing Yjs state.');
        await pushLocalContentToRemote(latestLocalDocumentItemObjectUnpublished, {});
        return;
      }
      reviewOptions['message'] = `<span data-i18n="dialog.review-changes.message.conflict.span">${i18n.t('dialog.review-changes.message.conflict.span.textContent')}</span>`;
      showResourceReviewChanges(localContent, remoteContent, Config.Resource[Config.DocumentURL].response, reviewOptions);
      return;
    }
  }

  switch(status) {
    case 200:
      console.log(`Local or remote changed.`);

      if (latestLocalDocumentItemObjectUnpublished) {
        if (etagsMatch || previousRemoteHash === undefined || previousRemoteHash == remoteHash) {
          console.log(`Local unpublished changes. Remote unchanged (200). Should update remote.`);

          if (!remoteAutoSaveEnabled) {
            console.log(`remoteAutoSave is disabled.`);
            return;
          }

          if (!hasAccessModeWrite) {
            console.log(`No Write access.`);
            return;
          }

          const h = localETag ? { 'If-Match': localETag } : {};

          try {
            await pushLocalContentToRemote(latestLocalDocumentItemObjectUnpublished, h);
            return;
          }
          catch(error) {
            if (error.status === 412) {
              syncLocalRemoteResource();
            }
            // else: push failed (e.g., 403/405 on read-only remote) — silently keep local edits
          };
        }
        else {
          if (Config.Editor['collab']) {
            console.log('Collab mode: local and remote both changed, force-pushing Yjs state.');
            await pushLocalContentToRemote(latestLocalDocumentItemObjectUnpublished, {});
            return;
          }
          let localUnpublishedChangesRemoteChanged = i18n.t('dialog.review-changes.message.local-remote-changed.span.textContent');
          reviewOptions['message'] = `<span data-i18n="dialog.review-changes.message.local-remote-changed.span">${localUnpublishedChangesRemoteChanged}</span>`;
          console.log(localUnpublishedChangesRemoteChanged);
          showResourceReviewChanges(localContent, remoteContent, response, reviewOptions);
        }
      }
      else if (previousRemoteHash !== undefined && previousRemoteHash != remoteHash) {
        console.log(previousRemoteHash)

        console.log(`Local unchaged. Remote changed. Update local.`);
        try {
          Config.Editor.replaceContent(Config.Editor.mode, remoteContentNode);
          Config.Editor.init(Config.Editor.mode, document.body);
        } catch(e) { console.log ("continue")}

        await autoSave(Config.DocumentURL, { method: 'IndexedDB', published: remotePublishDate });
        await updateResourceInfos(Config.DocumentURL, remoteContent, response);
      }
      else {
        reviewOptions['message'] = `<span data-i18n="dialog.review-changes.message.remote-changed.span">${i18n.t('dialog.review-changes.message.remote-changed.span.textContent')}</span>`;
        syncLocalRemoteResource();
      }

      break;

    //Because of GET If-None-Match: <etag>
    case 304:
      if (latestLocalDocumentItemObjectUnpublished) {
        console.log(`Local unpublished changes. Remote unchanged (304). Should update remote.`);

        if (!remoteAutoSaveEnabled) {
          console.log(`remoteAutoSave is disabled.`);
          return;
        }

        if (!hasAccessModeWrite) {
          console.log(`No Write access.`);
          return;
        }

        const h = localETag ? { 'If-Match': localETag } : {};

        try {
          await pushLocalContentToRemote(latestLocalDocumentItemObjectUnpublished, h);
          return;
        }
        catch(error) {
          if (error.status === 412) {
            syncLocalRemoteResource();
          }
          else {
            throw new Error(`${error.status} Unhandled status ${error}`);
          }
        };
      }

      break;

    case 404:
      console.log('Remote was deleted. Push local to remote.');

      if (!remoteAutoSaveEnabled) {
        console.log(`remoteAutoSave is disabled.`);
        return;
      }

      if (!hasAccessModeWrite) {
        console.log(`No Write access.`);
        return;
      }

      try {
        await pushLocalContentToRemote(latestLocalDocumentItemObjectUnpublished, { 'If-None-Match': '*' });
        return;
      }
      catch (error) {
        if (error.status === 412) {
          syncLocalRemoteResource();
        }
        else {
          throw new Error(`${error.status} Unhandled status ${error}`);
        }
      }

      break;

    case 403:
      console.log(`TODO: ${status} Request access because you lost access. Keep working in local.`);
      break;

    default:
      console.log(`TODO: ${status} Unhandled status code.`);
      break;
  }

  return;
}

export async function pushLocalContentToRemote(localItem, headers) {
  const { id, content, mediaType } = localItem;
  // console.log(localItem, headers)

  const response = await Config.Storage.put(Config.DocumentURL, content, mediaType, null, { headers });

  console.log(`Remote updated (${response.status}).`);

  updateDeviceStorageItem(id, { published: getDateTimeISO() });

  updateResourceInfos(Config.DocumentURL, content, response, { preserveHeaders: ['wac-allow'] });

  window.dispatchEvent(new CustomEvent('dokieli:collab-save'));
}

export function showResourceReviewChanges(localContent, remoteContent, response, reviewOptions) {
  if (!localContent.length || !remoteContent.length) return;

  const isVersionPreview = reviewOptions?.mode === 'edit-history-preview';

  var tmplLocal = document.implementation.createHTMLDocument('template');
  tmplLocal.documentElement.setHTMLUnsafe(localContent);
  const localContentNode = tmplLocal.body;

  var tmplRemote = document.implementation.createHTMLDocument('template');
  tmplRemote.documentElement.setHTMLUnsafe(remoteContent);
  const remoteContentNode = tmplRemote.body;

  const tokenizeHTML = (html) => {
    return html.split(/(<[^>]+>)/g).filter(Boolean);
  };

  const localNormalized = normalizeForDiff(localContentNode);
  const remoteNormalized = normalizeForDiff(remoteContentNode);

  const localTokens = tokenizeHTML(localNormalized);
  const remoteTokens = tokenizeHTML(remoteNormalized);

  const diff = diffArrays(remoteTokens, localTokens)

  if (!diff.length || !diff.filter(d => d.added || d.removed).length) return;

  const reviewChanges = document.getElementById('review-changes');

  if (reviewChanges) {
    reviewChanges.remove();
  }

  let message = '';
  if (reviewOptions?.message) {
    message = `<p>${reviewOptions?.message}</p>`;
  }

  const panelTitle = isVersionPreview
    ? `${i18n.t('dialog.edit-history-preview.h2.textContent')}`
    : `${i18n.t('dialog.review-changes.h2.textContent')} ${Config.Button.Info.ReviewChanges}`;

  const panelTitleI18n = isVersionPreview ? 'dialog.edit-history-preview.h2' : 'dialog.review-changes.h2';

  var buttonClose = isVersionPreview
    ? getButtonHTML({ key: 'dialog.edit-history-preview.close.button', button: 'close', buttonClass: 'close', iconSize: 'fa-2x' })
    : getButtonHTML({ key: 'dialog.review-changes.close.button', button: 'close', buttonClass: 'close', iconSize: 'fa-2x' });

  document.body.appendChild(fragmentFromString(`
    <aside aria-labelledby="review-changes-label" class="do on" dir="${Config.User.UI.LanguageDir}" id="review-changes" lang="${Config.User.UI.Language}" rel="schema:hasPart" resource="#review-changes" xml:lang="${Config.User.UI.Language}">
      <h2 data-i18n="${panelTitleI18n}" id="review-changes-label" property="schema:name">${panelTitle}</h2>
      ${buttonClose}
      <div class="info">${message}</div>
    </aside>`));

  let insCounter = 0;
  let delCounter = 0;

  let diffHTML = [];
  diff.forEach(part => {
    let eName;
    if (part.added) { eName = 'ins'; insCounter++; }
    else if (part.removed) { eName = 'del'; delCounter++; }

    const val = part.value.join('');
    if (eName) {
      diffHTML.push(`<${eName}>${val}</${eName}>`);
    } else {
      diffHTML.push(val);
    }
  });

  let detailsInsDel = `
    <details>
      <summary data-i18n="dialog.review-changes.more-details.summary">${i18n.t('dialog.review-changes.more-details.summary.textContent')}</summary>
      <table dir="auto">
        <caption data-i18n="dialog.review-changes.difference.caption">${i18n.t('dialog.review-changes.difference.caption.textContent')}</caption>
        <thead>
          <tr>
            <th data-i18n="dialog.review-changes.changes.th">${i18n.t('dialog.review-changes.changes.th.textContent')}</th>
            <th data-i18n="dialog.review-changes.count.th">${i18n.t('dialog.review-changes.count.th.textContent')}</th>
            <th data-i18n="dialog.review-changes.example.th">${i18n.t('dialog.review-changes.example.th.textContent')}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td data-i18n="dialog.review-changes.added.td">${i18n.t('dialog.review-changes.added.td.textContent')}</td>
            <td>${insCounter}</td>
            <td><ins data-i18n="dialog.review-changes.example-text.ins">${i18n.t('dialog.review-changes.example-text.ins.textContent')}</ins></td>
          </tr>
          <tr>
            <td data-i18n="dialog.review-changes.removed.td">${i18n.t('dialog.review-changes.removed.td.textContent')}</td>
            <td>${delCounter}</td>
            <td><del data-i18n="dialog.review-changes.example-text.del">${i18n.t('dialog.review-changes.example-text.del.textContent')}</del></td>
          </tr>
        </tbody>
      </table>
    </details>
    `;

  var node = document.getElementById('review-changes');

  sanitizeInsertAdjacentHTML(node.querySelector('div.info'), 'beforeend', detailsInsDel);

  if (isVersionPreview) {
    sanitizeInsertAdjacentHTML(node, 'beforeend', `
      <div class="do-diff" dir="auto">${diffHTML.join('')}</div>
      <button class="version-restore" data-i18n="dialog.edit-history-preview.restore.button" title="${i18n.t('dialog.edit-history-preview.restore.button.title')}" type="button">${i18n.t('dialog.edit-history-preview.restore.button.textContent')}</button>
    `);
  } else {
    sanitizeInsertAdjacentHTML(node, 'beforeend', `
      <div class="do-diff" dir="auto">${diffHTML.join('')}</div>
      <button class="review-changes-save-local" data-i18n="dialog.review-changes.save-local.button" title="${i18n.t('dialog.review-changes.save-local.button.textContent')}" type="button">${i18n.t('dialog.review-changes.save-local.button.title')}</button>
      <button class="review-changes-save-remote" data-i18n="dialog.review-changes.save-remote.button" title="${i18n.t('dialog.review-changes.save-remote.button.title')}" type="button">${i18n.t('dialog.review-changes.save-remote.button.textContent')}</button>
      <button class="review-changes-submit" data-i18n="dialog.review-changes.save.button" title="${i18n.t('dialog.review-changes.save.button.title')}" type="submit">${i18n.t('dialog.review-changes.save.button.textContent')}</button>
    `);

    const diffNode = document.querySelector('#review-changes .do-diff');
    Config.Editor['review'] = true;
    Config.Editor.init("author", diffNode);
  }

  node.addEventListener('click', e => {
    var button = e.target.closest('button');

    if (button) {
      if (button.classList.contains('close')) {
        if (!isVersionPreview) Config.Editor['review'] = false;
        return;
      }
      if (button.classList.contains('info')) {
        return;
      }

      if (isVersionPreview) {
        if (button.classList.contains('version-restore')) {
          const versionItem = reviewOptions.versionItem;
          if (Config.Editor['collab']) {
            restoreYjsContent(versionItem.content, versionItem.updated || versionItem.id);
            autoSave(Config.DocumentURL, { method: 'IndexedDB' });
          } else {
            const tmpl = document.implementation.createHTMLDocument('');
            tmpl.documentElement.setHTMLUnsafe(versionItem.content);
            Config.Editor.replaceContent(Config.Editor.mode, tmpl.body);
            Config.Editor.init(Config.Editor.mode, document.body);
            autoSave(Config.DocumentURL, { method: 'IndexedDB' });
            syncLocalRemoteResource({ forceLocal: true });
          }
        }
        node.remove();
        return;
      }

      var diffedNode = node.querySelector('.do-diff');
      const diffNode = diffedNode;

      //TODO: Progress

      //TODO: update getResourceInfo somewhere

      if (button.classList.contains('review-changes-save-local')) {
        syncLocalRemoteResource({ forceLocal: true });
      }
      else if (button.classList.contains('review-changes-save-remote')) {
        syncLocalRemoteResource({ forceRemote: true });
      }
      else if (button.classList.contains('review-changes-submit')) {
        diffedNode.querySelectorAll('del').forEach(el => el.remove());
        diffedNode.querySelectorAll('ins').forEach(el => {
          const parent = el.parentNode;
          while (el.firstChild) parent.insertBefore(el.firstChild, el);
          el.remove();
        });
        Config.Editor.replaceContent(Config.Editor.mode, diffNode.querySelector('.ProseMirror'));
        Config.Editor.init(Config.Editor.mode, document.body);
        autoSave(Config.DocumentURL, { method: 'IndexedDB' });

        syncLocalRemoteResource({ forceLocal: true });
      }

      Config.Editor['review'] = false;
      node.remove();
    }
  });
}

export function monitorNetworkStatus() {
  let messageId;

  if (Config.DocumentURL.startsWith('blob:')) {
    return;
  }

  window.addEventListener('online', async () => {
    console.log('online');
    await enableRemoteSync();
    await syncLocalRemoteResource();

    const storageObject = await getDeviceStorageItem(Config.DocumentURL);

    const remoteAutoSaveEnabled = (storageObject && storageObject.autoSave !== undefined) ? storageObject.autoSave : true;

    let message;

    if (remoteAutoSaveEnabled) {
      message = `<span data-i18n="dialog.document-action-message.online.autosave-enabled.span">${i18n.t('dialog.document-action-message.online.autosave-enabled.span.textContent')}</span>`;

    } else {
      message = `<span data-i18n="dialog.document-action-message.online.autosave-disabled.span">${i18n.t('dialog.document-action-message.online.autosave-disabled.span.textContent')}</span>`;
    }

    message = {
      'content': message,
      'type': 'info',
    }
    addMessageToLog(message, Config.MessageLog);

    messageId = showActionMessage(document.body, message, messageId ? { clearId: messageId } : {});
  });


  window.addEventListener('offline', async () => {
    console.log('offline');

    await disableRemoteSync();

    const storageObject = await getDeviceStorageItem(Config.DocumentURL);

    const remoteAutoSaveEnabled = (storageObject && storageObject.autoSave !== undefined) ? storageObject.autoSave : true;

    let message;

    if (remoteAutoSaveEnabled) {
      message = `<span data-i18n="dialog.document-action-message.offline.autosave-enabled.span">${i18n.t('dialog.document-action-message.offline.autosave-enabled.span.textContent')}</span>`;
    } else {
      message = `<span data-i18n="dialog.document-action-message.offline.autosave-disabled.span">${i18n.t('dialog.document-action-message.offline.autosave-disabled.span.textContent')}</span>`;
    }

    message = {
      'content': message,
      'type': 'info',
      'timer': null
    }
    addMessageToLog(message, Config.MessageLog);

    messageId = showActionMessage(document.body, message, messageId ? { clearId: messageId } : {});
  });
}

export async function autoSave(key, options) {
  if (!key) return;

  // console.log(key, options);
  const documentOptions = {
    ...Config?.DOMProcessing,
    format: true,
    sanitize: true,
    normalize: true
  };

  const data = getDocument(null, documentOptions);
  const hash = await getHash(data);
  const item = Config.AutoSave.Items[key]?.[options.method];

  const hasMatchingDigest = item?.digestSRI === hash;

  if (!hasMatchingDigest) {
    options['digestSRI'] = hash;

    try {
      const datetime = getDateTimeISO();
      await updateStorage(key, data, { ...options, datetime });
      Config.AutoSave.Items[key] ||= {};
      Config.AutoSave.Items[key][options.method] ||= {};
      Config.AutoSave.Items[key][options.method].digestSRI = hash;

      if (Config.Editor['collab']) {
        addYjsVersion({
          content: data,
          updated: datetime,
          actor: Config.User?.IRI || null,
          mediaType: 'text/html'
        });
      }
    } catch (error) {
      console.error(getDateTimeISO() + ': Error saving document: ', error);
    }
  }
}

export async function enableAutoSave(key, options = {}) {
  if (!key) return;

  options['method'] = ('method' in options) ? options.method : 'IndexedDB';
  // options['autoSave'] = true;
  Config.AutoSave.Items[key] ||= {};
  Config.AutoSave.Items[key][options.method] ||= {};
  // console.log("XXX",Config.AutoSave.Items[key][options.method])

  //TEMPORARY FOR TESTING
  // Config.AutoSave.Items[key]['http'] = {};

  let debounceTimeout;

  console.log(getDateTimeISO() + ': ' + key + ' ' + options.method + ' autosave enabled.');

  // Do NOT call autoSave here. The collaborative editor (Yjs) initialises
  // asynchronously: localProvider.whenSynced fires after IndexedDB loads,
  // so the PM editor is empty at this point. Capturing that empty state as
  // an unpublished item would cause the next syncLocalRemoteResource call
  // to PUT an empty body to the server. The first real save happens on the
  // next user edit via handleInputPaste.
  await updateDeviceStorageItem(key, { autoSave: true });

  const autosaveCheckbox = document.getElementById('autosave-remote');
  if (autosaveCheckbox) autosaveCheckbox.checked = true;

  const handleInputPaste = (e) => {
    //I love that this function is called sync but it is async
    const sync = async (key, options) => {
      await autoSave(key, options);

      // New documents (no URL yet) and review/diff editors must not sync to remote.
      if (Config.Editor['new'] || Config.Editor['review']) return;

      const storageObject = await getDeviceStorageItem(Config.DocumentURL);
      const remoteAutoSaveEnabled = (storageObject && storageObject.autoSave !== undefined) ? storageObject.autoSave : true;

      if (remoteAutoSaveEnabled) {
        syncLocalRemoteResource();
      }
    }

    if (e.target.closest('.ProseMirror[contenteditable]')) {
      // debounceTimeout = debounce(() => autoSave, Config.AutoSave.Timer)(key, options);
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
      debounceTimeout = setTimeout(async () => await sync(key, options), Config.AutoSave.Timer); // debounce delay 
      // Config.AutoSave.Items[key][options.method]['id'] = debounceTimeout;
    }

    // Delete selection
    if (!e.target.closest('.ProseMirror[contenteditable]')) return;
    
    const isDeleteKey = e.key === 'Backspace' || e.key === 'Delete';
    const hasSelection = window.getSelection()?.toString().length > 0;
    
    if (isDeleteKey && hasSelection) {
      if (debounceTimeout) clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(async () => await sync(key, options), Config.AutoSave.Timer);
    }
  }

  // TODO: check remote in intervals if no input
  document.addEventListener('input', handleInputPaste);
  document.addEventListener('paste', handleInputPaste);
  document.addEventListener('keydown', handleInputPaste);
}

export async function disableAutoSave(key, options = {}) {
  if (!Config.AutoSave.Items[key]) { return; }

  options['method'] = ('method' in options) ? options.method : 'IndexedDB';
  // options['autoSave'] = true;

  let methods = Array.isArray(options.method) ? options.method : [options.method];

  for (const method of methods) {
    if (Config.AutoSave.Items[key][method]) {
      console.log(getDateTimeISO() + ': ' + key + ' ' + options.method + ' autosave disabled.');

      if (options.saveSnapshot) {
        await autoSave(key, options);
      }

      clearInterval(Config.AutoSave.Items[key][method].id);
      // Config.AutoSave.Items[key][method] = undefined;

      await updateDeviceStorageItem(key, { autoSave: false });

      const autosaveCheckbox = document.getElementById('autosave-remote');
      if (autosaveCheckbox) autosaveCheckbox.checked = false;
    }
  }
}

export async function enableRemoteSync() {
  await updateDeviceStorageItem(Config.DocumentURL, { autoSave: true });

  syncLocalRemoteResource();
}

export async function disableRemoteSync() {
  updateButtons();

  await updateDeviceStorageItem(Config.DocumentURL, { autoSave: false });

  await autoSave(Config.DocumentURL, { method: 'IndexedDB' });
}

