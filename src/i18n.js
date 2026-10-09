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

import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { domSanitize } from './utils/sanitization.js';
import { lazyImport } from './utils/lazy.js';
import Config from './config.js';
import enGB from '../locales/en-GB/translations.json';

let resources = {};
let languages;
let backend;

// webpack (needed until we migrate to vite)
// en-GB is the fallback and ships with dokieli; other languages load when first needed
if (typeof __webpack_require__ !== 'undefined') {
  const context = process.env.SINGLE_FILE
    ? import.meta.webpackContext('../locales', { recursive: true, regExp: /^\.\/(?!en-GB\/)[^/]+\/translations\.json$/, mode: 'eager' })
    : import.meta.webpackContext('../locales', { recursive: true, regExp: /^\.\/(?!en-GB\/)[^/]+\/translations\.json$/, mode: 'lazy', chunkName: 'locale-[request]' });

  // "./es/translations.json"
  const files = Object.fromEntries(context.keys().map(key => [key.split('/')[1], key]));

  resources['en-GB'] = { translation: enGB };
  languages = ['en-GB', ...Object.keys(files)];

  backend = {
    type: 'backend',
    read(language, namespace, callback) {
      if (!files[language]) return callback(null, {});

      lazyImport(() => context(files[language]))
        .then(module => callback(null, module.default || module), error => callback(error, false));
    }
  };
}

// vite (for tests only now, will only use this in future when we migrate from webpack)
else {
  const modules = import.meta.glob(
    '../locales/**/translations.json',
    { eager: true }
  );

  for (const path in modules) {
    // "../locales/en/translations.json"
    const match = path.match(/\/locales\/([^/]+)\/translations\.json$/);
    if (!match) continue;

    const lng = match[1];

    resources[lng] = {
      translation: modules[path],
    };
  }

  languages = Object.keys(resources);
}

Config.Translations = languages;
Config['Translations'] = languages;

Config['DocsTranslations'] = ['en', 'es'];

// console.log(resources)

const fallbackLng = {
  'default': ['en-GB'],
  'en': ['en-GB'],
  'de-CH': ['fr', 'it'/*, 'rm'*/],
}

const options = {
  // ns: ['translations'],
  // defaultNS: 'translations',
  // fallbackNS: 'translations',
  // debug: true,
  fallbackLng,
  resources,
  partialBundledLanguages: !!backend,
}

export function i18nextInit() {
  if (backend) {
    i18next.use(backend);
  }

  return i18next
    .use(LanguageDetector)
    // i18n.tDoc uses the document language, which can differ from the interface language
    .init({ ...options, preload: [document.documentElement.lang].filter(Boolean) })
}

const i18n = {
  ...i18next,
  language: () => i18next.language,
  t: function (key, vars = {}) {
    if (key.endsWith('.innerHTML')) {
      return domSanitize(i18next.t(key, vars));
    }

    return i18next.t(key, vars);
  },
  code: function () {
    const lang = i18n.language();

    if (fallbackLng[lang]) {
      return fallbackLng[lang][0]; // default to first fallback
    }

    const segments = lang.split("-");
  
    for (let i = segments.length - 1; i >= 0; i--) {
      if (Config.Translations.includes(segments[i].toLowerCase())) {
        return segments[i].toLowerCase();
      }
    }

    return fallbackLng.default[0] // default to first fallback;
  },
  dir: function() {
    return Config.Languages[i18n.code()].dir;
  }
}

i18n['tDoc'] = function (key, vars = {}) {
  const langOverride = document.documentElement.lang ? { lng: document.documentElement.lang } : {};

  vars = {
    ...vars,
    ...langOverride,
  }

  return i18n.t(key, vars);
}

export { fallbackLng, i18n };
