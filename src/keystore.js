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
  unwrapPrivateKeyJWK,
  decryptContent,
  getJWEKids
} from './crypto.js'
import { getEncryptedKeystore, setEncryptedKeystore, updateDeviceStorageProfile } from './storage.js'
import { getResource, putResource, postResource, patchResourceWithAcceptPatch } from './fetcher.js'
import { getResourceGraph, getLinkRelationFromHead } from './graph.js'
import { forceTrailingSlash, stripFragmentFromString } from './uri.js'
import { escapeRDFLiteral, generateUUID } from './util.js'

// In-memory session state. Cleared by lockKeystore() or on sign-out.
// Private keys are held as non-extractable CryptoKeys so they cannot be serialised.
// Every key the user has ever held is unlocked (kid -> CryptoKey) so past content
// stays decryptable; _sessionKid names the current key used for new encryption.
let _sessionPrivateKeys = new Map()  // kid -> non-extractable CryptoKey
let _sessionPublicKey = null   // CryptoKey (current) — used to encrypt content
let _sessionPublicKeyJWK = null  // plain JWK (current) — used to publish to WebID profile
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

// The container that holds one JWE key resource per kid; the collection itself.
function keyContainerURL() {
  const storage = Config.User?.Storage?.[0]
  return storage ? forceTrailingSlash(storage) + 'key/' : null
}

// Key resources are named by kid (a public JWK thumbprint, already advertised on the
// WebID profile), so a specific key is a direct GET — no container scan, no trial unlock.
function keyResourceURL(kid) {
  const container = keyContainerURL()
  return container && kid ? container + encodeURIComponent(kid) + '.json' : null
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

// Reads the key container IRI from the loaded private/public type index, or null.
function findKeyContainer() {
  const forClass = Config.ns.dokieli.EncryptionKey.value
  const ti = Config.User?.TypeIndex || {}
  const entries = {
    ...(ti[Config.ns.solid.privateTypeIndex.value] || {}),
    ...(ti[Config.ns.solid.publicTypeIndex.value] || {})
  }
  for (const entry of Object.values(entries)) {
    if (entry[Config.ns.solid.forClass.value] === forClass) {
      return entry[Config.ns.solid.instanceContainer.value] || entry[Config.ns.solid.instance.value] || null
    }
  }
  return null
}

// Lists the .json key resources in the container (ldp:contains); [] on any error.
async function listKeyResources(containerURL) {
  try {
    const { graph } = await getResourceGraph(containerURL)
    const values = graph?.node(rdf.namedNode(containerURL)).out(Config.ns.ldp.contains).values || []
    return values.filter(v => v.endsWith('.json'))
  } catch {
    return []
  }
}

// Resolves the current keystore resource URL (session cache → type-index container
// listing → legacy preferences triple); null when unknown. Does not mint.
// XXX: single active key for now — members[0]; phase D selects by kid.
async function resolveKeystoreResourceURL() {
  if (cachedKeystoreURL) return cachedKeystoreURL
  const container = findKeyContainer()
  if (container) {
    const members = await listKeyResources(container)
    if (members.length) {
      cachedKeystoreURL = members[0]
      Config.User.Encryption.KeystoreURL = members[0]
      return members[0]
    }
  }
  const legacy = await readKeystoreDiscoveryTriple()
  if (legacy) {
    cachedKeystoreURL = legacy
    Config.User.Encryption.KeystoreURL = legacy
    return legacy
  }
  return null
}

// null when signed out, no pod, missing resource, network error, or invalid bundle.
async function fetchPodKeystore() {
  if (!Config.Session?.isActive) return null
  try {
    const url = await resolveKeystoreResourceURL()
    if (!url) return null
    const response = await getResource(url, { 'Accept': 'application/json' }, { noCache: true })
    const bundle = await response.json()
    return isValidBundle(bundle) ? bundle : null
  } catch {
    return null
  }
}

// Every valid key bundle in the pod container (one per kid). Falls back to the
// single-resource lookup when there is no type-index container (legacy/migration).
async function fetchAllPodKeystoreBundles() {
  if (!Config.Session?.isActive) return []
  const container = findKeyContainer()
  if (!container) {
    const one = await fetchPodKeystore()
    return one ? [one] : []
  }
  const members = await listKeyResources(container)
  const bundles = []
  for (const url of members) {
    try {
      const response = await getResource(url, { 'Accept': 'application/json' }, { noCache: true })
      const bundle = await response.json()
      if (isValidBundle(bundle)) bundles.push(bundle)
    } catch { /* skip unreadable/invalid member */ }
  }
  return bundles
}

// All known key bundles (pod container ∪ local cache), deduped by kid. The local
// cache holds only the current key, so full history relies on the pod copy.
async function loadAllKeystoreBundles() {
  const byKid = new Map()
  for (const bundle of await fetchAllPodKeystoreBundles()) byKid.set(bundle.kid, bundle)
  const local = await getEncryptedKeystore()
  if (local && !byKid.has(local.kid)) byKid.set(local.kid, local)
  return [...byKid.values()]
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

// Registers the key container in the type index (private preferred, public fallback),
// keyed by dokieli:EncryptionKey via solid:instanceContainer. Idempotent per class;
// null when signed out or no type index is available.
// XXX: duplicates the shape of activity.js registerAnnotationInTypeIndex — a shared
// helper is a worthwhile follow-up once the keystore↔activity import cycle is untangled.
async function registerKeyContainer(containerURL) {
  const priv = Config.User?.PrivateTypeIndex
  const pub = Config.User?.PublicTypeIndex
  const usePrivate = priv?.length && Config.Session?.isActive
  const typeIndexIRI = usePrivate ? priv[0] : pub?.[0]
  if (!typeIndexIRI) return null
  if (findKeyContainer()) return null

  const forClass = Config.ns.dokieli.EncryptionKey.value
  const registrationId = generateUUID()
  const insert = `<#${registrationId}> a <${Config.ns.solid.TypeRegistration.value}> ;
  <${Config.ns.solid.forClass.value}> <${forClass}> ;
  <${Config.ns.solid.instanceContainer.value}> <${containerURL}> .`

  await patchResourceWithAcceptPatch(typeIndexIRI, [{ insert }])

  const typeIndexType = usePrivate ? Config.ns.solid.privateTypeIndex.value : Config.ns.solid.publicTypeIndex.value
  Config.User.TypeIndex = Config.User.TypeIndex || {}
  Config.User.TypeIndex[typeIndexType] = Config.User.TypeIndex[typeIndexType] || {}
  Config.User.TypeIndex[typeIndexType][`${typeIndexIRI}#${registrationId}`] = {
    [Config.ns.solid.forClass.value]: forClass,
    [Config.ns.solid.instanceContainer.value]: containerURL
  }
  updateDeviceStorageProfile(Config.User)
  return containerURL
}

// PUT the bundle to the pod, then set the container ACL and type-index registration
// (both warn-only). ifNoneMatch guards against clobbering a key created by another device.
async function savePodKeystore(bundle, { ifNoneMatch = false } = {}) {
  if (!Config.Session?.isActive) return null
  let url = await resolveKeystoreResourceURL()
  if (!url) {
    url = keyResourceURL(bundle.kid)
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

  const container = keyContainerURL() || url.substring(0, url.lastIndexOf('/') + 1)
  await setKeystoreContainerACL(container).catch(e => console.warn('dokieli: keystore container ACL not set', e))
  await registerKeyContainer(container).catch(e => console.warn('dokieli: keystore type-index registration not written', e))
  return url
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

  _sessionPrivateKeys.set(kid, await importPrivateKeyJWK(privateKeyJWK))
  _sessionPublicKey = publicKey
  _sessionPublicKeyJWK = publicKeyJWK
  _sessionKid = kid

  return publicKeyJWK
}

// Unwraps a single bundle to its private JWK with the passphrase. v1 bundles are
// migrated to v2 in place (returns the rewrapped bundle); rejects on wrong passphrase.
async function unwrapBundle(bundle, passphrase) {
  if (bundle.version === 1) {
    const privateKeyJWK = await migrateV1Bundle(bundle, passphrase)
    const jwe = await wrapPrivateKeyJWK(privateKeyJWK, passphrase)
    return { privateKeyJWK, bundle: buildKeystoreBundle(bundle.kid, bundle.publicKeyJWK, jwe, bundle.created) }
  }
  const wrapping = bundle.wrappings.find(w => w.type === 'passphrase')
  return { privateKeyJWK: await unwrapPrivateKeyJWK(wrapping.jwe, passphrase), bundle }
}

// Unlocks every key the user holds (pod container ∪ local cache) into session memory,
// so content encrypted to any current or past key stays decryptable. The current key
// (local cache, else newest by created) is used for new encryption and profile publish.
// Throws if no keystore exists or if the passphrase unlocks none of them.
export async function unlockKeystore(passphrase) {
  const bundles = await loadAllKeystoreBundles()
  if (!bundles.length) throw new Error('No keystore found. Set up encryption first.')

  const local = await getEncryptedKeystore()
  const currentKid = local?.kid
    || bundles.slice().sort((a, b) => (b.created || '').localeCompare(a.created || ''))[0].kid

  const keys = new Map()
  const jwkByKid = new Map()
  const bundleByKid = new Map()  // holds the unwrapped (possibly v1→v2 rewrapped) form
  for (const b of bundles) {
    try {
      const { privateKeyJWK, bundle } = await unwrapBundle(b, passphrase)
      keys.set(bundle.kid, await importPrivateKeyJWK(privateKeyJWK))
      jwkByKid.set(bundle.kid, bundle.publicKeyJWK)
      bundleByKid.set(bundle.kid, bundle)
    } catch { /* wrong passphrase for this bundle or corrupt; skip */ }
  }
  if (!keys.size) throw new Error('Unable to unlock keystore with the given passphrase.')

  _sessionPrivateKeys = keys
  _sessionKid = keys.has(currentKid) ? currentKid : keys.keys().next().value
  _sessionPublicKeyJWK = jwkByKid.get(_sessionKid) || null
  _sessionPublicKey = _sessionPublicKeyJWK ? await importPublicKeyJWK(_sessionPublicKeyJWK) : null

  // Cache the current key locally (its migrated v2 form when v1) so reloads and a fresh
  // device work without a pod round-trip; only refresh when it actually changed.
  const currentBundle = bundleByKid.get(_sessionKid) || null
  if (currentBundle && (!local || local.kid !== currentBundle.kid || local.modified !== currentBundle.modified)) {
    await setEncryptedKeystore(currentBundle)
  }

  // Upload the current bundle when the pod copy is missing or stale (signed-out setup now
  // signed in, or v1 just migrated). Only the current key is synced from this device.
  if (currentBundle) {
    fetchPodKeystore()
      .then(pod => {
        if (!pod || pod.modified !== currentBundle.modified) {
          return savePodKeystore(currentBundle, { ifNoneMatch: !pod })
        }
      })
      .catch(e => console.warn('dokieli: keystore pod sync failed', e))
  }
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
  _sessionPrivateKeys = new Map()
  _sessionPublicKey = null
  _sessionPublicKeyJWK = null
  _sessionKid = null
  cachedKeystoreURL = null
  podChecked = false
}

export function isUnlocked() {
  return _sessionPrivateKeys.size > 0
}

// Returns an unlocked private CryptoKey: the one for kid, or the current key when
// kid is omitted; null if not held or locked.
export function getSessionPrivateKey(kid) {
  return _sessionPrivateKeys.get(kid || _sessionKid) || null
}

// Decrypts a JWE with whichever unlocked key it was encrypted to (selected by the
// JWE's kid; falls back to trying each held key). Rejects if none can decrypt it.
export async function decryptWithSession(jwe) {
  for (const kid of getJWEKids(jwe)) {
    const key = _sessionPrivateKeys.get(kid)
    if (key) return decryptContent(jwe, key)
  }
  let lastError
  for (const key of _sessionPrivateKeys.values()) {
    try { return await decryptContent(jwe, key) } catch (e) { lastError = e }
  }
  throw lastError || new Error('No unlocked key can decrypt this content.')
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
