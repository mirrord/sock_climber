import { injectMenuStyles } from './menuStyles.js';
import { ACTIONS, ACTION_LABELS, keyCodeLabel, gamepadBindingLabel } from '../input/ActionMap.js';
import { MenuNavigator } from './MenuNavigator.js';

/**
 * Pause menu — an overlay shown on top of the frozen game.
 * Provides Resume, Settings (audio + controls), and Exit to Main Menu.
 */
export class PauseMenuScreen {
  /**
   * @param {HTMLElement} container
   * @param {object} callbacks — { onResume, onMainMenu }
   * @param {object} [options]
   * @param {import('../settings/SettingsStore.js').SettingsStore} [options.settings]
   * @param {import('../input/ActionMap.js').ActionMap} [options.actionMap]
   * @param {import('../input/InputSystem.js').InputSystem} [options.inputSystem]
   * @param {string} [options.exitLabel] — label for the exit button (default: 'Exit to Main Menu')
   */
  constructor(container, callbacks, options = {}) {
    this._container  = container;
    this._callbacks  = callbacks;
    this._settings   = options.settings  ?? null;
    this._actionMap  = options.actionMap ?? null;
    this._inputSystem = options.inputSystem ?? null;
    this._exitLabel  = options.exitLabel  ?? 'Exit to Main Menu';

    this._root       = null;
    this._activeTab  = 'audio';
    this._navigator  = null;

    /** @type {{ action: string, type: 'key'|'gamepad' }|null} */
    this._rebinding  = null;
    this._keyHandler = null;
    this._rafId      = null;

    injectMenuStyles();
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  enter() {
    this._root = document.createElement('div');
    this._root.className = 'pause-overlay';
    this._root.style.cssText = `
      position: fixed; inset: 0; z-index: 200;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      background: rgba(10, 10, 25, 0.82);
      font-family: monospace; color: #eee;
    `;
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
    this._stopRebind();
    if (this._navigator) {
      this._navigator.dispose();
      this._navigator = null;
    }
    if (this._root) {
      this._root.remove();
      this._root = null;
    }
  }

  // ── Rendering ───────────────────────────────────────────────────────────

  _render() {
    this._root.innerHTML = `
      <div style="
        background: #1a1a3a; border: 1px solid #333; border-radius: 6px;
        padding: 28px 32px; width: 360px; max-height: 80vh; overflow-y: auto;
        display: flex; flex-direction: column; gap: 0;
      ">
        <h2 style="font-size:22px; margin:0 0 20px; text-align:center; color:#48bfe3; letter-spacing:4px;">
          PAUSED
        </h2>

        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:20px;">
          <button class="menu-btn" data-action="resume">Resume</button>
          <button class="menu-btn" data-action="mainMenu"
            style="background:#1a1a3a; border-color:#a33; color:#c88;"
          >${this._exitLabel}</button>
        </div>

        <hr style="border:none; border-top:1px solid #2a2a4a; margin:0 0 20px;">

        <div class="settings-tabs" style="display:flex; gap:6px; margin-bottom:14px;">
          <button class="tab-btn${this._activeTab === 'audio'    ? ' active' : ''}" data-tab="audio">Audio</button>
          <button class="tab-btn${this._activeTab === 'controls' ? ' active' : ''}" data-tab="controls">Controls</button>
        </div>

        <div class="settings-content">
          ${this._activeTab === 'audio' ? this._renderAudio() : this._renderControls()}
        </div>
      </div>
    `;
    this._attachListeners();
  }

  _renderAudio() {
    const sfx   = this._settings ? Math.round(this._settings.get('sfxVolume')   * 100) : 100;
    const music = this._settings ? Math.round(this._settings.get('musicVolume') * 100) : 50;
    return `
      <div class="setting-row">
        <span class="setting-label">SFX Volume</span>
        <div class="slider-wrap">
          <input type="range" class="vol-slider" data-vol="sfxVolume"   min="0" max="100" value="${sfx}">
          <span  class="vol-value">${sfx}%</span>
        </div>
      </div>
      <div class="setting-row">
        <span class="setting-label">Music Volume</span>
        <div class="slider-wrap">
          <input type="range" class="vol-slider" data-vol="musicVolume" min="0" max="100" value="${music}">
          <span  class="vol-value">${music}%</span>
        </div>
      </div>
    `;
  }

  _renderControls() {
    if (!this._actionMap) {
      return `<p class="empty-msg">Controls not available.</p>`;
    }

    const rows = ACTIONS.map(action => {
      const keyLabel = keyCodeLabel(this._actionMap.getKeyBinding(action) ?? '');
      const gpLabel  = gamepadBindingLabel(this._actionMap.getGamepadBinding(action));

      const rebindingKey = this._rebinding?.action === action && this._rebinding?.type === 'key';
      const rebindingGp  = this._rebinding?.action === action && this._rebinding?.type === 'gamepad';

      return `
        <tr class="binding-row">
          <td class="action-name">${ACTION_LABELS[action] ?? action}</td>
          <td>
            <button class="bind-btn${rebindingKey ? ' listening' : ''}"
                    data-rebind-key="${action}">
              ${rebindingKey ? 'Press a key…' : keyLabel}
            </button>
          </td>
          <td>
            <button class="bind-btn${rebindingGp ? ' listening' : ''}"
                    data-rebind-gp="${action}">
              ${rebindingGp ? 'Press a button…' : gpLabel}
            </button>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <table class="bindings-table">
        <thead>
          <tr>
            <th class="col-action">Action</th>
            <th class="col-bind">Keyboard</th>
            <th class="col-bind">Gamepad</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="hint-text">Click any binding to rebind. Press Escape to cancel.</p>
    `;
  }

  // ── Event wiring ────────────────────────────────────────────────────────

  _attachListeners() {
    this._root.addEventListener('click', (e) => {
      // Action buttons (Resume / Exit to Main Menu)
      const actionBtn = e.target.closest('[data-action]');
      if (actionBtn) {
        const action = actionBtn.dataset.action;
        if (action === 'resume') {
          this._callbacks.onResume();
          return;
        }
        if (action === 'mainMenu') {
          this._callbacks.onMainMenu();
          return;
        }
      }

      // Tab switch
      const tabBtn = e.target.closest('[data-tab]');
      if (tabBtn) {
        this._stopRebind();
        this._activeTab = tabBtn.dataset.tab;
        this._render();
        // Update focusables after tab change
        if (this._navigator) {
          this._updateFocusables();
        }
        return;
      }

      // Keyboard rebind
      const rebindKeyBtn = e.target.closest('[data-rebind-key]');
      if (rebindKeyBtn) {
        this._startKeyRebind(rebindKeyBtn.dataset.rebindKey);
        return;
      }

      // Gamepad rebind
      const rebindGpBtn = e.target.closest('[data-rebind-gp]');
      if (rebindGpBtn) {
        this._startGamepadRebind(rebindGpBtn.dataset.rebindGp);
        return;
      }

      // Cancel rebind on click outside
      if (this._rebinding) {
        this._stopRebind();
        this._render();
      }
    });

    // Volume sliders — live update without re-rendering
    this._root.addEventListener('input', (e) => {
      const slider = e.target.closest('[data-vol]');
      if (!slider || !this._settings) return;
      const pct = parseInt(slider.value, 10);
      this._settings.set(slider.dataset.vol, pct / 100);
      const display = slider.closest('.slider-wrap')?.querySelector('.vol-value');
      if (display) display.textContent = `${pct}%`;
    });
  }

  // ── Gamepad navigation helpers ──────────────────────────────────────────

  _updateFocusables() {
    if (!this._navigator) return;

    const actionBtns = Array.from(this._root.querySelectorAll('[data-action]'));
    const tabs = Array.from(this._root.querySelectorAll('.tab-btn'));

    if (this._activeTab === 'audio') {
      const sliders = Array.from(this._root.querySelectorAll('.vol-slider'));
      this._navigator.setFocusables([...actionBtns, ...tabs, ...sliders]);
    } else {
      const bindBtns = Array.from(this._root.querySelectorAll('.bind-btn'));
      this._navigator.setFocusables([...actionBtns, ...tabs, ...bindBtns]);
    }
  }

  // ── Rebind flow ─────────────────────────────────────────────────────────

  /**
   * Wait for the next keyboard press and bind it to the given action.
   * @param {string} action
   */
  _startKeyRebind(action) {
    this._stopRebind();
    this._rebinding = { action, type: 'key' };
    this._render();

    this._keyHandler = (e) => {
      e.preventDefault();
      this._stopRebind();
      if (e.code !== 'Escape' && this._actionMap) {
        this._actionMap.setKeyBinding(action, e.code);
      }
      this._render();
    };

    window.addEventListener('keydown', this._keyHandler, { once: true });
  }

  /**
   * Poll for the next gamepad button press and bind it to the given action.
   * @param {string} action
   */
  _startGamepadRebind(action) {
    this._stopRebind();
    this._rebinding = { action, type: 'gamepad' };
    this._render();

    const baseline = this._sampleGamepadButtons();

    const poll = () => {
      if (!this._rebinding) return;

      const current = this._sampleGamepadButtons();
      for (const [gpIndex, buttons] of current.entries()) {
        for (let btnIdx = 0; btnIdx < buttons.length; btnIdx++) {
          const wasPressed = baseline.get(gpIndex)?.[btnIdx] ?? false;
          if (buttons[btnIdx] && !wasPressed) {
            this._stopRebind();
            if (btnIdx !== 8 && this._actionMap) {
              this._actionMap.setGamepadBinding(action, { type: 'button', index: btnIdx });
            }
            this._render();
            return;
          }
        }
      }

      this._rafId = requestAnimationFrame(poll);
    };

    this._rafId = requestAnimationFrame(poll);
  }

  /** @returns {Map<number, boolean[]>} */
  _sampleGamepadButtons() {
    const result = new Map();
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
      return result;
    }
    for (const gp of navigator.getGamepads()) {
      if (!gp) continue;
      result.set(gp.index, Array.from(gp.buttons, b => b.pressed));
    }
    return result;
  }

  /** Cancel any in-progress rebind and clean up listeners / rAF. */
  _stopRebind() {
    if (this._keyHandler) {
      window.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    this._rebinding = null;
  }
}
