import { EditorView } from "prosemirror-view";
import { DOMParser, DOMSerializer } from "prosemirror-model";
import { Plugin, EditorState } from "prosemirror-state"
import { history } from 'prosemirror-history';
import { schema } from "./schema/base.js"
import { keymapPlugin } from "./toolbar/author/keymap.js";
import { AuthorToolbar } from "./toolbar/author/author.js";
import { SocialToolbar } from "./toolbar/social/social.js";
import Config from "./../config.js";
import { addMessageToLog, getAgentHTML, insertDocumentLevelHTML, setDate, setEditSelections, showActionMessage, hasNonWhitespaceText, getFragmentOfNodesChildren } from "../doc.js";
import { getAgentName, getGraphImage, getGraphInbox, getGraphTypes, getResourceGraph } from "../graph.js";
import { fragmentFromString, generateAttributeId } from "../util.js";
import { updateLocalStorageProfile } from "../storage.js";
import rdf from 'rdf-ext';
import { Icon } from "../ui/icons.js";
import { updateButtons } from "../ui/buttons.js";
import { cleanProseMirrorOutput } from "../utils/normalization.js";

const ns = Config.ns;

export class Editor {
  constructor(mode, node) {
    this.mode = mode || Config.Editor.mode;
    //TODO: Look into replacing document.body with selectArticleNode(document) so that main > article, article, or body is used?
    // if body is used, take care to filter out do elements at this point
    // TODO: When choosing the editor node, we need to filter out these items from the content of the editor node. we also need to restore the body to its original form WITH the do elements.
    this.restrictedNodes = [];
    this.allowedScriptElements = [];
    this.node = node || document.body;
    this.toggleModeMessageId = null;

    this.editorView = null;
    this.socialToolbarView = null;
    this.authorToolbarView = this.editorView?.pluginViews[0];

    this.hasRunTextQuoteSelector = false;

    this.placeholder = Config.Editor.Placeholder;
  }

  // Initialize editor and toolbar based on the default editor mode
  init(mode, node, options) {
    this.mode = mode || Config.Editor.mode || this.mode;
    this.node = node || this.node;


    if (options?.template === 'new') {
      DO.Editor['new'] = true;
      this.setTemplate(mode, options);
      this.node = this.node.querySelector('article');
    }

    switch (this.mode) {
      case 'author':
        this.destroySocialToolbar();
        this.createEditor(this.node);
        this.authorToolbarView = this.editorView?.pluginViews[0];
        break;

      case 'social':
      default:
        this.storeRestrictedNodes();
        this.destroyEditor();
        this.createSocialToolbar(this.node);
        break;
    }

    if (!this.hasRunTextQuoteSelector && (this.socialToolbarView || this.authorToolbarView)) {
      this.showTextQuoteSelectorFromLocation();
      this.hasRunTextQuoteSelector = true;
    }
  }

  //TODO: Maintain this list in config normalisation.
  storeRestrictedNodes() {
    const filterSelectors = ['#document-editor', '#review-changes', '.copy-to-clipboard', '.robustlinks', '.ref'];
    const notSelector = filterSelectors.map(selector => `:not(${selector})`).join('');
    //TODO: toc-nav is W3C-specific. Move this into config normalisation
    const allowedScriptSelectors = Object.keys(DO.C.DOMProcessing.allowedScripts).map(src => `script[src="${src}"]`).join(', ');

    const allowedScriptElements = Array.from(document.body.querySelectorAll('script'))
    .filter(script => script.src && Object.keys(DO.C.DOMProcessing.allowedScripts).includes(script.src))
    .filter((script, index, self) => self.findIndex(s => s.src === script.src) === index)
    .map(script => script.cloneNode(true)); 
  
    // const selector = `.do${notSelector}, #toc-nav, ${allowedScriptSelectors}`;
    const selector = `.do${notSelector}, #toc-nav`;
    this.allowedScriptElements = allowedScriptElements;
    this.restrictedNodes = Array.from(document.body.querySelectorAll(selector));
    // this.restrictedNodes = Array.from(document.body.querySelectorAll(selector)).concat(allowedScriptElements);

    // console.log(this.restrictedNodes)
  }

  showEditorModeActionMessage(mode, options = {}) {
    var message = `Activated <em>${mode}</em> mode.`;
    message = {
      'content': message,
      'type': 'info'
    }
    addMessageToLog(message, Config.MessageLog);

    const messageId = showActionMessage(document.body, message, options);

    return messageId;
  }

  toggleEditor(mode, options) {
    DO.Editor['new'] = false;

    let node = document.body;

    if (options?.template === 'new') {
      DO.Editor['new'] = true;
      this.setTemplate(mode, options);
      node = node.querySelector('article');
    }

    updateLocalStorageProfile(Config.User);

// Do not EVER pass options passed to toggleEditor onto this call to init - template option breaks everything. TODO look into this
    this.init(mode, node);
    this.toggleModeMessageId = this.showEditorModeActionMessage(mode, this.toggleModeMessageId ? { clearId: this.toggleModeMessageId } : {});
    Config.EditorEnabled = (mode === 'author');
    Config.EditorWasEnabled = true;

    updateButtons();

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
    }
  }

  setTemplateNew(mode, options) {
    //Start with empty body. Reuse <head>, <html> will have its lang/xml:lang, <body> will have prefix.
    // Add initial nodes h1, p with no content.
    // Update head > title to 'Untitled'. Make sure to have Save update head > title with h1 value (if specified).
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

    document.body.replaceChildren(fragmentFromString(`<main><article><h1 aria-label="Add a title" data-placeholder="${this.placeholder.h1}" property="schema:name"></h1><div datatype="rdf:HTML" property="schema:description"><p data-placeholder="${this.placeholder.p}"></p></div></article></main>`));

    document.body.prepend(documentMenu);

    document.body.removeAttribute('id');
    document.body.removeAttribute('class');

    // If the initial nodes have no content, show placeholder text, else remove placeholder text.

    /*
    
    Set flag e.g. Config.Editor.New = true
    Update Save function to check this flag. If New = true, ask where to save.
    Immutable, Version button states should be disabled/false
    */
  }


  importTextQuoteSelector(containerNode, selector, refId, motivatedBy, docRefType, options) {
    const toolbarView = this.authorToolbarView || this.socialToolbarView;
    return toolbarView?.importTextQuoteSelector(containerNode, selector, refId, motivatedBy, docRefType, options)
  }

  showTextQuoteSelectorFromLocation() {
    const toolbarView = this.authorToolbarView || this.socialToolbarView;
    return toolbarView?.showTextQuoteSelectorFromLocation();
  }

  replaceSelectionWithFragment(fragment){
    // console.log(this)
    const toolbarView = this.authorToolbarView || this.socialToolbarView;
    // console.log('mode',this.mode)
    // console.log('toolbar',toolbarView)
    // console.log(toolbarView?.replaceSelectionWithFragment)
    return toolbarView?.replaceSelectionWithFragment(fragment)
  }

  insertFragmentInNode(fragment, parentNode){
    const toolbarView = this.authorToolbarView || this.socialToolbarView;
    return toolbarView?.insertFragmentInNode(fragment, parentNode)
  }

  //Creating a ProseMirror editor view at a specified this.node
  createEditor(options) {
    // TODO: think about a review mode of initializing and destroying editor
    this.storeRestrictedNodes();

    this.restrictedNodes.forEach(node => {
      node.remove();
    });

    const editorToolbarPlugin = new Plugin({
      // this editorView is passed onto the Plugin - not this.editorView
      view(editorView) {
        // Create new class to hold editor and internal state such as editorView, HTML DOM elements, commands

        // console.log(editorView);

        //TODO: 'math', 'sparkline',
        this.authorToolbarView = new AuthorToolbar('author', ['p', 'h1', 'h2', 'h3', 'h4', 'em', 'strong', 'a', 'img', 'ol', 'ul', 'pre', 'code', 'blockquote', 'q', 'semantics', 'citation', 'requirement', 'note'], editorView);

        // Append DOM portion of toolbar to current editor.
        // editorView.dom.parentNode.appendChild(toolbarView.dom);

        // Return toolbar class. Caller will call its update method in every editor update.
        return this.authorToolbarView;
      }
    });

    const state = EditorState.create({
      doc: DOMParser.fromSchema(schema).parse(this.node),
      plugins: [history(), keymapPlugin, editorToolbarPlugin],
    });

    this.node.replaceChildren();

    this.editorView = new EditorView(this.node, {
      state,
      editable: () => true,
      attributes: {
        class: `${hasNonWhitespaceText(state.doc) ? '' : 'do-new'}`,
        // "data-placeholder": state.doc.childCount === 0 ? placeholderText : "",
        // "data-placeholder": `${hasNonWhitespaceText(state.doc) ? '' : 'Hello World'}`,
      }
     });

     this.restrictedNodes.forEach(node => {
      if (node.id == 'document-menu' || node.id == 'document-items') {
        document.body.prepend(node);
      } else {
        document.body.appendChild(node);
      }

      this.allowedScriptElements.forEach(script => {
        document.body.appendChild(script);
      });

    });

    // console.log(this.editorView.state.doc)
    // console.log(hasNonWhitespaceText(state.doc))
    console.log("Editor created. Mode:", this.mode);
  }


  destroyEditor(content) {
    if (content || this.editorView) {
      content = content ?? DOMSerializer.fromSchema(schema).serializeFragment(this.editorView.state.doc.content);

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
  

      // const serializer = DOMSerializer.fromSchema(schema);
      // const htmlString = new XMLSerializer().serializeToString(fragment);

      // const json = this.editorView.state.doc.toJSON();
      // console.log(json);

      if (this.editorView) {
        this.editorView.destroy();

        this.editorView = null;
        this.authorToolbarView = null;
      }

      //TODO: Create a new function that normalises, e.g., clean up PM related stuff, handle other non-PM but dokieli stuff
      //TODO: dokieli menu is currently outside of body, but it should be in body. Clone the menu, add it back into the body after replaceChildren

      // Restore body content and original nodes
    
      document.body.replaceChildren(...newBodyContent, ...this.restrictedNodes);

      // this.restrictedNodes.forEach(node => {
      //   document.body.appendChild(node);
      // });
      // console.log("Editor destroyed. Mode:", this.mode);
    }
  }

  createSocialToolbar() {
    // Create and initialize the SocialToolbar only when in social mode
    // console.log("creating social toolbar")
    this.socialToolbarView = new SocialToolbar('social', ['share', 'approve', 'disapprove', 'specificity', 'bookmark', 'comment']);
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
  setEditorDataItems(e) {
    if (e && e.target.closest('button.editor-enable')) {
      this.updateDocumentTitle();
      var documentURL = Config.DocumentURL;

      var s = Config.Resource[documentURL].graph.node(rdf.namedNode(documentURL));

      Config.ContributorRoles.forEach(contributorRole => {
      // console.log(contributorRole)
        var contributorNodeId = 'document-' + contributorRole + 's';
        var contributorNode = document.getElementById(contributorNodeId);
        if (!contributorNode) {
          var contributorTitle = contributorRole.charAt(0).toUpperCase() + contributorRole.slice(1) + 's';
          contributorNode = '        <dl id="' + contributorNodeId + '"><dt>' + contributorTitle + '</dt></dl>';
          insertDocumentLevelHTML(document, contributorNode, { 'id': contributorNodeId })
          contributorNode = document.getElementById(contributorNodeId);
        }

        //User can add themselves as a contributor
        if (Config.User.IRI && !s.out(ns.schema[contributorRole]).values.includes(Config.User.IRI)){
          var contributorId;
          var contributorName = Config.User.Name || Config.User.IRI;
          if (Config.User.Name) {
            contributorId = generateAttributeId(null, Config.User.Name);
            if (document.getElementById(contributorId)) {
              contributorId = generateAttributeId(null, Config.User.Name, contributorRole);
            }
          }
          else {
            contributorId = generateAttributeId(null, Config.User.IRI);
          }
          contributorId = ' id="' + contributorId + '"';

          var contributorInList = (Config.Resource[documentURL].rdftype.includes(ns.schema.ScholarlyArticle.value)) ?
            ' inlist="" rel="bibo:' + contributorRole + 'List" resource="' + Config.User.IRI + '"' : '';

          var userHTML = '<dd class="do"' + contributorId + contributorInList + '><span about="" rel="schema:' + contributorRole + '">' + getAgentHTML({'avatarSize': 32}) + '</span><button class="add-' + contributorRole + '" contenteditable="false" title="Add ' + contributorName + ' as ' + contributorRole + '">' + Icon[".fas.fa-plus"] + '</button></dd>';

          contributorNode.insertAdjacentHTML('beforeend', userHTML);
        }

        //User can enter a contributor's WebID
        contributorNode.insertAdjacentHTML('beforeend', '<dd class="do"><button class="enter-' + contributorRole + '" contenteditable="false" title="Enter ' + contributorRole +'">' + Icon[".fas.fa-user-plus"] + '</button></dd>');

        //User can invite a contributor from their contacts
        contributorNode.insertAdjacentHTML('beforeend', '<dd class="do"><button class="invite-' + contributorRole + '" contenteditable="false" title="Invite ' + contributorRole +'">' + Icon[".fas.fa-bullhorn"] + '</button></dd>');

        contributorNode = document.getElementById(contributorNodeId);
        contributorNode.addEventListener('click', (e) => {
          var button = e.target.closest('button.add-' + contributorRole);
          if (button){
            var n = e.target.closest('.do');
            if (n) {
              n.classList.add('selected');
            }
            button.parentNode.removeChild(button);
          }

          button = e.target.closest('button.enter-' + contributorRole);
          //TODO: This input field can behave like the one in js showUserIdentityInput for enableDisableButton to button.commit
          if (button){
            n = e.target.closest('.do');
            n.insertAdjacentHTML('beforebegin', '<dd class="do" contenteditable="false"><input contenteditable="false" name="enter-' + contributorRole + '" placeholder="https://csarven.ca/#i" type="text" value="" /> <button class="commit-' + contributorRole + '" contenteditable="false" title="Commit ' + contributorRole + '">' + Icon[".fas.fa-plus"] + '</button></dd>');
          }

          button = e.target.closest('button.commit-' + contributorRole);
          if (button){
            n = e.target.closest('.do');
            if (n) {
              n.classList.add('selected');

              var input = n.querySelector('input');
              var iri = input.value.trim();

              //TODO:
              // button.disabled = true;
              // button.parentNode.disabled = true;
              // button.querySelector('svg').classList.add('fa-spin');

              if (iri.startsWith('http')) {
                //TODO: Refactor. There is overlap with addShareResourceContactInput and getAgentHTML
                getResourceGraph(iri).then(s => {
                  // var iri = s.iri().toString();
                  // var id = encodeURIComponent(iri);

                  var name = getAgentName(s) || iri;
                  var img = getGraphImage(s);

                  img = (img && img.length) ? '<img alt="" height="32" rel="schema:image" src="' + img + '" width="32" /> ' : '';
                  var userHTML = fragmentFromString('<span about="" rel="schema:' + contributorRole + '"><span about="' + iri + '" typeof="schema:Person">' + img + '<a href="' + iri + '" rel="schema:url">' + name + '</a></span></span>');

                  n.replaceChild(userHTML, input);
                  button.parentNode.removeChild(button);
                });
              }
              else {
                input.focus();
              }
            }
          }

          if (e.target.closest('button.invite-' + contributorRole)) {
            //TODO: Temporarily disabled. Below is the intended place. Bring it back when shareResource (and related stuff) is moved from DO.U. to editor.js or related file.
            // DO.U.shareResource(e);
            console.log("TODO: Temporarily disabled. Check 'button.invite-' + contributorRole")
            e.target.removeAttribute('disabled');
          }
        });

        //TODO: Show 'Remove' button for selected contributor (before exiting edit mode).

        //TODO: Update getResourceInfo() so that Config.Resource[documentURL] can be used to check other contributors while still in edit.
      })

      var documentModified = 'document-modified';
      var modified = document.getElementById(documentModified);
      var lastModified = Config.Resource[Config.DocumentURL]?.headers?.['last-modified']?.['field-value'];
      if(!modified && lastModified) {
        lastModified = new Date(lastModified);
        setDate(document, { 'id': 'document-modified', 'property': 'schema:dateModified', 'title': 'Modified', 'datetime': lastModified } );
      }
    }
    else if (e && e.target.closest('button.editor-disable')) {
      setEditSelections();
    }
  }
}
