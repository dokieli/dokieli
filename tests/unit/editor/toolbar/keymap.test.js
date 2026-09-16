import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { DOMParser as PMDOMParser } from 'prosemirror-model';
import { schema } from '../../../../src/editor/schema/base.js';
import { keymapPlugin } from '../../../../src/editor/toolbar/author/keymap.js';

function stateFrom(html, text) {
  const dom = document.createElement('div');
  dom.innerHTML = html;
  const doc = PMDOMParser.fromSchema(schema).parse(dom);
  let pos = null;
  doc.descendants((node, p) => {
    if (pos === null && node.isText && node.text.includes(text)) pos = p + node.text.indexOf(text) + text.length;
    return pos === null;
  });
  return EditorState.create({ schema, doc, selection: TextSelection.create(doc, pos) });
}

function pressEnter(state) {
  let next = state;
  const view = { state, dispatch: (tr) => { next = state.apply(tr); } };
  keymapPlugin.props.handleKeyDown(view, new KeyboardEvent('keydown', { key: 'Enter' }));
  return next;
}

function entryTypes(state) {
  const types = [];
  state.doc.firstChild.forEach(child => types.push(child.type.name));
  return types;
}

describe('Enter in a description list', () => {
  it('adds a value after a term and moves the caret into it', () => {
    const next = pressEnter(stateFrom('<dl id="document-editors"><dt>Editors</dt></dl>', 'Editors'));
    expect(entryTypes(next)).toEqual(['dt', 'dd']);
    expect(next.selection.$from.node(-1).type.name).toBe('dd');
  });

  it('moves into an existing value instead of adding one', () => {
    const next = pressEnter(stateFrom('<dl id="document-editors"><dt>Editors</dt><dd>Alice</dd></dl>', 'Editors'));
    expect(entryTypes(next)).toEqual(['dt', 'dd']);
    expect(next.selection.$from.node(-1).type.name).toBe('dd');
    expect(next.selection.$from.parentOffset).toBe(0);
  });

  it('keeps an empty only value in place on repeated Enter', () => {
    const first = pressEnter(stateFrom('<dl id="document-editors"><dt>Editors</dt></dl>', 'Editors'));
    const second = pressEnter(first);
    expect(second.doc.eq(first.doc)).toBe(true);
    expect(second.selection.$from.node(-1).type.name).toBe('dd');
  });

  it('adds another value after a value', () => {
    const next = pressEnter(stateFrom('<dl id="document-editors"><dt>Editors</dt><dd>Alice</dd></dl>', 'Alice'));
    expect(entryTypes(next)).toEqual(['dt', 'dd', 'dd']);
  });
});
