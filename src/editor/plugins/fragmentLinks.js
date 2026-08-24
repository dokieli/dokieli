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

import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import { schema } from "../schema/base.js";
import { sanitizeInsertAdjacentHTML, htmlEncode } from "../../utils/sanitization.js";
import { i18n } from "../../i18n.js";

export const fragmentLinksPluginKey = new PluginKey("fragmentLinks");

const MAX_SUGGESTIONS = 20;
const MAX_QUERY_LENGTH = 64;
// Leading `#` only, so `page#section` in a URL is left alone.
const FRAGMENT_RE = /(?:^|[\s(\[{<"'‘“])#([^\s#]*)$/;

const instances = new WeakMap();

export function getFragmentMatch(state) {
  const { selection } = state;
  if (!selection.empty) return null;

  const { $from } = selection;
  // Inline nodes (anchor, time, span) hold text without being textblocks.
  if (!$from.parent.inlineContent) return null;

  const textBefore = $from.parent.textBetween(0, $from.parentOffset, null, "￼");
  const match = FRAGMENT_RE.exec(textBefore);
  if (!match) return null;

  const query = match[1];
  if (query.length > MAX_QUERY_LENGTH) return null;

  // Text offsets match positions only within one text node.
  const from = $from.pos - query.length - 1;
  if (from < 0 || state.doc.textBetween(from, $from.pos) !== '#' + query) return null;

  return { query, from, to: $from.pos };
}

// A hint of what the id names: its heading, else its leading text.
function labelForNode(node) {
  if (!node) return '';

  let heading = null;
  node.descendants((child) => {
    if (heading) return false;
    if (child.type.name === 'heading') heading = child.textContent.trim();
    return !heading;
  });

  return (heading || node.textContent.trim()).slice(0, 60);
}

// dokieli's own widgets carry the do class; their ids are chrome, not content.
function isDokieliChrome(attrs) {
  return (attrs?.class || '').split(/\s+/).includes('do');
}

function collectDocumentIds(doc) {
  const items = [];
  const seen = new Set();

  const push = (id, node) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    items.push({ id, label: labelForNode(node), typeOf: node?.attrs?.originalAttributes?.typeof || '' });
  };

  doc.descendants((node) => {
    if (isDokieliChrome(node.attrs?.originalAttributes)) return false;

    push(node.attrs?.originalAttributes?.id, node);
    (node.marks || []).forEach((mark) => {
      if (!isDokieliChrome(mark.attrs?.originalAttributes)) push(mark.attrs?.originalAttributes?.id, null);
    });
    return true;
  });

  return items;
}

// A link inside a link is invalid, so a pick made within an `a` lands after it.
function anchorEnd(doc, pos) {
  const $pos = doc.resolve(pos);

  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type.name === 'anchor') return $pos.after(depth);
  }

  return null;
}

// Earliest match position wins, then the ids in order.
export function filteredIds(doc, query) {
  const q = query.toLowerCase();

  return collectDocumentIds(doc)
    .map((item) => ({ item, index: item.id.toLowerCase().indexOf(q) }))
    .filter(({ index }) => index >= 0)
    .sort((a, b) => (a.index - b.index) || a.item.id.localeCompare(b.item.id))
    .map(({ item }) => item)
    .slice(0, MAX_SUGGESTIONS);
}

class FragmentLinksView {
  constructor(editorView) {
    this.editorView = editorView;
    this.match = null;
    this.items = [];
    this.activeIndex = -1;
    this.dismissedFrom = null;

    document.getElementById('editor-fragment-links')?.remove();

    this.container = document.createElement('div');
    this.container.id = 'editor-fragment-links';
    this.container.className = 'do autocomplete editor-mentions';
    this.container.setAttribute('contenteditable', 'false');
    this.container.setAttribute('spellcheck', 'false');
    this.container.hidden = true;

    this.suggestions = document.createElement('ul');
    this.suggestions.className = 'suggestions';
    this.suggestions.setAttribute('role', 'listbox');
    this.suggestions.setAttribute('aria-label', i18n.t('editor.fragment-links.suggestions.aria-label'));
    this.container.appendChild(this.suggestions);
    document.body.appendChild(this.container);

    // Editor clicks are left to update(), which reads the new selection.
    this.documentClickHandler = (e) => {
      if (this.container.contains(e.target) || this.editorView.dom.contains(e.target)) return;
      this.hide();
    };
    this.repositionHandler = () => { if (!this.container.hidden) this.position(); };

    document.addEventListener('click', this.documentClickHandler);
    window.addEventListener('scroll', this.repositionHandler, true);
    window.addEventListener('resize', this.repositionHandler);
  }

  get isOpen() {
    return !this.container.hidden && this.items.length > 0;
  }

  update() {
    const match = getFragmentMatch(this.editorView.state);

    if (!match || !this.editorView.hasFocus()) {
      this.match = null;
      this.dismissedFrom = null;
      this.hide();
      return;
    }

    // Dismissed with Escape: stay closed until the caret leaves this `#`.
    if (this.dismissedFrom === match.from) {
      this.match = match;
      return;
    }

    this.dismissedFrom = null;
    this.match = match;
    this.show();
  }

  show() {
    if (!this.match || !this.editorView.hasFocus()) {
      this.hide();
      return;
    }

    const items = filteredIds(this.editorView.state.doc, this.match.query);

    // No match: it's free text.
    if (!items.length) {
      this.hide();
      return;
    }

    this.items = items;
    this.activeIndex = 0;
    this.render();
    this.container.hidden = false;
    this.position();
  }

  render() {
    this.suggestions.replaceChildren();

    this.items.forEach((item, index) => {
      const suggestion = document.createElement('li');
      suggestion.setAttribute('role', 'option');
      suggestion.setAttribute('aria-selected', index === this.activeIndex ? 'true' : 'false');
      if (index === this.activeIndex) suggestion.classList.add('active');

      sanitizeInsertAdjacentHTML(suggestion, 'beforeend',
        `<span class="term-curie"${item.typeOf ? ` title="${htmlEncode(item.typeOf, { mode: 'attribute', attributeName: 'title' })}"` : ''}>#${htmlEncode(item.id)}</span>`
        + (item.label ? `<span class="term-label">${htmlEncode(item.label)}</span>` : ''));

      suggestion.addEventListener('mouseover', () => this.setActive(index));
      // mousedown keeps the editor selection.
      suggestion.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.select(index);
      });

      this.suggestions.appendChild(suggestion);
    });
  }

  setActive(index) {
    this.activeIndex = index;
    Array.from(this.suggestions.children).forEach((li, i) => {
      li.classList.toggle('active', i === index);
      li.setAttribute('aria-selected', i === index ? 'true' : 'false');
    });
    this.suggestions.children[index]?.scrollIntoView({ block: 'nearest' });
  }

  move(step) {
    if (!this.items.length) return;
    this.setActive((this.activeIndex + step + this.items.length) % this.items.length);
  }

  position() {
    const coords = this.editorView.coordsAtPos(this.match.from);
    this.container.style.left = `${coords.left + window.scrollX}px`;
    this.container.style.top = `${coords.bottom + window.scrollY}px`;
  }

  select(index) {
    const item = this.items[index];
    if (!item || !this.match) return;

    const { state, dispatch } = this.editorView;
    const { from, to } = this.match;
    const label = `#${item.id}`;
    const mark = schema.marks.a.create({ originalAttributes: { href: `#${item.id}` } });

    const outside = anchorEnd(state.doc, from);
    let tr = state.tr;
    let end;

    if (outside === null) {
      tr = tr.replaceWith(from, to, schema.text(label, [mark]));
      end = from + label.length;
    }
    else {
      tr = tr.delete(from, to);
      const at = tr.mapping.map(outside);
      tr = tr.insert(at, schema.text(label, [mark]));
      end = at + label.length;
    }

    tr = tr.setStoredMarks([]);
    tr.setSelection(TextSelection.create(tr.doc, end));

    // The inserted text still reads as a trigger; a pick dismisses this `#`.
    this.dismissedFrom = from;
    this.hide();
    dispatch(tr.scrollIntoView());
    this.editorView.focus();
  }

  dismiss() {
    this.dismissedFrom = this.match?.from ?? null;
    this.hide();
  }

  hide() {
    this.container.hidden = true;
    this.suggestions.replaceChildren();
    this.items = [];
    this.activeIndex = -1;
  }

  destroy() {
    instances.delete(this.editorView);
    document.removeEventListener('click', this.documentClickHandler);
    window.removeEventListener('scroll', this.repositionHandler, true);
    window.removeEventListener('resize', this.repositionHandler);
    this.container.remove();
  }
}

export const fragmentLinksPlugin = new Plugin({
  key: fragmentLinksPluginKey,

  view(editorView) {
    const view = new FragmentLinksView(editorView);
    instances.set(editorView, view);
    return view;
  },

  props: {
    handleKeyDown(editorView, event) {
      const view = instances.get(editorView);
      if (!view || !view.isOpen) return false;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          view.move(1);
          return true;
        case 'ArrowUp':
          event.preventDefault();
          view.move(-1);
          return true;
        case 'Enter':
        case 'Tab':
          if (view.activeIndex < 0) return false;
          event.preventDefault();
          view.select(view.activeIndex);
          return true;
        case 'Escape':
          event.preventDefault();
          view.dismiss();
          return true;
        default:
          return false;
      }
    }
  }
});
