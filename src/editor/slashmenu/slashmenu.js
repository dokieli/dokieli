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

import { getLanguageOptionsHTML, getLicenseOptionsHTML, getPublicationStatusOptionsHTML, getResourceTypeOptionsHTML } from "../../doc.js";
import { getButtonHTML } from "../../ui/buttons.js";
import { formHandlerLanguage, formHandlerLicense, formHandlerInbox, formHandlerInReplyTo, formHandlerPublicationStatus, formHandlerResourceType, formHandlerTestSuite } from "./handlers.js";
import { TextSelection } from "prosemirror-state";
import { DOMParser } from "prosemirror-model";
import { i18n } from "../../i18n.js";
import { fragmentFromString } from "../../utils/html.js";

export class SlashMenu {
  constructor(editorView) {
    this.editorView = editorView;
    this.menuContainer = document.createElement("div");
    this.menuContainer.id = 'document-slashmenu';
    this.menuContainer.classList.add('do', 'editor-slashmenu', 'editor-form');
    this.menuContainer.style.display = "none";
    this.menuContainer.style.position = "absolute";

    this.slashMenuButtons = ['language', 'license', 'inbox', 'in-reply-to', 'publication-status', 'resource-type', 'test-suite'].map(button => ({
      button,
      dom: () => fragmentFromString(getButtonHTML({ button } )).firstChild,
    }));

    this.createMenuItems();

    this.formHandlerLanguage = formHandlerLanguage.bind(this);
    this.formHandlerLicense = formHandlerLicense.bind(this);
    this.formHandlerInbox = formHandlerInbox.bind(this);
    this.formHandlerInReplyTo = formHandlerInReplyTo.bind(this);
    this.formHandlerPublicationStatus = formHandlerPublicationStatus.bind(this);
    this.formHandlerResourceType = formHandlerResourceType.bind(this);
    this.formHandlerTestSuite = formHandlerTestSuite.bind(this);

    //TODO: Create formValidationHandlers to handle `input` and `invalid` event handlers. Move oninput/oninvalid out of form's inline HTML
    this.formEventListeners = {
      language: [ { event: 'submit', callback: this.formHandlerLanguage }, { event: 'click', callback: (e) => this.formClickHandler(e, 'language') } ],
      license: [ { event: 'submit', callback: this.formHandlerLicense }, { event: 'click', callback: (e) => this.formClickHandler(e, 'license') } ],
      inbox: [ { event: 'submit', callback: this.formHandlerInbox }, { event: 'click', callback: (e) => this.formClickHandler(e, 'inbox') } ],
      'in-reply-to': [ { event: 'submit', callback: this.formHandlerInReplyTo }, { event: 'click', callback: (e) => this.formClickHandler(e, 'in-reply-to') } ],
      'publication-status': [ { event: 'submit', callback: this.formHandlerPublicationStatus }, { event: 'click', callback: (e) => this.formClickHandler(e, 'publication-status') } ],
      'resource-type': [ { event: 'submit', callback: this.formHandlerResourceType }, { event: 'click', callback: (e) => this.formClickHandler(e, 'resource-type') } ],
      'test-suite': [ { event: 'submit', callback: this.formHandlerTestSuite }, { event: 'click', callback: (e) => this.formClickHandler(e, 'test-suite') } ],
    }

    document.body.appendChild(this.menuContainer);
    this.bindHideEvents();
  }

  showMenu(cursorX, cursorY) {
    this.menuContainer.style.display = "block";
    
    this.menuContainer.style.left = `${cursorX}px`;
    this.menuContainer.style.top = `${cursorY}px`;

    const firstButton = this.menuContainer.querySelector("button");

    const handleTab = (event) => {
      if (event.key === "Tab") {
        event.preventDefault();
        firstButton?.focus();
        document.removeEventListener("keydown", handleTab);
      }
    };

    const handleEscKey = (event) => {
      if (event.key === "Escape") {
        this.hideMenu();
        document.removeEventListener("keydown", handleEscKey);
      }
    };
  
    document.addEventListener("keydown", handleTab);
    document.addEventListener("keydown", handleEscKey);
  }

  hideMenu() {
    this.menuContainer.style.display = "none";
    this.menuContainer.replaceChildren(); 
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
        this.hideMenu();
      }
    }
  }

  createMenuItems() {
    const ul = document.createElement('ul');

    this.slashMenuButtons.forEach(({ button, dom }) => {
      const menuItem = this.createMenuItem(button, dom);
      ul.appendChild(menuItem);
      
      menuItem.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handlePopups(button);
      });
    });

    this.menuContainer.appendChild(ul);
  }

  createMenuItem(button, domFunction) {
    const buttonNode = domFunction();
    buttonNode.id = "editor-button-" + button;

    const labelNode = document.createElement("span");
    const menuItem = document.createElement("li");
    menuItem.appendChild(buttonNode);
    return menuItem;
  }

  handlePopups(button) {
    let popupContent = {
      language: this.createLanguageWidgetHTML(),
      license: this.createLicenseWidgetHTML(),
      inbox: this.createInboxWidgetHTML(),
      'in-reply-to': this.createInReplyToWidgetHTML(),
      'publication-status': this.createPublicationStatusWidgetHTML(),
      'resource-type': this.createResourceTypeWidgetHTML(),
      'test-suite': this.createTestSuiteWidgetHTML()
    }

    const popup = fragmentFromString(`<form class="editor-form editor-form-active">${popupContent[button]}</form>`);
    this.openPopup(popup, button);
  }

  createLanguageWidgetHTML() {
    var html = `
      <fieldset>
        <legend data-i18n="editor.toolbar.language.form.legend">${i18n.t('editor.toolbar.language.form.legend.textContent')}</legend>
        <label data-i18n="language.label" for="set-language">${i18n.t('language.label.textContent')}</label> <select class="editor-form-select" id="set-language" name="language" required="">${getLanguageOptionsHTML()}</select>
        <div>
          <button class="editor-form-submit" data-i18n="editor.toolbar.form.save.button" type="submit">${i18n.t('editor.toolbar.form.save.button.textContent')}</button>
          <button class="editor-form-cancel" data-i18n="editor.toolbar.form.cancel.button" type="button">${i18n.t('editor.toolbar.form.cancel.button.textContent')}</button>
        </div>
      </fieldset>
    `;

    return html;
  }

  createLicenseWidgetHTML() {
    var html = `
      <fieldset>
        <legend data-i18n="editor.toolbar.license.form.legend">${i18n.t('editor.toolbar.license.form.legend.textContent')}</legend>
        <label data-i18n="license.label" for="set-license">${i18n.t('license.label.textContent')}</label> <select class="editor-form-select" id="set-license" name="license" required="">${getLicenseOptionsHTML({ 'selected': '' })}</select>
        <div>
          <button class="editor-form-submit" data-i18n="editor.toolbar.form.save.button" type="submit">${i18n.t('editor.toolbar.form.save.button.textContent')}</button>
          <button class="editor-form-cancel" data-i18n="editor.toolbar.form.cancel.button" type="button">${i18n.t('editor.toolbar.form.cancel.button.textContent')}</button>
        </div>
      </fieldset>
    `;

    return html;
  }

  createInboxWidgetHTML() {
    var html = `
      <fieldset>
        <legend data-i18n="editor.toolbar.inbox.form.legend">${i18n.t('editor.toolbar.inbox.form.legend.textContent')}</legend>
        <label data-i18n="editor.toolbar.inbox.form.set-inbox.label" for="set-inbox">${i18n.t('editor.toolbar.inbox.form.set-inbox.label.textContent')}</label> <input class="editor-form-input" data-i18n="editor.toolbar.form.url.input" dir="ltr" id="set-inbox" name="inbox" placeholder="https://example.net/inbox/" pattern="https?://.+" placeholder="${i18n.t('editor.toolbar.form.url.input.placeholder')}" required="" type="url" value="" />
        <div>
          <button class="editor-form-submit" data-i18n="editor.toolbar.form.save.button" type="submit">${i18n.t('editor.toolbar.form.save.button.textContent')}</button>
          <button class="editor-form-cancel" data-i18n="editor.toolbar.form.cancel.button" type="button">${i18n.t('editor.toolbar.form.cancel.button.textContent')}</button>
        </div>
      </fieldset>
    `;

    return html;
  }

  createInReplyToWidgetHTML() {
    var html = `
      <fieldset>
        <legend data-i18n="editor.toolbar.in-reply-to.form.legend">${i18n.t('editor.toolbar.in-reply-to.form.legend.textContent')}</legend>
         <label data-i18n="editor.toolbar.in-reply-to.label" for="set-in-reply-to">${i18n.t('editor.toolbar.in-reply-to.form.set-in-reply-to.label.textContent')}</label> <input class="editor-form-input" data-i18n="editor.toolbar.form.url.input" dir="ltr" id="set-in-reply-to" name="in-reply-to" pattern="https?://.+" placeholder="${i18n.t('editor.toolbar.form.url.input.placeholder')}" required="" type="url" value="" />
        <div>
          <button class="editor-form-submit" data-i18n="editor.toolbar.form.save.button" type="submit">${i18n.t('editor.toolbar.form.save.button.textContent')}</button>
          <button class="editor-form-cancel" data-i18n="editor.toolbar.form.cancel.button" type="button">${i18n.t('editor.toolbar.form.cancel.button.textContent')}</button>
        </div>
      </fieldset>
    `;

    return html;
  }

  createPublicationStatusWidgetHTML() {
    var html = `
      <fieldset>
        <legend data-i18n="editor.toolbar.publication-status.form.legend">${i18n.t('editor.toolbar.publication-status.form.legend.textContent')}</legend>
        <label data-i18n="editor.toolbar.publication-status.form.set-publication-status.label" for="set-publication-status">${i18n.t('editor.toolbar.publication-status.form.set-publication-status.label.textContent')}</label> <select class="editor-form-select" id="set-publication-status" name="publication-status" required="">${getPublicationStatusOptionsHTML({ 'selected': '' })}</select>
        <div>
          <button class="editor-form-submit" data-i18n="editor.toolbar.form.save.button" type="submit">${i18n.t('editor.toolbar.form.save.button.textContent')}</button>
          <button class="editor-form-cancel" data-i18n="editor.toolbar.form.cancel.button" type="button">${i18n.t('editor.toolbar.form.cancel.button.textContent')}</button>
        </div>
      </fieldset>
    `;

    return html;
  }

  createResourceTypeWidgetHTML() {
    var html = `
      <fieldset>
        <legend data-i18n="editor.toolbar.resource-type.form.legend">${i18n.t('editor.toolbar.resource-type.form.legend.textContent')}</legend>
        <label data-i18n="editor.toolbar.resource-type.form.set-resource-type.label" for="set-resource-type">${i18n.t('editor.toolbar.resource-type.form.set-resource-type.label.textContent')}</label> <select class="editor-form-select" id="set-resource-type" name="resource-type" required="">${getResourceTypeOptionsHTML({ 'selected': '' })}</select>
        <div>
          <button class="editor-form-submit" data-i18n="editor.toolbar.form.save.button" type="submit">${i18n.t('editor.toolbar.form.save.button.textContent')}</button>
          <button class="editor-form-cancel" data-i18n="editor.toolbar.form.cancel.button" type="button">${i18n.t('editor.toolbar.form.cancel.button.textContent')}</button>
        </div>
      </fieldset>
    `;

    return html;
  }

  createTestSuiteWidgetHTML() {
    var html = `
      <fieldset>
        <legend data-i18n="editor.toolbar.test-suite.form.legend">${i18n.t('editor.toolbar.test-suite.form.legend.textContent')}</legend>
        <label data-i18n="editor.toolbar.test-suite.form.set-test-suite.label" for="set-test-suite">${i18n.t('editor.toolbar.test-suite.form.set-test-suite.label.textContent')}</label> <input class="editor-form-input" data-i18n="editor.toolbar.form.url.input" dir="ltr" id="set-test-suite" name="test-suite" placeholder="https://example.net/test-suite" pattern="https?://.+" placeholder="${i18n.t('editor.toolbar.form.url.input.placeholder')}" required="" type="url" value="" />
        <div>
          <button class="editor-form-submit" data-i18n="editor.toolbar.form.save.button" type="submit">${i18n.t('editor.toolbar.form.save.button.textContent')}</button>
          <button class="editor-form-cancel" data-i18n="editor.toolbar.form.cancel.button" type="button">${i18n.t('editor.toolbar.form.cancel.button.textContent')}</button>
        </div>
      </fieldset>
    `;

    return html;
  }

  openPopup(popup, button) {
    this.menuContainer.replaceChildren();
    this.menuContainer.appendChild(popup);

    const popupForm = this.menuContainer.querySelector('form');

    if (this.formEventListeners[button]) {
      this.formEventListeners[button].forEach(({ event, callback }) => {
        popupForm.addEventListener(event, callback);
      });
    }

    this.menuContainer.style.display = "block";
    this.menuContainer.style.padding = 0;
  }

  // this function is duplicated from the Author toolbar. The reason is that 1. the editor instance is not accessible from everywhere (although that could be solved) and 2. the toolbar might not be initialized when we trigger this menu yet. it might be better to keep this somewhere common to every menu/toolbar using the author mode functions (prosemirror transactions) and re-use. and 3. for the specific case of the slash menu i need to update the selection so that it includes (and replaces) the slash
  replaceSelectionWithFragment(fragment) {
    const { state, dispatch } = this.editorView;
    const { selection, schema } = state;
  
    // if (!selection.empty) return; // not sure we need this
  
    const newSelection = TextSelection.create(state.doc, Math.max(selection.from - 1, 0), selection.from);
  
    let node = DOMParser.fromSchema(schema).parse(fragment);
  
    let tr = state.tr.setSelection(newSelection).replaceSelectionWith(node);
    
    dispatch(tr);
  }
  bindHideEvents() {
    this.editorView.setProps({
      handleTextInput: (view, from, to, text) => {
        if (text !== "/") this.hideMenu();
        return false;
      },
      handleKeyDown: (view, event) => {
        if (event.key === "Escape") this.hideMenu();
        return false;
      },
    });

    document.addEventListener("click", (e) => {
      if (!this.menuContainer.contains(e.target)) {
        this.hideMenu();
      }
    });
  }
}
