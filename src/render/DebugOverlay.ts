import * as THREE from "three";
import type { Body } from "../physics/Body.js";

/**
 * Maximum number of AABB wireframes the overlay can draw simultaneously.
 * Each AABB uses 4 line segments × 2 vertices = 8 vertices = 24 floats.
 */
const MAX_BODIES = 64;

/**
 * DebugOverlay — renders AABB wireframes for all active physics bodies.
 *
 * Enabled only when the URL contains `?debug=1`.  In production (no query
 * parameter) every method is a no-op so there is zero cost in the hot path.
 *
 * Uses a pre-allocated `Float32Array` position buffer; no heap allocations
 * occur inside `sync()`.
 */
export class DebugOverlay {
  private readonly _enabled: boolean;
  /** Pre-allocated position buffer: MAX_BODIES × 4 edges × 2 vertices × 3 floats. */
  private readonly _pos = new Float32Array(MAX_BODIES * 24);
  private _lines: THREE.LineSegments | null = null;

  constructor() {
    const search = typeof window !== "undefined" ? window.location.search : "";
    this._enabled = new URLSearchParams(search).get("debug") === "1";
  }

  /** `true` when the overlay is active (URL has `?debug=1`). */
  get enabled(): boolean {
    return this._enabled;
  }

  /**
   * Update wireframe geometry to match the given bodies.
   *
   * No-op when the overlay is disabled.
   *
   * @param bodies - Bodies to draw wireframes around (up to `MAX_BODIES`).
   * @param scene  - Three.js scene.  The LineSegments mesh is lazily added.
   */
  sync(bodies: readonly Body[], scene: THREE.Scene): void {
    if (!this._enabled) return;

    if (!this._lines) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(this._pos, 3));
      const mat = new THREE.LineBasicMaterial({ color: 0x00ff00 });
      this._lines = new THREE.LineSegments(geo, mat);
      this._lines.position.z = 5;
      this._lines.frustumCulled = false;
      scene.add(this._lines);
    }

    const count = Math.min(bodies.length, MAX_BODIES);

    for (let i = 0; i < count; i++) {
      const b = bodies[i]!;
      const cx = b.position.x;
      const cy = b.position.y;
      const hw = b.halfExtents.x;
      const hh = b.halfExtents.y;

      // Y-flip: world Y+ = down → Three.js Y+ = up
      const l = cx - hw;
      const r = cx + hw;
      const top = -(cy - hh); // world top = smaller Y → positive screen Y
      const bot = -(cy + hh); // world bottom = larger Y → negative screen Y

      const o = i * 24;
      // Top edge:    TL → TR
      this._pos[o + 0] = l;
      this._pos[o + 1] = top;
      this._pos[o + 2] = 0;
      this._pos[o + 3] = r;
      this._pos[o + 4] = top;
      this._pos[o + 5] = 0;
      // Right edge:  TR → BR
      this._pos[o + 6] = r;
      this._pos[o + 7] = top;
      this._pos[o + 8] = 0;
      this._pos[o + 9] = r;
      this._pos[o + 10] = bot;
      this._pos[o + 11] = 0;
      // Bottom edge: BR → BL
      this._pos[o + 12] = r;
      this._pos[o + 13] = bot;
      this._pos[o + 14] = 0;
      this._pos[o + 15] = l;
      this._pos[o + 16] = bot;
      this._pos[o + 17] = 0;
      // Left edge:   BL → TL
      this._pos[o + 18] = l;
      this._pos[o + 19] = bot;
      this._pos[o + 20] = 0;
      this._pos[o + 21] = l;
      this._pos[o + 22] = top;
      this._pos[o + 23] = 0;
    }

    const attr = this._lines.geometry.attributes["position"] as THREE.BufferAttribute;
    attr.needsUpdate = true;
    // Only draw vertices for active bodies.
    this._lines.geometry.setDrawRange(0, count * 8); // 4 edges × 2 vertices
  }
}
