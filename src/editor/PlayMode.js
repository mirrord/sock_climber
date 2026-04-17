import * as THREE from 'three';
import { TILE } from '../level/Level.js';
import { TILE_SIZE } from '../editor/editorConstants.js';

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

const GRAVITY = -30;        // m/s²
const MOVE_SPEED = 7;       // m/s
const JUMP_VELOCITY = 12;   // m/s
const PLAYER_W = 0.8;       // width in tiles
const PLAYER_H = 0.8;       // height in tiles
const FIXED_DT = 1 / 120;   // physics step

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
   * @param {() => Iterable<Gamepad|null>} [options.getGamepads] — injectable for testing
   */
  constructor(level, scene, camera, { getGamepads } = {}) {
    this.level = level;
    this.scene = scene;
    this.camera = camera;

    // Player state
    const spawn = level.findSpawn();
    this._offsetX = level.width / 2;
    this._offsetY = level.height / 2;

    this.px = spawn.x + 0.5; // center of tile
    this.py = spawn.y + 0.5;
    this.vx = 0;
    this.vy = 0;
    this.grounded = false;
    this._accumulator = 0;

    // Keyboard input state (set by keydown/keyup)
    this._keys = { left: false, right: false, jump: false };
    this._jumpConsumed = false;

    // Gamepad input state (polled each frame)
    this._gpKeys     = { left: false, right: false, jump: false };
    this._gpJumpPrev = false;
    this._getGamepads = getGamepads ?? (() => {
      if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
        return navigator.getGamepads();
      }
      return [];
    });

    // Player mesh
    const geo = new THREE.PlaneGeometry(PLAYER_W * TILE_SIZE, PLAYER_H * TILE_SIZE);
    const mat = new THREE.MeshBasicMaterial({ color: 0x48bfe3 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.z = 0.2;
    scene.add(this.mesh);

    // Input handlers (bound for removal)
    this._onKeyDown = (e) => this._handleKey(e, true);
    this._onKeyUp = (e) => this._handleKey(e, false);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  /** Advance simulation and sync visuals. */
  update(dt) {
    this._sampleGamepad();
    this._accumulator += dt;
    while (this._accumulator >= FIXED_DT) {
      this._fixedUpdate(FIXED_DT);
      this._accumulator -= FIXED_DT;
    }
    this._syncMesh();
    this._syncCamera();
  }

  /** Remove mesh and listeners. */
  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }

  // ---- Private ----

  /**
   * Poll all connected gamepads and merge their state into _gpKeys.
   * Detects jump-button release to reset _jumpConsumed (mirrors keyboard behaviour).
   */
  _sampleGamepad() {
    this._gpKeys = pollGamepadInput(this._getGamepads());

    // Falling edge on gamepad jump → reset consumed flag so the next
    // button press can trigger a new jump (same as key-up for keyboard).
    if (this._gpJumpPrev && !this._gpKeys.jump) {
      this._jumpConsumed = false;
    }
    this._gpJumpPrev = this._gpKeys.jump;
  }

  _handleKey(e, down) {
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this._keys.left = down;
        break;
      case 'ArrowRight':
      case 'KeyD':
        this._keys.right = down;
        break;
      case 'ArrowUp':
      case 'KeyW':
      case 'Space':
        this._keys.jump = down;
        if (!down) this._jumpConsumed = false;
        break;
    }
  }

  _fixedUpdate(dt) {
    // Merge keyboard and gamepad inputs
    const moveLeft  = this._keys.left  || this._gpKeys.left;
    const moveRight = this._keys.right || this._gpKeys.right;
    const wantsJump = this._keys.jump  || this._gpKeys.jump;

    // Horizontal movement
    this.vx = 0;
    if (moveLeft)  this.vx = -MOVE_SPEED;
    if (moveRight) this.vx =  MOVE_SPEED;

    // Jump
    if (wantsJump && this.grounded && !this._jumpConsumed) {
      this.vy = JUMP_VELOCITY;
      this.grounded = false;
      this._jumpConsumed = true;
    }

    // Gravity
    this.vy += GRAVITY * dt;

    // Move X, then resolve collisions
    this.px += this.vx * dt;
    this._resolveX();

    // Move Y, then resolve collisions
    this.py += this.vy * dt;
    this._resolveY();
  }

  /** Check if a tile at grid (gx, gy) is solid. */
  _isSolid(gx, gy) {
    const t = this.level.getTile(gx, gy);
    return t === TILE.SOLID;
  }

  _resolveX() {
    const hw = PLAYER_W / 2;
    const hh = PLAYER_H / 2;
    const left = this.px - hw;
    const right = this.px + hw;
    const top = this.py + hh - 0.01;
    const bottom = this.py - hh + 0.01;

    const minGX = Math.floor(left);
    const maxGX = Math.floor(right);
    const minGY = Math.floor(bottom);
    const maxGY = Math.floor(top);

    for (let gy = minGY; gy <= maxGY; gy++) {
      for (let gx = minGX; gx <= maxGX; gx++) {
        if (!this._isSolid(gx, gy)) continue;
        if (this.vx > 0) {
          this.px = gx - hw;
        } else if (this.vx < 0) {
          this.px = gx + 1 + hw;
        }
        this.vx = 0;
      }
    }
  }

  _resolveY() {
    const hw = PLAYER_W / 2;
    const hh = PLAYER_H / 2;
    const left = this.px - hw + 0.01;
    const right = this.px + hw - 0.01;
    const top = this.py + hh;
    const bottom = this.py - hh;

    const minGX = Math.floor(left);
    const maxGX = Math.floor(right);
    const minGY = Math.floor(bottom);
    const maxGY = Math.floor(top);

    this.grounded = false;
    for (let gy = minGY; gy <= maxGY; gy++) {
      for (let gx = minGX; gx <= maxGX; gx++) {
        if (!this._isSolid(gx, gy)) continue;
        if (this.vy < 0) {
          this.py = gy + 1 + hh;
          this.grounded = true;
        } else if (this.vy > 0) {
          this.py = gy - hh;
        }
        this.vy = 0;
      }
    }
  }

  _syncMesh() {
    this.mesh.position.x = (this.px - this._offsetX) * TILE_SIZE;
    this.mesh.position.y = (this.py - this._offsetY) * TILE_SIZE;
  }

  _syncCamera() {
    const cx = (this.px - this._offsetX) * TILE_SIZE;
    const cy = (this.py - this._offsetY) * TILE_SIZE;
    const hw = (this.camera.right - this.camera.left) / 2;
    const hh = (this.camera.top - this.camera.bottom) / 2;
    this.camera.left = cx - hw;
    this.camera.right = cx + hw;
    this.camera.top = cy + hh;
    this.camera.bottom = cy - hh;
    this.camera.updateProjectionMatrix();
  }
}
