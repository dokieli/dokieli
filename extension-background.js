import * as oidc from 'openid-client';

const WebExtension = (typeof browser !== 'undefined') ? browser : chrome;

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

WebExtension.runtime.onMessage.addListener(function (request) {
  if (request.action === 'dokieli.login') {
    return solidLogin(request.idp)
      .then(result => ({ ok: true, ...result }))
      .catch(err => {
        console.error('dokieli: login failed:', err);
        return { ok: false, error: err.message };
      });
  }
});
