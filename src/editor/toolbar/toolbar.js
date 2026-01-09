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

import { schema } from "../schema/base.js"
import { getButtonHTML } from "../../ui/buttons.js"
import { getAnnotationInboxLocationHTML, getAnnotationLocationHTML, getClassesOfProductsConcepts, getDocument, getDocumentContentNode, getLanguageOptionsHTML, getLicenseOptionsHTML, getReferenceLabel } from "../../doc.js";
import { getTextQuoteHTML, cloneSelection, setSelection, getSelectedParentElement } from "../utils/annotation.js";
import { escapeRegExp, matchAllIndex, fragmentFromString } from "../../util.js";
import { showUserIdentityInput } from "../../auth.js";
import { getLinkRelation } from "../../graph.js";
import Config from "../../config.js";
import { i18n } from "../../i18n.js";

const ns = Config.ns;

export class ToolbarView {
  constructor(mode, buttons, editorView) {
    this.mode = mode;
    this.toolbarCommands = this.getToolbarCommands();

    this.toolbarPopups = this.getToolbarPopups()
    this.selection = null;

    this.buttons = buttons.map(button => { 
      let buttonDisabled = false;

      if (button === 'requirement' && !getClassesOfProductsConcepts().length) {
        buttonDisabled = true;
      }
      return { 
        button, 
        command: this.toolbarCommands[button], 
        dom: () => fragmentFromString(getButtonHTML({ button, buttonDisabled })).firstChild 
      } 
    })

    this.populateForms = this.getPopulateForms();

    // Default empty formHandlers, listeners (subclasses should override)
    this.formHandlers = this.getFormHandlers();

    this.formLegends = this.getFormLegends();
    this.formPlaceholders = this.getFormPlaceholders();

    // Bind event handlers
    this.bindFormHandlers();

    this.formEventListeners = this.getFormEventListeners();
    this.toolbarButtonEventListeners = this.getFormEventListeners();
    this.toolbarButtonClickHandlers = this.getToolbarButtonClickHandlers();

    // for PM stuff
    this.editorView = editorView;

    // for DOM stuff
    this.documentBody = editorView?.dom.parentNode ?? document.body;

    this.dom = document.createElement("div");
    this.dom.id = 'document-editor';
    this.dom.className = 'do editor-toolbar editor-form-view-transition';
    this.dom.setAttribute('lang', Config.User.UI.Language);
    this.dom.setAttribute('xml:lang', Config.User.UI.Language);
    this.dom.setAttribute('dir', Config.User.UI.LanguageDir);

    this.addToolbar();

    this.selectionHandler = (e) => this.selectionUpdate(editorView);

    this.updateToolbarVisibilityHandler = (e) => this.updateToolbarVisibility(e);
    // Attach the event listener only in social mode, find a better way of doing this
    // this is still being attached on author mode, or not cleaned up properly
    // if (mode !== "author") {
    //   document.addEventListener("selectionchange", this.selectionHandler);
    // }

    document.removeEventListener("keyup", this.selectionHandler);
    document.removeEventListener("mouseup", this.selectionHandler);


    document.addEventListener("keyup", this.selectionHandler); 
    document.addEventListener("mouseup", this.selectionHandler); 
    this.updateToolbarVisibility = this.updateToolbarVisibility.bind(this);
    this.formClickHandler = this.formClickHandler.bind(this);
    this.selectionUpdate = this.selectionUpdate.bind(this);
    // this.cleanupToolbar = this.cleanupToolbar.bind(this);
    // this.clearToolbarForm = this.clearToolbarForm.bind(this);

    document.removeEventListener("mousedown", this.updateToolbarVisibilityHandler);
    document.addEventListener("mousedown", this.updateToolbarVisibilityHandler);

    
  }

  initializeButtons(buttons) {
    buttons.forEach(({ button, command, dom }) => {
        const buttonNode = this.createButtonNode(button, dom);
        const listItem = document.createElement("li");
        listItem.appendChild(buttonNode);
        document.querySelector('.editor-form-actions').appendChild(listItem);

        this.updateButtonState(schema, buttonNode, button, this.editorView);
        this.setupPopup(button);
        this.attachButtonHandler(buttonNode, button, command);
    });
  }

  createButtonNode(button, domFunction) {
    const buttonNode = domFunction();
    buttonNode.id = 'editor-button-' + button;
    return buttonNode;
  }

  setupPopup(button) {
    const formControlsHTML = this.toolbarPopups[button]; // returns a function that builds the form HTML
    if (!formControlsHTML) return;

    const toolbarForm = document.createElement('form');
    toolbarForm.classList.add('editor-form');
    toolbarForm.id = 'editor-form-' + button;
    toolbarForm.appendChild(fragmentFromString(`${formControlsHTML({ button, legend: this.formLegends[button], placeholder: this.formPlaceholders[button] })}`));

    this.dom.appendChild(toolbarForm);

    if (this.formEventListeners[button]) {
      this.formEventListeners[button].forEach(({ event, callback }) => {
        toolbarForm.addEventListener(event, callback);
      });
    }
  }

  attachButtonHandler(buttonNode, button, command) {
      const handler = this.toolbarButtonClickHandlers[button] || ((e) => {
          e.preventDefault();
          e.stopPropagation();
          if (this.signInRequired(button)) {
              this.checkAnnotationServiceUpdateForm(button);
          }

          this.toggleButtonState(buttonNode, button, command);
          this.handlePopups(button);
      });

      buttonNode.addEventListener("click", handler);
  }

  toggleButtonState(buttonNode, button, command) {
      this.editorView?.focus();
      buttonNode.classList.toggle('editor-button-active');

      if (command) {
          command(this.editorView.state, this.editorView.dispatch, this.editorView);
      }

      this.buttons.forEach(({ button: btn }) => {
          const btnNode = this.dom.querySelector(`#editor-button-${btn}`);
          if (!this.toolbarPopups[btn]) {
              this.updateButtonState(schema, btnNode, btn, this.editorView);
          } else if (btn !== button) {
              btnNode.classList.remove('editor-button-active');
          }
      });
  }

  handlePopups(button) {
      if (!this.toolbarPopups[button]) return;

      const toolbarForm = this.dom.querySelector(`#editor-form-${button}`);
      this.closeOtherPopups(button);

      if (this.populateForms[button]) {
        const state = this.editorView?.state;
        this.populateForms[button](button, toolbarForm, state);
      }
      
      toolbarForm.classList.toggle('editor-form-active');

      this.positionPopup(toolbarForm);

      const formContent = toolbarForm.querySelector(`textarea#${button}-content`);
      const formFirstInput = toolbarForm.querySelector('input');
      const formFirstSelect = toolbarForm.querySelector('select');

      if (formContent) {
        formContent.focus();
      }
      else if (formFirstInput) {
        formFirstInput.focus();
      } 
      else if (formFirstSelect) {
        formFirstSelect.focus();
      }

      const lastClickedButton = this.dom.querySelector(`#editor-button-${button}`);
      
      const handleEscKey = (event) => {
        if (event.key === "Escape") {
          this.clearToolbarForm(toolbarForm);
          this.clearToolbarButton(button);
          document.removeEventListener("keydown", handleEscKey);
          lastClickedButton.focus();
        }
      }
      document.addEventListener("keydown", handleEscKey);
  }

  closeOtherPopups(activeButton) {
      this.buttons.forEach(({ button: b }) => {
          if (b !== activeButton && this.toolbarPopups[b]) {
              this.dom.querySelector(`#editor-form-${b}`).classList.remove('editor-form-active');
          }
      });
  }

  positionPopup(toolbarForm) {
      const margin = 10;
      const toolbarHeight = this.dom.offsetHeight;
      const toolbarWidth = this.dom.offsetWidth;
      const selection = window.getSelection();
      const range = selection.getRangeAt(0);
      const selectionPosition = range.getBoundingClientRect();

      toolbarForm.style.left = `${(toolbarWidth / 2) - (toolbarForm.offsetWidth / 2)}px`;
      toolbarForm.style.right = 'initial';

      if ((selectionPosition.top >= toolbarHeight + margin * 2) && (window.innerHeight - selectionPosition.bottom >= toolbarForm.offsetHeight + margin * 2)) {
          toolbarForm.style.top = `${toolbarHeight + selectionPosition.height + margin * 1.5}px`;
      } else if (selectionPosition.top >= toolbarHeight + toolbarForm.offsetHeight  + margin * 2) {
          toolbarForm.style.top = `-${toolbarForm.offsetHeight + margin / 2}px`;
      } else {
          toolbarForm.style.top = `${toolbarHeight + margin / 2}px`;
      }
  }

  // TODO: define default behavior for all of these methods

  replaceSelectionWithFragment() {

  }

  getSelectionAsHTML() {

  }

  
  getToolbarPopups() {
    return {}
  }

  getToolbarCommands() {
    return {}
  }

  getFormHandlers() {
    return [];
  }

  getFormLegends() {
    return {};
  }

  getFormPlaceholders() {
    return {};
  }

  bindFormHandlers() {
    this.getFormHandlers().forEach(handler => {
      this[handler.name] = handler.fn.bind(this);
    });
  }

  getToolbarButtonClickHandlers() {
    return {}
  }

  getFormEventListeners() {
    return {};
  }

  updateToolbarVisibility() {
    return;
  }

  addToolbar() {
    const documentEditor = document.getElementById('document-editor');

    if (documentEditor) {
      documentEditor.remove();
    }

    var ul = document.querySelector('.editor-form-actions');

    if (ul) { 
      ul.parentNode.removeChild(ul); 
    }

    const toolbarForms = this.dom.getElementsByClassName('editor-form');

    Array.from(toolbarForms).forEach((form) => {
      this.dom.removeChild(form);
    });

    this.ul = document.createElement('ul');
    this.ul.classList.add('editor-form-actions');
    this.dom.appendChild(this.ul);
    document.body.appendChild(this.dom);

    this.initializeButtons(this.buttons)
  }

  getPopulateForms() {
    return {};
  }

  signInRequired(button) {
    return;
  }

  // hides toolbar, updates state of all buttons, hides and resets all forms. 
  cleanupToolbar() {
    this.dom.classList.remove("editor-form-active");

// update buttons
    this.buttons.forEach(({button}) => {
      this.clearToolbarButton(button);
// clear forms
      if (this.toolbarPopups[button]) {
        const toolbarForm = document.querySelector('#editor-form-' + button + '.editor-form-active');
        if (toolbarForm) {
          this.clearToolbarForm(toolbarForm);
        }
      }
    })
  }

  //TODO: Clear active buttons where applicable (not active marks) after clicking away, hide popups. one fn to clear eveything.
  //FIXME: select text from right to left of a paragraph. while still click is held, let go on the left outside of the selected text. the selection disappears.
  updateToolbarVisibility() {
    return;
  }

  updateButtonState () {
    return;
  }


  isSelectionInDoNode() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return false;
    const range = selection.getRangeAt(0);
    const selectedParentElement = getSelectedParentElement(range);
    return selectedParentElement.closest('.do');
  }
  
  // Called when there is a state change, e.g., added something to the DOM or selection change.
  update(view) {
    return;
  }

  // check for selection changes to position toolbar and attach event listeners to the popups, which need to have the latest selection
  selectionUpdate(view) {
    // const handleSelectionEnd = () => {
      if (this.isSelectionInDoNode()) {
        return;
      }

      const selection = window.getSelection();
      const isSelection = selection && !selection.isCollapsed;
      // Hide the toolbar when there is no selection
      if (!isSelection) {
        // if (this.dom.classList.contains('editor-form-active')) {
        //   // this.dom.classList.remove("editor-form-active");
        //   // console.log("selection update, cleanup toolbar")
        //   // this.cleanupToolbar();
        // }
        return;
      }

      //If selection is empty string or a new line
      if (!selection.rangeCount || !selection.toString().length || selection.toString().charCodeAt(0) === 10) {
        return;
      }

      
      //TODO: Revisit
      // const allowMultiNodeSelection = false;
      // if (allowMultiNodeSelection) {
      //   return;
      // }

      if (!this.isSelectionsStartEndRangesWithinSameParent(selection)) {
        return;
      }

      this.selection = cloneSelection();

      //Get information on the selection to position the toolbar.
      const range = selection.getRangeAt(0);
      const selectedPosition = range.getBoundingClientRect();
      const toolbarHeight = this.dom.offsetHeight;
      const toolbarWidth = this.dom.offsetWidth;
      const margin = 10;

      const firstButton = this.dom.querySelector('button');
      const shouldFocus = !!(!this.dom.classList.contains("editor-form-active") && firstButton !== document.activeElement);

      // Display the toolbar
      // TODO: do not change visibility if the selection is within a .do element (except the annotation maybe?)
      this.dom.classList.add("editor-form-active");
      
      this.dom.style.left = `${selectedPosition.left + (selectedPosition.width / 2 ) - (toolbarWidth / 2)}px`;

      // Cleanup the arrow from previous toolbar poisitioning
      this.dom.classList.remove("toolbar-arrow-over", "toolbar-arrow-under");

      //Normally we want to position the toolbar above the selection, otherwise below the selection.
      //Put the toolbar above the selection if there is enough space in the viewport above the position of the selected text's rectangle.
  
      //1 & 2
      if (selectedPosition.top >= toolbarHeight + (margin * 2)) {
        this.dom.style.top = `${selectedPosition.top + window.scrollY - toolbarHeight - margin}px`;
        //This is just the arrow below the toolbar pointing at the selection.
        this.dom.classList.add("toolbar-arrow-under");
      }
      //Put the toolbar below the selection.
      // 3
      else {
        this.dom.style.top = `${selectedPosition.bottom + window.scrollY + margin}px`;
        this.dom.classList.add("toolbar-arrow-over");
      }

      this.dom.style.right = 'initial';
    // }


    if (shouldFocus) {    
      const handleTab = (event) => {
        
        if (event.key === "Tab") {
          const toolbarForms = document.querySelectorAll(`.editor-form`);
          const activeForm = Array.from(toolbarForms).filter(form => form.classList.contains('editor-form-active'))[0];
  
          if (activeForm) {
            return;
          }
          event.preventDefault(); 
          const focusedButton = this.dom.querySelector('.edito          ive');

          if
 (!focusedButton) {
            firstButton?.focus();
          }

          document.removeEventListener("keydown", handleTab);
        }
      };
      document.addEventListener("keydown", handleTab);
    }

    const handleEscKey = (event) => {
      if (event.key === "Escape") {
        const toolbarForms = document.querySelectorAll(`.editor-form`);
        const activeForm = Array.from(toolbarForms).filter(form => form.classList.contains('editor-form-active'))[0];

        if (activeForm) {
          return;
        }
        this.dom.classList.remove("editor-form-active");
        this.clearSelection();
        document.removeEventListener("keydown", handleEscKey);
      }
    };
  
    document.addEventListener("keydown", handleEscKey);
  }

  isSelectionsStartEndRangesWithinSameParent(selection) {
    selection = selection || window.getSelection();

    const startParentNode = selection.getRangeAt(0).startContainer.parentNode;
    const endParentNode = selection.getRangeAt(selection.rangeCount - 1).endContainer.parentNode;

    return startParentNode === endParentNode; // Returns true if both are the same
  }

  clearToolbarButton(button) {
    const btnNode = this.dom.querySelector(`#${'editor-button-' + button}`);

    if (this.toolbarPopups[button]) {
      //Clean up all or any that's active.
      btnNode.classList.remove('editor-button-active');
    }

    //Checks if the other buttons are connected to an applied node/mark, then make active.
    this.updateButtonState(schema, btnNode, button, this.editorView);

  }

  clearToolbarForm(toolbarForm) {
    toolbarForm.classList.remove('editor-form-active');
    toolbarForm.removeAttribute('style');
    toolbarForm.reset();
    // TOD
    // if (toolbarForm is editor mode) {
    // this.editorView.focus();
    // }
  }

  formClickHandler(e, button) {
    var buttonNode = e.target.closest('button');
    
    if (buttonNode) {
      var buttonClasses = buttonNode.classList;
      
      if (buttonNode.type !== 'submit') {
        e.preventDefault();
        e.stopPropagation();
      }

      if (buttonClasses.contains('editor-form-cancel')) {
        const toolbarForm = buttonNode.closest('form');
        this.clearToolbarForm(toolbarForm);
        this.clearToolbarButton(button);
      }
    }
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

  checkAnnotationServiceUpdateForm(action) {
    const documentOptions = {
      ...DO.C.DOMProcessing,
      //sanitize: in this context, seems low risk.
      normalize: true
    };

    getLinkRelation(ns.oa.annotationService.value, null, getDocument(null, documentOptions))
      .then(url => {
        Config.AnnotationService = url[0];
        updateAnnotationServiceForm(action);
      })
      .catch(reason => {
        //TODO signinRequired
        // this check should be on the submit handler
        if (this.signInRequired(action) && !Config.User.IRI) {
          showUserIdentityInput();
        }
        else {
          updateAnnotationServiceForm(action);
        }
      });
  }

  showTextQuoteSelectorFromLocation(containerNode) {
    var motivatedBy = 'oa:highlighting';
    var selector = getTextQuoteSelectorFromLocation(document.location);

    if (selector && selector.exact && selector.exact.length) {
      //XXX: TODO: Copied from showAnnotation
  
      var refId = document.location.hash.substring(1);

      //XXX: If already highlighted, don't run again.
      if (document.getElementById(refId)) { return; }

      var refLabel = getReferenceLabel(motivatedBy);
  
      containerNode = containerNode || getDocumentContentNode(document);
  
      var docRefType = '<sup class="ref-highlighting"><a rel="oa:hasTarget" href="#' + refId + '">' + refLabel + '</a></sup>';
  
      var options = {
        'do': true,
        'mode': '#selector'
      };
      // console.log(selector)
      // console.log(refId)
      this.importTextQuoteSelector(containerNode, selector, refId, motivatedBy, docRefType, options);
    }
  }

  // TODO: refactor this to use replaceSelectionWithFragment
  importTextQuoteSelector(containerNode, selector, refId, motivatedBy, docRefType, options) {
    // console.log(containerNode)
    // console.log(selector)
    // console.log(refId)
    // console.log(motivatedBy)
    // console.log(docRefType)
    // console.log(options)
    var containerNodeTextContent = containerNode.textContent;
      //XXX: Seems better?
      // var containerNodeTextContent = fragmentFromString(getDocument(containerNode, documentOptions)).textContent.trim();
    // console.log(containerNodeTextContent);
    options = options || {};

    // console.log(selector)
    var prefix = selector.prefix || '';
    var exact = selector.exact || '';
    var suffix = selector.suffix || '';

    var phrase = escapeRegExp(prefix.toString() + exact.toString() + suffix.toString());
    // console.log(phrase);

    var selectedParentNode;

    var textMatches = matchAllIndex(containerNodeTextContent, new RegExp(phrase, 'g'));
    // console.log(textMatches)

    textMatches.forEach(item => {
      // console.log('phrase:')
      // console.log(phrase)
      // console.log(item)
      var selectorIndex = item.index;
      // console.log('selectorIndex:')
      // console.log(selectorIndex)
      // var selectorIndex = containerNodeTextContent.indexOf(prefix + exact + suffix);
      // console.log(selectorIndex);

      // if (selectorIndex >= 0) {
      var exactStart = selectorIndex + prefix.length
      var exactEnd = selectorIndex + prefix.length + exact.length;
      var selection = { start: exactStart, end: exactEnd };
      // console.log('selection:')
      // console.log(selection)
      var ref = getTextQuoteHTML(refId, motivatedBy, exact, docRefType, options);
      // console.log('containerNode:')
      // console.log(containerNode)

      // MediumEditor.selection.importSelection(selection, containerNode, document);
      setSelection(exactStart, exactEnd, containerNode);


      //XXX: Review
      selection = window.getSelection();
      // console.log(selection)
      var r = selection.getRangeAt(0);
      selection.removeAllRanges();
      selection.addRange(r);
      r.collapse(true);
      // console.log(r)
      // console.log('r.commonAncestorContainer: r.commonAncestorContainer);

      selectedParentNode = r.commonAncestorContainer.parentNode;
      // console.log('selectedParentNode:')
      // console.log(selectedParentNode)
      var selectedParentNodeValue = r.commonAncestorContainer.nodeValue;
      // console.log(selectedParentNodeValue)
  
      var selectionUpdated = fragmentFromString(selectedParentNodeValue.substr(0, r.startOffset) + ref + selectedParentNodeValue.substr(r.startOffset + exact.length));
      // console.log(selectionUpdated)
  
      //XXX: Review. This feels a bit dirty
      for(var i = 0; i < selectedParentNode.childNodes.length; i++) {
        var n = selectedParentNode.childNodes[i];
        if (n.nodeType === 3 && n.nodeValue === selectedParentNodeValue) {
          selectedParentNode.replaceChild(selectionUpdated, n);
        }
      }

      // console.log('---')
    })

    return selectedParentNode;
  }

  destroy() {
    //this.dom is #document-toolbar
    //TODO: Also remove itself
    if (!this.documentBody.querySelector('#document-editor')) {
      return;
    }
    this.documentBody.removeChild(this.dom);
    document.removeEventListener("selectionchange", this.selectionHandler);
  }
}

// Consider putting this elsewhere or making it part of the class
export function annotateFormControls(options) {
  return `
    <fieldset>
      <legend data-i18n="editor.toolbar.${options.button}.form.legend">${options.legend}</legend>
      <dl class="info">
        <dt class="required">*</dt>
        <dd data-i18n="info.required">${i18n.t("info.required.textContent")}</dd>
      </dl>
      <label data-i18n="editor.toolbar.note.form.label" for="${options.button}-content">${i18n.t('editor.toolbar.note.form.label.textContent')}</label>
      <textarea class="editor-form-textarea" cols="20" data-i18n="editor.toolbar.${options.button}.form.textarea" dir="auto" id="${options.button}-content" name="${options.button}-content" placeholder="${options.placeholder}" required="" rows="5"></textarea>
      <label data-i18n="tags.label" for="${options.button}-tagging">${i18n.t('tags.label.textContent')}</label> <input class="editor-form-input" id="${options.button}-tagging" name="${options.button}-tagging" data-i18n="tags.input" placeholder="${i18n.t('tags.input.placeholder')}" type="text" />
      <label data-i18n="language.label" for="${options.button}-language">${i18n.t('language.label.textContent')}</label>
      <select class="editor-form-select" id="${options.button}-language" name="${options.button}-language">${getLanguageOptionsHTML()}</select>
      <label data-i18n="license.label" for="${options.button}-license">${i18n.t('license.label.textContent')}</label>
      <select class="editor-form-select" id="${options.button}-license" name="${options.button}-license">${getLicenseOptionsHTML()}</select>
      <span class="annotation-location-selection">${getAnnotationLocationHTML(options.button)}</span>
      <span class="annotation-inbox">${getAnnotationInboxLocationHTML(options.button)}</span>

      <button class="editor-form-submit" data-i18n="editor.toolbar.form.post.button" type="submit">${i18n.t('editor.toolbar.form.post.button.textContent')}</button>
      <button class="editor-form-cancel" data-i18n="editor.toolbar.form.cancel.button" type="button">${i18n.t('editor.toolbar.form.cancel.button.textContent')}</button>
    </fieldset>
  `
}

export function updateAnnotationServiceForm(action) {
  var annotationServices = document.querySelectorAll('.do.editor-toolbar .annotation-location-selection');
  for (var i = 0; i < annotationServices.length; i++) {
    annotationServices[i].replaceChildren(fragmentFromString(getAnnotationLocationHTML(action)));
  }
};

export function updateAnnotationInboxForm(action) {
  var annotationInbox = document.querySelectorAll('.do.editor-toolbar .annotation-inbox');
  for (var i = 0; i < annotationInbox.length; i++) {
    annotationInbox[i].replaceChildren(fragmentFromString(getAnnotationInboxLocationHTML(action)));
  }
};

export function getTextQuoteSelectorFromLocation(location) {
  var regexp = /#selector\(type=TextQuoteSelector,(.*)\)/;
  const matches = location.hash.match(regexp);

  if (matches) {
    var selectorsArray = matches[1].split(',');

    var selector = {
      type: 'TextQuoteSelector'
    };

    selectorsArray.forEach(s => {
      var kv = s.split('=');

      if (kv.length == 2) {
        switch(kv[0]) {
          case 'prefix':
            selector['prefix'] = decodeURIComponent(kv[1]);
            break;
          case 'exact':
            selector['exact'] = decodeURIComponent(kv[1]);
            break;
          case 'suffix':
            selector['suffix'] = decodeURIComponent(kv[1]);
            break;
        }
      }

    })

    return selector;
  }
}
