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

import { CompactEncrypt, compactDecrypt, GeneralEncrypt, generalDecrypt } from 'jose'

const CURVE = 'P-256'
const ENC = 'A256GCM'
const KDF_ITERATIONS = 600_000

// Generates an ECDH P-256 keypair and a random key ID.
// extractable:true on the private key is required for wrapKey during keystore creation;
// subsequent sessions import the private key as non-extractable via unwrapPrivateKey.
export async function generateEncryptionKeypair() {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: CURVE },
    true,
    ['deriveBits']
  )
  const kid = crypto.randomUUID()
  return { publicKey, privateKey, kid }
}

export async function exportPublicKeyJWK(publicKey, kid) {
  const jwk = await crypto.subtle.exportKey('jwk', publicKey)
  return kid ? { ...jwk, kid } : jwk
}

export async function importPublicKeyJWK(jwk) {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: CURVE },
    true,
    []
  )
}

// Imports private key as non-extractable so it cannot be re-exported from session memory.
export async function importPrivateKeyJWK(jwk) {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: CURVE },
    false,
    ['deriveBits']
  )
}

// Derives a 256-bit AES-GCM key-encryption key from a passphrase + random salt via PBKDF2.
export async function deriveKEK(passphrase, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: KDF_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  )
}

// Wraps (encrypts) a private CryptoKey using AES-GCM with the given KEK.
// Returns the ciphertext buffer and the IV used; both must be stored alongside the keystore.
export async function wrapPrivateKey(privateKey, kek) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const wrappedKey = await crypto.subtle.wrapKey('jwk', privateKey, kek, { name: 'AES-GCM', iv })
  return { wrappedKey, iv }
}

// Unwraps a stored private key. The result is non-extractable (deriveKey usage only).
export async function unwrapPrivateKey(wrappedKey, iv, kek) {
  return crypto.subtle.unwrapKey(
    'jwk',
    wrappedKey,
    kek,
    { name: 'AES-GCM', iv },
    { name: 'ECDH', namedCurve: CURVE },
    false,
    ['deriveBits']
  )
}

// Encrypts plaintext to one or more recipient public keys (CryptoKey[]).
// Single recipient → compact JWE string (ECDH-ES direct key agreement).
// Multiple recipients → serialised general JWE JSON string (ECDH-ES+A256KW per recipient,
// so all recipients share one random CEK wrapped independently for each).
// kid identifies which recipient key was used and is stored in the per-recipient header.
export async function encryptContent(plaintext, recipientPublicKeys, kid) {
  const data = new TextEncoder().encode(plaintext)

  if (recipientPublicKeys.length === 1) {
    const header = { alg: 'ECDH-ES', enc: ENC }
    if (kid) header.kid = kid
    return new CompactEncrypt(data)
      .setProtectedHeader(header)
      .encrypt(recipientPublicKeys[0])
  }

  const ge = new GeneralEncrypt(data).setProtectedHeader({ enc: ENC })
  for (const pubKey of recipientPublicKeys) {
    const recipientHeader = { alg: 'ECDH-ES+A256KW' }
    if (kid) recipientHeader.kid = kid
    ge.addRecipient(pubKey).setUnprotectedHeader(recipientHeader)
  }
  return JSON.stringify(await ge.encrypt())
}

// Decrypts a compact JWE string or a serialised general JWE JSON string.
// privateKey must be a CryptoKey with deriveKey usage.
export async function decryptContent(jwe, privateKey) {
  const trimmed = typeof jwe === 'string' ? jwe.trim() : jwe
  if (typeof trimmed === 'string' && trimmed.startsWith('{')) {
    const { plaintext } = await generalDecrypt(JSON.parse(trimmed), privateKey)
    return new TextDecoder().decode(plaintext)
  }
  const { plaintext } = await compactDecrypt(trimmed, privateKey)
  return new TextDecoder().decode(plaintext)
}

// Returns true when content looks like a compact JWE (five dot-separated base64url segments)
// or a general JWE JSON object (has both "ciphertext" and "protected" keys).
export function isJWE(content) {
  if (typeof content !== 'string') return false
  const trimmed = content.trim()
  if (/^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]*\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(trimmed)) {
    return true
  }
  try {
    const parsed = JSON.parse(trimmed)
    return typeof parsed === 'object' && parsed !== null
      && 'ciphertext' in parsed && 'protected' in parsed
  } catch {
    return false
  }
}
