import { describe, it, expect } from "vitest";
import { createGenerator } from "../../src/level/Generator.js";
import { CLIMB_DIR_PATH } from "../../src/level/Axis.js";
import { PathBuilder } from "../../src/level/PathBuilder.js";
import { createRNG } from "../../src/core/RNG.js";

/**
 * Regression for the level-3 "missing left wall" bug. With a spawn at
 * world origin the path's lateral walls land at tx = ±5, but
 * `TileWorld._inBounds` rejects any tx < 0 — so the entire left wall was
 * silently dropped. Fix: spawn is centred in the addressable tile range
 * (LEVEL_3.spawn.x = 1000) and propagated into the SnakeGenerator's
 * PathBuilder via `GeneratorOptions.spawn`.
 */
describe("SnakeGenerator — corridor walls straddle the spawn", () => {
  it("emits solid tiles on both sides of the spawn x-coordinate", () => {
    const spawn = { x: 1000, y: 0 };
    const gen = createGenerator({
      seed: 1,
      cameraY: 0,
      climbDir: CLIMB_DIR_PATH,
      worldWidth: 2000,
      worldYMin: -1000,
      spawn,
    });

    const result = gen.advance(0, -3);

    const solids = result.newTiles.filter((t) => t.solid);
    expect(solids.length).toBeGreaterThan(0);

    const hasLeft = solids.some((t) => t.tx < spawn.x);
    const hasRight = solids.some((t) => t.tx > spawn.x);
    expect(hasLeft).toBe(true);
    expect(hasRight).toBe(true);
  });

  it("keeps every emitted tile inside the addressable world bounds", () => {
    const spawn = { x: 1000, y: 0 };
    const worldWidth = 2000;
    const worldYMin = -1000;
    const worldYMax = worldYMin + 2000;
    const gen = createGenerator({
      seed: 7,
      cameraY: 0,
      climbDir: CLIMB_DIR_PATH,
      worldWidth,
      worldYMin,
      spawn,
    });

    const result = gen.advance(0, -3);
    for (const t of result.newTiles) {
      expect(t.tx).toBeGreaterThanOrEqual(0);
      expect(t.tx).toBeLessThan(worldWidth);
      expect(t.ty).toBeGreaterThanOrEqual(worldYMin);
      expect(t.ty).toBeLessThan(worldYMax);
    }
  });
});

/**
 * Regression for the "corridor never turns" bug. `_directionOrder`
 * previously moved the previous direction to the front of its candidate
 * list, and since continuing straight never collides the builder always
 * picked it — the path was effectively a single infinite straight line.
 */
describe("PathBuilder — corridor changes direction", () => {
  it("emits at least one direction change within a long path", () => {
    const builder = new PathBuilder({
      rng: createRNG(1),
      start: { x: 0, y: 0 },
    });
    builder.extendTo(2000);
    const segs = builder.path.segments;
    expect(segs.length).toBeGreaterThan(1);

    let directionChanges = 0;
    for (let i = 1; i < segs.length; i++) {
      const a = segs[i - 1]!.direction;
      const b = segs[i]!.direction;
      if (a.x !== b.x || a.y !== b.y) directionChanges++;
    }
    expect(directionChanges).toBeGreaterThan(0);
  });

  it("uses diagonal segment directions in addition to cardinals", () => {
    // Aggregate across several seeds so the assertion isn't sensitive
    // to a single seed happening to draw cardinals only.
    let diagonalCount = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const builder = new PathBuilder({
        rng: createRNG(seed),
        start: { x: 0, y: 0 },
      });
      builder.extendTo(2000);
      for (const seg of builder.path.segments) {
        const d = seg.direction;
        if (d.x !== 0 && d.y !== 0) diagonalCount++;
      }
    }
    expect(diagonalCount).toBeGreaterThan(0);
  });

  /**
   * Regression for the "snaking corridor collides with itself / dead
   * end" bug. Previously `_appendNext` would force a straight
   * continuation as a last resort *without* an intersection check, so
   * the path could plough back through an earlier corridor segment,
   * sealing off the player. Now every appended segment is checked.
   *
   * Test: across many seeds, build a long path and verify each
   * segment's interior tile sweep does not reuse tiles already swept
   * by an earlier non-adjacent segment (adjacent segments legally
   * overlap at the shared corner).
   */
  it("never appends a self-intersecting segment", () => {
    const HALF_W = 9; // matches SnakeGenerator's CORRIDOR_HALF_WIDTH
    const sweepTiles = (
      origin: { x: number; y: number },
      dir: { x: number; y: number },
      length: number,
      sStart: number,
    ): Set<string> => {
      const tiles = new Set<string>();
      const px = -dir.y;
      const py = dir.x;
      const step = 0.5;
      for (let s = sStart; s <= length; s += step) {
        const cx = origin.x + dir.x * s;
        const cy = origin.y + dir.y * s;
        for (let n = -HALF_W; n <= HALF_W; n += step) {
          const wx = cx + px * n;
          const wy = cy + py * n;
          tiles.add(`${Math.floor(wx)},${Math.floor(wy)}`);
        }
      }
      return tiles;
    };

    for (let seed = 1; seed <= 25; seed++) {
      const builder = new PathBuilder({
        rng: createRNG(seed),
        start: { x: 1000, y: 0 },
        corridorHalfWidth: HALF_W,
      });
      builder.extendTo(5000);
      const segs = builder.path.segments;

      // Cumulative occupancy of all tiles swept by segments 0..i-2
      // (i.e. excluding the immediately-previous segment, which legally
      // shares the corner cells with segment i).
      const cumulative = new Set<string>();
      let prevTiles = new Set<string>();
      for (let i = 0; i < segs.length; i++) {
        const seg = segs[i]!;
        const len = seg.sEnd - seg.sStart;
        // Skip the corner overlap zone (~2*halfW) at the start of each
        // segment when comparing against `cumulative` — that overlap
        // belongs to the previous segment, not a true self-collision.
        const checkStart = i === 0 ? 0 : HALF_W * 2;
        const checkTiles = sweepTiles(seg.origin, seg.direction, len, checkStart);
        for (const k of checkTiles) {
          expect(cumulative.has(k), `seed ${seed} seg ${i} tile ${k} reused`).toBe(false);
        }
        // Promote the previous-previous tiles into cumulative; current
        // segment's full sweep becomes the new "prev".
        for (const k of prevTiles) cumulative.add(k);
        prevTiles = sweepTiles(seg.origin, seg.direction, len, 0);
      }
    }
  });
});
