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

import { describe, it, expect, beforeEach } from 'vitest';
import { updateNanopubAccess } from '../../../../src/editor/toolbar/toolbar.js';

function popup({ store = false, nanopub = true, isPublic = true } = {}) {
  document.body.innerHTML = `<form><fieldset>
    <span class="annotation-location-selection"><ul>
      <li><input type="checkbox" id="note-annotation-location-annotation-store" name="note-annotation-location-annotation-store"${store ? ' checked=""' : ''} /></li>
      <li><input type="checkbox" id="note-annotation-location-nanopub-network" name="note-annotation-location-nanopub-network"${nanopub ? ' checked=""' : ''} /></li>
    </ul></span>
    <div class="editor-form-footer">
      <input type="checkbox" class="editor-form-access" id="note-access-public" name="note-access-public" value="true"${isPublic ? ' checked=""' : ''} />
      <label class="editor-form-access-label" for="note-access-public"></label>
      <button class="editor-form-submit" type="submit">Post</button>
    </div>
  </fieldset></form>`;
  return document.querySelector('fieldset');
}

const access = () => document.querySelector('.editor-form-access');
const store = () => document.querySelector('#note-annotation-location-annotation-store');
const nanopub = () => document.querySelector('#note-annotation-location-nanopub-network');
const warning = () => document.querySelector('.editor-form-nanopub-warning');
const change = (input, checked) => { input.checked = checked; input.dispatchEvent(new Event('change', { bubbles: true })); };

describe('access toggle with the nanopub network', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('stays public, and still submits as public, when the nanopub network is the only storage', () => {
    const fieldset = popup({ nanopub: true, isPublic: false });
    updateNanopubAccess(fieldset);
    expect(access().checked).toBe(true);
    expect(access().getAttribute('aria-disabled')).toBe('true');
    expect(access().disabled).toBe(false);
    expect(new FormData(document.querySelector('form')).get('note-access-public')).toBe('true');
    expect(document.querySelector('.editor-form-access-label').title).toBe('Annotations on the nanopub network are public.');
    expect(warning()).toBeNull();

    // Clicking it doesn't make it private.
    access().click();
    expect(access().checked).toBe(true);
  });

  it('frees the toggle, as it was, once another storage is chosen', () => {
    const fieldset = popup({ nanopub: true, isPublic: false });
    updateNanopubAccess(fieldset);
    change(store(), true);
    expect(access().hasAttribute('aria-disabled')).toBe(false);
    expect(access().checked).toBe(false);
  });

  it('warns when a private annotation also goes to the nanopub network, and not otherwise', () => {
    const fieldset = popup({ store: true, nanopub: true, isPublic: false });
    updateNanopubAccess(fieldset);
    expect(warning()).not.toBeNull();
    expect(warning().textContent).toContain('nanopub network, which is public');
    expect(warning().nextElementSibling.matches('.editor-form-footer')).toBe(true);

    change(access(), true);
    expect(warning()).toBeNull();
    change(access(), false);
    expect(warning()).not.toBeNull();
    change(nanopub(), false);
    expect(warning()).toBeNull();
  });

  it('keeps a locked toggle public after the form is reset', () => {
    const fieldset = popup({ nanopub: true, isPublic: false });
    updateNanopubAccess(fieldset);
    document.querySelector('form').reset();
    expect(access().checked).toBe(false);
    updateNanopubAccess(fieldset);
    expect(access().checked).toBe(true);
  });
});
