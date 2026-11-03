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
import { getResourceGraph } from './graph.js';
import { i18n } from './i18n.js';
import { escapeRDFLiteral } from './util.js';
import { removeChildren } from './utils/html.js';
import { showUserNameForm } from './ui/menu.js';
import { domSanitize } from './utils/sanitization.js';
import { updateDeviceStorageProfile } from './storage.js';
import { patchResourceWithAcceptPatch } from './fetcher.js';
import { stripFragmentFromString } from './uri.js';
import { addMessageToLog, showActionMessage } from './doc.js';
import { showUserSigninSignout } from './auth.js';

// Writes foaf:name to the WebID profile, replacing any existing foaf:name. Other name properties are left as they are.
export async function saveUserName(name) {
  const webid = Config.User.IRI;

  if (!webid || !Config.User.Graph) return;

  try {
    await patchUserName(name, Config.User.Graph);
  } catch (e) {
    // 409 means the profile changed since it was loaded, so re-fetch and retry once
    if (e?.status !== 409) throw e;

    const { graph } = await getResourceGraph(stripFragmentFromString(webid));
    if (!graph) throw e;

    Config.User.Graph = graph.node(rdf.namedNode(webid));
    await patchUserName(name, Config.User.Graph);
  }
}

async function patchUserName(name, g) {
  const webid = Config.User.IRI;
  const profileDoc = stripFragmentFromString(webid);
  const patch = {};

  if (g.out(Config.ns.foaf.name).terms.length) {
    patch.delete = `<${webid}> foaf:name ?name .`;
    patch.where = patch.delete;
  }
  patch.insert = `<${webid}> foaf:name "${escapeRDFLiteral(name)}" .`;

  await patchResourceWithAcceptPatch(profileDoc, [patch]);

  // Mirror the change in the in-memory graph so a later edit matches what is now on the server
  try {
    g.deleteOut(Config.ns.foaf.name);
    g.addOut(Config.ns.foaf.name, rdf.literal(name));
  } catch (e) {
    console.log('Could not update in-memory profile graph:', e);
  }

  Config.User.Name = domSanitize(name);
  updateDeviceStorageProfile(Config.User);
}

// Returns true on success so the caller can update the UI
export async function saveUserNameWithMessage(name) {
  try {
    await saveUserName(name);
    const message = { content: i18n.t('message.user-name.success.textContent'), type: 'success', timer: 3000 };
    addMessageToLog(message, Config.MessageLog);
    showActionMessage(document.body, message);
    return true;
  } catch (e) {
    const body = await e?.response?.text?.().catch(() => null);
    console.error('Could not save name:', e, body || '');
    const message = { content: i18n.t('message.user-name.error.textContent'), type: 'error', timer: null };
    addMessageToLog(message, Config.MessageLog);
    showActionMessage(document.body, message);
    return false;
  }
}

// Replaces the user's name in the menu with an input, saving it to the profile on confirm
export function showUserNameInput(editButton) {
  const userInfo = editButton.closest('#user-info');

  showUserNameForm(editButton, {
    name: Config.User.Name || '',
    save: async name => {
      if (!await saveUserNameWithMessage(name)) return false;
      removeChildren(userInfo);
      await showUserSigninSignout(userInfo);
      userInfo.querySelector('button.edit-user-name')?.focus();
      return true;
    }
  });
}
