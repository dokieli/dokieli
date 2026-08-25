import { describe, it, expect, beforeAll } from 'vitest';
import { upgradeSpecificationDlEntries } from '../../src/ui/templates/specification.js';

beforeAll(() => {
  if (!globalThis.CSS?.escape) globalThis.CSS = { ...globalThis.CSS, escape: (s) => s.replace(/[^a-zA-Z0-9_-]/g, '\\$&') };
});

function specDoc(dlHTML) {
  document.body.innerHTML = `<main><article typeof="doap:Specification">
    <section id="classes-of-products"><dl>${dlHTML}</dl></section>
  </article></main>`;
  return document;
}

describe('specification concept dt/dd upgrade', () => {
  it('gives a freshly authored entry its own id, distinct from the dfn wrapping it', () => {
    specDoc('<dt>Client</dt><dd>Requests a resource.</dd>');
    upgradeSpecificationDlEntries(document);

    const dt = document.querySelector('dt');
    expect(dt.id).toBe('Client');
    expect(dt.getAttribute('about')).toBe('#Client');
    expect(dt.getAttribute('typeof')).toBe('skos:Concept');
    expect(dt.querySelector('dfn').hasAttribute('id')).toBe(false);
    expect(dt.querySelector('dfn').textContent).toBe('Client');

    const dd = document.querySelector('dd');
    expect(dd.getAttribute('about')).toBe('#Client');
    expect(dd.getAttribute('property')).toBe('skos:definition');
  });

  it('backfills the id on an entry already upgraded before this fix, moving it off the dfn', () => {
    specDoc('<dt about="#Client" property="skos:prefLabel" typeof="skos:Concept"><dfn id="Client">Client</dfn></dt><dd about="#Client" property="skos:definition">Requests a resource.</dd>');
    upgradeSpecificationDlEntries(document);

    const dt = document.querySelector('dt');
    expect(dt.id).toBe('Client');
    expect(dt.querySelector('dfn').hasAttribute('id')).toBe(false);
  });

  it('leaves an entry alone once it already carries its own id', () => {
    specDoc('<dt id="Client" about="#Client" property="skos:prefLabel" typeof="skos:Concept"><dfn>Client</dfn></dt><dd about="#Client" property="skos:definition">Requests a resource.</dd>');
    upgradeSpecificationDlEntries(document);

    expect(document.querySelectorAll('dt')).toHaveLength(1);
    expect(document.querySelector('dt').id).toBe('Client');
  });
});
