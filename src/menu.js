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
import { showUserSigninSignout, userInfoSignOut } from './auth.js';
import { updateResourceInfos, getDocumentContentNode, accessModePossiblyAllowed, removeNodesWithIds } from './doc.js';
import { i18n } from './i18n.js';
import { getLocalStorageItem, enableRemoteSync, disableRemoteSync } from './storage.js';
import { getButtonHTML, initButtons } from './ui/buttons.js';
import Config from './config.js';
import { Icon } from './ui/icons.js';
import { openDocument, replyToResource, saveAsDocument, shareResource, viewSource } from './dialog.js';
import { domSanitize } from './utils/sanitization.js';
import { showVisualisationGraph } from './viz.js';
import { getAgentPreferredLanguages } from './graph.js';

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
  showDocumentDo(dInfo);
  showAutoSave(dInfo);
  showViews(dInfo);
  showAboutDokieli(dInfo);

  // var body = getDocumentContentNode(document);

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

export function setPreferredLanguagesInfo(g) {
  let preferredLanguages = navigator.languages;

  if (Array.isArray(g)) {
    preferredLanguages = g;
  }
  else if (g && typeof g === 'object') {
    preferredLanguages = getAgentPreferredLanguages(g) || [];
  }

  let matchedLang;
  let found = false;

  for (const lang of preferredLanguages) {
    const segments = lang.split("-");

    for (let len = segments.length; len > 0; len--) {
      const candidate = segments.slice(0, len).join("-");

      if (Config.Translations.includes(candidate)) {
        matchedLang = candidate;
        found = true;
        break;
      }
    }

    if (found) break;
  }

  if (matchedLang) {
    updateUILanguage(matchedLang);
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

function showDocumentDo(node) {
  var d = node.querySelector('#document-do');
  if (d) { return; }

  const documentOptions = {
    ...Config.DOMProcessing,
    format: true,
    sanitize: true,
    normalize: true
  };

  var buttonDisabled = '';

  const buttons = [
    Config.Button.Menu.Share,
    Config.Button.Menu.Reply,
    Config.Button.Menu.Notifications,
    Config.Button.Menu.New,
    Config.Button.Menu.EditEnable,
    Config.Button.Menu.Open,
    Config.Button.Menu.Save,
    Config.Button.Menu.SaveAs,
    Config.Button.Menu.Version,
    Config.Button.Menu.Immutable,
    Config.Button.Menu.Memento,
    Config.Button.Menu.RobustifyLinks,
    Config.Button.Menu.InternetArchive,
    Config.Button.Menu.GenerateFeed,
    Config.Button.Menu.Export,
    Config.Button.Menu.Source,
    Config.Button.Menu.EmbedData,
    Config.Button.Menu.Print,
    Config.Button.Menu.Delete,
    Config.Button.Menu.MessageLog,
    Config.Button.Menu.DocumentInfo
  ]

  var s = `
    <section aria-labelledby="document-do-label" id="document-do" rel="schema:hasPart" resource="#document-do">
      <h2 id="document-do-label" property="schema:name">Do</h2>
      <ul>${buttons.map(b => `<li>${b}</li>`).join('')}</ul>
    </section>`;

  node.insertAdjacentHTML('beforeend', s);

  var dd = document.getElementById('document-do');

  dd.addEventListener('click', e => {
    if (e.target.closest('.resource-share')) {
      shareResource(e);
    }

    if (e.target.closest('.resource-reply')) {
      replyToResource(e);
    }

    var b;

    b = e.target.closest('button.editor-disable');

    if (b) {
      var node = b.closest('li');
      b.outerHTML = Config.Button.Menu.EditEnable;
      hideDocumentMenu();
      Config.Editor.toggleEditor('social');
      // hideAutoSaveStorage(node.querySelector('#autosave-items'), documentURL);

      disableAutoSave(Config.DocumentURL, {'method': 'localStorage', saveSnapshot: true });
    }
    else {
      b = e.target.closest('button.editor-enable');
      if (b) {
        node = b.closest('li');
        b.outerHTML = Config.Button.Menu.EditDisable;
        DO.U.hideDocumentMenu();
        Config.Editor.toggleEditor('author');
        // showAutoSaveStorage(node, documentURL);

        enableAutoSave(Config.DocumentURL, {'method': 'localStorage'});
      }
    }

    if (e.target.closest('.resource-notifications')) {
      DO.U.showNotifications(e);
    }

    if (e.target.closest('.resource-new')) {
      DO.U.createNewDocument(e);
    }

    if (e.target.closest('.resource-open')) {
      openDocument(e);
    }

    if (e.target.closest('.resource-source')) {
      viewSource(e);
    }

    if (e.target.closest('.embed-data-meta')) {
      DO.U.showEmbedData(e);
    }

    if (e.target.closest('.resource-save')){
      DO.U.resourceSave(e);
    }

    if (e.target.closest('.resource-save-as')) {
      saveAsDocument(e);
    }

    if (e.target.closest('.resource-memento')) {
      DO.U.mementoDocument(e);
    }

    if (e.target.closest('.create-version') ||
        e.target.closest('.create-immutable')) {
      DO.U.resourceSave(e);
    }

    if (e.target.closest('.export-as-html')) {
      var options = {
        subjectURI: Config.DocumentURL,
        mediaType: 'text/html',
        filenameExtension: '.html'
      }
      DO.U.exportAsDocument(getDocument(null, documentOptions), options);
    }

    if (e.target.closest('.robustify-links')){
      DO.U.showRobustLinks(e);
    }

    if (e.target.closest('.snapshot-internet-archive')){
      // DO.U.snapshotAtEndpoint(e, Config.DocumentURL, 'https://pragma.archivelab.org/', '', {'contentType': 'application/json'});
      DO.U.snapshotAtEndpoint(e, Config.DocumentURL, 'https://web.archive.org/save/', '', {'Accept': '*/*', 'showActionMessage': true });
    }

    if (e.target.closest('.generate-feed')) {
      DO.U.generateFeed(e);
    }

    if (e.target.closest('.resource-print')) {
      window.print();
      return false;
    }

    if (e.target.closest('.resource-delete')){
      DO.U.resourceDelete(e, Config.DocumentURL);
    }

    if (e.target.closest('.message-log')) {
      DO.U.showMessageLog(e);
    }

    if (e.target.closest('.document-info')) {
      DO.U.showDocumentInfo(e);
    }
  });
}

function showViews(node) {
  if(document.querySelector('#document-views')) { return; }

  var stylesheets = document.querySelectorAll('head link[rel~="stylesheet"][title]:not([href$="dokieli.css"])');

  var s = `
    <section aria-labelledby="document-views-label" id="document-views" rel="schema:hasPart" resource="#document-views">
      <h2 data-i18n="menu.document-views.h2" id="document-views-label" property="schema:name">${i18n.t('menu.document-views.h2.textContent')}</h2>
      ${Icon[".fas.fa-magic"]}
      <ul>`;

  if (Config.GraphViewerAvailable) {
    s += `<li><button class="resource-visualise" data-i18n="menu.document-views.graph.button" title="${i18n.t('menu.document-views.graph.button.title')}">${i18n.t('menu.document-views.graph.button.textContent')}</button></li>`;
  }

  s += `<li><button data-i18n="menu.document-views.native-style.button"  title="${i18n.t('menu.document-views.native-style.button.title')}">${i18n.t('menu.document-views.native-style.button.textContent')}</button></li>`;

  if (stylesheets.length) {
    for (var i = 0; i < stylesheets.length; i++) {
      var stylesheet = stylesheets[i];
      var view = stylesheet.getAttribute('title');
      if(stylesheet.closest('[rel~="alternate"]')) {
        s += `<li><button data-i18n="menu.document-views.change-style.button" title="${i18n.t('menu.document-views.change-style.button.title', { view })}">${view}</button></li>`;
      }
      else {
        s += `<li><button data-i18n="menu.document-views.current-style.button" disabled="disabled" title="${i18n.t('menu.document-views.current-style.button.title')}">${view}</button></li>`;
      }
    }
  }

  s += '</ul></section>';
  node.insertAdjacentHTML('beforeend', domSanitize(s));

  var viewButtons = document.querySelectorAll('#document-views button:not([class~="resource-visualise"])');
  for (let i = 0; i < viewButtons.length; i++) {
    viewButtons[i].removeEventListener('click', DO.U.initCurrentStylesheet);
    viewButtons[i].addEventListener('click', DO.U.initCurrentStylesheet);
  }

  if(Config.GraphViewerAvailable) {
    document.querySelector('#document-views').addEventListener('click', (e) => {
      if (e.target.closest('.resource-visualise')) {
        if(document.querySelector('#graph-view')) { return; }

        if (e) {
          e.target.disabled = true;
        }

        var buttonClose = getButtonHTML({ key: 'dialog.graph-view.close.button', button: 'close', buttonClass: 'close', iconSize: 'fa-2x' });

        document.body.appendChild(fragmentFromString(`
          <aside aria-labelledby="graph-view-label" class="do on" dir="${Config.User.UI.LanguageDir}" id="graph-view" lang="${Config.User.UI.Language}" rel="schema:hasPart" resource="#graph-view" xml:lang="${Config.User.UI.Language}">
            <h2 data-i18n="dialog.graph-view.h2" id="graph-view-label" property="schema:name">${i18n.t('dialog.graph-view.h2.textContent')} ${Config.Button.Info.GraphView}</h2>
            ${buttonClose}
            <div class="info"></div>
          </aside>
        `));

        var graphView = document.getElementById('graph-view');
        graphView.addEventListener('click', (e) => {
          if (e.target.closest('button.close')) {
            var rv = document.querySelector('#document-views .resource-visualise');
            if (rv) {
              rv.disabled = false;
            }
          }
        });

        showVisualisationGraph(Config.DocumentURL, undefined, '#graph-view');
      }
    });
  }
}


function showAboutDokieli(node) {
  if (document.querySelector('#about-dokieli')) { return; }

  const html = `
  <section id="about-dokieli">
    <dl>
      <dt data-i18n="menu.about-dokieli.dt">${i18n.t('menu.about-dokieli.dt.textContent')}</dt>
      <dd data-i18n="menu.about-dokieli.dd"><img alt="" height="16" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAMAAAD04JH5AAAAn1BMVEUAAAAAjwAAkAAAjwAAjwAAjwAAjwAAjwAAkAAAdwAAjwAAjQAAcAAAjwAAjwAAiQAAjwAAjAAAjwAAjwAAjwAAjwAAkAAAjwAAjwAAjwAAjQAAjQAAhQAAhQAAkAAAkAAAkAAAjgAAjwAAiQAAhAAAkAAAjwAAjwAAkAAAjwAAjgAAjgAAjQAAjwAAjQAAjwAAkAAAjwAAjQAAiwAAkABp3EJyAAAANHRSTlMA+fH89enaabMF4iADxJ4SiSa+uXztyoNvQDcsDgvl3pRiXBcH1M+ppJlWUUpFMq6OdjwbMc1+ZgAABAhJREFUeNrt29nSmkAQBeAGZBMUxH3f993/vP+zJZVKVZKCRhibyc3/XVt6SimYPjPSt28Vmt5W/fu2T/9B9HIf7Tp+0RsgDC6DY6OLvzxJj8341DnsakgZUNUmo2XsORYYS6rOeugukhnyragiq56JIs5UEQ/FXKgidRTzompEKOhG1biioDFV44mCAqrGAQWtqRptA8VMqCpR6zpo9iy84VO1opWHPBZVb9QAzyQN/D1YNungJ+DMSYsbOFvSIwGjR3p0wGiQHkMw2qRHC4w76RGBcSA9NmAcSY8QjAdpYiFbTJoYyNYnTWrI1iFNusj2JE1sZBuQJtyE5pImc3Y21cRhZ1NNtsh2Ik127HCsSY8djjVpINuVhPnjVefobee2adXqu2S/6FyivABDEjQ9Lxo1pDlNd5wg24ikRK5ngKGhHhg1DSgZk4RrD6pa9LlRAnUBfWp6xCe+6EOvOT6yrmrigZaCZHPAp6b0gaiBFKvRd0/D1rr1OrvxDqiyoZmmPt9onib0t/VybyEXqdu0Cw16rUNVAfZFlzdjr5KOaoAUK6JsrgWGQapuBlIS4gy70gEmTrk1fuAgU40UxWXv6wvZAC2Dqfx0BfBK1z1H0aJ0WH7Ub4oG8JDlpBCgK1l5tSjHQSoAf0HVfMqxF+yqpzVk2ZGuAGdk8ijPHZlmpOCg0vh5cgE2JtN3qQSoU3lXpbKlLRegrzTpt+U2TNpKY2YiFiA0kS1Q6QccweZ/oinASm2B3RML0AGDNAU4qq3udmIXYVttD3YrFsBR24N1xG5EJpTeaiYWwILS5WRKBfChFsCSehpOwKi/yS0V4AsMWym3TWUFgMqIsRYL8AVOSDlaYgEitbZnDKll+UatchyJBSC1c3lDuQA2VHYAL3KneHpgLCjHSS7AHYyEciwh1g88wDB94rlyAVxwhsR7ygW4gRMTry8XwDdUDkXFgjVdD5wRsRaCAWJwPGI1Baval8Ie3Hqn8AjjhHbZr2DzrInumDTBGlCG8xy8QPY3MNLX4TiRP1q+BWs2pn9ECwu5+qTABc+80h++28UbTkjlTW3wrM6Ufrtu8d5J9Svg1Vch/RTcUYQdUHm+g1z1x2gSGyjGGVN5F7xjoTCjE0ndC3jJMzfCftmiciZ1lNGe3vCGufOWVMLIQHHehi3X1O8JJxR236SalUzninbu937BlwfV/I3k4KdGk2xm+MHuLa8Z0i9TC280qLRrF+8cw9RSjrOg8oIG8j2YgULsbGPomsgR0x9nsOzkOLh+kZr1owZGbfC2JJl78fIV0Wei/gxZDl85XWVtt++cxhuSEQ6bdfzLjlvM86PbaD4vQUjSglV8385My7CdXtO9+ZSyrLcf7nBN376V8gMpRztyq6RXYQAAAABJRU5ErkJggg==" width="16" /><span data-i18n="menu.about-dokieli.dd.span">${i18n.t("menu.about-dokieli.dd.span.innerHTML")}</span>
    </dl>
  </section>`;

  node.insertAdjacentHTML('beforeend', html);
}

