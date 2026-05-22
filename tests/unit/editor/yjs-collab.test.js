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

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { IDBFactory } from 'fake-indexeddb';
import { prosemirrorToYDoc } from 'y-prosemirror';
import { DOMParser as PMDOMParser } from 'prosemirror-model';
import { schema } from 'src/editor/schema/base.js';
import { getYjsVersionsFromIDB } from 'src/editor/editor.js';

// Mirror updates between two Y.Docs, simulating a network connection. Can be disconnected to simulate offline edits, then reconnected to sync up.
function pipe(a, b) {
  let connected = true;
  const onA = (update, origin) => { if (connected && origin !== b) Y.applyUpdate(b, update, a); };
  const onB = (update, origin) => { if (connected && origin !== a) Y.applyUpdate(a, update, b); };
  a.on('update', onA);
  b.on('update', onB);
  return {
    disconnect() { connected = false; },
    reconnect() {
      connected = true;
      Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), a);
      Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), b);
    },
    destroy() { a.off('update', onA); b.off('update', onB); },
  };
}

// Wipe IDB so room state doesn't leak between tests.
function resetIDB() {
  globalThis.indexedDB = new IDBFactory();
}

describe('Yjs two-doc convergence (no network)', () => {
  let docA, docB, link;

  beforeEach(() => {
    docA = new Y.Doc();
    docB = new Y.Doc();
    link = pipe(docA, docB);
  });

  afterEach(() => {
    link.destroy();
    docA.destroy();
    docB.destroy();
  });

  test('edits on doc A propagate to doc B', () => {
    const textA = docA.getText('t');
    textA.insert(0, 'hello');
    expect(docB.getText('t').toString()).toBe('hello');
  });

  test('concurrent edits while offline converge after reconnect', () => {
    const textA = docA.getText('t');
    textA.insert(0, 'shared');
    expect(docB.getText('t').toString()).toBe('shared');

    link.disconnect();
    docA.getText('t').insert(6, ' from A');
    docB.getText('t').insert(6, ' from B');
    expect(docA.getText('t').toString()).not.toBe(docB.getText('t').toString());

    link.reconnect();
    expect(docA.getText('t').toString()).toBe(docB.getText('t').toString());
  });

  test('late joiner receives full state on reconnect', () => {
    docA.getText('t').insert(0, 'preexisting');
    link.disconnect();

    const docC = new Y.Doc();
    const c = pipe(docA, docC);
    Y.applyUpdate(docC, Y.encodeStateAsUpdate(docA));
    expect(docC.getText('t').toString()).toBe('preexisting');

    c.destroy();
    docC.destroy();
  });
});

describe('y-prosemirror seeds Y.XmlFragment from a ProseMirror doc', () => {
  test('prosemirrorToYDoc produces an XmlFragment that mirrors the source', () => {
    const html = '<p>hello <strong>world</strong></p>';
    const tmpl = document.implementation.createHTMLDocument('');
    tmpl.body.innerHTML = html;
    const pmDoc = PMDOMParser.fromSchema(schema).parse(tmpl.body);

    const seeded = prosemirrorToYDoc(pmDoc);
    const frag = seeded.getXmlFragment('prosemirror');
    expect(frag.length).toBeGreaterThan(0);

    const fresh = new Y.Doc();
    Y.applyUpdate(fresh, Y.encodeStateAsUpdate(seeded));
    expect(fresh.getXmlFragment('prosemirror').toString())
      .toBe(frag.toString());
  });
});

// Mirrors addYjsVersion
describe('Versions Y.Map semantics', () => {
  const VERSIONS_MAP = 'versions';
  const MAX = 20;

  function addVersion(ydoc, key, payload) {
    const map = ydoc.getMap(VERSIONS_MAP);
    ydoc.transact(() => {
      map.set(key, payload);
      ydoc.getMap('meta').set('currentVersionKey', key);
      if (map.size > MAX) {
        const sorted = Array.from(map.keys()).sort();
        for (let i = 0; i < map.size - MAX; i++) map.delete(sorted[i]);
      }
    });
  }

  function readVersions(ydoc) {
    return Array.from(ydoc.getMap(VERSIONS_MAP).entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([, v]) => v);
  }

  test('versions are returned newest first', () => {
    const ydoc = new Y.Doc();
    addVersion(ydoc, '2026-01-01T00:00:00Z', { label: 'oldest' });
    addVersion(ydoc, '2026-03-01T00:00:00Z', { label: 'middle' });
    addVersion(ydoc, '2026-05-01T00:00:00Z', { label: 'newest' });

    const versions = readVersions(ydoc);
    expect(versions.map(v => v.label)).toEqual(['newest', 'middle', 'oldest']);
  });

  test('drops oldest entries past MAX_VERSIONS (20)', () => {
    const ydoc = new Y.Doc();
    for (let i = 0; i < 25; i++) {
      const key = `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`;
      addVersion(ydoc, key, { i });
    }
    const versions = readVersions(ydoc);
    expect(versions).toHaveLength(MAX);
    expect(versions[0].i).toBe(24);
    expect(versions[versions.length - 1].i).toBe(5);
  });

  test('version updates propagate over the two-doc pipe', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    const link = pipe(a, b);

    addVersion(a, '2026-05-22T10:00:00Z', { label: 'from A' });
    expect(b.getMap('versions').get('2026-05-22T10:00:00Z')).toEqual({ label: 'from A' });

    addVersion(b, '2026-05-22T11:00:00Z', { label: 'from B' });
    expect(a.getMap('versions').get('2026-05-22T11:00:00Z')).toEqual({ label: 'from B' });

    link.destroy();
    a.destroy();
    b.destroy();
  });
});

describe('IndexeddbPersistence (fake-indexeddb)', () => {
  beforeEach(() => { resetIDB(); });

  test('state written by one doc is loaded by a fresh doc with the same room', async () => {
    const room = 'test-room-' + Math.random().toString(36).slice(2);

    const writer = new Y.Doc();
    const writerIDB = new IndexeddbPersistence(room, writer);
    await writerIDB.whenSynced;
    writer.getText('t').insert(0, 'persisted');
    await new Promise(r => setTimeout(r, 50)); // flush IDB write
    await writerIDB.destroy();
    writer.destroy();

    const reader = new Y.Doc();
    const readerIDB = new IndexeddbPersistence(room, reader);
    await readerIDB.whenSynced;
    expect(reader.getText('t').toString()).toBe('persisted');
    await readerIDB.destroy();
    reader.destroy();
  });

  test('getYjsVersionsFromIDB reads versions written by another doc on the same room', async () => {
    // Room key derives from window.location (set by vitest.setup.js).
    const room = encodeURIComponent('https://example.com/');

    const writer = new Y.Doc();
    const writerIDB = new IndexeddbPersistence(room, writer);
    await writerIDB.whenSynced;

    const versions = writer.getMap('versions');
    writer.transact(() => {
      versions.set('2026-05-22T09:00:00Z', { label: 'v1' });
      versions.set('2026-05-22T10:00:00Z', { label: 'v2' });
    });
    await new Promise(r => setTimeout(r, 50));
    await writerIDB.destroy();
    writer.destroy();

    const result = await getYjsVersionsFromIDB({});
    expect(result.map(v => v.label)).toEqual(['v2', 'v1']);
  });
});
