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
import { processAction } from '../../../../src/editor/toolbar/social/handlers.js';
import { createKeystore, lockKeystore, getSessionKid, decryptWithSession } from '../../../../src/keystore.js';
import { removeEncryptedKeystore } from '../../../../src/storage.js';
import { isJWE, getJWEKids } from '../../../../src/crypto.js';
import Config from '../../../../src/config.js';

const mocks = vi.hoisted(() => ({ postActivity: vi.fn() }));

vi.mock('src/activity.js', async (importOriginal) => ({
  ...(await importOriginal()),
  postActivity: mocks.postActivity,
  notifyInbox: vi.fn(),
  showActivities: vi.fn(),
  registerAnnotationInTypeIndex: vi.fn(),
  markAnnotationTarget: vi.fn(),
}));

const PASSPHRASE = 'correct horse battery staple';
const DOCUMENT_URL = 'https://example.com/';

function makeFormValues(overrides = {}) {
  return {
    'comment-content': 'Confidential remark',
    'comment-tagging': 'important',
    'comment-annotation-location-personal-storage': 'true',
    ...overrides
  };
}

function makeSelectionData() {
  return {
    selectedParentElement: document.querySelector('article'),
    selectedContent: 'secret passage',
    selector: { exact: 'secret passage', prefix: 'the ', suffix: ' ends' }
  };
}

function postedNoteData() {
  expect(mocks.postActivity).toHaveBeenCalledTimes(1);
  return mocks.postActivity.mock.calls[0][3].annotationObject;
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal('Document', document.defaultView.Document);
  mocks.postActivity.mockResolvedValue({ headers: { get: () => null } });
  lockKeystore();
  await removeEncryptedKeystore();

  Config.DocumentURL = DOCUMENT_URL;
  Config.Resource[DOCUMENT_URL] = { graph: { out: () => ({ values: [] }) } };
  Config.IconBase64 = { '.fas.fa-user-secret': 'data:image/svg+xml;base64,' };
  Config.Session = { isActive: false };
  Config.User.IRI = null;
  Config.User.Storage = ['https://alice.example/annotations/'];
  Config.User.Encryption = {
    Enabled: false,
    KeyId: null,
    KeystoreURL: null,
    StorageSyncFailed: false,
    Document: false,
    DocumentEncrypt: false
  };
});

describe('processAction annotation encryption', () => {
  test('encrypts body values and selector parts, leaving tags plaintext', async () => {
    await createKeystore(PASSPHRASE);

    await processAction('comment', makeFormValues({ 'comment-encrypt': 'true' }), makeSelectionData());

    const noteData = postedNoteData();

    const tagItem = noteData.body.find(b => b.value === 'important');
    expect(tagItem).toBeDefined();

    const encrypted = noteData.body.filter(b => isJWE(b.value));
    expect(encrypted).toHaveLength(1);
    expect(getJWEKids(encrypted[0].value)).toEqual([getSessionKid()]);
    expect(await decryptWithSession(encrypted[0].value)).toBe('Confidential remark');

    const selector = noteData.target.selector;
    expect(isJWE(selector.exact)).toBe(true);
    expect(isJWE(selector.prefix)).toBe(true);
    expect(isJWE(selector.suffix)).toBe(true);
    expect(await decryptWithSession(selector.exact)).toBe('secret passage');
    expect(await decryptWithSession(selector.prefix)).toBe('the ');
    expect(await decryptWithSession(selector.suffix)).toBe(' ends');

    const noteHTML = mocks.postActivity.mock.calls[0][2];
    expect(noteHTML).not.toContain('Confidential remark');
    expect(noteHTML).not.toContain('secret passage');
  });

  test('leaves everything plaintext when encrypt is not selected', async () => {
    await createKeystore(PASSPHRASE);

    await processAction('comment', makeFormValues(), makeSelectionData());

    const noteData = postedNoteData();
    expect(noteData.body.some(b => b.value === 'Confidential remark')).toBe(true);
    expect(noteData.body.some(b => isJWE(b.value))).toBe(false);
    expect(noteData.target.selector.exact).toBe('secret passage');
  });

  test('leaves everything plaintext when encrypt is selected but the keystore is locked', async () => {
    await processAction('comment', makeFormValues({ 'comment-encrypt': 'true' }), makeSelectionData());

    const noteData = postedNoteData();
    expect(noteData.body.some(b => b.value === 'Confidential remark')).toBe(true);
    expect(noteData.body.some(b => isJWE(b.value))).toBe(false);
    expect(noteData.target.selector.exact).toBe('secret passage');
  });
});
