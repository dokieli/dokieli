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

// Position just past `text` wherever it appears in the doc.
function caretAfter(doc, text) {
  let pos = null;

  doc.descendants((node, p) => {
    if (pos === null && node.isText && node.text.includes(text)) {
      pos = p + node.text.indexOf(text) + text.length;
    }
    return pos === null;
  });

  return pos;
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

  it('lists every id for an empty query, so a bare # offers the lot', () => {
    expect(filteredIds(doc, '').map((i) => i.id))
      .toEqual(['discovery', 'requirements', 'risk-description-substitution']);
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

    // A bare '#' triggers with an empty query, like a bare '@' does.
    const bare = EditorState.create({ schema, doc, selection: TextSelection.create(doc, pos - 4) });
    expect(getFragmentMatch(bare)?.query).toBe('');
  });

  it('leaves a # inside a URL alone', () => {
    const urlDoc = docFrom('<p>See https://example.org/page#sec</p>');
    const state = EditorState.create({ schema, doc: urlDoc, selection: TextSelection.create(urlDoc, caretAfter(urlDoc, '#sec')) });
    expect(getFragmentMatch(state)).toBeNull();
  });

  it('separates adjacent children with no whitespace between them, like a dt immediately followed by a dd', () => {
    const dlDoc = docFrom('<dl id="document-published"><dt>Published</dt><dd><time datetime="2026-08-25">2026-8-25</time></dd></dl>');
    const items = filteredIds(dlDoc, 'document-published');
    expect(items[0].label).toBe('Published 2026-8-25');
  });

  it('matches inside an inline node, such as a link wrapping a time', () => {
    const inlineDoc = docFrom('<p>At <a href="https://example.org/x"><time datetime="2020-01-01">2020 #disc</time></a></p>');
    const state = EditorState.create({ schema, doc: inlineDoc, selection: TextSelection.create(inlineDoc, caretAfter(inlineDoc, '#disc')) });
    expect(getFragmentMatch(state)?.query).toBe('disc');
  });
});
