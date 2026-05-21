/*!
Copyright 2012-2026 Sarven Capadisli <https://csarven.ca/>
Copyright 2023-2026 Virginia Balseiro <https://virginiabalseiro.com/>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
*/

import Config from '../config.js';
import { i18n } from '../i18n.js';
import { Icon } from './icons.js';

function renderDocumentDo() {
  const editToggle = Config.Editor?.mode === 'author'
    ? Config.Button.Menu.EditDisable
    : Config.Button.Menu.EditEnable;

  const groups = [
    {
      id: 'menu-group-primary',
      className: 'menu-group-primary',
      buttons: [Config.Button.Menu.New, Config.Button.Menu.NewSlideshow, Config.Button.Menu.Open, editToggle]
    },
    {
      id: 'menu-group-document',
      summaryKey: 'menu.group.document',
      open: true,
      buttons: [Config.Button.Menu.Save, Config.Button.Menu.SaveAs, Config.Button.Menu.Version, Config.Button.Menu.Immutable, Config.Button.Menu.Memento, Config.Button.Menu.EditHistory]
    },
    {
      id: 'menu-group-interactions',
      summaryKey: 'menu.group.interactions',
      open: true,
      buttons: [Config.Button.Menu.Share, Config.Button.Menu.Reply, Config.Button.Menu.Notifications, Config.Button.Menu.MessageLog]
    },
    {
      id: 'menu-group-advanced',
      summaryKey: 'menu.group.advanced',
      open: false,
      buttons: [Config.Button.Menu.RobustifyLinks, Config.Button.Menu.InternetArchive, Config.Button.Menu.GenerateFeed]
    },
    {
      id: 'menu-group-danger',
      className: 'menu-group-danger',
      summaryKey: 'menu.group.danger',
      open: false,
      buttons: [Config.Button.Menu.Delete]
    }
  ];

  const groupsHTML = groups.map(g => {
    const list = `<ul>${g.buttons.map(b => `<li>${b}</li>`).join('')}</ul>`;
    if (!g.summaryKey) {
      return `<div class="menu-group ${g.className || ''}" id="${g.id}">${list}</div>`;
    }
    const summaryLabel = i18n.t(`${g.summaryKey}.textContent`);
    const openAttr = g.open ? ' open=""' : '';
    const classAttr = g.className ? ` ${g.className}` : '';
    return `<details class="menu-group${classAttr}" id="${g.id}"${openAttr}><summary data-i18n="${g.summaryKey}">${summaryLabel}</summary>${list}</details>`;
  }).join('');

  return `
    <section aria-labelledby="document-do-label" id="document-do" rel="schema:hasPart" resource="#document-do">
      <h2 id="document-do-label" property="schema:name">Menu</h2>
      ${groupsHTML}
    </section>`;
}

function renderDocumentTools() {
  const buttons = [
    Config.Button.Menu.DocumentInfo,
    Config.Button.Menu.EmbedData,
    Config.Button.Menu.Source,
    Config.Button.Menu.Export,
    Config.Button.Menu.Print
  ];

  return `
    <section aria-labelledby="document-tools-label" id="document-tools" rel="schema:hasPart" resource="#document-tools">
      <h2 id="document-tools-label" property="schema:name" data-i18n="menu.tools.h2">${i18n.t('menu.tools.h2.textContent')}</h2>
      <ul>${buttons.map(b => `<li>${b}</li>`).join('')}</ul>
    </section>`;
}

function renderLanguageSelector() {
  const effectiveLanguage = Config.User?.UI?.Language || i18n.code();
  const options = [];

  (Config.Translations || []).forEach(lang => {
    const sourceName = Config.Languages?.[lang]?.sourceName;
    const name = Config.Languages?.[lang]?.name;
    if (lang === 'dev' || !sourceName) return;
    const selected = (lang === effectiveLanguage) ? ' selected="selected"' : '';
    options.push(`<option dir="${Config.Languages[lang].dir}" lang="${lang}"${selected} title="${name}" value="${lang}" xml:lang="${lang}">${sourceName}</option>`);
  });

  return `
    <section aria-labelledby="ui-language-label" id="ui-language" rel="schema:hasPart" resource="#ui-language">
      <h2 data-i18n="language.label" id="ui-language-label" property="schema:name">${i18n.t('language.label.textContent')}</h2>
      ${Icon['.fas.fa-language']}
      <label id="ui-language-select-label" for="ui-language-select" data-i18n="menu.ui-language-select.label">${i18n.t('menu.ui-language-select.label.textContent')}</label>
      <select aria-labelledby="ui-language-select-label" id="ui-language-select">
        ${options.join('')}
      </select>
    </section>`;
}

function renderAutoSave() {
  return `
    <section aria-labelledby="document-autosave-label" id="document-autosave" rel="schema:hasPart" resource="#document-autosave">
      <h2 data-i18n="menu.autosave.h2" id="document-autosave-label" property="schema:name">${i18n.t('menu.autosave.h2.textContent')}</h2>
      <input data-i18n="menu.autosave.input" disabled="disabled" id="autosave-remote" title="${i18n.t('menu.autosave.input.title')}" type="checkbox" />
      <label data-i18n="menu.autosave.label" for="autosave-remote"><span data-i18n="menu.autosave.label.span">${i18n.t('menu.autosave.label.span.textContent')}</span></label>
    </section>`;
}

function renderSettings() {
  return renderLanguageSelector() + renderAutoSave();
}

function renderTabs() {
  return `
    <div class="tabs" id="document-menu-tabs">
      <nav aria-label="${i18n.t('menu.tabs.nav.aria-label')}">
        <ul>
          <li class="selected"><a data-i18n="menu.tabs.actions" href="#menu-actions">${i18n.t('menu.tabs.actions.textContent')}</a></li>
          <li><a data-i18n="menu.tabs.tools" href="#menu-tools">${i18n.t('menu.tabs.tools.textContent')}</a></li>
          <li><a data-i18n="menu.tabs.settings" href="#menu-settings">${i18n.t('menu.tabs.settings.textContent')}</a></li>
        </ul>
      </nav>
      <section class="selected" id="menu-actions">${renderDocumentDo()}</section>
      <section id="menu-tools">${renderDocumentTools()}</section>
      <section id="menu-settings">${renderSettings()}</section>
    </div>`;
}

export function renderMenuInner() {
  return `<section id="user-info"></section>${renderTabs()}`;
}
