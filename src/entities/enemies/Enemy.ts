import { createBody } from "../../physics/Body.js";
import type { Body } from "../../physics/Body.js";
import { createHealth } from "../components/Health.js";
import type { Health } from "../components/Health.js";
import { createHitbox } from "../components/Hitbox.js";
import type { Hitbox } from "../components/Hitbox.js";
import { nextEntityId } from "../Entity.js";
import type { Entity } from "../Entity.js";
import type { Damageable } from "../../systems/CombatSystem.js";
import type { Player } from "../Player.js";

/** Options for constructing any Enemy. */
export interface EnemyOptions {
  position: { x: number; y: number };
  halfW: number;
  halfH: number;
  maxHp: number;
  /** I-frame duration after being hit. Defaults to 0.5 s. */
  iFrameDuration?: number;
  /** Contact damage dealt to the player per hit. Defaults to 1. */
  contactDamage?: number;
  /** Horizontal knockback applied to player on contact (directed away). Defaults to 4. */
  contactKnockbackX?: number;
  /** Vertical knockback applied to player on contact (negative = upward). Defaults to -4. */
  contactKnockbackY?: number;
  /** Upgrade gauge fill awarded to the player on death. Defaults to 1. */
  gaugeReward?: number;
  /** Gravitational acceleration in m/s². Defaults to 30. */
  gravity?: number;
}

/**
 * Abstract base class for all enemies.
 *
 * Implements the `Entity` lifecycle and satisfies the `Damageable` interface so
 * `CombatSystem` can resolve player-attack hits.
 *
 * Subclasses own their AI state machine via `updateAI(dt, playerX, playerY)`.
 */
export abstract class Enemy implements Entity, Damageable {
  /**
   * Duration (seconds) the AI is suspended after taking a hit, allowing the
   * knockback velocity imparted by `takeDamage` to actually move the body
   * (and resolve against walls via the physics step) instead of being
   * immediately overwritten by the AI's own velocity assignments.
   */
  static readonly HIT_STUN_DURATION = 0.15;

  readonly id: number;

  /** AABB physics body. Advanced by the physics resolver after each step. */
  readonly body: Body;

  /**
   * Contact hurt-box used to deal damage to the player on overlap.
   * Matches the full body extents; always active.
   */
  readonly contactHitbox: Hitbox;

  protected _health: Health;

  /** Remaining hit-stun in seconds; while > 0, `updateAI` is skipped. */
  protected _hitStunTimer = 0;

  /** Upgrade gauge fill awarded to the player when this enemy dies. */
  readonly gaugeReward: number;

  /**
   * Whether this enemy has been revealed by the camera at least once.
   *
   * While `false`, `update()` skips the subclass `updateAI()` step so the
   * enemy holds its spawn pose and does not begin moving toward the player.
   * The game loop sets this to `true` once the enemy enters the visible
   * viewport; it is sticky (never reset to `false`).
   *
   * Defaults to `true` so unit tests that construct enemies directly are
   * unaffected; the level generator explicitly sets `false` for entities it
   * spawns into the world.
   */
  revealed = true;

  constructor(opts: EnemyOptions) {
    this.id = nextEntityId();
    this.body = createBody({
      position: opts.position,
      halfExtents: { x: opts.halfW, y: opts.halfH },
      gravity: opts.gravity ?? 30,
    });
    this._health = createHealth(opts.maxHp, opts.iFrameDuration ?? 0.5);
    this.gaugeReward = opts.gaugeReward ?? 1;
    this.contactHitbox = createHitbox(
      0,
      0,
      opts.halfW,
      opts.halfH,
      opts.contactDamage ?? 1,
      opts.contactKnockbackX ?? 4,
      opts.contactKnockbackY ?? -4,
    );
    this.contactHitbox.active = true;
  }

  // ── Damageable ────────────────────────────────────────────────────────────

  get position(): Readonly<{ x: number; y: number }> {
    return this.body.position;
  }

  get halfExtents(): Readonly<{ x: number; y: number }> {
    return this.body.halfExtents;
  }

  get hp(): number {
    return this._health.current;
  }

  set hp(v: number) {
    this._health.current = v;
  }

  /**
   * Apply damage and knockback. Respects i-frames.
   * @returns `true` if damage was taken; `false` if blocked by i-frames.
   */
  takeDamage(damage: number, knockbackX: number, knockbackY: number): boolean {
    if (this._health.iFrameTimer > 0) return false;
    this._health.current = Math.max(0, this._health.current - damage);
    // Overwrite (not add) so AI-driven velocity from this same step does not
    // dominate the knockback impulse.
    this.body.velocity.x = knockbackX;
    this.body.velocity.y = knockbackY;
    if (damage > 0) {
      this._health.iFrameTimer = this._health.iFrameDuration;
      this._hitStunTimer = Enemy.HIT_STUN_DURATION;
    }
    return true;
  }

  get isAlive(): boolean {
    return this._health.current > 0;
  }

  get iFrameTimer(): number {
    return this._health.iFrameTimer;
  }

  // ── Contact damage ────────────────────────────────────────────────────────

  /**
   * Test AABB overlap between this enemy's contact hitbox and the player.
   * Calls `player.takeDamage` if overlapping.
   *
   * The knockback direction is automatically oriented away from this enemy.
   *
   * @returns `true` if damage was applied.
   */
  applyContactDamage(player: Player): boolean {
    const hb = this.contactHitbox;
    const hbX = this.body.position.x + hb.offsetX;
    const hbY = this.body.position.y + hb.offsetY;
    const overlapX =
      Math.abs(hbX - player.body.position.x) < hb.halfW + player.body.halfExtents.x;
    const overlapY =
      Math.abs(hbY - player.body.position.y) < hb.halfH + player.body.halfExtents.y;
    if (overlapX && overlapY) {
      const facing = (Math.sign(player.body.position.x - this.body.position.x) || 1) as 1 | -1;
      return player.takeDamage(hb.damage, hb.knockbackX * facing, hb.knockbackY);
    }
    return false;
  }

  // ── Entity lifecycle ──────────────────────────────────────────────────────

  spawn(): void {
    this._health.current = this._health.containers;
    this._health.iFrameTimer = 0;
    this._hitStunTimer = 0;
    this.body.velocity.x = 0;
    this.body.velocity.y = 0;
    this.onSpawn();
  }

  despawn(): void {
    this.onDespawn();
  }

  /** Called at the end of `spawn()`. Subclasses reset their AI state here. */
  protected onSpawn(): void {}
  /** Called at the end of `despawn()`. */
  protected onDespawn(): void {}

  /**
   * Advance AI one fixed timestep.
   *
   * @param dt      - Step size in seconds.
   * @param playerX - Player center X in world units (meters).
   * @param playerY - Player center Y in world units (meters).
   */
  update(dt: number, playerX = 0, playerY = 0): void {
    if (this._health.iFrameTimer > 0) {
      this._health.iFrameTimer = Math.max(0, this._health.iFrameTimer - dt);
    }
    if (this._hitStunTimer > 0) {
      this._hitStunTimer = Math.max(0, this._hitStunTimer - dt);
      // While stunned, let the knockback velocity carry the body through the
      // physics step. Skip AI so it does not overwrite that velocity.
      return;
    }
    if (this.isAlive && this.revealed) this.updateAI(dt, playerX, playerY);
  }

  /** Subclass-specific AI logic. Only called while alive. */
  protected abstract updateAI(dt: number, playerX: number, playerY: number): void;
}
