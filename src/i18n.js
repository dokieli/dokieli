import i18next from 'i18next';
import resourcesToBackend from 'i18next-resources-to-backend';
import LanguageDetector from 'i18next-browser-languagedetector';
import { domSanitize } from './utils/sanitization.js';

const fallbackLng = {
  'de-CH': ['fr', 'it'], //French and Italian are also spoken in Switzerland
  'zh-Hant': ['zh-Hans', 'en'],
  'es-UY': ['es'],
  'default': ['en']
}

const options = {
  ns: ['translations'],
  defaultNS: 'translations',
  fallbackNS: 'translations',
  // debug: true,
  fallbackLng,
}

export function i18nextInit() {
  return i18next
    .use(resourcesToBackend((language, namespace) => import(`../locales/${language}/${namespace}.json`)))
    .use(LanguageDetector)
    .init(options)
}

export const i18n = {
  ...i18next,
  t: function (key, vars = {}) {
    if (key.endsWith('.innerHTML')) {
      return domSanitize(i18next.t(key, vars));
    }
    return i18next.t(key, vars);
  },
}
