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

import { Editor } from 'src/editor/editor.js';
import Config from 'src/config.js';
window.DO = { Editor }

describe('Editor.setTemplateNew', () => {
  let editor;

  beforeEach(() => {
    document.body.innerHTML = '<head><title>Old</title></head><body><div id="document-menu"></div></body>';
    editor = new Editor('author', document.body);
  });

  it('should replace document title with "Untitled"', () => {
    editor.setTemplateNew('author', { template: 'new' });
    expect(document.title).toBe('Untitled');
  });

  // Placeholder text is a decoration now (placeholderPlugin), not an attribute
  // baked into the template.
  it('should inject expected HTML structure into body', () => {
    editor.setTemplateNew('author', { template: 'new' });
    const h1 = document.querySelector('main > article > h1');
    const description = document.querySelector('main > article > div[property="schema:description"]');

    expect(h1).not.toBeNull();
    expect(h1.getAttribute('property')).toBe('schema:name');
    expect(h1.textContent).toBe('');

    expect(description).not.toBeNull();
    expect(description.getAttribute('datatype')).toBe('rdf:HTML');
    expect(description.querySelector('p')).not.toBeNull();
  });
});

describe('Editor.toggleEditor', () => {
  let editor;

  beforeEach(() => {
    document.body.innerHTML = '<body><main><article><h1>Test</h1></article></main></body>';
    editor = new Editor();
    vi.spyOn(editor, 'init').mockImplementation(() => {});
    vi.spyOn(editor, 'showEditorModeActionMessage').mockImplementation(() => {});
  });

  it('should call init and update Config.EditorEnabled', () => {
    editor.toggleEditor('author', {}, {});
    expect(editor.init).toHaveBeenCalled();
    expect(editor.showEditorModeActionMessage).toHaveBeenCalled();
    expect(Config.EditorEnabled).toBe(true);
  });
});
