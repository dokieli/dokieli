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

import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { Fragment } from "prosemirror-model";
import { i18n } from "../../i18n.js";
import { widgetButton } from "./sectionsNavDecorations.js";
import { Icon } from "../../ui/icons.js";
import { fragmentFromString } from "../../utils/html.js";
import {
  QUESTION_KINDS, CHOICE_KINDS, questionHTML, optionHTML, slotOptionHTML, explanationHTML, newQuestionId, newAnswerId,
  attrsOf, tokens, isQuestionnaireNode, isQuestionsContainer, isInboxList, parseNodes, setQuestionnaireInbox
} from "../../ui/templates/questionnaire.js";

// Author mode tools for questionnaires; all widgets are .do decorations, so none are saved.

const WIDGET = { ignoreSelection: true, stopEvent: () => true };

function t(key, options) {
  return i18n.t(`questionnaire.tools.${key}.textContent`, options);
}

function kindLabel(kind) {
  return i18n.t(`editor.question.form.kind.${kind}.textContent`);
}

const has = (node, attr, token) => tokens(attrsOf(node)[attr]).includes(token);
const isQuestion = (node) => node.type.name === "dl" && has(node, "typeof", "as:Question");
const isQuestionText = (node) => node.type.name === "dt";
const isAnswers = (node) => node.type.name === "dd";
const isOptionsList = (node) => node.type.name === "ul" && (has(node, "rel", "as:oneOf") || has(node, "rel", "as:anyOf"));
const isExplanation = (node) => node.type.name === "div" && has(node, "class", "questionnaire-explanation");
const isControl = (node) => (node.type.name === "input" || node.type.name === "textarea") && has(node, "class", "questionnaire-control");

// A question's controls with positions, excluding its explanation's.
function controlsIn(node, nodePos = 0) {
  const found = [];
  node.descendants((child, offset) => {
    if (isExplanation(child)) return false;
    if (isControl(child)) { found.push({ node: child, pos: nodePos + 1 + offset }); return false; }
    return true;
  });
  return found;
}

// Required is sh:minCount 1.
const isRequired = (node) => has(node, "property", "sh:minCount") && Number(attrsOf(node).content) >= 1;

// HTML required on radios and text fields, never on checkboxes.
function wantsRequired(control, required) {
  return required && attrsOf(control).type !== "checkbox";
}

function withRequired(control, required) {
  const next = { ...attrsOf(control) };
  if (wantsRequired(control, required)) next.required = "";
  else delete next.required;
  return next;
}

function childOf(node, predicate) {
  let found = null;
  node.forEach((child) => { if (!found && predicate(child)) found = child; });
  return found;
}

function answersOf(question, questionPos = 0) {
  let found = null;
  question.forEach((child, offset) => { if (!found && isAnswers(child)) found = { node: child, pos: questionPos + 1 + offset }; });
  return found;
}

// Same rules as describeQuestion.
export function pmQuestionKind(question) {
  const answers = answersOf(question)?.node;
  const list = answers && childOf(answers, isOptionsList);
  if (list) {
    if (has(list, "class", "questionnaire-time-slots")) return "time-slots";
    if (has(list, "rel", "as:anyOf")) return "multiple";
    if (has(list, "class", "questionnaire-dropdown")) return "dropdown";
    const labels = [];
    list.forEach((li) => labels.push(li.textContent.trim()));
    const yesNo = [i18n.t("questionnaire.option.yes.textContent"), i18n.t("questionnaire.option.no.textContent")];
    return labels.length === 2 && labels[0] === yesNo[0] && labels[1] === yesNo[1] ? "yes-no" : "single";
  }
  if (controlsIn(question).some(({ node }) => node.type.name === "input" && attrsOf(node).type === "text")) return "short-text";
  return "long-text";
}

function nodeAround(state, pos, predicate) {
  const $pos = state.doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth--) {
    if (predicate($pos.node(depth))) return { node: $pos.node(depth), pos: $pos.before(depth) };
  }
  const after = state.doc.nodeAt(pos);
  return after && predicate(after) ? { node: after, pos } : null;
}

// Rebuilds a question as another kind, keeping what the new kind can use.
export function convertQuestion(state, questionPos, kind) {
  const question = state.doc.nodeAt(questionPos);
  const { schema } = state;
  const id = attrsOf(question).id || newQuestionId();
  const fresh = parseNodes(schema, questionHTML({ id, kind, options: ["", ""], required: isRequired(question) })).firstChild;

  const oldText = childOf(question, isQuestionText);
  const oldAnswers = answersOf(question)?.node;
  const oldList = oldAnswers && childOf(oldAnswers, isOptionsList);
  const oldExplanation = oldAnswers && childOf(oldAnswers, isExplanation);
  // Options and time slots don't convert into each other.
  const oldKind = pmQuestionKind(question);
  const keepOptions = oldList && kind !== "yes-no" && oldKind !== "yes-no" && (kind === "time-slots") === (oldKind === "time-slots");

  const children = [];
  fresh.forEach((child) => {
    if (isQuestionText(child)) {
      children.push(oldText || child);
      return;
    }
    if (!isAnswers(child)) {
      children.push(child);
      return;
    }
    const parts = [];
    child.forEach((part) => {
      parts.push(isOptionsList(part) && keepOptions ? part.type.create(part.attrs, retypeInputs(oldList.content, choiceType(kind), id, isRequired(question))) : part);
    });
    if (CHOICE_KINDS.includes(kind) && oldExplanation) parts.push(oldExplanation);
    children.push(child.type.create(child.attrs, Fragment.from(parts)));
  });

  const replacement = fresh.type.create(fresh.attrs, Fragment.from(children));
  return state.tr.replaceWith(questionPos, questionPos + question.nodeSize, replacement);
}

function setRequired(tr, node, nodePos, required) {
  const next = { ...attrsOf(node) };
  if (required) Object.assign(next, { property: "sh:minCount", content: "1", datatype: "xsd:integer" });
  else { delete next.property; delete next.content; delete next.datatype; }
  tr.setNodeMarkup(nodePos, null, { ...node.attrs, originalAttributes: next });
  controlsIn(node, nodePos).forEach(({ node: control, pos }) => {
    tr.setNodeMarkup(pos, null, { ...control.attrs, originalAttributes: withRequired(control, required) });
  });
  return tr;
}

// A new uuid, so an added option never reuses the IRI of a removed one.
function newOptionId(doc) {
  const ids = new Set();
  doc.descendants((node) => { const id = attrsOf(node).id; if (id) ids.add(id); });
  let id;
  do { id = newAnswerId(); } while (ids.has(id));
  return id;
}

function checkbox(label, checked, onChange) {
  const wrap = document.createElement("label");
  wrap.className = "questionnaire-tool-toggle";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("mousedown", (e) => e.stopPropagation());
  input.addEventListener("change", () => onChange(input.checked));
  wrap.append(input, document.createTextNode(` ${label}`));
  return wrap;
}

function kindSelect(current, onChange, { placeholder = null } = {}) {
  const select = document.createElement("select");
  select.setAttribute("aria-label", t("kind"));
  if (placeholder) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = placeholder;
    select.appendChild(option);
  }
  QUESTION_KINDS.forEach((kind) => {
    const option = document.createElement("option");
    option.value = kind;
    option.textContent = kindLabel(kind);
    option.selected = kind === current;
    select.appendChild(option);
  });
  select.addEventListener("mousedown", (e) => e.stopPropagation());
  select.addEventListener("change", () => onChange(select.value));
  return select;
}

function toolbar(className) {
  const wrap = document.createElement("div");
  wrap.className = `do ${className}`;
  wrap.setAttribute("contenteditable", "false");
  wrap.addEventListener("mousedown", (e) => e.preventDefault());
  return wrap;
}

function questionTools(pos, question) {
  const kind = pmQuestionKind(question);
  const answers = answersOf(question)?.node;
  const explained = !!(answers && childOf(answers, isExplanation));
  const required = isRequired(question);

  return Decoration.widget(pos + 1, (view, getPos) => {
    const current = () => nodeAround(view.state, getPos(), isQuestion);
    const wrap = toolbar("questionnaire-question-tools");

    wrap.appendChild(kindSelect(kind, (next) => {
      const q = current();
      if (q) view.dispatch(convertQuestion(view.state, q.pos, next).scrollIntoView());
    }));

    wrap.appendChild(checkbox(t("required"), required, (on) => {
      const q = current();
      if (q) view.dispatch(setRequired(view.state.tr, q.node, q.pos, on));
    }));

    if (CHOICE_KINDS.includes(kind)) {
      wrap.appendChild(checkbox(t("explanation"), explained, (on) => {
        const q = current();
        const dd = q && answersOf(q.node, q.pos);
        if (!dd) return;
        const existing = [];
        dd.node.forEach((child, offset) => { if (isExplanation(child)) existing.push({ child, offset }); });
        let tr = view.state.tr;
        if (on && !existing.length) {
          tr = tr.insert(dd.pos + dd.node.nodeSize - 1, parseNodes(view.state.schema, explanationHTML()));
        }
        else if (!on) {
          existing.reverse().forEach(({ child, offset }) => { tr = tr.delete(dd.pos + 1 + offset, dd.pos + 1 + offset + child.nodeSize); });
        }
        view.dispatch(tr);
      }));
    }

    const move = (direction) => {
      const q = current();
      if (!q) return;
      const $q = view.state.doc.resolve(q.pos);
      const index = $q.index();
      const parent = $q.parent;
      const sibling = parent.maybeChild(index + direction);
      if (!sibling || !isQuestion(sibling)) return;
      let tr = view.state.tr;
      if (direction < 0) {
        tr = tr.delete(q.pos, q.pos + q.node.nodeSize).insert(q.pos - sibling.nodeSize, q.node);
      }
      else {
        const siblingPos = q.pos + q.node.nodeSize;
        tr = tr.delete(siblingPos, siblingPos + sibling.nodeSize).insert(q.pos, sibling);
      }
      view.dispatch(tr.scrollIntoView());
    };

    wrap.appendChild(widgetButton({ className: "questionnaire-tool", label: "↑", title: t("move-up"), onClick: (e) => { e.preventDefault(); move(-1); } }));
    wrap.appendChild(widgetButton({ className: "questionnaire-tool", label: "↓", title: t("move-down"), onClick: (e) => { e.preventDefault(); move(1); } }));
    wrap.appendChild(widgetButton({
      className: "questionnaire-tool questionnaire-question-remove",
      label: "−",
      title: t("remove-question"),
      onClick: (e) => {
        e.preventDefault();
        const q = current();
        if (q) view.dispatch(view.state.tr.delete(q.pos, q.pos + q.node.nodeSize));
      },
    }));

    return wrap;
  }, { ...WIDGET, side: -1, key: `questionnaire-question-tools-${attrsOf(question).id}-${kind}-${required}-${explained}` });
}

// Removes an option, never the last one.
function removeOptionWidget(pos, optionId) {
  return Decoration.widget(pos, (view, getPos) => {
    const label = t("remove-option");
    const b = widgetButton({
      className: "do entry-delete questionnaire-option-remove",
      label: "",
      title: label,
      onClick: (e) => {
        e.preventDefault();
        const li = nodeAround(view.state, getPos(), (n) => n.type.name === "li");
        if (!li) return;
        const list = view.state.doc.resolve(li.pos).parent;
        if (!isOptionsList(list) || list.childCount < 2) return;
        view.dispatch(view.state.tr.delete(li.pos, li.pos + li.node.nodeSize));
      },
    });
    b.appendChild(fragmentFromString(Icon[".fas.fa-trash-alt"]));
    return b;
  }, { ...WIDGET, side: -1, key: `questionnaire-option-remove-${optionId}` });
}

function choiceType(kind) {
  return kind === "multiple" || kind === "time-slots" ? "checkbox" : "radio";
}

// Options keep their inputs across a conversion, retyped for the new kind.
function retypeInputs(fragment, type, name, required) {
  const nodes = [];
  fragment.forEach((node) => {
    if (node.type.name === "input") {
      const retyped = node.type.create({ ...node.attrs, originalAttributes: { ...attrsOf(node), type, name } });
      nodes.push(retyped.type.create({ ...retyped.attrs, originalAttributes: withRequired(retyped, required) }));
    }
    else {
      nodes.push(node.copy(retypeInputs(node.content, type, name, required)));
    }
  });
  return Fragment.from(nodes);
}

// Placeholder for an option, whose paragraph is never empty because of its input.
function optionPlaceholder(pos) {
  return Decoration.widget(pos, () => {
    const span = document.createElement("span");
    span.className = "editor-placeholder questionnaire-option-placeholder";
    span.textContent = i18n.t("questionnaire.option.placeholder.textContent");
    span.setAttribute("aria-hidden", "true");
    span.contentEditable = "false";
    return span;
  }, { side: 1, ignoreSelection: true, key: `questionnaire-option-placeholder-${pos}` });
}

function addOptionButton(pos, questionId, type, kind) {
  const slots = kind === "time-slots";
  return Decoration.widget(pos, (view, getPos) => widgetButton({
    className: "do questionnaire-option-add",
    label: t(slots ? "add-time-slot" : "add-option"),
    onClick: (e) => {
      e.preventDefault();
      const list = nodeAround(view.state, getPos() - 1, isOptionsList);
      if (!list) return;
      const optionId = newOptionId(view.state.doc);
      const end = list.pos + list.node.nodeSize - 1;
      const required = isRequired(nodeAround(view.state, list.pos, isQuestion)?.node || list.node);
      const html = slots ? slotOptionHTML(optionId, { name: questionId, required }) : optionHTML(optionId, "", { name: questionId, type });
      const tr = view.state.tr.insert(end, parseNodes(view.state.schema, `<ul>${html}</ul>`).firstChild.content);
      // Position after the option's input.
      view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(end + 3))).scrollIntoView());
      view.focus();
    },
  }), { ...WIDGET, side: 1, key: `questionnaire-option-add-${questionId}-${kind}` });
}

function explanationTools(pos, explanation) {
  const required = isRequired(explanation);
  const id = attrsOf(explanation).id;
  return Decoration.widget(pos, (view, getPos) => {
    const wrap = toolbar("questionnaire-explanation-tools");
    wrap.appendChild(checkbox(t("explanation-required"), required, (on) => {
      const target = nodeAround(view.state, getPos(), (n) => n.type.name === "div" && has(n, "typeof", "as:Question"));
      if (target) view.dispatch(setRequired(view.state.tr, target.node, target.pos, on));
    }));
    return wrap;
  }, { ...WIDGET, side: 1, key: `questionnaire-explanation-tools-${id}-${required}` });
}

function addQuestionWidget(pos) {
  return Decoration.widget(pos, (view, getPos) => {
    const wrap = toolbar("questionnaire-add");
    let chosen = "";
    const button = widgetButton({
      className: "questionnaire-add-button",
      label: t("add-question"),
      onClick: (e) => {
        e.preventDefault();
        if (!chosen) return;
        const at = getPos();
        const tr = view.state.tr.insert(at, parseNodes(view.state.schema, questionHTML({ kind: chosen, options: ["", ""] })));
        view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(at + 2))).scrollIntoView());
        view.focus();
      },
    });
    button.disabled = true;
    wrap.append(kindSelect("", (kind) => { chosen = kind; button.disabled = !kind; }, { placeholder: t("choose-kind") }), button);
    return wrap;
  }, { ...WIDGET, side: 1, key: "questionnaire-add" });
}

function inboxTools(pos, inbox) {
  return Decoration.widget(pos, (view) => {
    const wrap = toolbar("questionnaire-inbox-tools");
    const id = "questionnaire-inbox-input";
    const label = document.createElement("label");
    label.htmlFor = id;
    label.textContent = t("inbox");
    const input = document.createElement("input");
    input.id = id;
    input.type = "url";
    input.dir = "ltr";
    input.placeholder = "https://example.org/inbox/";
    input.value = inbox || "";
    input.addEventListener("mousedown", (e) => e.stopPropagation());
    const save = () => {
      const value = input.value.trim();
      if (!/^https?:\/\/.+/.test(value) || value === inbox) return;
      setQuestionnaireInbox(view, value);
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } });
    wrap.append(label, input, widgetButton({ className: "questionnaire-inbox-set", label: t("inbox-set"), onClick: (e) => { e.preventDefault(); save(); } }));
    return wrap;
  }, { ...WIDGET, side: -1, key: `questionnaire-inbox-tools-${inbox || ""}` });
}

function inboxOf(questionnaire) {
  let inbox = null;
  questionnaire.descendants((node) => {
    if (inbox) return false;
    if (node.type.name === "dl" && isInboxList(node)) {
      node.descendants((n) => {
        n.marks?.forEach((mark) => { if (!inbox && tokens(mark.attrs.originalAttributes?.rel).includes("ldp:inbox")) inbox = mark.attrs.originalAttributes.href; });
        if (!inbox && has(n, "rel", "ldp:inbox")) inbox = attrsOf(n).href;
      });
      return false;
    }
    return true;
  });
  return inbox;
}

export function buildQuestionnaireDecorations(doc) {
  const decos = [];

  doc.descendants((node, pos) => {
    if (!isQuestionnaireNode(node)) return true;

    node.descendants((child, childPos) => {
      const at = pos + 1 + childPos;
      if (!isQuestionsContainer(child)) return !isQuestion(child);

      decos.push(inboxTools(at, inboxOf(node)));

      child.forEach((question, offset) => {
        if (!isQuestion(question)) return;
        const questionPos = at + 1 + offset;
        const questionId = attrsOf(question).id || "q";
        decos.push(questionTools(questionPos, question));

        const dd = answersOf(question, questionPos);
        dd?.node.forEach((part, partOffset) => {
          const partPos = dd.pos + 1 + partOffset;
          if (isOptionsList(part) && !has(part, "class", "questionnaire-time-slots")) {
            let itemPos = partPos + 1;
            part.forEach((li) => {
              if (!li.textContent.trim() && li.firstChild?.isTextblock) {
                decos.push(optionPlaceholder(itemPos + 1 + li.firstChild.nodeSize - 1));
              }
              itemPos += li.nodeSize;
            });
          }
          if (isOptionsList(part)) {
            // Yes/no keeps its two options; other choices keep at least one.
            if (pmQuestionKind(question) === "yes-no") return;
            if (part.childCount > 1) {
              let liPos = partPos + 1;
              part.forEach((li) => {
                decos.push(removeOptionWidget(liPos + li.nodeSize - 1, attrsOf(li).id || liPos));
                liPos += li.nodeSize;
              });
            }
            const kind = pmQuestionKind(question);
            decos.push(addOptionButton(partPos + part.nodeSize, questionId, choiceType(kind), kind));
          }
          else if (isExplanation(part)) {
            part.forEach((inner, innerOffset) => {
              if (inner.type.name === "div" && has(inner, "typeof", "as:Question")) {
                decos.push(explanationTools(partPos + 1 + innerOffset + inner.nodeSize - 1, inner));
              }
            });
          }
        });
      });

      decos.push(addQuestionWidget(at + child.nodeSize - 1));
      return false;
    });

    return false;
  });

  return DecorationSet.create(doc, decos);
}

// Keeps an option's input before its text.
export function keepOptionInputsFirst(state) {
  const moves = [];
  state.doc.descendants((node, pos) => {
    if (!isOptionsList(node)) return true;
    node.forEach((li, liOffset) => {
      const p = li.firstChild;
      if (!p?.isTextblock) return;
      const contentStart = pos + 1 + liOffset + 1 + 1;
      let at = null, input = null;
      p.forEach((child, offset) => { if (!input && isControl(child)) { input = child; at = offset; } });
      if (input && at > 0) moves.push({ from: contentStart + at, to: contentStart, input });
    });
    return false;
  });
  if (!moves.length) return null;
  const tr = state.tr;
  moves.reverse().forEach(({ from, to, input }) => {
    tr.delete(from, from + input.nodeSize).insert(to, input);
  });
  return tr;
}

export const questionnaireToolsPlugin = new Plugin({
  key: new PluginKey("questionnaireTools"),
  state: {
    init: (_config, state) => buildQuestionnaireDecorations(state.doc),
    apply: (tr, decos, _oldState, newState) => tr.docChanged ? buildQuestionnaireDecorations(newState.doc) : decos,
  },
  appendTransaction: (transactions, _oldState, newState) =>
    transactions.some((tr) => tr.docChanged) ? keepOptionInputsFirst(newState) : null,
  props: {
    decorations(state) { return this.getState(state); },
  },
});
