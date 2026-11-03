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

// Adapter between dokieli and @dokieli/web-access-control: storage-backed
// fetch, rdf-ext parsing, ACL context caching, and plan application.

import { findEffectiveACL, modeFromIRI, toTurtle, planPublicRead, planContainerACL, namedNode, quad, ACL, FOAF, RDF_TYPE } from '@dokieli/web-access-control';
import Config from './config.js';
import { getGraphFromData, getLinkRelationFromHead } from './graph.js';
import { isHttpOrHttpsProtocol } from './uri.js';

// The fetcher throws on non-2xx but the effective ACL resource algorithm
// needs the raw 404/403 responses to walk containers or stop.
async function storageFetch(url, init = {}) {
  const method = (init.method || 'GET').toUpperCase();
  const headers = init.headers || {};

  try {
    return (method === 'HEAD')
      ? await Config.Storage.head(url, headers)
      : await Config.Storage.get(url, headers);
  }
  catch (error) {
    if (error?.response) return error.response;
    if (error?.cause?.response) return error.cause.response;
    throw error;
  }
}

async function parseGraph(data, { baseIRI, contentType }) {
  const mediaType = contentType.split(';')[0].trim();
  const g = await getGraphFromData(data, { subjectURI: baseIRI, contentType: mediaType });
  return [...g.dataset];
}

// The document response already carried Link rel=acl, so discovery can start
// from it instead of repeating the HEAD.
function knownACLResource(documentURL) {
  const refs = Config.Resource?.[documentURL]?.headers?.linkHeaders?.refs;
  return refs?.find(ref => ref.rel === 'acl')?.uri;
}

export async function getACLContext(documentURL) {
  // getResource returns undefined for file: URLs, so stop before discovery
  if (!isHttpOrHttpsProtocol(documentURL)) {
    throw new Error('Access control is only available over HTTP(S): ' + documentURL);
  }

  const ctx = await findEffectiveACL(documentURL, {
    'fetch': storageFetch,
    'parse': parseGraph,
    'aclResource': knownACLResource(documentURL)
  });

  Config.Resource[documentURL] = Config.Resource[documentURL] || {};
  Config.Resource[documentURL]['acl'] = {
    'defaultACLResource': ctx.defaultACLResource,
    'effectiveACLResource': ctx.effectiveACLResource,
    'effectiveContainer': ctx.effectiveContainer,
    'context': ctx
  };

  return ctx;
}

// Inherited ACLs are copied into a resource-specific one by the planner
export async function setPublicRead(resourceURL, enabled) {
  const ctx = await getACLContext(resourceURL);
  const plan = planPublicRead(ctx, enabled);
  if (!plan.inserts.length && !plan.deletes.length) return;
  return applyACLPlan(plan);
}

const ensuredSettingsDocuments = new Set();

// Creates a settings document (preferences file, type index) unless it is there, public or private; checked once per session
export async function ensureSettingsDocument(url, data, isPublic) {
  if (ensuredSettingsDocuments.has(url)) return false;

  let created = false;
  try {
    await Config.Storage.put(url, data, 'text/turtle', null, { headers: { 'If-None-Match': '*' } });
    created = true;
  }
  catch (e) {
    if (e?.status !== 412) throw e;
  }
  ensuredSettingsDocuments.add(url);

  if (created) {
    await setPublicRead(url, isPublic).catch(e => console.log('Could not set access for ' + url, e));
  }
  return created;
}

// The owner gets full access to the container and everything in it, and everyone can read them when public
export async function setContainerACL(containerURL, owner, isPublic) {
  const [aclURL] = await getLinkRelationFromHead('acl', containerURL);
  const aclResource = new URL(aclURL, containerURL).href;
  const plan = planContainerACL({
    aclURL: aclResource,
    containerURL,
    owner,
    ownerModes: ['Read', 'Write', 'Control'],
    defaultModes: ['Read', 'Write', 'Control']
  });

  if (isPublic) {
    const rule = namedNode(aclResource + '#public');
    plan.inserts.push(
      quad(rule, namedNode(RDF_TYPE), namedNode(ACL + 'Authorization')),
      quad(rule, namedNode(ACL + 'accessTo'), namedNode(containerURL)),
      quad(rule, namedNode(ACL + 'default'), namedNode(containerURL)),
      quad(rule, namedNode(ACL + 'agentClass'), namedNode(FOAF + 'Agent')),
      quad(rule, namedNode(ACL + 'mode'), namedNode(ACL + 'Read'))
    );
  }

  return applyACLPlan(plan);
}

export function cachedACLContext(documentURL) {
  return Config.Resource[documentURL]?.acl?.context;
}

export function applyACLPlan(plan) {
  const patch = {};
  if (plan.deletes.length) patch['delete'] = toTurtle(plan.deletes);
  if (plan.inserts.length) patch['insert'] = toTurtle(plan.inserts);
  return Config.Storage.patchWithConneg(plan.target, [patch]);
}

// UI mode implication: selecting Write also grants Read, Control grants all.
// The library writes exactly the modes it is given.
// A combined option lists its modes separated by spaces
export function expandAccessMode(modeIRI) {
  if (modeIRI.includes(' ')) {
    return [...new Set(modeIRI.split(' ').flatMap(expandAccessMode))];
  }

  switch (modeFromIRI(modeIRI)) {
    case 'Read': return ['Read'];
    case 'Write': return ['Read', 'Write'];
    case 'Control': return ['Read', 'Write', 'Control'];
    case 'Append': return ['Append'];
    default: return [];
  }
}
