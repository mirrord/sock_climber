import { describe, it, expect } from "vitest";
import { Path, perpRight, DIRECTIONS_8 } from "../../src/level/Path.js";

describe("Path", () => {
  it("a fresh path has the initial segment and length", () => {
    const p = new Path({ x: 0, y: 0 }, { x: 0, y: -1 }, 50);
    expect(p.segments.length).toBe(1);
    expect(p.totalLength).toBe(50);
    expect(p.tailPosition).toEqual({ x: 0, y: -50 });
  });

  it("appendSegment extends the tail and arc length", () => {
    const p = new Path({ x: 0, y: 0 }, { x: 0, y: -1 }, 50);
    p.appendSegment({ x: 1, y: 0 }, 20);
    expect(p.segments.length).toBe(2);
    expect(p.totalLength).toBe(70);
    expect(p.tailPosition).toEqual({ x: 20, y: -50 });
  });

  it("appendSegment with the same direction merges into the previous", () => {
    const p = new Path({ x: 0, y: 0 }, { x: 0, y: -1 }, 50);
    p.appendSegment({ x: 0, y: -1 }, 10);
    expect(p.segments.length).toBe(1);
    expect(p.totalLength).toBe(60);
  });

  it("projectS returns the centreline world position and tangent", () => {
    const p = new Path({ x: 0, y: 0 }, { x: 0, y: -1 }, 50);
    p.appendSegment({ x: 1, y: 0 }, 20);

    const a = p.projectS(25);
    expect(a.position.x).toBeCloseTo(0);
    expect(a.position.y).toBeCloseTo(-25);
    expect(a.tangent).toEqual({ x: 0, y: -1 });

    const b = p.projectS(60);
    expect(b.position.x).toBeCloseTo(10);
    expect(b.position.y).toBeCloseTo(-50);
    expect(b.tangent).toEqual({ x: 1, y: 0 });
  });

  it("projectS with lateral offset uses perpRight", () => {
    const p = new Path({ x: 0, y: 0 }, { x: 1, y: 0 }, 100);
    // Direction E (+x); perpRight(E) = (0, +1). n = +3 → world y = +3.
    const r = p.projectS(40, 3);
    expect(r.position.x).toBeCloseTo(40);
    expect(r.position.y).toBeCloseTo(3);
  });

  it("estimateS round-trips for centreline points within a segment", () => {
    const p = new Path({ x: 0, y: 0 }, { x: 0, y: -1 }, 50);
    p.appendSegment({ x: 1, y: 0 }, 20);
    expect(p.estimateS({ x: 0, y: -10 })).toBeCloseTo(10);
    // estimateS is anchored to the player's current segment; ask once
    // past the corner so the anchor advances onto segment 1, then
    // re-query.
    p.estimateS({ x: 6, y: -60 });
    expect(p.estimateS({ x: 5, y: -50 })).toBeCloseTo(55);
  });

  it("estimateS clamps to the anchored segment's range", () => {
    const p = new Path({ x: 0, y: 0 }, { x: 0, y: -1 }, 10);
    p.appendSegment({ x: 1, y: 0 }, 10);
    // Position above the start should clamp to s=0 (still inside seg 0).
    expect(p.estimateS({ x: 0, y: 5 })).toBeCloseTo(0);
  });

  it("DIRECTIONS_8 contains 8 unit-length vectors at 45°", () => {
    expect(DIRECTIONS_8.length).toBe(8);
    for (const d of DIRECTIONS_8) {
      const len = Math.hypot(d.x, d.y);
      expect(len).toBeCloseTo(1);
    }
  });

  it("perpRight is rotated 90° from input", () => {
    const a = perpRight({ x: 1, y: 0 });
    expect(a.x).toBeCloseTo(0);
    expect(a.y).toBeCloseTo(1);
    const b = perpRight({ x: 0, y: -1 });
    expect(b.x).toBeCloseTo(1);
    expect(b.y).toBeCloseTo(0);
  });
});
