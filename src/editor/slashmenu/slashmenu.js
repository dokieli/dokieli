import { getLanguageOptionsHTML, getLicenseOptionsHTML, getPublicationStatusOptionsHTML, getResourceTypeOptionsHTML } from "../../doc.js";
import { Icon } from "../../ui/icons.js";
import { fragmentFromString } from "../../util.js";
import { getButtonHTML } from "../../ui/button-icons.js";
import { formHandlerLanguage, formHandlerLicense, formHandlerInbox, formHandlerInReplyTo, formHandlerPublicationStatus, formHandlerResourceType, formHandlerTestSuite } from "./handlers.js";
import { TextSelection } from "prosemirror-state";
import { DOMParser } from "prosemirror-model";

export class SlashMenu {
  constructor(editorView) {
    this.editorView = editorView;
    this.menuContainer = document.createElement("div");
    this.menuContainer.id = 'document-slashmenu';
    this.menuContainer.classList.add('do', 'editor-slashmenu', 'editor-form');
    this.menuContainer.style.display = "none";
    this.menuContainer.style.position = "absolute";

    const slashMenuButtonLabels = {
      'language': 'Language',
      'license': 'License',
      'inbox': 'Inbox',
      'in-reply-to': 'In reply to',
      'publication-status': 'Status',
      'resource-type': 'Type',
      'test-suite': 'Test suite'
    }

    this.slashMenuButtons = ['language', 'license', 'inbox', 'in-reply-to', 'publication-status', 'resource-type', 'test-suite'].map(button => ({
      button,
      dom: () => fragmentFromString(getButtonHTML({ button, buttonTextContent: slashMenuButtonLabels[button]} )).firstChild,
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
        <legend>Add a language</legend>
        <label for="language">Language</label> <select class="editor-form-select" name="language" required="">${getLanguageOptionsHTML({ 'selected': '' })}</select>
        <div>
          <button class="editor-form-submit" title="Save" type="submit">Save</button>
          <button class="editor-form-cancel" title="Cancel" type="button">Cancel</button>
        </div>
      </fieldset>
    `;

    return html;
  }

  createLicenseWidgetHTML() {
    var html = `
      <fieldset>
        <legend>Add a license</legend>
        <label for="license">License</label> <select class="editor-form-select" name="license" required="">${getLicenseOptionsHTML({ 'selected': '' })}</select>
        <div>
          <button class="editor-form-submit" title="Save" type="submit">Save</button>
          <button class="editor-form-cancel" title="Cancel" type="button">Cancel</button>
        </div>
      </fieldset>
    `;

    return html;
  }

  createInboxWidgetHTML() {
    var html = `
      <fieldset>
        <legend>Add an inbox</legend>
        <label for="inbox">Inbox</label> <input class="editor-form-input" contenteditable="false" name="inbox" placeholder="https://example.net/inbox/" pattern="https?://.+" placeholder="Paste or type a link (URL)" oninput="setCustomValidity('')" oninvalid="setCustomValidity('Please enter a valid URL')" required="" type="url" value="" />
        <div>
          <button class="editor-form-submit" title="Save" type="submit">Save</button>
          <button class="editor-form-cancel" title="Cancel" type="button">Cancel</button>
        </div>
      </fieldset>
    `;

    return html;
  }

  createInReplyToWidgetHTML() {
    var html = `
      <fieldset>
        <legend>Add an in reply to URL</legend>
        <label for="in-reply-to">In reply to</label> <input class="editor-form-input" contenteditable="false" name="in-reply-to" pattern="https?://.+" placeholder="Paste or type a link (URL)" oninput="setCustomValidity('')" oninvalid="setCustomValidity('Please enter a valid URL')" required="" type="url" value="" />
        <div>
          <button class="editor-form-submit" title="Save" type="submit">Save</button>
          <button class="editor-form-cancel" title="Cancel" type="button">Cancel</button>
        </div>
      </fieldset>
    `;

    return html;
  }

  createPublicationStatusWidgetHTML() {
    var html = `
      <fieldset>
        <legend>Add a publication status</legend>
        <label for="publication-status">Publication status</label> <select class="editor-form-select" name="publication-status" required="">${getPublicationStatusOptionsHTML({ 'selected': '' })}</select>
        <div>
          <button class="editor-form-submit" title="Save" type="submit">Save</button>
          <button class="editor-form-cancel" title="Cancel" type="button">Cancel</button>
        </div>
      </fieldset>
    `;

    return html;
  }

  createResourceTypeWidgetHTML() {
    var html = `
      <fieldset>
        <legend>Add a type</legend>
        <label for="resource-type">Resource type</label> <select class="editor-form-select" name="resource-type" required="">${getResourceTypeOptionsHTML({ 'selected': '' })}</select>
        <div>
          <button class="editor-form-submit" title="Save" type="submit">Save</button>
          <button class="editor-form-cancel" title="Cancel" type="button">Cancel</button>
        </div>
      </fieldset>
    `;

    return html;
  }

  createTestSuiteWidgetHTML() {
    var html = `
      <fieldset>
        <legend>Add a test suite</legend>
        <label for="test-suite">Test suite</label> <input class="editor-form-input" contenteditable="false" name="test-suite" placeholder="https://example.net/test-suite" pattern="https?://.+" placeholder="Paste or type a link (URL)" oninput="setCustomValidity('')" oninvalid="setCustomValidity('Please enter a valid URL')" required="" type="url" value="" />
        <div>
          <button class="editor-form-submit" title="Save" type="submit">Save</button>
          <button class="editor-form-cancel" title="Cancel" type="button">Cancel</button>
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
