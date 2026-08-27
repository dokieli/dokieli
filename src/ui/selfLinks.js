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

// Anything with an id gets a first-child a.self-link; the glyph is CSS, keyed off the parent.

export const SELF_LINK_CLASS = 'self-link';

// Cannot carry a child, or an anchor would be meaningless.
const SKIP_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param',
  'source', 'track', 'wbr', 'script', 'style', 'template', 'textarea', 'select', 'option',
  'svg', 'math', 'iframe', 'audio', 'video', 'canvas', 'object', 'a', 'button', 'form',
  'html', 'head', 'body', 'title', 'main'
]);

export function canHaveSelfLink(element) {
  if (!element?.id) return false;
  if (SKIP_TAGS.has(element.localName)) return false;
  if (element.classList.contains('do') || element.closest('.do')) return false;
  if (element.closest('#document-menu, #document-editor, .editor-toolbar')) return false;
  return true;
}

// A details hands its anchor to its summary, which has to stay the details' first child.
export function selfLinkHost(element) {
  if (element.localName === 'details') {
    return element.querySelector(':scope > summary') || element;
  }
  return element;
}

// The href always follows the current id.
export function applySelfLink(element) {
  if (!canHaveSelfLink(element)) return null;

  const href = `#${element.id}`;
  const host = selfLinkHost(element);

  const existing = host.querySelector(`:scope > a.${SELF_LINK_CLASS}`);
  if (existing) {
    existing.setAttribute('href', href);
    if (existing !== host.firstElementChild) host.prepend(existing);
    return existing;
  }

  const a = host.ownerDocument.createElement('a');
  a.className = SELF_LINK_CLASS;
  a.setAttribute('href', href);
  host.prepend(a);
  return a;
}

export function applySelfLinks(root) {
  if (!root) return;
  if (root.id && canHaveSelfLink(root)) applySelfLink(root);
  root.querySelectorAll('[id]').forEach((element) => {
    if (canHaveSelfLink(element)) applySelfLink(element);
  });
}

export function removeSelfLinks(root) {
  root?.querySelectorAll(`a.${SELF_LINK_CLASS}`).forEach(a => a.remove());
}
