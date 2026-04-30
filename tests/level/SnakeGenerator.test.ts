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
});
