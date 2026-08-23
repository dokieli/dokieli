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

import Config from './config.js';
import uriTemplates from 'uri-templates';
import { domSanitize } from './utils/sanitization.js';

// CSVW column config serialised onto the <th> as data-*; lookup is a dokieli extension (https://www.w3.org/TR/tabular-metadata/#columns).
const COLUMN_KEYS = {
  name: 'data-name',
  titles: 'data-titles',
  propertyUrl: 'data-property-url',
  valueUrl: 'data-value-url',
  // dokieli extension: predicate for the link when propertyUrl stays on the text.
  valueRel: 'data-value-rel',
  aboutUrl: 'data-about-url',
  datatype: 'data-datatype',
  image: 'data-image',
  // dokieli extension: the value is temporal, so it renders inside <time>.
  time: 'data-time',
  lang: 'data-lang',
  virtual: 'data-virtual',
  suppressOutput: 'data-suppress-output'
};

// aboutUrl is the per-row subject template; subject and propertyUrl link the table's subject to rows.
const TABLE_KEYS = {
  aboutUrl: 'data-about-url',
  subject: 'data-subject',
  propertyUrl: 'data-property-url',
  typeof: 'data-typeof'
};

// dokieli extension: bind an identifier column to a lookup service.
const TABLE_LOOKUP_KEYS = {
  service: 'data-lookup-service',
  idColumn: 'data-lookup-id-column',
  url: 'data-lookup-url',
  format: 'data-lookup-format',
  record: 'data-lookup-record',
  accept: 'data-lookup-accept',
  subject: 'data-lookup-subject'
};

// A column's own service suggests values for its cells only; it does not fill the row.
const COLUMN_LOOKUP_KEYS = {
  source: 'data-lookup-source',
  // A result field holding the value's own page, which becomes the cell's link.
  urlSource: 'data-lookup-url-source',
  service: 'data-lookup-service'
};

export const URI_TEMPLATE_KEYS = ['aboutUrl', 'propertyUrl', 'valueUrl'];

const NULL_ATTR = 'data-null';
const NULL_SEPARATOR = '|';

function readKeys(attrs, keyMap) {
  const o = {};

  Object.entries(keyMap).forEach(([key, attr]) => {
    const value = attrs[attr];
    if (value === undefined || value === null || value === '') return;
    o[key] = value === 'true' ? true : value;
  });

  return o;
}

function writeKeys(o, keyMap) {
  const attrs = {};

  Object.entries(keyMap).forEach(([key, attr]) => {
    const value = o?.[key];
    if (value === undefined || value === null || value === '') return;
    attrs[attr] = value === true ? 'true' : String(value);
  });

  return attrs;
}

// Attribute bag -> column object; accepts a DOM element, PM originalAttributes, or a plain object.
export function getColumnSchema(source) {
  const attrs = toAttributes(source);
  const column = readKeys(attrs, COLUMN_KEYS);

  // lang '' is a statement -- explicitly no language -- not an absence.
  if (attrs[COLUMN_KEYS.lang] === '') column.lang = '';

  if (attrs[NULL_ATTR] !== undefined) {
    column.null = attrs[NULL_ATTR].split(NULL_SEPARATOR);
  }

  const lookup = readKeys(attrs, COLUMN_LOOKUP_KEYS);
  if (Object.keys(lookup).length) column.lookup = lookup;

  return column;
}

export function getColumnAttributes(column) {
  const attrs = writeKeys(column, COLUMN_KEYS);

  if (column?.lang === '') attrs[COLUMN_KEYS.lang] = '';

  if (Array.isArray(column?.null) && column.null.length) {
    attrs[NULL_ATTR] = column.null.join(NULL_SEPARATOR);
  }

  Object.assign(attrs, writeKeys(column?.lookup, COLUMN_LOOKUP_KEYS));

  return attrs;
}

// Every attribute this module owns, so callers can clear before rewriting.
export function getColumnAttributeNames() {
  return [
    ...Object.values(COLUMN_KEYS),
    ...Object.values(COLUMN_LOOKUP_KEYS),
    NULL_ATTR
  ];
}

export function getTableAttributeNames() {
  return [...Object.values(TABLE_KEYS), ...Object.values(TABLE_LOOKUP_KEYS)];
}

export function getTableSchema(source) {
  const attrs = toAttributes(source);
  const tableSchema = readKeys(attrs, TABLE_KEYS);

  const lookup = readKeys(attrs, TABLE_LOOKUP_KEYS);
  if (Object.keys(lookup).length) tableSchema.lookup = lookup;

  return tableSchema;
}

export function getTableAttributes(tableSchema) {
  const attrs = writeKeys(tableSchema, TABLE_KEYS);
  Object.assign(attrs, writeKeys(tableSchema?.lookup, TABLE_LOOKUP_KEYS));
  return attrs;
}

function toAttributes(source) {
  if (!source) return {};

  if (typeof source.getAttributeNames === 'function') {
    return source.getAttributeNames().reduce((acc, name) => {
      acc[name] = source.getAttribute(name);
      return acc;
    }, {});
  }

  if (source.attrs?.originalAttributes) return source.attrs.originalAttributes;
  if (source.originalAttributes) return source.originalAttributes;

  return source;
}

// A column is only meaningful as RDFa once it has a property.
export function isColumnMapped(column) {
  return !!(column?.propertyUrl || column?.valueUrl);
}

export function getColumnTitle(column, fallback = '') {
  let title = column?.titles ?? fallback;
  if (Array.isArray(title)) title = title[0];
  if (title && typeof title === 'object') title = title['@value'];
  return title ?? '';
}

// Stable, template-safe variable name for a column.
export function toColumnName(title, index, taken = []) {
  let name = String(title || '')
    .trim()
    .replace(/[^\p{L}\p{N}]+(\p{L})/gu, (_, c) => c.toUpperCase())
    .replace(/[^\p{L}\p{N}]/gu, '');

  if (!name || /^\p{N}/u.test(name)) name = `column${index + 1}`;
  // A leading acronym lowercases whole: ISBN -> isbn, DOIRef -> doiRef.
  name = name.replace(/^\p{Lu}+/u, (run) =>
    run.length > 1 && /\p{Ll}/u.test(name.charAt(run.length))
      ? run.slice(0, -1).toLowerCase() + run.slice(-1)
      : run.toLowerCase());

  let candidate = name;
  let n = 2;
  while (taken.includes(candidate)) candidate = `${name}${n++}`;

  return candidate;
}

function fillTemplate(template, values) {
  try {
    return uriTemplates(template).fill(values);
  } catch {
    return template;
  }
}

export function getTemplateVariables(template) {
  try {
    return uriTemplates(template).varNames;
  } catch {
    return [];
  }
}

// Subject the row's statements hang off.
export function computeRowSubject(tableSchema, fillValues, fallback) {
  const aboutUrl = tableSchema?.aboutUrl;
  if (!aboutUrl) return fallback;

  const filled = fillTemplate(aboutUrl, fillValues);

  // An unresolved variable would mint a subject that collides across rows, so fall back.
  return filled && !getTemplateVariables(aboutUrl).some((v) => isEmpty(fillValues[v]))
    ? filled
    : fallback;
}

function isEmpty(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function isNullValue(column, value) {
  const nullValues = column?.null || [''];
  return nullValues.includes(String(value ?? '').trim());
}

// The shared cell emitter: returns a description that csv.js and the editor each render.
export function buildCellRDFa(column, cellValue, context = {}) {
  const { rowSubject, fillValues = {}, foreignKeys = [], valueMapper, imageSize, textValues } = context;

  let text = String(cellValue ?? '').trim();

  if (!column || !isColumnMapped(column) || isNullValue(column, text)) {
    return { attributes: {}, child: null, text };
  }

  const resolved = { ...column };
  let isForeignKeyReference = foreignKeys.includes(column.name);
  let skipProperty = false;

  URI_TEMPLATE_KEYS.forEach((key) => {
    if (!resolved[key]) return;

    let isNull = false;

    getTemplateVariables(resolved[key]).forEach((v) => {
      if (!foreignKeys.includes(v) || v === column.name) return;
      isForeignKeyReference = true;
      if (isNullValue(column, fillValues[v])) {
        isNull = true;
        skipProperty = true;
      }
    });

    resolved[key] = isNull ? null : domSanitize(fillTemplate(resolved[key], fillValues));
  });

  if (valueMapper) {
    const mapped = valueMapper(resolved, text);
    if (mapped) {
      if (mapped.text !== undefined) text = mapped.text;
      if (mapped.valueUrl !== undefined) resolved.valueUrl = mapped.valueUrl;
    }
  }

  const attributes = {};

  if (resolved.aboutUrl) {
    attributes.about = resolved.aboutUrl;
    // A foreign-key reference is described elsewhere; minting an id here would duplicate it.
    if (!isForeignKeyReference && resolved.aboutUrl.startsWith('#')) {
      attributes.id = resolved.aboutUrl.slice(1);
    }
  }

  if (resolved.propertyUrl === 'rdf:type') {
    const aboutUrl = resolved.aboutUrl || rowSubject;
    if (aboutUrl) attributes.about = aboutUrl;
    if (!resolved.aboutUrl && !isForeignKeyReference && aboutUrl?.startsWith('#')) {
      attributes.id = aboutUrl.slice(1);
    }
    attributes.typeof = resolved.valueUrl || text;

    return { attributes, child: null, text };
  }

  // An image column shows the picture; RDFa reads @src, so property goes on the img.
  if (resolved.image) {
    const src = URL.canParse(text) ? text : resolved.valueUrl;
    if (!src) return { attributes, child: null, text };

    const child = { tag: 'img', attributes: { src, alt: '' }, text: '' };
    if (imageSize?.width && imageSize?.height) {
      child.attributes.width = String(imageSize.width);
      child.attributes.height = String(imageSize.height);
    }
    if (!skipProperty && resolved.propertyUrl) child.attributes.property = resolved.propertyUrl;

    return { attributes, child, text };
  }

  if (resolved.valueUrl) {
    const href = isSelfReferencingProperty(resolved.propertyUrl) && URL.canParse(text)
      ? text
      : resolved.valueUrl;

    const child = { tag: 'a', attributes: { href }, text };

    // An <a> with both @rel and @property links via valueRel and keeps the text a literal.
    if (!skipProperty) {
      const rel = resolved.valueRel || resolved.propertyUrl;
      if (rel) child.attributes.rel = rel;
      if (resolved.valueRel && resolved.propertyUrl) child.attributes.property = resolved.propertyUrl;
    }

    return { attributes, child, text };
  }

  // A multi-valued result states one triple per value, each in its own <span>.
  if (textValues?.length > 1 && resolved.propertyUrl && !skipProperty && !resolved.time) {
    const datatype = toDatatypeCurie(resolved.datatype);
    const children = textValues.map((value) => ({
      tag: 'span',
      attributes: {
        property: resolved.propertyUrl,
        ...(datatype ? { datatype } : {}),
        ...(resolved.lang !== undefined && resolved.lang !== null
          ? { lang: resolved.lang, 'xml:lang': resolved.lang } : {})
      },
      text: value
    }));

    return { attributes, children, text };
  }

  // A temporal value sits in <time>; a recognised format carries its datatype.
  if (resolved.time || isTimeDatatype(resolved.datatype)) {
    const child = { tag: 'time', attributes: {}, text };
    const datatype = inferTimeDatatype(text);

    if (datatype) child.attributes.datetime = text;
    if (!skipProperty && resolved.propertyUrl) {
      child.attributes.property = resolved.propertyUrl;
      if (datatype) child.attributes.datatype = datatype;
    }

    return { attributes, child, text };
  }

  if (resolved.propertyUrl && !skipProperty) {
    attributes.property = resolved.propertyUrl;
    if (resolved.datatype) attributes.datatype = toDatatypeCurie(resolved.datatype);
    // '' is deliberate: it stops a surrounding language from tagging the literal.
    if (resolved.lang !== undefined && resolved.lang !== null) {
      attributes.lang = resolved.lang;
      attributes['xml:lang'] = resolved.lang;
    }
  }

  return { attributes, child: null, text };
}

// xsd temporal types by lexical form, most specific first; each is a valid HTML @datetime.
const TIME_DATATYPES = [
  ['xsd:dateTime', /^\d{4,}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/],
  ['xsd:date', /^\d{4,}-\d{2}-\d{2}$/],
  ['xsd:gYearMonth', /^\d{4,}-\d{2}$/],
  ['xsd:gYear', /^\d{4,}$/],
  ['xsd:time', /^\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/],
  ['xsd:duration', /^-?P(?=.)(\d+Y)?(\d+M)?(\d+D)?(T(?=.)(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$/]
];

function inferTimeDatatype(text) {
  return TIME_DATATYPES.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

function isTimeDatatype(datatype) {
  const curie = toDatatypeCurie(datatype);
  return !!curie && TIME_DATATYPES.some(([name]) => name === curie);
}

function isSelfReferencingProperty(propertyUrl) {
  return propertyUrl === 'dcterms:subject' || propertyUrl === 'rdfs:seeAlso';
}

// CSVW datatype names become CURIEs; xsd:string is RDF 1.1's default and stays unstated.
function toDatatypeCurie(datatype) {
  const name = typeof datatype === 'object' ? datatype?.base ?? datatype?.['@id'] : datatype;
  if (!name || name === 'string' || name === 'xsd:string') return null;
  return String(name).includes(':') ? name : `xsd:${name}`;
}

export function renderCellHTML(column, cellValue, context) {
  const { attributes, child, children, text } = buildCellRDFa(column, cellValue, context);
  const attributeString = serializeAttributes(attributes);

  if (children) {
    const items = children.map((c) => `<${c.tag}${serializeAttributes(c.attributes)}>${c.text}</${c.tag}>`);
    return `<td${attributeString}>${items.join(', ')}</td>`;
  }

  if (!child) return `<td${attributeString}>${text}</td>`;

  return `<td${attributeString}><${child.tag}${serializeAttributes(child.attributes)}>${child.text}</${child.tag}></td>`;
}

function serializeAttributes(attributes) {
  // Empty alt (decorative) and lang/xml:lang (no language) are statements and stay.
  return Object.entries(attributes)
    .filter(([k, v]) => v !== undefined && v !== null && (v !== '' || ['alt', 'lang', 'xml:lang'].includes(k)))
    .map(([k, v]) => ` ${k}="${v}"`)
    .join('');
}

// --- CSVW interchange -------------------------------------------------------

export function toCSVWTableSchema(tableSchema, columns) {
  const schema = {};

  if (tableSchema?.aboutUrl) schema.aboutUrl = tableSchema.aboutUrl;

  schema.columns = columns.map((column) => {
    const { lookup, ...csvw } = column;
    return csvw;
  });

  if (tableSchema?.typeof) {
    schema.columns.push({
      virtual: true,
      propertyUrl: 'rdf:type',
      valueUrl: tableSchema.typeof
    });
  }

  if (tableSchema?.propertyUrl && tableSchema?.aboutUrl) {
    schema.columns.push({
      virtual: true,
      aboutUrl: tableSchema.subject ?? '',
      propertyUrl: tableSchema.propertyUrl,
      valueUrl: tableSchema.aboutUrl
    });
  }

  return schema;
}

// Inverse of the above: pull the virtual columns back out into table-level config.
export function fromCSVWTableSchema(csvwTableSchema) {
  const columns = [];
  const tableSchema = {};

  if (csvwTableSchema?.aboutUrl) tableSchema.aboutUrl = csvwTableSchema.aboutUrl;

  (csvwTableSchema?.columns || []).forEach((column) => {
    if (!column.virtual) {
      columns.push({ ...column });
      return;
    }

    if (column.propertyUrl === 'rdf:type' && column.valueUrl) {
      tableSchema.typeof = column.valueUrl;
      return;
    }

    if (column.valueUrl && column.valueUrl === csvwTableSchema.aboutUrl && column.propertyUrl) {
      tableSchema.propertyUrl = column.propertyUrl;
      if (column.aboutUrl) tableSchema.subject = column.aboutUrl;
    }
  });

  return { tableSchema, columns };
}

// Prefixes the configuration relies on; membership in Config.ns tells a CURIE from an IRI.
export function getPrefixesUsed(tableSchema, columns) {
  const terms = [];

  const collect = (o) => {
    if (!o) return;
    [o.propertyUrl, o.valueUrl, o.valueRel, o.typeof, toDatatypeCurie(o.datatype)].forEach((t) => {
      if (t && typeof t === 'string' && t.includes(':') && !t.startsWith('#')) terms.push(t);
    });
  };

  collect(tableSchema);
  (columns || []).forEach(collect);

  return [...new Set(
    terms
      .map((t) => t.split(':')[0])
      .filter((p) => p && Config.ns[p])
  )];
}

// Declare any prefix the table's CURIEs depend on, so the saved RDFa resolves elsewhere.
export function ensureDocumentPrefixes(prefixes) {
  if (!prefixes?.length || typeof document === 'undefined') return;

  const current = document.body.getAttribute('prefix') || '';
  const declared = new Set(
    current.split(/\s+/).filter((token) => token.endsWith(':')).map((token) => token.slice(0, -1))
  );

  const missing = prefixes
    .filter((p) => !declared.has(p) && Config.ns[p])
    .map((p) => `${p}: ${Config.ns[p]('').value}`);

  if (!missing.length) return;

  document.body.setAttribute('prefix', [current.trim(), ...missing].filter(Boolean).join(' '));
}
