import { createBody } from "../../physics/Body.js";
import type { Body } from "../../physics/Body.js";
import { createHitbox } from "../components/Hitbox.js";
import type { Hitbox } from "../components/Hitbox.js";
import { nextEntityId } from "../Entity.js";
import type { Entity } from "../Entity.js";
import type { Player } from "../Player.js";

/** Options for constructing any Obstacle. */
export interface ObstacleOptions {
  position: { x: number; y: number };
  halfW: number;
  halfH: number;
  /** `true` = trigger volume (non-solid, no physics push-back). Default `false`. */
  isTrigger?: boolean;
  /** Damage dealt to player per hit. Default 1. */
  damage?: number;
  /** Horizontal knockback on hit (undirected; callers orient as needed). Default 0. */
  knockbackX?: number;
  /** Vertical knockback on hit (negative = upward). Default -4. */
  knockbackY?: number;
  /** Gravitational acceleration. Default 0 (static). */
  gravity?: number;
}

/**
 * Abstract base class for all obstacles.
 *
 * Obstacles are **invincible** — they cannot be damaged by the player.
 * They either deal contact damage, apply status effects, or both.
 *
 * Subclasses implement `updateObstacle(dt)` for cycle/animation logic and
 * call `applyContactDamage(player)` (or implement their own `processPlayer`)
 * to interact with the player.
 */
export abstract class Obstacle implements Entity {
  readonly id: number;

  /** AABB body (static by default — gravity = 0). */
  readonly body: Body;

  /**
   * Interaction hitbox.
   * For damage obstacles: `active` is `true` during the damage window.
   * For trigger volumes (Gum): logic is in `processPlayer` rather than `active`.
   */
  readonly hitbox: Hitbox;

  /** `true` when this is a trigger volume (non-solid). */
  readonly isTrigger: boolean;

  constructor(opts: ObstacleOptions) {
    this.id = nextEntityId();
    this.body = createBody({
      position: opts.position,
      halfExtents: { x: opts.halfW, y: opts.halfH },
      gravity: opts.gravity ?? 0,
    });
    this.isTrigger = opts.isTrigger ?? false;
    this.hitbox = createHitbox(
      0,
      0,
      opts.halfW,
      opts.halfH,
      opts.damage ?? 1,
      opts.knockbackX ?? 0,
      opts.knockbackY ?? -4,
    );
  }

  // ── Entity lifecycle ──────────────────────────────────────────────────────

  spawn(): void {
    this.body.velocity.x = 0;
    this.body.velocity.y = 0;
    this.onSpawn();
  }

  despawn(): void {
    this.onDespawn();
  }

  update(dt: number): void {
    this.updateObstacle(dt);
  }

  protected onSpawn(): void {}
  protected onDespawn(): void {}

  /** Subclass-specific per-step logic (timers, phase changes). */
  protected abstract updateObstacle(dt: number): void;

  // ── Contact damage helper ─────────────────────────────────────────────────

  /**
   * Test AABB overlap between this obstacle's hitbox and the player.
   * Calls `player.takeDamage` if the hitbox is `active` and overlapping.
   *
   * @returns `true` if damage was applied.
   */
  applyContactDamage(player: Player): boolean {
    if (!this.hitbox.active) return false;
    const hb = this.hitbox;
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
}
