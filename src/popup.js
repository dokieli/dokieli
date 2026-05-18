/*!
Copyright 2012-2026 Sarven Capadisli <https://csarven.ca/>
Copyright 2023-2026 Virginia Balseiro <https://virginiabalseiro.com/>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
*/

// Extension popup entry point. Initialises just enough of dokieli (i18n +
// button definitions) to render the same menu the in-page version produces,
// via the shared renderMenuInner builder. Click handlers either send messages
// to the active tab's content script or open new tabs.

import Config from './config.js';
import { i18nextInit } from './i18n.js';
import { initButtons } from './ui/buttons.js';
import { renderMenuInner } from './ui/menu-builder.js';

const WebExtension = (typeof globalThis.browser !== 'undefined') ? globalThis.browser : globalThis.chrome;

// Same key used by src/auth.js (EXTENSION_SESSION_KEY) so an in-page dokieli's
// restoreExtensionSession() picks up sessions established here, and vice versa.
const SESSION_KEY = 'DO.Config.ExtensionSession';

function initTabs() {
  const tabs = document.getElementById('document-menu-tabs');
  if (!tabs) return;

  tabs.querySelector('nav').addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    e.preventDefault();

    const li = a.parentNode;
    if (li.classList.contains('selected')) return;

    const prevLi = tabs.querySelector('nav li.selected');
    if (prevLi) prevLi.classList.remove('selected');
    li.classList.add('selected');

    const prevSection = tabs.querySelector(':scope > section.selected');
    if (prevSection) prevSection.classList.remove('selected');
    tabs.querySelector(`:scope > section${a.hash}`)?.classList.add('selected');
  });
}

async function getSession() {
  const stored = await WebExtension.storage.local.get(SESSION_KEY);
  return stored?.[SESSION_KEY] || null;
}

async function clearSession() {
  await WebExtension.storage.local.remove(SESSION_KEY);
}

function renderAgent(session) {
  const iri = session.webId;
  const name = session.name || iri;
  const avatarSize = Config.AvatarSize || 48;
  const avatar = session.image
    ? `<img alt="" height="${avatarSize}" rel="schema:image" src="${session.image}" width="${avatarSize}" /> `
    : '';
  return `<span about="${iri}" typeof="schema:Person">${avatar}<a rel="schema:url" href="${iri}"><span about="${iri}" property="schema:name">${name}</span></a></span>`;
}

async function renderUserInfo() {
  const node = document.getElementById('user-info');
  if (!node) return;
  const session = await getSession();

  if (session?.webId) {
    node.innerHTML = renderAgent(session) + Config.Button.Menu.SignOut;
  } else {
    node.innerHTML = Config.Button.Menu.SignIn;
  }
}

async function getActiveTab() {
  const tabs = await WebExtension.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function openSigninDialog() {
  const tab = await getActiveTab();
  if (!tab?.id) return;

  try {
    await WebExtension.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['media/css/dokieli.css'],
    });

    await WebExtension.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['scripts/dokieli.js'],
    });

    await WebExtension.tabs.sendMessage(tab.id, { action: 'dokieli.showSignin' });
    window.close();
  } catch (e) {
    console.error('dokieli popup: could not open sign-in dialog', e);
  }
}

function initAuthHandlers() {
  document.addEventListener('click', async (e) => {
    if (e.target.closest('button.signin-user')) {
      openSigninDialog();
      return;
    }
    if (e.target.closest('button.signout-user')) {
      await clearSession();
      await renderUserInfo();
      return;
    }
  });
}

function initButtonStubs() {
  document.addEventListener('click', (e) => {
    const button = e.target.closest('button');
    if (!button || button.disabled) return;
    if (button.matches('.signin-user, .signout-user')) return;
    if (!button.closest('#document-do, #document-tools')) return;
    console.log('[dokieli popup] clicked:', button.className || '(no class)');
  });
}

async function init() {
  await i18nextInit();
  initButtons();

  const menu = document.getElementById('document-menu');
  if (menu) menu.innerHTML = renderMenuInner();

  initTabs();
  initAuthHandlers();
  initButtonStubs();
  renderUserInfo();
}

document.addEventListener('DOMContentLoaded', init);
