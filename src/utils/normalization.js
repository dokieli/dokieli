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

import { DOMParser, DOMSerializer } from 'prosemirror-model';
import Config from '../config.js';
import { schema } from '../editor/schema/base.js';
import { removeNodesWithSelector, removeClassValues, formatHTML, getFragmentOfNodesChildren } from './html.js';

export function normalizeForDiff(node) {
  const doc = DOMParser.fromSchema(schema).parse(node);

  let fragment = DOMSerializer.fromSchema(schema).serializeFragment(doc.content);

  const container = document.createElement('div');
  container.appendChild(fragment);

  const cleaned = cleanProseMirrorOutput(container);

  const wrapper = document.createElement('div');
  wrapper.appendChild(cleaned);

  const normalizedNode = normalizeHTML(wrapper);

  const formattedHTML = formatHTML(normalizedNode);

  return formattedHTML;
}


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
  //Removes text nodes that are only newlines/indentation inside dd and li.
  ['dd', 'li', 'ul', 'ol'].forEach(tag => {
    node.querySelectorAll(tag).forEach(el => {
      [...el.childNodes].forEach(child => {
        if (
          child.nodeType === Node.TEXT_NODE &&
          /^[ \t\r\n]*[\r\n]+[ \t\r\n]*$/.test(child.textContent)
        ) {
          // Remove text nodes that are only newlines/indentation
          el.removeChild(child);
        }
      });
    });
  });

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

  // remove empty <li> and <dd> elements that get added because of preserving whitespace somehow
  element.querySelectorAll('li, dd').forEach(el => {
    const hasMeaningfulContent = [...el.childNodes].some(n => {
      if (n.nodeType === Node.TEXT_NODE) return n.textContent.trim().length > 0;
      if (n.nodeType === Node.ELEMENT_NODE) return true;
      return false;
    });
    if (!hasMeaningfulContent) el.remove();
  });

  return getFragmentOfNodesChildren(element);
}

export function normalizeWhitespace(root = document.documentElement) {
  const inlineElements = new Set(Config.DOMProcessing.inlineElements);

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        // reject if this text node is inside one of these
        for (let p = node.parentNode; p; p = p.parentNode) {
          const tag = p.nodeName?.toLowerCase?.();
          if (['pre', 'code', 'samp', 'kbd', 'var', 'textarea', 'style'].includes(tag)) {
            return NodeFilter.FILTER_REJECT;
          }
        }

        const parentTag = node.parentNode?.nodeName?.toLowerCase?.();
        if (['p', 'dd', 'li'].includes(parentTag)) {
          return NodeFilter.FILTER_REJECT;
        }

        if (/[\r\n\t]/.test(node.nodeValue)) {
          return NodeFilter.FILTER_ACCEPT;
        }

        return NodeFilter.FILTER_REJECT;
      }
    }
  );

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  for (const node of nodes) {
    const text = node.nodeValue;
    const collapsed = text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ');

    const parentTag = node.parentNode.nodeName.toLowerCase();

    const prev = node.previousSibling;
    const next = node.nextSibling;

    const prevIsInline = prev && prev.nodeType === 1 && inlineElements.has(prev.nodeName.toLowerCase());
    const nextIsInline = next && next.nodeType === 1 && inlineElements.has(next.nodeName.toLowerCase());

    if (prevIsInline && nextIsInline && parentTag !== 'head') {
      node.nodeValue = ' ';
    } else if (collapsed.trim() === '') {
      node.remove();
    } else {
      node.nodeValue = collapsed;
    }
  }

  return root;
}
