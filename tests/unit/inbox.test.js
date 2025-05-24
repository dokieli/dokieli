import { sendNotifications } from 'src/inbox.js';  
import { setupMockFetch, resetMockFetch } from '../utils/mockFetch';  
import Config from '../../src/config';
import { Session } from "@uvdsl/solid-oidc-client-browser";
import MockGrapoi from '../utils/mockGrapoi';

Config['Session'] = new Session();

describe('sendNotifications', () => {
  beforeEach(() => {
    resetMockFetch();
  });

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