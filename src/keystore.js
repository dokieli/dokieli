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

import rdf from 'rdf-ext'
import Config from './config.js'
import {
  generateEncryptionKeypair,
  exportPublicKeyJWK,
  exportPrivateKeyJWK,
  importPublicKeyJWK,
  importPrivateKeyJWK,
  wrapPrivateKeyJWK,
  unwrapPrivateKeyJWK
} from './crypto.js'
import { getEncryptedKeystore, setEncryptedKeystore, setOrphanedEncryptedKeystore } from './storage.js'
import { getResource, putResource, postResource, patchResourceWithAcceptPatch } from './fetcher.js'
import { getResourceGraph, getLinkRelationFromHead } from './graph.js'
import { forceTrailingSlash, stripFragmentFromString } from './uri.js'
import { escapeRDFLiteral, generateUUID } from './util.js'

// In-memory session state. Cleared by lockKeystore() or on sign-out.
// Private key is held as a non-extractable CryptoKey so it cannot be serialised.
let _sessionPrivateKey = null
let _sessionPublicKey = null   // CryptoKey — used to encrypt content
let _sessionPublicKeyJWK = null  // plain JWK — used to publish to WebID profile
let _sessionKid = null

let cachedKeystoreURL = null
let podChecked = false

// The pod copy (a v2 bundle) is the source of truth; IndexedDB is a cache.
function buildKeystoreBundle(kid, publicKeyJWK, jwe, created) {
  const now = new Date().toISOString()
  return {
    version: 2,
    kid,
    publicKeyJWK,
    wrappings: [{ type: 'passphrase', jwe }],
    created: created || now,
    modified: now
  }
}

function isValidBundle(bundle) {
  if (!bundle || typeof bundle !== 'object' || !bundle.kid || !bundle.publicKeyJWK) return false
  if (bundle.version === 2) {
    return Array.isArray(bundle.wrappings) && bundle.wrappings.some(w => w.type === 'passphrase' && w.jwe)
  }
  return bundle.version === 1 && !!(bundle.wrappedKey && bundle.iv && bundle.salt)
}

// Mints a URL for a NEW keystore. The UUID filename is not guessable, so the
// location is only recoverable through the discovery triple written on save;
// there is deliberately no convention-based fallback for lookup.
function mintKeystoreURL() {
  const storage = Config.User?.Storage?.[0]
  return storage ? forceTrailingSlash(storage) + `key/keystore-${generateUUID()}.json` : null
}

async function readKeystoreDiscoveryTriple() {
  const webid = Config.User?.IRI
  if (!webid) return undefined
  let graph = Config.User.Preferences?.graph
  if (!graph) {
    const prefsFile = Config.User.PreferencesFile?.[0]
    if (!prefsFile) return undefined
    try {
      ({ graph } = await getResourceGraph(prefsFile))
    } catch {
      return undefined
    }
  }
  try {
    return graph?.node(rdf.namedNode(webid)).out(Config.ns.dokieli.keystore).values[0]
  } catch {
    return undefined
  }
}

// Locates an existing keystore via the preferences triple (or the session cache);
// null when unknown. Does not mint a URL — creation is savePodKeystore's job.
async function discoverKeystoreURL() {
  if (cachedKeystoreURL) return cachedKeystoreURL
  const url = await readKeystoreDiscoveryTriple()
  if (url) {
    cachedKeystoreURL = url
    Config.User.Encryption.KeystoreURL = url
  }
  return url
}

// null when signed out, no pod, missing resource, network error, or invalid bundle.
async function fetchPodKeystore() {
  if (!Config.Session?.isActive) return null
  try {
    const url = await discoverKeystoreURL()
    if (!url) return null
    const response = await getResource(url, { 'Accept': 'application/json' }, { noCache: true })
    const bundle = await response.json()
    return isValidBundle(bundle) ? bundle : null
  } catch {
    return null
  }
}

// Fallback for servers that do not create intermediate containers on PUT.
function createKeystoreContainer(keystoreURL) {
  const container = keystoreURL.substring(0, keystoreURL.lastIndexOf('/') + 1)
  const root = forceTrailingSlash(Config.User.Storage[0])
  const slug = container.replace(root, '').replace(/\/$/, '')
  return postResource(root, slug, '', 'text/turtle', '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"')
}

// Owner gets Read/Append/Control on the key container and Read (via acl:default)
// on every key resource inside it, scoped to any client with an acl:ClientCondition
// (mirroring how dokieli conditions client access elsewhere). Read-only defaults
// make key resources immutable once written: keys are added under fresh URLs,
// never overwritten.
async function setKeystoreContainerACL(containerURL) {
  const [aclURL] = await getLinkRelationFromHead('acl', containerURL)
  const user = Config.User.IRI
  const data = `@prefix acl: <http://www.w3.org/ns/auth/acl#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .

<#owner>
  a acl:Authorization ;
  acl:accessTo <${containerURL}> ;
  acl:agent <${user}> ;
  acl:mode acl:Read, acl:Append, acl:Control ;
  acl:condition <#anyClient> .

<#keys>
  a acl:Authorization ;
  acl:default <${containerURL}> ;
  acl:agent <${user}> ;
  acl:mode acl:Read ;
  acl:condition <#anyClient> .

<#anyClient>
  a acl:ClientCondition ;
  acl:clientClass foaf:Agent .
`
  return putResource(aclURL, data, 'text/turtle; charset=utf-8')
}

// Insert-only; skipped when there is no preferences file or the triple is already current.
async function writeKeystoreDiscovery(keystoreURL) {
  const prefsFile = Config.User?.PreferencesFile?.[0]
  if (!prefsFile) return null
  const current = await readKeystoreDiscoveryTriple()
  if (current === keystoreURL) return null
  const insert = `<${Config.User.IRI}> <${Config.ns.dokieli.keystore.value}> <${keystoreURL}> .`
  return patchResourceWithAcceptPatch(prefsFile, [{ insert }])
}

// PUT the bundle to the pod, then set the ACL and discovery triple (both warn-only).
// ifNoneMatch guards against clobbering a keystore created by another device.
async function savePodKeystore(bundle, { ifNoneMatch = false } = {}) {
  if (!Config.Session?.isActive) return null
  let url = await discoverKeystoreURL()
  if (!url) {
    url = mintKeystoreURL()
    if (!url) return null
    cachedKeystoreURL = url
    Config.User.Encryption.KeystoreURL = url
  }

  const data = JSON.stringify(bundle, null, 2)
  const options = ifNoneMatch ? { headers: { 'If-None-Match': '*' } } : {}

  try {
    await putResource(url, data, 'application/json', null, options)
  } catch (e) {
    if (e.status === 412) {
      console.warn('dokieli: keystore already exists on pod; local copy kept', e)
      return null
    }
    if (e.status !== 404 && e.status !== 409) throw e
    await createKeystoreContainer(url)
    await putResource(url, data, 'application/json', null, ifNoneMatch ? { headers: { 'If-None-Match': '*' } } : {})
  }

  const container = url.substring(0, url.lastIndexOf('/') + 1)
  await setKeystoreContainerACL(container).catch(e => console.warn('dokieli: keystore container ACL not set', e))
  await writeKeystoreDiscovery(url).catch(e => console.warn('dokieli: keystore discovery triple not written', e))
  return url
}

// Pod copy preferred when reachable; refreshes the cache; a divergent local key is preserved.
async function loadKeystoreBundle() {
  const local = await getEncryptedKeystore()
  const pod = await fetchPodKeystore()
  if (pod) {
    if (local && local.kid !== pod.kid) {
      console.warn('dokieli: local keystore kid differs from pod copy; keeping orphaned local copy')
      await setOrphanedEncryptedKeystore(local)
    }
    if (!local || local.kid !== pod.kid || local.modified !== pod.modified) {
      await setEncryptedKeystore(pod)
    }
    return pod
  }
  return local || null
}

// PBKDF2 + AES-GCM unwrap of an unreleased v1 bundle; returns the private JWK for rewrapping.
async function migrateV1Bundle(bundle, passphrase) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  const kek = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: b64ToBuf(bundle.salt),
      iterations: bundle.kdfIterations || 600_000,
      hash: bundle.kdfHash || 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['unwrapKey']
  )
  const privateKey = await crypto.subtle.unwrapKey(
    'jwk',
    b64ToBuf(bundle.wrappedKey),
    kek,
    { name: 'AES-GCM', iv: b64ToBuf(bundle.iv) },
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  )
  return exportPrivateKeyJWK(privateKey, bundle.kid)
}

// Creates a new keystore: generates a keypair, wraps the private JWK as a PBES2 JWE,
// caches the bundle locally, and uploads it to the pod when signed in (warn-only).
// Returns the public key JWK so the caller can publish it to the WebID profile.
export async function createKeystore(passphrase) {
  const { publicKey, privateKey, kid } = await generateEncryptionKeypair()
  const publicKeyJWK = await exportPublicKeyJWK(publicKey, kid)
  const privateKeyJWK = await exportPrivateKeyJWK(privateKey, kid)
  const jwe = await wrapPrivateKeyJWK(privateKeyJWK, passphrase)
  const bundle = buildKeystoreBundle(kid, publicKeyJWK, jwe)

  await setEncryptedKeystore(bundle)
  Config.User.Encryption.PodSyncFailed = false
  try {
    await savePodKeystore(bundle, { ifNoneMatch: true })
  } catch (e) {
    Config.User.Encryption.PodSyncFailed = true
    console.warn('dokieli: keystore saved locally; pod save failed', e)
  }

  _sessionPrivateKey = await importPrivateKeyJWK(privateKeyJWK)
  _sessionPublicKey = publicKey
  _sessionPublicKeyJWK = publicKeyJWK
  _sessionKid = kid

  return publicKeyJWK
}

// Unlocks the keystore (pod copy preferred, local cache fallback) into session memory.
// v1 bundles are migrated to v2 transparently using the entered passphrase.
// Throws if no keystore exists or if the passphrase is wrong.
export async function unlockKeystore(passphrase) {
  let bundle = await loadKeystoreBundle()
  if (!bundle) throw new Error('No keystore found. Set up encryption first.')

  let privateKeyJWK
  if (bundle.version === 1) {
    privateKeyJWK = await migrateV1Bundle(bundle, passphrase)
    const jwe = await wrapPrivateKeyJWK(privateKeyJWK, passphrase)
    bundle = buildKeystoreBundle(bundle.kid, bundle.publicKeyJWK, jwe, bundle.created)
    await setEncryptedKeystore(bundle)
  } else {
    const wrapping = bundle.wrappings.find(w => w.type === 'passphrase')
    privateKeyJWK = await unwrapPrivateKeyJWK(wrapping.jwe, passphrase)
  }

  _sessionPrivateKey = await importPrivateKeyJWK(privateKeyJWK)
  _sessionPublicKey = await importPublicKeyJWK(bundle.publicKeyJWK)
  _sessionPublicKeyJWK = bundle.publicKeyJWK
  _sessionKid = bundle.kid

  // Upload when the pod copy is missing or stale (signed-out setup now signed in, or v1 just migrated).
  fetchPodKeystore()
    .then(pod => {
      if (!pod || pod.modified !== bundle.modified) {
        return savePodKeystore(bundle, { ifNoneMatch: !pod })
      }
    })
    .catch(e => console.warn('dokieli: keystore pod sync failed', e))
}

// Publishes the session public key JWK to the WebID profile (insert-only, idempotent per kid).
// Resolves null when signed out, locked, or the key is already published.
export async function publishPublicKeyToProfile() {
  if (!Config.Session?.isActive || !Config.User?.IRI || !_sessionPublicKeyJWK) return null
  const webid = Config.User.IRI
  const profileDoc = stripFragmentFromString(webid)
  const keyIRI = `${profileDoc}#key-${_sessionKid}`
  const published = Config.User.Graph?.out(Config.ns.sec.keyAgreementMethod).values || []
  if (published.includes(keyIRI)) return null

  const jwk = escapeRDFLiteral(JSON.stringify(_sessionPublicKeyJWK))
  // sec:JsonWebKey is the CID v1.0 verification method type.
  const insert = `<${webid}> <${Config.ns.sec.keyAgreementMethod.value}> <${keyIRI}> .
<${keyIRI}> a <${Config.ns.sec.JsonWebKey.value}> ;
  <${Config.ns.sec.controller.value}> <${webid}> ;
  <${Config.ns.sec.publicKeyJwk.value}> "${jwk}"^^<http://www.w3.org/1999/02/22-rdf-syntax-ns#JSON> .`

  return patchResourceWithAcceptPatch(profileDoc, [{ insert }])
}

// Clears all in-memory key material. Call on sign-out or explicit lock.
export function lockKeystore() {
  _sessionPrivateKey = null
  _sessionPublicKey = null
  _sessionPublicKeyJWK = null
  _sessionKid = null
  cachedKeystoreURL = null
  podChecked = false
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

// Checks the local cache, then (once per session, when signed in) probes the pod
// and seeds the cache so a new device gets the unlock prompt instead of setup.
export async function hasKeystore() {
  if (await getEncryptedKeystore()) return true
  if (podChecked || !Config.Session?.isActive) return false
  podChecked = true
  const pod = await fetchPodKeystore()
  if (pod) {
    await setEncryptedKeystore(pod)
    return true
  }
  return false
}

function b64ToBuf(b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}
