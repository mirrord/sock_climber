const STORE_KEY = 'sock_climber_settings';

/** @type {object} */
export const SETTINGS_DEFAULTS = Object.freeze({
  sfxVolume: 1.0,
  musicVolume: 0.5,
  keyBindings: Object.freeze({
    moveLeft:  'ArrowLeft',
    moveRight: 'ArrowRight',
    jump:      'Space',
    dash:      'ShiftLeft',
    crouch:    'ArrowDown',
    pause:     'Escape',
  }),
  gamepadBindings: Object.freeze({
    moveLeft:  Object.freeze({ type: 'button', index: 14 }), // D-Pad Left
    moveRight: Object.freeze({ type: 'button', index: 15 }), // D-Pad Right
    jump:      Object.freeze({ type: 'button', index: 0 }),  // A / Cross
    dash:      Object.freeze({ type: 'button', index: 2 }),  // X / Square
    crouch:    Object.freeze({ type: 'button', index: 13 }), // D-Pad Down
    pause:     Object.freeze({ type: 'button', index: 9 }),  // Start
  }),
});

/**
 * Persistent settings store. Reads/writes to a Storage-like backend.
 * Injectable storage allows unit testing without a real localStorage.
 */
export class SettingsStore {
  /**
   * @param {Storage|null} [storage] — localStorage-compatible object, or null for in-memory only
   */
  constructor(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
    this._storage = storage;
    this._data = this._load();
  }

  /** @returns {object} */
  _load() {
    if (!this._storage) return this._clone(SETTINGS_DEFAULTS);
    try {
      const raw = this._storage.getItem(STORE_KEY);
      if (!raw) return this._clone(SETTINGS_DEFAULTS);
      const saved = JSON.parse(raw);
      // Deep-merge: top-level keys override defaults, sub-objects (bindings) merged shallowly
      return {
        ...this._clone(SETTINGS_DEFAULTS),
        ...saved,
        keyBindings: { ...SETTINGS_DEFAULTS.keyBindings, ...(saved.keyBindings ?? {}) },
        gamepadBindings: { ...SETTINGS_DEFAULTS.gamepadBindings, ...(saved.gamepadBindings ?? {}) },
      };
    } catch {
      return this._clone(SETTINGS_DEFAULTS);
    }
  }

  _save() {
    if (!this._storage) return;
    this._storage.setItem(STORE_KEY, JSON.stringify(this._data));
  }

  /** Deep-clone via JSON round-trip (safe for plain serialisable objects). */
  _clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Get a setting value.
   * @param {string} key
   * @returns {*}
   */
  get(key) {
    return this._data[key];
  }

  /**
   * Set a setting value and persist to storage.
   * @param {string} key
   * @param {*} value
   */
  set(key, value) {
    this._data[key] = value;
    this._save();
  }

  /**
   * Return a deep clone of all current settings.
   * @returns {object}
   */
  getAll() {
    return this._clone(this._data);
  }

  /** Reset all settings to defaults and persist. */
  reset() {
    this._data = this._clone(SETTINGS_DEFAULTS);
    this._save();
  }
}
