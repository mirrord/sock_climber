import * as THREE from "three";
import { CLIMB_DIR_VERTICAL, type ClimbDir } from "../level/Axis.js";

/**
 * Default visible half-extent (metres) used when no level-specific lateral
 * extent is provided (path / arena modes). Levels that scroll along a single
 * axis pass `lateralHalfExtent` so the perpendicular axis is fitted exactly
 * to the playfield, with the other axis scaling by window aspect ratio.
 */
const HALF_H = 10;

/** Camera lerp factor per render frame (≈60 fps). */
const LERP = 0.1;

/**
 * Half-width of the deadzone band along the climb axis, in world units.
 * The camera only chases when the player drifts outside this range around
 * the camera centre, preventing jitter from tiny oscillations along the
 * climb axis.
 */
const DEADZONE = 1.5;

/**
 * How far (world units / metres) the death plane is allowed to encroach
 * past the trailing edge of the camera view before it begins to push the
 * camera forward. Gives the death-plane animation room to be partially
 * visible on screen instead of being clamped flush to the edge.
 */
const DEATH_PLANE_INTRUSION = 5;

export interface GameCameraOptions {
  /**
   * Climb direction this camera follows. Defaults to vertical (level 1).
   * The smoothed/deadzoned axis follows the climb axis; the perpendicular
   * (lateral) axis snaps to the target each frame.
   */
  climbDir?: ClimbDir;
  /**
   * Half-extent (world units) along the lateral axis the viewport must
   * always show in full. When supplied for an axis-aligned climb, the
   * camera fits this extent to the corresponding window dimension and
   * the other (climb) axis half-extent is derived from the aspect ratio
   * so the entire playfield width/height is always visible regardless
   * of window size. Defaults to 10 (legacy).
   */
  lateralHalfExtent?: number;
  /**
   * Fixed lateral world coordinate the camera centres on. When supplied
   * for an axis-aligned climb, the camera locks its lateral position to
   * this value rather than following the player. Combined with
   * `lateralHalfExtent` this guarantees the entire lateral playfield is
   * always on screen.
   */
  lateralCenter?: number;
}

/**
 * GameCamera — orthographic camera with smooth follow along the climb
 * axis, a deadzone, and a death-plane clamp on the trailing edge.
 *
 * Y-axis convention: world Y+ = down (physics), Three.js Y+ = up (render).
 * World Y is negated before being applied to the Three.js camera.
 */
export class GameCamera {
  private readonly _cam: THREE.OrthographicCamera;
  private readonly _dir: ClimbDir;
  /** Smoothed camera centre along the climb axis (world units). */
  private _camWorldClimb = 0;
  /** Last known target along the lateral axis (snapped instantly). */
  private _camWorldLateral: number;
  private _aspect: number;
  /**
   * Configured lateral half-extent (world units). For axis-aligned climbs
   * the viewport is sized so this exact extent always fits perpendicular
   * to the climb axis. For path/arena modes this is the legacy `HALF_H`.
   */
  private readonly _lateralHalf: number;
  /**
   * Fixed lateral centre for axis-aligned climbs. `null` means "follow
   * the player on the lateral axis" (path / arena modes).
   */
  private readonly _lateralLock: number | null;
  /**
   * Current half-extent along the climb axis (world units). Recomputed
   * from `_lateralHalf` and the window aspect on every `resize()` so the
   * full lateral extent always fits the viewport.
   */
  private _climbHalf: number;

  /** @param aspect - Initial viewport width / height ratio. */
  constructor(aspect: number, opts: GameCameraOptions = {}) {
    this._aspect = aspect;
    this._dir = opts.climbDir ?? CLIMB_DIR_VERTICAL;
    this._lateralHalf = opts.lateralHalfExtent ?? HALF_H;
    this._lateralLock = opts.lateralCenter ?? null;
    this._camWorldLateral = this._lateralLock ?? 0;
    this._climbHalf = this._computeClimbHalf();
    this._cam = new THREE.OrthographicCamera(0, 0, 0, 0, 0.1, 100);
    this._applyFrustum();
    this._cam.position.set(0, 0, 10);
  }

  /**
   * Compute the climb-axis half-extent so the lateral half always fits
   * the corresponding window dimension. For path/arena modes (no scroll
   * axis) the climb axis is the vertical, matching legacy behaviour.
   */
  private _computeClimbHalf(): number {
    if (this._dir.axis === "y") {
      // Climb = Y (vertical). Lateral is horizontal; lateralHalf fits the
      // window width. Climb half (vertical) shrinks/grows by 1/aspect.
      return this._lateralHalf / this._aspect;
    }
    if (this._dir.axis === "x") {
      // Climb = X (horizontal). Lateral is vertical; lateralHalf fits the
      // window height. Climb half (horizontal) is lateralHalf * aspect.
      return this._lateralHalf * this._aspect;
    }
    // Path / arena: keep legacy fixed vertical half. Horizontal scales
    // with aspect inside `_applyFrustum`.
    return HALF_H;
  }

  /** Push current `_lateralHalf` / `_climbHalf` into the THREE camera. */
  private _applyFrustum(): void {
    if (this._dir.axis === "x") {
      // Climb is horizontal: climb half drives left/right.
      this._cam.left = -this._climbHalf;
      this._cam.right = this._climbHalf;
      this._cam.top = this._lateralHalf;
      this._cam.bottom = -this._lateralHalf;
    } else if (this._dir.axis === "y") {
      // Climb is vertical: lateral half drives left/right.
      this._cam.left = -this._lateralHalf;
      this._cam.right = this._lateralHalf;
      this._cam.top = this._climbHalf;
      this._cam.bottom = -this._climbHalf;
    } else {
      // Legacy: vertical half fixed at HALF_H, horizontal scales by aspect.
      this._cam.left = -HALF_H * this._aspect;
      this._cam.right = HALF_H * this._aspect;
      this._cam.top = HALF_H;
      this._cam.bottom = -HALF_H;
    }
    this._cam.updateProjectionMatrix();
  }

  /** The wrapped Three.js camera — pass to `Renderer.render()`. */
  get threeCamera(): THREE.OrthographicCamera {
    return this._cam;
  }

  /**
   * Camera centre coordinate along the climb axis (world space). Updated
   * by `follow()`. For level 1 this is the camera Y; for level 2 the
   * camera X. Used to cull tile rows / columns.
   */
  get worldClimb(): number {
    return this._camWorldClimb;
  }

  /**
   * Backward-compatible alias for `worldClimb` used by level-1 callsites
   * that read camera Y directly. For level 2 the same value is returned
   * (it just isn't a Y coordinate).
   */
  get worldY(): number {
    return this._camWorldClimb;
  }

  /**
   * Camera centre coordinate along the lateral axis (perpendicular to
   * the climb axis) in world space. For level 1 this is camera X; for
   * level 2 camera Y; for level 3 (path mode) world X.
   */
  get worldLateral(): number {
    return this._camWorldLateral;
  }

  /**
   * Coordinate of the leading edge of the viewport along the climb axis
   * (world space). For level 1 this is the most-negative Y currently on
   * screen (top edge); for level 2 the most-positive X (right edge). Used
   * by gameplay systems to detect when off-screen entities have been
   * revealed by the camera.
   */
  get viewLeadingEdge(): number {
    return this._camWorldClimb + this._dir.sign * this._climbHalf;
  }

  /** Backward-compatible alias for `viewLeadingEdge` used by level 1. */
  get viewTopY(): number {
    return this.viewLeadingEdge;
  }

  /** Climb direction this camera was configured for. */
  get climbDir(): ClimbDir {
    return this._dir;
  }

  /** Current half-extent along the climb axis (world units). */
  get climbHalfExtent(): number {
    return this._climbHalf;
  }

  /** Configured lateral half-extent (world units). */
  get lateralHalfExtent(): number {
    return this._lateralHalf;
  }

  /**
   * Smoothly chase `(targetX, targetY)` in world space along the climb
   * axis; snap to target along the lateral axis. The trailing edge of the
   * view is clamped so the death plane is never cut off unfairly.
   *
   * Call once per render frame (not per physics step).
   *
   * @param targetX       - Player X in world units.
   * @param targetY       - Player Y in world units (Y+ = down).
   * @param deathPlanePos - Current death-plane position along climb axis.
   */
  follow(targetX: number, targetY: number, deathPlanePos: number): void {
    // Path-mode (level 3) and arena-mode (level 4, axis === "none"):
    // the camera tracks the player in 2-D world space. No deadzone or
    // death-plane clamp — neither level uses one.
    if (this._dir.axis === "path" || this._dir.axis === "none") {
      this._camWorldClimb += (targetY - this._camWorldClimb) * LERP;
      this._camWorldLateral += (targetX - this._camWorldLateral) * LERP;
      this._cam.position.set(this._camWorldLateral, -this._camWorldClimb, 10);
      this._cam.updateProjectionMatrix();
      return;
    }

    const target = this._dir.axis === "y" ? targetY : targetX;
    const lateralTarget = this._dir.axis === "y" ? targetX : targetY;

    const d = target - this._camWorldClimb;

    // Only chase when the target exits the deadzone band.
    if (Math.abs(d) > DEADZONE) {
      this._camWorldClimb += (d - Math.sign(d) * DEADZONE) * LERP;
    }

    // Trailing edge of the view = the side the death plane approaches
    // from. For sign=-1 (climb up), trailing edge is the bottom of the
    // screen (cam + HALF_H). For sign=+1 (climb right), trailing edge is
    // the left of the screen (cam - HALF_H).
    //  level 1: clamp when (cam + climbHalf) - intrusion > planeY  →  cam = planeY - climbHalf + intrusion
    //  level 2: clamp when (cam - climbHalf) + intrusion < planeX  →  cam = planeX + climbHalf - intrusion
    if (this._dir.sign < 0) {
      const trailing = this._camWorldClimb + this._climbHalf;
      if (trailing - DEATH_PLANE_INTRUSION > deathPlanePos) {
        this._camWorldClimb = deathPlanePos - this._climbHalf + DEATH_PLANE_INTRUSION;
      }
    } else {
      const trailing = this._camWorldClimb - this._climbHalf;
      if (trailing + DEATH_PLANE_INTRUSION < deathPlanePos) {
        this._camWorldClimb = deathPlanePos + this._climbHalf - DEATH_PLANE_INTRUSION;
      }
    }

    // Lateral position: lock to configured centre when one was supplied
    // (axis-aligned levels that fully fit the lateral extent on screen),
    // otherwise snap to the player's lateral coordinate.
    this._camWorldLateral = this._lateralLock ?? lateralTarget;

    // Apply: world Y+ = down → Three.js Y+ = up.
    const worldX = this._dir.axis === "y" ? lateralTarget : this._camWorldClimb;
    const worldY = this._dir.axis === "y" ? this._camWorldClimb : lateralTarget;
    this._cam.position.set(worldX, -worldY, 10);
    this._cam.updateProjectionMatrix();
  }

  /** Recalculate the frustum after a window resize. */
  resize(w: number, h: number): void {
    this._aspect = w / h;
    this._climbHalf = this._computeClimbHalf();
    this._applyFrustum();
  }
}
