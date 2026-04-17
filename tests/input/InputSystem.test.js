import { describe, it, expect, beforeEach } from 'vitest';
import { InputSystem } from '../../src/input/InputSystem.js';
import { ActionMap } from '../../src/input/ActionMap.js';
import { SettingsStore } from '../../src/settings/SettingsStore.js';

class MockStorage {
  constructor() { this._map = new Map(); }
  getItem(k) { return this._map.get(k) ?? null; }
  setItem(k, v) { this._map.set(k, v); }
}

function makeInput(gamepadFactory) {
  const store = new SettingsStore(new MockStorage());
  const actionMap = new ActionMap(store);
  const getGamepads = gamepadFactory ?? (() => []);
  const input = new InputSystem(actionMap, { getGamepads });
  return { input, actionMap, store };
}

function makeGamepad(pressedIndices = []) {
  return {
    index: 0,
    buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: pressedIndices.includes(i) })),
    axes: [0, 0, 0, 0],
  };
}

describe('InputSystem', () => {
  it('snapshot is frozen after update()', () => {
    const { input } = makeInput();
    input.update();
    expect(Object.isFrozen(input.snapshot)).toBe(true);
    expect(Object.isFrozen(input.snapshot.actions)).toBe(true);
  });

  it('produces a new snapshot object each frame', () => {
    const { input } = makeInput();
    input.update();
    const snap1 = input.snapshot;
    input.update();
    const snap2 = input.snapshot;
    expect(snap1).not.toBe(snap2);
  });

  it('no actions active when no keys are held', () => {
    const { input } = makeInput();
    input.update();
    expect(input.snapshot.actions.size).toBe(0);
  });

  it('maps held key to the correct action', () => {
    const { input } = makeInput();
    // Default: Space → jump
    input._heldKeys.add('Space');
    input.update();
    expect(input.snapshot.actions.has('jump')).toBe(true);
  });

  it('action is absent when key is released', () => {
    const { input } = makeInput();
    input._heldKeys.add('Space');
    input.update();
    input._heldKeys.delete('Space');
    input.update();
    expect(input.snapshot.actions.has('jump')).toBe(false);
  });

  it('reflects a remapped keyboard binding', () => {
    const { input, actionMap } = makeInput();
    actionMap.setKeyBinding('jump', 'KeyZ');
    input._heldKeys.add('KeyZ');
    input.update();
    expect(input.snapshot.actions.has('jump')).toBe(true);
  });

  it('maps gamepad button press to action', () => {
    // Default: button 0 → jump (A/Cross)
    const { input } = makeInput(() => [makeGamepad([0])]);
    input.update();
    expect(input.snapshot.actions.has('jump')).toBe(true);
  });

  it('no jump when gamepad button 0 is not pressed', () => {
    const { input } = makeInput(() => [makeGamepad([])]);
    input.update();
    expect(input.snapshot.actions.has('jump')).toBe(false);
  });

  it('reflects a remapped gamepad binding', () => {
    const { input, actionMap } = makeInput(() => [makeGamepad([3])]);
    // Remap jump to button 3 (Y/Triangle)
    actionMap.setGamepadBinding('jump', { type: 'button', index: 3 });
    input.update();
    expect(input.snapshot.actions.has('jump')).toBe(true);
  });

  it('supports axis-based gamepad bindings', () => {
    // Map moveLeft to axis 0 negative
    const gp = { index: 0, buttons: Array.from({ length: 16 }, () => ({ pressed: false })), axes: [-1, 0] };
    const { input, actionMap } = makeInput(() => [gp]);
    actionMap.setGamepadBinding('moveLeft', { type: 'axis', index: 0, sign: -1 });
    input.update();
    expect(input.snapshot.actions.has('moveLeft')).toBe(true);
  });

  it('can combine keyboard and gamepad inputs in the same frame', () => {
    const { input } = makeInput(() => [makeGamepad([14])]);
    // D-Pad Left (button 14) → moveLeft; Space → jump
    input._heldKeys.add('Space');
    input.update();
    expect(input.snapshot.actions.has('jump')).toBe(true);
    expect(input.snapshot.actions.has('moveLeft')).toBe(true);
  });
});

