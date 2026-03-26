import { fragmentFromString } from '../utils/html.js';
import { sanitizeInsertAdjacentHTML } from '../utils/sanitization.js';

const BANNER_ID = 'document-collab-session';

let awarenessHandler = null;
let boundProvider = null;

export function showCollabBanner({ provider, onDiscard }) {
  if (document.getElementById(BANNER_ID)) return; // already shown

  boundProvider = provider;

  document.body.prepend(fragmentFromString(`
    <aside aria-labelledby="document-collab-session-label" class="do on" id="${BANNER_ID}" role="alert">
      <h2 id="document-collab-session-label">Collaborative session</h2>
      <p id="document-collab-session-status"></p>
      <menu>
        <li><button type="button" id="document-collab-session-discard">Discard changes</button></li>
        <li><button type="button" id="document-collab-session-dismiss">Keep changes</button></li>
      </menu>
    </aside>
  `));

  function updateStatus() {
    const statusEl = document.getElementById('document-collab-session-status');
    if (!statusEl) return;
    const others = provider.awareness.getStates().size - 1;
    statusEl.textContent = others > 0
      ? `${others} other collaborator${others === 1 ? '' : 's'} connected — this session has unsaved changes.`
      : 'This document has unsaved changes from a previous collaborative session.';
  }

  awarenessHandler = updateStatus;
  provider.awareness.on('change', awarenessHandler);
  updateStatus();

  document.getElementById('document-collab-session-discard')
    ?.addEventListener('click', () => {
      onDiscard();
      hideCollabBanner();
    });

  document.getElementById('document-collab-session-dismiss')
    ?.addEventListener('click', hideCollabBanner);
}

export function hideCollabBanner() {
  if (awarenessHandler && boundProvider) {
    boundProvider.awareness.off('change', awarenessHandler);
    awarenessHandler = null;
    boundProvider = null;
  }
  document.getElementById(BANNER_ID)?.remove();
}
