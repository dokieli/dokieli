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
  generateSigningKeypair,
  exportPublicKeyJWK,
  exportPrivateKeyJWK,
  importPublicKeyJWK,
  importPrivateKeyJWK,
  wrapPrivateKeyJWK,
  unwrapPrivateKeyJWK,
  decryptContent,
  getJWEKids,
  privateKeyJWKToPEM,
  publicKeyJWKToPEM,
  privateKeyPEMToJWK
} from './crypto.js';
import { getEncryptedKeystore, setEncryptedKeystore, updateDeviceStorageProfile } from './storage.js';
import { getResource, getResourceHead, putResource, postResource, patchResourceWithAcceptPatch } from './fetcher.js';
import { getResourceGraph, getLinkRelationFromHead } from './graph.js';
import { agentsWithMode, buildACLContext, planContainerACL, planGrant } from '@dokieli/web-access-control';
import { applyACLPlan, getACLContext } from './wac.js';
import { forceTrailingSlash, stripFragmentFromString } from './uri.js';
import { escapeRDFLiteral, generateUUID } from './util.js';

export const KEY_AGREEMENT = 'keyAgreement';
export const ASSERTION = 'assertion';
const PURPOSES = [KEY_AGREEMENT, ASSERTION];

// Non-extractable private keys by kid; kid is the current key used for new operations of that purpose
function newSession() {
  return { privateKeys: new Map(), publicKey: null, publicKeyJWK: null, kid: null, keystoreURL: null, storageChecked: false };
}

let sessions = { [KEY_AGREEMENT]: newSession(), [ASSERTION]: newSession() };

// Public encryption keys of agents the current document is shared with, by WebID
let documentRecipients = new Map();

const CID_CONTEXT = 'https://www.w3.org/ns/cid/v1';

// Keys predating the signing work carry no use, and everything back then was for key agreement
function purposeOf(doc) {
  return doc?.publicKeyJwk?.use === 'sig' ? ASSERTION : KEY_AGREEMENT;
}

function keyConfig(purpose) {
  const keys = Config.User?.Keys;
  return (purpose === ASSERTION ? keys?.Signing : keys?.Encryption) || {};
}

// CID 1.0 JsonWebKey document (section 2.2.3); secretKeyJwk holds the passphrase-wrapped private JWK as a flattened JWE, not a plaintext JWK
function buildKeyDocument(publicKeyJWK, secretKeyJwe) {
  const webid = Config.User?.IRI;
  const doc = {
    '@context': CID_CONTEXT,
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

// With a kid the resource URL is computed directly; without one the first stored key of that purpose is used
async function fetchStorageKeystore(kid, purpose = KEY_AGREEMENT) {
  if (!Config.Session?.isActive) return null;
  try {
    if (!kid) {
      const [doc] = await fetchStorageKeyDocuments(purpose);
      if (doc) {
        sessions[purpose].keystoreURL = keyResourceURL(doc.publicKeyJwk.kid);
        keyConfig(purpose).KeystoreURL = sessions[purpose].keystoreURL;
      }
      return doc || null;
    }
    const url = keyResourceURL(kid);
    if (!url) return null;
    const response = await getResource(url, { 'Accept': 'application/ld+json' }, { noCache: true });
    const doc = await response.json();
    return isValidKeyDocument(doc) ? doc : null;
  } catch {
    return null;
  }
}

async function fetchStorageKeyDocuments(purpose) {
  if (!Config.Session?.isActive) return [];
  const container = findKeyContainer();
  if (!container) return [];
  const members = await listKeyResources(container);
  const docs = [];
  for (const url of members) {
    try {
      const response = await getResource(url, { 'Accept': 'application/ld+json' }, { noCache: true });
      const doc = await response.json();
      if (isValidKeyDocument(doc) && (!purpose || purposeOf(doc) === purpose)) docs.push(doc);
    } catch {}
  }
  return docs;
}

// Both purposes share the key/ container and are told apart by use, so no second type index registration
async function loadAllKeyDocuments(purpose) {
  const byKid = new Map();
  for (const doc of await fetchStorageKeyDocuments(purpose)) byKid.set(doc.publicKeyJwk.kid, doc);
  for (const p of purpose ? [purpose] : PURPOSES) {
    const local = await getEncryptedKeystore(p);
    if (isValidKeyDocument(local) && !byKid.has(local.publicKeyJwk.kid)) byKid.set(local.publicKeyJwk.kid, local);
  }
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
  const plan = planContainerACL({
    aclURL: new URL(aclURL, containerURL).href,
    containerURL,
    owner: Config.User.IRI,
    ownerModes: ['Read', 'Append', 'Control'],
    defaultModes: ['Read', 'Write'],
    conditions: 'anyClient'
  });
  return applyACLPlan(plan);
}

// No acl:Write: the key resource cannot be modified or deleted without first changing this ACL via Control
async function setKeyResourceACL(resourceURL) {
  const [aclURL] = await getLinkRelationFromHead('acl', resourceURL);
  const aclResource = new URL(aclURL, resourceURL).href;
  // a non-empty conditions list makes planGrant attach a ClientCondition
  const ctx = buildACLContext({
    resource: resourceURL,
    defaultACLResource: aclResource,
    effectiveACLResource: aclResource,
    conditions: ['anyClient'],
    dataset: []
  });
  const plan = planGrant(ctx, { 'type': 'agent', 'iri': Config.User.IRI }, ['Read', 'Control']);
  return applyACLPlan(plan);
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
async function saveStorageKeystore(doc, { ifNoneMatch = false } = {}) {
  if (!Config.Session?.isActive) return null;
  const url = keyResourceURL(doc.publicKeyJwk.kid);
  if (!url) return null;

  const container = await ensureKeyContainer();
  await setKeystoreContainerACL(container);

  const purpose = purposeOf(doc);
  sessions[purpose].keystoreURL = url;
  keyConfig(purpose).KeystoreURL = url;

  const data = JSON.stringify(doc, null, 2);
  const options = ifNoneMatch ? { headers: { 'If-None-Match': '*' } } : {};

  try {
    await putResource(url, data, 'application/ld+json', null, options);
  } catch (e) {
    if (e.status === 412) {
      console.warn('dokieli: keystore already exists on storage; local copy kept', e);
      return null;
    }
    throw e;
  }

  await setKeyResourceACL(url).catch(e => console.warn('dokieli: keystore resource ACL not set; container default still restricts access', e));
  await registerKeyContainer(container).catch(e => console.warn('dokieli: keystore type-index registration not written', e));
  return url;
}

export async function createKeystore(passphrase, purpose = KEY_AGREEMENT) {
  const generate = purpose === ASSERTION ? generateSigningKeypair : generateEncryptionKeypair;
  const { publicKey, privateKey, kid } = await generate();
  const publicKeyJWK = await exportPublicKeyJWK(publicKey, kid);
  const privateKeyJWK = await exportPrivateKeyJWK(privateKey, kid);
  const jwe = await wrapPrivateKeyJWK(privateKeyJWK, passphrase);
  const doc = buildKeyDocument(publicKeyJWK, jwe);

  await setEncryptedKeystore(doc, purpose);
  keyConfig(purpose).StorageSyncFailed = false;
  try {
    await saveStorageKeystore(doc, { ifNoneMatch: true });
  } catch (e) {
    keyConfig(purpose).StorageSyncFailed = true;
    console.warn('dokieli: keystore saved locally; storage save failed', e);
  }

  const session = sessions[purpose];
  session.privateKeys.set(kid, await importPrivateKeyJWK(privateKeyJWK));
  session.publicKey = publicKey;
  session.publicKeyJWK = publicKeyJWK;
  session.kid = kid;

  return publicKeyJWK;
}

// Unlocks every key the user holds, of both purposes, so content encrypted to a past key stays decryptable
export async function unlockKeystore(passphrase) {
  const docs = await loadAllKeyDocuments();
  if (!docs.length) throw new Error('No keystore found. Set up encryption first.');

  const unlocked = { [KEY_AGREEMENT]: new Map(), [ASSERTION]: new Map() };
  const docByKid = new Map();
  for (const doc of docs) {
    try {
      const kid = doc.publicKeyJwk.kid;
      const privateKeyJWK = await unwrapPrivateKeyJWK(doc.secretKeyJwk, passphrase);
      unlocked[purposeOf(doc)].set(kid, await importPrivateKeyJWK(privateKeyJWK));
      docByKid.set(kid, doc);
    } catch {}
  }
  if (!docByKid.size) throw new Error('Unable to unlock keystore with the given passphrase.');

  for (const purpose of PURPOSES) {
    const keys = unlocked[purpose];
    if (!keys.size) continue;

    const local = await getEncryptedKeystore(purpose);
    const localKid = isValidKeyDocument(local) ? local.publicKeyJwk.kid : null;
    const session = sessions[purpose];

    session.privateKeys = keys;
    session.kid = (localKid && keys.has(localKid)) ? localKid : keys.keys().next().value;
    session.publicKeyJWK = docByKid.get(session.kid)?.publicKeyJwk || null;
    session.publicKey = session.publicKeyJWK ? await importPublicKeyJWK(session.publicKeyJWK) : null;

    const currentDoc = docByKid.get(session.kid) || null;
    if (!currentDoc) continue;

    // A document created while signed out has no id or controller yet
    let cacheStale = localKid !== session.kid;
    if (Config.User?.IRI && !currentDoc.controller) {
      currentDoc.controller = Config.User.IRI;
      currentDoc.id = `${stripFragmentFromString(Config.User.IRI)}#key-${session.kid}`;
      cacheStale = true;
    }
    if (cacheStale) await setEncryptedKeystore(currentDoc, purpose);

    // Upload when the storage copy is missing (signed-out setup now signed in); key documents are immutable per kid
    fetchStorageKeystore(session.kid, purpose)
      .then(storage => {
        if (!storage) return saveStorageKeystore(currentDoc, { ifNoneMatch: true });
      })
      .catch(e => console.warn('dokieli: keystore storage sync failed', e));
  }
}

// Key agreement keys let others encrypt to the user; assertion keys let others verify their signatures
export async function publishPublicKeyToProfile(purpose = KEY_AGREEMENT) {
  const session = sessions[purpose];
  if (!Config.Session?.isActive || !Config.User?.IRI || !session.publicKeyJWK) return null;
  const relation = purpose === ASSERTION ? Config.ns.sec.assertionMethod : Config.ns.sec.keyAgreementMethod;
  const webid = Config.User.IRI;
  const profileDoc = stripFragmentFromString(webid);
  const keyIRI = `${profileDoc}#key-${session.kid}`;
  const published = Config.User.Graph?.out(relation).values || [];
  if (published.includes(keyIRI)) return null;

  const jwk = escapeRDFLiteral(JSON.stringify(session.publicKeyJWK));
  // sec:JsonWebKey is the CID v1.0 verification method type
  const insert = `<${webid}> <${relation.value}> <${keyIRI}> .
<${keyIRI}> a <${Config.ns.sec.JsonWebKey.value}> ;
  <${Config.ns.sec.controller.value}> <${webid}> ;
  <${Config.ns.sec.publicKeyJwk.value}> "${jwk}"^^<http://www.w3.org/1999/02/22-rdf-syntax-ns#JSON> .`;

  return patchResourceWithAcceptPatch(profileDoc, [{ insert }]);
}

export async function getAgentEncryptionKey(agentIRI) {
  try {
    const { graph } = await getResourceGraph(stripFragmentFromString(agentIRI));
    if (!graph?.node) return null;
    const keyIRIs = graph.node(rdf.namedNode(agentIRI)).out(Config.ns.sec.keyAgreementMethod).values;
    for (const keyIRI of keyIRIs) {
      const jwkValue = graph.node(rdf.namedNode(keyIRI)).out(Config.ns.sec.publicKeyJwk).values[0];
      if (!jwkValue) continue;
      const jwk = JSON.parse(jwkValue);
      return { iri: keyIRI, jwk, key: await importPublicKeyJWK(jwk) };
    }
  } catch (e) {
    console.warn('dokieli: could not read encryption key from ' + agentIRI, e);
  }
  return null;
}

// Checks a cached agent graph pointer (e.g. Config.User.Contacts[iri].Graph) without a network fetch
export function agentHasPublishedEncryptionKey(agentGraph) {
  return !!agentGraph?.out?.(Config.ns.sec.keyAgreementMethod).values.length;
}

export function addDocumentRecipient(agentIRI, key) {
  documentRecipients.set(agentIRI, key);
}

export function getDocumentRecipients() {
  return [...documentRecipients.keys()];
}

export function getDocumentRecipientKeys() {
  return [...documentRecipients.values()];
}

// The ACL is the durable record of who a document is shared with; rebuild the recipient set from agents with Read access so re-saves keep encrypting to them
export async function syncDocumentRecipientsFromACL(documentURL) {
  if (!Config.Session?.isActive || !Config.User?.IRI) return;

  let ctx;
  try {
    ctx = await getACLContext(documentURL);
  } catch {
    return;
  }

  const agents = new Set(agentsWithMode(ctx, 'Read'));
  agents.delete(Config.User.IRI);

  for (const agent of agents) {
    if (documentRecipients.has(agent)) continue;
    const found = await getAgentEncryptionKey(agent);
    if (found) documentRecipients.set(agent, found.key);
    else console.warn('dokieli: no encryption key published for ' + agent + '; they will not be able to decrypt this document');
  }
}

export function lockKeystore() {
  sessions = { [KEY_AGREEMENT]: newSession(), [ASSERTION]: newSession() };
  documentRecipients = new Map();
}

export function isUnlocked(purpose = KEY_AGREEMENT) {
  return sessions[purpose].privateKeys.size > 0;
}

export function getSessionPrivateKey(kid, purpose = KEY_AGREEMENT) {
  const session = sessions[purpose];
  return session.privateKeys.get(kid || session.kid) || null;
}

// Selects the key by the JWE's kid, falling back to trying each held key
export async function decryptWithSession(jwe) {
  const { privateKeys } = sessions[KEY_AGREEMENT];
  for (const kid of getJWEKids(jwe)) {
    const key = privateKeys.get(kid);
    if (key) return decryptContent(jwe, key);
  }
  let lastError;
  for (const key of privateKeys.values()) {
    try { return await decryptContent(jwe, key); } catch (e) { lastError = e; }
  }
  throw lastError || new Error('No unlocked key can decrypt this content.');
}

export function getSessionPublicKey(purpose = KEY_AGREEMENT) {
  return sessions[purpose].publicKey;
}

export function getSessionPublicKeyJWK(purpose = KEY_AGREEMENT) {
  return sessions[purpose].publicKeyJWK;
}

export function getSessionKid(purpose = KEY_AGREEMENT) {
  return sessions[purpose].kid;
}

function noKeysError() {
  const error = new Error('No keys found on this device.');
  error.code = 'no-keys';
  return error;
}

// Private key stays passphrase-wrapped, so the file is safe to keep as a backup
export async function exportKeyDocuments() {
  const docs = await loadAllKeyDocuments();
  if (!docs.length) throw noKeysError();
  return docs;
}

export async function exportKeyDocument(kid) {
  const doc = (await loadAllKeyDocuments()).find(d => d.publicKeyJwk.kid === kid);
  if (!doc) throw noKeysError();
  return doc;
}

// Accepts one key document or an array; unlocking still needs their original passphrase
export async function importKeyDocuments(input) {
  const docs = (Array.isArray(input) ? input : [input]).filter(isValidKeyDocument);
  if (!docs.length) throw new Error('No usable key document found.');

  const known = new Set((await loadAllKeyDocuments()).map(d => d.publicKeyJwk.kid));
  const added = docs.filter(d => !known.has(d.publicKeyJwk.kid)).length;

  //XXX: one document per purpose on the device, so the rest survive only on storage
  for (const purpose of PURPOSES) {
    const doc = docs.find(d => purposeOf(d) === purpose);
    if (doc) await setEncryptedKeystore(doc, purpose);
  }

  // Returns null when there is no session or the key is already there, so count the URL
  let stored = 0;
  for (const doc of docs) {
    try {
      if (await saveStorageKeystore(doc, { ifNoneMatch: true })) stored++;
    }
    catch (e) {
      console.warn('dokieli: imported key kept locally; storage save failed', e);
    }
  }

  return { imported: docs.length, added, stored, local: docs.length - stored };
}

// Needs the passphrase, and what it returns is unprotected
export async function exportKeyPair(passphrase, kid, purpose = KEY_AGREEMENT) {
  const docs = await loadAllKeyDocuments(purpose);
  const doc = kid
    ? docs.find(d => d.publicKeyJwk.kid === kid)
    : docs.find(d => d.publicKeyJwk.kid === sessions[purpose].kid) || docs[0];
  if (!doc) throw noKeysError();

  const privateKeyJWK = await unwrapPrivateKeyJWK(doc.secretKeyJwk, passphrase);

  return {
    kid: doc.publicKeyJwk.kid,
    privateKeyPEM: await privateKeyJWKToPEM(privateKeyJWK),
    publicKeyPEM: await publicKeyJWKToPEM(doc.publicKeyJwk)
  };
}

// A PEM has no passphrase of its own, so the caller supplies one
export async function importPrivateKeyPEM(pem, passphrase) {
  const { privateKeyJWK, publicKeyJWK } = await privateKeyPEMToJWK(pem);
  const jwe = await wrapPrivateKeyJWK(privateKeyJWK, passphrase);
  return importKeyDocuments(buildKeyDocument(publicKeyJWK, jwe));
}

// Probes the storage once per session so a new device gets the unlock prompt instead of setup
export async function hasKeystore(purpose = KEY_AGREEMENT) {
  if (isValidKeyDocument(await getEncryptedKeystore(purpose))) return true;
  const session = sessions[purpose];
  if (session.storageChecked || !Config.Session?.isActive) return false;
  session.storageChecked = true;
  const storage = await fetchStorageKeystore(null, purpose);
  if (storage) {
    await setEncryptedKeystore(storage, purpose);
    return true;
  }
  return false;
}
