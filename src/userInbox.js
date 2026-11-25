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

// Live watch on the signed-in user's inbox over WebSocketChannel2023.

import Config from './config.js';

const WEBSOCKET_CHANNEL = 'http://www.w3.org/ns/solid/notifications#WebSocketChannel2023';

const handlers = new Set();
const seen = new Set();
let socket = null;
let watchedInbox = null;
let starting = null;
let listeningForSignIn = false;

// Calls handler(itemURL, inboxURL) for each new notification; returns an unsubscribe function.
export function onUserInboxItem(handler) {
  handlers.add(handler);
  watchUserInbox();
  if (!listeningForSignIn) {
    listeningForSignIn = true;
    document.addEventListener('dokieli:auth-ready', () => { watchUserInbox(); });
  }
  return () => {
    handlers.delete(handler);
    if (!handlers.size) {
      socket?.close();
    }
  };
}

// Resolves once the watch is up, so an action taken right after cannot miss its answer.
export function watchUserInbox() {
  if (!starting) {
    starting = startWatch()
      .catch(error => console.log('Could not listen to the inbox of the user:', error))
      .finally(() => { starting = null; });
  }
  return starting;
}

async function startWatch() {
  const inbox = Config.User.Inbox?.[0];
  if (!inbox || !handlers.size) return;
  if (socket && watchedInbox === inbox) return;

  if (watchedInbox !== inbox) {
    seen.clear();
    watchedInbox = inbox;
  }
  try {
    (await inboxItems(inbox)).forEach(item => seen.add(item));
  }
  catch {}

  const { findSubscriptionService } = await import('./collab.js');
  const service = await findSubscriptionService(inbox, WEBSOCKET_CHANNEL);
  if (!service) return;
  const body = JSON.stringify({ '@context': ['https://www.w3.org/ns/solid/notification/v1'], type: WEBSOCKET_CHANNEL, topic: inbox });
  const response = await Config.Storage.post(service, '', body, 'application/ld+json', null, { headers: { 'Accept': 'application/ld+json' } });
  const { receiveFrom } = await response.json();
  if (!receiveFrom || !handlers.size) return;

  const ws = new WebSocket(receiveFrom);
  socket = ws;
  ws.addEventListener('open', () => checkForNewItems(inbox));
  ws.addEventListener('message', () => checkForNewItems(inbox));
  ws.addEventListener('close', () => {
    if (socket !== ws) return;
    socket = null;
    if (handlers.size) {
      setTimeout(() => watchUserInbox(), 30000);
    }
  });
}

async function inboxItems(inbox) {
  const { default: rdf } = await import('rdf-ext');
  const { getResourceGraph } = await import('./graph.js');
  const { graph } = await getResourceGraph(inbox, { 'Accept': 'text/turtle', 'Cache-Control': 'no-cache' }, { noCache: true });
  return graph.node(rdf.namedNode(inbox)).out(Config.ns.ldp.contains).values;
}

async function checkForNewItems(inbox) {
  let items;
  try {
    items = await inboxItems(inbox);
  }
  catch {
    return;
  }
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    handlers.forEach(handler => {
      Promise.resolve(handler(item, inbox)).catch(error => console.log('User inbox handler failed:', error));
    });
  }
}
