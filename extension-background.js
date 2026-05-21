const WebExtension = (typeof browser !== 'undefined') ? browser : chrome;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function base64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generatePKCE() {
  const verifier = crypto.randomUUID() + '-' + crypto.randomUUID();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = await base64url(digest);
  return { verifier, challenge };
}

async function generateDpopKeyPair() {
  return crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
}

async function createDpopProof(method, url, keyPair) {
  const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const header = { alg: 'ES256', typ: 'dpop+jwt', jwk: publicJwk };
  const payload = {
    jti: crypto.randomUUID(),
    htm: method.toUpperCase(),
    htu: new URL(url).origin + new URL(url).pathname,
    iat: Math.floor(Date.now() / 1000),
  };
  const enc = async (obj) => base64url(new TextEncoder().encode(JSON.stringify(obj)));
  const signingInput = (await enc(header)) + '.' + (await enc(payload));
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    keyPair.privateKey,
    new TextEncoder().encode(signingInput)
  );
  return signingInput + '.' + (await base64url(sig));
}

function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1];
    return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Full OIDC PKCE flow
// ---------------------------------------------------------------------------

async function solidLogin(idp) {
  // 1. OpenID configuration
  const idpOrigin = new URL(idp).origin;
  const oidcRes = await fetch(`${idpOrigin}/.well-known/openid-configuration`);
  if (!oidcRes.ok) throw new Error(`openid-configuration fetch failed: ${oidcRes.status}`);
  const oidcConfig = await oidcRes.json();

  const redirectUri = WebExtension.identity.getRedirectURL();

  // 2. Dynamic client registration
  if (!oidcConfig.registration_endpoint) throw new Error(`${idp} does not support dynamic client registration`);
  const regRes = await fetch(oidcConfig.registration_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      redirect_uris: [redirectUri],
      client_name: 'dokieli',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
  });
  if (!regRes.ok) {
    const body = await regRes.text();
    throw new Error(`Dynamic registration failed ${regRes.status}: ${body}`);
  }
  const { client_id: clientId } = await regRes.json();

  // 3. PKCE + CSRF
  const { verifier: pkceVerifier, challenge: pkceChallenge } = await generatePKCE();
  const state = crypto.randomUUID();
  const dpopKeyPair = await generateDpopKeyPair();

  // 4. Build auth URL and open native auth popup
  const authUrl = oidcConfig.authorization_endpoint
    + '?response_type=code'
    + `&redirect_uri=${encodeURIComponent(redirectUri)}`
    + '&scope=openid%20offline_access%20webid'
    + `&client_id=${encodeURIComponent(clientId)}`
    + '&code_challenge_method=S256'
    + `&code_challenge=${pkceChallenge}`
    + `&state=${state}`
    + '&prompt=consent';

  console.log('dokieli: launching auth flow for', idp);
  const callbackUrl = await WebExtension.identity.launchWebAuthFlow({ url: authUrl, interactive: true });
  console.log('dokieli: auth flow returned', callbackUrl);

  // 5. Validate callback
  const cbParams = new URL(callbackUrl).searchParams;
  if (cbParams.get('state') !== state) throw new Error('CSRF state mismatch');
  const code = cbParams.get('code');
  if (!code) throw new Error('No authorization code in callback URL');

  // 6. Exchange code for tokens (DPoP-bound)
  const dpopProof = await createDpopProof('POST', oidcConfig.token_endpoint, dpopKeyPair);
  const tokenRes = await fetch(oidcConfig.token_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'DPoP': dpopProof,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: pkceVerifier,
    }).toString(),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    throw new Error(`Token exchange failed ${tokenRes.status}: ${body}`);
  }

  const tokens = await tokenRes.json();
  console.log('dokieli: token exchange complete');

  const payload = decodeJwtPayload(tokens.access_token);
  // NSS (solidcommunity.net) puts the webid claim in the id_token, not the access token.
  // CSS puts it in the access token. Check both.
  const idPayload = tokens.id_token ? decodeJwtPayload(tokens.id_token) : null;
  const webId = tokens.webid || payload?.webid || idPayload?.webid || idPayload?.sub || payload?.sub;
  if (!webId) throw new Error('Could not determine WebID from token response');

  // Export key pair so it can be sent across the message boundary (CryptoKey is not serialisable).
  const [dpopPrivateJwk, dpopPublicJwk] = await Promise.all([
    crypto.subtle.exportKey('jwk', dpopKeyPair.privateKey),
    crypto.subtle.exportKey('jwk', dpopKeyPair.publicKey),
  ]);

  return { webId, accessToken: tokens.access_token, dpopPrivateJwk, dpopPublicJwk };
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

WebExtension.runtime.onMessage.addListener(function (request) {
  if (request.action === 'dokieli.login') {
    // Return a Promise — this is the Firefox pattern for async message responses.
    // sendResponse + return true is Chrome-only and the port closes before
    // the interactive launchWebAuthFlow completes.
    return solidLogin(request.idp)
      .then(result => ({ ok: true, ...result }))
      .catch(err => {
        console.error('dokieli: login failed:', err);
        return { ok: false, error: err.message };
      });
  }

  // For all other messages, return nothing (synchronous).
});
