import Config from '../config.js'
import DOMPurify from 'dompurify';
import { htmlEncode } from './html.js';

export function domSanitize(strHTML, options = {}) {
  // console.log("DOMPurify in:", strHTML);

  DOMPurify.addHook('uponSanitizeElement', function(node, data) {
    if (node.nodeName.toLowerCase() === 'script') {
      const src = node.getAttribute('src');
      if (!Config.DOMProcessing.allowedScripts.includes(src)) {
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

export function domSanitizeHTMLBody(nodeDocument, options) {
  //EXPERIMENTAL
  // var nodeDocument = document.implementation.createHTMLDocument('template');
  // nodeDocument.documentElement.setHTMLUnsafe(htmlString);

  const bodyHTML = nodeDocument.body.getHTML();
  // .trim();
  // console.log(bodyHTML + '<--bodyHTML THERE SHOULD BE NO LINE BREAK BEFORE THIS-->');

  const bodyChildrenSanitized = domSanitize(bodyHTML, optio);
  // .trim();
  // console.log(bodyChildrenSanitized + '<--domSanitize(bodyHTML) THERE SHOULD BE NO LINE BREAK BEFORE THIS-->');

  nodeDocument.body.setHTMLUnsafe(bodyChildrenSanitized);
  // console.log(nodeDocument.documentElement.outerHTML + '<--bodyChildrenSanitized THERE SHOULD BE NO LINE BREAK BEFORE THIS-->');
  return nodeDocument;
}
