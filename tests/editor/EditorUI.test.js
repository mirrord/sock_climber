// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditorUI } from '../../src/editor/EditorUI.js';

function makeUI(callbackOverrides = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const callbacks = {
    onTogglePlay:    () => {},
    onExport:        () => {},
    onImport:        () => {},
    onToggleObjects: () => {},
    onResize:        () => {},
    onBackgrounds:   () => {},
    ...callbackOverrides,
  };
  const ui = new EditorUI(container, callbacks, { initialWidth: 20, initialHeight: 15 });
  return { ui, container };
}

describe('EditorUI', () => {
  let ui, container;

  afterEach(() => {
    ui.dispose();
    container.remove();
  });

  it('renders the toolbar inside the container', () => {
    ({ ui, container } = makeUI());
    expect(container.querySelector('#editor-ui')).not.toBeNull();
  });

  it('shows the toolbar by default', () => {
    ({ ui, container } = makeUI());
    const root = container.querySelector('#editor-ui');
    expect(root.style.display).not.toBe('none');
  });

  describe('hide() / show()', () => {
    beforeEach(() => {
      ({ ui, container } = makeUI());
    });

    it('hides the toolbar after hide()', () => {
      ui.hide();
      const root = container.querySelector('#editor-ui');
      expect(root.style.display).toBe('none');
    });

    it('shows the toolbar again after show()', () => {
      ui.hide();
      ui.show();
      const root = container.querySelector('#editor-ui');
      expect(root.style.display).not.toBe('none');
    });

    it('calling hide() twice does not throw', () => {
      expect(() => { ui.hide(); ui.hide(); }).not.toThrow();
    });

    it('calling show() before hide() does not throw', () => {
      expect(() => ui.show()).not.toThrow();
    });
  });

  describe('setMode()', () => {
    beforeEach(() => {
      ({ ui, container } = makeUI());
    });

    it('updates mode label to PLAY when set to play', () => {
      ui.setMode('play');
      expect(container.querySelector('#mode-label').textContent).toBe('PLAY');
    });

    it('updates mode label back to EDIT when set to edit', () => {
      ui.setMode('play');
      ui.setMode('edit');
      expect(container.querySelector('#mode-label').textContent).toBe('EDIT');
    });
  });
});
