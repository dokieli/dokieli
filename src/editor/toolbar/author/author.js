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

import { toggleMark, setBlockType, wrapIn } from "prosemirror-commands"
import { wrapInList, liftListItem } from "prosemirror-schema-list"
import { DOMSerializer, DOMParser } from "prosemirror-model"
import { TextSelection } from "prosemirror-state"
import { schema, allowedEmptyAttributes } from "./../../schema/base.js"
import { formHandlerLanguage, formHandlerA, formHandlerAnnotate, formHandlerBlockquote, formHandlerImg, formHandlerQ, formHandlerCitation, formHandlerRequirement, formHandlerSemantics } from "./handlers.js"
import { ToolbarView, annotateFormControls } from "../toolbar.js"
import { createRDFaHTMLRequirement, getCitationOptionsHTML, getLanguageOptionsHTML, getRequirementLevelOptionsHTML, getRequirementSubjectOptionsHTML } from "../../../doc.js"
import { getResource } from "../../../fetcher.js"
import { fragmentFromString, stringFromFragment } from "../../../util.js"
import Config from "../../../config.js";
import { htmlEncode } from "../../../utils/html.js";
import { i18n } from "../../../i18n.js"

const ns = Config.ns;

export class AuthorToolbar extends ToolbarView {
  constructor(mode, buttons, editorView) {
    super(mode, buttons, editorView)
    this.editorView = editorView;
  }

  //TODO: Create formValidationHandlers to handle `input` and `invalid` event handlers. Move oninput/oninvalid out of form's inline HTML
  getFormEventListeners() {
    return {
      language: [ { event: 'submit', callback: this.formHandlerLanguage }, { event: 'click', callback: (e) => this.formClickHandler(e, 'language') } ],
      a: [ { event: 'submit', callback: this.formHandlerA }, { event: 'click', callback: (e) => this.formClickHandler(e, 'a') } ],
      q: [ { event: 'submit', callback: this.formHandlerQ }, { event: 'click', callback: (e) => this.formClickHandler(e, 'q') } ],
      blockquote: [ { event: 'submit', callback: this.formHandlerBlockquote }, { event: 'click', callback: (e) => this.formClickHandler(e, 'blockquote') } ],
      img: [ { event: 'submit', callback: this.formHandlerImg }, { event: 'click', callback: (e) => this.formClickHandler(e, 'img') } ],
      semantics: [ { event: 'submit', callback: (e) => this.formHandlerSemantics(e, 'semantics') }, { event: 'click', callback: (e) => this.formClickHandler(e, 'semantics') } ],
      citation: [ { event: 'submit', callback: (e) => this.formHandlerCitation(e, 'citation') }, { event: 'click', callback: (e) => this.formClickHandler(e, 'citation') } ],
      requirement: [ { event: 'submit', callback: (e) => this.formHandlerRequirement(e, 'requirement') }, { event: 'click', callback: (e) => this.formClickHandler(e, 'requirement') } ],
      note: [ { event: 'submit', callback: (e) => this.formHandlerAnnotate(e, 'note') }, { event: 'click', callback: (e) => this.formClickHandler(e, 'note') } ],
    }
  }

  getFormHandlers() {
    return [
      { name: 'formHandlerLanguage', fn: formHandlerLanguage },
      { name: 'formHandlerA', fn: formHandlerA },
      { name: 'formHandlerQ', fn: formHandlerQ },
      { name: 'formHandlerBlockquote', fn: formHandlerBlockquote },
      { name: 'formHandlerImg', fn: formHandlerImg },
      { name: 'formHandlerCitation', fn: formHandlerCitation },
      { name: 'formHandlerRequirement', fn: formHandlerRequirement },
      // { name: 'formHandlerSparkline', fn: formHandlerSparkline },
      { name: 'formHandlerSemantics', fn: formHandlerSemantics },
      { name: 'formHandlerAnnotate', fn: formHandlerAnnotate },
    ];
  }

  getToolbarCommands() {
    const toolbarCommands = {
      p: setBlockType(schema.nodes.p),
      h1: toggleHeading(schema, 1),
      h2: toggleHeading(schema, 2),
      h3: toggleHeading(schema, 3),
      h4: toggleHeading(schema, 4),
      em: toggleMark(schema.marks.em),
      strong: toggleMark(schema.marks.strong),
      ul: toggleList(schema, 'ul'),
      ol: toggleList(schema, 'ol'),
      // blockquote: setBlockType(schema.nodes.blockquote),
      // q: toggleMark(schema.marks.q),
      pre: setBlockType(schema.nodes.pre),
      code: this.insertCodeInline(schema),
      // math: toggleMark(schema.marks.math), //prosemirror-math
      // citation: citeForm(),
      // semantics: semanticsForm()
    }

    return toolbarCommands;
  }

  getFormLegends() {
    return {
      note: i18n.t('editor.toolbar.note.form.legend.textContent'),
      requirement: i18n.t('editor.toolbar.requirement.form.legend.textContent'),
      language: i18n.t('editor.toolbar.language.form.legend.textContent'),
      a: i18n.t('editor.toolbar.a.form.legend.textContent'),
      blockquote: i18n.t('editor.toolbar.blockquote.form.legend.textContent'),
      q: i18n.t('editor.toolbar.q.form.legend.textContent'),
      img: i18n.t('editor.toolbar.img.form.legend.textContent'),
      citation: i18n.t('editor.toolbar.citation.form.legend.textContent'),
      semantics: i18n.t('editor.toolbar.semantics.form.legend.textContent'),
    }
  }

  // TODO: this function returns only the textarea placeholders, but many popups in the author toolbar need more than one field. revisit.
  getFormPlaceholders() {
    return {
      note: i18n.t('editor.toolbar.note.form.textarea.placeholder'),
      citation: i18n.t('editor.toolbar.citation.form.textarea.placeholder'),
    }
  }

  getToolbarPopups() {
    const toolbarPopups = {
      language: (options) => `
        <fieldset>
          <legend data-i18n="editor.toolbar.language.form.legend">${options.legend}</legend>
          <label data-i18n="language.label" for="language-language">${i18n.t('language.label.textContent')}</label>
          <select class="editor-form-select" id="language-language" name="language-language">${getLanguageOptionsHTML()}</select>
          <button class="editor-form-submit" data-i18n="editor.toolbar.form.save.button" type="submit">${i18n.t('editor.toolbar.form.save.button.textContent')}</button>
          <button class="editor-form-cancel" data-i18n="editor.toolbar.form.cancel.button" type="button">${i18n.t('editor.toolbar.form.cancel.button.textContent')}</button>
        </fieldset>
      `,

      a: (options) => `
        <fieldset>
          <legend data-i18n="editor.toolbar.a.form.legend">${options.legend}</legend>
          <dl class="info">
            <dt class="required">*</dt>
            <dd data-i18n="info.required">${i18n.t('info.required.textContent')}</dd>
          </dl>
          <label for="a-href">URL</label> <input class="editor-form-input" data-i18n="editor.toolbar.form.url.input" dir="ltr" id="a-href" name="a-href" pattern="https?://.+" placeholder="${i18n.t('editor.toolbar.form.url.input.placeholder')}" required="" type="url" value="" />
          <label data-i18n="editor.toolbar.a.form.a-title.label" for="a-title">${i18n.t('editor.toolbar.a.form.a-title.label.textContent')}</label> <input class="editor-form-input" data-i18n="editor.toolbar.a.form.a-title.input" dir="auto" id="a-title" name="a-title" placeholder="${i18n.t('editor.toolbar.a.form.a-title.input.placeholder')}" type="text" />
          <button class="editor-form-submit" data-i18n="editor.toolbar.form.save.button" type="submit">${i18n.t('editor.toolbar.form.save.button.textContent')}</button>
          <button class="editor-form-cancel" data-i18n="editor.toolbar.form.cancel.button" type="button">${i18n.t('editor.toolbar.form.cancel.button.textContent')}</button>
        </fieldset>
      `,

      blockquote: (options) => `
        <fieldset>
          <legend data-i18n="editor.toolbar.blockquote.form.legend">${options.legend}</legend>
          <label for="blockquote-cite">URL</label> <input class="editor-form-input" data-i18n="editor.toolbar.form.url.input" dir="ltr"  id="blockquote-cite" name="blockquote-cite" pattern="https?://.+" placeholder="${i18n.t('editor.toolbar.form.url.input.placeholder')}" type="url" value="" />
          <button class="editor-form-submit" data-i18n="editor.toolbar.form.save.button" type="submit">${i18n.t('editor.toolbar.form.save.button.textContent')}</button>
          <button class="editor-form-cancel" data-i18n="editor.toolbar.form.cancel.button" type="button">${i18n.t('editor.toolbar.form.cancel.button.textContent')}</button>
        </fieldset>
      `,

      q: (options) => `
        <fieldset>
          <legend data-i18n="editor.toolbar.q.form.legend">${options.legend}</legend>
          <label for="q-cite">URL</label> <input class="editor-form-input" data-i18n="editor.toolbar.form.url.input" dir="ltr" id="q-cite" name="q-cite" pattern="https?://.+" placeholder="${i18n.t('editor.toolbar.form.url.input.placeholder')}" type="url" value="" />
          <button class="editor-form-submit" data-i18n="editor.toolbar.form.save.button" type="submit">${i18n.t('editor.toolbar.form.save.button.textContent')}</button>
          <button class="editor-form-cancel" data-i18n="editor.toolbar.form.cancel.button" type="button">${i18n.t('editor.toolbar.form.cancel.button.textContent')}</button>
        </fieldset>
      `,

      // TODO: draggable area in this widget
      //TODO: browse storage
      img: (options) => `
        <fieldset>
          <legend data-i18n="editor.toolbar.img.form.legend">${options.legend}</legend>
          <figure class="img-preview"></figure>
          <label data-i18n="editor.toolbar.img.form.img-file.label" for="img-file">${i18n.t('editor.toolbar.img.form.img-file.label.textContent')}</label> <input class="editor-form-input" id="img-file" name="img-file" type="file" />
          <label for="img-src">URL</label> <input class="editor-form-input" dir="ltr" id="img-src" name="img-src" pattern="https?://.+" placeholder="${i18n.t('editor.toolbar.form.url.input.placeholder')}" type="url" value="" />
          <label data-i18n="editor.toolbar.img.form.img-alt.label" for="img-alt">${i18n.t('editor.toolbar.img.form.img-alt.label.textContent')}</label> <input class="editor-form-input" data-i18n="editor.toolbar.img.form.img-alt.input" dir="auto" id="img-alt" name="img-alt" placeholder="${i18n.t('editor.toolbar.img.form.img-alt.input.placeholder')}" type="text" value="" />
          <label data-i18n="editor.toolbar.img.form.img-figcaption" for="img-figcaption">${i18n.t('editor.toolbar.img.form.img-figcaption.label.textContent')}</label> <input class="editor-form-input" data-i18n="editor.toolbar.img.form.img-figcaption.input" id="img-figcaption" name="img-figcaption" placeholder="${i18n.t('editor.toolbar.img.form.img-alt.label.textContent')}" type="text" value="" />
          <button class="editor-form-submit" data-i18n="editor.toolbar.form.save.button" type="submit">${i18n.t('editor.toolbar.form.save.button.textContent')}</button>
          <button class="editor-form-cancel" data-i18n="editor.toolbar.form.cancel.button" type="button">${i18n.t('editor.toolbar.form.cancel.button.textContent')}</button>
        </fieldset>
      `,

      note: (options) => annotateFormControls(options), // FIXME: this actually belongs in the other one

      citation: (options) => `
        <fieldset>
          <legend data-i18n="editor.toolbar.citation.form.legend">${options.legend}</legend>
          <label data-i18n="editor.toolbar.citation.form.specref-search.label" for="citation-specref-search">${i18n.t('editor.toolbar.citation.form.specref-search.label.textContent')} <a href="https://www.specref.org/" rel="noopener" target="_blank">specref.org</a></label> <input class="editor-form-input" data-i18n="editor.toolbar.citation.form.specref-search.input" id="citation-specref-search" name="citation-specref-search" placeholder="${i18n.t('editor.toolbar.citation.form.specref-search.input.placeholder')}" type="text" value="" />
          <input data-i18n="editor.toolbar.form.search.button" id="citation-specref-search-submit" name="citation-specref-search-submit" type="submit" value="${i18n.t('editor.toolbar.form.search.button.value')}" />
          <span>
          <input id="ref-footnote" name="citation-ref-type" type="radio" value="ref-footnote" /> <label data-i18n="editor.toolbar.citation.form.ref-footnote.form.label" for="ref-footnote">${i18n.t('editor.toolbar.citation.form.ref-footnote.label.textContent')}</label>
          <input id="ref-reference" name="citation-ref-type" type="radio" value="ref-reference" /> <label data-i18n="editor.toolbar.citation.form.ref-reference.label" for="ref-reference">${i18n.t('editor.toolbar.citation.form.ref-reference.label.textContent')}</label>
          </span>
          <label data-i18n="editor.toolbar.citation.form.citation-relation.label" for="citation-relation">${i18n.t('editor.toolbar.citation.form.citation-relation.label.textContent')}</label>
          <select class="editor-form-select" id="citation-relation" name="citation-relation">${getCitationOptionsHTML({ 'selected': '' })}</select>
          <label for="citation-url">URL</label>
          <input class="editor-form-input" data-i18n="editor.toolbar.form.url.input" dir="ltr" id="citation-url" name="citation-url" pattern="https?://.+" placeholder="${i18n.t('editor.toolbar.form.url.input.placeholder')}" type="url" value="" />
          <label data-i18n="editor.toolbar.note.form.label" for="citation-content">${i18n.t('editor.toolbar.note.form.label.textContent')}</label>
          <textarea class="editor-form-textarea" cols="20" data-i18n="editor.toolbar.${options.button}.form.textarea" dir="auto" id="citation-content" name="citation-content" rows="3" placeholder="${options.placeholder}"></textarea>
          <label data-i18n="language.label" for="citation-language">${i18n.t('language.label.textContent')}</label>
          <select class="editor-form-select" id="citation-language" name="citation-language">${getLanguageOptionsHTML()}</select>
          <button class="editor-form-submit" data-i18n="editor.toolbar.form.save.button" type="submit">${i18n.t('editor.toolbar.form.save.button.textContent')}</button>
          <button class="editor-form-cancel" data-i18n="editor.toolbar.form.cancel.button" type="button">${i18n.t('editor.toolbar.form.cancel.button.textContent')}</button>
          <div class="specref-search-results"></div>
        </fieldset>
      `,

      requirement: (options) => `
        <fieldset>
          <legend data-i18n="editor.toolbar.requirement.form.legend">${options.legend}</legend>
          <dl id="requirement-preview">
            <dt data-i18n="editor.toolbar.requirement.form.preview.dt">${i18n.t('editor.toolbar.requirement.form.preview.dt.textContent')}</dt>
            <dd><samp id="requirement-preview-samp"></samp></dd>
          </dl>
          <label data-i18n="editor.toolbar.requirement.form.subject.dt" for="requirement-subject">${i18n.t('editor.toolbar.requirement.form.subject.dt.textContent')}</label>
          <select class="editor-form-select" id="requirement-subject" name="requirement-subject">${getRequirementSubjectOptionsHTML(options)}</select>
          <label data-i18n="editor.toolbar.requirement.form.level.dt" for="requirement-level">${i18n.t('editor.toolbar.requirement.form.level.dt.textContent')}</label>
          <select class="editor-form-select" id="requirement-level" name="requirement-level">${getRequirementLevelOptionsHTML(options)}</select>
          <button class="editor-form-submit" data-i18n="editor.toolbar.form.save.button" type="submit">${i18n.t('editor.toolbar.form.save.button.textContent')}</button>
          <button class="editor-form-cancel" data-i18n="editor.toolbar.form.cancel.button" type="button">${i18n.t('editor.toolbar.form.cancel.button.textContent')}</button>
        </fieldset>
      `,

          // <label for="requirement-consensus">Consensus source</label>
          // <input class="editor-form-input" data-i18n="editor.toolbar.form.url.input" id="requirement-consensus" name="requirement-consensus" pattern="https?://.+" placeholder="${i18n.t('editor.toolbar.form.url.input.placeholder')}" )})" type="url" value="" />
          // <label data-i18n="language.label" for="requirement-language">${i18n.t('language.label.textContent')}</label>
          // <select class="editor-form-select" id="requirement-language" name="requirement-language">${getLanguageOptionsHTML()}</select>

      semantics: (options) => `
        <fieldset>
          <legend data-i18n="editor.toolbar.semantics.form.legend">${options.legend}</legend>
          <label for="semantics-about">about</label> <input class="editor-form-input" dir="ltr" id="semantics-about" name="semantics-about" placeholder="Enter URL, e.g., https://example.net/foo#bar" type="url" value="" />
          <label for="semantics-resource">resource</label> <input class="editor-form-input" dir="ltr" id="semantics-resource" name="semantics-resource" placeholder="Enter URL, e.g., https://example.net/foo#bar" type="url" value="" />
          <label for="semantics-typeof">typeof</label> <input class="editor-form-input" dir="ltr" id="semantics-typeof" name="semantics-typeof" placeholder="Enter URL, e.g., https://example.net/foo#Baz" type="url" value="" />
          <label for="semantics-rel">rel</label> <input class="editor-form-input" id="semantics-rel" name="semantics-rel" placeholder="schema:url" type="url" value="" />
          <label for="semantics-property">property</label> <input class="editor-form-input" name="semantics-property" id="semantics-property" placeholder="schema:name" type="url" value="" />
          <label for="semantics-href">href</label> <input class="editor-form-input" dir="ltr" id="semantics-href" name="semantics-href" placeholder="Enter URL, e.g., https://example.net/foo" type="url" value="" />
          <label for="semantics-content">content</label> <input class="editor-form-input" id="semantics-content" name="semantics-content" placeholder="Enter content, e.g., 'Baz'" type="url" value="" />
          <label for="semantics-lang">lang</label> <input class="editor-form-input" name="semantics-lang" id="semantics-lang" placeholder="Enter language code, e.g., en" type="url" value="" />
          <label for="semantics-datatype">datatype</label> <input class="editor-form-input" name="semantics-datatype" id="semantics-datatype" placeholder="Enter URL, e.g., https://example.net/qux" type="url" value="" />
          <button class="editor-form-submit" data-i18n="editor.toolbar.form.save.button" type="submit">${i18n.t('editor.toolbar.form.save.button.textContent')}</button>
          <button class="editor-form-cancel" data-i18n="editor.toolbar.form.cancel.button" type="button">${i18n.t('editor.toolbar.form.cancel.button.textContent')}</button>
        </fieldset>
      `

/*
TODO:
      sparkline: (optins) => `
        '<input type="text" name="sparkline-search" value="" id="sparkline-search" class="editor-form-input" placeholder="Enter search terms" />',
        '<input type="hidden" name="sparkline-selection-dataset" value="" id="sparkline-selection-dataset" />',
        '<input type="hidden" name="sparkline-selection-refarea" value="" id="sparkline-selection-refarea" />'
        ${getButtonHTML('submit', 'editor-form-submit', 'Save', 'Save', { type: 'submit' })}
        ${getButtonHTML('cancel', 'editor-form-cancel', 'Cancel', 'Cancel', { type: 'button' })}
        `;
      */
    }

    return toolbarPopups;
  }

  // Called when there is a state change, e.g., added something to the DOM or selection change.
  update(view) {
    this.selectionUpdate(view);
    const selection = window.getSelection();
    const isSelection = selection && !selection.isCollapsed;
    // Hide the toolbar when there is no selection
    if (!isSelection) {
      if (this.dom.classList.contains('editor-form-active')) {
        // this.dom.classList.remove("editor-form-active");
        // console.log("selection update, cleanup toolbar")
        this.cleanupToolbar();
      }
      return;
    }
  }  

  updateToolbarVisibility(e) {
    // document.addEventListener('click', (e) => {
      // FIXME
      // console.log(this.editorView, this.mode)
    if (this.dom.classList.contains('editor-form-active') && !e.target.closest('.do') && e.target.closest('input[type]')?.type !== 'file' &&  !this.editorView.dom.contains(e.target)) {
      // Click outside editor and not on functionality-related items
        this.cleanupToolbar();
    }
    // })
  }

  insertCodeInline(schema) {
    return function (state, dispatch) {
      const { from, to } = state.selection;
      const text = state.doc.textBetween(from, to, " ");
      
      // Create a new code_inline node with the selected text
      const node = schema.nodes.code.create(null, schema.text(text));
  
      if (dispatch) {
        dispatch(state.tr.replaceRangeWith(from, to, node).scrollIntoView());
      }
  
      return true;
    };
  }

  insertImage(attrs) {
    return (state, dispatch) => {
      const { schema, tr } = state;

      // TODO: find a way to pass all the attributes in the attributes object without the need for a property with a copy
      const imageNode = schema.nodes.img.create({ originalAttributes: attrs });
      // console.log(attrs, imageNode)
  
      tr.replaceSelectionWith(imageNode);
  
      dispatch(tr);
      return true;
    };
  }

  clearSelection() {
    const { state, dispatch } = this.editorView;
    const { tr } = state;
    const pos = state.selection.from; 

    dispatch(tr.setSelection(TextSelection.create(state.doc, pos)));
  }

  getTextQuoteSelector() {
    const view = this.editorView;
    //ProseMirror state.selection
    const { selection , doc } = view.state;
    const { from, to } = selection;
    //TODO: Use Config.ContextLength
    const contextLength = Config.ContextLength;

    var exact = doc.textBetween(from, to); // consider \n
    const textNode = view.domAtPos(from).node;
    // console.log(textNode)
    const selectedParentElement = textNode.parentNode;
    // console.log(selectedParentElement)

    // var selectionState = MediumEditor.selection.exportSelection(selectedParentElement, this.document);
    var prefixStart = Math.max(0, from - Config.ContextLength);
    // console.log('pS ' + prefixStart);
    // var prefix = selectedParentElement.textContent.substr(prefixStart, start - prefixStart);
    let prefix = doc.textBetween(prefixStart, from)  // consider \n
    // console.log('-' + prefix + '-');
    prefix = htmlEncode(prefix);
    
    var suffixEnd = Math.min(selectedParentElement.textContent.length, to + Config.ContextLength);
    // console.log('sE ' + suffixEnd);
    let suffix =  doc.textBetween(to, suffixEnd)  // consider \n
    // console.log('-' + suffix + '-');
    suffix = htmlEncode(suffix);

    return {
      type: 'TextQuoteSelector',
      exact,
      prefix,
      suffix
    }
  }
  

  getSelectionAsHTML() {
    const state = this.editorView.state;
    const tr = state.tr;

    const { selection, doc } = tr;
    if (!(selection instanceof TextSelection) || selection.empty) return;

    const { from, to } = selection;
    const selectedSlice = doc.slice(from, to);
    const serializer = DOMSerializer.fromSchema(doc.type.schema);
    const fragment = serializer.serializeFragment(selectedSlice.content);
    const selectedContent = new XMLSerializer().serializeToString(fragment);
    return selectedContent;
  }


nodeToHTML(node, schema) {
  const serializer = DOMSerializer.fromSchema(schema);
  const fragment = serializer.serializeFragment(node.content);
  const div = document.createElement('div');
  div.appendChild(fragment);
  return div.innerHTML;
}


  replaceSelectionWithFragment(fragment) {
    // console.log(fragment)
    const { state, dispatch } = this.editorView;
    const { selection, schema } = state;
    // console.log(selection)
    // parseSlice(fragment, { preserveWhitespace: true })
    let node = DOMParser.fromSchema(schema).parseSlice(fragment);
    const selText = state.doc.textBetween(selection.from, selection.to, " ");
    let tr = state.tr.replaceSelection(node);
    // console.log(tr)
    dispatch(tr);
  }

  replaceSelectionWithNodeFromFragment(fragment) {
    // console.log(fragment)
    const { state, dispatch } = this.editorView;
    const { selection, schema } = state;
    // parseSlice(fragment, { preserveWhitespace: true })
    let node = DOMParser.fromSchema(schema).parse(fragment);
    const selText = state.doc.textBetween(selection.from, selection.to, " ");
    let tr = state.tr.replaceSelectionWith(node);
    // console.log(tr)
    dispatch(tr);
  }

  //Equivalent to insertAdjacentHTML('beforend') / appendChild?
  insertFragmentInNode(fragment) {
    const { state, dispatch } = this.editorView;
    const { selection } = state;
  
    const endPos = getClosestSectionNodeEndPos(this.editorView)
  
    let node = DOMParser.fromSchema(schema).parse(fragment);

// console.log(node)

    let tr = state.tr.insert(endPos, node);
  
    dispatch(tr);
  }
  updateMarkWithAttributes(schema, markType, attrs) {
    return (state, dispatch) => {
// console.log(state, dispatch)

      const safeAttributes = Object.fromEntries(
        Object.entries(attrs).filter(
          ([key, value]) => value.length || allowedEmptyAttributes.includes(key)
        )
      );
      const { tr, selection } = this.editorView.state;
      const { $from, $to } = selection;
      const mark = schema.marks[markType];

      // const result = toggleMark(schema.marks[markType])(this.editorView.state,dispatch)
      // console.log(result)
      // console.log(tr.before.eq(state.doc))

      if (!mark) return false;
  
      const hasMark = isMarkActive(state, schema.marks[markType]);

      if (hasMark) {
        tr.removeMark($from.pos, $to.pos, mark);
        // if (dispatch) dispatch(tr);
      }
// console.log(attrs)
      tr.addMark($from.pos, $to.pos, mark.create({originalAttributes: attrs}));

      if (dispatch) dispatch(tr);
      return true;
    }
  }

  clearToolbarButton(button) {
    const btnNode = this.dom.querySelector(`#${'editor-button-' + button}`);

    if (this.toolbarPopups[button]) {
      //Clean up all or any that's active.
      btnNode.classList.remove('editor-button-active');
    }
    // else {
      //Checks if the other buttons are connected to an applied node/mark, then make active.
      this.updateButtonState(schema, btnNode, button, this.editorView);
    // }
  }

  clearToolbarForm(toolbarForm) {
    toolbarForm.classList.remove('editor-form-active');
    toolbarForm.removeAttribute('style');
    toolbarForm.reset();
    this.editorView.focus();
  }

  // populateForms takes form node and editorView.state
  populateFormImg(button, node, state) {
    const fileInput = node.querySelector('[name="img-file"]');
    const altInput = node.querySelector('[name="img-alt"]');
    let srcInput = node.querySelector('[name="img-src"]');

    // TODO: prepopulate alt from selection
    var selectedText = state.doc.textBetween(state.selection.from, state.selection.to, "\n");

    try {
      const selectedURL = new URL(selectedText);
      srcInput.value = selectedText;
    }
    catch(e) {
      altInput.value = selectedText;
    }

    fileInput.addEventListener("change", async (e) => {
      const preview = node.querySelector('.img-preview');

      await updateImagePreview(e, fileInput, preview);

      const previewImageNode = preview.querySelector('img[src]');

      if (previewImageNode) {
        srcInput = node.querySelector('[name="img-src"]');
        srcInput.value = previewImageNode.src;
      }
    });
  }

  populateFormRequirement(button, node, state) {
    // clear previous errors - TODO maybe this should happen elsewhere
    const previousErrors = node.querySelectorAll('.error');
    if (previousErrors.length) {
      previousErrors.forEach(error => error.remove());
      node.querySelector('.editor-form-submit').disabled = false;
    }

    var selectedTextContent = state.doc.textBetween(state.selection.from, state.selection.to, "\n");

    var requirementSubjectURI, requirementSubjectLabel, requirementLevelURI, requirementLevelLabel;
    var prevRequirementSubjectLabel, prevRequirementLevelLabel;

    const requirementSubject = document.querySelector('#requirement-subject');
    const requirementLevel = document.querySelector('#requirement-level');

    //Build error
    const legend = node.querySelector('legend');

    const requirementSubjectOptions = [...requirementSubject.querySelectorAll('option')];
    const requirementLevelOptions = [...requirementLevel.querySelectorAll('option')];

    const hasRequirementSubjectMatch = requirementSubjectOptions.some(option => selectedTextContent.toLowerCase().includes(option.textContent.trim().toLowerCase()));
    const hasRequirementLevelMatch = requirementLevelOptions.some(option => selectedTextContent.toLowerCase().includes(option.textContent.trim().toLowerCase()));

    const errorList = [];

    if (!hasRequirementSubjectMatch || !hasRequirementLevelMatch) {
      const classesOfProducts = requirementSubjectOptions.map(option => `<a href="${option.value}">${option.textContent}</a>`);
      const requirementLevels = requirementLevelOptions.map(option => `<a href="${option.value}">${option.textContent}</a>`);

      if (!hasRequirementSubjectMatch) {
        errorList.push(`Selected text does not include a product class, i.e., the requirement's subject, such as ${classesOfProducts.join(', ')}.`);
      }

      if (!hasRequirementLevelMatch) {
        errorList.push(`Selected text does not include a normative keyword, i.e., the requirement's level, such as ${requirementLevels.sort(() => Math.random() - 0.5).slice(0, 3).join(', ')}, etc.`);
      }
    }

    if (errorList.length) {
      let errorListItems = [];
      errorList.forEach((errorMessage) => {
        errorListItems.push(`<li>${errorMessage}</li>`);
      })
      legend.insertAdjacentHTML('afterend', `<ul class="error">${errorListItems.join('')}</ul>`);
      node.querySelector('.editor-form-submit').disabled = true;
    }

    if (requirementSubject) {
      requirementSubjectOptions.forEach(option => {
        var optionTextContent = option.textContent.trim();
        if (selectedTextContent.toLowerCase().includes(optionTextContent.toLowerCase())) {
          option.selected = true;
          requirementSubjectLabel = optionTextContent;
          requirementSubjectURI = option.value;
          prevRequirementSubjectLabel = requirementSubjectLabel;
        }
      });

      requirementSubject.addEventListener('change', e => {
        var selectedOptionValue = e.target.value;
        var selectedOptionTextContent = e.target.querySelector(`[value="${selectedOptionValue}"]`).textContent.trim();

        var requirementSubjectCurrentNode = node.querySelector('#requirement-preview-samp [rel="spec:requirementSubject"]');

        requirementSubjectCurrentNode.setAttribute('resource', selectedOptionValue);
        requirementSubjectCurrentNode.textContent = selectedOptionTextContent;
      });
    }


    if (requirementLevel) {
      requirementLevel.querySelectorAll('option').forEach(option => {
        var optionTextContent = option.textContent.trim();
        if (selectedTextContent.toLowerCase().includes(optionTextContent.toLowerCase())) {
          option.selected = true;
          requirementLevelLabel = optionTextContent;
          requirementLevelURI = option.value;
          prevRequirementLevelLabel = requirementLevelLabel;
        }
      });

      requirementLevel.addEventListener('change', e => {
        var selectedOptionValue = e.target.value;
        var selectedOptionTextContent = e.target.querySelector(`[value="${selectedOptionValue}"]`).textContent.trim();

        var requirementLevelCurrentNode = node.querySelector('#requirement-preview-samp [rel="spec:requirementLevel"]');

        requirementLevelCurrentNode.setAttribute('resource', selectedOptionValue);
        requirementLevelCurrentNode.textContent = selectedOptionTextContent;
      });
    }

    //XXX: If the selection already includes a link with relation cito:citesAsSourceDocument or spec:basedOnConsensus, use that to populate #requirement-consensus. Is this the best way:
    const requirementConsensus = document.querySelector('#requirement-consensus');
    if (requirementConsensus) {
      state.doc.nodesBetween(state.selection.from, state.selection.to, node => {
        node.marks.forEach(mark => {
          // console.log(mark)
          if (mark.type.name === 'a' && ['cito:citesAsSourceDocument','spec:basedOnConsensus'].includes(mark.attrs.originalAttributes.rel)) {
            requirementConsensus.value = mark.attrs.originalAttributes.href;
          }
        });
      });
    }

    let selectedLanguage = '';
    const requirementLanguage = document.querySelector('#requirement-language');

    if (requirementLanguage) {
      requirementLanguage.addEventListener('change', e => {
        selectedLanguage = e.target.value;

        var requirementCurrentNode = node.querySelector('#requirement-preview-samp [rel="spec:requirement"]');

        requirementCurrentNode.setAttribute('lang', selectedLanguage);
        requirementCurrentNode.setAttribute('xml:lang', selectedLanguage);
      });
    }

    var r = {};
    r.subject = requirementSubjectURI;
    r.level = requirementLevelURI;
    r.prevSubjectLabel = prevRequirementSubjectLabel;
    r.prevLevelLabel = prevRequirementLevelLabel;
    r.selectedTextContent = selectedTextContent;
    r.lang = selectedLanguage;
    r.basedOnConsensus = requirementConsensus;

    console.log(state.selection.content())
    const { $from, $to } = state.selection;

    let depth = $from.depth;
    while (depth >= 0 && $from.node(depth) !== $to.node(depth)) {
      depth--;
    }

    const ancestorNode = $from.node(depth); 

    const wrapper = document.createElement('div');
    ancestorNode.content.forEach(child => {
      wrapper.appendChild(DOMSerializer.fromSchema(schema).serializeNode(child));
    });

    const selectedHtmlString = wrapper.getHTML();
    console.log(selectedHtmlString);
    r.selectedHtmlString = selectedHtmlString;

    var html = createRDFaHTMLRequirement(r, 'requirement')

    // console.log(html)

    var preview = document.querySelector('#requirement-preview-samp');
    preview.replaceChildren(fragmentFromString(html));
  }

  populateFormCitation(button, node, state) {
    // const { selection } = state;
    // const { from, to } = selection;
    const citationSpecRefSearch = document.querySelector('#citation-specref-search');
    // console.log(citationSpecRefSearch);
  
    const citationUrl = document.querySelector('#citation-url');
    // console.log(citationUrl);
  
    citationSpecRefSearch.focus();
    citationSpecRefSearch.value = state.doc.textBetween(state.selection.from, state.selection.to, "\n");
  
    var specrefSearchResults = document.querySelector('.specref-search-results');
  
    if (specrefSearchResults) {
      specrefSearchResults.replaceChildren();
    }

    // console.log(specrefSearchResults);
  
    var specref = document.querySelector('#citation-specref-search-submit');
    // console.log(specref);

    specref.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // console.log(e);
  
      var keyword = citationSpecRefSearch.value.trim();
      var url = 'https://api.specref.org/search-refs?q=' + encodeURIComponent(keyword);
      var headers = {'Accept': 'application/json'};
      var options = {'noCredentials': true};

      getResource(url, headers, options)
        .then(response => {
          // console.log(response);
          return response.text();
        })
        .then(data => {
          data = JSON.parse(data);
          // console.log(data);
    
          var searchResultsHTML = '';
          var searchResultsItems = [];
    
          var href, title, publisher, date, status;
    
          //TODO: Clean input data
  
          Object.keys(data).forEach(key => {
            // console.log(data[key])
            if (typeof data[key] === 'object' && !Array.isArray(data[key]) &&
                'href' in data[key] &&
                !('aliasOf' in data[key]) && !('versionOf' in data[key]) &&
    
              //fugly WG21
                (!('publisher' in data[key]) || ((data[key].publisher.toLowerCase() != 'wg21') || ((data[key].href.startsWith('https://wg21.link/n') || data[key].href.startsWith('https://wg21.link/p') || data[key].href.startsWith('https://wg21.link/std')) && !data[key].href.endsWith('.yaml') && !data[key].href.endsWith('/issue') && !data[key].href.endsWith('/github') && !data[key].href.endsWith('/paper'))))
    
                ) {
    
              href = data[key].href;
              title = data[key].title || href;
              publisher = data[key].publisher || '';
              date = data[key].date || '';
              status = data[key].status || '';
    
              if (publisher) {
                publisher = '. ' + publisher;
              }
              if (date) {
                date = '. ' + date;
              }
              if (status) {
                status = '. ' + status;
              }
    
              searchResultsItems.push('<li><input name="specref-item" id="ref-' + key + '" type="radio" value="' + key + '" /> <label for="ref-' + key + '"><a href="' + href + '" rel="noopener" target="_blank">' + title + '</a>' + publisher + date + status + '</label></li>');
            }
          });
          searchResultsHTML = '<ul>' + searchResultsItems.join('') + '</ul>';
    
          if (searchResultsItems) {
            specrefSearchResults = document.querySelector('.specref-search-results');
            if(specrefSearchResults) {
              specrefSearchResults.replaceChildren(fragmentFromString(searchResultsHTML));
            }
    
            //XXX: Assigning 'change' action to ul because it gets removed when there is a new search result / replaced. Perhaps it'd be nicer (but more expensive?) to destroy/create .specref-search-results node?
            specrefSearchResults.querySelector('ul').addEventListener('change', (e) => {
              var checkedCheckbox = e.target.closest('input');
              if (checkedCheckbox) {
                // console.log(e.target);
                document.querySelector('#citation-url').value = data[checkedCheckbox.value].href;
              }
            });
          }
        });
    });

    citationUrl.focus();

    document.querySelector('.editor-form input[name="citation-ref-type"]').checked = true;
  }


  //TODO function getTransactionHistory()

  getPopulateForms() {
    return {
      img: this.populateFormImg,
      citation: this.populateFormCitation,
      requirement: this.populateFormRequirement,
    }
  }

  updateButtonState(schema, buttonNode, button, editorView) {
    const nodeType = getSchemaTypeFromButton(schema, button);
    let isActive;
  
    if (nodeType) {
      if (nodeType.type === "mark") {
        isActive = isMarkActive(editorView.state, nodeType.schema);
      }
      else if (nodeType.type === "node") {
        isActive = isNodeActive(editorView.state, nodeType.schema, { level: nodeType.level });
      }
    } 
  
    if (isActive !== undefined) {
      if (isActive) {
        buttonNode.classList.add('editor-button-active');
      }
      else {
        buttonNode.classList.remove('editor-button-active');
      }
    }
  } 
}

//Checks whether a given a mark schema is applied / active to the current selection.
function isMarkActive(state, type) {
  const { from, $from, to, empty } = state.selection;
  if (empty) {
    return type.isInSet(state.storedMarks || $from.marks());
  }
  else {
    return state.doc.rangeHasMark(from, to, type);
  }
}

//Checks whether a given a node schema is applied / active to the current selection.
function isNodeActive(state, type, attrs = {}) {
  const { selection } = state;
  const { $from, to, node } = selection;

  if (node) {
    return node.type === type && Object.entries(attrs).every(([key, value]) => node.attrs[key] === value);
  }

  const parent = $from.parent;

  return (
    to <= $from.end() &&
    parent.type === type &&
    Object.entries(attrs).every(([key, value]) => parent.attrs[key] === value)
  );
}

//Given a button action (string), e.g., h1-h6, a, section, ul, returns the associated schema. If there is no associated schema, returns null.
function getSchemaTypeFromButton(schema, button) {
  if (!schema || !button) return null;

  const headingMatch = button.match(/^h([1-6])$/);
  if (headingMatch) {
    return { 
      type: "node",
      schema: schema.nodes.heading,
      level: parseInt(headingMatch[1], 10) 
    };
  }

  if (schema.marks[button]) {
    return { type: "mark", schema: schema.marks[button] };
  }

  if (schema.nodes[button]) {
    return { type: "node", schema: schema.nodes[button] };
  }

  return null;
}

//Heading is a schema (as opposed to h1-h6). This is an intermediary step to find out how to apply setBlockType (which level of heading). If heading is applied, it either toggles to new heading or to paragraph.
function toggleHeading(schema, level) {
  return (state, dispatch) => {
    const { nodes } = schema;
    const { $from } = state.selection;
    const nodeType = nodes.heading;
    
    if ($from.node().type === nodeType && $from.node().attrs.level === level) {
      return setBlockType(nodes.p)(state, dispatch);
    }
    else {
      return setBlockType(nodeType, { level })(state, dispatch);
    }
  };
}

/*
TODO: Heading sectioning

          switch(this.action) {
              case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
                //XXX: Which heading level are we at?
                var parentSectionHeading = '';
                for (var i = 0; i < parentSection.childNodes.length; i++) {
                  parentSectionHeading = parentSection.childNodes[i].nodeName.toLowerCase();
                  if(DO.C.Editor.headings.indexOf(parentSectionHeading) > 0) {
// console.log(parentSectionHeading);
                    break;
                  }
                }
                var pSH = parseInt(parentSectionHeading.slice(-1));

                //XXX: Which heading level is the action?
                var cSH = parseInt(this.action.slice(-1));
// console.log("parentH: " + pSH);
// console.log("currentH: " + cSH);
// console.log(cSH-pSH);

                var closePreviousSections = '';
                // if (cSH > pSH) {}
                for (i = 0; i <= (pSH-cSH); i++) {
                  console.log("i: " + i);
                  closePreviousSections += '</div></section>';
                }
// console.log(closePreviousSections);
// console.log(this.base.selection);

                var selection = window.getSelection();
// console.log(this.base.selection);
// console.log(selection);

                if (selection.rangeCount) {
                  // FIXME: Seem ununsed. Remove later. 
                  // range = selection.getRangeAt(0);
                  // parent = selectedParentElement;

// console.log(range);
                  //Section
                  var sectionId = generateAttributeId(null, this.base.selection);
                  var section = document.createElement('section');
                  section.id = sectionId;
                  section.setAttribute('rel', 'schema:hasPart');
                  section.setAttribute('resource', '#' + sectionId);
// console.log(section);


                  //Heading
                  var heading = document.createElement(tagNames[0]);
                  heading.setAttribute('property', 'schema:name');
                  heading.setHTMLUnsafe(domSanitize(this.base.selection));
// console.log(heading);
// console.log(selection);


                  var divDescription = parentSection.getElementsByTagName('div')[0];
// console.log(divDescription);
// console.log(divDescription.childNodes);
// console.log(divDescription.length);
// console.log(selectedParentElement);
// console.log(selectedParentElement.childNodes);
// console.log(selectedParentElement.lastChild);
// console.log(selectedParentElement.lastChild.length);

                  r = selection.getRangeAt(0);
// console.log(r);
// console.log(r.startContainer);
// console.log(r.startOffset);
// console.log(r.endOffset);
                  //Remaining nodes
                  var r = document.createRange();
                  r.setStart(selection.focusNode, selection.focusOffset);
                  r.setEnd(selectedParentElement.lastChild, selectedParentElement.lastChild.length);
// console.log(r.commonAncestorContainer.nodeType);

// console.log(r.startContainer);
// console.log(r.endContainer);
// console.log(selection.anchorNode);
// selection.removeAllRanges(); //XXX: is this doing anything?
// selection.addRange(r);

// console.log(selection.anchorNode);
                  var fragment = r.extractContents();
// console.log(fragment);
// console.log(selection);
// console.log(r);
// console.log(r.startContainer);
// console.log(r.startOffset);
// console.log(r.endOffset);
                  if (fragment.firstChild.nodeType === 3) {
                    //TODO: trim only if there is one child which is a textnode:  // fragment.firstChild.nodeValue = fragment.firstChild.nodeValue.trim();

// console.log(fragment);
                    var sPE = selectedParentElement.nodeName.toLowerCase();
                    switch(sPE) {
                      case "p": default:
                        var xSPE = document.createElement(sPE);
                        xSPE.appendChild(fragment.cloneNode(true));
                        fragment = fragmentFromString(xSPE.outerHTML);
                        break;
                      //TODO: Other cases?
                    }
                  }
// console.log(fragment);
// console.log(selection);

                  r = selection.getRangeAt(0);
// console.log(r);
// console.log(r.startContainer);
// console.log(r.startOffset);
// console.log(r.endOffset);

                  //Description
                  var div = document.createElement('div');
                  div.setAttribute('property', 'schema:description');
                  div.appendChild(fragment.cloneNode(true));

                  //Put it together
                  section.appendChild(heading);
                  section.appendChild(div);
// console.log(range.startContainer);

                  var selectionUpdated = document.createElement('div');
                  selectionUpdated.appendChild(section);
                  selectionUpdated = selectionUpdated.getHTML();
// console.log(selectionUpdated);


                  //Sub-section
                  if (cSH-pSH > 0) {
                    MediumEditor.util.insertHTMLCommand(this.base.selectedDocument, selectionUpdated);
                  }
                  else {
// console.log(selection);
// console.log(parentSection);
                    MediumEditor.selection.selectNode(parentSection, document);
                    r = selection.getRangeAt(0);
// console.log(r);
// console.log(r.startOffset);
// console.log(r.endOffset);


                    //This selection is based off previous operations; handling remaining Nodes after the selection. So, this is not accurate per se.. the range might be accurate.
                    selection = window.getSelection();
// console.log(selection);
                    r = selection.getRangeAt(0);
// console.log(r);
// console.log(r.startOffset);
// console.log(r.endOffset);


                    r = document.createRange();
                    r.setStartAfter(parentSection);
// console.log(r);
                    r.setEndAfter(parentSection);
// console.log(r);
                    r.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(r);
// console.log(selection);
                    var foo = document.createElement('div');
                    foo.appendChild(parentSection);
                    parentSection = foo.getHTML();
// console.log(parentSection + selectionUpdated);
                    MediumEditor.util.insertHTMLCommand(this.base.selectedDocument, parentSection + selectionUpdated);
                  }
                }

*/


function togglePreCodeWrap(schema) {
  return (state, dispatch) => {
    const { nodes } = schema;
    const { $from } = state.selection;
    const nodeType = nodes.pre;

    // state.selection -> break it up on newlines

    // iterate over each license
  

    // wrapIn(code) --> Array

    // return wrapIn(pre)
    
    // if ($from.node().type === nodeType) {
    //   return wrapIn(nodes.p)(state, dispatch);
    // }
    // else {
    //   return wrapIn(nodeType)(state, dispatch);
    // }
  };
}

function findParentList($from, schema) {
  let parentList = null;
  let parentListPos = $from.pos;
  let depth = $from.depth;

  while (depth > 0) {
    const node = $from.node(depth);
    if (node.type === schema.nodes.ul || node.type === schema.nodes.ol) {
      parentList = node;
      parentListPos = $from.before(depth);
      break;
    }
    depth--;
  }

  return parentList ? { parentList, parentListPos } : null;
}

// Switch between paragraph and listTypes: ol, ul
function toggleList(schema, listType) {
  return (state, dispatch) => {
    const { nodes } = schema;
    const nodeType = nodes[listType];
    const { $from } = state.selection;

    const grandparent = $from.node(-1);

    if (grandparent && grandparent.type === nodes.li) {
      const parentListInfo = findParentList($from, schema);

      if (parentListInfo) {
        const { parentList, parentListPos } = parentListInfo;

        if (parentList.type === nodeType) {
          return liftListItem(nodes.li)(state, dispatch);
        } else {
          return changeListType(state, dispatch, nodeType, parentListPos);
        }
      }
    }

    return wrapInList(nodeType)(state, dispatch);
  };
}

function changeListType(state, dispatch, newListType, parentListPos) {
  const { tr } = state;
  const { schema } = state;

  tr.setNodeMarkup(parentListPos, newListType);

  if (dispatch) {
    dispatch(tr);
  }

  return true;
}


const fileTypes = [
  "image/apng",
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/pjpeg",
  "image/png",
  "image/svg+xml",
  "image/tiff",
  "image/webp",
  "image/x-icon",
];

function validFileType(file) {
  return fileTypes.includes(file.type);
}

async function updateImagePreview(e, input, preview) {
  while (preview.firstChild) {
    preview.removeChild(preview.firstChild);
  }

  const curFiles = input.files;

  if (curFiles.length === 0) {
    const para = document.createElement("p");
    para.textContent = "No files currently selected for upload.";
    preview.appendChild(para);
  }
  else {
    const list = document.createElement("ol");
    preview.appendChild(list);

    for (const file of curFiles) {
      const listItem = document.createElement("li");
      const para = document.createElement("p");

      if (validFileType(file)) {
        const image = document.createElement("img");
        image.src = URL.createObjectURL(file);
        image.alt = image.title = file.name;

        const dimensions = await getImageDimensions(image.src)
          image.width = dimensions.width;
          image.height = dimensions.height;

        para.textContent = `
          File name: ${file.name}.
          Size: ${returnFileSize(file.size)}.
          Dimensions: ${image.width}x${image.height}px.`;

        listItem.appendChild(image);
        listItem.appendChild(para);
        list.appendChild(listItem);
      }
      else {
        para.textContent = `File name ${file.name}: Not a valid file type. Update your selection.`;
        listItem.appendChild(para);
      }

      list.appendChild(listItem);
    }
  }
}

function returnFileSize(number) {
  if (number < 1e3) {
    return `${number} bytes`;
  }
  else if (number >= 1e3 && number < 1e6) {
    return `${(number / 1e3).toFixed(1)} KB`;
  }
  else {
    return `${(number / 1e6).toFixed(1)} MB`;
  }
}

async function getImageDimensions(blobUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = function () {
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight
      });
    };

    img.onerror = function () {
      reject(new Error('Error loading image'));
    };
  
    img.src = blobUrl;
  })
}

//XXX: I don't know what to do with this thing yet - VB
// I think this should actually be getClosestSectionNodeEndPos and return parentPos + parentNode.nodeSize (which is the position where the fragment should be inserted to resemble `beforeend`)
function getClosestSectionNodeEndPos(view) {
  const { from } = view.state.selection;
  const nodePos = view.state.doc.resolve(from);

  function findClosestAncestor(pos) {
    let parentPos = pos.before();
    let parentNode = view.state.doc.nodeAt(parentPos);

    while (parentNode) {
      // console.log("parentNode", parentNode)

      var parentNodeName = parentNode.type.name.toLowerCase();

      if (parentNodeName === 'section') {
        return parentPos + parentNode.nodeSize;
      }
      else if (['div', 'article', 'main', 'body'].includes(parentNodeName)) {
        return parentPos + parentNode.nodeSize;
      }

      parentPos = view.state.doc.resolve(parentPos).before();
      parentNode = view.state.doc.nodeAt(parentPos);
    }

    return null;
  }

  return findClosestAncestor(nodePos); 
}