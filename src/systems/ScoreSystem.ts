import type { EventBus, GameEvents } from "../core/EventBus.js";
import { CLIMB_DIR_VERTICAL, climbProgress, type ClimbDir } from "../level/Axis.js";

/** End-of-run statistics returned by `ScoreSystem.getSummary()`. */
export interface RunSummary {
  /** Maximum distance climbed (metres) along the configured climb direction. */
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
  private _dir: ClimbDir;

  constructor(bus: EventBus<GameEvents>, climbDir: ClimbDir = CLIMB_DIR_VERTICAL) {
    this._bus = bus;
    this._dir = climbDir;
    bus.on("onKill", () => {
      this._enemiesKilled++;
    });

    bus.on("onPlayerDeath", ({ reason }) => {
      this._deathReason = reason;
    });
  }

  /**
   * Update climb distance from the player's current world position.
   *
   * Accepts either a single number (player Y, level-1 backward-compat —
   * only meaningful when this system was constructed with the default
   * vertical climb direction) or a `{x, y}` position (preferred; works
   * for `"x"` / `"y"` climb axes).
   *
   * For path-axis climb directions (level 3) `pathProgress` must be
   * supplied — the bare position is opaque to this system.
   */
  update(
    playerPos: number | { x: number; y: number },
    pathProgress?: number,
  ): void {
    const pos =
      typeof playerPos === "number" ? { x: 0, y: playerPos } : playerPos;
    const dist = Math.max(0, climbProgress(pos, this._dir, pathProgress));
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

  /** Reset all counters for a new run. */
  reset(): void {
    this._maxDistance = 0;
    this._lastEmittedDistance = -1;
    this._enemiesKilled = 0;
    this._deathReason = "";
  }

  /**
   * Reconfigure the climb direction. Used when switching levels so that
   * the same `ScoreSystem` instance can track progress along a new axis
   * (e.g. level 1 → level 2). Callers should follow with `reset()`.
   */
  setClimbDir(dir: ClimbDir): void {
    this._dir = dir;
  }
}
