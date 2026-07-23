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

import { CompactEncrypt, compactDecrypt, GeneralEncrypt, generalDecrypt, calculateJwkThumbprint, decodeProtectedHeader } from 'jose';

const CURVE = 'P-256';
const ENC = 'A256GCM';
const PBES2_ALG = 'PBES2-HS512+A256KW';
const PBES2_ITERATIONS = 210000;

// Extractable so the private JWK can be exported during keystore creation. kid is the RFC 7638 JWK thumbprint.
export async function generateEncryptionKeypair() {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: CURVE },
    true,
    ['deriveBits']
  );
  const jwk = await crypto.subtle.exportKey('jwk', publicKey);
  const kid = await calculateJwkThumbprint(jwk);
  return { publicKey, privateKey, kid };
}

export async function exportPublicKeyJWK(publicKey, kid) {
  const jwk = await crypto.subtle.exportKey('jwk', publicKey);
  return kid ? { ...jwk, kid } : jwk;
}

export async function exportPrivateKeyJWK(privateKey, kid) {
  const jwk = await crypto.subtle.exportKey('jwk', privateKey);
  return kid ? { ...jwk, kid } : jwk;
}

export async function importPublicKeyJWK(jwk) {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: CURVE },
    true,
    []
  );
}

export async function importPrivateKeyJWK(jwk) {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: CURVE },
    false,
    ['deriveBits']
  );
}

export async function wrapPrivateKeyJWK(privateKeyJWK, passphrase) {
  return new CompactEncrypt(new TextEncoder().encode(JSON.stringify(privateKeyJWK)))
    .setProtectedHeader({ alg: PBES2_ALG, enc: ENC, cty: 'jwk+json' })
    .setKeyManagementParameters({ p2c: PBES2_ITERATIONS })
    .encrypt(new TextEncoder().encode(passphrase));
}

// maxPBES2Count must exceed PBES2_ITERATIONS; jose's default cap is 10000
export async function unwrapPrivateKeyJWK(jwe, passphrase) {
  const { plaintext } = await compactDecrypt(jwe, new TextEncoder().encode(passphrase), {
    keyManagementAlgorithms: [PBES2_ALG],
    contentEncryptionAlgorithms: [ENC],
    maxPBES2Count: 1000000
  });
  return JSON.parse(new TextDecoder().decode(plaintext));
}

export async function encryptContent(plaintext, recipientPublicKeys, kid) {
  const data = new TextEncoder().encode(plaintext);

  if (recipientPublicKeys.length === 1) {
    const header = { alg: 'ECDH-ES', enc: ENC };
    if (kid) header.kid = kid;
    return new CompactEncrypt(data)
      .setProtectedHeader(header)
      .encrypt(recipientPublicKeys[0]);
  }

  const ge = new GeneralEncrypt(data).setProtectedHeader({ enc: ENC });
  for (const pubKey of recipientPublicKeys) {
    const recipientHeader = { alg: 'ECDH-ES+A256KW' };
    if (kid) recipientHeader.kid = kid;
    ge.addRecipient(pubKey).setUnprotectedHeader(recipientHeader);
  }
  return JSON.stringify(await ge.encrypt());
}

export async function decryptContent(jwe, privateKey) {
  const trimmed = typeof jwe === 'string' ? jwe.trim() : jwe;
  if (typeof trimmed === 'string' && trimmed.startsWith('{')) {
    const { plaintext } = await generalDecrypt(JSON.parse(trimmed), privateKey);
    return new TextDecoder().decode(plaintext);
  }
  const { plaintext } = await compactDecrypt(trimmed, privateKey);
  return new TextDecoder().decode(plaintext);
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58btcDecode(str) {
  let value = 0n;
  for (const ch of str) {
    const idx = BASE58_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('Invalid base58btc character');
    value = value * 58n + BigInt(idx);
  }
  const bytes = [];
  while (value > 0n) {
    bytes.unshift(Number(value & 0xffn));
    value >>= 8n;
  }
  for (const ch of str) {
    if (ch !== '1') break;
    bytes.unshift(0);
  }
  return new Uint8Array(bytes);
}

const P256_P = BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff');
const P256_B = BigInt('0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b');

function modPow(base, exp, mod) {
  let result = 1n;
  base %= mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    base = (base * base) % mod;
    exp >>= 1n;
  }
  return result;
}

function bytesToBigInt(bytes) {
  let value = 0n;
  for (const b of bytes) value = (value << 8n) | BigInt(b);
  return value;
}

function bigIntTo32Bytes(value) {
  const bytes = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    bytes[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  return bytes;
}

function bytesToBase64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// p % 4 == 3, so sqrt(c) = c^((p+1)/4)
function decompressP256(compressed) {
  const x = bytesToBigInt(compressed.subarray(1));
  if (x >= P256_P) return null;
  const y2 = (((modPow(x, 3n, P256_P) - 3n * x % P256_P) % P256_P + P256_P) % P256_P + P256_B) % P256_P;
  const y = modPow(y2, (P256_P + 1n) / 4n, P256_P);
  if ((y * y) % P256_P !== y2) return null;
  const yParity = BigInt(compressed[0] & 1);
  return { x, y: (y & 1n) === yParity ? y : P256_P - y };
}

// Returns null for encodings or curves other than multicodec p256-pub; dokieli only encrypts to P-256
export function multikeyToJWK(multibase) {
  if (typeof multibase !== 'string' || !multibase.startsWith('z')) return null;
  let data;
  try {
    data = base58btcDecode(multibase.slice(1));
  } catch {
    return null;
  }
  if (data.length < 2 || data[0] !== 0x80 || data[1] !== 0x24) return null;
  const key = data.subarray(2);
  let x, y;
  if (key.length === 33 && (key[0] === 2 || key[0] === 3)) {
    const point = decompressP256(key);
    if (!point) return null;
    ({ x, y } = point);
  } else if (key.length === 65 && key[0] === 4) {
    x = bytesToBigInt(key.subarray(1, 33));
    y = bytesToBigInt(key.subarray(33));
  } else {
    return null;
  }
  return {
    kty: 'EC',
    crv: CURVE,
    x: bytesToBase64url(bigIntTo32Bytes(x)),
    y: bytesToBase64url(bigIntTo32Bytes(y))
  };
}

export function getJWEKids(jwe) {
  const kids = new Set();
  let obj = jwe;
  if (typeof jwe === 'string' && jwe.trim().startsWith('{')) {
    try { obj = JSON.parse(jwe); } catch {}
  }
  try {
    const header = decodeProtectedHeader(obj);
    if (header?.kid) kids.add(header.kid);
  } catch {}
  if (obj && typeof obj === 'object') {
    if (obj.header?.kid) kids.add(obj.header.kid);
    if (Array.isArray(obj.recipients)) {
      obj.recipients.forEach(r => { if (r?.header?.kid) kids.add(r.header.kid); });
    }
  }
  return [...kids];
}

export function isJWE(content) {
  if (typeof content !== 'string') return false;
  const trimmed = content.trim();
  if (/^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]*\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(trimmed)) {
    return true;
  }
  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === 'object' && parsed !== null
      && 'ciphertext' in parsed && 'protected' in parsed;
  } catch {
    return false;
  }
}
