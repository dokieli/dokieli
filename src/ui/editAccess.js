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

// Edit buttons use aria-disabled instead of disabled, so clicking them can explain why editing is not allowed.

import Config from '../config.js';
import { i18n } from '../i18n.js';
import { accessModePossiblyAllowed } from '../access.js';
import { domSanitize } from '../utils/sanitization.js';
import { buttonIcons } from './buttons.js';
import { Icon } from './icons.js';

const EDIT_BUTTONS = '#document-menu button.editor-enable, .editor-toolbar button.editor-mode-toggle-btn[data-target-mode="author"]';

let messageId = null;
let unsubscribeAnswer = null;
let answered = false;

/**
 * True when WAC-Allow is known and does not include Write.
 */
export function editNotAllowed() {
  if (Config.Editor?.['new'] || Config.DocumentAction === 'new') return false;
  return !accessModePossiblyAllowed(null, 'write');
}

export function markEditButton(button, blocked = editNotAllowed()) {
  if (blocked) {
    button.setAttribute('aria-disabled', 'true');
  }
  else {
    button.removeAttribute('aria-disabled');
  }
}

export function updateEditButtons() {
  const blocked = editNotAllowed();
  document.querySelectorAll(EDIT_BUTTONS).forEach(button => markEditButton(button, blocked));
}

// doc.js and accessRequest.js are imported dynamically to avoid an import cycle through the toolbar
export async function showEditNotAllowed() {
  if (messageId && document.getElementById(messageId)) return;
  const { addMessageToLog, showActionMessage } = await import('../doc.js');
  if (messageId && document.getElementById(messageId)) return;

  const { findDocumentInbox } = await import('../accessRequest.js');
  const inbox = Config.User.IRI ? await findDocumentInbox(Config.DocumentURL) : null;
  if (messageId && document.getElementById(messageId)) return;

  const text = i18n.t('edit-access.not-allowed.span.textContent');
  let action;
  if (!Config.User.IRI) {
    action = `<span data-i18n="edit-access.sign-in.span">${i18n.t('edit-access.sign-in.span.textContent')}</span>`;
  }
  else if (inbox) {
    action = `<button class="request-access" data-i18n="edit-access.request-access.button" data-inbox="${inbox}" title="${i18n.t('edit-access.request-access.button.title')}" type="button">${i18n.t('edit-access.request-access.button.textContent')}</button>`;
  }
  else {
    action = `<span data-i18n="edit-access.request-access.unavailable.span">${i18n.t('edit-access.request-access.unavailable.span.textContent')}</span>`;
  }

  addMessageToLog({ content: text, type: 'error' }, Config.MessageLog);
  messageId = showActionMessage(document.body, {
    content: `<span data-i18n="edit-access.not-allowed.span">${text}</span> ${action}`,
    type: 'error',
    timer: null,
  });

  const button = document.querySelector(`#${messageId} button.request-access`);
  button?.addEventListener('click', () => sendAccessRequest(button));
}

async function sendAccessRequest(button) {
  const documentURL = Config.DocumentURL;
  button.disabled = true;
  const status = document.createElement('span');
  status.className = 'progress';
  status.setHTMLUnsafe(domSanitize(Icon[".fas.fa-circle-notch.fa-spin.fa-fw"]));
  button.after(' ', status);

  const show = (icon, key) => {
    status.setHTMLUnsafe(domSanitize(`${Icon[icon]} <span data-i18n="${key}">${i18n.t(`${key}.textContent`)}</span>`));
  };

  const { requestAccess } = await import('../accessRequest.js');
  try {
    // Listen before sending so the answer cannot slip by
    await listenForAnswer(documentURL).catch(() => {});
    await requestAccess(button.dataset.inbox, documentURL);
    show(".fas.fa-check-circle.fa-fw", 'edit-access.request-access.sent.span');
    const item = status.closest('li');
    if (item) {
      item.className = 'success';
      const icon = item.querySelector(':scope > svg');
      if (icon) icon.outerHTML = domSanitize(buttonIcons.success.icon);
    }
  }
  catch (error) {
    console.log('Error notifying the inbox:', error);
    show(".fas.fa-times-circle.fa-fw", 'edit-access.request-access.not-notified.span');
    button.disabled = false;
  }
}

async function listenForAnswer(documentURL) {
  if (unsubscribeAnswer || answered || documentURL !== Config.DocumentURL) return;

  const { onUserInboxItem, watchUserInbox } = await import('../userInbox.js');
  unsubscribeAnswer = onUserInboxItem(async (item) => {
    if (answered) return;
    const answer = await readAnswer(item, documentURL).catch(() => null);
    if (!answer || answered) return;
    answered = true;
    unsubscribeAnswer?.();
    unsubscribeAnswer = null;
    await showAnswer(answer, documentURL);
  });
  await watchUserInbox();
}

async function readAnswer(url, documentURL) {
  const { default: rdf } = await import('rdf-ext');
  const { getResourceGraph } = await import('../graph.js');
  const ns = Config.ns;
  const { graph: { dataset } } = await getResourceGraph(url);
  for (const type of ['Accept', 'Reject']) {
    for (const { subject } of dataset.match(null, ns.rdf.type, ns.as[type])) {
      const target = [...dataset.match(subject, ns.as.target, null)][0]?.object.value;
      if (target !== documentURL) continue;
      const summary = [...dataset.match(subject, ns.as.summary, null)][0]?.object.value;
      return { accepted: type === 'Accept', summary };
    }
  }
  return null;
}

async function showAnswer(answer, documentURL) {
  if (answer.accepted) {
    const { mayEditNow } = await import('../collab.js');
    await mayEditNow(documentURL).catch(() => {});
    updateEditButtons();
  }

  const { addMessageToLog, showActionMessage } = await import('../doc.js');
  const key = answer.accepted ? 'access-request.reply.allowed' : 'access-request.reply.declined';
  const text = answer.summary || i18n.t(`${key}.textContent`, { document: documentURL });
  const type = answer.accepted ? 'success' : 'info';
  addMessageToLog({ content: text, type }, Config.MessageLog);
  const options = {};
  if (answer.accepted && messageId) {
    options.clearId = messageId;
    messageId = null;
  }
  showActionMessage(document.body, { content: `<span>${text}</span>`, type, timer: null }, options);
}
