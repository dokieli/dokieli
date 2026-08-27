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
import { Icon } from "../../ui/icons.js";
import { formHandlerLanguage, formHandlerLicense, formHandlerInbox, formHandlerInReplyTo, formHandlerPublicationStatus, formHandlerResourceType, formHandlerTestSuite, formHandlerImg, formHandlerTable } from "./handlers.js";
import { listLookupServices } from "../../services.js";
import { TextSelection } from "prosemirror-state";
import { DOMParser } from "prosemirror-model";
import { i18n } from "../../i18n.js";
import { fragmentFromString } from "../../utils/html.js";
import { defaultImageTargetPath } from "../utils/imageAssets.js";
import { selectArticleNode } from "../../utils/html.js";
import { toggleTOCForRoot } from "../../ui/templates/sections.js";
import { documentAnchorsPluginKey } from "../plugins/documentAnchors.js";

export class SlashMenu {
  constructor(editorView) {
    this.editorView = editorView;
    this.menuContainer = document.createElement("div");
    this.menuContainer.id = 'document-slashmenu';
    this.menuContainer.classList.add('do', 'editor-slashmenu', 'editor-form');
    this.menuContainer.style.display = "none";
    this.menuContainer.style.position = "absolute";

    this.slashMenuButtons = ['img', 'table', 'toc', 'language', 'license', 'inbox', 'in-reply-to', 'publication-status', 'resource-type', 'test-suite'].map(button => ({
      button,
      dom: () => fragmentFromString(getButtonHTML({ button } )).firstChild,
    }));

    this.createMenuItems();

    this.formHandlerImg = formHandlerImg.bind(this);
    this.formHandlerTable = formHandlerTable.bind(this);
    this.formHandlerLanguage = formHandlerLanguage.bind(this);
    this.formHandlerLicense = formHandlerLicense.bind(this);
    this.formHandlerInbox = formHandlerInbox.bind(this);
    this.formHandlerInReplyTo = formHandlerInReplyTo.bind(this);
    this.formHandlerPublicationStatus = formHandlerPublicationStatus.bind(this);
    this.formHandlerResourceType = formHandlerResourceType.bind(this);
    this.formHandlerTestSuite = formHandlerTestSuite.bind(this);

    //TODO: Create formValidationHandlers to handle `input` and `invalid` event handlers. Move oninput/oninvalid out of form's inline HTML
    this.formEventListeners = {
      img: [ { event: 'submit', callback: this.formHandlerImg }, { event: 'click', callback: (e) => this.formClickHandler(e, 'img') } ],
      table: [ { event: 'submit', callback: this.formHandlerTable }, { event: 'click', callback: (e) => this.formClickHandler(e, 'table') } ],
      language: [ { event: 'submit', callback: this.formHandlerLanguage }, { event: 'click', callback: (e) => this.formClickHandler(e, 'language') } ],
      license: [ { event: 'submit', callback: this.formHandlerLicense }, { event: 'click', callback: (e) => this.formClickHandler(e, 'license') } ],
      inbox: [ { event: 'submit', callback: this.formHandlerInbox }, { event: 'click', callback: (e) => this.formClickHandler(e, 'inbox') } ],
      'in-reply-to': [ { event: 'submit', callback: this.formHandlerInReplyTo }, { event: 'click', callback: (e) => this.formClickHandler(e, 'in-reply-to') } ],
      'publication-status': [ { event: 'submit', callback: this.formHandlerPublicationStatus }, { event: 'click', callback: (e) => this.formClickHandler(e, 'publication-status') } ],
      'resource-type': [ { event: 'submit', callback: this.formHandlerResourceType }, { event: 'click', callback: (e) => this.formClickHandler(e, 'resource-type') } ],
      'test-suite': [ { event: 'submit', callback: this.formHandlerTestSuite }, { event: 'click', callback: (e) => this.formClickHandler(e, 'test-suite') } ],
    }

    document.getElementById('document-slashmenu')?.remove();
    document.body.appendChild(this.menuContainer);
    this.bindHideEvents();
  }

  showMenu(cursorX, cursorY) {
    this.openedWithSlash = true;
    this.createMenuItems();
    this.menuContainer.style.display = "block";

    this.menuContainer.style.left = `${cursorX}px`;
    this.menuContainer.style.top = `${cursorY}px`;

    this.filterMenuItems('');
    this.menuSearch?.focus();

    this.menuKeyHandler = (event) => {
      if (this.menuContainer.style.display === "none") return;

      // The list is a filtered view once the search box is open, so read it fresh.
      const buttons = this.visibleMenuButtons();
      const inSearch = document.activeElement === this.menuSearch;
      const idx = buttons.indexOf(document.activeElement);

      switch (event.key) {
        case "ArrowDown": {
          event.preventDefault();
          const next = inSearch ? buttons[0] : buttons[(idx + 1 + buttons.length) % buttons.length];
          next?.focus();
          break;
        }
        case "ArrowUp": {
          event.preventDefault();
          if (inSearch) break;
          if (idx <= 0) this.menuSearch?.focus();
          else buttons[idx - 1]?.focus();
          break;
        }
        case "Enter": {
          // Typing a name and pressing Enter takes the only thing left.
          if (!inSearch) break;
          event.preventDefault();
          buttons[0]?.click();
          break;
        }
        case "Home": {
          if (inSearch) break;
          event.preventDefault();
          buttons[0]?.focus();
          break;
        }
        case "End": {
          if (inSearch) break;
          event.preventDefault();
          buttons[buttons.length - 1]?.focus();
          break;
        }
        case "Escape": {
          event.preventDefault();
          event.stopPropagation();
          this.hideMenu();
          this.editorView.focus();
          break;
        }
      }
    };

    document.addEventListener("keydown", this.menuKeyHandler, true);
  }

  /** Open one feature's form directly at the caret, e.g. from the toolbar; no "/" involved. */
  showForm(button) {
    this.openedWithSlash = false;

    const coords = this.editorView.coordsAtPos(this.editorView.state.selection.from);
    this.menuContainer.style.display = "block";
    this.menuContainer.style.left = `${coords.left + window.scrollX}px`;
    this.menuContainer.style.top = `${coords.bottom + window.scrollY}px`;

    this.handlePopups(button);
  }

  hideMenu() {
    this.menuContainer.style.display = "none";
    this.menuContainer.replaceChildren();
    this.menuSearch = null;
    this.menuList = null;
    if (this.menuKeyHandler) {
      document.removeEventListener("keydown", this.menuKeyHandler, true);
      this.menuKeyHandler = null;
    }
    if (this.popupKeyHandler) {
      document.removeEventListener("keydown", this.popupKeyHandler, true);
      this.popupKeyHandler = null;
    }
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
    // Rebuilt on every open, so clear whatever the last one left behind.
    this.menuContainer.replaceChildren();

    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'editor-form-input editor-slashmenu-search';
    search.id = 'editor-slashmenu-search';
    search.autocomplete = 'off';
    search.setAttribute('aria-label', i18n.t('editor.slashmenu.search.input.aria-label'));
    search.placeholder = i18n.t('editor.slashmenu.search.input.placeholder');

    const ul = document.createElement('ul');

    this.slashMenuButtons.forEach(({ button, dom }) => {
      const menuItem = this.createMenuItem(button, dom);
      // Both the label and the feature name, so "table" finds it either way.
      menuItem.dataset.search = `${button} ${menuItem.textContent}`.toLowerCase();
      ul.appendChild(menuItem);

      menuItem.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handlePopups(button);
      });
    });

    search.addEventListener('input', () => this.filterMenuItems(search.value));

    this.menuContainer.appendChild(search);
    this.menuContainer.appendChild(ul);

    this.menuSearch = search;
    this.menuList = ul;
  }

  filterMenuItems(query) {
    const q = query.trim().toLowerCase();

    this.menuList?.querySelectorAll('li').forEach((li) => {
      li.hidden = !!q && !li.dataset.search?.includes(q);
    });
  }

  /** Buttons the filter is currently showing, in order. */
  visibleMenuButtons() {
    return Array.from(this.menuList?.querySelectorAll('li:not([hidden]) button') ?? []);
  }

  createMenuItem(button, domFunction) {
    const buttonNode = domFunction();
    buttonNode.id = "editor-button-" + button;

    const menuItem = document.createElement("li");
    menuItem.appendChild(buttonNode);
    return menuItem;
  }

  handlePopups(button) {
    if (button === 'toc') return this.toggleTOC();

    let popupContent = {
      img: this.createImgWidgetHTML(),
      table: this.createTableWidgetHTML(),
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

  // The menu item is the toggle; with no sections yet the heading still shows.
  toggleTOC() {
    toggleTOCForRoot(selectArticleNode(document));

    const { state, dispatch } = this.editorView;
    const { selection } = state;
    let tr = state.tr;

    // Nothing is inserted to consume the "/", so drop it.
    const from = Math.max(selection.from - 1, 0);
    if (this.openedWithSlash && state.doc.textBetween(from, selection.from) === '/') {
      tr = tr.delete(from, selection.from);
    }

    dispatch(tr.setMeta(documentAnchorsPluginKey, true));

    this.hideMenu();
    this.editorView.focus();
  }

  createTableWidgetHTML() {
    const iconCheck = Icon['.fas.fa-check'];

    const card = (value, icon, checked, fields) => `
      <li>
        <input type="radio" id="table-start-${value}" name="table-start" value="${value}"${checked ? ' checked=""' : ''} />
        <label for="table-start-${value}">
          ${icon}
          <span class="editor-form-card-text">
            <strong data-i18n="editor.table.form.start.${value}.label.strong">${i18n.t(`editor.table.form.start.${value}.label.strong.textContent`)}</strong>
            <span data-i18n="editor.table.form.start.${value}.desc.span">${i18n.t(`editor.table.form.start.${value}.desc.span.textContent`)}</span>
          </span>
          ${iconCheck}
        </label>
        <div class="editor-form-card-fields" data-when-start="${value}">${fields}</div>
      </li>
    `;

    return `
      <fieldset>
        <legend data-i18n="editor.table.form.legend">${i18n.t('editor.table.form.legend.textContent')}</legend>

        <ul class="editor-form-cards">
          ${card('blank', Icon['.fas.fa-table'], true, `
            <label data-i18n="editor.table.form.rows.label" for="table-rows" class="editor-form-field-label">${i18n.t('editor.table.form.rows.label.textContent')}</label>
            <input class="editor-form-input" id="table-rows" max="100" min="1" name="table-rows" type="number" value="3" />
            <label data-i18n="editor.table.form.columns.label" for="table-columns" class="editor-form-field-label">${i18n.t('editor.table.form.columns.label.textContent')}</label>
            <input class="editor-form-input" id="table-columns" max="30" min="1" name="table-columns" type="number" value="3" />
          `)}

          ${card('template', Icon['.fas.fa-list-check'], false, `
            <label data-i18n="editor.table.form.service.label" for="table-service" class="editor-form-field-label">${i18n.t('editor.table.form.service.label.textContent')}</label>
            <select class="editor-form-select" id="table-service" name="table-service">
              ${listLookupServices().filter(([, s]) => s.columns.length).map(([name, s]) => `<option value="${name}"${name === 'openlibrary' ? ' selected=""' : ''}>${s.label}</option>`).join('')}
            </select>
            <label data-i18n="editor.table.form.rows.label" for="table-rows-template" class="editor-form-field-label">${i18n.t('editor.table.form.rows.label.textContent')}</label>
            <input class="editor-form-input" id="table-rows-template" max="100" min="1" name="table-rows-template" type="number" value="3" />
          `)}

          ${card('import', Icon['.fas.fa-file'], false, `
            <label data-i18n="editor.table.form.csv-file.label" for="table-csv-file" class="editor-form-field-label">${i18n.t('editor.table.form.csv-file.label.textContent')}</label>
            <input accept=".csv,text/csv" class="editor-form-input" id="table-csv-file" name="table-csv-file" type="file" />
            <label data-i18n="editor.table.form.metadata-file.label" for="table-metadata-file" class="editor-form-field-label">${i18n.t('editor.table.form.metadata-file.label.textContent')}</label>
            <input accept=".json,application/json,application/ld+json" class="editor-form-input" id="table-metadata-file" name="table-metadata-file" type="file" />
          `)}
        </ul>

        <div class="editor-form-actions-row">
          <button class="editor-form-submit" data-i18n="editor.toolbar.form.save.button" type="submit">${i18n.t('editor.toolbar.form.save.button.textContent')}</button>
          <button class="editor-form-cancel" data-i18n="editor.toolbar.form.cancel.button" type="button">${i18n.t('editor.toolbar.form.cancel.button.textContent')}</button>
        </div>
      </fieldset>
    `;
  }

  createImgWidgetHTML() {
    var html = `
      <fieldset>
        <legend data-i18n="editor.toolbar.img.form.legend">${i18n.t('editor.toolbar.img.form.legend.textContent')}</legend>
        <figure class="img-preview"></figure>
        <label data-i18n="editor.toolbar.img.form.img-file.label" for="img-file">${i18n.t('editor.toolbar.img.form.img-file.label.textContent')}</label> <input class="editor-form-input" id="img-file" name="img-file" type="file" />
        <label for="img-src">URL</label> <input class="editor-form-input" dir="ltr" id="img-src" name="img-src" placeholder="${i18n.t('editor.toolbar.form.url.input.placeholder')}" type="text" value="" />
        <label data-i18n="editor.toolbar.img.form.img-alt.label" for="img-alt">${i18n.t('editor.toolbar.img.form.img-alt.label.textContent')}</label> <input class="editor-form-input" data-i18n="editor.toolbar.img.form.img-alt.input" dir="auto" id="img-alt" name="img-alt" placeholder="${i18n.t('editor.toolbar.img.form.img-alt.input.placeholder')}" type="text" value="" />
        <label data-i18n="editor.toolbar.img.form.img-figcaption" for="img-figcaption">${i18n.t('editor.toolbar.img.form.img-figcaption.label.textContent')}</label> <input class="editor-form-input" data-i18n="editor.toolbar.img.form.img-figcaption.input" id="img-figcaption" name="img-figcaption" placeholder="${i18n.t('editor.toolbar.img.form.img-alt.label.textContent')}" type="text" value="" />
        <div>
          <button class="editor-form-submit" data-i18n="editor.toolbar.form.save.button" type="submit">${i18n.t('editor.toolbar.form.save.button.textContent')}</button>
          <button class="editor-form-cancel" data-i18n="editor.toolbar.form.cancel.button" type="button">${i18n.t('editor.toolbar.form.cancel.button.textContent')}</button>
        </div>
      </fieldset>
    `;

    return html;
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
    if (this.menuKeyHandler) {
      document.removeEventListener("keydown", this.menuKeyHandler, true);
      this.menuKeyHandler = null;
    }

    this.menuContainer.replaceChildren();
    this.menuContainer.appendChild(popup);

    const popupForm = this.menuContainer.querySelector('form');
    const firstField = popupForm.querySelector("input, select, textarea, button");
    firstField?.focus();

    if (this.formEventListeners[button]) {
      this.formEventListeners[button].forEach(({ event, callback }) => {
        popupForm.addEventListener(event, callback);
      });
    }

    if (button === 'table') {
      const syncStart = () => {
        const mode = popupForm.querySelector('[name="table-start"]:checked')?.value || 'blank';
        popupForm.querySelectorAll('[data-when-start]').forEach((el) => {
          el.hidden = !el.dataset.whenStart.split(' ').includes(mode);
        });
      };

      popupForm.querySelectorAll('[name="table-start"]').forEach((radio) => {
        radio.addEventListener('change', syncStart);
      });

      // Choosing a file is the same statement as choosing to import.
      popupForm.querySelector('[name="table-csv-file"]')?.addEventListener('change', () => {
        const importRadio = popupForm.querySelector('[name="table-start"][value="import"]');
        if (importRadio) importRadio.checked = true;
        syncStart();
      });

      syncStart();
    }

    if (button === 'img') {
      const fileInput = popupForm.querySelector('[name="img-file"]');
      const srcInput = popupForm.querySelector('[name="img-src"]');
      const preview = popupForm.querySelector('.img-preview');

      if (fileInput) {
        fileInput.addEventListener("change", () => {
          const file = fileInput.files?.[0];
          if (!file) return;
          preview.replaceChildren();
          const image = document.createElement("img");
          image.src = URL.createObjectURL(file); // local preview only
          image.alt = file.name;
          preview.appendChild(image);
          // The field (and inserted src) default to the upload target path, not
          // the browser-local blob URL; Save PUTs the file there.
          srcInput.value = defaultImageTargetPath(file);
        });
      }
    }

    this.menuContainer.style.display = "block";
    this.menuContainer.style.padding = 0;

    this.popupKeyHandler = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      this.hideMenu();
      this.editorView.focus();
    };
    document.addEventListener("keydown", this.popupKeyHandler, true);
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
