import * as THREE from 'three';
import { TILE } from '../level/Level.js';
import { TILE_SIZE } from '../editor/editorConstants.js';
import { PlayerController } from '../player/PlayerController.js';
import { InputSystem } from '../input/InputSystem.js';
import { ActionMap } from '../input/ActionMap.js';
import { SettingsStore } from '../settings/SettingsStore.js';
import { PLAYER_W, PLAYER_H, FIXED_DT } from '../utils/constants.js';
import { resolveBehaviorAnimDef } from './animUtils.js';
import { STATE } from '../player/PlayerState.js';

/**
 * Maps a PlayerController state string to the behavior id used to look up
 * the associated animation on the player's GameObject definition.
 * @type {Record<string, string>}
 */
const STATE_BEHAVIOR = {
  [STATE.IDLE]:       'idle',
  [STATE.RUNNING]:    'move_right',  // move_left shares the same animation
  [STATE.JUMPING]:    'jump',
  [STATE.FALLING]:    'jump',        // no dedicated fall behavior; reuse jump
  [STATE.CROUCHING]:  'crouch',
  [STATE.WALL_SLIDE]: 'idle',        // no dedicated wall-slide behavior
};

/** Dead-zone threshold for analogue sticks. */
const STICK_DEAD = 0.5;

/**
 * Map raw Gamepad API state to the three boolean inputs PlayMode needs.
 * Pure function — safe to call with mock data in tests.
 *
 * Standard mapping (W3C):
 *   button 0  = A / Cross         → jump
 *   button 12 = D-Pad Up          → jump
 *   button 14 = D-Pad Left        → left
 *   button 15 = D-Pad Right       → right
 *   axis  0   = Left stick horiz  → left / right
 *
 * @param {Iterable<Gamepad|null|undefined>} gamepads
 * @returns {{ left: boolean, right: boolean, jump: boolean }}
 */
export function pollGamepadInput(gamepads) {
  const result = { left: false, right: false, jump: false };
  for (const gp of gamepads) {
    if (!gp) continue;
    if (gp.buttons[14]?.pressed)           result.left  = true;
    if (gp.buttons[15]?.pressed)           result.right = true;
    if (gp.buttons[0]?.pressed)            result.jump  = true;
    if (gp.buttons[12]?.pressed)           result.jump  = true;
    const ax = gp.axes[0] ?? 0;
    if (ax < -STICK_DEAD)                  result.left  = true;
    if (ax >  STICK_DEAD)                  result.right = true;
  }
  return result;
}

/**
 * Convert an InputSystem snapshot to the boolean input format expected by
 * PlayerController.step().
 *
 * @param {{ actions: ReadonlySet<string> }} snapshot
 * @returns {{ left: boolean, right: boolean, jump: boolean, dash: boolean, crouch: boolean }}
 */
export function snapshotToControllerInput(snapshot) {
  const a = snapshot.actions;
  return {
    left:   a.has('moveLeft'),
    right:  a.has('moveRight'),
    jump:   a.has('jump'),
    dash:   a.has('dash'),
    crouch: a.has('crouch'),
  };
}

/**
 * Minimal player controller for play-testing a level.
 * Handles movement, gravity, AABB collision against level tiles.
 */
export class PlayMode {
  /**
   * @param {import('../level/Level.js').Level} level
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   * @param {object} [options]
   * @param {InputSystem} [options.inputSystem] — injectable for testing; a default is created if omitted
   * @param {THREE.Mesh|null} [options.playerMesh] — mesh from the renderer representing the
   *   level's player object. When provided PlayMode drives it directly and does not
   *   create or destroy the placeholder. When omitted a cyan placeholder is created.
   * @param {EventTarget} [options.eventTarget] — target for input listener attachment;
   *   defaults to globalThis (=== window in browsers). Injectable for testing.
   * @param {object|null} [options.playerDef] — the player’s GameObject definition.
   *   When provided, PlayMode calls onAnimationChange whenever the controller
   *   state changes, passing the resolved animation definition.
   * @param {((animDef: object|null) => void)|null} [options.onAnimationChange] —
   *   called with the new animation definition each time the player state changes.
   */
  constructor(level, scene, camera, { inputSystem, playerMesh, eventTarget, playerDef, onAnimationChange } = {}) {
    this.level = level;
    this.scene = scene;
    this.camera = camera;

    // Input system — use injected instance or create a default one
    if (inputSystem) {
      this._inputSystem = inputSystem;
    } else {
      const settings = new SettingsStore();
      const actionMap = new ActionMap(settings);
      this._inputSystem = new InputSystem(actionMap);
    }
    // Event target stored so dispose() can detach from the same target.
    this._eventTarget = eventTarget ?? globalThis;
    this._inputSystem.attach(this._eventTarget);

    // Player spawn from the level's configured player object
    const spawn = level.findPlayerSpawn() ?? level.findSpawn();
    this._offsetX = level.width / 2;
    this._offsetY = level.height / 2;

    // Player controller — physics owned here, positioned at spawn
    this._ctrl = new PlayerController(
      {},
      (gx, gy) => level.getTile(gx, gy) === TILE.SOLID
    );
    this._ctrl.x = spawn.x + 0.5;
    this._ctrl.y = spawn.y + 0.5;

    this._accumulator = 0;

    // Animation-state tracking
    this._playerDef = playerDef ?? null;
    this._onAnimationChange = onAnimationChange ?? null;
    this._lastPlayerState = null;

    // Player mesh: use the level's player object mesh when provided; otherwise
    // create a cyan placeholder so play-testing still works without a full renderer.
    if (playerMesh) {
      this.mesh = playerMesh;
      this._ownsPlayerMesh = false;
    } else {
      const geo = new THREE.PlaneGeometry(PLAYER_W * TILE_SIZE, PLAYER_H * TILE_SIZE);
      const mat = new THREE.MeshBasicMaterial({ color: 0x48bfe3 });
      this.mesh = new THREE.Mesh(geo, mat);
      this.mesh.position.z = 0.2;
      scene.add(this.mesh);
      this._ownsPlayerMesh = true;
    }
  }

  /** Advance simulation and sync visuals. */
  update(dt) {
    this._inputSystem.update();
    const input = snapshotToControllerInput(this._inputSystem.snapshot);
    this._accumulator += dt;
    while (this._accumulator >= FIXED_DT) {
      this._ctrl.step(input, FIXED_DT);
      this._accumulator -= FIXED_DT;
    }
    this._updatePlayerAnimation();
    this._syncMesh();
    this._syncCamera();
  }

  /** Remove mesh and detach input listeners. */
  dispose() {
    this._inputSystem.detach(this._eventTarget);
    if (this._ownsPlayerMesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }
  }

  // ---- Private ----

  /**
   * Emit onAnimationChange when the player's logical state changes.
   * Resolves the animation definition by looking up the behavior associated
   * with the new state on the player's GameObject definition.
   * Falls back to the idle behavior's animation if the state-specific one is absent.
   */
  _updatePlayerAnimation() {
    if (!this._playerDef || !this._onAnimationChange) return;
    const state = this._ctrl.state;
    if (state === this._lastPlayerState) return;
    this._lastPlayerState = state;
    const behaviorId = STATE_BEHAVIOR[state] ?? 'idle';
    const animDef = resolveBehaviorAnimDef(this._playerDef, behaviorId)
      ?? resolveBehaviorAnimDef(this._playerDef, 'idle');
    this._onAnimationChange(animDef);
  }

  _syncMesh() {
    this.mesh.position.x = (this._ctrl.x - this._offsetX) * TILE_SIZE;
    this.mesh.position.y = (this._ctrl.y - this._offsetY) * TILE_SIZE;
  }

  _syncCamera() {
    const cx = (this._ctrl.x - this._offsetX) * TILE_SIZE;
    const cy = (this._ctrl.y - this._offsetY) * TILE_SIZE;
    const hw = (this.camera.right - this.camera.left) / 2;
    const hh = (this.camera.top - this.camera.bottom) / 2;
    this.camera.left = cx - hw;
    this.camera.right = cx + hw;
    this.camera.top = cy + hh;
    this.camera.bottom = cy - hh;
    this.camera.updateProjectionMatrix();
  }
}
