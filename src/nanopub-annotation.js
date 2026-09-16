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

import { Nanopub, parse, DEFAULT_NANOPUB_URI } from '@nanopub/nanopub-js';
import { serializeAnnotationToJSONLD } from '@dokieli/web-annotation';
import { getGraphFromData } from './graph.js';
import { getRegistryURL, getAgentIRI, publishIntroduction, getKeyTrustStatus, promptForSigningKey } from './nanopub.js';
import { getSigningKeyMaterial } from './keystore.js';
import Config from './config.js';

const PREFIXES = `@prefix oa: <http://www.w3.org/ns/oa#> .
@prefix cito: <http://purl.org/spar/cito/> .
@prefix dct: <http://purl.org/dc/terms/> .
@prefix prov: <http://www.w3.org/ns/prov#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix schema: <https://schema.org/> .
@prefix npx: <http://purl.org/nanopub/x/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix sub: <${DEFAULT_NANOPUB_URI}> .
`;

export const ACTION_TO_STANCE = {
  approve: 'cito:agreesWith',
  disapprove: 'cito:disputes'
};

const DOKIELI_IRI = 'https://dokie.li/#i';

function quads(turtle) {
  return parse(PREFIXES + turtle, 'turtle');
}

function iri(value) {
  return `<${value}>`;
}

// '' and '#' both resolve to the nanopub, conflating the publication with the annotation
function toNanopubIds(node) {
  if (Array.isArray(node)) return node.map(toNanopubIds);
  if (!node || typeof node !== 'object') return node;

  const out = {};
  for (const [key, value] of Object.entries(node)) {
    const isLocalId = (key === 'id' || key === '@id') && typeof value === 'string' &&
      (value === '' || value.startsWith('#'));

    out[key] = isLocalId
      ? DEFAULT_NANOPUB_URI + (value.slice(1) || 'annotation')
      : toNanopubIds(value);
  }
  return out;
}

async function annotationQuads(noteData) {
  const jsonld = toNanopubIds(serializeAnnotationToJSONLD(noteData));
  const pointer = await getGraphFromData(JSON.stringify(jsonld), {
    contentType: 'application/ld+json',
    subjectURI: DEFAULT_NANOPUB_URI
  });
  return [...pointer.dataset];
}

// Reuses the annotation's own source and selector, so the disputed fragment is the annotated one
function stanceQuads(stance, noteData) {
  const bodyId = firstBodyId(noteData);
  const source = noteData.target?.source || noteData.target?.iri;
  if (!stance || !bodyId || !source) return [];

  const selectorId = selectorIdOf(noteData);
  const selector = selectorId ? `;\n    oa:hasSelector ${iri(selectorId)}` : '';

  return quads(`${iri(bodyId)} a schema:Statement ;
  ${stance} [ a oa:SpecificResource ;
    oa:hasSource ${iri(source)}${selector} ] .`);
}

function firstBodyId(noteData) {
  const body = Array.isArray(noteData.body) ? noteData.body[0] : noteData.body;
  return body?.id ? DEFAULT_NANOPUB_URI + body.id : null;
}

function selectorIdOf(noteData) {
  const id = noteData.target?.selector?.id;
  return id ? DEFAULT_NANOPUB_URI + id : null;
}

function provenanceQuads(agent) {
  return quads(`sub:assertion prov:wasAttributedTo ${iri(agent)} .`);
}

// The query service partitions its per-type repositories by npx:hasNanopubType
function pubinfoQuads(agent, { created, license, stance }) {
  const types = ['oa:Annotation'];
  if (stance) types.push(stance);

  const lines = [
    `dct:creator ${iri(agent)}`,
    `dct:created "${created}"^^xsd:dateTime`,
    `npx:hasNanopubType ${types.join(', ')}`,
    `oa:renderedVia ${iri(DOKIELI_IRI)}`
  ];
  if (license) lines.push(`dct:license ${iri(license)}`);

  return quads(`<${DEFAULT_NANOPUB_URI.replace(/\/$/, '')}> ${lines.join(' ;\n  ')} .`);
}

/** Wraps an annotation as an unsigned nanopub: the Web Annotation goes in the assertion graph, authorship in provenance and pubinfo. */
export async function annotationToNanopub(noteData, options = {}) {
  const agent = options.agent || noteData.creator?.iri || Config.User?.IRI;
  if (!agent) {
    const error = new Error('An agent IRI is required to publish an annotation.');
    error.code = 'no-agent';
    throw error;
  }

  const stance = options.stance || ACTION_TO_STANCE[options.action];
  const created = noteData.datetime || new Date().toISOString();
  const license = options.license || noteData.license;

  return new Nanopub({
    assertion: [...await annotationQuads(noteData), ...stanceQuads(stance, noteData)],
    provenance: provenanceQuads(agent),
    pubinfo: pubinfoQuads(agent, { created, license, stance }),
    options: { privateKey: options.privateKey, orcid: agent, name: Config.User?.Name }
  });
}

/** Signs and publishes an annotation to the nanopub network, introducing the key first when it has never been announced. */
export async function publishAnnotation(noteData, options = {}, unlocked = false) {
  const agent = options.agent || getAgentIRI();

  let material;
  try {
    material = await getSigningKeyMaterial();
  }
  catch (e) {
    // Unlocking resumes the post rather than losing it
    if (e.code !== 'no-signing-key' || unlocked) throw e;
    return promptForSigningKey(() => publishAnnotation(noteData, options, true));
  }

  const { privateKey, publicKey } = material;

  if (!Config.User.Keys.Signing.IntroductionURI) {
    const status = await getKeyTrustStatus(publicKey, agent);
    if (!status?.found) await publishIntroduction(true);
  }

  const np = await annotationToNanopub(noteData, { ...options, agent, privateKey });
  await np.sign();

  const published = await np.publish(getRegistryURL());
  // The returned URI is canonical and only resolves once the nanopub is on the main network
  return { ...published, registryURI: getRegistryURL() + published.uri.split('/').pop() };
}
