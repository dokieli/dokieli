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

import { describe, it, expect, beforeAll } from 'vitest';
import { domSanitize } from '../../../src/utils/sanitization.js';

// If domSanitize relies on global DOMPurify hooks,
// importing it once is enough to register them.
describe('domSanitize', () => {
  it('handles undefined input', () => {
    let d;
    const out = domSanitize(d);

    expect(out).toBe(undefined);
  });

  it('removes javascript: URLs', () => {
    const html = `<a href="javascript:alert(1)">x</a>`;
    const out = domSanitize(html);

    expect(out).toBe(`<a>x</a>`);
  });

  it('removes vbscript: URLs', () => {
    const html = `<img src="vbscript:msgbox(1)">`;
    const out = domSanitize(html);

    expect(out).toBe(`<img>`);
  });

  it('keeps allowed data: URLs', () => {
    const html = `<img src="data:image/png;base64,AAAA">`;
    const out = domSanitize(html);

    expect(out).toContain(`src="data:image/png;base64,AAAA"`);
  });

  it('removes disallowed data: MIME types', () => {
    const html = `<img src="data:text/html;base64,PHNjcmlwdD4=">`;
    const out = domSanitize(html);

    expect(out).toBe(`<img>`);
  });

  it('sanitizes or removes SVG data URLs', () => {
    const html = `<img src="data:image/svg+xml,<svg onload=alert(1) />">`;
    const out = domSanitize(html);

    expect(
      out === `<img>` ||
      out.includes('data:image/svg+xml')
    ).toBe(true);
  });

  it('does not touch non-URL attributes', () => {
    const html = `<div title="javascript:alert(1)"></div>`;
    const out = domSanitize(html);

    expect(out).toBe(`<div title="javascript:alert(1)"></div>`);
  });

  it('removes not allowed inline scripts', () => {
    const html = `<div><script>console.log("ok")</script></div>`
    const out = domSanitize(html);

    expect(out).toBe(`<div></div>`);
  });

  it('keeps scripts with allowed src URLs', () => {
    const html = `<div><script src="https://www.w3.org/scripts/TR/2021/fixup.js"></script></div>`;
    const out = domSanitize(html);

    expect(out).toBe(html);
  });

  it('removes script src with javascript: URL', () => {
    const html = `<div><script src="javascript:alert(1)"></script></div>`;
    const out = domSanitize(html);

    expect(out).toBe(`<div></div>`);
  });

  it('removes script src with disallowed data MIME type', () => {
    const html = `<div><script src="data:text/javascript,alert(1)"></script></div>`;
    const out = domSanitize(html);

    expect(out).toBe(`<div></div>`);
  });
});
