import { injectMenuStyles } from './menuStyles.js';

/**
 * Level select screen — lists saved levels and allows playing or deleting them.
 */
export class LevelSelectScreen {
  /**
   * @param {HTMLElement} container
   * @param {import('../level/LevelStore.js').LevelStore} levelStore
   * @param {object} callbacks — { onPlay, onBack }
   */
  constructor(container, levelStore, callbacks) {
    this._container = container;
    this._store = levelStore;
    this._callbacks = callbacks;
    this._root = null;
    injectMenuStyles();
  }

  enter() {
    this._root = document.createElement('div');
    this._root.className = 'puppets-overlay';
    this._render();
    this._container.appendChild(this._root);
  }

  exit() {
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
        <div class="level-item">
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
        return;
      }
      if (e.target.closest('[data-back]')) {
        this._callbacks.onBack();
      }
    });
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
