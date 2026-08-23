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
import { Fragment } from 'prosemirror-model';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { schema } from '../schema/base.js';
import Config from '../../config.js';
import { i18n } from '../../i18n.js';
import { sanitizeInsertAdjacentHTML, htmlEncode } from '../../utils/sanitization.js';
import { Icon } from '../../ui/icons.js';
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
import { reconcileTable, reconcileSelectedTable, contentStatesProperty } from './tableRDFa.js';
import { searchClasses, searchProperties } from '../../vocab.js';
import { LookupServices, getLookupService, identifierColumnCandidates, lookupIdentifier, getIdentifierSearch, looksLikeIdentifier, needsIdentifierPick } from '../../services.js';

export const tableToolsPluginKey = new PluginKey('tableTools');

const instances = new WeakMap();

// Lets a keymap defer to the open suggestion list, which its bindings would otherwise shadow.
export function tableSuggestionKeydown(view, key) {
  const instance = instances.get(view);
  if (!instance?.suggestions) return false;
  return instance.handleSuggestionKey({ key });
}

const DATATYPE_GROUPS = [
  ['Number', [
    ['integer', 'Integer'],
    ['nonNegativeInteger', 'Non-negative integer'],
    ['decimal', 'Decimal'],
    ['double', 'Double']
  ]],
  ['Time', [
    ['date', 'Date'],
    ['dateTime', 'Date and time'],
    ['time', 'Time'],
    ['duration', 'Duration'],
    ['gYear', 'Year']
  ]],
  ['Boolean', [
    ['boolean', 'Boolean']
  ]]
];

// The merged Value select mixes literal datatypes with resource kinds.
function kindOfValue(value) {
  return ['link', 'type', 'image'].includes(value) ? value : 'literal';
}

// Titles match loosely: "Author(s)" should find a service's "Author".
function titleKey(title) {
  return String(title || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').replace(/s$/, '');
}

function datatypeLabel(name, label) {
  return name ? `${label} (xsd:${name})` : label;
}

// Keep in step with .editor-table-row-handle width in dokieli.css.
const HANDLE_WIDTH = 16;

// How far a grip sits outside the table, identical for rows and columns.
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

// A table's subject, derived from the caption or generated when there is none.
function tableSubjectFrom(tableNode) {
  let caption = '';
  tableNode.forEach((child) => {
    if (child.type.name === 'caption') caption = child.textContent.trim();
  });

  return '#' + generateAttributeId(null, caption || 'table');
}

// Mark the identifier column via decorations; direct DOM writes make ProseMirror re-parse.
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
    ? i18n.t('editor.table.cell.search.hint')
    : i18n.t('editor.table.cell.identifier.hint', { identifier: service?.identifier || idColumn });

  const decorations = [];

  forEachRow(table.node, table.pos, (row, rowPos, isHeader) => {
    if (index >= row.childCount) return;

    let cellPos = rowPos + 1;
    for (let i = 0; i < index; i++) cellPos += row.child(i).nodeSize;

    const cell = row.child(index);

    // A tooltip rather than rendered text, which would compete with the editor's placeholder.
    decorations.push(Decoration.node(cellPos, cellPos + cell.nodeSize, isHeader
      ? { class: 'table-identifier-column', title: hint }
      : { title: hint }));
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

// Hint at what follows the CSS-rendered "Table N." in every empty caption.
function captionPlaceholderDecoration(state) {
  const decorations = [];
  const hint = i18n.t('editor.table.caption.placeholder');

  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'table') return true;

    const caption = node.firstChild;
    if (caption?.type.name !== 'caption' || caption.textContent.trim()) return false;

    // An empty caption has no child to hang this on, so it goes on the caption itself.
    const from = pos + 1;
    decorations.push(Decoration.node(from, from + caption.nodeSize, { 'data-placeholder': hint }));

    return false;
  });

  return decorations;
}

function tableDecorations(state, drag, sort) {
  return [
    ...identifierDecorations(state),
    ...activeCellDecoration(state),
    ...captionPlaceholderDecoration(state),
    ...dragDecorations(state, drag),
    ...headerSortDecorations(state, sort)
  ];
}

const SORT_NEXT = { none: 'ascending', ascending: 'descending', descending: 'none' };
const SORT_ICON = { none: '.fas.fa-sort', ascending: '.fas.fa-sort-up', descending: '.fas.fa-sort-down' };

// Sort controls sit in the header row of the table under the caret.
function headerSortDecorations(state, sort) {
  const table = findTable(state);
  if (!table) return [];

  const header = getHeaderRowPos(table.node, table.pos);
  if (!header) return [];

  let bodyRowCount = 0;
  forEachRow(table.node, table.pos, (row, rowPos, isHeader) => { if (!isHeader) bodyRowCount++; });
  if (bodyRowCount < 2) return [];

  const active = sort && sort.pos === table.pos ? sort : null;
  const decorations = [];
  let cellPos = header.pos + 1;

  header.row.forEach((cell, offset, index) => {
    const direction = active && active.columnIndex === index ? active.direction : 'none';

    if (direction !== 'none') {
      decorations.push(Decoration.node(cellPos, cellPos + cell.nodeSize, { 'aria-sort': direction }));
    }

    decorations.push(Decoration.widget(cellPos + cell.nodeSize - 1, sortButton(table.pos, index, direction), {
      key: `table-sort-${index}-${direction}`,
      ignoreSelection: true
    }));

    cellPos += cell.nodeSize;
  });

  return decorations;
}

function sortButton(tablePos, columnIndex, direction) {
  return (view) => {
    const button = document.createElement('button');
    button.className = 'do table-sort';
    button.type = 'button';

    const title = i18n.t(`table.sort.${SORT_NEXT[direction]}`);
    button.setAttribute('title', title);
    button.setAttribute('aria-label', title);
    sanitizeInsertAdjacentHTML(button, 'afterbegin', Icon[SORT_ICON[direction]]);

    button.addEventListener('mousedown', (e) => e.preventDefault());
    button.addEventListener('click', (e) => {
      e.preventDefault();
      instances.get(view)?.cycleColumnSort(tablePos, columnIndex);
    });

    return button;
  };
}

export function tableToolsPlugin() {
  return new Plugin({
    key: tableToolsPluginKey,

    // Lookup status per row, held as decorations; classes written to the DOM get re-rendered away.
    state: {
      init() {
        return { status: DecorationSet.empty, drag: null, sort: null };
      },

      apply(tr, value) {
        let status = value.status.map(tr.mapping, tr.doc);
        let drag = value.drag;
        let sort = value.sort;

        const action = tr.getMeta(tableToolsPluginKey);

        if (action && 'sort' in action) {
          sort = action.sort;
        } else if (sort && tr.docChanged) {
          // Attribute reconciliation keeps the sort; any authored change drops it.
          sort = tr.getMeta('addToHistory') === false
            ? { ...sort, pos: tr.mapping.map(sort.pos) }
            : null;
        }

        if (!action) return { status, drag, sort };

        if (action.clearStatus !== undefined) {
          // The row's span, so the spinner widget inside it is removed too.
          const row = tr.doc.nodeAt(action.clearStatus);
          status = status.remove(status.find(action.clearStatus, action.clearStatus + (row?.nodeSize ?? 1)));
        }

        if (action.status && action.pos !== undefined) {
          const row = tr.doc.nodeAt(action.pos);
          if (row) {
            const added = [Decoration.node(action.pos, action.pos + row.nodeSize, { class: action.status })];

            // The UI's shared spinner, inside the row's first cell.
            if (action.status === 'table-lookup-pending') {
              added.push(Decoration.widget(action.pos + 2, lookupSpinner, { key: 'table-lookup-progress' }));
            }

            status = status.add(tr.doc, added);
          }
        }

        if ('drag' in action) drag = action.drag;

        return { status, drag, sort };
      }
    },

    appendTransaction(transactions, oldState, newState) {
      return reconcileSelectedTable(transactions, oldState, newState);
    },

    props: {
      decorations(state) {
        const { status, drag, sort } = tableToolsPluginKey.getState(state) ?? {};
        const set = status ?? DecorationSet.empty;
        return set.add(state.doc, tableDecorations(state, drag, sort));
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

        // A table swallows Enter and Tab, so offer a way out without the mouse.
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

    // No sorted column, nothing to restore to.
    if (!tableToolsPluginKey.getState(view.state)?.sort) this.sortMemory = null;

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

  // The row grip is hover-driven, so it outlives the toolbar being hidden.
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
      <div class="editor-table-tools-group" role="group" aria-label="${htmlEncode(i18n.t('editor.table.toolbar.row.aria-label'))}">
        ${button('row-before', i18n.t('editor.table.row-before'), '↑+')}
        ${button('row-after', i18n.t('editor.table.row-after'), '↓+')}
        ${button('row-delete', i18n.t('editor.table.row-delete'), '↕−')}
        ${button('row-up', i18n.t('editor.table.row-up'), '⇡')}
        ${button('row-down', i18n.t('editor.table.row-down'), '⇣')}
      </div>
      <div class="editor-table-tools-group" role="group" aria-label="${htmlEncode(i18n.t('editor.table.toolbar.column.aria-label'))}">
        ${button('column-before', i18n.t('editor.table.column-before'), '←+')}
        ${button('column-after', i18n.t('editor.table.column-after'), '→+')}
        ${button('column-delete', i18n.t('editor.table.column-delete'), '↔−')}
        ${button('column-left', i18n.t('editor.table.column-left'), '⇠')}
        ${button('column-right', i18n.t('editor.table.column-right'), '⇢')}
        ${button('column-settings', i18n.t('editor.table.column-settings'), i18n.t('editor.table.column-settings.label'))}
      </div>
      <div class="editor-table-tools-group" role="group" aria-label="${htmlEncode(i18n.t('editor.table.toolbar.table.aria-label'))}">
        ${button('table-settings', i18n.t('editor.table.table-settings'), i18n.t('editor.table.table-settings.label'))}
        ${button('table-delete', i18n.t('editor.table.delete'), '✕')}
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

  // Pointer-driven reordering; HTML5 drag-and-drop is unreliable inside contenteditable.
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

    // While a column drag is pending, the browser's native text drag is not what was meant.
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
    // The header row defines the drop slots, so use it rather than the first row.
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
    handle.title = i18n.t('editor.table.column-drag');

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

    // Above the header cell, not the table: the caption can push the table's top edge well clear.
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

  // The grip lives in <body>, needs its own mousedown, and must survive the gap to the row.
  createRowHandle() {
    const handle = document.createElement('div');
    handle.className = 'editor-table-row-handle';
    handle.setAttribute('contenteditable', 'false');
    handle.title = i18n.t('editor.table.row-drag');

    handle.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();

      // Table commands resolve their table from the selection, so put the caret in this row first.
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

    // Keep the grip alive while the pointer is on or near it; reaching it means leaving the row.
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
          <legend>${htmlEncode(i18n.t('editor.table.column.legend'))}</legend>

          <label for="table-column-title">${htmlEncode(i18n.t('editor.table.column.title.label'))}</label>
          <input class="editor-form-input" dir="auto" id="table-column-title" name="table-column-title" type="text" value="${htmlEncode(getColumnTitle(column, ''))}" />

          <div class="autocomplete">
            <label for="table-column-property">${htmlEncode(i18n.t('editor.table.column.property.label'))}</label>
            <input autocomplete="off" class="editor-form-input" dir="ltr" id="table-column-property" name="table-column-property" placeholder="schema:name" type="text" value="${htmlEncode(column.propertyUrl || '')}" />
          </div>

          <label for="table-column-value">${htmlEncode(i18n.t('editor.table.column.kind.label'))}</label>
          <select class="editor-form-select" id="table-column-value" name="table-column-value">
            <option value=""${kind === 'literal' && matchesDatatype(column.datatype, '') ? ' selected=""' : ''}>${htmlEncode(i18n.t('editor.table.column.kind.literal'))}</option>
            ${DATATYPE_GROUPS.map(([group, entries]) => `<optgroup label="${htmlEncode(group)}">${entries.map(([d, label]) => `<option value="${d}"${kind === 'literal' && matchesDatatype(column.datatype, d) ? ' selected=""' : ''}>${htmlEncode(datatypeLabel(d, label))}</option>`).join('')}</optgroup>`).join('')}
            <optgroup label="Resource">
              <option value="link"${kind === 'link' ? ' selected=""' : ''}>${htmlEncode(i18n.t('editor.table.column.kind.link'))}</option>
              <option value="type"${kind === 'type' ? ' selected=""' : ''}>${htmlEncode(i18n.t('editor.table.column.kind.type'))}</option>
              <option value="image"${kind === 'image' ? ' selected=""' : ''}>${htmlEncode(i18n.t('editor.table.column.kind.image'))}</option>
            </optgroup>
          </select>

          <div data-when-kind="link type image">
            <label for="table-column-value-url">${htmlEncode(i18n.t('editor.table.column.value-url.label'))}</label>
            <input class="editor-form-input" dir="ltr" id="table-column-value-url" name="table-column-value-url" placeholder="{${htmlEncode(column.name || 'value')}}" type="text" value="${htmlEncode(column.valueUrl || '')}" />
          </div>

          ${isIdentifier ? `<p class="info">${htmlEncode(i18n.t('editor.table.column.identifier.info'))}</p>` : ''}

          <details class="editor-table-advanced"${column.aboutUrl || column.lookup?.source || column.lookup?.service ? ' open=""' : ''}>
            <summary>${htmlEncode(i18n.t('editor.table.advanced.summary'))}</summary>

            <label for="table-column-about-url">${htmlEncode(i18n.t('editor.table.column.about-url.label'))}</label>
            <input class="editor-form-input" dir="ltr" id="table-column-about-url" name="table-column-about-url" placeholder="${htmlEncode(i18n.t('editor.table.column.about-url.placeholder'))}" type="text" value="${htmlEncode(column.aboutUrl || '')}" />

            ${isJSONLookup ? `
              <label for="table-column-source">${htmlEncode(i18n.t('editor.table.column.source.label'))}</label>
              <input class="editor-form-input" dir="ltr" id="table-column-source" name="table-column-source" placeholder="authors.*.name" type="text" value="${htmlEncode(column.lookup?.source || '')}" />
            ` : ''}

            ${isIdentifier ? '' : `
              <label for="table-column-service">${htmlEncode(i18n.t('editor.table.column.service.label'))}</label>
              <select class="editor-form-select" id="table-column-service" name="table-column-service">
                <option value="">${htmlEncode(i18n.t('editor.table.lookup.service.none'))}</option>
                ${Object.entries(LookupServices).filter(([, service]) => service.search).map(([name, service]) =>
                  `<option value="${name}"${column.lookup?.service === name ? ' selected=""' : ''}>${htmlEncode(service.label)}</option>`).join('')}
              </select>
              <p class="info">${htmlEncode(i18n.t('editor.table.column.service.info'))}</p>
            `}
          </details>

          <div class="editor-form-actions-row">
            <button class="editor-form-submit" type="submit">${htmlEncode(i18n.t('editor.table.apply'))}</button>
            <button class="editor-form-cancel" type="button">${htmlEncode(i18n.t('editor.toolbar.form.cancel.button.textContent'))}</button>
          </div>
        </fieldset>
      </form>
    `);

    const valueSelect = panel.querySelector('[name="table-column-value"]');
    const syncKind = () => {
      panel.querySelectorAll('[data-when-kind]').forEach((el) => {
        el.hidden = !el.dataset.whenKind.split(' ').includes(kindOfValue(valueSelect.value));
      });
    };
    valueSelect.addEventListener('change', syncKind);
    syncKind();

    this.attachPropertyAutocomplete(panel.querySelector('[name="table-column-property"]'));

    panel.querySelector('.editor-form-cancel').addEventListener('click', () => {
      this.closePanel();
      this.editorView.focus();
    });

    panel.addEventListener('submit', (e) => {
      e.preventDefault();
      this.applyColumnSettings(panel, index);
    });
  }

  applyColumnSettings(panel, index) {
    const table = findTable(this.editorView.state);
    if (!table) return;

    const read = (name) => panel.querySelector(`[name="${name}"]`)?.value?.trim() || '';
    const columns = getColumns(table.node);
    const existing = columns[index] || {};

    const value = read('table-column-value');
    const kind = kindOfValue(value);
    const title = read('table-column-title');

    const column = {
      name: existing.name || toColumnName(title, index, columns.map((c) => c.name)),
      titles: title || undefined,
      propertyUrl: kind === 'type' ? 'rdf:type' : read('table-column-property') || undefined,
      aboutUrl: read('table-column-about-url') || undefined,
      datatype: kind === 'literal' ? value || undefined : undefined,
      image: kind === 'image' || undefined,
      valueUrl: kind === 'literal' ? undefined : read('table-column-value-url') || undefined,
      // Not asked in the form; carried so applying settings does not shed them.
      time: existing.time,
      valueRel: existing.valueRel,
      lang: existing.lang,
      null: existing.null,
      virtual: existing.virtual,
      suppressOutput: existing.suppressOutput
    };

    // A field the panel did not render keeps what the column already had.
    const sourceField = panel.querySelector('[name="table-column-source"]');
    const source = sourceField ? sourceField.value.trim() : existing.lookup?.source;
    const serviceField = panel.querySelector('[name="table-column-service"]');
    const columnService = serviceField ? serviceField.value.trim() : existing.lookup?.service;
    const urlSource = existing.lookup?.urlSource;

    if (source || columnService || urlSource) {
      column.lookup = {
        ...(source ? { source } : {}),
        ...(urlSource ? { urlSource } : {}),
        ...(columnService ? { service: columnService } : {})
      };
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

    // The identifier binding in Table settings follows a renamed column.
    const tableSchema = getTableSchema(table.node.attrs.originalAttributes);
    if (existing.name && tableSchema.lookup?.idColumn === existing.name && column.name !== existing.name) {
      tableSchema.lookup = { ...tableSchema.lookup, idColumn: column.name };
      setTableAttributes(tr, table.node, table.pos, tableSchema);
    }

    this.editorView.dispatch(tr);

    ensureDocumentPrefixes(getPrefixesUsed(null, [column]));

    this.rewriteColumnCells(index);

    this.closePanel();
    this.editorView.focus();
  }

  // Give plain cells the structure their configuration calls for; cells already stating RDFa stay.
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
      if (!text || contentStatesProperty(cell)) return;

      const built = buildCellRDFa(column, text, {
        rowSubject: computeRowSubject(tableSchema, fillValues, null),
        fillValues,
        foreignKeys: []
      });

      // Attributes alone are reconciliation's job; only structure warrants a rewrite.
      if (!built.child && !built.children) return;

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
          <legend>${htmlEncode(i18n.t('editor.table.settings.legend'))}</legend>

          <div class="autocomplete">
            <label for="table-typeof">${htmlEncode(i18n.t('editor.table.typeof.label'))}</label>
            <input autocomplete="off" class="editor-form-input" dir="ltr" id="table-typeof" list="table-typeof-options" name="table-typeof" placeholder="schema:Thing" type="text" value="${htmlEncode(tableSchema.typeof || '')}" />
            <datalist id="table-typeof-options">${COMMON_TYPES.map((c) => `<option value="${c}"></option>`).join('')}</datalist>
          </div>

          <label for="table-lookup-service">${htmlEncode(i18n.t('editor.table.lookup.service.label'))}</label>
          <select class="editor-form-select" id="table-lookup-service" name="table-lookup-service"${lookup.service ? ' disabled=""' : ''}>
            <option value="">${htmlEncode(i18n.t('editor.table.lookup.service.none'))}</option>
            ${Object.entries(LookupServices).map(([name, s]) =>
              `<option value="${name}"${lookup.service === name ? ' selected=""' : ''}>${htmlEncode(s.label)}</option>`).join('')}
          </select>

          ${lookup.service ? `
            <p class="info">${htmlEncode(i18n.t('editor.table.lookup.service.locked'))}</p>
            <button class="editor-form-secondary" name="change-service" type="button">${htmlEncode(i18n.t('editor.table.lookup.service.change'))}</button>
          ` : ''}

          <div data-when-source="on">
            <label for="table-lookup-id-column">${htmlEncode(i18n.t('editor.table.lookup.id-column.label'))}</label>
            <select class="editor-form-select" id="table-lookup-id-column" name="table-lookup-id-column">
              <option value="">—</option>
              ${identifierColumnCandidates(lookup, columns).map((c) =>
                `<option value="${htmlEncode(c.name)}"${lookup.idColumn === c.name ? ' selected=""' : ''}>${htmlEncode(getColumnTitle(c, c.name))}</option>`).join('')}
            </select>
            <p class="info">${htmlEncode(
              getLookupService(lookup.service)?.identifier
                ? i18n.t('editor.table.lookup.id-column.info-identifier', { identifier: getLookupService(lookup.service).identifier })
                : i18n.t('editor.table.lookup.id-column.info'))}</p>
          </div>

          <div data-when-custom="">
            <label for="table-lookup-url">${htmlEncode(i18n.t('editor.table.lookup.url.label'))}</label>
            <input class="editor-form-input" dir="ltr" id="table-lookup-url" name="table-lookup-url" placeholder="https://example.org/item/{id}.json" type="text" value="${htmlEncode(lookup.url || '')}" />

            <label for="table-lookup-format">${htmlEncode(i18n.t('editor.table.lookup.format.label'))}</label>
            <select class="editor-form-select" id="table-lookup-format" name="table-lookup-format">
              <option value="json"${format === 'json' ? ' selected=""' : ''}>${htmlEncode(i18n.t('editor.table.lookup.format.record'))}</option>
              <option value="rdf"${format === 'rdf' ? ' selected=""' : ''}>${htmlEncode(i18n.t('editor.table.lookup.format.linked-data'))}</option>
            </select>

            <div data-when-format="json">
              <label for="table-lookup-record">${htmlEncode(i18n.t('editor.table.lookup.record.label'))}</label>
              <input class="editor-form-input" dir="ltr" id="table-lookup-record" name="table-lookup-record" placeholder="ISBN:{id}" type="text" value="${htmlEncode(lookup.record || '')}" />
            </div>

            <div data-when-format="rdf">
              <label for="table-lookup-subject">${htmlEncode(i18n.t('editor.table.lookup.subject.label'))}</label>
              <input class="editor-form-input" dir="ltr" id="table-lookup-subject" name="table-lookup-subject" placeholder="https://example.org/item/{id}" type="text" value="${htmlEncode(lookup.subject || '')}" />
              <p class="info">${htmlEncode(i18n.t('editor.table.lookup.rdf.info'))}</p>
            </div>
          </div>

          <details class="editor-table-advanced"${tableSchema.propertyUrl || tableSchema.aboutUrl ? ' open=""' : ''}>
            <summary>${htmlEncode(i18n.t('editor.table.advanced.summary'))}</summary>

            <div class="autocomplete">
              <label for="table-property">${htmlEncode(i18n.t('editor.table.property.label'))}</label>
              <input autocomplete="off" class="editor-form-input" dir="ltr" id="table-property" name="table-property" placeholder="schema:hasPart" type="text" value="${htmlEncode(tableSchema.propertyUrl || '')}" />
            </div>

            <label for="table-about-url">${htmlEncode(i18n.t('editor.table.about-url.label'))}</label>
            <input class="editor-form-input" dir="ltr" id="table-about-url" name="table-about-url" placeholder="#row/{_row}" type="text" value="${htmlEncode(tableSchema.aboutUrl || '')}" />
          </details>

          <div class="editor-form-actions-row">
            <button class="editor-form-submit" type="submit">${htmlEncode(i18n.t('editor.table.apply'))}</button>
            <button class="editor-form-cancel" type="button">${htmlEncode(i18n.t('editor.toolbar.form.cancel.button.textContent'))}</button>
          </div>
        </fieldset>
      </form>
    `);

    const formatSelect = panel.querySelector('[name="table-lookup-format"]');
    const syncFormat = () => {
      panel.querySelectorAll('[data-when-format]').forEach((el) => {
        el.hidden = el.dataset.whenFormat !== formatSelect.value;
      });
    };
    formatSelect.addEventListener('change', syncFormat);
    syncFormat();

    // Choosing a preset fills the request fields and offers its suggested columns.
    panel.querySelector('[name="table-lookup-service"]').addEventListener('change', (e) => {
      const service = getLookupService(e.target.value);
      if (!service) return;

      panel.querySelector('[name="table-lookup-url"]').value = service.url || '';
      panel.querySelector('[name="table-lookup-format"]').value = service.format || 'json';
      panel.querySelector('[name="table-lookup-record"]').value = service.record || '';
      panel.querySelector('[name="table-lookup-subject"]').value = service.subject || '';

      // The service's suggested row semantics fill in only where nothing is authored.
      const schemaFields = { typeof: 'table-typeof', propertyUrl: 'table-property', aboutUrl: 'table-about-url' };
      Object.entries(service.tableSchema || {}).forEach(([key, value]) => {
        const field = panel.querySelector(`[name="${schemaFields[key]}"]`);
        if (field && !field.value.trim()) field.value = value;
      });

      syncFormat();

      const applyColumns = panel.querySelector('[name="apply-service-columns"]');
      if (applyColumns) applyColumns.hidden = !service.columns?.length;

      panel.querySelectorAll('[data-when-source]').forEach((el) => { el.hidden = false; });
    });

    // Swapping the source is a deliberate act that takes the data with it.
    panel.querySelector('[name="change-service"]')?.addEventListener('click', () => {
      const confirmed = window.confirm(
        i18n.t('editor.table.lookup.service.confirm'));
      if (!confirmed) return;

      panel.querySelector('[name="table-lookup-service"]').disabled = false;
      panel.dataset.clearOnApply = 'true';
      panel.querySelector('[name="table-lookup-service"]').focus();
    });

    const serviceSelect = panel.querySelector('[name="table-lookup-service"]');
    const syncSource = () => {
      const on = !!(serviceSelect.value || panel.querySelector('[name="table-lookup-url"]')?.value.trim());
      panel.querySelectorAll('[data-when-source]').forEach((el) => { el.hidden = !on; });
    };
    // Endpoint plumbing is only the author's business for a custom source.
    const syncCustom = () => {
      const custom = serviceSelect.value === 'custom'
        || (!serviceSelect.value && !!panel.querySelector('[name="table-lookup-url"]')?.value.trim());
      panel.querySelectorAll('[data-when-custom]').forEach((el) => { el.hidden = !custom; });
    };
    serviceSelect.addEventListener('change', () => { syncSource(); syncCustom(); });
    panel.querySelector('[name="table-lookup-url"]')?.addEventListener('input', () => { syncSource(); syncCustom(); });
    syncSource();
    syncCustom();

    this.attachPropertyAutocomplete(panel.querySelector('[name="table-property"]'));
    this.attachPropertyAutocomplete(panel.querySelector('[name="table-typeof"]'), { termType: 'class' });

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

    const propertyUrl = read('table-property') || undefined;

    const tableSchema = {
      // Not authored: the caption names the table, so derive the subject from it.
      subject: existing.subject || tableSubjectFrom(table.node),
      propertyUrl,
      aboutUrl: read('table-about-url') || undefined,
      typeof: read('table-typeof') || undefined
    };

    // Rows belong to the table; without a stated relationship, say so generically.
    if (!tableSchema.propertyUrl && tableSchema.subject) tableSchema.propertyUrl = DEFAULT_ROW_PROPERTY;

    const service = read('table-lookup-service');
    const url = read('table-lookup-url');

    if (service || url) {
      tableSchema.lookup = {
        service: service || undefined,
        idColumn: read('table-lookup-id-column') || undefined,
        url: url || undefined,
        format: read('table-lookup-format') || undefined,
        record: read('table-lookup-record') || undefined,
        subject: read('table-lookup-subject') || undefined
      };
    }

    // A changed binding is the statement "resolve these rows against this source".
    const bindingChanged = !!(tableSchema.lookup?.url && tableSchema.lookup.idColumn) && (
      tableSchema.lookup.service !== existing.lookup?.service
      || tableSchema.lookup.url !== existing.lookup?.url
      || tableSchema.lookup.idColumn !== existing.lookup?.idColumn
    );

    const tr = this.editorView.state.tr;

    // A newly wired source maps matching columns, so lookups have somewhere to land.
    if (tableSchema.lookup?.service && tableSchema.lookup.service !== existing.lookup?.service) {
      this.adoptServiceColumns(tr, table, tableSchema);
    }

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

    if (bindingChanged) this.lookupAllRows(table.pos);

    this.closePanel();
    this.editorView.focus();
  }

  // Unmapped columns whose titles match adopt the service's configuration; mapped columns stay.
  adoptServiceColumns(tr, table, tableSchema) {
    const service = getLookupService(tableSchema.lookup?.service);
    if (!service?.columns?.length) return;

    const columns = getColumns(table.node);
    const renames = {};

    columns.forEach((column, index) => {
      if (isColumnMapped(column) || column.lookup) return;

      const match = service.columns.find((candidate) =>
        titleKey(getColumnTitle(candidate, candidate.name)) === titleKey(getColumnTitle(column, column.name)));
      if (!match) return;

      const { identifier, ...adopted } = match;
      const name = adopted.name || column.name;
      if (column.name && name !== column.name) renames[column.name] = name;

      setColumnAttributes(tr, table.node, table.pos, index, {
        ...adopted,
        name,
        // The author's own header text stays.
        titles: column.titles || adopted.titles
      });
    });

    // The identifier binding follows a renamed column, as does the row subject.
    const idColumn = tableSchema.lookup.idColumn;
    if (idColumn && renames[idColumn]) tableSchema.lookup.idColumn = renames[idColumn];
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
          `<span class="term-curie"${term.iri ? ` title="${htmlEncode(term.iri)}"` : ''}>${htmlEncode(term.curie)}</span>` +
          `<span class="term-label">${htmlEncode(term.label || '')}</span>` +
          (term.description ? `<span class="term-description">${htmlEncode(term.description)}</span>` : '')
        );

        li.addEventListener('mousedown', (e) => {
          e.preventDefault();
          input.value = term.curie;

          // A suggested datatype is a good default, never an override.
          const datatype = input.closest('form')?.querySelector('[name="table-column-value"]');
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
      // Enter only ever picks a highlighted suggestion; it never submits the form.
      if (e.key === 'Enter') {
        e.preventDefault();
        const chosen = list && [...list.children].find((li) => li.classList.contains('active'));
        if (chosen) chosen.dispatchEvent(new MouseEvent('mousedown'));
        return;
      }

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

  // Offer real choices for an ambiguous identifier; picking one skips the resolver.
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

    // The identifier column resolves the whole row; another column's service only feeds its own cells.
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
    // Replace the list without forgetting the query, or every selection change re-fires the search.
    this.suggestions?.remove();
    this.suggestions = null;
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

      if (result.uri || result.id) li.setAttribute('title', result.uri || result.id);

      sanitizeInsertAdjacentHTML(li, 'afterbegin',
        `<span class="term-label">${htmlEncode(result.label)}</span>` +
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

  // Write the chosen label into the cell; only the identifier column also fills the row.
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

  // Leaving a changed identifier cell is the commit signal that fires the lookup.
  maybeAutofill(view, prevState) {
    const previous = this.watchedCell;
    const cell = findCell(view.state);
    const table = findTable(view.state);

    const current = cell && table
      ? { rowPos: cell.rowPos, columnIndex: cell.columnIndex, value: cell.node.textContent.trim(), tablePos: table.pos }
      : null;

    const sameCell = !!(current && previous
      && current.rowPos === previous.rowPos && current.columnIndex === previous.columnIndex);

    // The value the caret found when it entered the cell, kept while it stays.
    if (current) current.entryValue = sameCell ? previous.entryValue : current.value;

    this.watchedCell = current;

    if (!previous || sameCell) return;
    if (!previous.value) return;

    // Only a visit that changed the value asks the source again.
    if (previous.value === previous.entryValue) return;

    const previousTable = view.state.doc.nodeAt(previous.tablePos);
    if (!previousTable || previousTable.type.name !== 'table') return;

    const tableSchema = getTableSchema(previousTable.attrs.originalAttributes);
    if (!tableSchema.lookup?.url || !tableSchema.lookup.idColumn) return;

    const columns = getColumns(previousTable);
    if (columns[previous.columnIndex]?.name !== tableSchema.lookup.idColumn) return;

    // A search term is ambiguous; the suggestion list decides, not the top hit.
    if (needsIdentifierPick(tableSchema.lookup, previous.value)) return;

    // Nothing this service can answer; asking would just report a failure-looking empty result.
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

      await this.measureImageValues(columns, result.values);

      this.setRowStatus(rowPos, null);
      this.fillRow(tablePos, rowPos, result.values);
    } catch (e) {
      console.warn(`Lookup failed for ${identifier}:`, e?.message || e);
      this.setRowStatus(rowPos, 'table-lookup-error', 3000);
    }
  }

  // Flag a row while its lookup runs; clearAfter schedules the flag's removal.
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

  // Resolve every row against a newly bound source, sequentially so positions stay fresh.
  async lookupAllRows(tablePos) {
    const table = this.editorView.state.doc.nodeAt(tablePos);
    if (!table || table.type.name !== 'table') return;

    const tableSchema = getTableSchema(table.attrs.originalAttributes);
    const idColumn = tableSchema.lookup?.idColumn;
    if (!tableSchema.lookup?.url || !idColumn) return;

    const columns = getColumns(table);
    const index = columns.findIndex((c) => c.name === idColumn);
    if (index < 0) return;

    const candidates = [];
    let ordinal = -1;

    forEachRow(table, tablePos, (row, rowPos, isHeader) => {
      if (isHeader) return;
      ordinal++;
      if (index >= row.childCount) return;

      const identifier = row.child(index).textContent.trim();
      if (!identifier || needsIdentifierPick(tableSchema.lookup, identifier)) return;

      let hasFedContent = false;
      row.forEach((cell, offset, i) => {
        const column = columns[i];
        if (i === index || !column || !(column.lookup?.source || isColumnMapped(column))) return;
        if (cell.textContent.trim()) hasFedContent = true;
      });

      candidates.push({
        ordinal,
        identifier,
        valid: looksLikeIdentifier(tableSchema.lookup, identifier),
        hasFedContent
      });
    });

    if (!candidates.length) return;

    // Filling empty cells needs no blessing; replacing typed values does.
    if (candidates.some((c) => c.valid && c.hasFedContent)) {
      const total = candidates.filter((c) => c.valid).length;
      if (!window.confirm(i18n.t('editor.table.lookup.fill-all.confirm', { total }))) return;
    }

    for (const { ordinal: at, identifier, valid } of candidates) {
      const rowPos = this.rowPosAt(tablePos, at);
      if (rowPos === null) continue;

      if (!valid) {
        this.setRowStatus(rowPos, 'table-lookup-mismatch', 2500);
        continue;
      }

      await this.runLookup(tablePos, rowPos, identifier);
    }
  }

  /** A row's position by its body ordinal, fresh from the current document. */
  rowPosAt(tablePos, ordinal) {
    const table = this.editorView.state.doc.nodeAt(tablePos);
    if (!table || table.type.name !== 'table') return null;

    let pos = null;
    let i = -1;

    forEachRow(table, tablePos, (row, rowPos, isHeader) => {
      if (isHeader) return;
      i++;
      if (i === ordinal) pos = rowPos;
    });

    return pos;
  }

  // Ascending, descending, then back to the order the first sort found.
  cycleColumnSort(tablePos, columnIndex) {
    const view = this.editorView;
    const table = view.state.doc.nodeAt(tablePos);
    if (!table || table.type.name !== 'table') return;

    const current = tableToolsPluginKey.getState(view.state)?.sort;
    const active = current && current.pos === tablePos && current.columnIndex === columnIndex;
    const direction = SORT_NEXT[active ? current.direction : 'none'];

    // First sort of an unsorted table captures the order the third state restores.
    if (!current || current.pos !== tablePos) {
      this.sortMemory = { pos: tablePos, tbodies: captureRowOrder(table) };
    }

    const memory = this.sortMemory?.pos === tablePos ? this.sortMemory : null;
    if (direction === 'none' && !memory) return;

    const tbodies = [];
    let offset = tablePos + 1;
    table.forEach((child) => {
      if (child.type.name === 'tbody') tbodies.push({ node: child, pos: offset, index: tbodies.length });
      offset += child.nodeSize;
    });

    const tr = view.state.tr;

    [...tbodies].reverse().forEach(({ node, pos, index }) => {
      const rows = [];
      node.forEach((row) => rows.push(row));

      const base = memory?.tbodies[index]?.length === rows.length ? memory.tbodies[index] : rows;
      const ordered = direction === 'none' ? base : sortTableRows(base, columnIndex, direction);
      if (ordered.length !== rows.length) return;

      tr.replaceWith(pos + 1, pos + node.nodeSize - 1, Fragment.from(ordered));
    });

    tr.setMeta(tableToolsPluginKey, {
      sort: direction === 'none' ? null : { pos: tablePos, columnIndex, direction }
    });

    view.dispatch(tr);
  }

  /** Known dimensions let an image occupy its space before it loads. */
  async measureImageValues(columns, values) {
    await Promise.all(columns
      .filter((column) => column.image && values[column.name]?.text)
      .map(async (column) => {
        const size = await loadImageSize(values[column.name].text);
        if (size) Object.assign(values[column.name], size);
      }));
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

    // A lookup describes one entity: it replaces everything it feeds, the rest stays as typed.
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
        {
          rowSubject,
          fillValues,
          foreignKeys: [],
          textValues: value.values,
          imageSize: value.width && value.height ? { width: value.width, height: value.height } : undefined
        }
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

// A datatype may be a bare CSVW name, a CURIE or CSVW's object form; options are bare names.
function matchesDatatype(datatype, option) {
  const name = typeof datatype === 'object' ? datatype?.base ?? datatype?.['@id'] : datatype;
  if (!name) return option === '';
  return String(name).replace(/^xsd:/, '') === option;
}

function findTableAt(state, pos) {
  const node = state.doc.nodeAt(pos);
  return node?.type.name === 'table' ? node : null;
}

function captureRowOrder(table) {
  const tbodies = [];
  table.forEach((child) => {
    if (child.type.name !== 'tbody') return;
    const rows = [];
    child.forEach((row) => rows.push(row));
    tbodies.push(rows);
  });
  return tbodies;
}

// Numeric-aware, so ratings and ranks order as numbers; ties keep the base order.
const sortCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function sortTableRows(rows, columnIndex, direction) {
  const dir = direction === 'ascending' ? 1 : -1;
  const text = (row) => columnIndex < row.childCount ? row.child(columnIndex).textContent.trim() : '';
  return [...rows].sort((a, b) => dir * sortCollator.compare(text(a), text(b)));
}

function lookupSpinner() {
  const span = document.createElement('span');
  span.className = 'progress';
  sanitizeInsertAdjacentHTML(span, 'afterbegin', Icon['.fas.fa-circle-notch.fa-spin.fa-fw']);
  return span;
}

// Dimensions are a nicety: resolve null on error or delay rather than fail.
function loadImageSize(src, timeout = 2500) {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(null), timeout);

    img.onload = () => {
      clearTimeout(timer);
      resolve(img.naturalWidth ? { width: img.naturalWidth, height: img.naturalHeight } : null);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

// Cell content for a built RDFa description; a multi-valued cell gets one element per value.
function buildCellContent(built) {
  const text = built.text || '';

  if (built.children) {
    const inline = [];
    built.children.forEach((child, i) => {
      if (i) inline.push(schema.text(', '));
      inline.push(inlineCellContent(child));
    });
    return schema.nodes.p.create(null, inline);
  }

  if (!built.child) {
    return schema.nodes.p.create(null, text ? schema.text(text) : null);
  }

  if (built.child.tag === 'img') {
    return schema.nodes.p.create(null, schema.nodes.img.create({ originalAttributes: built.child.attributes }));
  }

  return schema.nodes.p.create(null, inlineCellContent({ ...built.child, text: built.child.text || text }));
}

// An inline element node (span, time) when the schema has one; a mark (a) otherwise.
function inlineCellContent({ tag, attributes, text }) {
  const node = schema.nodes[tag];
  if (node) return node.create({ originalAttributes: attributes }, text ? schema.text(text) : null);

  const mark = schema.marks[tag]?.create({ originalAttributes: attributes });
  return schema.text(text, mark ? [mark] : undefined);
}

export { reconcileTable };
