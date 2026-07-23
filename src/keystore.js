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

import rdf from 'rdf-ext';
import Config from './config.js';
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
} from './crypto.js';
import { getEncryptedKeystore, setEncryptedKeystore, updateDeviceStorageProfile } from './storage.js';
import { getResource, putResource, postResource, patchResourceWithAcceptPatch } from './fetcher.js';
import { getResourceGraph, getLinkRelationFromHead } from './graph.js';
import { forceTrailingSlash, stripFragmentFromString } from './uri.js';
import { escapeRDFLiteral, generateUUID } from './util.js';

// Non-extractable private keys by kid; sessionKid is the current key used for new encryption
let sessionPrivateKeys = new Map();
let sessionPublicKey = null;
let sessionPublicKeyJWK = null;
let sessionKid = null;

let cachedKeystoreURL = null;
let podChecked = false;

function buildKeystoreBundle(kid, publicKeyJWK, jwe, created) {
  const now = new Date().toISOString();
  return {
    version: 2,
    kid,
    publicKeyJWK,
    wrappings: [{ type: 'passphrase', jwe }],
    created: created || now,
    modified: now
  };
}

function isValidBundle(bundle) {
  if (!bundle || typeof bundle !== 'object' || !bundle.kid || !bundle.publicKeyJWK) return false;
  if (bundle.version === 2) {
    return Array.isArray(bundle.wrappings) && bundle.wrappings.some(w => w.type === 'passphrase' && w.jwe);
  }
  return bundle.version === 1 && !!(bundle.wrappedKey && bundle.iv && bundle.salt);
}

function keyContainerURL() {
  const storage = Config.User?.Storage?.[0];
  return storage ? forceTrailingSlash(storage) + 'key/' : null;
}

function keyResourceURL(kid) {
  const container = keyContainerURL();
  return container && kid ? container + encodeURIComponent(kid) + '.json' : null;
}

async function readKeystoreDiscoveryTriple() {
  const webid = Config.User?.IRI;
  if (!webid) return undefined;
  let graph = Config.User.Preferences?.graph;
  if (!graph) {
    const prefsFile = Config.User.PreferencesFile?.[0];
    if (!prefsFile) return undefined;
    try {
      ({ graph } = await getResourceGraph(prefsFile));
    } catch {
      return undefined;
    }
  }
  try {
    return graph?.node(rdf.namedNode(webid)).out(Config.ns.dokieli.keystore).values[0];
  } catch {
    return undefined;
  }
}

function findKeyContainer() {
  const forClass = Config.ns.dokieli.EncryptionKey.value;
  const ti = Config.User?.TypeIndex || {};
  const entries = {
    ...(ti[Config.ns.solid.privateTypeIndex.value] || {}),
    ...(ti[Config.ns.solid.publicTypeIndex.value] || {})
  };
  for (const entry of Object.values(entries)) {
    if (entry[Config.ns.solid.forClass.value] === forClass) {
      return entry[Config.ns.solid.instanceContainer.value] || entry[Config.ns.solid.instance.value] || null;
    }
  }
  return null;
}

async function listKeyResources(containerURL) {
  try {
    const { graph } = await getResourceGraph(containerURL);
    const values = graph?.node(rdf.namedNode(containerURL)).out(Config.ns.ldp.contains).values || [];
    return values.filter(v => v.endsWith('.json'));
  } catch {
    return [];
  }
}

//XXX: single active key for now (members[0]); selecting by kid can come later
async function resolveKeystoreResourceURL() {
  if (cachedKeystoreURL) return cachedKeystoreURL;
  const container = findKeyContainer();
  if (container) {
    const members = await listKeyResources(container);
    if (members.length) {
      cachedKeystoreURL = members[0];
      Config.User.Encryption.KeystoreURL = members[0];
      return members[0];
    }
  }
  const legacy = await readKeystoreDiscoveryTriple();
  if (legacy) {
    cachedKeystoreURL = legacy;
    Config.User.Encryption.KeystoreURL = legacy;
    return legacy;
  }
  return null;
}

async function fetchPodKeystore() {
  if (!Config.Session?.isActive) return null;
  try {
    const url = await resolveKeystoreResourceURL();
    if (!url) return null;
    const response = await getResource(url, { 'Accept': 'application/json' }, { noCache: true });
    const bundle = await response.json();
    return isValidBundle(bundle) ? bundle : null;
  } catch {
    return null;
  }
}

async function fetchAllPodKeystoreBundles() {
  if (!Config.Session?.isActive) return [];
  const container = findKeyContainer();
  if (!container) {
    const one = await fetchPodKeystore();
    return one ? [one] : [];
  }
  const members = await listKeyResources(container);
  const bundles = [];
  for (const url of members) {
    try {
      const response = await getResource(url, { 'Accept': 'application/json' }, { noCache: true });
      const bundle = await response.json();
      if (isValidBundle(bundle)) bundles.push(bundle);
    } catch {}
  }
  return bundles;
}

async function loadAllKeystoreBundles() {
  const byKid = new Map();
  for (const bundle of await fetchAllPodKeystoreBundles()) byKid.set(bundle.kid, bundle);
  const local = await getEncryptedKeystore();
  if (local && !byKid.has(local.kid)) byKid.set(local.kid, local);
  return [...byKid.values()];
}

// Some servers do not create intermediate containers on PUT
function createKeystoreContainer(keystoreURL) {
  const container = keystoreURL.substring(0, keystoreURL.lastIndexOf('/') + 1);
  const root = forceTrailingSlash(Config.User.Storage[0]);
  const slug = container.replace(root, '').replace(/\/$/, '');
  return postResource(root, slug, '', 'text/turtle', '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"');
}

// Read-only acl:default keeps key resources immutable once written; new keys get fresh URLs
async function setKeystoreContainerACL(containerURL) {
  const [aclURL] = await getLinkRelationFromHead('acl', containerURL);
  const user = Config.User.IRI;
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
`;
  return putResource(aclURL, data, 'text/turtle; charset=utf-8');
}

//XXX: mirrors registerAnnotationInTypeIndex in activity.js; share a helper once the import cycle is untangled
async function registerKeyContainer(containerURL) {
  const priv = Config.User?.PrivateTypeIndex;
  const pub = Config.User?.PublicTypeIndex;
  const usePrivate = priv?.length && Config.Session?.isActive;
  const typeIndexIRI = usePrivate ? priv[0] : pub?.[0];
  if (!typeIndexIRI) return null;
  if (findKeyContainer()) return null;

  const forClass = Config.ns.dokieli.EncryptionKey.value;
  const registrationId = generateUUID();
  const insert = `<#${registrationId}> a <${Config.ns.solid.TypeRegistration.value}> ;
  <${Config.ns.solid.forClass.value}> <${forClass}> ;
  <${Config.ns.solid.instanceContainer.value}> <${containerURL}> .`;

  await patchResourceWithAcceptPatch(typeIndexIRI, [{ insert }]);

  const typeIndexType = usePrivate ? Config.ns.solid.privateTypeIndex.value : Config.ns.solid.publicTypeIndex.value;
  Config.User.TypeIndex = Config.User.TypeIndex || {};
  Config.User.TypeIndex[typeIndexType] = Config.User.TypeIndex[typeIndexType] || {};
  Config.User.TypeIndex[typeIndexType][`${typeIndexIRI}#${registrationId}`] = {
    [Config.ns.solid.forClass.value]: forClass,
    [Config.ns.solid.instanceContainer.value]: containerURL
  };
  updateDeviceStorageProfile(Config.User);
  return containerURL;
}

// If-None-Match guards against clobbering a key created by another device
async function savePodKeystore(bundle, { ifNoneMatch = false } = {}) {
  if (!Config.Session?.isActive) return null;
  let url = await resolveKeystoreResourceURL();
  if (!url) {
    url = keyResourceURL(bundle.kid);
    if (!url) return null;
    cachedKeystoreURL = url;
    Config.User.Encryption.KeystoreURL = url;
  }

  const data = JSON.stringify(bundle, null, 2);
  const options = ifNoneMatch ? { headers: { 'If-None-Match': '*' } } : {};

  try {
    await putResource(url, data, 'application/json', null, options);
  } catch (e) {
    if (e.status === 412) {
      console.warn('dokieli: keystore already exists on pod; local copy kept', e);
      return null;
    }
    if (e.status !== 404 && e.status !== 409) throw e;
    await createKeystoreContainer(url);
    await putResource(url, data, 'application/json', null, ifNoneMatch ? { headers: { 'If-None-Match': '*' } } : {});
  }

  const container = keyContainerURL() || url.substring(0, url.lastIndexOf('/') + 1);
  await setKeystoreContainerACL(container).catch(e => console.warn('dokieli: keystore container ACL not set', e));
  await registerKeyContainer(container).catch(e => console.warn('dokieli: keystore type-index registration not written', e));
  return url;
}

// Unreleased v1 bundles used PBKDF2 + AES-GCM key wrapping
async function migrateV1Bundle(bundle, passphrase) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const kek = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: b64ToBuf(bundle.salt),
      iterations: bundle.kdfIterations || 600000,
      hash: bundle.kdfHash || 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['unwrapKey']
  );
  const privateKey = await crypto.subtle.unwrapKey(
    'jwk',
    b64ToBuf(bundle.wrappedKey),
    kek,
    { name: 'AES-GCM', iv: b64ToBuf(bundle.iv) },
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  return exportPrivateKeyJWK(privateKey, bundle.kid);
}

export async function createKeystore(passphrase) {
  const { publicKey, privateKey, kid } = await generateEncryptionKeypair();
  const publicKeyJWK = await exportPublicKeyJWK(publicKey, kid);
  const privateKeyJWK = await exportPrivateKeyJWK(privateKey, kid);
  const jwe = await wrapPrivateKeyJWK(privateKeyJWK, passphrase);
  const bundle = buildKeystoreBundle(kid, publicKeyJWK, jwe);

  await setEncryptedKeystore(bundle);
  Config.User.Encryption.PodSyncFailed = false;
  try {
    await savePodKeystore(bundle, { ifNoneMatch: true });
  } catch (e) {
    Config.User.Encryption.PodSyncFailed = true;
    console.warn('dokieli: keystore saved locally; pod save failed', e);
  }

  sessionPrivateKeys.set(kid, await importPrivateKeyJWK(privateKeyJWK));
  sessionPublicKey = publicKey;
  sessionPublicKeyJWK = publicKeyJWK;
  sessionKid = kid;

  return publicKeyJWK;
}

async function unwrapBundle(bundle, passphrase) {
  if (bundle.version === 1) {
    const privateKeyJWK = await migrateV1Bundle(bundle, passphrase);
    const jwe = await wrapPrivateKeyJWK(privateKeyJWK, passphrase);
    return { privateKeyJWK, bundle: buildKeystoreBundle(bundle.kid, bundle.publicKeyJWK, jwe, bundle.created) };
  }
  const wrapping = bundle.wrappings.find(w => w.type === 'passphrase');
  return { privateKeyJWK: await unwrapPrivateKeyJWK(wrapping.jwe, passphrase), bundle };
}

// Unlocks every key the user holds so content encrypted to a past key stays decryptable
export async function unlockKeystore(passphrase) {
  const bundles = await loadAllKeystoreBundles();
  if (!bundles.length) throw new Error('No keystore found. Set up encryption first.');

  const local = await getEncryptedKeystore();
  const currentKid = local?.kid
    || bundles.slice().sort((a, b) => (b.created || '').localeCompare(a.created || ''))[0].kid;

  const keys = new Map();
  const jwkByKid = new Map();
  const bundleByKid = new Map();
  for (const b of bundles) {
    try {
      const { privateKeyJWK, bundle } = await unwrapBundle(b, passphrase);
      keys.set(bundle.kid, await importPrivateKeyJWK(privateKeyJWK));
      jwkByKid.set(bundle.kid, bundle.publicKeyJWK);
      bundleByKid.set(bundle.kid, bundle);
    } catch {}
  }
  if (!keys.size) throw new Error('Unable to unlock keystore with the given passphrase.');

  sessionPrivateKeys = keys;
  sessionKid = keys.has(currentKid) ? currentKid : keys.keys().next().value;
  sessionPublicKeyJWK = jwkByKid.get(sessionKid) || null;
  sessionPublicKey = sessionPublicKeyJWK ? await importPublicKeyJWK(sessionPublicKeyJWK) : null;

  const currentBundle = bundleByKid.get(sessionKid) || null;
  if (currentBundle && (!local || local.kid !== currentBundle.kid || local.modified !== currentBundle.modified)) {
    await setEncryptedKeystore(currentBundle);
  }

  // Sync the pod copy when missing or stale (signed-out setup now signed in, or v1 just migrated)
  if (currentBundle) {
    fetchPodKeystore()
      .then(pod => {
        if (!pod || pod.modified !== currentBundle.modified) {
          return savePodKeystore(currentBundle, { ifNoneMatch: !pod });
        }
      })
      .catch(e => console.warn('dokieli: keystore pod sync failed', e));
  }
}

export async function publishPublicKeyToProfile() {
  if (!Config.Session?.isActive || !Config.User?.IRI || !sessionPublicKeyJWK) return null;
  const webid = Config.User.IRI;
  const profileDoc = stripFragmentFromString(webid);
  const keyIRI = `${profileDoc}#key-${sessionKid}`;
  const published = Config.User.Graph?.out(Config.ns.sec.keyAgreementMethod).values || [];
  if (published.includes(keyIRI)) return null;

  const jwk = escapeRDFLiteral(JSON.stringify(sessionPublicKeyJWK));
  // sec:JsonWebKey is the CID v1.0 verification method type
  const insert = `<${webid}> <${Config.ns.sec.keyAgreementMethod.value}> <${keyIRI}> .
<${keyIRI}> a <${Config.ns.sec.JsonWebKey.value}> ;
  <${Config.ns.sec.controller.value}> <${webid}> ;
  <${Config.ns.sec.publicKeyJwk.value}> "${jwk}"^^<http://www.w3.org/1999/02/22-rdf-syntax-ns#JSON> .`;

  return patchResourceWithAcceptPatch(profileDoc, [{ insert }]);
}

export function lockKeystore() {
  sessionPrivateKeys = new Map();
  sessionPublicKey = null;
  sessionPublicKeyJWK = null;
  sessionKid = null;
  cachedKeystoreURL = null;
  podChecked = false;
}

export function isUnlocked() {
  return sessionPrivateKeys.size > 0;
}

export function getSessionPrivateKey(kid) {
  return sessionPrivateKeys.get(kid || sessionKid) || null;
}

// Selects the key by the JWE's kid, falling back to trying each held key
export async function decryptWithSession(jwe) {
  for (const kid of getJWEKids(jwe)) {
    const key = sessionPrivateKeys.get(kid);
    if (key) return decryptContent(jwe, key);
  }
  let lastError;
  for (const key of sessionPrivateKeys.values()) {
    try { return await decryptContent(jwe, key); } catch (e) { lastError = e; }
  }
  throw lastError || new Error('No unlocked key can decrypt this content.');
}

export function getSessionPublicKey() {
  return sessionPublicKey;
}

export function getSessionPublicKeyJWK() {
  return sessionPublicKeyJWK;
}

export function getSessionKid() {
  return sessionKid;
}

// Probes the pod once per session so a new device gets the unlock prompt instead of setup
export async function hasKeystore() {
  if (await getEncryptedKeystore()) return true;
  if (podChecked || !Config.Session?.isActive) return false;
  podChecked = true;
  const pod = await fetchPodKeystore();
  if (pod) {
    await setEncryptedKeystore(pod);
    return true;
  }
  return false;
}

function b64ToBuf(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
