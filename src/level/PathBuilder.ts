/**
 * Deterministic builder for level 3's snaking path.
 *
 * A `PathBuilder` wraps a `Path` plus a seeded RNG and a coarse
 * occupancy grid keyed on world-tile coordinates. Calling `extendTo(s)`
 * appends segments to the path (alternating between sharp 90° turns
 * and straight extensions) until `path.totalLength >= s`.
 *
 * Direction set:
 *   - Full 8-direction grid (cardinals + diagonals) sourced from
 *     `DIRECTIONS_8` in `Path.ts`. Combined with the "no doubling
 *     back / no continuing straight" guards in `_appendNext` this
 *     leaves six valid candidates at each bend (45°/90°/135° left or
 *     right turns).
 *   - Bends are sharp corners — no curved arcs or chamfers.
 *   - Initial segment is forced to N (up) so the player starts climbing.
 *   - Self-intersection is avoided by checking each candidate segment's
 *     swept corridor against the cumulative occupancy grid.
 */
import type { RNG } from "../core/RNG.js";
import { Path, DIRECTIONS_8, type Vec2 } from "./Path.js";

/**
 * The four cardinal directions. Retained for reference / tests; the
 * builder itself draws from `DIRECTIONS_8` so the corridor can also
 * bend along diagonals.
 */
export const CARDINAL_4: readonly Vec2[] = [
  { x: 1, y: 0 }, // E
  { x: 0, y: -1 }, // N
  { x: -1, y: 0 }, // W
  { x: 0, y: 1 }, // S
];

export interface PathBuilderOptions {
  rng: RNG;
  /** World position of the path's origin. */
  start: Vec2;
  /** Minimum straight segment length in metres. Default 30. */
  minSegmentLength?: number;
  /** Maximum straight segment length in metres. Default 60. */
  maxSegmentLength?: number;
  /** Lateral half-width of the corridor in tiles (= metres). Default 4. */
  corridorHalfWidth?: number;
}

/**
 * Stateful builder that lazily appends segments to its `Path` so the
 * total arc length stays ahead of any queried `s`.
 */
export class PathBuilder {
  readonly path: Path;
  private readonly _rng: RNG;
  private readonly _minLen: number;
  private readonly _maxLen: number;
  private readonly _halfW: number;
  /** World tile cells (`"tx,ty"`) covered by the corridor interior so far. */
  private readonly _occupied = new Set<string>();

  constructor(opts: PathBuilderOptions) {
    this._rng = opts.rng;
    this._minLen = opts.minSegmentLength ?? 30;
    this._maxLen = opts.maxSegmentLength ?? 60;
    this._halfW = opts.corridorHalfWidth ?? 4;
    // Start the path heading N (matches level 1's "climb up" muscle
    // memory). The first segment length is sampled from the same
    // distribution as later segments for symmetry.
    const initialLen = this._rng.int(this._minLen, this._maxLen);
    this.path = new Path(opts.start, { x: 0, y: -1 }, initialLen);
    this._occupySegment(this.path.lastSegment.origin, { x: 0, y: -1 }, initialLen);
  }

  /** Extend the path until its total arc length is at least `targetS`. */
  extendTo(targetS: number): void {
    let safety = 64;
    while (this.path.totalLength < targetS && safety-- > 0) {
      this._appendNext();
    }
  }

  /** Append one more segment (turn + straight). */
  private _appendNext(): void {
    const prev = this.path.lastSegment.direction;
    // Try directions in deterministic order until one fits.
    const order = this._directionOrder(prev);
    for (const dir of order) {
      // Doubling back is degenerate (path immediately re-enters itself).
      if (dir.x === -prev.x && dir.y === -prev.y) continue;
      // Skip continuing straight — the corridor must actually turn at
      // each bend so the player encounters the level's signature
      // direction changes. Straight extensions are still possible by
      // chaining a 90° turn followed by another 90° turn back, but
      // back-to-back same-direction segments are disallowed here.
      if (dir.x === prev.x && dir.y === prev.y) continue;
      const length = this._rng.int(this._minLen, this._maxLen);
      const tail = this.path.tailPosition;
      if (this._wouldIntersect(tail, dir, length)) continue;
      this.path.appendSegment(dir, length);
      this._occupySegment(tail, dir, length);
      return;
    }
    // Every turn candidate intersected. Force a continuation in the
    // same direction as a last resort so the builder always makes
    // progress (rare — only happens when both perpendicular turns
    // would re-enter the occupied corridor).
    const length = this._rng.int(this._minLen, this._maxLen);
    const tail = this.path.tailPosition;
    this.path.appendSegment(prev, length);
    this._occupySegment(tail, prev, length);
  }

  /**
   * Deterministic shuffle of `DIRECTIONS_8` seeded by the next RNG draw.
   *
   * The shuffled order stands as-is: continuing straight never collides
   * (the path grows into fresh space), so biasing `prev` to the front
   * would make the builder pick straight every time and the corridor
   * would never turn. A uniform shuffle gives a uniform draw across all
   * directions without disabling turns.
   *
   * @param _prev Previous direction — kept for signature symmetry; not
   *   currently consulted because the doubling-back guard lives in
   *   `_appendNext`.
   */
  private _directionOrder(_prev: Vec2): Vec2[] {
    const order = DIRECTIONS_8.slice();
    // Fisher–Yates with the builder's RNG so the choice is reproducible.
    for (let i = order.length - 1; i > 0; i--) {
      const j = this._rng.int(0, i);
      const tmp = order[i]!;
      order[i] = order[j]!;
      order[j] = tmp;
    }
    return order;
  }

  /**
   * True if the corridor swept by a hypothetical new segment would
   * overlap any previously occupied tile (other than the immediate
   * neighbourhood of `tail` — corners always touch).
   */
  private _wouldIntersect(tail: Vec2, dir: Vec2, length: number): boolean {
    const w = this._halfW;
    // Skip the first ~2*halfW metres of the new segment because the
    // corner naturally re-occupies the previous segment's terminus.
    const skip = w * 2;
    // Sub-unit stepping along both axes so diagonal segments — whose
    // perpendicular `(-d.y, d.x)` is itself diagonal — don't skip
    // over tile cells between integer samples.
    const step = 0.5;
    for (let s = skip; s <= length; s += step) {
      const cx = tail.x + dir.x * s;
      const cy = tail.y + dir.y * s;
      const px = -dir.y; // perp x
      const py = dir.x; // perp y
      for (let n = -w; n <= w; n += step) {
        const wx = cx + px * n;
        const wy = cy + py * n;
        const tx = Math.floor(wx);
        const ty = Math.floor(wy);
        if (this._occupied.has(`${tx},${ty}`)) return true;
      }
    }
    return false;
  }

  /** Mark all tiles in the corridor swept by this segment as occupied. */
  private _occupySegment(origin: Vec2, dir: Vec2, length: number): void {
    const w = this._halfW;
    const px = -dir.y;
    const py = dir.x;
    // Sub-unit stepping along both axes so diagonal segments don't
    // leave gaps in the occupancy grid (cardinals already saturate).
    const step = 0.5;
    for (let s = 0; s <= length; s += step) {
      const cx = origin.x + dir.x * s;
      const cy = origin.y + dir.y * s;
      // Pad by one tile of buffer in the perpendicular direction so
      // future segments can't slip in flush against this one.
      for (let n = -w - 1; n <= w + 1; n += step) {
        const wx = cx + px * n;
        const wy = cy + py * n;
        this._occupied.add(`${Math.floor(wx)},${Math.floor(wy)}`);
      }
    }
  }
}
