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

import { describe, it, expect } from 'vitest';
import { DOMParser as PMDOMParser, DOMSerializer } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { schema } from '../../src/editor/schema/base.js';
import { questionHTML, questionnaireHTML, pruneEmptyOptions } from '../../src/ui/templates/questionnaire.js';

// Predictable ids: options {questionId}-o1, explanation {questionId}x.
function qHTML(options) {
  let n = 0;
  const explanation = options.explanation && { id: `${options.id}x`, ...options.explanation };
  return questionHTML({ newId: () => `${options.id}-o${++n}`, ...options, explanation });
}
import { convertQuestion, pmQuestionKind, buildQuestionnaireDecorations, keepOptionInputsFirst } from '../../src/editor/plugins/questionnaireTools.js';

function stateFor(html) {
  const container = document.createElement('div');
  container.innerHTML = questionnaireHTML({ questions: html });
  return EditorState.create({ doc: PMDOMParser.fromSchema(schema).parse(container) });
}

function questions(state) {
  const found = [];
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'dl') { found.push({ node, pos }); return false; }
  });
  return found;
}

function html(state) {
  const out = document.createElement('div');
  out.appendChild(DOMSerializer.fromSchema(schema).serializeFragment(state.doc.content));
  return out;
}

describe('pmQuestionKind', () => {
  it('reads each kind back from the editor document', () => {
    const state = stateFor(['single', 'multiple', 'yes-no', 'dropdown', 'time-slots', 'short-text', 'long-text']
      .map((kind, i) => qHTML({ id: `q${i}`, kind, text: kind, options: ['A', 'B'] })).join(''));
    expect(questions(state).map(f => pmQuestionKind(f.node)))
      .toEqual(['single', 'multiple', 'yes-no', 'dropdown', 'time-slots', 'short-text', 'long-text']);
  });
});

describe('convertQuestion', () => {
  it('keeps the text, option ids, required flag and explanation between choice kinds', () => {
    let state = stateFor(qHTML({ id: 'q1', kind: 'single', text: 'Format?', options: ['HTML', 'PDF'], required: true, explanation: { text: 'Why?' } }));
    state = state.apply(convertQuestion(state, questions(state)[0].pos, 'multiple'));
    const question = html(state).querySelector('dl#q1');
    expect(question.getAttribute('property')).toBe('sh:minCount');
    expect(Array.from(question.querySelectorAll('li input')).some(i => i.hasAttribute('required'))).toBe(false);
    expect(question.querySelector('ul').getAttribute('rel')).toBe('as:anyOf');
    expect(Array.from(question.querySelectorAll('li')).map(li => `${li.id}:${li.textContent}`)).toEqual(['q1-o1:HTML', 'q1-o2:PDF']);
    expect(question.querySelector('.questionnaire-explanation').textContent).toBe('Why?');
    expect(question.querySelector('.questionnaire-hint').textContent).toBe('Choose all that apply.');
    expect(Array.from(question.querySelectorAll('li input')).map(i => i.type)).toEqual(['checkbox', 'checkbox']);
  });

  it('adds a select hint for a dropdown and drops options and explanation for text', () => {
    let state = stateFor(qHTML({ id: 'q1', kind: 'single', text: 'Format?', options: ['HTML'], explanation: { text: 'Why?' } }));
    state = state.apply(convertQuestion(state, questions(state)[0].pos, 'dropdown'));
    expect(html(state).querySelector('dl#q1 ul').classList.contains('questionnaire-dropdown')).toBe(true);

    state = state.apply(convertQuestion(state, questions(state)[0].pos, 'long-text'));
    const question = html(state).querySelector('dl#q1');
    expect(question.querySelector('ul, .questionnaire-explanation')).toBeNull();
    expect(question.querySelector('[property="as:name"]').textContent).toBe('Format?');
    expect(pmQuestionKind(questions(state)[0].node)).toBe('long-text');
  });

  it('gives a text question empty options to fill in', () => {
    let state = stateFor(qHTML({ id: 'q1', kind: 'short-text', text: 'Name?' }));
    state = state.apply(convertQuestion(state, questions(state)[0].pos, 'single'));
    const options = html(state).querySelectorAll('li input[type="radio"][name="q1"]');
    expect(options).toHaveLength(2);
    expect(html(state).querySelector('dl#q1 > dd > p > input[type="text"]')).toBeNull();
  });

  it('starts fresh time slots when switching from named options, and back', () => {
    let state = stateFor(qHTML({ id: 'q1', kind: 'single', text: 'When?', options: ['Monday', 'Tuesday'] }));
    state = state.apply(convertQuestion(state, questions(state)[0].pos, 'time-slots'));
    let out = html(state);
    expect(out.querySelector('#q1 ul').className).toBe('questionnaire-time-slots');
    expect(out.querySelectorAll('#q1 li input[type="datetime-local"]')).toHaveLength(4);
    expect(out.querySelector('#q1 li').textContent).not.toContain('Monday');
    expect(pmQuestionKind(questions(state)[0].node)).toBe('time-slots');

    state = state.apply(convertQuestion(state, questions(state)[0].pos, 'multiple'));
    out = html(state);
    expect(out.querySelectorAll('#q1 li input[type="datetime-local"]')).toHaveLength(0);
    expect(out.querySelectorAll('#q1 li input[type="checkbox"]')).toHaveLength(2);
  });

  it('replaces options with Yes and No for a yes/no question', () => {
    let state = stateFor(qHTML({ id: 'q1', kind: 'single', text: 'Agree?', options: ['Maybe'] }));
    state = state.apply(convertQuestion(state, questions(state)[0].pos, 'yes-no'));
    expect(Array.from(html(state).querySelectorAll('li')).map(li => li.textContent)).toEqual(['Yes', 'No']);
  });
});

describe('questionnaire decorations', () => {
  it('adds tools per question and option, and one add-question control', () => {
    const state = stateFor(qHTML({ id: 'q1', kind: 'single', text: 'A', options: ['1', '2'] }) + qHTML({ id: 'q2', kind: 'long-text', text: 'B' }));
    const keys = buildQuestionnaireDecorations(state.doc).find().map(d => d.spec.key || d.type.toDOM?.name || 'widget');
    expect(keys.filter(k => String(k).startsWith('questionnaire-question-tools'))).toHaveLength(2);
    expect(keys.filter(k => k === 'questionnaire-add')).toHaveLength(1);
    expect(keys.filter(k => String(k).startsWith('questionnaire-option-add'))).toHaveLength(1);
  });
});

describe('option controls', () => {
  const keysFor = (html) => buildQuestionnaireDecorations(stateFor(html).doc).find().map(d => String(d.spec.key));

  it('offers no remove or add for yes/no options', () => {
    const keys = keysFor(qHTML({ id: 'q1', kind: 'yes-no', text: 'Agree?' }));
    expect(keys.some(k => k.startsWith('questionnaire-option-remove'))).toBe(false);
    expect(keys.some(k => k.startsWith('questionnaire-option-add'))).toBe(false);
  });

  it('lets choice options be removed while more than one is left, and always added', () => {
    const several = keysFor(qHTML({ id: 'q1', kind: 'multiple', text: 'Which?', options: ['A', 'B'] }));
    expect(several.filter(k => k.startsWith('questionnaire-option-remove'))).toHaveLength(2);
    expect(several.filter(k => k.startsWith('questionnaire-option-add'))).toHaveLength(1);

    const one = keysFor(qHTML({ id: 'q1', kind: 'single', text: 'Which?', options: ['A'] }));
    expect(one.some(k => k.startsWith('questionnaire-option-remove'))).toBe(false);
    expect(one.filter(k => k.startsWith('questionnaire-option-add'))).toHaveLength(1);
  });
});

describe('pruneEmptyOptions', () => {
  it('drops options left empty', () => {
    document.body.innerHTML = questionnaireHTML({ questions: qHTML({ id: 'q1', kind: 'single', text: 'A', options: ['One', '', ' '] }) });
    pruneEmptyOptions(document);
    expect(Array.from(document.querySelectorAll('li')).map(li => li.textContent)).toEqual(['One']);
  });

  it('keeps one option even when all are empty', () => {
    document.body.innerHTML = questionnaireHTML({ questions: qHTML({ id: 'q1', kind: 'single', text: 'A', options: ['', ''] }) });
    pruneEmptyOptions(document);
    expect(document.querySelectorAll('li')).toHaveLength(1);
  });
});

describe('keepOptionInputsFirst', () => {
  it('moves an input back in front of text typed before it', () => {
    let state = stateFor(qHTML({ id: 'q1', kind: 'single', text: 'A', options: ['', 'Two'] }));
    // Type "One" at the very start of the first option, before its input.
    let pos = null;
    state.doc.descendants((node, p) => { if (pos === null && node.type.name === 'input') pos = p; });
    state = state.apply(state.tr.insertText('One', pos));
    expect(html(state).querySelector('#q1-o1 p').firstChild.nodeName).toBe('#text');

    state = state.apply(keepOptionInputsFirst(state));
    const p = html(state).querySelector('#q1-o1 p');
    expect(p.firstChild.nodeName).toBe('INPUT');
    expect(p.textContent).toBe('One');
    expect(keepOptionInputsFirst(state)).toBeNull();
  });
});
