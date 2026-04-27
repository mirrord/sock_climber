/**
 * Seeded pseudo-random number generator using the mulberry32 algorithm.
 * Produces a full 32-bit integer period (2^32 values before repeating).
 */
export interface RNG {
  /** Returns the next float in [0, 1). */
  next(): number;
  /** Returns a random integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Returns a random element from the array. */
  pick<T>(arr: readonly T[]): T;
  /** Returns an independent clone continuing from the current state. */
  clone(): RNG;
}

/**
 * Creates a seeded RNG using mulberry32.
 * Same seed always produces the same sequence.
 */
export function createRNG(seed: number): RNG {
  let s = seed >>> 0;

  function next(): number {
    s += 0x6d2b79f5;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    z = (z ^ (z >>> 14)) >>> 0;
    return z / 0x100000000;
  }

  function int(min: number, max: number): number {
    return Math.floor(next() * (max - min + 1)) + min;
  }

  function pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new RangeError("pick: empty array");
    const result = arr[int(0, arr.length - 1)];
    if (result === undefined) throw new RangeError("pick: index out of bounds");
    return result;
  }

  function clone(): RNG {
    // Snapshot current state s and create a new RNG from it.
    return createRNG(s);
  }

  return { next, int, pick, clone };
}
