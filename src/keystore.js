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

import {
  generateEncryptionKeypair,
  exportPublicKeyJWK,
  importPublicKeyJWK,
  deriveKEK,
  wrapPrivateKey,
  unwrapPrivateKey
} from './crypto.js'
import { getEncryptedKeystore, setEncryptedKeystore } from './storage.js'

// In-memory session state. Cleared by lockKeystore() or on sign-out.
// Private key is held as a non-extractable CryptoKey so it cannot be serialised.
let _sessionPrivateKey = null
let _sessionPublicKey = null   // CryptoKey — used to encrypt content
let _sessionPublicKeyJWK = null  // plain JWK — used to publish to WebID profile
let _sessionKid = null

// Creates a new keystore: generates a keypair, derives a KEK from the passphrase,
// wraps the private key, and persists the encrypted bundle to IndexedDB.
// Returns the public key JWK so the caller can publish it to the WebID profile.
export async function createKeystore(passphrase) {
  const { publicKey, privateKey, kid } = await generateEncryptionKeypair()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const kek = await deriveKEK(passphrase, salt)
  const { wrappedKey, iv } = await wrapPrivateKey(privateKey, kek)
  const publicKeyJWK = await exportPublicKeyJWK(publicKey, kid)

  const keystore = {
    version: 1,
    kid,
    publicKeyJWK,
    wrappedKey: bufToB64(wrappedKey),
    iv: bufToB64(iv),
    salt: bufToB64(salt),
    kdf: 'PBKDF2',
    kdfHash: 'SHA-256',
    kdfIterations: 600_000,
    created: new Date().toISOString()
  }

  await setEncryptedKeystore(keystore)

  _sessionPrivateKey = privateKey
  _sessionPublicKey = publicKey
  _sessionPublicKeyJWK = publicKeyJWK
  _sessionKid = kid

  return publicKeyJWK
}

// Loads the encrypted keystore from IndexedDB, derives the KEK from the passphrase,
// and unwraps the private key into session memory.
// Throws if no keystore exists or if the passphrase is wrong (unwrap will reject).
export async function unlockKeystore(passphrase) {
  const keystore = await getEncryptedKeystore()
  if (!keystore) throw new Error('No keystore found. Set up encryption first.')

  const salt = b64ToBuf(keystore.salt)
  const iv = b64ToBuf(keystore.iv)
  const wrappedKey = b64ToBuf(keystore.wrappedKey)

  const kek = await deriveKEK(passphrase, salt)
  const privateKey = await unwrapPrivateKey(wrappedKey, iv, kek)
  const publicKey = await importPublicKeyJWK(keystore.publicKeyJWK)

  _sessionPrivateKey = privateKey
  _sessionPublicKey = publicKey
  _sessionPublicKeyJWK = keystore.publicKeyJWK
  _sessionKid = keystore.kid
}

// Clears all in-memory key material. Call on sign-out or explicit lock.
export function lockKeystore() {
  _sessionPrivateKey = null
  _sessionPublicKey = null
  _sessionPublicKeyJWK = null
  _sessionKid = null
}

export function isUnlocked() {
  return _sessionPrivateKey !== null
}

// Returns the in-memory private CryptoKey for decryption, or null if locked.
export function getSessionPrivateKey() {
  return _sessionPrivateKey
}

// Returns the in-memory public CryptoKey for encryption, or null if locked.
export function getSessionPublicKey() {
  return _sessionPublicKey
}

// Returns the public key as a plain JWK object (for publishing to a WebID profile).
export function getSessionPublicKeyJWK() {
  return _sessionPublicKeyJWK
}

export function getSessionKid() {
  return _sessionKid
}

export async function hasKeystore() {
  const keystore = await getEncryptedKeystore()
  return keystore != null
}

function bufToB64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer instanceof ArrayBuffer ? buffer : buffer.buffer)))
}

function b64ToBuf(b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}
