import { describe, it, expect } from "vitest";
import { Vec2, Vec2Pool } from "../../src/core/Vec2.js";

describe("Vec2", () => {
  it("initialises to (0,0) by default", () => {
    const v = new Vec2();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
  });

  it("set() updates both components and returns this", () => {
    const v = new Vec2();
    const ret = v.set(3, 4);
    expect(ret).toBe(v);
    expect(v.x).toBe(3);
    expect(v.y).toBe(4);
  });

  it("add() accumulates correctly", () => {
    const a = new Vec2(1, 2);
    const b = new Vec2(3, 4);
    a.add(b);
    expect(a.x).toBe(4);
    expect(a.y).toBe(6);
  });

  it("sub() subtracts correctly", () => {
    const a = new Vec2(5, 7);
    const b = new Vec2(2, 3);
    a.sub(b);
    expect(a.x).toBe(3);
    expect(a.y).toBe(4);
  });

  it("scale() multiplies both components", () => {
    const v = new Vec2(2, -3).scale(2);
    expect(v.x).toBe(4);
    expect(v.y).toBe(-6);
  });

  it("addScaled() adds a scaled vector", () => {
    const v = new Vec2(1, 0);
    const dir = new Vec2(0, 1);
    v.addScaled(dir, 5);
    expect(v.x).toBe(1);
    expect(v.y).toBe(5);
  });

  it("length() is correct", () => {
    const v = new Vec2(3, 4);
    expect(v.length()).toBeCloseTo(5);
  });

  it("dot() is correct", () => {
    const a = new Vec2(1, 0);
    const b = new Vec2(0, 1);
    expect(a.dot(b)).toBe(0);
    expect(a.dot(a)).toBe(1);
  });

  it("zero() resets to (0,0)", () => {
    const v = new Vec2(5, 10).zero();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
  });

  it("clone() creates an independent copy", () => {
    const v = new Vec2(1, 2);
    const c = v.clone();
    v.x = 99;
    expect(c.x).toBe(1);
  });
});

describe("Vec2Pool", () => {
  it("acquire() returns a zeroed Vec2", () => {
    const pool = new Vec2Pool(4);
    const v = pool.acquire();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
  });

  it("release/acquire cycle does not grow totalAllocated beyond initial", () => {
    const pool = new Vec2Pool(8);
    const before = pool.totalAllocated;
    const vecs = Array.from({ length: 8 }, () => pool.acquire());
    vecs.forEach((v) => pool.release(v));
    // Acquire again — should reuse.
    Array.from({ length: 8 }, () => pool.acquire());
    expect(pool.totalAllocated).toBe(before);
  });

  it("grows when pool is exhausted", () => {
    const pool = new Vec2Pool(2);
    const before = pool.totalAllocated;
    // Drain the pool without releasing.
    pool.acquire();
    pool.acquire();
    pool.acquire(); // This one should allocate.
    expect(pool.totalAllocated).toBe(before + 1);
  });

  it("freeCount decreases on acquire and increases on release", () => {
    const pool = new Vec2Pool(4);
    const before = pool.freeCount;
    const v = pool.acquire();
    expect(pool.freeCount).toBe(before - 1);
    pool.release(v);
    expect(pool.freeCount).toBe(before);
  });
});
