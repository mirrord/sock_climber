import { EditorApp } from '../editor/EditorApp.js';

/**
 * Wraps EditorApp as a screen, with lifecycle and back-to-menu support.
 */
export class LevelBuilderScreen {
  /**
   * @param {HTMLElement} container
   * @param {import('../level/LevelStore.js').LevelStore} levelStore
   * @param {object} callbacks — { onBack }
   */
  constructor(container, levelStore, callbacks) {
    this._container = container;
    this._store = levelStore;
    this._callbacks = callbacks;
    this._editorApp = null;
    this._topBar = null;
    this._onKeyDown = null;
  }

  enter() {
    // Top-left overlay bar for save + back-to-menu
    this._topBar = document.createElement('div');
    this._topBar.id = 'level-builder-bar';
    this._topBar.innerHTML = `
      <style>
        #level-builder-bar {
          position: fixed; top: 0; right: 0; z-index: 15;
          display: flex; gap: 6px; padding: 8px;
          font-family: monospace; font-size: 13px;
          align-items: center;
        }
        #level-builder-bar button {
          background: #2a2a4a; color: #eee; border: 1px solid #555;
          padding: 4px 10px; cursor: pointer; font-family: inherit; font-size: 13px;
          border-radius: 3px;
        }
        #level-builder-bar button:hover { background: #3a3a6a; }
        #level-builder-bar input {
          background: #1a1a3a; color: #eee; border: 1px solid #444;
          padding: 4px 6px; font-family: inherit; font-size: 13px; width: 140px;
        }
      </style>
      <input id="lb-level-name" placeholder="Level name" value="untitled" />
      <button id="lb-save">Save Level</button>
      <button id="lb-menu" title="Escape">Menu</button>
    `;
    document.body.appendChild(this._topBar);

    this._topBar.querySelector('#lb-save').addEventListener('click', () => {
      this._saveLevel();
    });
    this._topBar.querySelector('#lb-menu').addEventListener('click', () => {
      this._callbacks.onBack();
    });

    // Escape key to return to menu
    this._onKeyDown = (e) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        this._callbacks.onBack();
      }
    };
    window.addEventListener('keydown', this._onKeyDown);

    // Create the editor
    this._editorApp = new EditorApp(this._container);
  }

  exit() {
    if (this._onKeyDown) {
      window.removeEventListener('keydown', this._onKeyDown);
      this._onKeyDown = null;
    }
    if (this._editorApp) {
      this._editorApp.dispose();
      this._editorApp = null;
    }
    if (this._topBar) {
      this._topBar.remove();
      this._topBar = null;
    }
  }

  _saveLevel() {
    const nameInput = this._topBar.querySelector('#lb-level-name');
    const name = nameInput.value.trim() || 'untitled';
    const editor = this._editorApp._editor; // access internal LevelEditor
    this._store.save(name, editor.level);
  }
}
