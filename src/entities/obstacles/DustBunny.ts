import { Obstacle } from "./Obstacle.js";
import type { Player } from "../Player.js";

/**
 * DustBunny — one-shot obstacle that explodes on contact.
 *
 * After the explosion, a smoke overlay is "active" for `SMOKE_DURATION` seconds
 * (render layer reads `smokeActive`).  The explosion also deals `DAMAGE` to the
 * player; subsequent contact is inert.
 */
export class DustBunny extends Obstacle {
  static readonly DAMAGE = 1;
  static readonly SMOKE_DURATION = 4; // seconds
  /** Gravity applied to a ballistic (boss-thrown) dust bunny in m/s². */
  static readonly BALLISTIC_GRAVITY = 30;

  private _hasExploded = false;
  private _smokeTimer = 0;
  /**
   * `true` once `setBallistic()` has been called. Enables per-frame
   * Euler integration of the body's velocity (and gravity) inside
   * `updateObstacle()` so boss-thrown bunnies arc toward the player
   * without requiring the physics resolver to step obstacles.
   */
  private _ballistic = false;

  constructor(position: { x: number; y: number }) {
    super({
      position,
      halfW: 0.4,
      halfH: 0.4,
      isTrigger: false,
      damage: DustBunny.DAMAGE,
      knockbackX: 3,
      knockbackY: -5,
    });
    // Hitbox starts inactive; activated by processPlayer when triggered.
  }

  get hasExploded(): boolean {
    return this._hasExploded;
  }

  get smokeActive(): boolean {
    return this._smokeTimer > 0;
  }

  get smokeTimer(): number {
    return this._smokeTimer;
  }

  /**
   * Launch this dust bunny on a ballistic trajectory (boss-throw). After
   * this call `updateObstacle` integrates the body's velocity and applies
   * gravity each step until the bunny explodes on player contact.
   *
   * @param vx - Initial horizontal velocity in m/s.
   * @param vy - Initial vertical velocity in m/s (negative = upward).
   */
  setBallistic(vx: number, vy: number): void {
    this._ballistic = true;
    this.body.velocity.x = vx;
    this.body.velocity.y = vy;
  }

  /** `true` once the bunny is in ballistic flight (set by the boss). */
  get isBallistic(): boolean {
    return this._ballistic;
  }

  protected override onSpawn(): void {
    this._hasExploded = false;
    this._smokeTimer = 0;
    this._ballistic = false;
    this.hitbox.active = false;
  }

  protected updateObstacle(dt: number): void {
    if (this._smokeTimer > 0) {
      this._smokeTimer = Math.max(0, this._smokeTimer - dt);
    }
    // Ballistic motion: integrate velocity and apply gravity manually so
    // that boss-thrown bunnies arc through the air without the physics
    // resolver needing to step every obstacle. Stops integrating once
    // the bunny has exploded.
    if (this._ballistic && !this._hasExploded) {
      this.body.velocity.y += DustBunny.BALLISTIC_GRAVITY * dt;
      this.body.position.x += this.body.velocity.x * dt;
      this.body.position.y += this.body.velocity.y * dt;
    }
  }

  /**
   * Check player overlap. On first contact, explode: deal damage and start smoke.
   * @param player - The player entity.
   * @returns `true` if the explosion was triggered this call.
   */
  processPlayer(player: Player): boolean {
    if (this._hasExploded) return false;

    const hw = this.body.halfExtents.x;
    const hh = this.body.halfExtents.y;
    const overlapX =
      Math.abs(this.body.position.x - player.body.position.x) < hw + player.body.halfExtents.x;
    const overlapY =
      Math.abs(this.body.position.y - player.body.position.y) < hh + player.body.halfExtents.y;

    if (overlapX && overlapY) {
      this._hasExploded = true;
      this._smokeTimer = DustBunny.SMOKE_DURATION;
      // Apply damage directly — facing away from bunny.
      const facing = (Math.sign(player.body.position.x - this.body.position.x) || 1) as 1 | -1;
      player.takeDamage(
        DustBunny.DAMAGE,
        this.hitbox.knockbackX * facing,
        this.hitbox.knockbackY,
      );
      return true;
    }

    return false;
  }
}
