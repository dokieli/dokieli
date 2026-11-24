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

import Config from './config.js';
import { generateAttributeId } from './util.js';
import { getLinkRelation } from './graph.js';
import { notifyInbox } from './activity.js';
import { stripFragmentFromString } from './uri.js';

const ns = Config.ns;

/**
 * Sends an as:Request for read and write access to `accessTo` to `inbox`.
 */
export function requestAccess(inbox, accessTo) {
  const objectId = '#' + generateAttributeId();
  const agent = Config.User.IRI;

  // Full IRIs, as the prefix declaration on the list does not end up in the notification
  const statements = `<dl about="${objectId}">
<dt>Object type</dt><dd><a about="${objectId}" href="${ns.acl.Authorization.value}" typeof="${ns.acl.Authorization.value}">Authorization</a></dd>
<dt>Agents</dt><dd><a href="${agent}" property="${ns.acl.agent.value}">${agent}</a></dd>
<dt>Access to</dt><dd><a href="${accessTo}" property="${ns.acl.accessTo.value}">${accessTo}</a></dd>
<dt>Modes</dt><dd><a href="${ns.acl.Read.value}" property="${ns.acl.mode.value}">Read</a></dd><dd><a href="${ns.acl.Write.value}" property="${ns.acl.mode.value}">Write</a></dd>
</dl>
`;

  return notifyInbox({
    type: ['as:Request'],
    inbox,
    object: objectId,
    statements,
  });
}

/**
 * Resolves to the inbox of the document, or null.
 */
export async function findDocumentInbox(documentURL) {
  documentURL = stripFragmentFromString(documentURL);

  const { getDocumentInbox } = await import('./doc.js');
  const known = getDocumentInbox(documentURL);
  if (known) return known;

  try {
    const inboxes = await getLinkRelation(ns.ldp.inbox.value, documentURL);
    return inboxes?.[0] || null;
  }
  catch {
    return null;
  }
}
