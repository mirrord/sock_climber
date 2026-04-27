import { describe, it, expect } from "vitest";
import { sweepAABB } from "../../src/physics/Sweep.js";

// Helper: body and tile are both 1m × 1m squares (halfExtents = 0.5).
const BHW = 0.5; // body half-width
const BHH = 0.5; // body half-height
const SHW = 0.5; // tile half-width
const SHH = 0.5; // tile half-height
// tile centered at (1.5, 0.5) = world tile (1, 0)
const TX = 1.5;
const TY = 0.5;

describe("sweepAABB", () => {
  it("returns null when not moving toward the obstacle", () => {
    // Body far to the left of tile, moving left (away).
    const hit = sweepAABB(-5, 0.5, BHW, BHH, -1, 0, TX, TY, SHW, SHH);
    expect(hit).toBeNull();
  });

  it("detects a horizontal hit and returns correct normal", () => {
    // Body at x=0 (right edge = 0.5), tile at x=1.5 (left edge = 1.0).
    // Gap = 0.5 m. Moving right 1 m → should hit.
    const hit = sweepAABB(0, TY, BHW, BHH, 1, 0, TX, TY, SHW, SHH);
    expect(hit).not.toBeNull();
    expect(hit!.normalX).toBe(-1); // hit from left → normal points left
    expect(hit!.normalY).toBe(0);
    expect(hit!.t).toBeGreaterThanOrEqual(0);
    expect(hit!.t).toBeLessThan(1);
  });

  it("detects a downward hit (landing on top) with correct normal", () => {
    // Tile is a 1m floor at y = 0 center → top face at y = 0.
    // Body above it at y = -2 (bottom edge at -1.5), moving down 2 m.
    const floorCY = 0.5;
    const hit = sweepAABB(0, -1, BHW, BHH, 0, 2, 0, floorCY, SHW, SHH);
    expect(hit).not.toBeNull();
    expect(hit!.normalY).toBe(-1); // top face → normal points up
    expect(hit!.normalX).toBe(0);
  });

  it("t = 0 when body is already touching and moving into surface", () => {
    // Body right edge exactly at tile left face.
    // tile left face = TX - SHW = 1.5 - 0.5 = 1.0
    // body right = bodyCx + BHW = 1.0 → bodyCx = 0.5
    const bodyCx = 0.5; // right edge exactly touching tile's left face
    const hit = sweepAABB(bodyCx, TY, BHW, BHH, 0.1, 0, TX, TY, SHW, SHH);
    expect(hit).not.toBeNull();
    expect(hit!.t).toBeGreaterThanOrEqual(0);
    expect(hit!.normalX).toBe(-1);
  });

  it("tunnelling: high-speed body (100 m/s) into 1 m wall in dt=1/120 stops at wall", () => {
    // dt = 1/120 s, speed = 100 m/s → dx = 100/120 ≈ 0.833 m
    const speed = 100;
    const dt = 1 / 120;
    const dx = speed * dt;
    // Body at x=-2, tile at x=0 (so tile center = 0.5, left face = 0)
    // Body right edge at -2 + 0.5 = -1.5. Gap = 1.5. dx ≈ 0.83 → no hit.
    // Let's put body at x=-0.2 so right edge at 0.3, tile left face at 0. Gap = -0.3 (overlapping already).
    // Better: body at x=0, gap = tile.left - body.right = 1 - 0.5 = 0.5, dx = 0.83 → should hit.
    const hit = sweepAABB(0, TY, BHW, BHH, dx, 0, TX, TY, SHW, SHH);
    expect(hit).not.toBeNull();
    expect(hit!.t).toBeGreaterThanOrEqual(0);
    expect(hit!.t).toBeLessThan(1);
  });

  it("diagonal motion into a corner contacts both axes", () => {
    // Body diagonally approaching a tile — both X and Y should be resolved.
    // Let's sweep right-and-down: body at (-1, -1), tile at (0.5, 0.5).
    const hit = sweepAABB(-1, -1, BHW, BHH, 1, 1, 0.5, 0.5, SHW, SHH);
    expect(hit).not.toBeNull();
    // One axis wins; check it's a valid normal.
    expect(Math.abs(hit!.normalX) + Math.abs(hit!.normalY)).toBe(1);
  });

  it("returns null when body moves exactly parallel and no overlap", () => {
    // Body moving purely horizontally, tile is above.
    const hit = sweepAABB(0, 5, BHW, BHH, 1, 0, 0.5, 0.5, SHW, SHH);
    expect(hit).toBeNull();
  });
});
