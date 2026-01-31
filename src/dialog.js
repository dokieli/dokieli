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
import { accessModeAllowed, createNoteDataHTML, getAccessModeOptionsHTML, getDocument, setCopyToClipboard } from './doc.js';
import { domSanitize } from './utils/sanitization.js';
import { hideDocumentMenu } from './menu.js';
import { findPreviousDateTime, fragmentFromString, generateAttributeId, generateFilename } from './util.js';
import { currentLocation, patchResourceWithAcceptPatch, putResourceWithAcceptPut } from './fetcher.js';
import { forceTrailingSlash, generateDataURI, getBaseURL, stripFragmentFromString } from './uri.js';
import { getAccessSubjects, getACLResourceGraph, getAgentName, getAuthorizationsMatching, getGraphImage, getLinkRelation, getResourceGraph } from './graph.js';
import { sendNotifications } from './activity.js';

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

export function shareResource(listenerEvent, iri) {
  if (document.querySelector('#share-resource.do.on')) { return; }

  iri = iri || currentLocation();
  const documentURL = stripFragmentFromString(iri);

  var button = listenerEvent.target.closest('button');
  if (button) {
    button.disabled = true;
  }

  var shareResourceLinkedResearch = '';
  if (Config.User.IRI && Config.OriginalResourceInfo['rdftype'] && Config.OriginalResourceInfo.rdftype.includes(ns.schema.ScholarlyArticle.value) || Config.OriginalResourceInfo.rdftype.includes(ns.schema.Thesis.value)) {
    shareResourceLinkedResearch = `
      <div id="share-resource-external" rel="schema:hasPart" resource="#share-resource-external">
        <h3 data-i18n="dialog.share-resource-linked-research.h3" property="schema:name">${i18n.t('dialog.share-resource-linked-research.h3.textContent')}</h3>
        <input id="share-resource-linked-research" type="checkbox" value="https://linkedresearch.org/cloud" />
        <label for="share-resource-linked-research"><a href="https://linkedresearch.org/cloud">Linked Open Research Cloud</a></label>
      </div>`;
  }

  var buttonClose = getButtonHTML({ key: 'dialog.share-resource.close.button', button: 'close', buttonClass: 'close', iconSize: 'fa-2x' });

  var shareResourceHTML = `
    <aside aria-labelledby="share-resource-label" class="do on" dir="${Config.User.UI.LanguageDir}" dir="${Config.User.UI.LanguageDir}" id="share-resource" lang="${Config.User.UI.Language}" rel="schema:hasPart" resource="#share-resource" xml:lang="${Config.User.UI.Language}">
      <h2 data-i18n="dialog.share.h2" id="share-resource-label" property="schema:name">${i18n.t('dialog.share.h2.textContent')} ${Config.Button.Info.Share}</h2>

      ${buttonClose}

      <div class="info"></div>

      <div id="share-resource-share-url" rel="schema:hasPart" resource="#share-resource-share-url">
        <h3 data-i18n="dialog.share-resource-share-url.h3" property="schema:name">${i18n.t('dialog.share-resource-share-url.h3.textContent')}</h3>

        <label data-i18n="dialog.share-resource-clipboard.label" for="share-resource-clipboard">${i18n.t('dialog.share-resource-clipboard.label.textContent')}</label>
        <input dir="ltr" id="share-resource-clipboard" name="share-resource-clipboard" readonly="readonly" type="url" value="${iri}" />
        ${Config.Button.Clipboard}
      </div>

      ${shareResourceLinkedResearch}

      <div id="share-resource-agents" rel="schema:hasPart" resource="#share-resource-agents">
        <h3 data-i18n="dialog.share-resource-agents.h3" property="schema:name">${i18n.t('dialog.share-resource-agents.h3.textContent')}</h3>

        <ul>
          <li id="share-resource-address-book">
          </li>
        </ul>

        <label data-i18n="dialog.share-resource-note.label" for="share-resource-note">${i18n.t('dialog.share-resource-note.label.textContent')}</label>
        <textarea data-i18n="dialog.share-resource-note.textarea" dir="auto" id="share-resource-note" rows="3" cols="40" name="share-resource-note" placeholder="${i18n.t('dialog.share-resource-note.textarea.placeholder')}"></textarea>

        <button class="share" data-i18n="dialog.share-resource-agents.button" id="share-resource-agents-button" title="${i18n.t('dialog.share-resource-agents.button.title')}" type="submit">${i18n.t('dialog.share-resource-agents.button.textContent')}</button>
      </div>
    </aside>
  `;

  document.body.appendChild(fragmentFromString(shareResourceHTML));

  var clipboardInput = document.querySelector('#share-resource-clipboard');
  var clipboardButton = document.querySelector('#share-resource-clipboard + button.copy-to-clipboard');
  setCopyToClipboard(clipboardInput, clipboardButton);

  clipboardInput.addEventListener('focus', e => {
    var input = e.target.closest('input');
    if (input) {
      input.selectionStart = 0;
      input.selectionEnd = input.value.length;
    }
  });

  var li = document.getElementById('share-resource-address-book');
  li.insertAdjacentHTML('beforeend', Icon[".fas.fa-circle-notch.fa-spin.fa-fw"]);

  DO.U.selectContacts(li, Config.User.IRI);

  var hasAccessModeControl = accessModeAllowed(documentURL, 'control');
  if (hasAccessModeControl) {
    var info = document.querySelector('#share-resource > .info');

    var shareResourcePermissions = `
      <div id="share-resource-permissions" rel="schema:hasPart" resource="#share-resource-permissions">
        <h3 data-i18n="dialog.share-resource-permissions.h3" property="schema:name">${i18n.t('dialog.share-resource-permissions.h3.textContent')}</h3>

        <span class="progress" data-i18n="dialog.share-resource-permissions.progress">${Icon[".fas.fa-circle-notch.fa-spin.fa-fw"]} ${i18n.t('dialog.share-resource-permissions.progress.textContent')}</span>

        <ul class="permissions">
        </ul>

        <div class="autocomplete">
          <label data-i18n="dialog.share-resource-search-contacts.label" for="share-resource-search-contacts">${i18n.t('dialog.share-resource-search-contacts.label.textContent')}</label>
          <input data-i18n="dialog.share-resource-search-contacts.input" id="share-resource-search-contacts" name="share-resource-search-contacts" placeholder="${i18n.t('dialog.share-resource-search-contacts.input.placeholder')}" type="text" value="" />
          <ul class="suggestions">
          </ul>
        </div>
      </div>`;
    info.insertAdjacentHTML('afterend', shareResourcePermissions);

    var accessPermissionsNode = document.getElementById('share-resource-permissions');
    var accessPermissionFetchingIndicator = accessPermissionsNode.querySelector('.progress');

    getACLResourceGraph(documentURL)
      .catch(e => {
        accessPermissionsNode.removeChild(accessPermissionFetchingIndicator);

        console.log('XXX: Cannot access effectiveACLResource', e);
      })
      .then(aclResourceGraph => {
        accessPermissionsNode.removeChild(accessPermissionFetchingIndicator);

        const { defaultACLResource, effectiveACLResource, effectiveContainer } = Config.Resource[documentURL].acl;
        const hasOwnACLResource = defaultACLResource == effectiveACLResource;

        var matchers = {};

        if (hasOwnACLResource) {
          matchers['accessTo'] = documentURL;
        }
        else {
          matchers['default'] = effectiveContainer;
        }

        var authorizations = getAuthorizationsMatching(aclResourceGraph, matchers);
// console.log(authorizations)
        const subjectsWithAccess = getAccessSubjects(authorizations);
// console.log(subjectsWithAccess)

        const input = document.getElementById('share-resource-search-contacts');
        const suggestions = document.querySelector('#share-resource-permissions .suggestions');

        input.addEventListener('focus', (e) => {
          if (!e.target.value.length) {
            showSuggestions(getFilteredContacts());
          }
        });

        input.addEventListener('input', (e) => {
          const query = e.target.value.trim().toLowerCase();
          showSuggestions(getFilteredContacts(query));
        });

        var getFilteredContacts = function(query = '') {
          const contacts = Object.keys(Config.User.Contacts);
          const subjectsWithAccessKeys = new Set(Object.keys(subjectsWithAccess));

          return contacts.filter(contact => {
            const matchesQuery = (
              !query.length ||
              contact.toLowerCase().includes(query) ||
              Config.User.Contacts[contact].Name?.toLowerCase().includes(query) ||
              Config.User.Contacts[contact].IRI?.toLowerCase().includes(query) ||
              Config.User.Contacts[contact].URL?.toLowerCase().includes(query)
            );
// console.log(matchesQuery)
            return !subjectsWithAccessKeys.has(contact) && matchesQuery;
          });
        }

        var showSuggestions = function (filteredContacts) {
          suggestions.replaceChildren();

          filteredContacts.forEach(contact => {
            const suggestion = document.createElement('li');

            var name = Config.User.Contacts[contact].Name || contact;
            var img = Config.User.Contacts[contact].Image;
            if (!(img && img.length)) {
              img = generateDataURI('image/svg+xml', 'base64', Icon['.fas.fa-user-secret']);
            }
            img = '<img alt="" height="32" src="' + img + '" width="32" />';

            suggestion.insertAdjacentHTML('beforeend', img + '<span title="' + contact + '">' + name + '</span>');

            var ul = document.querySelector('#share-resource-permissions ul');

            suggestion.addEventListener('click', () => {
              addAccessSubjectItem(ul, Config.User.Contacts[contact].Graph, contact);
              var li = document.getElementById('share-resource-access-subject-' + encodeURIComponent(contact));
              var options = {};
              options['accessContext'] = 'Share';
              options['selectedAccessMode'] = ns.acl.Read.value;
              DO.U.showAccessModeSelection(li, '', contact, 'agent', options);

              var select = document.querySelector('[id="' + li.id + '"] select');
              select.disabled = true;
              select.insertAdjacentHTML('afterend', `<span class="progress">${Icon[".fas.fa-circle-notch.fa-spin.fa-fw"]}</span>`);

              DO.U.updateAuthorization(options.accessContext, options.selectedAccessMode, contact, 'agent')
                .catch(error => {
                  console.log(error)
                })
                .then(response => {
                  getACLResourceGraph(documentURL)
                    .catch(g => {
                      removeProgressIndicator(select);
                    })
                    .then(g => {
                      removeProgressIndicator(select);
                    })
                });

              suggestions.replaceChildren();
              input.value = '';
            });

            suggestions.appendChild(suggestion);
          })
        }


        //Allowing only Share-related access modes.
        var accessContext = Config.AccessContext['Share'];

        const accessContextModes = Object.keys(accessContext);

        var ul = document.querySelector('#share-resource-permissions ul');

        var showPermissions = function(s, accessSubject) {
// console.log(accessSubject)
          if (accessSubject != Config.User.IRI) {
            addAccessSubjectItem(ul, s, accessSubject);

            //XXX: Relies on knowledge in addAcessSubjectItem where it inserts li with a particular id
            var li = document.getElementById('share-resource-access-subject-' + encodeURIComponent(accessSubject));

            var verifiedAccessModes = [];

            Object.keys(authorizations).forEach(authorization => {
              var authorizationModes = authorizations[authorization].mode;
              if (authorizations[authorization].agent.includes(accessSubject) || authorizations[authorization].agentGroup.includes(accessSubject)) {
                authorizationModes.forEach(grantedMode => {
                  if (accessContextModes.includes(grantedMode)) {
                    verifiedAccessModes.push(grantedMode);
                  }
                });
              }
            })
// console.log(verifiedAccessModes)

            const selectedAccessMode =
              (verifiedAccessModes.includes(ns.acl.Control.value) && ns.acl.Control.value) ||
              (verifiedAccessModes.includes(ns.acl.Write.value) && ns.acl.Write.value) ||
              (verifiedAccessModes.includes(ns.acl.Read.value) && ns.acl.Read.value) ||
              '';

            var options = options || {};
            options['accessContext'] = 'Share';
            options['selectedAccessMode'] = selectedAccessMode;
// console.log(options)
            showAccessModeSelection(li, '', accessSubject, subjectsWithAccess[accessSubject]['subjectType'], options);
          }
        }

        Object.keys(subjectsWithAccess).forEach(accessSubject => {
          if (accessSubject === ns.foaf.Agent.value || accessSubject === Config.User.IRI) {
            return;
          }

          //Gets some information about the accessSubject that can be displayed besides their URI.
          getResourceGraph(accessSubject)
            .catch(e => {
              showPermissions(null, accessSubject);
            })
            .then(g => {
              var s;
              if (g && g.node) {
                s = g.node(rdf.namedNode(accessSubject));
              }
              showPermissions(s, accessSubject);
            })
        })
    });
  }

  var shareResource = document.getElementById('share-resource');

  shareResource.querySelector('#share-resource-note').focus();

  shareResource.addEventListener('click', function (e) {
    if (e.target.closest('button.close')) {
      listenerEvent.target.closest('button').disabled = false;
    }

    if (e.target.closest('button.share')) {
      var tos = [];
      //XXX: This is currently not in the UI. https://github.com/dokieli/dokieli/issues/532
      // var resourceTo = document.querySelector('#share-resource #share-resource-to');
      // if (resourceTo) {
      //   resourceTo = domSanitize(resourceTo.value.trim());
      //   tos = (resourceTo.length) ? resourceTo.split(/\r\n|\r|\n/) : [];
      // }

      var note = document.querySelector('#share-resource #share-resource-note').value.trim();

      var ps = document.querySelectorAll('#share-resource-contacts .progress');
      ps.forEach(p => {
        p.parentNode.removeChild(p);
      });

      var srlr = document.querySelector('#share-resource-linked-research:checked');
      if(srlr) {
        tos.push(srlr.value);
      }

      var srci = document.querySelectorAll('#share-resource-contacts input:checked');
      if (srci.length) {
        for(var i = 0; i < srci.length; i++) {
          tos.push(srci[i].value);
        }
      }

      var rm = shareResource.querySelector('.response-message');
      if (rm) {
        rm.parentNode.removeChild(rm);
      }
      shareResource.insertAdjacentHTML('beforeend', '<div class="response-message"></div>');

      return sendNotifications(tos, note, iri, shareResource)
    }
  });
}

//TODO: Revisit this function and addShareResourceContactInput to generalise.
function addAccessSubjectItem(node, s, url) {
  var iri = s?.term?.value || url;
  iri = domSanitize(iri);

  var id = encodeURIComponent(iri);
  var name = s ? getAgentName(s) || iri : iri;
  var img = s ? getGraphImage(s) : null;
  if (!(img && img.length)) {
    img = generateDataURI('image/svg+xml', 'base64', Icon['.fas.fa-user-secret']);
  }
  img = '<img alt="" height="32" src="' + img + '" width="32" />';

  var input = '<li id="share-resource-access-subject-' + id + '">' + img + '<a href="' + iri + '" rel="noopener" target="_blank">' + name + '</a></li>';

  node.insertAdjacentHTML('beforeend', input);
}

function showAccessModeSelection(node, id, accessSubject, subjectType, options) {
  id = id || generateAttributeId('select-access-mode-');
  options = options || {};
  options['accessContext'] = options.accessContext || 'Share';
  options['selectedAccessMode'] = options.selectedAccessMode || '';

  const documentURL = currentLocation();

  const selectNode = `<select aria-label="${i18n.t('dialog.share-resource.select-access-mode.select.aria-label')}" data-i18n="dialog.share-resource.select-access-mode.select" id="${id}">${getAccessModeOptionsHTML({'context': options.accessContext, 'selected': options.selectedAccessMode })}</select>`;

  node.insertAdjacentHTML('beforeend', selectNode);

  var select = document.getElementById(id);
  select.addEventListener('change', e => {
    var selectedMode = e.target.value;

    if (Config.AccessContext[options.accessContext][selectedMode] || selectedMode == '') {
      e.target.disabled = true;
      e.target.insertAdjacentHTML('afterend', `<span class="progress">${Icon[".fas.fa-circle-notch.fa-spin.fa-fw"]}</span>`);

      updateAuthorization(options.accessContext, selectedMode, accessSubject, subjectType)
        .catch(error => {
          console.log(error);
          removeProgressIndicator(e.target);
        })
        .then(response => {
// console.log(response)

          getACLResourceGraph(documentURL)
            .catch(g => {
              removeProgressIndicator(select);
            })
            .then(g => {
              removeProgressIndicator(select);
            })
        });
    }
    else {
      //TODO: Naughty
    }
  });
}

function updateAuthorization(accessContext, selectedMode, accessSubject, subjectType) {
  var documentURL = currentLocation();

  const { defaultACLResource, effectiveACLResource, effectiveContainer } = Config.Resource[documentURL].acl;
  const hasOwnACLResource = defaultACLResource == effectiveACLResource;
  const patchACLResource = defaultACLResource;

  var aclResourceGraph = Config.Resource[effectiveACLResource].graph;

  var matchers = {};

  if (hasOwnACLResource) {
    matchers['accessTo'] = documentURL;
  }
  else {
    matchers['default'] = effectiveContainer;
  }

  var authorizations = getAuthorizationsMatching(aclResourceGraph, matchers);

  var insertGraph = '';
  var deleteGraph = '';
  // var whereGraph = '';
  var authorizationSubject;

  var patches = [];

// console.log(authorizations);
  if (hasOwnACLResource) {
    Object.keys(authorizations).forEach(authorization => {
// console.log(authorizations[authorization], selectedMode, accessSubject, subjectType);
      if (authorizations[authorization][subjectType].includes(accessSubject)) {
        var multipleAccessSubjects = (authorizations[authorization][subjectType].length > 1) ? true : false;
        var deleteAccessObjectProperty = (hasOwnACLResource) ? 'accessTo' : 'default';

        var deleteAccessSubjectProperty = subjectType;
        var deleteAccessSubject = accessSubject;

        var accessModes = authorizations[authorization].mode;
        var deleteAccessModes = '<' + accessModes.join('>, <') + '>';

        if (!multipleAccessSubjects) {
          deleteGraph += `
<${authorization}>
a acl:Authorization ;
acl:${deleteAccessObjectProperty} <${documentURL}> ;
acl:mode ${deleteAccessModes} ;
acl:${deleteAccessSubjectProperty} <${deleteAccessSubject}> .
`;
        }
        else {
          deleteGraph += `
<${authorization}>
acl:${deleteAccessSubjectProperty} <${deleteAccessSubject}> .
`;
        }

        patches.push({ 'delete': deleteGraph });
      }
    })

    if (selectedMode.length) {
      authorizationSubject = '#' + generateAttributeId();

      insertGraph += `
<${authorizationSubject}>
a acl:Authorization ;
acl:accessTo <${documentURL}> ;
acl:mode <${selectedMode}> ;
acl:${subjectType} <${accessSubject}> .
`;

      patches.push({ 'insert': insertGraph });
    }
  }
  else {
     
    var updatedAuthorizations = structuredClone(authorizations);
    var authorizationsToDelete = [];

    Object.keys(updatedAuthorizations).forEach(authorization => {
      if (updatedAuthorizations[authorization][subjectType].includes(accessSubject)) {
        var updatedMode;

        if (selectedMode.length) {
          authorizationsToDelete.push(authorization);
        }
        else {
          switch (selectedMode) {
            case ns.acl.Read.value:
              updatedMode = [ns.acl.Read.value];
              break;
            case ns.acl.Write.value:
              updatedMode = [ns.acl.Read.value, ns.acl.Write.value];
              break;
            case ns.acl.Control.value:
              updatedMode = [ns.acl.Read.value, ns.acl.Write.value, ns.acl.Control.value];
              break;
          }

          updatedAuthorizations[authorization].mode = updatedMode;
        }
      }
    });

    authorizationsToDelete.forEach(authorization => {
      delete updatedAuthorizations[authorization];
    });

    //XXX: updatedAuthorizations may have different authorization objects with the same properties and values. This is essentially just duplicate authorization rules.

    insertGraph = '';
    Object.keys(updatedAuthorizations).forEach(authorization => {
      authorizationSubject = '#' + generateAttributeId();

      var additionalProperties = [];
      ['agent', 'agentClass', 'agentGroup', 'origin'].forEach(key => {
        if (updatedAuthorizations[authorization][key] && updatedAuthorizations[authorization][key].length) {
          additionalProperties.push(`  acl:${key} <${updatedAuthorizations[authorization][key].join('>, <')}>`);
        }
      })
      additionalProperties = additionalProperties.join(';\n');

      insertGraph += `
<${authorizationSubject}>
a acl:Authorization ;
acl:accessTo <${documentURL}> ;
acl:mode <${updatedAuthorizations[authorization].mode.join('>, <')}> ;
${additionalProperties} .
`;
    });

    patches.push({ 'insert': insertGraph });
  }

  if (!patches.length) {
    throw new Error("Check why the patch payload wasn't constructed in updateAuthorization." + patches);
  }
  else {
    return patchResourceWithAcceptPatch(patchACLResource, patches);
  }
}

function removeProgressIndicator(node) {
  var progress = document.querySelector('[id="' + node.id + '"] + .progress');

  node.disabled = false;
  node.parentNode.removeChild(progress);
}

function replyToResource replyToResource (e, iri) {
  iri = iri || currentLocation()

  const documentOptions = {
    ...Config.DOMProcessing,
    format: true,
    sanitize: true,
    normalize: true
  };

  e.target.closest('button').disabled = true

  var buttonClose = getButtonHTML({ key: 'dialog.reply-to-resource.close.button', button: 'close', buttonClass: 'close', iconSize: 'fa-2x' });

  document.body.appendChild(fragmentFromString(`
    <aside aria-labelledby="reply-to-resource-label" class="do on" dir="${Config.User.UI.LanguageDir}" id="reply-to-resource" lang="${Config.User.UI.Language}" rel="schema:hasPart" resource="#reply-to-resource" xml:lang="${Config.User.UI.Language}">
      <h2 data-i18n="dialog.reply-to-resource.h2" id="reply-to-resource-label" property="schema:name">${i18n.t('dialog.reply-to-resource.h2.textContent')} ${Config.Button.Info.Reply}</h2>
      ${buttonClose}
      <div class="info"></div>
      <div id="reply-to-resource-input">
        <p data-i18n="dialog.reply-to-resource-input.p" data-i18n-iri="${iri}">${i18n.t('dialog.reply-to-resource-input.p.innerHTML', { url: iri })}</p>
        <ul>
          <li>
            <p><label data-i18n="dialog.reply-to-resource-note.label" for="reply-to-resource-note">${i18n.t('dialog.reply-to-resource-note.label.textContent')}</label></p>
            <p><textarea cols="40" data-i18n="dialog.reply-to-resource-note.textarea" dir="auto" id="reply-to-resource-note" rows="10" name="reply-to-resource-note" placeholder="${i18n.t('dialog.reply-to-resource-note.textarea.placeholder')}"></textarea></p>
          </li>
          <li>
            <label data-i18n="language.label" for="reply-to-resource-language">${i18n.t('language.label.textContent')}</label> <select id="reply-to-resource-language" name="reply-to-resource-language">${getLanguageOptionsHTML()}</select></li>
          <li>
            <label data-i18n="license.label" for="reply-to-resource-license">${i18n.t('license.label.textContent')}</label> <select id="reply-to-resource-license" name="reply-to-resource-license">${getLicenseOptionsHTML()}</select>
          </li>
        </ul>
      </div>
    </aside>
  `))

  // TODO: License
  // TODO: ACL - can choose whether to make this reply private (to self), visible only to article author(s), visible to own contacts, public
  // TODO: Show name and face of signed in user reply is from, or 'anon' if article can host replies

  var replyToResource = document.getElementById('reply-to-resource')

  var id = 'location-reply-to'
  var action = 'write'
  var note;
  var noteIRI;

  setupResourceBrowser(replyToResource, id, action)
  document.getElementById(id).insertAdjacentHTML('afterbegin', `<p data-i18n="dialog.reply-to-resource.save-location-choose.p">${i18n.t('dialog.reply-to-resource.save-location-choose.p.textContent')}</p>`)

  replyToResource.insertAdjacentHTML('beforeend', `<p data-i18n="dialog.reply-to-resource.save-location.p">${i18n.t('dialog.reply-to-resource.save-location.p.textContent')} <samp id="${id}-${action}"></samp></p>`)

  var bli = document.getElementById(id + '-input')
  bli.focus()
  bli.placeholder = 'https://example.org/path/to/article'
  replyToResource.insertAdjacentHTML('beforeend', `<button class="reply" data-i18n="dialog.reply-to-resource.submit.button" title="${i18n.t('dialog.reply-to-resource.submit.button.title')}" type="submit">${i18n.t('dialog.reply-to-resource.submit.button.textContent')}</button>`)

  replyToResource.addEventListener('click', e => {
    if (e.target.closest('button.close')) {
      document.querySelector('#document-do .resource-reply').disabled = false
    }

    if (e.target.closest('button.reply')) {
      note = document
        .querySelector('#reply-to-resource #reply-to-resource-note')
        .value.trim()

      var rm = replyToResource.querySelector('.response-message')
      if (rm) {
        rm.parentNode.removeChild(rm)
      }
      replyToResource.insertAdjacentHTML('beforeend', '<div class="response-message"></div>')

      noteIRI = document.querySelector('#reply-to-resource #' + id + '-' + action).innerText.trim();

      try {
        noteIRI = noteIRI && noteIRI.length ? new URL(noteIRI).href : noteIRI;
      } catch (e) {
        noteIRI = noteIRI; // Keep the original value if it's not a valid URL
      }

      // TODO: this needs to be form validation instead
      if (!note || !noteIRI) {
        document.querySelector('#reply-to-resource .response-message')
          .setHTMLUnsafe(domSanitize(`<p class="error" data-i18n="dialog.reply-to-resource.error.missing-note-or-location.p">${i18n.t("dialog.reply-to-resource.error.missing-note-or-location.p.textContent")}</p>`));
        return;
      }

      sendReply();
    }
  })

  function sendReply() {
    var datetime = getDateTimeISO()
    var attributeId = generateAttributeId()

    var motivatedBy = "oa:replying"
    var noteData = {
      "type": 'comment',
      "mode": "write",
      "motivatedByIRI": motivatedBy,
      "id": attributeId,
      // "iri": noteIRI, //e.g., https://example.org/path/to/article
      "creator": {},
      "datetime": datetime,
      "target": {
        "iri": iri
      },
      "body": [{ "value": note }],
    }
    if (Config.User.IRI) {
      noteData.creator["iri"] = Config.User.IRI
    }
    if (Config.User.Name) {
      noteData.creator["name"] = Config.User.Name
    }
    if (Config.User.Image) {
      noteData.creator["image"] = Config.User.Image
    }
    if (Config.User.URL) {
      noteData.creator["url"] = Config.User.URL
    }

    var language = document.querySelector('#reply-to-resource-language')
    if (language && language.length) {
      noteData["language"] = language.value.trim()
      noteData["body"]["language"] = noteData["language"];
    }

    var license = document.querySelector('#reply-to-resource-license')
    if (license && license.length) {
      noteData["license"] = license.value.trim()
      noteData["body"]["rights"] = noteData["body"]["license"] = noteData["rights"] = noteData["license"];
    }

    note = createNoteDataHTML(noteData)

    var data = createHTML('', note)

    putResource(noteIRI, data)
      .catch(error => {
        console.log('Could not save reply:')
        console.error(error)

        let message;
        let errorKey = 'default';

        switch (error.status) {
          case 0:
          case 405:
            errorKey = 'unwritable-location';
            break
          case 401:
            errorKey = 'unauthorized';
            if(!Config.User.IRI){
              errorKey = 'unauthenticated';
            }
            break;
          case 403:
            errorKey = 'forbidden';
            break
          case 406:
            errorKey = 'unacceptable';
            break
          default:
            // some other reason
            break
        }

        message = `<span data-i18n="dialog.reply-to-resource.error.${errorKey}.p">${i18n.t(`dialog.reply-to-resource.error.${errorKey}.p.textContent`)}</span>`;

        // re-throw, to break out of the promise chain
        
        throw new Error('Cannot save your reply: ', i18n.t(`dialog.reply-to-resource.error.${errorKey}.p.textContent`));
      })

      .then(response => {
        replyToResource
          .querySelector('.response-message')
          .setHTMLUnsafe(domSanitize(`<p class="success" data-i18n="dialog.reply-to-resource.success.saved-at.p"><span>${i18n.t('dialog.reply-to-resource.success.saved-at.p.textContent')}</span> <a href="${response.url}" rel="noopener" target="_blank">${response.url}</a></p>`));

        return getLinkRelation(ns.ldp.inbox.value, null, getDocument(null, documentOptions));
      })

      .then(inboxes => {
        if (!inboxes) {
          throw new Error('Inbox is empty or missing')
        }

        var inboxURL = inboxes[0]

        //TODO-i18n
        let notificationStatements = '    <dl about="' + noteIRI +
          '">\n<dt>Object type</dt><dd><a about="' +
          noteIRI + '" typeof="oa:Annotation" href="' +
          ns.oa.Annotation.value +
          '">Annotation</a></dd>\n<dt>Motivation</dt><dd><a href="' +
          Config.Prefixes[motivatedBy.split(':')[0]] +
          motivatedBy.split(':')[1] + '" property="oa:motivation">' +
          motivatedBy.split(':')[1] + '</a></dd>\n</dl>\n'

        let notificationData = {
          "type": ['as:Announce'],
          "inbox": inboxURL,
          "object": noteIRI,
          "target": iri,
          "license": noteData.license,
          "statements": notificationStatements
        }

        return notifyInbox(notificationData)
          .catch(error => {
            console.error('Failed sending notification to ' + inboxURL + ' :', error)

            throw new Error('Failed sending notification to author inbox')
          })
      })

      .then(response => {  // Success!
        var notificationSent = i18n.t('dialog.reply-to-resource.success.notification-sent.p.textContent');
        var location = response.headers.get('Location')
        var notificationLink = '';

        if (location) {
          let locationUrl = getAbsoluteIRI(response.url, location.trim());
          notificationLink = `<a href="${locationUrl}" rel="noopener" "target="_blank">${locationUrl}</a>`;
        }
        // else {
        //   notificationSent = notificationSent + ", but location unknown."
        // }

        var responseMessage = replyToResource.querySelector('.response-message');
        responseMessage.setHTMLUnsafe(domSanitize(responseMessage.getHTML() + `<p class="success" data-i18n="dialog.reply-to-resource.success.notification-sent.p"><span>${notificationSent}</span> ${notificationLink}</p>`));
      })

      //TODO-i18n
      .catch(error => {
        // Catch-all error, actually notify the user
        var responseMessage = replyToResource.querySelector('.response-message');
        responseMessage.setHTMLUnsafe(domSanitize(responseMessage.getHTML() + `<p class="error"><span data-i18n="dialog.reply-to-resource.error.save-error.span">${i18n.t('dialog.reply-to-resource.error.save-error.span.textContent')} </span> ${error.message}</p>`));
      })
  }
}

function setupResourceBrowser(parent, id, action){
  id = id || 'browser-location';
  id = domSanitize(id);
  action = action || 'write';
  action = domSanitize(action);

  const documentOptions = {
    ...Config.DOMProcessing,
    //sanitize: in this context, seems low risk.
    normalize: true
  };

  var createContainerButton = '';
  var createContainerDiv = '';
  if (Config['Session']?.isActive) {
    createContainerButton = ` <button data-i18n="browser.create-container.button" id="${id}-create-container-button" title="${i18n.t('browser.create-container.button.title')}">${i18n.t('browser.create-container.button.textContent')}</button>`;
    createContainerDiv = `<div id="${id}-create-container"></div>`;
  }

  parent.insertAdjacentHTML('beforeend', `<div id="${id}"><label for="${id}-input">URL</label> <input dir="ltr" id="${id}-input" name="${id}-input" placeholder="https://example.org/path/to/" required="" type="url" /><button data-i18n="browser.browse-location.button" id="${id}-update" disabled="disabled" title="${i18n.t('browser.browse-location.button.textContent')}">${i18n.t('browser.browse-location.button.textContent')}</button>${createContainerButton}</div>${createContainerDiv}<div id="${id}-listing"></div>`);

  // var inputBox = document.getElementById(id);
  var createContainer = document.getElementById(id + '-create-container');
  var createButton = document.getElementById(id + '-create-container-button');
  var storageBox = document.getElementById(id + '-listing');
  var input = document.getElementById(id + '-input');
  var browseButton = document.getElementById(id + '-update');

  input.addEventListener('keyup', (e) => {
    var msgs = document.getElementById(id).querySelectorAll('.response-message');
    for(var i = 0; i < msgs.length; i++){
      msgs[i].parentNode.removeChild(msgs[i]);
    }

    var actionNode = document.getElementById(id + '-' + action);
    if (input.value.length > 10 && input.value.match(/^https?:\/\//g) && input.value.slice(-1) == "/") {
      browseButton.removeAttribute('disabled');
      //TODO: enable button if only agent has write permission?
      // createButton.removeAttribute('disabled');

      if(e.which == 13){
        triggerBrowse(input.value, id, action);
      }
      if(actionNode){
        actionNode.textContent = input.value + generateAttributeId();
      }
    }
    else {
      browseButton.disabled = 'disabled';
      //TODO: disable button if only agent has write permission?
      // createButton.disabled = 'disabled';
      if(actionNode) {
        actionNode.textContent = input.value;
      }
    }
  }, false);

  browseButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    triggerBrowse(input.value, id, action);
  }, false);

  var browserul = document.getElementById(id + '-ul');
  if(!browserul){
    browserul = document.createElement('ul');
    browserul.id = id + '-ul';

    storageBox.appendChild(browserul);
  }

  var baseUrl;

  // TODO: Show and use storage, outbox, annotationService as opposed to first available.

  if(Config.User.Storage?.length) {
    baseUrl = forceTrailingSlash(Config.User.Storage[0]);
  }
  else if(Config.User.Outbox?.length) {
    baseUrl = forceTrailingSlash(Config.User.Outbox[0]);
  }
  else if(Config.Resource[Config.DocumentURL]?.annotationService?.length) {
    baseUrl = forceTrailingSlash(Config.Resource[Config.DocumentURL].annotationService[0]);
  }


  if(baseUrl){
    initBrowse(baseUrl, input, browseButton, createButton, id, action);
  }
  else {
    getLinkRelation(ns.oa.annotationService.value, null, getDocument(null, documentOptions))
      .then((storageUrl) => {
        initBrowse(storageUrl[0], input, browseButton, createButton, id, action);
      })
      .catch(() => {
        baseUrl = getBaseURL(Config.DocumentURL);
        initBrowse(baseUrl, input, browseButton, createButton, id, action);

        // if (Config['Session']?.isActive) {
        //   //Browsing removes whatever was for create container and restarts browse on new location
        //   browseButton.addEventListener('click', () => {
        //     createContainer.replaceChildren();
        //     DO.U.triggerBrowse(input.value, id, action);
        //   }, false);

        //   //Clicking on create container button shows the input
        //   createButton.addEventListener('click', (e) => {
        //     DO.U.showCreateContainer(input.value, id, action, e);
        //   }, false);
        // }
      })
  }
}

function triggerBrowse(url, id, action){
  var inputBox = document.getElementById(id);
  if (url.length > 10 && url.match(/^https?:\/\//g) && url.slice(-1) == "/"){
// console.log(url)
    var headers;
    headers = {'Accept': 'text/turtle, application/ld+json'};
    getResourceGraph(url, headers).then(g => {
      generateBrowserList(g, url, id, action).then(l => {
        showStorageDescription(g, id, url);
        return l;
      },
      function(reason){
        console.log('???? ' + reason); // Probably no reason for it to get to here
      });
    },
    function(reason){
      var node = document.getElementById(id + '-ul');

      DO.U.showErrorResponseMessage(node, reason.response);
    });
  }
  else{
    inputBox.insertAdjacentHTML('beforeend', `<div class="response-message"><p class="error" data-i18n="browser.error.invalid-location.p">${i18n.t('browser.error.invalid-location.p.textContent')}</p></div>`);
  }
}

function showCreateContainer(baseURL, id, action, e) {
  //FIXME: Do these checks for now until showCreateContainer is refactored
  if (!e) {
    return;
  }
  id = id || generateUUID();

  var div = document.getElementById(id + '-create-container');
  if (div) {
    div.replaceChildren();
  }

  div.insertAdjacentHTML('beforeend', `<label data-18n="browser.create-container-name.label" for="${id}-create-container-name">${i18n.t('browser.create-container-name.label.textContent')}</label> <input data-i18n="browser.create-container-name.input" dir="auto" id="${id}-create-container-name" name="${id}-create-container-name" type="text" placeholder="${i18n.t('browser.create-container-name.input.placeholder')}" /> <button class="insert" data-i18n="browser.create-container-name.button" disabled="disabled" title="${i18n.t('browser.create-container-name.button.title')}" type="button">${i18n.t('browser.create-container-name.button.textContent')}</button>`);

  var label = div.querySelector('label');
  var input = div.querySelector('input');

  var createButton = document.querySelector('#' + id + '-create-container button.insert');

  input.addEventListener('keyup', (e) => {
    var containerLabel = domSanitize(input.value.trim());

    if (containerLabel.length) {
      createButton.removeAttribute('disabled');
    }
    else {
      createButton.disabled = 'disabled';
    }
  });

  createButton.addEventListener('click', (e) => {
    //FIXME: Escaping containerLabel and containerURL (request-target) can be better.

    var patch = {};
    var containerLabel = domSanitize(input.value.trim());
    var insertG = '<> <' + ns.dcterms.title.value +  '> """' + escapeRDFLiteral(containerLabel) + '""" .';
    patch = { 'insert': insertG };

    containerLabel = containerLabel.endsWith('/') ? containerLabel.slice(0, -1) : containerLabel;

    var containerURL = baseURL + encodeURIComponent(containerLabel) + '/';

    var options = { 'headers': { 'If-None-Match': '*' } };

    var node = document.getElementById(id + '-create-container');

    patchResourceWithAcceptPatch(containerURL, patch, options)
      .then(response => {
        triggerBrowse(containerURL, id, action);
      })
      .catch(reason => {
        // console.log(reason);

        var main = `      <article about=""><dl id="document-title"><dt>Title</dt><dd property="dcterms:title">${containerLabel}</dd></dl></article>`;

        var o = {
          'omitLang': true,
          'prefixes': {
            'dcterms': 'http://purl.org/dc/terms/'
          }
        }

        var data = createHTML(containerLabel, main, o);

        // console.log(data);

        options.headers['Content-Type'] = 'text/html';

        putResourceWithAcceptPut(containerURL, data, options)
          .then(response => {
            triggerBrowse(containerURL, id, action);
          })
          .catch(reason => {
            // console.log(reason)

            DO.U.showErrorResponseMessage(node, reason.response, 'createContainer');
          })
      })
  });
}

function showErrorResponseMessage(node, response, context) {
  var statusCode = ('status' in response) ? response.status : 0;
  statusCode = (typeof statusCode === 'string') ? parseInt(response.slice(-3)) : statusCode;
  // console.log(statusCode);
  // console.log(response);

  var msgs = node.querySelectorAll('.response-message');
  for(var i = 0; i < msgs.length; i++){
    msgs[i].parentNode.removeChild(msgs[i]);
  }

  var statusText = response.statusText || '';
  //TODO: use Sanitizer API?
  statusText = statusText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  var msg = '';

  let errorKey = 'default';

  switch(statusCode) {
    default:
      break;
    case 401:
      if (Config.User.IRI) {
        errorKey = 'invalid-credentials';
      } else {
        errorKey = 'unauthenticated';
      }
      break;
    case 403:
      errorKey = 'request-forbidden';
      break;
    case 404:
      errorKey = 'not-found';
      break;
    case 405:
      errorKey = 'request-not-supported';
      break;
    case 409:
      errorKey = 'conflict';
      break;
    case 412:
      errorKey = "precondition-failed";
      switch (context) {
        default:
          break;
        case 'createContainer':
          errorKey = `${errorKey}-create-container-name`;
          break;
      }
  }

  msg = i18n.t(`browser.error.${errorKey}.p.textContent`);

  node.insertAdjacentHTML('beforeend', `<div class="response-message"><p class="error" data-i18n="browser.error.${errorKey}.p">${msg}</p></div>`);
}


//TODO: Refactor, especially buttons.
function initBrowse(baseUrl, input, browseButton, createButton, id, action){
  input.value = baseUrl;
  var headers = {'Accept': 'text/turtle, application/ld+json'};
  getResourceGraph(baseUrl, headers)
    .then(g => {
      generateBrowserList(g, baseUrl, id, action)
        .then(i => {
          showStorageDescription(g, id, baseUrl);
        })
    })
    .then(i => {
      let sampNode = document.getElementById(id + '-' + action);
      if (sampNode) {
        sampNode.textContent = (action == 'write') ? input.value + generateAttributeId() : input.value;
      }
    });



  if (Config['Session']?.isActive) {
    createButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      showCreateContainer(input.value, id, action, e);
    }, false);
  }
}

function generateBrowserList(g, url, id, action) {
  //TODO: This should be part of refactoring.
  var inputType = (id == 'location-generate-feed') ? 'checkbox' : 'radio';

  document.getElementById(id + '-input').value = url;

  return new Promise((resolve, reject) => {
    var msgs = document.getElementById(id).querySelectorAll('.response-message');

    for(var i = 0; i < msgs.length; i++){
      msgs[i].parentNode.removeChild(msgs[i]);
    }

    //TODO: Perhaps this should be handled outside of generateBrowserList?
    var createContainer = document.getElementById(id + '-create-container');
    if (createContainer) {
      createContainer.replaceChildren();
    }

    var list = document.getElementById(id + '-ul');
    list.replaceChildren();

    var urlPath = url.split("/");
    if (urlPath.length > 4){ // This means it's not the base URL
      urlPath.splice(-2,2);
      var prevUrl = forceTrailingSlash(urlPath.join("/"));
      var upBtn = '<li class="container"><input type="radio" name="containers" value="' + prevUrl + '" id="' + prevUrl + '" /><label for="' + prevUrl + '" id="browser-up">..</label></li>';
      list.insertAdjacentHTML('afterbegin', upBtn);
    }

    var current = g.node(rdf.namedNode(url));
    var contains = current.out(ns.ldp.contains).values;
    var containersLi = Array();
    var resourcesLi = Array();
    contains.forEach(c => {
      var cg = g.node(rdf.namedNode(c));
      var resourceTypes = getGraphTypes(cg);

      var path = c.split("/");
      if (resourceTypes.includes(ns.ldp.Container.value) || resourceTypes.includes(ns.ldp.BasicContainer.value)){
        var slug = path[path.length-2];
        containersLi.push('<li class="container"><input type="radio" name="resources" value="' + c + '" id="' + slug + '"/><label for="' + slug + '">' + decodeURIComponent(slug) + '</label></li>');
      }
      else {
        slug = path[path.length-1];
        resourcesLi.push('<li><input type="' + inputType + '" name="resources" value="' + c + '" id="' + slug + '"/><label for="' + slug + '">' + decodeURIComponent(slug) + '</label></li>');
      }

    });
    containersLi.sort(function (a, b) {
      return a.toLowerCase().localeCompare(b.toLowerCase());
    });
    resourcesLi.sort(function (a, b) {
      return a.toLowerCase().localeCompare(b.toLowerCase());
    });
    var liHTML = containersLi.join('\n') + resourcesLi.join('\n');
    list.insertAdjacentHTML('beforeend', liHTML);

    var buttons = list.querySelectorAll('label');
    if(buttons.length <= 1){
      list.insertAdjacentHTML('beforeend', '<p><em>(empty)</em></p>');
    }

    for(let i = 0; i < buttons.length; i++) {
      var buttonParent = buttons[i].parentNode;
      var buttonInput = buttonParent.querySelector('input');

      //TODO: Find a better way than checking specific ids.
      if (!(id == 'location-generate-feed' && !buttonParent.classList.contains('container'))) {
        var nextUrl = buttonInput.value;
        DO.U.nextLevelButton(buttons[i], nextUrl, id, action);
      }
    }

    return resolve(list);
  });
}

function showStorageDescription(s, id, storageUrl, checkAgain) {
  var samp = document.getElementById(id + '-samp');
  var sD = document.getElementById(id + '-storage-description');

  if (samp && !sD) {
    var sDPromise = getLinkRelation(ns.solid.storageDescription.value, storageUrl);

    return sDPromise
      .then(sDURLs => {
        // TODO: resourceIRI for getLinkRelation should be the
        // closest IRI (not necessarily the document).

        if (sDURLs.length) {
          ///TODO: Handle multiple storage descriptions?
          var sDURL = sDURLs[0];
          Config.Storages = Config.Storages || {};
          Config.Storages[s.term.value] = {
            "storageDescription": sDURL
          };
        }
        if (sD) {
          sD.replaceChildren();
        }
        const details = document.getElementById(`${id}-storage-description-details`);
        if (details) {
          details.remove();
        }
        samp.insertAdjacentHTML('afterend', `<details id="${id}-storage-description-details"><summary data-i18n="dialog.storage-details.summary">${i18n.t('dialog.storage-details.summary.textContent')}</summary></details>`);

        sD = document.getElementById(id + '-storage-description-details');

        sD.addEventListener('click', (e) => {
          if (!sD.open) {
            var storageDescriptionNode = document.getElementById(id + '-storage-description');

            if (!storageDescriptionNode) {
              var storageLocation = `<dl id="storage-location"><dt data-i18n="dialog.storage-location.dt">${i18n.t('dialog.storage-location.dt.textContent')}</dt><dd><a href="${storageUrl}" rel="noopener" target="_blank">${storageUrl}</a></dd></dl>`;

              getResourceGraph(sDURL).then(g => {
                if (g) {
                  var primaryTopic = g.out(ns.foaf.primaryTopic).values;
                  g = (primaryTopic.length) ? g.node(rdf.namedNode(primaryTopic[0])) : g.node(rdf.namedNode(storageUrl));

                  var selfDescription = DO.U.getStorageSelfDescription(g);
                  var contactInformation = DO.U.getContactInformation(g);
                  var persistencePolicy = DO.U.getPersistencePolicy(g);
                  var odrlPolicies = DO.U.getODRLPolicies(g);
                  var communicationOptions = DO.U.getCommunicationOptions(g);

                  sD.insertAdjacentHTML('beforeend', domSanitize('<div id="' + id + '-storage-description">' + storageLocation + selfDescription + contactInformation + persistencePolicy + odrlPolicies + communicationOptions + '</div>'));

                  var subscriptionsId = id + '-storage-description-details';
                  var topicResource = s.term.value;

                  var nodes = document.querySelectorAll('[id="' + id + '-storage-description"] [id^="notification-subscriptions-"]');
                  DO.U.buttonSubscribeNotificationChannel(nodes, topicResource);
                }
                else {
                  // TODO: var status = (g.status) ? g.status
                  sD.insertAdjacentHTML('beforeend', '<div id="' + id + '-storage-description">Unavailable</div>');
                }
              });
            }
          }
        });

// console.log(Config.Resource);
      })
      .catch(error => {
        // console.log('Error fetching solid:storageDescription endpoint:', error)
        // throw error
      });
  }
},
