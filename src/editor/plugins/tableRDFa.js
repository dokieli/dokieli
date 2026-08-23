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

import { buildCellRDFa, computeRowSubject, isColumnMapped, getTableSchema, subjectFromCaption, withSlugValues, getTemplateVariables, DEFAULT_ROW_PROPERTY } from '../../table.js';
import { getColumns, findTable, forEachRow } from '../commands/table.js';
import { generateAttributeId } from '../../util.js';

// Attributes the column configuration owns; anything else on a cell is left alone.
const MANAGED_CELL_ATTRIBUTES = ['about', 'id', 'property', 'datatype', 'typeof', 'lang', 'xml:lang', 'rel', 'resource'];
const MANAGED_ROW_ATTRIBUTES = ['about', 'id', 'typeof'];
const MANAGED_TABLE_ATTRIBUTES = ['about', 'id', 'rel', 'resource', 'typeof'];

function withoutManaged(attrs, managed) {
  return Object.fromEntries(Object.entries(attrs || {}).filter(([k]) => !managed.includes(k)));
}

function sameAttributes(a, b) {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  return ak.length === bk.length && ak.every((k) => a[k] === b[k]);
}

function cellText(cell) {
  return cell.textContent.trim();
}

// A row without data asserts nothing; a select counts only once a choice is made.
function rowHasData(row) {
  let found = false;

  row.forEach((cell) => {
    if (found) return;

    cell.descendants((node) => {
      if (found) return false;

      if (node.type.name === 'select') {
        node.descendants((option) => {
          if (option.type.name === 'option'
            && 'selected' in (option.attrs.originalAttributes || {})
            && option.attrs.originalAttributes.value) found = true;
          return !found;
        });
        return false;
      }

      if (node.type.name === 'img') found = true;
      if (node.isText && node.text.trim()) found = true;
      return !found;
    });
  });

  return found;
}

// True when inline content in the cell carries its own RDFa property or rel.
export function contentStatesProperty(cell) {
  let found = false;

  cell.descendants((node) => {
    if (found) return false;

    const attrs = node.attrs?.originalAttributes;
    if (attrs?.property || attrs?.rel) found = true;

    (node.marks || []).forEach((mark) => {
      const markAttrs = mark.attrs?.originalAttributes;
      if (markAttrs?.property || markAttrs?.rel) found = true;
    });

    return !found;
  });

  return found;
}

// Recompute row and cell RDFa from the column configuration; attributes only, never structure.
export function reconcileTable(tr, table, tablePos, mapPos = (p) => p) {
  const tableSchema = getTableSchema(table.attrs.originalAttributes);
  const columns = getColumns(table);

  const hasMapping =
    columns.some(isColumnMapped) || tableSchema.aboutUrl || tableSchema.typeof;

  if (!hasMapping) return false;

  const foreignKeys = [];
  let changed = false;
  let rowIndex = 0;

  forEachRow(table, tablePos, (row, rowPos, isHeader, section) => {
    if (isHeader || section === 'tfoot') return;
    rowIndex++;

    const fillValues = { _row: rowIndex };
    row.forEach((cell, offset, index) => {
      const column = columns[index];
      if (column?.name) fillValues[column.name] = cellText(cell);
    });
    const values = withSlugValues(fillValues);

    const hasData = rowHasData(row);
    const rowSubject = hasData ? computeRowSubject(tableSchema, fillValues, null) : null;

    const rowAttrs = withoutManaged(row.attrs.originalAttributes, MANAGED_ROW_ATTRIBUTES);
    if (rowSubject) {
      rowAttrs.about = rowSubject;
      if (rowSubject.startsWith('#')) rowAttrs.id = rowSubject.slice(1);
    }
    if (tableSchema.typeof && hasData) rowAttrs.typeof = tableSchema.typeof;

    if (!sameAttributes(rowAttrs, row.attrs.originalAttributes)) {
      tr.setNodeMarkup(mapPos(rowPos), null, { ...row.attrs, originalAttributes: rowAttrs });
      changed = true;
    }

    let cellPos = rowPos + 1;
    row.forEach((cell, offset, index) => {
      const column = columns[index];
      const at = cellPos;
      cellPos += cell.nodeSize;

      if (!column || !isColumnMapped(column)) return;

      const built = buildCellRDFa(column, cellText(cell), {
        rowSubject,
        fillValues: values,
        foreignKeys
      });
      const attributes = built.attributes;

      // A plain-text link cell states its triple as attributes; the save pass renders the anchor.
      const templateReady = !getTemplateVariables(column.valueUrl || '')
        .some((v) => !String(values[v] ?? '').trim());
      if (built.child?.tag === 'a' && column.valueUrl && !column.valueRel
        && templateReady && !contentStatesProperty(cell)) {
        attributes.rel = column.propertyUrl;
        attributes.resource = built.child.attributes.href;
      }

      // Content that already states the property must not have the cell repeat it.
      if (contentStatesProperty(cell)) {
        delete attributes.property;
        delete attributes.datatype;
        delete attributes.lang;
        delete attributes['xml:lang'];
      }

      // A linked column carries rel/href on a child <a>; the cell keeps only its own attributes.
      const next = { ...withoutManaged(cell.attrs.originalAttributes, MANAGED_CELL_ATTRIBUTES), ...attributes };

      if (sameAttributes(next, cell.attrs.originalAttributes)) return;

      tr.setNodeMarkup(mapPos(at), null, { ...cell.attrs, originalAttributes: next });
      changed = true;
    });
  });

  // The table's subject: pinned by settings, else derived live from the caption.
  let captionText = '';
  table.forEach((child) => {
    if (child.type.name === 'caption') captionText = child.textContent.trim();
  });

  // Precedence: pinned by settings, else the caption, else what an earlier pass
  // emitted, else minted fresh -- a mapped table always has a subject.
  const tableSubject = tableSchema.subject || subjectFromCaption(captionText)
    || table.attrs.originalAttributes?.resource
    || '#' + generateAttributeId();
  const rowRel = tableSchema.propertyUrl || DEFAULT_ROW_PROPERTY;

  // The predicate linking the table subject to each row lives on the section;
  // the caption names the table subject.
  let offset = tablePos + 1;
  table.forEach((child) => {
    const at = offset;
    offset += child.nodeSize;

    let attrs = null;

    if (child.type.name === 'tbody') {
      attrs = withoutManaged(child.attrs.originalAttributes, ['rel']);
      if (rowRel) attrs.rel = rowRel;
    }

    // An empty caption must not assert an empty name literal.
    if (child.type.name === 'caption') {
      attrs = withoutManaged(child.attrs.originalAttributes, ['property']);
      if (captionText) attrs.property = 'schema:name';
    }

    if (!attrs || sameAttributes(attrs, child.attrs.originalAttributes || {})) return;
    tr.setNodeMarkup(mapPos(at), null, { ...child.attrs, originalAttributes: attrs });
    changed = true;
  });

  // The table is part of its surrounding subject; its own subject carries the type and name.
  const tableAttrs = withoutManaged(table.attrs.originalAttributes, MANAGED_TABLE_ATTRIBUTES);
  if (tableSubject) {
    tableAttrs.rel = 'schema:hasPart';
    tableAttrs.resource = tableSubject;
    tableAttrs.typeof = 'schema:Table';
    if (tableSubject.startsWith('#')) tableAttrs.id = tableSubject.slice(1);
  }

  if (!sameAttributes(tableAttrs, table.attrs.originalAttributes || {})) {
    tr.setNodeMarkup(mapPos(tablePos), null, { ...table.attrs, originalAttributes: tableAttrs });
    changed = true;
  }

  return changed;
}

// Keep the table under the caret consistent as it is edited.
export function reconcileSelectedTable(transactions, oldState, newState) {
  if (!transactions.some((t) => t.docChanged)) return null;

  const table = findTable(newState);
  if (!table) return null;

  const tr = newState.tr;
  const changed = reconcileTable(tr, table.node, table.pos);

  if (!changed) return null;

  tr.setMeta('addToHistory', false);
  return tr;
}
