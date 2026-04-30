import { Obstacle } from "./Obstacle.js";

/**
 * DryerSheet — projectile launched by the player when their `Softener`
 * charge is consumed by an attack. Travels in a straight line ignoring
 * gravity and walls; despawns after `LIFETIME` seconds or after first
 * contact (handled by the caller in main.ts).
 *
 * The sheet itself does no contact damage to the player and is spawned
 * with `isTrigger: true` so the physics resolver never pushes against
 * it. Hit-resolution against dust bunnies and the boss is performed by
 * the main loop, which iterates live sheets vs live entities each
 * frame.
 */
export class DryerSheet extends Obstacle {
  static readonly SPEED = 18; // m/s horizontal
  static readonly LIFETIME = 1.5; // seconds
  static readonly HALF_W = 0.6;
  static readonly HALF_H = 0.4;

  /** Remaining lifetime in seconds; reaches 0 → despawn. */
  private _life = DryerSheet.LIFETIME;
  /** Direction the sheet is travelling: -1 (left) or +1 (right). */
  private _dir: 1 | -1 = 1;
  /** Set true once a hit is registered or lifetime expires. */
  private _expired = false;

  constructor(position: { x: number; y: number }, direction: 1 | -1 = 1) {
    super({
      position,
      halfW: DryerSheet.HALF_W,
      halfH: DryerSheet.HALF_H,
      isTrigger: true,
      damage: 0,
      knockbackX: 0,
      knockbackY: 0,
      gravity: 0,
    });
    this._dir = direction;
    this.body.velocity.x = direction * DryerSheet.SPEED;
    this.body.velocity.y = 0;
    // Hit-box never deals contact damage to the player.
    this.hitbox.active = false;
  }

  /** `true` once the sheet should be culled from the live entity list. */
  get expired(): boolean {
    return this._expired;
  }

  /** Mark this sheet for cull after a successful hit. */
  consume(): void {
    this._expired = true;
  }

  /** Direction the sheet is travelling (-1 left, +1 right). */
  get direction(): 1 | -1 {
    return this._dir;
  }

  protected updateObstacle(dt: number): void {
    if (this._expired) return;
    // Manual integration — the sheet is not stepped by the physics
    // resolver (passes through walls).
    this.body.position.x += this.body.velocity.x * dt;
    this.body.position.y += this.body.velocity.y * dt;
    this._life -= dt;
    if (this._life <= 0) this._expired = true;
  }
}
