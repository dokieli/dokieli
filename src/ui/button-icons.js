import { Icon} from "./icons.js";

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
    title: 'Live long and prosper',
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
  'test-suite': {
    title: 'Test suite',
    icon: Icon[".fas.fa-vial-circle-check"]
  }
}

//Given a button action, generates an HTML string for the button including an icon and text.
export function getButtonHTML({ button, buttonClass, buttonDisabled, buttonRel, buttonResource, buttonTitle, buttonTextContent, buttonType, iconSize }) {
  if (!button) {
    throw new Error('Need to pass button.');
  }

  const className = buttonClass ? ` class="${buttonClass}"` : '';
  const title = ` title="${buttonTitle || buttonIcons[button]?.title || button }"`;
  const disabled = buttonDisabled ? ` disabled=""` : '';
  const type = buttonType ? ` type="${buttonType}"` : '';
  const textContent = buttonTextContent || buttonIcons[button]?.textContent;
  let icon = buttonIcons[button]?.icon;
  const rel = buttonRel ? ` rel="${buttonRel}"` : '';
  const resource = buttonResource ? ` resource="${buttonResource}"` : '';

  if (iconSize) {
    let parser = new DOMParser();
    let doc = parser.parseFromString(icon, 'image/svg+xml');
    let svgElement = doc.querySelector('svg');
    svgElement.classList.add(iconSize);
    icon = new XMLSerializer().serializeToString(svgElement);
  }

  const buttonContent = (!icon && !textContent) ? button : `${icon ? icon : ''} ${textContent ? `<span>${textContent}</span>` : ''}`;

  return `<button${className}${disabled}${rel}${resource}${title}${type}>${buttonContent}</button>`;
}