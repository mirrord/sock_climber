/**
 * Path data structure for level 3 ("The Snaking Corridor").
 *
 * A `Path` is an ordered sequence of straight `Segment`s in 2-D world
 * space. Each segment carries a unit direction `d` and an `s`-range
 * `[sStart, sEnd]` describing its position along the path's arc length.
 * Segments meet at sharp corners (no curved bend arcs in this MVP — see
 * `docs/LEVEL_3_PLAN.md` §3.3 for the full bend taxonomy planned for
 * future iterations).
 *
 * World coordinate convention: world Y+ = down (matches the rest of the
 * engine). A direction with `y < 0` therefore points "up" on screen.
 *
 * Path-space coordinates `(s, n)`:
 *   `s` — distance travelled along the centreline in metres (≥ 0).
 *   `n` — lateral offset from the centreline in metres
 *          (`-W/2 ≤ n ≤ +W/2` keeps you inside the corridor of width W).
 *
 * The `Path` is mutable: `appendSegment()` extends the tail. The
 * `estimateS()` helper performs the cheap anchor-based projection
 * described in plan §6.2 and is suitable for per-frame use.
 */

/** Unit-length 2-D vector. */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** A single straight segment of the path. */
export interface Segment {
  /** Unit direction along the segment. */
  readonly direction: Vec2;
  /** World-space position of the segment's start (centreline). */
  readonly origin: Vec2;
  /** Path-space arc length at the segment's start. */
  readonly sStart: number;
  /** Path-space arc length at the segment's end. */
  readonly sEnd: number;
}

/** The eight 45°-aligned directions, normalised to unit length. */
export const DIRECTIONS_8: readonly Vec2[] = (() => {
  const inv = 1 / Math.SQRT2;
  return [
    { x: 1, y: 0 }, // E
    { x: inv, y: -inv }, // NE (world Y+ = down, so y<0 = up)
    { x: 0, y: -1 }, // N
    { x: -inv, y: -inv }, // NW
    { x: -1, y: 0 }, // W
    { x: -inv, y: inv }, // SW
    { x: 0, y: 1 }, // S
    { x: inv, y: inv }, // SE
  ];
})();

/**
 * Returns the unit perpendicular of `d` that points "right of forward".
 * For E (`+x`) the perpendicular is `+y` (down in world space).
 */
export function perpRight(d: Vec2): Vec2 {
  return { x: -d.y, y: d.x };
}

/** Mutable arc-length-indexed path made of straight segments. */
export class Path {
  private readonly _segments: Segment[] = [];

  /** Cached anchor index for `estimateS` (anchored to the player's segment). */
  private _anchor = 0;

  constructor(start: Vec2, initialDirection: Vec2, initialLength: number) {
    this._segments.push({
      direction: initialDirection,
      origin: start,
      sStart: 0,
      sEnd: initialLength,
    });
  }

  /** All segments in order. */
  get segments(): readonly Segment[] {
    return this._segments;
  }

  /** Total arc length of the path so far. */
  get totalLength(): number {
    const last = this._segments[this._segments.length - 1]!;
    return last.sEnd;
  }

  /** The most recently appended segment. */
  get lastSegment(): Segment {
    return this._segments[this._segments.length - 1]!;
  }

  /**
   * World-space position of the path's tail (the end point of the last
   * segment, where the next segment would begin).
   */
  get tailPosition(): Vec2 {
    const seg = this.lastSegment;
    const len = seg.sEnd - seg.sStart;
    return {
      x: seg.origin.x + seg.direction.x * len,
      y: seg.origin.y + seg.direction.y * len,
    };
  }

  /**
   * Append a new straight segment in `direction` of `length` metres.
   * The new segment starts at the current tail position. If `direction`
   * matches the current tail direction the two segments are merged
   * (extending the previous one) so the path always stores its segments
   * in canonical "consecutive different-direction" form.
   */
  appendSegment(direction: Vec2, length: number): void {
    if (length <= 0) return;
    const last = this.lastSegment;
    const sameDir =
      Math.abs(last.direction.x - direction.x) < 1e-9 &&
      Math.abs(last.direction.y - direction.y) < 1e-9;
    if (sameDir) {
      // Extend in place — Segment is "readonly" to outside callers but
      // we own the underlying array.
      const merged: Segment = {
        direction: last.direction,
        origin: last.origin,
        sStart: last.sStart,
        sEnd: last.sEnd + length,
      };
      this._segments[this._segments.length - 1] = merged;
      return;
    }
    const tail = this.tailPosition;
    this._segments.push({
      direction,
      origin: tail,
      sStart: last.sEnd,
      sEnd: last.sEnd + length,
    });
  }

  /**
   * Find the segment containing `s` via linear scan. O(N) in the worst
   * case but the segment list is short (~tens) and this is only called
   * by the renderer for the death plane. Returns the last segment if `s`
   * exceeds the path tail.
   */
  segmentAt(s: number): Segment {
    if (s <= 0) return this._segments[0]!;
    for (const seg of this._segments) {
      if (s <= seg.sEnd) return seg;
    }
    return this._segments[this._segments.length - 1]!;
  }

  /**
   * Project a path-space coord `(s, n)` to world space. Returns the
   * world position and the local tangent (the segment direction).
   */
  projectS(s: number, n = 0): { position: Vec2; tangent: Vec2 } {
    const seg = this.segmentAt(s);
    const ds = Math.max(0, Math.min(s - seg.sStart, seg.sEnd - seg.sStart));
    const perp = perpRight(seg.direction);
    return {
      position: {
        x: seg.origin.x + seg.direction.x * ds + perp.x * n,
        y: seg.origin.y + seg.direction.y * ds + perp.y * n,
      },
      tangent: seg.direction,
    };
  }

  /**
   * Cheap world→s estimator (plan §6.2). Maintains an internal anchor
   * pointing at the segment we believe the queried position is inside.
   * Each call is a single 2-D dot product plus an O(1) anchor advance
   * if the projection has overshot the segment's `s`-range. Total cost
   * is amortised constant.
   *
   * Accuracy: exact on the anchored segment's centreline; off-centreline
   * positions are projected onto the centreline so the returned `s` is
   * the closest centreline point. At a corner the value can underread
   * by up to `corridorHalfWidth` metres for a single frame; this is
   * acceptable for HUD / death-plane purposes.
   */
  estimateS(pos: Vec2): number {
    // Try to advance the anchor forward through any segments the
    // projection has already exited.
    while (this._anchor < this._segments.length - 1) {
      const seg = this._segments[this._anchor]!;
      const localS = this._projectOnto(pos, seg);
      if (localS > seg.sEnd) {
        this._anchor++;
        continue;
      }
      break;
    }
    // Equally, retreat if we've fallen behind.
    while (this._anchor > 0) {
      const seg = this._segments[this._anchor]!;
      const localS = this._projectOnto(pos, seg);
      if (localS < seg.sStart) {
        this._anchor--;
        continue;
      }
      break;
    }
    const seg = this._segments[this._anchor]!;
    const localS = this._projectOnto(pos, seg);
    return Math.max(seg.sStart, Math.min(seg.sEnd, localS));
  }

  /**
   * Test-only / generator-only: reset the anchor to the first segment.
   * Use after appending a backtrack to guarantee subsequent estimates
   * start from a clean baseline.
   */
  resetAnchor(): void {
    this._anchor = 0;
  }

  /**
   * Returns `dot(pos - seg.origin, seg.direction) + seg.sStart` — the
   * arc-length value of the perpendicular projection of `pos` onto
   * `seg`'s infinite line, expressed in path-`s` coordinates.
   */
  private _projectOnto(pos: Vec2, seg: Segment): number {
    const dx = pos.x - seg.origin.x;
    const dy = pos.y - seg.origin.y;
    return seg.sStart + dx * seg.direction.x + dy * seg.direction.y;
  }
}
