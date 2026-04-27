import { nextEntityId } from "../Entity.js";
import type { Entity } from "../Entity.js";
import type { Player } from "../Player.js";
import type { PlayerStats } from "../components/Stats.js";

/** Options for constructing a Buff pickup. */
export interface BuffOptions {
  position: { x: number; y: number };
  halfW?: number;
  halfH?: number;
  /** Duration of the effect in seconds. */
  duration: number;
  /**
   * Additive stat deltas applied to the player while the buff is active.
   * Values are added on top of the base stats (and all other active mods).
   */
  statMod: Partial<PlayerStats>;
  /**
   * Unique key used to register the mod with the player's stat-mod system.
   * Must be unique per buff type (not per instance, since only one of each
   * type can be active at a time thanks to duration refresh).
   */
  modKey: string;
}

/**
 * Buff — a pickup sock that temporarily modifies `PlayerStats`.
 *
 * Lifecycle:
 * 1. Spawn: the pickup is visible and available.
 * 2. Collection (`tryCollect`): player overlaps → stat mod is applied, timer starts.
 * 3. Active: `update(dt)` ticks down the timer.
 * 4. Expiry: stat mod is removed from the player; pickup becomes available again.
 *
 * Re-collection while active **refreshes** the timer without re-applying the
 * stat delta (no stacking magnitude).
 *
 * All active buffs are removed from the player on `player.spawn()` (death/respawn).
 */
export class Buff implements Entity {
  readonly id: number;

  /** World-space center of the pickup. */
  readonly position: { x: number; y: number };

  readonly halfW: number;
  readonly halfH: number;

  /** Duration of the effect in seconds. */
  readonly duration: number;

  /** Additive stat deltas applied while active. */
  readonly statMod: Readonly<Partial<PlayerStats>>;

  /** Key used to register/remove the stat mod on the player. */
  readonly modKey: string;

  private _collected = false;
  private _timer = 0;
  private _activePlayer: Player | null = null;

  constructor(opts: BuffOptions) {
    this.id = nextEntityId();
    this.position = { x: opts.position.x, y: opts.position.y };
    this.halfW = opts.halfW ?? 0.3;
    this.halfH = opts.halfH ?? 0.3;
    this.duration = opts.duration;
    this.statMod = opts.statMod;
    this.modKey = opts.modKey;
  }

  // ── Entity lifecycle ──────────────────────────────────────────────────────

  spawn(): void {
    if (this._activePlayer !== null) {
      this._activePlayer.removeStatMod(this.modKey);
      this._activePlayer = null;
    }
    this._collected = false;
    this._timer = 0;
  }

  despawn(): void {
    if (this._activePlayer !== null) {
      this._activePlayer.removeStatMod(this.modKey);
      this._activePlayer = null;
    }
    this._collected = false;
  }

  /**
   * Tick down the buff timer. Removes the stat mod when duration expires.
   * @param dt - Step size in seconds.
   */
  update(dt: number): void {
    if (!this._collected || this._activePlayer === null) return;
    this._timer -= dt;
    if (this._timer <= 0) {
      this._activePlayer.removeStatMod(this.modKey);
      this._activePlayer = null;
      this._collected = false;
    }
  }

  // ── Collection ────────────────────────────────────────────────────────────

  /**
   * Check AABB overlap and collect the buff if the player is inside.
   *
   * - First collection: applies stat mod, starts timer.
   * - Re-collection while active: refreshes timer only (no extra magnitude).
   *
   * @param player - The player entity.
   * @returns `true` if the player overlaps the pickup (regardless of first/re-collect).
   */
  tryCollect(player: Player): boolean {
    const overlapX =
      Math.abs(this.position.x - player.body.position.x) <
      this.halfW + player.body.halfExtents.x;
    const overlapY =
      Math.abs(this.position.y - player.body.position.y) <
      this.halfH + player.body.halfExtents.y;

    if (!overlapX || !overlapY) return false;

    if (this._collected && this._activePlayer === player) {
      // Refresh duration — do not re-apply mod.
      this._timer = this.duration;
      return true;
    }

    if (!this._collected) {
      this._collected = true;
      this._activePlayer = player;
      this._timer = this.duration;
      player.applyStatMod(this.modKey, this.statMod);
      return true;
    }

    return false;
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  /** `true` while the buff effect is active (picked up and timer > 0). */
  get isActive(): boolean {
    return this._collected;
  }

  /** Seconds remaining on the active effect (0 when inactive). */
  get remainingTime(): number {
    return this._timer;
  }
}
