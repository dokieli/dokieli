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

// dokieli document-composition renderers for embedded reference kinds (footnotes, citations).
// These are dokieli's inline presentation, not part of the general @dokieli/web-annotation
// library, so they live here and are branched to in createNoteDataHTML.

import Config from '../../config.js';
import { getPrefixedNameFromIRI } from '../../uri.js';

export function renderFootnote(annotation) {
  const { id, refId, refLabel = '', motivatedBy = '', citationURL = '', body = [] } = annotation;
  const prefixedMotivation = getPrefixedNameFromIRI(motivatedBy) || '';

  const citationLink = citationURL
    ? `<a href="${citationURL}" rel="rdfs:seeAlso">${citationURL}</a>`
    : '';
  const bodyValue = body[0]?.value ?? '';
  const bodyHTML = bodyValue
    ? (citationLink ? `, ${bodyValue}` : bodyValue)
    : '';

  return [
    `<dl about="#${id}" id="${id}" typeof="oa:Annotation">`,
    `<dt><a href="#${refId}" rel="oa:hasTarget">${refLabel}</a><span rel="oa:motivation" resource="${prefixedMotivation}"></span></dt>`,
    `<dd rel="oa:hasBody" resource="#n-${id}"><div datatype="rdf:HTML" property="rdf:value" resource="#n-${id}" typeof="oa:TextualBody">${citationLink}${bodyHTML}</div></dd>`,
    `</dl>`,
  ].join('\n');
}

const CITATION_LABELS = { citedBy: 'Cited by', citationType: 'Citation type', cites: 'Cites', citation: 'Citation' };

export function renderCitation(annotation, options = {}) {
  const { id, citation } = annotation;
  if (!citation) throw new Error('renderCitation: citation is required');

  const { headingLevel = 1, about } = options;
  const L = CITATION_LABELS;
  const hX = headingLevel;
  const aAbout = about ?? `#${id}`;

  const citingEntityLabel = citation.citingEntityLabel ?? citation.citingEntity;
  const citedEntityLabel = citation.citedEntityLabel ?? citation.citedEntity;
  const characterizationLabel =
    Config.Citation?.[citation.citationCharacterization]
    ?? citation.citationCharacterizationLabel
    ?? citation.citationCharacterization;

  const citationHTML = [
    `<dl about="${citation.citingEntity}">`,
    `<dt>${L.citedBy}</dt><dd><a href="${citation.citingEntity}">${citingEntityLabel}</a></dd>`,
    `<dt>${L.citationType}</dt><dd><a href="${citation.citationCharacterization}">${characterizationLabel}</a></dd>`,
    `<dt>${L.cites}</dt><dd><a href="${citation.citedEntity}" rel="${citation.citationCharacterization}">${citedEntityLabel}</a></dd>`,
    `</dl>`,
  ].join('\n');

  return [
    `<article about="${aAbout}" id="${id}" prefixes="cito: http://purl.org/spart/cito/">`,
    `<h${hX}>${L.citation}</h${hX}>`,
    citationHTML,
    `</article>`,
  ].join('\n');
}
