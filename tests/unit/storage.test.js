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

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  updateLocalStorageDocumentWithItem,
  removeLocalStorageItem,
  enableAutoSave,
  disableAutoSave,
  removeLocalStorageDocumentItems,
  updateDeviceStorageProfile,
  getDeviceStorageItem,
} from '../../src/storage.js';
import * as storage from '../../src/storage.js';
import Config from '../../src/config.js';

vi.mock('src/util.js', async () => {
  const actual = await vi.importActual('src/util.js');
  return {
    ...actual,
    fragmentFromString: vi.fn(() => document.createElement('div')),
    generateAttributeId: vi.fn(() => 'uuid-123'),
    getDateTimeISO: vi.fn(() => '2024-05-21T12:00:00Z'),
    getHash: vi.fn(() => Promise.resolve('hash123')),
  };
});

vi.mock('../../src/access.js', () => ({
  getDocument: vi.fn(() => '<p>fake content</p>'),
  updateMutableResource: vi.fn(),
  accessModeAllowed: vi.fn(() => true),
}));

beforeEach(() => {
  const storage = {
    'doc-url': JSON.parse('{"items":["doc-url"]}'),
    'profile-key': JSON.stringify({
      '@context': 'https://www.w3.org/ns/activitystreams',
      type: 'Profile',
      name: 'Test User'
    }),
  };

  global.localStorage = {
    getItem: vi.fn((key) => storage[key] ?? 'null'),
    setItem: vi.fn((key, value) => { storage[key] = value; }),
    removeItem: vi.fn((key) => { delete storage[key]; }),
    clear: vi.fn(() => { Object.keys(storage).forEach(k => delete storage[k]); }),
  };

  document.documentElement.replaceChildren = vi.fn();
  Config.AutoSave.Items['doc-key'] = {
    localStorage: {},
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('storage.js', () => {
  test.skip('updateLocalStorageDocumentWithItem saves to localStorage and updates autosave timestamp', () => {
    Config.AutoSave.Items['doc-key'] = { localStorage: {} };

    updateLocalStorageDocumentWithItem('doc-key', '<p>custom</p>', { autoSave: true });

    const expected = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: 'uuid-123',
      type: 'Update',
      object: {
        id: 'doc-key',
        type: 'Document',
        updated: '2024-05-21T12:00:00Z',
        mediaType: 'text/html',
        content: '<p>custom</p>'
      }
    };

    expect(localStorage.setItem).toHaveBeenCalledWith('doc-key', JSON.stringify(expected));
    expect(Config.AutoSave.Items['doc-key'].localStorage.updated).toBe('2024-05-21T12:00:00Z');
  });

  test.skip('removeLocalStorageItem removes key and resets config', () => {
    removeLocalStorageItem('doc-key');

    expect(localStorage.removeItem).toHaveBeenCalledWith('doc-key');
  });

  test.skip('removeLocalStorageDocumentItems calls removeLocalStorageItem with default', async () => {
    vi.spyOn(storage, 'getLocalStorageItem').mockResolvedValue(JSON.parse('{"items":["doc-url"]}'))
    Config.DocumentURL = 'doc-url';
  
    await removeLocalStorageDocumentItems('doc-url'); 
  
    expect(localStorage.removeItem).toHaveBeenCalledWith('doc-url');
  });

  test('updateDeviceStorageProfile stores the user profile without graphs', async () => {
    const User = {
      IRI: 'user-iri',
      Graph: {},
      Preferences: { graph: {} },
      Contacts: {
        c1: { Graph: {}, Preferences: { graph: {} } }
      }
    };

    await updateDeviceStorageProfile(User);

    const stored = await getDeviceStorageItem('DO.Config.User');
    expect(stored.type).toBe('Update');
    expect(stored.actor).toBe('user-iri');
    expect(stored.object.describes.IRI).toBe('user-iri');
    // Graphs are large and reconstructable, so they are never persisted.
    expect(stored.object.describes.Graph).toBeUndefined();
    expect(stored.object.describes.Preferences.graph).toBeUndefined();
    expect(stored.object.describes.Contacts.c1.Graph).toBeUndefined();
  });

  test('updateDeviceStorageProfile resolves without storing when there is no IRI', async () => {
    await expect(updateDeviceStorageProfile({})).resolves.toEqual({
      message: 'User.IRI is not set'
    });
  });
});
