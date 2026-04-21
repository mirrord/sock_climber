/** All recognised game actions. */
export const ACTIONS = Object.freeze([
  'moveLeft', 'moveRight', 'jump', 'dash', 'crouch', 'pause',
  'menuUp', 'menuDown', 'menuLeft', 'menuRight', 'menuConfirm', 'menuBack'
]);

/** Human-readable labels displayed in the settings UI. */
export const ACTION_LABELS = Object.freeze({
  moveLeft:    'Move Left',
  moveRight:   'Move Right',
  jump:        'Jump',
  dash:        'Dash',
  crouch:      'Crouch',
  pause:       'Pause',
  menuUp:      'Menu Up',
  menuDown:    'Menu Down',
  menuLeft:    'Menu Left',
  menuRight:   'Menu Right',
  menuConfirm: 'Menu Confirm',
  menuBack:    'Menu Back',
});

/**
 * Standard Gamepad API button indices → display names.
 * Based on the W3C standard mapping for Xbox / PlayStation controllers.
 */
export const GAMEPAD_BUTTON_NAMES = Object.freeze({
  0:  'A',
  1:  'B',
  2:  'X',
  3:  'Y',
  4:  'LB',
  5:  'RB',
  6:  'LT',
  7:  'RT',
  8:  'Select',
  9:  'Start',
  10: 'L3',
  11: 'R3',
  12: 'D-Pad ↑',
  13: 'D-Pad ↓',
  14: 'D-Pad ←',
  15: 'D-Pad →',
});

/**
 * Return a concise display string for a KeyboardEvent.code value.
 * @param {string} code
 * @returns {string}
 */
export function keyCodeLabel(code) {
  const MAP = {
    ArrowLeft:    '← Left',
    ArrowRight:   '→ Right',
    ArrowUp:      '↑ Up',
    ArrowDown:    '↓ Down',
    Space:        'Space',
    ShiftLeft:    'L-Shift',
    ShiftRight:   'R-Shift',
    ControlLeft:  'L-Ctrl',
    ControlRight: 'R-Ctrl',
    AltLeft:      'L-Alt',
    AltRight:     'R-Alt',
    Enter:        'Enter',
    Escape:       'Escape',
    Backspace:    'Backspace',
    Tab:          'Tab',
  };
  if (MAP[code]) return MAP[code];
  if (code.startsWith('Key'))    return code.slice(3);
  if (code.startsWith('Digit'))  return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num' + code.slice(6);
  return code;
}

/**
 * Return a concise display string for a gamepad binding descriptor.
 * @param {{ type: string, index: number, sign?: number }|null|undefined} binding
 * @returns {string}
 */
export function gamepadBindingLabel(binding) {
  if (binding == null) return '—';
  if (binding.type === 'button') {
    return GAMEPAD_BUTTON_NAMES[binding.index] ?? `Btn ${binding.index}`;
  }
  if (binding.type === 'axis') {
    const dir = binding.sign > 0 ? '+' : '−';
    return `Axis${binding.index}${dir}`;
  }
  return '—';
}

/**
 * Maps abstract game actions to concrete keyboard / gamepad inputs.
 * Bindings are loaded from and persisted via a SettingsStore.
 */
export class ActionMap {
  /**
   * @param {import('../settings/SettingsStore.js').SettingsStore} settings
   */
  constructor(settings) {
    this._settings = settings;
  }

  /**
   * Get the KeyboardEvent.code currently bound to an action.
   * @param {string} action
   * @returns {string}
   */
  getKeyBinding(action) {
    return this._settings.get('keyBindings')[action];
  }

  /**
   * Get the gamepad binding currently assigned to an action.
   * @param {string} action
   * @returns {{ type: string, index: number, sign?: number }}
   */
  getGamepadBinding(action) {
    return this._settings.get('gamepadBindings')[action];
  }

  /**
   * Rebind a keyboard action and persist the change.
   * @param {string} action
   * @param {string} code — KeyboardEvent.code
   */
  setKeyBinding(action, code) {
    const bindings = { ...this._settings.get('keyBindings') };
    bindings[action] = code;
    this._settings.set('keyBindings', bindings);
  }

  /**
   * Rebind a gamepad action and persist the change.
   * @param {string} action
   * @param {{ type: string, index: number, sign?: number }} binding
   */
  setGamepadBinding(action, binding) {
    const bindings = { ...this._settings.get('gamepadBindings') };
    bindings[action] = binding;
    this._settings.set('gamepadBindings', bindings);
  }
}
