import { describe, it, expect } from "vitest";
import {
  deriveJumpArcBounds,
  isReachable,
  hasReachablePredecessor,
  type PlatformCandidate,
} from "../../src/level/Reachability.js";
import { DEFAULT_PLAYER_STATS } from "../../src/entities/components/Stats.js";

const bounds = deriveJumpArcBounds(DEFAULT_PLAYER_STATS);

describe("deriveJumpArcBounds", () => {
  it("produces positive maxDx, maxDyUp, maxDyDown", () => {
    expect(bounds.maxDx).toBeGreaterThan(0);
    expect(bounds.maxDyUp).toBeGreaterThan(0);
    expect(bounds.maxDyDown).toBeGreaterThan(0);
  });

  it("maxDyUp is consistent with vy²/2g (within 2x ceiling margin)", () => {
    const vy = Math.abs(DEFAULT_PLAYER_STATS.jumpVelocity);
    const g = DEFAULT_PLAYER_STATS.gravity;
    const rawH = (vy * vy) / (2 * g);
    // deriveJumpArcBounds adds 1.5x margin and ceil
    expect(bounds.maxDyUp).toBeGreaterThanOrEqual(Math.ceil(rawH));
    expect(bounds.maxDyUp).toBeLessThanOrEqual(Math.ceil(rawH * 2));
  });

  it("air-jump bonus increases maxDyUp when maxAirJumps > 0", () => {
    const boundsAir = deriveJumpArcBounds({
      ...DEFAULT_PLAYER_STATS,
      maxAirJumps: 1,
    });
    expect(boundsAir.maxDx).toBeGreaterThanOrEqual(bounds.maxDx);
  });

  it("air-dash bonus increases maxDx when maxAirDashes > 0", () => {
    const boundsAir = deriveJumpArcBounds({
      ...DEFAULT_PLAYER_STATS,
      maxAirDashes: 1,
    });
    expect(boundsAir.maxDx).toBeGreaterThan(bounds.maxDx);
  });
});

describe("isReachable", () => {
  it("adjacent platforms at same height are reachable", () => {
    const src: PlatformCandidate = { tx: 0, ty: 10, width: 3 };
    const tgt: PlatformCandidate = { tx: 4, ty: 10, width: 3 };
    expect(isReachable(src, tgt, bounds)).toBe(true);
  });

  it("overlapping platforms are always reachable horizontally", () => {
    const src: PlatformCandidate = { tx: 0, ty: 10, width: 4 };
    const tgt: PlatformCandidate = { tx: 2, ty: 10, width: 4 };
    expect(isReachable(src, tgt, bounds)).toBe(true);
  });

  it("platform just within maxDyUp is reachable upward", () => {
    const src: PlatformCandidate = { tx: 5, ty: 20, width: 2 };
    const tgt: PlatformCandidate = { tx: 5, ty: 20 - bounds.maxDyUp, width: 2 };
    expect(isReachable(src, tgt, bounds)).toBe(true);
  });

  it("platform just beyond maxDyUp is not reachable upward", () => {
    const src: PlatformCandidate = { tx: 5, ty: 20, width: 2 };
    const tgt: PlatformCandidate = {
      tx: 5,
      ty: 20 - (bounds.maxDyUp + 2),
      width: 2,
    };
    expect(isReachable(src, tgt, bounds)).toBe(false);
  });

  it("platform too far horizontally is not reachable", () => {
    const src: PlatformCandidate = { tx: 0, ty: 10, width: 1 };
    const tgt: PlatformCandidate = {
      tx: bounds.maxDx + 5,
      ty: 10,
      width: 1,
    };
    expect(isReachable(src, tgt, bounds)).toBe(false);
  });

  it("downward drop within maxDyDown is reachable", () => {
    const src: PlatformCandidate = { tx: 5, ty: 10, width: 2 };
    const tgt: PlatformCandidate = {
      tx: 5,
      ty: 10 + bounds.maxDyDown,
      width: 2,
    };
    expect(isReachable(src, tgt, bounds)).toBe(true);
  });

  it("downward drop beyond maxDyDown is not reachable", () => {
    const src: PlatformCandidate = { tx: 5, ty: 10, width: 2 };
    const tgt: PlatformCandidate = {
      tx: 5,
      ty: 10 + bounds.maxDyDown + 5,
      width: 2,
    };
    expect(isReachable(src, tgt, bounds)).toBe(false);
  });
});

describe("hasReachablePredecessor", () => {
  it("returns true if at least one existing platform is in range", () => {
    const existing: PlatformCandidate[] = [
      { tx: 0, ty: 20, width: 3 },
      { tx: 50, ty: 20, width: 3 }, // too far
    ];
    const candidate: PlatformCandidate = { tx: 3, ty: 20, width: 2 };
    expect(hasReachablePredecessor(candidate, existing, bounds)).toBe(true);
  });

  it("returns false if no existing platform is in range", () => {
    const existing: PlatformCandidate[] = [
      { tx: 200, ty: 20, width: 3 },
      { tx: 250, ty: 20, width: 3 },
    ];
    const candidate: PlatformCandidate = { tx: 0, ty: 20, width: 2 };
    expect(hasReachablePredecessor(candidate, existing, bounds)).toBe(false);
  });

  it("returns false for empty existing list", () => {
    const candidate: PlatformCandidate = { tx: 5, ty: 10, width: 2 };
    expect(hasReachablePredecessor(candidate, [], bounds)).toBe(false);
  });
});
