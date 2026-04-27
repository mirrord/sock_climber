import { Obstacle } from "./Obstacle.js";

/**
 * Lighter — periodic flame jet with a telegraphed cycle.
 *
 * Cycle phases (looping):
 * - **Safe**   (`SAFE_TIME` seconds) — flame off, hitbox inactive.
 * - **Active** (`ACTIVE_TIME` seconds) — flame jet on, hitbox active, deals damage.
 */
export class Lighter extends Obstacle {
  static readonly SAFE_TIME = 1.5; // seconds between flame bursts
  static readonly ACTIVE_TIME = 0.75; // seconds the flame is active

  private _phase: "safe" | "active" = "safe";
  private _phaseTimer = 0;

  constructor(position: { x: number; y: number }) {
    super({
      position,
      halfW: 0.3,
      halfH: 0.6,
      damage: 1,
      knockbackX: 2,
      knockbackY: -6,
    });
    // Starts in safe phase.
    this.hitbox.active = false;
  }

  get phase(): "safe" | "active" {
    return this._phase;
  }

  get flameActive(): boolean {
    return this._phase === "active";
  }

  protected override onSpawn(): void {
    this._phase = "safe";
    this._phaseTimer = 0;
    this.hitbox.active = false;
  }

  protected updateObstacle(dt: number): void {
    this._phaseTimer += dt;

    if (this._phase === "safe" && this._phaseTimer >= Lighter.SAFE_TIME) {
      this._phase = "active";
      this._phaseTimer = 0;
      this.hitbox.active = true;
    } else if (this._phase === "active" && this._phaseTimer >= Lighter.ACTIVE_TIME) {
      this._phase = "safe";
      this._phaseTimer = 0;
      this.hitbox.active = false;
    }
  }
}
