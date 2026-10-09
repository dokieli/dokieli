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

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import Config from '../../src/config.js';
import { loadMessageLog, saveMessageLog, clearMessageLog, getDeviceStorageItem, setDeviceStorageItem, removeDeviceStorageAsSignOut } from '../../src/storage.js';

const KEY = 'DO.MessageLog';

beforeEach(async () => {
  window.localStorage.clear();
  await clearMessageLog();
});

describe('message log', () => {
  it('is kept in IndexedDB and restored on load', async () => {
    Config.MessageLog.push({ content: 'Saved', type: 'success', dateTime: '2026-10-09T10:00:00Z' });
    await saveMessageLog();
    expect(await getDeviceStorageItem(KEY)).toEqual([{ content: 'Saved', type: 'success', dateTime: '2026-10-09T10:00:00Z' }]);
    expect(window.localStorage.getItem('dokieli.messageLog')).toBeNull();

    Config.MessageLog.length = 0;
    await loadMessageLog();
    expect(Config.MessageLog.map(m => m.content)).toEqual(['Saved']);
  });

  it('sanitizes restored messages', async () => {
    await setDeviceStorageItem(KEY, [{ content: '<img src="x" onerror="alert(1)">Hi', type: 'info' }]);
    await loadMessageLog();
    expect(Config.MessageLog[0].content).not.toContain('onerror');
  });

  it('moves a log kept in localStorage into IndexedDB', async () => {
    window.localStorage.setItem('dokieli.messageLog', JSON.stringify([{ content: 'Old', type: 'info' }]));
    await loadMessageLog();
    expect(Config.MessageLog.map(m => m.content)).toEqual(['Old']);
    expect(window.localStorage.getItem('dokieli.messageLog')).toBeNull();
    expect(await getDeviceStorageItem(KEY)).toEqual([{ content: 'Old', type: 'info' }]);
  });

  it('keeps messages added while loading before the restored ones', async () => {
    await setDeviceStorageItem(KEY, [{ content: 'Earlier', type: 'info' }]);
    const loading = loadMessageLog();
    Config.MessageLog.unshift({ content: 'Now', type: 'info' });
    await saveMessageLog();
    await loading;
    expect(Config.MessageLog.map(m => m.content)).toEqual(['Now', 'Earlier']);
    expect((await getDeviceStorageItem(KEY)).map(m => m.content)).toEqual(['Now', 'Earlier']);
  });

  it('is cleared on sign-out', async () => {
    Config.MessageLog.push({ content: 'Saved', type: 'success' });
    await saveMessageLog();
    await removeDeviceStorageAsSignOut();
    expect(Config.MessageLog).toHaveLength(0);
    expect(await getDeviceStorageItem(KEY)).toBeUndefined();
  });

  it('is cleared from memory and IndexedDB', async () => {
    Config.MessageLog.push({ content: 'Saved', type: 'success' });
    await saveMessageLog();
    await clearMessageLog();
    expect(Config.MessageLog).toHaveLength(0);
    expect(await getDeviceStorageItem(KEY)).toBeUndefined();
  });
});
