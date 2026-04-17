import { describe, it, expect, beforeEach } from 'vitest';
import {
  ACTIONS,
  ACTION_LABELS,
  ActionMap,
  keyCodeLabel,
  gamepadBindingLabel,
} from '../../src/input/ActionMap.js';
import { SettingsStore, SETTINGS_DEFAULTS } from '../../src/settings/SettingsStore.js';

class MockStorage {
  constructor() { this._map = new Map(); }
  getItem(k) { return this._map.get(k) ?? null; }
  setItem(k, v) { this._map.set(k, v); }
}

function makeActionMap() {
  const store = new SettingsStore(new MockStorage());
  return { actionMap: new ActionMap(store), store };
}

describe('ACTIONS', () => {
  it('contains all expected game actions', () => {
    expect(ACTIONS).toContain('moveLeft');
    expect(ACTIONS).toContain('moveRight');
    expect(ACTIONS).toContain('jump');
    expect(ACTIONS).toContain('dash');
    expect(ACTIONS).toContain('pause');
  });
});

describe('ACTION_LABELS', () => {
  it('has a human-readable label for every action', () => {
    for (const action of ACTIONS) {
      expect(typeof ACTION_LABELS[action]).toBe('string');
      expect(ACTION_LABELS[action].length).toBeGreaterThan(0);
    }
  });
});

describe('ActionMap', () => {
  let actionMap;

  beforeEach(() => {
    ({ actionMap } = makeActionMap());
  });

  it('has a default keyboard binding for every action', () => {
    for (const action of ACTIONS) {
      const binding = actionMap.getKeyBinding(action);
      expect(typeof binding).toBe('string');
      expect(binding.length).toBeGreaterThan(0);
    }
  });

  it('has a default gamepad binding for every action', () => {
    for (const action of ACTIONS) {
      const binding = actionMap.getGamepadBinding(action);
      expect(binding).toBeTruthy();
      expect(typeof binding.type).toBe('string');
      expect(typeof binding.index).toBe('number');
    }
  });

  it('default jump key binding is Space', () => {
    expect(actionMap.getKeyBinding('jump')).toBe(SETTINGS_DEFAULTS.keyBindings.jump);
  });

  it('default jump gamepad binding is button 0 (A/Cross)', () => {
    expect(actionMap.getGamepadBinding('jump')).toEqual({ type: 'button', index: 0 });
  });

  it('setKeyBinding updates binding and persists via SettingsStore', () => {
    actionMap.setKeyBinding('jump', 'KeyZ');
    expect(actionMap.getKeyBinding('jump')).toBe('KeyZ');
  });

  it('setKeyBinding does not affect other actions', () => {
    const dashBefore = actionMap.getKeyBinding('dash');
    actionMap.setKeyBinding('jump', 'KeyZ');
    expect(actionMap.getKeyBinding('dash')).toBe(dashBefore);
  });

  it('setGamepadBinding updates binding', () => {
    actionMap.setGamepadBinding('jump', { type: 'button', index: 3 });
    expect(actionMap.getGamepadBinding('jump')).toEqual({ type: 'button', index: 3 });
  });

  it('setGamepadBinding does not affect other actions', () => {
    const dashBefore = actionMap.getGamepadBinding('dash');
    actionMap.setGamepadBinding('jump', { type: 'button', index: 3 });
    expect(actionMap.getGamepadBinding('dash')).toEqual(dashBefore);
  });
});

describe('keyCodeLabel', () => {
  it('returns readable label for arrow keys', () => {
    expect(keyCodeLabel('ArrowLeft')).toBeTruthy();
    expect(keyCodeLabel('ArrowRight')).toBeTruthy();
  });

  it('returns readable label for Space', () => {
    expect(keyCodeLabel('Space')).toBeTruthy();
  });

  it('strips "Key" prefix for letter keys', () => {
    expect(keyCodeLabel('KeyA')).toBe('A');
    expect(keyCodeLabel('KeyZ')).toBe('Z');
  });

  it('strips "Digit" prefix for digit keys', () => {
    expect(keyCodeLabel('Digit1')).toBe('1');
  });

  it('handles unknown codes gracefully', () => {
    expect(typeof keyCodeLabel('SomeUnknownCode')).toBe('string');
  });
});

describe('gamepadBindingLabel', () => {
  it('returns a label for a known button binding', () => {
    const label = gamepadBindingLabel({ type: 'button', index: 0 });
    expect(typeof label).toBe('string');
    expect(label.length).toBeGreaterThan(0);
  });

  it('returns a label for an unknown button index', () => {
    const label = gamepadBindingLabel({ type: 'button', index: 99 });
    expect(label).toContain('99');
  });

  it('returns a label for an axis binding', () => {
    const label = gamepadBindingLabel({ type: 'axis', index: 0, sign: -1 });
    expect(typeof label).toBe('string');
  });

  it('returns a dash for null/undefined', () => {
    expect(gamepadBindingLabel(null)).toBe('—');
    expect(gamepadBindingLabel(undefined)).toBe('—');
  });
});
