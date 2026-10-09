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

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/activity.js', async (importOriginal) => ({ ...(await importOriginal()), notifyInbox: vi.fn(), postActivity: vi.fn() }));

import { RdfaParser } from 'rdfa-streaming-parser';
import { DOMParser as PMDOMParser, DOMSerializer } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { schema } from '../../src/editor/schema/base.js';
import Config from '../../src/config.js';
import {
  questionHTML, questionnaireHTML, describeQuestion, normalizeQuestionnaireIds, activateQuestionnaire,
  deactivateQuestionnaire, activateQuestionnaires, collectAnswers, updateReadiness, submitQuestionnaire, clearAnswers, insertQuestion, setQuestionnaireInbox,
  questionFromFormValues, getQuestions, sendResponse, withAnswerIds, responseDocumentHTML, setTemplateNewQuestionnaire, restoreQuestionParts, ensureQuestionnaireControls, prepareSavedForm, removeFormSubmit, slotsToTimes, timesToSlots, toDateTimeWithOffset, toLocalDateTime, responseStatementsHTML, outboxResponseHTML, newQuestionId
} from '../../src/ui/templates/questionnaire.js';

// Predictable ids: options {questionId}-o1, explanation {questionId}x.
function qHTML(options) {
  let n = 0;
  const explanation = options.explanation && { id: `${options.id}x`, ...options.explanation };
  return questionHTML({ newId: () => `${options.id}-o${++n}`, ...options, explanation });
}
import { notifyInbox, postActivity } from '../../src/activity.js';
import { getDocument } from '../../src/doc.js';

const BASE = 'https://example.org/questionnaire';
const PREFIX = ['as', 'ldp', 'rdf', 'schema', 'sh', 'xsd'].map(p => `${p}: ${Config.ns[p]('').value}`).join(' ');

const AS = 'https://www.w3.org/ns/activitystreams#';
const SCHEMA = 'http://schema.org/';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';

function parseRDFa(html) {
  return new Promise((resolve, reject) => {
    const quads = [];
    const parser = new RdfaParser({ baseIRI: BASE, contentType: 'text/html' });
    parser.on('data', q => quads.push([q.subject.value, q.predicate.value, q.object.value]));
    parser.on('error', reject);
    parser.on('end', () => resolve(quads));
    parser.write(`<html><body prefix="${PREFIX}">${html}</body></html>`);
    parser.end();
  });
}

function has(quads, s, p, o) {
  return quads.some(([qs, qp, qo]) => qs === s && qp === p && qo === o);
}

function mount(html) {
  document.body.innerHTML = `<main><article>${html}</article></main>`;
  return document.querySelector('section.questionnaire');
}

describe('questionnaire markup', () => {
  it('types the questionnaire and links its questions and inbox', async () => {
    const html = questionnaireHTML({ inbox: 'https://inbox.example/', questions: qHTML({ id: 'q1', kind: 'long-text', text: 'Why?' }) });
    const quads = await parseRDFa(html);
    const q = `${BASE}#questionnaire`;
    expect(quads.some(([subject, predicate]) => subject === q && predicate === `${RDF}type`)).toBe(false);
    expect(has(quads, q, 'http://www.w3.org/ns/ldp#inbox', 'https://inbox.example/')).toBe(true);
    expect(has(quads, q, `${AS}items`, `${BASE}#q1`)).toBe(true);
    expect(has(quads, q, `${SCHEMA}hasPart`, `${BASE}#q1`)).toBe(false);
    expect(has(quads, BASE, `${SCHEMA}hasPart`, q)).toBe(true);
    expect(quads.some(([, p]) => p === `${RDF}first`)).toBe(false);
  });

  it('is a form that posts to the inbox', () => {
    document.body.innerHTML = questionnaireHTML({ inbox: 'https://inbox.example/', questions: qHTML({ id: 'q1', kind: 'long-text', text: 'Why?' }) });
    const form = document.querySelector('form.questionnaire-questions');
    expect([form.getAttribute('action'), form.getAttribute('method'), form.getAttribute('rel')]).toEqual(['https://inbox.example/', 'post', 'as:items']);
  });

  it('models a required single choice question with its options, required as sh:minCount', async () => {
    const html = qHTML({ id: 'q1', kind: 'single', text: 'Format?', options: ['HTML', 'PDF'], required: true });
    const quads = await parseRDFa(html);
    const q = `${BASE}#q1`;
    expect(has(quads, q, `${RDF}type`, `${AS}Question`)).toBe(true);
    expect(has(quads, q, `${RDF}type`, `${SCHEMA}Question`)).toBe(false);
    expect(has(quads, q, `${AS}name`, 'Format?')).toBe(true);
    expect(has(quads, q, `${AS}oneOf`, `${BASE}#q1-o1`)).toBe(true);
    expect(has(quads, q, 'http://www.w3.org/ns/shacl#minCount', '1')).toBe(true);
    // HTML required on the radios.
    document.body.innerHTML = html;
    expect(Array.from(document.querySelectorAll('#q1 li input')).map(i => i.required)).toEqual([true, true]);
    expect(has(quads, `${BASE}#q1-o2`, `${AS}name`, 'PDF')).toBe(true);
    expect(has(quads, `${BASE}#q1-o1`, `${RDF}type`, `${AS}Note`)).toBe(true);
  });

  it('answers a short text question with a text input, and leaves optional ones unrequired', () => {
    document.body.innerHTML = qHTML({ id: 'q1', kind: 'short-text', text: 'Name?' }) + qHTML({ id: 'q2', kind: 'long-text', text: 'More?' });
    expect(document.querySelector('#q1 input[type="text"]').required).toBe(false);
    expect(document.querySelectorAll('#q2 textarea')).toHaveLength(1);
  });

  it('uses as:anyOf for multiple choice and a select hint for dropdowns', async () => {
    const multiple = await parseRDFa(qHTML({ id: 'q1', kind: 'multiple', text: 'Which?', options: ['A', 'B'] }));
    expect(has(multiple, `${BASE}#q1`, `${AS}anyOf`, `${BASE}#q1-o2`)).toBe(true);

    const dropdown = await parseRDFa(qHTML({ id: 'q2', kind: 'dropdown', text: 'Country?', options: ['A'] }));
    expect(has(dropdown, `${BASE}#q2`, `${AS}oneOf`, `${BASE}#q2-o1`)).toBe(true);
    document.body.innerHTML = qHTML({ id: 'q2', kind: 'dropdown', text: 'Country?', options: ['A'] });
    expect(document.querySelector('#q2 ul').classList.contains('questionnaire-dropdown')).toBe(true);
  });

  it('offers Yes and No for a yes/no question', async () => {
    const quads = await parseRDFa(qHTML({ id: 'q1', kind: 'yes-no', text: 'Agree?' }));
    expect(has(quads, `${BASE}#q1-o1`, `${AS}name`, 'Yes')).toBe(true);
    expect(has(quads, `${BASE}#q1-o2`, `${AS}name`, 'No')).toBe(true);
  });

  it('adds an explanation as a free-text sub-question with its own required flag', async () => {
    const quads = await parseRDFa(qHTML({ id: 'q1', kind: 'yes-no', text: 'Agree?', explanation: { text: 'Why?', required: true } }));
    const e = `${BASE}#q1x`;
    expect(has(quads, `${BASE}#q1`, `${SCHEMA}hasPart`, e)).toBe(true);
    expect(has(quads, e, `${AS}name`, 'Why?')).toBe(true);
    document.body.innerHTML = qHTML({ id: 'q1', kind: 'yes-no', text: 'Agree?', explanation: { text: 'Why?', required: true } });
    expect(document.querySelector('#q1x textarea').required).toBe(true);
    expect(document.querySelector('#q1x').getAttribute('property')).toBe('sh:minCount');
    expect(document.querySelector('#q1').hasAttribute('property')).toBe(false);
    expect(Array.from(document.querySelectorAll('#q1 li input')).some(i => i.required)).toBe(false);
  });

  it('encodes question text', () => {
    const html = qHTML({ id: 'q1', kind: 'single', text: 'a < b & "c"', options: ['<x>'] });
    document.body.innerHTML = html;
    expect(document.querySelector('.questionnaire-question-text').textContent).toBe('a < b & "c"');
    expect(document.querySelector('li').textContent).toBe('<x>');
  });
});

describe('questionnaire in the editor schema', () => {
  it('round-trips question markup through ProseMirror', () => {
    const html = questionnaireHTML({ questions: [
      qHTML({ id: 'q1', kind: 'single', text: 'Format?', options: ['HTML'], required: true, explanation: { text: 'Why?' } }),
      qHTML({ id: 'q2', kind: 'short-text', text: 'Name?' })
    ].join('') });
    const container = document.createElement('div');
    container.innerHTML = html;

    const doc = PMDOMParser.fromSchema(schema).parse(container);
    const out = document.createElement('div');
    out.appendChild(DOMSerializer.fromSchema(schema).serializeFragment(doc.content));

    const fieldset = out.querySelector('dl#q1');
    expect(fieldset.getAttribute('typeof')).toBe('as:Question');
    expect(Array.from(fieldset.querySelectorAll('li input')).every(i => i.hasAttribute('required'))).toBe(true);
    expect(fieldset.querySelector(':scope > dt#q1-text[property="as:name"]').textContent).toBe('Format?');
    expect(fieldset.querySelector('li#q1-o1').getAttribute('property')).toBe('as:name');
    expect(out.querySelector('#q1x [property="as:name"]').textContent).toBe('Why?');
    expect(out.querySelector('dl#q2 input[type="text"]')).not.toBeNull();
    expect(out.querySelector('form.questionnaire-questions').hasAttribute('novalidate')).toBe(false);
    expect(fieldset.getAttribute('property')).toBe('sh:minCount');
    expect(out.querySelector('.questionnaire-questions').getAttribute('rel')).toBe('as:items');
  });
});

describe('describeQuestion', () => {
  it('derives the kind from the RDFa', () => {
    const questionnaire = mount(questionnaireHTML({ questions: [
      qHTML({ id: 'a', kind: 'single', text: 'A', options: ['1'] }),
      qHTML({ id: 'b', kind: 'multiple', text: 'B', options: ['1'] }),
      qHTML({ id: 'c', kind: 'dropdown', text: 'C', options: ['1'] }),
      qHTML({ id: 'd', kind: 'short-text', text: 'D' }),
      qHTML({ id: 'e', kind: 'long-text', text: 'E' }),
      qHTML({ id: 'g', kind: 'yes-no', text: 'G', required: true, explanation: { text: 'Why?' } })
    ].join('') }));

    const described = getQuestions(questionnaire).map(f => describeQuestion(f, BASE));
    expect(described.map(q => q.kind)).toEqual(['single', 'multiple', 'dropdown', 'short-text', 'long-text', 'single']);
    const g = described[5];
    expect(g.required).toBe(true);
    expect(g.options.map(o => o.label)).toEqual(['Yes', 'No']);
    expect(g.explanation).toMatchObject({ iri: `${BASE}#gx`, text: 'Why?', required: false });
  });
});

describe('normalizeQuestionnaireIds', () => {
  it('renames options duplicated by splitting a list item, the same way every time', () => {
    const html = questionnaireHTML({ questions: qHTML({ id: 'q1', kind: 'single', text: 'A', options: ['One', 'Two'] }) });
    const run = () => {
      const questionnaire = mount(html);
      const first = questionnaire.querySelector('li');
      first.after(first.cloneNode(true));
      normalizeQuestionnaireIds(document);
      return Array.from(questionnaire.querySelectorAll('li')).map(li => [li.id, li.getAttribute('about')]);
    };

    const ids = run();
    expect(ids[0]).toEqual(['q1-o1', '#q1-o1']);
    expect(ids[1][0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(ids[1][1]).toBe(`#${ids[1][0]}`);
    expect(ids[2]).toEqual(['q1-o2', '#q1-o2']);
    expect(run()).toEqual(ids);
  });

  it('types an option item that lost its RDFa', () => {
    const questionnaire = mount(questionnaireHTML({ questions: qHTML({ id: 'q1', kind: 'single', text: 'A', options: ['One'] }) }));
    questionnaire.querySelector('ul').insertAdjacentHTML('beforeend', '<li><p>Two</p></li>');
    normalizeQuestionnaireIds(document);
    const added = questionnaire.querySelectorAll('li')[1];
    expect(added.getAttribute('typeof')).toBe('as:Note');
    expect(added.getAttribute('property')).toBe('as:name');
    expect(added.id).toBeTruthy();
    expect(added.getAttribute('about')).toBe(`#${added.id}`);
  });
});

describe('answering', () => {
  let questionnaire;

  beforeEach(() => {
    questionnaire = mount(questionnaireHTML({ questions: [
      qHTML({ id: 'q1', kind: 'single', text: 'Format?', options: ['HTML', 'PDF'], required: true, explanation: { text: 'Why?', required: true } }),
      qHTML({ id: 'q2', kind: 'multiple', text: 'Features?', options: ['A', 'B', 'C'] }),
      qHTML({ id: 'q3', kind: 'dropdown', text: 'Country?', options: ['AR', 'DE'] }),
      qHTML({ id: 'q4', kind: 'short-text', text: 'Name?', required: true }),
      qHTML({ id: 'q5', kind: 'long-text', text: 'Comments?' })
    ].join('') }));
    activateQuestionnaire(questionnaire, BASE);
  });

  const control = (selector) => questionnaire.querySelector(selector);

  it('answers with the controls in the markup, adding only a dropdown select and the actions', () => {
    // Dropdown options are radios in the markup.
    expect(questionnaire.querySelectorAll('input[type="radio"].questionnaire-control:not(.do)')).toHaveLength(4);
    expect(questionnaire.querySelectorAll('input[type="checkbox"].questionnaire-control:not(.do)')).toHaveLength(3);
    expect(questionnaire.querySelectorAll('#q4 input[type="text"]:not(.do)')).toHaveLength(1);
    expect(questionnaire.querySelectorAll('textarea:not(.do)')).toHaveLength(2);
    expect(questionnaire.querySelectorAll('select.do option')).toHaveLength(3);
    expect(questionnaire.querySelector('.questionnaire-actions.do')).not.toBeNull();

    deactivateQuestionnaire(questionnaire);
    expect(questionnaire.querySelectorAll('.do')).toHaveLength(0);
    expect(questionnaire.querySelectorAll('.questionnaire-control')).toHaveLength(10);
  });

  it('resolves question IRIs against the document when activating every questionnaire', () => {
    const previous = Config.DocumentURL;
    Config.DocumentURL = BASE;
    try {
      deactivateQuestionnaire(questionnaire);
      activateQuestionnaires(document);
      control('#q1-o1 input').checked = true;
      expect(collectAnswers(questionnaire).answers[0].question).toBe(`${BASE}#q1`);
    }
    finally {
      Config.DocumentURL = previous;
    }
  });

  it('activates once', () => {
    activateQuestionnaire(questionnaire, BASE);
    expect(questionnaire.querySelectorAll('.questionnaire-actions')).toHaveLength(1);
  });

  it('reports required questions and explanations left unanswered', () => {
    expect(collectAnswers(questionnaire, BASE).missing).toEqual(['q1', 'q4']);

    control('#q1-o1 input').checked = true;
    expect(collectAnswers(questionnaire, BASE).missing).toEqual(['q1', 'q4']);

    control('#q1x textarea').value = 'Because';
    expect(collectAnswers(questionnaire, BASE).missing).toEqual(['q4']);

    control('#q4 input').value = 'Ada';
    expect(collectAnswers(questionnaire, BASE).missing).toEqual([]);
  });

  it('collects one answer per chosen option, typed text and explanation', () => {
    control('#q1-o2 input').checked = true;
    control('#q1x textarea').value = 'Portable';
    control('#q2-o1 input').checked = true;
    control('#q2-o3 input').checked = true;
    control('#q3 select').value = `${BASE}#q3-o2`;
    control('#q4 input').value = 'Ada';
    control('#q5 textarea').value = '  ';

    const { answers } = collectAnswers(questionnaire, BASE);
    expect(answers.map(a => [a.question.split('#')[1], a.option?.label ?? a.content])).toEqual([
      ['q1', 'PDF'],
      ['q1x', 'Portable'],
      ['q2', 'A'],
      ['q2', 'C'],
      ['q3', 'DE'],
      ['q4', 'Ada']
    ]);
  });

  it('turns the submit button ready once every required answer is given', () => {
    const submit = control('.questionnaire-submit');
    expect(submit.classList.contains('questionnaire-ready')).toBe(false);
    expect(control('.questionnaire-status').textContent).toBe('Required questions left: 2');

    control('#q1-o1 input').checked = true;
    control('#q1x textarea').value = 'Because';
    updateReadiness(questionnaire);
    expect(submit.classList.contains('questionnaire-ready')).toBe(false);

    control('#q4 input').value = 'Ada';
    expect(updateReadiness(questionnaire).ready).toBe(true);
    expect(submit.classList.contains('questionnaire-ready')).toBe(true);
    expect(control('.questionnaire-status').textContent).toBe('Ready to submit.');

    control('#q4 input').value = '';
    updateReadiness(questionnaire);
    expect(submit.classList.contains('questionnaire-ready')).toBe(false);
  });

  it('shows warnings on submit and updates them as answers come in', () => {
    control('#q1-o1 input').checked = true;
    updateReadiness(questionnaire);
    expect(questionnaire.querySelectorAll('.questionnaire-error')).toHaveLength(0);

    submitQuestionnaire(questionnaire);
    const warned = () => Array.from(questionnaire.querySelectorAll('.questionnaire-error')).map(e => e.closest('dl').id);
    expect(warned()).toEqual(['q1', 'q4']);

    control('#q1x textarea').value = 'Because';
    updateReadiness(questionnaire);
    expect(warned()).toEqual(['q4']);

    control('#q1x textarea').value = '';
    updateReadiness(questionnaire);
    expect(warned()).toEqual(['q1', 'q4']);

    clearAnswers(questionnaire);
    expect(warned()).toEqual([]);
    updateReadiness(questionnaire);
    expect(warned()).toEqual([]);
  });

  it('clears answers', () => {
    control('#q1-o1 input').checked = true;
    control('#q5 textarea').value = 'x';
    clearAnswers(questionnaire);
    expect(collectAnswers(questionnaire, BASE).answers).toEqual([]);
  });
});

describe('time slots', () => {
  const slotsHTML = () => qHTML({ id: 'q1', kind: 'time-slots', text: 'When can you meet?' });
  const pick = (questionnaire, n, start, end) => {
    const li = questionnaire.querySelectorAll('#q1 li')[n];
    li.querySelector('.questionnaire-slot-start').setAttribute('value', start);
    if (end) li.querySelector('.questionnaire-slot-end').setAttribute('value', end);
  };

  it('offers proposed times as checkboxes with date and time pickers while editing', () => {
    document.body.innerHTML = slotsHTML();
    const list = document.querySelector('#q1 ul');
    expect([list.className, list.getAttribute('rel')]).toEqual(['questionnaire-time-slots', 'as:anyOf']);
    const items = Array.from(list.querySelectorAll('li'));
    expect(items).toHaveLength(2);
    expect(items.every(li => li.getAttribute('typeof') === 'as:Event')).toBe(true);
    expect(items[0].querySelector('.questionnaire-control').type).toBe('checkbox');
    expect(Array.from(items[0].querySelectorAll('input[type="datetime-local"]')).map(i => i.className)).toEqual(['questionnaire-slot-start', 'questionnaire-slot-end']);
    expect(document.querySelector('#q1 .questionnaire-hint').textContent).toBe('Choose all the times that work for you.');
  });

  it('converts between a picker value and an xsd:dateTime with the UTC offset', () => {
    expect(toDateTimeWithOffset('2026-10-14T10:00')).toBe('2026-10-14T10:00:00+00:00');
    expect(toLocalDateTime('2026-10-14T10:00:00+00:00')).toBe('2026-10-14T10:00');
    expect(toLocalDateTime('2026-10-14T12:00:00+02:00')).toBe('2026-10-14T10:00');
    expect(toDateTimeWithOffset('')).toBe('');
  });

  it('saves the picked times as as:Event start and end times, and edits them again as pickers', async () => {
    const questionnaire = mount(questionnaireHTML({ questions: slotsHTML() }));
    pick(questionnaire, 0, '2026-10-14T10:00', '2026-10-14T11:00');
    pick(questionnaire, 1, '2026-10-15T15:30');
    slotsToTimes(document);

    const [first, second] = questionnaire.querySelectorAll('#q1 li');
    expect(first.querySelectorAll('input[type="datetime-local"]')).toHaveLength(0);
    expect(first.querySelector('.questionnaire-control').type).toBe('checkbox');
    const start = first.querySelector('time[property="as:startTime"]');
    expect([start.getAttribute('datetime'), start.getAttribute('content'), start.getAttribute('datatype')]).toEqual(['2026-10-14T10:00:00+00:00', '2026-10-14T10:00:00+00:00', 'xsd:dateTime']);
    expect(second.querySelector('time[property="as:endTime"]')).toBeNull();

    const quads = await parseRDFa(questionnaire.outerHTML);
    const o1 = `${BASE}#q1-o1`;
    expect(has(quads, `${BASE}#q1`, `${AS}anyOf`, o1)).toBe(true);
    expect(has(quads, o1, `${RDF}type`, `${AS}Event`)).toBe(true);
    expect(has(quads, o1, `${AS}startTime`, '2026-10-14T10:00:00+00:00')).toBe(true);
    expect(has(quads, o1, `${AS}endTime`, '2026-10-14T11:00:00+00:00')).toBe(true);

    timesToSlots(document);
    expect(first.querySelector('.questionnaire-slot-start').getAttribute('value')).toBe('2026-10-14T10:00');
    expect(first.querySelector('.questionnaire-slot-end').getAttribute('value')).toBe('2026-10-14T11:00');
    expect(second.querySelector('.questionnaire-slot-end').getAttribute('value')).toBe('');
    expect(first.querySelector('p').firstChild.matches('.questionnaire-control')).toBe(true);
  });

  it('drops slots left without a time on save, keeping the picked ones', () => {
    const questionnaire = mount(questionnaireHTML({ questions: slotsHTML() }));
    pick(questionnaire, 1, '2026-10-15T15:30');
    const saved = new DOMParser().parseFromString(getDocument(document.documentElement, { normalize: true }), 'text/html');
    const items = saved.querySelectorAll('#q1 li');
    expect(items).toHaveLength(1);
    expect(items[0].querySelector('time[property="as:startTime"]').getAttribute('datetime')).toBe('2026-10-15T15:30:00+00:00');
    expect(saved.querySelectorAll('input[type="datetime-local"]')).toHaveLength(0);
  });

  it('answers with the slots that work, named by their times', () => {
    const questionnaire = mount(questionnaireHTML({ questions: slotsHTML() }));
    pick(questionnaire, 0, '2026-10-14T10:00', '2026-10-14T11:00');
    pick(questionnaire, 1, '2026-10-15T15:30');
    activateQuestionnaire(questionnaire, BASE);
    questionnaire.querySelectorAll('#q1 li .questionnaire-control')[1].checked = true;
    const { answers } = collectAnswers(questionnaire, BASE);
    expect(answers).toHaveLength(1);
    expect(answers[0].option.iri).toBe(`${BASE}#q1-o2`);
    expect(answers[0].option.label).toMatch(/15:30/);
  });
});

describe('identifiers', () => {
  const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

  it('names questions and options by uuids', () => {
    const id = newQuestionId();
    expect(id).toMatch(new RegExp(`^${UUID}$`));
    document.body.innerHTML = questionHTML({ id, kind: 'single', text: 'A', options: ['One'], explanation: { text: 'Why?' } });
    expect(document.querySelector('li').id).toMatch(new RegExp(`^${UUID}$`));
    expect(document.querySelector('li').getAttribute('about')).toBe(`#${document.querySelector('li').id}`);
    expect(document.querySelector('.questionnaire-explanation [typeof]').id).toMatch(new RegExp(`^${UUID}$`));
  });

  it('names an answer by a uuid', () => {
    const [answer] = withAnswerIds([{ question: `${BASE}#q1`, content: 'x' }]);
    expect(answer.id).toMatch(new RegExp(`^${UUID}$`));
    expect(withAnswerIds([answer])[0].id).toBe(answer.id);
  });
});

describe('response document', () => {
  const answers = [
    { id: 'q1-a1', question: `${BASE}#q1`, questionText: 'Format?', option: { iri: `${BASE}#q1-o1`, label: 'HTML' } },
    { id: 'q5-a2', question: `${BASE}#q5`, questionText: 'Comments?', content: 'Great' }
  ];
  const responseIRI = 'https://alice.example/responses/r1.html';
  const html = () => responseDocumentHTML({
    responseIRI, answers, questionnaireIRI: `${BASE}#questionnaire`, questionnaireName: 'Questions',
    actor: 'https://alice.example/#me', actorName: 'Alice', published: '2026-10-07T12:00:00Z', language: 'en'
  });

  it('is formatted, one element per line', () => {
    const lines = html().split('\n');
    expect(lines.length).toBeGreaterThan(20);
    expect(lines.some(line => /^\s+<li about=/.test(line))).toBe(true);
    expect(lines.some(line => /^\s+<dl id="document-authors">/.test(line))).toBe(true);
  });

  it('is laid out like the other templates', () => {
    const doc = new DOMParser().parseFromString(html(), 'text/html');
    const article = doc.querySelector('main > article');
    expect(article.getAttribute('about')).toBe('');
    expect(article.hasAttribute('typeof')).toBe(false);
    expect(article.querySelector(':scope > h1').textContent).toBe('Response to Questions');
    const details = article.querySelector(':scope > details');
    expect(details.querySelector('summary').textContent).toBe('More details about this document');
    expect(Array.from(details.querySelectorAll('dl')).map(dl => dl.id))
      .toEqual(['document-authors', 'document-published', 'document-language', 'document-in-reply-to', 'document-type']);
    expect(article.querySelectorAll('#answers ol > li')).toHaveLength(2);
  });

  it('describes the document and its answers in RDFa', async () => {
    const doc = new DOMParser().parseFromString(html(), 'text/html');
    const quads = await new Promise((resolve, reject) => {
      const found = [];
      const parser = new RdfaParser({ baseIRI: responseIRI, contentType: 'text/html' });
      parser.on('data', q => found.push([q.subject.value, q.predicate.value, q.object.value]));
      parser.on('error', reject);
      parser.on('end', () => resolve(found));
      parser.write(doc.documentElement.outerHTML);
      parser.end();
    });
    expect(has(quads, responseIRI, `${RDF}type`, `${SCHEMA}Article`)).toBe(true);
    expect(has(quads, responseIRI, `${RDF}type`, `${AS}Collection`)).toBe(false);
    expect(has(quads, responseIRI, `${SCHEMA}creator`, 'https://alice.example/#me')).toBe(true);
    expect(has(quads, responseIRI, `${SCHEMA}author`, 'https://alice.example/#me')).toBe(true);
    expect(has(quads, responseIRI, `${SCHEMA}editor`, 'https://alice.example/#me')).toBe(false);
    expect(has(quads, responseIRI, 'http://purl.org/dc/terms/language', 'en')).toBe(true);
    expect(has(quads, responseIRI, `${SCHEMA}datePublished`, '2026-10-07T12:00:00Z')).toBe(true);
    expect(has(quads, responseIRI, `${AS}inReplyTo`, `${BASE}#questionnaire`)).toBe(true);
    const answersIRI = `${responseIRI}#answers`;
    expect(has(quads, responseIRI, `${SCHEMA}hasPart`, answersIRI)).toBe(true);
    expect(quads.some(([, p]) => p === `${RDF}first`)).toBe(false);
    expect(has(quads, answersIRI, `${RDF}type`, `${AS}Collection`)).toBe(true);
    expect(has(quads, answersIRI, `${AS}items`, `${responseIRI}#q1-a1`)).toBe(true);
    expect(has(quads, responseIRI, `${AS}items`, `${responseIRI}#q1-a1`)).toBe(false);
    expect(has(quads, `${responseIRI}#q1-a1`, `${RDF}type`, `${AS}Note`)).toBe(true);
    expect(has(quads, `${responseIRI}#q5-a2`, `${AS}content`, 'Great')).toBe(true);
    expect(quads.some(([, , o]) => /schema\.org\/(Answer|Question)$/.test(o))).toBe(false);
  });
});

describe('saved document', () => {
  const html = () => questionnaireHTML({ questions: [
    qHTML({ id: 'q1', kind: 'single', text: 'Format?', options: ['HTML', 'PDF'] }),
    qHTML({ id: 'q2', kind: 'multiple', text: 'Which?', options: ['A'], explanation: { text: 'Why?' } }),
    qHTML({ id: 'q3', kind: 'short-text', text: 'Name?' }),
    qHTML({ id: 'q4', kind: 'long-text', text: 'Comments?' })
  ].join('') });

  it('is a form with inputs, and the inputs add no triples', async () => {
    const questionnaire = mount(html());
    expect(questionnaire.querySelector('form.questionnaire-questions')).not.toBeNull();
    expect(Array.from(questionnaire.querySelectorAll('#q1 li input')).map(i => [i.type, i.name, i.value, i.getAttribute('aria-labelledby')]))
      .toEqual([['radio', 'q1', '#q1-o1', 'q1-o1'], ['radio', 'q1', '#q1-o2', 'q1-o2']]);
    expect(questionnaire.querySelectorAll('#q2 li input[type="checkbox"][name="q2"]')).toHaveLength(1);
    expect(questionnaire.querySelector('#q2x textarea').getAttribute('aria-labelledby')).toBe('q2x-text');
    expect(questionnaire.querySelector('#q3 input[type="text"]').getAttribute('aria-labelledby')).toBe('q3-text');
    expect(questionnaire.querySelectorAll('#q4 textarea')).toHaveLength(1);

    const quads = await parseRDFa(html());
    expect(has(quads, `${BASE}#q1-o1`, `${AS}name`, 'HTML')).toBe(true);
    expect(quads.some(([s]) => /-input$/.test(s))).toBe(false);
  });

  it('keeps its inputs, without answers or read mode UI, when saved from read mode', () => {
    const questionnaire = mount(html());
    activateQuestionnaire(questionnaire, BASE);
    questionnaire.querySelector('#q1 input').checked = true;
    questionnaire.querySelector('#q3 input').value = 'Ada';
    const saved = new DOMParser().parseFromString(getDocument(document.documentElement, { normalize: true }), 'text/html');
    expect(saved.querySelectorAll('#q1 li input[type="radio"]')).toHaveLength(2);
    expect(saved.querySelector('#q1 input').hasAttribute('checked')).toBe(false);
    expect(saved.querySelector('#q3 input').hasAttribute('value')).toBe(false);
    expect(saved.querySelectorAll('.do, .questionnaire-actions, select')).toHaveLength(0);
    expect(saved.querySelector('#q1-o1').textContent.trim()).toBe('HTML');
  });

  it('keeps each option on one line when formatted, so its as:name is exactly its text', async () => {
    mount(html());
    const formatted = getDocument(document.documentElement, { normalize: true, format: true });
    const saved = new DOMParser().parseFromString(formatted, 'text/html');
    expect(saved.querySelector('#q1-o1').textContent).toBe('HTML');
    const quads = await parseRDFa(saved.body.innerHTML);
    expect(has(quads, `${BASE}#q1-o1`, `${AS}name`, 'HTML')).toBe(true);
  });

  it('validates as a plain form: required radios and fields, never checkboxes', () => {
    document.body.innerHTML = questionnaireHTML({ inbox: 'https://inbox.example/', questions: [
      qHTML({ id: 'q1', kind: 'single', text: 'A', options: ['One', 'Two'], required: true }),
      qHTML({ id: 'q2', kind: 'multiple', text: 'B', options: ['One', 'Two'], required: true }),
      qHTML({ id: 'q3', kind: 'short-text', text: 'C', required: true })
    ].join('') });
    const form = document.querySelector('form.questionnaire-questions');
    expect(form.noValidate).toBe(false);
    expect(form.checkValidity()).toBe(false);
    document.querySelector('#q1-o2 input').checked = true;
    document.querySelector('#q3 input').value = 'x';
    // Checkbox questions are required only through sh:minCount.
    expect(form.checkValidity()).toBe(true);
    expect(document.querySelector('#q2').getAttribute('property')).toBe('sh:minCount');
  });

  it('saves as a form with the inbox as its action and a submit button the editor and read mode leave out', () => {
    const questionnaire = mount(questionnaireHTML({ inbox: 'https://inbox.example/', questions: qHTML({ id: 'q1', kind: 'short-text', text: 'Name?' }) }));
    const saved = new DOMParser().parseFromString(getDocument(document.documentElement, { normalize: true }), 'text/html');
    const form = saved.querySelector('form.questionnaire-questions');
    expect([form.getAttribute('action'), form.getAttribute('method')]).toEqual(['https://inbox.example/', 'post']);
    expect(form.querySelectorAll('button[type="submit"]')).toHaveLength(1);
    expect(form.lastElementChild.matches('.questionnaire-form-submit')).toBe(true);

    // No button in the live document, and saving twice adds only one.
    expect(questionnaire.querySelectorAll('button[type="submit"]')).toHaveLength(0);
    prepareSavedForm(saved);
    expect(saved.querySelectorAll('form button[type="submit"]')).toHaveLength(1);

    removeFormSubmit(saved);
    expect(saved.querySelectorAll('.questionnaire-form-submit')).toHaveLength(0);

    // In read mode dokieli's Submit replaces the plain button.
    document.body.innerHTML = saved.body.innerHTML;
    const opened = document.querySelector('section.questionnaire');
    prepareSavedForm(document);
    activateQuestionnaire(opened, BASE);
    expect(opened.querySelectorAll('.questionnaire-form-submit')).toHaveLength(0);
    expect(opened.querySelector('.questionnaire-submit')).not.toBeNull();
  });

  it('gets the controls its kind needs, also after a conversion or a split list item', () => {
    const questionnaire = mount(html());
    // A split list item has no input; a converted question has the old kind's.
    questionnaire.querySelector('#q1 ul').insertAdjacentHTML('beforeend', '<li about="#q1-o3" id="q1-o3" property="as:name" typeof="as:Note"><p>EPUB</p></li>');
    questionnaire.querySelector('#q1 ul').setAttribute('rel', 'as:anyOf');
    Object.entries({ property: 'sh:minCount', content: '1', datatype: 'xsd:integer' }).forEach(([name, value]) => questionnaire.querySelector('#q1').setAttribute(name, value));
    ensureQuestionnaireControls(document);
    // Checkboxes don't get HTML required.
    expect(Array.from(questionnaire.querySelectorAll('#q1 li input')).map(i => [i.type, i.value, i.required])).toEqual([['checkbox', '#q1-o1', false], ['checkbox', '#q1-o2', false], ['checkbox', '#q1-o3', false]]);
    questionnaire.querySelector('#q1 ul').setAttribute('rel', 'as:oneOf');
    ensureQuestionnaireControls(document);
    expect(Array.from(questionnaire.querySelectorAll('#q1 li input')).map(i => [i.type, i.required])).toEqual([['radio', true], ['radio', true], ['radio', true]]);
    questionnaire.querySelector('#q1 ul').setAttribute('rel', 'as:anyOf');
    ensureQuestionnaireControls(document);
    expect(questionnaire.querySelectorAll('#q3 input[type="text"]')).toHaveLength(1);
    ensureQuestionnaireControls(document);
    expect(questionnaire.querySelectorAll('#q1 li input')).toHaveLength(3);

    // Text typed before the input: the input moves back to the start.
    const p = questionnaire.querySelector('#q1-o1 p');
    p.append(p.querySelector('input'));
    ensureQuestionnaireControls(document);
    expect(p.firstChild.matches('input')).toBe(true);
    expect(p.textContent).toBe('HTML');
    expect(questionnaire.querySelectorAll('#q3 input[type="text"]')).toHaveLength(1);
  });
});

describe('new questionnaire', () => {
  it('has the document details the specification template has', async () => {
    setTemplateNewQuestionnaire('author');
    const details = document.querySelector('main > article > details#document-details');
    expect(details.querySelector('summary').textContent).toBe('More details about this document');
    expect(Array.from(details.querySelectorAll('dl')).map(dl => dl.id))
      .toEqual(['document-authors', 'document-published', 'document-language', 'document-type']);
    expect(details.querySelector('#document-type a').getAttribute('href')).toBe(`${SCHEMA}Question`);
    const questions = document.querySelectorAll('section.questionnaire dl[typeof~="as:Question"]');
    expect(questions).toHaveLength(1);
  });

  it('starts from placeholders, with required and explanation off', () => {
    setTemplateNewQuestionnaire('author');
    const questionnaire = document.querySelector('section.questionnaire');
    expect(questionnaire.querySelector('h2')).toBeNull();
    const question = questionnaire.querySelector('dl[typeof~="as:Question"]');
    expect(question.querySelector('.questionnaire-question-text').textContent).toBe('');
    expect(question.querySelector('.questionnaire-question-text').dataset.placeholder).toBe('Write a question');
    expect(Array.from(question.querySelectorAll('li')).map(li => [li.textContent, li.querySelector('input')?.type])).toEqual([['', 'radio'], ['', 'radio']]);
    expect(question.querySelector('ul').getAttribute('rel')).toBe('as:oneOf');
    expect(question.querySelectorAll('[required]')).toHaveLength(0);
    expect(question.querySelector('.questionnaire-explanation')).toBeNull();
    expect(document.querySelector('main > article > h1').textContent).toBe('');
  });

  it('shows an unwritten question as its placeholder in read mode, without saving it', () => {
    const questionnaire = mount(questionnaireHTML({ questions: qHTML({ id: 'q1', kind: 'short-text' }) }));
    const questionText = questionnaire.querySelector('#q1-text');
    activateQuestionnaire(questionnaire, BASE);
    expect(questionText.textContent).toBe('Write a question');
    expect(questionText.querySelector('.do')).not.toBeNull();
    expect(questionnaire.querySelector('#q1 input').getAttribute('aria-labelledby')).toBe('q1-text');
    deactivateQuestionnaire(questionnaire);
    expect(questionText.textContent).toBe('');
  });

  it('shows the placeholder for a question whose empty text the editor dropped', () => {
    const questionnaire = mount(questionnaireHTML({ questions: qHTML({ id: 'q1', kind: 'short-text' }) }));
    questionnaire.querySelector('#q1-text').remove();
    activateQuestionnaire(questionnaire, BASE);
    expect(questionnaire.querySelector('#q1').firstElementChild.textContent).toBe('Write a question');
    deactivateQuestionnaire(questionnaire);
    expect(questionnaire.querySelector('#q1 .questionnaire-question-text')).toBeNull();
  });

  it('shows the default prompt for an explanation whose empty prompt the editor dropped', () => {
    const questionnaire = mount(questionnaireHTML({ questions: qHTML({ id: 'q1', kind: 'yes-no', text: 'A', explanation: { required: true } }) }));
    questionnaire.querySelector('#q1x [property="as:name"]').remove();
    activateQuestionnaire(questionnaire, BASE);
    const explanation = questionnaire.querySelector('#q1x');
    expect(explanation.firstElementChild.textContent).toBe('Please explain your choice. Required');
    deactivateQuestionnaire(questionnaire);
    expect(explanation.querySelector('[property~="as:name"], .questionnaire-default-prompt')).toBeNull();
  });

  it('brings back what the editor dropped, with placeholders, when editing again', () => {
    // An unwritten question after cleanProseMirrorOutput.
    const questionnaire = mount(questionnaireHTML({ questions: qHTML({ id: 'q1', kind: 'single', options: [''], explanation: {} }) }));
    questionnaire.querySelector('#q1-text').remove();
    questionnaire.querySelectorAll('#q1 li').forEach(li => li.remove());
    questionnaire.querySelector('#q1x [property="as:name"]').remove();

    questionnaire.querySelector('[property="schema:description"]').replaceChildren();
    restoreQuestionParts(document);
    expect(questionnaire.querySelector('[property="schema:description"] > p').dataset.placeholder).toBe('Describe what this questionnaire is about.');
    const fieldset = questionnaire.querySelector('#q1');
    expect(fieldset.firstElementChild.matches('dt#q1-text[property="as:name"]')).toBe(true);
    expect(fieldset.firstElementChild.dataset.placeholder).toBe('Write a question');
    expect(fieldset.querySelectorAll('ul > li')).toHaveLength(1);
    expect(fieldset.querySelector('ul > li input').type).toBe('radio');
    expect(fieldset.querySelector('#q1x [property="as:name"]').dataset.placeholder).toBe('Please explain your choice.');

    restoreQuestionParts(document);
    expect(fieldset.querySelectorAll('ul > li')).toHaveLength(1);
    expect(fieldset.querySelectorAll(':scope > [property~="as:name"]')).toHaveLength(1);
  });

  it('gives an explanation without its own prompt a placeholder, read as the default prompt', () => {
    const questionnaire = mount(questionnaireHTML({ questions: qHTML({ id: 'q1', kind: 'single', text: 'A', options: ['One'], explanation: {} }) }));
    const prompt = questionnaire.querySelector('#q1x [property="as:name"]');
    expect(prompt.textContent).toBe('');
    expect(prompt.dataset.placeholder).toBe('Please explain your choice.');
    activateQuestionnaire(questionnaire, BASE);
    expect(prompt.textContent).toContain('Please explain your choice.');
    expect(questionnaire.querySelector('#q1x textarea').getAttribute('aria-labelledby')).toBe('q1x-text');
    deactivateQuestionnaire(questionnaire);
    expect(prompt.textContent).toBe('');
  });
});

describe('notification and copy', () => {
  async function triples(html, baseIRI) {
    return new Promise((resolve, reject) => {
      const found = [];
      const parser = new RdfaParser({ baseIRI, contentType: 'text/html' });
      parser.on('data', q => found.push(`${q.subject.value} ${q.predicate.value} ${q.object.value}`));
      parser.on('error', reject);
      parser.on('end', () => resolve(found));
      parser.write(`<html><body prefix="${PREFIX}">${html}</body></html>`);
      parser.end();
    });
  }

  it('carry the same triples about the response', async () => {
    const responseIRI = 'https://alice.example/responses/r1.html';
    const response = {
      responseIRI, questionnaireIRI: `${BASE}#questionnaire`, questionnaireName: 'Questions', published: '2026-10-07T12:00:00Z',
      actor: 'https://alice.example/#me', actorName: 'Alice', language: 'en',
      answers: [
        { id: 'a1', question: `${BASE}#q1`, questionText: 'Format?', option: { iri: `${BASE}#q1-o1`, label: 'HTML' } },
        { id: 'a2', question: `${BASE}#q5`, questionText: 'Comments?', content: 'Great <tool>' }
      ]
    };

    const copyDoc = new DOMParser().parseFromString(responseDocumentHTML(response), 'text/html');
    const copy = await triples(copyDoc.querySelector('main').innerHTML, responseIRI);

    // Wrapped as notifyInbox does, read against the inbox base.
    const statements = responseStatementsHTML(response).replace(/^<dl>|<\/dl>$/g, '');
    const sent = await triples(`<dl about="${responseIRI}">${statements}</dl>`, 'https://inbox.example/n1');

    const about = (list) => list.filter(t => t.startsWith(responseIRI) && !/description/.test(t)).sort();
    expect(about(sent)).toEqual(about(copy));
    expect(about(copy).length).toBeGreaterThan(10);
    expect(sent).toContain(`${responseIRI}#a1 ${AS}inReplyTo ${BASE}#q1`);
    expect(sent).toContain(`${responseIRI}#a2 ${AS}content Great <tool>`);
    expect(sent).toContain(`${responseIRI} ${RDF}type ${SCHEMA}Article`);
  });
  it('describe the response embedded in an outbox activity', async () => {
    const doc = 'https://alice.example/outbox/r1';
    const response = {
      questionnaireIRI: `${BASE}#questionnaire`, questionnaireName: 'Questions', published: '2026-10-07T12:00:00Z', language: 'en',
      answers: [{ id: 'a1', question: `${BASE}#q1`, questionText: 'Format?', option: { iri: `${BASE}#q1-o1`, label: 'HTML' } }]
    };
    const parsed = new DOMParser().parseFromString(outboxResponseHTML(response, 'r1'), 'text/html');
    const found = await triples(parsed.querySelector('main').innerHTML, doc);
    expect(found).toContain(`${doc} ${RDF}type ${AS}Create`);
    expect(found).toContain(`${doc} ${AS}object ${doc}#r1`);
    expect(found).toContain(`${doc} ${AS}target ${BASE}#questionnaire`);
    expect(found).toContain(`${doc}#r1 ${RDF}type ${SCHEMA}Article`);
    expect(found).toContain(`${doc}#a1 ${AS}inReplyTo ${BASE}#q1`);
  });
});

describe('question form', () => {
  it('keeps the explanation only for choice questions', () => {
    const values = { 'question-kind': 'long-text', 'question-text': ' Why? ', 'question-explanation': 'true', 'question-explanation-text': 'x' };
    expect(questionFromFormValues(values)).toMatchObject({ kind: 'long-text', text: 'Why?', explanation: null, required: false });
    expect(questionFromFormValues({ ...values, 'question-kind': 'yes-no', 'question-explanation-required': 'true' }).explanation)
      .toEqual({ text: 'x', required: true });
  });

  it('splits options by line', () => {
    expect(questionFromFormValues({ 'question-options': 'A\n\n B \r\nC' }).options).toEqual(['A', 'B', 'C']);
  });
});

describe('inserting in the editor', () => {
  function viewFor(html, caret) {
    const container = document.createElement('div');
    container.innerHTML = html;
    let state = EditorState.create({ doc: PMDOMParser.fromSchema(schema).parse(container) });
    if (caret) {
      let pos = null;
      state.doc.descendants((node, p) => {
        if (pos == null && node.isText && node.text.includes(caret)) pos = p + node.text.indexOf(caret) + caret.length;
      });
      state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)));
    }
    const view = { get state() { return state; }, dispatch(tr) { state = state.apply(tr); } };
    return view;
  }

  function serialize(view) {
    const out = document.createElement('div');
    out.appendChild(DOMSerializer.fromSchema(schema).serializeFragment(view.state.doc.content));
    return out;
  }

  it('adds a question after the one holding the caret', () => {
    const view = viewFor(questionnaireHTML({ questions: qHTML({ id: 'q1', kind: 'long-text', text: 'First' }) + qHTML({ id: 'q3', kind: 'long-text', text: 'Third' }) }), 'First');
    insertQuestion(view, qHTML({ id: 'q2', kind: 'long-text', text: 'Second' }));
    expect(Array.from(serialize(view).querySelectorAll('dl[typeof~="as:Question"]')).map(f => f.id)).toEqual(['q1', 'q2', 'q3']);
  });

  it('starts a questionnaire when the document has none, dropping the slash', () => {
    const view = viewFor('<p>Intro/</p>', 'Intro/');
    insertQuestion(view, qHTML({ id: 'q1', kind: 'long-text', text: 'Why?' }), { openedWithSlash: true });
    const out = serialize(view);
    expect(out.querySelector('section.questionnaire .questionnaire-questions dl#q1')).not.toBeNull();
    expect(out.textContent).not.toContain('/');
  });

  it('sets and then replaces the questionnaire inbox', () => {
    const view = viewFor(questionnaireHTML({ questions: qHTML({ id: 'q1', kind: 'long-text', text: 'Why?' }) }), 'Why?');
    setQuestionnaireInbox(view, 'https://one.example/inbox/');
    setQuestionnaireInbox(view, 'https://two.example/inbox/');
    const out = serialize(view);
    const links = out.querySelectorAll('[rel="ldp:inbox"]');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('https://two.example/inbox/');
    expect(out.querySelector('form.questionnaire-questions').getAttribute('action')).toBe('https://two.example/inbox/');
  });
});

describe('sending a response', () => {
  let questionnaire;
  const answers = [{ question: `${BASE}#q1`, questionText: 'Name?', content: 'Ada' }];
  const message = () => questionnaire.querySelector('.questionnaire-response-message').textContent;

  beforeEach(() => {
    questionnaire = mount(questionnaireHTML({ inbox: 'https://inbox.example/', questions: qHTML({ id: 'q1', kind: 'short-text', text: 'Name?' }) }));
    activateQuestionnaire(questionnaire, BASE);
    notifyInbox.mockReset();
    notifyInbox.mockResolvedValue({ location: 'https://inbox.example/n1' });
  });

  it('shows where answers go and offers the copy before the buttons', () => {
    const actions = questionnaire.querySelector('.questionnaire-actions');
    expect(actions.querySelector('.questionnaire-destination a').getAttribute('href')).toBe('https://inbox.example/');
    const order = Array.from(actions.querySelectorAll('.questionnaire-destination, .questionnaire-copy-toggle, .questionnaire-submit')).map(el => el.className);
    expect(order).toEqual(['questionnaire-destination', 'questionnaire-copy-toggle', 'questionnaire-submit']);
  });

  const storage = { kind: 'personal-storage', container: 'https://alice.example/' };
  const outbox = { kind: 'activity-outbox', container: 'https://alice.example/outbox/' };
  const created = (location) => ({ headers: new Headers(location ? { Location: location } : {}) });

  it('still sends to the inbox when saving the copy fails', async () => {
    postActivity.mockReset();
    postActivity.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    const result = await sendResponse(questionnaire, { answers, inbox: 'https://inbox.example/', locations: [storage] });
    expect(result).toMatchObject({ saved: false, sent: true });
    expect(notifyInbox).toHaveBeenCalledTimes(1);
    expect(message()).toContain('Could not save your copy in https://alice.example/');
    expect(message()).toContain('Your answers were sent.');
  });

  it('sends the full answers, not a reference to the saved copy', async () => {
    postActivity.mockReset();
    postActivity.mockResolvedValue(created('/r1'));
    const result = await sendResponse(questionnaire, { answers, inbox: 'https://inbox.example/', locations: [storage] });
    expect(result).toMatchObject({ saved: true, sent: true });
    const sent = notifyInbox.mock.calls[0][0];
    expect(sent).toMatchObject({ type: ['as:Create'], target: `${BASE}#questionnaire` });
    expect(sent.object).toMatch(/^#[0-9a-f-]{36}$/);
    expect(sent.statements).toMatch(/<li about="#[0-9a-f-]{36}" typeof="as:Note">/);
    expect(sent.statements).toContain('Ada');
    expect(sent.statements).not.toContain('https://alice.example/r1');
    expect(message()).toContain('Your copy was saved at https://alice.example/r1');
  });

  it('saves the response document as a copy', async () => {
    postActivity.mockReset();
    postActivity.mockResolvedValue(created());
    await sendResponse(questionnaire, { answers, inbox: 'https://inbox.example/', locations: [storage] });
    const [container, slug, html] = postActivity.mock.calls[0];
    expect(container).toBe('https://alice.example/');
    expect(slug).toMatch(/^[0-9a-f-]{36}$/);
    expect(html).toContain('<article about="" dir="auto">');
    expect(html).not.toContain('as:Create');
  });

  it('wraps the copy in a Created activity in the outbox', async () => {
    postActivity.mockReset();
    postActivity.mockResolvedValue(created());
    const result = await sendResponse(questionnaire, { answers, inbox: 'https://inbox.example/', locations: [outbox] });
    const [container, slug, html, options] = postActivity.mock.calls[0];
    expect(container).toBe('https://alice.example/outbox/');
    expect(options.profile).toBe('https://www.w3.org/ns/activitystreams');
    expect(html).toContain('typeof="as:Create"');
    expect(html).toContain(`<article about="#${slug}" dir="auto">`);
    expect(result.stored[0].iri).toBe(`https://alice.example/outbox/${slug}#${slug}`);
  });

  it('saves one copy per location', async () => {
    postActivity.mockReset();
    postActivity.mockResolvedValue(created());
    await sendResponse(questionnaire, { answers, inbox: 'https://inbox.example/', locations: [outbox, storage, { kind: 'selected-location', container: 'https://alice.example/' }] });
    expect(postActivity).toHaveBeenCalledTimes(2);
  });

  it('sends without saving when no copy was asked for', async () => {
    postActivity.mockReset();
    await sendResponse(questionnaire, { answers, inbox: 'https://inbox.example/' });
    expect(postActivity).not.toHaveBeenCalled();
    expect(notifyInbox).toHaveBeenCalledTimes(1);
  });

  it('shows the inbox URL as written and explains a refusal', async () => {
    notifyInbox.mockRejectedValue(Object.assign(new Error('Notification rejected with status 401'), { status: 401 }));
    const previousUser = Config.User.IRI;
    Config.User.IRI = undefined;
    try {
      await sendResponse(questionnaire, { answers, inbox: 'https://csarven.ca/inbox/' });
      expect(message()).toContain('Could not send your answers to https://csarven.ca/inbox/.');
      expect(message()).not.toContain('&#x2F;');
      expect(message()).toContain('Sign in and submit again.');
    }
    finally { Config.User.IRI = previousUser; }
  });

  it('reports a failed send', async () => {
    notifyInbox.mockRejectedValue(new Error('Network down'));
    const result = await sendResponse(questionnaire, { answers, inbox: 'https://inbox.example/' });
    expect(result.sent).toBe(false);
    expect(message()).toContain('Could not send your answers to https://inbox.example/');
  });
});
