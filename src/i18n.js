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
//TODO: Load locales/*/*.json
import en from '../locales/en/translations.json';
import es from '../locales/es/translations.json';

const fallbackLng = {
  'de-CH': ['fr', 'it'], //French and Italian are also spoken in Switzerland
  'zh-Hant': ['zh-Hans', 'en'],
  'es-UY': ['es'],
  'es-ES': ['es'],
  'default': ['en']
}

const options = {
  // ns: ['translations'],
  // defaultNS: 'translations',
  // fallbackNS: 'translations',
  // debug: true,
  fallbackLng,
  resources: {
    en: {
      translation: {
        ...en
      }
    },
    es: {
      translation: {
        ...es
      }
    }
  }
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
}
