import * as THREE from "three";

/** Visible half-height of the viewport in world units (metres). */
const HALF_H = 10;

/** Camera lerp factor per render frame (≈60 fps). */
const LERP = 0.1;

/**
 * Half-height of the vertical deadzone band in world units.
 * The camera only chases when the player drifts outside this range around the
 * camera centre, preventing jitter from tiny vertical oscillations.
 */
const DEADZONE_Y = 1.5;

/**
 * How far (world units / metres) the death plane is allowed to climb above
 * the bottom of the camera view before it begins to push the camera upward.
 * This intrusion margin gives the eventual death-plane animation room to be
 * partially visible on screen instead of being clamped flush to the bottom.
 */
const DEATH_PLANE_INTRUSION = 5;

/**
 * GameCamera — orthographic camera with smooth follow, vertical deadzone, and
 * death-plane clamp.
 *
 * Y-axis convention: world Y+ = down (physics), Three.js Y+ = up (render).
 * World positions are negated before being applied to the Three.js camera.
 */
export class GameCamera {
  private readonly _cam: THREE.OrthographicCamera;
  /** Current camera centre in world-space Y (Y+ = down). */
  private _camWorldY = 0;
  private _aspect: number;

  /** @param aspect - Initial viewport width / height ratio. */
  constructor(aspect: number) {
    this._aspect = aspect;
    this._cam = new THREE.OrthographicCamera(
      -HALF_H * aspect,
      HALF_H * aspect,
      HALF_H,
      -HALF_H,
      0.1,
      100,
    );
    this._cam.position.set(0, 0, 10);
  }

  /** The wrapped Three.js camera — pass to `Renderer.render()`. */
  get threeCamera(): THREE.OrthographicCamera {
    return this._cam;
  }

  /**
   * Current camera centre in world-space Y (Y+ = down).
   * Updated by `follow()`.  Use to cull tile rows for tile mesh construction.
   */
  get worldY(): number {
    return this._camWorldY;
  }

  /**
   * Smoothly chase `(targetX, targetY)` in world space.
   *
   * The deadzone prevents micro-jitter when the player is near the screen
   * centre.  The bottom of the view is clamped so the death plane is never
   * cut off unfairly.
   *
   * Call once per render frame (not per physics step).
   *
   * @param targetX     - Player X in world units.
   * @param targetY     - Player Y in world units (Y+ = down).
   * @param deathPlaneY - Current death-plane Y in world units.
   */
  follow(targetX: number, targetY: number, deathPlaneY: number): void {
    const dy = targetY - this._camWorldY;

    // Only chase when the target exits the deadzone band.
    if (Math.abs(dy) > DEADZONE_Y) {
      this._camWorldY += (dy - Math.sign(dy) * DEADZONE_Y) * LERP;
    }

    // Clamp: the death plane is allowed to intrude `DEATH_PLANE_INTRUSION`
    // metres above the bottom of the view before it forces the camera to
    // chase it upward. This leaves room for the death-plane animation to be
    // partially visible on screen instead of being pinned flush to the edge.
    const bottomY = this._camWorldY + HALF_H;
    if (bottomY - DEATH_PLANE_INTRUSION > deathPlaneY) {
      this._camWorldY = deathPlaneY - HALF_H + DEATH_PLANE_INTRUSION;
    }

    // Apply: world Y+ = down → Three.js Y+ = up.
    this._cam.position.set(targetX, -this._camWorldY, 10);
    this._cam.updateProjectionMatrix();
  }

  /** Recalculate the frustum after a window resize. */
  resize(w: number, h: number): void {
    this._aspect = w / h;
    this._cam.left = -HALF_H * this._aspect;
    this._cam.right = HALF_H * this._aspect;
    this._cam.updateProjectionMatrix();
  }
}
