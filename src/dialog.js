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

import { diffArrays } from 'diff';
import { i18n } from './i18n.js';
import { normalizeForDiff } from './utils/normalization.js'
import { getButtonHTML } from './ui/buttons.js';
import { showUserIdentityInput } from './auth.js';
import { createNoteDataHTML, getDocument } from './doc.js';
import { domSanitize } from './utils/sanitization.js';
import { hideDocumentMenu } from './menu.js';
import { findPreviousDateTime, generateFilename } from './util.js';

export function showResourceReviewChanges(localContent, remoteContent, response, reviewOptions) {
  if (!localContent.length || !remoteContent.length) return;
  var tmplLocal = document.implementation.createHTMLDocument('template');
  tmplLocal.documentElement.setHTMLUnsafe(localContent);
  const localContentNode = tmplLocal.body;
  const localContentBody = localContentNode.getHTML().trim();

  var tmplRemote = document.implementation.createHTMLDocument('template');
  tmplRemote.documentElement.setHTMLUnsafe(remoteContent);

  // const remoteContentNode = tmplRemote.body;
  const remoteContentBody = tmplRemote.body.getHTML().trim();
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
      <h2 data-i18n="dialog.review-changes.h2" id="review-changes-label" property="schema:name">${i18n.t('dialog.review-changes.h2.textContent')} ${DO.C.Button.Info.ReviewChanges}</h2>
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

  node.querySelector('div.info').insertAdjacentHTML('beforeend', detailsInsDel);

  node.insertAdjacentHTML('beforeend', `
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
        autoSave(DO.C.DocumentURL, { method: 'localStorage' });

        syncLocalRemoteResource({ forceLocal: true });
      }

      node.remove();
    }

  });
}

export function initializeButtonMore(node) {
  var info = node.querySelector('div.info');
  var progressOld = info.querySelector('.progress');
  var progressNew = fragmentFromString(`<div class="progress" data-i18n="panel.notifications.progress.more">${DO.C.Button.Notifications.More} ${i18n.t('panel.notifications.progress.more.textContent')}</div>`);

  if (progressOld) {
    info.replaceChild(progressNew, progressOld)
  }
  else {
    info.appendChild(progressNew);
  }

  node = document.getElementById('document-notifications');

  var buttonMore = node.querySelector('div.info button.more');
  buttonMore.addEventListener('click', () => {
    if (!DO.C.User.IRI) {
      showUserIdentityInput();
    }
    else {
      DO.U.showContactsActivities();
    }
  });
}

export function initializeNotifications(options = {}) {
  // var contextNode = selectArticleNode(document);
  // <p class="count"><data about="" datatype="xsd:nonNegativeInteger" property="sioc:num_replies" value="' + interactionsCount + '">' + interactionsCount + '</data> interactions</p>
  //<progress min="0" max="100" value="0"></progress>
  //<div class="actions"><a href="/docs#resource-activities" rel="noopener" target="_blank">${Icon[".fas.fa-circle-info"]}</a></div>

  var buttonToggle = getButtonHTML({ key: 'panel.notifications.toggle.button', button: 'toggle', buttonClass: 'toggle' })

  //TEMP buttonRel/Resource
  var aside = `
  <aside aria-labelledby="document-notifications-label" class="do" contenteditable="false" dir="${Config.User.UI.LanguageDir}" id="document-notifications" lang="${Config.User.UI.Language}" rel="schema:hasPart" resource="#document-notifications" xml:lang="${Config.User.UI.Language}">
    <h2 data-i18n="panel.notifications.h2" id="document-notifications-label" property="schema:name">${i18n.t('panel.notifications.h2.textContent')} ${DO.C.Button.Info.Notifications}</h2>
    ${buttonToggle}
    <div>
      <div class="info"></div>
      <ul class="activities"></ul>
    </div>
  </aside>`;
  document.body.insertAdjacentHTML('beforeend', aside);
  aside = document.getElementById('document-notifications');

  if (options.includeButtonMore) {
    initializeButtonMore(aside);
  }

  return aside;
}

export function addNoteToNotifications(noteData) {
  var id = document.getElementById(noteData.id);
  if (id) return;

  var noteDataIRI = noteData.iri;
  
// console.log(noteData)
  var note = createNoteDataHTML(noteData);

  var datetime = noteData.datetime ? noteData.datetime : '1900-01-01T00:00:00.000Z';

  var li = domSanitize('<li data-datetime="' + datetime + '"><blockquote cite="' + noteDataIRI + '">'+ note + '</blockquote></li>');
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
    previousElement.insertAdjacentHTML('beforebegin', li);
  }
  else {
    notifications.insertAdjacentHTML('beforeend', li);
  }
}

export function showNotifications() {
  hideDocumentMenu();

  var aside = document.getElementById('document-notifications');

  if(!aside) {
    aside = initializeNotifications();
  }
  aside.classList.add('on');

  showContactsActivities();
}

export function exportAsDocument(data, options = {}) {
  const documentOptions = {
    ...Config.DOMProcessing,
    format: true,
    sanitize: true,
    normalize: true
  };

  data = data || getDocument(null, documentOptions);
  var mediaType = options.mediaType || 'text/html';
  var url = options.subjectURI || Config.DocumentURL;

  //XXX: Encodes strings as UTF-8. Consider storing bytes instead?
  var blob = new Blob([data], {type: mediaType + ';charset=utf-8'});

  var a = document.createElement("a");
  a.download = generateFilename(url, options);

  a.href = window.URL.createObjectURL(blob);
  a.style.display = "none";
  getDocumentContentNode(document).appendChild(a);
  a.click();
  getDocumentContentNode(document).removeChild(a);
  window.URL.revokeObjectURL(a.href);
}