import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { DOMParser as PMDOMParser } from 'prosemirror-model';
import { schema } from '../../src/editor/schema/base.js';
import { documentStructurePlugin } from '../../src/editor/plugins/documentStructure.js';
import { autoIdPlugin } from '../../src/editor/plugins/autoId.js';
import { specificationNavDecorationPlugin } from '../../src/editor/plugins/specificationNavDecorations.js';
import { buildSectionsNav } from '../../src/ui/templates/sections.js';
import Config from '../../src/config.js';

const SPEC = `
  <div class="head"><h1>My Spec</h1>
    <details><dl><dt>Type</dt><dd><a href="http://usefulinc.com/ns/doap#Specification" rel="rdf:type">Specification</a></dd></dl></details>
  </div>
  <section id="introduction"><h2>Introduction</h2><div datatype="rdf:HTML" property="schema:description"><p>Body one is here.</p></div></section>
  <section id="conformance"><h2>Conformance</h2><div datatype="rdf:HTML" property="schema:description"><p>Body two is here.</p></div></section>
  <section id="references"><h2>References</h2><div datatype="rdf:HTML" property="schema:description"><p>Body three.</p></div></section>`;

function navDecorations(state) {
  const st = specificationNavDecorationPlugin.getState(state);
  return st?.decorations ? st.decorations.find(0, state.doc.content.size).length : 0;
}

function specState() {
  const dom = document.createElement('div');
  dom.innerHTML = SPEC;
  return EditorState.create({
    schema,
    doc: PMDOMParser.fromSchema(schema).parse(dom),
    plugins: [documentStructurePlugin, autoIdPlugin, specificationNavDecorationPlugin],
  });
}

describe('specification nav widget survives structural edits', () => {
  it('keeps the toc nav after pressing Enter in the middle of a section body', () => {
    let state = specState();
    expect(navDecorations(state)).toBe(1);

    // Caret in the middle section's body paragraph, then split it (what Enter does).
    let bodyPos = null;
    state.doc.descendants((node, pos) => {
      if (bodyPos === null && node.isText && node.text.includes('Body two')) bodyPos = pos + 'Body two'.length;
      return bodyPos === null;
    });

    const tr = state.tr.setSelection(TextSelection.create(state.doc, bodyPos)).split(bodyPos);
    state = state.apply(tr);

    // Before the fix, the widget was dropped by mapping and never rebuilt: count fell to 0.
    expect(navDecorations(state)).toBe(1);
  });

  it('keeps the nav across several consecutive edits', () => {
    let state = specState();
    for (const needle of ['Body one', 'Body three', 'Body two']) {
      let at = null;
      state.doc.descendants((node, pos) => {
        if (at === null && node.isText && node.text.includes(needle)) at = pos + needle.length;
        return at === null;
      });
      state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, at)).split(at));
      expect(navDecorations(state)).toBe(1);
    }
  });
});

describe('template nav gains drag + add-section affordances', () => {
  it('stamps a drag handle + section-index on present sections and appends add-section buttons', () => {
    const prevMode = Config.Editor;
    Config.Editor = { mode: 'author' };
    try {
      const config = {
        templateId: 'demo',
        sections: { intro: {}, method: {} },
        sectionLabel: (t) => t,
        removeLabel: (t) => `Remove ${t}`,
        sectionEntries: () => new Map(),
      };
      const present = new Map([['intro', { id: 'introduction' }]]);
      const nav = buildSectionsNav(config, document.createElement('div'), present);

      const li = nav.querySelector('li.tocline');
      expect(li).not.toBeNull();
      expect(li.dataset.sectionIndex).toBe('0');
      expect(li.querySelector('span.section-drag')?.draggable).toBe(true);
      // The absent section ('method') is offered as an add button, not a list row.
      expect(nav.querySelector('ul.section-adds')).not.toBeNull();
    } finally {
      Config.Editor = prevMode;
    }
  });
});
