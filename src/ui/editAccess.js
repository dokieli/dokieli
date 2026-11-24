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
import { Icon } from './icons.js';

const EDIT_BUTTONS = '#document-menu button.editor-enable, .editor-toolbar button.editor-mode-toggle-btn[data-target-mode="author"]';

let messageId = null;

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
    await requestAccess(button.dataset.inbox, documentURL);
    show(".fas.fa-check-circle.fa-fw", 'edit-access.request-access.sent.span');
  }
  catch (error) {
    console.log('Error notifying the inbox:', error);
    show(".fas.fa-times-circle.fa-fw", 'edit-access.request-access.not-notified.span');
    button.disabled = false;
  }
}
