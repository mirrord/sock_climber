import type { EventBus, GameEvents } from "../core/EventBus.js";
import type { Body } from "../physics/Body.js";

/** Construction options for `DeathPlaneSystem`. All values in SI units. */
export interface DeathPlaneOptions {
  /** Starting Y position of the plane (positive = below spawn). Default: 20. */
  startY?: number;
  /** Base ascent speed in m/s. Default: 1.5. */
  baseSpeed?: number;
  /** Speed increase per `onSegmentCross` event in m/s. Default: 0.1. */
  segCrossBump?: number;
  /** Speed increase per `onPatchApplied` event in m/s. Default: 0.2. */
  patchBump?: number;
}

/**
 * DeathPlaneSystem — manages the monotonically rising death plane.
 *
 * The plane starts below the player and ascends over time. Segment crossings
 * and patch applications increase its speed (never decreased). When the
 * player's bottom edge touches or passes the plane, `onPlayerDeath` is emitted.
 */
export class DeathPlaneSystem {
  private _planeY: number;
  private _speed: number;
  private readonly _segCrossBump: number;
  private readonly _patchBump: number;
  private _dead = false;
  private readonly _bus: EventBus<GameEvents>;

  constructor(bus: EventBus<GameEvents>, opts: DeathPlaneOptions = {}) {
    this._bus = bus;
    this._planeY = opts.startY ?? 20;
    this._speed = opts.baseSpeed ?? 1.5;
    this._segCrossBump = opts.segCrossBump ?? 0.1;
    this._patchBump = opts.patchBump ?? 0.2;

    bus.on("onSegmentCross", () => {
      this._speed += this._segCrossBump;
    });

    bus.on("onPatchApplied", () => {
      this._speed += this._patchBump;
    });
  }

  /**
   * Advance the plane and check player contact.
   *
   * @param dt                        - Fixed step in seconds.
   * @param playerBody                - The player's physics body.
   * @param deathPlaneSpeedMultiplier - Scale factor from player stats; floored at 0.1.
   */
  update(dt: number, playerBody: Body, deathPlaneSpeedMultiplier = 1): void {
    if (this._dead) return;

    const multiplier = Math.max(0.1, deathPlaneSpeedMultiplier);
    this._planeY -= this._speed * multiplier * dt;

    // Player bottom edge = position.y + halfExtents.y (positive Y is downward).
    const playerBottom = playerBody.position.y + playerBody.halfExtents.y;
    if (playerBottom >= this._planeY) {
      this._dead = true;
      this._bus.emit("onPlayerDeath", { reason: "drowned" });
    }
  }

  /** Current Y position of the plane. */
  get planeY(): number {
    return this._planeY;
  }

  /** Current ascent speed in m/s (monotonically non-decreasing). */
  get speed(): number {
    return this._speed;
  }
}
