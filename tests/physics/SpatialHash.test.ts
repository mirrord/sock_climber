import { describe, it, expect } from "vitest";
import { querySolidTiles } from "../../src/physics/SpatialHash.js";
import { TileWorld } from "../../src/physics/TileWorld.js";

describe("querySolidTiles", () => {
  function makeWorld(): TileWorld {
    const w = new TileWorld(10, 10);
    // Solid floor row at y=9.
    w.fillRect(0, 9, 10, 1, true);
    // Single solid tile at (3, 5).
    w.setTile(3, 5, true);
    return w;
  }

  it("returns solid tiles overlapping the query AABB", () => {
    const world = makeWorld();
    const out: Array<{ tx: number; ty: number }> = [];
    // Query centered at (3.5, 5.5) with halfExtents (0.4, 0.4) — should hit tile (3,5).
    querySolidTiles(world, 3.5, 5.5, 0.4, 0.4, out);
    expect(out.some((t) => t.tx === 3 && t.ty === 5)).toBe(true);
  });

  it("returns nothing when no solid tiles overlap", () => {
    const world = makeWorld();
    const out: Array<{ tx: number; ty: number }> = [];
    // Center of an empty region.
    querySolidTiles(world, 5.5, 5.5, 0.4, 0.4, out);
    expect(out).toHaveLength(0);
  });

  it("clears the output array between calls", () => {
    const world = makeWorld();
    const out: Array<{ tx: number; ty: number }> = [{ tx: 99, ty: 99 }];
    querySolidTiles(world, 5.5, 5.5, 0.4, 0.4, out);
    expect(out.every((t) => !(t.tx === 99 && t.ty === 99))).toBe(true);
  });

  it("out-of-bounds queries do not throw", () => {
    const world = makeWorld();
    const out: Array<{ tx: number; ty: number }> = [];
    expect(() => querySolidTiles(world, -100, -100, 0.5, 0.5, out)).not.toThrow();
  });
});
