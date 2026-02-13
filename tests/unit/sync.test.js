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

import { test, expect, vi, } from 'vitest';
import {
  disableAutoSave,
  enableAutoSave
} from '../../src/sync.js';
import Config from '../../src/config.js';

test('disableAutoSave clears intervals and deletes method', () => {
  global.clearInterval = vi.fn();

  Config.AutoSave.Items['key'] = {
    localStorage: { id: 123 },
    http: { id: 456 },
  };

  disableAutoSave('key', { method: 'localStorage' });
  expect(global.clearInterval).toHaveBeenCalledWith(123);
  expect(Config.AutoSave.Items['key'].localStorage).toBeUndefined();

  disableAutoSave('key', { method: ['http'] });
  expect(global.clearInterval).toHaveBeenCalledWith(456);
  expect(Config.AutoSave.Items['key'].http).toBeUndefined();
});


test.skip('enableAutoSave sets interval for localStorage and http methods', async () => {
  vi.useFakeTimers();

  // Config.AutoSave.Items['key-1'] = {};

  await enableAutoSave('key-1', { method: 'localStorage' });
  expect(Config.AutoSave.Items['key-1'].localStorage.digestSRI).toBeDefined();

  await enableAutoSave('key-1', { method: 'http' });
  expect(Config.AutoSave.Items['key-1'].http.id).toBeDefined();

  disableAutoSave('key-1', { method: ['localStorage', 'http'] });
  vi.useRealTimers();
});