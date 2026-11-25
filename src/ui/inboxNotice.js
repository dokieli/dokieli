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

// Notices for documents without an inbox, shown to people who can edit or control them.

import Config from '../config.js';
import { i18n } from '../i18n.js';
import { accessModeAllowed } from '../access.js';
import { isHttpOrHttpsProtocol, stripFragmentFromString } from '../uri.js';
import { domSanitize, sanitizeInsertAdjacentHTML } from '../utils/sanitization.js';
import { Icon } from './icons.js';

const warned = new Set();
const checking = new Set();

export async function documentHasInbox(documentURL) {
  const { findDocumentInbox } = await import('../accessRequest.js');
  const inbox = await findDocumentInbox(documentURL);
  if (!inbox) return false;

  // A deleted inbox must not keep suppressing the notice
  try {
    await Config.Storage.head(inbox);
    return true;
  }
  catch (error) {
    return ![404, 410].includes(error?.status);
  }
}

export function looksAfterDocument(documentURL) {
  return accessModeAllowed(documentURL, 'write') || accessModeAllowed(documentURL, 'control');
}

function noticeHTML(key, extra = '') {
  return `<p class="inbox-missing">${Icon[".fas.fa-circle-info"]} <span data-i18n="${key}">${i18n.t(`${key}.textContent`)}</span>${extra}</p>`;
}

function canCreateInbox(documentURL) {
  return Boolean(Config.User.IRI) && accessModeAllowed(documentURL, 'control');
}

function allowHTML(documentURL) {
  return canCreateInbox(documentURL)
    ? ` <button class="create-inbox" data-i18n="document-inbox.set.button" type="button">${i18n.t('document-inbox.set.button.textContent')}</button>`
    : ` <span data-i18n="document-inbox.add.span">${i18n.t('document-inbox.add.span.textContent')}</span>`;
}

// Inbox creations in progress, so several buttons create one inbox
const creating = new Map();

function handleCreateInbox(container, documentURL) {
  const button = container.querySelector('button.create-inbox');
  if (!button) return;

  button.addEventListener('click', async () => {
    button.disabled = true;
    const status = document.createElement('span');
    status.className = 'progress';
    status.setHTMLUnsafe(domSanitize(Icon[".fas.fa-circle-notch.fa-spin.fa-fw"]));
    button.after(' ', status);

    try {
      if (!creating.has(documentURL)) {
        const { createDocumentInbox } = await import('../documentInbox.js');
        creating.set(documentURL, createDocumentInbox(documentURL));
      }
      const inbox = await creating.get(documentURL);
      const { watchInbox } = await import('./accessRequests.js');
      watchInbox(inbox, documentURL);
      const text = i18n.t('document-inbox.allowed.span.textContent');
      const done = `${Icon[".fas.fa-check"]} <span data-i18n="document-inbox.allowed.span">${text}</span>`;
      document.querySelectorAll('#document-action-message li').forEach(li => {
        if (!li.querySelector('.inbox-missing-message')) return;
        li.className = 'success';
        li.setHTMLUnsafe(domSanitize(done));
      });
      // The Save As notice is about the new document
      document.querySelectorAll('.inbox-missing:not(:has(button.set-inbox))').forEach(node => {
        node.setHTMLUnsafe(domSanitize(done));
        node.classList.add('inbox-allowed');
      });
      const { addMessageToLog } = await import('../doc.js');
      addMessageToLog({ content: text, type: 'success' }, Config.MessageLog);
    }
    catch (error) {
      creating.delete(documentURL);
      console.log('Could not create an inbox for the document:', error);
      status.setHTMLUnsafe(domSanitize(`${Icon[".fas.fa-times-circle.fa-fw"]} <span data-i18n="document-inbox.allow-failed.span">${i18n.t('document-inbox.allow-failed.span.textContent')}</span>`));
      button.disabled = false;
    }
  });
}

export async function addMissingInboxNotice(container, documentURL) {
  if (!container || !looksAfterDocument(documentURL)) return;
  if (await documentHasInbox(documentURL)) return;
  if (!container.isConnected || container.querySelector('.inbox-missing')) return;
  sanitizeInsertAdjacentHTML(container, 'afterbegin', noticeHTML('document-inbox.missing.span', allowHTML(documentURL)));
  handleCreateInbox(container.querySelector('.inbox-missing'), documentURL);
}

export async function addSaveAsInboxNotice(dialog, documentURL, setInboxInput) {
  const container = dialog?.querySelector(':scope > .info');
  if (!container || !setInboxInput) return;
  if (await documentHasInbox(documentURL)) return;
  if (!container.isConnected) return;

  sanitizeInsertAdjacentHTML(container, 'afterbegin', noticeHTML('document-inbox.save-as.span',
    ` <button class="set-inbox" data-i18n="document-inbox.save-as.button" type="button">${i18n.t('document-inbox.save-as.button.textContent')}</button>`));
  const notice = container.querySelector('.inbox-missing');

  const update = () => { notice.hidden = setInboxInput.hasAttribute('checked'); };
  setInboxInput.addEventListener('click', () => setTimeout(update));
  notice.querySelector('button.set-inbox').addEventListener('click', () => {
    const details = setInboxInput.closest('details');
    if (details) details.open = true;
    if (!setInboxInput.hasAttribute('checked')) setInboxInput.click();
    setInboxInput.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}

export async function warnIfNoInbox() {
  const documentURL = stripFragmentFromString(Config.DocumentURL || '');
  if (!documentURL || warned.has(documentURL) || checking.has(documentURL)) return;
  if (Config.DocumentAction === 'new' || !isHttpOrHttpsProtocol(documentURL)) return;
  if (!looksAfterDocument(documentURL)) return;

  checking.add(documentURL);
  try {
    // Finding an inbox does not consume warned, so a later deletion still shows the notice
    if (await documentHasInbox(documentURL)) return;
    if (stripFragmentFromString(Config.DocumentURL || '') !== documentURL) return;
    if (warned.has(documentURL)) return;
    warned.add(documentURL);

    const { addMessageToLog, showActionMessage } = await import('../doc.js');
    const text = i18n.t('document-inbox.missing.span.textContent');
    addMessageToLog({ content: text, type: 'info' }, Config.MessageLog);
    const id = showActionMessage(document.body, {
      content: `<span class="inbox-missing-message"><span data-i18n="document-inbox.missing.span">${text}</span>${allowHTML(documentURL)}</span>`,
      type: 'info',
      timer: null,
    });
    const item = document.getElementById(id);
    if (item) handleCreateInbox(item, documentURL);
  }
  finally {
    checking.delete(documentURL);
  }
}
