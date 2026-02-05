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
import { addMessageToLog, getDocument, processSupplementalInfoLinkHeaders, showActionMessage, updateResourceInfos, updateSupplementalInfo } from "./doc.js";
import { getResource, putResource } from "./fetcher.js";
import { getLocalStorageItem, updateLocalStorageItem, updateStorage } from "./storage.js";
import { getDateTimeISO, getDateTimeISOFromDate, getHash } from "./util.js";
import { fragmentFromString, getDocumentNodeFromString } from "./utils/html.js";
import { normalizeForDiff } from "./utils/normalization.js";
import { getButtonHTML, updateButtons } from "./ui/buttons.js";
import Config from "./config.js";
import { i18n } from "./i18n.js";
import { sanitizeInsertAdjacentHTML } from "./utils/sanitization.js";

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
  const previousRemoteHash = Config.Resource[Config.DocumentURL]['digestSRI'];

  const hasAccessModeWrite = accessModePossiblyAllowed(Config.DocumentURL, 'write');

  storageObject = await getLocalStorageItem(Config.DocumentURL);

  const remoteAutoSaveEnabled = (storageObject && storageObject.autoSave !== undefined) ? storageObject.autoSave : true;

  // let latestLocalDocumentItemObject = (storageObject && storageObject.items?.length) ? await getLocalStorageItem(storageObject.items[0]) : null;

  let localContent;
  let latestLocalDocumentItemObjectPublished;
  let latestLocalDocumentItemObjectUnpublished;

  if (storageObject?.items?.length) {
    for (const item of storageObject.items) {
      const r = await getLocalStorageItem(item);
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

  //XXX: REVISIT THIS. This is  cheap way to reuse initial getDocument value. DocumenString is not currently used besides this.
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

  //200
  try {
    response = await getResource(Config.DocumentURL, headers, {});
    status = response.status;
    remoteETag = response.headers.get('ETag');
    remoteLastModified = response.headers.get('Last-Modified');
    remoteDate = response.headers.get('Date');

    data = await response.text();

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
    await updateResourceInfos(Config.DocumentURL, remoteContent, response, { storeHash: true });
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
      // reviewOptions['message'] = `Cannot force due to missing or changed ETag. Show review.`;
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

      removeLocalStorageDocumentFromCollection(Config.DocumentURL, latestLocalDocumentItemObjectUnpublished.id);

      Config.Editor.replaceContent(Config.Editor.mode, remoteContentNode);
      Config.Editor.init(Config.Editor.mode, document.body);
      autoSave(Config.DocumentURL, { method: 'localStorage', published: remotePublishDate });
      updateResourceInfos(Config.DocumentURL, null, response);
      return;
    }
  }

  if (latestLocalDocumentItemObjectUnpublished) {
    var tmplLocal = document.implementation.createHTMLDocument('template');
    tmplLocal.documentElement.setHTMLUnsafe(localContent);
    const localContentNode = tmplLocal.body;

    if (latestLocalDocumentItemObjectPublished.digestSRI !== remoteHash && status !== 304) {
      reviewOptions['message'] = `<span data-i18n="dialog.review-changes.message.conflict.span">${i18n.t('dialog.review-changes.message.conflict.span.textContent')}</span>`;
      showResourceReviewChanges(localContent, remoteContent, Config.Resource[Config.DocumentURL].response, reviewOptions);
      return;
    }
  }

  switch(status) {
    case 200:
      console.log(`Local or remote changed.`);

      if (latestLocalDocumentItemObjectUnpublished) {
        if (etagsMatch || previousRemoteHash == remoteHash) {
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
            else {
              throw new Error(`${error.status} Unhandled status ${error}`);
            }
          };
        }
        else {
          reviewOptions['message'] = `<span data-i18n="dialog.review-changes.message.local-remote-changed.span">${i18n.t('dialog.review-changes.message.local-remote-changed.span.textContent')}</span>`;
          console.log(reviewOptions['message'])
          // console.log(localContent, remoteContent)
          showResourceReviewChanges(localContent, remoteContent, response, reviewOptions);
        }
      }
      else if (!etagsMatch || previousRemoteHash != remoteHash) {
        console.log(previousRemoteHash)

        console.log(`Local unchaged. Remote changed. Update local.`);
        Config.Editor.replaceContent(Config.Editor.mode, remoteContentNode);
        Config.Editor.init(Config.Editor.mode, document.body);
        autoSave(Config.DocumentURL, { method: 'localStorage', published: remotePublishDate });
        updateResourceInfos(Config.DocumentURL, null, response);
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

  const response = await putResource(Config.DocumentURL, content, mediaType, null, { headers });

  console.log(`Remote updated (${response.status}).`);

  updateLocalStorageItem(id, { published: getDateTimeISO() });

  updateResourceInfos(Config.DocumentURL, content, response, { preserveHeaders: ['wac-allow'] });
}

export function showResourceReviewChanges(localContent, remoteContent, response, reviewOptions) {
  if (!localContent.length || !remoteContent.length) return;
  var tmplLocal = document.implementation.createHTMLDocument('template');
  tmplLocal.documentElement.setHTMLUnsafe(localContent);
  const localContentNode = tmplLocal.body;
  // const localContentBody = localContentNode.getHTML().trim();

  var tmplRemote = document.implementation.createHTMLDocument('template');
  tmplRemote.documentElement.setHTMLUnsafe(remoteContent);

  // const remoteContentNode = tmplRemote.body;
  // const remoteContentBody = tmplRemote.body.getHTML().trim();
  const remoteContentNode = tmplRemote.body;

  // console.log(localContent, remoteContent);
  const tokenizeHTML = (html) => {
    return html.split(/(<[^>]+>)/g).filter(Boolean);
  };

  // function serializeToken(token) {
  //   return JSON.stringify([
  //     token.block,
  //     token.text,
  //     token.bold,
  //     token.italic,
  //     token.link
  //   ]);
  // }
  
  const localNormalized = normalizeForDiff(localContentNode);
  const remoteNormalized = normalizeForDiff(remoteContentNode);

  // console.log("--- Local Normalized ---", localNormalized);
  // console.log("--- Remote Normalized ---", remoteNormalized);
  
  const localTokens = tokenizeHTML(localNormalized);
  const remoteTokens = tokenizeHTML(remoteNormalized);

  // const localSerialized = localTokens.map(serializeToken);
  // const remoteSerialized = remoteTokens.map(serializeToken);
  
  // const diff = diffArrays(remoteTokens, localTokens).filter(d => d.added || d.removed);
  const diff = diffArrays(remoteTokens, localTokens)
  // console.log(diff)
  // const diff = diffArrays(remoteSerialized, localSerialized);

  if (!diff.length || !diff.filter(d => d.added || d.removed).length) return;

  const reviewChanges = document.getElementById('review-changes');

  if (reviewChanges) {
    reviewChanges.remove();
  }

  // console.log(localContentBody + '/---')
  // console.log(remoteContentBody + '/---')

  let message = '';
  if (reviewOptions?.message) {
    message = `<p>${reviewOptions?.message}</p>`;
  }

  var buttonClose = getButtonHTML({ key: 'dialog.review-changes.close.button', button: 'close', buttonClass: 'close', iconSize: 'fa-2x' });

  document.body.appendChild(fragmentFromString(`
    <aside aria-labelledby="review-changes-label" class="do on" dir="${Config.User.UI.LanguageDir}" id="review-changes" lang="${Config.User.UI.Language}" rel="schema:hasPart" resource="#review-changes" xml:lang="${Config.User.UI.Language}">
      <h2 data-i18n="dialog.review-changes.h2" id="review-changes-label" property="schema:name">${i18n.t('dialog.review-changes.h2.textContent')} ${Config.Button.Info.ReviewChanges}</h2>
      ${buttonClose}
      <div class="info">${message}</div>
    </aside>`));

  let insCounter = 0;
  let delCounter = 0;
  
  let diffHTML = [];
  diff.forEach(part => {
    let eName;
    if (part.added) eName = 'ins';
    else if (part.removed) eName = 'del';
  
    const val = part.value.join('');
    if (eName) {
      diffHTML.push(`<${eName}>${val}</${eName}>`);
    } else {
      diffHTML.push(val);
    }
  });
  // console.log(`ins: ${insCounter}, del: ${delCounter}`);

  // function renderToken(token) {
  //   let content = token.text;
  
  //   if (token.bold) content = `<strong>${content}</strong>`;
  //   if (token.italic) content = `<em>${content}</em>`;
  //   if (token.link) content = `<a href="${token.link}">${content}</a>`;
  
  //   return `<${token.block}>${content}</${token.block}>`;
  // }

  // diff.forEach(part => {
  //   let tag = null;
  //   if (part.added) tag = "ins";
  //   if (part.removed) tag = "del";

  //   part.value.forEach(val => {
  //     const token = JSON.parse(val); // back to object
  //     const html = renderToken(token);

  //     if (tag) {
  //       diffHTML.push(`<${tag}>${html}</${tag}>`);
  //     } else {
  //       diffHTML.push(html);
  //     }
  //   });
  // });

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

  sanitizeInsertAdjacentHTML(node, 'beforeend', `
    <div class="do-diff" dir="auto">${diffHTML.join('')}</div>
    <button class="review-changes-save-local" data-i18n="dialog.review-changes.save-local.button" title="${i18n.t('dialog.review-changes.save-local.button.textContent')}" type="button">${i18n.t('dialog.review-changes.save-local.button.title')}</button>
    <button class="review-changes-save-remote" data-i18n="dialog.review-changes.save-remote.button" title="${i18n.t('dialog.review-changes.save-remote.button.title')}" type="button">${i18n.t('dialog.review-changes.save-remote.button.textContent')}</button>
    <button class="review-changes-submit" data-i18n="dialog.review-changes.save.button" title="${i18n.t('dialog.review-changes.save.button.title')}" type="submit">${i18n.t('dialog.review-changes.save.button.textContent')}</button>
  `);

  const diffNode = document.querySelector('#review-changes .do-diff');

  Config.Editor.init("author", diffNode);

  node.addEventListener('click', e => {
    var button = e.target.closest('button');

    if (button) {
      //XXX: What's this for?
      // Config.Editor.toggleMode();
      if (button.classList.contains('close') || button.classList.contains('info')) {
        return;
      }

      var diffedNode = node.querySelector('.do-diff');

      //TODO: Progress

      //TODO: update getResourceInfo somewhere

      if (button.classList.contains('review-changes-save-local')) {
        // keep editor area with current contents
        // try to push but need to check latest before
        // check if things are still up to date with remote
        syncLocalRemoteResource({ forceLocal: true });
      }
      else if (button.classList.contains('review-changes-save-remote')) {
        syncLocalRemoteResource({ forceRemote: true });
      }
      else if (button.classList.contains('review-changes-submit')) {
        // same as first one but with contents of diff panel
        diffedNode.querySelectorAll('del').forEach(el => el.remove());
        diffedNode.querySelectorAll('ins').forEach(el => {
          const parent = el.parentNode;
          while (el.firstChild) parent.insertBefore(el.firstChild, el);
          el.remove();
        });
        // update local content with the stuff in the diff editor view
        Config.Editor.replaceContent(Config.Editor.mode, diffNode.querySelector('.ProseMirror'));
        Config.Editor.init(Config.Editor.mode, document.body);
        autoSave(Config.DocumentURL, { method: 'localStorage' });

        syncLocalRemoteResource({ forceLocal: true });
      }

      node.remove();
    }
  });
}

export function monitorNetworkStatus() {
  let messageId;

  window.addEventListener('online', async () => {
    console.log('online');
    await enableRemoteSync();
    await syncLocalRemoteResource();

    const storageObject = await getLocalStorageItem(Config.DocumentURL);

    const remoteAutoSaveEnabled = (storageObject && storageObject.autoSave !== undefined) ? storageObject.autoSave : true;

    let message;

    if (remoteAutoSaveEnabled) {
      message = "You are back online. Your changes will be synced with the remote server.";
    } else {
      message = "You are back online. Changes will be saved only locally because autosave is disabled. You can change this from the main menu.";
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

    const storageObject = await getLocalStorageItem(Config.DocumentURL);

    const remoteAutoSaveEnabled = (storageObject && storageObject.autoSave !== undefined) ? storageObject.autoSave : true;

    let message;

    if (remoteAutoSaveEnabled) {
      message = "You are offline. Your changes will be saved locally and synced when you're back online.";
    } else {
      message = "You are offline. Changes will be saved only locally because autosave is disabled. You can change this from the main menu.";
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
  let temp = getDocumentNodeFromString(data);
  const normalizedData = normalizeForDiff(temp);
  temp = getDocument(normalizedData, documentOptions);
  const hash = await getHash(temp);

  const item = Config.AutoSave.Items[key]?.[options.method];

  const hasMatchingDigest = item?.digestSRI === hash;

  if (!hasMatchingDigest) {
    options['digestSRI'] = hash;

    try {
      updateStorage(key, data, options);
      Config.AutoSave.Items[key] ||= {};
      Config.AutoSave.Items[key][options.method] ||= {};
      Config.AutoSave.Items[key][options.method].digestSRI = hash;
    } catch (error) {
      console.error(getDateTimeISO() + ': Error saving document: ', error);
    }
  }
}

export async function enableAutoSave(key, options = {}) {
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

  const handleInputPaste = (e) => {
    //I love that this function is called sync but it is async
    const sync = async (key, options) => {
      await autoSave(key, options);

      const storageObject = await getLocalStorageItem(Config.DocumentURL);
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
  }

  // TODO: check remote in intervals if no input
  document.addEventListener('input', handleInputPaste);
  document.addEventListener('paste', handleInputPaste);
}

export async function disableAutoSave(key, options = {}) {
  if (!Config.AutoSave.Items[key]) { return; }

  options['method'] = ('method' in options) ? options.method : 'localStorage';
  // options['autoSave'] = true;

  let methods = Array.isArray(options.method) ? options.method : [options.method];

  for (const method of methods) {
    if (Config.AutoSave.Items[key][method]) {
      console.log(getDateTimeISO() + ': ' + key + ' ' + options.method + ' autosave disabled.');

      if (options.saveSnapshot) {
        await autoSave(key, options);
      }

      clearInterval(Config.AutoSave.Items[key][method].id);
      Config.AutoSave.Items[key][method] = undefined;

      await updateLocalStorageItem(key, { autoSave: false });
    }
  }
}

export async function enableRemoteSync() {
  await updateLocalStorageItem(Config.DocumentURL, { autoSave: true });

  syncLocalRemoteResource();
}

export async function disableRemoteSync() {
  updateButtons();

  await updateLocalStorageItem(Config.DocumentURL, { autoSave: false });

  await autoSave(Config.DocumentURL, { method: 'localStorage' });
}

