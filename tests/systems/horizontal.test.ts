import { describe, it, expect } from "vitest";
import { DeathPlaneSystem } from "../../src/systems/DeathPlaneSystem.js";
import { ScoreSystem } from "../../src/systems/ScoreSystem.js";
import { createEventBus } from "../../src/core/EventBus.js";
import type { GameEvents } from "../../src/core/EventBus.js";
import type { Body } from "../../src/physics/Body.js";
import { createBody } from "../../src/physics/Body.js";
import { CLIMB_DIR_HORIZONTAL } from "../../src/level/Axis.js";

const DT = 1 / 60;
function makeBodyXY(x: number, y = 0, halfW = 0.4): Body {
  return createBody({ position: { x, y }, halfExtents: { x: halfW, y: 0.5 } });
}

describe("DeathPlaneSystem — horizontal climb (level 2)", () => {
  it("plane advances rightward (planePos increases)", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new DeathPlaneSystem(bus, {
      climbDir: CLIMB_DIR_HORIZONTAL,
      start: 3,
      baseSpeed: 2,
    });
    sys.update(DT, makeBodyXY(50));
    expect(sys.planePos).toBeCloseTo(3 + 2 * DT);
  });

  it("emits onPlayerDeath when plane reaches the player's left edge", () => {
    const bus = createEventBus<GameEvents>();
    const deaths: string[] = [];
    bus.on("onPlayerDeath", ({ reason }) => deaths.push(reason));
    // Player at x=10 with halfW=0.4 → left edge at 9.6. Plane at 9.6 kills.
    const sys = new DeathPlaneSystem(bus, {
      climbDir: CLIMB_DIR_HORIZONTAL,
      start: 9.6,
      baseSpeed: 0,
    });
    sys.update(DT, makeBodyXY(10));
    expect(deaths).toEqual(["drowned"]);
  });

  it("no death when the player is far ahead of the wall", () => {
    const bus = createEventBus<GameEvents>();
    let deathCount = 0;
    bus.on("onPlayerDeath", () => deathCount++);
    const sys = new DeathPlaneSystem(bus, {
      climbDir: CLIMB_DIR_HORIZONTAL,
      start: 0,
      baseSpeed: 0,
    });
    sys.update(DT, makeBodyXY(100));
    expect(deathCount).toBe(0);
  });
});

describe("ScoreSystem — horizontal climb (level 2)", () => {
  it("distance grows with positive X displacement", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new ScoreSystem(bus, CLIMB_DIR_HORIZONTAL);
    sys.update({ x: 42, y: 0 });
    expect(sys.getSummary().distanceTraversed).toBeCloseTo(42);
  });

  it("negative X (behind spawn) does not increase distance", () => {
    const bus = createEventBus<GameEvents>();
    const sys = new ScoreSystem(bus, CLIMB_DIR_HORIZONTAL);
    sys.update({ x: -5, y: 0 });
    expect(sys.getSummary().distanceTraversed).toBeCloseTo(0);
  });
});
