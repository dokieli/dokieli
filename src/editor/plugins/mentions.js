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
import Config from "../../config.js";
import { schema } from "../schema/base.js";
import { getUserContacts, getSubjectInfo } from "../../graph.js";
import { sanitizeInsertAdjacentHTML } from "../../utils/sanitization.js";
import { i18n } from "../../i18n.js";

export const mentionsPluginKey = new PluginKey("mentions");

const MAX_SUGGESTIONS = 20;
const MAX_QUERY_LENGTH = 64;
// Leading `@` only, so mail@example.org is left alone.
const MENTION_RE = /(?:^|[\s(\[{<"'‘“])@([^\s@]*)$/;

const instances = new WeakMap();

let contactsRequest = null;

function fetchContacts() {
  if (contactsRequest) return contactsRequest;
  if (!Config.User.IRI) return Promise.resolve();

  contactsRequest = getUserContacts(Config.User.IRI)
    .then(contacts => {
      // Mixed-content blocks http: contacts on https: pages.
      const pageIsHttps = window.location.protocol === 'https:';
      const filtered = pageIsHttps ? contacts.filter(iri => !iri.toLowerCase().startsWith('http:')) : contacts;

      return Promise.allSettled(filtered.map(iri =>
        getSubjectInfo(iri).then(subject => {
          if (!subject.Graph) return;
          Config.User.Contacts = Config.User.Contacts || {};
          Config.User.Contacts[iri] = subject;
        })
      ));
    })
    .catch(() => {});

  return contactsRequest;
}

function getMentionMatch(state) {
  const { selection } = state;
  if (!selection.empty) return null;

  const { $from } = selection;
  // Inline nodes (anchor, time, span) hold text without being textblocks.
  if (!$from.parent.inlineContent) return null;

  const textBefore = $from.parent.textBetween(0, $from.parentOffset, null, "￼");
  const match = MENTION_RE.exec(textBefore);
  if (!match) return null;

  const query = match[1];
  if (query.length > MAX_QUERY_LENGTH) return null;

  // Text offsets match positions only within one text node.
  const from = $from.pos - query.length - 1;
  if (from < 0 || state.doc.textBetween(from, $from.pos) !== '@' + query) return null;

  return { query, from, to: $from.pos };
}

// A link inside a link is invalid, so a pick made within an `a` lands after it.
function anchorEnd(doc, pos) {
  const $pos = doc.resolve(pos);

  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type.name === 'anchor') return $pos.after(depth);
  }

  return null;
}

function getFilteredContacts(query) {
  const contacts = Config.User.Contacts || {};
  const q = query.toLowerCase();

  return Object.keys(contacts)
    .filter(iri => {
      const contact = contacts[iri];
      return (
        !q.length ||
        iri.toLowerCase().includes(q) ||
        contact.Name?.toLowerCase().includes(q) ||
        contact.IRI?.toLowerCase().includes(q) ||
        contact.URL?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => (contacts[a].Name || a).localeCompare(contacts[b].Name || b))
    .slice(0, MAX_SUGGESTIONS);
}

class MentionsView {
  constructor(editorView) {
    this.editorView = editorView;
    this.match = null;
    this.items = [];
    this.activeIndex = -1;
    this.dismissedFrom = null;

    // Warm the cache now; the first `@` is too late to wait on the network.
    fetchContacts();

    document.getElementById('editor-mentions')?.remove();

    this.container = document.createElement('div');
    this.container.id = 'editor-mentions';
    this.container.className = 'do autocomplete editor-mentions';
    this.container.setAttribute('contenteditable', 'false');
    this.container.setAttribute('spellcheck', 'false');
    this.container.hidden = true;

    this.suggestions = document.createElement('ul');
    this.suggestions.className = 'suggestions';
    this.suggestions.setAttribute('role', 'listbox');
    this.suggestions.setAttribute('aria-label', i18n.t('editor.mentions.suggestions.aria-label'));
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
    const match = getMentionMatch(this.editorView.state);

    if (!match || !this.editorView.hasFocus()) {
      this.match = null;
      this.dismissedFrom = null;
      this.hide();
      return;
    }

    // Dismissed with Escape: stay closed until the caret leaves this `@`.
    if (this.dismissedFrom === match.from) {
      this.match = match;
      return;
    }

    this.dismissedFrom = null;
    this.match = match;

    if (!Config.User.Contacts || !Object.keys(Config.User.Contacts).length) {
      fetchContacts().then(() => {
        if (this.match && this.match.from === match.from) this.show();
      });
    }

    this.show();
  }

  show() {
    if (!this.match || !this.editorView.hasFocus()) {
      this.hide();
      return;
    }

    const items = getFilteredContacts(this.match.query);

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
    const contacts = Config.User.Contacts || {};
    this.suggestions.replaceChildren();

    this.items.forEach((iri, index) => {
      const contact = contacts[iri];
      const suggestion = document.createElement('li');
      suggestion.setAttribute('role', 'option');
      suggestion.setAttribute('aria-selected', index === this.activeIndex ? 'true' : 'false');
      if (index === this.activeIndex) suggestion.classList.add('active');

      const name = contact.Name || iri;
      let img = contact.Image;
      if (!(img && img.length)) {
        img = Config.IconBase64['.fas.fa-user-secret'];
      }
      img = '<img alt="" height="32" src="' + img + '" width="32" />';

      sanitizeInsertAdjacentHTML(suggestion, 'beforeend', img + '<span title="' + iri + '">' + name + '</span>');

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
    const iri = this.items[index];
    if (!iri || !this.match) return;

    const contact = Config.User.Contacts[iri] || {};
    const { state, dispatch } = this.editorView;
    const { from, to } = this.match;
    // The typed `@query` (from includes the `@`) is replaced by the name alone,
    // like the `/` command behaviour.
    const label = contact.Name || iri;
    const mark = schema.marks.a.create({
      originalAttributes: { href: iri, rel: 'schema:mentions' }
    });

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

    const followedBySpace = tr.doc.textBetween(end, Math.min(end + 1, tr.doc.content.size)) === ' ';
    if (!followedBySpace) tr = tr.insertText(' ', end);
    tr = tr.setSelection(TextSelection.create(tr.doc, end + 1)).setStoredMarks([]);

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

export const mentionsPlugin = new Plugin({
  key: mentionsPluginKey,

  view(editorView) {
    const view = new MentionsView(editorView);
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
