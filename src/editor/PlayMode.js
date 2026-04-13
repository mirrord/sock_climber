import * as THREE from 'three';
import { TILE } from '../level/Level.js';
import { TILE_SIZE } from '../editor/editorConstants.js';

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
   */
  constructor(level, scene, camera) {
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

    // Input state
    this._keys = { left: false, right: false, jump: false };
    this._jumpConsumed = false;

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
    // Horizontal movement
    this.vx = 0;
    if (this._keys.left) this.vx = -MOVE_SPEED;
    if (this._keys.right) this.vx = MOVE_SPEED;

    // Jump
    if (this._keys.jump && this.grounded && !this._jumpConsumed) {
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
