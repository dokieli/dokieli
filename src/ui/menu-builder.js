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

import Config from '../config.js';
import { i18n } from '../i18n.js';
import { Icon } from './icons.js';

function renderDocumentDo() {
  const editToggle = Config.Editor?.mode === 'author'
    ? Config.Button.Menu.EditDisable
    : Config.Button.Menu.EditEnable;

  const encryptToggle = Config.User?.Encryption?.DocumentEncrypt
    ? Config.Button.Menu.EncryptDisable
    : Config.Button.Menu.EncryptEnable;

  const groups = [
    {
      id: 'menu-group-primary',
      className: 'menu-group-primary',
      buttons: [Config.Button.Menu.New, Config.Button.Menu.Open, editToggle]
    },
    {
      id: 'menu-group-document',
      summaryKey: 'menu.group.document',
      open: true,
      buttons: [Config.Button.Menu.Save, Config.Button.Menu.SaveAs, encryptToggle, Config.Button.Menu.Version, Config.Button.Menu.Immutable, Config.Button.Menu.Memento, Config.Button.Menu.EditHistory]
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

function renderDocumentViews() {
  const items = [];
  if (Config.GraphViewerAvailable) {
    items.push(`<li><button class="resource-visualise" data-i18n="menu.document-views.graph.button" title="${i18n.t('menu.document-views.graph.button.title')}">${i18n.t('menu.document-views.graph.button.textContent')}</button></li>`);
  }
  items.push(`<li><button class="resource-native-style" data-i18n="menu.document-views.native-style.button" title="${i18n.t('menu.document-views.native-style.button.title')}">${i18n.t('menu.document-views.native-style.button.textContent')}</button></li>`);
  items.push(`<li><button class="resource-edit-custom-style" data-i18n="menu.document-views.custom.button" title="${i18n.t('menu.document-views.custom.button.title')}">${i18n.t('menu.document-views.custom.button.textContent')}</button></li>`);

  return `
    <section aria-labelledby="document-views-label" id="document-views" rel="schema:hasPart" resource="#document-views">
      <h2 id="document-views-label" property="schema:name" data-i18n="menu.document-views.h2">${i18n.t('menu.document-views.h2.textContent')}</h2>
      ${Icon['.fas.fa-magic']}
      <ul>${items.join('')}</ul>
    </section>`;
}

function renderAboutDokieli() {
  return `
    <section id="about-dokieli">
      <dl>
        <dt data-i18n="menu.about-dokieli.dt">${i18n.t('menu.about-dokieli.dt.textContent')}</dt>
        <dd data-i18n="menu.about-dokieli.dd"><img alt="" height="32" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAAAn1BMVEUAAAAAjwAAkAAAjwAAjwAAjwAAjwAAjwAAkAAAdwAAjwAAjQAAcAAAjwAAjwAAiQAAjwAAjAAAjwAAjwAAjwAAjwAAkAAAjwAAjwAAjwAAjQAAjQAAhQAAhQAAkAAAkAAAkAAAjgAAjwAAiQAAhAAAkAAAjwAAjwAAkAAAjwAAjgAAjgAAjQAAjwAAjQAAjwAAkAAAjwAAjQAAiwAAkABp3EJyAAAANHRSTlMA+fH89enaabMF4iADxJ4SiSa+uXztyoNvQDcsDgvl3pRiXBcH1M+ppJlWUUpFMq6OdjwbMc1+ZgAABAhJREFUeNrt29nSmkAQBeAGZBMUxH3f993/vP+zJZVKVZKCRhibyc3/XVt6SimYPjPSt28Vmt5W/fu2T/9B9HIf7Tp+0RsgDC6DY6OLvzxJj8341DnsakgZUNUmo2XsORYYS6rOeugukhnyragiq56JIs5UEQ/FXKgidRTzompEKOhG1biioDFV44mCAqrGAQWtqRptA8VMqCpR6zpo9iy84VO1opWHPBZVb9QAzyQN/D1YNungJ+DMSYsbOFvSIwGjR3p0wGiQHkMw2qRHC4w76RGBcSA9NmAcSY8QjAdpYiFbTJoYyNYnTWrI1iFNusj2JE1sZBuQJtyE5pImc3Y21cRhZ1NNtsh2Ik127HCsSY8djjVpINuVhPnjVefobee2adXqu2S/6FyivABDEjQ9Lxo1pDlNd5wg24ikRK5ngKGhHhg1DSgZk4RrD6pa9LlRAnUBfWp6xCe+6EOvOT6yrmrigZaCZHPAp6b0gaiBFKvRd0/D1rr1OrvxDqiyoZmmPt9onib0t/VybyEXqdu0Cw16rUNVAfZFlzdjr5KOaoAUK6JsrgWGQapuBlIS4gy70gEmTrk1fuAgU40UxWXv6wvZAC2Dqfx0BfBK1z1H0aJ0WH7Ub4oG8JDlpBCgK1l5tSjHQSoAf0HVfMqxF+yqpzVk2ZGuAGdk8ijPHZlmpOCg0vh5cgE2JtN3qQSoU3lXpbKlLRegrzTpt+U2TNpKY2YiFiA0kS1Q6QccweZ/oinASm2B3RML0AGDNAU4qq3udmIXYVttD3YrFsBR24N1xG5EJpTeaiYWwILS5WRKBfChFsCSehpOwKi/yS0V4AsMWym3TWUFgMqIsRYL8AVOSDlaYgEitbZnDKll+UatchyJBSC1c3lDuQA2VHYAL3KneHpgLCjHSS7AHYyEciwh1g88wDB94rlyAVxwhsR7ygW4gRMTry8XwDdUDkXFgjVdD5wRsRaCAWJwPGI1Baval8Ie3Hqn8AjjhHbZr2DzrInumDTBGlCG8xy8QPY3MNLX4TiRP1q+BWs2pn9ECwu5+qTABc+80h++28UbTkjlTW3wrM6Ufrtu8d5J9Svg1Vch/RTcUYQdUHm+g1z1x2gSGyjGGVN5F7xjoTCjE0ndC3jJMzfCftmiciZ1lNGe3vCGufOWVMLIQHHehi3X1O8JJxR236SalUzninbu937BlwfV/I3k4KdGk2xm+MHuLa8Z0i9TC280qLRrF+8cw9RSjrOg8oIG8j2YgULsbGPomsgR0x9nsOzkOLh+kZr1owZGbfC2JJl78fIV0Wei/gxZDl85XWVtt++cxhuSEQ6bdfzLjlvM86PbaD4vQUjSglV8385My7CdXtO9+ZSyrLcf7nBN376V8gMpRztyq6RXYQAAAABJRU5ErkJggg==" width="32" /><span data-i18n="menu.about-dokieli.dd.span">${i18n.t('menu.about-dokieli.dd.span.innerHTML')}</span></dd>
      </dl>
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
      <section id="menu-tools">${renderDocumentTools()}${renderDocumentViews()}</section>
      <section id="menu-settings">${renderSettings()}</section>
    </div>`;
}

export function renderMenuInner() {
  return `<section id="user-info"></section>${renderTabs()}${renderAboutDokieli()}`;
}
