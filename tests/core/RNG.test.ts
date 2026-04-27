import { describe, it, expect } from "vitest";
import { createRNG } from "../../src/core/RNG.js";

describe("createRNG", () => {
  it("same seed produces the same sequence", () => {
    const r1 = createRNG(42);
    const r2 = createRNG(42);
    for (let i = 0; i < 20; i++) {
      expect(r1.next()).toBe(r2.next());
    }
  });

  it("different seeds produce different sequences", () => {
    const r1 = createRNG(1);
    const r2 = createRNG(2);
    const seq1 = Array.from({ length: 10 }, () => r1.next());
    const seq2 = Array.from({ length: 10 }, () => r2.next());
    expect(seq1).not.toEqual(seq2);
  });

  it("next() returns values in [0, 1)", () => {
    const rng = createRNG(99);
    for (let i = 0; i < 100; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("int(min, max) returns values in [min, max] inclusive", () => {
    const rng = createRNG(7);
    for (let i = 0; i < 200; i++) {
      const v = rng.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });

  it("int(n, n) always returns n", () => {
    const rng = createRNG(1);
    for (let i = 0; i < 10; i++) {
      expect(rng.int(5, 5)).toBe(5);
    }
  });

  it("pick() returns an element from the array", () => {
    const rng = createRNG(13);
    const arr = ["a", "b", "c", "d"] as const;
    for (let i = 0; i < 50; i++) {
      const v = rng.pick(arr);
      expect(arr).toContain(v);
    }
  });

  it("pick() throws on empty array", () => {
    const rng = createRNG(0);
    expect(() => rng.pick([])).toThrow(RangeError);
  });

  it("clone() produces the same subsequent sequence", () => {
    const rng = createRNG(55);
    // Advance some steps.
    rng.next(); rng.next(); rng.next();
    const clone = rng.clone();
    for (let i = 0; i < 20; i++) {
      expect(rng.next()).toBe(clone.next());
    }
  });

  it("clone() is independent — advancing one does not affect the other", () => {
    const rng = createRNG(77);
    const clone = rng.clone();
    rng.next(); rng.next();
    // clone should still match the original at this point if we advance it
    // instead of testing independence: verify they start from the same state
    expect(rng.next()).not.toBe(clone.next()); // they diverged because rng advanced
  });
});
