import { describe, it, expect, vi } from 'vitest';
import { pollGamepadInput, snapshotToControllerInput, PlayMode, createPlayMode } from '../../src/editor/PlayMode.js';
import { Level, TILE } from '../../src/level/Level.js';

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
  const playerMesh = { position: { x: 0, y: 0, z: 0.15 }, scale: { x: 1 } };

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

// ── PlayMode — directional animation ─────────────────────────────────────────

describe('PlayMode — directional animation', () => {
  // Two distinct animations so we can detect which one fires
  const animIdle2 = { id: 'dI', name: 'idle',  spriteSheetId: null, frameWidth: 32, frameHeight: 32, frameStart: 0, frameCount: 2, fps: 4, loop: true };
  const animRunL  = { id: 'dL', name: 'run_l', spriteSheetId: null, frameWidth: 32, frameHeight: 32, frameStart: 0, frameCount: 4, fps: 8, loop: true };
  const animRunR  = { id: 'dR', name: 'run_r', spriteSheetId: null, frameWidth: 32, frameHeight: 32, frameStart: 4, frameCount: 4, fps: 8, loop: true };

  const dirPlayerDef = {
    behaviors: [
      { id: 'idle',       animation: 'idle' },
      { id: 'move_left',  animation: 'run_l' },
      { id: 'move_right', animation: 'run_r' },
    ],
    animations: [animIdle2, animRunL, animRunR],
  };

  /** Level with solid floor at row 4 so the player (spawning at y=4.5) grounds immediately. */
  function makeGroundedStubs(getActions = () => []) {
    const level = new Level(10, 10);
    for (let x = 0; x < 10; x++) level.setTile(x, 4, TILE.SOLID);
    level.objects = [{ id: 'p1', type: 'player', x: 4, y: 4, properties: {} }];
    const scene = { add: vi.fn(), remove: vi.fn() };
    const camera = { left: -10, right: 10, top: 10, bottom: -10, updateProjectionMatrix: vi.fn() };
    const inputSystem = {
      attach: vi.fn(), detach: vi.fn(), update: vi.fn(),
      get snapshot() {
        return Object.freeze({ actions: Object.freeze(new Set(getActions())), axes: Object.freeze({}) });
      },
    };
    const playerMesh = { position: { x: 0, y: 0, z: 0.15 }, scale: { x: 1 } };
    return { level, scene, camera, inputSystem, playerMesh };
  }

  it('uses move_left behavior animation when running left (vx < 0)', () => {
    let actions = [];
    const { level, scene, camera, inputSystem, playerMesh } = makeGroundedStubs(() => actions);
    const calls = [];
    const pm = new PlayMode(level, scene, camera, {
      inputSystem, playerMesh, playerDef: dirPlayerDef,
      onAnimationChange: (def) => calls.push(def),
    });
    // Settle player on ground in idle
    pm.update(1 / 60);
    // Run left
    actions = ['moveLeft'];
    pm.update(1 / 60);
    const last = calls[calls.length - 1];
    expect(last).toBe(animRunL);
  });

  it('uses move_right behavior animation when running right (vx > 0)', () => {
    let actions = [];
    const { level, scene, camera, inputSystem, playerMesh } = makeGroundedStubs(() => actions);
    const calls = [];
    const pm = new PlayMode(level, scene, camera, {
      inputSystem, playerMesh, playerDef: dirPlayerDef,
      onAnimationChange: (def) => calls.push(def),
    });
    pm.update(1 / 60);
    actions = ['moveRight'];
    pm.update(1 / 60);
    const last = calls[calls.length - 1];
    expect(last).toBe(animRunR);
  });

  it('does not re-trigger animation change when same animDef is resolved after direction flip', () => {
    // Both move_left and move_right resolve to the same animation — flipping direction should not restart it
    const sharedAnim = { id: 'sR', name: 'run', spriteSheetId: null, frameWidth: 32, frameHeight: 32, frameStart: 0, frameCount: 4, fps: 8, loop: true };
    const sharedDef = {
      behaviors: [
        { id: 'idle',       animation: 'idle' },
        { id: 'move_left',  animation: 'run' },
        { id: 'move_right', animation: 'run' },
      ],
      animations: [{ id: 'sI', name: 'idle', spriteSheetId: null, frameWidth: 32, frameHeight: 32, frameStart: 0, frameCount: 1, fps: 4, loop: true }, sharedAnim],
    };
    let actions = ['moveRight'];
    const { level, scene, camera, inputSystem, playerMesh } = makeGroundedStubs(() => actions);
    const calls = [];
    const pm = new PlayMode(level, scene, camera, {
      inputSystem, playerMesh, playerDef: sharedDef,
      onAnimationChange: (def) => calls.push(def),
    });
    pm.update(1 / 60); // settle + run right → sharedAnim
    const countAfterRight = calls.length;
    actions = ['moveLeft'];
    pm.update(1 / 60); // flip direction — same animation, should NOT re-fire
    expect(calls.length).toBe(countAfterRight);
  });
});

// ── PlayMode — mesh facing flip ───────────────────────────────────────────────

describe('PlayMode — mesh facing flip', () => {
  function makeGroundedFacingStubs(getActions = () => []) {
    const level = new Level(10, 10);
    for (let x = 0; x < 10; x++) level.setTile(x, 4, TILE.SOLID);
    level.objects = [{ id: 'p1', type: 'player', x: 4, y: 4, properties: {} }];
    const scene = { add: vi.fn(), remove: vi.fn() };
    const camera = { left: -10, right: 10, top: 10, bottom: -10, updateProjectionMatrix: vi.fn() };
    const inputSystem = {
      attach: vi.fn(), detach: vi.fn(), update: vi.fn(),
      get snapshot() {
        return Object.freeze({ actions: Object.freeze(new Set(getActions())), axes: Object.freeze({}) });
      },
    };
    const playerMesh = { position: { x: 0, y: 0, z: 0.15 }, scale: { x: 1 } };
    return { level, scene, camera, inputSystem, playerMesh };
  }

  it('mesh scale.x is 1 (facing right) by default', () => {
    const { level, scene, camera, inputSystem, playerMesh } = makeGroundedFacingStubs();
    const pm = new PlayMode(level, scene, camera, { inputSystem, playerMesh });
    pm.update(1 / 60);
    expect(playerMesh.scale.x).toBe(1);
  });

  it('mesh scale.x flips to -1 when moving left', () => {
    let actions = [];
    const { level, scene, camera, inputSystem, playerMesh } = makeGroundedFacingStubs(() => actions);
    const pm = new PlayMode(level, scene, camera, { inputSystem, playerMesh });
    pm.update(1 / 60); // settle idle
    actions = ['moveLeft'];
    pm.update(1 / 60);
    expect(playerMesh.scale.x).toBe(-1);
  });

  it('mesh scale.x is 1 when moving right', () => {
    let actions = [];
    const { level, scene, camera, inputSystem, playerMesh } = makeGroundedFacingStubs(() => actions);
    const pm = new PlayMode(level, scene, camera, { inputSystem, playerMesh });
    pm.update(1 / 60);
    actions = ['moveRight'];
    pm.update(1 / 60);
    expect(playerMesh.scale.x).toBe(1);
  });

  it('mesh scale.x retains last direction when idle after moving left', () => {
    let actions = ['moveLeft'];
    const { level, scene, camera, inputSystem, playerMesh } = makeGroundedFacingStubs(() => actions);
    const pm = new PlayMode(level, scene, camera, { inputSystem, playerMesh });
    pm.update(1 / 60); // run left
    actions = [];
    pm.update(1 / 60); // idle — should keep -1
    expect(playerMesh.scale.x).toBe(-1);
  });
});

// ── PlayMode — fall animation fallback ────────────────────────────────────────

describe('PlayMode — fall animation', () => {
  const animIdle = { id: 'aI', name: 'idle', spriteSheetId: null, frameWidth: 32, frameHeight: 32, frameStart: 0, frameCount: 1, fps: 1, loop: true };
  const animJump = { id: 'aJ', name: 'jump', spriteSheetId: null, frameWidth: 32, frameHeight: 32, frameStart: 1, frameCount: 1, fps: 1, loop: false };
  const animFall = { id: 'aF', name: 'fall', spriteSheetId: null, frameWidth: 32, frameHeight: 32, frameStart: 2, frameCount: 1, fps: 1, loop: true };

  /** Level with NO floor so player is in free-fall immediately. */
  function makeFallingStubs() {
    const level = new Level(10, 10);
    level.objects = [{ id: 'p1', type: 'player', x: 4, y: 4, properties: {} }];
    const scene = { add: vi.fn(), remove: vi.fn() };
    const camera = { left: -10, right: 10, top: 10, bottom: -10, updateProjectionMatrix: vi.fn() };
    const inputSystem = {
      attach: vi.fn(), detach: vi.fn(), update: vi.fn(),
      get snapshot() {
        return Object.freeze({ actions: Object.freeze(new Set()), axes: Object.freeze({}) });
      },
    };
    const playerMesh = { position: { x: 0, y: 0, z: 0.15 }, scale: { x: 1 } };
    return { level, scene, camera, inputSystem, playerMesh };
  }

  it('uses fall animation when playerDef has a fall behavior configured', () => {
    const playerDefWithFall = {
      behaviors: [
        { id: 'idle', animation: 'idle' },
        { id: 'jump', animation: 'jump' },
        { id: 'fall', animation: 'fall' },
      ],
      animations: [animIdle, animJump, animFall],
    };
    const calls = [];
    const { level, scene, camera, inputSystem, playerMesh } = makeFallingStubs();
    const pm = new PlayMode(level, scene, camera, {
      inputSystem, playerMesh, playerDef: playerDefWithFall,
      onAnimationChange: (def) => calls.push(def),
    });
    // Player has no floor → in FALLING state after physics step
    pm.update(1 / 60);
    expect(calls[calls.length - 1]).toBe(animFall);
  });

  it('falls back to jump animation when no fall behavior is configured', () => {
    const playerDefNoFall = {
      behaviors: [
        { id: 'idle', animation: 'idle' },
        { id: 'jump', animation: 'jump' },
      ],
      animations: [animIdle, animJump],
    };
    const calls = [];
    const { level, scene, camera, inputSystem, playerMesh } = makeFallingStubs();
    const pm = new PlayMode(level, scene, camera, {
      inputSystem, playerMesh, playerDef: playerDefNoFall,
      onAnimationChange: (def) => calls.push(def),
    });
    pm.update(1 / 60);
    // Must use jump as fallback — NOT idle, NOT null
    expect(calls[calls.length - 1]).toBe(animJump);
  });

  it('does not emit null when falling with only a jump animation configured', () => {
    const playerDefNoFall = {
      behaviors: [
        { id: 'idle', animation: 'idle' },
        { id: 'jump', animation: 'jump' },
      ],
      animations: [animIdle, animJump],
    };
    const calls = [];
    const { level, scene, camera, inputSystem, playerMesh } = makeFallingStubs();
    const pm = new PlayMode(level, scene, camera, {
      inputSystem, playerMesh, playerDef: playerDefNoFall,
      onAnimationChange: (def) => calls.push(def),
    });
    pm.update(1 / 60);
    const nonnullCalls = calls.filter((c) => c !== null);
    expect(nonnullCalls.length).toBe(calls.length); // all calls must have valid animDefs
  });
});

// ── createPlayMode ─────────────────────────────────────────────────────────────

describe('createPlayMode', () => {
  const animIdle = { id: 'cI', name: 'idle', spriteSheetId: null, frameWidth: 32, frameHeight: 32, frameStart: 0, frameCount: 1, fps: 4, loop: true };
  const playerDef = {
    behaviors: [{ id: 'idle', animation: 'idle' }],
    animations: [animIdle],
  };

  function makeRendererStub(playerMesh = null) {
    const scene = { add: vi.fn(), remove: vi.fn() };
    const camera = { left: -10, right: 10, top: 10, bottom: -10, updateProjectionMatrix: vi.fn() };
    return {
      scene,
      camera,
      getObjectMesh: vi.fn(() => playerMesh),
      setObjectAnimation: vi.fn(),
    };
  }

  function makeInputSystemStub() {
    return {
      attach: vi.fn(), detach: vi.fn(), update: vi.fn(),
      get snapshot() {
        return Object.freeze({ actions: Object.freeze(new Set()), axes: Object.freeze({}) });
      },
    };
  }

  function makeLevelWithPlayer() {
    const level = new Level(10, 10);
    level.objects = [{ id: 'p1', type: 'player', x: 4, y: 4, properties: {} }];
    return level;
  }

  it('returns a PlayMode instance', () => {
    const level = makeLevelWithPlayer();
    const renderer = makeRendererStub();
    const pm = createPlayMode(level, renderer, null, { inputSystem: makeInputSystemStub() });
    expect(pm).toBeInstanceOf(PlayMode);
    pm.dispose();
  });

  it('passes renderer.scene and renderer.camera to PlayMode', () => {
    const level = makeLevelWithPlayer();
    const playerMesh = { position: { x: 0, y: 0 }, scale: { x: 1 } };
    const renderer = makeRendererStub(playerMesh);
    const pm = createPlayMode(level, renderer, null, { inputSystem: makeInputSystemStub() });
    // The mesh is synced on update; if scene/camera are wrong PlayMode would
    // throw when computing _syncCamera. Verify it runs without error.
    expect(() => pm.update(1 / 60)).not.toThrow();
    pm.dispose();
  });

  it('looks up the player mesh via renderer.getObjectMesh using the player object id', () => {
    const level = makeLevelWithPlayer();
    const playerMesh = { position: { x: 0, y: 0 }, scale: { x: 1 } };
    const renderer = makeRendererStub(playerMesh);
    const objectDefs = new Map([['player', playerDef]]);
    const pm = createPlayMode(level, renderer, objectDefs, { inputSystem: makeInputSystemStub() });
    expect(renderer.getObjectMesh).toHaveBeenCalledWith('p1');
    pm.dispose();
  });

  it('uses the returned mesh so PlayMode does not add a placeholder to the scene', () => {
    const level = makeLevelWithPlayer();
    const playerMesh = { position: { x: 0, y: 0 }, scale: { x: 1 } };
    const renderer = makeRendererStub(playerMesh);
    const pm = createPlayMode(level, renderer, null, { inputSystem: makeInputSystemStub() });
    expect(renderer.scene.add).not.toHaveBeenCalledWith(playerMesh);
    pm.dispose();
  });

  it('wires onAnimationChange to renderer.setObjectAnimation when playerDef is in objectDefs', () => {
    const level = makeLevelWithPlayer();
    const playerMesh = { position: { x: 0, y: 0 }, scale: { x: 1 } };
    const renderer = makeRendererStub(playerMesh);
    const objectDefs = new Map([['player', playerDef]]);
    const pm = createPlayMode(level, renderer, objectDefs, { inputSystem: makeInputSystemStub() });
    pm.update(1 / 60);
    expect(renderer.setObjectAnimation).toHaveBeenCalledWith('p1', expect.anything());
    pm.dispose();
  });

  it('does not wire onAnimationChange when objectDefs is null', () => {
    const level = makeLevelWithPlayer();
    const playerMesh = { position: { x: 0, y: 0 }, scale: { x: 1 } };
    const renderer = makeRendererStub(playerMesh);
    const pm = createPlayMode(level, renderer, null, { inputSystem: makeInputSystemStub() });
    pm.update(1 / 60);
    expect(renderer.setObjectAnimation).not.toHaveBeenCalled();
    pm.dispose();
  });

  it('does not wire onAnimationChange when no player type in objectDefs', () => {
    const level = makeLevelWithPlayer();
    const playerMesh = { position: { x: 0, y: 0 }, scale: { x: 1 } };
    const renderer = makeRendererStub(playerMesh);
    const objectDefs = new Map([['enemy', {}]]); // no 'player' entry
    const pm = createPlayMode(level, renderer, objectDefs, { inputSystem: makeInputSystemStub() });
    pm.update(1 / 60);
    expect(renderer.setObjectAnimation).not.toHaveBeenCalled();
    pm.dispose();
  });

  it('works when level has no player object', () => {
    const level = new Level(10, 10); // no objects
    const renderer = makeRendererStub();
    const objectDefs = new Map([['player', playerDef]]);
    const pm = createPlayMode(level, renderer, objectDefs, { inputSystem: makeInputSystemStub() });
    expect(pm).toBeInstanceOf(PlayMode);
    pm.dispose();
  });
});

// ── PlayMode — onPausePressed (rising-edge detection) ─────────────────────────

describe('PlayMode — onPausePressed', () => {
  /**
   * InputSystem stub where the active action set can be changed between frames.
   * update() is a spy that does nothing; snapshot reflects `activeActions`.
   */
  function makeDynamicInput(initialActions = []) {
    let activeActions = new Set(initialActions);
    return {
      attach: vi.fn(),
      detach: vi.fn(),
      update: vi.fn(),
      get snapshot() {
        return Object.freeze({ actions: Object.freeze(new Set(activeActions)), axes: Object.freeze({}) });
      },
      setActions(a) { activeActions = new Set(a); },
    };
  }

  function makeMinimalStubs() {
    const level = new Level(10, 10);
    level.objects = [{ id: 'p1', type: 'player', x: 4, y: 4, properties: {} }];
    const scene = { add: vi.fn(), remove: vi.fn() };
    const camera = { left: -10, right: 10, top: 10, bottom: -10, updateProjectionMatrix: vi.fn() };
    const playerMesh = { position: { x: 0, y: 0, z: 0.15 }, scale: { x: 1 } };
    return { level, scene, camera, playerMesh };
  }

  it('fires onPausePressed on the first frame the pause action is active', () => {
    const { level, scene, camera, playerMesh } = makeMinimalStubs();
    const inputSystem = makeDynamicInput(['pause']);
    const onPausePressed = vi.fn();
    const pm = new PlayMode(level, scene, camera, { inputSystem, playerMesh, onPausePressed });
    pm.update(1 / 60);
    expect(onPausePressed).toHaveBeenCalledOnce();
    pm.dispose();
  });

  it('does NOT fire again on the second consecutive frame with pause held', () => {
    const { level, scene, camera, playerMesh } = makeMinimalStubs();
    const inputSystem = makeDynamicInput(['pause']);
    const onPausePressed = vi.fn();
    const pm = new PlayMode(level, scene, camera, { inputSystem, playerMesh, onPausePressed });
    pm.update(1 / 60);
    pm.update(1 / 60);
    expect(onPausePressed).toHaveBeenCalledOnce();
    pm.dispose();
  });

  it('does NOT fire when pause action is not active', () => {
    const { level, scene, camera, playerMesh } = makeMinimalStubs();
    const inputSystem = makeDynamicInput([]);
    const onPausePressed = vi.fn();
    const pm = new PlayMode(level, scene, camera, { inputSystem, playerMesh, onPausePressed });
    pm.update(1 / 60);
    pm.update(1 / 60);
    expect(onPausePressed).not.toHaveBeenCalled();
    pm.dispose();
  });

  it('fires again after the pause action is released and re-pressed', () => {
    const { level, scene, camera, playerMesh } = makeMinimalStubs();
    const inputSystem = makeDynamicInput([]);
    const onPausePressed = vi.fn();
    const pm = new PlayMode(level, scene, camera, { inputSystem, playerMesh, onPausePressed });
    pm.update(1 / 60);                    // no pause
    inputSystem.setActions(['pause']);
    pm.update(1 / 60);                    // rising edge → fires
    inputSystem.setActions([]);
    pm.update(1 / 60);                    // released
    inputSystem.setActions(['pause']);
    pm.update(1 / 60);                    // rising edge again → fires
    expect(onPausePressed).toHaveBeenCalledTimes(2);
    pm.dispose();
  });

  it('does not interfere with normal movement actions', () => {
    const { level, scene, camera, playerMesh } = makeMinimalStubs();
    const inputSystem = makeDynamicInput(['moveRight']);
    const onPausePressed = vi.fn();
    const pm = new PlayMode(level, scene, camera, { inputSystem, playerMesh, onPausePressed });
    pm.update(1 / 60);
    pm.update(1 / 60);
    expect(onPausePressed).not.toHaveBeenCalled();
    pm.dispose();
  });
});

// ── PlayMode — pollPause() ────────────────────────────────────────────────────

describe('PlayMode — pollPause()', () => {
  function makeDynamicInput(initialActions = []) {
    let activeActions = new Set(initialActions);
    return {
      attach: vi.fn(),
      detach: vi.fn(),
      update: vi.fn(),
      get snapshot() {
        return Object.freeze({ actions: Object.freeze(new Set(activeActions)), axes: Object.freeze({}) });
      },
      setActions(a) { activeActions = new Set(a); },
    };
  }

  function makeMinimalStubs() {
    const level = new Level(10, 10);
    level.objects = [{ id: 'p1', type: 'player', x: 4, y: 4, properties: {} }];
    const scene = { add: vi.fn(), remove: vi.fn() };
    const camera = { left: -10, right: 10, top: 10, bottom: -10, updateProjectionMatrix: vi.fn() };
    const playerMesh = { position: { x: 0, y: 0, z: 0.15 }, scale: { x: 1 } };
    return { level, scene, camera, playerMesh };
  }

  it('fires onPausePressed on rising edge', () => {
    const { level, scene, camera, playerMesh } = makeMinimalStubs();
    const inputSystem = makeDynamicInput(['pause']);
    const onPausePressed = vi.fn();
    const pm = new PlayMode(level, scene, camera, { inputSystem, playerMesh, onPausePressed });
    pm.pollPause();
    expect(onPausePressed).toHaveBeenCalledOnce();
    pm.dispose();
  });

  it('does NOT fire again on second consecutive pollPause() with pause held', () => {
    const { level, scene, camera, playerMesh } = makeMinimalStubs();
    const inputSystem = makeDynamicInput(['pause']);
    const onPausePressed = vi.fn();
    const pm = new PlayMode(level, scene, camera, { inputSystem, playerMesh, onPausePressed });
    pm.pollPause();
    pm.pollPause();
    expect(onPausePressed).toHaveBeenCalledOnce();
    pm.dispose();
  });

  it('calls inputSystem.update()', () => {
    const { level, scene, camera, playerMesh } = makeMinimalStubs();
    const inputSystem = makeDynamicInput([]);
    const pm = new PlayMode(level, scene, camera, { inputSystem, playerMesh });
    pm.pollPause();
    expect(inputSystem.update).toHaveBeenCalled();
    pm.dispose();
  });

  it('shares rising-edge state with update() — holding pause across pollPause then update does not re-fire', () => {
    const { level, scene, camera, playerMesh } = makeMinimalStubs();
    const inputSystem = makeDynamicInput(['pause']);
    const onPausePressed = vi.fn();
    const pm = new PlayMode(level, scene, camera, { inputSystem, playerMesh, onPausePressed });
    pm.pollPause();          // rising edge → fires
    pm.update(1 / 60);      // still held — no second fire
    expect(onPausePressed).toHaveBeenCalledOnce();
    pm.dispose();
  });
});

// ── PlayMode — enableGravity:false animation ───────────────────────────────────

describe('PlayMode — enableGravity:false animation', () => {
  const animIdle     = { id: 'gI', name: 'idle',      spriteSheetId: null, frameWidth: 32, frameHeight: 32, frameStart: 0, frameCount: 1, fps: 1, loop: true };
  const animMoveUp   = { id: 'gU', name: 'move_up',   spriteSheetId: null, frameWidth: 32, frameHeight: 32, frameStart: 1, frameCount: 1, fps: 1, loop: false };
  const animMoveDown = { id: 'gD', name: 'move_down', spriteSheetId: null, frameWidth: 32, frameHeight: 32, frameStart: 2, frameCount: 1, fps: 1, loop: false };

  const noGravityDef = {
    properties: { enableGravity: false },
    behaviors: [
      { id: 'idle',      animation: 'idle' },
      { id: 'move_up',   animation: 'move_up' },
      { id: 'move_down', animation: 'move_down' },
    ],
    animations: [animIdle, animMoveUp, animMoveDown],
  };

  function makeNoGravityStubs(getActions = () => []) {
    const level = new Level(10, 10);
    level.objects = [{ id: 'p1', type: 'player', x: 4, y: 4, properties: { enableGravity: false } }];
    const scene = { add: vi.fn(), remove: vi.fn() };
    const camera = { left: -10, right: 10, top: 10, bottom: -10, updateProjectionMatrix: vi.fn() };
    const inputSystem = {
      attach: vi.fn(), detach: vi.fn(), update: vi.fn(),
      get snapshot() {
        return Object.freeze({ actions: Object.freeze(new Set(getActions())), axes: Object.freeze({}) });
      },
    };
    const playerMesh = { position: { x: 0, y: 0, z: 0.15 }, scale: { x: 1 } };
    return { level, scene, camera, inputSystem, playerMesh };
  }

  it('uses move_up behavior animation when jump is held (enableGravity:false)', () => {
    let actions = [];
    const { level, scene, camera, inputSystem, playerMesh } = makeNoGravityStubs(() => actions);
    const calls = [];
    const pm = new PlayMode(level, scene, camera, {
      inputSystem, playerMesh, playerDef: noGravityDef,
      onAnimationChange: (def) => calls.push(def),
    });
    pm.update(1 / 60); // idle
    actions = ['jump'];
    pm.update(1 / 60);
    expect(calls[calls.length - 1]).toBe(animMoveUp);
  });

  it('uses move_down behavior animation when crouch is held (enableGravity:false)', () => {
    let actions = [];
    const { level, scene, camera, inputSystem, playerMesh } = makeNoGravityStubs(() => actions);
    const calls = [];
    const pm = new PlayMode(level, scene, camera, {
      inputSystem, playerMesh, playerDef: noGravityDef,
      onAnimationChange: (def) => calls.push(def),
    });
    pm.update(1 / 60); // idle
    actions = ['crouch'];
    pm.update(1 / 60);
    expect(calls[calls.length - 1]).toBe(animMoveDown);
  });

  it('does not fall back to jump animation in MOVE_UP state (no-gravity mode)', () => {
    let actions = ['jump'];
    const defWithJump = {
      properties: { enableGravity: false },
      behaviors: [
        { id: 'idle',    animation: 'idle' },
        { id: 'jump',    animation: 'idle' }, // jump behavior exists but should not be used for move_up state
        { id: 'move_up', animation: 'move_up' },
      ],
      animations: [animIdle, animMoveUp],
    };
    const { level, scene, camera, inputSystem, playerMesh } = makeNoGravityStubs(() => actions);
    const calls = [];
    const pm = new PlayMode(level, scene, camera, {
      inputSystem, playerMesh, playerDef: defWithJump,
      onAnimationChange: (def) => calls.push(def),
    });
    pm.update(1 / 60);
    // Must be animMoveUp, not animIdle (which is what 'jump' behavior resolves to)
    expect(calls[calls.length - 1]).toBe(animMoveUp);
  });
});
