import { injectMenuStyles } from './menuStyles.js';
import { MenuNavigator } from './MenuNavigator.js';

/**
 * Level select screen — lists saved levels and allows playing or deleting them.
 */
export class LevelSelectScreen {
  /**
   * @param {HTMLElement} container
   * @param {import('../level/LevelStore.js').LevelStore} levelStore
   * @param {object} callbacks — { onPlay, onBack }
   * @param {object} [options]
   * @param {import('../input/InputSystem.js').InputSystem} [options.inputSystem]
   */
  constructor(container, levelStore, callbacks, options = {}) {
    this._container = container;
    this._store = levelStore;
    this._callbacks = callbacks;
    this._inputSystem = options.inputSystem ?? null;
    this._root = null;
    this._navigator = null;
    injectMenuStyles();
  }

  enter() {
    this._root = document.createElement('div');
    this._root.className = 'sock_climber-overlay';
    this._render();
    this._container.appendChild(this._root);

    // Set up gamepad navigation
    if (this._inputSystem) {
      this._navigator = new MenuNavigator(this._inputSystem, { mode: 'vertical', wrap: true });
      this._updateFocusables();
      this._navigator.start();
    }
  }

  exit() {
    if (this._navigator) {
      this._navigator.dispose();
      this._navigator = null;
    }
    if (this._root) {
      this._root.remove();
      this._root = null;
    }
  }

  _render() {
    const names = this._store.list();
    let itemsHTML;
    if (names.length === 0) {
      itemsHTML = '<div class="empty-msg">No saved levels yet.<br>Build one in the Level Builder!</div>';
    } else {
      itemsHTML = names.map((name) => `
        <div class="level-item" tabindex="0">
          <span class="name">${this._escapeHTML(name)}</span>
          <button data-play="${this._escapeAttr(name)}">Play</button>
          <button class="danger" data-delete="${this._escapeAttr(name)}">Delete</button>
        </div>
      `).join('');
    }

    this._root.innerHTML = `
      <div class="panel">
        <h2>Level Select</h2>
        ${itemsHTML}
      </div>
      <button class="back-btn" data-back>← Back</button>
    `;

    this._root.addEventListener('click', (e) => {
      const playBtn = e.target.closest('[data-play]');
      if (playBtn) {
        this._callbacks.onPlay(playBtn.dataset.play);
        return;
      }
      const delBtn = e.target.closest('[data-delete]');
      if (delBtn) {
        this._store.delete(delBtn.dataset.delete);
        this._render();
        // Update focusables after re-render
        if (this._navigator) {
          this._updateFocusables();
        }
        return;
      }
      const levelItem = e.target.closest('.level-item');
      if (levelItem) {
        // Clicking the level item itself plays it
        const playBtn = levelItem.querySelector('[data-play]');
        if (playBtn) {
          this._callbacks.onPlay(playBtn.dataset.play);
        }
        return;
      }
      if (e.target.closest('[data-back]')) {
        this._callbacks.onBack();
      }
    });
  }

  _updateFocusables() {
    if (!this._navigator) return;
    const levelItems = Array.from(this._root.querySelectorAll('.level-item'));
    const backBtn = this._root.querySelector('[data-back]');
    const focusables = [...levelItems, backBtn];
    this._navigator.setFocusables(focusables);
  }

  _escapeHTML(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  _escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }
}
