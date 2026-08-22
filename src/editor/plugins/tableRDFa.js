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

import { buildCellRDFa, computeRowSubject, isColumnMapped, getTableSchema } from '../../table.js';
import { getColumns, findTable, forEachRow } from '../commands/table.js';

// Attributes the column configuration owns. Anything else on a cell (class,
// colspan, a manually set attribute) is left alone.
const MANAGED_CELL_ATTRIBUTES = ['about', 'id', 'property', 'datatype', 'typeof', 'lang'];
const MANAGED_ROW_ATTRIBUTES = ['about', 'id', 'typeof'];

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

// True when inline content in the cell carries its own RDFa property or rel.
function contentStatesProperty(cell) {
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

/**
 * Recompute row and cell RDFa for one table from its column configuration.
 *
 * Only attributes are reconciled, never structure: rewriting a cell's content
 * (to add the <a> a linked column needs) while someone is typing in it would
 * fight the caret. Link columns get their markup when a row is autofilled or
 * when the column settings are explicitly applied to all rows.
 */
export function reconcileTable(tr, table, tablePos, mapPos = (p) => p) {
  const tableSchema = getTableSchema(table.attrs.originalAttributes);
  const columns = getColumns(table);

  const hasMapping =
    columns.some(isColumnMapped) || tableSchema.aboutUrl || tableSchema.typeof;

  if (!hasMapping) return false;

  const foreignKeys = [];
  let changed = false;
  let rowIndex = 0;

  forEachRow(table, tablePos, (row, rowPos, isHeader) => {
    if (isHeader) return;
    rowIndex++;

    const fillValues = { _row: rowIndex };
    row.forEach((cell, offset, index) => {
      const column = columns[index];
      if (column?.name) fillValues[column.name] = cellText(cell);
    });

    const rowSubject = computeRowSubject(tableSchema, fillValues, null);

    const rowAttrs = withoutManaged(row.attrs.originalAttributes, MANAGED_ROW_ATTRIBUTES);
    if (rowSubject) {
      rowAttrs.about = rowSubject;
      if (rowSubject.startsWith('#')) rowAttrs.id = rowSubject.slice(1);
    }
    if (tableSchema.typeof) rowAttrs.typeof = tableSchema.typeof;

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

      const { attributes } = buildCellRDFa(column, cellText(cell), {
        rowSubject,
        fillValues,
        foreignKeys
      });

      // Content that already states the property -- a filled link, a <time>,
      // per-value spans -- must not have the cell repeat it as a second triple.
      if (contentStatesProperty(cell)) {
        delete attributes.property;
        delete attributes.datatype;
        delete attributes.lang;
      }

      // A linked column carries rel/href on a child <a>, so the cell itself
      // keeps only what buildCellRDFa put on it.
      const next = { ...withoutManaged(cell.attrs.originalAttributes, MANAGED_CELL_ATTRIBUTES), ...attributes };

      if (sameAttributes(next, cell.attrs.originalAttributes)) return;

      tr.setNodeMarkup(mapPos(at), null, { ...cell.attrs, originalAttributes: next });
      changed = true;
    });
  });

  // The predicate linking the table subject to each row lives on the section.
  if (tableSchema.propertyUrl) {
    let offset = tablePos + 1;
    table.forEach((child) => {
      const at = offset;
      offset += child.nodeSize;
      if (child.type.name !== 'tbody') return;

      const attrs = { ...child.attrs.originalAttributes, rel: tableSchema.propertyUrl };
      if (attrs.rel === child.attrs.originalAttributes?.rel) return;

      tr.setNodeMarkup(mapPos(at), null, { ...child.attrs, originalAttributes: attrs });
      changed = true;
    });
  }

  if (tableSchema.subject) {
    const attrs = { ...table.attrs.originalAttributes, about: tableSchema.subject };
    if (attrs.about !== table.attrs.originalAttributes?.about) {
      tr.setNodeMarkup(mapPos(tablePos), null, { ...table.attrs, originalAttributes: attrs });
      changed = true;
    }
  }

  return changed;
}

/**
 * Keep the table under the caret consistent as it is edited. Scoped to that
 * one table: every other way a table changes (autofill, applying column
 * settings) reconciles explicitly.
 */
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
