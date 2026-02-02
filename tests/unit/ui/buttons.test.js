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

import { getButtonHTML, buttonIcons } from 'src/ui/buttons.js'; 

describe('getButtonHTML', () => {
  beforeEach(() => {
    // mock SVG for all icons to avoid testing actual markup
    Object.keys(buttonIcons).forEach(key => {
      buttonIcons[key].icon = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h24v24H0z"/></svg>';
    });
  });

  it('throws an error if no button is provided', () => {
    expect(() => getButtonHTML({})).toThrow('`button` identifier is required.');
  });

  it('generates button HTML with icon and default title', () => {
    const html = getButtonHTML({ button: 'p' });
    expect(html).toContain('<button');
    expect(html).toContain('title="paragraph"');
    expect(html).toContain('<svg');
  });

  it('uses custom title and class', () => {
    const html = getButtonHTML({
      button: 'p',
      buttonTitle: 'Custom Title',
      buttonClass: 'btn-custom'
    });
    expect(html).toContain('title="Custom Title"');
    expect(html).toContain('class="btn-custom"');
  });

  it('adds textContent if available', () => {
    const html = getButtonHTML({ button: 'h2' });
    expect(html).toContain('<span>2</span>');
  });

  it('adds type and disabled attributes', () => {
    const html = getButtonHTML({
      button: 'p',
      buttonType: 'submit',
      buttonDisabled: true
    });
    expect(html).toContain('type="submit"');
    expect(html).toContain('disabled');
  });

  it('adds iconSize class to SVG if specified', () => {
    const html = getButtonHTML({
      button: 'p',
      iconSize: 'icon-small'
    });
    expect(html).toContain('class="icon-small"');
  });

  it('returns button with only icon and no text if no textContent', () => {
    buttonIcons['test-icon-only'] = {
      title: 'test icon',
      icon: '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
    };
    const html = getButtonHTML({ button: 'test-icon-only' });
    expect(html).toContain('<svg');
    expect(html).not.toContain('<span>');
  });

  it('uses fallback button name if no icon or textContent', () => {
    buttonIcons['fallback-test'] = { title: 'Fallback', icon: null };
    const html = getButtonHTML({ button: 'fallback-test' });
    expect(html).toContain('>fallback-test<');
  });

  it("should have aria-label if there is button label", () => {
    buttonIcons['aria-test-with-text'] = {
      title: 'ARIA Test',
      icon: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    }
    const html = getButtonHTML({ button: 'aria-test-with-text', buttonLabel: 'TestLabel' });
    expect(html).toContain('aria-label="TestLabel');

  })

  it("should have aria-label if no button label or text content", () => {
    buttonIcons['aria-test'] = {
      title: 'ARIA Test',
      icon: '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
    }
    const html = getButtonHTML({ button: 'aria-test' });
    expect(html).toContain('aria-label="ARIA Test');
  })

  it("should not have aria-label if there is text content", () => {
    buttonIcons['aria-test-with-text'] = {
      title: 'ARIA Test',
      icon: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      textContent: 'Test'
    }
    const html = getButtonHTML({ button: 'aria-test-with-text' });
    expect(html).not.toContain('aria-label');
  })

  it("should use text content if both text content and button label are available", () => {
    buttonIcons['aria-test-with-text'] = {
      title: 'ARIA Test',
      icon: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      textContent: 'Test Text Content',
    }
    const html = getButtonHTML({ button: 'aria-test-with-text', buttonLabel: 'TestLabel' });
    expect(html).not.toContain('TestLabel');
    expect(html).toContain('Test Text Content');

  })

});
