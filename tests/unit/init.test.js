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

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { initDeviceStorage } from "../../src/init";
import Config from "../../src/config.js";
import * as storage from "../../src/storage.js";

describe('initDeviceStorage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Config.AutoSave.Items = {};
  });

  test('records the stored autoSave timestamp for the document', async () => {
    Config.DocumentURL = 'https://example.org/doc';
    vi.spyOn(storage, 'getDeviceStorageItem').mockResolvedValue({
      autoSave: true,
      updated: '2026-01-01T00:00:00Z'
    });

    initDeviceStorage();
    await vi.waitFor(() => expect(Config.AutoSave.Items[Config.DocumentURL]).toBeDefined());

    expect(Config.AutoSave.Items[Config.DocumentURL].IndexedDB.updated)
      .toBe('2026-01-01T00:00:00Z');
  });

  test('leaves AutoSave alone when the document was never auto-saved', async () => {
    Config.DocumentURL = 'https://example.org/other';
    vi.spyOn(storage, 'getDeviceStorageItem').mockResolvedValue(undefined);

    initDeviceStorage();
    await Promise.resolve();

    expect(Config.AutoSave.Items[Config.DocumentURL]).toBeUndefined();
  });

  test('skips blob: documents without touching storage', () => {
    Config.DocumentURL = 'blob:https://example.org/1234';
    const getItem = vi.spyOn(storage, 'getDeviceStorageItem');

    initDeviceStorage();

    expect(getItem).not.toHaveBeenCalled();
  });
});
