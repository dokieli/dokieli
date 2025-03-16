import { getLanguageOptionsHTML, getLicenseOptionsHTML, getResourceTypeOptionsHTML, insertDocumentLevelHTML } from "../../doc.js";
import { Icon } from "../../ui/icons.js";
import { fragmentFromString } from "../../util.js";
import { getButtonHTML } from "../toolbar/toolbar.js";
import { formHandlerInbox, formHandlerInReplyTo, formHandlerDocumentType, formHandlerLanguage, formHandlerLicense } from "./handlers.js";

export class SlashMenu {
  constructor(editorView) {
    this.editorView = editorView;
    this.menuContainer = document.createElement("div");
    this.menuContainer.id = 'document-slashmenu';
    this.menuContainer.classList.add("slashmenu-toolbar");
    this.menuContainer.style.display = "none";
    this.menuContainer.style.position = "absolute";

    this.slashMenuButtons = ['document-type', 'language', 'license', 'inbox', 'in-reply-to'].map(button => ({
      button,
      dom: () => fragmentFromString(getButtonHTML(button)).firstChild
    }));

    this.createMenuItems();

    this.formHandlerDocumentType = formHandlerDocumentType.bind(this);
    this.formHandlerLanguage = formHandlerLanguage.bind(this);
    this.formHandlerLicense = formHandlerLicense.bind(this);
    this.formHandlerInbox = formHandlerInbox.bind(this);
    this.formHandlerInReplyTo = formHandlerInReplyTo.bind(this);

    this.formEventListeners = {
      'document-type': [ { event: 'submit', callback: this.formHandlerDocumentType }, { event: 'click', callback: (e) => this.formClickHandler(e, 'document-type') } ],
      language: [ { event: 'submit', callback: this.formHandlerLanguage }, { event: 'click', callback: (e) => this.formClickHandler(e, 'language') } ],
      license: [ { event: 'submit', callback: this.formHandlerLicense }, { event: 'click', callback: (e) => this.formClickHandler(e, 'license') } ],
      inbox: [ { event: 'submit', callback: this.formHandlerInbox }, { event: 'click', callback: (e) => this.formClickHandler(e, 'inbox') } ],
      'in-reply-to': [ { event: 'submit', callback: this.formHandlerInReplyTo }, { event: 'click', callback: (e) => this.formClickHandler(e, 'in-reply-to') } ],
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
    this.menuContainer.innerHTML = ""; 
  }

  formClickHandler(e, button) {
    var buttonNode = e.target.closest('button');
    
    if (buttonNode) {
      var buttonClasses = buttonNode.classList;
      
      if (buttonNode.type !== 'submit') {
        e.preventDefault();
        e.stopPropagation();
      }

      if (buttonClasses.contains('editor-slashmenu-cancel')) {
       // TODO: hide opup
       console.log("CANCEL")
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
    const menuItem = document.createElement("li");
    menuItem.appendChild(buttonNode);
    return menuItem;
  }

  handlePopups(button) {
    let popupContent = {
      'document-type': this.createDocumentTypeWidget(),
      language: this.createLanguageWidget(),
      license: this.createLicenseWidget(),
      inbox: this.createInboxWidget(),
      'in-reply-to': this.createInReplyToWidget()
    }

    const popup = popupContent[button];
    this.openPopup(popup, button);
  }

  createLanguageWidget() {
    var node = fragmentFromString(`
      <form>
        <fieldset>
          <legend>Add a language</legend>
          <label for="language">Language</label> <select name="language">${getLanguageOptionsHTML({ 'selected': '' })}</select>
          ${getButtonHTML('submit', 'editor-slashmenu-submit', 'Save', 'Save', { type: 'submit' })}
          ${getButtonHTML('cancel', 'editor-slashmenu-cancel', 'Cancel', 'Cancel', { type: 'button' })}
        </fieldset>
      </form>
    `);

    return node;
  }

  createLicenseWidget() {
    var node = fragmentFromString(`
      <form>
        <fieldset>
          <legend>Add a license</legend>
          <label for="license">License</label> <select name="license">${getLicenseOptionsHTML({ 'selected': '' })}</select>
          ${getButtonHTML('submit', 'editor-slashmenu-submit', 'Save', 'Save', { type: 'submit' })}
          ${getButtonHTML('cancel', 'editor-slashmenu-cancel', 'Cancel', 'Cancel', { type: 'button' })}
        </fieldset>
      </form>
    `);

    return node;
  }

  createDocumentTypeWidget() {
    var node = fragmentFromString(`
      <form>
        <fieldset>
          <legend>Add a type</legend>
          <label for="document-type">Document type</label> <select name="document-type">${getResourceTypeOptionsHTML({ 'selected': '' })}</select>
          ${getButtonHTML('submit', 'editor-slashmenu-submit', 'Save', 'Save', { type: 'submit' })}
          ${getButtonHTML('cancel', 'editor-slashmenu-cancel', 'Cancel', 'Cancel', { type: 'button' })}
        </fieldset>
      </form>
    `);
    return node;
  }

  createInboxWidget() {
    const inputContainer = document.createElement("div");
    const input = document.createElement("input");
    input.placeholder = "Enter inbox URL...";
    inputContainer.appendChild(input);
    return inputContainer;
  }

  createInReplyToWidget() {
    const inputContainer = document.createElement("div");
    const input = document.createElement("input");
    input.placeholder = "Enter URL to reply to...";
    inputContainer.appendChild(input);
    return inputContainer;
  }

  openPopup(popup, button) {
    this.menuContainer.replaceChildren();
    this.menuContainer.appendChild(popup);

    const popupForm = this.menuContainer.querySelector('form');

    if (this.formEventListeners[button]) {
      this.formEventListeners[button].forEach(({ event, callback }) => {
        console.log(event, callback)
        popupForm.addEventListener(event, callback);
      });
    }

    this.menuContainer.style.display = "block";
  }

  // this function is duplicated from the Author toolbar. The reason is that 1. the editor instance is not accessible from everywhere (although that could be solved) and 2. the toolbar might not be initialized when we trigger this menu yet. it might be better to keep this somewhere common to every menu/toolbar using the author mode functions (prosemirror transactions) and re-use. 
  replaceSelectionWithFragment(fragment) {
    const { state, dispatch } = this.editorView;
    const { selection, schema } = state;
    
    // Convert DOM fragment to a ProseMirror node
    let node = DOMParser.fromSchema(schema).parse(fragment);
  
    // Apply the transformation to insert the node at selection
    let tr = state.tr.replaceSelectionWith(node);
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
