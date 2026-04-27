import { describe, it, expect } from "vitest";
import { createMockClock } from "../../src/core/Clock.js";

describe("createMockClock", () => {
  it("starts at the provided offset", () => {
    const clock = createMockClock(500);
    expect(clock.now()).toBe(500);
  });

  it("advances time when advance() is called", () => {
    const clock = createMockClock(0);
    clock.advance(100);
    expect(clock.now()).toBe(100);
    clock.advance(50);
    expect(clock.now()).toBe(150);
  });

  it("does not advance automatically", () => {
    const clock = createMockClock(0);
    expect(clock.now()).toBe(0);
    expect(clock.now()).toBe(0);
  });
});
