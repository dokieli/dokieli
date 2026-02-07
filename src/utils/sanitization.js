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

import Config from '../config.js'
import DOMPurify from 'dompurify';
import { htmlEncode } from '../util.js';

export function domSanitize(strHTML, options = {}) {
  if (!strHTML) return;
  // console.log("DOMPurify in:", strHTML);

  //TODO: Consider allowing meta, link, object

  DOMPurify.addHook('uponSanitizeElement', function(node, data) {
    if (node.nodeName.toLowerCase() === 'script') {
      let src = node.getAttribute('src');
      if (src) {
        src = src.trim();
        if (!Object.keys(Config.DOMProcessing.allowedScripts).includes(src)) {
          node.remove();
        }
      } else {
        node.remove();
      }
    }
  });

  DOMPurify.addHook('uponSanitizeAttribute', function(node, data) {
    const attrName = data.attrName;
    const attrValue = data.attrValue?.trim().toLowerCase();

    if (['href', 'src', 'data', 'xlink:href'].includes(attrName)) {
      const lowerValue = attrValue.toLowerCase();

      if (lowerValue.startsWith('javascript:') || lowerValue.startsWith('vbscript:')) {
        data.keepAttr = false;
        return;
      }

      if (lowerValue.startsWith('data:')) {
        const mimeMatch = lowerValue.match(/^data:([^;,]+)[;,]/);
        const mimeType = mimeMatch?.[1];

        if (!mimeType || !Config.DOMProcessing.allowedDataMimeTypes.includes(mimeType)) {
          data.keepAttr = false;
          return;
        }

        if (['image/svg+xml'].includes(mimeType)) {
          const sanitizedUrl = sanitizeDataUrl(attrValue);
          if (sanitizedUrl) {
            data.attrValue = sanitizedUrl;
          } else {
            data.keepAttr = false;
          }
        }
      }

      //TODO blob:
      // if (attrValue.startsWith('blob:')) {
      //   const trustedBlobSources = [
      //     'blob:https://dokie.li',

      //   ];
      //   const originMatch = attrValue.match(/^blob:(https?:\/\/[^\/]+)/);
      //   if (!originMatch || !trustedBlobSources.includes(originMatch[0])) {
      //     data.keepAttr = false;
      //     return;
      //   }
      // }
    }
  });

  const cleanHTML = DOMPurify.sanitize(strHTML, {
    ALLOW_UNKNOWN_PROTOCOLS: options.ALLOW_UNKNOWN_PROTOCOLS !== false,
    ADD_TAGS: ['script'],
    ADD_ATTR: [...Config.DOMProcessing.rdfaAttributes, 'alttext', 'xml:lang', `xmlns:ev`, 'target'],
    ...options
  });

  // console.log("DOMPurify out:", cleanHTML);
  return cleanHTML;
}

export function sanitizeDataUrl(dataUrl) {
  const payload = extractDataPayload(dataUrl);
  if (!payload) return null;

  const { mimeType, decodedContent } = payload;

  if (mimeType === 'text/html' || mimeType === 'image/svg+xml') {
    const cleanContent = domSanitize(decodedContent);
    const reEncoded = btoa(cleanContent);
    return `data:${mimeType};base64,${reEncoded}`;
  }

  return dataUrl;
}

export function extractDataPayload(dataUrl) {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.*)$/);
  if (!match) return null;

  const mimeType = match[1];
  const base64Content = match[2];
  const decodedContent = atob(base64Content);

  return { mimeType, decodedContent };
}

export function sanitizeObject(input, options = {}) {
  if (typeof input !== 'object' || input === null) return input;

  for (const key in input) {
    if (!Object.hasOwn(input, key)) continue;

    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      delete input[key];
      continue;
    }

    const value = input[key];

    if (typeof value === 'string') {
      input[key] = domSanitize(value);
      if (options.htmlEncode) {
        input[key] = htmlEncode(input[key]);
      }
    }
    else if (Array.isArray(value)) {
      input[key] = value.map(item =>
        typeof item === 'object' && item !== null ? sanitizeObject(item, options) : item
      );
    }
    else if (typeof value === 'object' && value !== null) {
      input[key] = sanitizeObject(value, options);
    }
  }

  return input;
}

export function domSanitizeHTMLBody(input, options) {
  if (!input) return input;

  let rootNode;
  let html = '';

  if (input.constructor.name === 'HTMLDocument') {
    rootNode = input.body;
    if (!rootNode) return input;
    html = rootNode.getHTML ? rootNode.getHTML() : '';
  } else if (input.constructor.name === 'XMLDocument') {
    rootNode = input.documentElement;
    if (!rootNode) return input;
    html = rootNode.outerHTML || '';
  } else {
    rootNode = input;
    html = rootNode.getHTML ? rootNode.getHTML() : '';
  }

  const sanitizedChildren = domSanitize(html, options);

  if (rootNode.setHTMLUnsafe) {
    rootNode.setHTMLUnsafe(sanitizedChildren);
  }

  return input;
}

export function sanitizeInsertAdjacentHTML(node, position, input) {
  node.insertAdjacentHTML(position, domSanitize(input));
}

export function sanitizeIRI(value, base = null) {
  try {
    const iri = base ? new URL(value, base) : new URL(value);

    const unsafeSchemes = ['javascript:', 'data:', 'vbscript:'];
    if (unsafeSchemes.includes(iri.protocol)) return null;

    return iri.href;
  } catch {
    return null;
  }
}

export function safeObjectAssign(target, ...sources) {
  for (const src of sources) {
    for (const key of Object.keys(src)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue;
      }
      target[key] = src[key];
    }
  }
  return target;
}
