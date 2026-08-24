import { describe, it, expect, beforeEach } from 'vitest';
import { initTableSort } from '../../src/tableSort.js';

describe('tableSort', () => {
  let table;

  const rowNames = () => [...table.querySelectorAll('tbody tr')].map((tr) => tr.cells[0].textContent);
  const sortButton = (index) => table.querySelectorAll('thead th')[index].querySelector('button.table-sort');

  beforeEach(() => {
    document.body.innerHTML = `
      <table>
        <thead><tr><th>Name</th><th>Value</th></tr></thead>
        <tbody>
          <tr><td>banana</td><td>2</td></tr>
          <tr><td></td><td></td></tr>
          <tr><td>apple</td><td>1</td></tr>
        </tbody>
      </table>`;
    table = document.querySelector('table');
    initTableSort(document);
  });

  it('adds a sort button per header cell', () => {
    expect(sortButton(0)).not.toBeNull();
    expect(sortButton(1)).not.toBeNull();
  });

  it('cycles ascending, descending, then restores the original order', () => {
    sortButton(0).click();
    expect(rowNames()).toEqual(['apple', 'banana', '']);

    sortButton(0).click();
    expect(rowNames()).toEqual(['banana', 'apple', '']);

    sortButton(0).click();
    expect(rowNames()).toEqual(['banana', '', 'apple']);
  });

  it('keeps rows without data at the bottom in both directions', () => {
    sortButton(1).click();
    expect(rowNames()).toEqual(['apple', 'banana', '']);

    sortButton(1).click();
    expect(rowNames()).toEqual(['banana', 'apple', '']);
  });
});
