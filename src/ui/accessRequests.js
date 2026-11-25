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

// Access requests in the inbox of the open document, shown to its controllers when it is opened and as they
// arrive. Allowing grants the requested modes; either answer is sent to the requester and removes the request.

import rdf from 'rdf-ext';
import { modeFromIRI, modesFor, planGrant } from '@dokieli/web-access-control';
import Config from '../config.js';
import { i18n } from '../i18n.js';
import { accessModeAllowed } from '../access.js';
import { stripFragmentFromString } from '../uri.js';
import { domSanitize } from '../utils/sanitization.js';
import { Icon } from './icons.js';

const ns = Config.ns;
const WEBSOCKET_CHANNEL = 'http://www.w3.org/ns/solid/notifications#WebSocketChannel2023';

const watched = new Set();
const shown = new Set();

/**
 * Watches the inbox of the open document when the user controls it. Safe to call repeatedly.
 */
export async function watchAccessRequests() {
  const documentURL = stripFragmentFromString(Config.DocumentURL || '');
  if (!documentURL || watched.has(documentURL)) return;
  if (!Config.User.IRI || !accessModeAllowed(documentURL, 'control')) return;
  watched.add(documentURL);

  const { findDocumentInbox } = await import('../accessRequest.js');
  const inbox = await findDocumentInbox(documentURL);
  if (inbox) watchInbox(inbox, documentURL);
}

export async function watchInbox(inbox, documentURL) {
  watched.add(documentURL);
  await showPendingRequests(inbox, documentURL);
  listenForRequests(inbox, documentURL);
}

function isOpen(documentURL) {
  return stripFragmentFromString(Config.DocumentURL || '') === documentURL;
}

async function showPendingRequests(inbox, documentURL) {
  const { getResourceGraph } = await import('../graph.js');
  let items;
  try {
    const { graph } = await getResourceGraph(inbox, { 'Accept': 'text/turtle', 'Cache-Control': 'no-cache' }, { noCache: true });
    items = graph.node(rdf.namedNode(inbox)).out(ns.ldp.contains).values;
  }
  catch (error) {
    console.log('Could not read the inbox of the document:', error);
    return;
  }

  for (const item of items) {
    if (!isOpen(documentURL)) return;
    if (shown.has(item)) continue;
    const request = await readAccessRequest(item, documentURL);
    if (request && !(await alreadyAllowed(request, documentURL))) {
      shown.add(item);
      await showRequest(request, documentURL);
    }
  }
}

// Older requests have unexpanded acl: terms
function aclTerm(name) {
  return [ns.acl[name], rdf.namedNode(`acl:${name}`)];
}

function objectsOf(dataset, subject, name) {
  return aclTerm(name).flatMap(predicate => [...dataset.match(subject, predicate, null)].map(q => q.object.value));
}

async function readAccessRequest(url, documentURL) {
  const { getResourceGraph } = await import('../graph.js');
  let dataset;
  try {
    ({ graph: { dataset } } = await getResourceGraph(url));
  }
  catch {
    return null;
  }

  for (const { subject: activity } of dataset.match(null, ns.rdf.type, ns.as.Request)) {
    const actor = [...dataset.match(activity, ns.as.actor, null)][0]?.object.value;
    for (const { object } of dataset.match(activity, ns.as.object, null)) {
      const accessTo = objectsOf(dataset, object, 'accessTo');
      if (!accessTo.some(iri => stripFragmentFromString(iri) === documentURL)) continue;
      const agent = objectsOf(dataset, object, 'agent')[0] || actor;
      const modes = objectsOf(dataset, object, 'mode')
        .map(iri => modeFromIRI(iri))
        .filter(mode => ['Read', 'Write', 'Append'].includes(mode));
      if (agent && modes.length) {
        return { url, actor: actor || agent, agent, modes };
      }
    }
  }
  return null;
}

async function alreadyAllowed(request, documentURL) {
  try {
    const { getACLContext } = await import('../wac.js');
    const ctx = await getACLContext(documentURL);
    const modes = modesFor(ctx, { type: 'agent', iri: request.agent });
    return request.modes.every(mode => modes.has(mode));
  }
  catch {
    return false;
  }
}

async function agentLabel(iri) {
  try {
    const { getResourceGraph, getAgentName } = await import('../graph.js');
    const { graph } = await getResourceGraph(stripFragmentFromString(iri));
    return getAgentName(graph.node(rdf.namedNode(iri))) || iri;
  }
  catch {
    return iri;
  }
}

function escapeHTML(text) {
  return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

async function showRequest(request, documentURL) {
  const { addMessageToLog, showActionMessage } = await import('../doc.js');
  const name = escapeHTML(await agentLabel(request.agent));
  const who = `<a href="${escapeHTML(request.agent)}" rel="noopener" target="_blank">${name}</a>`;
  const key = request.modes.includes('Write') ? 'access-request.edit.span' : 'access-request.read.span';
  const text = i18n.t(`${key}.textContent`, { name: who, interpolation: { escapeValue: false } });

  addMessageToLog({ content: i18n.t(`${key}.textContent`, { name }), type: 'info' }, Config.MessageLog);
  const id = showActionMessage(document.body, {
    content: `<p>${text}</p>
      <p class="access-request">
      <button class="access-request-allow" data-i18n="access-request.allow.button" type="button">${i18n.t('access-request.allow.button.textContent')}</button>
      <button class="access-request-decline" data-i18n="access-request.decline.button" type="button">${i18n.t('access-request.decline.button.textContent')}</button>
      </p>`,
    type: 'info',
    timer: null,
  });

  const item = document.getElementById(id);
  if (!item) return;
  item.querySelector('.access-request-allow').addEventListener('click', () => answer(item, request, documentURL, true, name));
  item.querySelector('.access-request-decline').addEventListener('click', () => answer(item, request, documentURL, false, name));
}

async function answer(item, request, documentURL, allow, name) {
  item.querySelectorAll('button').forEach(button => { button.disabled = true; });
  const status = document.createElement('span');
  status.className = 'progress';
  status.setHTMLUnsafe(domSanitize(Icon[".fas.fa-circle-notch.fa-spin.fa-fw"]));
  item.querySelector('.access-request').append(' ', status);

  try {
    if (allow) {
      const { getACLContext, applyACLPlan } = await import('../wac.js');
      const ctx = await getACLContext(documentURL);
      await applyACLPlan(planGrant(ctx, { type: 'agent', iri: request.agent }, request.modes));
    }
  }
  catch (error) {
    console.log('Could not grant access:', error);
    status.setHTMLUnsafe(domSanitize(`${Icon[".fas.fa-times-circle.fa-fw"]} <span data-i18n="access-request.failed.span">${i18n.t('access-request.failed.span.textContent')}</span>`));
    item.querySelectorAll('button').forEach(button => { button.disabled = false; });
    return;
  }

  const notified = await reply(request, documentURL, allow);
  await Config.Storage.delete(request.url).catch(error => console.log('Could not remove the request from the inbox:', error));

  const key = allow ? 'access-request.allowed.span' : 'access-request.declined.span';
  const unnotified = notified ? '' : ` <span data-i18n="access-request.not-notified.span">${i18n.t('access-request.not-notified.span.textContent')}</span>`;
  item.className = allow ? 'success' : 'info';
  item.setHTMLUnsafe(domSanitize(`${allow ? Icon[".fas.fa-check"] : Icon[".fas.fa-circle-info"]} <span>${i18n.t(`${key}.textContent`, { name, interpolation: { escapeValue: false } })}</span>${unnotified}`));
}

async function reply(request, documentURL, allow) {
  try {
    const { getResourceGraph, getAgentInbox } = await import('../graph.js');
    const { notifyInbox } = await import('../activity.js');
    const { graph } = await getResourceGraph(stripFragmentFromString(request.actor));
    const inbox = getAgentInbox(graph.node(rdf.namedNode(request.actor)))?.[0];
    if (!inbox) return false;

    await notifyInbox({
      type: [allow ? 'as:Accept' : 'as:Reject'],
      inbox,
      object: request.url,
      target: documentURL,
      summary: i18n.t(allow ? 'access-request.reply.allowed.textContent' : 'access-request.reply.declined.textContent', { document: documentURL }),
    });
    return true;
  }
  catch (error) {
    console.log('Could not tell the requester:', error);
    return false;
  }
}

// WebSocketChannel2023 subscription to the inbox while the document is open
async function listenForRequests(inbox, documentURL) {
  let receiveFrom;
  try {
    const { findSubscriptionService } = await import('../collab.js');
    const service = await findSubscriptionService(inbox, WEBSOCKET_CHANNEL);
    if (!service) return;
    const body = JSON.stringify({ '@context': ['https://www.w3.org/ns/solid/notification/v1'], type: WEBSOCKET_CHANNEL, topic: inbox });
    const response = await Config.Storage.post(service, '', body, 'application/ld+json', null, { headers: { 'Accept': 'application/ld+json' } });
    ({ receiveFrom } = await response.json());
  }
  catch (error) {
    console.log('Could not listen for new access requests:', error);
    return;
  }
  if (!receiveFrom || !isOpen(documentURL)) return;

  const socket = new WebSocket(receiveFrom);
  socket.addEventListener('message', () => {
    if (!isOpen(documentURL)) {
      socket.close();
      return;
    }
    showPendingRequests(inbox, documentURL);
  });
  socket.addEventListener('close', () => {
    if (isOpen(documentURL)) setTimeout(() => listenForRequests(inbox, documentURL), 30000);
  });
}
