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
import * as storage from '../../src/storage.js';
import Config from '../../src/config.js';

test('disableAutoSave clears the interval and records autoSave off', async () => {
  global.clearInterval = vi.fn();
  const updateItem = vi.spyOn(storage, 'updateDeviceStorageItem').mockResolvedValue(undefined);

  Config.AutoSave.Items['key'] = {
    IndexedDB: { id: 123 },
    http: { id: 456 },
  };

  await disableAutoSave('key', { method: 'IndexedDB' });
  expect(global.clearInterval).toHaveBeenCalledWith(123);

  await disableAutoSave('key', { method: ['http'] });
  expect(global.clearInterval).toHaveBeenCalledWith(456);

  expect(updateItem).toHaveBeenCalledWith('key', { autoSave: false });
});

test('disableAutoSave ignores keys and methods it never enabled', async () => {
  global.clearInterval = vi.fn();
  vi.spyOn(storage, 'updateDeviceStorageItem').mockResolvedValue(undefined);

  await disableAutoSave('never-enabled', { method: 'IndexedDB' });

  Config.AutoSave.Items['partial'] = { IndexedDB: { id: 1 } };
  await disableAutoSave('partial', { method: 'http' });

  expect(global.clearInterval).not.toHaveBeenCalled();
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