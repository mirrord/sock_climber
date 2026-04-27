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

  private _hasExploded = false;
  private _smokeTimer = 0;

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

  protected override onSpawn(): void {
    this._hasExploded = false;
    this._smokeTimer = 0;
    this.hitbox.active = false;
  }

  protected updateObstacle(dt: number): void {
    if (this._smokeTimer > 0) {
      this._smokeTimer = Math.max(0, this._smokeTimer - dt);
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
