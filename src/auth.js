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
import Config from './config.js'
import { fragmentFromString, removeChildren } from "./utils/html.js";
import { getAgentHTML, showActionMessage, getResourceSupplementalInfo, handleDeleteNote, addMessageToLog } from './doc.js';
import { Icon } from './ui/icons.js';
import { setPreferredPolicyInfo, getAgentTypeIndex, getAgentSupplementalInfo, getAgentSeeAlsoPrimaryTopicOf, getAgentPreferencesInfo, getSubjectInfo } from './graph.js';
import { removeDeviceStorageAsSignOut, updateDeviceStorageProfile, updateBrowserStorageOIDC, setDeviceStorageItem } from './storage.js';
import { hasKeystore, lockKeystore } from './keystore.js';
import { updateButtons, getButtonHTML } from './ui/buttons.js';
import { SessionCore } from '@uvdsl/solid-oidc-client-browser/core';
import { isCurrentScriptSameOrigin, isLocalhost } from './uri.js';
import { SessionIDB } from '@uvdsl/solid-oidc-client-browser';
import { i18n } from './i18n.js';
import { showGeneralMessages, setPreferredLanguagesInfo } from './actions.js';
import { sanitizeInsertAdjacentHTML, sanitizeIRI } from './utils/sanitization.js';
import { updateCollabUserIdentity } from './editor/editor.js';

const ns = Config.ns;

Config.OIDC['client_id'] = isLocalhost(window.location) ? process.env.DEV_CLIENT_ID : process.env.CLIENT_ID;

const clientid = Config.OIDC['client_id'] || null;

const currentScriptSameOrigin = isCurrentScriptSameOrigin();

const useStaticClientId = !!(clientid && !Config['WebExtensionEnabled'] && currentScriptSameOrigin);
Config.OIDC['useStaticClientId'] = useStaticClientId;

// Skip SessionCore in extension context - Firefox's Xray wrapper breaks the EventTarget prototype chain. Auth goes through extensionLogin() instead.
if (!Config['WebExtensionEnabled']) {
  Config['Session'] = useStaticClientId
    ? new SessionCore({ client_id: clientid }, { database: new SessionIDB() })
    : new SessionCore({ redirect_uris: [window.location.href.split('#')[0]], client_name: "dokieli" }, { database: new SessionIDB() });
}

export async function restoreSession() {
  if (Config['WebExtensionEnabled']) {
    await restoreExtensionSession();
    return;
  }
  await Config['Session']?.handleRedirectFromLogin();
  await Config['Session']?.restore().catch(e => console.log(e.message));
}

const EXTENSION_SESSION_KEY = 'DO.Config.ExtensionSession';

async function buildExtensionSession({ webId }) {
  async function serializeBody(body) {
    if (body == null) return undefined;
    if (typeof body === 'string') return body;
    if (body instanceof URLSearchParams) return body.toString();
    if (body instanceof Blob || body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
      return await new Response(body).text();
    }
    return String(body);
  }

  Config['Session'] = {
    isActive: true,
    webId,
    async authFetch(input, init) {
      const url = input instanceof Request ? input.url : input.toString();
      const reqHeaders = new Headers(init?.headers || (input instanceof Request ? input.headers : {}));
      const headers = {};
      reqHeaders.forEach((v, k) => { headers[k] = v; });

      const method = (init?.method || (input instanceof Request ? input.method : null) || 'GET').toUpperCase();
      const hasBody = method !== 'GET' && method !== 'HEAD';
      const body = hasBody
        ? await serializeBody(init?.body ?? (input instanceof Request ? await input.clone().text() : undefined))
        : undefined;

      const result = await Config.WebExtension.runtime.sendMessage({
        action: 'dokieli.fetch',
        url,
        options: { method, headers, body },
      });

      if (!result || !result.status) {
        console.error('dokieli authFetch: SW returned bad result', { url, method, result });
        throw new TypeError(result?.statusText || `Failed to fetch ${url}`);
      }

      const nullBodyStatus = result.status === 101 || result.status === 103
        || result.status === 204 || result.status === 205 || result.status === 304;
      return new Response(nullBodyStatus ? null : result.body, {
        status: result.status,
        statusText: result.statusText,
        headers: result.headers,
      });
    },
    async logout() {
      Config['Session'] = null;
      try { await Config.WebExtension.storage.local.remove(EXTENSION_SESSION_KEY); } catch {}
    },
  };
}

async function restoreExtensionSession() {
  try {
    const stored = await Config.WebExtension.storage.local.get(EXTENSION_SESSION_KEY);
    const creds = stored?.[EXTENSION_SESSION_KEY];
    if (!creds?.webId || !creds?.accessToken || !creds?.dpopPrivateJwk || !creds?.dpopPublicJwk) {
      return;
    }
    await buildExtensionSession(creds);
  } catch (e) {
    console.warn('dokieli: extension session restore failed', e);
  }
}

export async function showUserSigninSignout (node) {
  var webId = Config['Session']?.isActive ? Config['Session']?.webId : null;

  if (webId && webId !== Config.User.IRI) {
    await setUserInfo(webId);
    afterSetUserInfo();
  }

  if (node.hasChildNodes()) { return; }

  let userInfoHTML;

  //Checks if already know the user from prior load of the page
  userInfoHTML = Config.User.IRI ? getAgentHTML() + Config.Button.Menu.SignOut : Config.Button.Menu.SignIn;

  sanitizeInsertAdjacentHTML(node, 'afterbegin', userInfoHTML);
}

export async function signOut() {
  //TODO: Use the specific method that the user was signed in with
  if (Config['Session']?.isActive) {
    await Config['Session']?.logout();
  }
  else {
    await signOutGitForge();
  }

  await signOutHttp();

  removeDeviceStorageAsSignOut();
  lockKeystore();

  Config.User = {
    IRI: null,
    Encryption: { Enabled: false, KeyId: null },
    UI: Config.User.UI
  }

  updateButtons();

  //XXX: Selected language is already known, no need to re-run this since it need not be set again. Remove these comments once tested.
  // setPreferredLanguagesInfo();
}


export async function userInfoSignOut(node) {
  //Clean up the user-info so it can be reconstructed
  removeChildren(node);

  sanitizeInsertAdjacentHTML(node, 'afterbegin', Config.Button.Menu.SignIn);

  var buttonDeletes = document.querySelectorAll('aside.do blockquote[cite] article button.delete');
  buttonDeletes.forEach(button => {
    button.parentNode.removeChild(button);
  })

  //Signed out so update button states
  getResourceSupplementalInfo(Config.DocumentURL).then(resourceInfo => {
    updateButtons();
  });
}

export function showUserIdentityInput () {
  var userIdentityInput = document.getElementById('user-identity-input');

  if (userIdentityInput) {
    return;
  }

  var signInUser = document.querySelector('#document-menu button.signin-user');

  if (signInUser) {
    signInUser.disabled = true;
  }

  var buttonClose = getButtonHTML({ key: 'dialog.signin.close.button', button: 'close', buttonClass: 'close', iconSize: 'fa-2x' });

  var buttonSignInDisabled = '';

  var code = `
    <aside aria-labelledby="user-identity-input-label" class="do on" dir="${Config.User.UI.LanguageDir}" id="user-identity-input" lang="${Config.User.UI.Language}" rel="schema:hasPart" resource="#user-identity-input" xml:lang="${Config.User.UI.Language}">
      <h2 data-i18n="dialog.signin.h2" id="user-identity-input-label" property="schema:name">${i18n.t('dialog.signin.h2.textContent')} ${Config.Button.Info.SignIn}</h2>
      ${buttonClose}
      <div class="info"></div>

      <section id="user-identity-input-login">
        <p data-i18n="dialog.signin.description.p">${i18n.t('dialog.signin.description.p.textContent')}</p>

        <ul class="do-signin-providers">
          <li>
            <button aria-expanded="false" class="do-signin-provider" data-provider="solid" data-i18n="dialog.signin.provider-solid.button" title="${i18n.t('dialog.signin.provider-solid.button.title')}" type="button">
              <i class="fas solid-project"></i>
              <span>
                <span data-i18n="dialog.signin.provider-solid.button.span">${i18n.t('dialog.signin.provider-solid.button.span.textContent')}</span>
                <span data-i18n="dialog.signin.provider-solid.small">${i18n.t('dialog.signin.provider-solid.small.textContent')}</span>
              </span>
              ${Icon['.fas.fa-angle-right']}
            </button>
            <div class="do-signin-provider-form" id="do-signin-solid" hidden="">
              <p><label data-i18n="dialog.signin.provider-solid-form.label" for="solid-provider-url">${i18n.t('dialog.signin.provider-solid-form.label.textContent')}</label></p>
              <p><input id="solid-provider-url" name="solid-provider-url" placeholder="https://solidcommunity.net/" type="url" value="https://solidcommunity.net/"/> <button class="do-signin-provider-go" data-i18n="dialog.signin.provider-form.go.button" data-provider="solid" title="${i18n.t('dialog.signin.provider-form.go.button.title')}" type="button">${i18n.t('dialog.signin.provider-form.go.button.textContent')}</button></p>
            </div>
          </li>
          <li>
            <button aria-expanded="false" class="do-signin-provider" data-provider="github" type="button">
              ${Icon['.fab.fa-github']}
              <span>
                <span>Sign in with GitHub</span>
                <span>Paste a Personal Access Token to read and write to GitHub repos.</span>
              </span>
              ${Icon['.fas.fa-angle-right']}
            </button>
            <div class="do-signin-provider-form" id="do-signin-github" hidden="">
              <p><label for="github-provider-url">Personal Access Token</label></p>
              <p><input id="github-provider-url" name="github-provider-url" placeholder="ghp_..." type="password" autocomplete="off"/> <button class="do-signin-provider-go" data-provider="github" type="button">Save</button></p>
              <p>Create a token at <a href="https://github.com/settings/tokens" rel="noopener" target="_blank">github.com/settings/tokens</a> with <code>repo</code> scope. The token is stored locally in your browser while signed in and removed on sign-out.</p>
            </div>
          </li>
          <li>
            <button aria-expanded="false" class="do-signin-provider" data-provider="forgejo" type="button">
              ${Icon['.fas.fa-code-branch']}
              <span>
                <span>Sign in with Forgejo</span>
                <span>For Codeberg and other Forgejo instances.</span>
              </span>
              ${Icon['.fas.fa-angle-right']}
            </button>
            <div class="do-signin-provider-form" id="do-signin-forgejo" hidden="">
              <p><label for="forgejo-provider-server">Server URL</label></p>
              <p><input id="forgejo-provider-server" name="forgejo-provider-server" placeholder="https://codeberg.org" type="url" value="https://codeberg.org"/></p>
              <p><label for="forgejo-provider-url">Personal Access Token</label></p>
              <p><input id="forgejo-provider-url" name="forgejo-provider-url" placeholder="access token" type="password" autocomplete="off"/> <button class="do-signin-provider-go" data-provider="forgejo" type="button">Save</button></p>
              <p>Create a token at e.g., <a href="https://codeberg.org/user/settings/applications/tokens/new" rel="noopener" target="_blank">codeberg.org/user/settings/applications/tokens/new</a> with scopes <code>read:user</code> and <code>write:repository</code> (or <code>read:repository</code> for read-only). The token is stored locally in your browser while signed in and removed on sign-out.</p>
            </div>
          </li>
        </ul>

        <details id="user-identity-input-advanced">
          <summary data-i18n="dialog.signin.advanced.summary">${i18n.t('dialog.signin.advanced.summary.textContent')}</summary>
          <p id="user-identity-input-webid">
            <label for="webid" data-i18n="dialog.signin.webid.label">${i18n.t('dialog.signin.webid.label.textContent')}</label>
            <input dir="ltr" id="webid" type="url" placeholder="https://username.solidcommunity.net/" value="" name="webid"/>
            <button data-i18n="dialog.signin.submit.button" class="signin" type="button"${buttonSignInDisabled}>${i18n.t('dialog.signin.submit.button.textContent')}</button>
          </p>
          <details id="user-identity-input-server-token">
            <summary data-i18n="dialog.signin.server-token.summary">${i18n.t('dialog.signin.server-token.summary.textContent')}</summary>
            <p data-i18n="dialog.signin.server-token.p">${i18n.t('dialog.signin.server-token.p.textContent')}</p>
            <p>
              <label for="webid-server-token" data-i18n="dialog.signin.server-token.label">${i18n.t('dialog.signin.server-token.label.textContent')}</label>
              <input id="webid-server-token" name="webid-server-token" type="password" autocomplete="off" />
            </p>
          </details>
        </details>

        <p>${Config.Button.Info.WebId}</p>
      </section>
    </aside>`;

  document.body.appendChild(fragmentFromString(code));

  var aside = document.getElementById('user-identity-input');

  aside.addEventListener('click', e => {
    if (e.target.closest('button.close')) {
      if (signInUser) {
        signInUser.disabled = false;
      }
      return;
    }

    var providerButton = e.target.closest('button.do-signin-provider');
    if (providerButton) {
      var provider = providerButton.dataset.provider;
      var form = aside.querySelector('#do-signin-' + provider);
      var isExpanded = providerButton.getAttribute('aria-expanded') === 'true';

      aside.querySelectorAll('button.do-signin-provider[aria-expanded="true"]').forEach(btn => {
        if (btn !== providerButton) {
          btn.setAttribute('aria-expanded', 'false');
          var otherForm = aside.querySelector('#do-signin-' + btn.dataset.provider);
          if (otherForm) { otherForm.hidden = true; }
        }
      });

      providerButton.setAttribute('aria-expanded', isExpanded ? 'false' : 'true');
      form.hidden = isExpanded;
      if (!isExpanded) {
        form.querySelector('input').focus();
      }
      return;
    }

    var goButton = e.target.closest('button.do-signin-provider-go');
    if (goButton) {
      var provider = goButton.dataset.provider;
      var urlInput = aside.querySelector('#' + provider + '-provider-url');
      var value = urlInput ? urlInput.value.trim() : '';
      if (!value) return;
      if (provider === 'github') {
        signInWithGitHubPAT(value, aside);
      } else if (provider === 'forgejo') {
        var serverInput = aside.querySelector('#forgejo-provider-server');
        var server = serverInput ? serverInput.value.trim() : '';
        if (!server) return;
        signInWithForgejoPAT(server, value, aside);
      } else {
        loginWithIDP(value);
      }
      return;
    }
  });

  let details = aside.querySelector('#user-identity-input-advanced');
  let userIdentityInputWebidInput = details.querySelector('input');
  details.addEventListener('toggle', e => {
    if (details.open) {
      userIdentityInputWebidInput.focus();
    }
  });

  var buttonSignIn = aside.querySelector('button.signin');
  var inputWebID = aside.querySelector('input#webid');

  if (inputWebID) {
    buttonSignIn.addEventListener('click', submitSignIn);

    let events = ['keyup', 'cut', 'paste', 'input'];

    events.forEach(eventType => {
      inputWebID.addEventListener(eventType, e => { enableDisableButton(e, buttonSignIn); });
    });
  }
}


// TODO: Generalize this further so that it is not only for submitSignIn
function enableDisableButton(e, button) {
  var delay = (e.type === 'cut' || e.type === 'paste') ? 250 : 0
  var input

  window.setTimeout(function () {
    input = e.target.value
    if (input.length > 10 && input.match(/^https?:\/\//g)) {
      if (typeof e.which !== 'undefined' && e.which === 13) {
        if (!button.getAttribute('disabled')) {
          button.setAttribute('disabled', 'disabled')
          e.preventDefault()
          e.stopPropagation()
          submitSignIn()
        }
      } else {
        button.removeAttribute('disabled')
      }
    } else {
      if (!button.getAttribute('disabled')) {
        button.setAttribute('disabled', 'disabled')
      }
    }
  }, delay)
}

// FIXME: This parameter value can be an event or a string
function submitSignIn (url) {
  var userIdentityInput = document.getElementById('user-identity-input')

  if (typeof url !== 'string') {
    if (userIdentityInput) {
      sanitizeInsertAdjacentHTML(userIdentityInput.querySelector('#user-identity-input-webid'), 'beforeend', Icon[".fas.fa-circle-notch.fa-spin.fa-fw"])
    }

    url = userIdentityInput.querySelector('input#webid').value.trim()
  }

  if (!url) {
    return Promise.resolve()
  }

  // Capture optional server token now, before the form is removed on success.
  var serverTokenInput = userIdentityInput?.querySelector('input#webid-server-token')
  var serverToken = serverTokenInput ? serverTokenInput.value.trim() : ''

  //TODO: Consider throwing an error with setUserInfo where there is no profile, and so don't trigger signInWithOIDC at all.
  return setUserInfo(url)
    .then(async () => {
      if (serverToken) {
        await registerServerTokenForUser(url, serverToken)
      }
    })
    .then(() => {
      var uI = document.getElementById('user-info')
      if (uI) {
        removeChildren(uI);
        sanitizeInsertAdjacentHTML(uI, 'beforeend', getAgentHTML() + Config.Button.Menu.SignOut);
      }

      if (userIdentityInput) {
        userIdentityInput.parentNode.removeChild(userIdentityInput)
      }

      if (Config.User.IRI && !Config.User.OIDCIssuer) {
        const message = {
          'content': `Cannot sign in. Using information from profile to personalise the UI.`,
          'type': 'info',
          'timer': null
        }

        addMessageToLog(message, Config.MessageLog);
        showActionMessage(document.body, message);

        afterSetUserInfo();
      }
      else if (Config.User.IRI) {
        signInWithOIDC()
          .catch(e => {
            console.error('OIDC sign-in failed:', e);
            const message = {
              'content': `Cannot sign in. Using information from profile to personalise the UI.`,
              'type': 'info',
              'timer': null
            }
            
            addMessageToLog(message, Config.MessageLog);
            showActionMessage(document.body, message);

            afterSetUserInfo();
          })
      }
    })
}

// Handles the `login` invocation variable (Application Capability spec). The
// value is a hint identifying who to authenticate as, never authentication
// itself: a GitHub or Forgejo profile URL prompts for a Personal Access Token;
// anything else goes through the Custom WebID flow (OIDC, or profile-only
// fallback).
export async function processLoginInvocation(url) {
  if (Config.User?.IRI) {
    console.log('login invocation ignored: already signed in as', Config.User.IRI);
    return;
  }

  url = sanitizeIRI(String(url).trim());
  if (!url || !url.match(/^https?:\/\//)) return;

  const gitHubProfile = url.match(/^https?:\/\/(?:www\.)?github\.com\/([A-Za-z\d](?:[A-Za-z\d-]{0,37}[A-Za-z\d])?)\/?$/);
  if (gitHubProfile) {
    return showForgeTokenInput({ provider: 'github', host: 'github.com', server: 'https://github.com', username: gitHubProfile[1] });
  }

  const forgeProfile = await detectForgeProfile(url);
  if (forgeProfile) {
    return showForgeTokenInput(forgeProfile);
  }

  return submitSignIn(url);
}

// A Forgejo (or Gitea) profile URL is origin/{username}. Known forge hosts are
// matched directly; unknown hosts are probed via the CORS-open users API.
async function detectForgeProfile(url) {
  let u;
  try { u = new URL(url); } catch { return null; }

  const segments = u.pathname.split('/').filter(Boolean);
  if (segments.length !== 1 || u.search || u.hash) return null;
  const username = segments[0];
  if (!username.match(/^[A-Za-z\d][A-Za-z\d._-]*$/)) return null;

  const profile = { provider: 'forgejo', host: u.host, server: u.origin, username };

  const known = Config.Storage?.backend?.('gitforge')?.getHost?.(u.host);
  if (known) {
    return known.provider === 'forgejo' ? profile : null;
  }

  try {
    const response = await fetch(`${u.origin}/api/v1/users/${encodeURIComponent(username)}`, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const user = await response.json();
    if (user?.login?.toLowerCase() !== username.toLowerCase()) return null;
    return profile;
  } catch {
    return null;
  }
}

function showForgeTokenInput({ provider, host, server, username }) {
  if (document.getElementById('forge-token-input')) return;

  var buttonClose = getButtonHTML({ key: 'dialog.signin.close.button', button: 'close', buttonClass: 'close', iconSize: 'fa-2x' });

  var isGitHub = provider === 'github';
  var heading = isGitHub ? 'Sign in with GitHub' : `Sign in with ${host}`;
  var tokenUrl = isGitHub ? 'https://github.com/settings/tokens' : `${server}/user/settings/applications/tokens/new`;
  var tokenHelp = isGitHub
    ? `Create a token at <a href="${tokenUrl}" rel="noopener" target="_blank">github.com/settings/tokens</a> with <code>repo</code> scope. The token is stored locally in your browser while signed in and removed on sign-out.`
    : `Create a token at <a href="${tokenUrl}" rel="noopener" target="_blank">${host}/user/settings/applications/tokens/new</a> with scopes <code>read:user</code> and <code>write:repository</code> (or <code>read:repository</code> for read-only). The token is stored locally in your browser while signed in and removed on sign-out.`;

  var code = `
    <aside aria-labelledby="forge-token-input-label" class="do on" dir="${Config.User.UI.LanguageDir}" id="forge-token-input" lang="${Config.User.UI.Language}" xml:lang="${Config.User.UI.Language}">
      <h2 id="forge-token-input-label">${heading}</h2>
      ${buttonClose}
      <div class="info"></div>
      <p>Signing in as <a href="${server}/${username}" rel="noopener" target="_blank">${username}</a>.</p>
      <p><label for="forge-token">Personal Access Token</label></p>
      <p><input id="forge-token" name="forge-token" placeholder="${isGitHub ? 'ghp_...' : 'access token'}" type="password" autocomplete="off"/> <button class="do-forge-token-go" type="button">Save</button></p>
      <p>${tokenHelp}</p>
    </aside>`;

  document.body.appendChild(fragmentFromString(code));

  var aside = document.getElementById('forge-token-input');
  var input = aside.querySelector('input#forge-token');
  input.focus();

  var go = () => {
    var token = input.value.trim();
    if (!token) return;
    if (isGitHub) {
      signInWithGitHubPAT(token, aside);
    } else {
      signInWithForgejoPAT(server, token, aside);
    }
  };

  aside.querySelector('button.do-forge-token-go').addEventListener('click', go);
  input.addEventListener('keyup', e => { if (e.key === 'Enter') go(); });
}

const GIT_FORGE_HOSTS_KEY = 'DO.Config.GitForge.hosts';
const HTTP_ORIGINS_KEY = 'DO.Config.Http.origins';

async function persistHttpOrigin(origin, cfg) {
  const { getDeviceStorageItem } = await import('./storage.js');
  const origins = (await getDeviceStorageItem(HTTP_ORIGINS_KEY)) || {};
  origins[origin] = cfg;
  await setDeviceStorageItem(HTTP_ORIGINS_KEY, origins);
}

// Bind the server token to the origin (scheme + host + port) of the discovered
// pim:space#storage. The origin match is intentionally strict: a token issued
// for `https://example.org` will NOT fire on requests to `http://example.org`,
// `https://other.com`, or any other origin — even if a careless caller passes
// the wrong URL to Config.Storage. Falls back to the WebID's own origin only
// if the profile doesn't declare a storage location.
async function registerServerTokenForUser(webIdUrl, token) {
  let origin;
  try {
    const storage = Config.User?.Storage?.[0];
    origin = storage ? new URL(storage).origin : new URL(webIdUrl).origin;
  } catch {
    return;
  }
  if (!origin) return;

  const cfg = { token };
  await persistHttpOrigin(origin, cfg);
  const http = Config.Storage?.backend?.('http');
  if (http?.addOrigin) http.addOrigin(origin, cfg);
}

export async function signOutHttp(origin) {
  const { getDeviceStorageItem, removeDeviceStorageItem } = await import('./storage.js');
  if (origin) {
    const origins = (await getDeviceStorageItem(HTTP_ORIGINS_KEY)) || {};
    delete origins[origin];
    if (Object.keys(origins).length) {
      await setDeviceStorageItem(HTTP_ORIGINS_KEY, origins);
    } else {
      await removeDeviceStorageItem(HTTP_ORIGINS_KEY);
    }
  } else {
    await removeDeviceStorageItem(HTTP_ORIGINS_KEY);
  }
  const http = Config.Storage?.backend?.('http');
  if (http?.setToken) {
    if (origin) http.setToken(origin, null);
    else http.origins().forEach(o => http.setToken(o, null));
  }
}

async function persistForgeHost(host, cfg) {
  const { getDeviceStorageItem } = await import('./storage.js');
  const hosts = (await getDeviceStorageItem(GIT_FORGE_HOSTS_KEY)) || {};
  hosts[host] = cfg;
  await setDeviceStorageItem(GIT_FORGE_HOSTS_KEY, hosts);
}

function applyForgeUser(user, { provider, host, iriFallback }) {
  Config.User.IRI = user.html_url || iriFallback;
  Config.User.Name = user.full_name || user.name || user.login;
  Config.User.Image = user.avatar_url;
  Config.User.Contacts = Config.User.Contacts || {};
  Config.User.Preferences = Config.User.Preferences || {};
  Config.User.GitForge = { provider, host, login: user.login };
  updateDeviceStorageProfile(Config.User);
}

function renderSignedIn(aside, message) {
  var uI = document.getElementById('user-info');
  if (uI) {
    removeChildren(uI);
    sanitizeInsertAdjacentHTML(uI, 'beforeend', getAgentHTML() + Config.Button.Menu.SignOut);
  }
  showActionMessage(document.body, { content: message, type: 'success', timer: 5000 });
  if (aside?.parentNode) aside.parentNode.removeChild(aside);
}

async function signInWithGitHubPAT(token, aside) {
  try {
    const response = await fetch('https://api.github.com/user', { headers: { 'Accept': 'application/vnd.github.v3+json', 'Authorization': `Bearer ${token}` } });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const user = await response.json();

    const host = 'github.com';
    const cfg = { apiBase: 'https://api.github.com', rawHost: 'raw.githubusercontent.com', provider: 'github', token };
    await persistForgeHost(host, cfg);
    const gitforge = Config.Storage?.backend?.('gitforge');
    if (gitforge?.addHost) gitforge.addHost(host, cfg);

    applyForgeUser(user, { provider: 'github', host });
    renderSignedIn(aside, `Signed in to GitHub as ${user.login}.`);
  } catch (e) {
    showActionMessage(document.body, { content: `GitHub sign-in failed: ${e.message}`, type: 'error', timer: null });
  }
}

async function signInWithForgejoPAT(serverUrl, token, aside) {
  try {
    const server = serverUrl.replace(/\/$/, '');
    const apiBase = `${server}/api/v1`;
    const response = await fetch(`${apiBase}/user`, { headers: { 'Accept': 'application/json', 'Authorization': `token ${token}` } });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const user = await response.json();

    const host = new URL(server).host;
    const cfg = { apiBase, rawHost: host, provider: 'forgejo', token };
    await persistForgeHost(host, cfg);
    const gitforge = Config.Storage?.backend?.('gitforge');
    if (gitforge?.addHost) gitforge.addHost(host, cfg);

    applyForgeUser(user, { provider: 'forgejo', host, iriFallback: `${server}/${user.login}` });
    renderSignedIn(aside, `Signed in to ${host} as ${user.login}.`);
  } catch (e) {
    showActionMessage(document.body, { content: `Forgejo sign-in failed: ${e.message}`, type: 'error', timer: null });
  }
}

export async function signOutGitForge(host) {
  const { getDeviceStorageItem, removeDeviceStorageItem } = await import('./storage.js');
  if (host) {
    const hosts = (await getDeviceStorageItem(GIT_FORGE_HOSTS_KEY)) || {};
    delete hosts[host];
    if (Object.keys(hosts).length) {
      await setDeviceStorageItem(GIT_FORGE_HOSTS_KEY, hosts);
    } else {
      await removeDeviceStorageItem(GIT_FORGE_HOSTS_KEY);
    }
  } else {
    await removeDeviceStorageItem(GIT_FORGE_HOSTS_KEY);
  }
  const gitforge = Config.Storage?.backend?.('gitforge');
  if (gitforge?.setToken) {
    if (host) gitforge.setToken(host, null);
    else gitforge.hosts().forEach(h => gitforge.setToken(h, null));
  }
}

async function loginWithIDP(idpUrl) {
  Config.OIDC['authStartLocation'] = Config.OIDC.useStaticClientId ? window.location.href.split('#')[0] : null;
  updateBrowserStorageOIDC();
  if (Config['WebExtensionEnabled']) {
    return extensionLogin(idpUrl);
  }

  let redirect_uri = process.env.OIDC_REDIRECT_URI || (window.location.origin + '/');
  redirect_uri = Config.OIDC.useStaticClientId ? redirect_uri : window.location.href.split('#')[0];

  Config['Session']?.login(idpUrl, redirect_uri)
    .catch(e => {
      const message = {
        'content': `Cannot sign in with ${idpUrl}. ${e.message}`,
        'type': 'error',
        'timer': null
      };
      showActionMessage(document.body, message);
    });
}

//XXX: User Profile should've been fetch by now.
async function signInWithOIDC() {
  const idp = Config.User.OIDCIssuer;

  if (Config['WebExtensionEnabled']) {
    return extensionLogin(idp);
  }

  Config.OIDC['authStartLocation'] = window.location.href.split('#')[0];
  updateBrowserStorageOIDC();

  let redirect_uri = process.env.OIDC_REDIRECT_URI || (window.location.origin + '/');
  redirect_uri = Config.OIDC.useStaticClientId ? redirect_uri :  window.location.href.split('#')[0];

  // Redirects away from dokieli :( but hopefully only briefly :)
  Config['Session']?.login(idp, redirect_uri)
    .catch((e) => {
      console.error('OIDC sign-in failed:', e);
      const message = {
        'content': `Cannot sign in. Using information from profile to personalise the UI.`,
        'type': 'info',
        'timer': null
      }

      showActionMessage(document.body, message);

      afterSetUserInfo();
    });
}

// Extension-only OIDC login.
// The entire PKCE flow runs in the background service worker (the only context where
// browser.identity.launchWebAuthFlow() is available). The background returns the access
// token and exported DPoP key pair, which we use to construct a minimal duck-typed session
// object - avoiding any use of SessionCore whose prototype chain is broken by Firefox's
// Xray wrappers when the class extends the built-in EventTarget.
async function extensionLogin(idp) {
  const showError = (msg) => showActionMessage(document.body, { content: msg, type: 'error', timer: null });

  let response;
  try {
    console.log('dokieli: extensionLogin sending message to background');
    response = await Config.WebExtension.runtime.sendMessage({ action: 'dokieli.login', idp });
    console.log('dokieli: extensionLogin got response', response?.ok, 'webId:', response?.webId);
  } catch (e) {
    console.error('dokieli: extensionLogin sendMessage failed', e);
    return showError(`Cannot sign in: extension background unreachable. ${e.message}`);
  }

  if (!response?.ok) {
    console.error('dokieli: extensionLogin response not ok', response);
    return showError(`Cannot sign in with ${idp}. ${response?.error || 'Unknown error'}`);
  }

  const creds = {
    webId: response.webId,
    accessToken: response.accessToken,
    dpopPrivateJwk: response.dpopPrivateJwk,
    dpopPublicJwk: response.dpopPublicJwk,
  };

  try {
    await buildExtensionSession(creds);
    console.log('dokieli: extensionLogin session built for webId:', creds.webId);
  } catch (e) {
    console.error('dokieli: extensionLogin buildExtensionSession failed', e);
    return showError(`Cannot reconstruct session keys: ${e.message}`);
  }

  // Persist so page reload survives without re-login. Tokens expire (~1h); no refresh-token plumbing yet.
  try {
    await Config.WebExtension.storage.local.set({ [EXTENSION_SESSION_KEY]: creds });
  } catch (e) {
    console.warn('dokieli: could not persist extension session', e);
  }

  try {
    await setUserInfo(creds.webId);
  } catch (e) {
    console.error('dokieli: setUserInfo failed', e);
  }

  try {
    await Config.WebExtension.storage.local.set({
      [EXTENSION_SESSION_KEY]: {
        ...creds,
        name: Config.User?.Name || null,
        image: Config.User?.Image || null,
      },
    });
  } catch (e) {
    console.warn(e);
  }

  var uI = document.getElementById('user-info');
  if (uI) {
    removeChildren(uI);
    sanitizeInsertAdjacentHTML(uI, 'beforeend', getAgentHTML() + Config.Button.Menu.SignOut);
  }
  var userIdentityInput = document.getElementById('user-identity-input');
  if (userIdentityInput) {
    userIdentityInput.parentNode.removeChild(userIdentityInput);
  }

  afterSetUserInfo();
}

export function setUserInfo (subjectIRI, options = {}) {
  options.ui = Config.User.UI;
  options.fetchIndexes = options.fetchIndexes ?? true;

  // The WebID is the IRI: set it up front so UI personalisation (e.g. the CV
  // `about` on lists) works even if the profile document fails to load/parse.
  Config.User.IRI = subjectIRI;

  return getSubjectInfo(subjectIRI, options).then(subject => {
    setPreferredLanguagesInfo(subject.Graph);

    const restoredTypeIndex = Config.User.TypeIndex;
    const restoredHasRegistrations = restoredTypeIndex && Object.values(restoredTypeIndex).some(v => v && Object.keys(v).length > 0);

    Object.keys(subject).forEach((key) => {
      Config.User[key] = subject[key];
    })

    // getSubjectInfo returns an empty TypeIndex (registrations are fetched later by
    // afterSetUserInfo). Don't let it clobber registrations already restored from
    // device storage, otherwise a refresh drops them until the fetch re-runs.
    const fetchedTypeIndex = subject.TypeIndex;
    const fetchedHasRegistrations = fetchedTypeIndex && Object.values(fetchedTypeIndex).some(v => v && Object.keys(v).length > 0);
    if (restoredHasRegistrations && !fetchedHasRegistrations) {
      Config.User.TypeIndex = restoredTypeIndex;
    }

    updateDeviceStorageProfile(Config.User);
  });
}


//TODO: Review grapoi
/**
 * @param subjectIRI {string}
 *
 * @returns {Promise}
 */

//TODO: Review grapoi
export function afterSetUserInfo() {
  updateCollabUserIdentity();

  getResourceSupplementalInfo(Config.DocumentURL).then(resourceInfo => {
    updateButtons();
  });

  // Check for an existing keystore and surface the unlock prompt if found.
  // Deferred so it does not block the rest of the sign-in flow.
  hasKeystore().then(exists => {
    if (exists) {
      import('./dialog.js').then(({ showEncryptionUnlock }) => showEncryptionUnlock());
    }
  });

  var promises = [];

  if (Config.User.Graph) {
    promises.push(getAgentTypeIndex(Config.User.Graph)
      .then(typeIndexes => {
        Config.User.TypeIndex = Config.User.TypeIndex || {};
        // Only overwrite a type index we actually fetched registrations for, so a
        // transient empty fetch (e.g. auth not ready on refresh) doesn't drop the
        // registrations already restored from device storage.
        let changed = false;
        Object.keys(typeIndexes).forEach(typeIndexType => {
          if (typeIndexes[typeIndexType] && Object.keys(typeIndexes[typeIndexType]).length > 0) {
            Config.User.TypeIndex[typeIndexType] = typeIndexes[typeIndexType];
            changed = true;
          }
        });
        // Persist right after fetching so a refresh restores the registrations from
        // device storage instead of relying on the fetch re-running.
        if (changed) { updateDeviceStorageProfile(Config.User); }
      }));

    promises.push(getAgentPreferencesInfo(Config.User.Graph)
      .then(preferencesInfo => {
        Config.User['Preferences'] = { graph: preferencesInfo };
        return preferencesInfo.node(rdf.namedNode(Config.User.IRI));
      })
      .then(g => {
        setPreferredPolicyInfo(g);
        setPreferredLanguagesInfo(g);
      })
      .catch(error => {
        var g = Config.User.Graph.node(rdf.namedNode(Config.User.IRI));
        setPreferredPolicyInfo(g);
        setPreferredLanguagesInfo(g);
      }))

    promises.push(getAgentSupplementalInfo(Config.User.IRI))
    promises.push(getAgentSeeAlsoPrimaryTopicOf(Config.User.Graph))
  }

  var user = document.querySelectorAll('aside.do article *[rel~="dcterms:creator"] > *[about="' + Config.User.IRI + '"]');

  for (let i = 0; i < user.length; i++) {
    var article = user[i].closest('article')
    sanitizeInsertAdjacentHTML(article, 'afterbegin', '<button class="delete" type="button">' + Icon[".fas.fa-trash-alt"] + '</button>')
  }

  var buttonDelete = document.querySelectorAll('aside.do blockquote[cite] article button.delete')

  for (let i = 0; i < buttonDelete.length; i++) {
    buttonDelete[i].addEventListener('click', function (e) {
      var button = e.target.closest('button.delete');
      handleDeleteNote(button);
    })
  }

  return Promise.allSettled(promises)
    .then(results => {
      var uI = document.getElementById('user-info')

      //FIXME: This works but is it fugly? It is so that 1) we don't have double assignment of event handler on user-info's signOut and to also make sure that the user with a Session can actually signOut (removing children loses the event)
      if (uI && !Config['Session']?.isActive) {
        // uI.replaceChildren(fragmentFromString(DO.Config.Button.Menu.SignOut))

        removeChildren(uI);
        showUserSigninSignout(uI);
      }

      showGeneralMessages();

      // Signal that user info is ready. initAuth also fires this on page load,
      // but interactive sign-ins (custom WebID, GitHub) only reach it here.
      Config['AuthReady'] = true;
      document.dispatchEvent(new Event('dokieli:auth-ready'));

      return updateDeviceStorageProfile(Config.User)
    })
    .catch(e => {
      return Promise.resolve();
    });
}
