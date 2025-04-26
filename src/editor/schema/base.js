import { Schema } from "prosemirror-model";

// export const globalAttributes = ['class', 'dir', 'id', 'lang', 'title', 'translate', 'xml:lang', 'xmlns'];
// export const markupAttributes = ['alt', 'cite', 'colspan', 'control', 'crossorigin', 'data-cite', 'data-datetime', 'data-event-keyup-enter', 'data-editor-id', 'data-dfn-type', 'data-lt', 'data-id', 'data-inbox', 'data-link-type', 'data-plurals', 'data-to', 'data-target', 'data-type', 'data-versiondate', 'data-versionurl', 'datetime', 'height', 'poster', 'preload', 'rowspan', 'style', 'type', 'width'];
export const rdfaAttributes = ['about', 'content', 'datatype', 'href', 'inlist', 'prefix', 'property', 'rel', 'resource', 'rev', 'src', 'typeof', 'vocab'];
// 'voidElements': ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'],
// 'selfClosing': ['circle', 'ellipse', 'line', 'path', 'polygon', 'polyline', 'rect', 'stop', 'use'],
export const allowedEmptyAttributes = ['open', 'alt'];
// export const doAttributes = Array.from(new Set(globalAttributes.concat(markupAttributes).concat(rdfaAttributes).sort()));
// console.log(doAttributes)
//TODO: data-*
// export const svgAttributes = doAttributes.concat(['accent-height', 'accumulate', 'additive', 'alignment-baseline', 'alphabetic', 'amplitude', 'arabic-form', 'ascent', 'attributeName', 'attributeType', 'azimuth', 'baseFrequency', 'baseline-shift', 'baseProfile', 'bbox', 'begin', 'bias', 'by', 'calcMode', 'cap-height', 'class', 'clip', 'clipPathUnits', 'clip-path', 'clip-rule', 'color', 'color-interpolation', 'color-interpolation-filters', 'crossorigin', 'cursor', 'cx', 'cy', 'd', 'decoding', 'descent', 'diffuseConstant', 'direction', 'display', 'divisor', 'dominant-baseline', 'dur', 'dx', 'dy', 'edgeMode', 'elevation', 'end', 'exponent', 'fill', 'fill-opacity', 'fill-rule', 'filter', 'filterUnits', 'flood-color', 'flood-opacity', 'font-family', 'font-size', 'font-size-adjust', 'font-stretch', 'font-style', 'font-variant', 'font-weight', 'fr', 'from', 'fx', 'fy', 'g1', 'g2', 'glyph-name', 'glyph-orientation-horizontal', 'glyph-orientation-vertical', 'gradientTransform', 'gradientUnits', 'hanging', 'height', 'horiz-adv-x', 'horiz-origin-x', 'horiz-origin-y', 'href', 'hreflang', 'id', 'ideographic', 'image-rendering', 'in', 'in2', 'intercept', 'k', 'k1', 'k2', 'k3', 'k4', 'kernelMatrix', 'kernelUnitLength', 'keyPoints', 'keySplines', 'keyTimes', 'lang', 'lengthAdjust', 'letter-spacing', 'lighting-color', 'limitingConeAngle', 'local', 'marker-end', 'marker-mid', 'marker-start', 'markerHeight', 'markerUnits', 'markerWidth', 'mask', 'maskContentUnits', 'maskUnits', 'mathematical', 'max', 'media', 'method', 'min', 'mode', 'name', 'numOctaves', 'offset', 'opacity', 'operator', 'order', 'orient', 'orientation', 'origin', 'overflow', 'overline-position', 'overline-thickness', 'paint-order', 'panose-1', 'path', 'pathLength', 'patternContentUnits', 'patternTransform', 'patternUnits', 'ping', 'pointer-events', 'points', 'pointsAtX', 'pointsAtY', 'pointsAtZ', 'preserveAlpha', 'preserveAspectRatio', 'primitiveUnits', 'r', 'radius', 'referrerPolicy', 'refX', 'refY', 'rel', 'rendering-intent', 'repeatCount', 'repeatDur', 'requiredExtensions', 'requiredFeatures', 'restart', 'result', 'rotate', 'rx', 'ry', 'scale', 'seed', 'shape-rendering', 'side', 'slope', 'spacing', 'specularConstant', 'specularExponent', 'speed', 'spreadMethod', 'startOffset', 'stdDeviation', 'stemh', 'stemv', 'stitchTiles', 'stop-color', 'stop-opacity', 'strikethrough-position', 'strikethrough-thickness', 'string', 'stroke', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-width', 'style', 'surfaceScale', 'systemLanguage', 'tabindex', 'tableValues', 'target', 'targetX', 'targetY', 'text-anchor', 'text-decoration', 'text-rendering', 'textLength', 'to', 'transform', 'transform-origin', 'type', 'u1', 'u2', 'underline-position', 'underline-thickness', 'unicode', 'unicode-bidi', 'unicode-range', 'units-per-em', 'v-alphabetic', 'v-hanging', 'v-ideographic', 'v-mathematical', 'values', 'vector-effect', 'version', 'vert-adv-y', 'vert-origin-x', 'vert-origin-y', 'viewBox', 'visibility', 'width', 'widths', 'word-spacing', 'writing-mode', 'x', 'x-height', 'x1', 'x2', 'xChannelSelector', 'xlink:actuate', 'xlink:arcrole', 'xlink:href Deprecated', 'xlink:role', 'xlink:show', 'xlink:title', 'xlink:type', 'xml:lang', 'xml:space', 'y', 'y1', 'y2', 'yChannelSelector', 'z', 'zoomAndPan']);
// const mathAttributes = doAttributes.concat([]);

const headings = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

function getAttributes (node) {
  const attrs = {};

  for (const attr of node.attributes) {
    attrs[attr.name] = attr.value; 
  }

  const nodeName = node.nodeName.toLowerCase();

  if (headings.includes(nodeName)) {
    return {
      originalAttributes: attrs,
      level: nodeName[1],
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
    group: "inline"
  },
  p: {
    content: "inline*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "p", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["p", { ...node.attrs.originalAttributes }, 0]; }
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
    toDOM(node) { return ["article", { ...node.attrs.originalAttributes }, 0]; }
  },
  section: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "section", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["section", { ...node.attrs.originalAttributes }, 0]; }
  },
  aside: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "aside", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["aside", { ...node.attrs.originalAttributes }, 0]; }
  },
  header: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "header", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["header", { ...node.attrs.originalAttributes }, 0]; }
  },
  footer: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "footer", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["footer", { ...node.attrs.originalAttributes }, 0]; }
  },
  div: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "div", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["div", { ...node.attrs.originalAttributes }, 0]; }
  },
  nav: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "nav", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["nav", { ...node.attrs.originalAttributes }, 0]; }
  },
  address: {
    content: "inline+",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "address", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["address", { ...node.attrs.originalAttributes }, 0]; }
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
    toDOM(node) { return ["img", { ...node.attrs.originalAttributes }]; } // img is a leaf node, so it shouldn't have a content hole
  },
  dl: {
    content: "block+",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "dl", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["dl", { ...node.attrs.originalAttributes }, 0]; }
  },
  dt: {
    content: "inline*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "dt", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["dt", { ...node.attrs.originalAttributes }, 0]; }
  },
  dd: {
    content: "block+",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "dd", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["dd", { ...node.attrs.originalAttributes }, 0]; }
  },
  ul: {
    content: "li+",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "ul", getAttrs(node){ return getAttributes(node); } }],
    toDOM(node) { return ["ul", { ...node.attrs.originalAttributes }, 0]; }
  },
  ol: {
    content: "li+",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "ol", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["ol", { ...node.attrs.originalAttributes }, 0]; }
  },
  li: {
    content: "block+",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "li", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["li", { ...node.attrs.originalAttributes }, 0]; },
    defining: true
  },
  pre: {
    content: "text*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "pre", preserveWhitespace: "full", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["pre", { ...node.attrs.originalAttributes }, ["code", 0]] },
    code: true,
    defining: true
  },
  blockquote: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} },  },
    parseDOM: [{ tag: "blockquote", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["blockquote", { ...node.attrs.originalAttributes }, 0]; },
    defining: true
  },
  video: {
    content: "block+",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "video", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["video", { ...node.attrs.originalAttributes }, 0]; },
  },
  audio: {
    content: "block+",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "audio", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["audio", { ...node.attrs.originalAttributes }, 0]; },
  },
  source: {
    content: "inline*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "source", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["source", { ...node.attrs.originalAttributes }]; },
  },
  track: {
    content: "inline*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "track", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["track", { ...node.attrs.originalAttributes }, 0]; },
  },
  figure: {
    content: "block+",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "figure", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["figure", { ...node.attrs.originalAttributes }, 0]; },
  },
  figcaption: {
    content: "block+",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "figcaption", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["figcaption", { ...node.attrs.originalAttributes }, 0]; },
  },
  details: {
    content: "block+",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "details", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["details", { ...node.attrs.originalAttributes }, 0]; },
  },
  summary: {
    content: "inline*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "summary", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["summary", { ...node.attrs.originalAttributes }, 0]; },
  },
  hr: {
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "hr", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["hr", { ...node.attrs.originalAttributes }]; },
  },
  object: {
    content: "block+",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "object", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["object", { ...node.attrs.originalAttributes }, 0]; },
  },

  //TODO: math
  svg: {
    content: "block+",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "svg", getAttrs(node) { return getAttributes(node) }}],
    toDOM(node) { return ["http://www.w3.org/2000/svg svg", { ...node.attrs.originalAttributes }, 0] }
  },
  g: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "g", getAttrs(node) { return getAttributes(node) }}],
    toDOM(node) { return ["http://www.w3.org/2000/svg g", { ...node.attrs.originalAttributes }, 0] }
  },
  circle: {
    content: "block+",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "circle", getAttrs(node) { return getAttributes(node) }}],
    toDOM(node) { return ["http://www.w3.org/2000/svg circle", { ...node.attrs.originalAttributes }, 0] }
  },
  svgText: {
    content: "inline*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "text", getAttrs(node) { return getAttributes(node) }}],
    toDOM(node) { return ["http://www.w3.org/2000/svg text", { ...node.attrs.originalAttributes }, 0] }
  },
  path: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "path", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["http://www.w3.org/2000/svg path", { ...node.attrs.originalAttributes }, 0]; },
  },
  metadata: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "metadata", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["http://www.w3.org/2000/svg metadata", { ...node.attrs.originalAttributes }, 0]; },
  },
  tspan: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "tspan", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["http://www.w3.org/2000/svg tspan", { ...node.attrs.originalAttributes }, 0]; },
  },
  title: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "title", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["http://www.w3.org/2000/svg title", { ...node.attrs.originalAttributes }, 0]; },
  },
  defs: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "defs", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["http://www.w3.org/2000/svg defs", { ...node.attrs.originalAttributes }, 0]; },
  },
  marker: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "marker", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["http://www.w3.org/2000/svg marker", { ...node.attrs.originalAttributes }, 0]; },
  },

  button: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "button", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["button", { ...node.attrs.originalAttributes }, 0]; },
  },
  label: {
    content: "inline*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "label", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["label", { ...node.attrs.originalAttributes }, 0]; },
  },
  select: {
    content: "block+",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "select", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["select", { ...node.attrs.originalAttributes }, 0]; },
  },
  option: {
    content: "inline*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "option", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["option", { ...node.attrs.originalAttributes }, 0]; },
  },
  input: {
    group: "inline",
    inline: true,
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "input", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["input", { ...node.attrs.originalAttributes }]; },
  },
  textarea: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "textarea", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["textarea", { ...node.attrs.originalAttributes }, 0]; },
  },

  table: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "table", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["table", { ...node.attrs.originalAttributes }, 0]; },
  },
  thead: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "thead", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["thead", { ...node.attrs.originalAttributes }, 0]; },
  },
  tbody: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "tbody", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["tbody", { ...node.attrs.originalAttributes }, 0]; },
  },
  tfoot: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "tfoot", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["tfoot", { ...node.attrs.originalAttributes }, 0]; },
  },
  caption: {
    content: "inline*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "caption", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["caption", { ...node.attrs.originalAttributes }, 0]; }
  },
  tr: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "tr", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["tr", { ...node.attrs.originalAttributes }, 0]; },
  },
  th: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "th", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["th", { ...node.attrs.originalAttributes }, 0]; }
  },
  td: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "td", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["td", { ...node.attrs.originalAttributes }, 0]; }
  },
  colgroup: {
    content: "block*",
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "colgroup", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["colgroup", { ...node.attrs.originalAttributes }, 0]; },
  },
  col: {
    group: "block",
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: "col", getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return ["col", { ...node.attrs.originalAttributes }]; },
  },
};

const customMarks = {};

const inlineElements = ['span', 'progress', 'del', 'ins', 'data', 'datalist', 'mark', 'code', 'cite', 'sup', 'sub', 'a', 'time', 'em', 'strong', 'dfn', 'abbr', 'q', 'var', 'samp', 'kbd', 'bdi'];
inlineElements.forEach(tagName => {
  customMarks[tagName] = {
    attrs: { originalAttributes: { default: {} } },
    parseDOM: [{ tag: tagName, getAttrs(node){ return getAttributes(node); }}],
    toDOM(node) { return [tagName, { ...node.attrs.originalAttributes }, 0]; },

    inclusive: false,
    excludes: "",
    group: "inline"
  }

  switch(tagName) {
    case 'code':
      customMarks[tagName].code = true;
      break;

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
