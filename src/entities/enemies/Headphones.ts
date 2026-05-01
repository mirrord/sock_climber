import { Enemy } from "./Enemy.js";
import { createHitbox } from "../components/Hitbox.js";
import type { Hitbox } from "../components/Hitbox.js";

/** AI states for the Headphones enemy. */
export type HeadphonesState = "Drift" | "WindUp" | "Tangle";

/**
 * Headphones — drifts via a "cord" tether around a fixed anchor point,
 * then winds up and fires a ranged tangle attack that slows the player.
 *
 * State machine:
 * - `Drift`   → drifts back toward the anchor for `DRIFT_TIME` s.
 * - `WindUp`  → pauses for `WINDUP_TIME` s (telegraph).
 * - `Tangle`  → `tangleHitbox` becomes active for `TANGLE_TIME` s; slows any
 *               player caught in the hitbox (caller reads `tangleHitbox.active`).
 */
export class Headphones extends Enemy {
  static readonly DRIFT_TIME = 2.0; // seconds
  static readonly WINDUP_TIME = 0.5; // seconds
  static readonly TANGLE_TIME = 0.6; // seconds
  static readonly DRIFT_SPEED = 1.5; // m/s toward anchor
  static readonly TANGLE_RANGE = 4; // half-width of tangle hitbox (meters)
  /** Duration of the slow applied to the player when tangled (seconds). */
  static readonly TANGLE_SLOW_DURATION = 2;

  private _state: HeadphonesState = "Drift";
  private _timer = Headphones.DRIFT_TIME;

  /** Anchor point — Headphones drift back to this position. */
  readonly anchor: Readonly<{ x: number; y: number }>;

  /**
   * Ranged tangle hitbox.
   * `active` is `true` during the `Tangle` state window.
   * Callers check `tangleHitbox.active && overlap(player)` to apply the slow.
   */
  readonly tangleHitbox: Hitbox;

  constructor(position: { x: number; y: number }) {
    super({
      position,
      halfW: 0.5,
      halfH: 0.375,
      maxHp: 2,
      gaugeReward: 1,
      gravity: 5, // floats
    });
    this.anchor = { x: position.x, y: position.y };
    // Tangle hitbox: wide, centered on the enemy, no direct damage.
    this.tangleHitbox = createHitbox(0, 0, Headphones.TANGLE_RANGE, 0.5, 0);
  }

  get state(): HeadphonesState {
    return this._state;
  }

  protected override onSpawn(): void {
    this._state = "Drift";
    this._timer = Headphones.DRIFT_TIME;
    this.tangleHitbox.active = false;
  }

  protected updateAI(dt: number, _playerX: number, _playerY: number): void {
    this._timer -= dt;

    switch (this._state) {
      case "Drift": {
        // Drift back toward anchor.
        const dx = this.anchor.x - this.body.position.x;
        const dy = this.anchor.y - this.body.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0.01) {
          this.body.velocity.x = (dx / dist) * Headphones.DRIFT_SPEED;
          this.body.velocity.y = (dy / dist) * Headphones.DRIFT_SPEED;
        } else {
          this.body.velocity.x = 0;
          this.body.velocity.y = 0;
        }
        if (this._timer <= 0) {
          this.body.velocity.x = 0;
          this.body.velocity.y = 0;
          this._state = "WindUp";
          this._timer = Headphones.WINDUP_TIME;
        }
        break;
      }

      case "WindUp":
        this.body.velocity.x = 0;
        this.body.velocity.y = 0;
        if (this._timer <= 0) {
          this.tangleHitbox.active = true;
          this._state = "Tangle";
          this._timer = Headphones.TANGLE_TIME;
        }
        break;

      case "Tangle":
        if (this._timer <= 0) {
          this.tangleHitbox.active = false;
          this._state = "Drift";
          this._timer = Headphones.DRIFT_TIME;
        }
        break;
    }
  }
}
