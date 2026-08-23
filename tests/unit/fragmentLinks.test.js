import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { DOMParser as PMDOMParser } from 'prosemirror-model';
import { schema } from '../../src/editor/schema/base.js';
import { getFragmentMatch, filteredIds } from '../../src/editor/plugins/fragmentLinks.js';

function docFrom(html) {
  const dom = document.createElement('div');
  dom.innerHTML = html;
  return PMDOMParser.fromSchema(schema).parse(dom);
}

describe('fragment link suggestions', () => {
  const doc = docFrom(`
    <section id="discovery" typeof="spec:SecurityConsiderations"><h2>Discovery</h2><p>About discovery.</p></section>
    <section id="requirements"><h2>Requirements</h2><p>Text.</p></section>
    <p id="risk-description-substitution">A risk.</p>
    <section class="do" id="document-menu"><p>Chrome.</p></section>
    <p>Typing here #disc</p>`);

  it('collects and ranks ids by match position', () => {
    const items = filteredIds(doc, 'disc');
    expect(items[0].id).toBe('discovery');
    expect(items[0].label).toBe('Discovery');
    expect(items[0].typeOf).toBe('spec:SecurityConsiderations');

    const all = filteredIds(doc, 'r');
    expect(all.map((i) => i.id)).toEqual(['requirements', 'risk-description-substitution', 'discovery']);
  });

  it('excludes dokieli chrome ids', () => {
    expect(filteredIds(doc, 'menu')).toHaveLength(0);
  });

  it('matches a typed #query at a word boundary only', () => {
    let pos = null;
    doc.descendants((node, p) => {
      if (node.isText && node.text.includes('#disc')) pos = p + node.text.indexOf('#disc') + 5;
      return pos === null;
    });
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, pos) });
    const match = getFragmentMatch(state);
    expect(match?.query).toBe('disc');

    // A bare '#' does not trigger.
    const bare = EditorState.create({ schema, doc, selection: TextSelection.create(doc, pos - 4) });
    expect(getFragmentMatch(bare)).toBeNull();
  });
});
