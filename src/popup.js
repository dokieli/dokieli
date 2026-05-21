/*!
Copyright 2012-2026 Sarven Capadisli <https://csarven.ca/>
Copyright 2023-2026 Virginia Balseiro <https://virginiabalseiro.com/>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
*/

import i18next from 'i18next';
import Config from './config.js';
import { i18nextInit } from './i18n.js';
import { initButtons } from './ui/buttons.js';
import { renderMenuInner } from './ui/menu-builder.js';

const WebExtension = (typeof globalThis.browser !== 'undefined') ? globalThis.browser : globalThis.chrome;

// Shared with src/auth.js EXTENSION_SESSION_KEY.
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

async function activateOnActiveTab() {
  const tab = await getActiveTab();
  if (!tab?.id || !tab.url) return;
  if (/^(chrome|about|edge|brave|moz-extension|chrome-extension):/.test(tab.url)) return;

  try {
    const status = await WebExtension.tabs.sendMessage(tab.id, { action: 'dokieli.status' });
    if (status?.loaded) return;
  } catch {
    return;
  }

  try {
    await WebExtension.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['media/css/dokieli.css'],
    });
    await WebExtension.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['scripts/dokieli.js'],
    });
    await WebExtension.tabs.sendMessage(tab.id, { action: 'dokieli.activate' });
  } catch (e) {
    console.warn('dokieli popup: activate failed', e);
  }
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

function renderMenu() {
  const menu = document.getElementById('document-menu');
  if (menu) menu.innerHTML = renderMenuInner();
}

function initLanguageHandler() {
  document.addEventListener('change', async (e) => {
    const select = e.target.closest('#ui-language-select');
    if (!select) return;
    const lang = select.value;
    if (!lang) return;

    await WebExtension.storage.sync.set({ 'DO.Config.UI.Language': lang });

    await new Promise(resolve => i18next.changeLanguage(lang, () => resolve()));
    initButtons();
    renderMenu();
    renderUserInfo();

    try {
      const tab = await getActiveTab();
      if (tab?.id) {
        await WebExtension.tabs.sendMessage(tab.id, { action: 'dokieli.updateLanguage', lang });
      }
    } catch {}
  });
}

const NEW_TAB_BUTTONS = {
  'resource-new': ['new.html'],
  'resource-new-slideshow': ['new.html', '?template=new-slideshow'],
};

function initMenuActions() {
  document.addEventListener('click', async (e) => {
    const button = e.target.closest('button');
    if (!button || button.disabled) return;
    if (!button.closest('#document-do, #document-tools')) return;
    if (button.matches('.signin-user, .signout-user')) return;

    const cls = [...button.classList].find(c => c in NEW_TAB_BUTTONS);
    if (cls) {
      const [path, query = ''] = NEW_TAB_BUTTONS[cls];
      await WebExtension.tabs.create({ url: WebExtension.runtime.getURL(path) + query });
      window.close();
      return;
    }

    const actionClass = [...button.classList].find(c => c !== 'show' && c !== 'hide' && c !== 'do-menu');
    if (!actionClass) return;

    try {
      const tab = await getActiveTab();
      if (!tab?.id) return;
      await WebExtension.tabs.sendMessage(tab.id, { action: 'dokieli.menuClick', className: actionClass });
      window.close();
    } catch (err) {
      console.warn('dokieli popup: menuClick failed', err);
    }
  });
}

async function init() {
  await i18nextInit();

  const stored = await WebExtension.storage.sync.get('DO.Config.UI.Language');
  const persistedLang = stored?.['DO.Config.UI.Language'];
  if (persistedLang) {
    await new Promise(resolve => i18next.changeLanguage(persistedLang, () => resolve()));
  }

  initButtons();
  renderMenu();

  initTabs();
  initAuthHandlers();
  initLanguageHandler();
  initMenuActions();
  renderUserInfo();

  activateOnActiveTab();
}

document.addEventListener('DOMContentLoaded', init);
