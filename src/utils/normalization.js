import Config from '../config.js'
import { getFragmentOfNodesChildren } from "../doc.js";
import { removeNodesWithSelector, removeClassValues } from './html.js';

export function normalizeHTML(node, options) {
  options = {
    ...Config.DOMProcessing,
    ...options
  }

  // 'removeCommentNodes': false
  if (options.removeCommentNodes) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_COMMENT);
    let current;

    while ((current = walker.nextNode())) {
      current.remove();
    }
  }

//http://localhost:3000/test.linked-research-decentralised-web

  // 'removeWrapper': [{
  //   'wrapperSelector': '.do.ref',
  //   'contentSelector': 'mark'
  // }],
  if (options.removeWrapper && options.removeWrapper.length) {
    options.removeWrapper.forEach(({ wrapperSelector, contentSelector }) => {
// console.log(wrapperSelector) //.do.ref
// console.log(contentSelector) //mark
      const wrapperNodes = node.querySelectorAll(wrapperSelector);
// console.log(wrapperNodes) // NodeList [] .. why?
// console.log(node.querySelectorAll('.do')); // NodeList [] .. why?
// console.log(node.querySelectorAll('.ref'));// NodeList [] .. why?

      wrapperNodes.forEach(wrapperNode => {
        const contentNode = wrapperNode.querySelector(contentSelector);
        if (contentNode) {
          while (contentNode.firstChild) {
            wrapperNode.parentNode.insertBefore(contentNode.firstChild, wrapperNode);
          }
          wrapperNode.parentNode.removeChild(wrapperNode);
        }
      });
    });
  }

  // 'removeNodesWithSelector': ['#id1', '.class', 'script']
  if (options.removeNodesWithSelector?.length) {
    const selectors = options.removeNodesWithSelector;

    if (selectors.length > 0) {
      removeNodesWithSelector(node, selectors);
    }
  }

  // 'removeAttributes': ['contenteditable', 'data-placeholder', 'draggable', 'spellcheck', 'style']
  if (options.removeAttributes && options.removeAttributes.length) {
    const attrs = options.removeAttributes;
    const selector = attrs.map(attr => `[${attr}]`).join(', ');
    const nodesWithAttributes = node.querySelectorAll(selector);

    nodesWithAttributes.forEach(n => {
      attrs.forEach((attr => {
        n.removeAttribute(attr);
      }));
    });
  }

  // 'removeClassValues': ['classX'],
  if (options.removeClassValues && options.removeClassValues.length) {
    const values = options.removeClassValues;

    const selector = values.map(value => `.${value}`).join(', ');
    node = removeClassValues(node, selector, values);
  }

  if (options.allowedScripts) {
    Object.entries(options.allowedScripts).forEach(([script, domNormalization]) => {
      const nodesWithSelectors = domNormalization?.removeNodesWithSelector;
      const classValues = domNormalization?.removeClassValues;

      if (Array.isArray(nodesWithSelectors) && nodesWithSelectors.length) {
        node = removeNodesWithSelector(node, nodesWithSelectors);
      }

      if (Array.isArray(classValues) && classValues.length) {
        const selector = classValues.map(value => `.${value}`).join(', ');
        node = removeClassValues(node, selector, classValues);
      }

    });
  }

  //Removes p with only whitespace child node or no child node.
  node.querySelectorAll('p').forEach(p => {
    const onlyWhitespaceTextNodes = [...p.childNodes].every(node =>
      node.nodeType === Node.TEXT_NODE && !node.textContent.trim()
    );

    if (onlyWhitespaceTextNodes) {
      p.remove();
    }
  });

  return node;
}

export function cleanProseMirrorOutput(node) {
  let newContent = node;

  let element = document.createElement('div');

  if (newContent instanceof Document) {
    element = newContent.documentElement;
  } else {
    const clone = newContent.cloneNode(true);
    element.append(...clone.childNodes); 
  }

  const tags = ['li', 'dd', 'figcaption', 'td', 'th', 'video', 'audio', 'button', 'select', 'textarea'];

  tags.forEach(tag => {
    element.querySelectorAll(tag).forEach(el => {
      if (el.children.length === 1 && el.firstElementChild.tagName.toLowerCase() === 'p') {
        const p = el.firstElementChild;
        // Move all children of <p> to <li>/<dd>
        while (p.firstChild) el.insertBefore(p.firstChild, p);
        p.remove(); // remove the now-empty <p>
      }
    });
  });

    //Remove any trailing whitespace-only text nodes inside <p>
    element.querySelectorAll('p').forEach(p => {
      const last = p.lastChild;
      if (last && last.nodeType === Node.TEXT_NODE && !last.textContent.trim()) {
        p.removeChild(last);
      }
    });

  // Remove the trailing breaks that ProseMirror adds for empty nodes
  element.querySelectorAll('.ProseMirror-trailingBreak').forEach(node => node.remove());

  //Remove any trailing whitespace-only text nodes inside <pre>
  element.querySelectorAll('pre').forEach(pre => {
    const last = pre.lastChild;
    if (last && last.nodeType === Node.TEXT_NODE && !last.textContent.trim()) {
      pre.removeChild(last);
    }
  });

  //Remove ProseMirror wrap
  let pmNode = element.querySelector('.ProseMirror');

  if (pmNode && pmNode.parentNode) {
    // console.log(pmNode.parentNode.outerHTML + '<--pmNode.parentNode.outerHTML THERE SHOULD BE NO LINE BREAK BEFORE THIS-->');
    pmNode.parentNode.replaceChild(getFragmentOfNodesChildren(pmNode), pmNode);
    // let temp = element.querySelector('html');
    // console.log(temp.outerHTML + '<--pmNode.parentNode.outerHTML THERE SHOULD BE NO LINE BREAK BEFORE THIS-->');
  }

  element.querySelectorAll('a').forEach(a => {
    const next = a.nextElementSibling;
    if (!next) return;

    if (
      next.tagName.toLowerCase() === 'span' &&
      next.childElementCount === 1 &&
      next.firstElementChild.tagName.toLowerCase() === 'a'
    ) {
      const innerA = next.firstElementChild;

      const sameHref = a.getAttribute('href') === innerA.getAttribute('href');
      const sameTitle = a.getAttribute('title') === innerA.getAttribute('title');

      if (sameHref && sameTitle) {
        const newSpan = document.createElement('span');

        while (innerA.firstChild) {
          newSpan.appendChild(innerA.firstChild);
        }

        a.appendChild(newSpan);

        next.remove();
      }
    }
  });

  // remove empty <p>

  return getFragmentOfNodesChildren(element);
}
