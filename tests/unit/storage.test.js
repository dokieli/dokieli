import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  enableLocalStorage,
  updateLocalStorageDocument,
  disableLocalStorage,
  removeLocalStorageItem,
  getLocalStorageProfile,
  initLocalStorage,
  enableAutoSave,
  disableAutoSave,
  removeLocalStorageDocument,
  removeLocalStorageProfile,
  updateLocalStorageProfile,
  showAutoSaveStorage,
} from 'src/storage.js';

import Config from 'src/config.js';

vi.mock('src/config.js', () => ({
  default: {
    UseLocalStorage: false,
    AutoSave: { Items: {} },
    init: vi.fn(),
    reset: vi.fn(),
    DocumentURL: 'doc-key',
  }
}));

vi.mock('src/util.js', async () => {
  const actual = await vi.importActual('src/util.js');
  return {
    ...actual,
    fragmentFromString: vi.fn(() => document.createElement('div')),
    generateUUID: vi.fn(() => 'uuid-123'),
    getDateTimeISO: vi.fn(() => '2024-05-21T12:00:00Z'),
    getHash: vi.fn(() => Promise.resolve('hash123')),
  };
});

vi.mock('src/doc.js', () => ({
  getDocument: vi.fn(() => '<p>fake content</p>'),
  updateMutableResource: vi.fn(),
}));

beforeEach(() => {
  const storage = {
    'doc-key': JSON.stringify({
      object: {
        content: '<div>saved content</div>'
      }
    }),
    'profile-key': JSON.stringify({
      '@context': 'https://www.w3.org/ns/activitystreams',
      type: 'Profile',
      name: 'Test User'
    }),
  };

  global.localStorage = {
    getItem: vi.fn((key) => storage[key] ?? null),
    setItem: vi.fn((key, value) => { storage[key] = value; }),
    removeItem: vi.fn((key) => { delete storage[key]; }),
    clear: vi.fn(() => { Object.keys(storage).forEach(k => delete storage[k]); }),
  };

  document.documentElement.replaceChildren = vi.fn();
  Config.UseLocalStorage = false;
  Config.AutoSave.Items['doc-key'] = {
    localStorage: {},
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('storage.js', () => {
  test('enableLocalStorage injects content and enables autosave', () => {
    enableLocalStorage('doc-key');

    expect(Config.UseLocalStorage).toBe(true);
    expect(localStorage.getItem).toHaveBeenCalledWith('doc-key');
    expect(document.documentElement.replaceChildren).toHaveBeenCalled();
    expect(Config.init).toHaveBeenCalled();
  });

  test('updateLocalStorageDocument saves to localStorage and updates autosave timestamp', () => {
    Config.AutoSave.Items['doc-key'] = { localStorage: {} };

    updateLocalStorageDocument('doc-key', '<p>custom</p>', { autoSave: true });

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

  test('disableLocalStorage resets config', () => {
    Config.UseLocalStorage = true;
    disableLocalStorage();

    expect(Config.UseLocalStorage).toBe(false);
  });

  test('removeLocalStorageItem removes key and resets config', () => {
    removeLocalStorageItem('doc-key');

    expect(localStorage.removeItem).toHaveBeenCalledWith('doc-key');
  });

  test('getLocalStorageProfile returns parsed profile if exists', async () => {
    const profile = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      type: 'Profile',
      name: 'Test User'
    };
    localStorage.getItem = vi.fn(() => JSON.stringify(profile));

    const result = await getLocalStorageProfile('doc-key');

    expect(result).toEqual(profile);
  });

  test('getLocalStorageProfile returns null if item missing or invalid', async () => {
    localStorage.getItem = vi.fn(() => null);
    expect(await getLocalStorageProfile('missing-key')).toBe(null);

    localStorage.getItem = vi.fn(() => '{invalid json}');
    expect(await getLocalStorageProfile('broken')).toBe(null);
  });


  test('initLocalStorage enables localStorage when available', () => {
    initLocalStorage('test-key');
    expect(Config.UseLocalStorage).toBe(true);
  });

  test('enableAutoSave sets interval for localStorage and http methods', () => {
    vi.useFakeTimers();

    Config.AutoSave.Items['key'] = {};

    enableAutoSave('key', { method: 'localStorage' });
    expect(Config.AutoSave.Items['key'].localStorage.id).toBeDefined();

    enableAutoSave('key', { method: 'http' });
    expect(Config.AutoSave.Items['key'].http.id).toBeDefined();

    disableAutoSave('key', { method: ['localStorage', 'http'] });
    vi.useRealTimers();
  });

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

  test('removeLocalStorageDocument calls removeLocalStorageItem with default', async () => {
    Config.DocumentURL = 'doc-url';
    await removeLocalStorageDocument();
    expect(localStorage.removeItem).toHaveBeenCalledWith('doc-url');
  });

  test('removeLocalStorageProfile calls removeLocalStorageItem with default', async () => {
    await removeLocalStorageProfile();
    expect(localStorage.removeItem).toHaveBeenCalledWith('DO.C.User');
  });

  test('updateLocalStorageProfile stores the user profile to storage', async () => {
    const User = {
      IRI: 'user-iri',
      Graph: {},
      Preferences: { graph: {} },
      Contacts: {
        c1: { Graph: {}, Preferences: { graph: {} } }
      }
    };

    await expect(updateLocalStorageProfile(User)).resolves.toBeUndefined();

    expect(localStorage.setItem).toHaveBeenCalled();
  });

  test('showAutoSaveStorage inserts HTML and adds event listener', () => {
    const container = document.createElement('div');
    showAutoSaveStorage(container, 'doc-key');
    expect(container.querySelector('#autosave-items')).toBeTruthy();

    const input = container.querySelector('input.autosave');
    expect(input).toBeTruthy();
  });
});
