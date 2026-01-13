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
import Config from './config.js';

const context = import.meta.webpackContext(
  '../locales',
  {
    recursive: true,
    regExp: /translations\.json$/,
  }
);

const resources = {};

for (const key of context.keys()) {
  // key is ALWAYS like: "./en/translation.json"
  const parts = key.split('/');

  // ["." , "en", "translation.json"]
  const lng = parts[1];
  if (!lng) continue;


  resources[lng] = {
    translation: context(key),
  };
}

Config['Translations'] = Object.keys(resources);

// console.log(resources)

const fallbackLng = {
  'default': ['en'],

  'de-CH': ['fr', 'it'/*, 'rm'*/],
}

const options = {
  // ns: ['translations'],
  // defaultNS: 'translations',
  // fallbackNS: 'translations',
  // debug: true,
  fallbackLng,
  resources,
}

export function i18nextInit() {
  return i18next
    // .use(resourcesToBackend((language, namespace) => import(`../locales/${language}/${namespace}.json`)))
    .use(LanguageDetector)
    .init(options)
}

export const i18n = {
  ...i18next,
  language: () => i18next.language,
  t: function (key, vars = {}) {
    if (key.endsWith('.innerHTML')) {
      return domSanitize(i18next.t(key, vars));
    }
    return i18next.t(key, vars);
  },
  code: function () {
    const lang = i18n.language().toLowerCase();
  
    if (fallbackLng[lang]) {
      return fallbackLng[lang][0]; // default to first fallback
    }
  
    const segments = lang.split("-");
  
    for (let i = segments.length - 1; i >= 0; i--) {
      if (Config.Translations.includes(segments[i])) {
        return segments[i];
      }
    }
  
    return fallbackLng.default;
  },
  dir: function() {
    return Config.Languages[i18n.code()].dir;
  }
}
