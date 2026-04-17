import { ACTIONS } from './ActionMap.js';

/**
 * Per-frame input sampling that merges keyboard and Gamepad API state into
 * an immutable snapshot.  Call update() once per game-loop tick.
 *
 * Keyboard events are collected via DOM listeners (attach/detach).
 * Gamepad state is polled via navigator.getGamepads() on each update().
 *
 * The getGamepads dependency is injectable so tests can supply mock gamepads
 * without touching the DOM.
 */
export class InputSystem {
  /**
   * @param {import('./ActionMap.js').ActionMap} actionMap
   * @param {object} [options]
   * @param {() => Iterable<Gamepad|null>} [options.getGamepads] — override navigator.getGamepads
   */
  constructor(actionMap, { getGamepads } = {}) {
    this._actionMap = actionMap;

    this._getGamepads = getGamepads ?? (() => {
      if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
        return navigator.getGamepads();
      }
      return [];
    });

    /** @type {Set<string>} keys currently held down */
    this._heldKeys = new Set();

    this._snapshot = this._makeEmpty();

    this._onKeyDown = (e) => this._heldKeys.add(e.code);
    this._onKeyUp   = (e) => this._heldKeys.delete(e.code);
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  /**
   * Attach keyboard listeners to a window-like target.
   * @param {EventTarget} [target]
   */
  attach(target = window) {
    target.addEventListener('keydown', this._onKeyDown);
    target.addEventListener('keyup',   this._onKeyUp);
  }

  /**
   * Detach keyboard listeners.
   * @param {EventTarget} [target]
   */
  detach(target = window) {
    target.removeEventListener('keydown', this._onKeyDown);
    target.removeEventListener('keyup',   this._onKeyUp);
  }

  // ── Per-frame update ────────────────────────────────────────────────────

  /**
   * Sample all input sources and freeze a new snapshot.
   * Must be called exactly once per game-loop frame.
   */
  update() {
    const activeActions = new Set();

    for (const action of ACTIONS) {
      // Keyboard
      const keyCode = this._actionMap.getKeyBinding(action);
      if (keyCode && this._heldKeys.has(keyCode)) {
        activeActions.add(action);
        continue;
      }

      // Gamepad
      const gpBinding = this._actionMap.getGamepadBinding(action);
      if (gpBinding && this._isGamepadBindingActive(gpBinding)) {
        activeActions.add(action);
      }
    }

    this._snapshot = Object.freeze({
      actions: Object.freeze(activeActions),
      axes:    Object.freeze({}),
    });
  }

  // ── Snapshot accessor ───────────────────────────────────────────────────

  /**
   * The most recent input snapshot.
   * @returns {{ actions: ReadonlySet<string>, axes: Readonly<object> }}
   */
  get snapshot() {
    return this._snapshot;
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  _makeEmpty() {
    return Object.freeze({ actions: Object.freeze(new Set()), axes: Object.freeze({}) });
  }

  /**
   * Returns true if the given gamepad binding is active on any connected gamepad.
   * @param {{ type: string, index: number, sign?: number, threshold?: number }} binding
   * @returns {boolean}
   */
  _isGamepadBindingActive(binding) {
    for (const gp of this._getGamepads()) {
      if (!gp) continue;

      if (binding.type === 'button') {
        const btn = gp.buttons[binding.index];
        if (btn && btn.pressed) return true;
      } else if (binding.type === 'axis') {
        const val = gp.axes[binding.index] ?? 0;
        const threshold = binding.threshold ?? 0.5;
        if (binding.sign > 0 && val >  threshold) return true;
        if (binding.sign < 0 && val < -threshold)  return true;
      }
    }
    return false;
  }
}
