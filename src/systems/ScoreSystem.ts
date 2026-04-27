import type { EventBus, GameEvents } from "../core/EventBus.js";

/** End-of-run statistics returned by `ScoreSystem.getSummary()`. */
export interface RunSummary {
  /** Maximum distance climbed (metres). Equals `max(-playerY)` seen during the run. */
  distanceTraversed: number;
  /** Total enemies killed during the run. */
  enemiesKilled: number;
  /** Reason for death, e.g. `'drowned'`. Empty string if the run has not ended. */
  deathReason: string;
}

/**
 * ScoreSystem — tracks climb distance and kill count; produces a `RunSummary`
 * on demand.
 *
 * - `update(playerY)` must be called once per fixed step with the player's Y.
 * - Subscribes to `onKill` and `onPlayerDeath` via the event bus.
 */
export class ScoreSystem {
  private _maxDistance = 0;
  private _lastEmittedDistance = -1;
  private _enemiesKilled = 0;
  private _deathReason = "";
  private readonly _bus: EventBus<GameEvents>;

  constructor(bus: EventBus<GameEvents>) {
    this._bus = bus;
    bus.on("onKill", () => {
      this._enemiesKilled++;
    });

    bus.on("onPlayerDeath", ({ reason }) => {
      this._deathReason = reason;
    });
  }

  /**
   * Update climb distance from the player's current Y position.
   * Negative Y = height climbed above spawn.
   */
  update(playerY: number): void {
    // Climbing upward produces negative Y; distance = -Y (floored at 0).
    const dist = Math.max(0, -playerY);
    if (dist > this._maxDistance) {
      this._maxDistance = dist;
      // Emit whenever distance crosses a new whole-metre threshold.
      const metres = Math.floor(dist);
      if (metres > this._lastEmittedDistance) {
        this._lastEmittedDistance = metres;
        this._bus.emit("onDistanceChanged", { distance: metres });
      }
    }
  }

  /** Returns a snapshot of current run statistics. */
  getSummary(): RunSummary {
    return {
      distanceTraversed: this._maxDistance,
      enemiesKilled: this._enemiesKilled,
      deathReason: this._deathReason,
    };
  }
}
