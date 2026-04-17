import { describe, it, expect } from 'vitest';
import { pollGamepadInput } from '../../src/editor/PlayMode.js';

function makeGamepad({ buttons = [], axes = [] } = {}) {
  // Fill to 17 buttons and 4 axes with defaults
  const btns = Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i) }));
  const axs  = [axes[0] ?? 0, axes[1] ?? 0, axes[2] ?? 0, axes[3] ?? 0];
  return { buttons: btns, axes: axs };
}

const NONE = makeGamepad();

describe('pollGamepadInput', () => {
  it('returns all-false when no gamepads connected', () => {
    const r = pollGamepadInput([]);
    expect(r).toEqual({ left: false, right: false, jump: false });
  });

  it('returns all-false when connected gamepad has no buttons pressed', () => {
    expect(pollGamepadInput([NONE])).toEqual({ left: false, right: false, jump: false });
  });

  it('skips null/undefined slots (Gamepad API returns sparse array)', () => {
    expect(pollGamepadInput([null, undefined, NONE])).toEqual({ left: false, right: false, jump: false });
  });

  // ── D-Pad ──────────────────────────────────────────────────────────────
  it('D-Pad Left (button 14) sets left', () => {
    expect(pollGamepadInput([makeGamepad({ buttons: [14] })]).left).toBe(true);
  });

  it('D-Pad Right (button 15) sets right', () => {
    expect(pollGamepadInput([makeGamepad({ buttons: [15] })]).right).toBe(true);
  });

  it('D-Pad Up (button 12) sets jump', () => {
    expect(pollGamepadInput([makeGamepad({ buttons: [12] })]).jump).toBe(true);
  });

  // ── Face buttons ───────────────────────────────────────────────────────
  it('A / Cross (button 0) sets jump', () => {
    expect(pollGamepadInput([makeGamepad({ buttons: [0] })]).jump).toBe(true);
  });

  it('no other face button sets jump by default', () => {
    // Button 1 (B/Circle) should NOT trigger jump
    expect(pollGamepadInput([makeGamepad({ buttons: [1] })]).jump).toBe(false);
  });

  // ── Left analogue stick ────────────────────────────────────────────────
  it('left stick full-left (axis 0 = -1) sets left', () => {
    expect(pollGamepadInput([makeGamepad({ axes: [-1] })]).left).toBe(true);
  });

  it('left stick full-right (axis 0 = +1) sets right', () => {
    expect(pollGamepadInput([makeGamepad({ axes: [1] })]).right).toBe(true);
  });

  it('left stick within dead-zone (axis 0 = -0.3) sets nothing', () => {
    const r = pollGamepadInput([makeGamepad({ axes: [-0.3] })]);
    expect(r.left).toBe(false);
    expect(r.right).toBe(false);
  });

  it('left stick just past dead-zone (axis 0 = -0.51) sets left', () => {
    expect(pollGamepadInput([makeGamepad({ axes: [-0.51] })]).left).toBe(true);
  });

  it('left stick just past dead-zone (axis 0 = +0.51) sets right', () => {
    expect(pollGamepadInput([makeGamepad({ axes: [0.51] })]).right).toBe(true);
  });

  // ── Multiple gamepads ──────────────────────────────────────────────────
  it('ORs input across multiple connected gamepads', () => {
    const gp1 = makeGamepad({ buttons: [14] });        // left
    const gp2 = makeGamepad({ buttons: [0]  });        // jump
    const r = pollGamepadInput([gp1, gp2]);
    expect(r.left).toBe(true);
    expect(r.jump).toBe(true);
    expect(r.right).toBe(false);
  });

  // ── Return shape ───────────────────────────────────────────────────────
  it('always returns an object with exactly left, right, jump keys', () => {
    const r = pollGamepadInput([makeGamepad({ buttons: [0, 14, 15] })]);
    expect(Object.keys(r).sort()).toEqual(['jump', 'left', 'right']);
  });
});
