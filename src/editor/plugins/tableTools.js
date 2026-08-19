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

import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { schema } from '../schema/base.js';
import Config from '../../config.js';
import { i18n } from '../../i18n.js';
import { sanitizeInsertAdjacentHTML, htmlEncode } from '../../utils/sanitization.js';
import { debounce, generateAttributeId } from '../../util.js';
import {
  findTable,
  findCell,
  forEachRow,
  getColumns,
  getHeaderRowPos,
  setColumnAttributes,
  setTableAttributes,
  addRow,
  addColumn,
  deleteRow,
  deleteColumn,
  deleteTable,
  goToNextCell,
  exitTable,
  moveColumn,
  moveRow,
  moveColumnTo,
  moveRowTo,
  getRowIndex,
  getBodyRowCount
} from '../commands/table.js';
import {
  getTableSchema,
  getColumnTitle,
  toColumnName,
  buildCellRDFa,
  computeRowSubject,
  isColumnMapped,
  getPrefixesUsed,
  ensureDocumentPrefixes
} from '../../table.js';
import { reconcileTable, reconcileSelectedTable } from './tableRDFa.js';
import { searchClasses, searchProperties } from '../../vocab.js';
import { LookupServices, getLookupService, identifierColumnCandidates, lookupIdentifier, getIdentifierSearch, looksLikeIdentifier, needsIdentifierPick } from '../../services.js';

export const tableToolsPluginKey = new PluginKey('tableTools');

const instances = new WeakMap();

const DATATYPES = [
  ['', 'Any'],
  ['string', 'Text'],
  ['integer', 'Whole number'],
  ['decimal', 'Decimal number'],
  ['double', 'Floating-point number'],
  ['boolean', 'True or false'],
  ['date', 'Date'],
  ['dateTime', 'Date and time'],
  ['time', 'Time'],
  ['duration', 'Duration'],
  ['anyURI', 'URL'],
  ['gYear', 'Year']
];

function datatypeLabel(name, label) {
  return name ? `${label} (xsd:${name})` : label;
}

// Keep in step with .editor-table-row-handle width in dokieli.css.
const HANDLE_WIDTH = 16;

// How far a grip sits outside the table, identical for rows and columns so the
// two read as the same affordance.
const HANDLE_OFFSET = 17;

function isNear(e, rect, padding) {
  return e.clientX >= rect.left - padding && e.clientX <= rect.right + padding
    && e.clientY >= rect.top - padding && e.clientY <= rect.bottom + padding;
}

const COMMON_TYPES = [
  'schema:Book', 'schema:Person', 'schema:Organization', 'schema:CreativeWork',
  'schema:Article', 'schema:Event', 'schema:Place', 'schema:Product',
  'schema:Dataset', 'foaf:Person', 'skos:Concept', 'csvw:Row'
];

const DEFAULT_ROW_PROPERTY = 'schema:hasPart';

/**
 * A table's subject, derived rather than authored: the caption normalised into
 * a fragment, or a generated one when there is no caption.
 */
function tableSubjectFrom(tableNode) {
  let caption = '';
  tableNode.forEach((child) => {
    if (child.type.name === 'caption') caption = child.textContent.trim();
  });

  return '#' + generateAttributeId(null, caption || 'table');
}

function t(key, fallback, vars) {
  const value = i18n.t(key, vars);
  return value === key ? fallback : value;
}

/**
 * Mark the identifier column and hint at what an empty cell in it expects.
 *
 * Decorations rather than direct DOM writes: the table's DOM belongs to
 * ProseMirror, and mutating it makes the observer re-parse the node.
 */
function identifierDecorations(state) {
  const table = findTable(state);
  if (!table) return [];

  const tableSchema = getTableSchema(table.node.attrs.originalAttributes);
  const idColumn = tableSchema.lookup?.idColumn;
  if (!idColumn) return [];

  const columns = getColumns(table.node);
  const index = columns.findIndex((c) => c.name && c.name === idColumn);
  if (index < 0) return [];

  const service = getLookupService(tableSchema.lookup?.service);
  const hint = getIdentifierSearch(tableSchema.lookup)
    ? t('editor.table.cell.search.hint', 'Type to search…')
    : t('editor.table.cell.identifier.hint', `Enter ${service?.identifier || idColumn}`, { identifier: service?.identifier || idColumn });

  const decorations = [];

  forEachRow(table.node, table.pos, (row, rowPos, isHeader) => {
    if (index >= row.childCount) return;

    let cellPos = rowPos + 1;
    for (let i = 0; i < index; i++) cellPos += row.child(i).nodeSize;

    const cell = row.child(index);

    // A tooltip rather than rendered text: the cell already shows the editor's
    // own placeholder, and a second one competes with it for the same space.
    decorations.push(Decoration.node(cellPos, cellPos + cell.nodeSize, {
      class: isHeader ? 'table-identifier-column' : 'table-identifier-cell',
      title: hint
    }));
  });

  return decorations;
}

/** The cell holding the selection, so the caret's column is never in doubt. */
function activeCellDecoration(state) {
  const cell = findCell(state);
  if (!cell) return [];

  return [Decoration.node(cell.pos, cell.pos + cell.node.nodeSize, { class: 'table-cell-active' })];
}

/** Outline whichever column or row is being dragged, so the thing moving is obvious. */
function dragDecorations(state, drag) {
  if (!drag) return [];

  const table = findTable(state);
  if (!table) return [];

  const decorations = [];
  // Row handles index within the body, so count body rows the same way.
  let bodyIndex = -1;

  forEachRow(table.node, table.pos, (row, rowPos, isHeader) => {
    if (!isHeader) bodyIndex += 1;

    if (drag.kind === 'row') {
      if (isHeader || bodyIndex !== drag.index) return;
      decorations.push(Decoration.node(rowPos, rowPos + row.nodeSize, { class: 'table-row-dragging' }));
      return;
    }

    if (drag.index >= row.childCount) return;

    let cellPos = rowPos + 1;
    for (let i = 0; i < drag.index; i++) cellPos += row.child(i).nodeSize;

    const cell = row.child(drag.index);
    decorations.push(Decoration.node(cellPos, cellPos + cell.nodeSize, {
      class: `table-column-dragging${isHeader ? ' table-column-dragging-first' : ''}`
    }));
  });

  return decorations;
}

/**
 * An empty caption already renders "Table N." from CSS; say what goes after it.
 * Every table, not only the one holding the selection: the hint is there to be
 * noticed before anyone clicks.
 */
function captionPlaceholderDecoration(state) {
  const decorations = [];
  const hint = t('editor.table.caption.placeholder', 'name this table');

  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'table') return true;

    const caption = node.firstChild;
    if (caption?.type.name !== 'caption' || caption.textContent.trim()) return false;

    // The caption holds inline content directly, so an empty one has no child
    // to hang this on: it goes on the caption itself.
    const from = pos + 1;
    decorations.push(Decoration.node(from, from + caption.nodeSize, { 'data-placeholder': hint }));

    return false;
  });

  return decorations;
}

function tableDecorations(state, drag) {
  return [
    ...identifierDecorations(state),
    ...activeCellDecoration(state),
    ...captionPlaceholderDecoration(state),
    ...dragDecorations(state, drag)
  ];
}

export function tableToolsPlugin() {
  return new Plugin({
    key: tableToolsPluginKey,

    // Lookup status per row. Held as decorations rather than classes written
    // onto the row's DOM: ProseMirror re-renders that DOM whenever anything
    // else changes, which silently removed them.
    state: {
      init() {
        return { status: DecorationSet.empty, drag: null };
      },

      apply(tr, value) {
        let status = value.status.map(tr.mapping, tr.doc);
        let drag = value.drag;

        const action = tr.getMeta(tableToolsPluginKey);
        if (!action) return { status, drag };

        if (action.clearStatus !== undefined) {
          status = status.remove(status.find(action.clearStatus, action.clearStatus + 1));
        }

        if (action.status && action.pos !== undefined) {
          const row = tr.doc.nodeAt(action.pos);
          if (row) {
            status = status.add(tr.doc, [
              Decoration.node(action.pos, action.pos + row.nodeSize, { class: action.status })
            ]);
          }
        }

        if ('drag' in action) drag = action.drag;

        return { status, drag };
      }
    },

    appendTransaction(transactions, oldState, newState) {
      return reconcileSelectedTable(transactions, oldState, newState);
    },

    props: {
      decorations(state) {
        const { status, drag } = tableToolsPluginKey.getState(state) ?? {};
        const set = status ?? DecorationSet.empty;
        return set.add(state.doc, tableDecorations(state, drag));
      },

      handleKeyDown(view, event) {
        const instance = instances.get(view);

        // The suggestion list owns the arrow keys and Enter while it is open.
        if (instance?.suggestions) {
          const handled = instance.handleSuggestionKey(event);
          if (handled) {
            event.preventDefault();
            return true;
          }
        }

        if (!findCell(view.state)) return false;

        // A table swallows Enter and Tab, so there has to be a way out that is
        // not reaching for the mouse.
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          const left = exitTable(event.shiftKey ? 'before' : 'after')(view.state, view.dispatch);
          if (left) {
            event.preventDefault();
            view.focus();
          }
          return left;
        }

        if (event.key !== 'Tab') return false;

        const handled = goToNextCell(event.shiftKey ? -1 : 1)(view.state, view.dispatch);
        if (handled) event.preventDefault();
        return handled;
      }
    },

    view(editorView) {
      return new TableToolsView(editorView);
    }
  });
}

class TableToolsView {
  constructor(editorView) {
    this.editorView = editorView;
    this.table = null;
    this.panel = null;
    this.watchedCell = null;

    document.getElementById('editor-table-tools')?.remove();

    this.container = document.createElement('div');
    this.container.id = 'editor-table-tools';
    this.container.className = 'do editor-table-tools';
    this.container.setAttribute('contenteditable', 'false');
    this.container.setAttribute('spellcheck', 'false');
    this.container.hidden = true;
    document.body.appendChild(this.container);

    this.container.addEventListener('mousedown', (e) => e.preventDefault());
    this.container.addEventListener('click', (e) => this.onToolbarClick(e));

    this.repositionHandler = () => {
      if (!this.container.hidden) this.position();
      if (this.panel) this.positionPanel();
    };

    this.documentClickHandler = (e) => {
      if (this.panel && !this.panel.contains(e.target) && !this.container.contains(e.target)) {
        this.closePanel();
      }
    };

    window.addEventListener('scroll', this.repositionHandler, true);
    window.addEventListener('resize', this.repositionHandler);
    document.addEventListener('mousedown', this.documentClickHandler);

    this.renderToolbar();
    this.installDragHandlers();

    instances.set(editorView, this);
  }

  handleSuggestionKey(event) {
    const items = [...(this.suggestions?.querySelectorAll('li') || [])];
    if (!items.length) return false;

    const active = items.findIndex((li) => li.classList.contains('active'));

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        items.forEach((li) => { li.classList.remove('active'); li.setAttribute('aria-selected', 'false'); });
        const next = event.key === 'ArrowDown'
          ? (active + 1) % items.length
          : (active <= 0 ? items.length : active) - 1;
        items[next].classList.add('active');
        items[next].setAttribute('aria-selected', 'true');
        return true;
      }
      case 'Enter':
      case 'Tab':
        if (active < 0) return false;
        items[active].selectResult();
        return true;
      case 'Escape':
        this.closeSuggestions();
        return true;
      default:
        return false;
    }
  }

  update(view, prevState) {
    const table = findTable(view.state);

    this.maybeAutofill(view, prevState);
    this.maybeSuggestIdentifiers(view);

    if (!table || !view.editable) {
      this.table = null;
      this.hide();
      return;
    }

    this.table = table;
    this.container.hidden = false;
    this.updateToolbarState();
    this.position();
  }

  destroy() {
    window.removeEventListener('scroll', this.repositionHandler, true);
    window.removeEventListener('resize', this.repositionHandler);
    document.removeEventListener('mousedown', this.documentClickHandler);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
    this.editorView.dom.removeEventListener('dragstart', this.onDragStart);
    this.closeSuggestions();
    this.closePanel();
    this.indicator?.remove();
    this.removeRowHandle();
    this.removeColumnHandle();
    this.container.remove();
  }

  // The row grip is driven by hover, not by the selection, so it outlives the
  // toolbar being hidden.
  hide() {
    this.container.hidden = true;
    this.closePanel();
    this.closeSuggestions();
  }

  position() {
    if (!this.table) return;

    const dom = this.editorView.nodeDOM(this.table.pos);
    if (!dom || !dom.getBoundingClientRect) return;

    const rect = dom.getBoundingClientRect();
    this.container.style.top = `${window.scrollY + rect.top - this.container.offsetHeight - 6}px`;
    this.container.style.left = `${window.scrollX + rect.left}px`;
  }

  renderToolbar() {
    const button = (action, label, icon) =>
      `<button type="button" data-table-action="${action}" title="${htmlEncode(label)}" aria-label="${htmlEncode(label)}">${icon ?? htmlEncode(label)}</button>`;

    const html = `
      <div class="editor-table-tools-group" role="group" aria-label="${htmlEncode(t('editor.table.toolbar.row.aria-label', 'Row'))}">
        ${button('row-before', t('editor.table.row-before', 'Insert row above'), '↑+')}
        ${button('row-after', t('editor.table.row-after', 'Insert row below'), '↓+')}
        ${button('row-delete', t('editor.table.row-delete', 'Delete row'), '↕−')}
        ${button('row-up', t('editor.table.row-up', 'Move row up'), '⇡')}
        ${button('row-down', t('editor.table.row-down', 'Move row down'), '⇣')}
      </div>
      <div class="editor-table-tools-group" role="group" aria-label="${htmlEncode(t('editor.table.toolbar.column.aria-label', 'Column'))}">
        ${button('column-before', t('editor.table.column-before', 'Insert column before'), '←+')}
        ${button('column-after', t('editor.table.column-after', 'Insert column after'), '→+')}
        ${button('column-delete', t('editor.table.column-delete', 'Delete column'), '↔−')}
        ${button('column-left', t('editor.table.column-left', 'Move column left'), '⇠')}
        ${button('column-right', t('editor.table.column-right', 'Move column right'), '⇢')}
        ${button('column-settings', t('editor.table.column-settings', 'Column settings'), t('editor.table.column-settings.label', 'Column…'))}
      </div>
      <div class="editor-table-tools-group" role="group" aria-label="${htmlEncode(t('editor.table.toolbar.table.aria-label', 'Table'))}">
        ${button('table-settings', t('editor.table.table-settings', 'Table settings'), t('editor.table.table-settings.label', 'Table…'))}
        ${button('table-delete', t('editor.table.delete', 'Delete table'), '✕')}
      </div>
    `;

    sanitizeInsertAdjacentHTML(this.container, 'afterbegin', html);
  }

  updateToolbarState() {
    const cell = findCell(this.editorView.state);
    const columns = this.table ? getColumns(this.table.node) : [];
    const column = cell ? columns[cell.columnIndex] : null;

    const settings = this.container.querySelector('[data-table-action="column-settings"]');
    if (settings) {
      settings.disabled = !cell;
      settings.classList.toggle('mapped', !!column && isColumnMapped(column));
    }

    const rowIndex = getRowIndex(this.editorView.state);
    const rowCount = getBodyRowCount(this.editorView.state);

    const setEnabled = (action, enabled) => {
      const el = this.container.querySelector(`[data-table-action="${action}"]`);
      if (el) el.disabled = !enabled;
    };

    setEnabled('column-left', !!cell && cell.columnIndex > 0);
    setEnabled('column-right', !!cell && cell.columnIndex < columns.length - 1);
    setEnabled('row-up', rowIndex > 0);
    setEnabled('row-down', rowIndex > -1 && rowIndex < rowCount - 1);

    const tableSchema = this.table ? getTableSchema(this.table.node.attrs.originalAttributes) : {};
    this.container.querySelector('[data-table-action="table-settings"]')
      ?.classList.toggle('mapped', !!(tableSchema.aboutUrl || tableSchema.typeof || tableSchema.lookup));

  }

  onToolbarClick(e) {
    const action = e.target.closest('[data-table-action]')?.dataset.tableAction;
    if (!action) return;

    e.preventDefault();

    const { state, dispatch } = this.editorView;
    const run = (command) => command(state, dispatch);

    switch (action) {
      case 'row-before': run(addRow('before')); break;
      case 'row-after': run(addRow('after')); break;
      case 'row-delete': run(deleteRow()); break;
      case 'row-up': run(moveRow(-1)); break;
      case 'row-down': run(moveRow(1)); break;
      case 'column-before': run(addColumn('before')); break;
      case 'column-after': run(addColumn('after')); break;
      case 'column-delete': run(deleteColumn()); break;
      case 'column-left': run(moveColumn(-1)); break;
      case 'column-right': run(moveColumn(1)); break;
      case 'table-delete': run(deleteTable()); break;
      case 'column-settings': this.openColumnSettings(); break;
      case 'table-settings': this.openTableSettings(); break;
    }

    this.editorView.focus();
  }

  // --- drag to reorder ------------------------------------------------------

  /**
   * Reordering is pointer-driven rather than HTML5 drag-and-drop, which is
   * unreliable inside contenteditable. A drag only begins once the pointer has
   * moved past a threshold, so an ordinary click still places the caret in the
   * header cell.
   */
  installDragHandlers() {
    this.dragCandidate = null;
    this.drag = null;
    this.columnHandle = null;
    this.handleColumnCell = null;

    this.onMouseMove = (e) => {
      if (this.drag) {
        this.updateDrag(e);
        return;
      }

      if (!this.dragCandidate) {
        this.updateRowHandle(e);
        this.updateColumnHandle(e);
        return;
      }

      const moved = Math.abs(e.clientX - this.dragCandidate.x) + Math.abs(e.clientY - this.dragCandidate.y);
      if (moved < 5) return;

      this.beginDrag(e);
    };

    this.onMouseUp = () => {
      if (this.drag) this.finishDrag();
      this.dragCandidate = null;
    };

    // Reordering a column starts on a header cell that may hold selected text,
    // and the browser would rather drag that text out of the document. While a
    // column drag is pending or running, that native drag is not what was meant.
    this.onDragStart = (e) => {
      if (this.drag || this.dragCandidate) e.preventDefault();
    };

    this.editorView.dom.addEventListener('dragstart', this.onDragStart);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
  }

  beginDrag(e) {
    const table = findTable(this.editorView.state);
    if (!table) { this.dragCandidate = null; return; }

    this.drag = { ...this.dragCandidate, target: this.dragCandidate.index };
    this.dragCandidate = null;

    document.body.classList.add('editor-table-dragging');
    this.setDragState({ kind: this.drag.kind, index: this.drag.index });

    this.indicator = document.createElement('div');
    this.indicator.className = `editor-table-drop-indicator ${this.drag.kind}`;
    document.body.appendChild(this.indicator);

    this.updateDrag(e);
  }

  updateDrag(e) {
    const tableDOM = this.getTableDOM();
    if (!tableDOM) return;

    const target = this.drag.kind === 'column'
      ? this.columnIndexAt(tableDOM, e.clientX)
      : this.rowIndexAt(tableDOM, e.clientY);

    if (target === null) return;
    this.drag.target = target;
    this.positionIndicator(tableDOM, target);
  }

  getTableDOM() {
    const table = findTable(this.editorView.state);
    if (!table) return null;
    const dom = this.editorView.nodeDOM(table.pos);
    return dom?.getBoundingClientRect ? dom : null;
  }

  columnIndexAt(tableDOM, x) {
    // The header row, not merely the first row: a column can only be dropped
    // where another column already is, so the header defines the slots.
    const headerRow = tableDOM.querySelector('thead tr') || tableDOM.querySelector('tr');
    const headerCells = [...(headerRow?.children || [])];
    if (!headerCells.length) return null;

    for (let i = 0; i < headerCells.length; i++) {
      const rect = headerCells[i].getBoundingClientRect();
      if (x < rect.left + rect.width / 2) return i;
    }

    return headerCells.length - 1;
  }

  rowIndexAt(tableDOM, y) {
    const rows = [...(tableDOM.querySelector('tbody')?.children || [])];
    if (!rows.length) return null;

    for (let i = 0; i < rows.length; i++) {
      const rect = rows[i].getBoundingClientRect();
      if (y < rect.top + rect.height / 2) return i;
    }

    return rows.length - 1;
  }

  positionIndicator(tableDOM, target) {
    const tableRect = tableDOM.getBoundingClientRect();

    if (this.drag.kind === 'column') {
      const cells = [...(tableDOM.querySelector('tr')?.children || [])];
      const cell = cells[target];
      if (!cell) return;

      const rect = cell.getBoundingClientRect();
      const edge = target >= this.drag.index ? rect.right : rect.left;

      Object.assign(this.indicator.style, {
        top: `${window.scrollY + tableRect.top}px`,
        left: `${window.scrollX + edge}px`,
        height: `${tableRect.height}px`
      });
      return;
    }

    const rows = [...(tableDOM.querySelector('tbody')?.children || [])];
    const row = rows[target];
    if (!row) return;

    const rect = row.getBoundingClientRect();
    const edge = target >= this.drag.index ? rect.bottom : rect.top;

    Object.assign(this.indicator.style, {
      top: `${window.scrollY + edge}px`,
      left: `${window.scrollX + tableRect.left}px`,
      width: `${tableRect.width}px`
    });
  }

  finishDrag() {
    const { kind, index, target } = this.drag;

    this.indicator?.remove();
    this.indicator = null;
    this.drag = null;
    document.body.classList.remove('editor-table-dragging');
    this.setDragState(null);

    if (index === target) return;

    const { state, dispatch } = this.editorView;
    if (kind === 'column') moveColumnTo(index, target)(state, dispatch);
    else moveRowTo(index, target)(state, dispatch);

    this.editorView.focus();
  }

  removeRowHandle() {
    this.rowHandle?.remove();
    this.rowHandle = null;
    this.handleRow = null;
  }

  setDragState(drag) {
    const view = this.editorView;
    view.dispatch(view.state.tr.setMeta(tableToolsPluginKey, { drag }));
  }

  removeColumnHandle() {
    this.columnHandle?.remove();
    this.columnHandle = null;
    this.handleColumnCell = null;
  }

  selectHandleColumn() {
    const cell = this.handleColumnCell;
    if (!cell || !this.editorView.dom.contains(cell)) return false;

    try {
      const pos = this.editorView.posAtDOM(cell, 0);
      const $pos = this.editorView.state.doc.resolve(pos);

      this.editorView.dispatch(this.editorView.state.tr.setSelection(TextSelection.near($pos)));
      return true;
    } catch {
      return false;
    }
  }

  /** The column's counterpart to the row grip, parked above its header cell. */
  createColumnHandle() {
    const handle = document.createElement('div');
    handle.className = 'editor-table-column-handle';
    handle.setAttribute('contenteditable', 'false');
    handle.title = t('editor.table.column-drag', 'Drag to reorder column');

    handle.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();

      if (!this.selectHandleColumn()) return;

      this.dragCandidate = {
        kind: 'column',
        x: e.clientX,
        y: e.clientY,
        index: Number(handle.dataset.columnIndex)
      };
    });

    document.body.appendChild(handle);
    return handle;
  }

  updateColumnHandle(e) {
    if (!this.editorView.editable || this.drag || this.dragCandidate) return;

    if (this.columnHandle && isNear(e, this.columnHandle.getBoundingClientRect(), 12)) return;

    const cell = e.target.closest?.('th, td');
    const tableDOM = cell?.closest('table');
    const headerRow = tableDOM?.querySelector('thead tr');

    if (!cell || !headerRow || !this.editorView.dom.contains(cell)) {
      this.removeColumnHandle();
      return;
    }

    const index = [...cell.parentNode.children].indexOf(cell);
    const headerCell = headerRow.children[index];
    if (!headerCell) {
      this.removeColumnHandle();
      return;
    }

    if (!this.columnHandle) this.columnHandle = this.createColumnHandle();

    this.handleColumnCell = headerCell;

    // Above the header cell, not above the table: a caption sits inside the
    // table element, so the table's top edge can be well clear of the headers.
    const rect = headerCell.getBoundingClientRect();

    this.columnHandle.dataset.columnIndex = String(index);
    Object.assign(this.columnHandle.style, {
      left: `${window.scrollX + rect.left}px`,
      top: `${window.scrollY + rect.top - HANDLE_OFFSET}px`,
      width: `${rect.width}px`
    });
  }

  selectHandleRow() {
    const row = this.handleRow;
    if (!row || !this.editorView.dom.contains(row)) return false;

    try {
      const pos = this.editorView.posAtDOM(row, 0);
      const $pos = this.editorView.state.doc.resolve(pos);
      const selection = TextSelection.near($pos);

      this.editorView.dispatch(this.editorView.state.tr.setSelection(selection));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * The grip sits outside the table, so it lives in <body> rather than in the
   * editor DOM -- which means it needs its own mousedown listener, and it must
   * survive the pointer crossing the gap between the row and itself.
   */
  createRowHandle() {
    const handle = document.createElement('div');
    handle.className = 'editor-table-row-handle';
    handle.setAttribute('contenteditable', 'false');
    handle.title = t('editor.table.row-drag', 'Drag to reorder row');

    handle.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();

      // Every table command resolves its table from the selection, and the
      // caret may be somewhere else entirely -- so put it in this row first.
      if (!this.selectHandleRow()) return;

      this.dragCandidate = {
        kind: 'row',
        x: e.clientX,
        y: e.clientY,
        index: Number(handle.dataset.rowIndex)
      };
    });

    document.body.appendChild(handle);
    return handle;
  }

  /** A grip parked at the left edge of the row under the pointer. */
  updateRowHandle(e) {
    if (!this.editorView.editable || this.drag || this.dragCandidate) return;

    // Reaching for the grip means leaving the row, so keep it alive while the
    // pointer is on or near it instead of hiding the moment the row is exited.
    if (this.rowHandle && isNear(e, this.rowHandle.getBoundingClientRect(), 12)) return;

    const row = e.target.closest?.('tr');
    const tableDOM = row?.closest('table');

    if (!row || row.parentNode?.tagName !== 'TBODY' || !this.editorView.dom.contains(row)) {
      this.removeRowHandle();
      return;
    }

    if (!this.rowHandle) this.rowHandle = this.createRowHandle();

    this.handleRow = row;

    const rect = row.getBoundingClientRect();
    const tableRect = tableDOM.getBoundingClientRect();

    this.rowHandle.dataset.rowIndex = String([...row.parentNode.children].indexOf(row));
    Object.assign(this.rowHandle.style, {
      top: `${window.scrollY + rect.top}px`,
      left: `${window.scrollX + tableRect.left - HANDLE_OFFSET}px`,
      height: `${rect.height}px`
    });
  }

  // --- panels ---------------------------------------------------------------

  closePanel() {
    this.panel?.remove();
    this.panel = null;
  }

  openPanel(html, anchor) {
    this.closePanel();

    this.panel = document.createElement('div');
    this.panel.className = 'do editor-table-panel';
    this.panel.setAttribute('contenteditable', 'false');
    this.panel.setAttribute('spellcheck', 'false');
    document.body.appendChild(this.panel);

    sanitizeInsertAdjacentHTML(this.panel, 'afterbegin', html);

    this.panelAnchor = anchor || this.container;
    this.positionPanel();

    this.panel.querySelector('input, select, textarea')?.focus();
    this.panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.closePanel();
        this.editorView.focus();
      }
    });

    return this.panel;
  }

  positionPanel() {
    if (!this.panel) return;

    const rect = (this.panelAnchor || this.container).getBoundingClientRect();
    const top = window.scrollY + rect.bottom + 6;
    const left = Math.min(
      window.scrollX + rect.left,
      window.scrollX + document.documentElement.clientWidth - this.panel.offsetWidth - 12
    );

    this.panel.style.top = `${top}px`;
    this.panel.style.left = `${Math.max(window.scrollX + 8, left)}px`;
  }

  openColumnSettings() {
    const cell = findCell(this.editorView.state);
    const table = findTable(this.editorView.state);
    if (!cell || !table) return;

    const columns = getColumns(table.node);
    const index = cell.columnIndex;
    const column = columns[index] || {};
    const tableSchema = getTableSchema(table.node.attrs.originalAttributes);
    const isJSONLookup = tableSchema.lookup?.url && (tableSchema.lookup.format || 'json') === 'json';
    const isIdentifier = tableSchema.lookup?.idColumn === column.name;

    const kind = column.propertyUrl === 'rdf:type' ? 'type'
      : column.image ? 'image'
      : column.valueUrl ? 'link' : 'literal';

    const panel = this.openPanel(`
      <form class="editor-form editor-form-active" id="editor-form-table-column-settings">
        <fieldset>
          <legend>${htmlEncode(t('editor.table.column.legend', 'Column'))}</legend>

          <label for="table-column-title">${htmlEncode(t('editor.table.column.title.label', 'Header'))}</label>
          <input class="editor-form-input" dir="auto" id="table-column-title" name="title" type="text" value="${htmlEncode(getColumnTitle(column, ''))}" />

          <div class="autocomplete">
            <label for="table-column-property">${htmlEncode(t('editor.table.column.property.label', 'Property'))}</label>
            <input autocomplete="off" class="editor-form-input" dir="ltr" id="table-column-property" name="property" placeholder="schema:name" type="text" value="${htmlEncode(column.propertyUrl || '')}" />
          </div>

          <label for="table-column-kind">${htmlEncode(t('editor.table.column.kind.label', 'Value'))}</label>
          <select class="editor-form-select" id="table-column-kind" name="kind">
            <option value="literal"${kind === 'literal' ? ' selected=""' : ''}>${htmlEncode(t('editor.table.column.kind.literal', 'Text'))}</option>
            <option value="link"${kind === 'link' ? ' selected=""' : ''}>${htmlEncode(t('editor.table.column.kind.link', 'Link'))}</option>
            <option value="type"${kind === 'type' ? ' selected=""' : ''}>${htmlEncode(t('editor.table.column.kind.type', 'Type'))}</option>
            <option value="image"${kind === 'image' ? ' selected=""' : ''}>${htmlEncode(t('editor.table.column.kind.image', 'Image'))}</option>
          </select>

          <div data-when-kind="literal">
            <label for="table-column-datatype">${htmlEncode(t('editor.table.column.datatype.label', 'Datatype'))}</label>
            <select class="editor-form-select" id="table-column-datatype" name="datatype">
              ${DATATYPES.map(([d, label]) => `<option value="${d}"${matchesDatatype(column.datatype, d) ? ' selected=""' : ''}>${htmlEncode(datatypeLabel(d, label))}</option>`).join('')}
            </select>
          </div>

          <div data-when-kind="link type image">
            <label for="table-column-value-url">${htmlEncode(t('editor.table.column.value-url.label', 'Value URL'))}</label>
            <input class="editor-form-input" dir="ltr" id="table-column-value-url" name="valueUrl" placeholder="{${htmlEncode(column.name || 'value')}}" type="text" value="${htmlEncode(column.valueUrl || '')}" />
          </div>

          <label for="table-column-about-url">${htmlEncode(t('editor.table.column.about-url.label', 'Subject'))}</label>
          <input class="editor-form-input" dir="ltr" id="table-column-about-url" name="aboutUrl" placeholder="${htmlEncode(t('editor.table.column.about-url.placeholder', 'defaults to the row subject'))}" type="text" value="${htmlEncode(column.aboutUrl || '')}" />

          ${isJSONLookup ? `
            <label for="table-column-source">${htmlEncode(t('editor.table.column.source.label', 'Fill from result field'))}</label>
            <input class="editor-form-input" dir="ltr" id="table-column-source" name="source" placeholder="authors.*.name" type="text" value="${htmlEncode(column.lookup?.source || '')}" />
          ` : ''}

          ${isIdentifier
            ? `<p class="info">${htmlEncode(t('editor.table.column.identifier.info', 'This column identifies each row and fills the others. Change it in Table settings.'))}</p>`
            : `
              <label for="table-column-service">${htmlEncode(t('editor.table.column.service.label', 'Suggest values from'))}</label>
              <select class="editor-form-select" id="table-column-service" name="columnService">
                <option value="">${htmlEncode(t('editor.table.lookup.service.none', 'None'))}</option>
                ${Object.entries(LookupServices).filter(([, service]) => service.search).map(([name, service]) =>
                  `<option value="${name}"${column.lookup?.service === name ? ' selected=""' : ''}>${htmlEncode(service.label)}</option>`).join('')}
              </select>
              <p class="info">${htmlEncode(t('editor.table.column.service.info', 'Typing in this column offers matches to pick from, and links what is chosen. It does not fill the rest of the row.'))}</p>
            `}

          <div class="editor-form-actions-row">
            <button class="editor-form-submit" type="submit">${htmlEncode(t('editor.table.apply', 'Apply'))}</button>
            <button class="editor-form-secondary" name="apply-all" type="button">${htmlEncode(t('editor.table.apply-all', 'Apply to all rows'))}</button>
            <button class="editor-form-cancel" type="button">${htmlEncode(t('editor.toolbar.form.cancel.button.textContent', 'Cancel'))}</button>
          </div>
        </fieldset>
      </form>
    `);

    const kindSelect = panel.querySelector('[name="kind"]');
    const syncKind = () => {
      panel.querySelectorAll('[data-when-kind]').forEach((el) => {
        el.hidden = !el.dataset.whenKind.split(' ').includes(kindSelect.value);
      });
    };
    kindSelect.addEventListener('change', syncKind);
    syncKind();

    this.attachPropertyAutocomplete(panel.querySelector('[name="property"]'));

    panel.querySelector('.editor-form-cancel').addEventListener('click', () => {
      this.closePanel();
      this.editorView.focus();
    });

    panel.querySelector('[name="apply-all"]').addEventListener('click', () => {
      this.applyColumnSettings(panel, index, { applyToAllRows: true });
    });

    panel.addEventListener('submit', (e) => {
      e.preventDefault();
      this.applyColumnSettings(panel, index, { applyToAllRows: false });
    });
  }

  applyColumnSettings(panel, index, { applyToAllRows }) {
    const table = findTable(this.editorView.state);
    if (!table) return;

    const read = (name) => panel.querySelector(`[name="${name}"]`)?.value?.trim() || '';
    const columns = getColumns(table.node);
    const existing = columns[index] || {};

    const kind = read('kind');
    const title = read('title');

    const column = {
      name: existing.name || toColumnName(title, index, columns.map((c) => c.name)),
      titles: title || undefined,
      propertyUrl: kind === 'type' ? 'rdf:type' : read('property') || undefined,
      aboutUrl: read('aboutUrl') || undefined,
      datatype: kind === 'literal' ? read('datatype') || undefined : undefined,
      image: kind === 'image' || undefined,
      valueUrl: kind === 'link' || kind === 'type' || kind === 'image' ? read('valueUrl') || undefined : undefined
    };

    const source = read('source');
    const columnService = read('columnService');
    if (source || columnService) {
      column.lookup = { ...(source ? { source } : {}), ...(columnService ? { service: columnService } : {}) };
    }

    const tr = this.editorView.state.tr;

    setColumnAttributes(tr, table.node, table.pos, index, column);

    // The header cell's text is the column title.
    const header = getHeaderRowPos(table.node, table.pos);
    if (header && title && header.row.child(index)?.textContent.trim() !== title) {
      let cellPos = header.pos + 1;
      for (let i = 0; i < index; i++) cellPos += header.row.child(i).nodeSize;
      const cell = header.row.child(index);
      tr.replaceWith(cellPos + 1, cellPos + cell.nodeSize - 1, schema.nodes.p.create(null, schema.text(title)));
    }

    // The identifier column is chosen in Table settings; renaming a column has
    // to follow it there so the binding does not dangle.
    const tableSchema = getTableSchema(table.node.attrs.originalAttributes);
    if (existing.name && tableSchema.lookup?.idColumn === existing.name && column.name !== existing.name) {
      tableSchema.lookup = { ...tableSchema.lookup, idColumn: column.name };
      setTableAttributes(tr, table.node, table.pos, tableSchema);
    }

    this.editorView.dispatch(tr);

    ensureDocumentPrefixes(getPrefixesUsed(null, [column]));

    if (applyToAllRows) this.rewriteColumnCells(index);

    this.closePanel();
    this.editorView.focus();
  }

  /**
   * Rewrite every data cell in a column so linked columns actually get their
   * <a rel=… href=…>. Attribute-only reconciliation cannot do this, because
   * replacing cell content underneath a live caret is disruptive.
   */
  rewriteColumnCells(index) {
    const table = findTable(this.editorView.state);
    if (!table) return;

    const columns = getColumns(table.node);
    const column = columns[index];
    if (!column || !isColumnMapped(column)) return;

    const tableSchema = getTableSchema(table.node.attrs.originalAttributes);
    const tr = this.editorView.state.tr;
    const edits = [];
    let rowIndex = 0;

    forEachRow(table.node, table.pos, (row, rowPos, isHeader) => {
      if (isHeader || index >= row.childCount) return;
      rowIndex++;

      const fillValues = { _row: rowIndex };
      row.forEach((cell, offset, i) => {
        if (columns[i]?.name) fillValues[columns[i].name] = cell.textContent.trim();
      });

      let cellPos = rowPos + 1;
      for (let i = 0; i < index; i++) cellPos += row.child(i).nodeSize;

      const cell = row.child(index);
      const text = cell.textContent.trim();
      if (!text) return;

      const built = buildCellRDFa(column, text, {
        rowSubject: computeRowSubject(tableSchema, fillValues, null),
        fillValues,
        foreignKeys: []
      });

      edits.push({ from: cellPos + 1, to: cellPos + cell.nodeSize - 1, built });
    });

    edits.sort((a, b) => b.from - a.from).forEach(({ from, to, built }) => {
      tr.replaceWith(from, to, buildCellContent(built));
    });

    if (edits.length) this.editorView.dispatch(tr);
  }

  openTableSettings() {
    const table = findTable(this.editorView.state);
    if (!table) return;

    const tableSchema = getTableSchema(table.node.attrs.originalAttributes);
    const columns = getColumns(table.node);
    const lookup = tableSchema.lookup || {};
    const format = lookup.format || 'json';
/* class="editor-form"*/
    const panel = this.openPanel(`
      <form class="editor-form editor-form-active" id="editor-form-table-settings">
        <fieldset>
          <legend>${htmlEncode(t('editor.table.settings.legend', 'Table'))}</legend>

          <div class="autocomplete">
            <label for="table-typeof">${htmlEncode(t('editor.table.typeof.label', 'Each row describes a'))}</label>
            <input autocomplete="off" class="editor-form-input" dir="ltr" id="table-typeof" list="table-typeof-options" name="typeof" placeholder="schema:Book" type="text" value="${htmlEncode(tableSchema.typeof || '')}" />
            <datalist id="table-typeof-options">${COMMON_TYPES.map((c) => `<option value="${c}"></option>`).join('')}</datalist>
          </div>

          <label for="table-lookup-service">${htmlEncode(t('editor.table.lookup.service.label', 'Data source'))}</label>
          <select class="editor-form-select" id="table-lookup-service" name="service"${lookup.service ? ' disabled=""' : ''}>
            <option value="">${htmlEncode(t('editor.table.lookup.service.none', 'None'))}</option>
            ${Object.entries(LookupServices).map(([name, s]) =>
              `<option value="${name}"${lookup.service === name ? ' selected=""' : ''}>${htmlEncode(s.label)}</option>`).join('')}
          </select>

          ${lookup.service ? `
            <p class="info">${htmlEncode(t('editor.table.lookup.service.locked', 'The columns are mapped to this source. Changing it clears every value the table holds.'))}</p>
            <button class="editor-form-secondary" name="change-service" type="button">${htmlEncode(t('editor.table.lookup.service.change', 'Change data source…'))}</button>
          ` : ''}

          <div data-when-source="on">
            <label for="table-lookup-id-column">${htmlEncode(t('editor.table.lookup.id-column.label', 'Look rows up by'))}</label>
            <select class="editor-form-select" id="table-lookup-id-column" name="idColumn">
              <option value="">—</option>
              ${identifierColumnCandidates(lookup, columns).map((c) =>
                `<option value="${htmlEncode(c.name)}"${lookup.idColumn === c.name ? ' selected=""' : ''}>${htmlEncode(getColumnTitle(c, c.name))}</option>`).join('')}
            </select>
            <p class="info">${htmlEncode(
              getLookupService(lookup.service)?.identifier
                ? t('editor.table.lookup.id-column.info-identifier', `Typing in this column fills the rest of the row. ${getLookupService(lookup.service).identifier} is what this source looks rows up by.`)
                : t('editor.table.lookup.id-column.info', 'Typing in this column fills the rest of the row from the data source.'))}</p>
          </div>

          <details class="editor-table-advanced"${tableSchema.propertyUrl || tableSchema.aboutUrl || lookup.url ? ' open=""' : ''}>
            <summary>${htmlEncode(t('editor.table.advanced.summary', 'Advanced'))}</summary>

            <div class="autocomplete">
              <label for="table-property">${htmlEncode(t('editor.table.property.label', 'Rows are linked by'))}</label>
              <input autocomplete="off" class="editor-form-input" dir="ltr" id="table-property" name="propertyUrl" placeholder="schema:hasPart" type="text" value="${htmlEncode(tableSchema.propertyUrl || '')}" />
            </div>

            <label for="table-about-url">${htmlEncode(t('editor.table.about-url.label', 'Row subject'))}</label>
            <input class="editor-form-input" dir="ltr" id="table-about-url" name="aboutUrl" placeholder="#row/{_row}" type="text" value="${htmlEncode(tableSchema.aboutUrl || '')}" />

            <label for="table-lookup-url">${htmlEncode(t('editor.table.lookup.url.label', 'Request URL'))}</label>
            <input class="editor-form-input" dir="ltr" id="table-lookup-url" name="url" placeholder="https://example.org/item/{id}.json" type="text" value="${htmlEncode(lookup.url || '')}" />

            <label for="table-lookup-format">${htmlEncode(t('editor.table.lookup.format.label', 'Response'))}</label>
            <select class="editor-form-select" id="table-lookup-format" name="format">
              <option value="json"${format === 'json' ? ' selected=""' : ''}>${htmlEncode(t('editor.table.lookup.format.record', 'One record per row'))}</option>
              <option value="rdf"${format === 'rdf' ? ' selected=""' : ''}>${htmlEncode(t('editor.table.lookup.format.linked-data', 'Linked data'))}</option>
            </select>

            <div data-when-format="json">
              <label for="table-lookup-record">${htmlEncode(t('editor.table.lookup.record.label', 'Record path'))}</label>
              <input class="editor-form-input" dir="ltr" id="table-lookup-record" name="record" placeholder="ISBN:{id}" type="text" value="${htmlEncode(lookup.record || '')}" />
            </div>

            <div data-when-format="rdf">
              <label for="table-lookup-subject">${htmlEncode(t('editor.table.lookup.subject.label', 'Result subject'))}</label>
              <input class="editor-form-input" dir="ltr" id="table-lookup-subject" name="lookupSubject" placeholder="https://example.org/item/{id}" type="text" value="${htmlEncode(lookup.subject || '')}" />
              <p class="info">${htmlEncode(t('editor.table.lookup.rdf.info', 'Each column is filled from the property it is mapped to.'))}</p>
            </div>
          </details>

          <div class="editor-form-actions-row">
            <button class="editor-form-submit" type="submit">${htmlEncode(t('editor.table.apply', 'Apply'))}</button>
            <button class="editor-form-cancel" type="button">${htmlEncode(t('editor.toolbar.form.cancel.button.textContent', 'Cancel'))}</button>
          </div>
        </fieldset>
      </form>
    `);

    const formatSelect = panel.querySelector('[name="format"]');
    const syncFormat = () => {
      panel.querySelectorAll('[data-when-format]').forEach((el) => {
        el.hidden = el.dataset.whenFormat !== formatSelect.value;
      });
    };
    formatSelect.addEventListener('change', syncFormat);
    syncFormat();

    // Choosing a preset fills the request fields and, on an empty table,
    // offers its suggested columns.
    panel.querySelector('[name="service"]').addEventListener('change', (e) => {
      const service = getLookupService(e.target.value);
      if (!service) return;

      panel.querySelector('[name="url"]').value = service.url || '';
      panel.querySelector('[name="format"]').value = service.format || 'json';
      panel.querySelector('[name="record"]').value = service.record || '';
      panel.querySelector('[name="lookupSubject"]').value = service.subject || '';
      syncFormat();

      const applyColumns = panel.querySelector('[name="apply-service-columns"]');
      if (applyColumns) applyColumns.hidden = !service.columns?.length;

      panel.querySelectorAll('[data-when-source]').forEach((el) => { el.hidden = false; });
    });

    // Swapping the source leaves columns mapped to properties the new one does
    // not answer, so it is a deliberate act that takes the data with it.
    panel.querySelector('[name="change-service"]')?.addEventListener('click', () => {
      const confirmed = window.confirm(
        t('editor.table.lookup.service.confirm', 'Change the data source and clear every value in the table?'));
      if (!confirmed) return;

      panel.querySelector('[name="service"]').disabled = false;
      panel.dataset.clearOnApply = 'true';
      panel.querySelector('[name="service"]').focus();
    });

    const serviceSelect = panel.querySelector('[name="service"]');
    const syncSource = () => {
      const on = !!(serviceSelect.value || panel.querySelector('[name="url"]')?.value.trim());
      panel.querySelectorAll('[data-when-source]').forEach((el) => { el.hidden = !on; });
    };
    serviceSelect.addEventListener('change', syncSource);
    panel.querySelector('[name="url"]')?.addEventListener('input', syncSource);
    syncSource();

    this.attachPropertyAutocomplete(panel.querySelector('[name="propertyUrl"]'));
    this.attachPropertyAutocomplete(panel.querySelector('[name="typeof"]'), { termType: 'class' });

    panel.querySelector('.editor-form-cancel').addEventListener('click', () => {
      this.closePanel();
      this.editorView.focus();
    });

    panel.addEventListener('submit', (e) => {
      e.preventDefault();
      this.applyTableSettings(panel);
    });
  }

  applyTableSettings(panel) {
    const table = findTable(this.editorView.state);
    if (!table) return;

    const read = (name) => panel.querySelector(`[name="${name}"]`)?.value?.trim() || '';
    const existing = getTableSchema(table.node.attrs.originalAttributes);

    const propertyUrl = read('propertyUrl') || undefined;

    const tableSchema = {
      // Not authored: the caption names the table, so derive the subject from it.
      subject: existing.subject || tableSubjectFrom(table.node),
      propertyUrl,
      aboutUrl: read('aboutUrl') || undefined,
      typeof: read('typeof') || undefined
    };

    // Rows belong to the table; without a stated relationship, say so generically.
    if (!tableSchema.propertyUrl && tableSchema.subject) tableSchema.propertyUrl = DEFAULT_ROW_PROPERTY;

    const service = read('service');
    const url = read('url');

    if (service || url) {
      tableSchema.lookup = {
        service: service || undefined,
        idColumn: read('idColumn') || undefined,
        url: url || undefined,
        format: read('format') || undefined,
        record: read('record') || undefined,
        subject: read('lookupSubject') || undefined
      };
    }

    const tr = this.editorView.state.tr;
    setTableAttributes(tr, table.node, table.pos, tableSchema);

    if (panel.dataset.clearOnApply === 'true') this.clearBodyCells(tr, table);

    this.editorView.dispatch(tr);

    ensureDocumentPrefixes(getPrefixesUsed(tableSchema, getColumns(table.node)));

    // Re-read: positions are unchanged by setNodeMarkup, but the node is new.
    const updated = findTable(this.editorView.state);
    if (updated) {
      const reconcile = this.editorView.state.tr;
      if (reconcileTable(reconcile, updated.node, updated.pos)) {
        this.editorView.dispatch(reconcile);
      }
    }

    this.closePanel();
    this.editorView.focus();
  }

  /** Empty every body cell, for when the table's data no longer answers to its source. */
  clearBodyCells(tr, table) {
    const edits = [];

    forEachRow(table.node, table.pos, (row, rowPos, isHeader) => {
      if (isHeader) return;

      let cellPos = rowPos + 1;
      row.forEach((cell) => {
        if (cell.textContent.trim()) {
          edits.push({ from: cellPos + 1, to: cellPos + cell.nodeSize - 1 });
        }
        cellPos += cell.nodeSize;
      });
    });

    edits.sort((a, b) => b.from - a.from).forEach(({ from, to }) => {
      tr.replaceWith(from, to, schema.nodes.p.create());
    });
  }

  attachPropertyAutocomplete(input, { termType = 'property' } = {}) {
    if (!input) return;

    const container = input.closest('.autocomplete') || input.parentElement;
    let list = null;

    const close = () => { list?.remove(); list = null; };

    const show = (results) => {
      close();
      if (!results.length) return;

      list = document.createElement('ul');
      list.className = 'suggestions';
      list.setAttribute('role', 'listbox');
      list.setAttribute('contenteditable', 'false');

      results.forEach((term) => {
        const li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.tabIndex = -1;

        sanitizeInsertAdjacentHTML(li, 'afterbegin',
          `<span class="term-curie">${htmlEncode(term.curie)}</span>` +
          `<span class="term-label">${htmlEncode(term.label || '')}</span>` +
          (term.source ? `<span class="term-source">${htmlEncode(term.source)}</span>` : '') +
          (term.description ? `<span class="term-description">${htmlEncode(term.description)}</span>` : '')
        );

        li.addEventListener('mousedown', (e) => {
          e.preventDefault();
          input.value = term.curie;

          // A suggested datatype is a good default, never an override.
          const datatype = input.closest('form')?.querySelector('[name="datatype"]');
          if (datatype && term.datatype && !datatype.value) {
            const suggested = term.datatype.replace(/^xsd:/, '');
            if ([...datatype.options].some((o) => o.value === suggested)) datatype.value = suggested;
          }

          close();
        });

        list.appendChild(li);
      });

      container.appendChild(list);
    };

    const search = debounce(async (keyword) => {
      if (!keyword) { close(); return; }

      const vocabularies = Config.User?.TableVocabularies || [];
      const results = termType === 'class'
        ? await searchClasses(keyword, { vocabularies })
        : await searchProperties(keyword, { vocabularies });

      if (input.value.trim() !== keyword) return;
      show(results);
    }, 300);

    input.addEventListener('input', () => search(input.value.trim()));
    input.addEventListener('blur', () => setTimeout(close, 150));

    input.addEventListener('keydown', (e) => {
      if (!list) return;

      const items = [...list.children];
      const active = items.findIndex((li) => li.classList.contains('active'));

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        items.forEach((li) => li.classList.remove('active'));
        const next = e.key === 'ArrowDown'
          ? (active + 1) % items.length
          : (active <= 0 ? items.length : active) - 1;
        items[next].classList.add('active');
        items[next].setAttribute('aria-selected', 'true');
      } else if (e.key === 'Enter' && active > -1) {
        e.preventDefault();
        items[active].dispatchEvent(new MouseEvent('mousedown'));
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    });
  }

  // --- identifier suggestions -----------------------------------------------

  closeSuggestions() {
    this.suggestions?.remove();
    this.suggestions = null;
    this.suggestionQuery = null;
  }

  /**
   * When a service can search by label, offer real choices in the identifier
   * cell instead of silently taking the top hit for an ambiguous term.
   * Picking one skips the resolver, so the lookup uses exactly that entity.
   */
  maybeSuggestIdentifiers(view) {
    const cell = findCell(view.state);
    const table = findTable(view.state);

    if (!cell || !table || !view.editable || !view.hasFocus()) {
      this.closeSuggestions();
      return;
    }

    const tableSchema = getTableSchema(table.node.attrs.originalAttributes);
    const columns = getColumns(table.node);
    const column = columns[cell.columnIndex];

    // The identifier column resolves the whole row. Any other column may still
    // name a service of its own, which only suggests values for its own cells.
    const isIdentifier = !!column?.name && column.name === tableSchema.lookup?.idColumn;
    const search = isIdentifier
      ? getIdentifierSearch(tableSchema.lookup)
      : getIdentifierSearch(column?.lookup);

    if (!search) {
      this.closeSuggestions();
      return;
    }

    const query = cell.node.textContent.trim();

    if (query.length < 2) {
      this.closeSuggestions();
      return;
    }

    if (query === this.suggestionQuery) return;
    this.suggestionQuery = query;

    this.runIdentifierSearch(search, query, cell.pos, cell.rowPos, table.pos, { fillsRow: isIdentifier });
  }

  runIdentifierSearch(search, query, cellPos, rowPos, tablePos, options = {}) {
    if (!this.debouncedIdentifierSearch) {
      this.debouncedIdentifierSearch = debounce(async (fn, q, cp, rp, tp, opts) => {
        const results = await fn(q);
        if (this.suggestionQuery !== q) return;
        this.showIdentifierSuggestions(results, q, cp, rp, tp, opts);
      }, 300);
    }

    this.debouncedIdentifierSearch(search, query, cellPos, rowPos, tablePos, options);
  }

  showIdentifierSuggestions(results, query, cellPos, rowPos, tablePos, options = {}) {
    this.closeSuggestions();
    if (!results.length) return;

    const cellDOM = this.editorView.nodeDOM(cellPos);
    if (!cellDOM?.getBoundingClientRect) return;

    this.suggestions = document.createElement('div');
    this.suggestions.className = 'do autocomplete editor-table-suggestions';
    this.suggestions.setAttribute('contenteditable', 'false');
    this.suggestions.setAttribute('spellcheck', 'false');

    const list = document.createElement('ul');
    list.className = 'suggestions';
    list.setAttribute('role', 'listbox');

    results.forEach((result, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      if (i === 0) li.classList.add('active');

      sanitizeInsertAdjacentHTML(li, 'afterbegin',
        `<span class="term-label">${htmlEncode(result.label)}</span>` +
        `<span class="term-source">${htmlEncode(result.id)}</span>` +
        (result.description ? `<span class="term-description">${htmlEncode(result.description)}</span>` : '')
      );

      li.selectResult = () => {
        this.closeSuggestions();
        this.acceptIdentifier(result, cellPos, rowPos, tablePos, options);
      };
      li.addEventListener('mousedown', (e) => { e.preventDefault(); li.selectResult(); });

      list.appendChild(li);
    });

    this.suggestions.appendChild(list);
    document.body.appendChild(this.suggestions);

    const rect = cellDOM.getBoundingClientRect();
    Object.assign(this.suggestions.style, {
      top: `${window.scrollY + rect.bottom}px`,
      left: `${window.scrollX + rect.left}px`,
      minWidth: `${Math.max(rect.width, 240)}px`
    });
  }

  /**
   * Write the chosen label into the cell. From the identifier column that also
   * fills the row; from any other column the pick is just this cell's value,
   * linked to whatever it resolved to.
   */
  acceptIdentifier(result, cellPos, rowPos, tablePos, options = {}) {
    const view = this.editorView;
    const cell = view.state.doc.nodeAt(cellPos);
    if (!cell) return;

    const table = view.state.doc.nodeAt(tablePos);
    const columns = table ? getColumns(table) : [];
    const columnIndex = this.columnIndexOfCell(rowPos, cellPos);
    const column = columns[columnIndex];

    const built = column && result.uri
      ? buildCellRDFa({ ...column, valueUrl: result.uri }, result.label, { foreignKeys: [] })
      : { text: result.label, child: null, attributes: {} };

    const tr = view.state.tr.replaceWith(
      cellPos + 1,
      cellPos + cell.nodeSize - 1,
      buildCellContent(built)
    );

    view.dispatch(tr);

    // Already resolved, so the watcher must not fire a second lookup.
    this.watchedCell = null;

    if (options.fillsRow) {
      this.runLookup(tablePos, rowPos, result.label, { resolvedId: result.id });
    }
  }

  columnIndexOfCell(rowPos, cellPos) {
    const row = this.editorView.state.doc.nodeAt(rowPos);
    if (!row) return -1;

    let pos = rowPos + 1;
    for (let i = 0; i < row.childCount; i++) {
      if (pos === cellPos) return i;
      pos += row.child(i).nodeSize;
    }

    return -1;
  }

  // --- autofill -------------------------------------------------------------

  /**
   * Fire a lookup when the caret leaves a non-empty identifier cell whose value
   * changed. Leaving the cell is the commit signal: Tab, click elsewhere, or
   * arrow keys all work without a dedicated button.
   */
  maybeAutofill(view, prevState) {
    const previous = this.watchedCell;
    const cell = findCell(view.state);
    const table = findTable(view.state);

    const current = cell && table
      ? { rowPos: cell.rowPos, columnIndex: cell.columnIndex, value: cell.node.textContent.trim(), tablePos: table.pos }
      : null;

    this.watchedCell = current;

    if (!previous) return;
    if (current && current.rowPos === previous.rowPos && current.columnIndex === previous.columnIndex) return;
    if (!previous.value) return;

    const previousTable = view.state.doc.nodeAt(previous.tablePos);
    if (!previousTable || previousTable.type.name !== 'table') return;

    const tableSchema = getTableSchema(previousTable.attrs.originalAttributes);
    if (!tableSchema.lookup?.url || !tableSchema.lookup.idColumn) return;

    const columns = getColumns(previousTable);
    if (columns[previous.columnIndex]?.name !== tableSchema.lookup.idColumn) return;

    // A search term for a searchable service is ambiguous; let the suggestion
    // list decide rather than silently taking the top hit.
    if (needsIdentifierPick(tableSchema.lookup, previous.value)) return;

    // Nothing this service can answer: asking anyway spends a request and
    // reports an empty result, which reads as a failure rather than a mismatch.
    if (!looksLikeIdentifier(tableSchema.lookup, previous.value)) {
      this.setRowStatus(previous.rowPos, 'table-lookup-mismatch', 2500);
      return;
    }

    this.runLookup(previous.tablePos, previous.rowPos, previous.value);
  }

  async runLookup(tablePos, rowPos, identifier, lookupOptions = {}) {
    const view = this.editorView;
    const table = view.state.doc.nodeAt(tablePos);
    if (!table || table.type.name !== 'table') return;

    const tableSchema = getTableSchema(table.attrs.originalAttributes);
    const columns = getColumns(table);

    this.setRowStatus(rowPos, 'table-lookup-pending');

    try {
      const row = view.state.doc.nodeAt(rowPos);
      const fillValues = {};
      row?.forEach((cell, offset, i) => {
        if (columns[i]?.name) fillValues[columns[i].name] = cell.textContent.trim();
      });

      const result = await lookupIdentifier(tableSchema, columns, identifier, { fillValues, ...lookupOptions });

      if (!result || !Object.keys(result.values).length) {
        this.setRowStatus(rowPos, 'table-lookup-empty', 2000);
        return;
      }

      this.setRowStatus(rowPos, null);
      this.fillRow(tablePos, rowPos, result.values);
    } catch (e) {
      console.warn(`Lookup failed for ${identifier}:`, e?.message || e);
      this.setRowStatus(rowPos, 'table-lookup-error', 3000);
    }
  }

  /**
   * Flag a row while its lookup runs, or briefly after it comes back empty or
   * fails. `clearAfter` schedules the flag's removal.
   */
  setRowStatus(rowPos, status, clearAfter) {
    const view = this.editorView;
    if (!view.state.doc.nodeAt(rowPos)) return;

    view.dispatch(view.state.tr.setMeta(tableToolsPluginKey, {
      clearStatus: rowPos,
      ...(status ? { status, pos: rowPos } : {})
    }));

    if (!status || !clearAfter) return;

    setTimeout(() => {
      if (!this.editorView?.state?.doc?.nodeAt(rowPos)) return;
      this.editorView.dispatch(this.editorView.state.tr.setMeta(tableToolsPluginKey, { clearStatus: rowPos }));
    }, clearAfter);
  }

  /** Write looked-up values into the row, leaving anything already typed. */
  fillRow(tablePos, rowPos, values) {
    const view = this.editorView;
    const table = view.state.doc.nodeAt(tablePos);
    const row = view.state.doc.nodeAt(rowPos);
    if (!table || !row) return;

    const tableSchema = getTableSchema(table.attrs.originalAttributes);
    const columns = getColumns(table);

    let rowIndex = 0;
    let counted = 0;
    forEachRow(table, tablePos, (candidate, pos, isHeader) => {
      if (isHeader || rowIndex) return;
      counted++;
      if (pos === rowPos) rowIndex = counted;
    });

    // A lookup describes one entity, so a later lookup for a different
    // identifier replaces everything it feeds; anything else stays as typed.
    const idColumn = tableSchema.lookup?.idColumn;
    const isFed = (column) => !!column?.name && column.name !== idColumn &&
      (Object.hasOwn(values, column.name) || !!column.lookup?.source);

    const fillValues = { _row: rowIndex || 1 };
    row.forEach((cell, offset, i) => {
      const column = columns[i];
      if (!column?.name) return;
      const text = cell.textContent.trim();
      fillValues[column.name] = isFed(column)
        ? values[column.name]?.text || ''
        : text || values[column.name]?.text || '';
    });

    const rowSubject = computeRowSubject(tableSchema, fillValues, null);
    const tr = view.state.tr;
    const edits = [];

    let cellPos = rowPos + 1;
    row.forEach((cell, offset, index) => {
      const at = cellPos;
      cellPos += cell.nodeSize;

      const column = columns[index];
      if (!column?.name) return;

      const fed = isFed(column);
      const existing = cell.textContent.trim();

      // Never clobber what someone typed into a column the lookup does not feed.
      if (!fed && existing) return;

      const value = values[column.name];

      // A fed column with no value in this result held the previous entity's data.
      if (!value?.text) {
        if (fed && existing) edits.push({ from: at + 1, to: at + cell.nodeSize - 1, built: { text: '' } });
        return;
      }

      const built = buildCellRDFa(
        { ...column, valueUrl: column.valueUrl || value.valueUrl || undefined },
        value.text,
        { rowSubject, fillValues, foreignKeys: [] }
      );

      edits.push({ from: at + 1, to: at + cell.nodeSize - 1, built });
    });

    if (!edits.length) return;

    edits.sort((a, b) => b.from - a.from).forEach(({ from, to, built }) => {
      tr.replaceWith(from, to, buildCellContent(built));
    });

    view.dispatch(tr);

    const updated = findTableAt(view.state, tablePos);
    if (updated) {
      const reconcile = view.state.tr;
      if (reconcileTable(reconcile, updated, tablePos)) view.dispatch(reconcile);
    }
  }
}

// A column's datatype may be a bare CSVW name ("integer"), a CURIE
// ("xsd:integer") or CSVW's object form ({ base: "integer" }); the select
// options are bare names.
function matchesDatatype(datatype, option) {
  const name = typeof datatype === 'object' ? datatype?.base ?? datatype?.['@id'] : datatype;
  if (!name) return option === '';
  return String(name).replace(/^xsd:/, '') === option;
}

function findTableAt(state, pos) {
  const node = state.doc.nodeAt(pos);
  return node?.type.name === 'table' ? node : null;
}

// Cell content for a built RDFa description: a linked value becomes an <a>.
function buildCellContent(built) {
  const text = built.text || '';

  if (!built.child) {
    return schema.nodes.p.create(null, text ? schema.text(text) : null);
  }

  if (built.child.tag === 'img') {
    return schema.nodes.p.create(null, schema.nodes.img.create({ originalAttributes: built.child.attributes }));
  }

  const mark = schema.marks.a?.create({ originalAttributes: built.child.attributes });

  if (mark) {
    return schema.nodes.p.create(null, schema.text(text, [mark]));
  }

  return schema.nodes.p.create(null, schema.text(text));
}

export { reconcileTable };
