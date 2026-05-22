/*!
Copyright 2012-2026 Sarven Capadisli <https://csarven.ca/>
Copyright 2023-2026 Virginia Balseiro <https://virginiabalseiro.com/>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
*/

import * as oidc from 'openid-client';
import { SignJWT } from 'jose';

const WebExtension = (typeof browser !== 'undefined') ? browser : chrome;
const SESSION_KEY = 'DO.Config.ExtensionSession';

let cachedSession = null;

WebExtension.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[SESSION_KEY]) cachedSession = null;
});

async function getSession() {
  if (cachedSession) return cachedSession;
  const stored = await WebExtension.storage.local.get(SESSION_KEY);
  const creds = stored?.[SESSION_KEY];
  if (!creds?.accessToken || !creds?.dpopPrivateJwk || !creds?.dpopPublicJwk) return null;
  const [privateKey, publicKey] = await Promise.all([
    crypto.subtle.importKey('jwk', creds.dpopPrivateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']),
    crypto.subtle.importKey('jwk', creds.dpopPublicJwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']),
  ]);
  cachedSession = { accessToken: creds.accessToken, keyPair: { privateKey, publicKey } };
  return cachedSession;
}

async function makeDpopProof(method, url, keyPair, nonce) {
  const { kty, crv, x, y } = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const u = new URL(url);
  return new SignJWT({
    jti: crypto.randomUUID(),
    htm: method.toUpperCase(),
    htu: u.origin + u.pathname,
    iat: Math.floor(Date.now() / 1000),
    ...(nonce && { nonce }),
  })
    .setProtectedHeader({ alg: 'ES256', typ: 'dpop+jwt', jwk: { kty, crv, x, y } })
    .sign(keyPair.privateKey);
}

async function solidFetch(url, options) {
  const session = await getSession();
  const method = (options?.method || 'GET').toUpperCase();
  const baseHeaders = options?.headers ? { ...options.headers } : {};

  const doFetch = async (nonce) => {
    const headers = { ...baseHeaders };
    if (session) {
      const dpop = await makeDpopProof(method, url, session.keyPair, nonce);
      headers.Authorization = `DPoP ${session.accessToken}`;
      headers.DPoP = dpop;
    }
    const init = { method, headers };
    if (method !== 'GET' && method !== 'HEAD' && options?.body != null) init.body = options.body;
    return fetch(url, init);
  };

  let response;
  try {
    response = await doFetch();
  } catch (e) {
    console.error('dokieli SW: fetch threw', method, url, e);
    return { status: 0, statusText: e.message, headers: {}, body: '' };
  }

  if (response.status === 401 && session) {
    const wwwAuth = response.headers.get('WWW-Authenticate') || '';
    const nonce = response.headers.get('DPoP-Nonce') || wwwAuth.match(/nonce="([^"]+)"/i)?.[1];
    if (nonce) {
      try { response = await doFetch(nonce); } catch (e) {
        return { status: 0, statusText: e.message, headers: {}, body: '' };
      }
    }
  }

  return serializeResponse(response);
}

async function serializeResponse(response) {
  const headers = {};
  response.headers.forEach((v, k) => { headers[k] = v; });
  const body = await response.text();
  return { status: response.status, statusText: response.statusText, headers, body };
}

async function dynamicClientRegistration(registrationEndpoint, redirectUri) {
  const res = await fetch(registrationEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      redirect_uris: [redirectUri],
      client_name: 'dokieli',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: 'openid webid offline_access',
    }),
  });
  if (!res.ok) throw new Error(`Dynamic registration failed ${res.status}: ${await res.text()}`);
  const { client_id } = await res.json();
  if (!client_id) throw new Error('Registration response missing client_id');
  return client_id;
}

async function solidLogin(idp) {
  const redirectUri = WebExtension.identity.getRedirectURL();

  const idpOrigin = new URL(idp).origin;
  const discRes = await fetch(`${idpOrigin}/.well-known/openid-configuration`);
  if (!discRes.ok) throw new Error(`openid-configuration fetch failed: ${discRes.status}`);
  const oidcMeta = await discRes.json();
  if (!oidcMeta.registration_endpoint) throw new Error(`${idp} does not support dynamic client registration`);

  const clientId = await dynamicClientRegistration(oidcMeta.registration_endpoint, redirectUri);

  const config = await oidc.discovery(new URL(idp), clientId, { token_endpoint_auth_method: 'none' });

  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  const state = oidc.randomState();

  const dpopKeyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const DPoP = oidc.getDPoPHandle(config, dpopKeyPair);

  const authUrl = oidc.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    scope: 'openid offline_access webid',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    prompt: 'consent',
  });

  console.log('dokieli: launching auth flow for', idp);
  const callbackUrl = await WebExtension.identity.launchWebAuthFlow({ url: authUrl.href, interactive: true });

  const tokens = await oidc.authorizationCodeGrant(
    config,
    new URL(callbackUrl),
    { pkceCodeVerifier: codeVerifier, expectedState: state },
    undefined,
    { DPoP },
  );

  const claims = typeof tokens.claims === 'function' ? tokens.claims() : null;
  const webId = tokens.webid || claims?.webid || claims?.sub;
  if (!webId) throw new Error('Could not determine WebID from token response');

  const [dpopPrivateJwk, dpopPublicJwk] = await Promise.all([
    crypto.subtle.exportKey('jwk', dpopKeyPair.privateKey),
    crypto.subtle.exportKey('jwk', dpopKeyPair.publicKey),
  ]);

  return {
    webId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    dpopPrivateJwk,
    dpopPublicJwk,
  };
}

WebExtension.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === 'dokieli.login') {
    solidLogin(request.idp)
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(err => {
        console.error('dokieli: login failed:', err);
        sendResponse({ ok: false, error: err.message });
      });
    return true;
  }
  if (request.action === 'dokieli.fetch') {
    solidFetch(request.url, request.options)
      .then(sendResponse)
      .catch(err => sendResponse({ status: 0, statusText: err.message, headers: {}, body: '' }));
    return true;
  }
});
