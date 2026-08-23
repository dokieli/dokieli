import { describe, it, expect, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { schema } from '../../src/editor/schema/base.js';
import {
  insertTable,
  addRow,
  columnBodySelects,
  threatSelectNode,
  selectOptionInTr,
  selectHasChoice
} from '../../src/editor/commands/table.js';
import { LookupServices } from '../../src/services.js';
import { reconcileTable } from '../../src/editor/plugins/tableRDFa.js';
import { recognizeThreatTable, TableToolsView, tableToolsPlugin } from '../../src/editor/plugins/tableTools.js';
import { threatValueRank } from '../../src/threatModel.js';
import { getColumns } from '../../src/editor/commands/table.js';
import { getTableSchema } from '../../src/table.js';
import { DOMParser as PMDOMParser } from 'prosemirror-model';

const TYPE_COLUMN = 2;

function threatState() {
  let state = EditorState.create({ schema, doc: schema.nodes.doc.createAndFill() });
  insertTable({
    rows: 2,
    columns: LookupServices.threatmodel.columns.length,
    columnSchemas: LookupServices.threatmodel.columns,
    tableSchema: LookupServices.threatmodel.tableSchema
  })(state, (tr) => { state = state.apply(tr); });
  return state;
}

function tableAt(state) {
  let found = null;
  state.doc.descendants((node, pos) => {
    if (!found && node.type.name === 'table') found = { node, pos };
    return !found;
  });
  return found;
}

function optionLabels(selectNode) {
  const labels = [];
  selectNode.descendants((node) => {
    if (node.type.name === 'option') labels.push(node.textContent);
    return true;
  });
  return labels;
}

describe('threat model selects in the editor document', () => {
  it('creates body select cells with STRIDE options and a kind select in the header', () => {
    const state = threatState();
    const table = tableAt(state);

    const selects = columnBodySelects(table.node, table.pos, TYPE_COLUMN);
    expect(selects).toHaveLength(2);
    expect(optionLabels(selects[0].node)).toContain('Spoofing');

    let kindSelect = null;
    table.node.descendants((node) => {
      if (!kindSelect && node.type.name === 'select'
        && node.attrs.originalAttributes['data-select'] === 'threat-model-kind') kindSelect = node;
      return !kindSelect;
    });
    expect(kindSelect).not.toBeNull();
    expect(optionLabels(kindSelect)).toEqual(['STRIDE type', 'LINDDUN type']);
    expect(selectHasChoice(kindSelect)).toBe(true);
  });

  it('switching the framework replaces every body select with LINDDUN options', () => {
    let state = threatState();
    let table = tableAt(state);

    const tr = state.tr;
    columnBodySelects(table.node, table.pos, TYPE_COLUMN)
      .sort((a, b) => b.pos - a.pos)
      .forEach(({ node, pos }) => {
        tr.replaceWith(pos, pos + node.nodeSize, threatSelectNode('threat-type', 'linddun'));
      });
    state = state.apply(tr);

    table = tableAt(state);
    const selects = columnBodySelects(table.node, table.pos, TYPE_COLUMN);
    expect(selects).toHaveLength(2);
    selects.forEach(({ node }) => {
      const labels = optionLabels(node);
      expect(labels).toContain('Linking');
      expect(labels).toContain('Non-compliance');
      expect(labels).not.toContain('Spoofing');
    });
  });

  it('persists a choice as the selected attribute and clears it on blank', () => {
    let state = threatState();
    let table = tableAt(state);

    let [{ node, pos }] = columnBodySelects(table.node, table.pos, TYPE_COLUMN);
    expect(selectHasChoice(node)).toBe(false);

    state = state.apply(selectOptionInTr(state.tr, node, pos, 'http://www.wikidata.org/entity/Q11081100'));
    table = tableAt(state);
    [{ node, pos }] = columnBodySelects(table.node, table.pos, TYPE_COLUMN);
    expect(selectHasChoice(node)).toBe(true);

    state = state.apply(selectOptionInTr(state.tr, node, pos, ''));
    table = tableAt(state);
    [{ node }] = columnBodySelects(table.node, table.pos, TYPE_COLUMN);
    expect(selectHasChoice(node)).toBe(false);
  });

  it('reconcile puts RDFa on typed feature and threat cells', () => {
    let state = threatState();
    let table = tableAt(state);

    // Type into the first body row's feature and threat cells.
    const bodyCells = [];
    table.node.descendants((node, pos) => {
      if (node.type.name === 'td') bodyCells.push(table.pos + 1 + pos);
      return true;
    });
    let tr = state.tr;
    tr.insertText('Verify the source.', tr.mapping.map(bodyCells[5] + 2));
    tr.insertText('An attacker forges a description.', tr.mapping.map(bodyCells[1] + 2));
    tr.insertText('#discovery', tr.mapping.map(bodyCells[0] + 2));
    state = state.apply(tr);

    table = tableAt(state);
    tr = state.tr;
    reconcileTable(tr, table.node, table.pos);
    state = state.apply(tr);

    table = tableAt(state);
    const cells = [];
    let row = null;
    table.node.descendants((node) => {
      if (node.type.name === 'tr' && node.child(0)?.type.name === 'td' && !row) row = node;
      return !row;
    });
    row.forEach((cell) => cells.push(cell.attrs.originalAttributes));

    expect(cells[0].rel).toBe('dcterms:subject');
    expect(cells[0].resource).toBe('#discovery');
    expect(cells[1].property).toBe('dcterms:description');
    expect(row.attrs.originalAttributes.typeof).toBe('dpv:Risk');
    expect(row.attrs.originalAttributes.about).toBe('#risk-an-attacker-forges-a-description');
    expect(row.attrs.originalAttributes.id).toBe('risk-an-attacker-forges-a-description');
    expect(cells[5].rel).toBe('dpv:isMitigatedByMeasure');
    expect(cells[5].resource).toBe('#mitigation-an-attacker-forges-a-description');
  });

  it('a bare feature token references this document as a fragment', () => {
    let state = threatState();
    let table = tableAt(state);

    let firstTd = null;
    state.doc.descendants((node, pos) => {
      if (!firstTd && node.type.name === 'td') firstTd = pos;
      return !firstTd;
    });
    state = state.apply(state.tr.insertText('foo', firstTd + 2));

    table = tableAt(state);
    const tr = state.tr;
    reconcileTable(tr, table.node, table.pos);
    state = state.apply(tr);

    table = tableAt(state);
    let cellAttrs = null;
    table.node.descendants((node) => {
      if (!cellAttrs && node.type.name === 'td') cellAttrs = node.attrs.originalAttributes;
      return !cellAttrs;
    });
    expect(cellAttrs.resource).toBe('#foo');
    expect(cellAttrs.rel).toBe('dcterms:subject');
  });

  it('recognizes a saved threat table and rebuilds its selects from the markup', () => {
    const dom = document.createElement('div');
    dom.innerHTML = `
      <table typeof="schema:Table" rel="schema:hasPart" resource="#threats" id="threats">
        <caption property="schema:name">Threats</caption>
        <thead><tr><th>Feature</th><th>Threat</th><th>STRIDE type</th><th>Threat-model element</th><th>Risk level</th><th>Mitigation</th></tr></thead>
        <tbody>
          <tr about="#risk-x" id="risk-x" typeof="dpv:Risk">
            <td><a href="#discovery" rel="dcterms:subject">#discovery</a></td>
            <td property="dcterms:description">X. Something bad.</td>
            <td><a href="http://www.wikidata.org/entity/Q11081100" rel="dpv:hasImpact">Spoofing</a></td>
            <td><a href="https://www.w3.org/TR/threat-model-web/#web-origin-boundary" rel="dcat:theme">B1 Web Origin Boundary</a></td>
            <td><a href="https://w3id.org/dpv/risk#High" rel="dpv:hasRiskLevel">High</a></td>
            <td rel="dpv:isMitigatedByMeasure"><span about="#mitigation-x" id="mitigation-x" property="dcterms:description" typeof="dpv:RiskMitigationMeasure">Do the thing.</span></td>
          </tr>
        </tbody>
      </table>`;

    let state = EditorState.create({ schema, doc: PMDOMParser.fromSchema(schema).parse(dom) });
    let table = tableAt(state);

    const tr = state.tr;
    expect(recognizeThreatTable(tr, table)).toBe(true);
    state = state.apply(tr);

    table = tableAt(state);
    const columns = getColumns(table.node);
    expect(columns[0].propertyUrl).toBe('dcterms:subject');
    expect(columns[1].propertyUrl).toBe('dcterms:description');
    expect(columns[5].propertyUrl).toBe('dpv:isMitigatedByMeasure');

    const tableSchema = getTableSchema(table.node.attrs.originalAttributes);
    expect(tableSchema.typeof).toBe('dpv:Risk');
    expect(tableSchema.aboutUrl).toBe('#risk-{_slug_threat}');
    expect(tableSchema.subject).toBe('#threats');

    // The type and risk cells are selects again, with their anchors' values chosen.
    const typeSelects = columnBodySelects(table.node, table.pos, TYPE_COLUMN);
    expect(typeSelects).toHaveLength(1);
    expect(selectHasChoice(typeSelects[0].node)).toBe(true);

    const riskSelects = columnBodySelects(table.node, table.pos, 4);
    expect(riskSelects).toHaveLength(1);
    let chosenValue = null;
    riskSelects[0].node.descendants((node) => {
      const attrs = node.attrs.originalAttributes || {};
      if (node.type.name === 'option' && 'selected' in attrs) chosenValue = attrs.value;
      return chosenValue === null;
    });
    expect(chosenValue).toBe('https://w3id.org/dpv/risk#High');

    // The type column's header carries the framework select.
    let kindSelect = null;
    table.node.descendants((node) => {
      if (!kindSelect && node.type.name === 'select'
        && node.attrs.originalAttributes['data-select'] === 'threat-model-kind') kindSelect = node;
      return !kindSelect;
    });
    expect(kindSelect).not.toBeNull();
  });

  it('the real switchThreatKind clears choices and swaps every body select', () => {
    let state = threatState();
    let table = tableAt(state);

    // Choose a STRIDE value in row one, so the confirm path runs.
    const [first] = columnBodySelects(table.node, table.pos, TYPE_COLUMN);
    state = state.apply(selectOptionInTr(state.tr, first.node, first.pos, 'http://www.wikidata.org/entity/Q11081100'));
    table = tableAt(state);

    // And a risk level, which the switch must not clear.
    const [risk] = columnBodySelects(table.node, table.pos, 4);
    state = state.apply(selectOptionInTr(state.tr, risk.node, risk.pos, 'https://w3id.org/dpv/risk#High'));
    table = tableAt(state);

    // The header kind select's document position.
    let found = null;
    table.node.descendants((node, pos) => {
      if (!found && node.type.name === 'select'
        && node.attrs.originalAttributes['data-select'] === 'threat-model-kind') {
        found = { node, pos: table.pos + 1 + pos };
      }
      return !found;
    });
    expect(found).not.toBeNull();

    const originalConfirm = window.confirm;
    const confirmSpy = vi.fn(() => true);
    window.confirm = confirmSpy;
    const fake = Object.create(TableToolsView.prototype);
    fake.editorView = { state, dispatch: (tr) => { state = state.apply(tr); } };
    fake.switchThreatKind({ value: 'linddun' }, found);
    window.confirm = originalConfirm;
    expect(confirmSpy).toHaveBeenCalled();

    table = tableAt(state);
    const selects = columnBodySelects(table.node, table.pos, TYPE_COLUMN);
    expect(selects).toHaveLength(2);
    selects.forEach(({ node }) => {
      expect(selectHasChoice(node)).toBe(false);
      expect(optionLabels(node)).toContain('Linking');
      expect(optionLabels(node)).not.toContain('Spoofing');
    });

    // The risk choice survives the framework switch.
    const [riskAfter] = columnBodySelects(table.node, table.pos, 4);
    expect(selectHasChoice(riskAfter.node)).toBe(true);

    // The framework is part of the select's markup, forcing a DOM rebuild.
    selects.forEach(({ node }) => {
      expect(node.attrs.originalAttributes['data-framework']).toBe('linddun');
    });
  });

  it('select cells swallow typed text; text cells accept it', () => {
    const state = threatState();
    const table = tableAt(state);
    const plugin = tableToolsPlugin();

    const [typeSelect] = columnBodySelects(table.node, table.pos, TYPE_COLUMN);
    const fakeView = { state, nodeDOM: () => null };

    // Inside the type cell: swallowed. Inside the feature cell: passed through.
    expect(plugin.props.handleTextInput(fakeView, typeSelect.pos)).toBe(true);

    let firstTd = null;
    state.doc.descendants((node, pos) => {
      if (!firstTd && node.type.name === 'td') firstTd = pos;
      return !firstTd;
    });
    expect(plugin.props.handleTextInput(fakeView, firstTd + 2)).toBe(false);
  });

  it('Backspace in a select cell clears the choice', () => {
    let state = threatState();
    let table = tableAt(state);
    const plugin = tableToolsPlugin();

    const [typeSelect] = columnBodySelects(table.node, table.pos, TYPE_COLUMN);
    state = state.apply(selectOptionInTr(state.tr, typeSelect.node, typeSelect.pos, 'http://www.wikidata.org/entity/Q11081100'));

    // Caret into the select's cell.
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, typeSelect.pos)));

    const fakeView = { state, nodeDOM: () => null, dispatch: (tr) => { state = state.apply(tr); } };
    const handled = plugin.props.handleKeyDown(fakeView, { key: 'Backspace', target: {}, preventDefault: () => {} });
    expect(handled).toBe(true);

    table = tableAt(state);
    const [after] = columnBodySelects(table.node, table.pos, TYPE_COLUMN);
    expect(selectHasChoice(after.node)).toBe(false);
  });

  it('a default caption follows the framework switch', () => {
    let state = EditorState.create({ schema, doc: schema.nodes.doc.createAndFill() });
    insertTable({
      rows: 2,
      columns: LookupServices.threatmodel.columns.length,
      caption: 'Security Threats and Mitigations',
      columnSchemas: LookupServices.threatmodel.columns,
      tableSchema: LookupServices.threatmodel.tableSchema
    })(state, (tr) => { state = state.apply(tr); });
    let table = tableAt(state);

    let found = null;
    table.node.descendants((node, pos) => {
      if (!found && node.type.name === 'select'
        && node.attrs.originalAttributes['data-select'] === 'threat-model-kind') {
        found = { node, pos: table.pos + 1 + pos };
      }
      return !found;
    });

    const fake = Object.create(TableToolsView.prototype);
    fake.editorView = { state, dispatch: (tr) => { state = state.apply(tr); } };
    fake.switchThreatKind({ value: 'linddun' }, found);

    table = tableAt(state);
    expect(table.node.firstChild.textContent.trim()).toBe('Privacy Threats and Mitigations');
  });

  it('ranks vocabulary values by their declared order', () => {
    expect(threatValueRank('dpv:hasRiskLevel', 'https://w3id.org/dpv/risk#ExtremelyHigh')).toBe(0);
    expect(threatValueRank('dpv:hasRiskLevel', 'https://w3id.org/dpv/risk#High')).toBe(2);
    expect(threatValueRank('dpv:hasRiskLevel', 'https://w3id.org/dpv/risk#ExtremelyLow')).toBe(6);
    expect(threatValueRank('dpv:hasImpact', 'https://linddun.org/threat-types/#L')).toBeGreaterThan(
      threatValueRank('dpv:hasImpact', 'http://www.wikidata.org/entity/Q1856893'));
    expect(threatValueRank('rel:unknown', 'x')).toBe(-1);
  });

  it('a new row repeats the select structure, cleared', () => {
    let state = threatState();
    let table = tableAt(state);

    // Choose in row one, then add a row from the first body cell.
    const [first] = columnBodySelects(table.node, table.pos, TYPE_COLUMN);
    state = state.apply(selectOptionInTr(state.tr, first.node, first.pos, 'http://www.wikidata.org/entity/Q11081100'));

    let firstTd = null;
    state.doc.descendants((node, pos) => {
      if (!firstTd && node.type.name === 'td') firstTd = pos;
      return !firstTd;
    });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, firstTd + 2)));

    addRow('after')(state, (tr) => { state = state.apply(tr); });

    table = tableAt(state);
    const selects = columnBodySelects(table.node, table.pos, TYPE_COLUMN);
    expect(selects).toHaveLength(3);
    // The clone carries the options but not the choice.
    expect(optionLabels(selects[1].node)).toContain('Spoofing');
    expect(selectHasChoice(selects[1].node)).toBe(false);
  });
});
