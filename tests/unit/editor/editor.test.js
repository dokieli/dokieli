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

  it('should inject expected HTML structure into body', () => {
    editor.setTemplateNew('author', { template: 'new' });
    const h1 = document.querySelector('h1');
    const p = document.querySelector('p');

    expect(h1).not.toBeNull();
    expect(p).not.toBeNull();
    expect(h1.getAttribute('data-placeholder')).toBe(editor.placeholder.h1);
    expect(p.getAttribute('data-placeholder')).toBe(editor.placeholder.p);
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
