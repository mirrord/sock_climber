import { injectMenuStyles } from './menuStyles.js';
import { MenuNavigator } from './MenuNavigator.js';

/**
 * Main menu screen — the start screen of the game.
 */
export class MainMenuScreen {
  /**
   * @param {HTMLElement} container
   * @param {object} callbacks — { onLevelSelect, onLevelBuilder, onObjectEditor, onSettings }
   * @param {object} [options]
   * @param {boolean} [options.devMode]
   * @param {import('../input/InputSystem.js').InputSystem} [options.inputSystem]
   */
  constructor(container, callbacks, options = {}) {
    this._container = container;
    this._callbacks = callbacks;
    this._devMode = !!options.devMode;
    this._inputSystem = options.inputSystem ?? null;
    this._root = null;
    this._navigator = null;
    injectMenuStyles();
  }

  enter() {
    this._root = document.createElement('div');
    this._root.className = 'sock_climber-overlay';
    const devItems = this._devMode ? `
        <li><button class="menu-btn" data-action="levelBuilder">Level Builder</button></li>
        <li><button class="menu-btn" data-action="objectEditor">Object Editor</button></li>` : '';
    this._root.innerHTML = `
      <h1>PUPPETS</h1>
      <div class="subtitle">a precision platformer</div>
      <ul class="menu-list">
        <li><button class="menu-btn" data-action="levelSelect">Level Select</button></li>
        ${devItems}
        <li><button class="menu-btn" data-action="settings">Settings</button></li>
      </ul>
    `;

    this._root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'levelSelect') this._callbacks.onLevelSelect();
      else if (action === 'levelBuilder') this._callbacks.onLevelBuilder();
      else if (action === 'objectEditor') this._callbacks.onObjectEditor();
      else if (action === 'settings') this._callbacks.onSettings();
    });

    this._container.appendChild(this._root);

    // Set up gamepad navigation
    if (this._inputSystem) {
      this._navigator = new MenuNavigator(this._inputSystem, { mode: 'vertical', wrap: true });
      const buttons = this._root.querySelectorAll('.menu-btn');
      this._navigator.setFocusables(buttons);
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
}
