import { injectMenuStyles } from './menuStyles.js';
import { ACTIONS, ACTION_LABELS, keyCodeLabel, gamepadBindingLabel } from '../input/ActionMap.js';
import { MenuNavigator } from './MenuNavigator.js';

/**
 * Settings screen — audio volume controls and keyboard/gamepad remapping.
 */
export class SettingsScreen {
  /**
   * @param {HTMLElement} container
   * @param {object} callbacks — { onBack }
   * @param {object} [options]
   * @param {import('../settings/SettingsStore.js').SettingsStore} [options.settings]
   * @param {import('../input/ActionMap.js').ActionMap} [options.actionMap]
   * @param {import('../input/InputSystem.js').InputSystem} [options.inputSystem]
   */
  constructor(container, callbacks, options = {}) {
    this._container  = container;
    this._callbacks  = callbacks;
    this._settings   = options.settings  ?? null;
    this._actionMap  = options.actionMap ?? null;
    this._inputSystem = options.inputSystem ?? null;

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
    this._root.className = 'sock_climber-overlay';
    this._render();
    this._container.appendChild(this._root);

    // Set up gamepad navigation
    if (this._inputSystem) {
      this._navigator = new MenuNavigator(this._inputSystem, { mode: 'vertical', wrap: true });
      this._updateFocusables();
      this._navigator.start();
      this._setupSliderNavigation();
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
      <div class="panel settings-panel">
        <h2>Settings</h2>

        <div class="settings-tabs">
          <button class="tab-btn${this._activeTab === 'audio'    ? ' active' : ''}" data-tab="audio">Audio</button>
          <button class="tab-btn${this._activeTab === 'controls' ? ' active' : ''}" data-tab="controls">Controls</button>
        </div>

        <div class="settings-content">
          ${this._activeTab === 'audio' ? this._renderAudio() : this._renderControls()}
        </div>
      </div>

      <button class="back-btn" data-back>← Back</button>
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
      <p class="hint-text">Click any binding to rebind. Press Escape or Back to cancel.</p>
    `;
  }

  // ── Event wiring ────────────────────────────────────────────────────────

  _attachListeners() {
    this._root.addEventListener('click', (e) => {
      // Tab switch
      const tabBtn = e.target.closest('[data-tab]');
      if (tabBtn) {
        this._stopRebind();
        this._activeTab = tabBtn.dataset.tab;
        this._render();
        // Update focusables after tab change
        if (this._navigator) {
          this._updateFocusables();
          this._setupSliderNavigation();
        }
        return;
      }

      // Back button
      if (e.target.closest('[data-back]')) {
        this._stopRebind();
        this._callbacks.onBack();
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

    // Volume sliders — live update without re-rendering the whole panel
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

    const tabs = Array.from(this._root.querySelectorAll('.tab-btn'));
    const backBtn = this._root.querySelector('[data-back]');

    if (this._activeTab === 'audio') {
      const sliders = Array.from(this._root.querySelectorAll('.vol-slider'));
      this._navigator.setFocusables([...tabs, ...sliders, backBtn]);
    } else {
      const bindBtns = Array.from(this._root.querySelectorAll('.bind-btn'));
      this._navigator.setFocusables([...tabs, ...bindBtns, backBtn]);
    }
  }

  _setupSliderNavigation() {
    // Slider adjustment is now handled by MenuNavigator
    // No additional setup needed
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

    // Snapshot baseline so we only react to newly-pressed buttons
    const baseline = this._sampleGamepadButtons();

    const poll = () => {
      if (!this._rebinding) return;

      const current = this._sampleGamepadButtons();
      for (const [gpIndex, buttons] of current.entries()) {
        for (let btnIdx = 0; btnIdx < buttons.length; btnIdx++) {
          const wasPressed = baseline.get(gpIndex)?.[btnIdx] ?? false;
          if (buttons[btnIdx] && !wasPressed) {
            this._stopRebind();
            // Button 8 (Select) cancels, same as Escape
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

