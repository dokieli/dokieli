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

import { describe, test, expect, beforeAll } from 'vitest';
import {
  generateEncryptionKeypair,
  exportPublicKeyJWK,
  exportPrivateKeyJWK,
  importPublicKeyJWK,
  importPrivateKeyJWK,
  wrapPrivateKeyJWK,
  unwrapPrivateKeyJWK,
  encryptContent,
  decryptContent,
  multikeyToJWK,
  getJWEKids,
  isJWE
} from '../../src/crypto.js';

const PASSPHRASE = 'correct horse battery staple';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58btcEncode(bytes) {
  let value = 0n;
  for (const b of bytes) value = (value << 8n) | BigInt(b);
  let out = '';
  while (value > 0n) {
    out = BASE58_ALPHABET[Number(value % 58n)] + out;
    value /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = '1' + out;
  }
  return out;
}

describe('crypto.js', () => {
  let keypair;
  let publicKeyJWK;
  let privateKeyJWK;

  beforeAll(async () => {
    keypair = await generateEncryptionKeypair();
    publicKeyJWK = await exportPublicKeyJWK(keypair.publicKey, keypair.kid);
    privateKeyJWK = await exportPrivateKeyJWK(keypair.privateKey, keypair.kid);
  });

  describe('keypair generation and JWK round trips', () => {
    test('generateEncryptionKeypair returns a P-256 keypair with a kid', () => {
      expect(keypair.publicKey).toBeDefined();
      expect(keypair.privateKey).toBeDefined();
      expect(typeof keypair.kid).toBe('string');
      expect(keypair.kid.length).toBeGreaterThan(0);
    });

    test('exported JWKs carry the kid and curve parameters', () => {
      expect(publicKeyJWK).toMatchObject({ kty: 'EC', crv: 'P-256', kid: keypair.kid });
      expect(publicKeyJWK.x).toBeDefined();
      expect(publicKeyJWK.y).toBeDefined();
      expect(publicKeyJWK.d).toBeUndefined();
      expect(privateKeyJWK).toMatchObject({ kty: 'EC', crv: 'P-256', kid: keypair.kid });
      expect(privateKeyJWK.d).toBeDefined();
    });

    test('exportPublicKeyJWK without kid omits it', async () => {
      const jwk = await exportPublicKeyJWK(keypair.publicKey);
      expect(jwk.kid).toBeUndefined();
    });

    test('imported keys are usable for encryption and decryption', async () => {
      const pub = await importPublicKeyJWK(publicKeyJWK);
      const priv = await importPrivateKeyJWK(privateKeyJWK);
      const jwe = await encryptContent('round trip', [pub]);
      expect(await decryptContent(jwe, priv)).toBe('round trip');
    });
  });

  describe('passphrase wrapping', () => {
    test('wrap and unwrap round-trips the private JWK', async () => {
      const jwe = await wrapPrivateKeyJWK(privateKeyJWK, PASSPHRASE);
      expect(jwe.ciphertext).toBeDefined();
      expect(jwe.protected).toBeDefined();
      expect(jwe.encrypted_key).toBeDefined();
      const unwrapped = await unwrapPrivateKeyJWK(jwe, PASSPHRASE);
      expect(unwrapped).toEqual(privateKeyJWK);
    });

    test('unwrapping with the wrong passphrase rejects', async () => {
      const jwe = await wrapPrivateKeyJWK(privateKeyJWK, PASSPHRASE);
      await expect(unwrapPrivateKeyJWK(jwe, 'wrong passphrase')).rejects.toThrow();
    });
  });

  describe('content encryption', () => {
    test('single recipient produces a compact JWE that decrypts', async () => {
      const jwe = await encryptContent('secret text', [keypair.publicKey], keypair.kid);
      expect(typeof jwe).toBe('string');
      expect(jwe.split('.')).toHaveLength(5);
      expect(await decryptContent(jwe, keypair.privateKey)).toBe('secret text');
    });

    test('decryptContent tolerates surrounding whitespace', async () => {
      const jwe = await encryptContent('padded', [keypair.publicKey]);
      expect(await decryptContent(`\n  ${jwe}  \n`, keypair.privateKey)).toBe('padded');
    });

    test('multiple recipients produce a general JWE each recipient can decrypt', async () => {
      const other = await generateEncryptionKeypair();
      const jwe = await encryptContent('shared secret', [keypair.publicKey, other.publicKey], keypair.kid);
      const parsed = JSON.parse(jwe);
      expect(parsed.recipients).toHaveLength(2);
      expect(await decryptContent(jwe, keypair.privateKey)).toBe('shared secret');
      expect(await decryptContent(jwe, other.privateKey)).toBe('shared secret');
    });
  });

  describe('getJWEKids', () => {
    test('reads the kid from a compact JWE protected header', async () => {
      const jwe = await encryptContent('x', [keypair.publicKey], keypair.kid);
      expect(getJWEKids(jwe)).toEqual([keypair.kid]);
    });

    test('returns an empty list when no kid is present', async () => {
      const jwe = await encryptContent('x', [keypair.publicKey]);
      expect(getJWEKids(jwe)).toEqual([]);
    });

    test('reads recipient kids from a general JWE', async () => {
      const other = await generateEncryptionKeypair();
      const jwe = await encryptContent('x', [keypair.publicKey, other.publicKey], keypair.kid);
      expect(getJWEKids(jwe)).toEqual([keypair.kid]);
    });
  });

  describe('isJWE', () => {
    test('recognizes compact JWEs', async () => {
      const jwe = await encryptContent('x', [keypair.publicKey]);
      expect(isJWE(jwe)).toBe(true);
      expect(isJWE(`  ${jwe}  `)).toBe(true);
    });

    test('recognizes general JSON JWEs', async () => {
      const other = await generateEncryptionKeypair();
      const jwe = await encryptContent('x', [keypair.publicKey, other.publicKey]);
      expect(isJWE(jwe)).toBe(true);
    });

    test('rejects non-JWE content', () => {
      expect(isJWE('plain text')).toBe(false);
      expect(isJWE('<p>hello</p>')).toBe(false);
      expect(isJWE('{"foo": 1}')).toBe(false);
      expect(isJWE('')).toBe(false);
      expect(isJWE(null)).toBe(false);
      expect(isJWE(42)).toBe(false);
    });
  });

  describe('multikeyToJWK', () => {
    async function rawPublicKeyBytes() {
      return new Uint8Array(await crypto.subtle.exportKey('raw', keypair.publicKey));
    }

    function toMultikey(keyBytes) {
      return 'z' + base58btcEncode(new Uint8Array([0x80, 0x24, ...keyBytes]));
    }

    test('decodes an uncompressed p256-pub multikey', async () => {
      const raw = await rawPublicKeyBytes();
      const jwk = multikeyToJWK(toMultikey(raw));
      expect(jwk).toMatchObject({ kty: 'EC', crv: 'P-256', x: publicKeyJWK.x, y: publicKeyJWK.y });
    });

    test('decodes a compressed p256-pub multikey', async () => {
      const raw = await rawPublicKeyBytes();
      const yParity = raw[64] & 1;
      const compressed = new Uint8Array([yParity ? 3 : 2, ...raw.subarray(1, 33)]);
      const jwk = multikeyToJWK(toMultikey(compressed));
      expect(jwk).toMatchObject({ kty: 'EC', crv: 'P-256', x: publicKeyJWK.x, y: publicKeyJWK.y });
    });

    test('returns null for non-multibase input', () => {
      expect(multikeyToJWK('not-a-multikey')).toBeNull();
      expect(multikeyToJWK('')).toBeNull();
      expect(multikeyToJWK(null)).toBeNull();
      expect(multikeyToJWK(42)).toBeNull();
    });

    test('returns null for invalid base58 characters', () => {
      expect(multikeyToJWK('z0OIl')).toBeNull();
    });

    test('returns null for a different multicodec prefix', () => {
      const ed25519 = new Uint8Array([0xed, 0x01, ...new Uint8Array(32)]);
      expect(multikeyToJWK('z' + base58btcEncode(ed25519))).toBeNull();
    });

    test('returns null for a malformed point length', () => {
      const bad = 'z' + base58btcEncode(new Uint8Array([0x80, 0x24, 4, 1, 2, 3]));
      expect(multikeyToJWK(bad)).toBeNull();
    });
  });
});
