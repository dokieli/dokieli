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

import rdf from 'rdf-ext';
import Config from './config.js';
import { getAgentPreferredLanguages, getGraphConceptLabel, getListValues, getResourceGraph } from './graph.js';
import { fallbackLng, i18n } from './i18n.js';
import { generateFilename } from './util.js';
import { fragmentFromString, getDocumentContentNode } from "./utils/html.js";
import { getButtonHTML, initButtons } from './ui/buttons.js';
import { domSanitize, sanitizeInsertAdjacentHTML } from './utils/sanitization.js';
import { getDeviceStorageItem, setDeviceStorageItem, updateDeviceStorageItem, updateDeviceStorageProfile } from './storage.js';
import { getResourceHead, getResourceOptions, patchResourceWithAcceptPatch } from './fetcher.js';
import { stripFragmentFromString } from './uri.js';
import { addMessageToLog, showActionMessage } from './doc.js';

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
  a.download = options.filename || generateFilename(url, options);

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


export function showResourceAudienceAgentOccupations() {
  if (Config.User.Occupations?.length) {
    var matches = [];

    Config.Resource[Config.DocumentURL].audience.forEach(audience => {
      if (Config.User.Occupations.includes(audience)) {
        matches.push(
          getResourceGraph(audience)
            .then(({ graph: g }) => {
              Config.Resource[audience] = { graph: g };
              return g ? g.node(rdf.namedNode(audience)) : g;
            })
            // .catch((error) => {
            //   console.log(error)
            // })
            );
      }
    })

    //FIXME: Showing the audience essentially only works if we can fetch the audience concept resource
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

export async function setPreferredLanguagesInfo(g) {
  //XXX: Naming this key like this for now until preferred language from user's profile is sorted.
  const uiLanguage = await getDeviceStorageItem('DO.Config.UI.Language');

  if (uiLanguage) {
    const lang = domSanitize(uiLanguage);
    updateUILanguage(lang);
    return;
  }

  let preferredLanguages = navigator.languages;

  if (Array.isArray(g)) {
    preferredLanguages = g;
  }
  else if (g && typeof g === 'object') {
    preferredLanguages = getAgentPreferredLanguages(g) || [];
  }

  let matchedLang;

  outer: for (const lang of preferredLanguages) {
    const segments = lang.split("-");

    for (let len = segments.length; len > 0; len--) {
      const candidate = segments.slice(0, len).join("-");

      if (Config.Translations.includes(candidate)) {
        matchedLang = candidate;
        break outer;
      }

      if (candidate in fallbackLng) {
        matchedLang = fallbackLng[candidate][0];
        break outer;
      }
    }
  }

  updateUILanguage(matchedLang ?? fallbackLng.default[0]);
}

const PREFERRED_LANGUAGE_PROMPT_KEY = 'DO.Config.UI.PreferredLanguagePrompt';

function isValidLanguageTag(lang) {
  return typeof lang === 'string' && /^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/.test(lang);
}

// Writes solid:preferredLanguages to the WebID profile as an RDF Collection
// (order is significant; the first supported language wins), moving `lang` to
// the front. Seeded from knowsLanguage et al. when no list exists yet.
export async function savePreferredLanguage(lang) {
  const webid = Config.User.IRI;

  if (!webid || !Config.User.Graph || !isValidLanguageTag(lang)) return;

  try {
    await patchPreferredLanguages(lang, Config.User.Graph);
  } catch (e) {
    // 409 means the where condition didn't match: the profile changed since it
    // was loaded (another device or app). Re-fetch and retry once.
    if (e?.status !== 409) throw e;

    const { graph } = await getResourceGraph(stripFragmentFromString(webid));
    if (!graph) throw e;

    Config.User.Graph = graph.node(rdf.namedNode(webid));
    await patchPreferredLanguages(lang, Config.User.Graph);
  }
}

async function patchPreferredLanguages(lang, g) {
  const webid = Config.User.IRI;
  const current = (getAgentPreferredLanguages(g) || []).filter(isValidLanguageTag);
  const languages = [lang, ...current.filter(l => l !== lang)];

  const profileDoc = stripFragmentFromString(webid);
  const rdfFirst = '<http://www.w3.org/1999/02/22-rdf-syntax-ns#first>';
  const rdfRest = '<http://www.w3.org/1999/02/22-rdf-syntax-ns#rest>';
  const rdfNil = '<http://www.w3.org/1999/02/22-rdf-syntax-ns#nil>';

  const patch = {};
  const head = g.out(Config.ns.solid.preferredLanguages);
  const listValues = getListValues(head);

  if (listValues) {
    const triples = [`<${webid}> solid:preferredLanguages ?l0 .`];
    listValues.forEach((value, i) => {
      const rest = (i === listValues.length - 1) ? rdfNil : `?l${i + 1}`;
      triples.push(`?l${i} ${rdfFirst} ?v${i} .`);
      triples.push(`?l${i} ${rdfRest} ${rest} .`);
    });
    patch.delete = triples.join('\n');
  }
  else if (head.terms.length) {
    const triples = head.terms
      .filter(t => t.termType === 'Literal' && isValidLanguageTag(t.value))
      .map(t => `<${webid}> solid:preferredLanguages "${t.value}" .`);
    if (triples.length) {
      patch.delete = triples.join('\n');
    }
  }

  if (patch.delete) {
    patch.where = patch.delete;
  }

  // Flavor matters for the list cells. N3 Patch forbids blank nodes in insert
  // formulae (Solid Protocol §5.3.1), which forces named cells; but rdflib's
  // serializer (used by NSS and CSS's pivot distribution when applying N3
  // patches) rejects lists with named cells. SPARQL Update allows blank nodes
  // in inserts and bypasses rdflib on those servers, so prefer it when offered.
  let contentType;
  try {
    // Some servers (e.g. solidcommunity.net) omit Accept-Patch on OPTIONS
    // responses but include it on HEAD.
    let acceptPatch = (await getResourceHead(profileDoc)).headers.get('Accept-Patch');
    acceptPatch = acceptPatch || (await getResourceOptions(profileDoc, { header: 'Accept-Patch' })).headers;
    if (acceptPatch?.includes('application/sparql-update')) {
      contentType = 'application/sparql-update';
    }
  } catch {
    // Fall through to Accept-Patch preference in patchResourceWithAcceptPatch.
  }

  const cell = contentType
    ? (i) => `_:preferredLanguages${i}`
    : (i) => `<${profileDoc}#preferred-languages-${i}>`;
  const insertTriples = [`<${webid}> solid:preferredLanguages ${cell(0)} .`];
  languages.forEach((l, i) => {
    const rest = (i === languages.length - 1) ? rdfNil : cell(i + 1);
    insertTriples.push(`${cell(i)} ${rdfFirst} "${l}" .`);
    insertTriples.push(`${cell(i)} ${rdfRest} ${rest} .`);
  });
  patch.insert = insertTriples.join('\n');

  const options = contentType ? { headers: { 'Content-Type': contentType } } : {};
  await patchResourceWithAcceptPatch(profileDoc, [patch], options);

  // Mirror the change in the in-memory graph so a later save in this session
  // generates a delete patch that matches what is now on the server.
  try {
    if (listValues) {
      g.deleteList(Config.ns.solid.preferredLanguages);
    }
    g.deleteOut(Config.ns.solid.preferredLanguages);
    g.addList(Config.ns.solid.preferredLanguages, languages.map(l => rdf.literal(l)));
  } catch (e) {
    console.log('Could not update in-memory profile graph:', e);
  }

  Config.User.PreferredLanguages = languages;
  updateDeviceStorageProfile(Config.User);
}

// Returns true on success so callers can decide what to do with related UI.
async function savePreferredLanguageWithMessage(lang) {
  try {
    await savePreferredLanguage(lang);
    const message = { content: i18n.t('message.preferred-language.success.textContent'), type: 'success', timer: 3000 };
    addMessageToLog(message, Config.MessageLog);
    showActionMessage(document.body, message);
    return true;
  } catch (e) {
    const body = await e?.response?.text?.().catch(() => null);
    console.error('Could not save preferred language:', e, body || '');
    const message = { content: i18n.t('message.preferred-language.error.textContent'), type: 'error', timer: null };
    addMessageToLog(message, Config.MessageLog);
    showActionMessage(document.body, message);
    return false;
  }
}

export async function maybeAskPreferredLanguage(lang) {
  if (!Config.User.IRI || !Config.User.Graph || !isValidLanguageTag(lang)) return;

  const current = getAgentPreferredLanguages(Config.User.Graph) || [];
  if (current[0] === lang) {
    document.getElementById('update-preferred-language')?.closest('ul')?.remove();
    return;
  }

  const prompt = await getDeviceStorageItem(PREFERRED_LANGUAGE_PROMPT_KEY);
  if (prompt?.ask === false) {
    showUpdatePreferredLanguageButton(lang);
    return;
  }

  showPreferredLanguagePrompt(lang);
}

// Shown below the language dropdown once the user opted out of the prompt;
// retargeted to the most recently picked language on every switch.
function showUpdatePreferredLanguageButton(lang) {
  const section = document.getElementById('ui-language');
  if (!section) return;

  let button = document.getElementById('update-preferred-language');

  if (!button) {
    sanitizeInsertAdjacentHTML(section, 'beforeend', `<ul><li><button id="update-preferred-language" type="button" data-i18n="menu.update-preferred-language.button" title="${i18n.t('menu.update-preferred-language.button.title')}">${i18n.t('menu.update-preferred-language.button.textContent')}</button></li></ul>`);
    button = document.getElementById('update-preferred-language');

    button.addEventListener('click', async () => {
      button.disabled = true;
      const saved = await savePreferredLanguageWithMessage(button.dataset.language);
      if (saved) {
        button.closest('ul')?.remove();
      } else {
        button.disabled = false;
      }
    });
  }

  button.dataset.language = lang;
}

function showPreferredLanguagePrompt(lang) {
  if (document.getElementById('preferred-language-prompt')) return;

  const language = Config.Languages[lang]?.name || lang;
  const buttonClose = getButtonHTML({ key: 'dialog.preferred-language.close.button', button: 'close', buttonClass: 'close', iconSize: 'fa-2x' });

  document.body.appendChild(fragmentFromString(`
    <aside aria-labelledby="preferred-language-prompt-label" class="do on" dir="${Config.User.UI.LanguageDir}" id="preferred-language-prompt" lang="${Config.User.UI.Language}" xml:lang="${Config.User.UI.Language}">
      <h2 data-i18n="dialog.preferred-language.h2" id="preferred-language-prompt-label">${i18n.t('dialog.preferred-language.h2.textContent')}</h2>
      ${buttonClose}
      <div class="info"></div>
      <p data-i18n="dialog.preferred-language.p" data-i18n-language="${language}">${i18n.t('dialog.preferred-language.p.textContent', { language })}</p>
      <p><input id="preferred-language-dont-ask" type="checkbox" /> <label for="preferred-language-dont-ask" data-i18n="dialog.preferred-language.dont-ask.label">${i18n.t('dialog.preferred-language.dont-ask.label.textContent')}</label></p>
      <p>
        <button class="preferred-language-confirm" type="button" data-i18n="dialog.preferred-language.confirm.button">${i18n.t('dialog.preferred-language.confirm.button.textContent')}</button>
        <button class="preferred-language-cancel" type="button" data-i18n="dialog.preferred-language.cancel.button">${i18n.t('dialog.preferred-language.cancel.button.textContent')}</button>
      </p>
    </aside>`));

  const aside = document.getElementById('preferred-language-prompt');

  aside.addEventListener('click', async (e) => {
    const confirm = e.target.closest('button.preferred-language-confirm');
    const cancel = e.target.closest('button.preferred-language-cancel');
    if (!confirm && !cancel) return;

    if (aside.querySelector('#preferred-language-dont-ask').checked) {
      await setDeviceStorageItem(PREFERRED_LANGUAGE_PROMPT_KEY, { ask: false });
    }

    aside.remove();

    if (confirm) {
      savePreferredLanguageWithMessage(lang);
    }
  });
}

export async function updateUILanguage(lang, user) {
  i18n.changeLanguage(lang, async (err) => {
    if (err) return console.error('Error loading language', err);

    //XXX: This is used for updating the DOM nodes at some point but it could be based off DO.Config.UI.Language in IndexedDB instead going forward. Revisit.
    Config.User.UI['Language'] = lang;
    Config.User.UI['LanguageDir'] = Config.Languages[lang].dir;

    //XXX: We keep this up to date. Will figure out when user's preferred language comes into place from their WebID.
    user = user || await getDeviceStorageItem('DO.Config.User');
    if (user?.object?.describes) {
      user.object.describes.UI = {
        ...user.object.describes.UI,
        Language: lang,
        LanguageDir: Config.User.UI['LanguageDir']
      };
      await updateDeviceStorageItem('DO.Config.User', user);
    }

    //XXX: We persist this so that lang selection is available on the same device / profile. Makes it convenient.
    //But it is kind of a duplicate of i18nextLng in localStorage which is managed by i18next library.
    await setDeviceStorageItem('DO.Config.UI.Language', lang);

    // re-run initButtons to update the buttons that are stored
    initButtons();

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

      // TODO: move to a standalone function - this takes the variable names from data-i18n- suffix and passes them as a vars object to the i18n fn
      const vars = {};
      Object.entries(el.dataset).forEach(([name, value]) => {
        if (name !== 'i18n') {
          vars[name.replace(/^i18n/, '').toLowerCase()] = value;
        }
      });

      // Update textContent
      const textKey = `${baseKey}.textContent`;
      const keyOptions = el.hasAttribute('datetime') ? { ...vars, val: new Date(el.getAttribute('datetime')) } : vars;

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