import { Obstacle } from "./Obstacle.js";

/**
 * Pen — always-active spike trap.
 *
 * The hitbox is permanently active; it deals damage on every contact that
 * is not blocked by the player's i-frames.
 */
export class Pen extends Obstacle {
  constructor(position: { x: number; y: number }) {
    super({
      position,
      halfW: 0.2,
      halfH: 0.5,
      damage: 1,
      knockbackX: 0,
      knockbackY: -5,
    });
    this.hitbox.active = true;
  }

  protected override onSpawn(): void {
    this.hitbox.active = true;
  }

  protected updateObstacle(_dt: number): void {
    // Always active — no cycle logic needed.
  }
}
