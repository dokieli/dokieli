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

import { createIntroNanopub, NANOPUB_REGISTRY_URLS, TEST_NANOPUB_REGISTRY_URL } from '@nanopub/nanopub-js';
import Config from './config.js';
import { getSigningKeyMaterial, hasKeystore, ASSERTION } from './keystore.js';

const REGISTRY_HEADERS = { 'Accept': 'application/json' };

function registries() {
  return Config.Nanopub?.UseTestRegistry ? [TEST_NANOPUB_REGISTRY_URL] : NANOPUB_REGISTRY_URLS;
}

export function getRegistryURL() {
  return registries()[0];
}

function agentAccountsURL(registryURL, agentIRI) {
  const origin = new URL(registryURL).origin;
  return `${origin}/agentAccounts?id=${encodeURIComponent(agentIRI)}`;
}

export function getAgentIRI() {
  return Config.User?.IRI || null;
}

// Trusty URI artifact code
export function isNanopubIRI(iri) {
  return typeof iri === 'string' && /\/RA[A-Za-z0-9_-]{43}$/.test(iri);
}

// Registries key accounts by the SHA-256 of the base64 public key
export async function getPublicKeyHash(publicKeyBase64) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(publicKeyBase64));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Retries the caller once a signing key is unlocked or created
export function promptForSigningKey(retry) {
  return import('./dialog.js').then(async ({ showEncryptionUnlock, showSigningSetup }) => {
    const exists = await hasKeystore(ASSERTION);
    return new Promise((resolve, reject) => {
      const onSuccess = () => retry().then(resolve, reject);
      exists ? showEncryptionUnlock(onSuccess) : showSigningSetup(onSuccess);
    });
  });
}

export async function publishIntroduction(unlocked = false) {
  const agent = getAgentIRI();
  if (!agent) {
    const error = new Error('Sign in before introducing your key to the network.');
    error.code = 'no-agent';
    throw error;
  }

  let material;
  try {
    material = await getSigningKeyMaterial();
  }
  catch (e) {
    if (e.code !== 'no-signing-key' || unlocked) throw e;
    return promptForSigningKey(() => publishIntroduction(true));
  }

  const { privateKey, publicKey } = material;
  const name = Config.User?.Name;

  const intro = await createIntroNanopub({ agent, privateKey, publicKey, name });
  await intro.sign();
  const { uri } = await intro.publish(registries()[0]);

  Config.User.Keys.Signing.IntroductionURI = uri;
  return { uri, publicKey };
}

export async function getKeyTrustStatus(publicKeyBase64, agentIRI = getAgentIRI()) {
  if (!agentIRI) return null;

  const hash = await getPublicKeyHash(publicKeyBase64);

  for (const registry of registries()) {
    try {
      const response = await fetch(agentAccountsURL(registry, agentIRI), { headers: REGISTRY_HEADERS });
      if (!response.ok) continue;
      const accounts = await response.json();
      const account = accounts.find(a => a.pubkey === hash);
      return {
        registry,
        found: !!account,
        status: account?.status || null,
        introNanopub: account?.introNanopub || null,
        quota: account?.quota ?? null,
        otherKeys: accounts.filter(a => a.pubkey !== hash).length
      };
    }
    catch (e) {
      console.warn('dokieli: could not read agent accounts from ' + registry, e);
    }
  }

  return null;
}
