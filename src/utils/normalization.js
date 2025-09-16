import Config from '../config.js'
import { getFragmentOfNodesChildren } from "../doc.js";

export function normalizeHTML(node, options) {
  options = {
    ...Config.DOMProcessing,
    ...options
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

  // 'removeComments': true
  if (options.removeCommentNodes) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_COMMENT);
    let current;

    while ((current = walker.nextNode())) {
      current.remove();
    }
  }

  // 'removeNodesWithSelector': ['#id1', '.class', 'script']
  if (options.removeNodesWithSelector?.length) {
    const scriptsSelectors = [];

    if (options.allowedScripts) {
      for (const script of options.allowedScripts) {
        if (Object.hasOwnProperty.call(options.allowedScripts, script)) {
          const selectors = options.allowedScripts[script]?.removeNode;

          if (selectors?.length) {
            scriptsSelectors.push(...selectors);
          }
        }
      }
    }

    const allSelectors = options.removeNodesWithSelector.concat(scriptsSelectors);

    if (allSelectors.length > 0) {
      const nodesToRemove = node.querySelectorAll(allSelectors.join(', '));

      for (const n of nodesToRemove) {
        n.remove();
      }
    }
  }

  // 'removeClassValues': ['classX'],
  if (options.removeClassValues && options.removeClassValues.length) {
    const values = options.removeClassValues;

    const selector = values.map(value => `.${value}`).join(', ');
    const nodesWithClassValue = node.querySelectorAll(selector);
  
    nodesWithClassValue.forEach(n => {
      values.forEach(value => n.classList.remove(value));
    });
  }

  // 'removeWrapper': [{
  //   'wrapperSelector': '.do.ref',
  //   'contentSelector': 'mark'
  // }],

  if (options.removeWrapper && options.removeWrapper.length) {
    options.removeWrapper.forEach(({ wrapperSelector, contentSelector }) => {
      const wrapperNodes = node.querySelectorAll(wrapperSelector);
  
      wrapperNodes.forEach(wrapperNode => {
        // if (contentSelector) {
          const contentNode = wrapperNode.querySelector(contentSelector);
    
          if (contentNode) {
            node.replaceChild(...contentNode.childNodes, wrapperNode);
          }
        // }
        // else {
        //   node.replaceChild(...wrapperNode.childNodes, wrapperNode);
        // }
      });
    });
  }

  return node;
}

export function cleanProseMirrorOutput(node) {
  let newContent = node;

  let element = document.createElement('div');

  if (newContent instanceof Document) {
    element = newContent.documentElement;
  } else {
    element.appendChild(newContent.cloneNode(true));
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
  
  // Remove the trailing breaks that ProseMirror adds for empty nodes
  element.querySelectorAll('.ProseMirror-trailingBreak').forEach(node => node.remove());

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

  return getFragmentOfNodesChildren(element);
}
