import { accessModePossiblyAllowed } from "../doc.js";
import { Icon} from "./icons.js";
import Config from "../config.js";
import { isLocalhost } from "../uri.js";
import i18next from "i18next";

const ns = Config.ns;
Config.Button.C
const docsBaseURL = Config.WebExtensionEnabled ? Config.WebExtension.runtime.getURL('docs') : 'https://dokie.li/docs';

// function getButtonTextContent(key, buttonTextContent) {
//   const textContentTranslation = i18next.t(key);
//   const textContentStr = textContentTranslation.includes(key) ? buttonTextContent : textContentTranslation;
//   return textContentStr;
// }

export function initButtons() {
  Config.Button = {
    Close: getButtonHTML({ key: "close.graph.button", button: "close", buttonClass: "close", iconSize: "fa-2x" }),
    Delete: getButtonHTML({ key: "delete.button", button: "delete", buttonClass: "delete" }),
    Toggle: getButtonHTML({ key: "toggle.button", button: "toggle", buttonClass: "toggle" }),
    More: getButtonHTML({ key: "more.button", button: "more", buttonClass: "more" }),
    Clipboard: getButtonHTML({ key: "clipboard.button", button: "clipboard", buttonClass: "do copy-to-clipboard" }),
    OpenMenu: getButtonHTML({ key: "menu.open.button", button: "bars", buttonClass: "show" }),
    CloseMenu: getButtonHTML({ key: "menu.close.button", button: "minus", buttonClass: "hide" }),
    Info: {
      Delete: getButtonHTML({ key: "info.delete.button", button: "info", buttonClass: "info", buttonRel: "rel:help", buttonResource: `${docsBaseURL}#feature-delete` }),
      EmbedData: getButtonHTML({ key: "info.embed-data.button", button: "info", buttonClass: "info", buttonRel: "rel:help", buttonResource: `${docsBaseURL}#feature-embed-data` }),
      GraphView: getButtonHTML({ key: "info.graph.button", button: "info", buttonClass: "info", buttonRel: "rel:help", buttonResource: `${docsBaseURL}#feature-graph-view` }),
      GenerateFeeds: getButtonHTML({ key: "info.feed.button", button: "info", buttonClass: "info", buttonRel: "rel:help", buttonResource: `${docsBaseURL}#feature-generate-feed` }),
      MessageLog: getButtonHTML({ key: "info.messages.button", button: "info", buttonClass: "info", buttonRel: "rel:help", buttonResource: `${docsBaseURL}#feature-message-log` }),
      Notifications: getButtonHTML({ key: "info.notifications.button", button: "info", buttonClass: "info", buttonRel: "rel:help", buttonResource: `${docsBaseURL}#feature-notifications` }),
      Open: getButtonHTML({ key: "info.open.button", button: "info", buttonClass: "info", buttonRel: "rel:help", buttonResource: `${docsBaseURL}#feature-open` }),
      Reply: getButtonHTML({ key: "info.reply.button", button: "info", buttonClass: "info", buttonRel: "rel:help", buttonResource: `${docsBaseURL}#feature-reply` }),
      ReviewChanges: getButtonHTML({ key: "info.review-changes.button", button: "info", buttonClass: "info", buttonRel: "rel:help", buttonResource: `${docsBaseURL}#feature-review-changes` }),
      RobustLinks: getButtonHTML({ key: "info.robustify-links.button", button: "info", buttonClass: "info", buttonRel: "rel:help", buttonResource: `${docsBaseURL}#feature-robustify-links` }),
      SaveAs: getButtonHTML({ key: "info.save-as.button", button: "info", buttonClass: "info", buttonRel: "rel:help", buttonResource: `${docsBaseURL}#feature-save-as` }),
      Share: getButtonHTML({ key: "info.share.button", button: "info", buttonClass: "info", buttonRel: "rel:help", buttonResource: `${docsBaseURL}#feature-share` }),
      SignIn: getButtonHTML({ key: "info.signin.button", button: "info", buttonClass: "info", buttonRel: "rel:help", buttonResource: `${docsBaseURL}#feature-sign-in` }),
      Source: getButtonHTML({ key: "info.source.button", button: "info", buttonClass: "info", buttonRel: "rel:help", buttonResource: `${docsBaseURL}#feature-source` })
    },
    SignIn: getButtonHTML({ key: "signin.button", button: "signin", buttonClass: "signin-user" }),
    Menu: {
      Delete: getButtonHTML({ key: "menu.delete.button", button: "delete", buttonClass: "resource-delete", iconSize: "fa-2x", buttonDisabled: true }),
      DocumentInfo: getButtonHTML({ key: "menu.document-info.button", button: "document-info", buttonClass: "document-info", iconSize: "fa-2x", buttonDisabled: true }),
      EditEnable: getButtonHTML({ key: "menu.edit-enable.button", button: "cursor", buttonClass: "editor-enable", iconSize: "fa-2x" }),
      EditDisable: getButtonHTML({ key: "menu.edit-disable.button", button: "cursor", buttonClass: "editor-disable", iconSize: "fa-2x" }),
      EmbedData: getButtonHTML({ key: "menu.embed-data.button", button: "data-meta", buttonClass: "embed-data-meta", iconSize: "fa-2x" }),
      Export: getButtonHTML({ key: "menu.export.button", button: "export", buttonClass: "export-as-html", iconSize: "fa-2x" }),
      GenerateFeed: getButtonHTML({ key: "menu.feed.button", button: "feed", buttonClass: "generate-feed", iconSize: "fa-2x" }),
      Immutable: getButtonHTML({ key: "menu.immutable.button", button: "immutable", buttonClass: "create-immutable", iconSize: "fa-2x", buttonDisabled: true }),
      InternetArchive: getButtonHTML({ key: "menu.archive.button", button: "archive", buttonClass: "snapshot-internet-archive", iconSize: "fa-2x" }),
      Open: getButtonHTML({ key: "menu.resource-open.button", button: "open", buttonClass: "resource-open", iconSize: "fa-2x" }),
      New: getButtonHTML({ key: "menu.new.button", button: "new", buttonClass: "resource-new", iconSize: "fa-2x" }),
      Notifications: getButtonHTML({ key: "menu.notifications.button", button: "activities", buttonClass: "resource-notifications", iconSize: "fa-2x" }),
      RobustifyLinks: getButtonHTML({ key: "menu.robustify-links.button", button: "robustify-links", buttonClass: "robustify-links", iconSize: "fa-2x" }),
      Save: getButtonHTML({ key: "menu.resource-save.button", button: "save", buttonClass: "resource-save", iconSize: "fa-2x", buttonDisabled: true }),
      SaveAs: getButtonHTML({ key: "menu.save-as.button", button: "save-as", buttonClass: "resource-save-as", iconSize: "fa-2x" }),
      Share: getButtonHTML({ key: "menu.share.button", button: "share", buttonClass: "resource-share", iconSize: "fa-2x" }),
      SignIn: getButtonHTML({ key: "menu.signin.button", button: "signin", buttonClass: "signin-user", iconSize: "fa-2x" }),
      SignOut: getButtonHTML({ key: "menu.signout.button", button: "signout", buttonClass: "signout-user" }),
      Source: getButtonHTML({ key: "menu.source.button", button: "source", buttonClass: "resource-source", iconSize: "fa-2x" }),
      Memento: getButtonHTML({ key: "menu.memento.button", button: "memento", buttonClass: "resource-memento", iconSize: "fa-2x", buttonDisabled: true }),
      MessageLog: getButtonHTML({ key: "menu.messages.button", button: "messages", buttonClass: "message-log", iconSize: "fa-2x" }),
      Print: getButtonHTML({ key: "menu.print.button", button: "print", buttonClass: "resource-print", iconSize: "fa-2x" }),
      Reply: getButtonHTML({ key: "menu.reply.button", button: "in-reply-to", buttonClass: "resource-reply", iconSize: "fa-2x" }),
      Version: getButtonHTML({ key: "menu.version.button", button: "version", buttonClass: "create-version", iconSize: "fa-2x", buttonDisabled: true }),
    }
  }
}

//Given a button action, generates an HTML string for the button including an icon and text.
export function getButtonHTML({
  button,
  key,
  buttonClass,
  buttonDisabled,
  buttonRel,
  buttonResource,
  buttonType,
  iconSize 
}) {

  if (!button) {
      throw new Error('`button` identifier is required.');
  }

  key = key || `button.${button}`;

  // const titleContent = buttonTitle || buttonIcons[button]?.title || button;
  const titleContent = i18next.t(`${key}.title`) === `${key}.title` ? buttonIcons[button]?.title || button : i18next.t(`${key}.title`);
  const title = ` title="${titleContent}"`;
  // const textContent = buttonTextContent || buttonIcons[button]?.textContent;
  const textContent = i18next.t(`${key}.textContent`) === `${key}.textContent` ? null : i18next.t(`${key}.textContent`);
  // const label = buttonLabel || titleContent;
  const label = i18next.t(`${key}.label`) === `${key}.label` ? null : i18next.t(`${key}.label`);
  const ariaLabel = (label && !textContent) ? ` aria-label="${label}"` : '';
  const className = buttonClass ? ` class="${buttonClass}"` : '';
  const disabled = buttonDisabled ? ` disabled=""` : '';
  let icon = buttonIcons[button]?.icon;
  const rel = buttonRel ? ` rel="${buttonRel}"` : '';
  const resource = buttonResource ? ` resource="${buttonResource}"` : '';
  const type = buttonType ? ` type="${buttonType}"` : '';
  const dataI18n = key ? ` data-i18n=${key}` : '';

  if (icon) {
    let parser = new DOMParser();
    let doc = parser.parseFromString(icon, 'image/svg+xml');
    let svgElement = doc.querySelector('svg');
    svgElement.setAttribute('aria-hidden', 'true');
    if (iconSize) {
      svgElement.classList.add(iconSize);
    }
    icon = new XMLSerializer().serializeToString(svgElement);
  }

  const buttonContent = (!icon && !textContent) ? button : `${icon ? icon : ''} ${textContent ? `<span>${textContent}</span>` : ''}`;

  return `<button${dataI18n}${ariaLabel}${className}${disabled}${rel}${resource}${title}${type}>${buttonContent}</button>`;
}


export const buttonIcons = {
  p: {
    title: 'paragraph',
    icon: Icon['.fas.fa-paragraph']
  },
  em: {
    title:'emphasise',
    icon: Icon['.fas.fa-italic']
  },
  strong: {
    title:'strongly emphasise',
    icon: Icon['.fas.fa-bold']
  },
  ol: {
    title:'ordered list',
    icon: Icon['.fas.fa-link-ol']
  },
  ul: {
    title:'unordered list',
    icon: Icon['.fas.fa-link-ul']
  },
  ...['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].reduce((acc, heading) => {
    acc[heading] = {
      title: `heading level ${heading[1]}`,
      icon: `${Icon['.fas.fa-header']}`,
      textContent: heading[1]
    };
    return acc;
  }, {}),
  a: {
    title: 'link',
    icon: Icon['.fas.fa-link']
  },
  citation: {
    title: 'citation',
    icon: Icon['.fas.fa-hashtag']
  },
  //TODO: Change annotate or note's icon
  comment: {
    title: 'comment',
    icon: Icon['.fas.fa-comment']
  },
  note: {
    title: 'note (internal)',
    icon: Icon['.fas.fa-sticky-note']
  },
  requirement: {
    title: 'requirement',
    icon: Icon['.fas.fa-microchip']
  },
  semantics: {
    title: 'semantics',
    icon: Icon['.fas.fa-rocket']
  },
  sparkline: {
    title: 'sparkline',
    icon: Icon['.fas.fa-chart-line']
  },
  img: {
    title: 'image',
    icon: Icon['.fas.fa-image']
  },
  pre: {
    title: 'code (block)',
    icon: Icon['.fas.fa-terminal']
  },
  code: {
    title: 'code (inline)',
    icon: Icon['.fas.fa-code']
  },
  blockquote: {
    title: 'blockquote (with source)',
    icon: Icon['.fas.fa-angle-right']
  },
  q: {
    title: 'quote (with source)',
    icon: Icon['.fas.fa-quote-right']
  },
  math: {
    title: 'math',
    icon: Icon['.fas.fa-calculator']
  },

  highlight: {
    title: 'highlight',
    icon: Icon['.fas.fa-anchor']
  },
  bookmark: {
    title: 'bookmark',
    icon: Icon['.fas.fa-bookmark']
  },
  share: {
    title: 'share',
    icon: Icon['.fas.fa-bullhorn']
  },
  approve: {
    title: 'approve',
    icon: Icon['.fas.fa-thumbs-up']
  },
  disapprove: {
    title: 'disapprove',
    icon: Icon['.fas.fa-thumbs-down']
  },
  specificity: {
    title: 'specificity',
    icon: Icon['.fas.fa-crosshairs']
  },
  close: {
    title: 'Close',
    icon: Icon['.fas.fa-times']
  },
  submit: {
    title: 'Submit',
    icon: Icon['.fas.fa-check']
  },
  cancel: {
    title: 'Cancel',
    icon: Icon['.fas.fa-times']
  },
  delete: {
    title: 'Delete',
    icon: Icon['.fas.fa-trash-alt']
  },
  toggle: {
    title: 'Show/Hide',
    icon: Icon['.fas.fa-angle-right']
  },
  more: {
    title: 'Show more',
    icon: Icon['.fas.fa-rotate']
  },
  cursor: {
    title: 'Cursor',
    icon: Icon['.fas.fa-i-cursor']
  }, 
  signout: {
    title: 'Sign out',
    icon: Icon['.far.fa-spock-hand']
  },
  signin: {
    title: 'Sign in',
    icon: Icon['.fas.fa-user-astronaut']
  },
  license: {
    title: 'License',
    icon: Icon['.fas.fa-certificate']
  },
  language: {
    title: 'Language',
    icon: Icon['.fas.fa-language']
  },
  'resource-type': {
    title: 'Resource type',
    icon: Icon['.fas.fa-shape']
  },
  inbox: {
    title: 'Inbox',
    icon: Icon['.fas.fa-inbox']
  },
  'in-reply-to': {
    title: 'In reply to',
    icon: Icon['.fas.fa-reply']
  },
  'publication-status': {
    title: 'Publication status',
    icon: Icon['.fas.fa-timeline']
  },
  activities: {
    title: 'Activities',
    icon: Icon['.fas.fa-bolt']
  },
  new: {
    title: 'New',
    icon: Icon['.far.fa-lightbulb']
  },
  open: {
    title: 'Open',
    icon: Icon['.fas.fa-coffee']
  },
  save: {
    title: 'Save',
    icon: Icon['.fas.fa-life-ring']
  },
  'save-as': {
    title: 'Save As',
    icon: Icon['.far.fa-paper-plane']
  },
  messages: {
    title: 'Messages',
    icon: Icon['.fas.fa-scroll']
  },
  print: {
    title: 'Print document',
    icon: Icon[".fas.fa-print"] 
  },
  'data-meta': {
    title: 'Embed structured data',
    icon: Icon [".fas.fa-table"]
  },
  table: {
    title: 'table',
    icon: Icon [".fas.fa-table"]
  },
  source: {
    title: 'Edit article source code',
    icon: Icon[".fas.fa-code"] 
  },
  memento: {
    title: 'Memento article',
    icon: Icon[".far.fa-clock"] 
  },
  version: {
    title: 'Create version',
    icon: Icon[".fas.fa-code-branch"]
  },
  immutable: {
    title: 'Make immutable',
    icon: Icon[".far.fa-snowflake"] 
  },
  'robustify-links': {
    title: 'Robustify Links',
    icon: Icon[".fas.fa-link"]
  },
  archive: {
    title: 'Archive',
    icon: Icon[".fas.fa-archive"]
  },
  feed: {
    title: 'Generate Web feed',
    icon: Icon[".fas.fa-rss"] 
  },
  export: {
    title: 'export',
    icon: Icon[".fas.fa-external-link-alt"]
  },
  cursor: {
    title: 'cursor',
    icon: Icon[".fas.fa-i-cursor"]
  },
  'local-storage': {
    title: '',
    icon: Icon[".fas.fa-database"]
  },
  info: {
    title: 'info',
    icon: Icon[".fas.fa-circle-info"]
  },
  success: {
    title: 'success',
    icon: Icon[".fas.fa-check"]
  },
  error: {
    title: 'error',
    icon: Icon[".fas.fa-triangle-exclamation"]
  },
  warning: {
    title: 'warning',
    icon: Icon[".fas.fa-circle-exclamation"]
  },
  'test-suite': {
    title: 'Test suite',
    icon: Icon[".fas.fa-vial-circle-check"]
  },
  clipboard: {
    title: 'Copy to clipboard',
    icon: Icon[".fas.fa-copy"]
  },
  bars: {
    title: 'Show',
    icon: Icon[".fas.fa-bars"]
  },
  minus: {
    title: 'Hide',
    icon: Icon[".fas.fa-minus"]
  },
  'review-changes': {
    title: 'Review changes',
    icon: Icon[".fas.fa-microscope"]
  },
  'document-info': {
    title: 'Document info',
    icon: Icon[".fas.fa-atom"]
  }
}

const buttonState = {
  '#document-do .resource-save': ({ info, online, localhost }) => {
    if (!online && !localhost) return false;

    if (!accessModePossiblyAllowed(null, 'write')) {
      return false;
    }

    if (info.odrl?.prohibitionActions &&
        info.odrl.prohibitionAssignee === Config.User.IRI &&
        info.odrl.prohibitionActions.includes(ns.odrl.modify.value)) {
      return false;
    }

    return true;
  },

  '#document-do .create-version': ({ info, online, localhost }) => {
    if (!online && !localhost) return false;

    if (!accessModePossiblyAllowed(null, 'write')) {
      return false;
    }

    if (info.odrl?.prohibitionActions &&
        info.odrl.prohibitionAssignee === Config.User.IRI &&
        info.odrl.prohibitionActions.includes(ns.odrl.reproduce.value)) {
      return false;
    }

    return true;
  },

  '#document-do .create-immutable': ({ info, online, localhost }) => {
    if (!online && !localhost) return false;

    if (!accessModePossiblyAllowed(null, 'write')) {
      return false;
    }

    if (info.odrl?.prohibitionActions &&
        info.odrl.prohibitionAssignee === Config.User.IRI &&
        info.odrl.prohibitionActions.includes(ns.odrl.reproduce.value)) {
      return false;
    }

    return true;
  },

  '#document-do .resource-delete': ({ info, online, localhost }) => {
    if (!online && !localhost) return false;

    if (!accessModePossiblyAllowed(null, 'write')) {
      return false;
    }

    if (info.odrl?.prohibitionActions &&
        info.odrl.prohibitionAssignee === Config.User.IRI &&
        info.odrl.prohibitionActions.includes(ns.odrl.delete.value)) {
      return false;
    }

    return true;
  },

  '#document-do .resource-memento': ({ info, online, localhost }) => {
    if (!info['timemap']) return false;

    if (!online && !localhost) return false;

    if (!online && !isLocalhost(info['timemap'])) return false;

    return true;
  },

  '#document-do .snapshot-internet-archive': ({ info, online, localhost }) => {
    if (info.odrl?.prohibitionActions &&
        info.odrl.prohibitionAssignee === Config.User.IRI &&
        (info.odrl.prohibitionActions.includes(ns.odrl.archive.value) ||
         info.odrl.prohibitionActions.includes(ns.odrl.reproduce.value))) {
      return false;
    }

    if (!online || localhost) return false;

    return true;
  },

  '#document-do .resource-save-as': ({ info, online, localhost }) => {
    if (info.odrl?.prohibitionActions &&
        info.odrl.prohibitionAssignee === Config.User.IRI &&
        (info.odrl.prohibitionActions.includes(ns.odrl.derive.value) ||
         info.odrl.prohibitionActions.includes(ns.odrl.reproduce.value))) {
      return false;
    }

    if (!online && !localhost) return false;

    return true;
  },

  '#document-do .resource-print': ({ info }) => {
    if (info.odrl?.prohibitionActions &&
        info.odrl.prohibitionAssignee === Config.User.IRI &&
        info.odrl.prohibitionActions.includes(ns.odrl.print.value)) {
      return false;
    }

    return true;
  },

  '#document-do .export-as-html': ({ info }) => {
    if (info.odrl?.prohibitionActions &&
        info.odrl.prohibitionAssignee === Config.User.IRI &&
        (info.odrl.prohibitionActions.includes(ns.odrl.transform.value) ||
         info.odrl.prohibitionActions.includes(ns.odrl.reproduce.value))) {
      return false;
    }

    return true;
  },

  '#document-do .generate-feed': ({ info, online, localhost }) => {
    if (info.odrl?.prohibitionActions &&
        info.odrl.prohibitionAssignee === Config.User.IRI &&
        info.odrl.prohibitionActions.includes(ns.odrl.reproduce.value)) {
      return false;
    }

    if (!online && !localhost) return false;

    return true;
  },

  '#document-do .robustify-links': ({ info, online, editorMode }) => {
    if (editorMode !== 'author') return false;

    if (info.odrl?.prohibitionActions &&
        info.odrl.prohibitionAssignee === Config.User.IRI &&
        info.odrl.prohibitionActions.includes(ns.odrl.reproduce.value)) {
      return false;
    }

    if (!online) return false;

    return true;
  },

  '#document-do .embed-data-meta': ({ info, editorMode }) => {
    if (editorMode !== 'author') return false;
    
    if (info.odrl?.prohibitionActions &&
        info.odrl.prohibitionAssignee === Config.User.IRI &&
        info.odrl.prohibitionActions.includes(ns.odrl.modify.value)) {
      return false;
    }

    return true;
  },

  '#document-do .document-info': ({ info, editorMode }) => {
    //TODO: Consider moving on-slideshow to Config
    if(document.body.classList.contains('on-slideshow')) {
      return false;
    }

    return true;
  },

  '#review-changes .review-changes-save-local': ({ info, online, localhost }) => {
    if (!online && !localhost) return false;

    if (!accessModePossiblyAllowed(null, 'write')) {
      return false;
    }

    if (info.odrl?.prohibitionActions &&
        info.odrl.prohibitionAssignee === Config.User.IRI &&
        info.odrl.prohibitionActions.includes(ns.odrl.modify.value)) {
      return false;
    }

    return true;
  },

  '#review-changes .review-changes-submit': ({ info, online, localhost }) => {
    if (!online && !localhost) return false;

    if (!accessModePossiblyAllowed(null, 'write')) {
      return false;
    }

    if (info.odrl?.prohibitionActions &&
        info.odrl.prohibitionAssignee === Config.User.IRI &&
        info.odrl.prohibitionActions.includes(ns.odrl.modify.value)) {
      return false;
    }

    return true;
  },

  '#document-autosave #autosave-remote': ({ info, online, localhost, documentAction }) => {
    if (documentAction == 'new' || documentAction == 'open')  return false;

    if (!online && !localhost) return false;

    if (!accessModePossiblyAllowed(null, 'write')) {
      return false;
    }

    if (info.odrl?.prohibitionActions &&
        info.odrl.prohibitionAssignee === Config.User.IRI &&
        (info.odrl.prohibitionActions.includes(ns.odrl.derive.value) ||
         info.odrl.prohibitionActions.includes(ns.odrl.reproduce.value))) {
      return false;
    }

    return true;
  },
};


export function buttonShouldBeEnabled(selector, context) {
  const fn = buttonState[selector];

  if (!fn) return true;

  return fn(context);
}

export function updateButtons(selectors) {
  selectors = selectors || Object.keys(buttonState);

  const context = {
    info: Config.Resource[Config.DocumentURL],
    authenticated: Config['Session']?.isActive,
    online: navigator.onLine,
    localhost: isLocalhost(Config.DocumentURL),
    editorMode: DO.Editor.mode,
    documentAction: Config.DocumentAction
  }

  selectors.forEach(selector => {
    const node = document.querySelector(selector);

    if (!node) {
      // console.warn(`Button with selector "${selector}" not found.`);
      return;
    }
    const buttonEnabled = buttonShouldBeEnabled(selector, context);
    // console.log(node)
    // console.log("Button state for", selector, "should be", buttonEnabled ? "enabled" : "disabled");
    node.disabled = !buttonEnabled;
  });
}
