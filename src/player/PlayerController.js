import { deriveState, STATE } from './PlayerState.js';
import {
  GRAVITY, MOVE_SPEED, JUMP_VELOCITY, PLAYER_W, PLAYER_H,
  CROUCH_HEIGHT_SCALE, WALL_SLIDE_GRAVITY_SCALE,
  WALL_KICK_VX, WALL_KICK_VY, DASH_JUMP_SPEED_SCALE, MAX_FALL_SPEED,
} from '../utils/constants.js';

/**
 * Default tunable parameters.  Every value may be overridden via the config
 * object passed to the constructor.
 */
const DEFAULTS = Object.freeze({
  // Core physics
  gravity:             GRAVITY,
  moveSpeed:           MOVE_SPEED,
  jumpVelocity:        JUMP_VELOCITY,
  playerW:             PLAYER_W,
  playerH:             PLAYER_H,

  // Gravity toggle — when false the object floats freely
  enableGravity:       true,

  // Crouch
  enableCrouch:        true,
  crouchHeightScale:   CROUCH_HEIGHT_SCALE,

  // Wall slide
  enableWallSlide:     true,
  wallSlideGravityScale: WALL_SLIDE_GRAVITY_SCALE,

  // Wall kick
  enableWallKick:      true,
  wallKickVX:          WALL_KICK_VX,
  wallKickVY:          WALL_KICK_VY,

  // Dash jump
  enableDashJump:      true,
  dashJumpSpeedScale:  DASH_JUMP_SPEED_SCALE,

  // Falling
  enableFalling:       true,
  maxFallSpeed:        MAX_FALL_SPEED,
});

/**
 * Core player controller.  Pure physics — no Three.js, no DOM.
 *
 * Intended usage:
 *   1. Create with a config object and a getTile callback.
 *   2. Call `step(inputSnapshot, dt)` once per fixed physics tick.
 *   3. Read `x`, `y`, `state`, etc. to drive rendering.
 *
 * @example
 * const ctrl = new PlayerController({}, (gx, gy) => level.isSolid(gx, gy));
 * ctrl.x = spawnX;
 * ctrl.y = spawnY;
 * // each physics tick:
 * ctrl.step(inputSystem.snapshot, FIXED_DT);
 */
export class PlayerController {
  /**
   * @param {Partial<typeof DEFAULTS>} [config]   — tunable parameters
   * @param {(gx: number, gy: number) => boolean} [getTile] — solid-tile query
   */
  constructor(config = {}, getTile = () => false) {
    this._cfg = { ...DEFAULTS, ...config };
    this._getTile = getTile;

    // ── Position & velocity ──────────────────────────────────────────────
    this.x  = 0;
    this.y  = 0;
    this.vx = 0;
    this.vy = 0;

    // ── Collision state ──────────────────────────────────────────────────
    /** True while the player is resting on solid ground. */
    this.grounded          = false;
    /** True while the player is adjacent to a solid tile on the left side. */
    this.touchingWallLeft  = false;
    /** True while the player is adjacent to a solid tile on the right side. */
    this.touchingWallRight = false;

    // ── Behaviour state ──────────────────────────────────────────────────
    /** True on the frame the player is crouching (grounded + crouch input). */
    this.crouching   = false;
    /** True while a dash-jump is active (reset on landing). */
    this._dashJumping = false;

    // ── Facing direction ───────────────────────────────────────────
    /** Last horizontal direction the player moved: 'left' or 'right'. */
    this.facing = 'right';

    // ── Input edge-detection ─────────────────────────────────────────────
    /** Jump state from the previous step — used to detect press edges. */
    this._prevJump      = false;
    /** Prevents holding jump from re-triggering after each use. */
    this._jumpConsumed  = false;

    // ── Current hitbox dimensions (may change while crouching) ───────────
    this.hitboxW = this._cfg.playerW;
    this.hitboxH = this._cfg.playerH;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Logical player state derived from current physical flags.
   * When enableGravity is false, returns MOVE_UP/MOVE_DOWN based on vy, or
   * RUNNING/IDLE based on horizontal movement.
   * Returns STATE.JUMPING instead of STATE.FALLING when enableFalling is false.
   * @returns {string}
   */
  get state() {
    if (!this._cfg.enableGravity) {
      if (this.vy > 0) return STATE.MOVE_UP;
      if (this.vy < 0) return STATE.MOVE_DOWN;
      if (this.vx !== 0) return STATE.RUNNING;
      return STATE.IDLE;
    }
    const s = deriveState(this);
    if (!this._cfg.enableFalling && s === STATE.FALLING) return STATE.JUMPING;
    return s;
  }

  /**
   * Advance the simulation by one fixed physics step.
   *
   * @param {{
   *   left:   boolean,
   *   right:  boolean,
   *   jump:   boolean,
   *   dash:   boolean,
   *   crouch: boolean,
   * }} input — immutable per-frame input snapshot
   * @param {number} dt — timestep in seconds (use a fixed value)
   */
  step(input, dt) {
    const cfg         = this._cfg;
    const jumpPressed = input.jump && !this._prevJump;
    this._prevJump    = input.jump;

    // ── Snapshot wall state from end of previous frame ───────────────────
    const onWall   = !this.grounded && (this.touchingWallLeft || this.touchingWallRight);
    const wallSide = this.touchingWallLeft ? -1 : 1; // −1 = left wall, +1 = right wall

    // ── Crouch (grounded only; skipped when gravity is disabled) ─────────
    if (cfg.enableGravity && cfg.enableCrouch && this.grounded && input.crouch) {
      this.crouching = true;
      this.hitboxH   = cfg.playerH * cfg.crouchHeightScale;
    } else {
      this.crouching = false;
      this.hitboxH   = cfg.playerH;
    }

    // ── Horizontal velocity from directional input ────────────────────────
    const airSpeed = this._dashJumping
      ? cfg.moveSpeed * cfg.dashJumpSpeedScale
      : cfg.moveSpeed;
    const speed = (cfg.enableGravity && !this.grounded) ? airSpeed : cfg.moveSpeed;

    if      (input.left)  { this.vx = -speed; this.facing = 'left'; }
    else if (input.right) { this.vx =  speed;  this.facing = 'right'; }
    else                    this.vx =  0;

    if (cfg.enableGravity) {
      // ── Jump / wall kick (may override vx/vy set above) ─────────────────
      if (jumpPressed && !this._jumpConsumed) {
        if (cfg.enableWallKick && onWall) {
          // Wall kick: launch away from wall with full jump height
          this.vx = -wallSide * cfg.wallKickVX;
          this.vy = cfg.wallKickVY;
          this._jumpConsumed = true;
        } else if (this.grounded) {
          this.vy       = cfg.jumpVelocity;
          this.grounded = false;
          this._jumpConsumed = true;
          if (cfg.enableDashJump && input.dash) {
            this._dashJumping = true;
          }
        }
      }

      // Release jump to allow another one
      if (!input.jump) this._jumpConsumed = false;

      // ── Gravity (reduced while wall-sliding) ───────────────────────────
      let g = cfg.gravity;
      if (cfg.enableWallSlide && onWall && this.vy < 0) {
        g = cfg.gravity * cfg.wallSlideGravityScale;
      }
      this.vy += g * dt;

      // ── Terminal velocity cap ──────────────────────────────────────────
      if (cfg.enableFalling && this.vy < cfg.maxFallSpeed) {
        this.vy = cfg.maxFallSpeed;
      }
    } else {
      // ── Free vertical movement (gravity disabled) ─────────────────────
      // jump input → move up, crouch input → move down, neither → stop
      if (input.jump) {
        this.vy = cfg.moveSpeed;
      } else if (input.crouch) {
        this.vy = -cfg.moveSpeed;
      } else {
        this.vy = 0;
      }
    }

    // ── Integrate & resolve ───────────────────────────────────────────────
    this.x += this.vx * dt;
    this._resolveX();

    this.y += this.vy * dt;
    this._resolveY();

    this._updateWallContact();

    // Reset dash-jump bonus on landing
    if (this.grounded) this._dashJumping = false;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  /**
   * Stop the player at wall tiles after horizontal integration.
   * Only the leading edge in the direction of motion is tested to avoid
   * false positives from floor tiles that overlap the hitbox vertically.
   */
  _resolveX() {
    const hw = this.hitboxW / 2;
    const hh = this.hitboxH / 2;
    // Shrink vertical check area slightly to avoid snagging on floor/ceiling corners
    const CORNER_SHRINK = 0.01;
    const bottom = this.y - hh + CORNER_SHRINK;
    const top    = this.y + hh - CORNER_SHRINK;
    const minGY  = Math.floor(bottom);
    const maxGY  = Math.floor(top);

    if (this.vx > 0) {
      const gx = Math.floor(this.x + hw);
      for (let gy = minGY; gy <= maxGY; gy++) {
        if (this._getTile(gx, gy)) {
          this.x  = gx - hw;
          this.vx = 0;
          return;
        }
      }
    } else if (this.vx < 0) {
      const gx = Math.floor(this.x - hw);
      for (let gy = minGY; gy <= maxGY; gy++) {
        if (this._getTile(gx, gy)) {
          this.x  = gx + 1 + hw;
          this.vx = 0;
          return;
        }
      }
    }
  }

  /**
   * Land on (or hit the ceiling of) solid tiles after vertical integration.
   * Sets `grounded` when the player rests on a floor surface.
   */
  _resolveY() {
    const hw = this.hitboxW / 2;
    const hh = this.hitboxH / 2;
    const CORNER_SHRINK = 0.01;
    const left  = this.x - hw + CORNER_SHRINK;
    const right  = this.x + hw - CORNER_SHRINK;
    const minGX = Math.floor(left);
    const maxGX = Math.floor(right);

    this.grounded = false;

    if (this.vy < 0) {
      const gy = Math.floor(this.y - hh);
      for (let gx = minGX; gx <= maxGX; gx++) {
        if (this._getTile(gx, gy)) {
          this.y        = gy + 1 + hh;
          this.vy       = 0;
          this.grounded = true;
          return;
        }
      }
    } else if (this.vy > 0) {
      const gy = Math.floor(this.y + hh);
      for (let gx = minGX; gx <= maxGX; gx++) {
        if (this._getTile(gx, gy)) {
          this.y  = gy - hh;
          this.vy = 0;
          return;
        }
      }
    }
  }

  /**
   * After position is fully resolved, re-evaluate wall adjacency.
   * Uses a small epsilon so the player need not physically overlap the tile.
   * Clears wall flags when grounded (you can't wall-slide on the floor).
   */
  _updateWallContact() {
    if (this.grounded) {
      this.touchingWallLeft  = false;
      this.touchingWallRight = false;
      return;
    }

    const hw = this.hitboxW / 2;
    const hh = this.hitboxH / 2;
    const WALL_EPS = 0.005; // touch detection margin
    const bottom = this.y - hh + WALL_EPS;
    const top    = this.y + hh - WALL_EPS;
    const minGY  = Math.floor(bottom);
    const maxGY  = Math.floor(top);

    const leftX  = Math.floor(this.x - hw - WALL_EPS);
    const rightX = Math.floor(this.x + hw + WALL_EPS);

    this.touchingWallLeft  = false;
    this.touchingWallRight = false;

    for (let gy = minGY; gy <= maxGY; gy++) {
      if (this._getTile(leftX, gy))  this.touchingWallLeft  = true;
      if (this._getTile(rightX, gy)) this.touchingWallRight = true;
    }
  }
}
