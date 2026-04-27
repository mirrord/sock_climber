import { createBody } from "../physics/Body.js";
import type { Body } from "../physics/Body.js";
import type { TileWorld } from "../physics/TileWorld.js";
import type { InputSnapshot } from "../input/InputSnapshot.js";
import { EMPTY_SNAPSHOT } from "../input/InputSnapshot.js";
import { nextEntityId } from "./Entity.js";
import type { Entity } from "./Entity.js";
import type { Health } from "./components/Health.js";
import { createHealth } from "./components/Health.js";
import type { PlayerStats } from "./components/Stats.js";
import { DEFAULT_PLAYER_STATS } from "./components/Stats.js";
import type { EventBus, GameEvents } from "../core/EventBus.js";

/** Locomotion state — mutually exclusive top-level movement modes. */
export type LocomotionState = "Grounded" | "Airborne" | "WallSliding";

/**
 * Player entity.
 *
 * Owns the physics body, controller state machine, and health.
 * Call `update(dt, snap)` once per fixed step **before** advancing physics with
 * `step(body, world, dt)`.
 */
export class Player implements Entity {
  readonly id: number;

  /** Physics body — read/write by the controller; advanced by the physics resolver. */
  readonly body: Body;

  /** Tunable parameters (read-only after construction). */
  readonly stats: PlayerStats;

  // ─── Health ───────────────────────────────────────────────────────────────
  private _health: Health;

  // ─── Locomotion & orthogonal flags ───────────────────────────────────────
  private _locomotion: LocomotionState = "Airborne";
  private _isCrouching = false;
  private _isDashing = false;
  private _isSpringCharging = false;

  // ─── Per-frame edge-detection helpers ────────────────────────────────────
  private _wasGrounded = false;
  /** Set to true the frame a jump fires to suppress coyote-timer start. */
  private _justJumped = false;

  // ─── Timers (seconds) ────────────────────────────────────────────────────
  private _coyoteTimer = 0;
  private _jumpBufferTimer = 0;
  private _dashTimer = 0;
  private _dashCooldownTimer = 0;
  private _wallKickLockTimer = 0;
  private _crouchHoldTimer = 0;

  // ─── Dash velocity ───────────────────────────────────────────────────────
  /** Horizontal velocity held during a dash in m/s. */
  private _dashVX = 0;
  /**
   * True while the player is airborne after performing a dash-jump or
   * dash-wall-kick. Suppresses air-acceleration so the dash-derived
   * horizontal momentum carries until the player lands or contacts a wall.
   */
  private _dashMomentumLock = false;
  // ─── Stat mod system ─────────────────────────────────────────────────────
  /** Active temporary stat modifiers, keyed by source id. Values are additive deltas. */
  private readonly _statMods = new Map<string, Partial<PlayerStats>>();
  /** Cached merged stats — rebuilt only when mods change. */
  private _cachedEffective: PlayerStats;
  private _statModsDirty = false;

  // ─── Spring ──────────────────────────────────────────────────────────────
  /** Current charge on the 0–1 scale. */
  private _springCharge = 0;
  private _springDirX = 0;
  private _springDirY = -1; // default direction: upward

  // ─── Mid-air counters ────────────────────────────────────────────────────
  private _airJumpsUsed = 0;
  private _airDashesUsed = 0;

  // ─── Facing ──────────────────────────────────────────────────────────────
  private _facing: 1 | -1 = 1;

  // ─── Audio event bus (optional) ──────────────────────────────────────────
  private readonly _bus: EventBus<GameEvents> | null;
  /** Set true the frame `onPlayerDeath` is emitted; cleared on `spawn()`. */
  private _deathEmitted = false;

  constructor(
    position: { x: number; y: number },
    stats: Partial<PlayerStats> = {},
    bus?: EventBus<GameEvents>,
  ) {
    this._bus = bus ?? null;
    this.id = nextEntityId();
    this.stats = { ...DEFAULT_PLAYER_STATS, ...stats };
    this._cachedEffective = { ...this.stats };
    this.body = createBody({
      position,
      halfExtents: { x: this.stats.halfW, y: this.stats.standHalfH },
      gravity: this.stats.gravity,
    });
    this._health = createHealth(this.stats.maxHealth, this.stats.iFrameDuration);
  }

  /** Emit onHpChanged with the current container/HP snapshot. No-op without a bus. */
  private _emitHpChanged(): void {
    if (this._bus === null) return;
    this._bus.emit("onHpChanged", {
      current: this._health.current,
      max: this._health.containers,
      empty: this._health.containers - this._health.current,
    });
  }

  // ─── Stat mods ────────────────────────────────────────────────────────────

  /**
   * Register an additive stat modifier. Values in `mod` are **deltas** added on top
   * of the base stats (and all other active mods).
   * @param key - Unique source identifier (e.g. `"gum_42"`, `"SpeedSock"`).
   * @param mod - Partial PlayerStats where each present value is a numeric delta.
   */
  applyStatMod(key: string, mod: Partial<PlayerStats>): void {
    this._statMods.set(key, mod);
    this._statModsDirty = true;
  }

  /**
   * Remove a previously registered stat modifier.
   * @param key - The same key passed to `applyStatMod`.
   */
  removeStatMod(key: string): void {
    if (this._statMods.delete(key)) this._statModsDirty = true;
  }

  /** Rebuild `_cachedEffective` from base stats + all active mods. No allocations. */
  private _rebuildEffective(): void {
    const base = this.stats as unknown as Record<string, unknown>;
    const cache = this._cachedEffective as unknown as Record<string, unknown>;
    for (const k in base) cache[k] = base[k];
    for (const mod of this._statMods.values()) {
      const m = mod as unknown as Record<string, unknown>;
      for (const k in m) {
        const v = m[k];
        if (typeof v === "number") {
          (cache[k] as number) += v as number;
        } else {
          cache[k] = v;
        }
      }
    }
    this._statModsDirty = false;
  }

  /** Effective stats — base stats plus all active temporary modifiers. */
  get effectiveStats(): Readonly<PlayerStats> {
    if (this._statModsDirty) this._rebuildEffective();
    return this._cachedEffective;
  }

  // ─── Entity lifecycle ─────────────────────────────────────────────────────

  spawn(): void {
    this._statMods.clear();
    this._statModsDirty = true;
    this._health = createHealth(this.stats.maxHealth, this.stats.iFrameDuration);
    this._deathEmitted = false;
    this._locomotion = "Airborne";
    this._isCrouching = false;
    this._isDashing = false;
    this._isSpringCharging = false;
    this._wasGrounded = false;
    this._justJumped = false;
    this._coyoteTimer = 0;
    this._jumpBufferTimer = 0;
    this._dashTimer = 0;
    this._dashCooldownTimer = 0;
    this._wallKickLockTimer = 0;
    this._crouchHoldTimer = 0;
    this._dashVX = 0;
    this._dashMomentumLock = false;
    this._springCharge = 0;
    this._springDirX = 0;
    this._springDirY = -1;
    this._airJumpsUsed = 0;
    this._airDashesUsed = 0;
    this._facing = 1;
    this.body.halfExtents.y = this.stats.standHalfH;
    this.body.gravity = this.stats.gravity;
    this.body.velocity.x = 0;
    this.body.velocity.y = 0;
  }

  despawn(): void {
    // No-op — state is reset on the next spawn().
  }

  // ─── Main controller update ───────────────────────────────────────────────

  /**
   * Apply controller logic for one fixed timestep.
   * Must be called **before** `step(body, world, dt)`.
   *
   * @param dt    - Fixed step size in seconds (1/120 recommended).
   * @param snap  - Immutable input snapshot for this step.
   * @param world - Optional tile world used for headroom checks (e.g. so the
   *                player cannot stand up into a ceiling). When omitted the
   *                stand-up always succeeds (used by unit tests).
   */
  update(dt: number, snap: InputSnapshot = EMPTY_SNAPSHOT, world?: TileWorld): void {
    const s = this.effectiveStats;
    const grounded = this.body.flags.onGround;
    const onWallL = this.body.flags.onWallL;
    const onWallR = this.body.flags.onWallR;

    // ─── Tick timers ──────────────────────────────────────────────────────
    if (this._coyoteTimer > 0) this._coyoteTimer = Math.max(0, this._coyoteTimer - dt);
    if (this._jumpBufferTimer > 0)
      this._jumpBufferTimer = Math.max(0, this._jumpBufferTimer - dt);
    if (this._wallKickLockTimer > 0)
      this._wallKickLockTimer = Math.max(0, this._wallKickLockTimer - dt);
    if (this._dashCooldownTimer > 0)
      this._dashCooldownTimer = Math.max(0, this._dashCooldownTimer - dt);
    if (this._health.iFrameTimer > 0)
      this._health.iFrameTimer = Math.max(0, this._health.iFrameTimer - dt);
    // ─── Land detection ─────────────────────────────────────────────────
    if (grounded && !this._wasGrounded) {
      this._bus?.emit("onLand", {});
    }
    // ─── Coyote time ──────────────────────────────────────────────────────
    // Start the window on the first frame after leaving ground without jumping.
    if (this._wasGrounded && !grounded && !this._justJumped) {
      this._coyoteTimer = s.coyoteTime;
    }

    // ─── Locomotion state ─────────────────────────────────────────────────
    if (grounded) {
      this._locomotion = "Grounded";
      this._airJumpsUsed = 0;
      this._airDashesUsed = 0;
      this._justJumped = false;
      this._coyoteTimer = 0;
      this._dashMomentumLock = false;
    } else if ((onWallL || onWallR) && this.body.velocity.y >= 0) {
      // Wall slide: airborne, touching a wall, moving downward (or still).
      this._locomotion = "WallSliding";
    } else {
      this._locomotion = "Airborne";
    }

    // Touching any wall refunds the air-dash budget (per design: dashes are
    // restored on contact with a wall or floor). This runs in addition to
    // the grounded reset above to also cover the airborne wall-cling case.
    // Wall contact also clears the dash-jump momentum lock.
    if (onWallL || onWallR) {
      this._airDashesUsed = 0;
      this._dashMomentumLock = false;
    }

    // ─── Jump buffer ──────────────────────────────────────────────────────
    if (snap.buttonsPressed.has("Jump")) {
      this._jumpBufferTimer = s.jumpBufferTime;
    }

    // ─── Jump resolution ──────────────────────────────────────────────────
    // Per-frame flag: set when a jump fires this frame. Used to suppress a
    // same-frame dash trigger so Dash+Jump pressed together resolves to a
    // dash-jump (jump wins; no dash starts).
    let jumpedThisFrame = false;
    if (this._jumpBufferTimer > 0) {
      const onGround = this._locomotion === "Grounded";
      const hasCoyote = this._coyoteTimer > 0;
      const canWallKick = this._locomotion === "WallSliding";
      const canAirJump =
        this._locomotion !== "Grounded" && this._airJumpsUsed < s.maxAirJumps;

      // Held Dash button enables dash-jump / dash-wall-kick variants — the
      // jump retains the horizontal speed of a dash regardless of whether
      // the player is currently mid-dash.
      const dashHeld = snap.buttonsDown.has("Dash");
      const dashSpeed = s.dashDistance / s.dashDuration;
      const dashJumpDir = (): 1 | -1 =>
        this._isDashing
          ? ((Math.sign(this._dashVX) || this._facing) as 1 | -1)
          : snap.axes.moveX !== 0
            ? (Math.sign(snap.axes.moveX) as 1 | -1)
            : this._facing;

      if (onGround || hasCoyote) {
        this.body.velocity.y = s.jumpVelocity;
        if (dashHeld) {
          this.body.velocity.x = dashJumpDir() * dashSpeed;
          // Persist dash momentum until the player lands or contacts a wall.
          this._dashMomentumLock = true;
        }
        this._jumpBufferTimer = 0;
        this._coyoteTimer = 0;
        this._justJumped = true;
        this._locomotion = "Airborne";
        jumpedThisFrame = true;
        this._bus?.emit("onJump", {});
      } else if (canWallKick) {
        // Kick away from the wall. Dash-held → kick at dash speed.
        const kickDirX: 1 | -1 = onWallL ? 1 : -1;
        const horizSpeed = dashHeld ? dashSpeed : s.wallKickVX;
        this.body.velocity.x = kickDirX * horizSpeed;
        this.body.velocity.y = s.wallKickVY;
        this._jumpBufferTimer = 0;
        this._wallKickLockTimer = s.wallKickLockDuration;
        if (dashHeld) {
          // Dash-wall-kick: persist horizontal momentum across the air
          // until landing or next wall contact.
          this._dashMomentumLock = true;
        }
        this._locomotion = "Airborne";
        jumpedThisFrame = true;
        this._bus?.emit("onJump", {});
      } else if (canAirJump) {
        this.body.velocity.y = s.jumpVelocity;
        if (dashHeld) {
          this.body.velocity.x = dashJumpDir() * dashSpeed;
          this._dashMomentumLock = true;
        }
        this._jumpBufferTimer = 0;
        this._airJumpsUsed++;
        jumpedThisFrame = true;
        this._bus?.emit("onJump", {});
      }

      // ─── Jump-cancel an active dash ─────────────────────────────────
      // If a jump fired while a dash was in progress, end the dash early.
      // Refund the air-dash budget (but not the cooldown) so jump-canceling
      // mid-air does not punish the player.
      if (jumpedThisFrame && this._isDashing) {
        const wasAirborne = !onGround;
        this._isDashing = false;
        this._dashTimer = 0;
        if (wasAirborne && this._airDashesUsed > 0) {
          this._airDashesUsed--;
        }
      }
    }

    // Variable jump height: cut upward velocity when Jump is released early.
    if (snap.buttonsReleased.has("Jump") && this.body.velocity.y < 0) {
      this.body.velocity.y *= s.jumpCutMultiplier;
    }

    // ─── Dash ─────────────────────────────────────────────────────────────
    if (this._isDashing) {
      this._dashTimer -= dt;
      if (this._dashTimer <= 0) {
        this._isDashing = false;
        this._dashTimer = 0;
      } else {
        // Hold dash velocity; override any gravity-driven changes.
        this.body.velocity.x = this._dashVX;
        this.body.velocity.y = 0;
      }
    } else if (!jumpedThisFrame && snap.buttonsPressed.has("Dash")) {
      const onGround = this._locomotion === "Grounded";
      // Ground dashes are unlimited (no cooldown). Air dashes are limited
      // only by the maxAirDashes budget, which is refunded on wall/floor
      // contact (see locomotion block above).
      const canDash = onGround || this._airDashesUsed < s.maxAirDashes;

      if (canDash) {
        const dirX: 1 | -1 =
          snap.axes.moveX !== 0 ? (Math.sign(snap.axes.moveX) as 1 | -1) : this._facing;
        const speed = s.dashDistance / s.dashDuration;
        this._dashVX = dirX * speed;
        this._dashTimer = s.dashDuration;
        this._isDashing = true;
        this.body.velocity.x = this._dashVX;
        this.body.velocity.y = 0;
        if (!onGround) this._airDashesUsed++;
        this._bus?.emit("onDash", {});
      }
    }

    // ─── Spring charge / release ──────────────────────────────────────────
    // Spring is charged by holding Crouch. Releasing Crouch while a direction
    // (MoveLeft / MoveRight) is held fires the spring impulse in that direction
    // (with an upward component). Releasing Crouch with no direction held just
    // ends the crouch and discards any accumulated charge.
    //
    // NOTE: This block runs after horizontal movement so the spring impulse
    // is not immediately overwritten by the run-acceleration target velocity.
    if (!this._isDashing) {
      const crouchHeld = snap.buttonsDown.has("Crouch");
      const crouchReleased = snap.buttonsReleased.has("Crouch");

      if (crouchHeld) {
        this._springCharge = Math.min(1, this._springCharge + s.springChargeRate * dt);
        this._isSpringCharging = true;
      } else if (crouchReleased && this._isSpringCharging) {
        const dirX = snap.axes.moveX;
        if (dirX !== 0) {
          // Diagonal upward launch in the held horizontal direction.
          const sx = Math.sign(dirX);
          const len = Math.SQRT2;
          this._springDirX = sx / len;
          this._springDirY = -1 / len;
          const impulse = this._springCharge * s.springMaxImpulse;
          this.body.velocity.x += this._springDirX * impulse;
          this.body.velocity.y += this._springDirY * impulse;
          // Lock horizontal authority briefly so the run controller does not
          // immediately overwrite the spring's horizontal velocity.
          this._wallKickLockTimer = s.wallKickLockDuration;
          this._bus?.emit("onSpringRelease", {});
        }
        this._springCharge = 0;
        this._isSpringCharging = false;
      } else if (!crouchHeld && this._isSpringCharging) {
        // Crouch was lost without a release edge (e.g. on spawn). Reset.
        this._springCharge = 0;
        this._isSpringCharging = false;
      }
    }

    // ─── Horizontal movement ──────────────────────────────────────────────
    if (
      !this._isDashing &&
      !this._dashMomentumLock &&
      this._wallKickLockTimer <= 0
    ) {
      const accel = this._locomotion === "Grounded" ? s.groundAccel : s.airAccel;
      const targetVX = snap.axes.moveX * s.maxSpeed;
      const diff = targetVX - this.body.velocity.x;
      const maxChange = accel * dt;
      if (Math.abs(diff) <= maxChange) {
        this.body.velocity.x = targetVX;
      } else {
        this.body.velocity.x += Math.sign(diff) * maxChange;
      }
      if (snap.axes.moveX !== 0) {
        this._facing = snap.axes.moveX > 0 ? 1 : -1;
      }
    }

    // ─── Crouch ───────────────────────────────────────────────────────────
    if (snap.buttonsDown.has("Crouch")) {
      this._crouchHoldTimer += dt;
      if (!this._isCrouching) {
        this._isCrouching = true;
        // Shift center downward so the bottom of the body stays in place.
        const delta = s.standHalfH - s.crouchHalfH;
        this.body.position.y += delta;
        this.body.halfExtents.y = s.crouchHalfH;
      }
    } else {
      this._crouchHoldTimer = 0;
      if (this._isCrouching) {
        const delta = s.standHalfH - s.crouchHalfH;
        // Headroom check: do NOT expand the hitbox up into solid tiles or
        // we will softlock the player against the ceiling. If a world was
        // provided and the strip above the current crouch top contains any
        // solid tile within the body's horizontal footprint, remain crouched
        // until the player moves out from under the ceiling.
        let blocked = false;
        if (world !== undefined) {
          const halfW = this.body.halfExtents.x;
          const minX = this.body.position.x - halfW;
          const maxX = this.body.position.x + halfW;
          const currentTopY = this.body.position.y - s.crouchHalfH;
          // After uncrouching, position shifts up by `delta` and the new top
          // is at (oldPos - delta) - standHalfH = currentTopY - 2*delta.
          const newTopY = currentTopY - 2 * delta;
          const txMin = Math.floor(minX);
          // Use a tiny epsilon so we don't probe an extra cell when maxX
          // sits exactly on a tile boundary.
          const txMax = Math.floor(maxX - 1e-6);
          const tyMin = Math.floor(newTopY);
          // The strip we need clear is [newTopY, currentTopY).
          const tyMax = Math.floor(currentTopY - 1e-6);
          for (let ty = tyMin; ty <= tyMax && !blocked; ty++) {
            for (let tx = txMin; tx <= txMax; tx++) {
              if (world.solidAt(tx, ty)) {
                blocked = true;
                break;
              }
            }
          }
        }
        if (!blocked) {
          this._isCrouching = false;
          this.body.position.y -= delta;
          this.body.halfExtents.y = s.standHalfH;
        }
      }
    }

    // ─── Clamp fall speed ─────────────────────────────────────────────────
    if (this.body.velocity.y > s.maxFallSpeed) {
      this.body.velocity.y = s.maxFallSpeed;
    }

    // ─── Set gravity for the next physics step ────────────────────────────
    if (this._isDashing) {
      this.body.gravity = 0;
    } else if (this._locomotion === "WallSliding") {
      this.body.gravity = s.wallSlideGravity;
    } else {
      this.body.gravity = s.gravity;
    }

    // ─── Store previous state ─────────────────────────────────────────────
    this._wasGrounded = grounded;
  }

  // ─── Combat ───────────────────────────────────────────────────────────────

  /**
   * Apply damage to the player. I-frames are respected.
   *
   * @param damage     - HP to subtract.
   * @param knockbackX - Horizontal knockback velocity applied immediately (m/s).
   * @param knockbackY - Vertical knockback velocity applied immediately (m/s).
   * @returns `true` if damage was applied; `false` if blocked by i-frames.
   */
  takeDamage(damage: number, knockbackX: number, knockbackY: number): boolean {
    if (this._health.iFrameTimer > 0) return false;

    this._health.current = Math.max(0, this._health.current - damage);
    this.body.velocity.x = knockbackX;
    this.body.velocity.y = knockbackY;
    this._health.iFrameTimer = this._health.iFrameDuration;
    this._emitHpChanged();
    if (this._health.current <= 0 && !this._deathEmitted) {
      this._deathEmitted = true;
      this._bus?.emit("onPlayerDeath", { reason: "hp" });
    }
    return true;
  }

  // ─── Read-only accessors ──────────────────────────────────────────────────

  get locomotion(): LocomotionState {
    return this._locomotion;
  }
  get isCrouching(): boolean {
    return this._isCrouching;
  }
  get isDashing(): boolean {
    return this._isDashing;
  }
  get isSpringCharging(): boolean {
    return this._isSpringCharging;
  }
  get springCharge(): number {
    return this._springCharge;
  }
  get facing(): 1 | -1 {
    return this._facing;
  }
  get airJumpsUsed(): number {
    return this._airJumpsUsed;
  }
  get airDashesUsed(): number {
    return this._airDashesUsed;
  }
  get health(): Readonly<Health> {
    return this._health;
  }
  get isAlive(): boolean {
    return this._health.current > 0;
  }
  get iFrameTimer(): number {
    return this._health.iFrameTimer;
  }
  get crouchHoldTimer(): number {
    return this._crouchHoldTimer;
  }
  get coyoteTimer(): number {
    return this._coyoteTimer;
  }
  get jumpBufferTimer(): number {
    return this._jumpBufferTimer;
  }
  get dashCooldownTimer(): number {
    return this._dashCooldownTimer;
  }
  get dashTimer(): number {
    return this._dashTimer;
  }

  // ─── HP containers (Phase 7) ──────────────────────────────────────────────

  /** Number of unoccupied HP containers (containers - current HP). */
  get emptyContainers(): number {
    return this._health.containers - this._health.current;
  }

  /**
   * Consume one empty HP container (permanently loses the slot).
   * Used by UpgradeSystem when the player selects a patch.
   * @returns `true` if a container was consumed; `false` if none are empty.
   */
  consumeEmptyContainer(): boolean {
    if (this._health.containers <= this._health.current) return false;
    this._health.containers--;
    this._emitHpChanged();
    return true;
  }

  /**
   * Add one HP container and immediately fill it (for the +HP patch).
   * Both `containers` and `current` increase by 1.
   */
  gainContainer(): void {
    this._health.containers++;
    this._health.current++;
    this._emitHpChanged();
  }

  /** Manually re-emit `onHpChanged` (used by main.ts on game start / reset). */
  emitHpSnapshot(): void {
    this._emitHpChanged();
  }

  get wallKickLockTimer(): number {
    return this._wallKickLockTimer;
  }
}
