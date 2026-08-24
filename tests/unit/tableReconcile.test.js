import { describe, it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { DOMParser as PMDOMParser } from 'prosemirror-model';
import { schema } from '../../src/editor/schema/base.js';
import { reconcileTable } from '../../src/editor/plugins/tableRDFa.js';

function stateFrom(html) {
  const dom = document.createElement('div');
  dom.innerHTML = html;
  return EditorState.create({ schema, doc: PMDOMParser.fromSchema(schema).parse(dom) });
}

function tableAt(state) {
  let found = null;
  state.doc.descendants((node, pos) => {
    if (!found && node.type.name === 'table') found = { node, pos };
    return !found;
  });
  return found;
}

describe('reconcile heals legacy service tables', () => {
  it('rows gain the service default subject and type', () => {
    // A Specref table configured before the service carried aboutUrl/typeof.
    let state = stateFrom(`
      <table data-lookup-service="specref" data-lookup-url="https://api.specref.org/bibrefs?refs={id}" data-lookup-id-column="title">
        <caption>Specs</caption>
        <thead><tr>
          <th data-name="title" data-titles="Title" data-property-url="schema:name">Title</th>
          <th data-name="url" data-titles="URL" data-property-url="schema:url" data-value-url="{+url}">URL</th>
        </tr></thead>
        <tbody><tr>
          <td>Linked Data Notifications</td>
          <td>https://www.w3.org/TR/ldn/</td>
        </tr></tbody>
      </table>`);

    let table = tableAt(state);
    const tr = state.tr;
    reconcileTable(tr, table.node, table.pos);
    state = state.apply(tr);

    table = tableAt(state);
    let row = null;
    table.node.descendants((node) => {
      if (!row && node.type.name === 'tr' && node.child(0)?.type.name === 'td') row = node;
      return !row;
    });

    expect(row.attrs.originalAttributes.about).toBe('https://www.w3.org/TR/ldn/');
    expect(row.attrs.originalAttributes.typeof).toBe('doap:Specification');
  });
});
