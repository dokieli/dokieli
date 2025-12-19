import i18next from 'i18next';
import resourcesToBackend from 'i18next-resources-to-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

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
