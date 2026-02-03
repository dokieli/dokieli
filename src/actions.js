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

import Config from './config.js';
import { getAgentPreferredLanguages } from './graph.js';
import { i18n } from './i18n.js';
import { generateFilename } from './util.js';
import { fragmentFromString, getDocumentContentNode } from "./utils/html.js";
import { initButtons } from './ui/buttons.js';
import { domSanitize } from './utils/sanitization.js';

const ns = Config.ns;

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

export function showGeneralMessages() {
  showResourceAudienceAgentOccupations();
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

export function initializeButtonMore(node) {
  var info = node.querySelector('div.info');
  var progressOld = info.querySelector('.progress');
  var progressNew = fragmentFromString(`<div class="progress" data-i18n="panel.notifications.progress.more">${Config.Button.Notifications.More} ${i18n.t('panel.notifications.progress.more.textContent')}</div>`);

  if (progressOld) {
    info.replaceChild(progressNew, progressOld)
  }
  else {
    info.appendChild(progressNew);
  }

  node = document.getElementById('document-notifications');

  var buttonMore = node.querySelector('div.info button.more');
  buttonMore.addEventListener('click', () => {
    if (!Config.User.IRI) {
      showUserIdentityInput();
    }
    else {
      showContactsActivities();
    }
  });
}

export function showResourceAudienceAgentOccupations() {
  if (Config.User.Occupations && Config.User.Occupations.length > 0) {
    var matches = [];

    Config.Resource[Config.DocumentURL].audience.forEach(audience => {
      if (Config.User.Occupations.includes(audience)) {
        matches.push(getResourceGraph(audience).then(g => {
          Config.Resource[audience] = { graph: g };
          return g ? g.node(rdf.namedNode(audience)) : g;
        }));
      }
    })

    Promise.allSettled(matches)
      .then(results => {
        var ul = [];

        results.forEach(result => {
          var g = result.value;

          if (g) {
            var iri = g.term.value;

            //TODO: Update getGraphConceptLabel to have an optional parameter that takes language tag, e.g., 'en'.
            var skosLabels = getGraphConceptLabel(g);

            var label = iri;
            if (skosLabels.length) {
              label = skosLabels[0];
              Config.Resource[iri]['labels'] = skosLabels;
            }
            // console.log(label)
            ul.push(`<li><a href="${iri}" rel="noopener" target="_blank">${label}</a></li>`);
          }
        });

        if (ul.length > 0) {
          ul = `<ul>${ul.join('')}</ul>`;

          var message = `<span data-i18n="dialog.document-action-message.audience-occupation.span">${i18n.t("dialog.document-action-message.audience-occupation.span.textContent")}</span>${ul}`;
          message = {
            'content': message,
            'type': 'info',
            'timer': 5000
          }

          addMessageToLog(message, Config.MessageLog);
          showActionMessage(document.body, message);
        }
      });
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

//XXX: Not applied because of ProseMirror schema issue when `select` ever becomes a child of something like `p`
// export function processChooseActionsfunction() {
//   var licenseOptions = document.querySelectorAll('[about="#feature-license-options"][typeof="schema:ChooseAction"], [href="#feature-license-options"][typeof="schema:ChooseAction"], [resource="#feature-license-options"][typeof="schema:ChooseAction"]');
//   for (var i = 0; i < licenseOptions.length; i++){
//     licenseOptions[i].parentNode.replaceChild(fragmentFromString('<label class="do" for="feature-license-options">License</label> <select class="do" id="feature-license-options">' + getLicenseOptionsHTML() + '</select>'), licenseOptions[i]);
//   }
// 
//   var languageOptions = document.querySelectorAll('[about="#feature-language-options"][typeof="schema:ChooseAction"], [href="#feature-language-options"][typeof="schema:ChooseAction"], [resource="#feature-language-options"][typeof="schema:ChooseAction"]');
//   for (var i = 0; i < languageOptions.length; i++){
//     languageOptions[i].parentNode.replaceChild(fragmentFromString('<label class="do" for="feature-language-options">Languages</label> <select class="do" id="feature-language-options">' + getLanguageOptionsHTML() + '</select>'), languageOptions[i]);
//   }
// }