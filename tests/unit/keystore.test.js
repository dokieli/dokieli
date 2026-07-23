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
import {
  createKeystore,
  unlockKeystore,
  lockKeystore,
  isUnlocked,
  getSessionPrivateKey,
  getSessionPublicKey,
  getSessionPublicKeyJWK,
  getSessionKid,
  decryptWithSession,
  hasKeystore,
  publishPublicKeyToProfile
} from '../../src/keystore.js';
import { encryptContent } from '../../src/crypto.js';
import Config from '../../src/config.js';

const mocks = vi.hoisted(() => ({
  local: { value: null },
  getResource: vi.fn(),
  getResourceHead: vi.fn(),
  putResource: vi.fn(),
  postResource: vi.fn(),
  patchResourceWithAcceptPatch: vi.fn(),
  getResourceGraph: vi.fn(),
  getLinkRelationFromHead: vi.fn(),
  updateDeviceStorageProfile: vi.fn(),
}));

vi.mock('src/storage.js', () => ({
  getEncryptedKeystore: vi.fn(async () => mocks.local.value),
  setEncryptedKeystore: vi.fn(async (doc) => { mocks.local.value = doc; }),
  removeEncryptedKeystore: vi.fn(async () => { mocks.local.value = null; }),
  updateDeviceStorageProfile: mocks.updateDeviceStorageProfile,
}));

vi.mock('src/fetcher.js', () => ({
  getResource: mocks.getResource,
  getResourceHead: mocks.getResourceHead,
  putResource: mocks.putResource,
  postResource: mocks.postResource,
  patchResourceWithAcceptPatch: mocks.patchResourceWithAcceptPatch,
}));

vi.mock('src/graph.js', () => ({
  getResourceGraph: mocks.getResourceGraph,
  getLinkRelationFromHead: mocks.getLinkRelationFromHead,
}));

const PASSPHRASE = 'correct horse battery staple';
const WEBID = 'https://alice.example/profile/card#me';
const PROFILE_DOC = 'https://alice.example/profile/card';
const STORAGE = 'https://alice.example/';
const KEY_CONTAINER = 'https://alice.example/key/';
const TYPE_INDEX = 'https://alice.example/settings/privateTypeIndex.ttl';

function httpError(status) {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}

function keyResourceURL(kid) {
  return KEY_CONTAINER + encodeURIComponent(kid) + '.json';
}

function registerKeyContainerInTypeIndex() {
  Config.User.TypeIndex = {
    [Config.ns.solid.privateTypeIndex.value]: {
      [`${TYPE_INDEX}#key-registration`]: {
        [Config.ns.solid.forClass.value]: Config.ns.sec.JsonWebKey.value,
        [Config.ns.solid.instanceContainer.value]: KEY_CONTAINER
      }
    }
  };
}

function mockStorageListing(memberURLs) {
  mocks.getResourceGraph.mockResolvedValue({
    graph: { node: () => ({ out: () => ({ values: memberURLs }) }) }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  lockKeystore();
  mocks.local.value = null;

  mocks.getResource.mockRejectedValue(httpError(404));
  mocks.getResourceHead.mockResolvedValue({});
  mocks.putResource.mockResolvedValue({});
  mocks.postResource.mockResolvedValue({});
  mocks.patchResourceWithAcceptPatch.mockResolvedValue({});
  mocks.getResourceGraph.mockResolvedValue({ graph: null });
  mocks.getLinkRelationFromHead.mockImplementation(async (rel, url) => [url + '.acl']);

  Config.Session = { isActive: false };
  Config.User = {
    IRI: WEBID,
    Storage: [STORAGE],
    PrivateTypeIndex: [TYPE_INDEX],
    TypeIndex: {},
    Encryption: {
      Enabled: false,
      KeyId: null,
      KeystoreURL: null,
      StorageSyncFailed: false,
      Document: false,
      DocumentEncrypt: false
    }
  };
});

describe('keystore.js', () => {
  describe('createKeystore (signed out)', () => {
    test('stores a valid key document locally and unlocks the session', async () => {
      const publicKeyJWK = await createKeystore(PASSPHRASE);

      const doc = mocks.local.value;
      expect(doc['@context']).toBe('https://www.w3.org/ns/cid/v1');
      expect(doc.type).toBe('JsonWebKey');
      expect(doc.publicKeyJwk).toEqual(publicKeyJWK);
      expect(doc.publicKeyJwk.kid).toBeDefined();
      expect(doc.secretKeyJwk).toMatchObject({
        ciphertext: expect.any(String),
        protected: expect.any(String),
        encrypted_key: expect.any(String)
      });
      expect(doc.id).toBe(`${PROFILE_DOC}#key-${doc.publicKeyJwk.kid}`);
      expect(doc.controller).toBe(WEBID);

      expect(isUnlocked()).toBe(true);
      expect(getSessionKid()).toBe(doc.publicKeyJwk.kid);
      expect(getSessionPublicKeyJWK()).toEqual(publicKeyJWK);
      expect(getSessionPublicKey()).toBeDefined();
      expect(getSessionPrivateKey()).toBeDefined();
      expect(getSessionPrivateKey(doc.publicKeyJwk.kid)).toBeDefined();
      expect(Config.User.Encryption.StorageSyncFailed).toBe(false);

      expect(mocks.putResource).not.toHaveBeenCalled();
      expect(mocks.postResource).not.toHaveBeenCalled();
    });
  });

  describe('lockKeystore', () => {
    test('clears session keys', async () => {
      await createKeystore(PASSPHRASE);
      lockKeystore();

      expect(isUnlocked()).toBe(false);
      expect(getSessionKid()).toBeNull();
      expect(getSessionPublicKey()).toBeNull();
      expect(getSessionPublicKeyJWK()).toBeNull();
      expect(getSessionPrivateKey()).toBeNull();
    });
  });

  describe('unlockKeystore', () => {
    test('restores session keys from the local key document', async () => {
      await createKeystore(PASSPHRASE);
      const kid = getSessionKid();
      const publicKeyJWK = getSessionPublicKeyJWK();
      lockKeystore();

      await unlockKeystore(PASSPHRASE);

      expect(isUnlocked()).toBe(true);
      expect(getSessionKid()).toBe(kid);
      expect(getSessionPublicKeyJWK()).toEqual(publicKeyJWK);
    });

    test('rejects with the wrong passphrase', async () => {
      await createKeystore(PASSPHRASE);
      lockKeystore();

      await expect(unlockKeystore('not the passphrase')).rejects.toThrow(/Unable to unlock/);
      expect(isUnlocked()).toBe(false);
    });

    test('rejects when no keystore exists', async () => {
      await expect(unlockKeystore(PASSPHRASE)).rejects.toThrow(/No keystore found/);
    });

    test('unlocks storage keys alongside the local key so old content stays decryptable', async () => {
      await createKeystore(PASSPHRASE);
      const oldDoc = mocks.local.value;
      const oldKid = oldDoc.publicKeyJwk.kid;
      const oldJwe = await encryptContent('old secret', [getSessionPublicKey()], oldKid);

      await createKeystore(PASSPHRASE);
      const currentDoc = mocks.local.value;
      const currentKid = currentDoc.publicKeyJwk.kid;
      expect(currentKid).not.toBe(oldKid);
      lockKeystore();

      Config.Session = { isActive: true };
      registerKeyContainerInTypeIndex();
      mockStorageListing([keyResourceURL(oldKid)]);
      mocks.getResource.mockResolvedValue({ json: async () => oldDoc });

      await unlockKeystore(PASSPHRASE);

      expect(getSessionKid()).toBe(currentKid);
      expect(await decryptWithSession(oldJwe)).toBe('old secret');
    });
  });

  describe('decryptWithSession', () => {
    test('decrypts a JWE addressed to the session key by kid', async () => {
      await createKeystore(PASSPHRASE);
      const jwe = await encryptContent('hello', [getSessionPublicKey()], getSessionKid());
      expect(await decryptWithSession(jwe)).toBe('hello');
    });

    test('falls back to trying held keys when the JWE has no kid', async () => {
      await createKeystore(PASSPHRASE);
      const jwe = await encryptContent('no kid', [getSessionPublicKey()]);
      expect(await decryptWithSession(jwe)).toBe('no kid');
    });

    test('rejects when the keystore is locked', async () => {
      await createKeystore(PASSPHRASE);
      const jwe = await encryptContent('hello', [getSessionPublicKey()], getSessionKid());
      lockKeystore();
      await expect(decryptWithSession(jwe)).rejects.toThrow(/No unlocked key/);
    });
  });

  describe('storage sync (signed in)', () => {
    beforeEach(() => {
      Config.Session = { isActive: true };
    });

    test('uploads the key document, sets ACLs, and registers in the type index', async () => {
      await createKeystore(PASSPHRASE);

      const kid = getSessionKid();
      const keystoreURL = keyResourceURL(kid);

      expect(mocks.putResource).toHaveBeenCalledWith(
        keystoreURL,
        expect.any(String),
        'application/ld+json',
        null,
        { headers: { 'If-None-Match': '*' } }
      );
      const uploaded = JSON.parse(
        mocks.putResource.mock.calls.find(c => c[2] === 'application/ld+json')[1]
      );
      expect(uploaded.publicKeyJwk.kid).toBe(kid);

      expect(mocks.patchResourceWithAcceptPatch).toHaveBeenCalledWith(
        KEY_CONTAINER + '.acl',
        [{ insert: expect.stringContaining(`acl:default <${KEY_CONTAINER}>`) }]
      );
      expect(mocks.patchResourceWithAcceptPatch).toHaveBeenCalledWith(
        keystoreURL + '.acl',
        [{ insert: expect.stringContaining(`acl:accessTo <${keystoreURL}>`) }]
      );

      expect(mocks.patchResourceWithAcceptPatch).toHaveBeenCalledWith(
        TYPE_INDEX,
        [{ insert: expect.stringContaining(Config.ns.sec.JsonWebKey.value) }]
      );
      const registrations = Config.User.TypeIndex[Config.ns.solid.privateTypeIndex.value];
      expect(Object.values(registrations)[0][Config.ns.solid.instanceContainer.value]).toBe(KEY_CONTAINER);
      expect(mocks.updateDeviceStorageProfile).toHaveBeenCalled();

      expect(Config.User.Encryption.KeystoreURL).toBe(keystoreURL);
      expect(Config.User.Encryption.StorageSyncFailed).toBe(false);
    });

    test('keeps the local copy when the storage already has the key (412)', async () => {
      mocks.putResource.mockImplementation(async (url, data, contentType) => {
        if (contentType === 'application/ld+json') throw httpError(412);
        return {};
      });

      await createKeystore(PASSPHRASE);

      expect(isUnlocked()).toBe(true);
      expect(mocks.local.value).toBeDefined();
      expect(Config.User.Encryption.StorageSyncFailed).toBe(false);
      expect(mocks.patchResourceWithAcceptPatch).not.toHaveBeenCalledWith(TYPE_INDEX, expect.anything());
      expect(mocks.patchResourceWithAcceptPatch).not.toHaveBeenCalledWith(
        keyResourceURL(getSessionKid()) + '.acl',
        expect.anything()
      );
    });

    test('creates the key container when it does not exist yet', async () => {
      mocks.getResourceHead.mockRejectedValue(httpError(404));

      await createKeystore(PASSPHRASE);

      expect(mocks.postResource).toHaveBeenCalledWith(
        STORAGE, 'key', '', 'text/turtle', '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"'
      );
      expect(Config.User.Encryption.StorageSyncFailed).toBe(false);
    });

    test('flags StorageSyncFailed but keeps the local keystore on a hard failure', async () => {
      mocks.putResource.mockRejectedValue(httpError(500));

      await createKeystore(PASSPHRASE);

      expect(isUnlocked()).toBe(true);
      expect(mocks.local.value).toBeDefined();
      expect(Config.User.Encryption.StorageSyncFailed).toBe(true);
    });
  });

  describe('hasKeystore', () => {
    test('returns true when a local key document exists', async () => {
      await createKeystore(PASSPHRASE);
      expect(await hasKeystore()).toBe(true);
    });

    test('returns false when signed out with no local key document', async () => {
      expect(await hasKeystore()).toBe(false);
    });

    test('fetches and caches the storage keystore for a new device', async () => {
      await createKeystore(PASSPHRASE);
      const doc = mocks.local.value;
      lockKeystore();
      mocks.local.value = null;

      Config.Session = { isActive: true };
      registerKeyContainerInTypeIndex();
      mockStorageListing([keyResourceURL(doc.publicKeyJwk.kid)]);
      mocks.getResource.mockResolvedValue({ json: async () => doc });

      expect(await hasKeystore()).toBe(true);
      expect(mocks.local.value).toEqual(doc);
    });

    test('rejects an invalid storage key document', async () => {
      Config.Session = { isActive: true };
      registerKeyContainerInTypeIndex();
      mockStorageListing([KEY_CONTAINER + 'bogus.json']);
      mocks.getResource.mockResolvedValue({ json: async () => ({ foo: 'bar' }) });

      expect(await hasKeystore()).toBe(false);
      expect(mocks.local.value).toBeNull();
    });
  });

  describe('publishPublicKeyToProfile', () => {
    test('returns null when signed out', async () => {
      await createKeystore(PASSPHRASE);
      expect(await publishPublicKeyToProfile()).toBeNull();
      expect(mocks.patchResourceWithAcceptPatch).not.toHaveBeenCalled();
    });

    test('returns null when the keystore is locked', async () => {
      Config.Session = { isActive: true };
      expect(await publishPublicKeyToProfile()).toBeNull();
      expect(mocks.patchResourceWithAcceptPatch).not.toHaveBeenCalled();
    });

    test('patches the profile document with the public key', async () => {
      await createKeystore(PASSPHRASE);
      Config.Session = { isActive: true };
      Config.User.Graph = { out: () => ({ values: [] }) };
      mocks.patchResourceWithAcceptPatch.mockClear();

      await publishPublicKeyToProfile();

      const keyIRI = `${PROFILE_DOC}#key-${getSessionKid()}`;
      expect(mocks.patchResourceWithAcceptPatch).toHaveBeenCalledWith(
        PROFILE_DOC,
        [{ insert: expect.stringContaining(keyIRI) }]
      );
      const insert = mocks.patchResourceWithAcceptPatch.mock.calls[0][1][0].insert;
      expect(insert).toContain(Config.ns.sec.keyAgreementMethod.value);
      expect(insert).toContain(Config.ns.sec.publicKeyJwk.value);
    });

    test('skips publishing when the key is already in the profile', async () => {
      await createKeystore(PASSPHRASE);
      Config.Session = { isActive: true };
      const keyIRI = `${PROFILE_DOC}#key-${getSessionKid()}`;
      Config.User.Graph = { out: () => ({ values: [keyIRI] }) };
      mocks.patchResourceWithAcceptPatch.mockClear();

      expect(await publishPublicKeyToProfile()).toBeNull();
      expect(mocks.patchResourceWithAcceptPatch).not.toHaveBeenCalled();
    });
  });
});
