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

import { TextSelection } from 'prosemirror-state';
import { Fragment } from 'prosemirror-model';
import { schema } from '../schema/base.js';
import { threatSelectGroups } from '../../threatModel.js';
import { i18n } from '../../i18n.js';
import {
  getColumnSchema,
  getColumnAttributes,
  getColumnAttributeNames,
  getTableSchema,
  getTableAttributes,
  getTableAttributeNames,
  getColumnTitle,
  toColumnName
} from '../../table.js';

const SECTIONS = ['thead', 'tbody', 'tfoot'];
const CELLS = ['th', 'td'];

export function findAncestorNode(state, typeNames, $pos) {
  const names = Array.isArray(typeNames) ? typeNames : [typeNames];
  const $from = $pos || state.selection.$from;

  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (names.includes(node.type.name)) {
      return { node, depth, pos: $from.before(depth), start: $from.start(depth) };
    }
  }

  return null;
}

export function findTable(state, $pos) {
  return findAncestorNode(state, 'table', $pos);
}

export function findCell(state, $pos) {
  const $from = $pos || state.selection.$from;

  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (!CELLS.includes(node.type.name)) continue;

    const sectionNode = depth >= 2 ? $from.node(depth - 2) : null;

    return {
      node,
      depth,
      pos: $from.before(depth),
      start: $from.start(depth),
      columnIndex: $from.index(depth - 1),
      row: $from.node(depth - 1),
      rowPos: $from.before(depth - 1),
      section: SECTIONS.includes(sectionNode?.type.name) ? sectionNode.type.name : null
    };
  }

  return null;
}

export function forEachRow(table, tablePos, fn) {
  let offset = tablePos + 1;

  table.forEach((child) => {
    const name = child.type.name;

    if (name === 'tr') {
      fn(child, offset, false, null);
    } else if (SECTIONS.includes(name)) {
      let rowOffset = offset + 1;
      child.forEach((row) => {
        if (row.type.name === 'tr') fn(row, rowOffset, name === 'thead', name);
        rowOffset += row.nodeSize;
      });
    }

    offset += child.nodeSize;
  });
}

export function getHeaderRow(table) {
  let header = null;

  table.forEach((child) => {
    if (header) return;
    if (child.type.name === 'thead' && child.childCount) header = child.firstChild;
  });

  if (header) return header;

  // No thead: the first row counts as the header when it is all <th>.
  let first = null;
  forEachRow(table, 0, (row) => {
    if (!first) first = row;
  });

  return first && first.child(0).type.name === 'th' ? first : null;
}

export function getHeaderRowPos(table, tablePos) {
  let result = null;

  forEachRow(table, tablePos, (row, rowPos, isHeader) => {
    if (result === null && isHeader) result = { row, pos: rowPos };
  });

  if (result) return result;

  let first = null;
  forEachRow(table, tablePos, (row, rowPos) => {
    if (!first) first = { row, pos: rowPos };
  });

  return first && first.row.child(0).type.name === 'th' ? first : null;
}

export function getColumns(table) {
  const header = getHeaderRow(table);
  if (!header) return [];

  const columns = [];

  header.forEach((cell, offset, index) => {
    const column = getColumnSchema(cell.attrs.originalAttributes);
    const title = getColumnTitle(column, cell.textContent.trim());

    columns.push({
      ...column,
      titles: title,
      name: column.name || toColumnName(title, index, columns.map((c) => c.name))
    });
  });

  return columns;
}

function attributesWithout(attrs, names) {
  return Object.fromEntries(Object.entries(attrs || {}).filter(([k]) => !names.includes(k)));
}

export function setColumnAttributes(tr, table, tablePos, columnIndex, column) {
  const header = getHeaderRowPos(table, tablePos);
  if (!header || columnIndex >= header.row.childCount) return tr;

  let cellPos = header.pos + 1;
  for (let i = 0; i < columnIndex; i++) cellPos += header.row.child(i).nodeSize;

  const cell = header.row.child(columnIndex);
  const kept = attributesWithout(cell.attrs.originalAttributes, getColumnAttributeNames());

  return tr.setNodeMarkup(cellPos, null, {
    ...cell.attrs,
    originalAttributes: { ...kept, ...getColumnAttributes(column) }
  });
}

export function setTableAttributes(tr, table, tablePos, tableSchema) {
  const kept = attributesWithout(table.attrs.originalAttributes, getTableAttributeNames());

  return tr.setNodeMarkup(tablePos, null, {
    ...table.attrs,
    originalAttributes: { ...kept, ...getTableAttributes(tableSchema) }
  });
}

function createCell(type, attrs = {}) {
  return schema.nodes[type].createAndFill({ originalAttributes: attrs });
}

// A controlled-vocabulary cell: its select carries the options, the marker names the relation.
export function threatSelectNode(kind, framework = 'stride', chosenValue = null) {
  const optionNode = ({ value, label }) => schema.nodes.option.create(
    { originalAttributes: { value, ...(chosenValue === value ? { selected: 'selected' } : {}) } },
    label ? schema.text(label) : null
  );

  const groups = threatSelectGroups(kind, framework).flatMap((group) => group.label
    ? [schema.nodes.optgroup.create({ originalAttributes: { label: group.label } }, group.options.map(optionNode))]
    : group.options.map(optionNode));

  // The kind select is a choice between frameworks, never empty; the others invite one.
  const placeholder = kind === 'threat-model-kind'
    ? []
    : [schema.nodes.option.create({ originalAttributes: { value: '' } },
        schema.text(i18n.t(`editor.table.threat.select.${kind}.textContent`)))];

  // The framework attribute makes a swapped select a different node, forcing a DOM rebuild.
  return schema.nodes.select.create(
    { originalAttributes: {
      'data-select': kind,
      ...(kind === 'threat-type' ? { 'data-framework': framework } : {})
    } },
    [...placeholder, ...groups]
  );
}

function selectCell(kind, framework = 'stride') {
  return schema.nodes.td.createAndFill(
    { originalAttributes: {} },
    schema.nodes.p.create(null, threatSelectNode(kind, framework))
  );
}

function findSelectNode(cell) {
  let found = null;

  cell.descendants((node) => {
    if (found) return false;
    if (node.type.name === 'select') { found = node; return false; }
    return true;
  });

  return found;
}

function clearedSelectChild(node) {
  if (node.type.name === 'optgroup') {
    const inner = [];
    node.forEach((child) => inner.push(clearedSelectChild(child)));
    return node.type.create(node.attrs, inner);
  }

  if (node.type.name === 'option') {
    const { selected, ...rest } = node.attrs.originalAttributes || {};
    return node.type.create({ ...node.attrs, originalAttributes: rest }, node.content);
  }

  return node;
}

function clearedSelect(select) {
  const content = [];
  select.forEach((child) => content.push(clearedSelectChild(child)));
  return schema.nodes.select.create(select.attrs, content);
}

// Mark the option matching value as selected; a blank value clears the choice.
export function selectOptionInTr(tr, selectNode, selectPos, value) {
  selectNode.descendants((node, offset) => {
    if (node.type.name !== 'option') return true;

    const attrs = { ...node.attrs.originalAttributes };
    const chosen = value !== '' && (attrs.value ?? '') === value;

    if (chosen && !('selected' in attrs)) {
      tr.setNodeMarkup(tr.mapping.map(selectPos + 1 + offset), null,
        { ...node.attrs, originalAttributes: { ...attrs, selected: 'selected' } });
    } else if (!chosen && 'selected' in attrs) {
      delete attrs.selected;
      tr.setNodeMarkup(tr.mapping.map(selectPos + 1 + offset), null,
        { ...node.attrs, originalAttributes: attrs });
    }

    return false;
  });

  return tr;
}

export function columnBodySelects(table, tablePos, index) {
  const selects = [];

  forEachRow(table, tablePos, (row, rowPos, isHeader, section) => {
    if (isHeader || section === 'tfoot' || index >= row.childCount) return;

    let cellPos = rowPos + 1;
    for (let i = 0; i < index; i++) cellPos += row.child(i).nodeSize;

    row.child(index).descendants((node, offset) => {
      if (node.type.name !== 'select') return true;
      selects.push({ node, pos: cellPos + 1 + offset });
      return false;
    });
  });

  return selects;
}

export function findSelectWithPos(cell, cellPos) {
  let found = null;

  cell.descendants((node, offset) => {
    if (found) return false;
    if (node.type.name === 'select') found = { node, pos: cellPos + 1 + offset };
    return !found;
  });

  return found;
}

export function tableSelectsByKind(table, tablePos, kind) {
  const selects = [];

  forEachRow(table, tablePos, (row, rowPos, isHeader, section) => {
    if (isHeader || section === 'tfoot') return;

    let cellPos = rowPos + 1;
    row.forEach((cell) => {
      cell.descendants((node, offset) => {
        if (node.type.name !== 'select') return true;
        if ((node.attrs.originalAttributes || {})['data-select'] === kind) {
          selects.push({ node, pos: cellPos + 1 + offset });
        }
        return false;
      });
      cellPos += cell.nodeSize;
    });
  });

  return selects;
}

export function selectHasChoice(selectNode) {
  let chosen = false;

  selectNode.descendants((option) => {
    if (option.type.name === 'option'
      && 'selected' in (option.attrs.originalAttributes || {})
      && option.attrs.originalAttributes.value) chosen = true;
    return !chosen;
  });

  return chosen;
}

// New rows repeat the structural cells (selects) of existing rows, cleared.
function rowLikeFirstBodyRow(table, tablePos, columns) {
  let template = null;
  forEachRow(table, tablePos, (row, rowPos, isHeader, section) => {
    if (!template && !isHeader && section !== 'tfoot') template = row;
  });

  if (!template) return createRow('td', columns);

  const cells = [];
  for (let i = 0; i < columns; i++) {
    const cell = template.maybeChild(i);
    const select = cell && findSelectNode(cell);
    cells.push(select
      ? schema.nodes.td.createAndFill({ originalAttributes: {} }, schema.nodes.p.create(null, clearedSelect(select)))
      : createCell('td'));
  }

  return schema.nodes.tr.create(null, cells);
}

function createRow(cellType, count, attrsFor = () => ({})) {
  const cells = [];
  for (let i = 0; i < count; i++) cells.push(createCell(cellType, attrsFor(i)));
  return schema.nodes.tr.create(null, cells);
}

// Insert a table with a header row; columnSchemas preconfigures columns, lookup binds the service.
export function insertTable({
  rows = 3,
  columns = 3,
  caption = '',
  headers = [],
  columnSchemas = [],
  data = [],
  tableSchema = null,
  lookup = null
} = {}) {
  return (state, dispatch) => {
    const { $from } = state.selection;
    if (!$from.parent.type.spec.content?.includes('inline') && !state.selection.empty) return false;
    if (!dispatch) return true;

    const columnCount = columnSchemas.length || columns;
    const columnNames = [];
    const headerCells = [];
    let identifierColumn = '';

    for (let i = 0; i < columnCount; i++) {
      const preset = columnSchemas[i];
      const title = preset ? getColumnTitle(preset, '') : headers[i] ?? '';
      const name = preset?.name || toColumnName(title, i, columnNames);
      columnNames.push(name);

      if (preset?.identifier) identifierColumn = name;

      const { identifier, select, kindSelect, ...columnSchema } = preset || {};

      // A kind-select header chooses the framework; it stands in for the title text.
      const cell = schema.nodes.th.createAndFill(
        { originalAttributes: getColumnAttributes({ ...columnSchema, name, titles: title || undefined }) },
        kindSelect
          ? schema.nodes.p.create(null, threatSelectNode('threat-model-kind', 'stride', 'stride'))
          : title ? schema.nodes.p.create(null, schema.text(title)) : null
      );

      headerCells.push(cell);
    }

    const bodyRows = [];
    const rowCount = data.length || rows;
    for (let r = 0; r < rowCount; r++) {
      const values = data[r];
      if (!values) {
        bodyRows.push(columnSchemas.some((c) => c?.select)
          ? schema.nodes.tr.create(null, Array.from({ length: columnCount }, (_, c) =>
              columnSchemas[c]?.select ? selectCell(columnSchemas[c].select) : createCell('td')))
          : createRow('td', columnCount));
        continue;
      }

      const cells = [];
      for (let c = 0; c < columnCount; c++) {
        const text = values[c] == null ? '' : String(values[c]).trim();
        cells.push(schema.nodes.td.createAndFill(
          { originalAttributes: {} },
          text ? schema.nodes.p.create(null, schema.text(text)) : null
        ));
      }
      bodyRows.push(schema.nodes.tr.create(null, cells));
    }

    const children = [];
    // Tables always get captions; CSS numbers them even while empty.
    children.push(caption
      ? schema.nodes.caption.create(null, schema.text(caption))
      : schema.nodes.caption.createAndFill());
    children.push(schema.nodes.thead.create(null, schema.nodes.tr.create(null, headerCells)));
    children.push(schema.nodes.tbody.create(null, bodyRows));

    const tableAttributes = getTableAttributes({
      ...(tableSchema || {}),
      ...(lookup ? { lookup: { ...lookup, idColumn: lookup.idColumn || identifierColumn } } : {})
    });

    const table = schema.nodes.table.create({ originalAttributes: tableAttributes }, children);

    const tr = state.tr.replaceSelectionWith(table);

    // Bias to the replacement's start; the first textblock inside is the caption.
    const tableStart = tr.mapping.map(state.selection.from, -1);
    const target = findFirstCellTextPosition(tr.doc, tableStart, table.nodeSize);
    if (target !== null) tr.setSelection(TextSelection.create(tr.doc, target));

    dispatch(tr.scrollIntoView());
    return true;
  };
}

/** The caret belongs in the first cell, not in the caption above it. */
function findFirstCellTextPosition(doc, from, size) {
  let target = null;

  doc.nodesBetween(from, Math.min(from + size, doc.content.size), (node, pos) => {
    if (target !== null) return false;
    if (node.type.name !== 'th' && node.type.name !== 'td') return true;

    target = findFirstTextPosition(doc, pos);
    return false;
  });

  return target;
}

function findFirstTextPosition(doc, from) {
  let found = null;

  doc.nodesBetween(from, Math.min(from + 400, doc.content.size), (node, pos) => {
    if (found !== null) return false;
    if (node.isTextblock) found = pos + 1;
    return found === null;
  });

  return found;
}

export function addRow(side = 'after') {
  return (state, dispatch) => {
    const cell = findCell(state);
    const table = findTable(state);
    if (!cell || !table) return false;
    if (!dispatch) return true;

    const row = cell.row;
    const columns = row.childCount;
    const isHeaderRow = row.child(0).type.name === 'th';

    // A new row is always body content, even when added from the header row.
    const newRow = rowLikeFirstBodyRow(table.node, table.pos, columns);
    const at = side === 'after' ? cell.rowPos + row.nodeSize : cell.rowPos;

    const tr = state.tr;

    const insertAt = isHeaderRow && side === 'after'
      ? findBodyInsertPosition(table.node, table.pos) ?? at
      : at;

    tr.insert(insertAt, newRow);

    // The new row begins at the insert position; mapping past the insertion would land after it.
    const target = findFirstTextPosition(tr.doc, insertAt);
    if (target !== null) tr.setSelection(TextSelection.create(tr.doc, target));

    dispatch(tr.scrollIntoView());
    return true;
  };
}

// Start of the first tbody, so a row added under the header lands in the body.
function findBodyInsertPosition(table, tablePos) {
  let offset = tablePos + 1;
  let result = null;

  table.forEach((child) => {
    if (result === null && child.type.name === 'tbody') result = offset + 1;
    offset += child.nodeSize;
  });

  return result;
}

export function deleteRow() {
  return (state, dispatch) => {
    const cell = findCell(state);
    const table = findTable(state);
    if (!cell || !table) return false;

    let rowCount = 0;
    forEachRow(table.node, table.pos, () => rowCount++);
    if (rowCount <= 1) return false;

    if (!dispatch) return true;

    const section = findAncestorNode(state, SECTIONS);
    const tr = state.tr;

    // Drop the section too when its only row goes, else it is left invalid.
    if (section && section.node.childCount === 1) {
      tr.delete(section.pos, section.pos + section.node.nodeSize);
    } else {
      tr.delete(cell.rowPos, cell.rowPos + cell.row.nodeSize);
    }

    dispatch(tr.scrollIntoView());
    return true;
  };
}

export function addColumn(side = 'after') {
  return (state, dispatch) => {
    const cell = findCell(state);
    const table = findTable(state);
    if (!cell || !table) return false;
    if (!dispatch) return true;

    const index = side === 'after' ? cell.columnIndex + 1 : cell.columnIndex;
    const existingNames = getColumns(table.node).map((c) => c.name);
    const name = toColumnName('', index, existingNames);

    const insertions = [];

    forEachRow(table.node, table.pos, (row, rowPos, isHeader) => {
      const at = Math.min(index, row.childCount);
      let offset = rowPos + 1;
      for (let i = 0; i < at; i++) offset += row.child(i).nodeSize;

      const headerCell = isHeader || row.child(0).type.name === 'th';
      insertions.push({ offset, headerCell });
    });

    const tr = state.tr;

    // Back to front, so earlier offsets stay valid.
    insertions
      .sort((a, b) => b.offset - a.offset)
      .forEach(({ offset, headerCell }) => {
        tr.insert(offset, createCell(headerCell ? 'th' : 'td', headerCell ? getColumnAttributes({ name }) : {}));
      });

    const first = Math.min(...insertions.map((i) => i.offset));
    const target = findFirstTextPosition(tr.doc, first);
    if (target !== null) tr.setSelection(TextSelection.create(tr.doc, target));

    dispatch(tr.scrollIntoView());
    return true;
  };
}

export function deleteColumn() {
  return (state, dispatch) => {
    const cell = findCell(state);
    const table = findTable(state);
    if (!cell || !table) return false;
    if (cell.row.childCount <= 1) return false;
    if (!dispatch) return true;

    const index = cell.columnIndex;
    const deletions = [];

    forEachRow(table.node, table.pos, (row, rowPos) => {
      if (index >= row.childCount) return;

      let offset = rowPos + 1;
      for (let i = 0; i < index; i++) offset += row.child(i).nodeSize;

      deletions.push({ from: offset, to: offset + row.child(index).nodeSize });
    });

    const tr = state.tr;
    deletions.sort((a, b) => b.from - a.from).forEach(({ from, to }) => tr.delete(from, to));

    dispatch(tr.scrollIntoView());
    return true;
  };
}

function reorder(items, from, to) {
  const next = items.slice();
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

export function moveColumnTo(from, to) {
  return (state, dispatch) => {
    const table = findTable(state);
    if (!table || from === to || from < 0 || to < 0) return false;

    const header = getHeaderRowPos(table.node, table.pos);
    const columnCount = header?.row.childCount ?? 0;
    if (from >= columnCount || to >= columnCount) return false;
    if (!dispatch) return true;

    // Every row moves together or none does, else rows misalign with the header.
    let ragged = false;
    forEachRow(table.node, table.pos, (row) => {
      if (from >= row.childCount || to >= row.childCount) ragged = true;
    });
    if (ragged) return false;

    const edits = [];

    forEachRow(table.node, table.pos, (row, rowPos) => {
      const cells = [];
      row.forEach((child) => cells.push(child));

      edits.push({
        from: rowPos + 1,
        to: rowPos + 1 + row.content.size,
        content: Fragment.fromArray(reorder(cells, from, to))
      });
    });

    if (!edits.length) return false;

    const tr = state.tr;
    edits.sort((a, b) => b.from - a.from).forEach(({ from: f, to: t, content }) => {
      tr.replaceWith(f, t, content);
    });

    dispatch(tr.scrollIntoView());
    return true;
  };
}

/** Move a body row to an arbitrary index within its own section. */
export function moveRowTo(from, to) {
  return (state, dispatch) => {
    const table = findTable(state);
    if (!table || from === to || from < 0 || to < 0) return false;

    const section = findBodySection(table.node, table.pos);
    if (!section) return false;

    const rows = [];
    section.node.forEach((row) => rows.push(row));
    if (from >= rows.length || to >= rows.length) return false;
    if (!dispatch) return true;

    const tr = state.tr.replaceWith(
      section.pos + 1,
      section.pos + 1 + section.node.content.size,
      Fragment.fromArray(reorder(rows, from, to))
    );

    dispatch(tr.scrollIntoView());
    return true;
  };
}

function findBodySection(table, tablePos) {
  let offset = tablePos + 1;
  let found = null;

  table.forEach((child) => {
    const at = offset;
    offset += child.nodeSize;
    if (!found && child.type.name === 'tbody') found = { node: child, pos: at };
  });

  return found;
}

// Index of the current row within its body section, for the move buttons.
export function getRowIndex(state) {
  const cell = findCell(state);
  const table = findTable(state);
  if (!cell || !table) return -1;

  const section = findBodySection(table.node, table.pos);
  if (!section) return -1;

  let index = -1;
  let offset = section.pos + 1;
  section.node.forEach((row, _o, i) => {
    if (offset === cell.rowPos) index = i;
    offset += row.nodeSize;
  });

  return index;
}

export function getBodyRowCount(state) {
  const table = findTable(state);
  if (!table) return 0;
  return findBodySection(table.node, table.pos)?.node.childCount ?? 0;
}

/** Move the current column one place left or right. */
export function moveColumn(direction) {
  return (state, dispatch) => {
    const cell = findCell(state);
    if (!cell) return false;
    return moveColumnTo(cell.columnIndex, cell.columnIndex + direction)(state, dispatch);
  };
}

/** Move the current row one place up or down. */
export function moveRow(direction) {
  return (state, dispatch) => {
    const index = getRowIndex(state);
    if (index === -1) return false;
    return moveRowTo(index, index + direction)(state, dispatch);
  };
}

export function deleteTable() {
  return (state, dispatch) => {
    const table = findTable(state);
    if (!table) return false;
    if (!dispatch) return true;

    dispatch(state.tr.delete(table.pos, table.pos + table.node.nodeSize).scrollIntoView());
    return true;
  };
}

// Move the caret to the next cell, adding a row when leaving the last one.
export function goToNextCell(direction = 1) {
  return (state, dispatch) => {
    const cell = findCell(state);
    const table = findTable(state);
    if (!cell || !table) return false;

    const cells = [];
    forEachRow(table.node, table.pos, (row, rowPos) => {
      let offset = rowPos + 1;
      row.forEach((child) => {
        cells.push({ pos: offset, node: child });
        offset += child.nodeSize;
      });
    });

    const current = cells.findIndex((c) => c.pos === cell.pos);
    if (current === -1) return false;

    const next = current + direction;

    if (next >= cells.length) {
      return addRow('after')(state, dispatch) || exitTable('after')(state, dispatch);
    }
    if (next < 0) return exitTable('before')(state, dispatch);
    if (!dispatch) return true;

    const target = findFirstTextPosition(state.doc, cells[next].pos);
    if (target === null) return false;

    dispatch(state.tr.setSelection(TextSelection.create(state.doc, target)).scrollIntoView());
    return true;
  };
}

function cellTextPosition(doc, rowPos, columnIndex) {
  const row = doc.nodeAt(rowPos);
  if (!row) return null;

  let pos = rowPos + 1;
  for (let i = 0; i < columnIndex && i < row.childCount; i++) pos += row.child(i).nodeSize;

  return findFirstTextPosition(doc, pos);
}

// Enter commits the cell and moves down the column, adding a row at the end; Shift-Enter breaks a line.
export function goToCellBelow(direction = 1, { addRow: addRowAtEnd = true } = {}) {
  return (state, dispatch) => {
    const cell = findCell(state);
    const table = findTable(state);
    if (!cell || !table) return false;

    const rows = [];
    forEachRow(table.node, table.pos, (row, rowPos) => rows.push({ row, pos: rowPos }));

    const index = rows.findIndex((r) => r.pos === cell.rowPos);
    if (index === -1) return false;

    const next = index + direction;
    if (next < 0) return false;
    if (!dispatch) return true;

    if (next >= rows.length) {
      // Enter carries on into a new row; an arrow key just runs out of table.
      if (direction < 0 || !addRowAtEnd) return false;

      const isHeaderRow = cell.row.child(0).type.name === 'th';
      const body = isHeaderRow ? findBodyInsertPosition(table.node, table.pos) : null;
      const at = body !== null ? body : cell.rowPos + cell.row.nodeSize;

      const tr = state.tr;
      tr.insert(at, createRow('td', cell.row.childCount));

      const target = cellTextPosition(tr.doc, tr.mapping.map(at), cell.columnIndex);
      if (target === null) return false;

      tr.setSelection(TextSelection.create(tr.doc, target));
      dispatch(tr.scrollIntoView());
      return true;
    }

    const target = cellTextPosition(state.doc, rows[next].pos, cell.columnIndex);
    if (target === null) return false;

    dispatch(state.tr.setSelection(TextSelection.create(state.doc, target)).scrollIntoView());
    return true;
  };
}

function tableCaption(table) {
  const first = table.node.firstChild;
  return first?.type.name === 'caption' ? { node: first, pos: table.pos + 1 } : null;
}

/** Up from the first row belongs in the caption, not outside the table. */
export function goToCaption() {
  return (state, dispatch) => {
    const table = findTable(state);
    if (!table) return false;

    const caption = tableCaption(table);
    if (!caption) return false;
    if (!dispatch) return true;

    const end = caption.pos + caption.node.nodeSize - 1;
    dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(end), -1)).scrollIntoView());
    return true;
  };
}

/** Down from the caption belongs in the first cell. */
export function goToFirstCell() {
  return (state, dispatch) => {
    const table = findTable(state);
    if (!table || findCell(state)) return false;
    if (!dispatch) return true;

    const target = findFirstCellTextPosition(state.doc, table.pos, table.node.nodeSize);
    if (target === null) return false;

    dispatch(state.tr.setSelection(TextSelection.create(state.doc, target)).scrollIntoView());
    return true;
  };
}

// Leave the table into the block after it, adding a paragraph when it is the last node.
export function exitTable(side = 'after') {
  return (state, dispatch) => {
    const table = findTable(state);
    if (!table) return false;
    if (!dispatch) return true;

    const tr = state.tr;
    const at = side === 'after' ? table.pos + table.node.nodeSize : table.pos;
    const neighbour = side === 'after'
      ? tr.doc.resolve(at).nodeAfter
      : tr.doc.resolve(at).nodeBefore;

    if (!neighbour || !neighbour.isTextblock) {
      tr.insert(at, schema.nodes.p.createAndFill());
    }

    const target = findFirstTextPosition(tr.doc, at);
    if (target === null) return false;

    tr.setSelection(TextSelection.create(tr.doc, target));
    dispatch(tr.scrollIntoView());
    return true;
  };
}

export { getTableSchema };
