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

import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  showAnnotation,
  registerEncryptionUnlockHandler,
  clearPendingEncryptedQueues,
  processPendingEncryptedNotes
} from '../../src/activity.js';
import Config from '../../src/config.js';
import MockGrapoi from '../utils/mockGrapoi.js';

const state = vi.hoisted(() => ({ unlocked: false, decrypt: vi.fn() }));

vi.mock('src/keystore.js', () => ({
  isUnlocked: () => state.unlocked,
  decryptWithSession: state.decrypt,
  hasKeystore: vi.fn(async () => true),
  createKeystore: vi.fn(),
  unlockKeystore: vi.fn(),
  lockKeystore: vi.fn(),
  publishPublicKeyToProfile: vi.fn(),
  getSessionKid: vi.fn(() => null),
  getSessionPublicKey: vi.fn(() => null),
  getSessionPublicKeyJWK: vi.fn(() => null),
  getSessionPrivateKey: vi.fn(() => null),
}));

const JWE = 'eyJhbGciOiJFQ0RILUVTIiwiZW5jIjoiQTI1NkdDTSJ9..aXY.Y2lwaGVydGV4dA.dGFn';

function makeNoteGraph(noteIRIs) {
  const t = (s, p, o) => ({ subject: { value: s }, predicate: { value: p }, object: { value: o } });
  const triples = noteIRIs.flatMap(iri => [
    t(iri, Config.ns.rdf.type.value, Config.ns.oa.Annotation.value),
    t(iri, Config.ns.oa.hasBody.value, iri + '#body'),
    t(iri + '#body', Config.ns.rdf.value.value, JWE)
  ]);
  return new MockGrapoi(triples);
}

beforeEach(() => {
  state.unlocked = false;
  state.decrypt.mockReset();
  clearPendingEncryptedQueues();
});

describe('pending encrypted annotation queue', () => {
  test('queues an encrypted annotation while locked and fires the handler on registration', async () => {
    const noteIRI = 'https://example.org/annotation/1';
    await showAnnotation(noteIRI, makeNoteGraph([noteIRI]), {});

    expect(state.decrypt).not.toHaveBeenCalled();

    const handler = vi.fn();
    registerEncryptionUnlockHandler(handler);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('does not fire the handler when nothing is pending', () => {
    const handler = vi.fn();
    registerEncryptionUnlockHandler(handler);
    expect(handler).not.toHaveBeenCalled();
  });

  test('deduplicates queued annotations by noteIRI', async () => {
    const noteIRI = 'https://example.org/annotation/1';
    const g = makeNoteGraph([noteIRI]);
    await showAnnotation(noteIRI, g, {});
    await showAnnotation(noteIRI, g, {});

    state.unlocked = true;
    state.decrypt.mockResolvedValue('plain text');
    await processPendingEncryptedNotes();

    expect(state.decrypt).toHaveBeenCalledTimes(1);
    expect(state.decrypt).toHaveBeenCalledWith(JWE);
  });

  test('clearPendingEncryptedQueues drops pending annotations', async () => {
    const noteIRI = 'https://example.org/annotation/1';
    await showAnnotation(noteIRI, makeNoteGraph([noteIRI]), {});
    clearPendingEncryptedQueues();

    state.unlocked = true;
    state.decrypt.mockResolvedValue('plain text');
    await processPendingEncryptedNotes();

    expect(state.decrypt).not.toHaveBeenCalled();
  });

  test('processPendingEncryptedNotes continues after a failing entry', async () => {
    const noteIRIs = ['https://example.org/annotation/1', 'https://example.org/annotation/2'];
    const g = makeNoteGraph(noteIRIs);
    for (const noteIRI of noteIRIs) {
      await showAnnotation(noteIRI, g, {});
    }

    state.unlocked = true;
    state.decrypt.mockRejectedValueOnce(new Error('decrypt failed')).mockResolvedValue('plain text');
    await processPendingEncryptedNotes();

    expect(state.decrypt).toHaveBeenCalledTimes(2);
  });
});
