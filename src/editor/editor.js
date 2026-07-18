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

import { EditorView } from "prosemirror-view";
import { DOMParser, DOMSerializer } from "prosemirror-model";
import { Plugin, EditorState } from "prosemirror-state"
import { history } from 'prosemirror-history';
import { schema } from "./schema/base.js"
import { keymapPlugin } from "./toolbar/author/keymap.js";
import { AuthorToolbar } from "./toolbar/author/author.js";
import { SocialToolbar } from "./toolbar/social/social.js";
import { SlashMenu } from "./slashmenu/slashmenu.js";
import { applyEditorParseTransforms } from "./../utils/documentTransforms.js";
import { placeholderPlugin } from "./plugins/placeholder.js";
import { autoIdPlugin } from "./plugins/autoId.js";
import { slideStructurePlugin } from "./plugins/slideStructure.js";
import { slideshowDecorationsPlugin } from "./plugins/slideshowDecorations.js";
import { ImageResizeView } from "./nodeviews/imageResize.js";
import { DetailsView } from "./nodeviews/details.js";
import { InputView } from "./nodeviews/input.js";
import { SelectView } from "./nodeviews/select.js";
import { AutocompleteView } from "./nodeviews/autocomplete.js";
import Config from "./../config.js";
import { addMessageToLog, showActionMessage, initCopyToClipboard, showRobustLinksDecoration } from "../doc.js";
import { fragmentFromString, hasNonWhitespaceText, selectArticleNode } from "./../utils/html.js";
import { updateDeviceStorageProfile } from "../storage.js";
import { updateButtons } from "../ui/buttons.js";
import { cleanProseMirrorOutput } from "../utils/normalization.js";
import { i18n } from "../i18n.js";
import { domSanitize, domSanitizeHTMLBody } from "../utils/sanitization.js";
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { IndexeddbPersistence } from 'y-indexeddb'
import { ySyncPlugin, yCursorPlugin, yUndoPlugin, undo, redo, initProseMirrorDoc, prosemirrorToYDoc } from 'y-prosemirror'
import { currentLocation } from "../uri.js";
import { getRandomIndex, stringToColor } from "../util.js";
import { defaultContentHTML } from "../cv.js";
import { cvNavDecorationPlugin } from "./plugins/cvNavDecorations.js";
import { protectPlaceholdersPlugin } from "./plugins/protectPlaceholders.js";

const ns = Config.ns;

let provider;
let localProvider;
let ydoc;
let yXmlFragment;
let originalDoc;
let collabSaveHandler;
let collabBeforeUnloadHandler;
let collabAttentionButton;
const YWEBSOCKET_URL = process.env.YWEBSOCKET_URL;
const DEMO_URL = process.env.DEMO_URL;

// Yjs update encoding the current DOM as the initial document. Uses a random
// clientID (via prosemirrorToYDoc): each seed's structs are independent, so a
// delete on one peer never tombstones another peer's content, and a subsequent
// reseed always integrates. Duplication from concurrent seeds is prevented by
// the 'seeded' marker + grace window below, NOT by sharing struct IDs.
function encodeSeed(pmDoc) {
  return Y.encodeStateAsUpdate(prosemirrorToYDoc(pmDoc));
}

export class Editor {
  constructor(mode, node) {
    this.mode = mode || Config.Editor.mode;
    this.restrictedNodes = [];
    this.allowedScriptElements = [];
    // Default to the article node so PM mounts inside <main><article>
    // rather than stripping the wrapper when it attaches to <body>.
    this.node = node || selectArticleNode(document.body);
    this.toggleModeMessageId = null;
    this.slashMenu = null;

    this.editorView = null;
    this.socialToolbarView = null;
    this.authorToolbarView = this.editorView?.pluginViews[0];

    this.hasRunTextQuoteSelector = false;
  }

  // Initialize editor and toolbar based on the default editor mode
  init(mode, node, options) {
    const documentMode = Config.DocumentModes.author.length ? 'author' : null;
    this.mode = mode || documentMode || Config.Editor.mode || this.mode;
    Config.Editor.mode = this.mode || 'social';
    // make sure we use article node if available
    this.node = (node === document.body ? selectArticleNode(document.body) : node) || this.node;

    if (options?.template === 'new' || options?.template === 'new-slideshow') {
      Config.Editor['new'] = true;
      this.setTemplate(mode, options);
      this.node = selectArticleNode(document.body);
    }

    switch (this.mode) {
      case 'author':
        this.destroySocialToolbar();
        // PM needs actual live DOM node (not a clone or fragment)
        this.node = domSanitizeHTMLBody(this.node)
        this.createEditor();
        // authorToolbarView is set by mountEditor() once the editor is ready
        break;

        case 'social':
        default: {
          if (this.editorView) {
            this.destroyEditor();
            showRobustLinksDecoration();
            initCopyToClipboard();
          }
          this.createSocialToolbar();
          break;
        }
    }

    if (!this.hasRunTextQuoteSelector && (this.socialToolbarView || this.authorToolbarView)) {
      this.showTextQuoteSelectorFromLocation();
      this.hasRunTextQuoteSelector = true;
    }

    if (documentMode) {
      Config.EditorEnabled = (this.mode === 'author');
      Config.EditorWasEnabled = true;
      updateButtons();
    }
  }

  //TODO: Maintain this list in config normalisation.
  storeRestrictedNodes() {
    // .copy-to-clipboard is excluded here: PM cannot place an inline <button> adjacent to block elements
    // without wrapping it in <p>. These buttons are regenerated by initCopyToClipboard() when entering
    // social mode, so they don't need to survive the PM round-trip.
    // .robustlinks and .ref are schema-compatible inline nodes and can safely pass through PM.
    const preserveInEditor = ['#document-editor', '#review-changes', '.robustlinks', '.ref'];
    const notSelector = preserveInEditor.map(selector => `:not(${selector})`).join('');
    // Use :scope > to select only direct children of body. Without this, nested .do
    // elements (e.g. the delete button inside the notifications aside) are also stored
    // as separate entries, causing node.remove() to detach them from their parent and
    // replaceChildren to re-append them as floating body-level elements.
    const nodesToRestrictSelector = `:scope > .do${notSelector}, :scope > #toc-nav`;
    //Nodes to preserve for later. They don't go into the editor.
    this.restrictedNodes = Array.from(document.body.querySelectorAll(nodesToRestrictSelector));

    this.allowedScriptElements = Array.from(document.body.querySelectorAll('script'))
      .filter(script => script.src && Object.keys(Config.DOMProcessing.allowedScripts).includes(script.src))
      .filter((script, index, self) => self.findIndex(s => s.src === script.src) === index);
  }

  showEditorModeActionMessage(mode, options = {}) {
    const modeTranslation = i18n.t(`editor.mode.${mode}`)
    var message = `<span data-i18n="editor.mode.span" data-i18n-mode="${modeTranslation}">${i18n.t('editor.mode.span.innerHTML', {mode: modeTranslation})}</span>`;

    message = {
      'content': message,
      'type': 'info'
    }
    addMessageToLog(message, Config.MessageLog);

    const messageId = showActionMessage(document.body, message, options);

    return messageId;
  }

  toggleEditor(mode, options) {
    Config.Editor['new'] = false;

    let node;

    if (options?.template === 'new' || options?.template === 'new-slideshow' || options?.template === 'new-cv') {
      Config.Editor['new'] = true;
      this.setTemplate(mode, options);
    }

    node = selectArticleNode(document.body);

    updateDeviceStorageProfile(Config.User);

// Do not EVER pass options passed to toggleEditor onto this call to init - template option breaks everything. TODO look into this
    this.init(mode, node);
    this.toggleModeMessageId = this.showEditorModeActionMessage(mode, this.toggleModeMessageId ? { clearId: this.toggleModeMessageId } : {});
    Config.EditorEnabled = (mode === 'author');
    Config.EditorWasEnabled = true;

    updateButtons();

    window.dispatchEvent(new CustomEvent('dokieli:editor-mode-changed', { detail: { mode } }));

    // this.setEditorDataItems(e);
  }

  replaceContent(mode, content) {
    this.destroyEditor(content);
    // this.init(mode);
  }

  setTemplate(mode, options) {
    switch(options.template) {
      case 'new':
        this.setTemplateNew(mode, options);
        break;
      case 'new-slideshow':
        this.setTemplateNewSlideshow(mode, options);
        break;
      case 'new-cv':
        this.setTemplateNewCV(mode, options);
        break;
    }
  }

  setTemplateNew(mode, options) {
    //Start with empty body. Reuse <head>, <html> will have its lang/xml:lang, <body> will have prefix.
    // Add initial nodes h1, p with no content.
    // Update head > title to 'Untitled'. Make sure to have Save update head > title with h1 value (if specified).

    document.documentElement.setAttribute("lang", `${Config.User.UI.Language}`);
    document.documentElement.setAttribute("xml:lang", `${Config.User.UI.Language}`);
    document.documentElement.setAttribute("dir", `${Config.User.UI.LanguageDir}`);

    const titleElement = document.querySelector('head title');

    if (titleElement) {
      titleElement.textContent = 'Untitled';
    }
    else {
      const newTitle = document.createElement('title');
      newTitle.textContent = 'Untitled';
      document.head.appendChild(newTitle);
    }
    // TODO: Remove aria-label when content is updated

    var documentMenu = document.getElementById('document-menu');

    document.body.replaceChildren(fragmentFromString(`<main><article dir="auto"><h1 aria-label="${i18n.t('editor.new.h1.aria-label')}" property="schema:name"></h1><div datatype="rdf:HTML" property="schema:description"><p></p></div></article></main>`));

    if (documentMenu) document.body.prepend(documentMenu);

    document.body.removeAttribute('id');
    document.body.removeAttribute('class');

    // If the initial nodes have no content, show placeholder text, else remove placeholder text.

    /*

    Set flag e.g. Config.Editor.New = true
    Update Save function to check this flag. If New = true, ask where to save.
    Immutable, Version button states should be disabled/false
    */
  }

  setTemplateNewSlideshow(mode, options) {
    document.documentElement.setAttribute("lang", `${Config.User.UI.Language}`);
    document.documentElement.setAttribute("xml:lang", `${Config.User.UI.Language}`);
    document.documentElement.setAttribute("dir", `${Config.User.UI.LanguageDir}`);

    const titleElement = document.querySelector('head title');

    if (titleElement) {
      titleElement.textContent = 'Untitled';
    }
    else {
      const newTitle = document.createElement('title');
      newTitle.textContent = 'Untitled';
      document.head.appendChild(newTitle);
    }

    // FIXME: do we still need this? 
    const documentMenu = document.getElementById('document-menu');
    // Drop dynamic menu sections so they re-render in the correct order.
    ['#document-do', '#document-autosave', '#document-views', '#about-dokieli', '#ui-language'].forEach(sel => {
      documentMenu?.querySelector(sel)?.remove();
    });

    document.body.replaceChildren(fragmentFromString(`<main><article about="" dir="auto" typeof="schema:CreativeWork"><header class="caption"><h1 property="schema:name"></h1></header><section class="slide" id="cover" inlist="" rel="schema:hasPart" resource="#cover" typeof="bibo:Slide"><h2 aria-label="${i18n.t('editor.new-slideshow.h2.aria-label')}" property="schema:name"></h2><div datatype="rdf:HTML" property="schema:description"><p></p></div></section></article><div class="do progress"></div></main>`));

    if (documentMenu) document.body.prepend(documentMenu);

    document.body.removeAttribute('id');
    document.body.className = 'shower single';
  }

  setTemplateNewCV(mode, options) {
    //Start with empty body. Reuse <head>, <html> will have its lang/xml:lang, <body> will have prefix.
    // Add initial nodes h1, p with no content.
    // Update head > title to 'Untitled'. Make sure to have Save update head > title with h1 value (if specified).

    document.documentElement.setAttribute("lang", `${Config.User.UI.Language}`);
    document.documentElement.setAttribute("xml:lang", `${Config.User.UI.Language}`);
    document.documentElement.setAttribute("dir", `${Config.User.UI.LanguageDir}`);

    const titleElement = document.querySelector('head title');

    if (titleElement) {
      titleElement.textContent = 'Untitled';
    }
    else {
      const newTitle = document.createElement('title');
      newTitle.textContent = 'Untitled';
      document.head.appendChild(newTitle);
    }
    // TODO: Remove aria-label when content is updated

    var documentMenu = document.getElementById('document-menu');

    document.body.replaceChildren(fragmentFromString(`<main><article about="" dir="auto" typeof="schema:CreativeWork"><h1 aria-label="${i18n.t('editor.new.h1.aria-label')}" property="schema:name"></h1></article></main>`));

    if (documentMenu) document.body.prepend(documentMenu);

    document.body.removeAttribute('id');
    document.body.removeAttribute('class');

    //TOOD: i18n
    let userDetails = {
      IRI: Config.User.IRI || 'https://example.org/profile/card#me',
      Name: Config.User.Name || 'Your Name',
      Email: Config.User.Email || 'you@example.org',
    };

    //TODO: Move to separate micro template
    let documentDetails = `
<details open="">
  <summary>More details about this document</summary>
  <dl id="document-identifier">
    <dt>Identifier</dt>
    <dd><a href="${Config.DocumentURL}">${Config.DocumentURL}</a></dd>
  </dl>
  <dl id="document-authors">
    <dt>Author</dt>
    <dd><a href="${userDetails.IRI}" rel="schema:creator schema:publisher schema:author" typeof="schema:Person">${userDetails.Name}</a></dd>
  </dl>
  <dl id="document-primary-topic">
    <dt>Topic</dt>
    <dd>
      <p><a href="${userDetails.IRI}" rel="foaf:primaryTopic">${userDetails.Name}</a></p>
      <dl>
        <dt>WebID</dt>
        <dd><a href="${userDetails.IRI}">${userDetails.IRI}</a></dd>
        <dt>Email</dt>
        <dd><a href="mailto:${userDetails.Email}">${userDetails.Email}</a></dd>
      </dl>
    </dd>
  </dl>
  <dl id="document-type">
    <dt>Document Type</dt>
    <dd><a href="http://xmlns.com/foaf/0.1/PersonalProfileDocument" rel="rdf:type">Personal Profile Document</a></dd>
    <dd><a href="http://w3id.org/roh#CurriculumVitae" rel="rdf:type">Curriculum Vitae</a></dd>
  </dl>
</details>
    `

    const article = document.querySelector('main > article');
    article.appendChild(fragmentFromString(documentDetails));
    article.appendChild(fragmentFromString(defaultContentHTML()));
  }


  showTextQuoteSelectorFromLocation() {
    const toolbarView = this.authorToolbarView || this.socialToolbarView;
    return toolbarView?.showTextQuoteSelectorFromLocation();
  }

  // Intended for inserting marks
  replaceSelectionWithFragment(fragment){
    // console.log(this)
    const toolbarView = this.authorToolbarView || this.socialToolbarView;
    // console.log('mode',this.mode)
    // console.log('toolbar',toolbarView)
    // console.log(toolbarView?.replaceSelectionWithFragment)
    return toolbarView?.replaceSelectionWithFragment(fragment)
  }

  replaceSelectionWithNodeFromFragment(fragment){
    // console.log(this)
    const toolbarView = this.authorToolbarView || this.socialToolbarView;
    // console.log('mode',this.mode)
    // console.log('toolbar',toolbarView)
    // console.log(toolbarView?.replaceSelectionWithFragment)
    return toolbarView?.replaceSelectionWithNodeFromFragment(fragment)
  }

  // Inserts an inline fragment while keeping wrapper nodes (e.g. <span class="ref">) closed.
  replaceSelectionWithInlineFragment(fragment){
    const toolbarView = this.authorToolbarView || this.socialToolbarView;
    return toolbarView?.replaceSelectionWithInlineFragment(fragment)
  }


  insertFragmentInNode(fragment, parentNode){
    const toolbarView = this.authorToolbarView || this.socialToolbarView;
    return toolbarView?.insertFragmentInNode(fragment, parentNode)
  }

  insertSlideAtEnd(fragment) {
    const toolbarView = this.authorToolbarView || this.socialToolbarView;
    return toolbarView?.insertSlideAtEnd(fragment);
  }

  insertSlideAfter(targetId, fragment) {
    return this.authorToolbarView?.insertSlideAfter(targetId, fragment);
  }

  deleteSlideById(id) {
    return this.authorToolbarView?.deleteSlideById(id);
  }

  moveSlide(fromId, toId, before) {
    return this.authorToolbarView?.moveSlide(fromId, toId, before);
  }

  insertFragmentAtEndOf(targetSelector, fragment) {
    return this.authorToolbarView?.insertFragmentAtEndOf(targetSelector, fragment);
  }

  insertFragmentAtEndOfChild(parentSelector, childType, fragment) {
    return this.authorToolbarView?.insertFragmentAtEndOfChild(parentSelector, childType, fragment);
  }

  setOriginalAttributeOnDescendants(parentSelector, childType, attrName, attrValue) {
    return this.authorToolbarView?.setOriginalAttributeOnDescendants(parentSelector, childType, attrName, attrValue);
  }

  deleteNodeById(id) {
    return this.authorToolbarView?.deleteNodeById(id);
  }

  //Creating a ProseMirror editor view at a specified this.node
  createEditor(options) {
    // TODO: think about a review mode of initializing and destroying editor
    this.storeRestrictedNodes();

    this.allowedScriptElements.concat(this.restrictedNodes).forEach(node => {
      node.remove();
    });

    // console.log(this.node)

    const editorToolbarPlugin = new Plugin({
      // this editorView is passed onto the Plugin - not this.editorView
      view(editorView) {
        // Create new class to hold editor and internal state such as editorView, HTML DOM elements, commands

        // console.log(editorView);

        //TODO: 'math', 'sparkline',
        // Visible: strong, em, a. submenu (block type selector): p, h1-h4. submenu (+): img, ol, ul, pre, code, blockquote, q. submenu (···): semantics, citation, requirement, note, lang.
        this.authorToolbarView = new AuthorToolbar('author', ['strong', 'em', 'a', 'p', 'h1', 'h2', 'h3', 'h4', 'img', 'ol', 'ul', 'pre', 'code', 'align-left', 'align-center', 'align-right', 'blockquote', 'q', 'semantics', 'citation', 'requirement', 'note', 'lang'], editorView);

        // Append DOM portion of toolbar to current editor.
        // editorView.dom.parentNode.appendChild(toolbarView.dom);

        // Return toolbar class. Caller will call its update method in every editor update.
        return this.authorToolbarView;
      }
    });

  const parseRoot = this.node.cloneNode(true);
  parseRoot.querySelectorAll('#document-editor, #review-changes').forEach(n => n.remove());
  applyEditorParseTransforms(parseRoot);
  originalDoc = DOMParser.fromSchema(schema).parse(parseRoot);

  let pmDoc;
  let editorPlugins;

  if (Config.Editor['new'] || Config.Editor['review']) {
    // New document (no permanent URL) or review/diff editor (conflict resolution,
    // not a collaborative session): skip Yjs/IndexedDB/remote-sync entirely.
    Config.Editor['collab'] = false;
    pmDoc = originalDoc;
    editorPlugins = [history(), keymapPlugin, placeholderPlugin, slideStructurePlugin, slideshowDecorationsPlugin, cvNavDecorationPlugin, autoIdPlugin, protectPlaceholdersPlugin, editorToolbarPlugin];
  } else {
    Config.Editor['collab'] = true;
    ydoc = new Y.Doc();
    const roomName = encodeURIComponent(currentLocation());
    localProvider = new IndexeddbPersistence(roomName, ydoc);
    // TODO: temp allowing websocket only on the demo doc
    if (YWEBSOCKET_URL && window.location.href === DEMO_URL) {
      try {
        provider = new WebsocketProvider(
          YWEBSOCKET_URL,
          roomName,
          ydoc,
          { connect: false }
        );
      } catch (e) {
        console.warn('WebsocketProvider failed to initialise, running local-only:', e);
        provider = null;
      }
    } else {
      provider = null;
    }

    yXmlFragment = ydoc.getXmlFragment('prosemirror');
    const awareness = provider?.awareness;
    const clientId = awareness?.clientID ?? 0;

    const name = Config.User.Name || Config.SecretAgentNames[clientId % Config.SecretAgentNames.length];
    const color = Config.User.IRI ? stringToColor(Config.User.IRI) : stringToColor(name);
    const avatar = Config.User.Image;

    awareness?.setLocalStateField('user', { name, color, avatar });

    const cursorPlugin = awareness ? yCursorPlugin(awareness, {
      cursorBuilder: (user, clientId) => {
        const wrapper = document.createElement('span');
        wrapper.className = 'yjs-cursor do';
        wrapper.dataset.yjsClientid = clientId;   // ← so we can find this node later

        // caret (vertical line)
        const caret = document.createElement('span');
        caret.className = 'yjs-caret';
        caret.style.borderLeftColor = user.color;

        // Name label — revealed on activity, then CSS fades it out so it does
        // not permanently cover the text. It is re-shown by retriggerLabel()
        // below whenever this peer moves or types.
        const label = document.createElement('span');
        label.className = 'yjs-label yjs-label-active';
        label.style.backgroundColor = user.color;

        // avatar
        if (user.avatar) {
          const img = document.createElement('img');
          img.src = user.avatar;
          img.className = 'yjs-avatar';
          label.appendChild(img);
        }

        // name
        const nameSpan = document.createElement('span');
        nameSpan.textContent = user.name;
        nameSpan.style.color = '#fff';

        label.appendChild(nameSpan);

        wrapper.appendChild(caret);
        wrapper.appendChild(label);

        return wrapper;
      },
      // Peer selections use the neutral browser selection color, not the
      // peer's user/label color.
      selectionBuilder: () => ({ class: 'yjs-selection' })
    }) : null;

    collabSaveHandler = () => {
      if (!ydoc || ydoc.isDestroyed) return;
      ydoc.getMap('meta').set('savedStateVector', Y.encodeStateVector(ydoc));
    };
    window.addEventListener('dokieli:collab-save', collabSaveHandler);

    if (provider) {
      provider.on('status', event => {
        console.log('YJS STATUS:', event.status);
      });

      provider.on('connection-closed', () => {
        if (!ydoc.isDestroyed) ydoc.destroy();
      });
    }

    // ProseMirror caches each cursor widget's DOM by clientId, so cursorBuilder
    // does NOT re-run while a peer moves or types. Restart the label's fade
    // animation directly on the live node whenever that peer is active.
    const retriggerLabel = (id) => {
      if (!awareness || id === awareness.clientID) return;
      document
        .querySelectorAll(`.yjs-cursor[data-yjs-clientid="${id}"] .yjs-label`)
        .forEach(label => {
          label.classList.remove('yjs-label-active');
          void label.offsetWidth;              // reflow → restart the animation
          label.classList.add('yjs-label-active');
        });
    };

    if (awareness) {
      // Peer moved the caret or changed selection (no document edit).
      awareness.on('change', ({ added, updated }) => {
        for (const id of added.concat(updated)) retriggerLabel(id);
      });
      // Peer edited the document. Awareness 'change' is not a reliable signal
      // while typing, so also key off the authors of each remote transaction
      // (the clients whose clock advanced).
      ydoc.on('afterTransaction', (tr) => {
        if (tr.local) return;
        for (const [id, clock] of tr.afterState) {
          if ((tr.beforeState.get(id) ?? 0) < clock) retriggerLabel(id);
        }
      });

      // --- DIAGNOSTIC: "look here" re-added raw to surface the console error ---
      console.log('[attention] setup begin; peers=', awareness.getStates().size);

      const seenAttention = new Map();
      awareness.on('change', ({ added, updated }) => {
        console.log('[attention] change; added=', added, 'updated=', updated);
        for (const id of added.concat(updated)) {
          if (id === awareness.clientID) continue;
          const n = awareness.getStates().get(id)?.attention;
          if (n == null || seenAttention.get(id) === n) continue;
          const isFirstSeen = !seenAttention.has(id);
          seenAttention.set(id, n);
          if (isFirstSeen) continue;
          const caret = document.querySelector(`.yjs-cursor[data-yjs-clientid="${id}"]`);
          if (!caret) continue;
          caret.scrollIntoView({ block: 'center', behavior: 'smooth' });
          caret.classList.remove('yjs-attention');
          void caret.offsetWidth;
          caret.classList.add('yjs-attention');
        }
      });

      collabAttentionButton = document.createElement('button');
      collabAttentionButton.id = 'collab-attention';
      collabAttentionButton.className = 'do';
      collabAttentionButton.type = 'button';
      collabAttentionButton.title = 'Scroll collaborators to your cursor';
      collabAttentionButton.textContent = 'Look here';
      collabAttentionButton.hidden = true;
      collabAttentionButton.addEventListener('mousedown', (e) => e.preventDefault());
      collabAttentionButton.addEventListener('click', () => requestCollabAttention());
      document.body.appendChild(collabAttentionButton);
      const syncAttentionButton = () => {
        if (collabAttentionButton) collabAttentionButton.hidden = (awareness.getStates().size <= 1);
      };
      awareness.on('change', syncAttentionButton);
      syncAttentionButton();

      console.log('[attention] setup end');
      // --- END DIAGNOSTIC ---
    }

    function hasUnsavedCollabChanges() {
      if (yXmlFragment.length === 0) return false;
      const savedSV = ydoc.getMap('meta').get('savedStateVector');
      // Never saved: any content is unsaved.
      if (!savedSV) return true;
      const { structs } = Y.decodeUpdate(Y.encodeStateAsUpdate(ydoc, savedSV));
      return structs.length > 1;
    }

    collabBeforeUnloadHandler = (e) => {
      const alone = (provider?.awareness?.getStates().size ?? 0) <= 1;
      if (alone && hasUnsavedCollabChanges()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', collabBeforeUnloadHandler);

    // pagehide fires only after the user confirmed leaving (not on "Stay").
    // Restore Yjs to the remote state and wipe the version history so IDB
    // and still-connected peers don't retain the discarded session.
    window.addEventListener('pagehide', (e) => {
      const alone = (provider?.awareness?.getStates().size ?? 0) <= 1;
      if (!e.persisted && alone && ydoc && !ydoc.isDestroyed && hasUnsavedCollabChanges()) {
        console.warn('[seed] pagehide WIPE+reseed (alone, unsaved changes)');
        ydoc.transact(() => {
          yXmlFragment.delete(0, yXmlFragment.length);
          ydoc.getMap(VERSIONS_MAP).clear();
          ydoc.getMap('meta').clear();
        });
        Y.applyUpdate(ydoc, encodeSeed(originalDoc));
      }
    }, { once: true });

    const { doc: yjsDoc, mapping } = initProseMirrorDoc(yXmlFragment, schema);
    pmDoc = yjsDoc;
    editorPlugins = [
      ySyncPlugin(yXmlFragment, { mapping }),
      ...(cursorPlugin ? [cursorPlugin] : []),
      yUndoPlugin(),
      history(),
      keymapPlugin,
      placeholderPlugin,
      slideStructurePlugin,
      slideshowDecorationsPlugin,
      cvNavDecorationPlugin,
      autoIdPlugin,
      protectPlaceholdersPlugin,
      editorToolbarPlugin,
    ];
  }

  const state = EditorState.create({
    doc: pmDoc,
    plugins: editorPlugins,
  });

  this.node.replaceChildren();

  this.editorView = new EditorView(this.node, {
    state,
    editable: () => true,
    attributes: {
      class: `${hasNonWhitespaceText(originalDoc) ? '' : 'do-new'}`,
      dir: "auto",
    },
    nodeViews: {
      img(node, view, getPos) { return new ImageResizeView(node, view, getPos); },
      details(node) { return new DetailsView(node); },
      input(node, view, getPos) { return new InputView(node, view, getPos); },
      select(node, view, getPos) { return new SelectView(node, view, getPos); },
      autocomplete(node, view, getPos) { return new AutocompleteView(node, view, getPos); }
    },
  });

  this.authorToolbarView = this.editorView.pluginViews.find(v => v instanceof AuthorToolbar) ?? null;

  // Copy-to-clipboard buttons are not restored in author mode; they're regenerated
  // by initCopyToClipboard() when returning to social mode.
  this.restrictedNodes
      .filter(n => !n.classList.contains('copy-to-clipboard'))
      .filter(n => n.id !== 'editor-area-toggle') // recreated fresh by afterButtons()
      .filter(n => n.id !== 'document-slashmenu') // recreated fresh by SlashMenu()
      .forEach(node => {
        if (node.id == 'document-menu' || node.id == 'document-info') {
          document.body.prepend(node);
        } else {
          document.body.appendChild(node);
        }
      });

    this.allowedScriptElements.forEach(script => {
      document.body.appendChild(script);
    });

  this.allowedScriptElements.forEach(script => {
    document.body.appendChild(script);
  });

  this.slashMenu = new SlashMenu(this.editorView);

  if (!Config.Editor['new']) {
    const meta = ydoc.getMap('meta');

    // TEMP diagnostics: report every change to the fragment length, and flag any
    // transaction that empties it, with whether it was local (this client did it)
    // or received from the provider, plus the origin. Remove once resolved.
    let __seedPrevLen = yXmlFragment.length;
    ydoc.on('afterTransaction', (tr) => {
      const len = yXmlFragment.length;
      if (len === __seedPrevLen) return;
      const originName = tr.origin?.constructor?.name ?? String(tr.origin);
      // console.log(`[seed] fragment ${__seedPrevLen} -> ${len} local=${tr.local} origin=${originName} clientID=${ydoc.clientID}`);
      if (len === 0 && __seedPrevLen > 0) {
        // console.warn('[seed] WIPE — fragment emptied', { local: tr.local, origin: tr.origin, seeded: meta.get('seeded') });
      }
      __seedPrevLen = len;
    });

    // Seed the current DOM into the Yjs room, but NEVER additively over existing
    // content: Y.applyUpdate appends (a fresh prosemirrorToYDoc has new struct
    // IDs), so a second seed duplicates the whole document. A persisted 'seeded'
    // marker travels via IndexedDB + the server, making seeding idempotent
    // across reloads and clients.
    const seedFromDom = () => {
      if (yXmlFragment.length > 0 || meta.get('seeded')) {
        // console.log(`[seed] seedFromDom SKIP len=${yXmlFragment.length} seeded=${meta.get('seeded')}`);
        return;
      }
      // console.log('[seed] seedFromDom APPLY (room empty, unseeded)');
      ydoc.transact(() => {
        Y.applyUpdate(ydoc, encodeSeed(originalDoc));
        meta.set('seeded', true);
      });
    };

    localProvider.whenSynced.then(() => {
      let done = false;
      const finish = (collabReady) => {
        if (done) return;
        done = true;
        window.dispatchEvent(new CustomEvent('dokieli:editor-ready'));
        if (collabReady) window.dispatchEvent(new CustomEvent('dokieli:collab-ready'));
      };

      console.log(`[seed] whenSynced provider=${!!provider} len=${yXmlFragment.length} seeded=${meta.get('seeded')}`);

      if (!provider) {
        // Single-user: local DOM is authoritative. Clear then reseed.
        // (Clear first because Y.applyUpdate is additive, not a replace.)
        // console.log('[seed] single-user path: clear + reseed');
        if (yXmlFragment.length > 0) {
          ydoc.transact(() => { yXmlFragment.delete(0, yXmlFragment.length); });
        }
        Y.applyUpdate(ydoc, encodeSeed(originalDoc));
        finish(false);
        return;
      }

      provider.connect();

      // Decide whether to seed only after the initial server sync. Even then, an
      // empty room may still receive the persisted document as a trailing update
      // (the y-websocket/y-leveldb bindState load races 'sync'). Seeding the DOM
      // in that window would merge on top of the arriving content and duplicate
      // the whole document. So when the room looks empty, wait briefly for such
      // an update before seeding; if it arrives (or a peer seeds first), back off.
      const decideSeed = () => {
        console.log(`[seed] decideSeed (after sync) len=${yXmlFragment.length} seeded=${meta.get('seeded')}`);
        if (yXmlFragment.length > 0 || meta.get('seeded')) { finish(true); return; }

        let settled = false;
        const settle = (seed) => {
          if (settled) return;
          settled = true;
          ydoc.off('update', onUpdate);
          clearTimeout(graceTimer);
          console.log(`[seed] grace settled seed=${seed}`);
          if (seed) seedFromDom();
          finish(true);
        };
        const onUpdate = (_update, origin) => {
          // A doc update from the provider means the server/a peer delivered
          // content — do not seed the DOM on top of it.
          if (origin === provider) settle(false);
        };
        ydoc.on('update', onUpdate);
        const graceTimer = setTimeout(() => settle(true), 1000);
      };

      const onSync = (isSynced) => {
        if (!isSynced) return;
        provider.off('sync', onSync);
        clearTimeout(fallback);
        decideSeed();
      };
      provider.on('sync', onSync);

      // Fallback: if the server is unreachable, seed after 5 s so the editor is
      // not stuck empty when working offline.
      const fallback = setTimeout(() => {
        provider.off('sync', onSync);
        seedFromDom();
        finish(false);
      }, 5000);
    });
  }
  }


  // Returns a <div> containing the current PM content as HTML, for use outside of editor.js
  getContentNode() {
    if (!this.editorView) return null;
    const fragment = DOMSerializer.fromSchema(schema).serializeFragment(this.editorView.state.doc.content);
    const div = document.createElement('div');
    div.appendChild(fragment);
    return div;
  }

  destroyEditor(content) {
    Config.Editor['collab'] = false;
    // Always clean up collab resources, even if the editor never finished mounting.
    if (collabSaveHandler) {
      window.removeEventListener('dokieli:collab-save', collabSaveHandler);
      collabSaveHandler = null;
    }
    if (collabBeforeUnloadHandler) {
      window.removeEventListener('beforeunload', collabBeforeUnloadHandler);
      collabBeforeUnloadHandler = null;
    }
    if (collabAttentionButton) {
      collabAttentionButton.remove();
      collabAttentionButton = null;
    }

    // Serialize content and destroy editorView first, so ySyncPlugin unregisters
    // its ydoc observers before ydoc is destroyed. Destroying ydoc first causes
    // y-prosemirror's updateMetas to dispatch a transaction on the still-live
    // editorView with a broken state, crashing on null.matchesNode.
    if (content || this.editorView) {
      content = content ?? DOMSerializer.fromSchema(schema).serializeFragment(this.editorView.state.doc.content);

      if (this.editorView) {
        this.editorView.destroy();
        this.editorView = null;
        this.authorToolbarView = null;
      }
    }

    // Always clean up collab resources, even if the editor never finished mounting.
    if (localProvider) {
      localProvider.destroy();
      localProvider = null;
    }
    if (provider) {
      provider.disconnect();
      provider.destroy();
      provider = null;
    }
    if (ydoc && !ydoc.isDestroyed) {
      ydoc.destroy();
      ydoc = null;
    }

    if (content) {
      let normalisedContent;

      if (content.body) {
        normalisedContent = cleanProseMirrorOutput(content.body);
      } else {
        normalisedContent = cleanProseMirrorOutput(content);
      }

      // If normalisedContent includes a <body>, extract just its children
      let newBodyContent;
      if (normalisedContent instanceof Document) {
        newBodyContent = Array.from(normalisedContent.body.childNodes);
      } else if (normalisedContent instanceof HTMLElement && normalisedContent.tagName.toLowerCase() === 'body') {
        newBodyContent = Array.from(normalisedContent.childNodes);
      } else if (normalisedContent instanceof DocumentFragment) {
        const body = normalisedContent.querySelector('body');
        newBodyContent = body ? Array.from(body.childNodes) : Array.from(normalisedContent.childNodes);
      } else {
        newBodyContent = Array.from(normalisedContent.childNodes ?? []);
      }

      //TODO: Create a new function that normalises, e.g., clean up PM related stuff, handle other non-PM but dokieli stuff
      //TODO: dokieli menu is currently outside of body, but it should be in body. Clone the menu, add it back into the body after replaceChildren

      // Restore body content and original nodes.
      // #document-menu and #document-info must be prepended before the editor content.
      // copy-to-clipboard buttons are discarded; initCopyToClipboard() regenerates them in social mode.
      // If restrictedNodes is empty (social mode, no prior storeRestrictedNodes call),
      // grab #document-menu from the live DOM before replaceChildren wipes it.
      if (!this.restrictedNodes.length) {
        const documentMenu = document.getElementById('document-menu');
        const documentInfo = document.getElementById('document-info');
        this.restrictedNodes = [documentMenu, documentInfo].filter(Boolean);
      }

      const prependNodes = this.restrictedNodes.filter(n => n.id === 'document-menu' || n.id === 'document-info');
      const appendNodes = this.restrictedNodes.filter(n => n.id !== 'document-menu' && n.id !== 'document-info' && !n.classList.contains('copy-to-clipboard'));

      // preserve wrapper when available
      const hasMainWrapper = newBodyContent.some(n =>
        n.nodeType === Node.ELEMENT_NODE && n.tagName?.toLowerCase() === 'main'
      );
      const preserveWrapper = this.node &&
        this.node !== document.body &&
        document.body.contains(this.node) &&
        !hasMainWrapper;

      if (preserveWrapper) {
        this.node.replaceChildren(...newBodyContent);
        prependNodes.forEach(n => document.body.prepend(n));
        appendNodes.forEach(n => document.body.appendChild(n));
        this.allowedScriptElements.forEach(s => document.body.appendChild(s));
      } else {
        document.body.replaceChildren(...prependNodes, ...newBodyContent, ...appendNodes, ...this.allowedScriptElements);
      }
      // this.restrictedNodes.forEach(node => {
      //   document.body.appendChild(node);
      // });
      // console.log("Editor destroyed. Mode:", this.mode);


    }
  }

  createSocialToolbar() {
    // Create and initialize the SocialToolbar only when in social mode
    // console.log("creating social toolbar")
    // Visible: approve, disapprove, comment, bookmark. submenu (···): share, specificity.
    this.socialToolbarView = new SocialToolbar('social', ['approve', 'disapprove', 'comment', 'bookmark', 'share', 'specificity']);
    document.body.appendChild(this.socialToolbarView.dom); // idk why this is needed? or is it not?
    // console.log("SocialToolbar created. Mode:", this.mode);
  }
  

  destroySocialToolbar() {
    if (this.socialToolbarView) {
      this.socialToolbarView.destroy();
      this.socialToolbarView = null;
      // console.log("SocialToolbar destroyed. Mode:", this.mode);
    }
  }


  updateDocumentTitle() {
    var h1 = document.querySelector('h1');
    if (h1) {
      document.title = h1.textContent.trim();
    }
  }

  //TODO: Port Contributor and Modified to slashmenu widget
  // setEditorDataItems(e) {
  //   if (e && e.target.closest('button.editor-enable')) {
  //     this.updateDocumentTitle();
  //     var documentURL = Config.DocumentURL;

  //     var s = Config.Resource[documentURL].graph.node(rdf.namedNode(documentURL));

  //     Config.ContributorRoles.forEach(contributorRole => {
  //     // console.log(contributorRole)
  //       var contributorNodeId = 'document-' + contributorRole + 's';
  //       var contributorNode = document.getElementById(contributorNodeId);
  //       if (!contributorNode) {
  //         var contributorTitle = contributorRole.charAt(0).toUpperCase() + contributorRole.slice(1) + 's';
  //         contributorNode = '        <dl id="' + contributorNodeId + '"><dt>' + contributorTitle + '</dt></dl>';
  //         insertDocumentLevelHTML(document, contributorNode, { 'id': contributorNodeId })
  //         contributorNode = document.getElementById(contributorNodeId);
  //       }

  //       //User can add themselves as a contributor
  //       if (Config.User.IRI && !s.out(ns.schema[contributorRole]).values.includes(Config.User.IRI)){
  //         var contributorId;
  //         var contributorName = Config.User.Name || Config.User.IRI;
  //         if (Config.User.Name) {
  //           contributorId = generateAttributeId(null, Config.User.Name);
  //           if (document.getElementById(contributorId)) {
  //             contributorId = generateAttributeId(null, Config.User.Name, contributorRole);
  //           }
  //         }
  //         else {
  //           contributorId = generateAttributeId(null, Config.User.IRI);
  //         }
  //         contributorId = ' id="' + contributorId + '"';

  //         var contributorInList = (Config.Resource[documentURL].rdftype.includes(ns.schema.ScholarlyArticle.value)) ?
  //           ' inlist="" rel="bibo:' + contributorRole + 'List" resource="' + Config.User.IRI + '"' : '';

  //         var userHTML = '<dd class="do"' + contributorId + contributorInList + '><span about="" rel="schema:' + contributorRole + '">' + getAgentHTML({'avatarSize': 32}) + '</span><button class="add-' + contributorRole + '" contenteditable="false" title="Add ' + contributorName + ' as ' + contributorRole + '">' + Icon[".fas.fa-plus"] + '</button></dd>';

  //         contributorNode.sanitizeInsertAdjacentHTML('beforeend', userHTML);
  //       }

  //       //User can enter a contributor's WebID
  //       contributorNode.sanitizeInsertAdjacentHTML('beforeend', '<dd class="do"><button class="enter-' + contributorRole + '" contenteditable="false" title="Enter ' + contributorRole +'">' + Icon[".fas.fa-user-plus"] + '</button></dd>');

  //       //User can invite a contributor from their contacts
  //       contributorNode.sanitizeInsertAdjacentHTML('beforeend', '<dd class="do"><button class="invite-' + contributorRole + '" contenteditable="false" title="Invite ' + contributorRole +'">' + Icon[".fas.fa-bullhorn"] + '</button></dd>');

  //       contributorNode = document.getElementById(contributorNodeId);
  //       contributorNode.addEventListener('click', (e) => {
  //         var button = e.target.closest('button.add-' + contributorRole);
  //         if (button){
  //           var n = e.target.closest('.do');
  //           if (n) {
  //             n.classList.add('selected');
  //           }
  //           button.parentNode.removeChild(button);
  //         }

  //         button = e.target.closest('button.enter-' + contributorRole);
  //         //TODO: This input field can behave like the one in js showUserIdentityInput for enableDisableButton to button.commit
  //         if (button){
  //           n = e.target.closest('.do');
  //           n.sanitizeInsertAdjacentHTML('beforebegin', '<dd class="do" contenteditable="false"><input contenteditable="false" name="enter-' + contributorRole + '" placeholder="https://csarven.ca/#i" type="text" value="" /> <button class="commit-' + contributorRole + '" contenteditable="false" title="Commit ' + contributorRole + '">' + Icon[".fas.fa-plus"] + '</button></dd>');
  //         }

  //         button = e.target.closest('button.commit-' + contributorRole);
  //         if (button){
  //           n = e.target.closest('.do');
  //           if (n) {
  //             n.classList.add('selected');

  //             var input = n.querySelector('input');
  //             var iri = input.value.trim();

  //             //TODO:
  //             // button.disabled = true;
  //             // button.parentNode.disabled = true;
  //             // button.querySelector('svg').classList.add('fa-spin');

  //             if (iri.startsWith('http')) {
  //               //TODO: Refactor. There is overlap with addShareResourceContactInput and getAgentHTML
  //               getResourceGraph(iri).then(s => {
  //                 // var iri = s.iri().toString();
  //                 // var id = encodeURIComponent(iri);

  //                 var name = getAgentName(s) || iri;
  //                 var img = getGraphImage(s);

  //                 img = (img && img.length) ? '<img alt="" height="32" rel="schema:image" src="' + img + '" width="32" /> ' : '';
  //                 var userHTML = fragmentFromString('<span about="" rel="schema:' + contributorRole + '"><span about="' + iri + '" typeof="schema:Person">' + img + '<a href="' + iri + '" rel="schema:url">' + name + '</a></span></span>');

  //                 n.replaceChild(userHTML, input);
  //                 button.parentNode.removeChild(button);
  //               });
  //             }
  //             else {
  //               input.focus();
  //             }
  //           }
  //         }

  //         if (e.target.closest('button.invite-' + contributorRole)) {
  //           //TODO: Temporarily disabled. Below is the intended place. Bring it back when shareResource (and related stuff) is moved from DO .U. to editor.js or related file.
  //           // shareResource(e);
  //           console.log("TODO: Temporarily disabled. Check 'button.invite-' + contributorRole")
  //           e.target.removeAttribute('disabled');
  //         }
  //       });

  //       //TODO: Show 'Remove' button for selected contributor (before exiting edit mode).

  //       //TODO: Update getResourceInfo() so that Config.Resource[documentURL] can be used to check other contributors while still in edit.
  //     })

  //     var documentModified = 'document-modified';
  //     var modified = document.getElementById(documentModified);
  //     var lastModified = Config.Resource[Config.DocumentURL]?.headers?.['last-modified']?.['field-value'];
  //     if(!modified && lastModified) {
  //       lastModified = new Date(lastModified);
  //       setDate(document, { 'id': 'document-modified', 'property': 'schema:dateModified', 'datetime': lastModified } );
  //     }
  //   }
  //   else if (e && e.target.closest('button.editor-disable')) {
  //     setEditSelections();
  //   }
  // }
}
// One-shot "look here": bump this client's awareness `attention` nonce.
export function requestCollabAttention() {
  const awareness = provider?.awareness;
  if (!awareness) return;
  const n = (awareness.getLocalState()?.attention || 0) + 1;
  awareness.setLocalStateField('attention', n);
}

// Update the Yjs awareness user field after sign-in so peers see the correct identity.
// Also reconnects the websocket so the server sees a fresh session under the new identity.
export function updateCollabUserIdentity() {
  if (!provider || !provider.awareness) return;

  const awareness = provider.awareness;
  const clientId = awareness.clientID;
  const name = Config.User.Name || Config.SecretAgentNames[clientId % Config.SecretAgentNames.length];
  const color = Config.User.IRI ? stringToColor(Config.User.IRI) : stringToColor(name);
  const avatar = Config.User.Image;

  awareness.setLocalStateField('user', { name, color, avatar });

  // Reconnect so the websocket server session reflects the new identity.
  if (provider.wsconnected) {
    provider.disconnect();
    provider.connect();
  }
}

// Replace the live Yjs document content with an arbitrary HTML string.
// Used by version history restore in collab mode.
export function restoreYjsContent(htmlString, key) {
  if (!ydoc || ydoc.isDestroyed || !yXmlFragment) return false;

  const tmpl = document.implementation.createHTMLDocument('');
  tmpl.documentElement.setHTMLUnsafe(htmlString);
  const pmDoc = DOMParser.fromSchema(schema).parse(tmpl.body);
  const seedDoc = prosemirrorToYDoc(pmDoc);

  ydoc.transact(() => { yXmlFragment.delete(0, yXmlFragment.length); });
  Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(seedDoc));

  if (key) {
    ydoc.getMap('meta').set('currentVersionKey', key);
    window.dispatchEvent(new CustomEvent('dokieli:version-current-changed', { detail: { key } }));
    window.dispatchEvent(new CustomEvent('dokieli:version-restored', { detail: { key } }));
  }

  return true;
}

export function getCurrentVersionKey() {
  if (!ydoc || ydoc.isDestroyed) return null;
  return ydoc.getMap('meta').get('currentVersionKey') ?? null;
}

const VERSIONS_MAP = 'versions';
const MAX_VERSIONS = 20;

// Write a version snapshot into the shared Yjs doc so all peers see it.
export function addYjsVersion(versionData) {
  if (!ydoc || ydoc.isDestroyed) return;

  // Freeze actor identity from awareness at save time. This ensures anonymous
  // versions keep their pseudonymous identity even after the user signs in.
  const awarenessUser = provider?.awareness?.getLocalState()?.user;
  const actor = {
    iri: Config.User?.IRI || null,
    name: awarenessUser?.name || null,
    avatar: awarenessUser?.avatar || null
  };

  const versionsMap = ydoc.getMap(VERSIONS_MAP);
  const key = versionData.updated || new Date().toISOString();

  ydoc.transact(() => {
    versionsMap.set(key, { ...versionData, actor });
    ydoc.getMap('meta').set('currentVersionKey', key);

    // Enforce max count — drop oldest entries beyond the limit.
    if (versionsMap.size > MAX_VERSIONS) {
      const sorted = Array.from(versionsMap.keys()).sort();
      for (let i = 0; i < versionsMap.size - MAX_VERSIONS; i++) {
        versionsMap.delete(sorted[i]);
      }
    }
  });

  window.dispatchEvent(new CustomEvent('dokieli:version-current-changed', { detail: { key } }));
}

// Subscribe to changes in the shared versions map. Returns an unsubscribe function.
// Calls callback whenever a peer adds/removes a version entry.
export function onYjsVersionsChanged(callback) {
  if (!ydoc || ydoc.isDestroyed) return () => {};
  const versionsMap = ydoc.getMap(VERSIONS_MAP);
  versionsMap.observe(callback);
  return () => versionsMap.unobserve(callback);
}

// Read all version snapshots from the shared Yjs doc, newest first.
export function getYjsVersions() {
  if (!ydoc || ydoc.isDestroyed) return [];

  const versionsMap = ydoc.getMap(VERSIONS_MAP);
  return Array.from(versionsMap.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([, v]) => v);
}

// Read version snapshots directly from IndexedDB without needing the editor
// to be active. Used to show version history before the user enters edit mode.
export async function getYjsVersionsFromIDB({ limit }) {
  const roomName = encodeURIComponent(currentLocation());
  const tempDoc = new Y.Doc();
  const persistence = new IndexeddbPersistence(roomName, tempDoc);

  await persistence.whenSynced;

  const versionsMap = tempDoc.getMap(VERSIONS_MAP);
  const versions = Array.from(versionsMap.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([, v]) => v);

  persistence.destroy();
  tempDoc.destroy();
  
  if (limit) {
    versions = versions.slice(0, limit)
  }

  return versions;
}
