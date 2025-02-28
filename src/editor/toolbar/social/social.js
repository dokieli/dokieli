import { formHandlerAnnotate } from "./handlers.js"
import { ToolbarView, annotateFormControls } from "../toolbar.js"
import { getAnnotationLocationHTML, getAnnotationInboxLocationHTML, getDocument } from "../../../doc.js";
import Config from "../../../config.js";
import { fragmentFromString } from "../../../util.js";
import { showUserIdentityInput } from "../../../auth.js";

const ns = Config.ns;

export class SocialToolbar extends ToolbarView {
  constructor(mode, buttons, editorView) {
    super(mode, buttons, editorView)
    console.log(mode)

    this.editorView = editorView;
  }

  // FIXME: this doesn't work properly 
  updateToolbarVisibility(e) {
    if (this.dom.classList.contains('editor-toolbar-active') && !e.target.closest('.do') && e.target.closest('input[type]')?.type !== 'file') { 
console.log('------here now-----')
      this.cleanupToolbar();
    }
  }

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

  getTextQuoteSelector() {
    Editor.restoreSelection();
  
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
  
    var selectedParentElement = getSelectedParentElement(range);
  // console.log('getSelectedParentElement:', selectedParentElement);
  
    const selectionHTML = getSelectionAsHTML(selection); //.replace(Config.Editor.regexEmptyHTMLTags, '');
  
    var exact = selectionHTML;
    // var selectionState = MediumEditor.selection.exportSelection(selectedParentElement, document);
    const selectionState = exportSelection(selectedParentElement, selection);
    var start = selectionState.start;
    var end = selectionState.end;
    var prefixStart = Math.max(0, start - Config.ContextLength);
  // console.log('pS ' + prefixStart);
    var prefix = selectedParentElement.textContent.substr(prefixStart, start - prefixStart);
  // console.log('-' + prefix + '-');
    prefix = escapeCharacters(prefix);
  
    var suffixEnd = Math.min(selectedParentElement.textContent.length, end + Config.ContextLength);
  // console.log('sE ' + suffixEnd);
    var suffix = selectedParentElement.textContent.substr(end, suffixEnd - end);
  // console.log('-' + suffix + '-');
    suffix = escapeCharacters(suffix);
  
    return {
      type: 'TextQuoteSelector',
      exact,
      prefix,
      suffix
    }
  }

  getSelectionAsHTML() {

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
    toolbarForm.classList.remove('editor-toolbar-form-active');
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

    getLinkRelation(ns.oa.annotationService.value, null, getDocument())
      .then(url => {
        Config.AnnotationService = url[0];
        updateAnnotationServiceForm(action);
        showAction();
      })
      .catch(reason => {
        //TODO signinRequired
        if(this.signInRequired() && !Config.User.IRI) {
          showUserIdentityInput();
        }
        else {
          updateAnnotationServiceForm(action);
          // XXX: Revisit. Was used in MediumEditor. Probably no longer needed?
          // showAction();
        }
      });
  }
  
  signInRequired(button) {
    const buttons = {
      approve: true,
      disapprove: true,
      specificity: true,
      bookmark: true,
      comment: true
    }

    return buttons[button];
  }

  //TODO function getTransactionHistory()
  getPopulateForms() {
    return {
      approve: this.populateFormAnnotate,
      disapprove: this.populateFormAnnotate,
      specificity: this.populateFormAnnotate,
      bookmark: this.populateFormAnnotate,
      comment: this.populateFormAnnotate
    }
  }
}

