import { injectMenuStyles } from './menuStyles.js';

/**
 * Settings screen — placeholder for future settings.
 */
export class SettingsScreen {
  /**
   * @param {HTMLElement} container
   * @param {object} callbacks — { onBack }
   */
  constructor(container, callbacks) {
    this._container = container;
    this._callbacks = callbacks;
    this._root = null;
    injectMenuStyles();
  }

  enter() {
    this._root = document.createElement('div');
    this._root.className = 'puppets-overlay';
    this._root.innerHTML = `
      <div class="panel">
        <h2>Settings</h2>
        <div class="setting-row">
          <span class="setting-label">Sound</span>
          <span class="setting-value">Coming soon</span>
        </div>
        <div class="setting-row">
          <span class="setting-label">Music</span>
          <span class="setting-value">Coming soon</span>
        </div>
        <div class="setting-row">
          <span class="setting-label">Controls</span>
          <span class="setting-value">Coming soon</span>
        </div>
        <div class="setting-row">
          <span class="setting-label">Graphics</span>
          <span class="setting-value">Coming soon</span>
        </div>
      </div>
      <button class="back-btn" data-back>← Back</button>
    `;

    this._root.addEventListener('click', (e) => {
      if (e.target.closest('[data-back]')) {
        this._callbacks.onBack();
      }
    });

    this._container.appendChild(this._root);
  }

  exit() {
    if (this._root) {
      this._root.remove();
      this._root = null;
    }
  }
}
