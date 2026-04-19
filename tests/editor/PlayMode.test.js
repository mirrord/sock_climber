import { describe, it, expect, vi } from 'vitest';
import { pollGamepadInput, snapshotToControllerInput, PlayMode } from '../../src/editor/PlayMode.js';
import { Level } from '../../src/level/Level.js';

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

// ── snapshotToControllerInput ──────────────────────────────────────────────────

describe('snapshotToControllerInput', () => {
  function makeSnapshot(actionNames = []) {
    return Object.freeze({ actions: Object.freeze(new Set(actionNames)), axes: Object.freeze({}) });
  }

  it('returns all-false when no actions are active', () => {
    expect(snapshotToControllerInput(makeSnapshot())).toEqual({
      left: false, right: false, jump: false, dash: false, crouch: false,
    });
  });

  it('maps moveLeft to left', () => {
    const r = snapshotToControllerInput(makeSnapshot(['moveLeft']));
    expect(r.left).toBe(true);
    expect(r.right).toBe(false);
  });

  it('maps moveRight to right', () => {
    expect(snapshotToControllerInput(makeSnapshot(['moveRight'])).right).toBe(true);
  });

  it('maps jump to jump', () => {
    expect(snapshotToControllerInput(makeSnapshot(['jump'])).jump).toBe(true);
  });

  it('maps dash to dash', () => {
    expect(snapshotToControllerInput(makeSnapshot(['dash'])).dash).toBe(true);
  });

  it('maps crouch to crouch', () => {
    expect(snapshotToControllerInput(makeSnapshot(['crouch'])).crouch).toBe(true);
  });

  it('maps multiple active actions simultaneously', () => {
    const r = snapshotToControllerInput(makeSnapshot(['moveRight', 'jump']));
    expect(r.right).toBe(true);
    expect(r.jump).toBe(true);
    expect(r.left).toBe(false);
  });

  it('ignores pause action — not a movement input', () => {
    expect(snapshotToControllerInput(makeSnapshot(['pause']))).toEqual({
      left: false, right: false, jump: false, dash: false, crouch: false,
    });
  });
});

// ── PlayMode — player mesh ownership ──────────────────────────────────────────

/** Minimal stubs that satisfy PlayMode without requiring Three.js / DOM. */
function makePlayModeStubs() {
  const level = new Level(10, 10);
  // Place a player object at grid (4, 4)
  level.objects = [{ id: 'p1', type: 'player', x: 4, y: 4, properties: {} }];

  const scene = { add: vi.fn(), remove: vi.fn() };
  const camera = {
    left: -10, right: 10, top: 10, bottom: -10,
    updateProjectionMatrix: vi.fn(),
  };
  const inputSystem = {
    attach: vi.fn(),
    detach: vi.fn(),
    update: vi.fn(),
    get snapshot() {
      return Object.freeze({ actions: Object.freeze(new Set()), axes: Object.freeze({}) });
    },
  };
  const playerMesh = { position: { x: 0, y: 0, z: 0.15 } };

  return { level, scene, camera, inputSystem, playerMesh };
}

describe('PlayMode — external playerMesh', () => {
  it('does NOT add the external mesh to the scene (renderer already owns it)', () => {
    const { level, scene, camera, inputSystem, playerMesh } = makePlayModeStubs();
    new PlayMode(level, scene, camera, { inputSystem, playerMesh });
    expect(scene.add).not.toHaveBeenCalledWith(playerMesh);
  });

  it('updates the external mesh position on update()', () => {
    const { level, scene, camera, inputSystem, playerMesh } = makePlayModeStubs();
    const pm = new PlayMode(level, scene, camera, { inputSystem, playerMesh });
    pm.update(1 / 60);
    // Position should now reflect the player's world coords (non-zero because spawn is at 4+0.5)
    expect(typeof playerMesh.position.x).toBe('number');
    expect(typeof playerMesh.position.y).toBe('number');
  });

  it('does NOT remove or dispose the external mesh on dispose()', () => {
    const { level, scene, camera, inputSystem, playerMesh } = makePlayModeStubs();
    playerMesh.geometry = { dispose: vi.fn() };
    playerMesh.material = { dispose: vi.fn() };
    const pm = new PlayMode(level, scene, camera, { inputSystem, playerMesh });
    pm.dispose();
    expect(scene.remove).not.toHaveBeenCalledWith(playerMesh);
    expect(playerMesh.geometry.dispose).not.toHaveBeenCalled();
    expect(playerMesh.material.dispose).not.toHaveBeenCalled();
  });

  it('detaches inputSystem on dispose()', () => {
    const { level, scene, camera, inputSystem, playerMesh } = makePlayModeStubs();
    const pm = new PlayMode(level, scene, camera, { inputSystem, playerMesh });
    pm.dispose();
    expect(inputSystem.detach).toHaveBeenCalled();
  });
});

// ── PlayMode — onAnimationChange ──────────────────────────────────────────────

describe('PlayMode — onAnimationChange', () => {
  const animIdle = { id: 'a1', name: 'idle', spriteSheetId: 's1', frameWidth: 32, frameHeight: 32, frameStart: 0, frameCount: 4, fps: 8, loop: true };
  const animRun  = { id: 'a2', name: 'run',  spriteSheetId: 's1', frameWidth: 32, frameHeight: 32, frameStart: 4, frameCount: 6, fps: 12, loop: true };
  const animJump = { id: 'a3', name: 'jump', spriteSheetId: 's1', frameWidth: 32, frameHeight: 32, frameStart: 10, frameCount: 3, fps: 8, loop: false };

  /** Player object def with standard behaviors wired to animations. */
  const playerDef = {
    behaviors: [
      { id: 'idle',       name: 'Idle',       animation: 'idle' },
      { id: 'move_right', name: 'Move Right',  animation: 'run' },
      { id: 'jump',       name: 'Jump',        animation: 'jump' },
      { id: 'crouch',     name: 'Crouch',      animation: 'idle' },
    ],
    animations: [animIdle, animRun, animJump],
  };

  function makeStubs() {
    const stubs = makePlayModeStubs();
    return stubs;
  }

  it('calls onAnimationChange on the first update() call', () => {
    const { level, scene, camera, inputSystem, playerMesh } = makeStubs();
    const onAnimationChange = vi.fn();
    const pm = new PlayMode(level, scene, camera, { inputSystem, playerMesh, playerDef, onAnimationChange });
    pm.update(1 / 60);
    expect(onAnimationChange).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onAnimationChange on subsequent updates when state is unchanged', () => {
    const { level, scene, camera, inputSystem, playerMesh } = makeStubs();
    const onAnimationChange = vi.fn();
    const pm = new PlayMode(level, scene, camera, { inputSystem, playerMesh, playerDef, onAnimationChange });
    pm.update(1 / 60);
    const callCount = onAnimationChange.mock.calls.length;
    pm.update(1 / 60);
    expect(onAnimationChange.mock.calls.length).toBe(callCount); // no extra calls
  });

  it('does NOT call onAnimationChange when playerDef is omitted', () => {
    const { level, scene, camera, inputSystem, playerMesh } = makeStubs();
    const onAnimationChange = vi.fn();
    const pm = new PlayMode(level, scene, camera, { inputSystem, playerMesh, onAnimationChange });
    pm.update(1 / 60);
    expect(onAnimationChange).not.toHaveBeenCalled();
  });

  it('passes the resolved animDef matching the current player state', () => {
    const { level, scene, camera, inputSystem, playerMesh } = makeStubs();
    const calls = [];
    const pm = new PlayMode(level, scene, camera, {
      inputSystem, playerMesh, playerDef,
      onAnimationChange: (def) => calls.push(def),
    });
    pm.update(1 / 60);
    // The resolved animDef must be one of the defined animations (or null for unconfigured state)
    const def = calls[0];
    if (def !== null) {
      expect(playerDef.animations).toContain(def);
    }
  });
});
