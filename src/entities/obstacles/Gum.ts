import { Obstacle } from "./Obstacle.js";
import type { Player } from "../Player.js";

/**
 * Gum — trigger volume that slows the player and significantly reduces jump
 * height while the player is overlapping.
 *
 * Uses the player's stat-mod system:
 * - `maxSpeed`     is multiplied by `SPEED_MULT` (40 %).
 * - `jumpVelocity` is multiplied by `JUMP_MULT`  (50 %).
 *
 * The multipliers are stored as additive deltas so they compose correctly with
 * other active mods (buffs, patches).
 */
export class Gum extends Obstacle {
  /** Effective speed fraction while inside Gum (0–1). */
  static readonly SPEED_MULT = 0.4;
  /** Effective jump-impulse fraction while inside Gum (0–1). */
  static readonly JUMP_MULT = 0.5;

  private _playerInside = false;

  constructor(position: { x: number; y: number }, halfW = 1.0, halfH = 0.375) {
    super({ position, halfW, halfH, isTrigger: true, damage: 0 });
  }

  protected override onSpawn(): void {
    this._playerInside = false;
  }

  protected override onDespawn(): void {
    // Mod is removed in processPlayer when the player moves out, or explicitly here.
  }

  protected updateObstacle(_dt: number): void {
    // No independent animation — logic driven by processPlayer.
  }

  /**
   * Call once per step to apply or remove the slow effect based on player overlap.
   *
   * @param player - The player entity to test and affect.
   */
  processPlayer(player: Player): void {
    const hbX = this.body.position.x;
    const hbY = this.body.position.y;
    const hw = this.body.halfExtents.x;
    const hh = this.body.halfExtents.y;
    const overlapX = Math.abs(hbX - player.body.position.x) < hw + player.body.halfExtents.x;
    const overlapY = Math.abs(hbY - player.body.position.y) < hh + player.body.halfExtents.y;
    const inside = overlapX && overlapY;

    if (inside && !this._playerInside) {
      // Use delta semantics: delta = base * (mult - 1)
      player.applyStatMod(`gum_${this.id}`, {
        maxSpeed: player.stats.maxSpeed * (Gum.SPEED_MULT - 1),
        jumpVelocity: player.stats.jumpVelocity * (Gum.JUMP_MULT - 1),
      });
    } else if (!inside && this._playerInside) {
      player.removeStatMod(`gum_${this.id}`);
    }

    this._playerInside = inside;
  }

  /** `true` while the player is currently inside the Gum volume. */
  get isPlayerInside(): boolean {
    return this._playerInside;
  }
}
