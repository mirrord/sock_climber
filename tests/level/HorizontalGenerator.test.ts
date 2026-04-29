import { describe, it, expect } from "vitest";
import { createGenerator } from "../../src/level/Generator.js";
import { CLIMB_DIR_HORIZONTAL } from "../../src/level/Axis.js";

describe("HorizontalGenerator", () => {
  function make() {
    return createGenerator({
      seed: 12345,
      climbDir: CLIMB_DIR_HORIZONTAL,
      cameraY: 0,
      worldYMin: -9,
      worldWidth: 4000,
    });
  }

  it("advance() generates chunks ahead of the camera", () => {
    const gen = make();
    const result = gen.advance(50, -100);
    expect(result.newTiles.length).toBeGreaterThan(0);
    expect(gen.chunks.length).toBeGreaterThan(0);
  });

  it("only emits tiles inside the corridor (between ceiling and floor)", () => {
    const gen = make();
    const result = gen.advance(120, -100);
    for (const t of result.newTiles) {
      // Floor is at y=2 (seeded by main); ceiling at y=worldYMin=-9.
      // Generator may emit pillars / platforms anywhere in the open
      // interior (-8..1).
      expect(t.ty).toBeGreaterThan(-9);
      expect(t.ty).toBeLessThan(2);
    }
  });

  it("chunks live in increasing X order", () => {
    const gen = make();
    gen.advance(150, -100);
    const xs = gen.chunks.map((c) => c.originX);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]!).toBeGreaterThan(xs[i - 1]!);
    }
  });

  it("despawns chunks the death wall has passed", () => {
    const gen = make();
    gen.advance(80, -100);
    const before = gen.chunks.length;
    expect(before).toBeGreaterThan(0);
    // Force the wall far to the right of every chunk.
    const result = gen.advance(80, 100000);
    expect(result.despawnedEntityIds).toBeDefined();
    expect(gen.chunks.length).toBeLessThan(before);
  });

  it("repeatable for a fixed seed", () => {
    const a = make();
    const b = make();
    const ra = a.advance(80, -100);
    const rb = b.advance(80, -100);
    expect(ra.newTiles.length).toBe(rb.newTiles.length);
  });
});
