import { describe, it, expect } from "vitest";
import { poissonSample } from "../../src/level/Sampler.js";
import { createRNG } from "../../src/core/RNG.js";

describe("poissonSample", () => {
  it("returns an array of samples within the given bounds", () => {
    const rng = createRNG(42);
    const samples = poissonSample(rng, {
      width: 10,
      height: 10,
      minDist: 2,
      density: 0.8,
    });
    for (const s of samples) {
      expect(s.tx).toBeGreaterThanOrEqual(0);
      expect(s.tx).toBeLessThan(10);
      expect(s.ty).toBeGreaterThanOrEqual(0);
      expect(s.ty).toBeLessThan(10);
    }
  });

  it("all samples are separated by at least minDist (Euclidean)", () => {
    const rng = createRNG(99);
    const minDist = 3;
    const samples = poissonSample(rng, {
      width: 16,
      height: 16,
      minDist,
      density: 1.0,
    });
    for (let i = 0; i < samples.length; i++) {
      for (let j = i + 1; j < samples.length; j++) {
        const a = samples[i]!;
        const b = samples[j]!;
        const dx = a.tx - b.tx;
        const dy = a.ty - b.ty;
        const dist = Math.sqrt(dx * dx + dy * dy);
        expect(dist).toBeGreaterThanOrEqual(minDist - 0.01); // float tolerance
      }
    }
  });

  it("returns empty array when density is 0", () => {
    const rng = createRNG(1);
    const samples = poissonSample(rng, {
      width: 10,
      height: 10,
      minDist: 2,
      density: 0,
    });
    // With density=0, the initial seed is also rejected.
    expect(samples.length).toBe(0);
  });

  it("produces the same result for the same RNG state (determinism)", () => {
    const a = poissonSample(createRNG(7), {
      width: 12,
      height: 12,
      minDist: 2,
      density: 0.7,
    });
    const b = poissonSample(createRNG(7), {
      width: 12,
      height: 12,
      minDist: 2,
      density: 0.7,
    });
    expect(a).toEqual(b);
  });

  it("different seeds produce different results", () => {
    const a = poissonSample(createRNG(1), {
      width: 12,
      height: 12,
      minDist: 2,
      density: 0.8,
    });
    const b = poissonSample(createRNG(9999), {
      width: 12,
      height: 12,
      minDist: 2,
      density: 0.8,
    });
    // Very unlikely to be identical with different seeds.
    expect(a).not.toEqual(b);
  });

  it("respects area boundaries (width=1, height=1)", () => {
    const rng = createRNG(123);
    const samples = poissonSample(rng, {
      width: 1,
      height: 1,
      minDist: 1,
      density: 1.0,
    });
    expect(samples.length).toBeLessThanOrEqual(1);
    if (samples.length === 1) {
      expect(samples[0]!.tx).toBe(0);
      expect(samples[0]!.ty).toBe(0);
    }
  });
});
