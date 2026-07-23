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
import { getResource, getResourceHead, putResource, postResource, patchResourceWithAcceptPatch } from './fetcher.js';
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

// CID 1.0 JsonWebKey document (section 2.2.3); secretKeyJwk holds the passphrase-wrapped private JWK as a flattened JWE, not a plaintext JWK
function buildKeyDocument(publicKeyJWK, secretKeyJwe) {
  const webid = Config.User?.IRI;
  const doc = {
    '@context': 'https://www.w3.org/ns/cid/v1',
    type: 'JsonWebKey',
    publicKeyJwk: publicKeyJWK,
    secretKeyJwk: secretKeyJwe
  };
  if (webid) {
    doc.id = `${stripFragmentFromString(webid)}#key-${publicKeyJWK.kid}`;
    doc.controller = webid;
  }
  return doc;
}

function isValidKeyDocument(doc) {
  return !!(doc && typeof doc === 'object'
    && (doc.type === 'JsonWebKey' || (Array.isArray(doc.type) && doc.type.includes('JsonWebKey')))
    && doc.publicKeyJwk?.kid
    && doc.secretKeyJwk && typeof doc.secretKeyJwk === 'object' && 'ciphertext' in doc.secretKeyJwk);
}

function keyContainerURL() {
  const storage = Config.User?.Storage?.[0];
  return storage ? forceTrailingSlash(storage) + 'key/' : null;
}

function keyResourceURL(kid) {
  const container = keyContainerURL();
  return container && kid ? container + encodeURIComponent(kid) + '.json' : null;
}

function findKeyContainer() {
  const forClass = Config.ns.sec.JsonWebKey.value;
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
  if (!container) return null;
  const members = await listKeyResources(container);
  if (members.length) {
    cachedKeystoreURL = members[0];
    Config.User.Encryption.KeystoreURL = members[0];
    return members[0];
  }
  return null;
}

// With a kid the resource URL is computed directly; without one it falls back to container discovery
async function fetchPodKeystore(kid) {
  if (!Config.Session?.isActive) return null;
  try {
    const url = kid ? keyResourceURL(kid) : await resolveKeystoreResourceURL();
    if (!url) return null;
    const response = await getResource(url, { 'Accept': 'application/ld+json' }, { noCache: true });
    const doc = await response.json();
    return isValidKeyDocument(doc) ? doc : null;
  } catch {
    return null;
  }
}

async function fetchAllPodKeyDocuments() {
  if (!Config.Session?.isActive) return [];
  const container = findKeyContainer();
  if (!container) return [];
  const members = await listKeyResources(container);
  const docs = [];
  for (const url of members) {
    try {
      const response = await getResource(url, { 'Accept': 'application/ld+json' }, { noCache: true });
      const doc = await response.json();
      if (isValidKeyDocument(doc)) docs.push(doc);
    } catch {}
  }
  return docs;
}

async function loadAllKeyDocuments() {
  const byKid = new Map();
  for (const doc of await fetchAllPodKeyDocuments()) byKid.set(doc.publicKeyJwk.kid, doc);
  const local = await getEncryptedKeystore();
  if (isValidKeyDocument(local) && !byKid.has(local.publicKeyJwk.kid)) byKid.set(local.publicKeyJwk.kid, local);
  return [...byKid.values()];
}

async function ensureKeyContainer() {
  const container = keyContainerURL();
  if (!container) return null;
  try {
    await getResourceHead(container);
  } catch (e) {
    if (e.status !== 404) throw e;
    const root = forceTrailingSlash(Config.User.Storage[0]);
    const slug = container.replace(root, '').replace(/\/$/, '');
    await postResource(root, slug, '', 'text/turtle', '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"');
  }
  return container;
}

// Owner-only. The Read+Write default lets the owner create key resources; each resource then gets its own Read+Control ACL that makes it immutable
async function setKeystoreContainerACL(containerURL) {
  const [aclURL] = await getLinkRelationFromHead('acl', containerURL);
  const user = Config.User.IRI;
  const insert = `<#owner>
  a acl:Authorization ;
  acl:accessTo <${containerURL}> ;
  acl:agent <${user}> ;
  acl:mode acl:Read, acl:Append, acl:Control ;
  acl:condition <#anyClient> .
<#keys>
  a acl:Authorization ;
  acl:default <${containerURL}> ;
  acl:agent <${user}> ;
  acl:mode acl:Read, acl:Write ;
  acl:condition <#anyClient> .
<#anyClient>
  a acl:ClientCondition ;
  acl:clientClass foaf:Agent .`;
  return patchResourceWithAcceptPatch(aclURL, [{ insert }]);
}

// No acl:Write: the key resource cannot be modified or deleted without first changing this ACL via Control
async function setKeyResourceACL(resourceURL) {
  const [aclURL] = await getLinkRelationFromHead('acl', resourceURL);
  const user = Config.User.IRI;
  const insert = `<#owner>
  a acl:Authorization ;
  acl:accessTo <${resourceURL}> ;
  acl:agent <${user}> ;
  acl:mode acl:Read, acl:Control ;
  acl:condition <#anyClient> .
<#anyClient>
  a acl:ClientCondition ;
  acl:clientClass foaf:Agent .`;
  return patchResourceWithAcceptPatch(aclURL, [{ insert }]);
}

//XXX: mirrors registerAnnotationInTypeIndex in activity.js; share a helper once the import cycle is untangled
async function registerKeyContainer(containerURL) {
  const priv = Config.User?.PrivateTypeIndex;
  const pub = Config.User?.PublicTypeIndex;
  const usePrivate = priv?.length && Config.Session?.isActive;
  const typeIndexIRI = usePrivate ? priv[0] : pub?.[0];
  if (!typeIndexIRI) return null;
  if (findKeyContainer()) return null;

  const forClass = Config.ns.sec.JsonWebKey.value;
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

// The container ACL is set before the key upload and failure throws, so the caller keeps the key local-only; If-None-Match guards against clobbering another device's key
async function savePodKeystore(doc, { ifNoneMatch = false } = {}) {
  if (!Config.Session?.isActive) return null;
  const url = keyResourceURL(doc.publicKeyJwk.kid);
  if (!url) return null;

  const container = await ensureKeyContainer();
  await setKeystoreContainerACL(container);

  cachedKeystoreURL = url;
  Config.User.Encryption.KeystoreURL = url;

  const data = JSON.stringify(doc, null, 2);
  const options = ifNoneMatch ? { headers: { 'If-None-Match': '*' } } : {};

  try {
    await putResource(url, data, 'application/ld+json', null, options);
  } catch (e) {
    if (e.status === 412) {
      console.warn('dokieli: keystore already exists on pod; local copy kept', e);
      return null;
    }
    throw e;
  }

  await setKeyResourceACL(url).catch(e => console.warn('dokieli: keystore resource ACL not set; container default still restricts access', e));
  await registerKeyContainer(container).catch(e => console.warn('dokieli: keystore type-index registration not written', e));
  return url;
}

export async function createKeystore(passphrase) {
  const { publicKey, privateKey, kid } = await generateEncryptionKeypair();
  const publicKeyJWK = await exportPublicKeyJWK(publicKey, kid);
  const privateKeyJWK = await exportPrivateKeyJWK(privateKey, kid);
  const jwe = await wrapPrivateKeyJWK(privateKeyJWK, passphrase);
  const doc = buildKeyDocument(publicKeyJWK, jwe);

  await setEncryptedKeystore(doc);
  Config.User.Encryption.PodSyncFailed = false;
  try {
    await savePodKeystore(doc, { ifNoneMatch: true });
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

// Unlocks every key the user holds so content encrypted to a past key stays decryptable
export async function unlockKeystore(passphrase) {
  const docs = await loadAllKeyDocuments();
  if (!docs.length) throw new Error('No keystore found. Set up encryption first.');

  const local = await getEncryptedKeystore();
  const localKid = isValidKeyDocument(local) ? local.publicKeyJwk.kid : null;

  const keys = new Map();
  const docByKid = new Map();
  for (const doc of docs) {
    try {
      const kid = doc.publicKeyJwk.kid;
      const privateKeyJWK = await unwrapPrivateKeyJWK(doc.secretKeyJwk, passphrase);
      keys.set(kid, await importPrivateKeyJWK(privateKeyJWK));
      docByKid.set(kid, doc);
    } catch {}
  }
  if (!keys.size) throw new Error('Unable to unlock keystore with the given passphrase.');

  sessionPrivateKeys = keys;
  sessionKid = (localKid && keys.has(localKid)) ? localKid : keys.keys().next().value;
  sessionPublicKeyJWK = docByKid.get(sessionKid)?.publicKeyJwk || null;
  sessionPublicKey = sessionPublicKeyJWK ? await importPublicKeyJWK(sessionPublicKeyJWK) : null;

  const currentDoc = docByKid.get(sessionKid) || null;
  if (!currentDoc) return;

  // A document created while signed out has no id or controller yet
  let cacheStale = localKid !== sessionKid;
  if (Config.User?.IRI && !currentDoc.controller) {
    currentDoc.controller = Config.User.IRI;
    currentDoc.id = `${stripFragmentFromString(Config.User.IRI)}#key-${sessionKid}`;
    cacheStale = true;
  }
  if (cacheStale) await setEncryptedKeystore(currentDoc);

  // Upload when the pod copy is missing (signed-out setup now signed in); key documents are immutable per kid
  fetchPodKeystore(sessionKid)
    .then(pod => {
      if (!pod) return savePodKeystore(currentDoc, { ifNoneMatch: true });
    })
    .catch(e => console.warn('dokieli: keystore pod sync failed', e));
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
  if (isValidKeyDocument(await getEncryptedKeystore())) return true;
  if (podChecked || !Config.Session?.isActive) return false;
  podChecked = true;
  const pod = await fetchPodKeystore();
  if (pod) {
    await setEncryptedKeystore(pod);
    return true;
  }
  return false;
}
