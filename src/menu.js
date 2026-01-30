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

import { fragmentFromString } from './util.js';
import { userInfoSignOut } from './auth.js';
import { updateResourceInfos, getDocumentContentNode, accessModePossiblyAllowed } from './doc.js';
import { i18n } from './i18n.js';
import { getLocalStorageItem, enableRemoteSync, disableRemoteSync } from './storage.js';
import { initButtons } from './ui/buttons.js';
import Config from './config.js';

export function initDocumentMenu() {
  document.body.prepend(fragmentFromString(`<div class="do" id="document-menu" dir="${Config.User.UI.LanguageDir}" lang="${Config.User.UI.Language}" xml:lang="${Config.User.UI.Language}">${Config.Button.Menu.OpenMenu}<div><section id="user-info"></section></div></div>`));

  var userInfo = document.getElementById('user-info');

  document.querySelector('#document-menu').addEventListener('click', (e) => {
    var button = e.target.closest('button');

    if (button) {
      if (button.classList.contains('show')) {
        showDocumentMenu(e);
      }
      else if (button.classList.contains('hide')) {
        hideDocumentMenu(e);
      }
      else if (button.classList.contains('signout-user')) {
        userInfoSignOut(userInfo);
      }
    }
  });
}

export function showDocumentMenu(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  var dMenu = document.querySelector('#document-menu.do');

  if (!dMenu) {
    initDocumentMenu();
    showDocumentMenu();
    return;
  }

  var dMenuButton = dMenu.querySelector('button');
  var dUserInfo = dMenu.querySelector('#user-info');
  var dInfo = dMenu.querySelector('div');

  dMenuButton.parentNode.replaceChild(fragmentFromString(Config.Button.Menu.CloseMenu), dMenuButton);
  dMenu.classList.add('on');

  showLanguages(dInfo)
  showUserSigninSignout(dUserInfo);
  DO.U.showDocumentDo(dInfo);
  DO.U.showAutoSave(dInfo);
  DO.U.showViews(dInfo);
  DO.U.showAboutDokieli(dInfo);

  var body = getDocumentContentNode(document);

  var options = { 'reuse': true };
  if (document.location.protocol.startsWith('http')) {
    options['followLinkRelationTypes'] = ['describedby'];
  }

  updateResourceInfos(Config.DocumentURL, null, null, options);
}

export function hideDocumentMenu(e) {
  // document.removeEventListener('click', eventLeaveDocumentMenu);

  var dMenu = document.querySelector('#document-menu.do');
  var dMenuButton = dMenu.querySelector('button');
  dMenuButton.parentNode.replaceChild(fragmentFromString(Config.Button.Menu.OpenMenu), dMenuButton);

  dMenu.classList.remove('on');
  // var sections = dMenu.querySelectorAll('section');
  // for (var i = 0; i < sections.length; i++) {
  //   if(sections[i].id != 'user-info' && !sections[i].querySelector('button.signin-user')) {
  //     sections[i].parentNode.removeChild(sections[i]);
  //   }
  // };
  var buttonSigninUser = dMenu.querySelector('button.signin-user');
  if(buttonSigninUser) {
    dMenu.querySelector('button.signin-user').disabled = false;
  }

  removeNodesWithIds(Config.DocumentDoItems);
}

export function eventEscapeDocumentMenu(e) {
  if (e.keyCode == 27) { // Escape
    hideDocumentMenu(e);
  }
}

export function eventLeaveDocumentMenu(e) {
  if (!e.target.closest('.do.on')) {
    hideDocumentMenu(e);
  }
}

export function updateUILanguage(lang) {
  i18n.changeLanguage(lang, (err) => {
    if (err) return console.error('Error loading language', err);

    // re-run initButtons to update the buttons that are stored
    initButtons();

    Config.User.UI['Language'] = lang;
    Config.User.UI['LanguageDir'] = i18n.dir();

    document.querySelectorAll('.do[lang]').forEach(el => {
      el.setAttribute('lang', lang);
      el.setAttribute('xml:lang', lang);
      el.setAttribute('dir', Config.User.UI['LanguageDir']);
    })

    document.querySelectorAll('.do select[name$="-language"], .do select#ui-language-select').forEach(el => {
      el.value = lang;
    })

    document.querySelectorAll('[data-i18n]:not(.ProseMirror [data-i18n]').forEach(el => {
      const baseKey = el.dataset.i18n;

      //TODO: Revisit updating text

      // Update textContent
      const textKey = `${baseKey}.textContent`;
      const keyOptions = el.hasAttribute('datetime') ? { val: new Date(el.getAttribute('datetime')) } : {};

      const textValue = i18n.t(textKey, keyOptions);
      if (textValue !== textKey) {
        const span = el.querySelector(':scope > span');
        if (span) {
          span.textContent = textValue;
        } else {
          [...el.childNodes].forEach(node => {
            if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim()) {
              node.nodeValue = textValue;
            }
          });
        }
      }

      // Update innerHTML
      const htmlKey = `${baseKey}.innerHTML`;

      // TODO: move to a standalone function - this takes the variable names from data-i18n- suffix and passes them as a vars object to the i18n fn
      const vars = {};
      Object.entries(el.dataset).forEach(([name, value]) => {
        if (name !== 'i18n') {
          vars[name.replace(/^i18n/, '').toLowerCase()] = value;
        }
      });

      const translated = i18n.t(htmlKey, vars);

      if (translated !== htmlKey) {
        el.setHTMLUnsafe(domSanitize(translated));
      }

      // Update attributes
      [...el.attributes].forEach(attr => {
        if (attr.name === 'data-i18n') return;
        const attrKey = `${baseKey}.${attr.name}`;
        const value = i18n.t(attrKey);
        if (value !== attrKey) {
          el.setAttribute(attr.name, value);
        }
      });
    });
  });
}

function showLanguages(node) {
  if (document.getElementById('ui-language')) {
    return;
  }

  let options = [];
  const effectiveLanguage = Config.User.UI.Language;

  Config.Translations.forEach(lang => {
    let selected = (lang == effectiveLanguage) ? ' selected="selected"' : '';

    let sourceName = Config.Languages[lang]?.sourceName;
    let name = Config.Languages[lang]?.name;

    if (lang !== 'dev' && sourceName) {
      options.push(`<option dir="${Config.Languages[lang].dir}" lang="${lang}"${selected} title="${name}" value="${lang}" xml:lang="${lang}">${sourceName}</option>`);
    }
  })

  const html = `
    <section aria-labelledby="ui-language-label" id="ui-language" rel="schema:hasPart" resource="#ui-language">
      <h2 data-i18n="language.label" id="ui-language-label" property="schema:name">${i18n.t('language.label.textContent')}</h2>
      ${Icon['.fas.fa-language']}
      <label id="ui-language-select-label" for="ui-language-select" data-i18n="menu.ui-language-select.label">${i18n.t('menu.ui-language-select.label.textContent')}</label>
      <select aria-labelledby="ui-language-select-label" id="ui-language-select">
        ${options.join('')}
      </select>
    </section>`;

  node.insertAdjacentHTML('afterbegin', html);

  const select = document.getElementById('ui-language-select');

  select.addEventListener('change', (e) => {
    e.preventDefault();
    e.stopPropagation();

    updateUILanguage(e.target.value);
  });
}

export async function showAutoSave(node) {
  if (node.querySelector('#document-autosave')) { return; }

  const storageObject = await getLocalStorageItem(DO.C.DocumentURL);

  const hasAccessModeWrite = accessModePossiblyAllowed(DO.C.DocumentURL, 'write');
  let checked = storageObject?.autoSave !== undefined ? storageObject.autoSave : true;
  checked = (checked && hasAccessModeWrite) ? ' checked=""' : '';

  let html = `
  <section aria-labelledby="document-autosave-label" id="document-autosave" rel="schema:hasPart" resource="#document-autosave">
    <h2 data-i18n="menu.autosave.h2" id="document-autosave-label" property="schema:name">${i18n.t('menu.autosave.h2.textContent')}</h2>
    <input${checked} data-i18n="menu.autosave.input" id="autosave-remote" title="${i18n.t('menu.autosave.input.title')}" type="checkbox" />
    <label data-i18n="menu.autosave.label" for="autosave-remote"><span data-i18n="menu.autosave.label.span">${i18n.t('menu.autosave.label.span.textContent')}</span></label> 
  </section>
  `;

  node.querySelector('#document-do').insertAdjacentHTML('afterend', html);

  document.getElementById('document-autosave').addEventListener('change', async (e) => {
    if (e.target.checked) {
      await enableRemoteSync();
    }
    else {
      await disableRemoteSync();
    }
  });
}
