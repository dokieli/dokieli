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

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { i18n } from '../../src/i18n.js';
import Config from '../../src/config.js';

vi.unmock('../../src/i18n'); // unapply global mock

describe('i18n wrapper', () => {
  beforeEach(async () => {
    // reset spies/mocks
    vi.resetAllMocks();
    document.documentElement.lang = '';

    const resources = {
      en: {
        translation: {
          'some.key': 'Some text',
          'some.key.with.var': 'Value is {{val}}',
          'some.key.with.innerHTML': '<b>Bold</b>',
          'measure.speed.textContent': 'Speed',
        },
      },
      fr: {
        translation: {
          'measure.speed.textContent': 'Vitesse',
        },
      },
      es: {
        translation: {
          'some.key': 'Texto',
        },
      },
    };

    await i18n.init({
      resources,
      fallbackLng: {
        default: ['en-GB'],
        en: ['en-GB'],
        'de-CH': ['fr', 'it'],
      },
    });
  });

  it('returns correct language code from fallback', () => {
    vi.spyOn(i18n, 'language').mockReturnValue('de-CH');
    expect(i18n.code()).toBe('fr'); // fallback for de-CH
  });

  it('returns exact match if available', () => {
    vi.spyOn(i18n, 'language').mockReturnValue('es');
    expect(i18n.code()).toBe('es');
  });

  it('returns default fallback for unknown language', () => {
    vi.spyOn(i18n, 'language').mockReturnValue('xx');
    expect(i18n.code()).toBe('en-GB');
  });

  it('returns correct text direction', () => {
    vi.spyOn(i18n, 'language').mockReturnValue('es');
    expect(i18n.dir()).toBe('ltr');
  });

  it('tDoc applies language override from html', () => {
    document.documentElement.lang = 'fr';
    const result = i18n.tDoc('measure.speed.textContent');
    expect(result).toBe('Vitesse');
  });

  it('t sanitizes .innerHTML keys', () => {
    const inputKey = 'some.key.with.innerHTML';
    const sanitized = i18n.t(inputKey);
    expect(sanitized).toBe('<b>Bold</b>'); // raw translation sanitized by domSanitize
  });

  it('t returns plain translation for normal keys', () => {
    const val = i18n.t('some.key.with.var', { val: 42 });
    expect(val).toBe('Value is 42');
  });

  it('t returns fallback key if not defined', () => {
    const val = i18n.t('not.defined.key');
    expect(val).toBe('not.defined.key');
  });
});
