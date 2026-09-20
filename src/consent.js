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
import { getDeviceStorageItem, setDeviceStorageItem } from './storage.js';
import { fragmentFromString } from './utils/html.js';
import { htmlEncode } from './utils/sanitization.js';
import { getButtonHTML } from './ui/buttons.js';
import { getDateTimeISO } from './util.js';
import { i18n } from './i18n.js';

const STORAGE_KEY = 'DO.Config.OriginConsent';

// Built-in features' web services; the Settings list shows all of these.
// A service's origins share one consent decision.
export const KNOWN_SERVICES = [
  { name: 'DOI', i18nKey: 'doi', origins: ['https://doi.org'] },
  { name: 'Internet Archive', i18nKey: 'internet-archive', origins: ['https://web.archive.org'] },
  { name: 'Open Library', i18nKey: 'openlibrary', origins: ['https://openlibrary.org'] },
  { name: 'OpenStreetMap', i18nKey: 'openstreetmap', origins: ['https://nominatim.openstreetmap.org'] },
  { name: 'ORCID', i18nKey: 'orcid', origins: ['https://pub.orcid.org'] },
  { name: 'Specref', i18nKey: 'specref', origins: ['https://api.specref.org'] },
  { name: 'Wikidata', i18nKey: 'wikidata', origins: ['https://www.wikidata.org', 'https://query.wikidata.org'] }
];

export function serviceForOrigin(origin) {
  return KNOWN_SERVICES.find(service => service.origins.includes(origin));
}

// Prompts show one at a time; concurrent requests for one origin share a promise
const pendingPrompts = {};
let promptChain = Promise.resolve();

export async function initOriginConsent() {
  Config.OriginConsent = Config.OriginConsent || {};

  try {
    const stored = await getDeviceStorageItem(STORAGE_KEY);
    if (stored && typeof stored === 'object') {
      Config.OriginConsent = stored;
    }
  } catch {}
}

function originOf(url) {
  try { return new URL(url, Config.DocumentURL).origin; } catch { return null; }
}

// Providers the user configured are contacted per the user's own settings
function userConfiguredOrigins() {
  const urls = [
    Config.DocumentURL,
    Config.User?.IRI,
    ...(Config.User?.Storage || []),
    ...(Config.User?.Outbox || []),
    Config.User?.GitForge?.host ? `https://${Config.User.GitForge.host}/` : null
  ];

  return urls.filter(Boolean).map(originOf).filter(Boolean);
}

// 'allow' | 'deny' | undefined (no decision yet)
export function getOriginDecision(url) {
  const origin = originOf(url);
  if (!origin) return 'allow';
  if (origin === originOf(Config.DocumentURL)) return 'allow';
  if (userConfiguredOrigins().includes(origin)) return 'allow';

  return Config.OriginConsent?.[origin]?.decision;
}

export function setOriginConsent(origin, decision) {
  Config.OriginConsent = Config.OriginConsent || {};

  if (decision) {
    Config.OriginConsent[origin] = { 'decision': decision, 'updated': getDateTimeISO() };
  }
  else {
    delete Config.OriginConsent[origin];
  }

  setDeviceStorageItem(STORAGE_KEY, Config.OriginConsent).catch(() => {});

  document.dispatchEvent(new CustomEvent('dokieli:origin-consent-changed', { detail: { origin, decision } }));
}

// Resolves true when the origin may be contacted; prompts on first contact
export function requestOriginConsent(url, options = {}) {
  const decision = getOriginDecision(url);
  if (decision === 'allow') return Promise.resolve(true);
  if (decision === 'deny') return Promise.resolve(false);

  const origin = originOf(url);
  if (!origin) return Promise.resolve(true);

  if (pendingPrompts[origin]) return pendingPrompts[origin];

  const request = promptChain.then(() => showOriginConsentPrompt(origin, options));
  promptChain = request.catch(() => {});
  pendingPrompts[origin] = request.finally(() => { delete pendingPrompts[origin]; });

  return pendingPrompts[origin];
}

function showOriginConsentPrompt(origin, options = {}) {
  // A stored decision may have arrived while this prompt waited its turn
  const decision = Config.OriginConsent?.[origin]?.decision;
  if (decision) return decision === 'allow';

  return new Promise((resolve) => {
    const buttonClose = getButtonHTML({ key: 'dialog.origin-consent.close.button', button: 'close', buttonClass: 'close', iconSize: 'fa-2x' });

    // Reason states the feature's purpose and what is sent, e.g. reason.lookup, reason.search
    const reasonText = options.reason ? ' ' + i18n.t(`dialog.origin-consent.reason.${options.reason}.textContent`) : '.';

    document.body.appendChild(fragmentFromString(`
      <aside aria-labelledby="origin-consent-prompt-label" class="do on" dir="${Config.User.UI.LanguageDir}" id="origin-consent-prompt" lang="${Config.User.UI.Language}" xml:lang="${Config.User.UI.Language}">
        <h2 data-i18n="dialog.origin-consent.h2" id="origin-consent-prompt-label">${i18n.t('dialog.origin-consent.h2.textContent')}</h2>
        ${buttonClose}
        <div class="info"></div>
        <p>${i18n.t('dialog.origin-consent.request.p.textContent')} <a href="${htmlEncode(origin)}/" rel="noopener" target="_blank">${htmlEncode(origin)}</a>${reasonText} ${i18n.t('dialog.origin-consent.change-later.p.textContent')}</p>
        <p>
          <button class="origin-consent-allow" type="button" data-i18n="dialog.origin-consent.allow.button">${i18n.t('dialog.origin-consent.allow.button.textContent')}</button>
          <button class="origin-consent-deny" type="button" data-i18n="dialog.origin-consent.deny.button">${i18n.t('dialog.origin-consent.deny.button.textContent')}</button>
        </p>
      </aside>`));

    const aside = document.getElementById('origin-consent-prompt');

    aside.addEventListener('click', (e) => {
      const allow = e.target.closest('button.origin-consent-allow');
      const deny = e.target.closest('button.origin-consent-deny');
      const close = e.target.closest('button.close');
      if (!allow && !deny && !close) return;

      if (allow || deny) {
        // One decision covers all of a known service's origins
        const origins = serviceForOrigin(origin)?.origins || [origin];
        origins.forEach(o => setOriginConsent(o, allow ? 'allow' : 'deny'));
      }

      aside.remove();
      // Closing without choosing declines this time and asks again next time
      resolve(!!allow);
    });
  });
}
