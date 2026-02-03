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

import { DOMParser } from 'prosemirror-model';
import { docSelectionToHtml } from '../../../../src/editor/utils/dom.js'; 
import { schema } from '../../../../src/editor/schema/base.js'; 
import { fragmentFromString } from '../../../../src/utils/html.js';

// Note: this function is not actually used anywhere anymore so perhaps we should remove
describe('docSelectionToHtml', () => {
  it('serializes selected content to HTML', () => {
    const dom = document.createElement('div');
    dom.replaceChildren(fragmentFromString('<p>Hello <strong>world</strong>!</p>'));
    const doc = DOMParser.fromSchema(schema).parse(dom);
    const from = 0;
    const to = 12; 
    const html = docSelectionToHtml(doc, from, to);
    expect(html).toContain('<p');
    expect(html).toContain('Hello');
    expect(html).toContain('<strong>world</strong>');
    expect(html).not.toContain('!'); 
    expect(html).toContain('</p>');
  });
});
