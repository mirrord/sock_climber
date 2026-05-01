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
  /**
   * World tile cells (`"tx,ty"`) covered by every *non-current* prior
   * segment's corridor interior + 1-tile padding. The immediately
   * previous segment's tiles are tracked separately in
   * `_prevSegmentTiles` so the corner-overlap exemption in
   * `_wouldIntersect` only excuses tiles belonging to the actual
   * previous segment — never an unrelated older segment that the path
   * has snaked back near.
   */
  private readonly _occupied = new Set<string>();
  /** Tiles swept by the most-recently appended segment. */
  private _prevSegmentTiles = new Set<string>();

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
    this._commitSegment(this.path.lastSegment.origin, { x: 0, y: -1 }, initialLen);
  }

  /** Extend the path until its total arc length is at least `targetS`. */
  extendTo(targetS: number): void {
    let safety = 64;
    while (this.path.totalLength < targetS && safety-- > 0) {
      if (!this._appendNext()) break;
    }
  }

  /**
   * Append one more segment (turn + straight). Returns `false` if no
   * non-self-intersecting candidate could be found at any tested
   * direction or length — the builder then stops extending so the
   * path never doubles back through itself (which would seal the
   * corridor and produce a dead-end).
   */
  private _appendNext(): boolean {
    const prev = this.path.lastSegment.direction;
    const tail = this.path.tailPosition;

    const isBack = (d: Vec2) => d.x === -prev.x && d.y === -prev.y;
    const isStraight = (d: Vec2) => d.x === prev.x && d.y === prev.y;

    // Phase 1: prefer a turn (the corridor's signature behaviour) at a
    // freshly-sampled length. Skip doubling back (degenerate) and
    // continuing straight (handled in phase 2 if no turn fits).
    const order = this._directionOrder(prev);
    for (const dir of order) {
      if (isBack(dir) || isStraight(dir)) continue;
      const length = this._rng.int(this._minLen, this._maxLen);
      if (this._wouldIntersect(tail, dir, length)) continue;
      this.path.appendSegment(dir, length);
      this._commitSegment(tail, dir, length);
      return true;
    }

    // Phase 2: no turn fit. Try continuing straight — checked against
    // the occupancy grid, unlike the old unconditional fallback.
    {
      const length = this._rng.int(this._minLen, this._maxLen);
      if (!this._wouldIntersect(tail, prev, length)) {
        this.path.appendSegment(prev, length);
        this._commitSegment(tail, prev, length);
        return true;
      }
    }

    // Phase 3: tight pocket. Retry every non-back direction (turns +
    // straight) at progressively shorter lengths so the builder can
    // squeeze a short stub into a confined area without overlapping.
    const lengths: number[] = [];
    for (let len = this._minLen; len >= 4; len = Math.floor(len / 2)) {
      lengths.push(len);
    }
    for (const length of lengths) {
      for (const dir of order) {
        if (isBack(dir)) continue;
        if (this._wouldIntersect(tail, dir, length)) continue;
        this.path.appendSegment(dir, length);
        this._commitSegment(tail, dir, length);
        return true;
      }
    }

    return false;
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
   * overlap any tile occupied by a *non-adjacent* prior segment. The
   * immediately previous segment's tiles (tracked in
   * `_prevSegmentTiles`) are excluded from the check because corners
   * legally share cells with the previous segment's terminus.
   */
  private _wouldIntersect(tail: Vec2, dir: Vec2, length: number): boolean {
    const w = this._halfW;
    // Sub-unit stepping along both axes so diagonal segments — whose
    // perpendicular `(-d.y, d.x)` is itself diagonal — don't skip
    // over tile cells between integer samples.
    const step = 0.5;
    for (let s = 0; s <= length; s += step) {
      const cx = tail.x + dir.x * s;
      const cy = tail.y + dir.y * s;
      const px = -dir.y; // perp x
      const py = dir.x; // perp y
      for (let n = -w; n <= w; n += step) {
        const wx = cx + px * n;
        const wy = cy + py * n;
        const key = `${Math.floor(wx)},${Math.floor(wy)}`;
        if (this._prevSegmentTiles.has(key)) continue;
        if (this._occupied.has(key)) return true;
      }
    }
    return false;
  }

  /**
   * Commit a freshly accepted segment: rotate the previous segment's
   * tiles into the global `_occupied` grid (with padding) and record
   * this segment's interior tiles as the new `_prevSegmentTiles`.
   */
  private _commitSegment(origin: Vec2, dir: Vec2, length: number): void {
    // Promote previous-segment tiles into the global occupancy. They
    // were already tracked there via `_occupySegment`, but we ensure
    // their padding is recorded for any future intersection test.
    for (const k of this._prevSegmentTiles) this._occupied.add(k);
    // Record this segment's padded interior tiles in `_occupied`.
    this._occupySegment(origin, dir, length);
    // And remember its un-padded interior as the new "prev" set.
    this._prevSegmentTiles = this._sweepInterior(origin, dir, length);
  }

  /** Tiles in the padded sweep of a segment (matches `_occupySegment`). */
  private _sweepInterior(origin: Vec2, dir: Vec2, length: number): Set<string> {
    const tiles = new Set<string>();
    const w = this._halfW;
    const px = -dir.y;
    const py = dir.x;
    const step = 0.5;
    for (let s = 0; s <= length; s += step) {
      const cx = origin.x + dir.x * s;
      const cy = origin.y + dir.y * s;
      // Match `_occupySegment`'s `[-w-1, w+1]` padding so the previous
      // segment's wall ring is also exempted at the corner — otherwise
      // every turn candidate would clip those padded tiles and be
      // rejected, leaving the path unable to extend at all.
      for (let n = -w - 1; n <= w + 1; n += step) {
        const wx = cx + px * n;
        const wy = cy + py * n;
        tiles.add(`${Math.floor(wx)},${Math.floor(wy)}`);
      }
    }
    return tiles;
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
