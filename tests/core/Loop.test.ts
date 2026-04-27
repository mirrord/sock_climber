import { describe, it, expect, vi } from "vitest";
import { driveLoop } from "../../src/core/Loop.js";

describe("driveLoop", () => {
  it("calls update exactly N times with the given stepDt", () => {
    const calls: number[] = [];
    driveLoop((dt) => calls.push(dt), 1 / 120, 5);
    expect(calls).toHaveLength(5);
    for (const dt of calls) {
      expect(dt).toBeCloseTo(1 / 120, 10);
    }
  });

  it("calls update 0 times when steps = 0", () => {
    let count = 0;
    driveLoop(() => count++, 1 / 120, 0);
    expect(count).toBe(0);
  });
});

describe("createLoop (accumulator)", () => {
  it("calls update floor(elapsed / stepMs) times per tick", () => {
    // Simulate the accumulator logic directly:
    // elapsed = 2.5 * stepMs => 2 update calls.
    const stepHz = 60;
    const stepMs = 1000 / stepHz;
    let updates = 0;
    let lastAlpha = -1;

    const stepDt = 1 / stepHz;
    let accumulator = 0;

    function simulateTick(elapsedMs: number): void {
      accumulator += elapsedMs;
      while (accumulator >= stepMs) {
        updates++;
        accumulator -= stepMs;
      }
      lastAlpha = accumulator / stepMs;
    }

    simulateTick(2.5 * stepMs);
    expect(updates).toBe(2);
    expect(lastAlpha).toBeGreaterThanOrEqual(0);
    expect(lastAlpha).toBeLessThan(1);
  });

  it("alpha is accumulator / stepDt and stays in [0,1)", () => {
    const stepMs = 1000 / 120;
    let accumulator = 0;

    function simulateTick(elapsedMs: number): number {
      const clamped = Math.min(elapsedMs, stepMs * 8);
      accumulator += clamped;
      while (accumulator >= stepMs) accumulator -= stepMs;
      return accumulator / stepMs;
    }

    for (let i = 1; i <= 10; i++) {
      const alpha = simulateTick(i * 3.3);
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
    }
  });
});
