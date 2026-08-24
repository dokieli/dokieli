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

import { i18n } from './i18n.js';
import { Icon } from './ui/icons.js';
import { sanitizeInsertAdjacentHTML } from './utils/sanitization.js';
import { threatValueRank } from './threatModel.js';

const NEXT = { none: 'ascending', ascending: 'descending', descending: 'none' };

// Numeric-aware, so "2823" sorts after "92" and mixed text still compares sanely.
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

// Original row order per tbody, so the third state can restore it.
const originalRows = new WeakMap();

export function initTableSort(root = document) {
  root.querySelectorAll('table').forEach((table) => {
    if (table.closest('.do, .ProseMirror, [contenteditable="true"]')) return;

    const headerRow = getHeaderRow(table);
    if (!headerRow || !table.tBodies.length) return;

    // Spanning header cells break the cell-index to column mapping.
    if ([...headerRow.cells].some((cell) => cell.colSpan > 1 || cell.rowSpan > 1)) return;

    const bodyRowCount = [...table.tBodies].reduce((n, tbody) => n + tbody.rows.length, 0);
    if (bodyRowCount < 2) return;

    [...headerRow.cells].forEach((th, index) => {
      if (th.querySelector('button.table-sort')) return;

      const button = document.createElement('button');
      button.className = 'do table-sort';
      button.type = 'button';
      button.addEventListener('click', () => cycleSort(table, headerRow, th, index));
      th.appendChild(button);
    });

    updateSortTitles(headerRow);
  });
}

// Only a thead can carry the mechanism; what it sorts is only ever the tbody rows.
function getHeaderRow(table) {
  const row = table.tHead?.rows[0];
  return row && [...row.cells].every((cell) => cell.tagName === 'TH') ? row : null;
}

function cycleSort(table, headerRow, th, index) {
  const state = NEXT[th.getAttribute('aria-sort') || 'none'];

  // One sorted column at a time.
  [...headerRow.cells].forEach((cell) => cell.removeAttribute('aria-sort'));
  if (state !== 'none') th.setAttribute('aria-sort', state);

  [...table.tBodies].forEach((tbody) => {
    if (!originalRows.has(tbody)) originalRows.set(tbody, [...tbody.rows]);

    const base = originalRows.get(tbody);
    const rows = state === 'none' ? base : sortRows(base, index, state);
    rows.forEach((row) => tbody.appendChild(row));
  });

  updateSortTitles(headerRow);
}

// A vocabulary cell sorts by its value's rank in the vocabulary, not alphabetically.
function cellRank(cell) {
  const a = cell?.querySelector('a[rel]');
  if (!a) return null;

  const rank = threatValueRank(a.getAttribute('rel'), a.getAttribute('href'));
  return rank >= 0 ? rank : null;
}

function rowIsEmpty(row) {
  return ![...row.cells].some((cell) => cell.textContent.trim() || cell.querySelector('img'));
}

// Sorted from the original order, so equal values keep their document order.
function sortRows(base, index, state) {
  const direction = state === 'ascending' ? 1 : -1;

  return [...base].sort((a, b) => {
    // Rows without data sink to the bottom, whatever the direction.
    const emptyA = rowIsEmpty(a);
    const emptyB = rowIsEmpty(b);
    if (emptyA !== emptyB) return emptyA ? 1 : -1;

    const rankA = cellRank(a.cells[index]);
    const rankB = cellRank(b.cells[index]);

    if (rankA !== null || rankB !== null) {
      return direction * ((rankA ?? Number.MAX_SAFE_INTEGER) - (rankB ?? Number.MAX_SAFE_INTEGER));
    }

    return direction * collator.compare(a.cells[index]?.textContent.trim() ?? '', b.cells[index]?.textContent.trim() ?? '');
  });
}

const STATE_ICON = { none: '.fas.fa-sort', ascending: '.fas.fa-sort-up', descending: '.fas.fa-sort-down' };

// The icon shows the current state; the title announces what the next click does.
function updateSortTitles(headerRow) {
  [...headerRow.cells].forEach((cell) => {
    const button = cell.querySelector('button.table-sort');
    if (!button) return;

    const state = cell.getAttribute('aria-sort') || 'none';
    const title = i18n.t(`table.sort.${NEXT[state]}.title`);
    button.setAttribute('title', title);
    button.setAttribute('aria-label', title);
    button.replaceChildren();
    sanitizeInsertAdjacentHTML(button, 'afterbegin', Icon[STATE_ICON[state]]);
  });
}
