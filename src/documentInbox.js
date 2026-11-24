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

// Document inboxes: a container next to the document that anyone can append to and its controllers can read.

import { agentsWithMode } from '@dokieli/web-access-control';
import Config from './config.js';
import { getLinkRelationFromHead } from './graph.js';
import { getACLContext } from './wac.js';
import { stripFragmentFromString } from './uri.js';

const ns = Config.ns;

/**
 * Creates an inbox for the document, links it from the document's metadata and content,
 * and resolves to its URL. Requires Control of the document.
 */
export async function createDocumentInbox(documentURL) {
  documentURL = stripFragmentFromString(documentURL);

  const controllers = await documentControllers(documentURL);
  if (!controllers.length) throw new Error('Sign in to allow comments and access requests.');
  const inbox = await createInboxContainer(documentURL);
  try {
    await setInboxAccess(inbox, controllers);
    await linkInbox(documentURL, inbox);
  }
  catch (error) {
    await Config.Storage.delete(inbox).catch(() => {});
    throw error;
  }

  Config.Resource[documentURL] ||= {};
  Config.Resource[documentURL].inbox = [inbox];

  await addInboxToDocument(documentURL, inbox).catch(error => {
    console.log('Could not add the inbox to the document:', error);
  });
  lastSynced.set(documentURL, inbox);
  return inbox;
}

// In author mode through the editor, so it goes through the shared document; otherwise into the DOM and saved
async function addInboxToDocument(documentURL, inbox) {
  const { createInboxHTML, updateMutableResource } = await import('./doc.js');
  const html = createInboxHTML(inbox);

  if (Config.EditorEnabled) {
    const { appendHTMLToEditor } = await import('./editor/editor.js');
    if (appendHTMLToEditor(html)) return;
  }

  const { selectArticleNode } = await import('./utils/html.js');
  const article = selectArticleNode(document) || document.body;
  if (inboxDeclaredIn(article, documentURL)) return;
  const { sanitizeInsertAdjacentHTML } = await import('./utils/sanitization.js');
  sanitizeInsertAdjacentHTML(article, 'beforeend', html);
  await updateMutableResource(documentURL);
  const { markLocalSnapshotPublished } = await import('./sync.js');
  await markLocalSnapshotPublished(documentURL).catch(() => {});
}

/**
 * The ldp:inbox or as:inbox declared in an HTML string or node, outside dokieli's own elements.
 */
export function inboxDeclaredIn(source, documentURL) {
  let root = source;
  if (typeof source === 'string') {
    const doc = document.implementation.createHTMLDocument('');
    doc.documentElement.setHTMLUnsafe(source);
    root = doc.body;
  }
  const node = Array.from(root.querySelectorAll('[rel~="ldp:inbox"], [rel~="as:inbox"], [rel~="http://www.w3.org/ns/ldp#inbox"]'))
    .find(n => !n.closest('.do'));
  const value = node?.getAttribute('href') || node?.getAttribute('resource');
  if (!value) return null;
  try { return new URL(value, documentURL).href; } catch { return null; }
}

// Last inbox known to be in each document's metadata
const lastSynced = new Map();

/**
 * After a save, updates the metadata when the document declares a different inbox.
 * A document without an inbox leaves the metadata as it is, as it may be an older copy.
 */
export async function syncInboxMetadata(documentURL, html) {
  documentURL = stripFragmentFromString(documentURL);
  const declared = inboxDeclaredIn(html, documentURL);
  if (!declared || lastSynced.get(documentURL) === declared) return;

  try {
    const response = await Config.Storage.head(documentURL, { 'Cache-Control': 'no-cache' });
    const LinkHeader = (await import('http-link-header')).default;
    const links = LinkHeader.parse(response.headers.get('Link') || '');
    const linked = links.rel(ns.ldp.inbox.value).map(link => new URL(link.uri, documentURL).href);
    if (!(linked.length === 1 && linked[0] === declared)) {
      const metaLink = links.rel('describedby')[0]?.uri;
      if (!metaLink) return;
      const patch = { insert: `<${documentURL}> <${ns.ldp.inbox.value}> <${declared}> .\n` };
      if (linked.length) {
        patch.delete = linked.map(inbox => `<${documentURL}> <${ns.ldp.inbox.value}> <${inbox}> .\n`).join('');
      }
      await Config.Storage.patchWithConneg(new URL(metaLink, documentURL).href, patch);
    }
    lastSynced.set(documentURL, declared);
    Config.Resource[documentURL] ||= {};
    Config.Resource[documentURL].inbox = [declared];
  }
  catch (error) {
    console.log('Could not update the inbox in the metadata of the document:', error);
  }
}

async function documentControllers(documentURL) {
  const agents = new Set(Config.User.IRI ? [Config.User.IRI] : []);
  try {
    const ctx = await getACLContext(documentURL);
    agentsWithMode(ctx, 'Control').forEach(agent => agents.add(agent));
  }
  catch (error) {
    console.log('Could not read the ACL of the document:', error);
  }
  return [...agents];
}

// notes.html → notes-inbox/, notes-inbox-2/, …
function inboxCandidates(documentURL) {
  const url = new URL(documentURL);
  const isContainer = url.pathname.endsWith('/');
  const folder = isContainer ? url.href : new URL('./', url).href;
  const name = isContainer ? '' : decodeURIComponent(url.pathname.split('/').pop()).replace(/\.[^.]*$/, '');
  const base = name ? `${name}-inbox` : 'inbox';
  const names = [base];
  for (let n = 2; n <= 9; n++) names.push(`${base}-${n}`);
  return names.map(n => `${folder}${encodeURIComponent(n)}/`);
}

async function createInboxContainer(documentURL) {
  for (const url of inboxCandidates(documentURL)) {
    try {
      await Config.Storage.put(url, '', 'text/turtle', null, { headers: { 'If-None-Match': '*' } });
      return url;
    }
    catch (error) {
      // 409 (CSS) or 412: already exists
      if (![409, 412].includes(error?.status)) throw error;
    }
  }
  throw new Error('Could not find a free name for the inbox next to ' + documentURL);
}

async function setInboxAccess(inbox, controllers) {
  const [aclLink] = await getLinkRelationFromHead('acl', inbox);
  const aclURL = new URL(aclLink, inbox).href;
  const agents = controllers.map(agent => `<${agent}>`).join(', ');
  const acl = `@prefix acl: <http://www.w3.org/ns/auth/acl#>.
@prefix foaf: <http://xmlns.com/foaf/0.1/>.

<#controllers>
  a acl:Authorization;
  acl:agent ${agents};
  acl:accessTo <${inbox}>;
  acl:default <${inbox}>;
  acl:mode acl:Read, acl:Write, acl:Control.

<#public>
  a acl:Authorization;
  acl:agentClass foaf:Agent;
  acl:accessTo <${inbox}>;
  acl:mode acl:Append.
`;
  await Config.Storage.put(aclURL, acl, 'text/turtle');
}

// CSS exposes ldp:inbox in the description resource as a Link header
async function linkInbox(documentURL, inbox) {
  const [metaLink] = await getLinkRelationFromHead('describedby', documentURL);
  if (!metaLink) throw new Error('The document has no metadata resource to link the inbox from.');
  const metaURL = new URL(metaLink, documentURL).href;
  await Config.Storage.patchWithConneg(metaURL, { insert: `<${documentURL}> <${ns.ldp.inbox.value}> <${inbox}> .\n` });
}
