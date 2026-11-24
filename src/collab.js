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

// Shared editing rooms advertised as a YjsChannel subscription service in the storage description.
// Subscribing returns a ticket whose `receiveFrom` is the WebSocket URL of the room.

import rdf from 'rdf-ext';
import { allows, parseWacAllow } from '@dokieli/web-access-control';
import Config from './config.js';
import { getLinkRelation, getResourceGraph } from './graph.js';
import { isHttpOrHttpsProtocol, stripFragmentFromString } from './uri.js';

const ns = Config.ns;

export const YJS_CHANNEL_TYPE = 'https://dokie.li/ns#YjsChannel';

const discoveries = new Map();
const services = new Map();

/**
 * Resolves to the YjsChannel subscription service for the document, or null.
 */
export function discoverCollabService(documentURL) {
  const url = stripFragmentFromString(documentURL);
  if (!isHttpOrHttpsProtocol(url)) {
    return Promise.resolve(null);
  }
  if (!discoveries.has(url)) {
    const discovery = findCollabService(url)
      .catch(error => {
        console.warn('Shared editing discovery failed:', error);
        return null;
      })
      .then(service => {
        services.set(url, service);
        return service;
      });
    discoveries.set(url, discovery);
  }
  return discoveries.get(url);
}

/**
 * The subscription service found by an earlier discovery, if any.
 */
export function getKnownCollabService(documentURL) {
  return services.get(stripFragmentFromString(documentURL)) || null;
}

// The storage description link is public, so try an uncached, unauthenticated HEAD first
async function findStorageDescription(documentURL) {
  try {
    const response = await fetch(documentURL, { method: 'HEAD', credentials: 'omit', cache: 'no-store' });
    const link = response.headers.get('Link') || '';
    const rel = ns.solid.storageDescription.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`<([^>]+)>\\s*;[^,]*rel="?${rel}"?`).exec(link);
    if (match) {
      return new URL(match[1], documentURL).href;
    }
  }
  catch {}
  const descriptions = await getLinkRelation(ns.solid.storageDescription.value, documentURL);
  return descriptions?.[0] || null;
}

async function findCollabService(documentURL) {
  return findSubscriptionService(documentURL, YJS_CHANNEL_TYPE);
}

/**
 * Resolves to the subscription service of the given channel type in the resource's storage description, or null.
 */
export async function findSubscriptionService(resourceURL, channelTypeIRI) {
  const description = await findStorageDescription(resourceURL);
  if (!description) {
    return null;
  }
  const { graph } = await getResourceGraph(description);
  const channelType = rdf.namedNode(channelTypeIRI);
  for (const quad of graph.dataset.match(null, ns.notify.subscription, null)) {
    if (graph.dataset.match(quad.object, ns.notify.channelType, channelType).size) {
      return quad.object.value;
    }
  }
  return null;
}

/**
 * Checks write access with a fresh WAC-Allow, as the cached one may predate the restored session.
 * Resolves to true when there is no WAC-Allow.
 */
export async function mayEditNow(documentURL) {
  const response = await Config.Storage.head(documentURL);
  const value = response.headers.get('WAC-Allow');
  if (!value) {
    return true;
  }
  const permissionGroup = parseWacAllow(value);
  const headers = Config.Resource?.[documentURL]?.headers;
  if (headers) {
    headers['wac-allow'] = { 'field-value': value, permissionGroup };
  }
  return allows(permissionGroup, 'Write');
}

/**
 * Resolves to the `receiveFrom` URL of a new ticket for the room of `topic`.
 */
export async function getCollabTicket(service, topic) {
  const body = JSON.stringify({
    '@context': ['https://www.w3.org/ns/solid/notification/v1'],
    type: YJS_CHANNEL_TYPE,
    topic: stripFragmentFromString(topic),
  });
  const response = await Config.Storage.post(service, '', body, 'application/ld+json', null, {
    headers: { 'Accept': 'application/ld+json' },
  });
  const ticket = await response.json();
  if (typeof ticket.receiveFrom !== 'string' || !/^wss?:\/\//.test(ticket.receiveFrom)) {
    throw new Error('The shared editing ticket has no WebSocket URL.');
  }
  return ticket.receiveFrom;
}

// y-websocket connects to `${serverUrl}/${roomname}`
export function splitTicketURL(receiveFrom) {
  const i = receiveFrom.lastIndexOf('/');
  return { serverUrl: receiveFrom.slice(0, i), roomname: receiveFrom.slice(i + 1) };
}

/**
 * Points the provider at a new ticket for its next connection.
 * Resolves to false on failure; when the ticket is refused, the provider is disconnected.
 */
export async function useNewCollabTicket(provider, service, topic) {
  try {
    const { serverUrl, roomname } = splitTicketURL(await getCollabTicket(service, topic));
    provider.serverUrl = serverUrl;
    provider.roomname = roomname;
    return true;
  }
  catch (error) {
    if ([401, 403, 404, 410].includes(error?.status)) {
      provider.disconnect();
    }
    console.warn('Could not get a shared editing ticket:', error);
    return false;
  }
}
