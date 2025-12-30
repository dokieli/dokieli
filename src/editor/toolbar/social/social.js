import { formHandlerAnnotate, shareButtonHandler } from "./handlers.js"
import { ToolbarView, annotateFormControls, updateAnnotationInboxForm } from "../toolbar.js"
import Config from "../../../config.js";
import { exportSelection, getSelectedParentElement, restoreSelection } from "../../utils/annotation.js";
import { htmlEncode } from "../../../utils/html.js";
import { i18n } from "../../../i18n.js";

const ns = Config.ns;

export class SocialToolbar extends ToolbarView {
  constructor(mode, buttons, editorView) {
    super(mode, buttons, editorView)
    // console.log('mode:', mode);

    this.editorView = editorView;
  }

  // FIXME: this doesn't work properly 
  updateToolbarVisibility(e) {
    if (this.dom.classList.contains('editor-form-active') && !e.target.closest('.do') && e.target.closest('input[type]')?.type !== 'file') { 
      // console.log('------HERE NOW: cleanupToolbar');
      this.cleanupToolbar();
    }
  }

  getToolbarButtonClickHandlers() {
    return {
      share: shareButtonHandler
    }
  }

  //TODO: Create formValidationHandlers to handle `input` and `invalid` event handlers. Move oninput/oninvalid out of form's inline HTML
  getFormEventListeners() {
    return {
      approve: [ { event: 'submit', callback: (e) => this.formHandlerAnnotate(e, 'approve') }, { event: 'click', callback: (e) => this.formClickHandler(e, 'approve') } ],
      disapprove: [ { event: 'submit', callback: (e) => this.formHandlerAnnotate(e, 'disapprove') }, { event: 'click', callback: (e) => this.formClickHandler(e, 'disapprove') } ],
      specificity: [ { event: 'submit', callback: (e) => this.formHandlerAnnotate(e, 'specificity') }, { event: 'click', callback: (e) => this.formClickHandler(e, 'specificity') } ],
      bookmark: [ { event: 'submit', callback: (e) => this.formHandlerAnnotate(e, 'bookmark') }, { event: 'click', callback: (e) => this.formClickHandler(e, 'bookmark') } ],
      comment: [ { event: 'submit', callback: (e) => this.formHandlerAnnotate(e, 'comment') }, { event: 'click', callback: (e) => this.formClickHandler(e, 'comment') } ],
    }
  }

  getFormHandlers() {
    return [
      { name: 'formHandlerAnnotate', fn: formHandlerAnnotate },
    ];
  }

  clearSelection() {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      selection.removeAllRanges();
    }
  }

  getSelectionAsHTML(selection) {
    selection = selection || window.getSelection();
    if (!selection.rangeCount) return "";
  
    const div = document.createElement("div");
  
    for (let i = 0; i < selection.rangeCount; i++) {
      const range = selection.getRangeAt(i);
      const fragment = range.cloneContents();
  
      // console.log("RANGE CONTENTS:");
      // fragment.childNodes.forEach(node => {
      //   console.log("Child:", node);
      //   if (node.children) {
      //     Array.from(node.children).forEach(child => console.log("Grandchild:", child));
      //   }
      // });
  
      div.appendChild(fragment);
    }
  
    return div.getHTML();
  }  

  getTextQuoteSelector() {
    restoreSelection(this.selection);
  
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
  
    var selectedParentElement = getSelectedParentElement(range);
  // console.log('getSelectedParentElement:', selectedParentElement);
  
    const selectionHTML = this.getSelectionAsHTML(selection); //.replace(Config.Editor.regexEmptyHTMLTags, '');
  
    var exact = selectionHTML;
    // var selectionState = MediumEditor.selection.exportSelection(selectedParentElement, document);
    const selectionState = exportSelection(selectedParentElement, selection);
    var start = selectionState.start;
    var end = selectionState.end;
    var prefixStart = Math.max(0, start - Config.ContextLength);
  // console.log('pS ' + prefixStart);
    var prefix = selectedParentElement.textContent.substr(prefixStart, start - prefixStart);
  // console.log('-' + prefix + '-');
    prefix = htmlEncode(prefix);
  
    var suffixEnd = Math.min(selectedParentElement.textContent.length, end + Config.ContextLength);
  // console.log('sE ' + suffixEnd);
    var suffix = selectedParentElement.textContent.substr(end, suffixEnd - end);
  // console.log('-' + suffix + '-');
    suffix = htmlEncode(suffix);
  
    return {
      type: 'TextQuoteSelector',
      exact,
      prefix,
      suffix
    }
  }

  replaceSelectionWithFragment(fragment) {

    const selection = this.selection;
    if (!selection.rangeCount) return;
    const ranges = [];
  
    for (let i = 0; i < selection.rangeCount; i++) {
      ranges.push(selection.getRangeAt(i));
    }
  
    const mergedRange = document.createRange();
    mergedRange.setStart(ranges[0].startContainer, ranges[0].startOffset);
    mergedRange.setEnd(ranges[ranges.length - 1].endContainer, ranges[ranges.length - 1].endOffset);
  
    selection.removeAllRanges();
  
    mergedRange.deleteContents();
  
    mergedRange.collapse(true);
  
    mergedRange.insertNode(fragment);
  
    selection.removeAllRanges();
  }

  getFormLegends() {
    return {
      approve: i18n.t('editor.toolbar.approve.form.legend.textContent'),
      disapprove: i18n.t('editor.toolbar.disapprove.form.legend.textContent'),
      specificity: i18n.t('editor.toolbar.specificity.form.legend.textContent'),
      bookmark: i18n.t('editor.toolbar.bookmark.form.legend.textContent'),
      comment: i18n.t('editor.toolbar.comment.form.legend.textContent'),
    }
  }

  getFormPlaceholders() {
    return {
      approve: i18n.t('editor.toolbar.approve.form.textarea.placeholder'),
      disapprove: i18n.t('editor.toolbar.disapprove.form.textarea.placeholder'),
      specificity: i18n.t('editor.toolbar.specificity.form.textarea.placeholder'),
      bookmark: i18n.t('editor.toolbar.bookmark.form.textarea.placeholder'),
      comment: i18n.t('editor.toolbar.comment.form.textarea.placeholder'),
    }
  }

  getToolbarPopups() {
    const toolbarPopups = {
      approve: (options) => annotateFormControls(options),
      disapprove: (options) => annotateFormControls(options),
      specificity: (options) => annotateFormControls(options),
      bookmark: (options) => annotateFormControls(options),
      comment: (options) => annotateFormControls(options),
      // note: (options) => annotateFormControls(options), // FIXME: this actually belongs in the other one
    }

    return toolbarPopups;
  }

  clearToolbarButton(button) {
    const btnNode = this.dom.querySelector(`#${'editor-button-' + button}`);

    if (this.toolbarPopups[button]) {
      //Clean up all or any that's active.
      btnNode.classList.remove('editor-button-active');
    }
  }

  clearToolbarForm(toolbarForm, options = {}) {
    toolbarForm.classList.remove('editor-form-active');
    toolbarForm.removeAttribute('style');
    
    //TODO
    const values = {};
    if (options.preserveFields) {
      options.preserveFields.forEach((field) => {
        // store fields values in values
      })
      // reset the form

      // bring back the saved values
    }
    else {
      toolbarForm.reset();
    }
  }

  populateFormAnnotate(action, node) {
    updateAnnotationInboxForm(action);
  }

  //TODO function getTransactionHistory()
  getPopulateForms() {
    return {
      approve: this.populateFormAnnotate.bind(this),
      disapprove: this.populateFormAnnotate.bind(this),
      specificity: this.populateFormAnnotate.bind(this),
      bookmark: this.populateFormAnnotate.bind(this),
      comment: this.populateFormAnnotate.bind(this)
    }
  }
}
