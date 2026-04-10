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

import { Schema } from "prosemirror-model";
import Config from '../../config.js';

// export const globalAttributes = ['class', 'dir', 'id', 'lang', 'title', 'translate', 'xml:lang', 'xmlns'];
// export const markupAttributes = ['alt', 'cite', 'colspan', 'control', 'crossorigin', 'data-cite', 'data-datetime', 'data-event-keyup-enter', 'data-editor-id', 'data-dfn-type', 'data-lt', 'data-id', 'data-inbox', 'data-link-type', 'data-plurals', 'data-to', 'data-target', 'data-type', 'data-versiondate', 'data-versionurl', 'datetime', 'height', 'poster', 'preload', 'rowspan', 'style', 'type', 'width'];
// export const rdfaAttributes = ['about', 'content', 'datatype', 'href', 'inlist', 'prefix', 'property', 'rel', 'resource', 'rev', 'src', 'typeof', 'vocab'];
// 'voidElements': ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'],
// 'selfClosing': ['circle', 'ellipse', 'line', 'path', 'polygon', 'polyline', 'rect', 'stop', 'use'],
export const allowedEmptyAttributes = ['open', 'alt'];
// export const doAttributes = Array.from(new Set(globalAttributes.concat(markupAttributes).concat(rdfaAttributes).sort()));
// console.log(doAttributes)
//TODO: data-*
// export const svgAttributes = doAttributes.concat(['accent-height', 'accumulate', 'additive', 'alignment-baseline', 'alphabetic', 'amplitude', 'arabic-form', 'ascent', 'attributeName', 'attributeType', 'azimuth', 'baseFrequency', 'baseline-shift', 'baseProfile', 'bbox', 'begin', 'bias', 'by', 'calcMode', 'cap-height', 'class', 'clip', 'clipPathUnits', 'clip-path', 'clip-rule', 'color', 'color-interpolation', 'color-interpolation-filters', 'crossorigin', 'cursor', 'cx', 'cy', 'd', 'decoding', 'descent', 'diffuseConstant', 'direction', 'display', 'divisor', 'dominant-baseline', 'dur', 'dx', 'dy', 'edgeMode', 'elevation', 'end', 'exponent', 'fill', 'fill-opacity', 'fill-rule', 'filter', 'filterUnits', 'flood-color', 'flood-opacity', 'font-family', 'font-size', 'font-size-adjust', 'font-stretch', 'font-style', 'font-variant', 'font-weight', 'fr', 'from', 'fx', 'fy', 'g1', 'g2', 'glyph-name', 'glyph-orientation-horizontal', 'glyph-orientation-vertical', 'gradientTransform', 'gradientUnits', 'hanging', 'height', 'horiz-adv-x', 'horiz-origin-x', 'horiz-origin-y', 'href', 'hreflang', 'id', 'ideographic', 'image-rendering', 'in', 'in2', 'intercept', 'k', 'k1', 'k2', 'k3', 'k4', 'kernelMatrix', 'kernelUnitLength', 'keyPoints', 'keySplines', 'keyTimes', 'lang', 'lengthAdjust', 'letter-spacing', 'lighting-color', 'limitingConeAngle', 'local', 'marker-end', 'marker-mid', 'marker-start', 'markerHeight', 'markerUnits', 'markerWidth', 'mask', 'maskContentUnits', 'maskUnits', 'mathematical', 'max', 'media', 'method', 'min', 'mode', 'name', 'numOctaves', 'offset', 'opacity', 'operator', 'order', 'orient', 'orientation', 'origin', 'overflow', 'overline-position', 'overline-thickness', 'paint-order', 'panose-1', 'path', 'pathLength', 'patternContentUnits', 'patternTransform', 'patternUnits', 'ping', 'pointer-events', 'points', 'pointsAtX', 'pointsAtY', 'pointsAtZ', 'preserveAlpha', 'preserveAspectRatio', 'primitiveUnits', 'r', 'radius', 'referrerPolicy', 'refX', 'refY', 'rel', 'rendering-intent', 'repeatCount', 'repeatDur', 'requiredExtensions', 'requiredFeatures', 'restart', 'result', 'rotate', 'rx', 'ry', 'scale', 'seed', 'shape-rendering', 'side', 'slope', 'spacing', 'specularConstant', 'specularExponent', 'speed', 'spreadMethod', 'startOffset', 'stdDeviation', 'stemh', 'stemv', 'stitchTiles', 'stop-color', 'stop-opacity', 'strikethrough-position', 'strikethrough-thickness', 'string', 'stroke', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-width', 'style', 'surfaceScale', 'systemLanguage', 'tabindex', 'tableValues', 'target', 'targetX', 'targetY', 'text-anchor', 'text-decoration', 'text-rendering', 'textLength', 'to', 'transform', 'transform-origin', 'type', 'u1', 'u2', 'underline-position', 'underline-thickness', 'unicode', 'unicode-bidi', 'unicode-range', 'units-per-em', 'v-alphabetic', 'v-hanging', 'v-ideographic', 'v-mathematical', 'values', 'vector-effect', 'version', 'vert-adv-y', 'vert-origin-x', 'vert-origin-y', 'viewBox', 'visibility', 'width', 'widths', 'word-spacing', 'writing-mode', 'x', 'x-height', 'x1', 'x2', 'xChannelSelector', 'xlink:actuate', 'xlink:arcrole', 'xlink:href Deprecated', 'xlink:role', 'xlink:show', 'xlink:title', 'xlink:type', 'xml:lang', 'xml:space', 'y', 'y1', 'y2', 'yChannelSelector', 'z', 'zoomAndPan']);
// const mathAttributes = doAttributes.concat([]);

const headings = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

export const DIR_AUTO_TAGS = new Set([
  // block
  "p", "li", "dt", "dd", "figcaption", "blockquote", "pre", "summary",

  // svg / text
  "tspan", "text",

  // inline
  "del", "ins", "mark", "cite", "q", "sup", "sub", "a", "time",
  "em", "strong", "b", "i", "u", "s", "strike",
  "dfn", "abbr", "var", "samp", "kbd", "button",

  // metadata-ish but text-bearing
  "title", "metadata"
]);

export function toDOMWith(tagName, options = {}) {
  return function (node) {
    const attrs = node.attrs.originalAttributes || {};
    const { skipContentHole, ...optionalAttrs } = options;
    if (skipContentHole) {
      return [tagName, { ...optionalAttrs, ...attrs }];
    }
    return [tagName, { ...optionalAttrs, ...attrs }, 0];
  };
}

function getAttributes (node) {
  const attrs = {};

  for (const attr of node.attributes) {
    if (['__proto__', 'constructor', 'prototype'].includes(attr.name)) continue;
    attrs[attr.name] = attr.value; 
  }

  const nodeName = node.nodeName.toLowerCase();

  if (headings.includes(nodeName)) {
    return {
      originalAttributes: attrs,
      level: Number(nodeName[1]),
    }
  }

  return { originalAttributes: attrs };
};

//TODO: Generalise the creation of this object
let customNodes = {
  doc: {
    content: 'block+'
  },
  text: {
    group: "inline",
    // whitespace: "pre"
  },
  // dir-eligible nodes
  p: {
    content: "inline*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "p", preserveWhitespace: "full", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("p")
    // whitespace: "pre"
  },
  dt: {
    content: "inline*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "dt", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("dt")
  },
  dd: {
    content: "block+",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "dd", preserveWhitespace: "full", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("dd")
  },
  li: {
    content: "block+",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "li", preserveWhitespace: "full", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("li"),
    defining: true
  },
  pre: {
    content: "inline*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "pre", preserveWhitespace: "full", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("pre"),
    code: true,
    defining: true
  },
  blockquote: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "blockquote", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("blockquote"),
    defining: true
  },
  summary: {
    content: "inline*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "summary", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("summary")
  },
  figcaption: {
    content: "block+",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "figcaption", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("figcaption")
  },
  svgText: {
    content: "inline*",
    group: "inline",
    inline: true,
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "text", getAttrs(node) { return getAttributes(node) }}],
    toDOM: toDOMWith("text")
  },
  tspan: {
    content: "inline*",
    group: "inline",
    inline: true,
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "tspan", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("tspan")
  },
  title: {
    content: "inline*",
    group: "inline",
    inline: true,
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "title", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("title")
  },
  metadata: {
    content: "inline*",
    group: "inline",
    inline: true,
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "metadata", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("metadata")
  },
  button: {
    content: "inline*",
    group: "inline",
    inline: true,
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "button", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("button")
  },
  main: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "main", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["main", { ...node.attrs.originalAttributes }, 0]; }
  },
  article: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "article", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("article")
  },
  section: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "section", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("section")
  },
  aside: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "aside", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("aside")
  },
  header: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "header", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("header")
  },
  footer: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "footer", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("footer")
  },
  div: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "div", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("div")
  },
  style: {
    content: "text*",
    group: "block",
    atom: true,
    code: true,
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "style", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("style")
  },
  script: {
    content: "text*",
    group: "block",
    atom: true,
    code: true,
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "script", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("script")
  },
  nav: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "nav", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("nav")
  },
  address: {
    content: "inline*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "address", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("address")
  },
  heading: {
    content: "inline*",
    group: "block",
    attrs: { level: { default: 1, validate: "number" }, originalAttributes: { default: {} } },
    parseDOM: headings.map(h => ({ tag: h, getAttrs(node) { return getAttributes(node); } })),
    toDOM(node) {
      const { level, originalAttributes } = node.attrs;
      return ["h" + level, { ...originalAttributes }, 0]
    },
    defining: true
  },
  img: {
    group: "inline",
    inline: true,
    draggable: true,
    attrs: {
      originalAttributes: {
        default: {}, 
        src: { validate: "string" },
        alt: { default: null, validate: "string|null" },
        title: { default: null, validate: "string|null" }
      }
    },
    parseDOM: [{ tag: "img[src]", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("img", { skipContentHole: true }) // img is a leaf node, so it shouldn't have a content hole
  },
  dl: {
    content: "block+",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "dl", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("dl")
  },
  ul: {
    content: "li+",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "ul", getAttrs(node){ return getAttributes(node); } }],
    toDOM: toDOMWith("ul")
  },
  ol: {
    content: "li+",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "ol", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("ol")
  },
  code: {
    inline: true,
    group: "inline",
    code: true,
    content: "inline*",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "code", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("code")
  },
  video: {
    content: "block+",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "video", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("video")
  },
  audio: {
    content: "block+",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "audio", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("audio")
  },
  source: {
    content: "inline*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "source", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("source", {skipContentHole: true})
  },
  track: {
    content: "inline*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "track", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("track")
  },
  figure: {
    content: "block+",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "figure", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("figure")
  },
  details: {
    content: "block+",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "details", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("details")
  },
  hr: {
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "hr", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("hr", {skipContentHole: true})
  },
  object: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "object", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("object")
  },

  iframe: {
    group: "block",
    atom: true,
    isolating: true,
    defining: true,
    selectable: true,
    draggable: true,
    attrs: {
      originalAttributes: { default: {} }
    },
    parseDOM: [{
      tag: "iframe",
      priority: 100,
      getAttrs(node) {
        return getAttributes(node);
      }
    }],
    toDOM: toDOMWith("iframe", {skipContentHole: true})
  },

  //TODO: math
  math: {
    content: "inline+",
    group: "inline",
    inline: true,
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "math", getAttrs(node) { return getAttributes(node) }}],
    toDOM: toDOMWith("http://www.w3.org/1998/Math/MathML math")
  },
  mfrac: {
    content: "inline*",
    group: "inline",
    inline: true,
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "mfrac", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("http://www.w3.org/1998/Math/MathML mfrac")
  },
  mi: {
    content: "inline*",
    group: "inline",
    inline: true,
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "mi", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("http://www.w3.org/1998/Math/MathML mi")
  },
  mo: {
    content: "inline*",
    group: "inline",
    inline: true,
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "mo", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("http://www.w3.org/1998/Math/MathML mo")
  },
/*
  mn: {
    content: "inline*",
    group: "inline",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "mn", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("http://www.w3.org/1998/Math/MathML mn")
  },
  mroot: {
    content: "inline*",
    group: "inline",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "mroot", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("http://www.w3.org/1998/Math/MathML mroot")
  },
*/
  mrow: {
    content: "inline*",
    group: "inline",
    inline: true,
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "mrow", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("http://www.w3.org/1998/Math/MathML mrow")
  },
/*
  ms: {
    content: "inline*",
    group: "inline",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "ms", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("http://www.w3.org/1998/Math/MathML ms")
  },
  mspace: {
    content: "inline*",
    group: "inline",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "mspace", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("http://www.w3.org/1998/Math/MathML mspace")
  },
  msqrt: {
    content: "inline*",
    group: "inline",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "msqrt", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("http://www.w3.org/1998/Math/MathML msqrt")
  },
  msub: {
    content: "inline*",
    group: "inline",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "msub", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("http://www.w3.org/1998/Math/MathML msub")
  },
  msup: {
    content: "inline*",
    group: "inline",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "msup", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("http://www.w3.org/1998/Math/MathML msup")
  },
  mtext: {
    content: "inline*",
    group: "inline",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "mtext", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("http://www.w3.org/1998/Math/MathML mtext")
  },
*/

  svg: {
    content: "inline+",
    group: "inline",
    inline: true,
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "svg", getAttrs(node) { return getAttributes(node) }}],
    toDOM: toDOMWith("http://www.w3.org/2000/svg svg")
  },
  g: {
    content: "inline*",
    group: "inline",
    inline: true,
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "g", getAttrs(node) { return getAttributes(node) }}],
    toDOM: toDOMWith("http://www.w3.org/2000/svg g")
  },
  circle: {
    content: "inline+",
    group: "inline",
    inline: true,
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "circle", getAttrs(node) { return getAttributes(node) }}],
    toDOM: toDOMWith("http://www.w3.org/2000/svg circle")
  },
  line: {
    content: "inline+",
    group: "inline",
    inline: true,
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "line", getAttrs(node) { return getAttributes(node) }}],
    toDOM: toDOMWith("http://www.w3.org/2000/svg line")
  },
  path: {
    content: "inline*",
    group: "inline",
    inline: true,
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "path", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("http://www.w3.org/2000/svg path")
  },
  defs: {
    content: "inline*",
    group: "inline",
    inline: true,
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "defs", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("http://www.w3.org/2000/svg defs")
  },
  marker: {
    content: "inline*",
    group: "inline",
    inline: true,
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "marker", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("http://www.w3.org/2000/svg marker")
  },
  form: {
    content: "inline*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "form", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("form")
  },
  label: {
    content: "inline*",
    group: "inline",
    inline: true,
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "label", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("label")
  },
  select: {
    content: "inline+",
    group: "inline",
    inline: true,
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "select", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("select")
  },
  option: {
    content: "inline*",
    group: "inline",
    inline: true,
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "option", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("options")
  },
  input: {
    group: "inline",
    inline: true,
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "input", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("input", { skipContentHole: true })
  },
  textarea: {
    content: "inline*",
    group: "inline",
    inline: true,
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "textarea", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("textarea")
  },

  table: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "table", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("table")
  },
  thead: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "thead", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("thead")
  },
  tbody: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "tbody", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("tbody")
  },
  tfoot: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "tfoot", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("tfoot")
  },
  caption: {
    content: "inline*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "caption", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("caption")
  },
  tr: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "tr", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("tr")
  },
  th: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "th", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("th")
  },
  td: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "td", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("td")
  },
  colgroup: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "colgroup", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("colgroup")
  },
  col: {
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "col", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("col", {skipContentHole: true})
  },

  canvas: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "canvas", getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith("canvas")
  },
};
//Make PM Nodes for all inlineElements except those that need to be Marks.
Config.DOMProcessing.inlineElements.filter(el => !Config.DOMProcessing.proseMirrorMarks.includes(el) && !Object.keys(customNodes).includes(el)).map((tagName) => {
  customNodes[tagName] = {
    inline: true,
    group: "inline",
    content: "inline*",
    // whitespace: "pre",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: tagName, /*preserveWhitespace: "full", */getAttrs(node){ return getAttributes(node); }}],
    toDOM: toDOMWith(tagName)
  }
});

const customMarks = {};

Config?.DOMProcessing.proseMirrorMarks.forEach(tagName => {
  let namespace = '';

  const toDOM =
    DIR_AUTO_TAGS.has(tagName)
      ? toDOMWith(tagName)
      : function (node) {
          return [
            namespace + tagName,
            { ...(node.attrs.originalAttributes || {}) },
            0
          ];
        };

  customMarks[tagName] = {
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: tagName, preserveWhitespace: true, getAttrs(node){ return getAttributes(node); }}],
    // toDOM(node) { return [namespace + tagName, { ...node.attrs.originalAttributes }, 0]; },
    toDOM,
    inclusive: false,
    excludes: "",
    group: "inline",
    // whitespace: "pre"
  }

  switch(tagName) {
    case 'a':
      customMarks[tagName].attrs = {
        originalAttributes: {
          default: {},
          href: { validate: "string" },
          title: { default: null, validate: "string|null" }
        }
      }
      break;
  };
});

const nodes = customNodes;
const marks = customMarks;

const schema = new Schema({
  nodes: nodes,
  marks: marks
});

// console.log(schema);

export { schema };
