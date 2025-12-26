import { accessModePossiblyAllowed } from "../doc.js";
import { Icon} from "./icons.js";
import Config from "../config.js";
import { isLocalhost } from "../uri.js";

const ns = Config.ns;
Config.Button.C
const docsBaseURL = Config.WebExtensionEnabled ? Config.WebExtension.runtime.getURL('docs') : 'https://dokie.li/docs';

export function initButtons() {
  Config.Button = {
    Close: getButtonHTML({ button: 'close', buttonClass: 'close', buttonLabel: 'Close', buttonTitle: 'Close', iconSize: 'fa-2x' }),
    Delete: getButtonHTML({ button: 'delete', buttonClass: 'delete', buttonTitle: 'Delete' }),
    Toggle: getButtonHTML({ button: 'toggle', buttonClass: 'toggle', buttonTitle: 'Show/Hide' }),
    More: getButtonHTML({ button: 'more', buttonClass: 'more', buttonTitle: 'Show more' }),
    Clipboard: getButtonHTML({ button: 'clipboard', buttonClass: 'do copy-to-clipboard', buttonTitle: 'Copy to clipboard' }),
    OpenMenu: getButtonHTML({ button: 'bars', buttonClass: 'show', buttonTitle: 'Open menu' }),
    CloseMenu: getButtonHTML({ button: 'minus', buttonClass: 'hide', buttonTitle: 'Close menu' }),
    Info: {
      Delete: getButtonHTML({ button: 'info', buttonClass: 'info', buttonTitle: 'About Delete', buttonRel: 'rel:help', buttonResource: `${docsBaseURL}#feature-delete` }),
      EmbedData: getButtonHTML({ button: 'info', buttonClass: 'info', buttonTitle: 'About Embed Data', buttonRel: 'rel:help', buttonResource: `${docsBaseURL}#feature-embed-data` }),
      GraphView: getButtonHTML({ button: 'info', buttonClass: 'info', buttonTitle: 'About Graph View', buttonRel: 'rel:help', buttonResource: `${docsBaseURL}#feature-graph-view` }),
      GenerateFeeds: getButtonHTML({ button: 'info', buttonClass: 'info', buttonTitle: 'About Generate Feed', buttonRel: 'rel:help', buttonResource: `${docsBaseURL}#feature-generate-feed` }),
      MessageLog: getButtonHTML({ button: 'info', buttonClass: 'info', buttonTitle: 'About Message Log', buttonRel: 'rel:help', buttonResource: `${docsBaseURL}#feature-message-log` }),
      Notifications: getButtonHTML({ button: 'info', buttonClass: 'info', buttonTitle: 'About Notifications', buttonRel: 'rel:help', buttonResource: `${docsBaseURL}#feature-notifications` }),
      Open: getButtonHTML({ button: 'info', buttonClass: 'info', buttonTitle: 'About Open', buttonRel: 'rel:help', buttonResource: `${docsBaseURL}#feature-open` }),
      Reply: getButtonHTML({ button: 'info', buttonClass: 'info', buttonTitle: 'About Reply', buttonRel: 'rel:help', buttonResource: `${docsBaseURL}#feature-reply` }),
      ReviewChanges: getButtonHTML({ button: 'info', buttonClass: 'info', buttonTitle: 'About Review Changes', buttonRel: 'rel:help', buttonResource: `${docsBaseURL}#feature-review-changes` }),
      RobustLinks: getButtonHTML({ button: 'info', buttonClass: 'info', buttonTitle: 'About Robustify Links', buttonRel: 'rel:help', buttonResource: `${docsBaseURL}#feature-robustify-links` }),
      SaveAs: getButtonHTML({ button: 'info', buttonClass: 'info', buttonTitle: 'About Save As', buttonRel: 'rel:help', buttonResource: `${docsBaseURL}#feature-save-as` }),
      Share: getButtonHTML({ button: 'info', buttonClass: 'info', buttonTitle: 'About Share', buttonRel: 'rel:help', buttonResource: `${docsBaseURL}#feature-share` }),
      SignIn: getButtonHTML({ button: 'info', buttonClass: 'info', buttonTitle: 'About Sign In', buttonRel: 'rel:help', buttonResource: `${docsBaseURL}#feature-sign-in` }),
      Source: getButtonHTML({ button: 'info', buttonClass: 'info', buttonTitle: 'About Source', buttonRel: 'rel:help', buttonResource: `${docsBaseURL}#feature-source` })
    },
    SignIn: getButtonHTML({ button: 'signin', buttonClass: 'signin-user', buttonTitle: 'Sign in to authenticate', buttonTextContent: 'Sign in' }),
    Menu: {
      Delete: getButtonHTML({ button: 'delete', buttonClass: 'resource-delete', buttonTitle: 'Delete article', buttonTextContent: 'Delete', iconSize: 'fa-2x', buttonDisabled: true }),
      DocumentInfo: getButtonHTML({ button: 'document-info', buttonClass: 'document-info', buttonTitle: 'Document info', buttonTextContent: 'Info', iconSize: 'fa-2x', buttonDisabled: true }),
      EditEnable: getButtonHTML({ button: 'cursor', buttonClass: 'editor-enable', buttonTextContent: 'Edit', buttonTitle: 'Enable editor', iconSize: 'fa-2x' }),
      EditDisable: getButtonHTML({ button: 'cursor', buttonClass: 'editor-disable', buttonTextContent: 'Edit', buttonTitle: 'Disable editor', iconSize: 'fa-2x' }),
      EmbedData: getButtonHTML({ button: 'data-meta', buttonClass: 'embed-data-meta', buttonTitle: 'Embed structured data', buttonTextContent: 'Embed Data', iconSize: 'fa-2x' }),
      Export: getButtonHTML({ button: 'export', buttonClass: 'export-as-html', buttonTitle: 'Export and save to file', buttonTextContent: 'Export', iconSize: 'fa-2x' }),
      GenerateFeed: getButtonHTML({ button: 'feed', buttonClass: 'generate-feed', buttonTitle: 'Generate Web feed', buttonTextContent: 'Feed', iconSize: 'fa-2x' }),
      Immutable: getButtonHTML({ button: 'immutable', buttonClass: 'create-immutable', buttonTitle: 'Make this article immutable and version it', buttonTextContent: 'Immutable', iconSize: 'fa-2x', buttonDisabled: true }),
      InternetArchive: getButtonHTML({ button: 'archive', buttonClass: 'snapshot-internet-archive', buttonTitle: 'Capture with Internet Archive', buttonTextContent: 'Archive', iconSize: 'fa-2x' }),
      Open: getButtonHTML({ button: 'open', buttonClass: 'resource-open', buttonTitle: 'Open article', buttonTextContent: 'Open', iconSize: 'fa-2x' }),
      New: getButtonHTML({ button: 'new', buttonClass: 'resource-new', buttonTitle: 'Create new article', buttonTextContent: 'New', iconSize: 'fa-2x' }),
      Notifications: getButtonHTML({ button: 'activities', buttonClass: 'resource-notifications', buttonTitle: 'Show notifications', buttonTextContent: 'Notifications', iconSize: 'fa-2x' }),
      RobustifyLinks: getButtonHTML({ button: 'robustify-links', buttonClass: 'robustify-links', buttonTitle: 'Robustify Links', buttonTextContent: 'Robustify', iconSize: 'fa-2x' }),
      Save: getButtonHTML({ button: 'save', buttonClass: 'resource-save', buttonTitle: 'Save article', buttonTextContent: 'Save', iconSize: 'fa-2x', buttonDisabled: true }),
      SaveAs: getButtonHTML({ button: 'save-as', buttonClass: 'resource-save-as', buttonTitle: 'Save as article', buttonTextContent: 'Save As', iconSize: 'fa-2x' }),
      Share: getButtonHTML({ button: 'share', buttonClass: 'resource-share', buttonTitle: 'Share resource', buttonTextContent: 'Share', iconSize: 'fa-2x' }),
      SignIn: getButtonHTML({ button: 'signin', buttonClass: 'signin-user', buttonTitle: 'Sign in to authenticate', buttonTextContent: 'Sign in', iconSize: 'fa-2x' }),
      SignOut: getButtonHTML({ button: 'signout', buttonClass: 'signout-user' }),
      Source: getButtonHTML({ button: 'source', buttonClass: 'resource-source', buttonTitle: 'Edit article source code', buttonTextContent: 'Source', iconSize: 'fa-2x' }),
      Memento: getButtonHTML({ button: 'memento', buttonClass: 'resource-memento', buttonTitle: 'Memento article', buttonTextContent: 'Memento', iconSize: 'fa-2x', buttonDisabled: true }),
      MessageLog: getButtonHTML({ button: 'messages', buttonClass: 'message-log', buttonTitle: 'Show message log', buttonTextContent: 'Messages', iconSize: 'fa-2x' }),
      Print: getButtonHTML({ button: 'print', buttonClass: 'resource-print', buttonTitle: 'Print document', buttonTextContent: 'Print', iconSize: 'fa-2x' }),
      Reply: getButtonHTML({ button: 'in-reply-to', buttonClass: 'resource-reply', buttonTitle: 'Reply', buttonTextContent: 'Reply', iconSize: 'fa-2x' }),
      Version: getButtonHTML({ button: 'version', buttonClass: 'create-version', buttonTitle: 'Version this article', buttonTextContent: 'Version', iconSize: 'fa-2x', buttonDisabled: true }),
      AIAnalyze: getButtonHTML({ button: 'ai-analyze', buttonClass: 'resource-ai-analyze', buttonTitle: 'Analyze with AI', buttonTextContent: 'AI Analyze', iconSize: 'fa-2x' }),
    }
  }
}

//Given a button action, generates an HTML string for the button including an icon and text.
export function getButtonHTML({
  button,
  buttonClass,
  buttonLabel,
  buttonDisabled,
  buttonRel,
  buttonResource,
  buttonTitle,
  buttonTextContent,
  buttonType,
  iconSize }) {

  if (!button) {
      throw new Error('`button` identifier is required.');
  }

  const titleContent = buttonTitle || buttonIcons[button]?.title || button;
  const title = ` title="${titleContent}"`;
  const textContent = buttonTextContent || buttonIcons[button]?.textContent;
  const label = buttonLabel || titleContent;
  const ariaLabel = (label && !textContent) ? ` aria-label="${label}"` : '';
  const className = buttonClass ? ` class="${buttonClass}"` : '';
  const disabled = buttonDisabled ? ` disabled=""` : '';
  let icon = buttonIcons[button]?.icon;
  const rel = buttonRel ? ` rel="${buttonRel}"` : '';
  const resource = buttonResource ? ` resource="${buttonResource}"` : '';
  const type = buttonType ? ` type="${buttonType}"` : '';

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

  return `<button${ariaLabel}${className}${disabled}${rel}${resource}${title}${type}>${buttonContent}</button>`;
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
  'ai-analyze': {
    title: 'AI Analyze',
    icon: Icon['.fas.fa-robot']
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
