import { describe, it, expect } from "vitest";
import { ScoreSystem } from "../../src/systems/ScoreSystem.js";
import { createEventBus } from "../../src/core/EventBus.js";
import type { GameEvents } from "../../src/core/EventBus.js";

// ─── Distance tracking ────────────────────────────────────────────────────

describe("ScoreSystem — distance tracking", () => {
  it("distance starts at 0", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new ScoreSystem(bus);
    expect(sys.getSummary().distanceTraversed).toBe(0);
  });

  it("distance increases as player moves upward (negative Y)", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new ScoreSystem(bus);
    sys.update(-10); // player at y=-10 → 10 m climbed
    expect(sys.getSummary().distanceTraversed).toBeCloseTo(10);
  });

  it("distance is monotonic — backward movement does not reduce it", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new ScoreSystem(bus);
    sys.update(-20);
    sys.update(-5); // player fell back
    expect(sys.getSummary().distanceTraversed).toBeCloseTo(20);
  });

  it("distance tracks the maximum upward position seen", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new ScoreSystem(bus);
    sys.update(-5);
    sys.update(-30);
    sys.update(-15);
    expect(sys.getSummary().distanceTraversed).toBeCloseTo(30);
  });

  it("positive Y (below spawn) does not increase distance", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new ScoreSystem(bus);
    sys.update(5); // falling below spawn
    expect(sys.getSummary().distanceTraversed).toBeCloseTo(0);
  });
});

// ─── Kill count ───────────────────────────────────────────────────────────

describe("ScoreSystem — kill count", () => {
  it("kill count starts at 0", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new ScoreSystem(bus);
    expect(sys.getSummary().enemiesKilled).toBe(0);
  });

  it("increments once per onKill event", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new ScoreSystem(bus);
    bus.emit("onKill", { entityId: 1 });
    expect(sys.getSummary().enemiesKilled).toBe(1);
  });

  it("increments for each unique kill", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new ScoreSystem(bus);
    bus.emit("onKill", { entityId: 1 });
    bus.emit("onKill", { entityId: 2 });
    bus.emit("onKill", { entityId: 3 });
    expect(sys.getSummary().enemiesKilled).toBe(3);
  });
});

// ─── getSummary ───────────────────────────────────────────────────────────

describe("ScoreSystem — getSummary", () => {
  it("summary contains all three required fields", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new ScoreSystem(bus);
    const summary = sys.getSummary();
    expect(summary).toHaveProperty("distanceTraversed");
    expect(summary).toHaveProperty("enemiesKilled");
    expect(summary).toHaveProperty("deathReason");
  });

  it("deathReason is empty string before death", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new ScoreSystem(bus);
    expect(sys.getSummary().deathReason).toBe("");
  });

  it("deathReason matches the reason from onPlayerDeath", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new ScoreSystem(bus);
    bus.emit("onPlayerDeath", { reason: "drowned" });
    expect(sys.getSummary().deathReason).toBe("drowned");
  });

  it("summary contains correct combined values", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new ScoreSystem(bus);
    sys.update(-42);
    bus.emit("onKill", { entityId: 1 });
    bus.emit("onKill", { entityId: 2 });
    bus.emit("onPlayerDeath", { reason: "drowned" });

    const summary = sys.getSummary();
    expect(summary.distanceTraversed).toBeCloseTo(42);
    expect(summary.enemiesKilled).toBe(2);
    expect(summary.deathReason).toBe("drowned");
  });
});
