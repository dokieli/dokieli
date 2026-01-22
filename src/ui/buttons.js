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

import { accessModePossiblyAllowed } from "../doc.js";
import { Icon} from "./icons.js";
import Config from "../config.js";
import { isLocalhost } from "../uri.js";
import { i18n } from "../i18n.js";

const ns = Config.ns;
Config.Button.C
const docsBaseURL = Config.WebExtensionEnabled ? Config.WebExtension.runtime.getURL('docs') : 'https://dokie.li/docs';

// function getButtonTextContent(key, buttonTextContent) {
//   const textContentTranslation = i18n.t(key);
//   const textContentStr = textContentTranslation.includes(key) ? buttonTextContent : textContentTranslation;
//   return textContentStr;
// }

export function initButtons() {
  Config.Button = {
    Close: getButtonHTML({ key: "close.button", button: "close", buttonClass: "close", iconSize: "fa-2x" }),
    Clipboard: getButtonHTML({ key: "clipboard.button", button: "clipboard", buttonClass: "do copy-to-clipboard" }),
    Annotations: {
      Delete: getButtonHTML({ key: "annotations.delete.button", button: "delete", buttonClass: "delete" }),
    },
    Notifications: {
      More: getButtonHTML({ key: "panel.notifications.more.button", button: "more", buttonClass: "more" }),
    },
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
    SignIn: getButtonHTML({ key: "menu.signin.button", button: "signin", buttonClass: "signin-user" }),
    Menu: {
      CloseMenu: getButtonHTML({ key: "menu.close.button", button: "minus", buttonClass: "hide" }),
      Delete: getButtonHTML({ key: "menu.delete.button", button: "delete", buttonClass: "resource-delete", iconSize: "fa-2x", buttonDisabled: true }),
      DocumentInfo: getButtonHTML({ key: "menu.document-info.button", button: "document-info", buttonClass: "document-info", iconSize: "fa-2x", buttonDisabled: true }),
      EditEnable: getButtonHTML({ key: "menu.edit-enable.button", button: "cursor", buttonClass: "editor-enable", iconSize: "fa-2x" }),
      EditDisable: getButtonHTML({ key: "menu.edit-disable.button", button: "cursor", buttonClass: "editor-disable", iconSize: "fa-2x" }),
      EmbedData: getButtonHTML({ key: "menu.embed-data.button", button: "data-meta", buttonClass: "embed-data-meta", iconSize: "fa-2x" }),
      Export: getButtonHTML({ key: "menu.export.button", button: "export", buttonClass: "export-as-html", iconSize: "fa-2x" }),
      GenerateFeed: getButtonHTML({ key: "menu.feed.button", button: "feed", buttonClass: "generate-feed", iconSize: "fa-2x" }),
      Immutable: getButtonHTML({ key: "menu.immutable.button", button: "immutable", buttonClass: "create-immutable", iconSize: "fa-2x", buttonDisabled: true }),
      InternetArchive: getButtonHTML({ key: "menu.archive.button", button: "archive", buttonClass: "snapshot-internet-archive", iconSize: "fa-2x" }),
      New: getButtonHTML({ key: "menu.new.button", button: "new", buttonClass: "resource-new", iconSize: "fa-2x" }),
      Notifications: getButtonHTML({ key: "menu.notifications.button", button: "activities", buttonClass: "resource-notifications", iconSize: "fa-2x" }),
      Open: getButtonHTML({ key: "menu.resource-open.button", button: "open", buttonClass: "resource-open", iconSize: "fa-2x" }),
      OpenMenu: getButtonHTML({ key: "menu.open.button", button: "bars", buttonClass: "show" }),
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
  const titleContent = i18n.t(`${key}.title`) === `${key}.title` ? button : i18n.t(`${key}.title`);
  const title = ` title="${titleContent}"`;
  // const textContent = buttonTextContent || buttonIcons[button]?.textContent;
  let textContent = i18n.t(`${key}.textContent`) === `${key}.textContent` ? null : i18n.t(`${key}.textContent`);
  //Override textContent, useful for non-translations
  textContent = buttonIcons[button].textContent ? buttonIcons[button].textContent : textContent;
  // const label = buttonLabel || titleContent;
  const label = i18n.t(`${key}.aria-label`) === `${key}.aria-label` ? null : i18n.t(`${key}.aria-label`);
  const ariaLabel = (label && !textContent) ? ` aria-label="${label}"` : '';

  const className = buttonClass ? ` class="${buttonClass}"` : '';
  const disabled = buttonDisabled ? ` disabled=""` : '';
  let icon = buttonIcons[button]?.icon;
  let buttonDir = buttonIcons[button]?.dir;
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

  buttonDir = buttonDir ? ` dir="${buttonDir}"` : '';

  return `<button${ariaLabel}${dataI18n}${className}${disabled}${rel}${resource}${title}${type}${buttonDir}>${buttonContent}</button>`;
}


export const buttonIcons = {
  p: {
    icon: Icon['.fas.fa-paragraph']
  },
  em: {
    icon: Icon['.fas.fa-italic']
  },
  strong: {
    icon: Icon['.fas.fa-bold']
  },
  ol: {
    icon: Icon['.fas.fa-link-ol']
  },
  ul: {
    icon: Icon['.fas.fa-link-ul']
  },
  ...['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].reduce((acc, heading) => {
    acc[heading] = {
      title: `heading level ${heading[1]}`,
      icon: `${Icon['.fas.fa-header']}`,
      textContent: heading[1],
      dir: "ltr"
    };
    return acc;
  }, {}),
  a: {
    icon: Icon['.fas.fa-link']
  },
  citation: {
    icon: Icon['.fas.fa-hashtag']
  },
  //TODO: Change annotate or note's icon
  comment: {
    icon: Icon['.fas.fa-comment']
  },
  note: {
    icon: Icon['.fas.fa-sticky-note']
  },
  requirement: {
    icon: Icon['.fas.fa-microchip']
  },
  semantics: {
    icon: Icon['.fas.fa-rocket']
  },
  sparkline: {
    icon: Icon['.fas.fa-chart-line']
  },
  img: {
    icon: Icon['.fas.fa-image']
  },
  pre: {
    icon: Icon['.fas.fa-terminal']
  },
  code: {
    icon: Icon['.fas.fa-code']
  },
  blockquote: {
    icon: Icon['.fas.fa-angle-right']
  },
  q: {
    icon: Icon['.fas.fa-quote-right']
  },
  math: {
    icon: Icon['.fas.fa-calculator']
  },

  highlight: {
    icon: Icon['.fas.fa-anchor']
  },
  bookmark: {
    icon: Icon['.fas.fa-bookmark']
  },
  share: {
    icon: Icon['.fas.fa-bullhorn']
  },
  approve: {
    icon: Icon['.fas.fa-thumbs-up']
  },
  disapprove: {
    icon: Icon['.fas.fa-thumbs-down']
  },
  specificity: {
    icon: Icon['.fas.fa-crosshairs']
  },
  close: {
    icon: Icon['.fas.fa-times']
  },
  submit: {
    icon: Icon['.fas.fa-check']
  },
  cancel: {
    icon: Icon['.fas.fa-times']
  },
  delete: {
    icon: Icon['.fas.fa-trash-alt']
  },
  toggle: {
    icon: Icon['.fas.fa-angle-right']
  },
  more: {
    icon: Icon['.fas.fa-rotate']
  },
  cursor: {
    icon: Icon['.fas.fa-i-cursor']
  }, 
  signout: {
    icon: Icon['.far.fa-spock-hand']
  },
  signin: {
    icon: Icon['.fas.fa-user-astronaut']
  },
  license: {
    icon: Icon['.fas.fa-certificate']
  },
  lang: {
    icon: Icon['.fas.fa-language']
  },
  language: {
    icon: Icon['.fas.fa-language']
  },
  'resource-type': {
    icon: Icon['.fas.fa-shape']
  },
  inbox: {
    icon: Icon['.fas.fa-inbox']
  },
  'in-reply-to': {
    icon: Icon['.fas.fa-reply']
  },
  'publication-status': {
    icon: Icon['.fas.fa-timeline']
  },
  activities: {
    icon: Icon['.fas.fa-bolt']
  },
  new: {
    icon: Icon['.far.fa-lightbulb']
  },
  open: {
    icon: Icon['.fas.fa-coffee']
  },
  save: {
    icon: Icon['.fas.fa-life-ring']
  },
  'save-as': {
    icon: Icon['.far.fa-paper-plane']
  },
  messages: {
    icon: Icon['.fas.fa-scroll']
  },
  print: {
    icon: Icon[".fas.fa-print"] 
  },
  'data-meta': {
    icon: Icon [".fas.fa-table"]
  },
  table: {
    icon: Icon [".fas.fa-table"]
  },
  source: {
    icon: Icon[".fas.fa-code"] 
  },
  memento: {
    icon: Icon[".far.fa-clock"] 
  },
  version: {
    icon: Icon[".fas.fa-code-branch"]
  },
  immutable: {
    icon: Icon[".far.fa-snowflake"] 
  },
  'robustify-links': {
    icon: Icon[".fas.fa-link"]
  },
  archive: {
    icon: Icon[".fas.fa-archive"]
  },
  feed: {
    icon: Icon[".fas.fa-rss"] 
  },
  export: {
    icon: Icon[".fas.fa-external-link-alt"]
  },
  cursor: {
    icon: Icon[".fas.fa-i-cursor"]
  },
  'local-storage': {
    icon: Icon[".fas.fa-database"]
  },
  info: {
    icon: Icon[".fas.fa-circle-info"]
  },
  success: {
    icon: Icon[".fas.fa-check"]
  },
  error: {
    icon: Icon[".fas.fa-triangle-exclamation"]
  },
  warning: {
    icon: Icon[".fas.fa-circle-exclamation"]
  },
  'test-suite': {
    icon: Icon[".fas.fa-vial-circle-check"]
  },
  clipboard: {
    icon: Icon[".fas.fa-copy"]
  },
  bars: {
    icon: Icon[".fas.fa-bars"]
  },
  minus: {
    icon: Icon[".fas.fa-minus"]
  },
  'review-changes': {
    icon: Icon[".fas.fa-microscope"]
  },
  'document-info': {
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
