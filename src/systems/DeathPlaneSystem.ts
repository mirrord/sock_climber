import type { EventBus, GameEvents } from "../core/EventBus.js";
import type { Body } from "../physics/Body.js";
import { CLIMB_DIR_VERTICAL, type ClimbDir } from "../level/Axis.js";

/** Construction options for `DeathPlaneSystem`. All values in SI units. */
export interface DeathPlaneOptions {
  /**
   * Climb direction the plane is chasing the player along. Defaults to
   * vertical (level 1 backward-compat).
   */
  climbDir?: ClimbDir;
  /** Starting position of the plane along the climb axis. Default: 20. */
  start?: number;
  /** Deprecated alias for `start`, retained for level-1 callsites. */
  startY?: number;
  /** Base advance speed in m/s. Default: 1.5. */
  baseSpeed?: number;
  /** Speed increase per `onSegmentCross` event in m/s. Default: 0.1. */
  segCrossBump?: number;
  /** Speed increase per `onPatchApplied` event in m/s. Default: 0.2. */
  patchBump?: number;
}

/**
 * DeathPlaneSystem — manages the monotonically advancing death plane.
 *
 * The plane starts behind the player (along the configured climb axis) and
 * advances toward them over time. Segment crossings and patch applications
 * increase its speed (never decreased). When the player's trailing edge
 * along the climb axis touches or passes the plane, `onPlayerDeath` is
 * emitted.
 *
 * Level 1 (axis="y", sign=-1): plane sits below the player and rises
 * (`_planePos` decreases over time).
 * Level 2 (axis="x", sign=+1): plane sits to the left of the player and
 * advances rightward (`_planePos` increases over time).
 */
export class DeathPlaneSystem {
  private readonly _dir: ClimbDir;
  private _planePos: number;
  private _speed: number;
  private readonly _segCrossBump: number;
  private readonly _patchBump: number;
  private _dead = false;
  private readonly _bus: EventBus<GameEvents>;

  constructor(bus: EventBus<GameEvents>, opts: DeathPlaneOptions = {}) {
    this._bus = bus;
    this._dir = opts.climbDir ?? CLIMB_DIR_VERTICAL;
    this._planePos = opts.start ?? opts.startY ?? 20;
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
    // Plane chases the player along -sign of the climb direction:
    //  level 1 (sign=-1): plane Y decreases (rises upward).
    //  level 2 (sign=+1): plane X increases (advances rightward).
    this._planePos += this._dir.sign * this._speed * multiplier * dt;

    // The player's trailing edge along the climb axis is the side facing
    // the death plane:
    //  level 1 (sign=-1): trailing edge = position.y + halfExtents.y (bottom).
    //  level 2 (sign=+1): trailing edge = position.x - halfExtents.x (left).
    const axis = this._dir.axis;
    const playerCoord = playerBody.position[axis];
    const playerHalf = playerBody.halfExtents[axis];
    const playerTrailing = playerCoord - this._dir.sign * playerHalf;

    // Death condition: plane has passed the player's trailing edge.
    //  level 1 (sign=-1): die when playerTrailing >= planePos.
    //  level 2 (sign=+1): die when playerTrailing <= planePos.
    const passed =
      this._dir.sign < 0
        ? playerTrailing >= this._planePos
        : playerTrailing <= this._planePos;
    if (passed) {
      this._dead = true;
      this._bus.emit("onPlayerDeath", { reason: "drowned" });
    }
  }

  /** Current position of the plane along the climb axis. */
  get planePos(): number {
    return this._planePos;
  }

  /**
   * Backward-compatible alias for `planePos` used by level-1 callsites.
   * For level 2 the same value is returned (it just isn't a Y coordinate).
   */
  get planeY(): number {
    return this._planePos;
  }

  /** Climb direction this plane was configured for. */
  get climbDir(): ClimbDir {
    return this._dir;
  }

  /** Current advance speed in m/s (monotonically non-decreasing). */
  get speed(): number {
    return this._speed;
  }

  /** Reset plane position and speed to their initial values for a new run. */
  reset(opts: DeathPlaneOptions = {}): void {
    this._planePos = opts.start ?? opts.startY ?? 20;
    this._speed = opts.baseSpeed ?? 1.5;
    this._dead = false;
  }
}
