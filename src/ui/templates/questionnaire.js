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

import { DOMParser as PMDOMParser, Slice } from 'prosemirror-model';
import Config from '../../config.js';
import { i18n } from '../../i18n.js';
import { fragmentFromString, selectArticleNode, createHTML } from '../../utils/html.js';
import { formatHTMLString } from '../../utils/normalization.js';
import { domSanitize, htmlEncode } from '../../utils/sanitization.js';
import { generateAttributeId, generateUUID, getDateTimeISO } from '../../util.js';
import { registerDocumentTransform, registerEditorParseTransform } from '../../utils/documentTransforms.js';
import { ensureDocumentPrefixes } from '../../table.js';
import { getButtonHTML } from '../buttons.js';
import { notifyInbox, postActivity, linkOutbox, showLocationDialog } from '../../activity.js';
import { createActivityHTML, targetHTML } from '../../doc.js';
import { forceTrailingSlash } from '../../uri.js';
import { prepareDocumentForTemplate, replaceDocumentBody, documentDetailsHTML } from './shared.js';

// The section has no type (the document is the schema:Question), so its class identifies it.
const QUESTIONNAIRE_CLASS = 'questionnaire';
const QUESTIONNAIRE_SELECTOR = `section.${QUESTIONNAIRE_CLASS}`;
const QUESTION_TYPEOF = 'as:Question';

// Question ids are #{questionUuid}; option and answer ids are #{answerUuid}.
export function newQuestionId() {
  return generateAttributeId();
}

export function newAnswerId() {
  return generateAttributeId();
}
const QUESTION_SELECTOR = 'dl[typeof~="as:Question"]';
const OPTIONS_SELECTOR = ':scope > dd > [rel~="as:oneOf"], :scope > dd > [rel~="as:anyOf"]';
const PREFIXES = ['as', 'ldp', 'rdf', 'schema', 'sh', 'xsd'];

export const QUESTION_KINDS = ['single', 'multiple', 'yes-no', 'dropdown', 'time-slots', 'short-text', 'long-text'];
export const CHOICE_KINDS = ['single', 'multiple', 'yes-no', 'dropdown', 'time-slots'];

// Marks a list of options to be shown as a select.
const DROPDOWN = 'questionnaire-dropdown';

let clickHandlerAttached = false;
let modeHandlerAttached = false;

function text(s) {
  return htmlEncode(s ?? '');
}

function attr(s) {
  return htmlEncode(s ?? '', { mode: 'attribute' });
}

function t(key, options) {
  return i18n.t(`questionnaire.${key}.textContent`, options);
}

export function hintHTML(kind) {
  const hintKey = kind === 'yes-no' ? 'single' : kind;
  return `<p class="questionnaire-hint">${text(t(`hint.${hintKey}`))}</p>`;
}

// Controls are in the markup so the form works without dokieli; they carry no RDFa.
const CONTROL = 'questionnaire-control';

function choiceType(kind) {
  return kind === 'multiple' || kind === 'time-slots' ? 'checkbox' : 'radio';
}

// Time slots are as:Event options with as:startTime and an optional as:endTime.
const TIME_SLOTS = 'questionnaire-time-slots';

function slotInputHTML(kind, value = '') {
  return `<input aria-label="${attr(t(`slot.${kind}`))}" class="questionnaire-slot-${kind}" type="datetime-local" value="${attr(value)}" />`;
}

export function slotOptionHTML(optionId, { name = '', required = false, start = '', end = '' } = {}) {
  return `<li about="#${optionId}" id="${optionId}" property="as:name" typeof="as:Event"><p>${optionInputHTML(optionId, name, 'checkbox', required)}${slotInputHTML('start', start)} – ${slotInputHTML('end', end)}</p></li>`;
}

// Local picker value to xsd:dateTime with this machine's UTC offset.
export function toDateTimeWithOffset(local) {
  const date = new Date(local);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(Math.abs(n)).padStart(2, '0');
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00${sign}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`;
}

// xsd:dateTime to local picker value.
export function toLocalDateTime(dateTime) {
  const date = new Date(dateTime);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatSlotTime(dateTime, withDate) {
  const options = withDate
    ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }
    : { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' };
  try { return new Intl.DateTimeFormat(Config.User?.UI?.Language || undefined, options).format(new Date(dateTime)); }
  catch { return dateTime; }
}

function timeHTML(property, dateTime, withDate) {
  return `<time content="${attr(dateTime)}" datatype="xsd:dateTime" datetime="${attr(dateTime)}" property="${property}">${text(formatSlotTime(dateTime, withDate))}</time>`;
}

function slotLists(scope) {
  const questionnaires = scope.matches?.(QUESTIONNAIRE_SELECTOR) ? [scope] : getQuestionnaires(scope);
  return questionnaires.flatMap(questionnaire => Array.from(questionnaire.querySelectorAll(`ul.${TIME_SLOTS}`)));
}

// Pickers to <time> elements, for saving and reading.
export function slotsToTimes(scope) {
  slotLists(scope).forEach(list => {
    list.querySelectorAll(':scope > li').forEach(li => {
      const startValue = li.querySelector('input.questionnaire-slot-start')?.getAttribute('value') || '';
      const endValue = li.querySelector('input.questionnaire-slot-end')?.getAttribute('value') || '';
      if (!li.querySelector('input.questionnaire-slot-start, input.questionnaire-slot-end')) return;
      const container = li.querySelector(':scope > p') || li;
      const control = container.querySelector(`.${CONTROL}`);
      const start = startValue ? toDateTimeWithOffset(startValue) : '';
      const end = endValue ? toDateTimeWithOffset(endValue) : '';
      const sameDay = start && end && start.slice(0, 10) === end.slice(0, 10);
      const html = (start ? timeHTML('as:startTime', start, true) : '')
        + (start && end ? ' – ' : '')
        + (end ? timeHTML('as:endTime', end, !sameDay) : '');
      container.replaceChildren(...(control ? [control] : []), fragmentFromString(html));
    });
  });
}

// <time> elements to pickers, for editing.
export function timesToSlots(root) {
  slotLists(root).forEach(list => {
    list.querySelectorAll(':scope > li').forEach(li => {
      if (li.querySelector('input.questionnaire-slot-start')) return;
      const value = (property) => {
        const time = li.querySelector(`time[property~="${property}"]`);
        return time ? toLocalDateTime(time.getAttribute('content') || time.getAttribute('datetime')) : '';
      };
      const container = li.querySelector(':scope > p') || li;
      const control = container.querySelector(`.${CONTROL}`);
      li.replaceChildren(fragmentFromString(`<p>${control ? control.outerHTML : ''}${slotInputHTML('start', value('as:startTime'))} – ${slotInputHTML('end', value('as:endTime'))}</p>`));
    });
  });
}

function minCountAttrs(required) {
  return required ? ' content="1" datatype="xsd:integer" property="sh:minCount"' : '';
}

function requiredAttr(required) {
  return required ? ' required=""' : '';
}

// HTML required on a checkbox would require that box, so only radios get it.
function optionInputHTML(optionId, name, type, required = false) {
  return `<input aria-labelledby="${attr(optionId)}" class="${CONTROL}" id="${attr(optionId)}-input" name="${attr(name)}"${requiredAttr(required && type === 'radio')} type="${type}" value="#${attr(optionId)}" />`;
}

function textControlHTML(id, kind, labelledBy, required = false) {
  return kind === 'short-text'
    ? `<p><input aria-labelledby="${attr(labelledBy)}" class="${CONTROL}" id="${attr(id)}-input" name="${attr(id)}"${requiredAttr(required)} type="text" /></p>`
    : `<p><textarea aria-labelledby="${attr(labelledBy)}" class="${CONTROL}" id="${attr(id)}-input" name="${attr(id)}"${requiredAttr(required)} rows="${kind === 'explanation' ? 3 : 4}"></textarea></p>`;
}

export function optionHTML(optionId, label = '', { name = '', type = 'radio', required = false } = {}) {
  const value = String(label).trim();
  return `<li about="#${optionId}" id="${optionId}" property="as:name" typeof="as:Note"><p>${optionInputHTML(optionId, name, type, required)}${text(value)}</p></li>`;
}

function optionsHTML(id, kind, options, newId, required) {
  if (kind === 'time-slots') {
    const slots = (options.length ? options : ['', '']).map(() => slotOptionHTML(newId(), { name: id, required })).join('');
    return `<ul class="${TIME_SLOTS}" rel="as:anyOf">${slots}</ul>`;
  }
  const rel = kind === 'multiple' ? 'as:anyOf' : 'as:oneOf';
  const labels = kind === 'yes-no' ? [t('option.yes'), t('option.no')] : options;
  const items = labels.map(label => optionHTML(newId(), label, { name: id, type: choiceType(kind), required })).join('');
  return `<ul${kind === 'dropdown' ? ` class="${DROPDOWN}"` : ''} rel="${rel}">${items}</ul>`;
}

export function explanationHTML({ id = newQuestionId(), text: prompt, required } = {}) {
  return `<div class="questionnaire-explanation" rel="schema:hasPart"><div about="#${id}" id="${id}" typeof="${QUESTION_TYPEOF}"${minCountAttrs(required)}><p${prompt ? '' : ` data-placeholder="${attr(t('explanation.default'))}"`} id="${id}-text" property="as:name">${text(prompt || '')}</p>${textControlHTML(id, 'explanation', `${id}-text`, required)}</div></div>`;
}

// newId makes option ids; tests pass a predictable one.
export function questionHTML({ id = newQuestionId(), kind = 'single', text: questionText = '', options = [], required = false, explanation = null, newId = generateAttributeId } = {}) {
  if (!QUESTION_KINDS.includes(kind)) kind = 'single';

  const body = CHOICE_KINDS.includes(kind) ? optionsHTML(id, kind, options, newId, required) : textControlHTML(id, kind, `${id}-text`, required);

  const followUp = (explanation && CHOICE_KINDS.includes(kind)) ? explanationHTML(explanation) : '';

  const placeholder = questionText ? '' : ` data-placeholder="${attr(t('question.placeholder'))}"`;
  return `<dl about="#${id}" class="questionnaire-question" id="${id}" typeof="${QUESTION_TYPEOF}"${minCountAttrs(required)}><dt class="questionnaire-question-text"${placeholder} id="${id}-text" property="as:name">${text(questionText)}</dt><dd>${hintHTML(kind)}${body}${followUp}</dd></dl>`;
}

export function questionnaireInboxHTML(inbox) {
  return `<dl class="questionnaire-inbox"><dt>${text(t('inbox.dt'))}</dt><dd><a href="${attr(inbox)}" rel="ldp:inbox">${text(inbox)}</a></dd></dl>`;
}

// No heading: the document title names the questionnaire.
export function questionnaireHTML({ id = 'questionnaire', inbox = '', questions = '' } = {}) {
  return `<section class="${QUESTIONNAIRE_CLASS}" id="${id}" rel="schema:hasPart" resource="#${id}"><div datatype="rdf:HTML" property="schema:description"><p data-placeholder="${attr(t('description.placeholder'))}"></p></div>${inbox ? questionnaireInboxHTML(inbox) : ''}<form${inbox ? ` action="${attr(inbox)}"` : ''} class="questionnaire-questions" method="post" rel="as:items">${questions}</form></section>`;
}

function starterQuestionsHTML() {
  return questionHTML({ kind: 'single', options: ['', ''] });
}

function languageName(language) {
  const known = Config.Languages?.[language]?.name;
  if (known) return known;
  try { return new Intl.DisplayNames([language], { type: 'language', languageDisplay: 'standard' }).of(language) || language; }
  catch { return language; }
}

// Document details as in the specification template; extra entries go before the type.
export function documentDetailsBlockHTML({ authors = [], published, language, type, extra = [] }) {
  const date = String(published).slice(0, 10);
  return documentDetailsHTML([
    ...(authors.length ? [{ id: 'document-authors', dt: text(t('details.authors')), dds: authors.map(a => `<a href="${attr(a.iri)}" rel="schema:creator schema:author" typeof="schema:Person">${text(a.name || a.iri)}</a>`) }] : []),
    { id: 'document-published', dt: text(t('details.published')), dds: [`<time content="${attr(published)}" datatype="xsd:dateTime" datetime="${attr(published)}" property="schema:datePublished">${text(date)}</time>`] },
    { id: 'document-language', dt: text(t('details.language')), dds: [`<span content="${attr(language)}" lang="" property="dcterms:language" xml:lang="">${text(languageName(language))}</span>`] },
    ...extra,
    { id: 'document-type', dt: text(t('details.document-type')), dds: [`<a href="${attr(type.iri)}" rel="rdf:type">${text(type.label)}</a>`] }
  ], { id: 'document-details', summary: text(t('details.summary')) });
}

export function setTemplateNewQuestionnaire(mode, options) {
  prepareDocumentForTemplate();
  const details = documentDetailsBlockHTML({
    authors: [{ iri: Config.User.IRI || 'https://example.org/profile/card#me', name: Config.User.Name || 'Your Name' }],
    published: new Date().toISOString(),
    language: Config.User.UI.Language || 'en',
    type: { iri: Config.ns.schema.Question.value, label: i18n.t('resource-type.questionnaire.option.textContent') }
  });
  replaceDocumentBody(`<main><article about="" dir="auto"><h1 aria-label="${attr(i18n.t('editor.new.h1.aria-label'))}" property="schema:name"></h1>${details}${questionnaireHTML({ questions: starterQuestionsHTML() })}</article></main>`);
  ensureDocumentPrefixes(PREFIXES);
}


export function tokens(value) {
  return (value || '').split(/\s+/).filter(Boolean);
}

function resolveIRI(value, base) {
  try { return new URL(value, base).href; } catch { return value; }
}

function iriOf(el, base) {
  return resolveIRI(el.getAttribute('about') || el.getAttribute('resource') || `#${el.id}`, base);
}

// The question's own controls, not its explanation's.
function ownControls(question) {
  const answers = question.querySelector(':scope > dd');
  if (!answers) return [];
  return Array.from(answers.querySelectorAll(`:scope > p > .${CONTROL}, :scope > .${CONTROL}, :scope > ul > li .${CONTROL}`))
    .filter(control => !control.classList.contains('do'));
}

function isRequired(el) {
  return tokens(el.getAttribute('property')).includes('sh:minCount') && Number(el.getAttribute('content')) >= 1;
}

function byId(root, id) {
  return Array.from(root.querySelectorAll('[id]')).find(el => el.id === id) || null;
}

function plainText(el) {
  if (!el) return '';
  const clone = el.cloneNode(true);
  clone.querySelectorAll('.do').forEach(n => n.remove());
  return clone.textContent.replace(/\s+/g, ' ').trim();
}

export function getQuestionnaires(root = document) {
  return Array.from(root.querySelectorAll(QUESTIONNAIRE_SELECTOR)).filter(el => !el.closest('.do'));
}

export function getQuestions(questionnaire) {
  return Array.from(questionnaire.querySelectorAll(QUESTION_SELECTOR)).filter(el => !el.closest('.do'));
}

export function describeQuestion(question, base = Config.DocumentURL) {
  const list = question.querySelector(OPTIONS_SELECTOR);
  const explanationEl = question.querySelector(':scope > dd > [rel~="schema:hasPart"] > div[typeof~="as:Question"]');
  const controls = ownControls(question);

  let kind;
  if (list) {
    kind = list.classList.contains(TIME_SLOTS) ? 'time-slots'
      : tokens(list.getAttribute('rel')).includes('as:anyOf') ? 'multiple'
      : list.classList.contains(DROPDOWN) ? 'dropdown' : 'single';
  }
  else if (controls.some(control => control.matches('input[type="text"]'))) kind = 'short-text';
  else kind = 'long-text';

  const options = list
    ? Array.from(list.children).filter(li => li.matches('li')).map(li => ({ id: li.id, iri: iriOf(li, base), label: plainText(li) }))
    : [];

  return {
    id: question.id,
    iri: iriOf(question, base),
    text: plainText(question.querySelector(':scope > dt')) || t('question.placeholder'),
    kind,
    required: isRequired(question),
    options,
    explanation: explanationEl
      ? { id: explanationEl.id, iri: iriOf(explanationEl, base), text: plainText(explanationEl.querySelector('[property~="as:name"]')) || t('explanation.default'), required: isRequired(explanationEl) }
      : null
  };
}

// Splitting a list item copies its id, so duplicates get uuids seeded from the original.
export function normalizeQuestionnaireIds(scope) {
  const used = new Set();
  const existing = new Set(Array.from(scope.querySelectorAll('[id]')).map(el => el.id));

  const freshId = (seed) => {
    for (let n = 1; ; n++) {
      const id = generateUUID(`${seed}#${n}`);
      if (/^\d/.test(id)) continue;
      if (!existing.has(id) && !used.has(id)) return id;
    }
  };

  getQuestionnaires(scope).forEach(questionnaire => {
    getQuestions(questionnaire).forEach(question => {
      const items = [question, ...Array.from(question.querySelectorAll(':scope > dd > [rel~="as:oneOf"] > li, :scope > dd > [rel~="as:anyOf"] > li'))];
      items.forEach((el, i) => {
        if (el !== question) {
          if (!el.getAttribute('typeof')) el.setAttribute('typeof', 'as:Note');
          if (!el.getAttribute('property')) el.setAttribute('property', 'as:name');
        }
        let id = el.id || freshId(`${question.id}#${i}`);
        if (used.has(id)) id = freshId(id);
        if (id !== el.id || el.getAttribute('about') !== `#${id}`) {
          el.id = id;
          el.setAttribute('about', `#${id}`);
        }
        used.add(id);
      });
    });
  });
}

// Gives each question the controls its kind needs, after conversions and split list items.
export function ensureControls(question) {
  const q = describeQuestion(question);
  const answers = question.querySelector(':scope > dd');
  if (!answers) return;
  const list = question.querySelector(OPTIONS_SELECTOR);
  const ownTextControls = () => Array.from(answers.querySelectorAll(`:scope > p > .${CONTROL}, :scope > .${CONTROL}`));

  if (list) {
    ownTextControls().forEach(control => (control.parentElement.matches('p') && control.parentElement.parentElement === answers ? control.parentElement : control).remove());
    // The input comes first.
    list.querySelectorAll(':scope > li').forEach(li => {
      li.querySelectorAll(`:scope > .${CONTROL}, :scope > p > .${CONTROL}`).forEach(input => input.remove());
      (li.firstElementChild?.matches('p') ? li.firstElementChild : li).insertAdjacentHTML('afterbegin', optionInputHTML(li.id, q.id, choiceType(q.kind), q.required));
    });
  }
  else {
    const wanted = q.kind === 'short-text' ? 'input' : 'textarea';
    const existing = ownTextControls();
    const fresh = textControlHTML(q.id, q.kind, `${q.id}-text`, q.required);
    if (existing.length === 1 && existing[0].matches(wanted)) {
      existing[0].outerHTML = fresh.replace(/^<p>|<\/p>$/g, '');
    }
    else {
      existing.forEach(control => (control.parentElement.matches('p') && control.parentElement.parentElement === answers ? control.parentElement : control).remove());
      textAnswerAnchor(answers)?.insertAdjacentHTML(textAnswerPosition(answers), fresh);
    }
  }

  if (q.explanation) {
    const explanation = byId(question, q.explanation.id);
    const prompt = explanation?.querySelector(':scope > [property~="as:name"]');
    if (prompt && !prompt.id) prompt.id = `${q.explanation.id}-text`;
    const existing = explanation?.querySelector(`:scope > p > .${CONTROL}, :scope > .${CONTROL}`);
    const fresh = textControlHTML(q.explanation.id, 'explanation', `${q.explanation.id}-text`, q.explanation.required);
    if (existing) existing.outerHTML = fresh.replace(/^<p>|<\/p>$/g, '');
    else explanation?.insertAdjacentHTML('beforeend', fresh);
  }
}

export function ensureQuestionnaireControls(scope) {
  getQuestionnaires(scope).forEach(questionnaire => getQuestions(questionnaire).forEach(ensureControls));
}

// Restores the parts an empty question loses when leaving the editor, with placeholders.
export function restoreQuestionParts(root) {
  getQuestionnaires(root).forEach(questionnaire => {
    const description = questionnaire.querySelector(':scope > [property~="schema:description"]');
    if (description && !plainText(description)) {
      description.replaceChildren(fragmentFromString(`<p data-placeholder="${attr(t('description.placeholder'))}"></p>`));
    }

    getQuestions(questionnaire).forEach(question => {
      const id = question.id;
      let questionText = question.querySelector(':scope > dt');
      if (!questionText) {
        question.insertAdjacentHTML('afterbegin', `<dt class="questionnaire-question-text" id="${attr(id)}-text" property="as:name"></dt>`);
        questionText = question.firstElementChild;
      }
      if (!plainText(questionText)) questionText.setAttribute('data-placeholder', t('question.placeholder'));
      if (!question.querySelector(':scope > dd')) question.insertAdjacentHTML('beforeend', '<dd></dd>');

      question.querySelectorAll(':scope > dd > [rel~="as:oneOf"], :scope > dd > [rel~="as:anyOf"]').forEach(list => {
        if (!list.querySelector(':scope > li')) list.insertAdjacentHTML('beforeend', optionHTML(newAnswerId(), '', { name: id }));
      });

      question.querySelectorAll(':scope > dd > [rel~="schema:hasPart"] > div[typeof~="as:Question"]').forEach(explanation => {
        let prompt = explanation.querySelector(':scope > [property~="as:name"]');
        if (!prompt) {
          explanation.insertAdjacentHTML('afterbegin', `<p id="${attr(explanation.id)}-text" property="as:name"></p>`);
          prompt = explanation.firstElementChild;
        }
        if (!plainText(prompt)) prompt.setAttribute('data-placeholder', t('explanation.default'));
      });

      ensureControls(question);
    });
  });
}

registerEditorParseTransform(restoreQuestionParts);

// Drops empty options, keeping at least one per question.
export function pruneEmptyOptions(scope) {
  getQuestionnaires(scope).forEach(questionnaire => {
    questionnaire.querySelectorAll('[rel~="as:oneOf"], [rel~="as:anyOf"]').forEach(list => {
      // A time slot without a time is empty.
      const slots = list.classList.contains(TIME_SLOTS);
      Array.from(list.children).forEach(li => {
        const hasTime = !!li.querySelector('time') || Array.from(li.querySelectorAll('input[type="datetime-local"]')).some(input => input.getAttribute('value'));
        const empty = slots ? !hasTime : !li.textContent.trim();
        if (li.matches('li') && empty && list.children.length > 1) li.remove();
      });
    });
  });
}

// The form posts to the inbox when used without dokieli.
export function syncFormAction(questionnaire) {
  const form = questionnaire.querySelector(':scope > form.questionnaire-questions');
  if (!form) return;
  const inbox = questionnaireInbox(questionnaire);
  if (inbox) form.setAttribute('action', inbox);
  else form.removeAttribute('action');
  form.setAttribute('method', 'post');
}

// Adds a submit button for the plain form; dokieli's Submit replaces it in read mode.
const FORM_SUBMIT = 'questionnaire-form-submit';

export function removeFormSubmit(root) {
  root.querySelectorAll(`.${FORM_SUBMIT}`).forEach(el => el.remove());
}

export function prepareSavedForm(scope) {
  getQuestionnaires(scope).forEach(questionnaire => {
    syncFormAction(questionnaire);
    removeFormSubmit(questionnaire);
    questionnaire.querySelector(':scope > form.questionnaire-questions')
      ?.insertAdjacentHTML('beforeend', `<p class="${FORM_SUBMIT}"><button type="submit">${text(t('submit.button'))}</button></p>`);
  });
}

registerDocumentTransform(pruneEmptyOptions);
registerDocumentTransform(normalizeQuestionnaireIds);
registerDocumentTransform(ensureQuestionnaireControls);
registerDocumentTransform(slotsToTimes);
registerEditorParseTransform(timesToSlots);
registerDocumentTransform(prepareSavedForm);
registerEditorParseTransform(removeFormSubmit);

// In read mode only a dropdown gets a select over its options.

// Text answers go after the hint.
function textAnswerAnchor(answers) {
  return answers?.querySelector(':scope > .questionnaire-hint') || answers;
}

function textAnswerPosition(answers) {
  return answers?.querySelector(':scope > .questionnaire-hint') ? 'afterend' : 'afterbegin';
}

function activateQuestion(question, base) {
  const q = describeQuestion(question, base);
  const answers = question.querySelector(':scope > dd');
  let questionText = question.querySelector(':scope > dt');

  // An unwritten question shows its placeholder; the text is .do, so it isn't saved.
  if (!questionText) {
    question.insertAdjacentHTML('afterbegin', `<dt class="do questionnaire-question-text questionnaire-default-prompt">${text(t('question.placeholder'))}</dt>`);
    questionText = question.firstElementChild;
  }
  else if (!plainText(questionText)) {
    questionText.insertAdjacentHTML('afterbegin', `<span class="do questionnaire-default-prompt">${text(t('question.placeholder'))}</span>`);
  }

  if (q.required && questionText) {
    questionText.insertAdjacentHTML('beforeend', ` <span class="do questionnaire-required">${text(t('required'))}</span>`);
  }

  ensureControls(question);

  if (q.kind === 'dropdown') {
    const list = question.querySelector(OPTIONS_SELECTOR);
    const optionsHTML = q.options.map(o => `<option value="${attr(o.iri)}">${text(o.label)}</option>`).join('');
    list.insertAdjacentHTML('afterend', `<select aria-labelledby="${attr(q.id)}-text" class="do ${CONTROL}" name="${attr(q.id)}"><option value="">${text(t('select.placeholder'))}</option>${optionsHTML}</select>`);
  }

  if (q.explanation) {
    const el = byId(question, q.explanation.id);
    const required = q.explanation.required ? ` <span class="do questionnaire-required">${text(t('required'))}</span>` : '';
    let prompt = el?.querySelector('[property~="as:name"]');
    // An empty prompt shows the default one; the text is .do, so it isn't saved.
    if (el && !prompt) {
      el.insertAdjacentHTML('afterbegin', `<p class="do questionnaire-default-prompt">${text(t('explanation.default'))}</p>`);
      prompt = el.firstElementChild;
    }
    else if (prompt && !plainText(prompt)) prompt.insertAdjacentHTML('afterbegin', `<span class="do questionnaire-default-prompt">${text(t('explanation.default'))}</span>`);
    prompt?.insertAdjacentHTML('beforeend', required);
  }
}

function actionsHTML(questionnaire, base) {
  const inbox = questionnaireInbox(questionnaire);
  const copyId = `${questionnaire.id || 'questionnaire'}-copy`;
  const destination = inbox
    ? `${text(t('dialog.sent-to'))} <a dir="ltr" href="${attr(inbox)}" rel="noopener" target="_blank">${text(inbox)}</a>`
    : text(t('error.no-inbox'));
  return `<div class="do questionnaire-actions" data-base="${attr(base)}">`
    + `<p class="questionnaire-destination">${destination}</p>`
    + `<p class="questionnaire-copy"><input class="questionnaire-copy-toggle" id="${attr(copyId)}" type="checkbox" /> <label for="${attr(copyId)}">${text(t('dialog.copy.label'))}</label> <span class="questionnaire-copy-location" hidden=""></span></p>`
    + `<button class="questionnaire-clear" type="button">${text(t('clear.button'))}</button> <button class="questionnaire-submit" type="button">${text(t('submit.button'))}</button> <span aria-live="polite" class="questionnaire-status"></span>`
    + `<div aria-live="polite" class="questionnaire-response-message"></div></div>`;
}

export function activateQuestionnaire(questionnaire, base = Config.DocumentURL) {
  if (questionnaire.querySelector('.questionnaire-actions')) return;
  slotsToTimes(questionnaire);
  removeFormSubmit(questionnaire);
  syncFormAction(questionnaire);
  getQuestions(questionnaire).forEach(question => activateQuestion(question, base));
  questionnaire.insertAdjacentHTML('beforeend', actionsHTML(questionnaire, base));
  updateReadiness(questionnaire);
}

function actionsOf(questionnaire) {
  return questionnaire.querySelector('.questionnaire-actions');
}

function baseOf(questionnaire) {
  return actionsOf(questionnaire)?.dataset.base || Config.DocumentURL;
}

// Ready when required answers are given; warnings update live after a submit attempt.
export function updateReadiness(questionnaire) {
  const actions = actionsOf(questionnaire);
  if (!actions) return null;
  const { answers, missing } = collectAnswers(questionnaire, baseOf(questionnaire));
  const ready = !missing.length && answers.length > 0;

  actions.querySelector('.questionnaire-submit')?.classList.toggle('questionnaire-ready', ready);
  const status = actions.querySelector('.questionnaire-status');
  if (status) {
    status.textContent = ready ? t('status.ready')
      : missing.length ? t('status.missing', { count: missing.length })
      : t('status.empty');
  }

  if ('attempted' in actions.dataset) showMissing(questionnaire, missing, { focus: false });
  return { ready, answers, missing };
}

export function deactivateQuestionnaire(questionnaire) {
  questionnaire.querySelectorAll('.do.questionnaire-control, .questionnaire-required, .questionnaire-default-prompt, .questionnaire-actions, .questionnaire-error').forEach(el => el.remove());
}

export function activateQuestionnaires(root = document) {
  slotsToTimes(root);
  pruneEmptyOptions(root);
  normalizeQuestionnaireIds(root);
  getQuestionnaires(root).forEach(questionnaire => activateQuestionnaire(questionnaire));
}

function textControlIn(container) {
  return container?.querySelector(`:scope > p > .${CONTROL}, :scope > .${CONTROL}`) || null;
}

function textAnswer(control, iri) {
  const value = control?.value.trim();
  return value ? [{ question: iri, content: value }] : [];
}

export function collectAnswers(questionnaire, base = Config.DocumentURL) {
  const answers = [];
  const missing = [];

  getQuestions(questionnaire).forEach(question => {
    const q = describeQuestion(question, base);
    let own = [];

    if (CHOICE_KINDS.includes(q.kind)) {
      const select = question.querySelector(`select.${CONTROL}`);
      const chosen = select
        ? q.options.filter(o => o.iri === select.value)
        : q.options.filter(o => byId(question, o.id)?.querySelector(`input.${CONTROL}`)?.checked);
      own = chosen.map(option => ({ question: q.iri, questionText: q.text, option: { iri: option.iri, label: option.label } }));
      if (q.required && !own.length) missing.push(q.id);
    }
    else {
      own = textAnswer(textControlIn(question.querySelector(':scope > dd')), q.iri).map(a => ({ ...a, questionText: q.text }));
      if (q.required && !own.length) missing.push(q.id);
    }

    answers.push(...own);

    if (q.explanation) {
      const explained = textAnswer(textControlIn(byId(question, q.explanation.id)), q.explanation.iri).map(a => ({ ...a, questionText: q.explanation.text }));
      if (q.explanation.required && !explained.length && !missing.includes(q.id)) missing.push(q.id);
      answers.push(...explained);
    }
  });

  return { answers, missing };
}

export function clearAnswers(questionnaire) {
  questionnaire.querySelectorAll(`.${CONTROL}`).forEach(c => {
    if (c.type === 'radio' || c.type === 'checkbox') c.checked = false;
    else c.value = '';
  });
  questionnaire.querySelectorAll('.questionnaire-error').forEach(el => el.remove());
  const message = questionnaire.querySelector('.questionnaire-response-message');
  if (message) message.replaceChildren();
  const actions = actionsOf(questionnaire);
  if (actions) delete actions.dataset.attempted;
  updateReadiness(questionnaire);
}

// Same answer ids for the stored copies and the notification.
export function withAnswerIds(answers) {
  return answers.map(a => a.id ? a : { ...a, id: newAnswerId() });
}

function answerIRI(responseIRI, answer) {
  return `${String(responseIRI).split('#')[0]}#${answer.id || newAnswerId()}`;
}

function answerItemsHTML(responseIRI, answers) {
  return answers.map(a => {
    const value = a.option
      ? `<a href="${attr(a.option.iri)}" property="as:name" rel="rdf:value">${text(a.option.label)}</a>`
      : `<span property="as:content">${text(a.content)}</span>`;
    return `<li about="${attr(answerIRI(responseIRI, a))}" typeof="as:Note"><a href="${attr(a.question)}" rel="as:inReplyTo">${text(a.questionText || a.question)}</a>: ${value}</li>`;
  }).join('');
}

export function responseBodyHTML({ responseIRI, questionnaireIRI, questionnaireName, answers, actor = null, actorName = null, published, language = document.documentElement.lang || Config.User?.UI?.Language || 'en' }) {
  const title = t('response.title', { name: questionnaireName });
  const base = String(responseIRI).split('#')[0];

  const details = documentDetailsBlockHTML({
    authors: actor ? [{ iri: actor, name: actorName }] : [],
    published,
    language,
    type: { iri: Config.ns.schema.Article.value, label: i18n.t('resource-type.article.option.textContent') },
    extra: [{ id: 'document-in-reply-to', dt: text(t('details.in-reply-to')), dds: [`<a href="${attr(questionnaireIRI)}" rel="as:inReplyTo">${text(questionnaireName)}</a>`] }]
  });

  const answersSection = `<section id="answers" rel="schema:hasPart" resource="${attr(base)}#answers" typeof="as:Collection"><h2 property="schema:name">${text(t('response.answers'))}</h2><ol rel="as:items">${answerItemsHTML(responseIRI, answers)}</ol></section>`;

  return `<h1 property="schema:name">${text(title)}</h1>${details}${answersSection}`;
}

export function responseDocumentHTML(response) {
  const title = t('response.title', { name: response.questionnaireName });
  const prefix = ['as', 'dcterms', 'rdf', 'schema', 'xsd'].map(p => `${p}: ${Config.ns[p]('').value}`).join(' ');
  return formatHTMLString(createHTML(title, `<article about="" dir="auto">${responseBodyHTML(response)}</article>`, { prefix }));
}

// In an outbox the response is the object of a Create activity, as with annotations.
export function outboxResponseHTML(response, id) {
  const object = `#${id}`;
  const title = t('response.title', { name: response.questionnaireName });
  const prefix = ['as', 'dcterms', 'rdf', 'schema', 'xsd'].map(p => `${p}: ${Config.ns[p]('').value}`).join(' ');
  const statements = `<article about="${attr(object)}" dir="auto">${responseBodyHTML({ ...response, responseIRI: object })}</article>`;
  const activity = createActivityHTML({ type: ['as:Create'], object, target: response.questionnaireIRI, statements });
  return formatHTMLString(createHTML(title, activity, { prefix }));
}

// Used only when no copy could be stored.
export function responseStatementsHTML(response) {
  return `<dl><dt>${text(t('response.title', { name: response.questionnaireName }))}</dt><dd>${responseBodyHTML(response)}</dd></dl>`;
}

function questionnaireInbox(questionnaire) {
  const link = Array.from(questionnaire.querySelectorAll('[rel~="ldp:inbox"]')).find(n => !n.closest('.do'));
  const value = link?.getAttribute('href') || link?.getAttribute('resource');
  if (value) return resolveIRI(value, Config.DocumentURL);
  return Config.Resource?.[Config.DocumentURL]?.inbox?.[0] || null;
}

function showMessage(questionnaire, html) {
  const message = questionnaire.querySelector('.questionnaire-response-message');
  if (message) message.setHTMLUnsafe(domSanitize(html));
}

function showMissing(questionnaire, missing, { focus = true } = {}) {
  // Keeps existing warnings so screen readers don't repeat them.
  questionnaire.querySelectorAll('.questionnaire-error').forEach(el => {
    if (!missing.includes(el.closest(QUESTION_SELECTOR)?.id)) el.remove();
  });
  missing.forEach(id => {
    const answers = byId(questionnaire, id)?.querySelector(':scope > dd');
    if (answers && !answers.querySelector(':scope > .questionnaire-error')) {
      answers.insertAdjacentHTML('beforeend', `<p class="do questionnaire-error" role="alert">${text(t('error.required'))}</p>`);
    }
  });
  if (focus) byId(questionnaire, missing[0])?.querySelector('.questionnaire-control')?.focus();
}

export function submitQuestionnaire(questionnaire) {
  const actions = actionsOf(questionnaire);
  if (actions) actions.dataset.attempted = '';
  const { answers, missing } = collectAnswers(questionnaire, baseOf(questionnaire));

  if (missing.length) {
    showMissing(questionnaire, missing);
    return;
  }
  questionnaire.querySelectorAll('.questionnaire-error').forEach(el => el.remove());

  if (!answers.length) {
    showMessage(questionnaire, `<p class="error">${text(t('error.no-answers'))}</p>`);
    return;
  }

  const inbox = questionnaireInbox(questionnaire);
  if (!inbox) {
    showMessage(questionnaire, `<p class="error">${text(t('error.no-inbox'))}</p>`);
    return;
  }

  const submit = actions?.querySelector('.questionnaire-submit');
  if (submit) submit.disabled = true;
  showMessage(questionnaire, '');

  return sendResponse(questionnaire, { answers, inbox, locations: copyLocationsOf(questionnaire) })
    .finally(() => { if (submit) submit.disabled = false; });
}

// The notification always carries the full answers; stored copies are backups it doesn't refer to.
export async function sendResponse(questionnaire, { answers: given, inbox, locations = [] }) {
  const answers = withAnswerIds(given);
  const message = questionnaire.querySelector('.questionnaire-response-message');
  const say = (html) => message?.setHTMLUnsafe(domSanitize((message.getHTML?.() ?? message.innerHTML) + html));
  const detail = (error) => text([error?.status, error?.message].filter(Boolean).join(' '));

  const questionnaireIRI = iriOf(questionnaire, baseOf(questionnaire));
  const questionnaireName = plainText(questionnaire.querySelector('[property~="schema:name"]'))
    || plainText(questionnaire.closest('article')?.querySelector(':scope > h1'))
    || questionnaireIRI;
  const actor = Config.User?.IRI || null;
  const published = getDateTimeISO();

  const response = { questionnaireIRI, questionnaireName, answers, actor, actorName: Config.User?.Name || null, published };
  const id = generateAttributeId();

  const stored = [];
  const used = new Set();
  for (const location of uniqueLocations(locations)) {
    try {
      // The server names a second resource in the same container.
      const slug = used.has(location.container) ? null : id;
      used.add(location.container);
      const iri = await storeResponse(location, id, response, slug);
      stored.push({ ...location, iri });
      say(`<p class="success">${text(t('success.copy-saved'))} <a href="${attr(iri)}" rel="noopener" target="_blank">${text(iri)}</a></p>`);
    }
    catch (error) {
      console.error('Could not save the questionnaire response copy:', error);
      say(`<p class="error">${text(t('error.copy-not-saved', { location: location.container }))} ${detail(error)}</p>`);
    }
  }

  const responseIRI = `#${id}`;
  const statements = responseStatementsHTML({ ...response, responseIRI });

  try {
    const result = await notifyInbox({ type: ['as:Create'], inbox, object: responseIRI, target: questionnaireIRI, statements });
    const location = result?.location || inbox;
    say(`<p class="success">${text(t('success.sent'))} <a href="${attr(location)}" rel="noopener" target="_blank">${text(location)}</a></p>`);
    return { saved: stored.length > 0, stored, sent: true, responseIRI };
  }
  catch (error) {
    console.error('Could not send the questionnaire response:', error);
    const reason = error?.status === 401 && !actor ? 'unauthenticated'
      : [401, 403].includes(error?.status) ? 'forbidden' : null;
    const hint = reason ? ` ${text(t(`error.not-sent.${reason}`))}` : '';
    say(`<p class="error">${text(t('error.not-sent', { inbox }))}${hint} ${detail(error)}</p>`);
    return { saved: stored.length > 0, stored, sent: false, responseIRI };
  }
}

// Resolves the response IRI: the created resource, or the activity's object in an outbox.
export async function storeResponse({ kind, container }, id, response, slug = id) {
  const outbox = kind === 'activity-outbox';
  const expected = `${container}${slug || id}`;
  const html = outbox
    ? outboxResponseHTML(response, id)
    : responseDocumentHTML({ ...response, responseIRI: '' });
  const options = { contentType: 'text/html', subjectURI: expected };
  if (outbox) options.profile = 'https://www.w3.org/ns/activitystreams';
  const result = await postActivity(container, slug, html, options);
  const location = result?.headers?.get?.('Location');
  const created = location ? new URL(location, container).href : expected;
  return outbox ? `${created}#${id}` : created;
}

// Personal storage, outbox and selected locations.
function copyLocationChoices(selected = []) {
  const choices = [];
  const storage = Config.User?.Storage?.[0];
  const outbox = Config.User?.Outbox?.[0];
  if (storage) choices.push({ kind: 'personal-storage', container: forceTrailingSlash(storage) });
  if (outbox) choices.push({ kind: 'activity-outbox', container: forceTrailingSlash(outbox) });
  selected.filter(l => l.kind === 'selected-location').forEach(l => choices.push(l));
  return choices;
}

function sameLocation(a, b) {
  return a.kind === b.kind && a.container === b.container;
}

export function copyLocationsOf(questionnaire) {
  try { return JSON.parse(actionsOf(questionnaire)?.dataset.copy || '[]'); }
  catch { return []; }
}

// One response document per container; an outbox activity is a separate resource.
function copyKey(location) {
  return `${location.kind === 'activity-outbox' ? 'activity' : 'document'} ${location.container}`;
}

function uniqueLocations(locations) {
  return locations.filter((l, i) => locations.findIndex(o => copyKey(o) === copyKey(l)) === i);
}

function setCopyLocations(questionnaire, locations) {
  const actions = actionsOf(questionnaire);
  if (!actions) return;
  const toggle = actions.querySelector('.questionnaire-copy-toggle');
  const shown = actions.querySelector('.questionnaire-copy-location');
  toggle.checked = locations.length > 0;
  if (locations.length) {
    actions.dataset.copy = JSON.stringify(locations);
    shown.hidden = false;
    const links = locations.map(l => `<a dir="ltr" href="${attr(l.container)}" rel="noopener" target="_blank">${text(l.container)}</a>`).join(', ');
    shown.setHTMLUnsafe(domSanitize(`${text(t('copy.location'))} ${links} <button class="questionnaire-copy-change" type="button">${text(t('copy.change.button'))}</button>`));
  }
  else {
    delete actions.dataset.copy;
    shown.hidden = true;
    shown.replaceChildren();
  }
}

function copyLocationItemHTML(location, checked) {
  const id = `questionnaire-copy-${location.kind}-${generateUUID(location.container).slice(0, 8)}`;
  const label = location.kind === 'selected-location' ? t('copy-dialog.selected-location.label') : i18n.t(`annotation-location.${location.kind}.label.textContent`);
  return `<li><input${checked ? ' checked=""' : ''} data-container="${attr(location.container)}" data-kind="${attr(location.kind)}" id="${attr(id)}" type="checkbox" /><label for="${attr(id)}">${text(label)}</label>${targetHTML(location.container)}</li>`;
}

// Closing without choosing keeps the previous choice.
function showCopyLocationDialog(questionnaire) {
  const id = 'questionnaire-copy-dialog';
  document.getElementById(id)?.remove();

  const buttonClose = getButtonHTML({ key: 'dialog.questionnaire-copy.close.button', button: 'close', buttonClass: 'close', iconSize: 'fa-2x' });
  const previous = copyLocationsOf(questionnaire);
  let checked = previous.length ? previous : copyLocationChoices().slice(0, 1);
  let choices = copyLocationChoices(previous);

  document.body.appendChild(fragmentFromString(`
    <aside aria-labelledby="${id}-label" class="do on" dir="${Config.User.UI.LanguageDir}" id="${id}" lang="${Config.User.UI.Language}" xml:lang="${Config.User.UI.Language}">
      <h2 id="${id}-label">${text(t('copy-dialog.h2'))}</h2>
      ${buttonClose}
      <div class="info"></div>
      <div class="questionnaire-copy-locations"></div>
      <div class="response-message" aria-live="polite"></div>
      <p><button class="cancel questionnaire-copy-cancel" type="button">${text(t('copy-dialog.cancel.button'))}</button><button class="questionnaire-copy-use" type="button">${text(t('copy-dialog.use.button'))}</button></p>
    </aside>
  `));

  const dialog = document.getElementById(id);
  const list = dialog.querySelector('.questionnaire-copy-locations');

  const currentlyChecked = () => Array.from(list.querySelectorAll('input[data-kind]:checked'))
    .map(input => ({ kind: input.dataset.kind, container: input.dataset.container }));

  const render = () => {
    const items = choices.map(c => copyLocationItemHTML(c, checked.some(l => sameLocation(l, c)))).join('');
    const none = choices.length ? '' : `<p>${text(t('copy-dialog.no-locations'))}</p>`;
    const setups = [];
    if (!choices.some(c => c.kind === 'activity-outbox') && Config.User?.IRI && Config.User?.Storage?.length) {
      setups.push(`<li><button data-location="activity-outbox" type="button">${text(i18n.t('annotation-location-setup.activity-outbox.button.textContent'))}</button></li>`);
    }
    setups.push(`<li><button data-location="select-location" type="button">${text(t('copy-dialog.select-location.button'))}</button></li>`);
    list.setHTMLUnsafe(domSanitize(`${items ? `<ul class="questionnaire-copy-choices">${items}</ul>` : ''}${none}<ul class="questionnaire-copy-setup">${setups.join('')}</ul>`));
    updateUse();
  };
  const updateUse = () => {
    dialog.querySelector('.questionnaire-copy-use').disabled = !list.querySelector('input[data-kind]:checked');
  };
  dialog.addEventListener('change', updateUse);
  render();

  const close = (locations) => {
    setCopyLocations(questionnaire, locations);
    dialog.remove();
    actionsOf(questionnaire)?.querySelector('.questionnaire-copy-toggle')?.focus();
  };

  dialog.addEventListener('click', async (e) => {
    if (e.target.closest('button.close, .questionnaire-copy-cancel')) {
      e.preventDefault();
      close(previous);
      return;
    }

    const setup = e.target.closest('.questionnaire-copy-setup button');
    if (setup) {
      e.preventDefault();
      checked = currentlyChecked();
      const storage = Config.User?.Storage?.[0];
      const start = storage ? forceTrailingSlash(storage) : '';
      const say = (html) => dialog.querySelector('.response-message').setHTMLUnsafe(domSanitize(html));
      say('');
      let location;
      try {
        if (setup.dataset.location === 'activity-outbox') {
          const outbox = await linkOutbox();
          if (outbox) location = { kind: 'activity-outbox', container: forceTrailingSlash(outbox) };
        }
        else {
          const container = await showLocationDialog('answers-location', start, 'setup');
          if (container) location = { kind: 'selected-location', container: forceTrailingSlash(container) };
        }
      }
      catch (error) {
        console.error('Could not set up the location:', error);
        const reason = text([error?.status, error?.message].filter(Boolean).join(' '));
        // An unlinked outbox can still store this copy.
        if (setup.dataset.location === 'activity-outbox' && error?.container) {
          location = { kind: 'activity-outbox', container: forceTrailingSlash(error.container) };
          say(`<p class="warning">${text(t('error.outbox-not-linked'))} ${reason}</p>`);
        }
        else {
          say(`<p class="error">${text(t('error.location-not-set'))} ${reason}</p>`);
        }
      }
      // Keeps locations added in this dialog and ticks the new one.
      const known = copyLocationChoices();
      choices = [...known, ...choices.filter(c => !known.some(o => sameLocation(o, c)))];
      if (location) {
        if (!choices.some(c => sameLocation(c, location))) choices.push(location);
        if (!checked.some(c => sameLocation(c, location))) checked.push(location);
      }
      render();
      return;
    }

    if (e.target.closest('.questionnaire-copy-use')) {
      e.preventDefault();
      const locations = uniqueLocations(currentlyChecked());
      if (!locations.length) {
        dialog.querySelector('.response-message').setHTMLUnsafe(domSanitize(`<p class="error">${text(t('error.missing-location'))}</p>`));
        return;
      }
      close(locations);
    }
  });
}


export function attrsOf(node) {
  return node.attrs?.originalAttributes || {};
}

export function isQuestionnaireNode(node) {
  return node.type.name === 'section' && tokens(attrsOf(node).class).includes(QUESTIONNAIRE_CLASS);
}

export function isQuestionsContainer(node) {
  return node.type.name === 'form' && tokens(attrsOf(node).class).includes('questionnaire-questions');
}

export function isInboxList(node) {
  return node.type.name === 'dl' && tokens(attrsOf(node).class).includes('questionnaire-inbox');
}

function findAncestor($pos, predicate) {
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (predicate(node)) return { node, depth, pos: $pos.before(depth) };
  }
  return null;
}

function findFirst(doc, predicate, from = 0, to = doc.content.size) {
  let found = null;
  doc.nodesBetween(from, to, (node, pos) => {
    if (found) return false;
    if (predicate(node)) { found = { node, pos }; return false; }
  });
  return found;
}

export function parseNodes(schema, html) {
  return PMDOMParser.fromSchema(schema).parseSlice(fragmentFromString(html)).content;
}

function dropSlash(tr, openedWithSlash) {
  const from = tr.selection.from;
  if (openedWithSlash && from > 0 && tr.doc.textBetween(from - 1, from) === '/') {
    tr.delete(from - 1, from);
  }
  return tr;
}

// The empty line the slash was typed on, if removing it leaves the parent valid.
function emptyLineRange(tr) {
  const { $from } = tr.selection;
  const line = $from.parent;
  if (!line.isTextblock || line.content.size || $from.depth < 2 || $from.node(-1).childCount < 2) return null;
  return { from: $from.before(), to: $from.after() };
}

function removeRange(tr, range) {
  if (range) tr.delete(tr.mapping.map(range.from), tr.mapping.map(range.to));
}

// After the question at the caret, else at the end of the first questionnaire, else a new one.
export function insertQuestion(view, html, { openedWithSlash = false } = {}) {
  const { schema } = view.state;
  const tr = dropSlash(view.state.tr, openedWithSlash);
  const $from = tr.selection.$from;
  const container = findAncestor($from, isQuestionsContainer);
  const emptyLine = openedWithSlash ? emptyLineRange(tr) : null;

  if (container) {
    const childDepth = container.depth + 1;
    const pos = $from.depth >= childDepth ? $from.after(childDepth) : container.pos + container.node.nodeSize - 1;
    tr.insert(pos, parseNodes(schema, html));
    removeRange(tr, emptyLine);
  }
  else {
    const existing = findFirst(tr.doc, isQuestionsContainer);
    if (existing) {
      tr.insert(existing.pos + existing.node.nodeSize - 1, parseNodes(schema, html));
      removeRange(tr, emptyLine);
    }
    else {
      tr.replaceSelection(new Slice(parseNodes(schema, questionnaireHTML({ questions: html })), 0, 0));
    }
  }

  view.dispatch(tr.scrollIntoView());
  ensureDocumentPrefixes(PREFIXES);
}

// Replaces the questionnaire's inbox entry, or adds one before its questions.
export function setQuestionnaireInbox(view, inbox, { openedWithSlash = false } = {}) {
  const { schema } = view.state;
  const tr = dropSlash(view.state.tr, openedWithSlash);
  const inboxNodes = parseNodes(schema, questionnaireInboxHTML(inbox));
  const questionnaire = findAncestor(tr.selection.$from, isQuestionnaireNode) || findFirst(tr.doc, isQuestionnaireNode);
  const emptyLine = openedWithSlash ? emptyLineRange(tr) : null;

  if (!questionnaire) {
    tr.replaceSelection(new Slice(parseNodes(schema, questionnaireHTML({ inbox })), 0, 0));
  }
  else {
    const start = questionnaire.pos + 1;
    const end = questionnaire.pos + questionnaire.node.nodeSize - 1;
    const existing = findFirst(tr.doc, isInboxList, start, end);
    if (existing) {
      tr.replaceWith(existing.pos, existing.pos + existing.node.nodeSize, inboxNodes);
    }
    else {
      const questions = findFirst(tr.doc, isQuestionsContainer, start, end);
      tr.insert(questions ? questions.pos : end, inboxNodes);
    }
    removeRange(tr, emptyLine);

    const updated = findAncestor(tr.doc.resolve(tr.mapping.map(questionnaire.pos) + 1), isQuestionnaireNode);
    const form = updated && findFirst(tr.doc, isQuestionsContainer, updated.pos + 1, updated.pos + updated.node.nodeSize - 1);
    if (form) {
      tr.setNodeMarkup(form.pos, null, { ...form.node.attrs, originalAttributes: { ...attrsOf(form.node), action: inbox, method: 'post' } });
    }
  }

  view.dispatch(tr.scrollIntoView());
  ensureDocumentPrefixes(PREFIXES);
}

export function questionFormHTML() {
  const f = (key) => text(i18n.t(`editor.question.form.${key}.textContent`));
  const kindOptions = QUESTION_KINDS.map(kind => `<option value="${kind}">${f(`kind.${kind}`)}</option>`).join('');

  return `
    <fieldset class="questionnaire-question-form">
      <legend>${f('legend')}</legend>
      <label for="question-text">${f('text')}</label> <input class="editor-form-input" dir="auto" id="question-text" name="question-text" required="" type="text" value="" />
      <label for="question-kind">${f('kind')}</label> <select class="editor-form-select" id="question-kind" name="question-kind">${kindOptions}</select>
      <div data-when-kind="single multiple dropdown">
        <label for="question-options">${f('options')}</label> <textarea class="editor-form-input" dir="auto" id="question-options" name="question-options" placeholder="${attr(i18n.t('editor.question.form.options.placeholder'))}" rows="4"></textarea>
      </div>
      <p><input id="question-required" name="question-required" type="checkbox" value="true" /> <label for="question-required">${f('required')}</label></p>
      <div data-when-kind="single multiple yes-no dropdown time-slots">
        <p><input id="question-explanation" name="question-explanation" type="checkbox" value="true" /> <label for="question-explanation">${f('explanation')}</label></p>
        <div data-when-explanation="" hidden="">
          <label for="question-explanation-text">${f('explanation-text')}</label> <input class="editor-form-input" dir="auto" id="question-explanation-text" name="question-explanation-text" placeholder="${attr(t('explanation.default'))}" type="text" value="" />
          <p><input id="question-explanation-required" name="question-explanation-required" type="checkbox" value="true" /> <label for="question-explanation-required">${f('explanation-required')}</label></p>
        </div>
      </div>
      <div>
        <button class="editor-form-submit" data-i18n="editor.toolbar.form.save.button" type="submit">${text(i18n.t('editor.toolbar.form.save.button.textContent'))}</button>
        <button class="editor-form-cancel" data-i18n="editor.toolbar.form.cancel.button" type="button">${text(i18n.t('editor.toolbar.form.cancel.button.textContent'))}</button>
      </div>
    </fieldset>
  `;
}

// Shows only the fields the chosen kind uses.
export function wireQuestionForm(form) {
  const kindSelect = form.querySelector('[name="question-kind"]');
  const explanation = form.querySelector('[name="question-explanation"]');
  const sync = () => {
    const kind = kindSelect.value;
    form.querySelectorAll('[data-when-kind]').forEach(el => {
      el.hidden = !el.dataset.whenKind.split(' ').includes(kind);
    });
    form.querySelectorAll('[data-when-explanation]').forEach(el => {
      el.hidden = !explanation.checked;
    });
  };
  kindSelect.addEventListener('change', sync);
  explanation.addEventListener('change', sync);
  sync();
}

export function questionFromFormValues(values) {
  const kind = QUESTION_KINDS.includes(values['question-kind']) ? values['question-kind'] : 'single';
  const explanation = values['question-explanation'] === 'true' && CHOICE_KINDS.includes(kind)
    ? { text: (values['question-explanation-text'] || '').trim(), required: values['question-explanation-required'] === 'true' }
    : null;

  return {
    kind,
    text: (values['question-text'] || '').trim(),
    options: String(values['question-options'] || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean),
    required: values['question-required'] === 'true',
    explanation
  };
}

export function questionnaireInboxFormHTML() {
  const f = (key) => text(i18n.t(`editor.questionnaire-inbox.form.${key}.textContent`));
  return `
    <fieldset>
      <legend>${f('legend')}</legend>
      <label for="set-questionnaire-inbox">${f('inbox')}</label> <input class="editor-form-input" dir="ltr" id="set-questionnaire-inbox" name="questionnaire-inbox" pattern="https?://.+" placeholder="https://example.org/inbox/" required="" type="url" value="" />
      <div>
        <button class="editor-form-submit" data-i18n="editor.toolbar.form.save.button" type="submit">${text(i18n.t('editor.toolbar.form.save.button.textContent'))}</button>
        <button class="editor-form-cancel" data-i18n="editor.toolbar.form.cancel.button" type="button">${text(i18n.t('editor.toolbar.form.cancel.button.textContent'))}</button>
      </div>
    </fieldset>
  `;
}

function isReadMode() {
  return !Config.EditorEnabled && Config.Editor?.mode !== 'author';
}

export function initQuestionnaire() {
  const article = selectArticleNode(document);
  if (!article || !getQuestionnaires(article).length) return;

  if (isReadMode()) activateQuestionnaires(article);

  if (!clickHandlerAttached) {
    clickHandlerAttached = true;

    document.addEventListener('submit', (e) => {
      const questionnaire = e.target.closest?.(QUESTIONNAIRE_SELECTOR);
      if (!questionnaire) return;
      e.preventDefault();
      if (questionnaire.querySelector('.questionnaire-actions')) submitQuestionnaire(questionnaire);
    });

    const answered = (e) => {
      if (!e.target.closest?.(`.${CONTROL}`) || e.target.closest('.ProseMirror')) return;
      const questionnaire = e.target.closest(QUESTIONNAIRE_SELECTOR);
      if (questionnaire) updateReadiness(questionnaire);
    };
    document.addEventListener('input', answered);
    document.addEventListener('change', answered);

    document.addEventListener('click', (e) => {
      const questionnaire = e.target.closest(QUESTIONNAIRE_SELECTOR);
      if (!questionnaire || !questionnaire.querySelector('.questionnaire-actions')) return;

      if (e.target.closest('.questionnaire-submit')) {
        submitQuestionnaire(questionnaire);
        return;
      }
      if (e.target.closest('.questionnaire-clear')) {
        clearAnswers(questionnaire);
        return;
      }
      if (e.target.closest('.questionnaire-copy-change')) {
        showCopyLocationDialog(questionnaire);
        return;
      }
      if (e.target.closest('.questionnaire-copy-toggle')) {
        if (e.target.checked) showCopyLocationDialog(questionnaire);
        else setCopyLocations(questionnaire, []);
        return;
      }

      // Clicking an option's text chooses it.
      const li = e.target.closest('li');
      const control = li?.querySelector(':scope > * > .questionnaire-control, :scope > .questionnaire-control');
      if (control && e.target !== control && !e.target.closest('a')) {
        control.click();
      }
    });
  }

  if (!modeHandlerAttached) {
    modeHandlerAttached = true;
    window.addEventListener('dokieli:editor-mode-changed', (e) => {
      const root = selectArticleNode(document);
      if (!root) return;
      if (e.detail?.mode === 'author') {
        getQuestionnaires(root).forEach(deactivateQuestionnaire);
      }
      else {
        activateQuestionnaires(root);
      }
    });
  }
}
