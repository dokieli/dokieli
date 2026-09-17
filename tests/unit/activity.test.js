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

import { sendNotifications, showActivities, showActivitiesSources, showAnnotation } from 'src/activity.js';
import { setupMockFetch, resetMockFetch } from '../utils/mockFetch';
import Config from '../../src/config';
import MockGrapoi from '../utils/mockGrapoi';

describe('activity read dedup', () => {
  beforeEach(() => {
    resetMockFetch();
    setupMockFetch({});
  });

  // Concurrent reads for the same URL must collapse to one in-flight promise so a
  // document's overlapping scans don't storm the storage server into a 429.
  test('showActivities returns the same in-flight promise for concurrent same-URL calls', () => {
    const url = 'https://example.org/dedup/activity-' + Math.random();
    const a = showActivities(url);
    const b = showActivities(url);
    a.catch(() => {}); b.catch(() => {});
    expect(a).toBe(b);
  });

  test('showActivitiesSources returns the same in-flight promise for concurrent same-URL calls', () => {
    const url = 'https://example.org/dedup/container-' + Math.random();
    const a = showActivitiesSources(url);
    const b = showActivitiesSources(url);
    a.catch(() => {}); b.catch(() => {});
    expect(a).toBe(b);
  });

  test('showAnnotation returns the same in-flight promise for concurrent same-IRI calls', () => {
    const noteIRI = 'https://example.org/dedup/annotation-' + Math.random();
    const g = new MockGrapoi([]);
    const a = showAnnotation(noteIRI, g);
    const b = showAnnotation(noteIRI, g);
    a.catch(() => {}); b.catch(() => {});
    expect(a).toBe(b);
  });

  test('showAnnotation survives an annotation whose inbox notification points back at it', async () => {
    const base = 'https://example.org/cycle-' + Math.random().toString(32).slice(2);
    const inboxIRI = base + '/inbox/';
    const noteIRI = base + '/annotation';
    const notificationIRI = inboxIRI + 'n1';
    const ldpInbox = { value: 'http://www.w3.org/ns/ldp#inbox' };
    const g = new MockGrapoi([
      { subject: { value: noteIRI }, predicate: ldpInbox, object: { value: inboxIRI } }
    ]);
    Config.Inbox[inboxIRI] = { 'Notifications': [notificationIRI] };
    Config.Notification[notificationIRI] = { 'Activities': [noteIRI] };
    Config.Activity[noteIRI] = { 'Graph': g };

    // Runaway recursion shows up as unbounded re-reads of the note from the graph
    let nodeCalls = 0;
    const origNode = g.node.bind(g);
    g.node = subject => { nodeCalls++; return origNode(subject); };

    try {
      await showAnnotation(noteIRI, g).catch(() => {});
      expect(nodeCalls).toBeLessThan(50);
    }
    finally {
      delete Config.Inbox[inboxIRI];
      delete Config.Notification[notificationIRI];
      delete Config.Activity[noteIRI];
    }
  });

  test('distinct URLs are not deduped against each other', () => {
    const a = showActivitiesSources('https://example.org/dedup/c1-' + Math.random());
    const b = showActivitiesSources('https://example.org/dedup/c2-' + Math.random());
    a.catch(() => {}); b.catch(() => {});
    expect(a).not.toBe(b);
  });
});

describe('sendNotifications', () => {
  beforeEach(() => {
    resetMockFetch();
  });

  // TODO: times out
  test.skip('should handle inboxResponse and send notification successfully', async () => {
    const tos = ['https://example.com/inbox', 'https://example.com/inbox1'];
    const note = 'Test notification';
    const iri = 'https://example.com/resource';
    Config.Resource[iri] = {};
    Config.Resource[iri].graph = new MockGrapoi([{ subject: iri }]);
    Config.Resource[iri].rdftype = ['https://schema.org/Article'];
    Config.Resource[iri].license = 'https://creativecommons.org/licenses/by/4.0/';
    Config.Resource[iri].graph.add(iri, 'https://schema.org/Article', iri);
    Config.Resource[iri].graph.add(iri, 'https://creativecommons.org/licenses/by/4.0/', iri);
  
    const shareResource = document.createElement('div');
  
    const wrapper = document.createElement('div'); // parent node
    const toInput = document.createElement('input');
    toInput.setAttribute('id', 'share-resource-to');
    toInput.setAttribute('value', 'https://example.com/inbox');
  
    wrapper.appendChild(toInput);
    shareResource.appendChild(wrapper);
  
    const progress = document.createElement('span');
    progress.classList.add('progress');
    progress.setAttribute('data-to', 'https://example.com/inbox');
  
    progress.setHTMLUnsafe = vi.fn(); 
    const setHTMLUnsafeSpy = vi.spyOn(progress, 'setHTMLUnsafe');
  
    const querySelectorSpy = vi.spyOn(wrapper, 'querySelector');
    querySelectorSpy.mockImplementation((selector) => {
      if (selector === '.progress[data-to="https://example.com/inbox"]') return progress;
      if (selector === '.progress[data-to="https://example.com/inbox1"]') return progress;
      return null;
    });
  
    setupMockFetch({
      'https://example.com/inbox': {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => 'https://example.com/inbox' },
        text: () => 'Notification sent',
      },
      'https://example.com/inbox1': {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => 'https://example.com/inbox1' },
        text: () => 'Notification sent',
      },
    });
  
    await sendNotifications(tos, note, iri, shareResource);
  
    expect(querySelectorSpy).toHaveBeenCalledWith('.progress[data-to="https://example.com/inbox"]');
    expect(querySelectorSpy).toHaveBeenCalledWith('.progress[data-to="https://example.com/inbox1"]');
    expect(setHTMLUnsafeSpy).toHaveBeenCalled();
  });
});