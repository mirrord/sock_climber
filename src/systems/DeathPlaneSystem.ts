import type { EventBus, GameEvents } from "../core/EventBus.js";
import type { Body } from "../physics/Body.js";
import { CLIMB_DIR_VERTICAL, type ClimbDir } from "../level/Axis.js";

/**
 * Optional path-mode context supplied per-frame so the death plane can
 * be a finite 2-D region (limited to the corridor walls) rather than
 * an infinite half-space along path-`s`.
 */
export interface PathDeathPlaneContext {
  /** World position of the plane's centre (= path.projectS(planePos).position). */
  planeWorld: { x: number; y: number };
  /** Unit tangent of the path at the plane (= path.projectS(planePos).tangent). */
  tangent: { x: number; y: number };
  /**
   * Lateral half-width of the corridor at the plane in metres. The
   * death zone extends ±this distance perpendicular to `tangent`.
   * Player AABB half-extent is added to this internally so a player
   * touching the wall on either side is still killed.
   */
  corridorHalfWidth: number;
}

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
  /**
   * Rubber-band activation distance in metres. When the plane is
   * farther than this from the player along the chase axis, its
   * effective advance speed is scaled by `distance / threshold` so it
   * catches up. The scaling is transient (recomputed every frame) and
   * never reduces speed below 1×. Default: 100. Set to `Infinity` (or
   * any non-positive / non-finite value) to disable rubber-banding.
   */
  rubberBandThreshold?: number;
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
  private readonly _rubberBandThreshold: number;
  private _rubberBandMultiplier = 1;
  private _dead = false;
  private readonly _bus: EventBus<GameEvents>;

  constructor(bus: EventBus<GameEvents>, opts: DeathPlaneOptions = {}) {
    this._bus = bus;
    this._dir = opts.climbDir ?? CLIMB_DIR_VERTICAL;
    this._planePos = opts.start ?? opts.startY ?? 20;
    this._speed = opts.baseSpeed ?? 1.5;
    this._segCrossBump = opts.segCrossBump ?? 0.1;
    this._patchBump = opts.patchBump ?? 0.2;
    const rb = opts.rubberBandThreshold ?? 100;
    // Treat non-positive / non-finite thresholds as "disabled" by
    // collapsing them to +Infinity so the `distance > threshold`
    // comparison can never trigger.
    this._rubberBandThreshold = rb > 0 && Number.isFinite(rb) ? rb : Infinity;

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
   * @param playerProgress            - Required when the configured climb
   *   axis is `"path"`. Pre-computed path-`s` value for the player; the
   *   system has no way to derive it from `playerBody` because the
   *   relationship between world position and arc length is owned by
   *   the live `Path`. Ignored for `"x"` / `"y"` axes.
   * @param pathContext               - Optional path-mode context. When
   *   supplied (and the climb axis is `"path"`) the kill check uses a
   *   2-D test in world space: the player must be on the trailing
   *   side of the plane along `tangent` AND within `corridorHalfWidth`
   *   metres of the plane's centre laterally. Without this, the
   *   path-mode kill check falls back to the 1-D arc-length test
   *   against `playerProgress`.
   */
  update(
    dt: number,
    playerBody: Body,
    deathPlaneSpeedMultiplier = 1,
    playerProgress?: number,
    pathContext?: PathDeathPlaneContext,
  ): void {
    if (this._dead) return;

    const multiplier = Math.max(0.1, deathPlaneSpeedMultiplier);

    // Rubber-band: compute the player's distance from the plane along
    // the chase axis. When the gap exceeds `_rubberBandThreshold`,
    // scale this frame's advance by `distance / threshold` so the
    // plane closes the gap. Floor at 1× (never slow the plane down).
    const distance = this._distanceToPlayer(
      playerBody,
      playerProgress,
      pathContext,
    );
    this._rubberBandMultiplier =
      distance > this._rubberBandThreshold
        ? distance / this._rubberBandThreshold
        : 1;

    // Plane chases the player along -sign of the climb direction:
    //  level 1 (sign=-1): plane Y decreases (rises upward).
    //  level 2 (sign=+1): plane X increases (advances rightward).
    //  level 3 (path):    plane `s` increases monotonically.
    this._planePos +=
      this._dir.sign * this._speed * multiplier * this._rubberBandMultiplier * dt;

    // Path-mode 2-D kill test: the death zone is the rectangle on the
    // trailing side of the plane, bounded laterally by the corridor
    // walls. A player who has somehow strayed outside the corridor
    // (e.g. clipped through a wall) survives until they re-enter.
    if (this._dir.axis === "path" && pathContext !== undefined) {
      const dx = playerBody.position.x - pathContext.planeWorld.x;
      const dy = playerBody.position.y - pathContext.planeWorld.y;
      const tx = pathContext.tangent.x;
      const ty = pathContext.tangent.y;
      // Forward distance along the chase tangent (positive = ahead of
      // the plane in the direction it is travelling; negative =
      // behind / inside the death zone).
      const forward = dx * tx + dy * ty;
      // Lateral distance perpendicular to the tangent.
      const lateral = dx * -ty + dy * tx;
      const playerHalf = Math.max(
        playerBody.halfExtents.x,
        playerBody.halfExtents.y,
      );
      // Add the player's larger half-extent to the lateral limit so an
      // AABB grazing either wall still gets killed; require the
      // player's leading edge (centre + playerHalf) to have crossed
      // the plane along the tangent.
      const lateralLimit = pathContext.corridorHalfWidth + playerHalf;
      if (forward <= playerHalf && Math.abs(lateral) <= lateralLimit) {
        this._dead = true;
        this._bus.emit("onPlayerDeath", { reason: "drowned" });
      }
      return;
    }

    let playerTrailing: number;
    if (this._dir.axis === "path") {
      // In path mode the player's arc length is supplied by the
      // caller; the player's body has no half-extent along `s`.
      playerTrailing = playerProgress ?? 0;
    } else {
      const axis = this._dir.axis;
      const playerCoord = playerBody.position[axis];
      const playerHalf = playerBody.halfExtents[axis];
      // The player's trailing edge along the climb axis is the side
      // facing the death plane:
      //  level 1 (sign=-1): trailing edge = position.y + halfExtents.y.
      //  level 2 (sign=+1): trailing edge = position.x - halfExtents.x.
      playerTrailing = playerCoord - this._dir.sign * playerHalf;
    }

    // Death condition: plane has passed the player's trailing edge.
    //  level 1 (sign=-1): die when playerTrailing >= planePos.
    //  level 2/3 (sign=+1): die when playerTrailing <= planePos.
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

  /** Configured rubber-band activation distance in metres. */
  get rubberBandThreshold(): number {
    return this._rubberBandThreshold;
  }

  /**
   * Most recent rubber-band scaling applied during `update`. Always
   * `>= 1`. Equals `1` when the player is within `rubberBandThreshold`
   * metres of the plane (or before any update has run).
   */
  get rubberBandMultiplier(): number {
    return this._rubberBandMultiplier;
  }

  /**
   * Compute the player's signed distance ahead of the plane along the
   * chase axis. Result is clamped at zero — once the player is at or
   * behind the plane the kill check takes over and rubber-banding is
   * irrelevant.
   */
  private _distanceToPlayer(
    playerBody: Body,
    playerProgress: number | undefined,
    pathContext: PathDeathPlaneContext | undefined,
  ): number {
    if (this._dir.axis === "path") {
      if (pathContext !== undefined) {
        const dx = playerBody.position.x - pathContext.planeWorld.x;
        const dy = playerBody.position.y - pathContext.planeWorld.y;
        // `forward` is positive when the player is ahead of the plane
        // along the chase tangent.
        const forward = dx * pathContext.tangent.x + dy * pathContext.tangent.y;
        return Math.max(0, forward);
      }
      return Math.max(0, (playerProgress ?? this._planePos) - this._planePos);
    }
    const axis = this._dir.axis;
    return Math.max(
      0,
      this._dir.sign * (playerBody.position[axis] - this._planePos),
    );
  }

  /** Reset plane position and speed to their initial values for a new run. */
  reset(opts: DeathPlaneOptions = {}): void {
    this._planePos = opts.start ?? opts.startY ?? 20;
    this._speed = opts.baseSpeed ?? 1.5;
    this._rubberBandMultiplier = 1;
    this._dead = false;
  }
}
